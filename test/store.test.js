// T162: the PostgreSQL store writes only what changed, keeps the list order and loads the same data back.
// The database tests need DATABASE_URL (CI job test-postgres); each runs in its own schema.
const { describe, it, before, after } = require("node:test");
const assert = require("node:assert/strict");
const { readFileSync, readdirSync } = require("node:fs");
const path = require("node:path");
const { changes, positions, jsonbSafe, COLLECTIONS, VALUES } = require("../store-postgres");

const ROOT = path.join(__dirname, "..");
const DB_URL = process.env.DATABASE_URL;
const empty = () => ({ records: new Map(), values: new Map() });

describe("list positions", () => {
  const increasing = (pos) => pos.every((p, i) => i === 0 || p > pos[i - 1]);

  it("numbers a new list 0, 1, 2 …", () => {
    assert.deepEqual(positions([undefined, undefined, undefined]), [0, 1, 2]);
  });
  it("keeps every saved position when a record is added at the front, the end or in between", () => {
    assert.deepEqual(positions([undefined, 0, 1, 2]), [-1, 0, 1, 2]);
    assert.deepEqual(positions([0, 1, 2, undefined, undefined]), [0, 1, 2, 3, 4]);
    assert.deepEqual(positions([0, undefined, 1]), [0, 0.5, 1]);
  });
  it("moves only the moved record", () => {
    const pos = positions([4, 0, 1, 2, 3]);
    assert.deepEqual(pos.slice(1), [0, 1, 2, 3]);
    assert.ok(pos[0] < 0);
  });
  it("numbers the list again when there is no room left between two neighbours", () => {
    let saved = [0, 1];
    for (let n = 0; n < 80; n++) {
      const pos = positions([saved[0], undefined, ...saved.slice(1)]);
      assert.ok(increasing(pos), `round ${n}`);
      saved = pos;
    }
  });
});

describe("changes", () => {
  const save = (data, saved) => {
    const c = changes(data, saved);
    for (const r of c.upserts) saved.records.set(r.id, r);
    for (const r of c.deletes) saved.records.delete(r.id);
    for (const [name, text] of c.values) saved.values.set(name, text);
    for (const name of c.valueDeletes) saved.values.delete(name);
    return c;
  };
  const count = (c) => ({
    upserts: c.upserts.length,
    deletes: c.deletes.length,
    values: c.values.length,
    valueDeletes: c.valueDeletes.length,
  });

  it("writes only new, changed and removed records", () => {
    const saved = empty(),
      data = {
        meta: { v: 1 },
        users: [{ id: "u1" }, { id: "u2" }],
        invoices: [
          { id: "i1", amount: 10 },
          { id: "i2", amount: 20 },
        ],
        sessions: [{ tokenHash: "h1", userId: "u1" }],
        payments: [],
      };
    assert.deepEqual(count(save(data, saved)), { upserts: 5, deletes: 0, values: 2, valueDeletes: 0 });
    assert.deepEqual(count(save(data, saved)), { upserts: 0, deletes: 0, values: 0, valueDeletes: 0 });
    data.invoices[1].amount = 25;
    assert.deepEqual(count(save(data, saved)), { upserts: 1, deletes: 0, values: 0, valueDeletes: 0 });
    data.invoices.unshift({ id: "i3", amount: 5 });
    assert.deepEqual(count(save(data, saved)), { upserts: 1, deletes: 0, values: 0, valueDeletes: 0 });
    data.users.splice(0, 1);
    assert.deepEqual(count(save(data, saved)), { upserts: 0, deletes: 1, values: 0, valueDeletes: 0 });
    assert.ok(saved.records.has("sessions\th1"), "sessions are keyed by tokenHash");
  });

  it("keeps records with a repeated id or without one", () => {
    const saved = empty(),
      data = { users: [{ id: "u1", n: 1 }, { id: "u1", n: 2 }, { name: "no id" }] };
    assert.equal(save(data, saved).upserts.length, 3);
    assert.deepEqual([...saved.records.keys()].slice(0, 2), ["users\tu1", "users\tu1#2"]);
    assert.equal(save(data, saved).upserts.length, 0);
  });

  it("removes a list or value that is gone", () => {
    const saved = empty();
    save({ meta: { a: 1 }, extra: { b: 2 }, users: [{ id: "u1" }] }, saved);
    const c = save({ meta: { a: 1 } }, saved);
    assert.deepEqual(count(c), { upserts: 0, deletes: 1, values: 1, valueDeletes: 1 });
  });
});

describe("text that jsonb cannot hold", () => {
  it("drops \\u0000 and replaces lone surrogates, and leaves escaped backslashes alone", () => {
    const text = JSON.stringify({ a: "x\u0000y", b: "\ud800z", c: "\\u0000", d: "\\\u0000", e: "😀" });
    assert.deepEqual(JSON.parse(jsonbSafe(text)), { a: "xy", b: "�z", c: "\\u0000", d: "\\", e: "😀" });
  });
});

describe("collections", () => {
  it("lists every top-level part of the data the server uses", () => {
    const used = new Set();
    for (const f of readdirSync(ROOT).filter((x) => x.endsWith(".js") && !x.startsWith("store")))
      for (const m of readFileSync(path.join(ROOT, f), "utf8").matchAll(
        /\b(?:db|getDb\(\))\.([a-zA-Z_]\w*)\b(?!["'])/g,
      ))
        used.add(m[1]);
    used.delete("json"); // the file name "db.json" in comments and messages
    const listed = new Set([...COLLECTIONS, ...VALUES]);
    assert.deepEqual(
      [...used].filter((name) => !listed.has(name)),
      [],
    );
  });
});

describe("PostgreSQL store", { skip: !DB_URL && "needs DATABASE_URL" }, () => {
  const { postgresStore } = require("../store-postgres");
  const schema = `store_${process.pid}_${Date.now()}`;
  let url, admin;
  const open = () => postgresStore({ url });

  before(async () => {
    const { Client } = require("pg");
    admin = new Client({ connectionString: DB_URL });
    await admin.connect();
    await admin.query(`create schema ${schema}`);
    const u = new URL(DB_URL);
    u.searchParams.set("options", `-c search_path=${schema}`);
    url = u.toString();
  });
  after(async () => {
    await admin?.query(`drop schema if exists ${schema} cascade`);
    await admin?.end();
  });

  const sample = () => ({
    meta: { createdAt: "2026-10-04T00:00:00.000Z" },
    users: [
      { id: "u1", email: "a@test.local", name: 'Quote " and \\ backslash', tags: ["ä", "😀"] },
      { id: "u2", email: "b@test.local", nested: { deep: [1, 2.5, null, true] } },
    ],
    invoices: [
      { id: "i1", amount: 100.5, status: "Submitted" },
      { id: "i2", amount: 20, status: "Approved" },
    ],
    auditLog: [],
    sessions: [{ tokenHash: "abc", userId: "u1" }],
    counters: { s1: { 2026: 2 } },
  });

  it("starts empty, then loads exactly what was saved, in order and with empty lists", async () => {
    const store = open();
    try {
      assert.equal(store.loadSync(), null, "nothing saved yet");
      const data = sample();
      store.save(data);
      await store.flush();
      assert.equal(store.stats.last.upserts, 5);
    } finally {
      await store.close();
    }
    const again = open();
    try {
      const loaded = again.loadSync();
      assert.deepEqual(loaded, sample());
      assert.deepEqual(Object.keys(loaded), Object.keys(sample()), "top-level order kept");
      assert.deepEqual(loaded.auditLog, [], "an empty list comes back as []");
    } finally {
      await again.close();
    }
  });

  it("writes one row for one changed invoice and one for a new audit entry at the front", async () => {
    const store = open();
    try {
      const data = store.loadSync();
      data.invoices[0].status = "Approved";
      store.save(data);
      await store.flush();
      assert.deepEqual(store.stats.last, { upserts: 1, deletes: 0, values: 0 });
      data.auditLog.unshift({ id: "a1", action: "Approved" });
      data.auditLog.unshift({ id: "a2", action: "Paid" });
      store.save(data);
      await store.flush();
      data.auditLog.unshift({ id: "a3", action: "Opened" });
      store.save(data);
      await store.flush();
      assert.deepEqual(store.stats.last, { upserts: 1, deletes: 0, values: 0 });
      const writes = store.stats.writes;
      store.save(data);
      await store.flush();
      assert.equal(store.stats.writes, writes, "nothing changed, nothing written");
    } finally {
      await store.close();
    }
    const again = open();
    try {
      const loaded = again.loadSync();
      assert.deepEqual(
        loaded.auditLog.map((a) => a.id),
        ["a3", "a2", "a1"],
      );
      assert.equal(loaded.invoices[0].status, "Approved");
    } finally {
      await again.close();
    }
  });

  it("saves text that jsonb cannot hold instead of failing every save after it", async () => {
    const store = open();
    try {
      const data = store.loadSync();
      data.users[0].name = "Broken\u0000name \ud800";
      store.save(data);
      await store.flush();
    } finally {
      await store.close();
    }
    const again = open();
    try {
      assert.equal(again.loadSync().users[0].name, "Brokenname �");
    } finally {
      await again.close();
    }
  });

  it("rejects flush() when the commit fails and writes the change once the database works again", async () => {
    const store = open();
    try {
      const data = store.loadSync();
      // kv keeps the values that are not lists, whatever moves to tables of its own later
      await admin.query(`alter table ${schema}.kv rename to kv_away`);
      data.meta.note = "saved after the outage";
      store.save(data);
      await assert.rejects(store.flush(), /kv/);
      await admin.query(`alter table ${schema}.kv_away rename to kv`);
      await store.flush();
      const { rows } = await admin.query(`select data from ${schema}.kv where name = 'meta'`);
      assert.equal(rows[0].data.note, "saved after the outage");
      await store.ping();
    } finally {
      await store.close();
    }
  });
});
