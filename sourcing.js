/**
 * Strategic sourcing: contract management with renewal alerts, supplier scorecards
 * with risk flags, and helpers for weighted bid evaluation.
 * Mounted by server.js; `ctx` provides access to the data store and shared helpers.
 */
const WEIGHT_KEYS = ['price', 'delivery', 'quality', 'experience'];
const DEFAULT_WEIGHTS = {price: 50, delivery: 20, quality: 20, experience: 10};
const CONTRACT_STATUSES = ['Draft', 'Active', 'Terminated'];

module.exports = function createSourcing(ctx) {
  const {getDb, save, send, body, id, now, notify, projectFor, supplierForUser} = ctx;

  function cleanWeights(w) {
    const out = {};
    for (const k of WEIGHT_KEYS) out[k] = Math.max(0, Math.min(100, Math.round(Number(w?.[k] ?? DEFAULT_WEIGHTS[k]) || 0)));
    return WEIGHT_KEYS.some(k => out[k] > 0) ? out : {...DEFAULT_WEIGHTS};
  }

  /* Contracts carry a stored lifecycle state; "Expiring"/"Expired" are derived from dates. */
  function contractView(c) {
    const db = getDb(), days = c.endDate ? Math.ceil((Date.parse(c.endDate) - Date.now()) / 86400000) : null;
    const noticeBy = c.endDate && c.noticeDays ? new Date(Date.parse(c.endDate) - c.noticeDays * 86400000).toISOString().slice(0, 10) : null;
    let state = c.status;
    if (c.status === 'Active' && days !== null) state = days < 0 ? 'Expired' : days <= Math.max(60, (c.noticeDays || 0) + 30) ? 'Expiring' : 'Active';
    const supplier = db.suppliers.find(s => s.id === c.supplierId), project = db.projects.find(p => p.id === c.projectId);
    return {...c, state, daysToEnd: days, noticeBy, supplierCompany: supplier?.company || c.supplierCompany || '', projectName: project?.name || c.projectName || ''};
  }
  function canSee(user, c) {
    return user.role === 'admin' || (user.role === 'customer' && (c.customerId === user.id || !!(c.projectId && projectFor(user, c.projectId)))) || (user.role === 'supplier' && c.supplierId === user.supplierId && c.status !== 'Draft');
  }
  function contractFromAward(bid, offer, user) {
    const db = getDb();
    db.contracts ||= [];
    if (db.contracts.some(c => c.bidId === bid.id)) return;
    const start = new Date().toISOString().slice(0, 10);
    db.contracts.unshift({id: id('ctr'), customerId: bid.customerId || user.id, supplierId: offer.supplierId, supplierCompany: offer.supplierCompany, projectId: bid.projectId, projectName: bid.projectName, bidId: bid.id, title: `${bid.title}`, category: bid.category || '', value: offer.amount, currency: 'EUR', startDate: start, endDate: '', noticeDays: 30, autoRenew: false, status: 'Draft', terms: `Awarded from ${bid.eventType || 'RFQ'} "${bid.title}". Delivery within ${offer.deliveryDays} days as offered.`, createdAt: now(), updatedAt: now()});
  }

  /* Scorecard: delivery, quality and commercial reliability plus risk signals. */
  function scorecard(supplierId) {
    const db = getDb(), s = db.suppliers.find(x => x.id === supplierId);
    if (!s) return null;
    const today = new Date().toISOString().slice(0, 10), reviews = s.reviews || [];
    const avg = key => { const v = reviews.map(r => Number(r[key])).filter(n => n > 0); return v.length ? Math.round(v.reduce((a, b) => a + b, 0) / v.length * 10) / 10 : null; };
    const work = db.projects.flatMap(p => p.phases.flatMap(ph => [...(!ph.tasks?.length && ph.supplierId === s.id ? [ph] : []), ...(ph.tasks || []).filter(t => t.assignedSupplierId === s.id && t.acceptanceStatus === 'Accepted')]));
    const done = work.filter(w => w.status === 'Completed').length, late = work.filter(w => w.status !== 'Completed' && w.dueDate && w.dueDate < today).length;
    const invoices = db.invoices.filter(i => i.supplierId === s.id), decided = invoices.filter(i => ['Approved', 'Paid', 'Rejected', 'Refunded'].includes(i.status));
    const firstTime = decided.filter(i => ['Approved', 'Paid'].includes(i.status) && !i.changeRequests).length;
    const invited = (db.bids || []).filter(b => (b.invitedSupplierIds || []).includes(s.id)), answered = invited.filter(b => (b.offers || []).some(o => o.supplierId === s.id));
    const offers = (db.bids || []).flatMap(b => (b.offers || []).filter(o => o.supplierId === s.id)), won = offers.filter(o => o.status === 'Accepted').length, lost = offers.filter(o => ['Not selected', 'Declined'].includes(o.status)).length;
    const app = (db.applications || []).filter(a => a.supplierId === s.id).sort((a, b) => String(b.updatedAt).localeCompare(String(a.updatedAt)))[0];
    const risks = [];
    if (!s.verified || !s.live) risks.push({level: 'high', text: 'Not verified or not live in the directory'});
    if (app?.insuranceExpiry) { const d = Math.ceil((Date.parse(app.insuranceExpiry) - Date.now()) / 86400000); if (d < 0) risks.push({level: 'high', text: `Liability insurance expired ${-d} day(s) ago`}); else if (d <= 60) risks.push({level: 'medium', text: `Liability insurance expires in ${d} day(s)`}); }
    else risks.push({level: 'low', text: 'No insurance evidence on file'});
    if (app?.verification?.riskLevel && ['Medium', 'High'].includes(app.verification.riskLevel)) risks.push({level: app.verification.riskLevel.toLowerCase(), text: `Vetting risk assessment: ${app.verification.riskLevel}`});
    if (late) risks.push({level: late > 2 ? 'high' : 'medium', text: `${late} work item(s) overdue`});
    if (!(s.certifications || []).length) risks.push({level: 'low', text: 'No certifications listed'});
    if (ctx.extraRisks) risks.push(...ctx.extraRisks(s.id));
    if (s.availability === 'Busy') risks.push({level: 'low', text: 'Currently marked as busy'});
    const pct = (a, b) => b ? Math.round(a / b * 100) : null;
    const metrics = {rating: s.rating || null, quality: avg('quality'), schedule: avg('schedule'), communication: avg('communication'), reviews: reviews.length, onTimeRate: pct(done, done + late), completed: done, overdue: late, firstTimeRightRate: pct(firstTime, decided.length), invoices: invoices.length, responseRate: pct(answered.length, invited.length), invitations: invited.length, winRate: pct(won, won + lost)};
    // Composite 0–100: weighted blend of what is known; unknown parts are skipped rather than counted as zero.
    const parts = [[metrics.rating ? metrics.rating / 5 * 100 : null, 30], [metrics.onTimeRate, 30], [metrics.firstTimeRightRate, 20], [metrics.responseRate, 20]].filter(([v]) => v !== null);
    const score = parts.length ? Math.round(parts.reduce((a, [v, w]) => a + v * w, 0) / parts.reduce((a, [, w]) => a + w, 0)) : null;
    const riskLevel = risks.some(r => r.level === 'high') ? 'High' : risks.some(r => r.level === 'medium') ? 'Medium' : 'Low';
    return {supplierId: s.id, company: s.company, badge: s.badge, score, riskLevel, risks, metrics};
  }

  /* Daily renewal reminders for contracts approaching their notice date or end date. */
  function renewalSweep() {
    const db = getDb(); let changed = false;
    for (const c of db.contracts || []) {
      const v = contractView(c);
      if (v.state === 'Expiring' && !c.renewalAlertSentAt) { notify(c.customerId, `Contract "${c.title}" with ${v.supplierCompany} ends on ${c.endDate}${v.noticeBy ? ` — notice deadline ${v.noticeBy}` : ''}`, '/customer/contracts'); c.renewalAlertSentAt = now(); changed = true; }
    }
    if (changed) save();
  }
  setInterval(renewalSweep, 6 * 3600000).unref();
  setTimeout(renewalSweep, 5000).unref();

  async function handle(req, res, url, parts, user) {
    const db = getDb(), method = req.method;
    if (parts[1] === 'contracts' && parts.length === 2 && method === 'GET') {
      return send(res, 200, {contracts: (db.contracts || []).filter(c => canSee(user, c)).map(contractView)}), true;
    }
    if (parts[1] === 'contracts' && parts.length === 2 && method === 'POST') {
      if (user.role !== 'customer') return send(res, 403, {error: 'Only customers can create contracts'}), true;
      const b = await body(req), supplier = db.suppliers.find(s => s.id === b.supplierId);
      if (!supplier || !String(b.title || '').trim()) return send(res, 400, {error: 'Choose a supplier and enter a contract title'}), true;
      if (b.projectId && !projectFor(user, b.projectId)) return send(res, 403, {error: 'Choose one of your projects'}), true;
      const c = {id: id('ctr'), customerId: user.id, supplierId: supplier.id, supplierCompany: supplier.company, projectId: b.projectId || null, bidId: null, currency: 'EUR', createdAt: now()};
      const err = applyContract(c, b); if (err) return send(res, 400, {error: err}), true;
      db.contracts ||= []; db.contracts.unshift(c); save();
      if (c.status === 'Active') notify(db.users.find(u => u.supplierId === c.supplierId)?.id, `New contract with ${user.company || user.name}: ${c.title}`, '/supplier/contracts');
      return send(res, 201, {contract: contractView(c)}), true;
    }
    if (parts[1] === 'contracts' && parts[2] && method === 'PATCH') {
      const c = (db.contracts || []).find(x => x.id === parts[2]);
      if (!c || !canSee(user, c)) return send(res, 404, {error: 'Contract not found'}), true;
      if (user.role !== 'customer') return send(res, 403, {error: 'Only the customer can change a contract'}), true;
      const b = await body(req), wasActive = c.status === 'Active', err = applyContract(c, {...c, ...b});
      if (err) return send(res, 400, {error: err}), true;
      if (b.endDate) delete c.renewalAlertSentAt;
      save();
      if (!wasActive && c.status === 'Active') notify(db.users.find(u => u.supplierId === c.supplierId)?.id, `Contract activated: ${c.title}`, '/supplier/contracts');
      return send(res, 200, {contract: contractView(c)}), true;
    }
    if (parts[1] === 'suppliers' && parts[2] && parts[3] === 'scorecard' && method === 'GET') {
      if (user.role === 'supplier' && user.supplierId !== parts[2]) return send(res, 403, {error: 'You can only view your own scorecard'}), true;
      const card = scorecard(parts[2]);
      return card ? (send(res, 200, {scorecard: card}), true) : (send(res, 404, {error: 'Supplier not found'}), true);
    }
    if (parts[1] === 'scorecards' && method === 'GET') {
      if (user.role === 'supplier') return send(res, 403, {error: 'Not available'}), true;
      // Customers see suppliers they have worked with or received offers from; admins see all live suppliers.
      const mine = new Set();
      if (user.role === 'customer') {
        for (const p of db.projects.filter(p => projectFor(user, p.id))) for (const ph of p.phases) { if (ph.supplierId) mine.add(ph.supplierId); for (const t of ph.tasks || []) if (t.assignedSupplierId) mine.add(t.assignedSupplierId); }
        for (const b of (db.bids || []).filter(b => projectFor(user, b.projectId))) for (const o of b.offers || []) mine.add(o.supplierId);
      }
      const ids = user.role === 'admin' ? db.suppliers.filter(s => s.live).map(s => s.id) : [...mine];
      return send(res, 200, {scorecards: ids.map(scorecard).filter(Boolean)}), true;
    }
    return false;
  }

  function applyContract(c, b) {
    const title = String(b.title || '').trim(), value = Number(b.value);
    if (!title) return 'A contract title is required';
    if (!Number.isFinite(value) || value < 0) return 'Enter a valid contract value';
    if (b.startDate && b.endDate && b.endDate < b.startDate) return 'The end date must be after the start date';
    if (b.status && !CONTRACT_STATUSES.includes(b.status)) return 'Choose Draft, Active or Terminated';
    if ((b.status || c.status) === 'Active' && !b.endDate) return 'Set an end date before activating the contract';
    Object.assign(c, {title: title.slice(0, 200), category: String(b.category || '').slice(0, 80), value, startDate: String(b.startDate || '').slice(0, 10), endDate: String(b.endDate || '').slice(0, 10), noticeDays: Math.max(0, Math.min(365, Number(b.noticeDays) || 0)), autoRenew: !!b.autoRenew, status: b.status || c.status || 'Draft', terms: String(b.terms || '').slice(0, 5000), documentUrl: String(b.documentUrl || c.documentUrl || '').slice(0, 500), updatedAt: now()});
    return null;
  }

  return {handle, cleanWeights, contractFromAward, scorecard, DEFAULT_WEIGHTS};
};
