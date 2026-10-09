const { test } = require('node:test');
const assert = require('node:assert/strict');
const fs = require('node:fs');
const os = require('node:os');
const path = require('node:path');
const Stripe = require('stripe');
const atomic = require('../stripe-commit');
const { openStore } = require('../store');
const createFees = require('../payment-fees');
const createPayoutOperations = require('../payout-operations');
const { startFakeStripe } = require('./fake-stripe');
const { buildXRechnung, xrechnungProblem } = require('../xrechnung');
const { samples } = require('./fixtures/xrechnung/samples');
let serial = 0;
async function fixture(kind, work) {
  const dir = fs.mkdtempSync(path.join(os.tmpdir(), 'craftcrew-fees-')), fake = await startFakeStripe();
  let admin, schema, url, store;
  try {
    if (kind === 'postgres') {
      admin = new (require('pg').Client)({ connectionString: process.env.DATABASE_URL }); await admin.connect();
      schema = `fees_${process.pid}_${++serial}`; await admin.query(`create schema ${schema}`);
      const u = new URL(process.env.DATABASE_URL); u.searchParams.set('options', `-c search_path=${schema}`); url = u.toString();
    }
    const open = () => openStore({ kind, dataDir: dir, url }); store = open(); store.loadSync();
    let db = { settings: { platformFeePercent: 3, platformDetails: samples.standard.seller }, counters: { unrelated: { '2026': 7 } },
      users: [{ id: 'owner', role: 'supplier', email: 'supplier@test.local', supplierId: 'supplier', language: 'de', notificationPrefs: { projects: true }, companyProfile: { legalName: 'Supplier GmbH', address: 'Hafenstraße 21, 20457 Hamburg, Germany', taxId: 'NL123456789B01' } }],
      suppliers: [{ id: 'supplier', company: 'Supplier GmbH', stripeAccount: { id: 'acct_fake1', transfers: 'active' } }],
      invoices: [], payments: [], disputes: [], stripeFinancialRecords: [], stripeOperations: [], commissionStatements: [], notifications: [], outbox: [], meta: {} };
    function add(id = 'one', net = 1000, gross = 1190, percent = 3) {
      db.invoices.push({ id: `invoice-${id}`, supplierId: 'supplier', customerId: 'buyer', status: 'Paid', number: `2026-${id}`, amount: gross, grossAmount: gross, netAmount: net });
      db.payments.push({ id: `payment-${id}`, invoiceId: `invoice-${id}`, status: 'Paid', amount: gross, netAmount: net, platformFee: Math.round(net * percent) / 100, platformFeePercent: percent,
        createdAt: '2026-09-20T00:00:00.000Z', stripe: { checkout: { chargeId: `ch_${id}` } } });
    }
    add(); store.save(db); await store.flush();
    const endpoint = new URL(fake.base), client = new Stripe('sk_test_fake', { host: endpoint.hostname, port: Number(endpoint.port), protocol: 'http', maxNetworkRetries: 0 });
    let refusing = false, fees, ops, gate;
    const build = () => {
      gate = atomic.createGate();
      const ctx = { getDb: () => db, client, enabled: true, gate, now: () => '2026-10-09T00:00:00.000Z', mailEnabled: () => true, appUrl: () => 'https://example.test',
        commitStage: async (input) => {
          if (kind === 'json' && refusing && [...input.stage.additions, ...input.stage.patches].some((a) => a.collection === 'commissionStatements')) fs.mkdirSync(path.join(dir, 'db.json.tmp'));
          return store.commitStage(input);
        }, on() {}, send: (res, status, value) => Object.assign(res, { status, ...value }), body: async () => ({ reason: 'Accounting correction' }),
        payouts: { transfer: (supplierId, params, options) => client.transfers.create({ ...params, destination: 'acct_fake1' }, options) } };
      fees = createFees(ctx); ops = createPayoutOperations({ ...ctx, fees });
    }; build();
    await work({ dir, fake, admin, schema, add, get db() { return db; }, get ops() { return ops; }, get fees() { return fees; }, get store() { return store; },
      run: () => gate.run(() => fees.run('2026-09')),
      manual: (action) => gate.run(async () => { const res = {}, st = db.commissionStatements.find((s) => s.kind === 'statement'); await fees.handleStatement({ method: 'POST' }, res, ['api', 'commission', st.id, action], st); return res; }),
      settle: (id = 'one') => { const p = db.payments.find((p) => p.id === `payment-${id}`); return ops.settle(p, db.invoices.find((i) => i.id === p.invoiceId), p.stripe.checkout.chargeId); },
      async refuse() { refusing = true; if (kind === 'postgres') await admin.query(`create function ${schema}.refuse_fee() returns trigger language plpgsql as $$ begin if new.collection='commissionStatements' then raise exception 'injected fee constraint'; end if; return new; end $$; create trigger refuse_fee before insert or update on ${schema}.records for each row execute function ${schema}.refuse_fee()`); },
      async recover() { refusing = false; if (kind === 'json') fs.rmSync(path.join(dir, 'db.json.tmp'), { recursive: true, force: true }); else await admin.query(`drop trigger refuse_fee on ${schema}.records`); await store.close?.(); store = open(); db = store.loadSync(); build(); },
    });
  } finally { await store?.close?.(); if (schema) await admin.query(`drop schema ${schema} cascade`); await admin?.end(); await fake.stop(); fs.rmSync(dir, { recursive: true, force: true }); }
}
async function historicalApp(f) {
  const { startApp, readDb, writeDb } = require('./helpers');
  const dir = fs.mkdtempSync(path.join(os.tmpdir(), 'craftcrew-fee-api-'));
  let app = await startApp({ dataDir: dir, env: f.fake.env }); await app.stop();
  const seed = await readDb(dir), meta = seed.meta, admins = seed.users.filter((u) => u.role === 'admin');
  Object.assign(seed, structuredClone(f.db)); seed.meta = meta; seed.users = [...admins, ...f.db.users];
  await writeDb(dir, seed); app = await startApp({ dataDir: dir, env: f.fake.env });
  return { app, read: () => readDb(dir), stop: async () => { await app.stop(); fs.rmSync(dir, { recursive: true, force: true }); } };
}
for (const kind of ['json', 'postgres']) {
  const options = { skip: kind === 'postgres' && !process.env.DATABASE_URL };
  test(`T283b2 ${kind} approved fee remains pinned and statement issuance rolls back every linked record`, options, async () => fixture(kind, async (f) => {
    f.db.settings.platformFeePercent = 70; await f.settle();
    assert.equal(f.db.payments[0].stripe.payout.actualDeductedMinor, 3000);
    assert.equal(f.db.payments[0].stripe.payout.breakdown.vatRate, 19, 'generic taxId is not an explicit VAT ID');
    await f.refuse(); await assert.rejects(f.run());
    assert.equal(f.db.commissionStatements.length, 0); assert.equal(f.db.payments[0].commissionStatementId, undefined);
    assert.equal(f.db.counters['commission-statement-2026'], undefined); assert.equal(f.db.notifications.length, 0); assert.equal(f.db.outbox.length, 0);
    await f.recover(); const [st] = await f.run();
    assert.equal(st.net, 30); assert.equal(st.vat, 5.7); assert.equal(st.gross, 35.7);
    assert.equal(st.collectedAmount, 30); assert.equal(st.outstandingAmount, 5.7); assert.equal(st.status, 'Open');
    assert.equal(f.db.counters.unrelated['2026'], 7); assert.equal(f.db.notifications.length, 1); assert.equal(f.db.outbox.length, 1);
    assert.equal((await f.run()).length, 0);
  }));
  test(`T283b2 ${kind} refund failure rolls back credit, counter, refs, notices and success then retries once`, options, async () => fixture(kind, async (f) => {
    await f.settle(); await f.run(); const before = structuredClone(f.db); await f.refuse();
    await assert.rejects(f.ops.refundInvoice('invoice-one', 'Cancellation', 100, 'refund_one'));
    assert.deepEqual(f.db.commissionStatements, before.commissionStatements); assert.deepEqual(f.db.counters, before.counters);
    assert.equal(f.db.payments[0].commissionCreditId, undefined); assert.equal(f.db.notifications.length, 1); assert.equal(f.db.outbox.length, 1);
    assert.ok(f.db.stripeOperations.filter((o) => o.kind !== 'transfer').every((o) => o.status === 'unknown'));
    await f.recover(); await f.ops.refundInvoice('invoice-one', 'Cancellation', 100, 'refund_one');
    assert.equal(f.fake.refunds.size, 1); assert.equal(f.fake.reversals.size, 1);
    assert.equal(f.db.counters['commission-credit-2026'], 1); assert.equal(f.db.notifications.length, 2); assert.equal(f.db.outbox.length, 2);
    const st = f.db.commissionStatements.find((s) => s.kind === 'statement'), credit = f.db.commissionStatements.find((s) => s.kind === 'credit');
    assert.equal(credit.net, -2.52); assert.equal(credit.vat, -0.48); assert.equal(credit.creditOfNumber, st.number);
    assert.equal(st.gross, 35.7); assert.equal(st.collectedAmount, 27.48); assert.equal(st.creditedAmount, 3); assert.equal(st.outstandingAmount, 5.22);
    await f.ops.refundInvoice('invoice-one', 'Cancellation', 100, 'refund_one'); assert.equal(f.db.counters['commission-credit-2026'], 1);
  }));
  test(`T283b2 ${kind} partial refund before issuance bills remaining fee and full refund clears issued VAT`, options, async () => fixture(kind, async (f) => {
    await f.settle(); await f.ops.refundInvoice('invoice-one', 'First partial', 100, 'before_issue');
    assert.equal(f.db.commissionStatements.length, 0); const [st] = await f.run();
    assert.equal(st.net, 27.48); assert.equal(st.collectedAmount, 27.48); assert.equal(st.outstandingAmount, 5.22);
    await f.ops.refundInvoice('invoice-one', 'Remaining refund');
    const credit = f.db.commissionStatements.find((s) => s.kind === 'credit');
    const current = f.db.commissionStatements.find((s) => s.id === st.id);
    assert.equal(credit.net, -27.48); assert.equal(credit.vat, -5.22); assert.equal(current.status, 'Credited'); assert.equal(current.outstandingAmount, 0);
  }));
  test(`T283b2 ${kind} concurrent refunds share sequential credit counters and statement VAT modes survive profile changes`, options, async () => fixture(kind, async (f) => {
    await f.settle(); await f.run(); f.db.users[0].companyProfile.vatId = 'NL123456789B01';
    await Promise.all([f.ops.refundInvoice('invoice-one', 'Partial one', 100, 'partial_one'), f.ops.refundInvoice('invoice-one', 'Partial two', 100, 'partial_two')]);
    const credits = f.db.commissionStatements.filter((s) => s.kind === 'credit');
    assert.deepEqual(credits.map((s) => s.number).sort(), ['CC-GUT-2026-0001', 'CC-GUT-2026-0002']); assert.ok(credits.every((s) => s.vatRate === 19));
    assert.equal(f.db.counters.unrelated['2026'], 7);
  }));
  test(`T283b2 ${kind} manual paid atomically records only remaining VAT and rollback changes nothing`, options, async () => fixture(kind, async (f) => {
    await f.settle(); await f.run(); const before = structuredClone(f.db); await f.refuse();
    await assert.rejects(f.manual('paid')); assert.deepEqual(f.db.commissionStatements, before.commissionStatements); assert.deepEqual(f.db.payments, before.payments);
    await f.recover(); const result = await f.manual('paid');
    assert.equal(result.status, 200); assert.equal(result.statement.manualCollectedAmount, 5.7); assert.equal(result.statement.collectedAmount, 35.7); assert.equal(result.statement.outstandingAmount, 0);
    assert.equal(f.db.payments[0].stripe.payout.outstandingFeeVatMinor, 0); assert.equal(f.fake.refunds.size, 0);
  }));
  test(`T283b2 ${kind} manual accounting credit retains cash and later customer refund creates no duplicate credit`, options, async () => fixture(kind, async (f) => {
    await f.settle(); await f.run(); const before = structuredClone(f.db); await f.refuse();
    await assert.rejects(f.manual('credit')); assert.deepEqual(f.db.commissionStatements, before.commissionStatements); assert.deepEqual(f.db.counters, before.counters);
    await f.recover(); const result = await f.manual('credit'); assert.equal(result.status, 201);
    let st = f.db.commissionStatements.find((s) => s.kind === 'statement');
    assert.equal(st.collectedAmount, 30); assert.equal(st.creditBalanceAmount, 30); assert.equal(f.fake.refunds.size, 0);
    const exporter = require('../commission')({ getDb: () => f.db, locales: require('../locales'), ...require('../pdf'), buildXRechnung, xrechnungProblem });
    const exported = exporter.xrechnungData(st); assert.equal(exported.prepaidAmount, 35.7); assert.equal(exported.dueAmount, 0); assert.equal(xrechnungProblem(exported), null);
    await f.ops.refundInvoice('invoice-one', 'Customer cancellation'); st = f.db.commissionStatements.find((s) => s.kind === 'statement');
    assert.equal(f.db.commissionStatements.filter((s) => s.kind === 'credit').length, 1); assert.equal(f.db.counters['commission-credit-2026'], 1);
    assert.equal(st.collectedAmount, 0); assert.equal(st.creditBalanceAmount, 0); assert.equal(st.outstandingAmount, 0);
  }));
  test(`T283b2 ${kind} paid VAT stays paid after partial/full refund and retained VAT is a credit balance`, options, async () => fixture(kind, async (f) => {
    await f.settle(); await f.run(); await f.manual('paid');
    await f.ops.refundInvoice('invoice-one', 'Half refund', 595, 'half_after_paid');
    let st = f.db.commissionStatements.find((s) => s.kind === 'statement');
    assert.equal(st.outstandingAmount, 0); assert.equal(st.collectedAmount, 20.7); assert.equal(st.creditedAmount, 17.85); assert.equal(st.creditBalanceAmount, 2.85);
    assert.equal(f.db.payments[0].stripe.payout.outstandingFeeVatMinor, 0); assert.equal(f.db.payments[0].stripe.payout.feeVatManualCollectedMinor, 570);
    await f.ops.refundInvoice('invoice-one', 'Remaining refund'); st = f.db.commissionStatements.find((s) => s.kind === 'statement');
    assert.equal(st.collectedAmount, 5.7); assert.equal(st.creditedAmount, 35.7); assert.equal(st.creditBalanceAmount, 5.7); assert.equal(st.outstandingAmount, 0);
    assert.equal(f.db.payments[0].stripe.payout.outstandingFeeVatMinor, 0);
  }));
  test(`T283b2 ${kind} historical Stripe statement API derives proven cash and uses strict paid action`, { skip: (kind === 'postgres') !== (process.env.STORE === 'postgres') || (kind === 'postgres' && !process.env.DATABASE_URL) }, async () => fixture(kind, async (f) => {
    await f.settle(); await f.run(); const st = f.db.commissionStatements.find((s) => s.kind === 'statement');
    delete st.collectedAmount; delete st.outstandingAmount;
    delete f.db.payments[0].stripe.payout.feeVatStatementAllocatedMinor; delete f.db.payments[0].stripe.payout.outstandingFeeVatMinor;
    f.store.save(f.db); await f.store.flush();
    const harness = await historicalApp(f), { app } = harness;
    try {
      const admin = await app.login('admin@test.local', 'Admin-Password-2026!');
      const shown = (await app.call('GET', '/commission', undefined, admin)).statements.find((s) => s.id === st.id);
      assert.equal(shown.collectedAmount, 30); assert.equal(shown.outstandingAmount, 5.7);
      const paid = await app.call('POST', `/commission/${st.id}/paid`, {}, admin);
      assert.equal(paid.status, 200, paid.error); assert.equal(paid.statement.manualCollectedAmount, 5.7); assert.equal(paid.statement.collectedAmount, 35.7); assert.equal(paid.statement.outstandingAmount, 0);
      const saved = await harness.read(); assert.equal(saved.payments[0].stripe.payout.feeVatManualCollectedMinor, 570);
    } finally { await harness.stop(); }
  }));
  test(`T283b2 ${kind} historical Stripe statement API refuses unproven cash without legacy mutation`, { skip: (kind === 'postgres') !== (process.env.STORE === 'postgres') || (kind === 'postgres' && !process.env.DATABASE_URL) }, async () => fixture(kind, async (f) => {
    await f.settle(); await f.run(); const st = f.db.commissionStatements.find((s) => s.kind === 'statement');
    delete st.collectedAmount; delete st.outstandingAmount; delete f.db.payments[0].stripe.payout.transferId;
    f.store.save(f.db); await f.store.flush();
    const harness = await historicalApp(f), { app } = harness;
    try {
      const admin = await app.login('admin@test.local', 'Admin-Password-2026!');
      const shown = (await app.call('GET', '/commission', undefined, admin)).statements.find((s) => s.id === st.id);
      assert.equal(shown.feeReviewRequired, true); assert.equal(shown.outstandingAmount, undefined);
      const xml = await app.call('GET', `/commission/${st.id}/xrechnung`, undefined, admin);
      assert.equal(xml.status, 409); assert.equal(xml.error, 'The Stripe payment could not be verified for this operation.');
      for (const action of ['paid', 'credit']) {
        const rejected = await app.call('POST', `/commission/${st.id}/${action}`, { reason: 'Correction' }, admin);
        assert.equal(rejected.status, 409); assert.equal(rejected.error, 'The Stripe payment could not be verified for this operation.');
      }
      const saved = await harness.read(); assert.equal(saved.commissionStatements.length, 1); assert.equal(saved.counters['commission-credit-2026'], undefined);
      assert.equal(saved.commissionStatements[0].collectedAmount, undefined);
    } finally { await harness.stop(); }
  }));
}
test('T283b2 explicit reverse-charge fee is fully collected and same-period late payments receive distinct statements', async () => fixture('json', async (f) => {
  f.db.users[0].companyProfile.vatId = 'NL123456789B01'; await f.settle(); const [first] = await f.run(), original = structuredClone(first);
  assert.equal(first.vatRate, 0); assert.equal(first.status, 'Paid'); assert.equal(first.outstandingAmount, 0);
  f.add('two'); await f.settle('two'); const [second] = await f.run();
  assert.notEqual(first.id, second.id); assert.notEqual(first.number, second.number); assert.deepEqual(first, original);
}));
test('T283b2 cent-sized cumulative partial credits clear the exact original VAT/gross', async () => fixture('json', async (f) => {
  f.db.payments = []; f.db.invoices = []; f.add('tiny', 0.04, 0.05, 100); await f.settle('tiny'); const [st] = await f.run();
  assert.equal(st.vat, 0.01); await f.ops.refundInvoice('invoice-tiny', 'Partial tiny', 0.02, 'tiny_partial');
  await f.ops.refundInvoice('invoice-tiny', 'Remaining tiny'); const credits = f.db.commissionStatements.filter((s) => s.kind === 'credit');
  assert.equal(Math.round(credits.reduce((sum, c) => sum - c.net, 0) * 100), 4);
  assert.equal(Math.round(credits.reduce((sum, c) => sum - c.vat, 0) * 100), 1);
  const current = f.db.commissionStatements.find((s) => s.id === st.id);
  assert.equal(Math.round(credits.reduce((sum, c) => sum - c.gross, 0) * 100), 5); assert.equal(current.outstandingAmount, 0); assert.equal(current.status, 'Credited');
}));
test('T283b2 statement VAT allocates the aggregate cent across two payments and full credits clear it', async () => fixture('json', async (f) => {
  f.db.payments = []; f.db.invoices = []; f.add('tiny-one', 0.02, 0.02, 100); f.add('tiny-two', 0.02, 0.02, 100);
  await f.settle('tiny-one'); await f.settle('tiny-two'); const [st] = await f.run();
  assert.equal(st.net, 0.04); assert.equal(st.vat, 0.01); assert.equal(st.outstandingAmount, 0.01);
  assert.equal(f.db.payments.reduce((sum, p) => sum + p.stripe.payout.outstandingFeeVatMinor, 0), 1);
  assert.ok(f.db.payments.every((p) => p.stripe.payout.breakdown.feeVatMinor === 0), 'original per-transfer estimates are preserved');
  await f.ops.refundInvoice('invoice-tiny-one', 'First full'); await f.ops.refundInvoice('invoice-tiny-two', 'Second full');
  const current = f.db.commissionStatements.find((s) => s.id === st.id);
  assert.equal(current.status, 'Credited'); assert.equal(current.outstandingAmount, 0); assert.equal(current.creditedAmount, 0.05);
}));
test('T283b2 mixed VAT groups are flagged without issuing numbered statements', async () => fixture('json', async (f) => {
  await f.settle(); f.db.users[0].companyProfile.vatId = 'NL123456789B01'; f.add('two'); await f.settle('two');
  assert.equal((await f.run()).length, 0); assert.equal(f.db.commissionStatements.length, 0);
  assert.ok(f.db.payments.every((p) => p.feeReviewRequired)); assert.equal(f.db.counters['commission-statement-2026'], undefined);
}));
test('T283b2 zero approved platform fee creates no fee statement', async () => fixture('json', async (f) => {
  f.db.payments[0].platformFee = 0; f.db.payments[0].platformFeePercent = 0; await f.settle(); assert.equal((await f.run()).length, 0);
}));
test('T283b2 collected/credited commission exports preserve gross and only demand outstanding VAT', async () => fixture('json', async (f) => {
  await f.settle(); const [st] = await f.run(); await f.ops.refundInvoice('invoice-one', 'Partial', 100, 'export_partial');
  const commission = require('../commission')({ getDb: () => f.db, locales: require('../locales'), ...require('../pdf'), buildXRechnung, xrechnungProblem });
  const current = f.db.commissionStatements.find((s) => s.id === st.id);
  const data = commission.xrechnungData(current); assert.equal(data.prepaidAmount, 30.48); assert.equal(data.dueAmount, 5.22); assert.equal(data.vat.gross, 35.7);
  assert.equal(xrechnungProblem(data), null); const xml = buildXRechnung(data); assert.match(xml, /<ram:TotalPrepaidAmount>30.48/); assert.match(xml, /<ram:DuePayableAmount>5.22/);
  assert.ok(commission.statementPdf(st).length > 500);
  for (const prepaidAmount of [-1, Infinity, '30', 35.71]) assert.ok(xrechnungProblem({ ...data, prepaidAmount }));
}));
test('T283b2 counter field stages retain unrelated counters and refuse stale same-field values', () => {
  const data = { counters: { a: 1, unrelated: { year: 7 } } }, stage = atomic.createStage(); stage.value('counters', { a: 2 }, { a: 1 });
  const prepared = atomic.prepareStage(data, stage); data.counters.unrelated.year = 8; atomic.validate(data, prepared.stage); atomic.publish(data, prepared.stage);
  assert.equal(data.counters.a, 2); assert.equal(data.counters.unrelated.year, 8);
  const stale = atomic.createStage(); stale.value('counters', { a: 3 }, { a: 1 }); assert.throws(() => atomic.validate(data, stale), /conflict/);
});
test('T283b2 invoice POST and commission writers use the same financial gate', () => {
  const boundary = require('../payment-owner-gate')({ gate: atomic.createGate(), financial: () => true });
  for (const route of ['/api/invoices', '/api/admin/commission/run', '/api/commission/st/paid', '/api/commission/st/credit'])
    assert.equal(boundary.guards({ method: 'POST' }, new URL(route, 'https://example.test')), true);
  assert.equal(boundary.guards({ method: 'POST' }, new URL('/api/invoices/invoice/pay', 'https://example.test')), false, 'Checkout owns its short staged gate sections');
});
test('T283b2 supplier fee page shows remaining due rather than rebilling captured net, in both languages', async () => {
  const vm = require('node:vm'), source = fs.readFileSync(path.join(__dirname, '../public/areas/fees.js'), 'utf8');
  for (const lang of ['en', 'de']) {
    const app = {}, locale = require('../locales'), pages = {};
    const context = vm.createContext({ app, api: async () => ({ statements: [{ id: 'fee', kind: 'statement', number: 'CC-1', period: '2026-09', issueDate: '2026-10-09', status: 'Open', gross: 35.7, collectedAmount: 30, outstandingAmount: 5.7 }] }),
      esc: (v) => String(v ?? '').replace(/&/g, '&amp;').replace(/</g, '&lt;'), t: (key, params) => locale.text(lang, key, params),
      fmt: { money: (n) => Number(n).toFixed(2), date: (d) => d }, statusHtml: (s) => s, dashboardShell: (role, page, html) => html,
      actions: { on() {} }, routes: { add: (path, page) => { pages[path] = page; } } });
    vm.runInContext(source, context); await pages['/supplier/fees']();
    const notice = app.innerHTML.match(/<div class="notice">([^<]+)<\/div>/)?.[1];
    assert.ok(notice?.includes('5.70')); assert.ok(!notice.includes('35.70'));
    assert.ok(app.innerHTML.includes(locale.text(lang, 'fee.collected'))); assert.ok(app.innerHTML.includes(locale.text(lang, 'fee.outstanding')));
  }
});
test('T283b2 historical issued Stripe VAT/parties remain original when collection metadata is absent', async () => fixture('json', async (f) => {
  await f.settle(); await f.run(); const st = f.db.commissionStatements.find((s) => s.kind === 'statement'); delete st.collectedAmount;
  f.db.users[0].companyProfile.vatId = 'NL123456789B01';
  const credit = { creditOf: st.id, net: -30, vatRate: 0, vatMode: 'intraEU', seller: {}, buyer: {} };
  createFees.preserveCredit(credit, f.db); assert.equal(credit.vatRate, 19); assert.equal(credit.vat, -5.7); assert.deepEqual(credit.seller, st.seller); assert.deepEqual(credit.buyer, st.buyer);
}));
test('T283b2 transfer for a historical issued statement derives its original VAT allocation', async () => fixture('json', async (f) => {
  const [issued] = await f.run(), st = f.db.commissionStatements.find((s) => s.id === issued.id);
  delete st.collectedAmount; delete st.outstandingAmount;
  delete f.db.payments[0].stripe.payout.feeVatStatementAllocatedMinor;
  await f.settle(); const current = f.db.commissionStatements.find((s) => s.id === st.id);
  assert.equal(current.collectedAmount, 30); assert.equal(current.outstandingAmount, 5.7); assert.equal(f.db.payments[0].stripe.payout.outstandingFeeVatMinor, 570);
}));
