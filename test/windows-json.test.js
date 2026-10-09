const { it } = require('node:test');
const assert = require('node:assert/strict');
const fs = require('node:fs');
const os = require('node:os');
const path = require('node:path');
const { openStore } = require('../store');
const { jsonInbox } = require('../stripe-inbox');
const { createStage } = require('../stripe-commit');
const message = /STORE=postgres on Windows/;
const event = { id: 'evt_windows', type: 'test.windows', kind: 'snapshot', livemode: false, state: 'processing' };
async function fixture(work, platform = 'win32') {
  const dataDir = fs.mkdtempSync(path.join(os.tmpdir(), 'craftcrew-windows-'));
  try { await work(openStore({ kind: 'json', dataDir, platform }), dataDir); }
  finally { fs.rmSync(dataDir, { recursive: true, force: true }); }
}
it('Windows JSON saves fsync the file, rename and reload, without directory fsync', async () => fixture(async (store) => {
  const original = fs.fsyncSync; let files = 0;
  fs.fsyncSync = (fd) => { assert.equal(fs.fstatSync(fd).isDirectory(), false); files++; return original(fd); };
  try {
    store.save({ projects: [], meta: { stripe: { appliedReceipts: {}, inboxMigrated: true } }, stripeWebhookInbox: [] });
    await store.stripeInbox.prepare();
    assert.deepEqual(store.loadSync().projects, []);
    store.save({ projects: [{ id: 'p1' }] }); await store.flush();
    assert.equal(store.loadSync().projects[0].id, 'p1'); assert.equal(files, 2);
  } finally { fs.fsyncSync = original; }
}));
it('Windows strict commits refuse before reading business data or publishing anything', async () => fixture(async (store, dir) => {
  let called = false; const getDb = () => { called = true; throw new Error('unexpected'); };
  await assert.rejects(store.commitStage({ getDb, stage: createStage() }), message);
  await assert.rejects(store.commitStripe({ getDb, stage: createStage(), event }), message);
  assert.equal(called, false); assert.deepEqual(fs.readdirSync(dir), []);
}));
it('Windows inbox receive/update/restore refuse before creating files, with empty migration allowed', async () => fixture(async (store, dir) => {
  await assert.rejects(store.stripeInbox.receive(event), message);
  await assert.rejects(store.stripeInbox.update(event), message);
  assert.throws(() => store.stripeInbox.restoreSync([event]), message);
  assert.deepEqual(fs.readdirSync(dir), []);
  store.stripeInbox.restoreSync([]); assert.deepEqual(await store.stripeInbox.export(), []);
}));
it('Windows configured Stripe refuses before constructing the SDK/provider', async () => fixture(async (store) => {
  const stripePath = require.resolve('stripe'), prior = require.cache[stripePath];
  require.cache[stripePath] = { exports: function () { throw new Error('SDK must not be constructed'); } };
  try { assert.throws(() => require('../payments')({ inbox: store.stripeInbox, env: { STRIPE_SECRET_KEY: 'sk_test_windows_fake' } }), message); }
  finally { if (prior) require.cache[stripePath] = prior; else delete require.cache[stripePath]; }
}));
for (const payload of [
  { meta: { stripe: { appliedReceipts: { evt_windows: event } } } },
  { stripeEvents: [event] }, { stripeWebhookInbox: [event] },
  { stripeOperations: [{ id: 'operation' }] }, { stripeFinancialRecords: [{ id: 'history' }] },
]) it('Windows refuses incoming and prior financial metadata before replacing the snapshot', async () => fixture(async (store, dir) => {
  store.save({ projects: [{ id: 'keep' }] }); const before = fs.readFileSync(store.file, 'utf8');
  assert.throws(() => store.save(payload), message);
  let published = false;
  await assert.rejects(store.importBackup({ data: payload, inbox: [], publish() { published = true; } }), message);
  assert.equal(published, false); assert.equal(fs.readFileSync(store.file, 'utf8'), before);
  fs.writeFileSync(store.file, JSON.stringify(payload)); const financial = fs.readFileSync(store.file, 'utf8');
  assert.throws(() => store.loadSync(), message); assert.throws(() => store.save({}), message);
  assert.equal(fs.readFileSync(store.file, 'utf8'), financial); assert.equal(fs.existsSync(path.join(dir, 'db.json.tmp')), false);
}));
it('Windows refuses existing sidecars and receipt imports without changing them', async () => fixture(async (store, dir) => {
  store.save({ projects: [{ id: 'keep' }] });
  await jsonInbox(dir, 'linux').receive(event);
  const before = fs.readFileSync(store.file, 'utf8');
  assert.throws(() => store.save({}), message); assert.throws(() => store.loadSync(), message);
  await assert.rejects(store.importBackup({ data: {}, inbox: [], publish() { throw new Error('unexpected'); } }), message);
  assert.equal(fs.readFileSync(store.file, 'utf8'), before);
}));
it('Windows empty-ledger backup import succeeds, while a nonempty imported inbox refuses first', async () => fixture(async (store) => {
  store.save({ projects: [{ id: 'keep' }] }); let published;
  const before = fs.readFileSync(store.file, 'utf8');
  await assert.rejects(store.importBackup({ data: { projects: [] }, inbox: [event], publish(data) { published = data; } }), message);
  assert.equal(published, undefined); assert.equal(fs.readFileSync(store.file, 'utf8'), before);
  await store.importBackup({ data: { projects: [{ id: 'restored' }], meta: { stripe: { appliedReceipts: {} } } }, inbox: [], publish(data) { published = data; } });
  assert.equal(published.projects[0].id, 'restored'); assert.equal(store.loadSync().projects[0].id, 'restored');
}));
it('Windows file fsync and rename failures still throw without overwriting the old snapshot', async () => fixture(async (store) => {
  store.save({ keep: true }); const before = fs.readFileSync(store.file, 'utf8');
  for (const name of ['fsyncSync', 'renameSync']) {
    const original = fs[name]; fs[name] = () => { throw Object.assign(new Error('file failure'), { code: 'EPERM' }); };
    try { assert.throws(() => store.save({ changed: true }), /file failure/); }
    finally { fs[name] = original; }
    assert.equal(fs.readFileSync(store.file, 'utf8'), before);
  }
}));
it('POSIX directory EPERM retries and blocks later writes/flush; it is never ignored', async () => fixture(async (store) => {
  store.save({ keep: true }); const original = fs.fsyncSync; let failures = 0;
  fs.fsyncSync = (fd) => {
    if (fs.fstatSync(fd).isDirectory()) { failures++; throw Object.assign(new Error('directory fsync EPERM'), { code: 'EPERM' }); }
    return original(fd);
  };
  try { assert.throws(() => store.save({ changed: true }), /EPERM/); assert.equal(failures, 2); }
  finally { fs.fsyncSync = original; }
  assert.throws(() => store.save({}), /reconciliation/); await assert.rejects(store.flush(), /reconciliation/);
}, 'linux'));
it('simulated Windows demo starts, signs in and reloads existing local data', async () => fixture(async (store, dir) => {
  const preload = path.join(dir, 'windows-preload.cjs');
  fs.writeFileSync(preload, "Object.defineProperty(process, 'platform', { value: 'win32' });\n");
  const { startApp } = require('./helpers');
  const env = { STORE: 'json', NODE_ENV: 'development', NODE_OPTIONS: `--require=${preload}` };
  let app = await startApp({ dataDir: dir, env });
  try {
    const login = await app.login('customer.demo@craftcrew.local', 'CraftCrew2026!');
    assert.ok(login);
    assert.equal((await app.call('GET', '/projects', undefined, login)).status, 200);
    const admin = await app.login('admin@craftcrew.demo', 'admin123');
    assert.equal((await app.call('GET', '/admin/stripe', undefined, admin)).stripe.enabled, false);
  } finally { await app.stop(); }
  const saved = JSON.parse(fs.readFileSync(store.file, 'utf8')); assert.ok(saved.users.length);
  app = await startApp({ dataDir: dir, env });
  try { assert.ok(await app.login('supplier.demo@craftcrew.local', 'CraftCrew2026!')); }
  finally { await app.stop(); }
}));
