/**
 * Supplier documents: one place that shows a supplier's certificates and proofs — profile
 * certificates the supplier publishes (ISO, trade licences, references), on-site compliance
 * evidence, and the checks CraftCrew verified during vetting.
 * Who may open a file: the supplier and admins always; customers when the supplier shares the
 * document publicly or when they already work together. Vetting files stay with CraftCrew.
 */
const CATEGORIES = ['Quality certificate', 'Trade licence / registration', 'Insurance', 'Safety certificate', 'Training & qualification', 'Reference letter', 'Other proof'];

module.exports = function createDocuments(ctx) {
  const {getDb, save, send, body, id, now, compliance, projectFor} = ctx;
  const today = () => new Date().toISOString().slice(0, 10);
  const soon = () => new Date(Date.now() + 30 * 86400000).toISOString().slice(0, 10);
  const list = () => { const db = getDb(); db.profileDocs ||= []; return db.profileDocs; };
  const expiryState = d => !d ? 'Valid' : d < today() ? 'Expired' : d <= soon() ? 'Expiring' : 'Valid';

  /* Customers who already work with the supplier (shared project) see partner-only documents too. */
  function worksWith(user, supplierId) {
    if (user?.role !== 'customer') return false;
    return getDb().projects.some(p => projectFor(user, p.id) && p.phases.some(ph => ph.supplierId === supplierId || (ph.tasks || []).some(t => t.assignedSupplierId === supplierId && t.acceptanceStatus !== 'Declined')));
  }
  function canOpen(user, doc) {
    if (!user) return false;
    if (user.role === 'admin' || (user.role === 'supplier' && user.supplierId === doc.supplierId)) return true;
    return doc.visibility === 'public' || worksWith(user, doc.supplierId);
  }

  function supplierDocuments(user, supplierId) {
    const db = getDb(), own = user.role === 'admin' || user.supplierId === supplierId;
    const profile = list().filter(d => d.supplierId === supplierId).map(d => ({
      id: d.id, source: 'profile', title: d.title, category: d.category, issuer: d.issuer || '', issuedAt: d.issuedAt || null, expiresAt: d.expiresAt || null,
      state: expiryState(d.expiresAt), visibility: d.visibility, filename: d.filename, uploadedAt: d.uploadedAt, url: canOpen(user, d) ? d.url : null, locked: !canOpen(user, d)
    }));
    // Latest compliance evidence per requirement (company level) — shown with its expiry.
    const latest = new Map();
    for (const d of (db.complianceDocs || []).filter(x => x.supplierId === supplierId && !x.workerId)) {
      const cur = latest.get(d.requirementKey);
      if (!cur || String(d.uploadedAt) > String(cur.uploadedAt)) latest.set(d.requirementKey, d);
    }
    const complianceDocs = [...latest.values()].map(d => ({
      id: d.id, source: 'compliance', title: compliance.REQUIREMENTS[d.requirementKey]?.label || d.requirementKey, category: 'Compliance evidence', expiresAt: d.expiresAt || null,
      state: expiryState(d.expiresAt), filename: d.filename, uploadedAt: d.uploadedAt, url: compliance.canAccessFile(user, d.url) ? d.url : null, locked: !compliance.canAccessFile(user, d.url)
    }));
    const workers = (db.workers || []).filter(w => w.supplierId === supplierId && w.active !== false);
    const qualifications = (db.complianceDocs || []).filter(d => d.supplierId === supplierId && d.workerId && workers.some(w => w.id === d.workerId));
    // Vetting: the checks CraftCrew confirmed. Files only for the supplier and admins.
    const app = (db.applications || []).filter(a => a.supplierId === supplierId || (db.suppliers.find(s => s.id === supplierId)?.company === a.company)).sort((a, b) => String(b.updatedAt).localeCompare(String(a.updatedAt)))[0];
    const vetting = app ? {
      status: app.status, badge: db.suppliers.find(s => s.id === supplierId)?.badge || null, checks: app.verification?.checks || {}, decidedAt: app.decidedAt || app.updatedAt,
      files: own ? (app.proofUploads || []).map(f => ({filename: f.filename, category: f.category, uploadedAt: f.uploadedAt, url: f.url})) : [], fileCount: (app.proofUploads || []).length
    } : null;
    return {documents: [...profile, ...complianceDocs], qualifications: {workers: workers.length, documents: qualifications.length, expired: qualifications.filter(d => d.expiresAt && d.expiresAt < today()).length}, vetting, categories: CATEGORIES, worksWith: worksWith(user, supplierId)};
  }

  async function handle(req, res, url, parts, user) {
    const method = req.method;
    if (parts[1] === 'suppliers' && parts[2] && parts[3] === 'documents' && method === 'GET') {
      const s = getDb().suppliers.find(x => x.id === parts[2]);
      if (!s || (!s.live && user.role !== 'admin' && user.supplierId !== s.id)) return send(res, 404, {error: 'Supplier not found'}), true;
      return send(res, 200, supplierDocuments(user, s.id)), true;
    }
    if (parts[1] !== 'supplier-documents') return false;
    if (user.role !== 'supplier' || !user.supplierId) return send(res, 403, {error: 'Only suppliers manage their certificates'}), true;
    if (method === 'GET' && parts.length === 2) return send(res, 200, supplierDocuments(user, user.supplierId)), true;
    if (method === 'POST' && parts.length === 2) {
      const b = await body(req), title = String(b.title || '').trim();
      if (!title || !String(b.url || '').startsWith('/uploads/')) return send(res, 400, {error: 'Add a title and upload the document'}), true;
      if (b.expiresAt && !/^\d{4}-\d{2}-\d{2}$/.test(b.expiresAt)) return send(res, 400, {error: 'Enter a valid expiry date'}), true;
      const d = {id: id('pdoc'), supplierId: user.supplierId, title: title.slice(0, 160), category: CATEGORIES.includes(b.category) ? b.category : 'Other proof', issuer: String(b.issuer || '').slice(0, 120),
        issuedAt: /^\d{4}-\d{2}-\d{2}$/.test(b.issuedAt || '') ? b.issuedAt : null, expiresAt: b.expiresAt || null, visibility: b.visibility === 'public' ? 'public' : 'partners',
        filename: String(b.filename || title).slice(0, 200), url: String(b.url).slice(0, 300), uploadedBy: user.memberId || user.id, uploadedAt: now()};
      list().push(d); save();
      return send(res, 201, {document: d}), true;
    }
    const d = parts[2] && list().find(x => x.id === parts[2] && x.supplierId === user.supplierId);
    if (!d) return send(res, 404, {error: 'Document not found'}), true;
    if (method === 'PATCH') {
      const b = await body(req);
      if (b.title) d.title = String(b.title).trim().slice(0, 160);
      if (CATEGORIES.includes(b.category)) d.category = b.category;
      if (b.visibility === 'public' || b.visibility === 'partners') d.visibility = b.visibility;
      if (b.expiresAt !== undefined) d.expiresAt = /^\d{4}-\d{2}-\d{2}$/.test(b.expiresAt || '') ? b.expiresAt : null;
      d.updatedAt = now(); save(); return send(res, 200, {document: d}), true;
    }
    if (method === 'DELETE') { getDb().profileDocs = list().filter(x => x !== d); save(); return send(res, 200, {ok: true}), true; }
    return send(res, 404, {error: 'Unknown document action'}), true;
  }
  /* /uploads guard: profile certificates. */
  function canAccessFile(user, fileUrl) { const d = list().find(x => x.url === fileUrl); return !!d && canOpen(user, d); }

  return {handle, canAccessFile, CATEGORIES};
};
