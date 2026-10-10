const { test } = require('node:test');
const assert = require('node:assert/strict');
const fs = require('node:fs');
const os = require('node:os');
const path = require('node:path');
const Stripe = require('stripe');
const { openStore } = require('../store');
const atomic = require('../stripe-commit');
const createPayoutOperations = require('../payout-operations');
const { startFakeStripe } = require('./fake-stripe');
let serial = 0;
async function fixture(kind, work) {
  const dir = fs.mkdtempSync(path.join(os.tmpdir(), 'craftcrew-money-'));
  const fake = await startFakeStripe();
  let admin, schema, url, store;
  try {
    if (kind === 'postgres') {
      admin = new (require('pg').Client)({ connectionString: process.env.DATABASE_URL }); await admin.connect();
      schema = `money_${process.pid}_${++serial}`; await admin.query(`create schema ${schema}`);
      const u = new URL(process.env.DATABASE_URL); u.searchParams.set('options', `-c search_path=${schema}`); url = u.toString();
    }
    const open = () => openStore({ kind, dataDir: dir, url }); store = open(); store.loadSync();
    let db = { settings: { platformFeePercent: 3 }, users: [], suppliers: [{ id: 'supplier', stripeAccount: { id: 'acct_fake1', transfers: 'active' } }],
      invoices: [{ id: 'invoice', supplierId: 'supplier', customerId: 'buyer', status: 'Paid', amount: 1190, grossAmount: 1190, netAmount: 1000 }],
      payments: [{ id: 'payment', invoiceId: 'invoice', status: 'Paid', amount: 1190, netAmount: 1000, platformFee: 30, platformFeePercent: 3, stripe: { checkout: { chargeId: 'ch_1', paymentIntentId: 'pi_1', customerId: 'cus_1' } } }],
      disputes: [], stripeFinancialRecords: [], stripeOperations: [], meta: {} };
    store.save(db); await store.flush();
    const endpoint = new URL(fake.base), client = new Stripe('sk_test_fake', { host: endpoint.hostname, port: Number(endpoint.port), protocol: 'http', maxNetworkRetries: 0 });
    let refusing = false;
    const handlers = new Map();
    const build = () => createPayoutOperations({ getDb: () => db, client, enabled: true, gate: atomic.createGate(),
      payouts: { transfer: (supplierId, params, options) => client.transfers.create({ ...params, destination: 'acct_fake1' }, options) },
      on: (type, handler) => handlers.set(type, handler), now: () => new Date().toISOString(),
      commitStage: async (input) => {
        if (kind === 'json' && refusing && input.stage.additions.some((a) => a.collection === 'stripeFinancialRecords')) fs.mkdirSync(path.join(dir, 'db.json.tmp'));
        return store.commitStage(input);
      }, send() {}, body: async () => ({}) });
    let ops = build();
    await work({ dir, fake, admin, schema, handlers, get db() { return db; }, get ops() { return ops; }, get store() { return store; },
      async refuse() {
        refusing = true;
        if (kind === 'postgres') await admin.query(`create function ${schema}.refuse_money() returns trigger language plpgsql as $$ begin if new.collection='stripeFinancialRecords' then raise exception 'injected money constraint'; end if; return new; end $$; create trigger refuse_money before insert on ${schema}.records for each row execute function ${schema}.refuse_money()`);
      },
      async recover() {
        refusing = false;
        if (kind === 'json') fs.rmSync(path.join(dir, 'db.json.tmp'), { recursive: true, force: true });
        else await admin.query(`drop trigger refuse_money on ${schema}.records`);
        await store.close?.(); store = open(); db = store.loadSync(); ops = build();
      },
    });
  } finally {
    await store?.close?.(); if (schema) await admin.query(`drop schema ${schema} cascade`); await admin?.end();
    await fake.stop(); fs.rmSync(dir, { recursive: true, force: true });
  }
}
for (const kind of ['json', 'postgres']) {
  const options = { skip: kind === 'postgres' && !process.env.DATABASE_URL };
  test(`T283b1 ${kind} transfer refusal retains provider reference and retry publishes one history`, options, async () => fixture(kind, async (f) => {
    await f.refuse(); await f.ops.settle(f.db.payments[0], f.db.invoices[0], 'ch_1');
    assert.equal(f.fake.transfers.size, 1); assert.equal(f.db.stripeFinancialRecords.length, 0);
    assert.equal(f.db.stripeOperations[0].status, 'unknown'); assert.ok(f.db.stripeOperations[0].providerRef);
    assert.equal(f.db.payments[0].stripe.payout?.transferId, undefined);
    await f.recover(); await f.ops.settle(f.db.payments[0], f.db.invoices[0], 'ch_1');
    assert.equal(f.fake.transfers.size, 1); assert.equal(f.db.stripeFinancialRecords.length, 1);
    assert.equal(f.db.stripeOperations[0].status, 'succeeded');
    assert.equal(f.db.payments[0].stripe.payout.transferId, f.db.stripeFinancialRecords[0].providerRef);
  }));
  test(`T283b1 ${kind} refund rollback preserves linked statuses and retries existing refund/reversal`, options, async () => fixture(kind, async (f) => {
    await f.ops.settle(f.db.payments[0], f.db.invoices[0], 'ch_1'); await f.refuse();
    await assert.rejects(f.ops.refundInvoice('invoice', 'Cancellation'));
    assert.equal(f.db.payments[0].status, 'Paid'); assert.equal(f.db.invoices[0].status, 'Paid');
    assert.equal(f.db.stripeFinancialRecords.length, 1);
    assert.ok(f.db.stripeOperations.filter((o) => o.kind !== 'transfer').every((o) => o.status === 'unknown' && o.providerRef));
    await f.recover(); await f.ops.refundInvoice('invoice', 'Cancellation');
    assert.equal(f.fake.refunds.size, 1); assert.equal(f.fake.reversals.size, 1);
    assert.equal(f.db.payments[0].status, 'Refunded'); assert.equal(f.db.invoices[0].status, 'Refunded');
    assert.equal(f.db.stripeFinancialRecords.length, 3); assert.ok(f.db.stripeOperations.every((o) => o.status === 'succeeded'));
    const history = structuredClone(f.db.stripeFinancialRecords);
    await f.ops.refundInvoice('invoice', 'Cancellation'); assert.deepEqual(f.db.stripeFinancialRecords, history);
    const stage = atomic.createStage(); stage.patch('stripeFinancialRecords', history[0].id, { amountMinor: 1 });
    await assert.rejects(f.store.commitStage({ getDb: () => f.db, stage }), /history/);
    if (kind === 'json') {
      const damaged = structuredClone(f.db); damaged.stripeFinancialRecords.pop(); assert.throws(() => f.store.save(damaged), /history/);
    } else {
      await assert.rejects(f.admin.query(`update ${f.schema}.records set data=jsonb_set(data,'{amountMinor}','1') where collection='stripeFinancialRecords'`), /history/);
      await assert.rejects(f.admin.query(`delete from ${f.schema}.records where collection='stripeFinancialRecords'`), /history/);
      await f.admin.query(`update ${f.schema}.records set pos=pos+1 where collection='stripeFinancialRecords'`);
    }
  }));
  test(`T283b1 ${kind} dispute commits reversal history and locks disputed invoice amounts`, options, async () => fixture(kind, async (f) => {
    await f.ops.settle(f.db.payments[0], f.db.invoices[0], 'ch_1');
    const handler = f.handlers.get('charge.dispute.created');
    f.fake.disputes.set('dp_1', { id: 'dp_1', object: 'dispute', charge: 'ch_1', status: 'needs_response', amount: 119000, currency: 'eur', livemode: false, payment_intent: 'pi_1' });
    f.fake.charges.set('ch_1', { id: 'ch_1', amount: 119000, amount_captured: 119000, paid: true, status: 'succeeded', customer: 'cus_1', currency: 'eur', livemode: false, payment_intent: f.db.payments[0].stripe.checkout.paymentIntentId });
    const prepared = await handler.prepare({ id: 'dp_1', charge: 'ch_1', status: 'needs_response' }, { type: 'charge.dispute.created' });
    const stage = atomic.createStage(); handler.stage({ stage, prepared });
    await f.refuse(); if (kind === 'json') fs.mkdirSync(path.join(f.dir, 'db.json.tmp')); await assert.rejects(f.store.commitStage({ getDb: () => f.db, stage }));
    assert.equal(f.db.invoices[0].status, 'Paid'); assert.equal(f.db.disputes.length, 0); assert.equal(f.db.stripeFinancialRecords.length, 1);
    assert.equal(f.fake.reversals.size, 1);
    await f.recover();
    const retryPrepared = await f.handlers.get('charge.dispute.created').prepare({ id: 'dp_1', charge: 'ch_1', status: 'needs_response' }, { type: 'charge.dispute.created' });
    const retry = atomic.createStage(); f.handlers.get('charge.dispute.created').stage({ stage: retry, prepared: retryPrepared });
    await f.store.commitStage({ getDb: () => f.db, stage: retry }); assert.equal(f.fake.reversals.size, 1);
    assert.equal(f.db.invoices[0].status, 'Disputed'); assert.equal(f.db.stripeFinancialRecords.length, 2);
    assert.ok(f.db.stripeOperations.every((o) => o.status === 'succeeded'));
    if (kind === 'postgres') await assert.rejects(f.admin.query(`update ${f.schema}.invoices set gross_amount=1 where id='invoice'`), /approved/);
  }));
}
