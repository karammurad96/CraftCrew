/* T273: supplier settlement, refunds and Stripe dispute recovery.
 * Provider calls are deliberately separate from the T282 business commit. T283 will add durable
 * operation identities; until then every call has a stable Stripe idempotency key and persisted IDs.
 */
const atomic = require("./stripe-commit");

const clone = (value) => value === undefined ? undefined : structuredClone(value);
const minor = (value) => {
  const number = Number(value);
  if (!Number.isFinite(number) || number < 0 || !Number.isSafeInteger(Math.round(number * 100)) || Math.abs(number * 100 - Math.round(number * 100)) > 0.00001) throw new Error("The Stripe payment could not be verified for this operation.");
  return Math.round(number * 100);
};
const euros = (value) => value / 100;
const safePercent = (value) => {
  const percent = Number(value);
  return Number.isFinite(percent) && percent >= 0 && percent <= 100 ? percent : 3;
};

module.exports = function createPayoutOperations(ctx) {
  const { getDb, client, enabled, gate, on, now, commitStage, send, body, onRefund, activity } = ctx;
  const operations = ctx.operations || require("./stripe-operations")({ ...ctx, gate });
  const payouts = ctx.payouts;
  const moneyGates = new Map();
  function serialized(invoiceId, work) {
    if (!moneyGates.has(invoiceId)) moneyGates.set(invoiceId, atomic.createGate());
    return moneyGates.get(invoiceId).run(work);
  }
  const data = () => getDb();
  const paymentForCharge = (chargeId) => (data().payments || []).find((payment) => payment.stripe?.checkout?.chargeId === chargeId);
  const paymentForInvoice = (invoiceId) => (data().payments || []).find((payment) => payment.invoiceId === invoiceId);
  const invoiceForPayment = (payment) => (data().invoices || []).find((invoice) => invoice.id === payment?.invoiceId);
  const transferBreakdown = (invoice) => {
    const grossMinor = minor(invoice.grossAmount ?? invoice.amount);
    const netMinor = minor(invoice.netAmount ?? invoice.amount);
    const platformFeePercent = safePercent(data().settings?.platformFeePercent);
    const platformFeeMinor = Math.round(netMinor * platformFeePercent / 100);
    const owner = (data().users || []).find((user) => user.supplierId === invoice.supplierId && !user.orgOwnerId),
      taxId = String(owner?.companyProfile?.vatId || owner?.companyProfile?.taxId || "").replace(/\s/g, "").toUpperCase(),
      euNonGerman = /^(AT|BE|BG|CY|CZ|DK|EE|EL|ES|FI|FR|GR|HR|HU|IE|IT|LT|LU|LV|MT|NL|PL|PT|RO|SE|SI|SK)[A-Z0-9]{2,13}$/.test(taxId),
      feeVatRate = euNonGerman ? 0 : 19,
      feeVatMinor = Math.round(platformFeeMinor * feeVatRate / 100);
    return { grossMinor, netMinor, platformFeePercent, platformFeeMinor, supplierMinor: Math.max(0, grossMinor - platformFeeMinor), currency: "eur", feeVatRate, feeVatMinor };
  };
  const accountReason = (error) => error?.reason || "provider";
  async function persist(payment, fields, expected = payment) {
    const binding = { status: expected.status, stripe: clone(expected.stripe) };
    return gate.run(async () => {
      const stage = atomic.createStage();
      stage.patch("payments", payment.id, fields, binding);
      await commitStage({ getDb, stage });
    });
  }
  function settle(payment, invoice, chargeId) {
    return serialized(invoice.id, () => settleOnce(paymentForInvoice(invoice.id), invoiceForPayment(paymentForInvoice(invoice.id)), chargeId));
  }
  async function settleOnce(payment, invoice, chargeId) {
    if (!payment || !invoice) return;
    if (!enabled || !payouts || payment.status !== "Paid" || invoice.status !== "Paid" || !chargeId || chargeId !== payment.stripe?.checkout?.chargeId || payment.stripe?.payout?.transferId) return;
    const breakdown = transferBreakdown(invoice), checkout = payment.stripe?.checkout || {};
    const common = { currency: breakdown.currency, transfer_group: invoice.id, source_transaction: chargeId,
      amount: breakdown.supplierMinor, metadata: { craftcrew: "T273", invoiceId: invoice.id, paymentId: payment.id, supplierId: invoice.supplierId } };
    try {
      const transferOperation = await operations.reserve({ kind: "transfer", logicalKey: `transfer:${payment.id}`, ownerId: invoice.supplierId, amountMinor: breakdown.supplierMinor, currency: breakdown.currency, metadata: { invoiceId: invoice.id, paymentId: payment.id, supplierId: invoice.supplierId } });
      const transfer = transferOperation.status === "succeeded" && transferOperation.providerRef
        ? await client.transfers.retrieve(transferOperation.providerRef)
        : await operations.call(transferOperation, (key) => payouts.transfer(invoice.supplierId, common, { idempotencyKey: key }), "transfer");
      if (!transfer?.id || transfer.amount !== breakdown.supplierMinor || transfer.currency !== "eur" || transfer.destination !== data().suppliers?.find((s) => s.id === invoice.supplierId)?.stripeAccount?.id)
        throw new Error("The Stripe payment could not be verified for this operation.");
      const latest = paymentForInvoice(invoice.id);
      if (!latest) return;
      await persist(latest, { stripe: { ...latest.stripe, payout: {
        status: "transferred", transferId: transfer.id, transferredAt: now(), actualDeductedMinor: breakdown.platformFeeMinor,
        breakdown: { grossMinor: breakdown.grossMinor, netMinor: breakdown.netMinor, platformFeeMinor: breakdown.platformFeeMinor,
          platformFeePercent: breakdown.platformFeePercent, supplierMinor: breakdown.supplierMinor, currency: breakdown.currency,
          vatMode: breakdown.feeVatRate ? "standard" : "reverse_charge", vatRate: breakdown.feeVatRate,
          feeVatMinor: breakdown.feeVatMinor, outstandingFeeVatMinor: breakdown.feeVatMinor, feeCollectionStatus: "net_collected_vat_outstanding" },
      } } }, latest);
    } catch (error) {
      const latest = paymentForInvoice(invoice.id);
      if (latest && !latest.stripe?.payout?.transferId) try { await persist(latest, { stripe: { ...latest.stripe, payout: { ...latest.stripe?.payout, status: "pending", reason: accountReason(error), pendingAt: now(), amountMinor: breakdown.supplierMinor, currency: "eur" } } }, latest); } catch {}
    }
  }
  async function reverseTransfer(payment, amountMinor, key, metadata, operation) {
    const transferId = payment.stripe?.payout?.transferId;
    if (!transferId || amountMinor === 0) return null;
    if (!client?.transfers?.createReversal) throw new Error("The Stripe payment could not be verified for this operation.");
    const reversalOperation = operation || await operations.reserve({ kind: "transfer_reversal", logicalKey: `reversal:${payment.id}:${key}`, ownerId: payment.id, amountMinor, currency: "eur", metadata });
    const reversal = reversalOperation.status === "succeeded" && reversalOperation.providerRef
      ? await client.transfers.retrieveReversal(transferId, reversalOperation.providerRef)
      : await operations.call(reversalOperation, (idempotency) => client.transfers.createReversal(transferId, { amount: amountMinor, metadata }, { idempotencyKey: idempotency }), "transfer_reversal");
    if (!reversal?.id || Number(reversal.amount) !== amountMinor) throw new Error("Stripe returned an invalid transfer reversal");
    return reversal;
  }
  function refundInvoice(invoiceId, reason, amount, requestId) {
    return serialized(invoiceId, () => refundOnce(invoiceId, reason, amount, requestId));
  }
  async function refundOnce(invoiceId, reason, amount, requestId) {
    if (!enabled || !client) throw new Error("Payments are off: no Stripe key is set.");
    const invoice = (data().invoices || []).find((row) => row.id === invoiceId), payment = paymentForInvoice(invoiceId);
    const checkout = payment?.stripe?.checkout;
    if (!invoice || !payment || !["Paid", "Refunded"].includes(payment.status) || !checkout?.chargeId) throw new Error("Only a verified Stripe payment can be refunded.");
    if (typeof reason !== "string" || !reason.trim() || reason.length > 500) throw new Error("A refund reason is required");
    if (amount !== undefined && (typeof amount !== "number" || !Number.isFinite(amount) || amount <= 0)) throw new Error("The refund amount is invalid.");
    if ((amount !== undefined && !requestId) || (requestId !== undefined && (typeof requestId !== "string" || !/^[A-Za-z0-9_-]{8,100}$/.test(requestId)))) throw new Error("Use a unique request ID for each partial refund and reuse it when retrying.");
    const refundKey = `${payment.id}:${requestId || "full"}`, logicalKey = `refund:${refundKey}`;
    const previous = operations.get(logicalKey);
    const original = minor(invoice.grossAmount ?? invoice.amount), already = Number(payment.stripe?.payout?.refundedMinor || 0);
    const before = previous ? Number(previous.metadata.refundedBeforeMinor) : already;
    const refundMinor = previous ? previous.amountMinor : amount === undefined ? original - already : minor(amount);
    if (previous && (previous.ownerId !== invoice.customerId || previous.metadata.chargeId !== checkout.chargeId || previous.metadata.originalMinor !== original || (amount !== undefined && minor(amount) !== refundMinor) || previous.metadata.reason !== reason.trim())) throw new Error("The refund amount is invalid.");
    if (!Number.isSafeInteger(refundMinor) || refundMinor <= 0 || refundMinor > original - before) throw new Error("The refund amount is invalid.");
    const total = before + refundMinor, full = total === original;
    if (previous?.status === "succeeded" && already >= total) return { invoiceId, refundId: previous.providerRef, amount: euros(refundMinor), status: full ? "Refunded" : "Partially refunded" };
    if (payment.status !== "Paid" || already !== before) throw new Error("The refund amount is invalid.");
    const refundMetadata = { craftcrew: "T273", invoiceId, paymentId: payment.id, reason: reason.trim(), chargeId: checkout.chargeId, originalMinor: original, refundedBeforeMinor: before };
    const refundOperation = await operations.reserve({ kind: "refund", logicalKey: `refund:${refundKey}`, ownerId: invoice.customerId, amountMinor: refundMinor, currency: "eur", metadata: refundMetadata });
    const refund = refundOperation.status === "succeeded" && refundOperation.providerRef
      ? await client.refunds.retrieve(refundOperation.providerRef)
      : await operations.call(refundOperation, (key) => client.refunds.create({ charge: checkout.chargeId, amount: refundMinor, metadata: refundMetadata }, { idempotencyKey: key }), "refund");
    if (!refund?.id || Number(refund.amount) !== refundMinor || refund.status !== "succeeded") throw new Error("The Stripe payment could not be verified for this operation.");
    const supplierMinor = payment.stripe?.payout?.breakdown?.supplierMinor ?? transferBreakdown(invoice).supplierMinor;
    const reversalMinor = Math.round(supplierMinor * total / original) - Math.round(supplierMinor * before / original);
    const reversalKey = refundKey;
    const reversal = await reverseTransfer(payment, reversalMinor, reversalKey, { craftcrew: "T273", invoiceId, paymentId: payment.id, refundId: refund.id });
    const latest = paymentForInvoice(invoiceId);
    if (!latest) throw new Error("The Stripe payment could not be verified for this operation.");
    await persist(latest, { status: full ? "Refunded" : latest.status, refundReason: String(reason).slice(0, 500), refundedAt: full ? now() : latest.refundedAt,
      stripe: { ...latest.stripe, payout: { ...latest.stripe?.payout, refundedMinor: total, refundId: refund.id, reversalId: reversal?.id || null, refundStatus: full ? "refunded" : "partially_refunded" } } }, latest);
    if (full && onRefund) onRefund({ ...latest, status: "Refunded" });
    return { invoiceId, refundId: refund.id, reversalId: reversal?.id || null, amount: euros(refundMinor), status: full ? "Refunded" : "Partially refunded" };
  }
  function paymentForDispute(object) {
    const chargeId = typeof object?.charge === "string" ? object.charge : object?.charge?.id;
    return paymentForCharge(chargeId) || (object?.payment_intent && (data().payments || []).find((p) => p.stripe?.checkout?.paymentIntentId === object.payment_intent));
  }
  function settlementTransition({ stage, object }) {
    const matches = (data().payments || []).filter((payment) => payment.id === object?.metadata?.paymentId && payment.invoiceId === object?.metadata?.invoiceId);
    if (matches.length !== 1) return;
    const payment = matches[0];
    const patches = stage.patches.filter((patch) => patch.collection === "payments" && patch.id === payment.id);
    const status = patches.reduce((value, patch) => patch.fields.status ?? value, payment.status);
    const stripe = patches.reduce((value, patch) => patch.fields.stripe ?? value, payment.stripe);
    if (status !== "Paid" || !stripe?.checkout?.chargeId || stripe.checkout.sessionId !== object.id) return;
    return { status: "paid", invoiceId: payment.invoiceId };
  }
  on("checkout.session.completed", { stage: settlementTransition, async afterCommit(transition) {
    if (transition?.status !== "paid") return;
    const payment = paymentForInvoice(transition.invoiceId), invoice = invoiceForPayment(payment);
    if (payment && invoice) await settle(payment, invoice, payment.stripe?.checkout?.chargeId);
  } });
  on("checkout.session.async_payment_succeeded", { stage: settlementTransition, async afterCommit(transition) {
    if (transition?.status !== "paid") return;
    const payment = paymentForInvoice(transition.invoiceId), invoice = invoiceForPayment(payment);
    if (payment && invoice) await settle(payment, invoice, payment.stripe?.checkout?.chargeId);
  } });
  on("charge.dispute.created", {
    async prepare(object, event) {
      const payment = paymentForDispute(object), invoice = invoiceForPayment(payment);
      if (!payment || !invoice) throw new Error("Dispute payment binding failed");
      const transfer = payment.stripe?.payout?.transferId, amount = transfer ? transferBreakdown(invoice).supplierMinor : 0;
      const reversal = transfer ? await reverseTransfer(payment, amount, `dispute:${object.id}`, { craftcrew: "T273", invoiceId: invoice.id, paymentId: payment.id, disputeId: object.id }) : null;
      return { payment, invoice, object, reversal };
    },
    stage({ stage, prepared, event }) {
      const current = paymentForInvoice(prepared.invoice.id); if (!current) throw new Error("Dispute payment binding failed");
      const existing = (data().disputes || []).find((d) => d.stripeDisputeId === prepared.object.id);
      if (!existing) stage.add("disputes", { id: `stripe-dispute-${prepared.object.id}`, stripeDisputeId: prepared.object.id, projectId: prepared.invoice.projectId, customerId: prepared.invoice.customerId, supplierId: prepared.invoice.supplierId, createdBy: "stripe", type: "Payment", description: "Stripe payment dispute requires review.", status: "Open", createdAt: now(), updatedAt: now() });
      stage.patch("payments", current.id, { stripe: { ...current.stripe, payout: { ...current.stripe?.payout, disputeId: prepared.object.id, disputeReversalId: prepared.reversal?.id || null, disputeStatus: "open" } } }, { status: current.status, stripe: clone(current.stripe) });
      stage.patch("invoices", prepared.invoice.id, { status: "Disputed", updatedAt: now() }, { status: prepared.invoice.status });
      return { status: "disputed" };
    },
  });
  on("charge.dispute.closed", { stage({ stage, object }) {
    const payment = paymentForDispute(object), invoice = invoiceForPayment(payment); if (!payment || !invoice) return;
    const dispute = (data().disputes || []).find((d) => d.stripeDisputeId === object.id); if (dispute) stage.patch("disputes", dispute.id, { status: ["won", "won_for_merchant"].includes(object.status) ? "Resolved" : "Closed", resolution: String(object.status || "closed").slice(0, 80), updatedAt: now() }, { status: dispute.status });
    stage.patch("payments", payment.id, { stripe: { ...payment.stripe, payout: { ...payment.stripe?.payout, disputeStatus: object.status || "closed" } } }, { status: payment.status, stripe: clone(payment.stripe) });
  } });
  async function handle(req, res, url, parts, actor) {
    if (!(parts[1] === "admin" && parts[2] === "invoices" && parts[3] && req.method === "PATCH" && actor?.role === "admin")) return false;
    const input = await body(req); if (input.action !== "Refund") return false;
    const candidate = paymentForInvoice(parts[3]);
    // Preserve the existing offline/manual refund route for bank-transfer and legacy payments.
    if (!candidate?.stripe?.checkout?.chargeId) return false;
    try { const result = await refundInvoice(parts[3], input.reason, input.amount, input.requestId); activity?.(actor, `Stripe refund recorded for invoice ${parts[3]}`); return (send(res, 200, { refund: result }), true); }
    catch (error) {
      const known = ["Only a verified Stripe payment can be refunded.", "The refund amount is invalid.", "A refund reason is required", "Use a unique request ID for each partial refund and reuse it when retrying."];
      return (send(res, known.includes(error.message) ? 409 : 502, { error: known.includes(error.message) ? error.message : "The Stripe payment could not be verified for this operation." }), true);
    }
  }
  return { handle, refundInvoice, settle, transferBreakdown };
};
