const test = require('node:test');
const assert = require('node:assert/strict');
const fs = require('node:fs'), path = require('node:path'), os = require('node:os');
const { promisify } = require('node:util'), execFile = promisify(require('node:child_process').execFile);
const { openStore } = require('../store');
const atomic = require('../stripe-commit');
let serial = 0;
const operation = () => ({ id: 'operation-one', logicalKeyHash: 'logical-hash', idempotencyKey: 'stable-key', kind: 'refund', ownerId: 'buyer', amountMinor: 100, currency: 'eur', metadata: { invoiceId: 'invoice', paymentId: 'payment' }, status: 'unknown', providerRef: 're_original', providerType: 'refund', createdAt: '2026-10-09T00:00:00Z', updatedAt: '2026-10-10T00:00:00Z', attempts: 2 });
const mutations = [
  (db) => { db.stripeOperations = []; }, (db) => { delete db.stripeOperations; },
  ...['id', 'logicalKeyHash', 'idempotencyKey', 'kind', 'ownerId', 'amountMinor', 'currency', 'metadata', 'createdAt', 'providerRef', 'providerType'].map((field) => (db) => { db.stripeOperations[0][field] = field === 'amountMinor' ? 200 : field === 'metadata' ? { changed: true } : 'changed'; }),
  (db) => { db.stripeOperations[0].providerRef = null; }, (db) => { delete db.stripeOperations[0].providerType; },
  (db) => { db.stripeOperations[0].status = 'failed'; }, (db) => { db.stripeOperations[0].attempts = 1; },
  (db) => { db.stripeOperations.push(structuredClone(db.stripeOperations[0])); },
];
async function fixture(kind, work) {
  const dir = fs.mkdtempSync(path.join(os.tmpdir(), 'operation-retention-')); let admin, schema, url, store;
  try {
    if (kind === 'postgres') { admin = new (require('pg').Client)({ connectionString: process.env.DATABASE_URL }); await admin.connect(); schema = `retention_${process.pid}_${++serial}`; await admin.query(`create schema ${schema}`); const u = new URL(process.env.DATABASE_URL); u.searchParams.set('options', `-c search_path=${schema}`); url = u.toString(); }
    const open = () => openStore({ kind, dataDir: dir, url }); store = open(); store.loadSync();
    let db = { users: [], meta: {}, settings: { unrelated: 'original' }, notifications: [], stripeOperations: [operation()], stripeFinancialRecords: [{ id: 'financial-one', operationId: 'operation-one', providerRef: 're_original', amountMinor: 100 }] };
    store.save(db); await store.flush();
    await work({ dir, admin, schema, url, get db() { return db; }, get store() { return store; }, async reopen() { await store.close?.(); store = open(); db = store.loadSync(); } });
  } finally { await store?.close?.(); if (schema) await admin.query(`drop schema ${schema} cascade`); await admin?.end(); fs.rmSync(dir, { recursive: true, force: true }); }
}
test('T283c3 shared backup retention refuses lost identities/refs/outcomes and duplicate IDs', () => {
  const previous = { stripeOperations: [operation()] };
  for (const mutate of mutations) { const incoming = structuredClone(previous); mutate(incoming); assert.throws(() => atomic.backup(previous, incoming, []), /Stripe operation/); }
  const next = structuredClone(previous); next.stripeOperations[0].status = 'succeeded'; next.stripeOperations[0].attempts = 3;
  assert.equal(atomic.backup(previous, next, []).data.stripeOperations[0].idempotencyKey, 'stable-key');
  const failed = structuredClone(previous); failed.stripeOperations[0].status = 'failed'; failed.stripeOperations[0].providerRef = null; failed.stripeOperations[0].providerType = null;
  atomic.retain(failed, previous);
});
for (const kind of ['json', 'postgres']) {
  const opts = { skip: kind === 'postgres' && !process.env.DATABASE_URL };
  test(`T283c3 ${kind} strict refusal and backup import retain operations/history and rollback unrelated effects`, opts, async () => fixture(kind, async (f) => {
    const event = { id: 'evt_retained', type: 'test.retention', kind: 'snapshot', livemode: false, handledAt: '2026-10-10T00:00:00Z' };
    await f.store.stripeInbox.receive({ ...event, state: 'received' });
    await f.store.commitStripe({ getDb: () => f.db, event, stage: atomic.createStage() });
    const receipt = structuredClone(f.db.meta.stripe.appliedReceipts.evt_retained);
    for (const fields of [{ metadata: { changed: true } }, { providerRef: null }, { status: 'failed' }, { attempts: 1 }]) {
      const stage = atomic.createStage(); stage.patch('stripeOperations', 'operation-one', fields); stage.add('notifications', { id: 'must-not-publish', text: 'No' });
      await assert.rejects(f.store.commitStage({ getDb: () => f.db, stage }), /Stripe operation/);
      assert.equal(f.db.notifications.length, 0); assert.equal(f.db.stripeOperations[0].providerRef, 're_original'); assert.equal(f.db.stripeOperations[0].status, 'unknown'); assert.deepEqual(f.db.meta.stripe.appliedReceipts.evt_retained, receipt);
    }
    const success = atomic.createStage(); success.patch('stripeOperations', 'operation-one', { status: 'succeeded', attempts: 3 }); success.add('notifications', { id: 'linked-notice', text: 'Settled' });
    if (kind === 'json') fs.mkdirSync(path.join(f.dir, 'db.json.tmp'));
    else await f.admin.query(`create function ${f.schema}.refuse_notice() returns trigger language plpgsql as $$ begin if new.collection='notifications' then raise exception 'injected retention constraint'; end if; return new; end $$; create trigger refuse_notice before insert on ${f.schema}.records for each row execute function ${f.schema}.refuse_notice()`);
    await assert.rejects(f.store.commitStage({ getDb: () => f.db, stage: success }));
    assert.equal(f.db.stripeOperations[0].status, 'unknown'); assert.equal(f.db.stripeOperations[0].attempts, 2); assert.deepEqual(f.db.notifications, []); assert.deepEqual(f.db.meta.stripe.appliedReceipts.evt_retained, receipt);
    if (kind === 'json') fs.rmSync(path.join(f.dir, 'db.json.tmp'), { recursive: true });
    else await f.admin.query(`drop trigger refuse_notice on ${f.schema}.records`);
    for (const mutate of mutations) {
      const incoming = structuredClone(f.db); mutate(incoming); incoming.settings.unrelated = 'must-not-publish'; let published = false;
      await assert.rejects(f.store.importBackup({ data: incoming, inbox: [], getDb: () => f.db, publish: () => { published = true; } }), /Stripe operation/);
      assert.equal(published, false); assert.equal(f.db.settings.unrelated, 'original'); assert.deepEqual(f.db.meta.stripe.appliedReceipts.evt_retained, receipt);
    }
    await f.reopen(); assert.equal(f.db.stripeFinancialRecords[0].providerRef, 're_original'); assert.equal(f.db.stripeOperations[0].idempotencyKey, 'stable-key');
    await f.store.commitStage({ getDb: () => f.db, stage: success }); assert.equal(f.db.notifications[0].id, 'linked-notice');
    const allowed = structuredClone(f.db); allowed.stripeOperations[0].status = 'succeeded'; allowed.stripeOperations[0].attempts = 3;
    await f.store.importBackup({ data: allowed, inbox: [], getDb: () => f.db, publish: (data) => Object.assign(f.db, data) });
    await f.reopen(); assert.equal(f.db.stripeOperations[0].status, 'succeeded'); assert.equal(f.db.stripeOperations[0].attempts, 3); assert.deepEqual(f.db.meta.stripe.appliedReceipts.evt_retained, receipt);
  }));
  test(`T283c3 ${kind} ordinary save preserves known operations and supports status progression`, opts, async () => fixture(kind, async (f) => {
    f.db.stripeOperations[0].providerRef = 're_changed'; f.db.settings.unrelated = 'updated';
    if (kind === 'json') { assert.throws(() => f.store.save(f.db), /Stripe operation/); f.db.stripeOperations[0].providerRef = 're_original'; }
    else { f.store.save(f.db); await assert.rejects(f.store.flush(), /database refused/); assert.equal(f.db.stripeOperations[0].providerRef, 're_original', 'native refusal restores memory'); }
    f.db.stripeOperations[0].status = 'succeeded'; f.db.stripeOperations[0].attempts = 3; f.store.save(f.db); await f.store.flush();
    await f.reopen(); assert.equal(f.db.stripeOperations[0].status, 'succeeded'); assert.equal(f.db.stripeOperations[0].providerRef, 're_original'); assert.equal(f.db.settings.unrelated, 'updated');
    f.db.stripeOperations = [];
    if (kind === 'json') assert.throws(() => f.store.save(f.db), /Stripe operation/);
    else { f.store.save(f.db); await assert.rejects(f.store.flush(), /database refused/); assert.equal(f.db.stripeOperations[0].status, 'succeeded'); }
  }));
}
test('T283c3 native operation SQL guards identity/key/collection/deletion but allow position-only order', { skip: !process.env.DATABASE_URL }, async () => fixture('postgres', async (f) => {
  const table = `${f.schema}.records`;
  for (const fields of [{ metadata: { changed: true } }, { status: 'failed' }, { attempts: -1 }, { attempts: '3' }, { attempts: 9007199254740992 }, { providerRef: null }, { providerType: 'other' }]) await assert.rejects(f.admin.query(`update ${table} set data=data || $1::jsonb where collection='stripeOperations'`, [JSON.stringify(fields)]), /Stripe operation/);
  await assert.rejects(f.admin.query(`update ${table} set key='changed' where collection='stripeOperations'`), /Stripe operation/);
  await assert.rejects(f.admin.query(`update ${table} set collection='other' where collection='stripeOperations'`), /Stripe operation/);
  await assert.rejects(f.admin.query(`update ${table} set collection='stripeOperations' where collection='stripeFinancialRecords'`), /Stripe/);
  await assert.rejects(f.admin.query(`delete from ${table} where collection='stripeOperations'`), /Stripe operation/);
  await f.admin.query(`update ${table} set pos=pos+1 where collection='stripeOperations'`);
  await f.admin.query('begin'); await f.admin.query("set local craftcrew.replace_all='on'"); await f.admin.query(`delete from ${table} where collection='stripeOperations'`); await f.admin.query('rollback');
  assert.equal((await f.admin.query(`select count(*) from ${table} where collection='stripeOperations'`)).rows[0].count, '1');
}));
test('T283c3 PostgreSQL CLI replace cannot discard known operation history and permits verified retained import', { skip: !process.env.DATABASE_URL }, async () => fixture('postgres', async (f) => {
  const file = path.join(f.dir, 'import.json'), env = { ...process.env, DATABASE_URL: f.url };
  const incoming = structuredClone(f.db); incoming.stripeOperations = []; fs.writeFileSync(file, JSON.stringify(incoming));
  await assert.rejects(execFile(process.execPath, [path.join(__dirname, '../tools/db/import-json.js'), file, '--replace'], { env }), (error) => error.code !== 0 && /Stripe operation/.test(error.stderr));
  assert.equal((await f.admin.query(`select data->>'providerRef' as ref from ${f.schema}.records where collection='stripeOperations'`)).rows[0].ref, 're_original');
  const allowed = structuredClone(f.db); allowed.stripeOperations[0].status = 'succeeded'; allowed.stripeOperations[0].attempts = 3; fs.writeFileSync(file, JSON.stringify(allowed));
  const result = await execFile(process.execPath, [path.join(__dirname, '../tools/db/import-json.js'), file, '--replace'], { env }); assert.match(result.stdout, /Imported/);
  await f.reopen(); assert.equal(f.db.stripeOperations[0].providerRef, 're_original'); assert.equal(f.db.stripeOperations[0].status, 'succeeded');
}));
