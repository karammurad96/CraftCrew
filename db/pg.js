/*
 * PostgreSQL connection (T161): connection pools from DATABASE_URL. Used with STORE=postgres and by the tools
 * in tools/db/. The JSON store never loads this file.
 *
 *   DATABASE_URL  postgres://user:password@host:5432/craftcrew
 *   PGSSLMODE     require for a managed database (TLS); the `pg` driver reads it itself.
 *
 * Never log DATABASE_URL or a connection error's full text: both can contain the password.
 */
const { Pool } = require("pg");

let pool = null;

// A new pool for `url`. The store and the tests use their own; the tools share getPool().
function createPool(url = process.env.DATABASE_URL) {
  if (!url)
    throw new Error("DATABASE_URL is not set. Set it to postgres://user:password@host:5432/database.");
  const p = new Pool({
    connectionString: url,
    max: Number(process.env.PG_POOL_MAX) || 10,
    connectionTimeoutMillis: 5000,
  });
  // An idle connection that breaks must not crash the server; the next query opens a new one.
  p.on("error", (e) => console.error("PostgreSQL connection lost:", e.code || e.message));
  return p;
}

function getPool() {
  if (!pool) pool = createPool();
  return pool;
}

function query(sql, params) {
  return getPool().query(sql, params);
}

// Runs `work(client)` in one transaction on `on` (default: the shared pool): commit when it resolves, roll
// back when it throws.
async function tx(work, on = getPool()) {
  const client = await on.connect();
  try {
    await client.query("begin");
    const result = await work(client);
    await client.query("commit");
    return result;
  } catch (e) {
    await client.query("rollback").catch(() => {});
    throw e;
  } finally {
    client.release();
  }
}

async function close() {
  if (!pool) return;
  const p = pool;
  pool = null;
  await p.end();
}

module.exports = { createPool, getPool, query, tx, close };
