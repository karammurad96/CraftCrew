/*
 * Database migrations (T161): the numbered files in migrations/ (001_records.sql, 002_accounts.sql …) are
 * applied in order, each in its own transaction, and recorded in schema_migrations. A migration that fails
 * is rolled back completely and stops the run. A merged migration is never edited: a change is a new file.
 * A .js migration (T164) exports `async (client) => {}`, for data moves that need the store's own rules.
 *
 * Used by the PostgreSQL store at start-up and by `node tools/db/migrate.js`.
 */
const fs = require("fs");
const path = require("path");

const MIGRATIONS = path.join(__dirname, "..", "migrations");
// Two servers starting at once must not apply the same migration twice.
const LOCK = 7158230161;
const NAME = /^(\d{3})_[a-z0-9_]+\.(sql|js)$/;

// The migration files in order. Any other .sql file or a repeated number is a mistake, not something to skip.
function migrationFiles(dir = MIGRATIONS) {
  let names;
  try {
    names = fs.readdirSync(dir).filter((f) => /\.(sql|js)$/.test(f));
  } catch (e) {
    if (e.code === "ENOENT") return [];
    throw e;
  }
  const seen = new Map();
  for (const f of names) {
    const m = NAME.exec(f);
    if (!m) throw new Error(`Migration file ${f} must be named like 001_short_name.sql (or .js).`);
    if (seen.has(m[1])) throw new Error(`Migrations ${seen.get(m[1])} and ${f} have the same number.`);
    seen.set(m[1], f);
  }
  return names.sort().map((f) => ({ version: f.replace(/\.(sql|js)$/, ""), file: path.join(dir, f) }));
}

async function ensureTable(client) {
  await client.query(
    "create table if not exists schema_migrations (version text primary key, applied_at timestamptz not null default now())",
  );
}

// Applies the missing migrations with `client` (a pg client, not a pool). Returns the versions applied now.
async function migrate(client, { dir = MIGRATIONS, log = () => {} } = {}) {
  const files = migrationFiles(dir);
  await client.query("select pg_advisory_lock($1)", [LOCK]);
  try {
    await ensureTable(client);
    const done = new Set(
      (await client.query("select version from schema_migrations")).rows.map((r) => r.version),
    );
    const applied = [];
    for (const { version, file } of files) {
      if (done.has(version)) continue;
      await client.query("begin");
      try {
        if (file.endsWith(".js")) await require(file)(client);
        else await client.query(fs.readFileSync(file, "utf8"));
        await client.query("insert into schema_migrations (version) values ($1)", [version]);
        await client.query("commit");
      } catch (e) {
        await client.query("rollback").catch(() => {});
        throw new Error(`Migration ${version} failed and was rolled back: ${e.message}`);
      }
      applied.push(version);
      log(`Applied migration ${version}`);
    }
    return applied;
  } finally {
    await client.query("select pg_advisory_unlock($1)", [LOCK]).catch(() => {});
  }
}

// The applied and the pending migrations, for `tools/db/migrate.js --status`.
async function status(client, { dir = MIGRATIONS } = {}) {
  await ensureTable(client);
  const rows = (await client.query("select version, applied_at from schema_migrations order by version"))
    .rows;
  const done = new Set(rows.map((r) => r.version));
  return {
    applied: rows,
    pending: migrationFiles(dir)
      .map((m) => m.version)
      .filter((v) => !done.has(v)),
  };
}

module.exports = { migrate, status, migrationFiles, MIGRATIONS };
