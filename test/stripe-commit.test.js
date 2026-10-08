const { describe, it } = require('node:test');
const assert = require('node:assert/strict');
const fs = require('node:fs');
const os = require('node:os');
const path = require('node:path');
const { openStore } = require('../store');
const { createStage, createGate } = require('../stripe-commit');
let serial = 0;
const event = (id = 'evt_atomic') => ({ id, type: 'test.atomic', kind: 'snapshot', livemode: false, state: 'processing', attempts: 1 });
const stage = () => {
  const s = createStage();
  s.patch('suppliers', 's1', { stripeAccount: { id: 'acct_one', transfers: 'active' } }, { stripeAccount: { id: 'acct_one', transfers: 'pending' } });
  s.add('notifications', { id: 'notice_one', text: 'Active' });
  s.add('outbox', { id: 'mail_one', status: 'Queued' });
  return s;
};
async function fixture(kind, work) {
  const dataDir = fs.mkdtempSync(path.join(os.tmpdir(), 'craftcrew-atomic-'));
  let admin, schema, url, store;
  try {
    if (kind === 'postgres') {
      admin = new (require('pg').Client)({ connectionString: process.env.DATABASE_URL }); await admin.connect();
      schema = `atomic_${process.pid}_${++serial}`; await admin.query(`create schema ${schema}`);
      const u = new URL(process.env.DATABASE_URL); u.searchParams.set('options', `-c search_path=${schema}`); url = u.toString();
    }
    const open = () => openStore({ kind, dataDir, url }); store = open(); store.loadSync();
    let db = { meta: {}, suppliers: [{ id: 's1', company: 'Before', stripeAccount: { id: 'acct_one', transfers: 'pending' } }], notifications: [], outbox: [{ id: 'existing_mail', status: 'Queued' }] };
    store.save(db); await store.flush(); await store.stripeInbox.receive(event());
    await work({ kind, dataDir, admin, schema, get store() { return store; }, get db() { return db; },
      commit(s = stage(), e = event()) { return store.commitStripe({ getDb: () => db, stage: s, event: e }); },
      async reopen() { await store.close?.().catch((e) => { if (!/reconciliation/.test(e.message)) throw e; }); store = open(); db = store.loadSync(); },
    });
  } finally { await store?.close?.().catch((e) => { if (!/reconciliation/.test(e.message)) throw e; }); if (schema) await admin.query(`drop schema ${schema} cascade`); await admin?.end(); fs.rmSync(dataDir, { recursive: true, force: true }); }
}
for (const kind of ['json', 'postgres']) describe(`atomic Stripe store (${kind})`, { skip: kind === 'postgres' && !process.env.DATABASE_URL }, () => {
  it('commits effects and receipt together, retains receipt through normal saves and skips duplicate publication', async () => fixture(kind, async (c) => {
    const original = c.db.suppliers[0];
    const reordered = stage(); reordered.patches[0].expected.stripeAccount = { transfers: 'pending', id: 'acct_one' };
    assert.equal((await c.commit(reordered)).applied, true); assert.equal(c.db.suppliers[0], original);
    c.db.suppliers[0].company = 'After'; c.store.save(c.db); await c.store.flush();
    await c.reopen(); assert.equal(c.db.suppliers[0].stripeAccount.transfers, 'active');
    assert.equal(c.db.notifications.length, 1); assert.equal(c.db.outbox.length, 2);
    assert.equal(c.db.meta.stripe.appliedReceipts.evt_atomic.type, 'test.atomic');
    assert.equal((await c.commit()).applied, false); assert.equal(c.db.notifications.length, 1);
    await assert.rejects(c.commit(stage(), { ...event(), type: 'other' }), /identity mismatch/);
  }));
  it('rejects stale account identity and duplicate addition IDs without partial publication', async () => fixture(kind, async (c) => {
    c.db.suppliers[0].stripeAccount.id = 'acct_changed';
    await assert.rejects(c.commit(), /conflict/); assert.equal(c.db.notifications.length, 0);
    c.db.suppliers[0].stripeAccount.id = 'acct_one';
    const s = stage(); s.add('outbox', { id: 'existing_mail' });
    await assert.rejects(c.commit(s), /Duplicate/); assert.equal(c.db.suppliers[0].stripeAccount.transfers, 'pending');
  }));
  it('storage refusal leaves supplier, notification, mail and receipt unapplied', async () => fixture(kind, async (c) => {
    if (kind === 'json') fs.mkdirSync(path.join(c.dataDir, 'db.json.tmp'));
    else {
      await c.admin.query(`create function ${c.schema}.refuse_notice() returns trigger language plpgsql as $$ begin if new.collection='notifications' then raise exception 'rejected'; end if; return new; end $$`);
      await c.admin.query(`create trigger refuse_notice before insert or update on ${c.schema}.records for each row execute function ${c.schema}.refuse_notice()`);
    }
    await assert.rejects(c.commit());
    assert.equal(c.db.suppliers[0].stripeAccount.transfers, 'pending'); assert.equal(c.db.notifications.length, 0); assert.equal(c.db.outbox.length, 1);
    if (kind === 'json') fs.rmdirSync(path.join(c.dataDir, 'db.json.tmp'));
    await c.reopen(); assert.equal(c.db.suppliers[0].stripeAccount.transfers, 'pending'); assert.equal(c.db.meta.stripe, undefined);
    assert.equal((await c.store.stripeInbox.get(event().id)).state, 'processing');
  }));
  it('a later strict commit cannot drop or change an earlier applied receipt', async () => fixture(kind, async (c) => {
    await c.commit(); const prior = c.db.meta.stripe.appliedReceipts.evt_atomic;
    const next = event('evt_next'); await c.store.stripeInbox.receive(next);
    delete c.db.meta.stripe.appliedReceipts.evt_atomic;
    await assert.rejects(c.commit(createStage(), next), /cannot be removed/);
    c.db.meta.stripe.appliedReceipts.evt_atomic = { ...prior, handledAt: '2020-01-01T00:00:00.000Z' };
    await assert.rejects(c.commit(createStage(), next), /cannot be removed/);
    c.db.meta.stripe.appliedReceipts.evt_atomic = prior;
    assert.equal((await c.commit(createStage(), next)).applied, true);
    await c.reopen(); assert.equal(c.db.meta.stripe.appliedReceipts.evt_atomic.handledAt, prior.handledAt);
  }));
  it('requires explicit valid type, kind and environment identity', async () => fixture(kind, async (c) => {
    for (const patch of [{ type: '' }, { type: 'different.type' }, { kind: undefined }, { kind: 'bogus' }, { kind: 'thin' }, { livemode: undefined }, { livemode: true }])
      await assert.rejects(c.commit(stage(), { ...event(), ...patch }));
    assert.equal(c.db.notifications.length, 0); assert.equal(c.db.suppliers[0].stripeAccount.transfers, 'pending');
  }));
});
it('mutation gate waits, survives rejection and runs later work in order', async () => {
  const gate = createGate(), calls = []; let release;
  const first = gate.run(async () => { await new Promise((r) => release = r); calls.push(1); throw new Error('failed'); });
  const second = gate.run(() => calls.push(2)); await Promise.resolve(); assert.deepEqual(calls, []);
  release(); await assert.rejects(first); await second; assert.deepEqual(calls, [1, 2]);
});
it('JSON retries directory durability only; an unresolved rename blocks later ordinary saves', async () => fixture('json', async (c) => {
  const original = fs.fsyncSync; let failures = 0;
  fs.fsyncSync = (fd) => { if (fs.fstatSync(fd).isDirectory()) { failures++; throw new Error('directory unavailable'); } return original(fd); };
  try { await assert.rejects(c.commit()); assert.equal(failures, 2); assert.throws(() => c.store.save(c.db), /reconciliation/); await assert.rejects(c.commit(), /reconciliation/); await assert.rejects(c.store.flush(), /reconciliation/); }
  finally { fs.fsyncSync = original; }
  assert.equal(c.db.notifications.length, 0);
  await c.reopen(); assert.equal(c.db.notifications.length, 1); assert.equal((await c.commit()).applied, false);
}));
it('JSON normal saves refuse removed receipts', async () => fixture('json', async (c) => {
  await c.commit(); const old = c.db.meta; c.db.meta = {};
  assert.throws(() => c.store.save(c.db), /cannot be removed/); c.db.meta = old;
}));
it('JSON recovers a transient directory fsync failure without rerunning a stage', async () => fixture('json', async (c) => {
  const original = fs.fsyncSync; let directoryCalls = 0;
  fs.fsyncSync = (fd) => { if (fs.fstatSync(fd).isDirectory() && ++directoryCalls === 1) throw new Error('transient'); return original(fd); };
  try { assert.equal((await c.commit()).applied, true); assert.equal(directoryCalls, 2); }
  finally { fs.fsyncSync = original; }
  assert.equal(c.db.notifications.length, 1); await c.reopen(); assert.equal((await c.commit()).applied, false);
}));
async function pausedWrite(work, predicate = (args) => String(args[0]).includes('insert into records') && args[1]?.[0]?.includes('notifications'), failure = false) {
  const pg = require('../db/pg'), original = pg.createPool; let release, entered, paused = false;
  const boundary = new Promise((r) => entered = r), delay = new Promise((r) => release = r);
  pg.createPool = (url) => {
    const pool = original(url), connect = pool.connect.bind(pool);
    pool.connect = (callback) => callback ? connect(callback) : connect().then((client) => {
      const query = client.query.bind(client);
      client.query = async (...args) => {
        if (!paused && predicate(args)) {
          paused = true; entered(); await delay;
          if (failure) throw Object.assign(new Error('writer unavailable'), { code: '08006' });
        }
        return query(...args);
      }; return client;
    }); return pool;
  };
  try { await work(boundary, release); } finally { release(); pg.createPool = original; }
}
it('PostgreSQL strict writes preserve unrelated updates and SMTP state; flush waits for publication', { skip: !process.env.DATABASE_URL }, async () => pausedWrite(async (boundary, release) => fixture('postgres', async (c) => {
  const committed = c.commit(); await boundary;
  c.db.suppliers[0].company = 'Concurrent'; c.db.outbox[0].status = 'Sent'; c.store.save(c.db);
  const flushed = c.store.flush(); release(); await flushed; await committed; assert.equal(c.db.notifications.length, 1);
  await c.reopen(); assert.equal(c.db.suppliers[0].company, 'Concurrent'); assert.equal(c.db.outbox.find((m) => m.id === 'existing_mail').status, 'Sent');
})));
it('PostgreSQL same-field changes during staging abort the strict transaction', { skip: !process.env.DATABASE_URL }, async () => pausedWrite(async (boundary, release) => fixture('postgres', async (c) => {
  const committing = c.commit(); await boundary; c.db.suppliers[0].stripeAccount.id = 'acct_new'; release();
  await assert.rejects(committing, /conflict/); assert.equal(c.db.notifications.length, 0);
  await c.reopen(); assert.equal(c.db.suppliers[0].stripeAccount.id, 'acct_one'); assert.equal(c.db.notifications.length, 0);
})));
it('PostgreSQL requires the matching inbox identity in the same transaction', { skip: !process.env.DATABASE_URL }, async () => fixture('postgres', async (c) => {
  await c.admin.query(`delete from ${c.schema}.stripe_webhook_inbox`);
  await assert.rejects(c.commit(), /identity missing/); assert.equal(c.db.notifications.length, 0);
  await c.store.stripeInbox.receive({ ...event(), kind: 'thin' });
  await assert.rejects(c.commit(), /identity missing/); await c.reopen(); assert.equal(c.db.notifications.length, 0);
}));
for (const unresolved of [false, true, 'absent']) it(`PostgreSQL lost COMMIT response ${unresolved ? 'blocks unknown outcomes ' + unresolved : 'resolves using a fresh receipt read'}`, { skip: !process.env.DATABASE_URL }, async () => {
  const pg = require('../db/pg'), original = pg.createPool;
  pg.createPool = (url) => {
    const pool = original(url), connect = pool.connect.bind(pool);
    let lost = false;
    pool.query = async (...args) => {
      if (lost && unresolved === true) throw new Error('resolution unavailable');
      if (lost && unresolved === 'absent') return { rows: [] };
      const client = await connect(); try { return await client.query(...args); } finally { client.release(); }
    };
    pool.connect = async () => {
      const client = await connect(), run = client.query.bind(client); let strictCommit = false;
      client.query = async (...args) => {
        if (String(args[0]).startsWith('update stripe_webhook_inbox')) strictCommit = true;
        const result = await run(...args);
        if (args[0] === 'commit' && strictCommit && !lost) { lost = true; throw new Error('lost acknowledgement'); }
        return result;
      };
      return client;
    };
    return pool;
  };
  try {
    await fixture('postgres', async (c) => {
      if (unresolved) {
        await assert.rejects(c.commit(), /resolution unavailable|lost acknowledgement/); assert.equal(c.db.notifications.length, 0);
        assert.throws(() => c.store.save(c.db), /reconciliation/); await assert.rejects(c.commit(), /reconciliation/);
        await assert.rejects(c.store.flush(), /reconciliation/);
      } else { assert.equal((await c.commit()).applied, true); assert.equal(c.db.notifications.length, 1); }
      pg.createPool = original;
      await c.reopen(); assert.equal(c.db.notifications.length, 1); assert.equal((await c.commit()).applied, false);
    });
  } finally { pg.createPool = original; }
});
it('a failed normal prefix rejects queued strict work and shutdown cancels its retry', { skip: !process.env.DATABASE_URL }, async () => {
  const timers = new Set(), schedule = global.setTimeout, cancel = global.clearTimeout;
  global.setTimeout = (fn, ms, ...args) => { const timer = schedule(fn, ms, ...args); if (ms === 5000) timers.add(timer); return timer; };
  global.clearTimeout = (timer) => { timers.delete(timer); return cancel(timer); };
  try { await pausedWrite(async (boundary, release) => fixture('postgres', async (c) => {
    c.db.suppliers[0].company = 'Fail before strict'; c.store.save(c.db);
    const normal = c.store.flush().catch((e) => e);
    const strict = assert.rejects(c.commit(), /writer unavailable/); await boundary;
    const closing = assert.rejects(c.store.close(), /writer unavailable/); release();
    await strict; await closing; assert.equal((await normal).code, '08006'); assert.equal(timers.size, 0);
  }), (args) => String(args[0]).includes('insert into records') && args[1]?.[3]?.some((text) => text.includes('Fail before strict')), true); }
  finally { global.setTimeout = schedule; global.clearTimeout = cancel; for (const timer of timers) cancel(timer); }
});
it('the shared gate protects affected fields during COMMIT await and close waits strict publication', { skip: !process.env.DATABASE_URL }, async () => {
  const pg = require('../db/pg'), original = pg.createPool; let release, entered;
  const boundary = new Promise((r) => entered = r), delay = new Promise((r) => release = r);
  pg.createPool = (url) => {
    const pool = original(url), connect = pool.connect.bind(pool);
    pool.connect = (callback) => callback ? connect(callback) : connect().then((client) => {
      const query = client.query.bind(client); let strict = false;
      client.query = async (...args) => {
        if (String(args[0]).startsWith('update stripe_webhook_inbox')) strict = true;
        const result = await query(...args);
        if (args[0] === 'commit' && strict) { entered(); await delay; }
        return result;
      }; return client;
    }); return pool;
  };
  try { await fixture('postgres', async (c) => {
    const gate = createGate(), committing = gate.run(() => c.commit()); await boundary;
    let changed = false, closed = false;
    const next = gate.run(() => { c.db.suppliers[0].stripeAccount.id = 'acct_later'; changed = true; });
    const closing = c.store.close().then(() => { closed = true; });
    await new Promise((r) => setTimeout(r, 20)); assert.equal(changed, false); assert.equal(closed, false);
    release(); await committing; await next; await closing;
    assert.equal(c.db.suppliers[0].stripeAccount.id, 'acct_later'); assert.equal(c.db.notifications.length, 1);
    pg.createPool = original; await c.reopen(); assert.equal(c.db.notifications.length, 1);
  }); } finally { release(); pg.createPool = original; }
});
