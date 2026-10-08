// Backups: no sign-in secrets in exports; imports are checked and keep a copy of the previous data.
const { describe, it, before, after } = require("node:test");
const assert = require("node:assert/strict");
const { startApp, schemaOf, POSTGRES } = require("./helpers");

describe("backup export and import", () => {
  let app, admin;
  before(async () => {
    app = await startApp();
    admin = await app.login("admin@test.local", "Admin-Password-2026!");
    await app.signup("customer", "backup@test.local");
  });
  after(() => app.stop());

  it("exports without sessions or one-time tokens", async () => {
    const r = await app.call("GET", "/backup/export", undefined, admin);
    assert.equal(r.status, 200);
    assert.ok(Array.isArray(r.data.users));
    assert.equal("sessions" in r.data, false);
    assert.equal("authTokens" in r.data, false);
  });

  it("refuses data that is not a backup or has no active admin", async () => {
    assert.equal((await app.call("POST", "/backup/import", { data: { users: [] } }, admin)).status, 400);
    const { data } = await app.call("GET", "/backup/export", undefined, admin);
    const noAdmin = { ...data, users: data.users.filter((u) => u.role !== "admin") };
    const r = await app.call("POST", "/backup/import", { data: noAdmin }, admin);
    assert.equal(r.status, 400);
    assert.match(r.error, /admin/);
  });

  it("imports a valid backup, saves the previous data first and keeps the admin signed in", async () => {
    const { data } = await app.call("GET", "/backup/export", undefined, admin);
    const r = await app.call("POST", "/backup/import", { data }, admin);
    assert.equal(r.status, 200, r.error);
    assert.equal(r.counts.users, data.users.length);
    assert.match(r.previousDataSavedAs, /^pre-import-.*\.json$/);
    assert.equal((await app.call("GET", "/auth/me", undefined, admin)).status, 200, "still signed in");
    assert.ok(await app.login("backup@test.local", "Test-Password-2026"), "imported accounts work");
  });
  it('preserves applied receipts, repairs their sidecar state and rejects old/conflicting snapshots before ledger changes', async () => {
    const { data: old } = await app.call('GET', '/backup/export', undefined, admin);
    const restored = structuredClone(old), identity = { id: 'evt_restored', type: 'test.restore', kind: 'snapshot', livemode: false };
    restored.meta.stripe = { inboxMigrated: true, appliedReceipts: { [identity.id]: { ...identity, handledAt: '2026-10-08T00:00:00.000Z' } } };
    restored.stripeWebhookInbox = [{ ...identity, state: 'processing', attempts: 1 }];
    assert.equal((await app.call('POST', '/backup/import', { data: restored }, admin)).status, 200);
    const { data: after } = await app.call('GET', '/backup/export', undefined, admin);
    assert.equal(after.stripeWebhookInbox.find((r) => r.id === identity.id).state, 'handled');
    assert.deepEqual(after.meta.stripe.appliedReceipts[identity.id], restored.meta.stripe.appliedReceipts[identity.id]);
    old.stripeWebhookInbox = [{ ...identity, id: 'evt_should_not_import', state: 'handled' }];
    const rejected = await app.call('POST', '/backup/import', { data: old }, admin);
    assert.equal(rejected.status, 409); assert.equal(rejected.code, 'backupReceiptMismatch');
    const changed = structuredClone(after); changed.meta.stripe.appliedReceipts[identity.id].type = 'wrong.type';
    assert.equal((await app.call('POST', '/backup/import', { data: changed }, admin)).status, 409);
    const malformed = structuredClone(after);
    malformed.meta.stripe.appliedReceipts.evt_missing_identity = { ...identity, id: 'evt_missing_identity', handledAt: '2026-10-08T00:00:00.000Z' };
    assert.equal((await app.call('POST', '/backup/import', { data: malformed }, admin)).code, 'backupReceiptMismatch');
    const current = (await app.call('GET', '/backup/export', undefined, admin)).data;
    assert.equal(current.stripeWebhookInbox.some((r) => r.id === 'evt_should_not_import'), false);
    assert.deepEqual(current.meta.stripe.appliedReceipts[identity.id], after.meta.stripe.appliedReceipts[identity.id]);
    assert.equal((await app.call('POST', '/backup/import', { data: current }, admin)).status, 200);
  });
  it('drains existing API work, refuses new requests and rejects replacement if accepted work changed the data', async () => {
    const { data } = await app.call('GET', '/backup/export', undefined, admin);
    const payload = JSON.stringify({ name: 'Accepted during drain' }), http = require('node:http');
    let ready;
    const started = new Promise((r) => ready = r);
    const completed = new Promise((resolve, reject) => {
      const request = http.request(app.base + '/api/profile', { method: 'PUT', headers: {
        Authorization: 'Bearer ' + admin, 'Content-Type': 'application/json', 'Content-Length': Buffer.byteLength(payload), Expect: '100-continue',
      } }, (response) => { response.resume(); response.once('end', () => resolve(response.statusCode)); });
      request.once('continue', () => ready(request)); request.once('error', reject); request.flushHeaders();
    });
    const request = await started;
    let sent = false;
    const importing = app.call('POST', '/backup/import', { data }, admin);
    try {
      const deadline = Date.now() + 5000; let unavailable;
      do { unavailable = await app.call('GET', '/auth/me', undefined, admin); if (unavailable.status === 503) break; await new Promise((r) => setTimeout(r, 20)); } while (Date.now() < deadline);
      assert.equal(unavailable.status, 503);
      assert.equal((await app.call('POST', '/auth/signup', { email: 'must-not-save@test.local' }, admin)).status, 503);
      request.end(payload); sent = true; assert.equal(await completed, 200);
      const result = await importing; assert.equal(result.status, 409); assert.equal(result.code, 'backupChangedDuringRestore');
      assert.equal((await app.call('GET', '/auth/me', undefined, admin)).user.name, 'Accepted during drain');
    } finally { if (!sent) request.end(payload); await completed; await importing; }
  });
  it('exports a detached business snapshot while a real ledger read is delayed', { skip: !POSTGRES }, async () => {
    const control = new (require('pg').Client)({ connectionString: process.env.DATABASE_URL }); await control.connect();
    await control.query('begin'); await control.query(`lock table ${schemaOf(app.dataDir)}.stripe_webhook_inbox in access exclusive mode`);
    const exported = app.call('GET', '/backup/export', undefined, admin);
    try {
      const deadline = Date.now() + 10000; let blocked = false;
      while (Date.now() < deadline) {
        await control.query('select pg_stat_clear_snapshot()');
        blocked = Number((await control.query("select count(*) as n from pg_stat_activity where wait_event_type='Lock' and query like '%from stripe_webhook_inbox order by%' ")).rows[0].n) > 0;
        if (blocked) break; await new Promise((r) => setTimeout(r, 20));
      }
      assert.equal(blocked, true);
      assert.equal((await app.call('PUT', '/profile', { name: 'After captured snapshot' }, admin)).status, 200);
      await control.query('commit');
      const result = await exported;
      assert.equal(result.data.users.find((u) => u.role === 'admin').name, 'Accepted during drain');
      assert.equal((await app.call('GET', '/auth/me', undefined, admin)).user.name, 'After captured snapshot');
    } finally { await control.query('rollback'); await control.end(); await exported; }
  });
});
