// T164: accounts, sessions and sign-in tokens in real PostgreSQL tables. The database itself refuses a second
// account with the same email address, and the store undoes a refused change in memory. Needs DATABASE_URL.
const { describe, it, before, after } = require("node:test");
const assert = require("node:assert/strict");
const { mkdtempSync, rmSync, copyFileSync } = require("node:fs");
const os = require("node:os");
const path = require("node:path");
const { startApp, POSTGRES, schemaOf } = require("./helpers");

const DB_URL = process.env.DATABASE_URL;

describe("account tables", { skip: !DB_URL && "needs DATABASE_URL" }, () => {
  const { postgresStore } = require("../store-postgres");
  const { migrate } = require("../db/migrate");
  const schemas = [];
  let admin;
  const schema = async (name) => {
    const full = `${name}_${process.pid}`;
    await admin.query(`drop schema if exists ${full} cascade; create schema ${full}`);
    schemas.push(full);
    const url = new URL(DB_URL);
    url.searchParams.set("options", `-c search_path=${full}`);
    return { name: full, url: url.toString() };
  };
  const user = (id, email, extra = {}) => ({
    id,
    role: "customer",
    name: "User " + id,
    email,
    salt: "s",
    passwordHash: "h",
    createdAt: "2026-10-04T10:00:00.000Z",
    ...extra,
  });

  before(async () => {
    const { Client } = require("pg");
    admin = new Client({ connectionString: DB_URL });
    await admin.connect();
  });
  after(async () => {
    for (const s of schemas) await admin.query(`drop schema if exists ${s} cascade`);
    await admin.end();
  });

  it("keeps every field exactly, writes one row for one changed account, and cascades sessions", async () => {
    const { name, url } = await schema("acc_round");
    const data = {
      users: [
        user("u1", "a@test.local", { companyProfile: { legalName: "A GmbH" }, status: "Active" }),
        // Values that do not fit their columns stay in `extra` and come back unchanged
        user("u2", null, {
          createdAt: "2026-10-04",
          role: "customer",
          lastLoginAt: "2026-10-04T11:00:00.000Z",
        }),
        { id: 7, role: "admin", email: "n@test.local" },
      ],
      sessions: [
        {
          tokenHash: "t1",
          userId: "u1",
          createdAt: "2026-10-04T10:00:00.000Z",
          expiresAt: "2026-10-11T10:00:00.000Z",
        },
      ],
      authTokens: [{ hash: "h1", userId: "u2", type: "verify", expiresAt: "2026-10-06T10:00:00.000Z" }],
    };
    let store = postgresStore({ url });
    try {
      assert.equal(store.loadSync(), null);
      store.save(data);
      await store.flush();
    } finally {
      await store.close();
    }
    const rows = (
      await admin.query(`select id, email, role, created_at, extra from ${name}.users order by pos`)
    ).rows;
    assert.equal(rows[0].email, "a@test.local", "fitting values are in their columns");
    assert.equal(rows[1].created_at, null);
    assert.equal(rows[1].extra.createdAt, "2026-10-04", "a value that does not fit stays in extra");
    assert.equal(
      (
        await admin.query(
          `select count(*)::int as n from ${name}.records where collection in ('users', 'sessions', 'authTokens')`,
        )
      ).rows[0].n,
      0,
      "nothing of these lists in records",
    );
    store = postgresStore({ url });
    try {
      const loaded = store.loadSync();
      assert.deepEqual(loaded.users, data.users);
      assert.deepEqual(loaded.sessions, data.sessions);
      assert.deepEqual(loaded.authTokens, data.authTokens);
      loaded.users[0].name = "Renamed";
      store.save(loaded);
      await store.flush();
      assert.deepEqual(store.stats.last, { upserts: 1, deletes: 0, values: 0 });
      loaded.users.splice(0, 1);
      store.save(loaded);
      await store.flush();
      assert.equal(
        (await admin.query(`select count(*)::int as n from ${name}.sessions`)).rows[0].n,
        0,
        "the user's session went with it",
      );
    } finally {
      await store.close();
    }
  });

  it("refuses a second account with the same email even when the code check is bypassed", async () => {
    const { name, url } = await schema("acc_twin");
    const store = postgresStore({ url });
    try {
      store.loadSync();
      const data = { users: [user("u1", "same@test.local")], sessions: [] };
      store.save(data);
      await store.flush();
      // The code would refuse this; here it is pushed directly, as a bug or a second server could.
      data.users.push(user("u2", "Same@Test.local"));
      data.sessions.push({ tokenHash: "t2", userId: "u2", createdAt: "2026-10-04T10:00:00.000Z" });
      data.users[0].name = "Still saved";
      store.save(data);
      const failed = await store.flush().catch((e) => e);
      assert.ok(failed?.refused, "flush() reports the refusal");
      assert.equal(failed.refused[0].constraint, "users_email_unique");
      assert.deepEqual(
        data.users.map((u) => u.id),
        ["u1"],
        "the refused account is removed from memory",
      );
      assert.deepEqual(data.sessions, [], "and its session, which the database refused too");
      const rows = (await admin.query(`select id, extra->>'name' as name from ${name}.users`)).rows;
      assert.deepEqual(rows, [{ id: "u1", name: "Still saved" }], "the other change was saved");
      // Plain SQL is refused the same way
      await assert.rejects(
        admin.query(`insert into ${name}.users (id, pos, email) values ('u3', 9, 'SAME@test.local')`),
        /users_email_unique/,
      );
    } finally {
      await store.close();
    }
  });

  it("refuses an unknown role and puts the saved account back in memory", async () => {
    const { url } = await schema("acc_role");
    const store = postgresStore({ url });
    try {
      store.loadSync();
      const data = { users: [user("u1", "r@test.local")] },
        record = data.users[0];
      store.save(data);
      await store.flush();
      record.role = "superuser";
      record.name = "Changed";
      store.save(data);
      const failed = await store.flush().catch((e) => e);
      assert.equal(failed?.refused?.[0].constraint, "users_role_check");
      assert.equal(data.users[0], record, "the same object");
      assert.equal(record.role, "customer");
      assert.equal(record.name, "User u1");
      store.save(data);
      await store.flush();
    } finally {
      await store.close();
    }
  });

  it("moves accounts saved in records before T164 into the new tables", async () => {
    const { name, url } = await schema("acc_move"),
      client = new (require("pg").Client)({ connectionString: url }),
      only001 = mkdtempSync(path.join(os.tmpdir(), "craftcrew-mig-"));
    copyFileSync(
      path.join(__dirname, "..", "migrations", "001_records.sql"),
      path.join(only001, "001_records.sql"),
    );
    await client.connect();
    try {
      await migrate(client, { dir: only001 });
      const rec = (collection, key, pos, data) =>
        client.query("insert into records (collection, key, pos, data) values ($1, $2, $3, $4)", [
          collection,
          key,
          pos,
          data,
        ]);
      await rec("users", "u1", 0, user("u1", "move@test.local"));
      await rec("users", "u2", 1, user("u2", "other@test.local", { createdAt: "yesterday" }));
      await rec("sessions", "t1", 0, {
        tokenHash: "t1",
        userId: "u1",
        createdAt: "2026-10-04T10:00:00.000Z",
      });
      await rec("sessions", "t2", 1, { tokenHash: "t2", userId: "gone" });
      await rec("projects", "p1", 0, { id: "p1", name: "Stays" });
      await migrate(client);
      assert.deepEqual(
        (await client.query("select collection from records")).rows.map((r) => r.collection),
        ["projects"],
      );
      const store = postgresStore({ url });
      try {
        const loaded = store.loadSync();
        assert.deepEqual(loaded.users, [
          user("u1", "move@test.local"),
          user("u2", "other@test.local", { createdAt: "yesterday" }),
        ]);
        assert.deepEqual(
          loaded.sessions.map((s) => s.tokenHash),
          ["t1"],
          "a session of an account that is gone is not moved",
        );
      } finally {
        await store.close();
      }
    } finally {
      await client.end();
      rmSync(only001, { recursive: true, force: true });
    }
    // Two accounts with one address stop the migration with a clear message
    const twin = await schema("acc_twin_move"),
      c2 = new (require("pg").Client)({ connectionString: twin.url }),
      dir = mkdtempSync(path.join(os.tmpdir(), "craftcrew-mig-"));
    copyFileSync(
      path.join(__dirname, "..", "migrations", "001_records.sql"),
      path.join(dir, "001_records.sql"),
    );
    await c2.connect();
    try {
      await migrate(c2, { dir });
      await c2.query(
        "insert into records (collection, key, pos, data) values ('users', 'a', 0, $1), ('users', 'b', 1, $2)",
        [user("a", "twin@test.local"), user("b", "TWIN@test.local")],
      );
      await assert.rejects(migrate(c2), /Two accounts share the email address twin@test\.local/);
      assert.equal((await c2.query("select count(*)::int as n from records")).rows[0].n, 2, "nothing moved");
    } finally {
      await c2.end();
      rmSync(dir, { recursive: true, force: true });
    }
    assert.ok(name);
  });
});

describe("a sign-up that the database refuses", { skip: !POSTGRES && "needs STORE=postgres" }, () => {
  let app;
  before(async () => (app = await startApp()));
  after(() => app?.stop());

  it("answers 409 like the code check when another server already has the address", async () => {
    // An account the running server does not know about, written by another server
    const { Client } = require("pg"),
      client = new Client({ connectionString: process.env.DATABASE_URL });
    await client.connect();
    try {
      await client.query(
        `insert into ${schemaOf(app.dataDir)}.users (id, pos, email, role) values ('usr_elsewhere', 99, 'taken@test.local', 'customer')`,
      );
    } finally {
      await client.end();
    }
    const r = await app.signup("customer", "taken@test.local");
    assert.equal(r.status, 409);
    assert.equal(r.code, "emailAlreadyRegistered");
    // The refused account is gone from memory, so a second try is refused by the database again
    assert.equal((await app.signup("customer", "taken@test.local")).status, 409);
    assert.equal((await app.signup("customer", "free@test.local")).status, 201);
  });
});
