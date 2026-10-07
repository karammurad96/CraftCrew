// T272: the customer pays an approved invoice through Stripe Checkout. The session is made on the platform account
// (no payment_method_types, transfer_group = the invoice), the payment is marked Paid only by the signed webhook and
// only once, a bank transfer still on its way marks nothing, and the success page alone changes nothing.
const { describe, it, before, after } = require("node:test");
const assert = require("node:assert/strict");
const { startApp, vettedSupplier, projectWithTasks, assignAndAccept, submitInvoice } = require("./helpers");
const { startFakeStripe } = require("./fake-stripe");

describe("checkout: paying an approved invoice with a fake Stripe (API)", () => {
  let app, fake, admin, customer, ready, notReady, invoices;
  const post = (event) => fetch(app.base + "/api/stripe/webhook", { method: "POST", headers: { "Content-Type": "application/json", "Stripe-Signature": event.header }, body: event.payload });
  const deliver = async (id, type, object) => {
    const r = await post(fake.signed({ id, type, data: { object } }));
    assert.equal(r.status, 200, `${type}: ${r.status}`);
    return r.json();
  };
  const invoice = async (i) => (await app.call("GET", "/invoices/" + i.id, undefined, customer)).invoice;
  const payment = async (i) => (await app.call("GET", "/invoices", undefined, admin)).invoices.find((x) => x.id === i.id).payment;
  // The Checkout Session as Stripe sends it in the event, from what the server asked for
  const session = (id, payment_status, payment_intent) => {
    const made = fake.calls.findLast((c) => c.path === "/v1/checkout/sessions" && c.response?.id === id);
    const metadata = Object.fromEntries(Object.entries(made.body).filter(([k]) => k.startsWith("metadata[")).map(([k, v]) => [k.slice(9, -1), v]));
    return { id, object: "checkout.session", payment_status, payment_intent, metadata, amount_total: Number(made.body["line_items[0][price_data][unit_amount]"]) };
  };
  before(async () => {
    fake = await startFakeStripe();
    app = await startApp({ env: fake.env });
    admin = await app.login("admin@test.local", "Admin-Password-2026!");
    ready = await vettedSupplier(app, admin, "co.ready@test.local", "Ready Crew GmbH");
    notReady = await vettedSupplier(app, admin, "co.later@test.local", "Later Crew GmbH");
    // Ready Crew's payouts are active, Later Crew has no payout account yet
    const acc = await app.call("POST", "/payouts/account", {}, ready.token);
    fake.setTransfers(acc.account.id, "active");
    assert.equal((await app.call("POST", "/payouts/refresh", {}, ready.token)).account.transfers, "active");
    await app.signup("customer", "co.customer@test.local");
    customer = await app.login("co.customer@test.local", "Test-Password-2026");
    await app.call("PUT", "/profile", { companyProfile: { legalName: "Buyer Werke AG", address: "Hafenstraße 2, 20457 Hamburg", taxId: "DE 987654321" } }, customer);
    const { project, phase, tasks } = await projectWithTasks(app, customer, { tasks: ["A", "B", "C", "D"] });
    invoices = [];
    for (const [n, s] of [ready, ready, ready, notReady].entries()) {
      await assignAndAccept(app, customer, s.token, project, tasks[n]);
      const inv = await submitInvoice(app, s.token, project, phase, tasks[n], 1000 + n * 100);
      assert.equal((await app.call("PATCH", `/invoices/${inv.id}`, { action: "Approve" }, customer)).status, 200);
      invoices.push(inv);
    }
  });
  after(async () => {
    await app?.stop();
    await fake?.stop();
  });

  it("offers Pay now only when the supplier's payouts are active", async () => {
    assert.deepEqual((await invoice(invoices[0])).checkout, { available: true, processing: false });
    assert.equal((await invoice(invoices[3])).checkout.available, false, "Later Crew: pay by bank transfer");
    assert.equal((await app.call("POST", `/invoices/${invoices[3].id}/pay`, {}, customer)).code, "coSupplierNotReady");
    assert.equal((await app.call("POST", `/invoices/${invoices[0].id}/pay`, {}, ready.token)).code, "coCustomerOnly");
    assert.equal((await app.call("GET", "/invoices/" + invoices[0].id, undefined, ready.token)).invoice.checkout, undefined, "the supplier is not offered to pay");
  });

  it("makes a Checkout Session on the platform account, without payment_method_types", async () => {
    const r = await app.call("POST", `/invoices/${invoices[0].id}/pay`, {}, customer);
    assert.equal(r.status, 200, r.error);
    const call = fake.calls.findLast((c) => c.path === "/v1/checkout/sessions");
    assert.equal(r.url, call.response.url);
    const b = call.body,
      inv = await invoice(invoices[0]);
    assert.equal(b.mode, "payment");
    assert.equal(b["line_items[0][price_data][currency]"], "eur");
    assert.equal(Number(b["line_items[0][price_data][unit_amount]"]), Math.round(inv.amount * 100), "the invoice's gross amount in cents");
    assert.equal(b["line_items[0][quantity]"], "1");
    assert.match(b.customer, /^cus_/);
    assert.equal(b["payment_intent_data[transfer_group]"], inv.id);
    assert.equal(b["metadata[invoiceId]"], inv.id);
    assert.equal(b["metadata[projectId]"], inv.projectId);
    assert.equal(b["metadata[supplierId]"], ready.supplierId);
    assert.equal(b["payment_intent_data[metadata][invoiceId]"], inv.id);
    assert.equal(b.integration_identifier, "craftcrew-invoice");
    assert.ok(!Object.keys(b).some((k) => k.startsWith("payment_method_types")), "Stripe chooses the methods");
    assert.ok(!Object.keys(b).some((k) => /application_fee|on_behalf_of|transfer_data/.test(k)), "separate charges and transfers");
    assert.equal(call.headers["stripe-account"], undefined, "on the platform account");
    assert.match(b.success_url, new RegExp(`/#/customer/invoice/${inv.id}\\?checkout=success$`));
    assert.match(b.cancel_url, /\?checkout=cancel$/);
    // The Stripe customer is made once, with the company and VAT ID
    const customers = fake.calls.filter((c) => c.path === "/v1/customers");
    assert.equal(customers.length, 1);
    assert.equal(customers[0].body.name, "Buyer Werke AG");
    assert.equal(customers[0].body["tax_id_data[0][type]"], "eu_vat");
    assert.equal(customers[0].body["tax_id_data[0][value]"], "DE987654321");
    // Pay now again: the older session is closed, the customer is reused
    const first = call.response.id;
    assert.equal((await app.call("POST", `/invoices/${invoices[0].id}/pay`, {}, customer)).status, 200);
    assert.ok(fake.calls.some((c) => c.path === `/v1/checkout/sessions/${first}/expire`));
    assert.equal(fake.calls.filter((c) => c.path === "/v1/customers").length, 1);
  });

  it("changes nothing when the customer only comes back to the success page", async () => {
    const back = fake.calls.findLast((c) => c.path === "/v1/checkout/sessions").body.success_url;
    assert.equal((await fetch(app.base + new URL(back).pathname)).status, 200);
    const inv = await invoice(invoices[0]);
    assert.equal(inv.status, "Approved");
    assert.equal((await payment(invoices[0])).status, "Scheduled");
  });

  it("marks the invoice paid from the webhook, once, even when the event comes twice", async () => {
    const id = fake.calls.findLast((c) => c.path === "/v1/checkout/sessions").response.id,
      s = session(id, "paid", "pi_one");
    assert.deepEqual(await deliver("evt_paid1", "checkout.session.completed", s), { received: true });
    const inv = await invoice(invoices[0]),
      pay = await payment(invoices[0]);
    assert.equal(inv.status, "Paid");
    assert.equal(pay.status, "Paid");
    assert.equal(pay.method, "stripe");
    assert.equal(pay.stripe.paymentIntentId, "pi_one");
    assert.equal(pay.stripe.chargeId, "ch_fake_pi_one");
    assert.deepEqual(await deliver("evt_paid1", "checkout.session.completed", s), { received: true, duplicate: true });
    // Another event about the same session changes nothing either
    await deliver("evt_paid1b", "checkout.session.async_payment_succeeded", s);
    assert.equal((await payment(invoices[0])).stripe.duplicates, undefined);
    const supplierNotes = (await app.call("GET", "/notifications", undefined, ready.token)).notifications.filter((n) => n.text.includes("has been paid"));
    assert.equal(supplierNotes.length, 1, "the supplier is told once");
    assert.ok((await app.call("GET", "/notifications", undefined, customer)).notifications.some((n) => /received your payment/.test(n.text)));
    assert.equal((await app.call("POST", `/invoices/${invoices[0].id}/pay`, {}, customer)).code, "coNotPayable");
  });

  it("waits for a bank transfer: an unpaid completed session marks nothing, the async success does", async () => {
    assert.equal((await app.call("POST", `/invoices/${invoices[1].id}/pay`, {}, customer)).status, 200);
    let id = fake.calls.findLast((c) => c.path === "/v1/checkout/sessions").response.id;
    await deliver("evt_open1", "checkout.session.completed", session(id, "unpaid", "pi_two"));
    let inv = await invoice(invoices[1]);
    assert.equal(inv.status, "Approved", "not paid yet");
    assert.deepEqual(inv.checkout, { available: false, processing: true });
    assert.equal((await payment(invoices[1])).status, "Scheduled");
    assert.equal((await app.call("POST", `/invoices/${invoices[1].id}/pay`, {}, customer)).code, "coProcessing");
    // The transfer fails: the invoice can be paid again
    await deliver("evt_fail1", "checkout.session.async_payment_failed", session(id, "unpaid", "pi_two"));
    inv = await invoice(invoices[1]);
    assert.deepEqual(inv.checkout, { available: true, processing: false });
    assert.ok((await app.call("GET", "/notifications", undefined, customer)).notifications.some((n) => /did not go through/.test(n.text)));
    // Second try: the money arrives later
    assert.equal((await app.call("POST", `/invoices/${invoices[1].id}/pay`, {}, customer)).status, 200);
    id = fake.calls.findLast((c) => c.path === "/v1/checkout/sessions").response.id;
    await deliver("evt_open2", "checkout.session.completed", session(id, "unpaid", "pi_three"));
    assert.equal((await invoice(invoices[1])).status, "Approved");
    await deliver("evt_async2", "checkout.session.async_payment_succeeded", session(id, "paid", "pi_three"));
    assert.equal((await invoice(invoices[1])).status, "Paid");
    assert.equal((await payment(invoices[1])).stripe.chargeId, "ch_fake_pi_three");
  });

  it("closes the session when the admin records the payment, and flags a second payment", async () => {
    assert.equal((await app.call("POST", `/invoices/${invoices[2].id}/pay`, {}, customer)).status, 200);
    const id = fake.calls.findLast((c) => c.path === "/v1/checkout/sessions").response.id;
    assert.equal((await app.call("PATCH", `/admin/invoices/${invoices[2].id}`, { action: "Mark Paid" }, admin)).status, 200);
    assert.ok(fake.calls.some((c) => c.path === `/v1/checkout/sessions/${id}/expire`));
    // Paid anyway (the session was already being paid): kept for the admin to refund
    await deliver("evt_dup", "checkout.session.completed", session(id, "paid", "pi_four"));
    const pay = await payment(invoices[2]);
    assert.equal(pay.method, undefined, "still the admin's record");
    assert.deepEqual(pay.stripe.duplicates, [id]);
    assert.ok((await app.call("GET", "/notifications", undefined, admin)).notifications.some((n) => /paid twice/.test(n.text)));
  });

  it("ignores a session that is not one of the platform's invoices", async () => {
    assert.deepEqual(await deliver("evt_foreign", "checkout.session.completed", { id: "cs_other", object: "checkout.session", payment_status: "paid", metadata: {} }), { received: true });
  });
});
