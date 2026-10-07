/*
 * The customer pays an approved invoice through Stripe Checkout (T272, Wave 18).
 * - "Pay now" makes a Checkout Session on the platform account (separate charges and transfers: the platform is
 *   the merchant of record): mode payment, the invoice's gross amount in EUR, the customer's Stripe customer
 *   (created once with the company and VAT ID), transfer_group = the invoice id, metadata with the invoice, project,
 *   supplier and payment. No payment_method_types: Stripe shows the methods switched on in the Dashboard (card, SEPA
 *   Direct Debit, bank transfer …).
 * - Only when the supplier's payouts are active (T271); else the customer pays by bank transfer as before.
 * - Fulfilment happens only in the webhook: checkout.session.completed and …async_payment_succeeded with a
 *   payment_status other than "unpaid" mark the payment Paid; …async_payment_failed resets it. The success page
 *   only says "We are confirming your payment".
 * - The payment record keeps its statuses (Scheduled, Paid, Refunded); `method: "stripe"` and `stripe: { … }` say how.
 */
const INTEGRATION = "craftcrew-invoice";
const cents = (n) => Math.round(Number(n || 0) * 100);
const EU_VAT = /^(AT|BE|BG|CY|CZ|DE|DK|EE|EL|ES|FI|FR|HR|HU|IE|IT|LT|LU|LV|MT|NL|PL|PT|RO|SE|SI|SK)[0-9A-Z]{2,13}$/;

module.exports = function createCheckout(ctx) {
  const { getDb, save, send, now, notify, activity, client, enabled, on, payouts, projectFor, invoiceNo, appUrl } = ctx;
  const db = () => getDb();
  const paymentOf = (i) => (db().payments || []).find((p) => p.invoiceId === i.id);
  const supplierUser = (i) => (db().users || []).find((u) => u.supplierId === i.supplierId && !u.isMember);
  const admins = () => (db().users || []).filter((u) => u.role === "admin" && u.status !== "Suspended");
  // T273 sends the supplier's share once a payment is paid
  const paidListeners = [];

  // What the invoice page needs to offer "Pay now"
  function view(i, user) {
    if (!enabled || user.role !== "customer") return {};
    const pay = paymentOf(i);
    return {
      checkout: {
        available: i.status === "Approved" && pay?.status === "Scheduled" && !pay.stripe?.processing && payouts.ready(i.supplierId),
        processing: i.status === "Approved" && !!pay?.stripe?.processing,
      },
    };
  }

  // The customer's Stripe customer, created once with the company, the billing email and the VAT ID
  async function customerFor(i) {
    const u = (db().users || []).find((x) => x.id === i.customerId);
    if (!u) throw new Error("No customer account");
    if (u.stripeCustomerId) return u.stripeCustomerId;
    const cp = u.companyProfile || {},
      vat = String(cp.taxId || "")
        .replace(/\s/g, "")
        .toUpperCase();
    const c = await client.customers.create(
      {
        name: String(cp.legalName || u.company || u.name || "").slice(0, 200),
        email: cp.procurementEmail || u.email,
        ...(cp.address ? { address: { line1: String(cp.address).slice(0, 200) } } : {}),
        ...(EU_VAT.test(vat) ? { tax_id_data: [{ type: "eu_vat", value: vat }] } : {}),
        metadata: { userId: u.id },
      },
      { idempotencyKey: "customer-" + u.id },
    );
    u.stripeCustomerId = c.id;
    save();
    return c.id;
  }

  async function pay(req, res, i, user) {
    if (!enabled) return send(res, 409, { error: "Payments are off: no Stripe key is set." });
    if (user.role !== "customer") return send(res, 403, { error: "Only the customer pays an invoice." });
    const pay = paymentOf(i);
    if (i.status !== "Approved" || !pay || pay.status !== "Scheduled") return send(res, 409, { error: "Only an approved, unpaid invoice can be paid." });
    if (pay.stripe?.processing) return send(res, 409, { error: "Your payment is being processed. We confirm it when it arrives." });
    if (!payouts.ready(i.supplierId)) return send(res, 409, { error: "This supplier cannot be paid through Stripe yet. Please pay by bank transfer." });
    const amount = cents(pay.amount ?? i.amount);
    if (amount < 50) return send(res, 409, { error: "Only an approved, unpaid invoice can be paid." });
    try {
      // An older open session of this invoice is closed first, so the invoice cannot be paid twice
      if (pay.stripe?.sessionId) await client.checkout.sessions.expire(pay.stripe.sessionId).catch(() => {});
      const back = `${appUrl()}/#/customer/invoice/${encodeURIComponent(i.id)}`,
        metadata = { invoiceId: i.id, projectId: i.projectId || "", supplierId: i.supplierId || "", paymentId: pay.id };
      const session = await client.checkout.sessions.create({
        mode: "payment",
        customer: await customerFor(i),
        client_reference_id: i.id,
        line_items: [{ quantity: 1, price_data: { currency: "eur", unit_amount: amount, product_data: { name: `Invoice ${invoiceNo(i)}` } } }],
        payment_intent_data: { transfer_group: i.id, description: `Invoice ${invoiceNo(i)}`, metadata },
        metadata,
        integration_identifier: INTEGRATION,
        success_url: back + "?checkout=success",
        cancel_url: back + "?checkout=cancel",
      });
      pay.stripe = { ...pay.stripe, sessionId: session.id, startedAt: now() };
      delete pay.stripe.failedAt;
      activity(user, `Stripe Checkout started for invoice ${invoiceNo(i)}`);
      save();
      return send(res, 200, { url: session.url });
    } catch (e) {
      console.error("Stripe Checkout:", String(e.message || e).slice(0, 200));
      return send(res, 502, { error: "Stripe could not be reached. Check the key and the network." });
    }
  }

  // The invoice and payment of a Checkout Session; a session of another integration is not ours
  function find(session) {
    const invoiceId = session?.metadata?.invoiceId,
      i = invoiceId && (db().invoices || []).find((x) => x.id === invoiceId),
      pay = i && paymentOf(i);
    return i && pay && pay.id === session.metadata.paymentId ? { i, pay } : null;
  }
  async function paid(session) {
    const found = find(session);
    if (!found) return;
    const { i, pay } = found;
    if (pay.status !== "Scheduled" || i.status !== "Approved") {
      // Paid another way (or by another session) in the meantime: the admin refunds one of them
      if (pay.stripe?.paymentIntentId !== session.payment_intent) {
        (pay.stripe ||= {}).duplicates = [...new Set([...(pay.stripe.duplicates || []), session.id])];
        for (const a of admins()) notify(a.id, { key: "paymentDuplicate", params: { number: invoiceNo(i) } }, "/admin/billing");
        save();
      }
      return;
    }
    const intent = session.payment_intent ? await client.paymentIntents.retrieve(session.payment_intent) : null,
      chargeId = typeof intent?.latest_charge === "string" ? intent.latest_charge : intent?.latest_charge?.id || null;
    i.status = "Paid";
    delete i.overdue;
    i.paymentDate = now();
    i.updatedAt = now();
    Object.assign(pay, { status: "Paid", paidAt: now(), method: "stripe" });
    pay.stripe = { ...pay.stripe, sessionId: session.id, paymentIntentId: intent?.id || session.payment_intent || null, chargeId, processing: false };
    notify(supplierUser(i)?.id, { key: "invoicePaid", params: { number: invoiceNo(i) } });
    notify(i.customerId, { key: "paymentReceived", params: { number: invoiceNo(i) } }, `/customer/invoice/${i.id}`);
    save();
    for (const fn of paidListeners) await fn(pay, i);
  }
  on("checkout.session.completed", async (session) => {
    if (session?.payment_status && session.payment_status !== "unpaid") return paid(session);
    // A bank transfer or a direct debit is still on its way: nothing is paid yet
    const found = find(session);
    if (!found || found.pay.status !== "Scheduled") return;
    found.pay.stripe = { ...found.pay.stripe, sessionId: session.id, paymentIntentId: session.payment_intent || null, processing: true };
    notify(found.i.customerId, { key: "paymentProcessing", params: { number: invoiceNo(found.i) } }, `/customer/invoice/${found.i.id}`);
    save();
  });
  on("checkout.session.async_payment_succeeded", (session) => paid(session));
  on("checkout.session.async_payment_failed", async (session) => {
    const found = find(session);
    if (!found || found.pay.status !== "Scheduled") return;
    found.pay.stripe = { ...found.pay.stripe, processing: false, failedAt: now() };
    notify(found.i.customerId, { key: "paymentFailed", params: { number: invoiceNo(found.i) } }, `/customer/invoice/${found.i.id}`);
    save();
  });

  async function handle(req, res, url, parts, user) {
    if (parts[1] !== "invoices" || !parts[2] || parts[3] !== "pay" || parts.length !== 4 || req.method !== "POST") return false;
    const i = (db().invoices || []).find((x) => x.id === parts[2]);
    if (!i || (user.role === "customer" && i.customerId !== user.id && !projectFor(user, i.projectId)) || (user.role === "supplier" && i.supplierId !== user.supplierId))
      return (send(res, 404, { error: "Invoice not found" }), true);
    await pay(req, res, i, user);
    return true;
  }
  // An admin's "Mark Paid" closes an open session, so the customer cannot pay the invoice a second time
  async function closeOpen(pay) {
    if (enabled && pay?.stripe?.sessionId && !pay.stripe.processing) await client.checkout.sessions.expire(pay.stripe.sessionId).catch(() => {});
  }

  return { handle, view, closeOpen, onPaid: (fn) => paidListeners.push(fn), INTEGRATION };
};
