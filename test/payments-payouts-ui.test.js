// T271: embedded sessions must never survive a change of authenticated supplier.
const { it } = require('node:test');
const assert = require('node:assert/strict');
const vm = require('node:vm');
const fs = require('node:fs');
function browser() {
  const box = { innerHTML: '', append() {} }, instances = [];
  const context = {
    esc: String, t: (key) => key, state: { user: { id: 'ownerA' } },
    document: { getElementById: () => box, body: { contains: () => true } },
    actions: { on() {} }, routes: { add() {} }, ccLanguage: { locale: 'en' },
    api: async () => ({ clientSecret: 'secret' }),
    window: { StripeConnect: { init(options) {
      const instance = { options, logouts: 0, logout() { this.logouts++; }, create: () => ({ setOnExit() {} }) };
      instances.push(instance); return instance;
    } } },
  };
  vm.createContext(context);
  vm.runInContext(fs.readFileSync('public/areas/payments.js', 'utf8'), context);
  return { context, box, instances };
}
it('isolates embedded account sessions when supplier A logs out and B signs in', async () => {
  const { context, instances } = browser();
  await context.poComponents({ publishableKey: 'pk_test_fake', account: { id: 'acct_A', transfers: 'active' } });
  assert.equal(instances.length, 1);
  context.poReset();
  context.state.user = { id: 'ownerB' };
  await context.poComponents({ publishableKey: 'pk_test_fake', account: { id: 'acct_B', transfers: 'pending' } });
  assert.equal(instances.length, 2);
  assert.equal(instances[0].logouts, 1);
  await assert.rejects(instances[0].options.fetchClientSecret(), /session changed/);
  assert.equal(await instances[1].options.fetchClientSecret(), 'secret');
  context.state.user = { id: 'ownerC' };
  await context.poComponents({ publishableKey: 'pk_test_fake', account: { id: 'acct_C', transfers: 'active' } });
  assert.equal(instances[1].logouts, 1);
  assert.equal(instances.length, 3);
});
it('shows an actionable translated fallback if embedded initialization fails', async () => {
  const { context, box } = browser();
  context.window.StripeConnect.init = () => { throw new Error('connection failed'); };
  await context.poComponents({ publishableKey: 'pk_test_fake', account: { id: 'acct_A', transfers: 'active' } });
  assert.match(box.innerHTML, /payouts.loadFailed/);
});

it('rejects a pending session response after logout without exposing its client secret', async () => {
  const { context, instances } = browser();
  let resolve;
  context.api = () => new Promise((done) => { resolve = done; });
  await context.poComponents({ publishableKey: 'pk_test_fake', account: { id: 'acct_A', transfers: 'active' } });
  const pending = instances[0].options.fetchClientSecret();
  context.poReset();
  context.state.user = { id: 'ownerB' };
  resolve({ clientSecret: 'old-secret' });
  await assert.rejects(pending, /session changed/);
  let calls = 0;
  context.api = async () => { calls++; return { clientSecret: 'B-secret' }; };
  await assert.rejects(instances[0].options.fetchClientSecret(), /session changed/);
  assert.equal(calls, 0);
});
it('does not render a delayed supplier A page after supplier B signs in', async () => {
  const { context, instances } = browser();
  let resolve;
  context.api = () => new Promise((done) => { resolve = done; });
  context.app = { innerHTML: 'B page' };
  context.location = { hash: '#/supplier/payouts' };
  const pending = context.poSupplierPage();
  context.state.user = { id: 'ownerB' };
  resolve({ account: { id: 'acct_A' } });
  await pending;
  assert.equal(context.app.innerHTML, 'B page');
  assert.equal(instances.length, 0);
});
it('always clears the session even when Stripe logout throws or rejects', async () => {
  const { context, instances } = browser();
  const info = { publishableKey: 'pk_test_fake', account: { id: 'acct_A', transfers: 'active' } };
  await context.poComponents(info);
  instances[0].logout = () => { throw new Error('logout failed'); };
  assert.doesNotThrow(() => context.poReset());
  await assert.rejects(instances[0].options.fetchClientSecret(), /session changed/);
  await context.poComponents(info);
  instances[1].logout = () => Promise.reject(new Error('logout failed'));
  context.poReset();
  await new Promise((done) => setImmediate(done));
  await assert.rejects(instances[1].options.fetchClientSecret(), /session changed/);
});
