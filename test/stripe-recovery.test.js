const test = require('node:test');
const assert = require('node:assert/strict');
const atomic = require('../stripe-commit');
const createOperations = require('../stripe-operations');
function fixture(db = { stripeOperations: [] }, commit) {
  let clock = '2026-10-09T00:00:00Z';
  const ctx = { getDb: () => db, gate: atomic.createGate(), now: () => clock, commitStage: commit || (async ({ stage }) => { atomic.validate(db, stage); atomic.publish(db, stage); }) };
  return { db, ctx, operations: createOperations(ctx), age: () => { clock = '2026-10-10T00:00:00Z'; } };
}
const input = { kind: 'refund', logicalKey: 'refund:recovery', ownerId: 'buyer', amountMinor: 100, currency: 'eur', metadata: { chargeId: 'ch_original' } };
const adapter = (overrides = {}) => ({ type: 'refund', create: async () => { throw new Error('must not POST'); }, retrieve: async (id) => ({ id, amount: 100 }), list: async () => ({ data: [{ id: 're_original', amount: 100 }], has_more: false }), match: (r) => r.amount === 100, ...overrides });
test('T283c1 accepted timeout and restart beyond expiry finds one object without replay', async () => {
  const f = fixture(), op = await f.operations.reserve(input); let posts = 0;
  await assert.rejects(f.operations.resolve(op, adapter({ create: async () => { posts++; throw Object.assign(new Error('accepted timeout'), { code: 'ETIMEDOUT' }); } })), /timeout/);
  const restarted = fixture(structuredClone(f.db)); restarted.age(); const original = restarted.db.stripeOperations[0];
  const found = await restarted.operations.resolve(await restarted.operations.reserve(input), adapter());
  assert.equal(posts, 1); assert.equal(found.id, 're_original'); assert.equal(restarted.db.stripeOperations.length, 1);
  assert.equal(original.status, 'unknown'); assert.equal(original.providerRef, 're_original'); assert.equal(original.idempotencyKey, op.idempotencyKey);
});
test('T283c1 complete pagination, exact retrieved identity and bounded ambiguity checks', async () => {
  const f = fixture(), op = await f.operations.reserve(input); f.age(); let pages = [];
  const found = await f.operations.resolve(op, adapter({ list: async (page) => { pages.push(page); return page.starting_after ? { data: [{ id: 're_original', amount: 100 }], has_more: false } : { data: [{ id: 're_other', amount: 200 }], has_more: true }; } }));
  assert.equal(found.id, 're_original'); assert.equal(pages[1].starting_after, 're_other'); assert.equal(pages[0].limit, 100);
  for (const list of [async () => ({ data: [], has_more: false }), async () => ({ data: [{ id: 'one', amount: 100 }, { id: 'two', amount: 100 }], has_more: false }), async () => ({ data: [{ id: 'same', amount: 100 }], has_more: true }), async () => ({ data: [{ id: 'wrong', amount: 200 }], has_more: false }), async () => ({ data: [], has_more: 'false' })]) {
    const rejected = fixture(); const pending = await rejected.operations.reserve(input); rejected.age();
    await assert.rejects(rejected.operations.resolve(pending, adapter({ list })), /reconciliation/); assert.equal(rejected.db.stripeOperations[0].providerRef, null);
  }
  const bound = fixture(), pending = await bound.operations.reserve(input); bound.age(); let count = 0;
  await assert.rejects(bound.operations.resolve(pending, adapter({ list: async () => ({ data: [{ id: `r${++count}`, amount: 200 }], has_more: true }) })), /reconciliation/); assert.equal(count, 10);
  await assert.rejects(bound.operations.resolve(pending, adapter({ retrieve: async () => ({ id: 'different', amount: 100 }) })), /reconciliation/);
});
test('T283c1 known references never recreate on missing, mismatched or substituted provider object', async () => {
  for (const status of ['unknown', 'succeeded']) {
    const f = fixture(), op = await f.operations.reserve(input); await f.operations.outcome(op, { status, providerRef: 're_original' }); f.age();
    const known = await f.operations.reserve(input);
    await assert.rejects(f.operations.resolve(known, adapter({ retrieve: async () => ({ id: 're_other', amount: 100 }) })), /reconciliation/);
    await assert.rejects(f.operations.resolve(known, adapter({ retrieve: async () => ({ id: 're_original', amount: 200 }) })), /reconciliation/);
    await assert.rejects(f.operations.resolve(known, adapter({ retrieve: async () => { throw new Error('404 missing'); } })), /404/);
    assert.equal(f.db.stripeOperations[0].providerRef, 're_original');
  }
});
test('T283c1 missing/future times and legacy older frozen attempt refuse blind creation', async () => {
  for (const createdAt of [undefined, 'bad', '2027-01-01']) {
    const f = fixture(), op = await f.operations.reserve(input); op.createdAt = createdAt;
    await assert.rejects(f.operations.resolve(op, adapter()), /reconciliation/);
  }
  const f = fixture(), op = await f.operations.reserve(input);
  await assert.rejects(f.operations.resolve(op, adapter({ startedAt: '2020-01-01', list: async () => ({ data: [], has_more: false }) })), /reconciliation/);
});
for (const kind of ['json', 'postgres']) test(`T283c1 ${kind} first accepted-reference refusal survives restart beyond expiry and preserves existing histories`, { skip: kind === 'postgres' && !process.env.DATABASE_URL }, async () => {
  const fs = require('node:fs'), path = require('node:path'), os = require('node:os'), { openStore } = require('../store');
  const dir = fs.mkdtempSync(path.join(os.tmpdir(), 'stripe-recovery-')); let admin, url, schema, store;
  try {
    if (kind === 'postgres') { admin = new (require('pg').Client)({ connectionString: process.env.DATABASE_URL }); await admin.connect(); schema = `recovery_${process.pid}_${Date.now()}`; await admin.query(`create schema ${schema}`); const u = new URL(process.env.DATABASE_URL); u.searchParams.set('options', `-c search_path=${schema}`); url = u.toString(); }
    store = openStore({ kind, dataDir: dir, url }); store.loadSync();
    let db = { stripeOperations: [{ id: 'older', kind: 'refund', ownerId: 'earlier', amountMinor: 5, currency: 'eur', idempotencyKey: 'older-key', status: 'succeeded', providerRef: 're_older', createdAt: '2026-09-01' }], meta: {} }; store.save(db); await store.flush();
    let fail = false; const f = fixture(db, async (stage) => { if (fail && kind === 'json') fs.mkdirSync(path.join(dir, 'db.json.tmp')); return store.commitStage(stage); });
    const op = await f.operations.reserve(input); fail = true;
    if (kind === 'postgres') await admin.query(`create function ${schema}.refuse_op() returns trigger language plpgsql as $$ begin if new.collection='stripeOperations' and new.key<>'older' then raise exception 'injected reference refusal'; end if; return new; end $$; create trigger refuse_op before update on ${schema}.records for each row execute function ${schema}.refuse_op()`);
    let posts = 0; await assert.rejects(f.operations.resolve(op, adapter({ create: async () => { posts++; return { id: 're_original', amount: 100 }; } })));
    assert.equal(db.stripeOperations.find((row) => row.id === op.id).status, 'pending'); assert.equal(db.stripeOperations.find((row) => row.id === op.id).providerRef, null);
    if (kind === 'postgres') await admin.query(`drop trigger refuse_op on ${schema}.records`); else fs.rmSync(path.join(dir, 'db.json.tmp'), { recursive: true, force: true });
    store = openStore({ kind, dataDir: dir, url }); db = store.loadSync();
    const restarted = fixture(db, (stage) => store.commitStage(stage)); restarted.age();
    await restarted.operations.resolve(await restarted.operations.reserve(input), adapter());
    assert.equal(posts, 1); assert.equal(db.stripeOperations.length, 2); assert.equal(db.stripeOperations.find((row) => row.id === 'older').providerRef, 're_older'); assert.equal(db.stripeOperations.find((row) => row.id === op.id).providerRef, 're_original');
  } finally { if (schema) await admin.query(`drop schema ${schema} cascade`); await admin?.end(); fs.rmSync(dir, { recursive: true, force: true }); }
});
test('T283c1 indistinguishable unresolved operations and already-associated refs require reconciliation', async () => {
  const f = fixture(), first = await f.operations.reserve(input);
  const second = await f.operations.reserve({ ...input, logicalKey: 'refund:another-request' }); f.age();
  await assert.rejects(f.operations.resolve(first, adapter()), /reconciliation/);
  await f.operations.outcome(second, { status: 'unknown', providerRef: 're_original' });
  await assert.rejects(f.operations.resolve(first, adapter()), /reconciliation/);
  assert.equal(f.db.stripeOperations.find((row) => row.id === first.id).providerRef, null);
});
test('T283c1 gated reference publication refuses changed refs and concurrent foreign association', async () => {
  for (const foreign of [false, true]) {
    const f = fixture(), first = await f.operations.reserve(input); f.age();
    const second = foreign ? await f.operations.reserve({ ...input, logicalKey: 'refund:foreign', amountMinor: 200 }) : first;
    await assert.rejects(f.operations.resolve(first, adapter({ retrieve: async (id) => {
      await f.operations.outcome(second, { status: 'unknown', providerRef: foreign ? id : 're_other', providerType: 'refund' });
      return { id, amount: 100 };
    } })), /reconciliation/);
    assert.equal(f.db.stripeOperations.find((row) => row.id === first.id).providerRef, foreign ? null : 're_other');
  }
});
