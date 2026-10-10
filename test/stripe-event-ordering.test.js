const test = require('node:test');
const assert = require('node:assert/strict');
const fs = require('node:fs'), path = require('node:path'), os = require('node:os'), http = require('node:http');
const { openStore } = require('../store');
const createPayments = require('../payments');
const { startFakeStripe } = require('./fake-stripe');
let serial = 0;
async function fixture(kind, paid, work) {
  const dir = fs.mkdtempSync(path.join(os.tmpdir(), 'stripe-ordering-')); let admin, schema, url, server;
  const metadata = { invoiceId: 'invoice', projectId: 'project', supplierId: 'supplier', paymentId: 'payment', customerId: 'buyer', checkoutAttemptId: 'attempt' };
  const session = { id: 'cs_ordered', object: 'checkout.session', mode: 'payment', livemode: false, integration_identifier: 'craftcrew-invoice', customer: 'cus_buyer', client_reference_id: 'invoice', amount_total: 119000, currency: 'eur', metadata, status: 'complete', payment_status: 'paid', payment_intent: 'pi_ordered' };
  const fake = await startFakeStripe({ 'GET /v1/checkout/sessions/:id': () => session, 'GET /v1/payment_intents/:id': () => ({ id: 'pi_ordered', livemode: false, amount: 119000, currency: 'eur', customer: 'cus_buyer', metadata, status: 'succeeded', latest_charge: 'ch_ordered' }) });
  fake.charges.set('ch_ordered', { id: 'ch_ordered', object: 'charge', livemode: false, amount: 119000, amount_captured: 119000, currency: 'eur', customer: 'cus_buyer', payment_intent: 'pi_ordered', paid: true, status: 'succeeded' });
  fake.accounts.set('acct_fake1', { id: 'acct_fake1', transfers: 'active', created: new Date().toISOString() });
  try {
    if (kind === 'postgres') { admin = new (require('pg').Client)({ connectionString: process.env.DATABASE_URL }); await admin.connect(); schema = `ordering_${process.pid}_${++serial}`; await admin.query(`create schema ${schema}`); const u = new URL(process.env.DATABASE_URL); u.searchParams.set('options', `-c search_path=${schema}`); url = u.toString(); }
    const store = openStore({ kind, dataDir: dir, url }); store.loadSync();
    const invoice = { id: 'invoice', number: 'INV-1', projectId: 'project', customerId: 'buyer', supplierId: 'supplier', amount: 1190, grossAmount: 1190, netAmount: 1000, status: 'Approved' };
    const frozen = { ...invoice }; delete frozen.id; delete frozen.number;
    const db = { invoices: [{ ...invoice, status: paid ? 'Paid' : 'Approved' }], payments: [{ id: 'payment', invoiceId: 'invoice', status: paid ? 'Paid' : 'Scheduled', amount: 1190, netAmount: 1000, platformFee: 30, platformFeePercent: 3, stripe: { checkout: { attemptId: 'attempt', sessionId: session.id, customerId: 'cus_buyer', amount: 119000, invoiceBinding: frozen, ...(paid ? { paymentIntentId: 'pi_ordered', chargeId: 'ch_ordered' } : {}) } } }], suppliers: [{ id: 'supplier', stripeAccount: { id: 'acct_fake1', transfers: 'active' } }], users: [{ id: 'buyer', role: 'customer' }, { id: 'supplier-owner', role: 'supplier', supplierId: 'supplier', status: 'Active', companyProfile: {} }], settings: {}, stripeFinancialRecords: [], stripeOperations: [], disputes: [], notifications: [], outbox: [], meta: {} };
    store.save(db); await store.flush(); let failTransfer = false, delayDispute, refuseDispute = false;
    const p = createPayments({ getDb: () => db, env: fake.env, save() {}, inbox: store.stripeInbox, commit: async () => { store.save(db); await store.flush(); }, commitStripe: async (job) => { if (job.stage.additions.some((a) => a.collection === 'disputes')) { if (delayDispute) await delayDispute(); if (refuseDispute) throw new Error('strict dispute commit refused'); } return store.commitStripe(job); }, commitStage: async (job) => { if (failTransfer && job.stage.additions.some((a) => a.collection === 'stripeFinancialRecords' && a.record.kind === 'transfer')) throw new Error('strict transfer commit refused'); return store.commitStage(job); }, now: () => new Date().toISOString(), appUrl: () => 'https://example.test', activity() {}, id: (prefix) => `${prefix}_${++serial}`, send: (res, status, body) => { res.writeHead(status, { 'Content-Type': 'application/json' }); res.end(JSON.stringify(body)); } });
    server = http.createServer((req, res) => p.webhook(req, res)); await new Promise((r) => server.listen(0, '127.0.0.1', r));
    const deliver = async (id, type, object) => { const signed = fake.signed({ id, type, data: { object } }); return fetch(`http://127.0.0.1:${server.address().port}/webhook`, { method: 'POST', headers: { 'Stripe-Signature': signed.header }, body: signed.payload }); };
    await work({ db, fake, session, p, deliver, set failTransfer(v) { failTransfer = v; }, set delayDispute(v) { delayDispute = v; }, set refuseDispute(v) { refuseDispute = v; } });
  } finally { if (server) await new Promise((r) => server.close(r)); await fake.stop(); if (schema) await admin.query(`drop schema ${schema} cascade`); await admin?.end(); fs.rmSync(dir, { recursive: true, force: true }); }
}
for (const kind of ['json', 'postgres']) {
  const opts = { skip: kind === 'postgres' && !process.env.DATABASE_URL };
  test(`T283c2 ${kind} signed canonical-paid repeat recovers accepted transfer after local refusal`, opts, async () => fixture(kind, false, async (f) => {
    f.failTransfer = true;
    assert.equal((await f.deliver('evt_original_paid', 'checkout.session.completed', f.session)).status, 200);
    assert.equal(f.db.payments[0].status, 'Paid'); assert.equal(f.fake.transfers.size, 1); assert.equal(f.db.payments[0].stripe.payout.transferId, undefined);
    await assert.rejects(f.p.payoutOperations.refundInvoice('invoice', 'Refund before transfer recovery'), /could not be verified/);
    assert.equal(f.fake.refunds.size, 0, 'unresolved supplier money must be recovered before any refund POST');
    f.failTransfer = false; f.session.payment_status = 'unpaid';
    assert.equal((await f.deliver('evt_late_unpaid', 'checkout.session.async_payment_failed', f.session)).status, 200);
    assert.equal(f.db.payments[0].stripe.payout.transferId, undefined, 'canonical-unpaid must not release supplier funds');
    f.session.payment_status = 'paid';
    assert.equal((await f.deliver('evt_retry_paid', 'checkout.session.completed', f.session)).status, 200);
    assert.equal(f.fake.transfers.size, 1); assert.ok(f.db.payments[0].stripe.payout.transferId); assert.equal(f.db.stripeFinancialRecords.length, 1);
    assert.equal(f.fake.calls.filter((c) => c.method === 'POST' && c.path === '/v1/transfers').length, 1);
    assert.equal((await f.p.payoutOperations.refundInvoice('invoice', 'Refund after transfer recovery')).status, 'Refunded');
    assert.equal(f.fake.refunds.size, 1); assert.equal(f.fake.reversals.size, 1);
  }));
  for (const refusal of [false, true]) test(`T283c2 ${kind} dispute queue holds through strict commit ${refusal ? 'failure' : 'success'} and then releases refund`, opts, async () => fixture(kind, true, async (f) => {
    await f.p.payoutOperations.settle(f.db.payments[0], f.db.invoices[0], 'ch_ordered');
    const dispute = { id: 'dp_serial', object: 'dispute', livemode: false, charge: 'ch_ordered', payment_intent: 'pi_ordered', amount: 119000, currency: 'eur', status: 'needs_response' }; f.fake.disputes.set(dispute.id, dispute);
    let release, entered; const waiting = new Promise((r) => { release = r; }), started = new Promise((r) => { entered = r; }); f.delayDispute = async () => { entered(); await waiting; }; f.refuseDispute = refusal;
    const delivery = f.deliver('evt_serial_dispute', 'charge.dispute.created', dispute); await started;
    let refundFinished = false; const refund = f.p.payoutOperations.refundInvoice('invoice', 'Concurrent cancellation').then(() => { refundFinished = true; }, () => { refundFinished = true; });
    await new Promise((r) => setImmediate(r)); assert.equal(refundFinished, false); assert.equal(f.fake.refunds.size, 0, 'refund must not call provider while dispute strict commit is pending');
    release(); assert.equal((await delivery).status, refusal ? 503 : 200); await refund; assert.equal(refundFinished, true); assert.equal(f.fake.refunds.size, 0);
    assert.equal(f.db.invoices[0].status, refusal ? 'Paid' : 'Disputed'); assert.equal(f.db.disputes.length, refusal ? 0 : 1);
  }));
}
for (const kind of ['json', 'postgres']) test(`T283c2 ${kind} signed closed-before-created dispute never reverses funds or reopens terminal history`, { skip: kind === 'postgres' && !process.env.DATABASE_URL }, async () => fixture(kind, true, async (f) => {
  await f.p.payoutOperations.settle(f.db.payments[0], f.db.invoices[0], 'ch_ordered');
  const dispute = { id: 'dp_closed_first', object: 'dispute', livemode: false, charge: 'ch_ordered', payment_intent: 'pi_ordered', amount: 119000, currency: 'eur', status: 'won' }; f.fake.disputes.set(dispute.id, dispute);
  assert.equal((await f.deliver('evt_closed_first', 'charge.dispute.closed', dispute)).status, 200); assert.equal(f.db.disputes[0].status, 'Resolved');
  dispute.status = 'needs_response';
  assert.equal((await f.deliver('evt_created_late', 'charge.dispute.created', dispute)).status, 200); assert.equal(f.db.disputes[0].status, 'Resolved'); assert.equal(f.db.disputes[0].resolution, 'won');
  assert.equal(f.fake.reversals.size, 0); assert.equal(f.fake.transfers.size, 1); assert.equal(f.db.invoices[0].status, 'Disputed'); assert.equal(f.db.payments[0].stripe.payout.disputeStatus, 'won');
  assert.equal(f.db.meta.stripe.appliedReceipts.evt_created_late.type, 'charge.dispute.created');
}));
for (const kind of ['json', 'postgres']) test(`T283c2 ${kind} signed dispute waits for unlinked accepted original transfer recovery`, { skip: kind === 'postgres' && !process.env.DATABASE_URL }, async () => fixture(kind, false, async (f) => {
  f.failTransfer = true;
  assert.equal((await f.deliver('evt_transfer_before_dispute', 'checkout.session.completed', f.session)).status, 200);
  const dispute = { id: 'dp_unlinked', object: 'dispute', livemode: false, charge: 'ch_ordered', payment_intent: 'pi_ordered', amount: 119000, currency: 'eur', status: 'needs_response' }; f.fake.disputes.set(dispute.id, dispute);
  assert.equal((await f.deliver('evt_dispute_unlinked', 'charge.dispute.created', dispute)).status, 500);
  assert.equal(f.db.invoices[0].status, 'Paid'); assert.equal(f.db.disputes.length, 0); assert.equal(f.fake.reversals.size, 0);
  f.failTransfer = false;
  assert.equal((await f.deliver('evt_transfer_recovered', 'checkout.session.completed', f.session)).status, 200);
  assert.equal((await f.deliver('evt_dispute_unlinked', 'charge.dispute.created', dispute)).status, 200);
  assert.equal(f.db.invoices[0].status, 'Disputed'); assert.equal(f.fake.transfers.size, 1); assert.equal(f.fake.reversals.size, 1);
  assert.equal(f.fake.calls.filter((c) => c.method === 'POST' && c.path === '/v1/transfers').length, 1);
}));
