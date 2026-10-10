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
  const { getDb, client, enabled, live, send, body, now, gate, commitStage, ownerHealthy, appUrl, id } = ctx;
  const operations = ctx.operations || require("./stripe-operations")({ ...ctx, gate });
  const checkoutOwners = ctx.checkoutOwners || new Set();
  const fulfilmentTypes = new Set(["checkout.session.completed", "checkout.session.async_payment_succeeded", "checkout.session.async_payment_failed"]);
  const eventFailure = (code) => { const error = new Error("Checkout provider data could not be verified"); error.code = code; return error; };
  const expectedMetadata = (invoice, payment, checkout) => ({
    invoiceId: invoice.id, projectId: invoice.projectId || "", supplierId: invoice.supplierId || "",
    paymentId: payment.id, customerId: invoice.customerId, checkoutAttemptId: checkout.attemptId,
  });
  const exactMetadata = (actual, expected) => equal(actual || {}, expected);
  function checkoutRecord(object) {
    if (!object || object.object !== "checkout.session" || !/^cs_[A-Za-z0-9_]+$/.test(object.id) ||
        object.integration_identifier !== INTEGRATION || !object.metadata?.checkoutAttemptId)
      throw eventFailure("provider_identity");
    const rows = (getDb().payments || []).filter((payment) => payment.stripe?.checkout?.sessionId === object.id ||
      payment.stripe?.checkout?.attemptId === object.metadata.checkoutAttemptId);
    if (rows.length !== 1) throw eventFailure("payment_binding");
    const payment = rows[0], invoice = (getDb().invoices || []).find((item) => item.id === payment.invoiceId), checkout = payment.stripe.checkout;
    if (!invoice || !checkout || checkout.sessionId !== object.id || checkout.attemptId !== object.metadata.checkoutAttemptId ||
        invoice.customerId !== object.metadata.customerId || payment.id !== object.metadata.paymentId ||
        invoice.id !== object.metadata.invoiceId || !exactMetadata(object.metadata, expectedMetadata(invoice, payment, checkout)))
      throw eventFailure("payment_binding");
    return { payment, invoice, checkout };
  }
  function verifyFulfilmentSession(session, record) {
    const expected = expectedMetadata(record.invoice, record.payment, record.checkout);
    if (!session || session.id !== record.checkout.sessionId || session.livemode !== false || session.mode !== "payment" || session.status !== "complete" ||
        session.currency !== "eur" || session.amount_total !== record.checkout.amount ||
        session.customer !== record.checkout.customerId || session.client_reference_id !== record.invoice.id ||
        session.integration_identifier !== INTEGRATION || !exactMetadata(session.metadata, expected)) throw eventFailure("session_mismatch");
    return session;
  }
  async function retrievePayment(session, record) {
    if (!session.payment_intent) throw eventFailure("payment_intent_missing");
    const intentId = typeof session.payment_intent === "string" ? session.payment_intent : session.payment_intent.id;
    if (!/^pi_[A-Za-z0-9_]+$/.test(intentId)) throw eventFailure("payment_intent_identity");
    let intent = typeof session.payment_intent === "object" ? session.payment_intent : null;
    if (!intent || intent.id !== intentId || !intent.charges) intent = await client.paymentIntents.retrieve(intentId, { expand: ["latest_charge", "charges.data"] });
    const expected = expectedMetadata(record.invoice, record.payment, record.checkout);
    if (!intent || intent.id !== intentId || intent.livemode !== false || intent.amount !== record.checkout.amount ||
        intent.currency !== "eur" || intent.customer !== record.checkout.customerId || !exactMetadata(intent.metadata, expected) || intent.status !== "succeeded")
      throw eventFailure("payment_intent_mismatch");
    let charge = intent.latest_charge;
    if (!charge && intent.charges?.data?.length) charge = intent.charges.data[0];
    if (typeof charge === "string") charge = await client.charges.retrieve(charge);
    if (!charge || charge.object !== "charge" || charge.livemode !== false || charge.payment_intent !== intent.id ||
        charge.amount !== intent.amount || charge.currency !== "eur" || charge.paid !== true || charge.status !== "succeeded")
      throw eventFailure("charge_mismatch");
    return { intent, charge };
  }
  const recipientUsers = (invoice) => [
    (getDb().users || []).find((user) => user.id === invoice.customerId),
    (getDb().users || []).find((user) => user.supplierId === invoice.supplierId && !user.orgOwnerId),
  ].filter(Boolean).filter((user, index, all) => all.findIndex((candidate) => candidate.id === user.id) === index);
  function notificationStage(stage, invoice, key, event, params) {
    for (const user of recipientUsers(invoice)) stage.add("notifications", {
      id: `stripe-${event.id}-${user.id}`,
      userId: user.id,
      text: locales.notifyText({ key, params }, user.language),
      link: `/${user.role === "supplier" ? "supplier" : "customer"}/invoice/${invoice.id}`,
      read: false,
      createdAt: now(),
    });
  }
  for (const type of fulfilmentTypes) ctx.on(type, {
    async prepare(object, event) {
      const record = checkoutRecord(object);
      verifyFulfilmentSession(object, record);
      const session = verifyFulfilmentSession(await client.checkout.sessions.retrieve(object.id, { expand: ["payment_intent"] }), record);
      if (object.payment_status !== undefined && object.payment_status !== session.payment_status)
        throw eventFailure("event_session_status");
      const failed = type.endsWith("async_payment_failed");
      let provider = null;
      if (!failed && (type.endsWith("async_payment_succeeded") || session.payment_status !== "unpaid")) provider = await retrievePayment(session, record);
      if (failed && session.payment_status === "paid") throw eventFailure("failure_after_success");
      return { record, session, provider, failed, eventId: event.id };
    },
    stage({ stage, prepared, event }) {
      if (!prepared?.record || !fulfilmentTypes.has(event.type)) throw eventFailure("prepared");
      const { payment, invoice, checkout } = checkoutRecord(prepared.session), current = getDb();
      const latestPayment = (current.payments || []).find((row) => row.id === payment.id), latestInvoice = (current.invoices || []).find((row) => row.id === invoice.id);
      if (!latestPayment || !latestInvoice || latestPayment.invoiceId !== latestInvoice.id) throw eventFailure("payment_binding");
      if (prepared.failed) {
        if (latestPayment.status === "Paid" || latestInvoice.status === "Paid") throw eventFailure("failure_after_success");
        stage.patch("payments", payment.id, { stripe: { ...latestPayment.stripe, checkout: { ...checkout, status: "failed", failedAt: now(), failureCode: "async_payment_failed" } } }, { status: latestPayment.status, stripe: latestPayment.stripe });
        stage.patch("invoices", invoice.id, {}, { status: latestInvoice.status });
        notificationStage(stage, invoice, "invoicePaymentFailed", event, { number: invoice.number || invoice.id });
        return { status: "failed", invoiceId: invoice.id };
      }
      if (prepared.session.payment_status === "unpaid") {
        if (latestPayment.status === "Paid" || latestInvoice.status === "Paid") throw eventFailure("paid_session_unpaid");
        stage.patch("payments", payment.id, { stripe: { ...latestPayment.stripe, checkout: { ...checkout, status: "pending", pendingAt: now() } } }, { status: latestPayment.status, stripe: latestPayment.stripe });
        stage.patch("invoices", invoice.id, {}, { status: latestInvoice.status });
        return { status: "pending", invoiceId: invoice.id };
      }
      if (!prepared.provider) throw eventFailure("payment_missing");
      if (latestPayment.status === "Paid" || latestInvoice.status === "Paid") {
        if (latestPayment.status !== "Paid" || latestInvoice.status !== "Paid") throw eventFailure("paid_binding");
        stage.patch("payments", payment.id, {}, { status: latestPayment.status });
        stage.patch("invoices", invoice.id, {}, { status: latestInvoice.status });
        return { status: "paid", invoiceId: invoice.id, duplicate: true };
      }
      const paidAt = now();
      stage.patch("payments", payment.id, { status: "Paid", paidAt, stripe: { ...latestPayment.stripe, checkout: { ...checkout, status: "paid", paidAt, paymentIntentId: prepared.provider.intent.id, chargeId: prepared.provider.charge.id } } }, { status: latestPayment.status, stripe: latestPayment.stripe });
      stage.patch("invoices", invoice.id, { status: "Paid", paymentDate: paidAt, updatedAt: paidAt }, { status: latestInvoice.status });
      notificationStage(stage, invoice, "invoicePaid", event, { number: invoice.number || invoice.id });
      return { status: "paid", invoiceId: invoice.id };
    },
  });
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
      const customerOperation = operations.record({ kind: "customer", logicalKey: `customer:${found.owner.id}`, ownerId: found.owner.id, metadata: { ownerId: found.owner.id } });
      const checkoutOperation = operations.record({ kind: "checkout_session", logicalKey: `checkout:${found.payment.id}`, ownerId: found.owner.id, amountMinor: found.amount, currency: "eur", metadata: { invoiceId, paymentId: found.payment.id } });
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
      operations.stageAdd(stage, customerOperation);
      operations.stageAdd(stage, checkoutOperation);
      stage.patch("invoices", found.invoice.id, {}, binding(found.invoice));
      if (stage.additions.length || stage.patches.some((patch) => Object.keys(patch.fields).length)) await publish(stage);
      return { invoiceId, paymentId: found.payment.id, invoiceBinding: binding(found.invoice), ownerBinding: ownerBinding(found.owner),
        ownerId: found.owner.id, billing: clone(billing), checkout: clone(checkout), amount: found.amount, customerOperation, checkoutOperation };
    });
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
    const params = prepared.billing.params;
    const matchesCustomer = async (customer) => {
      if (!/^cus_[A-Za-z0-9]+$/.test(customer?.id || "") || customer.deleted || customer.livemode !== false || customer.metadata?.craftcrewCustomerId !== prepared.ownerId || customer.name !== params.name || customer.email !== params.email ||
          (params.address && customer.address?.line1 !== params.address.line1)) return false;
      if (params.tax_id_data?.length) {
        const taxes = await client.customers.listTaxIds(customer.id, { limit: 100 });
        if (taxes.has_more !== false || !Array.isArray(taxes.data) || !params.tax_id_data.every((tax) => taxes.data.some((t) => t.type === tax.type && t.value === tax.value))) return false;
      }
      return true;
    };
    if (!prepared.billing.customerId) {
      const customerOperation = prepared.customerOperation;
      const customer = await operations.resolve(customerOperation, { type: "customer", startedAt: prepared.billing.startedAt, create: (key) => client.customers.create(params, { idempotencyKey: key }),
        retrieve: (ref) => client.customers.retrieve(ref), list: (page) => client.customers.list({ ...page, email: params.email }), match: matchesCustomer });
      prepared = await gate.run(async () => {
        const latest = current(prepared, actor), stage = atomic.createStage();
        const billing = { ...prepared.billing, customerId: customer.id }, checkout = { ...prepared.checkout, customerId: customer.id };
        operations.stageOutcome(stage, customerOperation, { status: "succeeded", providerRef: customer.id, providerType: "customer" });
        stage.patch("users", latest.owner.id, { stripeBilling: billing }, { stripeBilling: prepared.billing, ...prepared.ownerBinding });
        stage.patch("payments", latest.payment.id, { stripe: { ...latest.payment.stripe, checkout } }, { stripe: clone(latest.payment.stripe), status: "Scheduled" });
        stage.patch("invoices", latest.invoice.id, {}, prepared.invoiceBinding);
        await publish(stage);
        return { ...prepared, billing, checkout };
      });
    }
    const customer = await client.customers.retrieve(prepared.billing.customerId);
    if (customer.id !== prepared.billing.customerId || !(await matchesCustomer(customer)))
      throw new Error("Stripe returned payment details that do not match this invoice. Contact an administrator.");
    let session, sessionOperation = prepared.checkoutOperation;
    if (prepared.checkout.sessionId) session = await client.checkout.sessions.retrieve(prepared.checkout.sessionId);
    else {
      const back = prepared.checkout.returnUrl;
      const params = { mode: "payment", customer: prepared.billing.customerId,
        client_reference_id: invoiceId, integration_identifier: INTEGRATION, metadata: metadata(prepared),
        line_items: [{ quantity: 1, price_data: { currency: "eur", unit_amount: prepared.amount, product_data: { name: prepared.checkout.productName } } }],
        payment_intent_data: { transfer_group: invoiceId, metadata: metadata(prepared) },
        payment_method_options: { customer_balance: { funding_type: "bank_transfer", bank_transfer: { type: "eu_bank_transfer", eu_bank_transfer: { country: prepared.checkout.bankTransferCountry } } } },
        success_url: back + "?checkout=success", cancel_url: back + "?checkout=cancel",
      };
      session = await operations.resolve(sessionOperation, { type: "checkout_session", startedAt: prepared.checkout.startedAt, create: (key) => client.checkout.sessions.create(params, { idempotencyKey: key }),
        retrieve: (ref) => client.checkout.sessions.retrieve(ref), list: (page) => client.checkout.sessions.list({ ...page, customer: prepared.billing.customerId }),
        match: (value) => { try { verifySession(value, prepared); return true; } catch { return false; } } });
    }
    verifySession(session, prepared);
    if (session.status !== "open" || session.payment_status !== "unpaid")
      throw new Error("Your payment is being confirmed or needs reconciliation. Do not start another payment.");
    const url = safeUrl(session.url);
    return gate.run(async () => {
      const latest = current(prepared, actor), stage = atomic.createStage();
      if (!prepared.checkout.sessionId) {
        operations.stageOutcome(stage, sessionOperation, { status: "succeeded", providerRef: session.id, providerType: "checkout_session" });
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
