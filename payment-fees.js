/* T283b2: pinned Stripe fees and detached, strict statement/credit stages. */
const atomic = require('./stripe-commit');
const crypto = require('node:crypto');
const { buildNotification } = require('./payment-notifications');
const clone = (v) => v === undefined ? undefined : structuredClone(v);
const minor = (v) => {
  if (typeof v !== 'number' || !Number.isFinite(v) || v < 0 || !Number.isSafeInteger(Math.round(v * 100)) || Math.abs(v * 100 - Math.round(v * 100)) > 0.00001) throw new Error('The Stripe payment could not be verified for this operation.');
  return Math.round(v * 100);
};
const stripePayment = (p) => !!p.stripe?.checkout;
function approvedFee(payment) {
  const fee = minor(payment.platformFee), net = minor(payment.netAmount), percent = payment.platformFeePercent;
  if (typeof percent !== 'number' || !Number.isFinite(percent) || percent < 0 || percent > 100 || Math.round(net * percent / 100) !== fee) throw new Error('The Stripe payment could not be verified for this operation.');
  return { fee, net, percent };
}
function vatFor(db, supplierId) {
  const owner = db.users?.find((u) => u.supplierId === supplierId && !u.orgOwnerId);
  const vatId = String(owner?.companyProfile?.vatId || '').replace(/\s/g, '').toUpperCase();
  const reverse = /^(AT|BE|BG|CY|CZ|DK|EE|EL|ES|FI|FR|GR|HR|HU|IE|IT|LT|LU|LV|MT|NL|PL|PT|RO|SE|SI|SK)[A-Z0-9]{2,13}$/.test(vatId);
  return { vatId, mode: reverse ? 'intraEU' : 'standard', rate: reverse ? 0 : 19 };
}
function breakdown(db, invoice, payment) {
  const { fee, net, percent } = approvedFee(payment), gross = minor(invoice.grossAmount ?? invoice.amount);
  if (net !== minor(invoice.netAmount ?? invoice.amount) || fee > gross) throw new Error('The Stripe payment could not be verified for this operation.');
  let vat = vatFor(db, invoice.supplierId);
  const issued = db.commissionStatements?.find((s) => s.id === payment.commissionStatementId);
  if (issued) {
    if (issued.status === 'Paid' && !payment.stripe?.payout?.transferId) throw new Error('The Stripe payment could not be verified for this operation.');
    vat = { rate: issued.vatRate, vatId: issued.buyer?.taxId || '' };
  }
  return { grossMinor: gross, netMinor: net, platformFeePercent: percent, platformFeeMinor: fee, supplierMinor: gross - fee,
    currency: 'eur', feeVatRate: vat.rate, feeVatMinor: Math.round(fee * vat.rate / 100), feeVatId: vat.vatId };
}
module.exports = function createFees(ctx) {
  const { getDb, now, commitStage } = ctx;
  const data = () => getDb();
  function allocation(st, paymentId) {
    const index = st.lines?.findIndex((line) => line.paymentId === paymentId), net = minor(st.net), vat = minor(st.vat);
    if (!(index >= 0) || !net) throw new Error('The Stripe payment could not be verified for this operation.');
    const before = st.lines.slice(0, index).reduce((sum, line) => sum + minor(line.fee), 0), amount = minor(st.lines[index].fee);
    return Math.round(vat * (before + amount) / net) - Math.round(vat * before / net);
  }
  const linked = (st) => st.lines?.some((line) => stripePayment(data().payments?.find((p) => p.id === line.paymentId) || {}));
  function historical(st) {
    if (st.collectedAmount !== undefined) return clone(st);
    if (st.status !== 'Open' || data().commissionStatements?.some((s) => s.creditOf === st.id)) return null;
    let captured = 0;
    for (const line of st.lines || []) {
      const p = data().payments?.find((p) => p.id === line.paymentId), payout = p?.stripe?.payout;
      if (!p || !stripePayment(p) || !payout?.transferId || typeof payout.actualDeductedMinor !== 'number' || !Number.isSafeInteger(payout.actualDeductedMinor) || payout.actualDeductedMinor < 0 || payout.actualDeductedMinor !== minor(line.fee) || Number(payout.refundedMinor || 0) || Number(payout.feeCreditedMinor || 0)) return null;
      captured += payout.actualDeductedMinor;
    }
    if (!st.lines?.length || captured > minor(st.gross)) return null;
    return { ...clone(st), collectedAmount: captured / 100, outstandingAmount: (minor(st.gross) - captured) / 100, creditedAmount: 0, creditBalanceAmount: 0 };
  }
  function viewStatement(st) { return linked(st) ? historical(st) || { ...clone(st), feeReviewRequired: true } : clone(st); }
  function notice(stage, statement) {
    data().notifications ||= []; data().outbox ||= [];
    for (const user of (data().users || []).filter((u) => u.supplierId === statement.supplierId)) {
      const records = buildNotification({ userId: user.id, spec: { key: statement.kind === 'credit' ? 'commissionCredit' : 'commissionStatement', params: { number: statement.number } }, link: '/supplier/fees' },
        { data: data(), id: ctx.id || ((prefix) => `${prefix}-${statement.id}-${user.id}`), now, appUrl: ctx.appUrl?.() || '', mailEnabled: ctx.mailEnabled?.() || false });
      for (const row of records.notifications) stage.add('notifications', row);
      for (const row of records.outbox) stage.add('outbox', row);
    }
  }
  function number(stage, kind, at) {
    const key = `commission-${kind}-${at.slice(0, 4)}`, prior = data().counters?.[key];
    const staged = stage.values?.find((v) => v.name === 'counters' && Object.hasOwn(v.fields, key));
    const next = Number(staged?.fields[key] ?? prior ?? 0) + 1;
    if (!Number.isSafeInteger(next) || next < 1) throw new Error('Stripe staged value conflict');
    if (staged) staged.fields[key] = next; else stage.value('counters', { [key]: next }, { [key]: clone(prior) });
    return `CC-${kind === 'credit' ? 'GUT' : 'PROV'}-${at.slice(0, 4)}-${String(next).padStart(4, '0')}`;
  }
  function stageRefund(stage, payment, invoice, operation, total, before, original, fields) {
    data().commissionStatements ||= [];
    const fee = payment.stripe?.payout?.breakdown?.platformFeeMinor ?? approvedFee(payment).fee;
    const supplier = payment.stripe?.payout?.breakdown?.supplierMinor ?? original - fee;
    const credited = total - Math.round(supplier * total / original), previously = before - Math.round(supplier * before / original);
    const delta = credited - previously;
    fields.stripe.payout.feeCreditedMinor = credited;
    fields.stripe.payout.actualRetainedFeeMinor = Math.max(0, fee - credited);
    if (!payment.commissionStatementId || delta === 0) return;
    const st = data().commissionStatements.find((s) => s.id === payment.commissionStatementId);
    const line = st?.lines?.find((l) => l.paymentId === payment.id);
    const priorCredits = (data().commissionStatements || []).filter((s) => s.creditOf === st?.id && s.lines?.some((l) => l.paymentId === payment.id));
    const previouslyBilledCredit = priorCredits.reduce((sum, s) => sum + s.lines.filter((l) => l.paymentId === payment.id).reduce((n, l) => n + Math.round(-l.fee * 100), 0), 0);
    if (!st || !line || minor(line.fee) < previouslyBilledCredit) throw new Error('The Stripe payment could not be verified for this operation.');
    const accountingDelta = Math.min(delta, minor(line.fee) - previouslyBilledCredit);
    const creditId = `fee-credit-${operation.id}`, existing = data().commissionStatements.find((s) => s.id === creditId);
    if (existing) throw new Error('Stripe financial history binding conflict');
    const at = now(), net = accountingDelta / 100;
    const creditedLineNet = previouslyBilledCredit + accountingDelta;
    const originalLineVat = allocation(st, payment.id);
    const priorCreditVat = priorCredits.reduce((sum, s) => sum + (s.vatAllocation?.[payment.id] ?? Math.round(-s.vat * 100)), 0);
    const deltaVat = Math.round(originalLineVat * creditedLineNet / minor(line.fee)) - priorCreditVat;
    const credit = { id: creditId, kind: 'credit', number: accountingDelta ? number(stage, 'credit', at) : null, supplierId: st.supplierId, period: st.period,
      issueDate: at.slice(0, 10), dueDate: st.dueDate, createdAt: at, status: 'Credited', seller: clone(st.seller), buyer: clone(st.buyer),
      vatMode: st.vatMode, vatRate: st.vatRate, creditOf: st.id, creditOfNumber: st.number, reason: `Refund of invoice ${line.invoiceNo}`,
      operationId: operation.id, paymentId: payment.id, lines: [{ ...clone(line), fee: -net }], net: -net,
      vat: -deltaVat / 100 };
    credit.gross = Math.round((credit.net + credit.vat) * 100) / 100;
    const allocatedVat = payment.stripe?.payout?.feeVatStatementAllocatedMinor ?? originalLineVat;
    fields.stripe.payout.feeVatStatementAllocatedMinor = allocatedVat;
    fields.stripe.payout.outstandingFeeVatMinor = Math.max(0, allocatedVat - priorCreditVat - deltaVat - Number(payment.stripe?.payout?.feeVatManualCollectedMinor || 0));
    if (accountingDelta) {
      stage.add('commissionStatements', credit); notice(stage, credit);
      fields.commissionCreditIds = [...(payment.commissionCreditIds || (payment.commissionCreditId ? [payment.commissionCreditId] : [])), credit.id];
      fields.commissionCreditId = credit.id;
    }
    const creditedTotal = (data().commissionStatements || []).filter((s) => s.creditOf === st.id).reduce((sum, s) => sum + Math.round(-s.gross * 100), 0) + Math.round(-credit.gross * 100);
    const originalCollected = st.collectedAmount !== undefined ? Math.round(st.collectedAmount * 100) : st.lines.reduce((sum, l) => {
      const p = data().payments?.find((p) => p.id === l.paymentId);
      return sum + Math.max(0, Number(p?.stripe?.payout?.actualDeductedMinor || 0) - Number(p?.stripe?.payout?.feeCreditedMinor || 0));
    }, 0);
    const collected = Math.max(0, originalCollected - delta);
    const outstanding = Math.max(0, Math.round(st.gross * 100) - creditedTotal - collected);
    stage.patch('commissionStatements', st.id, { collectedAmount: collected / 100, outstandingAmount: outstanding / 100,
      creditedAmount: creditedTotal / 100, creditBalanceAmount: Math.max(0, creditedTotal + collected - Math.round(st.gross * 100)) / 100,
      status: outstanding === 0 ? (creditedTotal >= Math.round(st.gross * 100) ? 'Credited' : 'Paid') : st.status },
      { status: st.status, collectedAmount: st.collectedAmount, outstandingAmount: st.outstandingAmount, creditedAmount: st.creditedAmount, vatMode: st.vatMode, vatRate: st.vatRate, number: st.number, lines: clone(st.lines) });
  }
  function stageTransfer(stage, payment, fields) {
    const st = data().commissionStatements?.find((s) => s.id === payment.commissionStatementId);
    if (!st) return;
    const allocated = payment.stripe?.payout?.feeVatStatementAllocatedMinor ?? allocation(st, payment.id);
    fields.stripe.payout.feeVatStatementAllocatedMinor = allocated;
    fields.stripe.payout.outstandingFeeVatMinor = allocated;
    const captured = Math.round(Number(st.collectedAmount || 0) * 100) + fields.stripe.payout.actualDeductedMinor;
    const due = Math.max(0, Math.round(st.gross * 100) - Math.round(Number(st.creditedAmount || 0) * 100) - captured);
    stage.patch('commissionStatements', st.id, { collectedAmount: captured / 100, outstandingAmount: due / 100, status: due ? 'Open' : 'Paid' },
      { status: st.status, collectedAmount: st.collectedAmount, outstandingAmount: st.outstandingAmount, gross: st.gross });
  }
  async function run(per) {
    const db = data(), at = now(), stage = atomic.createStage(); db.commissionStatements ||= [];
    const groups = new Map();
    for (const payment of db.payments || []) {
      if (!stripePayment(payment) || payment.status === 'Refunded' || payment.commissionStatementId || !(Number(payment.platformFee) > 0) || (per ? payment.createdAt?.slice(0, 7) !== per : payment.createdAt?.slice(0, 7) >= at.slice(0, 7))) continue;
      const invoice = db.invoices?.find((i) => i.id === payment.invoiceId); if (!invoice) continue;
      const key = `${invoice.supplierId}|${payment.createdAt.slice(0, 7)}`;
      if (!groups.has(key)) groups.set(key, []); groups.get(key).push({ payment, invoice });
    }
    const made = [];
    for (const [key, rows] of groups) {
      const [supplierId, period] = key.split('|'), vat = vatFor(db, supplierId);
      const modes = rows.map(({ payment }) => payment.stripe?.payout?.breakdown?.vatRate ?? vat.rate);
      const legacy = (db.payments || []).some((p) => !stripePayment(p) && !p.commissionStatementId && p.status !== 'Refunded' && Number(p.platformFee) > 0 && p.createdAt?.slice(0, 7) === period && db.invoices?.find((i) => i.id === p.invoiceId)?.supplierId === supplierId);
      if (legacy || new Set(modes).size > 1 || modes.some((rate) => rate !== 0 && rate !== 19)) {
        for (const { payment } of rows) stage.patch('payments', payment.id, { feeReviewRequired: true }, { commissionStatementId: payment.commissionStatementId });
        continue;
      }
      const rate = modes[0], mode = rate === 0 ? 'intraEU' : 'standard';
      const lines = rows.map(({ payment, invoice }) => ({ paymentId: payment.id, invoiceId: invoice.id, invoiceNo: invoice.number || invoice.id,
        customer: db.users?.find((u) => u.id === invoice.customerId)?.companyProfile?.legalName || '',
        net: approvedFee(payment).net / 100, feePercent: approvedFee(payment).percent,
        fee: (approvedFee(payment).fee - Number(payment.stripe?.payout?.feeCreditedMinor || 0)) / 100 }));
      const netMinor = lines.reduce((sum, line) => sum + minor(line.fee), 0); if (!netMinor) continue;
      const vatMinor = Math.round(netMinor * rate / 100), grossMinor = netMinor + vatMinor;
      const capturedMinor = rows.reduce((sum, { payment }) => sum + Math.max(0, Number(payment.stripe?.payout?.actualDeductedMinor || 0) - Number(payment.stripe?.payout?.feeCreditedMinor || 0)), 0);
      if (capturedMinor > netMinor) throw new Error('The Stripe payment could not be verified for this operation.');
      const owner = db.users?.find((u) => u.supplierId === supplierId && !u.orgOwnerId), cp = owner?.companyProfile || {}, supplier = db.suppliers?.find((s) => s.id === supplierId);
      const identity = crypto.createHash('sha256').update(rows.map(({ payment }) => payment.id).sort().join('\n')).digest('hex').slice(0, 24);
      const st = { id: `stripe-fees-${supplierId}-${period}-${identity}`, kind: 'statement', number: number(stage, 'statement', at), supplierId, period,
        issueDate: at.slice(0, 10), dueDate: new Date(Date.parse(at) + 14 * 86400000).toISOString().slice(0, 10), createdAt: at,
        seller: { ...clone(db.settings?.platformDetails || {}), email: db.settings?.platformDetails?.email || db.settings?.supportEmail || '' },
        buyer: { name: cp.legalName || supplier?.company || 'Supplier', address: cp.address || supplier?.location || '', email: cp.procurementEmail || owner?.email || '', taxId: rows[0].payment.stripe?.payout?.breakdown?.feeVatId || vat.vatId || cp.taxId || '' },
        lines, vatMode: mode, vatRate: rate, net: netMinor / 100, vat: vatMinor / 100, gross: grossMinor / 100,
        collectedAmount: capturedMinor / 100, outstandingAmount: (grossMinor - capturedMinor) / 100, status: grossMinor === capturedMinor ? 'Paid' : 'Open' };
      stage.add('commissionStatements', st); notice(stage, st); made.push(st);
      let prefix = 0;
      for (let index = 0; index < rows.length; index++) {
        const { payment } = rows[index], lineNet = minor(lines[index].fee);
        const allocated = Math.round(vatMinor * (prefix + lineNet) / netMinor) - Math.round(vatMinor * prefix / netMinor); prefix += lineNet;
        stage.patch('payments', payment.id, { commissionStatementId: st.id, feeReviewRequired: false,
          stripe: { ...clone(payment.stripe), payout: { ...clone(payment.stripe?.payout), feeVatStatementAllocatedMinor: allocated, outstandingFeeVatMinor: allocated } } },
          { commissionStatementId: payment.commissionStatementId, status: payment.status, stripe: clone(payment.stripe), platformFee: payment.platformFee });
      }
    }
    if (stage.additions.length || stage.patches.length) await commitStage({ getDb, stage });
    return made;
  }
  async function handleStatement(req, res, parts, st) {
    if (req.method !== 'POST' || !['paid', 'credit'].includes(parts[3]) || st.kind !== 'statement' || !linked(st)) return false;
    const source = st;
    st = historical(st);
    if (!st) return (ctx.send(res, 409, { error: 'The Stripe payment could not be verified for this operation.' }), true);
    const stage = atomic.createStage(), at = now(), gross = minor(st.gross), collected = minor(st.collectedAmount), credited = minor(st.creditedAmount || 0);
    if (parts[3] === 'paid') {
      if (st.status !== 'Open' || !(st.outstandingAmount > 0)) return (ctx.send(res, 409, { error: 'Only an open statement can be marked as paid.' }), true);
      const paid = minor(st.outstandingAmount);
      stage.patch('commissionStatements', st.id, { status: 'Paid', paidAt: at, collectedAmount: (collected + paid) / 100, manualCollectedAmount: Number(st.manualCollectedAmount || 0) + paid / 100, outstandingAmount: 0 },
        { status: source.status, collectedAmount: source.collectedAmount, outstandingAmount: source.outstandingAmount });
      for (const line of st.lines) {
        const p = data().payments.find((p) => p.id === line.paymentId); if (!p) throw new Error('The Stripe payment could not be verified for this operation.');
        const allocated = p.stripe?.payout?.feeVatStatementAllocatedMinor ?? allocation(st, p.id);
        stage.patch('payments', p.id, { stripe: { ...clone(p.stripe), payout: { ...clone(p.stripe?.payout), outstandingFeeVatMinor: 0,
          feeVatStatementAllocatedMinor: allocated,
          feeVatManualCollectedMinor: Number(p.stripe?.payout?.feeVatManualCollectedMinor || 0) + Number(p.stripe?.payout?.outstandingFeeVatMinor ?? allocated) } } }, { stripe: clone(p.stripe), commissionStatementId: st.id });
      }
      await commitStage({ getDb, stage }); ctx.send(res, 200, { statement: clone(data().commissionStatements.find((s) => s.id === st.id)) }); return true;
    }
    const input = await ctx.body(req), reason = String(input.reason || '').trim().slice(0, 500);
    if (!reason) return (ctx.send(res, 400, { error: 'Give the reason for the credit note.' }), true);
    const previous = data().commissionStatements.filter((s) => s.creditOf === st.id);
    const remaining = st.lines.map((line) => ({ ...clone(line), fee: -(minor(line.fee) - previous.reduce((sum, credit) => sum + credit.lines.filter((l) => l.paymentId === line.paymentId).reduce((n, l) => n + Math.round(-l.fee * 100), 0), 0)) / 100 })).filter((l) => l.fee < 0);
    if (!remaining.length) return (ctx.send(res, 409, { error: 'This statement was already credited.' }), true);
    const net = -remaining.reduce((sum, l) => sum + Math.round(-l.fee * 100), 0) / 100;
    const vat = -(minor(st.vat) - previous.reduce((sum, credit) => sum + Math.round(-credit.vat * 100), 0)) / 100;
    const credit = { id: `fee-manual-credit-${st.id}`, kind: 'credit', number: number(stage, 'credit', at), supplierId: st.supplierId,
      period: st.period, issueDate: at.slice(0, 10), dueDate: st.dueDate, createdAt: at, status: 'Credited', seller: clone(st.seller), buyer: clone(st.buyer),
      vatMode: st.vatMode, vatRate: st.vatRate, creditOf: st.id, creditOfNumber: st.number, reason, accountingOnly: true, lines: remaining,
      net, vat, gross: Math.round((net + vat) * 100) / 100, vatAllocation: {} };
    let prefix = 0;
    for (const line of remaining) {
      const amount = Math.round(-line.fee * 100), totalVat = Math.round(-vat * 100), totalNet = Math.round(-net * 100);
      credit.vatAllocation[line.paymentId] = Math.round(totalVat * (prefix + amount) / totalNet) - Math.round(totalVat * prefix / totalNet); prefix += amount;
      const p = data().payments.find((p) => p.id === line.paymentId); if (!p) throw new Error('The Stripe payment could not be verified for this operation.');
      stage.patch('payments', p.id, { commissionCreditId: credit.id, commissionCreditIds: [...(p.commissionCreditIds || []), credit.id],
        stripe: { ...clone(p.stripe), payout: { ...clone(p.stripe?.payout), outstandingFeeVatMinor: 0 } } }, { stripe: clone(p.stripe), commissionCreditId: p.commissionCreditId, commissionStatementId: st.id });
    }
    const allCredit = credited + Math.round(-credit.gross * 100);
    stage.add('commissionStatements', credit); notice(stage, credit);
    stage.patch('commissionStatements', st.id, { status: 'Credited', collectedAmount: collected / 100, creditedAmount: allCredit / 100, outstandingAmount: Math.max(0, gross - allCredit - collected) / 100, creditBalanceAmount: Math.max(0, allCredit + collected - gross) / 100 },
      { status: source.status, creditedAmount: source.creditedAmount, collectedAmount: source.collectedAmount, outstandingAmount: source.outstandingAmount });
    await commitStage({ getDb, stage }); ctx.send(res, 201, { statement: clone(credit) }); return true;
  }
  return { run, stageRefund, stageTransfer, handleStatement, viewStatement, breakdown: (invoice, payment) => breakdown(data(), invoice, payment) };
};
module.exports.stripePayment = stripePayment;
module.exports.preserveCredit = (credit, db) => {
  const source = credit.creditOf && db.commissionStatements?.find((s) => s.id === credit.creditOf);
  if (!source || !source.lines?.some((line) => stripePayment(db.payments?.find((p) => p.id === line.paymentId) || {}))) return;
  credit.vatMode = source.vatMode; credit.vatRate = source.vatRate;
  credit.seller = clone(source.seller); credit.buyer = clone(source.buyer);
  credit.vat = Math.round(credit.net * source.vatRate) / 100;
  credit.gross = Math.round((credit.net + credit.vat) * 100) / 100;
};
