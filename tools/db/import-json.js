#!/usr/bin/env node
/*
 * Moves the data of a db.json file into PostgreSQL (T163). Needs DATABASE_URL. Stop the app first.
 *
 *   node tools/db/import-json.js <path/to/db.json> [--dry-run] [--replace]
 *
 * - Applies the migrations, then fills an empty database. A database that already holds data is refused,
 *   unless --replace is given: then everything in it is replaced.
 * - All in one transaction: the data is read back and its SHA-256 checksum per collection compared with the
 *   file before the commit. On any difference, and with --dry-run, nothing is kept.
 * - Prints the number of records and the checksum of every collection.
 * - Uploaded files stay where they are (DATA_DIR/uploads); only the data moves.
 */
const fs = require("fs");
const path = require("path");
const { jsonInbox, postgresInbox, importInbox, fold, ordered } = require("../../stripe-inbox");
const { createPool } = require("../../db/pg");
const { migrate } = require("../../db/migrate");
const { changes, write, readAll, assemble, TABLES } = require("../../store-postgres");
const { checksums, compare } = require("../../db/checksums");

async function main() {
  const args = process.argv.slice(2),
    file = args.find((a) => !a.startsWith("--")),
    dryRun = args.includes("--dry-run"),
    replace = args.includes("--replace");
  if (!file || args.some((a) => a.startsWith("--") && !["--dry-run", "--replace"].includes(a)))
    throw new Error("Usage: node tools/db/import-json.js <path/to/db.json> [--dry-run] [--replace]");
  let data;
  try {
    data = JSON.parse(fs.readFileSync(file, "utf8"));
  } catch (e) {
    throw new Error(`${file} cannot be read as a CraftCrew data file (${e.message}).`);
  }
  if (!data || typeof data !== "object" || !Array.isArray(data.users))
    throw new Error(`${file} is not a CraftCrew data file: it has no users.`);

  const ledgerDirectory = path.join(path.dirname(file), "stripe-webhooks");
  if (data.meta?.stripe?.inboxMigrated && data.stripeWebhookInbox === undefined && !fs.existsSync(ledgerDirectory))
    throw new Error("The migrated Stripe inbox is missing. Use a full data-folder backup or an export containing stripeWebhookInbox.");
  const inboxBackup = fold([...(data.stripeWebhookInbox || []), ...await jsonInbox(path.dirname(file)).export()]);
  delete data.stripeWebhookInbox;

  const pool = createPool(),
    client = await pool.connect();
  try {
    await migrate(client);
    await client.query("begin");
    await require('../../db/writer-barrier').transaction(client);
    const ledger = postgresInbox(() => client);
    const prepared = require('../../stripe-commit').backup(assemble(await readAll(client)).data, data, await ledger.export(), inboxBackup);
    data = prepared.data;
    const tables = ["records", "kv", ...TABLES.map((t) => t.table)],
      { rows } = await client.query(
        `select ${tables.map((t) => `(select count(*) from ${t})`).join(" + ")} as n`,
      ),
      existing = Number(rows[0].n);
    if (existing && !replace)
      throw new Error(
        `The database already holds data (${existing} rows). Back it up, then use --replace to overwrite it.`,
      );
    if (existing) {
      // The only way past the invoice and payment protections (T165): replacing everything, on request.
      await client.query("set local craftcrew.replace_all = 'on'");
      for (const t of [...tables].reverse()) await client.query(`delete from ${t}`);
      await client.query("delete from invoice_counters");
    }
    await write(client, changes(data, { records: new Map(), values: new Map() }));
    const expected = new Map(prepared.records.map((record) => [record.id, record]));
    await importInbox(ledger, prepared.records);
    const ledgerBack = await ledger.export();
    if (JSON.stringify([...expected.values()].sort(ordered)) !== JSON.stringify(ledgerBack.sort(ordered)))
      throw new Error("The Stripe inbox read back differs. Nothing was imported.");
    const back = assemble(await readAll(client)).data,
      { lines, different } = compare(checksums(data), checksums(back));
    console.log(lines.join("\n"));
    if (different.length) {
      await client.query("rollback");
      throw new Error(`The data read back differs in: ${different.join(", ")}. Nothing was imported.`);
    }
    const records = Object.values(data).reduce((n, v) => n + (Array.isArray(v) ? v.length : 0), 0);
    if (dryRun) {
      await client.query("rollback");
      console.log(`Dry run: ${records} records checked, nothing was written.`);
    } else {
      await client.query("commit");
      console.log(
        `Imported ${records} records${existing ? ", replacing the data that was there" : ""}. Checksums match.`,
      );
    }
  } catch (e) {
    await client.query("rollback").catch(() => {});
    throw e;
  } finally {
    client.release();
    await pool.end();
  }
}

main().catch((e) => {
  // Only the message: never the connection address.
  console.error(e.message);
  process.exit(1);
});
