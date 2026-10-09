const { test } = require("node:test");
const assert = require("node:assert/strict");
const { startApp, vettedSupplier, projectWithTasks, assignAndAccept, submitInvoice } = require("./helpers");
const { startFakeStripe } = require("./fake-stripe");
const createCheckout = require("../checkout");
const atomic = require("../stripe-commit");
const clone = (value) => structuredClone(value);

test("Checkout API owns approved invoices, pins gross EUR amounts, reuses sessions and never fulfils from redirects", async (t) => {
  const fs = require("node:fs"), dataDir = fs.mkdtempSync(require("node:path").join(require("node:os").tmpdir(), "checkout-api-"));
  const fake = await startFakeStripe(); let app = await startApp({ env: fake.env, dataDir });
  t.after(async () => { await app.stop(); await fake.stop(); fs.rmSync(dataDir, { recursive: true, force: true }); });
  const admin = await app.login("admin@test.local", "Admin-Password-2026!");
  const supplier = await vettedSupplier(app, admin, "checkout.supplier@test.local", "Checkout Crew");
  await app.signup("customer", "checkout.owner@test.local");
  const customer = await app.login("checkout.owner@test.local", "Test-Password-2026");
  await app.signup("customer", "checkout.other@test.local");
  const other = await app.login("checkout.other@test.local", "Test-Password-2026");
  await app.call("PUT", "/profile", { companyProfile: { legalName: "Buyer GmbH", address: "Road 1", taxId: "DE123456789" } }, customer);
  const { project, phase, tasks } = await projectWithTasks(app, customer, { tasks: ["Checkout"] });
  await assignAndAccept(app, customer, supplier.token, project, tasks[0]);
  const invoice = await submitInvoice(app, supplier.token, project, phase, tasks[0], 1000);
  assert.equal((await app.call("POST", `/invoices/${invoice.id}/pay`, { amount: 1 }, customer)).status, 409);
  assert.equal((await app.call("PATCH", `/invoices/${invoice.id}`, { action: "Approve" }, customer)).status, 200);
  assert.equal((await app.call("POST", `/invoices/${invoice.id}/pay`, {}, other)).status, 404);
  assert.equal((await app.call("POST", `/invoices/${invoice.id}/pay`, {}, supplier.token)).status, 404);
  const results = await Promise.all([app.call("POST", `/invoices/${invoice.id}/pay`, { amount: 1, currency: "usd", supplierId: "forged" }, customer), app.call("POST", `/invoices/${invoice.id}/pay`, {}, customer)]);
  assert.ok(results.every((result) => result.status === 200), JSON.stringify(results));
  assert.equal(results[0].url, results[1].url);
  assert.equal(fake.customers.size, 1); assert.equal(fake.checkoutSessions.size, 1);
  const contacts = await app.call("GET", "/contacts", undefined, supplier.token);
  const buyer = contacts.users.find((user) => user.email === "checkout.owner@test.local");
  assert.ok(buyer, "assigned supplier can see its customer contact");
  assert.equal(buyer.stripeBilling, undefined, "customer billing attempts and provider identity are private");
  const creation = fake.calls.find((call) => call.path === "/v1/checkout/sessions" && call.method === "POST");
  assert.equal(creation.body["line_items[0][price_data][unit_amount]"], String(Math.round(invoice.amount * 100)));
  assert.equal(creation.body["line_items[0][price_data][currency]"], "eur");
  assert.equal(creation.body["payment_intent_data[transfer_group]"], invoice.id);
  assert.equal(creation.body["metadata[invoiceId]"], invoice.id);
  assert.equal(creation.body["payment_intent_data[metadata][checkoutAttemptId]"], creation.body["metadata[checkoutAttemptId]"]);
  assert.equal(creation.body.payment_method_types, undefined);
  assert.equal(creation.body["payment_method_types[0]"], undefined);
  assert.ok(creation.body.success_url.endsWith(`/#/customer/invoice/${invoice.id}?checkout=success`));
  assert.ok(!fake.calls.find((call) => call.path === "/v1/customers" && call.method === "POST").body["tax_id_data[0][value]"], "general tax number is not a VAT ID");
  assert.equal((await app.call("POST", `/invoices/${invoice.id}/pay`, {}, customer)).status, 200);
  assert.equal(fake.checkoutSessions.size, 1);
  assert.equal((await app.call("GET", `/invoices/${invoice.id}?checkout=success`, undefined, customer)).invoice.status, "Approved");
  assert.equal((await app.call("PATCH", `/admin/invoices/${invoice.id}`, { action: "Mark Paid" }, admin)).status, 409);
  const session = [...fake.checkoutSessions.values()][0];
  const signed = fake.signed({ id: "evt_checkout_interim", type: "checkout.session.completed", data: { object: { ...session, status: "complete", payment_status: "paid" } } });
  const response = await fetch(app.base + "/api/stripe/webhook", { method: "POST", headers: { "Stripe-Signature": signed.header }, body: signed.payload });
  assert.equal(response.status, 500, "before T272c our paid event must remain retryable, never an empty handled receipt");
  assert.equal((await app.call("GET", `/invoices/${invoice.id}`, undefined, customer)).invoice.status, "Approved");
  session.status = "expired";
  assert.equal((await app.call("POST", `/invoices/${invoice.id}/pay`, {}, customer)).status, 409);
  assert.equal(fake.checkoutSessions.size, 1, "uncertain/completed/expired sessions are never blindly replaced");
  const before = await app.call("GET", "/admin/stripe/processing-costs", undefined, admin);
  assert.equal(before.processingCosts.enabled, false); assert.equal(before.processingCosts.methods.card, null);
  const update = await app.call("PATCH", "/admin/stripe/processing-costs", { methods: { card: { rateBasisPoints: 150, fixedMinor: 25 } } }, admin);
  assert.equal(update.status, 200, update.error); assert.equal(update.processingCosts.enabled, false);
  assert.equal((await app.call("PATCH", "/admin/stripe/processing-costs", { enabled: true, methods: {} }, admin)).status, 409);
  assert.equal((await app.call("PATCH", "/admin/stripe/processing-costs", { methods: { card: { rateBasisPoints: -1, fixedMinor: 0 } } }, admin)).status, 409);
  assert.equal((await app.call("GET", "/admin/stripe/processing-costs", undefined, customer)).status, 403);
  session.status = "open";
  await app.stop(); app = await startApp({ env: fake.env, dataDir });
  assert.equal((await app.call("POST", `/invoices/${invoice.id}/pay`, {}, customer)).status, 200);
  assert.equal(fake.customers.size, 1); assert.equal(fake.checkoutSessions.size, 1);
  const restored = await app.call("GET", "/admin/stripe/processing-costs", undefined, admin);
  assert.deepEqual(restored.processingCosts.methods.card, { rateBasisPoints: 150, fixedMinor: 25 });
});

async function fixture(t, changes = {}) {
  const fake = await startFakeStripe(changes.routes || {}); t.after(() => fake.stop());
  const Stripe = require("stripe"), url = new URL(fake.base), client = new Stripe("sk_test_fake", { host: url.hostname, port: Number(url.port), protocol: "http", maxNetworkRetries: 0 });
  const db = { users: [{ id: "owner", role: "customer", status: "Active", email: "owner@example.com", company: "Buyer" }], suppliers: [{ id: "supplier" }],
    invoices: [{ id: "invoice", customerId: "owner", supplierId: "supplier", projectId: "project", status: "Approved", amount: 1190, grossAmount: 1190, netAmount: 1000 }],
    payments: [{ id: "payment", invoiceId: "invoice", status: "Scheduled", amount: 1190, netAmount: 1000 }], stripeConfigurations: [] };
  let commits = 0;
  const ctx = { getDb: () => db, client, enabled: true, on() {}, gate: atomic.createGate(), ownerHealthy() {},
    now: () => new Date().toISOString(), appUrl: () => "https://app.example.com", commitStage: async ({ stage }) => {
      commits++; if (changes.commit) await changes.commit(stage, commits, db); atomic.validate(db, stage); atomic.publish(db, stage);
    } };
  return { db, fake, ctx, checkout: createCheckout(ctx), actor: { id: "owner", role: "customer" }, commits: () => commits };
}
test("durable attempt refusal occurs before external requests, without live publication", async (t) => {
  const state = await fixture(t, { commit: () => { throw new Error("disk refused"); } });
  await assert.rejects(state.checkout.pay("invoice", state.actor), /disk refused/);
  assert.equal(state.fake.calls.length, 0); assert.equal(state.db.users[0].stripeBilling, undefined); assert.equal(state.db.payments[0].stripe, undefined);
});
test("publication refusal retries the frozen same provider attempt without duplicate session", async (t) => {
  let fail = true;
  const state = await fixture(t, { commit: (stage, commits) => { if (commits === 3 && fail) throw new Error("disk refused"); } });
  await assert.rejects(state.checkout.pay("invoice", state.actor), /disk refused/);
  assert.equal(state.fake.checkoutSessions.size, 1); assert.equal(state.db.payments[0].stripe.checkout.sessionId, null);
  fail = false;
  assert.match((await state.checkout.pay("invoice", state.actor)).url, /^https:\/\/checkout\.stripe\.com/);
  assert.equal(state.fake.checkoutSessions.size, 1);
  const calls = state.fake.calls.filter((call) => call.path === "/v1/checkout/sessions" && call.method === "POST");
  assert.equal(calls[0].headers["idempotency-key"], calls[1].headers["idempotency-key"]);
});
test("provider ownership/amount/method mismatch cannot publish a session URL", async (t) => {
  for (const field of ["customer", "amount_total", "currency", "metadata", "mode", "livemode", "url"]) {
    const state = await fixture(t);
    await state.checkout.pay("invoice", state.actor);
    const session = [...state.fake.checkoutSessions.values()][0];
    session[field] = field === "metadata" ? {} : field === "livemode" ? true : field === "amount_total" ? 1 : field === "url" ? "https://evil.example.com" : "wrong";
    await assert.rejects(state.checkout.pay("invoice", state.actor));
    assert.equal(state.db.invoices[0].status, "Approved"); assert.equal(state.db.payments[0].status, "Scheduled");
  }
});
test("invoice/customer/legal/member changes during awaited provider work refuse publication", async (t) => {
  for (const mutate of [db => { db.invoices[0].customerId = "other"; }, db => { db.users[0].company = "Changed"; }, db => { db.payments[0].status = "Paid"; }]) {
    let state;
    state = await fixture(t, { routes: { "POST /v1/customers": body => {
      mutate(state.db); return { id: "cus_delayed", livemode: false, metadata: { craftcrewCustomerId: "owner" } };
    } } });
    await assert.rejects(state.checkout.pay("invoice", state.actor));
    assert.equal(state.fake.checkoutSessions.size, 0); assert.equal(state.db.users[0].stripeBilling.customerId, null);
  }
  const state = await fixture(t);
  state.db.users.push({ id: "member", role: "customer", orgOwnerId: "owner", status: "Active", permissions: { invoices: "view" } });
  await assert.rejects(state.checkout.pay("invoice", { ...state.actor, isMember: true, memberId: "member", permissions: { invoices: "full" } }), /Invoice not found/);
  assert.equal(state.fake.calls.length, 0);
});
test("unapproved currency/totals, aged uncertain attempts and live mode fail closed", async (t) => {
  for (const modify of [db => { db.invoices[0].currency = "usd"; }, db => { db.payments[0].amount = 1; }, db => { db.invoices[0].amount = 1190.001; }]) {
    const state = await fixture(t); modify(state.db); await assert.rejects(state.checkout.pay("invoice", state.actor)); assert.equal(state.fake.calls.length, 0);
  }
  const state = await fixture(t);
  const live = createCheckout({ ...state.ctx, live: true });
  await assert.rejects(live.pay("invoice", state.actor), /Live payments/);
  state.db.users[0].stripeBilling = { attemptId: "old", customerId: null, startedAt: "2020-01-01T00:00:00Z", params: { name: "Buyer", email: "owner@example.com", metadata: { craftcrewCustomerId: "owner" } } };
  await assert.rejects(state.checkout.pay("invoice", state.actor), /reconciliation/);
  assert.equal(state.fake.calls.length, 0);
});
