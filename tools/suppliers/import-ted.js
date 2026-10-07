#!/usr/bin/env node
/*
 * T191: import Listed suppliers from EU public procurement award notices (TED).
 *
 *   node tools/suppliers/import-ted.js --country DEU --since 2023-01-01 [--cpv 50000000,45300000] [--dry-run] [--out file.csv]
 *
 * --dry-run  reads TED, cleans the result (no persons, no duplicates) and writes a CSV for a first look; nothing is
 *            sent to CraftCrew. Without --out the CSV goes to the standard output.
 * Real run   sends the cleaned companies to an import batch that an admin reviews under /admin/supplier-imports
 *            ("Publish" or "Discard"). It needs CRAFTCREW_URL (for example https://craftcrew.example) and
 *            CRAFTCREW_ADMIN_TOKEN (an admin session token); without them it stops. Nothing runs by itself.
 * Other settings: TED_API_URL (default the official search API), --max-pages, --delay-ms (pause between calls).
 */
const fs = require("node:fs");
const path = require("node:path");
const ted = require("./ted");
const supplierBase = require("../../supplierbase");

function parseArgs(argv) {
  const o = { cpv: ted.DEFAULT_CPV, dryRun: false, maxPages: 100, delayMs: 1000 };
  for (let i = 0; i < argv.length; i++) {
    const a = argv[i],
      next = () => argv[++i];
    if (a === "--country") o.country = next();
    else if (a === "--since") o.since = next();
    else if (a === "--cpv") o.cpv = String(next()).split(",").map((x) => x.trim()).filter(Boolean);
    else if (a === "--dry-run") o.dryRun = true;
    else if (a === "--out") o.out = next();
    else if (a === "--max-pages") o.maxPages = Number(next()) || 100;
    else if (a === "--delay-ms") o.delayMs = Number(next()) || 0;
    else throw new Error("Unknown option " + a);
  }
  return o;
}

async function main(argv, env = process.env, io = { fetch: (...a) => fetch(...a), log: (m) => console.error(m), write: (p, s) => fs.writeFileSync(p, s), out: (s) => process.stdout.write(s) }) {
  const o = parseArgs(argv),
    query = ted.buildQuery(o);
  io.log("TED query: " + query);
  const found = await ted.search({ fetch: io.fetch, url: env.TED_API_URL || ted.DEFAULT_URL, query, maxPages: o.maxPages, delayMs: o.delayMs });
  io.log(`${found.length} winners read`);
  const { items, skipped } = supplierBase.cleanCandidates(found);
  io.log(`${items.length} companies after clean-up; skipped ${JSON.stringify(skipped)}`);
  if (o.dryRun) {
    const csv = ted.toCsv(items);
    if (o.out) io.write(path.resolve(o.out), csv);
    else io.out(csv);
    return { items, skipped, sent: 0 };
  }
  const base = String(env.CRAFTCREW_URL || "").replace(/\/$/, ""),
    token = env.CRAFTCREW_ADMIN_TOKEN;
  if (!base || !token) throw new Error("Not configured: set CRAFTCREW_URL and CRAFTCREW_ADMIN_TOKEN (or use --dry-run).");
  let batchId = null,
    sent = 0;
  for (let i = 0; i < items.length; i += 1000) {
    const r = await io.fetch(base + "/api/admin/supplier-imports", {
      method: "POST",
      headers: { "Content-Type": "application/json", "X-Client": "api", Authorization: "Bearer " + token },
      body: JSON.stringify({
        candidates: items.slice(i, i + 1000),
        ...(batchId ? { batchId } : { source: { register: "TED", licence: "Commission Decision 2011/833/EU", params: `${o.country} since ${o.since}` } }),
      }),
    });
    const data = await r.json().catch(() => ({}));
    if (!r.ok) throw new Error(`CraftCrew answered ${r.status}: ${data.error || ""}`);
    batchId = data.batch.id;
    sent += Math.min(1000, items.length - i);
  }
  io.log(batchId ? `Import batch ${batchId} is waiting for review at ${base}/#/admin/supplier-imports` : "Nothing to import");
  return { items, skipped, sent, batchId };
}

if (require.main === module)
  main(process.argv.slice(2)).catch((e) => {
    console.error(e.message);
    process.exit(e.message.startsWith("Not configured") ? 2 : 1);
  });

module.exports = { main, parseArgs };
