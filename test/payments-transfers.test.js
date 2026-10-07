// T273: the supplier's share goes out as a transfer (gross − platform fee, transfer_group = the invoice,
// source_transaction = the charge), waits as "Payout pending" while the account cannot receive it, and is taken back
// on a refund or a dispute (with an escalation for the admin). The fee statement lists the fee as settled.
const { describe, it, before, after } = require("node:test");
const assert = require("node:assert/strict");
const { startApp, vettedSupplier, projectWithTasks, assignAndAccept, submitInvoice } = require("./helpers");
const { startFakeStripe } = require("./fake-stripe");

const cents = (n) => Math.round(Number(n) * 100);
const month = () => new Date().toISOString().slice(0, 7);

describe("transfers: payouts, refunds and disputes with a fake Stripe (API)", () => {
  let app, fake, admin, customer, ready, flaky, flakyAccount, invoices;
  const post = (event) => fetch(app.base + "/api/stripe/webhook", { method: "POST", headers: { "Content-Type": "application/json", "Stripe-Signature": event.header }, body: event.payload });
  const deliver = async (id, type, object) => assert.equal((await post(fake.signed({ id, type, data: { object } }))).status, 200, type);
  const payment = async (i) => (await app.call("GET", "/invoices", undefined, admin)).invoices.find((x) => x.id === i.id).payment;
  const invoice = async (i) => (await app.call("GET", "/invoices/" + i.id, undefined, admin)).invoice;
  // The customer pays through Checkout; Stripe reports the session paid
  const pay = async (i, pi) => {
    const r = await app.call("POST", `/invoices/${i.id}/pay`, {}, customer);
    assert.equal(r.status, 200, r.error);
    const made = fake.calls.findLast((c) => c.path === "/v1/checkout/sessions");
    const metadata = Object.fromEntries(Object.entries(made.body).filter(([k]) => k.startsWith("metadata[")).map(([k, v]) => [k.slice(9, -1), v]));
    await deliver("evt_paid_" + pi, "checkout.session.completed", { id: made.response.id, object: "checkout.session", payment_status: "paid", payment_intent: pi, metadata });
  };
  const notes = async (token) => (await app.call("GET", "/notifications", undefined, token)).notifications.map((n) => n.text);
  before(async () => {
    // A refund of "pi_refuse" fails at Stripe
    fake = await startFakeStripe({
      "POST /v1/refunds": (b) => (b.payment_intent === "pi_refuse" ? { status: 400, error: { type: "invalid_request_error", message: "Charge already refunded" } } : { id: "re_fake_" + b.payment_intent, object: "refund", status: "succeeded" }),
    });
    app = await startApp({ env: fake.env });
    admin = await app.login("admin@test.local", "Admin-Password-2026!");
    ready = await vettedSupplier(app, admin, "tr.ready@test.local", "Transfer Crew GmbH");
    flaky = await vettedSupplier(app, admin, "tr.flaky@test.local", "Flaky Crew GmbH");
    for (const s of [ready, flaky]) {
      const acc = await app.call("POST", "/payouts/account", {}, s.token);
      fake.setTransfers(acc.account.id, "active");
      await app.call("POST", "/payouts/refresh", {}, s.token);
      s.account = acc.account.id;
    }
    flakyAccount = flaky.account;
    await app.signup("customer", "tr.customer@test.local");
    customer = await app.login("tr.customer@test.local", "Test-Password-2026");
    const { project, phase, tasks } = await projectWithTasks(app, customer, { tasks: ["A", "B", "C", "D", "E"] });
    invoices = [];
    for (const [n, s] of [ready, flaky, ready, ready, ready].entries()) {
      await assignAndAccept(app, customer, s.token, project, tasks[n]);
      const inv = await submitInvoice(app, s.token, project, phase, tasks[n], 2000 + n * 100);
      assert.equal((await app.call("PATCH", `/invoices/${inv.id}`, { action: "Approve" }, customer)).status, 200);
      invoices.push(inv);
    }
  });
  after(async () => {
    await app?.stop();
    await fake?.stop();
  });

  it("transfers the gross minus the platform fee, waiting for the charge's funds", async () => {
    await pay(invoices[0], "pi_a");
    const p = await payment(invoices[0]),
      inv = await invoice(invoices[0]);
    assert.equal(inv.status, "Paid");
    assert.equal(p.status, "Paid");
    assert.ok(p.platformFee > 0);
    const call = fake.calls.findLast((c) => c.path === "/v1/transfers");
    assert.equal(Number(call.body.amount), cents(inv.amount) - cents(p.platformFee), "gross − fee");
    assert.equal(call.body.currency, "eur");
    assert.equal(call.body.destination, ready.account);
    assert.equal(call.body.transfer_group, inv.id);
    assert.equal(call.body.source_transaction, "ch_fake_pi_a");
    assert.ok(call.headers["idempotency-key"]);
    assert.equal(p.stripe.transferId, call.response.id);
    assert.equal(p.stripe.transferAmount, (cents(inv.amount) - cents(p.platformFee)) / 100);
    assert.equal(p.feeSettledByDeduction, true);
    // The account was asked again right before the transfer
    const reads = fake.calls.map((c) => c.path);
    assert.equal(reads[reads.lastIndexOf("/v1/transfers") - 1], "/v2/core/accounts/" + ready.account);
    assert.ok((await notes(ready.token)).some((t) => /Payout for invoice .* is on its way/.test(t)));
  });

  it("lists the fee on the statement as settled by deduction and paid", async () => {
    const r = await app.call("POST", "/admin/commission/run", { period: month() }, admin);
    assert.equal(r.status, 200, r.error);
    const settled = r.statements.find((s) => s.settledByDeduction);
    assert.ok(settled, "a statement for the deducted fees");
    assert.equal(settled.status, "Paid");
    assert.deepEqual(settled.lines.map((l) => l.invoiceId), [invoices[0].id]);
    assert.equal(settled.lines[0].settledByDeduction, true);
    const open = r.statements.filter((s) => !s.settledByDeduction);
    assert.ok(open.every((s) => s.status === "Open" && !s.lines.some((l) => l.invoiceId === invoices[0].id)));
    const pdf = await fetch(`${app.base}/api/commission/${settled.id}/pdf`, { headers: { Authorization: "Bearer " + admin } });
    assert.equal(pdf.status, 200);
  });

  it("waits as Payout pending while the account is restricted, and pays out once it is active", async () => {
    fake.setTransfers(flakyAccount, "restricted");
    const before = fake.calls.filter((c) => c.path === "/v1/transfers").length;
    await pay(invoices[1], "pi_b");
    let p = await payment(invoices[1]);
    assert.equal((await invoice(invoices[1])).status, "Paid", "the customer has paid");
    assert.equal(p.status, "Payout pending");
    assert.equal(p.payoutBlocked, "restricted");
    assert.equal(fake.calls.filter((c) => c.path === "/v1/transfers").length, before, "no transfer to a restricted account");
    assert.ok((await notes(admin)).some((t) => /payout for invoice .* waits/.test(t)));
    // The admin tries again: still restricted
    const retry = await app.call("POST", `/admin/payments/${p.id}/payout`, {}, admin);
    assert.equal(retry.payment.status, "Payout pending");
    assert.equal((await app.call("POST", `/admin/payments/${p.id}/payout`, {}, customer)).status, 403);
    // Stripe activates the account: the waiting payout goes out
    fake.setTransfers(flakyAccount, "active");
    const thin = fake.signedThin({ id: "evt_flaky_ok", type: "v2.core.account[configuration.recipient].capability_status_updated", related_object: { id: flakyAccount, type: "v2.core.account", url: "/v2/core/accounts/" + flakyAccount } });
    assert.equal((await post(thin)).status, 200);
    p = await payment(invoices[1]);
    assert.equal(p.status, "Paid");
    assert.ok(p.stripe.transferId);
    assert.equal(fake.calls.filter((c) => c.path === "/v1/transfers").length, before + 1);
    assert.equal((await app.call("POST", `/admin/payments/${p.id}/payout`, {}, admin)).code, "trNotWaiting");
  });

  it("refunds through Stripe and takes the transfer back; the fee is credited", async () => {
    const p = await payment(invoices[0]),
      r = await app.call("PATCH", `/admin/invoices/${invoices[0].id}`, { action: "Refund", reason: "Work cancelled" }, admin);
    assert.equal(r.status, 200, r.error);
    const refund = fake.calls.findLast((c) => c.path === "/v1/refunds");
    assert.equal(refund.body.payment_intent, "pi_a");
    assert.ok(fake.calls.some((c) => c.path === `/v1/transfers/${p.stripe.transferId}/reversals`), "the transfer is reversed");
    const after = await payment(invoices[0]);
    assert.equal(after.status, "Refunded");
    assert.equal(after.stripe.refundId, "re_fake_pi_a");
    assert.equal(after.stripe.reversedTransfers[0].transferId, p.stripe.transferId);
    assert.equal(after.stripe.transferId, undefined);
    const { statements } = await app.call("GET", "/commission", undefined, admin);
    assert.ok(statements.some((s) => s.kind === "credit" && s.lines[0].invoiceId === invoices[0].id), "T240 credits the fee");
  });

  it("changes nothing when Stripe refuses the refund", async () => {
    await pay(invoices[4], "pi_refuse");
    const r = await app.call("PATCH", `/admin/invoices/${invoices[4].id}`, { action: "Refund", reason: "Try" }, admin);
    assert.equal(r.code, "trRefundFailed");
    assert.equal((await invoice(invoices[4])).status, "Paid");
    assert.ok((await payment(invoices[4])).stripe.transferId, "the transfer stays");
  });

  it("takes the payout back on a dispute, opens an escalation and follows the outcome", async () => {
    await pay(invoices[2], "pi_c");
    await pay(invoices[3], "pi_d");
    const pc = await payment(invoices[2]);
    const dispute = { object: "dispute", charge: "ch_fake_pi_c", reason: "fraudulent", amount: cents(pc.amount), status: "needs_response" };
    await deliver("evt_dp1", "charge.dispute.created", { ...dispute, id: "dp_c" });
    let p = await payment(invoices[2]);
    assert.equal((await invoice(invoices[2])).status, "Disputed");
    assert.ok(fake.calls.some((c) => c.path === `/v1/transfers/${pc.stripe.transferId}/reversals`));
    assert.equal(p.stripe.transferId, undefined);
    assert.equal(p.dispute.id, "dp_c");
    const { disputes } = await app.call("GET", "/disputes", undefined, admin);
    const esc = disputes.find((d) => d.stripeDisputeId === "dp_c");
    assert.equal(esc.status, "Open");
    assert.equal(esc.type, "Payment");
    assert.equal(esc.supplierId, ready.supplierId);
    assert.ok((await notes(admin)).some((t) => /Escalation opened/.test(t)));
    assert.ok((await notes(ready.token)).some((t) => /disputes the payment/.test(t)));
    // The bank decides for the supplier: Paid, and the share goes out again (from the balance)
    const transfers = fake.calls.filter((c) => c.path === "/v1/transfers").length;
    await deliver("evt_dp1_closed", "charge.dispute.closed", { ...dispute, id: "dp_c", status: "won" });
    p = await payment(invoices[2]);
    assert.equal((await invoice(invoices[2])).status, "Paid");
    assert.ok(p.stripe.transferId);
    const again = fake.calls.findLast((c) => c.path === "/v1/transfers");
    assert.equal(fake.calls.filter((c) => c.path === "/v1/transfers").length, transfers + 1);
    assert.equal(again.body.source_transaction, undefined);
    assert.equal((await app.call("GET", "/disputes", undefined, admin)).disputes.find((d) => d.stripeDisputeId === "dp_c").status, "Resolved");
    // A lost dispute: the money went back to the customer
    await deliver("evt_dp2", "charge.dispute.created", { ...dispute, id: "dp_d", charge: "ch_fake_pi_d" });
    await deliver("evt_dp2_closed", "charge.dispute.closed", { ...dispute, id: "dp_d", charge: "ch_fake_pi_d", status: "lost" });
    assert.equal((await invoice(invoices[3])).status, "Refunded");
    assert.equal((await payment(invoices[3])).status, "Refunded");
    assert.ok((await notes(ready.token)).some((t) => /was lost/.test(t)));
  });
});
