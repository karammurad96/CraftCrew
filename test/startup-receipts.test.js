const { describe, it } = require('node:test');
const assert = require('node:assert/strict');
const fs = require('node:fs');
const os = require('node:os');
const path = require('node:path');
const { spawn, execFileSync } = require('node:child_process');
const { openStore } = require('../store');
const { createStage, receipt } = require('../stripe-commit');
const ROOT = path.join(__dirname, '..'); let serial = 0;
const event = (id) => ({ id, type: 'test.backup', kind: 'snapshot', livemode: false, state: 'processing', attempts: 1 });
async function fixture(kind, work) {
  const dir = fs.mkdtempSync(path.join(os.tmpdir(), 'craftcrew-startup-')); let admin, schema, url, store;
  try {
    if (kind === 'postgres') {
      admin = new (require('pg').Client)({ connectionString: process.env.DATABASE_URL }); await admin.connect();
      schema = `startup_${process.pid}_${++serial}`; await admin.query(`create schema ${schema}`);
      const parsed = new URL(process.env.DATABASE_URL); parsed.searchParams.set('options', `-c search_path=${schema}`); url = parsed.toString();
    }
    const open = () => openStore({ kind, dataDir: dir, url }); store = open(); store.loadSync();
    let db = { users: [], meta: {}, suppliers: [{ id: 's1', company: 'Original' }], notifications: [], outbox: [] };
    store.save(db); await store.flush();
    await store.stripeInbox.receive(event('evt_first')); const s = createStage(); s.add('notifications', { id: 'first_notice' });
    await store.commitStripe({ getDb: () => db, event: event('evt_first'), stage: s });
    await work({ kind, dir, admin, schema, url, get db() { return db; }, get store() { return store; },
      async replacement() { const data = structuredClone(db), records = await store.stripeInbox.export(), next = event('evt_imported');
        data.suppliers[0].company = 'Imported'; data.meta.stripe.appliedReceipts[next.id] = receipt(next);
        data.notifications.unshift({ id: 'imported_notice' }); return { data, records: [...records, { ...next, state: 'handled' }] }; },
      restore(input) { return store.importBackup({ getDb: () => db, data: input.data, inbox: input.records, publish: (next) => { db = next; } }); },
      async reopen() { await store.close?.().catch((e) => { if (!/reconciliation/.test(e.message)) throw e; }); store = open(); db = store.loadSync(); },
    });
  } finally { await store?.close?.().catch((e) => { if (!/reconciliation/.test(e.message)) throw e; }); if (schema) await admin.query(`drop schema ${schema} cascade`); await admin?.end(); fs.rmSync(dir, { recursive: true, force: true }); }
}
for (const kind of ['json', 'postgres']) describe(`receipt-consistent replacement (${kind})`, { skip: kind === 'postgres' && !process.env.DATABASE_URL }, () => {
  it('retains receipts and matching ledger state across replacement/restart', async () => fixture(kind, async (c) => {
    await c.restore(await c.replacement()); await c.reopen(); assert.equal(c.db.suppliers[0].company, 'Imported');
    assert.equal(Object.keys(c.db.meta.stripe.appliedReceipts).length, 2);
    assert.equal((await c.store.stripeInbox.get('evt_first')).state, 'handled');
    assert.equal((await c.store.stripeInbox.get('evt_imported')).state, 'handled');
  }));
  it('refuses missing/conflicting receipts before either business or ledger changes', async () => fixture(kind, async (c) => {
    const input = await c.replacement(); delete input.data.meta.stripe.appliedReceipts.evt_first;
    await assert.rejects(c.restore(input), /cannot be removed/);
    assert.equal(c.db.suppliers[0].company, 'Original'); assert.equal(await c.store.stripeInbox.get('evt_imported'), null);
    const conflict = await c.replacement(); conflict.records.find((r) => r.id === 'evt_imported').type = 'conflicting.type';
    await assert.rejects(c.restore(conflict), /identity mismatch/); assert.equal(await c.store.stripeInbox.get('evt_imported'), null);
  }));
  it('actual storage rejection rolls back imported identities and business records together', async () => fixture(kind, async (c) => {
    if (kind === 'json') fs.mkdirSync(path.join(c.dir, 'db.json.tmp'));
    else {
      await c.admin.query(`create function ${c.schema}.reject_import() returns trigger language plpgsql as $$ begin if new.collection='suppliers' and new.data->>'company'='Imported' then raise exception 'refused'; end if; return new; end $$`);
      await c.admin.query(`create trigger reject_import before insert or update on ${c.schema}.records for each row execute function ${c.schema}.reject_import()`);
    }
    await assert.rejects(c.restore(await c.replacement())); assert.equal(c.db.suppliers[0].company, 'Original');
    assert.equal(await c.store.stripeInbox.get('evt_imported'), null);
    if (kind === 'json') fs.rmdirSync(path.join(c.dir, 'db.json.tmp'));
    await c.reopen(); assert.equal(c.db.suppliers[0].company, 'Original'); assert.equal(c.db.notifications.length, 1);
  }));
});
it('JSON failed sidecar hydration blocks writes and recovers the complete embedded import', async () => fixture('json', async (c) => {
  const temp = path.join(c.dir, 'stripe-webhooks', require('crypto').createHash('sha256').update('evt_imported').digest('hex') + '.json.tmp');
  fs.mkdirSync(temp); await assert.rejects(c.restore(await c.replacement()));
  assert.equal(c.db.suppliers[0].company, 'Original'); assert.throws(() => c.store.save(c.db), /reconciliation/);
  await assert.rejects(c.store.flush(), /reconciliation/); fs.rmdirSync(temp); await c.reopen();
  assert.equal(c.db.suppliers[0].company, 'Imported'); assert.equal((await c.store.stripeInbox.get('evt_imported')).state, 'handled');
}));
async function until(query) {
  const deadline = Date.now() + 10000;
  while (Date.now() < deadline) { if (await query()) return; await new Promise((r) => setTimeout(r, 20)); }
  throw new Error('Expected PostgreSQL barrier was not reached');
}
it('startup waits for an actual pending COMMIT, then its normal save preserves fresh effects and receipts', { skip: !process.env.DATABASE_URL }, async () => fixture('postgres', async (c) => {
  const control = 1000000 + process.pid * 10 + serial; let child;
  await c.admin.query('select pg_advisory_lock($1)', [control]);
  await c.admin.query(`create function ${c.schema}.hold_commit() returns trigger language plpgsql as $$ begin if new.name='meta' and new.data->'stripe'->'appliedReceipts' ? 'evt_pending' then perform pg_advisory_xact_lock(${control}); end if; return new; end $$`);
  await c.admin.query(`create constraint trigger hold_commit after insert or update on ${c.schema}.kv deferrable initially deferred for each row execute function ${c.schema}.hold_commit()`);
  const next = event('evt_pending'), stage = createStage(); stage.patch('suppliers', 's1', { company: 'Committed' });
  await c.store.stripeInbox.receive(next); const committing = c.store.commitStripe({ getDb: () => c.db, event: next, stage });
  try {
    await until(async () => Number((await c.admin.query("select count(*) as n from pg_locks where locktype='advisory' and not granted and objid=$1", [control])).rows[0].n) > 0);
    const parsed = new URL(c.url), name = `reload_${process.pid}_${serial}`; parsed.searchParams.set('application_name', name);
    const script = "const store=require('./store').openStore({kind:'postgres'});const db=store.loadSync();store.save(db);store.flush().then(()=>process.stdout.write(JSON.stringify(db))).finally(()=>store.close());";
    child = spawn(process.execPath, ['-e', script], { cwd: ROOT, env: { ...process.env, DATABASE_URL: parsed.toString() }, stdio: ['ignore', 'pipe', 'pipe'] });
    let output = ''; child.stdout.on('data', (part) => output += part);
    const finished = new Promise((resolve, reject) => { child.on('error', reject); child.on('exit', (code) => code === 0 ? resolve() : reject(new Error('Startup process failed'))); });
    await until(async () => Number((await c.admin.query("select count(*) as n from pg_stat_activity where application_name=$1 and wait_event='advisory'", [name])).rows[0].n) > 0);
    assert.equal(output, ''); await c.admin.query('select pg_advisory_unlock($1)', [control]); await committing; await finished;
    const loaded = JSON.parse(output); assert.equal(loaded.suppliers[0].company, 'Committed'); assert.ok(loaded.meta.stripe.appliedReceipts.evt_pending);
    await c.reopen(); assert.equal(c.db.suppliers[0].company, 'Committed'); assert.ok(c.db.meta.stripe.appliedReceipts.evt_pending);
  } finally { await c.admin.query('select pg_advisory_unlock($1)', [control]); child?.kill(); }
}));
it('offline replacement rejects an older receipt snapshot atomically', { skip: !process.env.DATABASE_URL }, async () => fixture('postgres', async (c) => {
  const data = structuredClone(c.db); delete data.meta.stripe.appliedReceipts.evt_first;
  data.stripeWebhookInbox = [...await c.store.stripeInbox.export(), { ...event('evt_offline'), state: 'handled' }];
  const file = path.join(c.dir, 'older.json'); fs.writeFileSync(file, JSON.stringify(data));
  assert.throws(() => execFileSync(process.execPath, ['tools/db/import-json.js', file, '--replace'], { cwd: ROOT, env: { ...process.env, DATABASE_URL: c.url }, stdio: 'pipe' }), (e) => /cannot be removed/.test(String(e.stderr)));
  assert.equal(await c.store.stripeInbox.get('evt_offline'), null); await c.reopen(); assert.ok(c.db.meta.stripe.appliedReceipts.evt_first);
}));
it('offline replacement validates new receipts and repairs a valid processing-sidecar snapshot', { skip: !process.env.DATABASE_URL }, async () => fixture('postgres', async (c) => {
  const input = await c.replacement(); input.records.find((r) => r.id === 'evt_imported').state = 'processing';
  const snapshot = { ...input.data, stripeWebhookInbox: input.records }, file = path.join(c.dir, 'import.json');
  const run = () => execFileSync(process.execPath, ['tools/db/import-json.js', file, '--replace'], { cwd: ROOT, env: { ...process.env, DATABASE_URL: c.url }, stdio: 'pipe' });
  for (const corrupt of [
    (data) => { data.stripeWebhookInbox.find((r) => r.id === 'evt_imported').type = 'wrong.type'; },
    (data) => { data.meta.stripe.appliedReceipts.wrong_key = data.meta.stripe.appliedReceipts.evt_imported; delete data.meta.stripe.appliedReceipts.evt_imported; },
    (data) => { delete data.meta.stripe.appliedReceipts.evt_imported.kind; },
    (data) => { delete data.meta.stripe.appliedReceipts.evt_imported.livemode; },
  ]) {
    const bad = structuredClone(snapshot); corrupt(bad); fs.writeFileSync(file, JSON.stringify(bad)); assert.throws(run);
    assert.equal(await c.store.stripeInbox.get('evt_imported'), null);
  }
  fs.writeFileSync(file, JSON.stringify(snapshot)); run(); await c.reopen();
  assert.equal(c.db.suppliers[0].company, 'Imported'); assert.equal(Object.keys(c.db.meta.stripe.appliedReceipts).length, 2);
  assert.equal((await c.store.stripeInbox.get('evt_imported')).state, 'handled');
}));
