/*
 * PostgreSQL connection (T161): one connection pool for the process, from DATABASE_URL.
 * Used with STORE=postgres and by the tools in tools/db/. The JSON store never loads this file.
 *
 *   DATABASE_URL  postgres://user:password@host:5432/craftcrew
 *   PGSSLMODE     require for a managed database (TLS); the `pg` driver reads it itself.
 *
 * Never log DATABASE_URL or a connection error's full text: both can contain the password.
 */
const { Pool } = require("pg");

let pool = null;

function connectionString() {
  const url = process.env.DATABASE_URL;
  if (!url)
    throw new Error("DATABASE_URL is not set. Set it to postgres://user:password@host:5432/database.");
  return url;
}

function getPool() {
  if (!pool) {
    pool = new Pool({ connectionString: connectionString(), max: Number(process.env.PG_POOL_MAX) || 10 });
    // An idle connection that breaks must not crash the server; the next query opens a new one.
    pool.on("error", (e) => console.error("PostgreSQL connection lost:", e.code || e.message));
  }
  return pool;
}

function query(sql, params) {
  return getPool().query(sql, params);
}

// Runs `work(client)` in one transaction: commit when it resolves, roll back when it throws.
async function tx(work) {
  const client = await getPool().connect();
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

module.exports = { getPool, query, tx, close };
