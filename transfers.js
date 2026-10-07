/*
 * Payout to the supplier, refunds and disputes (T273, Wave 18). Separate charges and transfers:
 * - Once a Stripe payment is paid (T272), the supplier's share goes to its connected account: amount = gross − the
 *   platform fee (the fee is kept by transferring less, never application_fee_amount), transfer_group = the invoice
 *   id, source_transaction = the charge, so the transfer waits for the funds. Only when stripe_transfers is active
 *   (checked with Stripe by payouts.transfer, T271); else the payment waits as "Payout pending" and the admin sees
 *   why. It is retried when the account becomes active, or by the admin.
 * - The fee is then settled by deduction: T240's statement still lists it, marked so and Paid at once.
 * - The admin's refund refunds the charge through Stripe and reverses the transfer (with separate charges and
 *   transfers, Stripe's `reverse_transfer` flag does not apply: the reversal is its own call); T240 credits the fee.
 * - charge.dispute.created reverses the transfer, sets the invoice to Disputed and opens an escalation;
 *   charge.dispute.closed follows the outcome (won: Paid and paid out again; lost: Refunded).
 */
const cents = (n) => Math.round(Number(n || 0) * 100);
const WON = ["won", "warning_closed"];

module.exports = function createTransfers(ctx) {
  const { getDb, save, send, now, id, notify, activity, client, enabled, on, payouts, checkout, invoiceNo, commission } = ctx;
  const db = () => getDb();
  const admins = () => (db().users || []).filter((u) => u.role === "admin" && u.status !== "Suspended");
  const supplierUser = (i) => (db().users || []).find((u) => u.supplierId === i.supplierId && !u.isMember);
  const invoiceOf = (pay) => (db().invoices || []).find((i) => i.id === pay.invoiceId);
  const byCharge = (charge) => (db().payments || []).find((p) => p.method === "stripe" && p.stripe?.chargeId && p.stripe.chargeId === charge);
  const projectName = (i) => (db().projects || []).find((p) => p.id === i.projectId)?.name || "";

  // The supplier's share: the gross minus the fee, unless the supplier already paid the fee's statement
  function shareOf(pay) {
    const deduct = commission.feeDeductible(pay);
    return { amount: cents(pay.amount) - (deduct ? cents(pay.platformFee) : 0), deduct };
  }
  const busy = new Set();
  async function payout(pay, i = invoiceOf(pay), opts = {}) {
    if (!enabled || pay.method !== "stripe" || pay.stripe?.transferId || !i || !["Paid", "Payout pending"].includes(pay.status) || busy.has(pay.id)) return pay;
    busy.add(pay.id);
    try {
      return await send1(pay, i, opts);
    } finally {
      busy.delete(pay.id);
    }
  }
  async function send1(pay, i, { retry = false }) {
    const { amount, deduct } = shareOf(pay),
      attempt = (pay.stripe.transferAttempts || 0) + 1;
    pay.stripe.transferAttempts = attempt;
    try {
      if (amount <= 0) throw Object.assign(new Error("Nothing to transfer"), { reason: "amount" });
      const tr = await payouts.transfer(
        i.supplierId,
        {
          amount,
          currency: "eur",
          transfer_group: i.id,
          // After a dispute was won the charge's funds already came back once; the new transfer comes from the balance
          ...(pay.stripe.reversedTransfers?.length ? {} : pay.stripe.chargeId ? { source_transaction: pay.stripe.chargeId } : {}),
          description: `Invoice ${invoiceNo(i)}`,
          metadata: { invoiceId: i.id, paymentId: pay.id },
        },
        { idempotencyKey: `transfer-${pay.id}-${attempt}` },
      );
      Object.assign(pay.stripe, { transferId: tr.id, transferAmount: amount / 100, transferredAt: now() });
      delete pay.payoutBlocked;
      delete pay.payoutError;
      pay.status = "Paid";
      if (deduct) commission.settleByDeduction(pay);
      notify(supplierUser(i)?.id, { key: "payoutSent", params: { number: invoiceNo(i), amount: (amount / 100).toFixed(2) } }, "/supplier/payouts");
    } catch (e) {
      const reason = e.reason || "error",
        first = pay.status !== "Payout pending";
      pay.status = "Payout pending";
      pay.payoutBlocked = reason;
      if (reason === "error") pay.payoutError = String(e.message || e).slice(0, 200);
      if (first || retry) for (const a of admins()) notify(a.id, { key: "payoutPending", params: { number: invoiceNo(i) } }, "/admin/billing");
    }
    save();
    return pay;
  }
  checkout.onPaid((pay, i) => payout(pay, i));
  // An account that becomes active gets the payouts that waited for it
  payouts.onChange(async (s) => {
    if (s.stripeAccount?.transfers !== "active") return;
    for (const pay of (db().payments || []).filter((p) => p.status === "Payout pending" && invoiceOf(p)?.supplierId === s.id)) await payout(pay);
  });

  // Takes the supplier's share back; a failure is kept for the admin, never hidden
  async function reverse(pay, i, why) {
    if (!pay.stripe?.transferId) return true;
    try {
      const r = await client.transfers.createReversal(pay.stripe.transferId, { metadata: { invoiceId: i.id, reason: why } }, { idempotencyKey: `reversal-${pay.stripe.transferId}` });
      pay.stripe.reversedTransfers = [...(pay.stripe.reversedTransfers || []), { transferId: pay.stripe.transferId, reversalId: r.id, why, at: now() }];
      delete pay.stripe.transferId;
      delete pay.reversalProblem;
      return true;
    } catch (e) {
      pay.reversalProblem = String(e.message || e).slice(0, 200);
      for (const a of admins()) notify(a.id, { key: "reversalFailed", params: { number: invoiceNo(i) } }, "/admin/billing");
      return false;
    }
  }
  // The admin's refund (server.js): the charge back to the customer, then the transfer back from the supplier
  async function refund(pay, i, reason) {
    if (!enabled || pay?.method !== "stripe") return true;
    try {
      const r = await client.refunds.create(
        { payment_intent: pay.stripe.paymentIntentId, reason: "requested_by_customer", metadata: { invoiceId: i.id, paymentId: pay.id, note: String(reason).slice(0, 400) } },
        { idempotencyKey: `refund-${pay.id}` },
      );
      pay.stripe.refundId = r.id;
    } catch (e) {
      console.error("Stripe refund:", String(e.message || e).slice(0, 200));
      return false;
    }
    await reverse(pay, i, "refund");
    return true;
  }

  on("charge.dispute.created", async (dispute) => {
    const pay = byCharge(dispute?.charge),
      i = pay && invoiceOf(pay);
    if (!i || pay.dispute?.id === dispute.id) return;
    pay.dispute = { id: dispute.id, status: dispute.status, reason: dispute.reason || "", amount: Number(dispute.amount || 0) / 100, openedAt: now() };
    await reverse(pay, i, "dispute");
    i.status = "Disputed";
    i.updatedAt = now();
    const d = {
      id: id("dsp"),
      projectId: i.projectId,
      customerId: i.customerId,
      supplierId: i.supplierId,
      createdBy: null,
      type: "Payment",
      description: `Stripe dispute ${dispute.id} on invoice ${invoiceNo(i)}: ${dispute.reason || "no reason given"}. Answer it in the Stripe Dashboard before the deadline.`,
      status: "Open",
      source: "stripe",
      stripeDisputeId: dispute.id,
      invoiceId: i.id,
      createdAt: now(),
      updatedAt: now(),
    };
    (db().disputes ||= []).unshift(d);
    pay.dispute.escalationId = d.id;
    for (const a of admins()) notify(a.id, { key: "escalationOpened", params: { project: projectName(i), type: d.type } }, "/admin/disputes");
    notify(supplierUser(i)?.id, { key: "invoiceDisputed", params: { number: invoiceNo(i) } });
    save();
  });
  on("charge.dispute.closed", async (dispute) => {
    const pay = byCharge(dispute?.charge),
      i = pay && invoiceOf(pay);
    if (!i || !pay.dispute || pay.dispute.id !== dispute.id || pay.dispute.closedAt) return;
    const won = WON.includes(dispute.status);
    Object.assign(pay.dispute, { status: dispute.status, closedAt: now() });
    const escalation = (db().disputes || []).find((x) => x.id === pay.dispute.escalationId);
    if (escalation) Object.assign(escalation, { status: "Resolved", resolution: `Stripe closed the dispute: ${dispute.status}.`, updatedAt: now() });
    i.updatedAt = now();
    if (won) {
      i.status = "Paid";
      save();
      await payout(pay, i);
    } else {
      Object.assign(i, { status: "Refunded", refundReason: "Dispute lost", refundedAt: now() });
      Object.assign(pay, { status: "Refunded", refundReason: "Dispute lost", refundedAt: now() });
      commission.onRefund(pay);
    }
    notify(supplierUser(i)?.id, { key: won ? "disputeWon" : "disputeLost", params: { number: invoiceNo(i) } });
    save();
  });

  // The admin retries a payout that waits
  async function handle(req, res, url, parts, user) {
    if (parts[1] !== "admin" || parts[2] !== "payments" || !parts[3] || parts[4] !== "payout" || req.method !== "POST") return false;
    if (user.role !== "admin") return (send(res, 403, { error: "Admin only" }), true);
    const pay = (db().payments || []).find((p) => p.id === parts[3]);
    if (!pay) return (send(res, 404, { error: "Payment not found" }), true);
    if (pay.status !== "Payout pending") return (send(res, 409, { error: "Only a payout that waits can be sent again." }), true);
    await payout(pay, invoiceOf(pay), { retry: true });
    activity(user, `Payout retried for invoice ${invoiceNo(invoiceOf(pay) || {})}`);
    return (send(res, 200, { payment: pay }), true);
  }

  return { handle, payout, refund, shareOf };
};
