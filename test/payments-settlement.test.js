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
  const invoice = await submitInvoice(app, supplier.token, project, phase, tasks[0], 1000);
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
