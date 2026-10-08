#!/usr/bin/env node
/*
 * Writes the data in PostgreSQL as a db.json file for the JSON store (T163): the way back.
 *
 *   node tools/db/export-json.js > db.json
 *
 * Reads one consistent snapshot, so it may run while the app runs. The checksums per collection go to stderr;
 * they are the same as the ones import-json.js printed for the file that was imported.
 */
const { createPool } = require("../../db/pg");
const { readAll, assemble } = require("../../store-postgres");
const { checksums, compare } = require("../../db/checksums");

async function main() {
  const pool = createPool(),
    client = await pool.connect();
  let data;
  try {
    await client.query("begin isolation level repeatable read read only");
    const exists = (await client.query("select to_regclass('records') is not null as ok")).rows[0].ok;
    data = exists ? assemble(await readAll(client)).data : null;
    if (data) {
      const inbox = await require("../../stripe-inbox").exportPostgresInbox(client, data);
      if (inbox.length || data.meta?.stripe?.inboxMigrated) data.stripeWebhookInbox = inbox;
    }
    await client.query("commit");
  } finally {
    client.release();
    await pool.end();
  }
  if (!data) throw new Error("The database holds no CraftCrew data.");
  process.stdout.write(JSON.stringify(data));
  const sums = checksums(data);
  console.error(compare(sums, sums).lines.join("\n"));
}

main().catch((e) => {
  // Only the message: never the connection address.
  console.error(e.message);
  process.exit(1);
});
