#!/usr/bin/env node
/*
 * Applies the database migrations in migrations/ (T161). Needs DATABASE_URL.
 *
 *   node tools/db/migrate.js            apply the missing migrations
 *   node tools/db/migrate.js --status   list the applied and the pending migrations
 *
 * The server also applies them at start-up when STORE=postgres.
 */
const pg = require("../../db/pg");
const { migrate, status } = require("../../db/migrate");

async function main() {
  const client = await pg.getPool().connect();
  try {
    if (process.argv.includes("--status")) {
      const { applied, pending } = await status(client);
      for (const r of applied) console.log(`applied  ${r.version}  ${r.applied_at.toISOString()}`);
      for (const v of pending) console.log(`pending  ${v}`);
      if (!applied.length && !pending.length) console.log("No migrations yet.");
      return;
    }
    const done = await migrate(client, { log: console.log });
    console.log(done.length ? `${done.length} migration(s) applied.` : "The database is up to date.");
  } finally {
    client.release();
    await pg.close();
  }
}

main().catch((e) => {
  // Only the message: a connection error can contain the address, never print the whole URL.
  console.error(e.message);
  process.exit(1);
});
