const test = require("node:test");
const assert = require("node:assert/strict");
const Stripe = require("stripe");
const { startFakeStripe } = require("./fake-stripe");
const atomic = require("../stripe-commit");
const createPayoutOperations = require("../payout-operations");

function fixture(fake, afterTransfer = () => {}) {
  const db = { settings: { platformFeePercent: 3 }, users: [{ id: "buyer", role: "customer" }],
    suppliers: [{ id: "supplier", stripeAccount: { id: "acct_fake1", transfers: "active" } }],
    invoices: [{ id: "invoice", projectId: "project", customerId: "buyer", supplierId: "supplier", status: "Paid", amount: 1190, grossAmount: 1190, netAmount: 1000, vatMode: "standard", vatRate: 19 }],
    payments: [{ id: "payment", invoiceId: "invoice", status: "Paid", amount: 1190, netAmount: 1000, platformFee: 30, platformFeePercent: 3, stripe: { checkout: { chargeId: "ch_1", paymentIntentId: "pi_1" } } }], disputes: [], meta: {} };
  const url = new URL(fake.base), client = new Stripe("sk_test_fake", { host: url.hostname, port: Number(url.port), protocol: "http", maxNetworkRetries: 0 });
  const handlers = new Map(), gate = atomic.createGate();
  const ctx = { getDb: () => db, client, enabled: true, payouts: { transfer: async (supplierId, params, options) => {
    const result = await client.transfers.create({ ...params, destination: db.suppliers.find((s) => s.id === supplierId).stripeAccount.id }, options);
    afterTransfer(db); return result;
  } },
    on: (type, handler) => handlers.set(type, handler), gate, now: () => "2026-10-09T00:00:00.000Z", send() {}, body: async () => ({}), activity() {},
    commitStage: async ({ stage }) => { atomic.validate(db, stage); atomic.publish(db, stage); } };
  return { db, handlers, ctx, ops: createPayoutOperations(ctx) };
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
  assert.equal(first.amount, 1190);
  assert.equal(fake.transfers.values().next().value.amount_reversed, 119000 - 3000);
  assert.equal(f.db.payments[0].stripe.payout.refundStatus, "refunded");
});

test("T283a Checkout listener derives its own transition from verified staged payment", async (t) => {
  const fake = await startFakeStripe(); t.after(() => fake.stop()); const f = fixture(fake);
  const payment = f.db.payments[0]; payment.status = "Scheduled";
  const stage = atomic.createStage();
  stage.patch("payments", payment.id, { status: "Paid", stripe: { ...payment.stripe, checkout: { ...payment.stripe.checkout, sessionId: "cs_verified" } } }, { status: "Scheduled" });
  const handler = f.handlers.get("checkout.session.completed");
  const transition = handler.stage({ stage, object: { id: "cs_verified", metadata: { invoiceId: "invoice", paymentId: "payment" } } });
  assert.deepEqual(transition, { status: "paid", invoiceId: "invoice" });
  atomic.validate(f.db, stage); atomic.publish(f.db, stage);
  await handler.afterCommit(transition);
  assert.equal(fake.transfers.size, 1);
  assert.equal(f.db.stripeOperations.find((row) => row.kind === "transfer").status, "succeeded");
  assert.equal(handler.stage({ stage: atomic.createStage(), object: { id: "cs_wrong", metadata: { invoiceId: "invoice", paymentId: "payment" } } }), undefined);
});

test("T283a concurrent settlement creates one supplier transfer and reuses its identity", async (t) => {
  const fake = await startFakeStripe(); t.after(() => fake.stop()); const f = fixture(fake);
  await Promise.all([f.ops.settle(f.db.payments[0], f.db.invoices[0], "ch_1"), f.ops.settle(f.db.payments[0], f.db.invoices[0], "ch_1")]);
  assert.equal(fake.transfers.size, 1);
  const intents = f.db.stripeOperations.filter((row) => row.kind === "transfer");
  assert.equal(intents.length, 1);
  assert.equal(intents[0].providerRef, [...fake.transfers.values()][0].id);
  assert.equal(f.db.payments[0].stripe.payout.transferId, intents[0].providerRef);
});

test("T283a deliberate partial refunds get distinct identities and retain cumulative totals", async (t) => {
  const fake = await startFakeStripe(); t.after(() => fake.stop()); const f = fixture(fake);
  await f.ops.settle(f.db.payments[0], f.db.invoices[0], "ch_1");
  const first = await f.ops.refundInvoice("invoice", "First agreed partial refund", 100, "partial_one");
  const second = await f.ops.refundInvoice("invoice", "Second agreed partial refund", 100, "partial_two");
  assert.equal(first.amount, 100); assert.equal(second.amount, 100);
  assert.notEqual(first.refundId, second.refundId);
  assert.equal(fake.refunds.size, 2);
  assert.equal(f.db.payments[0].stripe.payout.refundedMinor, 20000);
  const records = f.db.stripeOperations.filter((row) => row.kind === "refund");
  assert.equal(records.length, 2); assert.notEqual(records[0].idempotencyKey, records[1].idempotencyKey);
  await assert.rejects(f.ops.refundInvoice("invoice", "Over-refund", 1000, "partial_over"), /invalid/);
  assert.equal(fake.refunds.size, 2);
});

test("T283a simultaneous retries of one partial refund apply once, even after success", async (t) => {
  const fake = await startFakeStripe(); t.after(() => fake.stop()); const f = fixture(fake);
  await f.ops.settle(f.db.payments[0], f.db.invoices[0], "ch_1");
  const refunds = await Promise.all([f.ops.refundInvoice("invoice", "Agreed refund", 100, "request_same"), f.ops.refundInvoice("invoice", "Agreed refund", 100, "request_same")]);
  assert.equal(refunds[0].refundId, refunds[1].refundId);
  assert.equal(f.db.payments[0].stripe.payout.refundedMinor, 10000);
  assert.equal(fake.refunds.size, 1); assert.equal(fake.reversals.size, 1);
  await assert.rejects(f.ops.refundInvoice("invoice", "Agreed refund", 200, "request_same"), /invalid/);
  await assert.rejects(f.ops.refundInvoice("invoice", "Agreed refund", 100), /request ID/);
  assert.equal(fake.refunds.size, 1);
});

test("T283a full refund retries preserve the same refund after payment becomes Refunded", async (t) => {
  const fake = await startFakeStripe(); t.after(() => fake.stop()); const f = fixture(fake);
  await f.ops.settle(f.db.payments[0], f.db.invoices[0], "ch_1");
  const first = await f.ops.refundInvoice("invoice", "Full refund");
  const second = await f.ops.refundInvoice("invoice", "Full refund");
  assert.equal(first.refundId, second.refundId); assert.equal(fake.refunds.size, 1);
  assert.equal(second.status, "Refunded");
});

test("T283a supplier and customer actors cannot request administrative refunds", async (t) => {
  const fake = await startFakeStripe(); t.after(() => fake.stop()); const f = fixture(fake);
  for (const role of ["supplier", "customer"]) {
    const handled = await f.ops.handle({ method: "PATCH" }, {}, {}, ["api", "admin", "invoices", "invoice"], { id: "unauthorized", role });
    assert.equal(handled, false);
  }
  assert.equal(fake.calls.length, 0);
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

for (const [field, value] of [["customerId", "different-buyer"], ["number", "changed-number"], ["vatRate", 0]]) test(`T283b1 changed invoice ${field} while provider works refuses local settlement success`, async (t) => {
  const fake = await startFakeStripe(); t.after(() => fake.stop());
  const f = fixture(fake, (db) => { db.invoices[0][field] = value; });
  await f.ops.settle(f.db.payments[0], f.db.invoices[0], "ch_1");
  assert.equal(fake.transfers.size, 1); assert.equal(f.db.stripeFinancialRecords?.length || 0, 0);
  assert.equal(f.db.stripeOperations[0].status, "unknown"); assert.equal(f.db.payments[0].stripe.payout?.transferId, undefined);
});

test("T283b1 an existing history identity with different binding refuses publication", async (t) => {
  const fake = await startFakeStripe(); t.after(() => fake.stop()); const f = fixture(fake);
  await f.ops.settle(f.db.payments[0], f.db.invoices[0], "ch_1");
  f.db.stripeFinancialRecords[0].providerRef = "tr_other";
  delete f.db.payments[0].stripe.payout.transferId;
  await f.ops.settle(f.db.payments[0], f.db.invoices[0], "ch_1");
  assert.equal(fake.transfers.size, 1); assert.equal(f.db.stripeFinancialRecords.length, 1);
  assert.equal(f.db.payments[0].stripe.payout.transferId, undefined);
});
test("T283b2 approved payment fee changes during transfer refuse linked settlement", async (t) => {
  const fake = await startFakeStripe(); t.after(() => fake.stop());
  const f = fixture(fake, (db) => { db.payments[0].platformFee = 60; db.payments[0].platformFeePercent = 6; });
  await f.ops.settle(f.db.payments[0], f.db.invoices[0], "ch_1");
  assert.equal(fake.transfers.size, 1); assert.equal(f.db.stripeOperations[0].status, "unknown");
  assert.equal(f.db.payments[0].stripe.payout?.transferId, undefined); assert.equal(f.db.stripeFinancialRecords?.length || 0, 0);
});

for (const type of ['transfer', 'refund', 'transfer_reversal']) test(`T283c1 expired ${type} first-reference refusal retrieves accepted provider object without another POST`, async (t) => {
  const fake = await startFakeStripe(); t.after(() => fake.stop()); const f = fixture(fake);
  if (type !== 'transfer') await f.ops.settle(f.db.payments[0], f.db.invoices[0], 'ch_1');
  let clock = '2026-10-09T00:00:00.000Z', refusing = true;
  f.ctx.now = () => clock;
  const commit = f.ctx.commitStage;
  f.ctx.commitStage = async (input) => {
    if (refusing && input.stage.patches.some((p) => p.collection === 'stripeOperations' && p.fields.providerType === type)) throw new Error('first reference storage refused');
    return commit(input);
  };
  let ops = createPayoutOperations(f.ctx);
  if (type === 'transfer') await ops.settle(f.db.payments[0], f.db.invoices[0], 'ch_1');
  else await assert.rejects(ops.refundInvoice('invoice', 'Cancellation'), /storage refused/);
  const op = f.db.stripeOperations.find((row) => row.kind === type);
  assert.equal(op.status, 'pending'); assert.equal(op.providerRef, null);
  const identity = op.id, key = op.idempotencyKey;
  refusing = false; clock = '2026-10-10T00:00:00.000Z'; ops = createPayoutOperations(f.ctx);
  if (type === 'transfer') await ops.settle(f.db.payments[0], f.db.invoices[0], 'ch_1');
  else assert.equal((await ops.refundInvoice('invoice', 'Cancellation')).status, 'Refunded');
  const recovered = f.db.stripeOperations.find((row) => row.id === identity);
  assert.equal(recovered.status, 'succeeded'); assert.equal(recovered.idempotencyKey, key);
  const path = type === 'transfer' ? '/v1/transfers' : type === 'refund' ? '/v1/refunds' : '/v1/transfers/tr_fake1/reversals';
  assert.equal(fake.calls.filter((call) => call.method === 'POST' && call.path === path).length, 1);
  assert.equal(fake.transfers.size, 1);
});
test('T283c1 indistinguishable pending partial refunds cannot claim one remote refund after expiry', async (t) => {
  const fake = await startFakeStripe(); t.after(() => fake.stop()); const f = fixture(fake);
  await f.ops.settle(f.db.payments[0], f.db.invoices[0], 'ch_1');
  let clock = '2026-10-09T00:00:00.000Z', fail = true; f.ctx.now = () => clock;
  const commit = f.ctx.commitStage;
  f.ctx.commitStage = async (input) => { if (fail && input.stage.patches.some((p) => p.collection === 'stripeOperations' && p.fields.providerType === 'refund')) throw new Error('reference refused'); return commit(input); };
  let ops = createPayoutOperations(f.ctx);
  await assert.rejects(ops.refundInvoice('invoice', 'Partial cancellation', 100, 'request-first'), /reference refused/);
  const first = f.db.stripeOperations.find((row) => row.kind === 'refund');
  const operations = require('../stripe-operations')(f.ctx);
  await operations.reserve({ ...first, logicalKey: 'refund:payment:request-second' });
  fail = false; clock = '2026-10-10T00:00:00.000Z'; ops = createPayoutOperations(f.ctx);
  await assert.rejects(ops.refundInvoice('invoice', 'Partial cancellation', 100, 'request-first'), /reconciliation/);
  assert.equal(f.db.payments[0].status, 'Paid'); assert.equal(f.db.payments[0].stripe.payout.refundedMinor, undefined);
  assert.equal(fake.calls.filter((c) => c.method === 'POST' && c.path === '/v1/refunds').length, 1);
  assert.equal(first.providerRef, null); assert.equal(fake.reversals.size, 0);
});
