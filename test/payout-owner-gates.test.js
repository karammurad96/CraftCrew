const { test } = require('node:test');
const assert = require('node:assert/strict');
const { EventEmitter } = require('node:events');
const fs = require('node:fs');
const path = require('node:path');
const { createGate } = require('../stripe-commit');
const ownerGate = require('../payment-owner-gate');
const { startApp, vettedSupplier, readDb, POSTGRES, schemaOf } = require('./helpers');
const { startFakeStripe } = require('./fake-stripe');
function response() {
  const result = new EventEmitter(); result.headers = {}; result.output = [];
  result.removeHeader = (key) => delete result.headers[key];
  result.writeHead = (...args) => { result.head = args; return result; };
  result.write = (chunk) => { result.output.push(chunk); return true; };
  result.end = (chunk) => { if (chunk) result.output.push(chunk); result.finished = true; result.emit('finish'); return result; };
  return result;
}
const send = (res, status, value) => { res.writeHead(status); res.end(JSON.stringify(value)); };

test('owner writer responses and later payment work wait for durability, while body parsing holds no gate', async () => {
  const gate = createGate(); let bodyReady, commitReady, committing;
  const parsed = new Promise((resolve) => bodyReady = resolve), stored = new Promise((resolve) => commitReady = resolve);
  const committingNow = new Promise((resolve) => committing = resolve);
  const boundary = ownerGate({ gate, body: () => parsed, commit: async () => { committing(); await stored; }, send });
  const res = response(), req = { method: 'PUT' }, url = new URL('https://example.test/api/account/preferences');
  const updating = boundary.mutation(req, res, url, async () => { send(res, 200, { saved: true }); return true; });
  let outside = false; await gate.run(() => { outside = true; }); assert.equal(outside, true);
  bodyReady({}); await committingNow;
  assert.equal(res.finished, undefined); let later = false;
  const next = gate.run(() => { later = true; }); await new Promise((resolve) => setImmediate(resolve)); assert.equal(later, false);
  commitReady(); await updating; await next;
  assert.equal(res.head[0], 200); assert.equal(res.finished, true); assert.equal(later, true);
});

test('failed owner storage discards a buffered success/cookie and fails closed for later owner/payment operations', async () => {
  const gate = createGate(), boundary = ownerGate({ gate, body: async () => ({}), commit: async () => { throw new Error('storage failed'); }, send });
  const res = response(); res.headers['Set-Cookie'] = 'test-cookie';
  await boundary.mutation({ method: 'PUT' }, res, new URL('https://example.test/api/profile'), async () => { send(res, 200, { private: 'not returned' }); });
  assert.equal(res.head[0], 503); assert.equal(res.headers['Set-Cookie'], undefined);
  assert.ok(!res.output.join('').includes('not returned')); assert.throws(() => boundary.healthy(), /reconciliation/);
  await assert.rejects(boundary.run(() => assert.fail('must not run')), /reconciliation/);
  const retry = response(); await boundary.mutation({ method: 'PUT' }, retry, new URL('https://example.test/api/account/preferences'), () => assert.fail('must not run'));
  assert.equal(retry.head[0], 503);
});

test('owner gate covers actual binding writers and excludes separately gated/payment and unrelated routes', () => {
  const boundary = ownerGate({ gate: createGate(), body: async () => ({}), commit: async () => {}, send });
  for (const route of ['auth/signup', 'auth/verify', 'auth/login', 'profile', 'team', 'account/preferences', 'account/deletion', 'admin/applications/a', 'admin/users/u', 'admin/suppliers/s', 'admin/profile-changes/s'])
    assert.equal(boundary.guards({ method: 'POST' }, new URL('https://example.test/api/' + route)), true, route);
  for (const route of ['stripe/webhook', 'payouts/account', 'backup/import', 'projects', 'invoices', 'admin/stripe/check', 'contracts'])
    assert.equal(boundary.guards({ method: 'POST' }, new URL('https://example.test/api/' + route)), false, route);
  assert.equal(boundary.guards({ method: 'GET' }, new URL('https://example.test/api/profile')), false);
});

async function accountFault(app, enabled) {
  if (!POSTGRES) {
    const target = path.join(app.dataDir, 'db.json.tmp');
    if (enabled) fs.mkdirSync(target); else fs.rmdirSync(target);
  } else {
    const client = new (require('pg').Client)({ connectionString: process.env.DATABASE_URL }); await client.connect();
    const schema = schemaOf(app.dataDir);
    try {
      if (enabled) {
        await client.query(`create function ${schema}.refuse_payout() returns trigger language plpgsql as $$ begin if new.collection='activities' and new.data->>'text'='Stripe payout account created' or new.collection='outbox' then raise exception 'payout publication refused'; end if; return new; end $$`);
        await client.query(`create trigger refuse_payout before insert or update on ${schema}.records for each row execute function ${schema}.refuse_payout()`);
      } else {
        await client.query(`drop trigger refuse_payout on ${schema}.records`);
        await client.query(`drop function ${schema}.refuse_payout()`);
      }
    } finally { await client.end(); }
  }
}

test('ordinary payout API storage failures publish no account/activity/mail; provider creation retry is idempotent and refresh is durable', async () => {
  const fake = await startFakeStripe(), app = await startApp({ env: fake.env });
  let fault = false;
  try {
    const admin = await app.login('admin@test.local', 'Admin-Password-2026!');
    const supplier = await vettedSupplier(app, admin, 'strict.payout@test.local', 'Strict Payout');
    await app.call('PUT', '/account/preferences', { notificationPrefs: { invoices: true, projects: true } }, supplier.token);
    const before = await readDb(app.dataDir);
    await accountFault(app, true); fault = true;
    const failed = await app.call('POST', '/payouts/account', { country: 'PL' }, supplier.token);
    assert.equal(failed.status, 503, failed.error);
    let stored = await readDb(app.dataDir);
    assert.equal(stored.suppliers.find((row) => row.id === supplier.supplierId).stripeAccount, undefined);
    assert.equal(stored.activities.filter((row) => row.text === 'Stripe payout account created').length, 0);
    assert.equal(stored.notifications.length, before.notifications.length); assert.equal(stored.outbox.length, before.outbox.length);
    await accountFault(app, false); fault = false;
    const created = await app.call('POST', '/payouts/account', { country: 'PL' }, supplier.token);
    assert.equal(created.status, 201, created.error); assert.equal(fake.accounts.size, 1);
    const creates = fake.calls.filter((call) => call.path === '/v2/core/accounts');
    assert.equal(creates.length, 2); assert.equal(creates[0].headers['idempotency-key'], creates[1].headers['idempotency-key']);
    const pending = await readDb(app.dataDir);
    assert.equal(pending.suppliers.find((row) => row.id === supplier.supplierId).stripeAccount.id, created.account.id);
    fake.setTransfers(created.account.id, 'active');
    await accountFault(app, true); fault = true;
    const refused = await app.call('POST', '/payouts/refresh', {}, supplier.token); assert.equal(refused.status, 503, refused.error);
    stored = await readDb(app.dataDir);
    assert.equal(stored.suppliers.find((row) => row.id === supplier.supplierId).stripeAccount.transfers, 'pending');
    assert.equal(stored.notifications.length, pending.notifications.length); assert.equal(stored.outbox.length, pending.outbox.length);
    await accountFault(app, false); fault = false;
    const refreshed = await app.call('POST', '/payouts/refresh', {}, supplier.token);
    assert.equal(refreshed.status, 200, refreshed.error); assert.equal(refreshed.account.transfers, 'active');
    stored = await readDb(app.dataDir);
    assert.equal(stored.suppliers.find((row) => row.id === supplier.supplierId).stripeAccount.transfers, 'active');
    assert.equal(stored.notifications.length, pending.notifications.length + 1); assert.equal(stored.outbox.length, pending.outbox.length + 1);
  } finally {
    if (fault) await accountFault(app, false);
    await app.stop(); await fake.stop();
  }
});

function payoutFixture(client) {
  let db = { meta: {}, suppliers: [{ id: 'sup', company: 'Supplier', stripeAccount: { id: 'acct_current', transfers: 'pending' } }],
    users: [{ id: 'owner', role: 'supplier', supplierId: 'sup', email: 'owner@example.test', notificationPrefs: { invoices: true, projects: true } }], activities: [], notifications: [], outbox: [] };
  const owner = structuredClone(db.users[0]), answers = [];
  const payouts = require('../payouts')({ ...require('./stripe-inbox-helper')(), getDb: () => db, send: (res, status, value) => answers.push({ status, value }),
    now: () => '2026-10-08T12:00:00.000Z', enabled: true, client, body: async () => ({ country: 'PL' }), on() {}, mailEnabled: false });
  return { payouts, owner, answers, get db() { return db; }, replace(next) { db = next; },
    request(action) { return payouts.handle({ method: 'POST' }, {}, null, ['api', 'payouts', action], owner); } };
}
const providerAccount = (id) => ({ id, configuration: { recipient: { capabilities: { stripe_balance: { stripe_transfers: { status: 'active' } } } } } });
function delayedClient(method) {
  let started, finish;
  const entered = new Promise((resolve) => started = resolve), result = new Promise((resolve) => finish = resolve);
  const fn = () => { started(); return result; };
  return { entered, finish, client: method === 'refresh' ? { v2: { core: { accounts: { retrieve: fn } } } }
    : method === 'account' ? { v2: { core: { accounts: { create: fn } } } }
      : method === 'session' ? { accountSessions: { create: fn } } : { accounts: { createLoginLink: fn } } };
}

test('delayed refresh reads replacement DB and cannot resurrect a stale account or reassign mail', async () => {
  const delayed = delayedClient('refresh'), fixture = payoutFixture(delayed.client), oldSupplier = fixture.db.suppliers[0];
  const pending = fixture.request('refresh'); await delayed.entered;
  const replacement = structuredClone(fixture.db); replacement.suppliers[0].stripeAccount.id = 'acct_replacement'; fixture.replace(replacement);
  delayed.finish(providerAccount('acct_current')); await pending;
  assert.equal(fixture.answers[0].status, 409); assert.equal(fixture.db.suppliers[0].stripeAccount.id, 'acct_replacement');
  assert.equal(oldSupplier.stripeAccount.transfers, 'pending'); assert.equal(fixture.db.notifications.length, 0); assert.equal(fixture.db.outbox.length, 0);
});

test('delayed create/session/login-link recheck current owner and never return a stale account secret or publish for a new owner', async () => {
  for (const action of ['account', 'session', 'login-link']) {
    const delayed = delayedClient(action), fixture = payoutFixture(delayed.client);
    if (action === 'account') delete fixture.db.suppliers[0].stripeAccount;
    const pending = fixture.request(action); await delayed.entered;
    const replacement = structuredClone(fixture.db);
    replacement.users.push({ ...replacement.users[0], id: 'new_owner' }); replacement.users[0].orgOwnerId = 'new_owner'; fixture.replace(replacement);
    delayed.finish(action === 'account' ? providerAccount('acct_created') : action === 'session' ? { client_secret: 'accs_fake_stale' } : { url: 'https://example.test/stale-login-link' });
    await pending;
    assert.equal(fixture.answers[0].status, 409);
    assert.ok(!JSON.stringify(fixture.answers).includes('accs_fake_stale')); assert.ok(!JSON.stringify(fixture.answers).includes('stale-login-link'));
    assert.equal(fixture.db.notifications.length, 0); assert.equal(fixture.db.outbox.length, 0); assert.equal(fixture.db.activities.length, 0);
    if (action === 'account') assert.equal(fixture.db.suppliers[0].stripeAccount, undefined);
  }
});

test('duplicate account/owner bindings fail before provider work', async () => {
  for (const duplicate of ['account', 'owner']) {
    let calls = 0;
    const fixture = payoutFixture({ v2: { core: { accounts: { retrieve: async () => { calls++; return providerAccount('acct_current'); } } } } });
    if (duplicate === 'account') fixture.db.suppliers.push({ ...fixture.db.suppliers[0], id: 'other_supplier' });
    else fixture.db.users.push({ id: 'owner', role: 'customer' });
    await fixture.request('refresh'); assert.equal(calls, 0); assert.equal(fixture.answers[0].status, 409);
  }
});

test('committed listeners run outside the gate on detached copies and failures cannot undo durable payout/mail publication', async () => {
  const fixture = payoutFixture({ v2: { core: { accounts: { retrieve: async () => providerAccount('acct_current') } } } });
  const diagnostic = [], error = console.error; console.error = (...args) => diagnostic.push(args);
  try {
    fixture.payouts.onChange(async (supplier) => {
      assert.equal(fixture.db.suppliers[0].stripeAccount.transfers, 'active'); supplier.company = 'Must stay detached';
      await fixture.payouts.refresh('sup'); throw new Error('listener detail must not be logged');
    });
    let timer;
    try { await Promise.race([fixture.request('refresh'), new Promise((resolve, reject) => { timer = setTimeout(() => reject(new Error('nested gate deadlock')), 2000); })]); }
    finally { clearTimeout(timer); }
    assert.equal(fixture.answers[0].status, 200); assert.equal(fixture.db.suppliers[0].company, 'Supplier');
    assert.equal(fixture.db.notifications.length, 1); assert.equal(fixture.db.outbox.length, 1);
    assert.deepEqual(diagnostic, [['Stripe payout committed listener failed']]);
  } finally { console.error = error; }
});

test('delayed account creation rejects changed legal/company details instead of publishing an account prepared for old details', async () => {
  const delayed = delayedClient('account'), fixture = payoutFixture(delayed.client);
  delete fixture.db.suppliers[0].stripeAccount;
  fixture.db.users[0].companyProfile = { legalName: 'Original Legal Entity' };
  const pending = fixture.request('account'); await delayed.entered;
  fixture.db.users[0].companyProfile.legalName = 'Changed Legal Entity';
  delayed.finish(providerAccount('acct_created')); await pending;
  assert.equal(fixture.answers[0].status, 409); assert.equal(fixture.db.suppliers[0].stripeAccount, undefined);
  assert.equal(fixture.db.activities.length, 0); assert.equal(fixture.db.outbox.length, 0);
});

test('unrelated admin/customer profiles remain concurrent and a thrown scheduled owner mutation fails closed', async () => {
  for (const role of ['admin', 'customer']) {
    const boundary = ownerGate({ gate: createGate(), body: async () => ({}), commit: async () => {}, send, actor: () => ({ role }) });
    assert.equal(boundary.guards({ method: 'PUT' }, new URL('https://example.test/api/profile')), false);
    assert.equal(boundary.guards({ method: 'PUT' }, new URL('https://example.test/api/account/preferences')), false);
  }
  const boundary = ownerGate({ gate: createGate(), body: async () => ({}), commit: async () => {}, send });
  await assert.rejects(boundary.run(() => { throw new Error('scheduled owner mutation failed'); }), /reconciliation/);
  assert.throws(() => boundary.healthy(), /reconciliation/);
});
