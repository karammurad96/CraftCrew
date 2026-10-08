/* T282b1b3a: ordinary payout publication uses the strict boundary without invented events. */
const { describe, it } = require('node:test');
const assert = require('node:assert/strict');
const fs = require('node:fs');
const os = require('node:os');
const path = require('node:path');
const { openStore } = require('../store');
const { createStage } = require('../stripe-commit');
let serial = 0;
async function fixture(kind, work) {
  const dataDir = fs.mkdtempSync(path.join(os.tmpdir(), 'craftcrew-payout-store-'));
  let admin, schema, url, store;
  try {
    if (kind === 'postgres') {
      admin = new (require('pg').Client)({ connectionString: process.env.DATABASE_URL }); await admin.connect();
      schema = `payout_store_${process.pid}_${++serial}`; await admin.query(`create schema ${schema}`);
      const value = new URL(process.env.DATABASE_URL); value.searchParams.set('options', `-c search_path=${schema}`); url = value.toString();
    }
    const open = () => openStore({ kind, dataDir, url }); store = open(); store.loadSync();
    let db = { meta: {}, suppliers: [{ id: 's', company: 'Supplier', stripeAccount: { id: 'acct_one', transfers: 'pending' } }],
      users: [{ id: 'owner', role: 'supplier', supplierId: 's' }], notifications: [], outbox: [] };
    store.save(db); await store.flush();
    await work({ kind, dataDir, admin, schema, get db() { return db; }, get store() { return store; },
      commit(stage) { return store.commitStage({ getDb: () => db, stage }); },
      async reopen() { await store.close?.().catch((error) => { if (!/reconciliation/.test(error.message)) throw error; }); store = open(); db = store.loadSync(); },
    });
  } finally {
    await store?.close?.().catch((error) => { if (!/reconciliation/.test(error.message)) throw error; });
    if (schema) await admin.query(`drop schema ${schema} cascade`);
    await admin?.end(); fs.rmSync(dataDir, { recursive: true, force: true });
  }
}
function stage(db) {
  const result = createStage();
  result.patch('suppliers', 's', { stripeAccount: { id: 'acct_one', transfers: 'active' } }, { stripeAccount: db.suppliers[0].stripeAccount });
  result.add('notifications', { id: 'notice', userId: 'owner', text: 'Ready' });
  result.add('outbox', { id: 'mail', to: 'owner@example.test', status: 'Queued' });
  return result;
}
for (const kind of ['json', 'postgres']) describe(`ordinary staged payout store (${kind})`, { skip: kind === 'postgres' && !process.env.DATABASE_URL }, () => {
  it('durably publishes account and mail together, preserving object identity without an inbox or synthetic receipt', async () => fixture(kind, async (c) => {
    const supplier = c.db.suppliers[0];
    assert.deepEqual(await c.commit(stage(c.db)), { applied: true });
    assert.equal(c.db.suppliers[0], supplier);
    assert.equal(c.db.suppliers[0].stripeAccount.transfers, 'active'); assert.equal(c.db.outbox.length, 1);
    assert.equal(c.db.meta.stripe, undefined); assert.deepEqual(await c.store.stripeInbox.export(), []);
    await c.reopen(); assert.equal(c.db.notifications.length, 1); assert.equal(c.db.outbox.length, 1);
    assert.equal(c.db.suppliers[0].stripeAccount.transfers, 'active'); assert.equal(c.db.meta.stripe, undefined);
  }));
  it('refuses storage errors without publishing supplier, notification or outbox effects', async () => fixture(kind, async (c) => {
    if (kind === 'json') fs.mkdirSync(path.join(c.dataDir, 'db.json.tmp'));
    else {
      await c.admin.query(`create function ${c.schema}.refuse_mail() returns trigger language plpgsql as $$ begin if new.collection='outbox' then raise exception 'refused'; end if; return new; end $$`);
      await c.admin.query(`create trigger refuse_mail before insert or update on ${c.schema}.records for each row execute function ${c.schema}.refuse_mail()`);
    }
    await assert.rejects(c.commit(stage(c.db)));
    assert.equal(c.db.suppliers[0].stripeAccount.transfers, 'pending'); assert.equal(c.db.notifications.length, 0); assert.equal(c.db.outbox.length, 0);
    if (kind === 'json') fs.rmdirSync(path.join(c.dataDir, 'db.json.tmp'));
    await c.reopen(); assert.equal(c.db.suppliers[0].stripeAccount.transfers, 'pending'); assert.equal(c.db.notifications.length, 0);
    assert.deepEqual(await c.store.stripeInbox.export(), []);
  }));
  it('preserves absent-field expectations and rejects changed fields or duplicate identifiers before effects', async () => fixture(kind, async (c) => {
    const guarded = stage(c.db);
    guarded.patch('users', 'owner', {}, { orgOwnerId: undefined, language: undefined });
    assert.equal(Object.hasOwn(guarded.patches[1].expected, 'orgOwnerId'), true);
    c.db.users[0].orgOwnerId = 'new-owner';
    await assert.rejects(c.commit(guarded), /conflict/); assert.equal(c.db.outbox.length, 0);
    delete c.db.users[0].orgOwnerId; c.db.users[0].language = 'de';
    await assert.rejects(c.commit(guarded), /conflict/); assert.equal(c.db.outbox.length, 0);
    delete c.db.users[0].language;
    const duplicate = stage(c.db); duplicate.add('outbox', { id: 'mail' });
    await assert.rejects(c.commit(duplicate), /Duplicate/);
    assert.equal(c.db.suppliers[0].stripeAccount.transfers, 'pending');
    assert.equal((await c.commit(guarded)).applied, true);
  }));
  it('retains all prior signed applied receipts and refuses receipt loss through ordinary publication', async () => fixture(kind, async (c) => {
    const event = { id: 'evt_previous', type: 'test.previous', kind: 'snapshot', livemode: false, state: 'processing', attempts: 1 };
    await c.store.stripeInbox.receive(event);
    await c.store.commitStripe({ getDb: () => c.db, stage: createStage(), event });
    const receipt = structuredClone(c.db.meta.stripe.appliedReceipts.evt_previous);
    delete c.db.meta.stripe.appliedReceipts.evt_previous;
    await assert.rejects(c.commit(stage(c.db)), /cannot be removed/); assert.equal(c.db.outbox.length, 0);
    c.db.meta.stripe.appliedReceipts.evt_previous = receipt;
    await c.commit(stage(c.db)); await c.reopen();
    assert.deepEqual(c.db.meta.stripe.appliedReceipts, { evt_previous: receipt });
    const ledger = await c.store.stripeInbox.export(); assert.equal(ledger.length, 1); assert.equal(ledger[0].id, event.id);
  }));
});

async function instrumentPg(work, intercept) {
  const pg = require('../db/pg'), original = pg.createPool;
  pg.createPool = (url) => {
    const pool = original(url), connect = pool.connect.bind(pool);
    pool.connect = (callback) => callback ? connect(callback) : connect().then((client) => {
      const query = client.query.bind(client);
      client.query = (...args) => intercept(query, args);
      return client;
    }); return pool;
  };
  try { await work(() => { pg.createPool = original; }); } finally { pg.createPool = original; }
}
it('ordinary PostgreSQL work waits a normal writer prefix and flush/close await publication', { skip: !process.env.DATABASE_URL }, async () => {
  let armed = false, entered, release;
  const boundary = new Promise((resolve) => entered = resolve), delay = new Promise((resolve) => release = resolve);
  try {
    await instrumentPg(async (restore) => fixture('postgres', async (c) => {
      armed = true; c.db.suppliers[0].company = 'Prefix'; c.store.save(c.db);
      const pending = c.commit(stage(c.db)); await boundary;
      let flushed = false, closed = false; const flush = c.store.flush().then(() => { flushed = true; });
      const close = c.store.close().then(() => { closed = true; });
      await new Promise((resolve) => setTimeout(resolve, 20));
      assert.equal(flushed, false); assert.equal(closed, false); assert.equal(c.db.suppliers[0].stripeAccount.transfers, 'pending');
      release(); await pending; await flush; await close; restore(); await c.reopen();
      assert.equal(c.db.suppliers[0].company, 'Prefix'); assert.equal(c.db.notifications.length, 1);
      assert.equal(c.db.suppliers[0].stripeAccount.transfers, 'active');
    }), async (query, args) => {
      const result = await query(...args);
      if (armed && args[0] === 'commit') { armed = false; entered(); await delay; }
      return result;
    });
  } finally { release(); }
});
it('ordinary PostgreSQL lost COMMIT response blocks further writes and restart observes the durable outcome without a fake receipt', { skip: !process.env.DATABASE_URL }, async () => {
  let armed = false;
  await instrumentPg(async (restore) => fixture('postgres', async (c) => {
    armed = true;
    await assert.rejects(c.commit(stage(c.db)), /lost ordinary acknowledgement/);
    assert.equal(c.db.suppliers[0].stripeAccount.transfers, 'pending'); assert.equal(c.db.outbox.length, 0);
    assert.throws(() => c.store.save(c.db), /reconciliation/);
    await assert.rejects(c.commit(stage(c.db)), /reconciliation/); await assert.rejects(c.store.flush(), /reconciliation/);
    restore(); await c.reopen();
    assert.equal(c.db.suppliers[0].stripeAccount.transfers, 'active'); assert.equal(c.db.notifications.length, 1);
    assert.equal(c.db.outbox.length, 1); assert.equal(c.db.meta.stripe, undefined);
    assert.deepEqual(await c.store.stripeInbox.export(), []);
  }), async (query, args) => {
    const result = await query(...args);
    if (armed && args[0] === 'commit') { armed = false; throw new Error('lost ordinary acknowledgement'); }
    return result;
  });
});
