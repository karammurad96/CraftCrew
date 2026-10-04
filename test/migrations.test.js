// T161: database migrations apply in order, a second run changes nothing, and a broken one rolls back completely.
// The database tests need DATABASE_URL (CI job test-postgres); each runs in its own schema.
const { describe, it, before, after } = require("node:test");
const assert = require("node:assert/strict");
const { mkdtempSync, rmSync, writeFileSync } = require("node:fs");
const { execFileSync } = require("node:child_process");
const os = require("node:os");
const path = require("node:path");
const { migrate, status, migrationFiles, MIGRATIONS } = require("../db/migrate");

const ROOT = path.join(__dirname, "..");
const DB_URL = process.env.DATABASE_URL;

function folder(files) {
  const dir = mkdtempSync(path.join(os.tmpdir(), "craftcrew-migrations-"));
  for (const [name, sql] of Object.entries(files)) writeFileSync(path.join(dir, name), sql);
  return dir;
}

describe("migration files", () => {
  it("accepts the repository's migrations", () => {
    for (const m of migrationFiles(MIGRATIONS)) assert.match(m.version, /^\d{3}_[a-z0-9_]+$/);
  });

  it("refuses badly named files and repeated numbers", () => {
    const badName = folder({ "1_users.sql": "" }),
      twice = folder({ "001_a.sql": "", "001_b.sql": "" });
    try {
      assert.throws(() => migrationFiles(badName), /must be named like 001_short_name\.sql/);
      assert.throws(() => migrationFiles(twice), /same number/);
    } finally {
      rmSync(badName, { recursive: true, force: true });
      rmSync(twice, { recursive: true, force: true });
    }
  });

  it("returns no migrations for a missing folder", () => {
    assert.deepEqual(migrationFiles(path.join(os.tmpdir(), "craftcrew-no-such-folder")), []);
  });
});

describe("migrations in PostgreSQL", { skip: !DB_URL && "needs DATABASE_URL" }, () => {
  const schema = `mig_${process.pid}_${Date.now()}`;
  let client, dir;
  const tables = async () =>
    (
      await client.query(
        "select table_name from information_schema.tables where table_schema = $1 order by 1",
        [schema],
      )
    ).rows.map((r) => r.table_name);

  before(async () => {
    const { Client } = require("pg");
    const admin = new Client({ connectionString: DB_URL });
    await admin.connect();
    await admin.query(`create schema ${schema}`);
    await admin.end();
    client = new Client({ connectionString: DB_URL, options: `-c search_path=${schema}` });
    await client.connect();
    dir = folder({
      "001_accounts.sql": "create table accounts (id text primary key, email text not null);",
      "002_orders.sql":
        "create table orders (id text primary key, account_id text not null references accounts (id));\n" +
        "create index orders_account on orders (account_id);",
    });
  });
  after(async () => {
    await client?.query(`drop schema if exists ${schema} cascade`);
    await client?.end();
    if (dir) rmSync(dir, { recursive: true, force: true });
  });

  it("applies the migrations of an empty database in order", async () => {
    assert.deepEqual(await migrate(client, { dir }), ["001_accounts", "002_orders"]);
    assert.deepEqual(await tables(), ["accounts", "orders", "schema_migrations"]);
    const { applied, pending } = await status(client, { dir });
    assert.deepEqual(
      applied.map((r) => r.version),
      ["001_accounts", "002_orders"],
    );
    assert.deepEqual(pending, []);
  });

  it("changes nothing on a second run", async () => {
    const before = (await client.query("select version, applied_at from schema_migrations order by 1")).rows;
    assert.deepEqual(await migrate(client, { dir }), []);
    assert.deepEqual(
      (await client.query("select version, applied_at from schema_migrations order by 1")).rows,
      before,
    );
  });

  it("rolls a broken migration back completely and applies it once it is fixed", async () => {
    const file = path.join(dir, "003_audit.sql");
    writeFileSync(
      file,
      "create table audit (id serial primary key, note text);\n" +
        "insert into audit (note) values ('first');\n" +
        "alter table accounts add column name text;\n" +
        "select * from no_such_table;",
    );
    await assert.rejects(
      migrate(client, { dir }),
      /Migration 003_audit failed and was rolled back: .*no_such_table/,
    );
    assert.ok(!(await tables()).includes("audit"), "the new table is gone");
    const columns = (
      await client.query(
        "select column_name from information_schema.columns where table_schema = $1 and table_name = 'accounts'",
        [schema],
      )
    ).rows.map((r) => r.column_name);
    assert.ok(!columns.includes("name"), "the changed table is unchanged");
    assert.deepEqual((await status(client, { dir })).pending, ["003_audit"]);

    writeFileSync(file, "create table audit (id serial primary key, note text);");
    assert.deepEqual(await migrate(client, { dir }), ["003_audit"]);
    assert.ok((await tables()).includes("audit"));
  });

  it("runs from the command line and keeps the connection address out of errors", () => {
    const url = new URL(DB_URL);
    url.searchParams.set("options", `-c search_path=${schema}`);
    const out = execFileSync(process.execPath, ["tools/db/migrate.js"], {
      cwd: ROOT,
      env: { ...process.env, DATABASE_URL: url.toString() },
      encoding: "utf8",
    });
    assert.match(out, /up to date|migration\(s\) applied/);
    const wrong = new URL(DB_URL);
    wrong.password = "wrong-password-for-the-test";
    let failed;
    try {
      execFileSync(process.execPath, ["tools/db/migrate.js"], {
        cwd: ROOT,
        env: { ...process.env, DATABASE_URL: wrong.toString() },
        encoding: "utf8",
        stdio: "pipe",
      });
    } catch (e) {
      failed = e;
    }
    assert.ok(failed, "a wrong password fails");
    assert.ok(
      !String(failed.stderr).includes("wrong-password-for-the-test"),
      "the password is never printed",
    );
  });
});
