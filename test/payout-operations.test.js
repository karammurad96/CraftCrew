const test = require("node:test");
const assert = require("node:assert/strict");
const Stripe = require("stripe");
const { startFakeStripe } = require("./fake-stripe");
const atomic = require("../stripe-commit");
const createPayoutOperations = require("../payout-operations");

function fixture(fake) {
  const db = { settings: { platformFeePercent: 3 }, users: [{ id: "buyer", role: "customer" }],
    suppliers: [{ id: "supplier", stripeAccount: { id: "acct_fake1", transfers: "active" } }],
    invoices: [{ id: "invoice", projectId: "project", customerId: "buyer", supplierId: "supplier", status: "Paid", amount: 1190, grossAmount: 1190, netAmount: 1000, vatMode: "standard", vatRate: 19 }],
    payments: [{ id: "payment", invoiceId: "invoice", status: "Paid", amount: 1190, stripe: { checkout: { chargeId: "ch_1", paymentIntentId: "pi_1" } } }], disputes: [], meta: {} };
  const url = new URL(fake.base), client = new Stripe("sk_test_fake", { host: url.hostname, port: Number(url.port), protocol: "http", maxNetworkRetries: 0 });
  const handlers = new Map(), gate = atomic.createGate();
  const ctx = { getDb: () => db, client, enabled: true, payouts: { transfer: (supplierId, params, options) => client.transfers.create({ ...params, destination: db.suppliers.find((s) => s.id === supplierId).stripeAccount.id }, options) },
    on: (type, handler) => handlers.set(type, handler), gate, now: () => "2026-10-09T00:00:00.000Z", send() {}, body: async () => ({}), activity() {},
    commitStage: async ({ stage }) => { atomic.validate(db, stage); atomic.publish(db, stage); } };
  return { db, handlers, ops: createPayoutOperations(ctx) };
}

test("T273 transfers the supplier share with source charge and pinned fee breakdown", async (t) => {
  const fake = await startFakeStripe(); t.after(() => fake.stop()); const f = fixture(fake);
  await f.handlers.get("checkout.session.completed").afterCommit({ status: "paid", invoiceId: "invoice" });
  const call = fake.calls.find((entry) => entry.path === "/v1/transfers");
  assert.equal(call.body.amount, "116000"); assert.equal(call.body.currency, "eur");
  assert.equal(call.body.transfer_group, "invoice"); assert.equal(call.body.source_transaction, "ch_1");
  assert.equal(f.db.payments[0].stripe.payout.breakdown.platformFeeMinor, 3000);
  assert.equal(f.db.payments[0].stripe.payout.breakdown.supplierMinor, 116000);
  assert.equal(f.db.payments[0].stripe.payout.breakdown.feeVatMinor, 570);
});

test("T273 refunds and reverses a separate transfer, with retry-safe provider identities", async (t) => {
  const fake = await startFakeStripe(); t.after(() => fake.stop()); const f = fixture(fake);
  await f.handlers.get("checkout.session.completed").afterCommit({ status: "paid", invoiceId: "invoice" });
  const first = await f.ops.refundInvoice("invoice", "Customer cancellation");
  assert.equal(first.status, "Refunded"); assert.equal(fake.refunds.size, 1); assert.equal(fake.reversals.size, 1);
  assert.equal(fake.transfers.values().next().value.amount_reversed, 119000 - 3000);
  assert.equal(f.db.payments[0].stripe.payout.refundStatus, "refunded");
});

test("T273 disputes reverse the transfer and create an admin escalation", async (t) => {
  const fake = await startFakeStripe(); t.after(() => fake.stop()); const f = fixture(fake);
  await f.handlers.get("checkout.session.completed").afterCommit({ status: "paid", invoiceId: "invoice" });
  const event = { id: "evt_dispute_1", type: "charge.dispute.created" }, object = { id: "dp_1", charge: "ch_1", amount: 116000, status: "needs_response" };
  const prepared = await f.handlers.get(event.type).prepare(object, event); const stage = atomic.createStage();
  f.handlers.get(event.type).stage({ stage, prepared, event }); atomic.validate(f.db, stage); atomic.publish(f.db, stage);
  assert.equal(f.db.invoices[0].status, "Disputed"); assert.equal(f.db.disputes[0].status, "Open");
  assert.equal(f.db.payments[0].stripe.payout.disputeReversalId, prepared.reversal.id);
  assert.equal(fake.reversals.size, 1);
});
