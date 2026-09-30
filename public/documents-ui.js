/* Supplier certificates & proofs: shown on the supplier profile for customers, and managed by the
   supplier on their service catalog page (upload, share publicly or with partners only, expiry). */
const dcEsc = v => esc(v ?? '');
Object.assign(UI_ICON_PATHS, {
  file: '<path d="M14 3H7a2 2 0 0 0-2 2v14a2 2 0 0 0 2 2h10a2 2 0 0 0 2-2V8z"/><path d="M14 3v5h5M9 13h6M9 17h4"/>',
  folder: '<path d="M3 7a2 2 0 0 1 2-2h4l2 2h8a2 2 0 0 1 2 2v8a2 2 0 0 1-2 2H5a2 2 0 0 1-2-2z"/>',
  paperclip: '<path d="M21 11.5l-8.5 8.5a5 5 0 0 1-7-7L14 4.5a3.3 3.3 0 0 1 4.7 4.7L10.2 17.7a1.7 1.7 0 0 1-2.4-2.4L15.5 7.6"/>'
});
const DC_STATE = {Valid: 'completed', Expiring: 'expiring', Expired: 'expired'};
const dcState = d => d.expiresAt ? `<span class="status ${DC_STATE[d.state] || ''}">${d.state === 'Valid' ? 'Valid until ' + date(d.expiresAt) : d.state === 'Expiring' ? 'Expires ' + date(d.expiresAt) : 'Expired ' + date(d.expiresAt)}</span>` : '<span class="status completed">No expiry</span>';
const DC_CHECKS = {registration: 'Company registration', vat: 'VAT ID', insurance: 'Insurance', certifications: 'Certifications', references: 'References', sanctions: 'Sanctions screening'};

function dcRow(d, manage) {
  const open = d.url ? `<a class="btn small outline" href="${dcEsc(d.url)}" target="_blank" rel="noopener">Open</a>` : `<span class="dc-locked" title="Shared with customers who work with this supplier">On request</span>`;
  const tools = manage && d.source === 'profile' ? `<button class="btn small outline" onclick="dcToggleVisibility('${d.id}','${d.visibility === 'public' ? 'partners' : 'public'}')">${d.visibility === 'public' ? 'Make partner-only' : 'Make public'}</button><button class="btn small outline danger-text" onclick="dcDelete('${d.id}')">Delete</button>` : '';
  return `<div class="dc-row"><span class="dc-icon" aria-hidden="true">${uiIcon(d.source === 'compliance' ? 'vetting' : 'file')}</span><div class="dc-main"><b>${dcEsc(d.title)}</b><small>${dcEsc(d.category)}${d.issuer ? ' · ' + dcEsc(d.issuer) : ''}${manage && d.source === 'profile' ? ` · ${d.visibility === 'public' ? 'Visible to all customers' : 'Partners only'}` : ''}${manage && d.source === 'compliance' ? ' · managed under Compliance' : ''}</small></div><div class="dc-side">${dcState(d)}<div class="cc-actions">${open}${tools}</div></div></div>`;
}
function dcVetting(v, own) {
  if (!v) return '';
  const checks = Object.entries(v.checks || {}).filter(([k]) => DC_CHECKS[k]);
  return `<div class="dc-vetting"><div><b>CraftCrew verification</b><small>${v.status === 'Approved' ? `Verified${v.badge ? ' · ' + dcEsc(v.badge) + ' badge' : ''}` : dcEsc(v.status)}${v.decidedAt ? ' · ' + date(v.decidedAt) : ''}</small></div><div class="dc-checks">${checks.map(([k, s]) => `<span class="dc-check ${/pass|verified|ok|valid|clear/i.test(s) ? 'ok' : ''}">${/pass|verified|ok|valid|clear/i.test(s) ? '✓' : '·'} ${DC_CHECKS[k]}</span>`).join('')}</div>
    ${own && v.files.length ? `<details class="dc-files"><summary>Your vetting documents (${v.files.length})</summary>${v.files.map(f => `<div class="dc-row"><span class="dc-icon">${uiIcon('paperclip')}</span><div class="dc-main"><b>${dcEsc(f.filename)}</b><small>${dcEsc(f.category)} · ${date(f.uploadedAt)}</small></div><div class="dc-side"><a class="btn small outline" href="${dcEsc(f.url)}" target="_blank" rel="noopener">Open</a></div></div>`).join('')}</details>` : !own && v.fileCount ? `<small class="subtle">${v.fileCount} evidence file(s) reviewed by CraftCrew</small>` : ''}</div>`;
}
function dcPanel(d, {manage = false, supplierId = ''} = {}) {
  const q = d.qualifications;
  return `<section class="panel dc-panel" id="dcPanel"><div class="panel-title"><h3>Certificates & proofs</h3>${manage ? '<button class="btn small primary" onclick="dcUpload()">+ Add certificate or proof</button>' : `<span class="ui-count">${d.documents.length}</span>`}</div>
    ${dcVetting(d.vetting, manage)}
    ${d.documents.length ? `<div class="dc-list">${d.documents.map(x => dcRow(x, manage)).join('')}</div>` : `<p class="pa-empty">${manage ? 'Upload ISO certificates, trade licences, insurance or reference letters so customers can check them.' : 'No certificates published yet.'}</p>`}
    ${q.workers ? `<p class="subtle dc-foot">${q.workers} registered worker(s) with ${q.documents} qualification document(s)${q.expired ? ` · ${q.expired} expired` : ''}.</p>` : ''}
    ${!manage && !d.worksWith && d.documents.some(x => x.locked) ? `<p class="subtle dc-foot">Locked documents open once you work with this supplier${supplierId ? ` — or <a href="#" onclick="event.preventDefault();requestSupplierEvidence('${dcEsc(supplierId)}')">request a proof</a>` : ''}.</p>` : ''}</section>`;
}

/* ---------- Supplier: manage ---------- */
async function dcUpload() {
  const {categories} = await api('/supplier-documents');
  modal('Add certificate or proof', `<form id="dcForm" class="modal-form"><label>Title<input name="title" required placeholder="e.g. ISO 9001:2015 certificate"></label><div class="two"><label>Category<select name="category">${categories.map(c => `<option>${dcEsc(c)}</option>`).join('')}</select></label><label>Issued by <small class="subtle">optional</small><input name="issuer" placeholder="e.g. TÜV SÜD"></label></div>
    <div class="two"><label>Issue date <small class="subtle">optional</small><input name="issuedAt" type="date"></label><label>Valid until <small class="subtle">optional</small><input name="expiresAt" type="date"></label></div>
    <label>Who can open it<select name="visibility"><option value="public">All signed-in customers (shown on your profile)</option><option value="partners">Only customers I work with</option></select></label>
    <label>File<input name="file" type="file" accept=".pdf,.png,.jpg,.jpeg" required></label><div id="dcError" class="form-error"></div><button class="btn primary">Save document</button></form>`);
  document.getElementById('dcForm').onsubmit = async e => {
    e.preventDefault(); const f = new FormData(e.target), file = f.get('file');
    try {
      const up = await uploadFile(file);
      await api('/supplier-documents', {method: 'POST', body: {title: f.get('title'), category: f.get('category'), issuer: f.get('issuer'), issuedAt: f.get('issuedAt'), expiresAt: f.get('expiresAt'), visibility: f.get('visibility'), url: up.url, filename: file.name}});
      closeModal(); toast('Document added'); dcRefreshOwn();
    } catch (x) { document.getElementById('dcError').textContent = x.message; }
  };
}
async function dcToggleVisibility(id, visibility) { try { await api('/supplier-documents/' + id, {method: 'PATCH', body: {visibility}}); toast(visibility === 'public' ? 'Now visible to all customers' : 'Now partner-only'); dcRefreshOwn(); } catch (x) { toast(x.message, 'error'); } }
async function dcDelete(id) { if (!await uiConfirm('Delete this document from your profile?', {confirmLabel: 'Delete'})) return; try { await api('/supplier-documents/' + id, {method: 'DELETE'}); toast('Document deleted'); dcRefreshOwn(); } catch (x) { toast(x.message, 'error'); } }
async function dcRefreshOwn() {
  const d = await api('/supplier-documents'), html = dcPanel(d, {manage: true}), cur = document.getElementById('dcPanel');
  if (cur) cur.outerHTML = html; else document.querySelector('.dashboard-content')?.insertAdjacentHTML('beforeend', html);
}

/* ---------- Hooks ---------- */
// Customer view of a supplier profile.
const dcBaseSupplierDetail = supplierDetail;
supplierDetail = async function (id) {
  await dcBaseSupplierDetail(id);
  if (!state.user) return;
  try {
    const d = await api(`/suppliers/${encodeURIComponent(id)}/documents`), page = document.querySelector('.dashboard-content .cc-page') || document.querySelector('.cc-page');
    const anchor = page?.querySelector('.supplier-profile-head')?.nextElementSibling?.nextElementSibling || page?.lastElementChild;
    anchor ? anchor.insertAdjacentHTML('afterend', dcPanel(d, {supplierId: id})) : page?.insertAdjacentHTML('beforeend', dcPanel(d, {supplierId: id}));
  } catch (e) { console.error(e); }
};
// Supplier: own documents on the service catalog / public profile page.
const dcBaseRoute = window.route;
window.route = async function () {
  const result = await dcBaseRoute(), parts = location.hash.replace(/^#/, '').split('?')[0].split('/').filter(Boolean);
  if (state.user?.role === 'supplier' && parts[0] === 'supplier' && parts[1] === 'suppliers' && !parts[2] && !document.getElementById('dcPanel')) {
    try { await dcRefreshOwn(); } catch (e) { console.error(e); }
  }
  return result;
};
