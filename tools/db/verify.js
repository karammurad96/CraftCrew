#!/usr/bin/env node
/*
 * Checks a restored backup (T167): reads the data, prints the records and checksum per collection, compares
 * them with --expect when given, then starts the app on it and checks /api/health.
 *
 *   DATABASE_URL=postgres://…/craftcrew_restore node tools/db/verify.js --data-dir <dir> [--expect sums.json]
 *   node tools/db/verify.js --data-dir <dir> --json [--expect sums.json]       a STORE=json backup
 *   node tools/db/verify.js --save <sums.json>                                 write the checksums of DATABASE_URL
 *
 * Run it only against a scratch copy: the app it starts runs its start-up repairs and background jobs on the
 * data. It gets no SMTP settings, so it never sends email.
 * NODE_ENV=development checks demo data; production data needs the default (production).
 */
const fs = require("fs");
const os = require("os");
const path = require("path");
const net = require("net");
const { spawn } = require("child_process");
const { checksums, compare } = require("../../db/checksums");

const ROOT = path.join(__dirname, "..", "..");
const arg = (name) => {
  const i = process.argv.indexOf(name);
  return i > 0 ? process.argv[i + 1] : undefined;
};

async function readData(dataDir, json) {
  if (json) {
    const store = require("../../store").openStore({ kind: "json", dataDir });
    const data = store.loadSync();
    const inbox = await store.stripeInbox.export();
    if (inbox.length || data?.meta?.stripe?.inboxMigrated) data.stripeWebhookInbox = inbox;
    return data;
  }
  const { createPool } = require("../../db/pg"),
    { readAll, assemble } = require("../../store-postgres"),
    pool = createPool(),
    client = await pool.connect();
  try {
    const data = assemble(await readAll(client)).data;
    const inbox = await require("../../stripe-inbox").exportPostgresInbox(client, data);
    if (data && (inbox.length || data.meta?.stripe?.inboxMigrated)) data.stripeWebhookInbox = inbox;
    return data;
  } finally {
    client.release();
    await pool.end();
  }
}

function freePort() {
  return new Promise((resolve, reject) => {
    const probe = net.createServer().once("error", reject);
    probe.listen(0, () => {
      const { port } = probe.address();
      probe.close(() => resolve(port));
    });
  });
}

// Starts the app on the data and waits for /api/health; stops it again.
async function startsOnIt(dataDir, json) {
  const port = await freePort(),
    env = {
      PATH: process.env.PATH,
      NODE_ENV: process.env.NODE_ENV || "production",
      PORT: String(port),
      APP_URL: `http://localhost:${port}`,
      DATA_DIR: dataDir,
      ...(json ? {} : { STORE: "postgres", DATABASE_URL: process.env.DATABASE_URL }),
      ...(process.env.PGSSLMODE ? { PGSSLMODE: process.env.PGSSLMODE } : {}),
    },
    proc = spawn(process.execPath, [path.join(ROOT, "server.js")], {
      cwd: ROOT,
      env,
      stdio: ["ignore", "ignore", "pipe"],
    });
  let stderr = "",
    exited = false;
  proc.stderr.on("data", (d) => (stderr += d));
  proc.once("exit", () => (exited = true));
  try {
    for (let i = 0; i < 300 && !exited; i++) {
      try {
        const r = await fetch(`http://localhost:${port}/api/health`);
        if (r.ok) return true;
      } catch {}
      await new Promise((r) => setTimeout(r, 100));
    }
    throw new Error(
      "The app did not start on the restored data:\n" + stderr.trim().split("\n").slice(-3).join("\n"),
    );
  } finally {
    if (!exited) {
      proc.kill();
      await new Promise((r) => proc.once("exit", r));
    }
  }
}

async function main() {
  const json = process.argv.includes("--json"),
    save = arg("--save");
  if (save) {
    fs.writeFileSync(save, JSON.stringify(checksums(await readData(null, false)), null, 1));
    console.log(`verify: checksums written to ${save}`);
    return;
  }
  const dataDir = arg("--data-dir") || fs.mkdtempSync(path.join(os.tmpdir(), "craftcrew-verify-")),
    data = await readData(dataDir, json);
  if (!data) throw new Error("The restored data is empty.");
  if ((process.env.NODE_ENV || "production") === "production" && !data.meta?.productionInitialized)
    throw new Error("This is not production data. Check demo data with NODE_ENV=development.");
  const actual = checksums(data),
    expect = arg("--expect"),
    { lines, different } = compare(expect ? JSON.parse(fs.readFileSync(expect, "utf8")) : actual, actual);
  console.log(lines.join("\n"));
  if (different.length)
    throw new Error(`The restored data differs from the expected checksums in: ${different.join(", ")}.`);
  await startsOnIt(dataDir, json);
  const records = Object.values(data).reduce((n, v) => n + (Array.isArray(v) ? v.length : 0), 0);
  console.log(
    `verify: ${records} records${expect ? ", checksums match" : ""}, and the app starts on them (/api/health ok).`,
  );
}

main().catch((e) => {
  // Only the message: never the connection address.
  console.error("verify: " + e.message);
  process.exit(1);
});
