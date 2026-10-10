const test = require("node:test");
const assert = require("node:assert/strict");
const { startApp, vettedSupplier, projectWithTasks, assignAndAccept, submitInvoice } = require("./helpers");
const { startFakeStripe } = require("./fake-stripe");

test("T283a signed Checkout delivery reaches supplier settlement exactly once through the HTTP handler", { timeout: 20000 }, async (t) => {
  let session;
  const fake = await startFakeStripe({
    "GET /v1/payment_intents/:id": () => ({ id: "pi_verified", object: "payment_intent", livemode: false,
      amount: session.amount_total, currency: "eur", customer: session.customer, metadata: session.metadata,
      status: "succeeded", latest_charge: "ch_verified" }),
    "GET /v1/charges/:id": () => ({ id: "ch_verified", object: "charge", livemode: false,
      amount: session.amount_total, currency: "eur", customer: session.customer, payment_intent: "pi_verified",
      paid: true, status: "succeeded", amount_captured: session.amount_total, amount_refunded: 0 }),
  });
  const app = await startApp({ env: fake.env });
  t.after(async () => { await app.stop(); await fake.stop(); });
  const admin = await app.login("admin@test.local", "Admin-Password-2026!");
  const supplier = await vettedSupplier(app, admin, "settlement.supplier@test.local", "Settlement Crew");
  assert.equal((await app.call("POST", "/payouts/account", { country: "DE" }, supplier.token)).status, 201);
  const account = [...fake.accounts.values()][0];
  fake.setTransfers(account.id, "active");
  await app.signup("customer", "settlement.customer@test.local");
  const customer = await app.login("settlement.customer@test.local", "Test-Password-2026");
  const { project, phase, tasks } = await projectWithTasks(app, customer, { tasks: ["Settlement"] });
  await assignAndAccept(app, customer, supplier.token, project, tasks[0]);
  const before = await app.call("GET", "/invoices", undefined, supplier.token);
  const malformed = await app.call("POST", "/invoices/not-a-creation-route", { projectId: project.id, phaseId: phase.id, taskId: tasks[0].id, amount: 1000, vatMode: "standard", description: "Malformed invoice route" }, supplier.token);
  assert.equal(malformed.status, 404);
  assert.equal((await app.call("GET", "/invoices", undefined, supplier.token)).invoices.length, before.invoices.length);
  const invoice = await submitInvoice(app, supplier.token, project, phase, tasks[0], 1000);
  assert.match(invoice.number, /-0001$/, 'the malformed route must not consume an invoice number');
  assert.equal((await app.call("PATCH", `/invoices/${invoice.id}`, { action: "Approve" }, customer)).status, 200);
  const checkout = await app.call("POST", `/invoices/${invoice.id}/pay`, {}, customer);
  assert.equal(checkout.status, 200, checkout.error);
  session = [...fake.checkoutSessions.values()][0];
  Object.assign(session, { status: "complete", payment_status: "paid", payment_intent: "pi_verified" });
  async function deliver(id) {
    const signed = fake.signed({ id, type: "checkout.session.completed", data: { object: session } });
    return fetch(app.base + "/api/stripe/webhook", { method: "POST", headers: { "Stripe-Signature": signed.header }, body: signed.payload });
  }
  assert.equal((await deliver("evt_settlement_1")).status, 200);
  assert.equal(fake.transfers.size, 1, "the real dispatcher must execute the supplier listener");
  const transfer = [...fake.transfers.values()][0];
  assert.equal(transfer.destination, account.id); assert.equal(transfer.source_transaction, "ch_verified");
  assert.equal(transfer.transfer_group, invoice.id);
  assert.equal((await app.call("GET", `/invoices/${invoice.id}`, undefined, customer)).invoice.status, "Paid");
  assert.equal((await deliver("evt_settlement_1")).status, 200);
  assert.equal((await deliver("evt_settlement_2")).status, 200);
  assert.equal(fake.transfers.size, 1);
  const refund = await app.call("PATCH", `/admin/invoices/${invoice.id}`, { action: "Refund", reason: "Verified full cancellation" }, admin);
  assert.equal(refund.status, 200, refund.error);
  const repeated = await app.call("PATCH", `/admin/invoices/${invoice.id}`, { action: "Refund", reason: "Verified full cancellation" }, admin);
  assert.equal(repeated.status, 200, repeated.error);
  assert.equal(repeated.refund.refundId, refund.refund.refundId);
  assert.equal(fake.refunds.size, 1); assert.equal(fake.reversals.size, 1);
});

test('T283c2 signed foreign/stale/terminal events and partial-refund disputes remain monotonic', { timeout: 20000 }, async (t) => {
  let session, wrongCustomer = true;
  const fake = await startFakeStripe({
    'GET /v1/payment_intents/:id': () => ({ id: 'pi_ordered', object: 'payment_intent', livemode: false, amount: session.amount_total, currency: 'eur', customer: session.customer, metadata: session.metadata, status: 'succeeded', latest_charge: 'ch_ordered' }),
    'GET /v1/charges/:id': () => ({ id: 'ch_ordered', object: 'charge', livemode: false, amount: session.amount_total, amount_captured: session.amount_total, currency: 'eur', customer: wrongCustomer ? 'cus_wrong' : session.customer, payment_intent: 'pi_ordered', paid: true, status: 'succeeded' }),
  });
  const app = await startApp({ env: fake.env }); t.after(async () => { await app.stop(); await fake.stop(); });
  const admin = await app.login('admin@test.local', 'Admin-Password-2026!');
  const supplier = await vettedSupplier(app, admin, 'ordered.supplier@test.local', 'Ordered Crew');
  await app.call('POST', '/payouts/account', { country: 'DE' }, supplier.token); fake.setTransfers([...fake.accounts.keys()][0], 'active');
  await app.signup('customer', 'ordered.customer@test.local'); const customer = await app.login('ordered.customer@test.local', 'Test-Password-2026');
  const { project, phase, tasks } = await projectWithTasks(app, customer, { tasks: ['Ordering'] });
  await assignAndAccept(app, customer, supplier.token, project, tasks[0]); const invoice = await submitInvoice(app, supplier.token, project, phase, tasks[0], 1000);
  await app.call('PATCH', `/invoices/${invoice.id}`, { action: 'Approve' }, customer);
  assert.equal((await app.call('POST', `/invoices/${invoice.id}/pay`, {}, customer)).status, 200);
  session = [...fake.checkoutSessions.values()][0]; Object.assign(session, { status: 'complete', payment_status: 'paid', payment_intent: 'pi_ordered' });
  const deliver = async (id, type, object) => { const signed = fake.signed({ id, type, data: { object } }); return fetch(app.base + '/api/stripe/webhook', { method: 'POST', headers: { 'Stripe-Signature': signed.header }, body: signed.payload }); };
  const beforeForeign = fake.calls.length;
  assert.equal((await deliver('evt_foreign_order', 'checkout.session.completed', { ...session, integration_identifier: 'other-platform' })).status, 200);
  assert.equal(fake.calls.length, beforeForeign); assert.equal(fake.transfers.size, 0);
  assert.equal((await deliver('evt_wrong_owner', 'checkout.session.completed', session)).status, 500); assert.equal(fake.transfers.size, 0);
  wrongCustomer = false;
  assert.equal((await deliver('evt_stale_failure', 'checkout.session.async_payment_failed', { ...session, payment_status: 'unpaid' })).status, 200);
  assert.equal(fake.transfers.size, 1, 'canonical paid result still reaches settlement from the stale failure event');
  assert.ok(fake.calls.filter((c) => c.path === '/v1/payment_intents/pi_ordered').every((c) => !Object.values(c.query).some((v) => String(v).includes('charges.data'))));
  const partial = await app.call('PATCH', `/admin/invoices/${invoice.id}`, { action: 'Refund', amount: 119, requestId: 'partial-before-dispute', reason: 'Partial cancellation' }, admin);
  assert.equal(partial.status, 200, partial.error); const transfer = [...fake.transfers.values()][0], remaining = transfer.amount - transfer.amount_reversed;
  const dispute = { id: 'dp_ordered', object: 'dispute', livemode: false, charge: 'ch_ordered', payment_intent: 'pi_ordered', amount: session.amount_total, currency: 'eur', status: 'needs_response' };
  fake.disputes.set(dispute.id, dispute);
  assert.equal((await deliver('evt_ordered_dispute', 'charge.dispute.created', dispute)).status, 200);
  const disputeReversal = [...fake.reversals.values()].find((r) => r.metadata.disputeId === dispute.id); assert.equal(disputeReversal.amount, remaining); assert.equal(transfer.amount_reversed, transfer.amount);
  const refundedCalls = fake.calls.filter((c) => c.method === 'POST' && c.path === '/v1/refunds').length;
  assert.equal((await app.call('PATCH', `/admin/invoices/${invoice.id}`, { action: 'Refund', reason: 'Disputed cancellation' }, admin)).status, 409);
  assert.equal(fake.calls.filter((c) => c.method === 'POST' && c.path === '/v1/refunds').length, refundedCalls);
  dispute.status = 'won'; assert.equal((await deliver('evt_ordered_closed', 'charge.dispute.closed', dispute)).status, 200);
  assert.equal((await deliver('evt_ordered_late_created', 'charge.dispute.created', { ...dispute, status: 'needs_response' })).status, 200);
  for (const type of ['checkout.session.completed', 'checkout.session.async_payment_failed', 'checkout.session.async_payment_succeeded']) assert.equal((await deliver(`evt_terminal_${type.split('.').at(-1)}`, type, { ...session, payment_status: type.endsWith('failed') ? 'unpaid' : 'paid' })).status, 200);
  assert.equal((await app.call('GET', `/invoices/${invoice.id}`, undefined, customer)).invoice.status, 'Disputed'); assert.equal(fake.transfers.size, 1); assert.equal(fake.reversals.size, 2);
  const { readDb } = require('./helpers'), db = await readDb(app.dataDir); assert.equal(db.disputes[0].status, 'Resolved'); assert.equal(db.meta.stripe.appliedReceipts.evt_ordered_late_created.type, 'charge.dispute.created');
});
