/* T272b: provider calls use frozen durable inputs. Fulfilment is T272c, never a redirect. */
const crypto = require("node:crypto");
const { isDeepStrictEqual: equal } = require("node:util");
const atomic = require("./stripe-commit");
const locales = require("./locales");
const METHODS = ["card", "sepa_debit", "customer_balance"];
const POLICY = "stripe-processing-costs";
const INTEGRATION = "craftcrew-invoice";
const clone = (value) => structuredClone(value);
const canonical = (value) => JSON.parse(JSON.stringify(value));
const minor = (value) => {
  if (typeof value !== "number" || !Number.isFinite(value) || value <= 0 || value > 9999999.99 ||
      Math.abs(value * 100 - Math.round(value * 100)) > 0.000001) throw new Error("Only an approved EUR invoice with valid totals can be paid.");
  return Math.round(value * 100);
};
const binding = (invoice) => Object.fromEntries(["customerId", "supplierId", "projectId", "status", "currency", "amount", "grossAmount", "netAmount", "vatMode", "vatAmount", "vatRate"].map((field) => [field, invoice[field]]));
const ownerBinding = (owner) => Object.fromEntries(["role", "status", "orgOwnerId", "email", "company", "name", "language", "companyProfile"].map((field) => [field, clone(owner[field])]));
function safeUrl(value) {
  let url;
  try { url = new URL(value); } catch { throw new Error("Stripe could not be reached. Please try again."); }
  if (url.protocol !== "https:" || url.hostname !== "checkout.stripe.com" || url.username || url.password || url.port)
    throw new Error("Stripe could not be reached. Please try again.");
  return url.href;
}
function policyView(record) {
  return { enabled: false, activationBlocked: true, methods: Object.fromEntries(METHODS.map((method) => [method, clone(record?.methods?.[method] || null)])) };
}
function cleanPolicy(body) {
  if (!body || typeof body !== "object" || Array.isArray(body) || Object.keys(body).some((key) => !["enabled", "methods"].includes(key)) ||
      (body.enabled !== undefined && typeof body.enabled !== "boolean")) throw new Error("Enter valid processing-cost formulas for the supported payment methods.");
  if (body.enabled === true) throw new Error("Processing charges cannot be enabled until pricing, payment-method selection and legal review are complete.");
  if (!body.methods || typeof body.methods !== "object" || Array.isArray(body.methods) || Object.keys(body.methods).some((method) => !METHODS.includes(method)))
    throw new Error("Enter valid processing-cost formulas for the supported payment methods.");
  const methods = {};
  for (const method of METHODS) {
    const formula = body.methods[method];
    if (formula === null || formula === undefined) { methods[method] = null; continue; }
    if (!formula || typeof formula !== "object" || Array.isArray(formula) || Object.keys(formula).length !== 2 ||
        !Number.isInteger(formula.rateBasisPoints) || formula.rateBasisPoints < 0 || formula.rateBasisPoints > 10000 ||
        !Number.isInteger(formula.fixedMinor) || formula.fixedMinor < 0 || formula.fixedMinor > 1000000)
      throw new Error("Enter valid processing-cost formulas for the supported payment methods.");
    methods[method] = { rateBasisPoints: formula.rateBasisPoints, fixedMinor: formula.fixedMinor };
  }
  return methods;
}

module.exports = function createCheckout(ctx) {
  const { getDb, client, enabled, live, send, body, now, gate, commitStage, ownerHealthy, appUrl } = ctx;
  const checkoutOwners = ctx.checkoutOwners || new Set();
  // Until T272c rolls out verified fulfilment, never acknowledge our payment events as no-op receipts.
  for (const type of ["checkout.session.completed", "checkout.session.async_payment_succeeded", "checkout.session.async_payment_failed"])
    ctx.on(type, { stage({ object }) {
      if (object?.integration_identifier === INTEGRATION || object?.metadata?.checkoutAttemptId)
        throw new Error("Checkout fulfilment is not rolled out");
    } });
  const active = new Map();
  const data = () => getDb();
  const find = (invoiceId, actor) => {
    const invoices = (data().invoices || []).filter((invoice) => invoice.id === invoiceId);
    if (invoices.length !== 1 || actor.role !== "customer" || invoices[0].customerId !== actor.id) throw new Error("Invoice not found");
    const invoice = invoices[0], owners = (data().users || []).filter((owner) => owner.id === invoice.customerId && owner.role === "customer" && !owner.orgOwnerId);
    const payments = (data().payments || []).filter((payment) => payment.invoiceId === invoice.id);
    if (actor.isMember && !(data().users || []).some((member) => member.id === actor.memberId && member.orgOwnerId === invoice.customerId && member.role === "customer" &&
        (!member.status || member.status === "Active") && member.permissions?.invoices === "full")) throw new Error("Invoice not found");
    if (owners.length !== 1 || (owners[0].status && owners[0].status !== "Active") || payments.length !== 1 || invoice.status !== "Approved" || payments[0].status !== "Scheduled")
      throw new Error("Only an approved, unpaid invoice can be paid.");
    if (invoice.currency !== undefined && String(invoice.currency).toLowerCase() !== "eur") throw new Error("Only an approved EUR invoice with valid totals can be paid.");
    const amount = minor(invoice.grossAmount ?? invoice.amount), net = minor(invoice.netAmount ?? invoice.amount);
    if (amount < 50 || net > amount || minor(invoice.amount) !== amount || minor(payments[0].amount) !== amount ||
        (payments[0].netAmount !== undefined && minor(payments[0].netAmount) !== net) || !(data().suppliers || []).some((supplier) => supplier.id === invoice.supplierId))
      throw new Error("Only an approved EUR invoice with valid totals can be paid.");
    return { invoice, owner: owners[0], payment: payments[0], amount, net };
  };
  function customerParams(owner) {
    const cp = owner.companyProfile || {}, name = String(cp.legalName || owner.company || owner.name || "").trim();
    if (!name || !owner.email) throw new Error("Complete your company billing details before paying.");
    // taxId is a general tax number, not a verified VAT ID. Never reinterpret it as eu_vat.
    const vat = String(cp.vatId || "").replace(/\s/g, "").toUpperCase();
    if (vat && !/^(AT|BE|BG|CY|CZ|DE|DK|EE|EL|ES|FI|FR|HR|HU|IE|IT|LT|LU|LV|MT|NL|PL|PT|RO|SE|SI|SK)[A-Z0-9]{2,13}$/.test(vat))
      throw new Error("Complete your company billing details before paying.");
    return { name: name.slice(0, 200), email: owner.email,
      ...(cp.address ? { address: { line1: String(cp.address).slice(0, 200) } } : {}),
      ...(vat ? { tax_id_data: [{ type: "eu_vat", value: vat }] } : {}), metadata: { craftcrewCustomerId: owner.id } };
  }
  function current(prepared, actor) {
    const latest = find(prepared.invoiceId, actor);
    if (!equal(binding(latest.invoice), prepared.invoiceBinding) || !equal(ownerBinding(latest.owner), prepared.ownerBinding) ||
        latest.payment.id !== prepared.paymentId || !equal(latest.owner.stripeBilling, prepared.billing) ||
        !equal(latest.payment.stripe?.checkout, prepared.checkout))
      throw new Error("Billing or invoice details changed. Ask an administrator to reconcile Checkout before trying again.");
    return latest;
  }
  async function publish(stage) { ownerHealthy(); await commitStage({ getDb, stage }); }
  async function reserve(invoiceId, actor) {
    return gate.run(async () => {
      ownerHealthy();
      const found = find(invoiceId, actor), params = customerParams(found.owner), stage = atomic.createStage();
      checkoutOwners.add(found.owner.id);
      let billing = found.owner.stripeBilling;
      if (!billing) {
        billing = { attemptId: crypto.randomUUID(), params, startedAt: now(), customerId: null };
        stage.patch("users", found.owner.id, { stripeBilling: billing }, { stripeBilling: undefined, ...ownerBinding(found.owner) });
      } else if (!equal(billing.params, params)) throw new Error("Billing or invoice details changed. Ask an administrator to reconcile Checkout before trying again.");
      let checkout = found.payment.stripe?.checkout;
      if (!checkout) {
        const bankTransferCountry = String((ctx.env || process.env).STRIPE_BANK_TRANSFER_COUNTRY || "DE").trim().toUpperCase();
        if (!["BE", "DE", "ES", "FR", "IE", "NL"].includes(bankTransferCountry)) throw new Error("Complete your company billing details before paying.");
        checkout = { attemptId: crypto.randomUUID(), startedAt: now(), status: "creating", sessionId: null,
          customerId: billing.customerId, amount: found.amount, currency: "eur", invoiceBinding: canonical(binding(found.invoice)),
          bankTransferCountry, returnUrl: `${appUrl()}/#/customer/invoice/${encodeURIComponent(invoiceId)}`,
          productName: locales.text(found.owner.language, "checkout.invoiceTitle", { number: found.invoice.number || found.invoice.id }) };
        stage.patch("payments", found.payment.id, { stripe: { ...(found.payment.stripe || {}), checkout } }, { status: "Scheduled", stripe: clone(found.payment.stripe) });
      } else if (!equal(checkout.invoiceBinding, canonical(binding(found.invoice)))) throw new Error("Billing or invoice details changed. Ask an administrator to reconcile Checkout before trying again.");
      else if (!checkout.customerId && billing.customerId) {
        checkout = { ...checkout, customerId: billing.customerId };
        stage.patch("payments", found.payment.id, { stripe: { ...found.payment.stripe, checkout } }, { stripe: clone(found.payment.stripe), status: "Scheduled" });
      }
      stage.patch("invoices", found.invoice.id, {}, binding(found.invoice));
      if (stage.patches.some((patch) => Object.keys(patch.fields).length)) await publish(stage);
      return { invoiceId, paymentId: found.payment.id, invoiceBinding: binding(found.invoice), ownerBinding: ownerBinding(found.owner),
        ownerId: found.owner.id, billing: clone(billing), checkout: clone(checkout), amount: found.amount };
    });
  }
  function recent(startedAt) {
    const age = Date.parse(now()) - Date.parse(startedAt);
    if (!Number.isFinite(age) || age < 0 || age > 23 * 3600000)
      throw new Error("Checkout needs reconciliation before a new payment attempt. Contact an administrator.");
  }
  function metadata(prepared) {
    return { invoiceId: prepared.invoiceId, projectId: prepared.invoiceBinding.projectId || "", supplierId: prepared.invoiceBinding.supplierId || "",
      paymentId: prepared.paymentId, customerId: prepared.ownerId, checkoutAttemptId: prepared.checkout.attemptId };
  }
  function verifySession(session, prepared) {
    if (!session || !/^cs_[A-Za-z0-9_]+$/.test(session.id) || session.livemode !== false || session.mode !== "payment" ||
        session.currency !== "eur" || session.amount_total !== prepared.amount || session.customer !== prepared.billing.customerId ||
        session.client_reference_id !== prepared.invoiceId || !equal(session.metadata, metadata(prepared)) ||
        session.integration_identifier !== INTEGRATION || (prepared.checkout.sessionId && session.id !== prepared.checkout.sessionId))
      throw new Error("Stripe returned payment details that do not match this invoice. Contact an administrator.");
  }
  async function run(invoiceId, actor) {
    let prepared = await reserve(invoiceId, actor);
    if (!prepared.billing.customerId) {
      recent(prepared.billing.startedAt);
      const customer = await client.customers.create(prepared.billing.params, { idempotencyKey: "craftcrew-customer-" + prepared.billing.attemptId });
      if (!/^cus_[A-Za-z0-9]+$/.test(customer?.id || "") || customer.livemode !== false || customer.metadata?.craftcrewCustomerId !== prepared.ownerId)
        throw new Error("Stripe returned payment details that do not match this invoice. Contact an administrator.");
      prepared = await gate.run(async () => {
        const latest = current(prepared, actor), stage = atomic.createStage();
        const billing = { ...prepared.billing, customerId: customer.id }, checkout = { ...prepared.checkout, customerId: customer.id };
        stage.patch("users", latest.owner.id, { stripeBilling: billing }, { stripeBilling: prepared.billing, ...prepared.ownerBinding });
        stage.patch("payments", latest.payment.id, { stripe: { ...latest.payment.stripe, checkout } }, { stripe: clone(latest.payment.stripe), status: "Scheduled" });
        stage.patch("invoices", latest.invoice.id, {}, prepared.invoiceBinding);
        await publish(stage);
        return { ...prepared, billing, checkout };
      });
    }
    const customer = await client.customers.retrieve(prepared.billing.customerId);
    if (customer.id !== prepared.billing.customerId || customer.deleted || customer.livemode !== false || customer.metadata?.craftcrewCustomerId !== prepared.ownerId)
      throw new Error("Stripe returned payment details that do not match this invoice. Contact an administrator.");
    let session;
    if (prepared.checkout.sessionId) session = await client.checkout.sessions.retrieve(prepared.checkout.sessionId);
    else {
      recent(prepared.checkout.startedAt);
      const back = prepared.checkout.returnUrl;
      session = await client.checkout.sessions.create({ mode: "payment", customer: prepared.billing.customerId,
        client_reference_id: invoiceId, integration_identifier: INTEGRATION, metadata: metadata(prepared),
        line_items: [{ quantity: 1, price_data: { currency: "eur", unit_amount: prepared.amount, product_data: { name: prepared.checkout.productName } } }],
        payment_intent_data: { transfer_group: invoiceId, metadata: metadata(prepared) },
        payment_method_options: { customer_balance: { funding_type: "bank_transfer", bank_transfer: { type: "eu_bank_transfer", eu_bank_transfer: { country: prepared.checkout.bankTransferCountry } } } },
        success_url: back + "?checkout=success", cancel_url: back + "?checkout=cancel",
      }, { idempotencyKey: "craftcrew-checkout-" + prepared.checkout.attemptId });
    }
    verifySession(session, prepared);
    if (session.status !== "open" || session.payment_status !== "unpaid")
      throw new Error("Your payment is being confirmed or needs reconciliation. Do not start another payment.");
    const url = safeUrl(session.url);
    return gate.run(async () => {
      const latest = current(prepared, actor), stage = atomic.createStage();
      if (!prepared.checkout.sessionId) {
        stage.patch("payments", latest.payment.id, { stripe: { ...latest.payment.stripe,
          checkout: { ...prepared.checkout, sessionId: session.id, status: "open", publishedAt: now() } } }, { stripe: clone(latest.payment.stripe), status: "Scheduled" });
        stage.patch("invoices", latest.invoice.id, {}, prepared.invoiceBinding);
        stage.patch("users", latest.owner.id, {}, { stripeBilling: prepared.billing, ...prepared.ownerBinding });
        await publish(stage);
      }
      return { url };
    });
  }
  async function pay(invoiceId, actor) {
    if (!enabled) throw new Error("Payments are off: no Stripe key is set.");
    if (live) throw new Error("Live payments are not enabled.");
    // Do not acquire the mutation gate while awaiting a provider; active callers share one attempt.
    const key = actor.id + ":" + invoiceId;
    if (!active.has(key)) active.set(key, run(invoiceId, actor).finally(() => active.delete(key)));
    const result = await active.get(key);
    return gate.run(() => { ownerHealthy(); find(invoiceId, actor); return result; });
  }
  function view(invoiceId, actor) {
    const invoice = (data().invoices || []).find((item) => item.id === invoiceId);
    if (!invoice || actor.role !== "customer" || invoice.customerId !== actor.id) throw new Error("Invoice not found");
    let eligible = false;
    try { find(invoiceId, actor); eligible = true; } catch {}
    return { enabled, available: enabled && eligible && (!actor.isMember || actor.permissions?.invoices === "full"),
      pending: !!(data().payments || []).find((payment) => payment.invoiceId === invoiceId)?.stripe?.checkout,
      fulfilmentReady: false };
  }
  const known = new Set(["Invoice not found", "Only an approved, unpaid invoice can be paid.", "Only an approved EUR invoice with valid totals can be paid.",
    "Complete your company billing details before paying.", "Billing or invoice details changed. Ask an administrator to reconcile Checkout before trying again.",
    "Checkout needs reconciliation before a new payment attempt. Contact an administrator.", "Stripe returned payment details that do not match this invoice. Contact an administrator.",
    "Your payment is being confirmed or needs reconciliation. Do not start another payment.", "Payments are off: no Stripe key is set.", "Live payments are not enabled.",
    "Enter valid processing-cost formulas for the supported payment methods.", "Processing charges cannot be enabled until pricing, payment-method selection and legal review are complete."]);
  async function handle(req, res, url, parts, actor) {
    const invoiceRoute = parts[1] === "invoices" && parts[2] && parts.length === 4 && ["checkout", "pay"].includes(parts[3]);
    const policyRoute = parts[1] === "admin" && parts[2] === "stripe" && parts[3] === "processing-costs" && parts.length === 4;
    // Manual completion cannot race an existing Stripe payment; T283/T284 provide reconciliation.
    if (parts[1] === "admin" && parts[2] === "invoices" && req.method === "PATCH") {
      if (actor.role !== "admin") return (send(res, 403, { error: "Admin only" }), true);
      const invoice = (data().invoices || []).find((item) => item.id === parts[3]);
      const payment = invoice && (data().payments || []).find((item) => item.invoiceId === invoice.id);
      if (payment?.stripe?.checkout && ["Mark Paid", "Refund"].includes((await body(req)).action))
        return (send(res, 409, { error: "Checkout needs reconciliation before a new payment attempt. Contact an administrator." }), true);
      return false;
    }
    if (!invoiceRoute && !policyRoute) return false;
    try {
      if (invoiceRoute && req.method === "GET" && parts[3] === "checkout") return (send(res, 200, view(parts[2], actor)), true);
      if (invoiceRoute && req.method === "POST" && parts[3] === "pay") return (send(res, 200, await pay(parts[2], actor)), true);
      if (policyRoute) {
        if (actor.role !== "admin") return (send(res, 403, { error: "Admin only" }), true);
        if (req.method === "GET") return (send(res, 200, { processingCosts: policyView((data().stripeConfigurations || []).find((record) => record.id === POLICY)) }), true);
        if (req.method === "PATCH") {
          if (!enabled) throw new Error("Payments are off: no Stripe key is set.");
          const methods = cleanPolicy(await body(req));
          await gate.run(async () => {
            const old = data().stripeConfigurations.find((record) => record.id === POLICY), stage = atomic.createStage();
            const fields = { enabled: false, methods, updatedAt: now() };
            if (old) stage.patch("stripeConfigurations", POLICY, fields, clone(old));
            else stage.add("stripeConfigurations", { id: POLICY, ...fields });
            await publish(stage);
          });
          return (send(res, 200, { processingCosts: policyView({ methods }) }), true);
        }
      }
      return (send(res, 405, { error: "Not allowed" }), true);
    } catch (error) {
      const message = known.has(error.message) ? error.message : "Stripe could not be reached. Please try again.";
      return (send(res, message === "Invoice not found" ? 404 : known.has(error.message) ? 409 : 503, { error: message }), true);
    }
  }
  return { handle, pay, view, metadata, verifySession, INTEGRATION };
};
module.exports.cleanPolicy = cleanPolicy;
module.exports.safeUrl = safeUrl;
