// The brokered demo data (demo-brokered.js) is created through the real API, so a change to the request flow
// that breaks it shows here. Starts the server in demo mode on a temporary data folder.
const { describe, it } = require("node:test");
const assert = require("node:assert/strict");
const { spawn } = require("node:child_process");
const { mkdtempSync, rmSync, readFileSync } = require("node:fs");
const os = require("node:os");
const path = require("node:path");
const net = require("node:net");

const ROOT = path.join(__dirname, "..");
const freePort = () =>
  new Promise((resolve) => {
    const s = net.createServer().listen(0, () => {
      const { port } = s.address();
      s.close(() => resolve(port));
    });
  });
// Starts demo mode and resolves once the brokered demo data is written (or the server failed)
async function demo(dataDir) {
  const port = await freePort(),
    env = { ...process.env, DATA_DIR: dataDir, PORT: String(port) };
  for (const k of ["NODE_ENV", "STORE", "DATABASE_URL", "DOMAIN", "APP_URL", "PLATFORM_MODE"]) delete env[k];
  const proc = spawn(process.execPath, [path.join(ROOT, "server.js")], {
    cwd: ROOT,
    env,
    stdio: ["ignore", "pipe", "pipe"],
  });
  let out = "";
  await new Promise((resolve, reject) => {
    const timer = setTimeout(() => reject(new Error("demo data not created in time:\n" + out)), 30000);
    const check = (d) => {
      out += d;
      if (/brokered requests seeded/.test(out)) (clearTimeout(timer), resolve());
      else if (/could not be created|Error/.test(out)) (clearTimeout(timer), reject(new Error(out)));
    };
    proc.stdout.on("data", check);
    proc.stderr.on("data", check);
  });
  return { proc, port, out: () => out };
}
const stop = (proc) => new Promise((r) => (proc.once("exit", r), proc.kill()));

describe("brokered demo data", () => {
  it("creates requests at every stage once, and not again after a restart", async () => {
    const dataDir = mkdtempSync(path.join(os.tmpdir(), "craftcrew-demo-"));
    try {
      let app = await demo(dataDir);
      await stop(app.proc);
      const db = JSON.parse(readFileSync(path.join(dataDir, "db.json"), "utf8"));
      assert.deepEqual(db.requests.map((r) => r.status).sort(), [
        "Chosen",
        "Closed",
        "Contracted",
        "New",
        "Options ready",
        "Sourcing",
        "Sourcing",
        "Withdrawn",
      ]);
      assert.equal(db.introductions.length, 1);
      assert.ok(db.contracts.some((c) => c.brokered && c.status === "Active"));
      for (const email of [
        "operator.demo@craftcrew.local",
        "customer2.demo@craftcrew.local",
        "supplier4.demo@craftcrew.local",
      ])
        assert.ok(
          db.users.some((u) => u.email === email),
          email,
        );
      // A restart keeps the data and adds nothing
      const port = await freePort(),
        env = { ...process.env, DATA_DIR: dataDir, PORT: String(port) };
      for (const k of ["NODE_ENV", "STORE", "DATABASE_URL", "PLATFORM_MODE"]) delete env[k];
      const proc = spawn(process.execPath, [path.join(ROOT, "server.js")], {
        cwd: ROOT,
        env,
        stdio: "ignore",
      });
      await new Promise((r) => setTimeout(r, 3000));
      await stop(proc);
      const again = JSON.parse(readFileSync(path.join(dataDir, "db.json"), "utf8"));
      assert.equal(again.requests.length, 8);
      assert.equal(again.users.length, db.users.length);
    } finally {
      rmSync(dataDir, { recursive: true, force: true });
    }
  });
});
