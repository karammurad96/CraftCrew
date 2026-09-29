/* On-site contractor compliance UI: customer sites (requirements, briefing, access, on-site list)
   and the supplier compliance workspace (documents, workers, briefings, access requests). */
const cmEsc = v => esc(v ?? '');
const cmToday = () => new Date().toISOString().slice(0, 10);
let cmCatalog = null;
async function cmCat() { if (!cmCatalog) cmCatalog = await api('/compliance/catalog'); return cmCatalog; }
const CM_STATE_CLASS = {Valid: 'completed', Expiring: 'expiring', 'Pending review': 'pending', Missing: 'rejected', Expired: 'expired', Rejected: 'rejected', Outdated: 'expiring', Accepted: 'completed', Requested: 'pending', Approved: 'approved', 'Checked in': 'in-progress', 'Checked out': 'closed', Cancelled: 'closed'};
const cmTag = s => `<span class="status ${CM_STATE_CLASS[s] || ''}">${cmEsc(s)}</span>`;
const cmReqLabel = (cat, k) => cat.requirements[k]?.label || (k === 'briefing' ? 'Site safety briefing' : k);

Object.assign(UI_NAV_ICONS, {sites: 'vetting', compliance: 'vetting'});

/* ================= Customer ================= */
async function cmSites() {
  const [{sites = []}, {visits = []}, {documents = []}] = await Promise.all([api('/sites'), api('/site-visits'), api('/compliance/documents')]);
  const pending = visits.filter(v => v.status === 'Requested'), toReview = documents.filter(d => !d.review || d.review.status === 'Pending review'), onSite = visits.filter(v => v.status === 'Checked in');
  app.innerHTML = dashboardShell('customer', 'sites', `<div class="dash-top"><div><div class="eyebrow">CONTRACTOR SAFETY</div><h1>Sites & safety</h1><p>Who may work on your sites, with which evidence, briefing and permit — and who is there right now.</p></div><button class="btn primary" onclick="cmSiteForm()">+ New site</button></div>
    <div class="in-kpis">${inKpi('On site now', onSite.reduce((a, v) => a + v.workers.length, 0), `${onSite.length} company visit(s)`, onSite.length ? '' : '')}${inKpi('Access requests', pending.length, 'waiting for approval', pending.length ? 'warn' : 'good')}${inKpi('Documents to review', toReview.length, 'certificates and qualifications', toReview.length ? 'warn' : 'good')}${inKpi('Sites', sites.length, `${sites.reduce((a, s) => a + s.supplierCount, 0)} supplier link(s)`)}</div>
    ${sites.length ? `<div class="cc-grid cm-site-grid">${sites.map(s => `<article class="cc-card click project-card" role="link" tabindex="0" onclick="navigate('/customer/sites/${s.id}')" onkeydown="if(event.key==='Enter')navigate('/customer/sites/${s.id}')"><div class="project-card-head"><b>${cmEsc(s.name)}</b>${s.onSiteCount ? `<span class="status in-progress">${s.onSiteCount} on site</span>` : ''}</div><p>${cmEsc(s.address || 'No address yet')}</p><div class="cm-req-chips">${(s.requirements || []).slice(0, 6).map(k => `<span class="tag">${cmEsc(k)}</span>`).join('')}</div><div class="supplier-meta"><span>${s.supplierCount} supplier(s) · ${s.projectIds.length} project(s)</span><span>${s.pendingRequests ? `${s.pendingRequests} request(s)` : 'No open requests'}</span></div><span class="btn small outline project-open">Open site →</span></article>`).join('')}</div>`
      : `<section class="panel cm-empty">${uiIcon('vetting', 'ui-icon cm-empty-icon')}<h3>Set up your first site</h3><p>Define which certificates and qualifications contractors need, add your safety briefing, and link the projects that take place there.</p><button class="btn primary" onclick="cmSiteForm()">+ New site</button></section>`}
    <div class="in-grid"><section class="panel"><div class="panel-title"><h3>Access requests</h3><span class="ui-count">${pending.length}</span></div>${pending.map(cmVisitRow).join('') || '<p class="pa-empty">No requests waiting.</p>'}</section>
    <section class="panel"><div class="panel-title"><h3>Documents to review</h3><span class="ui-count">${toReview.length}</span></div>${toReview.map(cmDocReviewRow).join('') || '<p class="pa-empty">All documents reviewed.</p>'}</section></div>`);
}
function cmVisitRow(v) {
  const act = v.status === 'Requested' ? `<button class="btn small primary" onclick="cmDecideVisit('${v.id}','approve',${v.ready})">Approve</button><button class="btn small outline" onclick="cmDecideVisit('${v.id}','reject')">Reject</button>` : v.status === 'Approved' && v.date <= cmToday() ? `<button class="btn small outline" onclick="cmDecideVisit('${v.id}','checkin')">Check in</button>` : v.status === 'Checked in' ? `<button class="btn small outline" onclick="cmDecideVisit('${v.id}','checkout')">Check out</button>` : '';
  return `<div class="cm-visit"><div><b>${cmEsc(v.supplierCompany)} · ${v.workers.map(w => cmEsc(w.name)).join(', ')}</b><small>${cmEsc(v.siteName)} · ${date(v.date)}${v.endDate !== v.date ? ' – ' + date(v.endDate) : ''}${v.projectName ? ' · ' + cmEsc(v.projectName) : ''}${v.permitType !== 'none' ? ' · ' + cmEsc(v.permitLabel) : ''}</small>${v.override ? `<small class="danger-text">Approved without full compliance: ${cmEsc(v.override)}</small>` : ''}</div><div class="cm-visit-side">${cmTag(v.status)}${v.status === 'Requested' ? (v.ready ? '<span class="status completed">Compliant</span>' : '<span class="status rejected">Incomplete</span>') : ''}<div class="cc-actions">${act}</div></div></div>`;
}
function cmDocReviewRow(d) {
  return `<div class="cm-visit"><div><b>${cmEsc(cmReqLabel(cmCatalog || {requirements: {}}, d.requirementKey))}</b><small>${cmEsc(d.supplierCompany)}${d.workerName ? ' · ' + cmEsc(d.workerName) : ''}${d.expiresAt ? ' · valid until ' + date(d.expiresAt) : ''}</small></div><div class="cm-visit-side"><div class="cc-actions"><a class="btn small outline" href="${cmEsc(d.url)}">View</a><button class="btn small primary" onclick="cmReviewDoc('${d.id}','Accepted')">Accept</button><button class="btn small outline" onclick="cmReviewDoc('${d.id}','Rejected')">Reject</button></div></div></div>`;
}
async function cmDecideVisit(id, action, ready = true) {
  const body = {action};
  if (action === 'reject') { const note = prompt('Reason for rejecting this access request:'); if (!note) return; body.note = note; }
  if (action === 'approve' && !ready) { const reason = prompt('Compliance is incomplete for this request. Enter a reason to approve anyway (e.g. documents checked on paper at the gate):'); if (!reason) return; body.overrideReason = reason; }
  try { await api(`/site-visits/${id}`, {method: 'PATCH', body}); toast({approve: 'Access approved', reject: 'Access rejected', checkin: 'Checked in', checkout: 'Checked out'}[action]); route(); }
  catch (x) { toast(x.message, 'error'); }
}
async function cmReviewDoc(id, status) {
  const body = {status};
  if (status === 'Rejected') { const note = prompt('Tell the supplier why this document is rejected:'); if (!note) return; body.note = note; }
  try { await api(`/compliance/documents/${id}`, {method: 'PATCH', body}); toast(`Document ${status.toLowerCase()}`); route(); } catch (x) { toast(x.message, 'error'); }
}
async function cmSiteForm(id) {
  const [cat, {projects = []}, site] = await Promise.all([cmCat(), api('/projects'), id ? api(`/sites/${id}`).then(d => d.site) : Promise.resolve({requirements: ['insurance', 'minimumWage'], permitTypes: [], projectIds: []})]);
  const req = scope => Object.entries(cat.requirements).filter(([, r]) => r.scope === scope).map(([k, r]) => `<label class="cc-check-label"><input type="checkbox" name="req" value="${k}" ${site.requirements?.includes(k) ? 'checked' : ''}> ${cmEsc(r.label)}${r.expires ? ' <small class="subtle">expires</small>' : ''}</label>`).join('');
  modal(id ? 'Edit site' : 'New site', `<form id="cmSiteForm" class="modal-form"><div class="two"><label>Site name<input name="name" value="${cmEsc(site.name || '')}" required placeholder="e.g. Plant Regensburg"></label><label>Address<input name="address" value="${cmEsc(site.address || '')}"></label></div><div class="three"><label>Site contact<input name="contactName" value="${cmEsc(site.contactName || '')}"></label><label>Contact phone<input name="contactPhone" value="${cmEsc(site.contactPhone || '')}"></label><label>Emergency number<input name="emergencyNumber" value="${cmEsc(site.emergencyNumber || '')}"></label></div>
    <fieldset class="cm-fieldset"><legend>Company evidence required</legend><div class="cm-checks">${req('company')}</div></fieldset>
    <fieldset class="cm-fieldset"><legend>Worker qualifications required</legend><div class="cm-checks">${req('worker')}</div></fieldset>
    <fieldset class="cm-fieldset"><legend>Work permits used on this site</legend><div class="cm-checks">${Object.entries(cat.permits).filter(([k]) => k !== 'none').map(([k, p]) => `<label class="cc-check-label"><input type="checkbox" name="permit" value="${k}" ${site.permitTypes?.includes(k) ? 'checked' : ''}> ${cmEsc(p.label)}</label>`).join('')}</div></fieldset>
    <label>Safety briefing (workers read and sign this online; changing it asks everyone to sign again)<textarea name="briefingContent" rows="6" placeholder="PPE, assembly point, emergency numbers, hazardous areas, smoking and hot-work rules…">${cmEsc(site.briefing?.content || '')}</textarea></label>
    <fieldset class="cm-fieldset"><legend>Projects at this site</legend><div class="cm-checks">${projects.map(p => `<label class="cc-check-label"><input type="checkbox" name="project" value="${p.id}" ${site.projectIds?.includes(p.id) ? 'checked' : ''}> ${cmEsc(p.name)}</label>`).join('') || '<small class="subtle">No projects yet.</small>'}</div></fieldset>
    <div id="cmSiteError" class="form-error"></div><button class="btn primary">${id ? 'Save site' : 'Create site'}</button></form>`);
  document.getElementById('cmSiteForm').onsubmit = async e => {
    e.preventDefault(); const f = new FormData(e.target);
    const b = {name: f.get('name'), address: f.get('address'), contactName: f.get('contactName'), contactPhone: f.get('contactPhone'), emergencyNumber: f.get('emergencyNumber'), briefingContent: f.get('briefingContent'), requirements: f.getAll('req'), permitTypes: f.getAll('permit'), projectIds: f.getAll('project')};
    try { const r = await api(id ? `/sites/${id}` : '/sites', {method: id ? 'PATCH' : 'POST', body: b}); closeModal(); toast(id ? 'Site saved' : 'Site created'); navigate('/customer/sites/' + r.site.id); route(); }
    catch (x) { document.getElementById('cmSiteError').textContent = x.message; }
  };
}
async function cmSiteDetail(siteId) {
  const [cat, d, {visits = []}, {documents = []}] = await Promise.all([cmCat(), api(`/sites/${siteId}`), api('/site-visits'), api('/compliance/documents')]);
  const s = d.site, mine = visits.filter(v => v.siteId === siteId), open = mine.filter(v => ['Requested', 'Approved', 'Checked in'].includes(v.status));
  const supplierIds = new Set(d.readiness.map(r => r.supplierId)), toReview = documents.filter(x => supplierIds.has(x.supplierId) && (!x.review || x.review.status === 'Pending review') && (s.requirements || []).includes(x.requirementKey));
  const onSiteWorkers = d.onSite.flatMap(v => v.workers.map(w => ({...w, company: v.supplierCompany, since: v.checkedInAt, permit: v.permitType !== 'none' ? v.permitLabel : ''})));
  app.innerHTML = dashboardShell('customer', 'sites', `<div class="breadcrumb"><a href="#/customer/sites">← Sites & safety</a></div><div class="dash-top"><div><div class="eyebrow">SITE</div><h1>${cmEsc(s.name)}</h1><p>${cmEsc(s.address || '')}${s.emergencyNumber ? ` · Emergency ${cmEsc(s.emergencyNumber)}` : ''}${s.contactName ? ` · Contact ${cmEsc(s.contactName)} ${cmEsc(s.contactPhone || '')}` : ''}</p></div><div class="in-toolbar"><button class="btn outline" onclick="cmPrintRollCall('${siteId}')">Print on-site list</button><button class="btn primary" onclick="cmSiteForm('${siteId}')">Edit site</button></div></div>
    <div class="in-kpis">${inKpi('On site now', onSiteWorkers.length, `${d.onSite.length} company visit(s)`)}${inKpi('Open requests', mine.filter(v => v.status === 'Requested').length, 'waiting for approval', mine.some(v => v.status === 'Requested') ? 'warn' : 'good')}${inKpi('Suppliers ready', `${d.readiness.filter(r => r.ready).length}/${d.readiness.length}`, 'meet every requirement', d.readiness.every(r => r.ready) ? 'good' : 'warn')}${inKpi('Safety briefing', s.briefing?.content ? `v${s.briefing.version}` : '—', s.briefing?.content ? `updated ${date(s.briefing.updatedAt)}` : 'not written yet', s.briefing?.content ? '' : 'warn')}</div>
    <div class="in-grid"><section class="panel"><div class="panel-title"><h3>On site now</h3><span class="ui-count">${onSiteWorkers.length}</span></div>${onSiteWorkers.map(w => `<div class="pa-row"><span><b>${cmEsc(w.name)}</b><small>${cmEsc(w.company)} · ${cmEsc(w.role || '')} · since ${paTime(w.since)}${w.permit ? ' · ' + cmEsc(w.permit) : ''}</small></span></div>`).join('') || '<p class="pa-empty">Nobody is checked in.</p>'}</section>
    <section class="panel"><div class="panel-title"><h3>Access requests</h3><span class="ui-count">${open.length}</span></div>${open.map(cmVisitRow).join('') || '<p class="pa-empty">No open requests.</p>'}</section></div>
    <section class="panel"><div class="panel-title"><h3>Supplier readiness</h3><small class="subtle">${(s.requirements || []).length} requirement(s) on this site</small></div>${d.readiness.map(r => `<details class="cm-ready"><summary>${r.ready ? '<span class="status completed">Ready</span>' : '<span class="status rejected">Not ready</span>'}<b>${cmEsc(r.company_name)}</b><small>${r.company.filter(c => ['Valid', 'Expiring'].includes(c.state)).length}/${r.company.length} company documents · ${r.workers.filter(w => w.ready).length}/${r.workers.length} workers ready${r.expiringSoon ? ` · ${r.expiringSoon} expiring soon` : ''}</small></summary><div class="cm-matrix">${r.company.map(c => `<div><span>${cmEsc(c.label)}</span>${cmTag(c.state)}${c.expiresAt ? `<small>${date(c.expiresAt)}</small>` : '<small></small>'}</div>`).join('')}${r.workers.map(w => `<h4>${cmEsc(w.name)} <small>${cmEsc(w.role || '')}</small></h4>${w.items.map(i => `<div><span>${cmEsc(i.label)}</span>${cmTag(i.state)}${i.expiresAt ? `<small>${date(i.expiresAt)}</small>` : '<small></small>'}</div>`).join('')}`).join('') || '<p class="pa-empty">No workers registered yet.</p>'}</div></details>`).join('') || '<p class="pa-empty">No suppliers work at this site yet. Link projects in the site settings.</p>'}</section>
    <section class="panel"><div class="panel-title"><h3>Documents to review</h3><span class="ui-count">${toReview.length}</span></div>${toReview.map(cmDocReviewRow).join('') || '<p class="pa-empty">All documents reviewed.</p>'}</section>
    ${s.briefing?.content ? `<details class="panel cm-briefing"><summary><h3>Safety briefing · version ${s.briefing.version}</h3></summary><div class="legal-body">${legalHtml(s.briefing.content)}</div></details>` : ''}`);
}
async function cmPrintRollCall(siteId) {
  const d = await api(`/sites/${siteId}`), rows = d.onSite.flatMap(v => v.workers.map(w => `<tr><td>${cmEsc(w.name)}</td><td>${cmEsc(v.supplierCompany)}</td><td>${cmEsc(w.role || '')}</td><td>${paTime(v.checkedInAt)}</td><td></td></tr>`)).join('');
  const win = window.open('', '_blank');
  if (!win) { toast('Allow pop-ups to print the list', 'error'); return; }
  win.document.write(`<!doctype html><title>On-site list · ${cmEsc(d.site.name)}</title><style>body{font:14px system-ui;padding:24px}table{border-collapse:collapse;width:100%}td,th{border:1px solid #999;padding:8px;text-align:left}th{background:#eee}</style><h1>On-site list — ${cmEsc(d.site.name)}</h1><p>${new Date().toLocaleString()} · Emergency: ${cmEsc(d.site.emergencyNumber || '—')}</p><table><tr><th>Name</th><th>Company</th><th>Role</th><th>Checked in</th><th>Present at assembly point ✓</th></tr>${rows || '<tr><td colspan="5">Nobody checked in</td></tr>'}</table>`);
  win.document.close(); win.focus(); win.print();
}

/* ================= Supplier ================= */
async function cmSupplierPage() {
  const [cat, {sites = []}, {workers = []}, {documents = []}, {visits = []}] = await Promise.all([cmCat(), api('/sites'), api('/workers'), api('/compliance/documents'), api('/site-visits')]);
  const company = Object.entries(cat.requirements).filter(([, r]) => r.scope === 'company'), workerReqs = Object.entries(cat.requirements).filter(([, r]) => r.scope === 'worker');
  const latest = (k, wid = null) => documents.filter(d => d.requirementKey === k && (d.workerId || null) === wid).sort((a, b) => String(b.uploadedAt).localeCompare(String(a.uploadedAt)))[0];
  const docCell = (k, wid = null) => { const d = latest(k, wid), reviews = Object.values(d?.reviews || {}), rej = reviews.find(r => r.status === 'Rejected'); const state = !d ? 'Missing' : d.expiresAt && d.expiresAt < cmToday() ? 'Expired' : rej ? 'Rejected' : reviews.some(r => r.status === 'Accepted') ? 'Accepted' : 'Pending review'; return `<div class="cm-doc"><div><b>${cmEsc(cat.requirements[k].label)}</b><small>${d ? `${cmEsc(d.filename)}${d.expiresAt ? ' · valid until ' + date(d.expiresAt) : ''}` : 'Not uploaded'}${rej ? ` · ${cmEsc(rej.note)}` : ''}</small></div>${cmTag(state)}<div class="cc-actions">${d ? `<a class="btn small outline" href="${cmEsc(d.url)}">View</a>` : ''}<button class="btn small ${d ? 'outline' : 'primary'}" onclick="cmUploadDoc('${k}'${wid ? `,'${wid}'` : ''})">${d ? 'Replace' : 'Upload'}</button></div></div>`; };
  app.innerHTML = dashboardShell('supplier', 'compliance', `<div class="dash-top"><div><div class="eyebrow">SITE COMPLIANCE</div><h1>Compliance</h1><p>Upload certificates once, keep your workers' qualifications current, complete site briefings and request site access.</p></div><button class="btn primary" onclick="cmAccessForm()">+ Request site access</button></div>
    <section class="panel"><div class="panel-title"><h3>Your sites</h3><span class="ui-count">${sites.length}</span></div>${sites.map(s => { const r = s.readiness, missing = [...r.company.filter(c => !['Valid', 'Expiring'].includes(c.state)).map(c => c.label), ...r.workers.flatMap(w => w.items.filter(i => !['Valid', 'Expiring'].includes(i.state)).map(i => `${w.name}: ${i.label}`))]; return `<div class="cm-site-ready"><div><b>${cmEsc(s.name)}</b><small>${cmEsc(s.address || '')}</small>${missing.length ? `<ul>${missing.slice(0, 6).map(m => `<li>${cmEsc(m)}</li>`).join('')}${missing.length > 6 ? `<li>+ ${missing.length - 6} more</li>` : ''}</ul>` : ''}</div><div class="cm-visit-side">${r.ready ? '<span class="status completed">Ready</span>' : '<span class="status rejected">Action needed</span>'}<div class="cc-actions">${s.briefing?.content ? `<button class="btn small outline" onclick="cmBriefing('${s.id}')">Safety briefing</button>` : ''}<button class="btn small primary" onclick="cmAccessForm('${s.id}')">Request access</button></div></div></div>`; }).join('') || '<p class="pa-empty">Sites appear here once a customer links a project you work on to one of their sites.</p>'}</section>
    <section class="panel"><div class="panel-title"><h3>Company documents</h3></div>${company.map(([k]) => docCell(k)).join('')}</section>
    <section class="panel"><div class="panel-title"><h3>Workers</h3><button class="btn small primary" onclick="cmWorkerForm()">+ Add worker</button></div>${workers.filter(w => w.active !== false).map(w => `<details class="cm-ready"><summary><b>${cmEsc(w.name)}</b><small>${cmEsc(w.role || '')}${w.postedFromAbroad ? ' · posted from abroad (A1 needed)' : ''}</small><span class="cm-summary-actions"><button type="button" class="btn small outline" onclick="event.preventDefault();cmWorkerForm('${w.id}')">Edit</button></span></summary>${workerReqs.filter(([, r]) => !r.onlyPosted || w.postedFromAbroad).map(([k]) => docCell(k, w.id)).join('')}</details>`).join('') || '<p class="pa-empty">Add the people who work on customer sites.</p>'}</section>
    <section class="panel"><div class="panel-title"><h3>Site access</h3><span class="ui-count">${visits.length}</span></div>${visits.map(v => `<div class="cm-visit"><div><b>${cmEsc(v.siteName)} · ${date(v.date)}${v.endDate !== v.date ? ' – ' + date(v.endDate) : ''}</b><small>${v.workers.map(w => cmEsc(w.name)).join(', ')}${v.permitType !== 'none' ? ' · ' + cmEsc(v.permitLabel) : ''}</small></div><div class="cm-visit-side">${cmTag(v.status)}<div class="cc-actions">${v.status === 'Approved' && v.date <= cmToday() && cmToday() <= v.endDate ? `<button class="btn small primary" onclick="cmSupplierVisit('${v.id}','checkin')">Check in</button>` : ''}${v.status === 'Checked in' ? `<button class="btn small outline" onclick="cmSupplierVisit('${v.id}','checkout')">Check out</button>` : ''}${['Requested', 'Approved'].includes(v.status) ? `<button class="btn small outline" onclick="cmSupplierVisit('${v.id}','cancel')">Cancel</button>` : ''}</div></div></div>`).join('') || '<p class="pa-empty">No access requests yet.</p>'}</section>`);
}
async function cmSupplierVisit(id, action) {
  try { await api(`/site-visits/${id}`, {method: 'PATCH', body: {action}}); toast({checkin: 'Checked in', checkout: 'Checked out', cancel: 'Request cancelled'}[action]); route(); } catch (x) { toast(x.message, 'error'); }
}
async function cmWorkerForm(id) {
  const {workers = []} = await api('/workers'), w = workers.find(x => x.id === id) || {};
  modal(id ? 'Edit worker' : 'Add worker', `<form id="cmWorkerForm" class="modal-form"><div class="two"><label>Full name<input name="name" value="${cmEsc(w.name || '')}" required></label><label>Role<input name="role" value="${cmEsc(w.role || '')}" placeholder="e.g. Electrician, Welder"></label></div><label>Mobile phone<input name="phone" value="${cmEsc(w.phone || '')}"></label><label class="cc-check-label"><input type="checkbox" name="postedFromAbroad" ${w.postedFromAbroad ? 'checked' : ''}> Posted from abroad (an A1 certificate is required)</label>${id ? `<label class="cc-check-label"><input type="checkbox" name="inactive" ${w.active === false ? 'checked' : ''}> No longer works for us</label>` : ''}<div id="cmWorkerError" class="form-error"></div><button class="btn primary">${id ? 'Save worker' : 'Add worker'}</button></form>`);
  document.getElementById('cmWorkerForm').onsubmit = async e => {
    e.preventDefault(); const f = new FormData(e.target), b = {name: f.get('name'), role: f.get('role'), phone: f.get('phone'), postedFromAbroad: f.has('postedFromAbroad'), active: !f.has('inactive')};
    try { await api(id ? `/workers/${id}` : '/workers', {method: id ? 'PATCH' : 'POST', body: b}); closeModal(); toast(id ? 'Worker saved' : 'Worker added'); route(); } catch (x) { document.getElementById('cmWorkerError').textContent = x.message; }
  };
}
async function cmUploadDoc(key, workerId) {
  const cat = await cmCat(), r = cat.requirements[key];
  modal('Upload document', `<form id="cmDocForm" class="modal-form"><p><b>${cmEsc(r.label)}</b></p><label>File (PDF, JPG or PNG)<input name="file" type="file" accept=".pdf,.png,.jpg,.jpeg" required></label><div class="two"><label>Issued on<input name="issuedAt" type="date"></label><label>Valid until${r.expires ? ' *' : ' (optional)'}<input name="expiresAt" type="date" min="${cmToday()}" ${r.expires ? 'required' : ''}></label></div><p class="subtle">Each customer reviews the document for their sites. You are reminded 30 days before it expires.</p><div id="cmDocError" class="form-error"></div><button class="btn primary">Upload</button></form>`);
  document.getElementById('cmDocForm').onsubmit = async e => {
    e.preventDefault(); const f = new FormData(e.target), file = e.target.elements.file.files[0], btn = e.target.querySelector('button.primary');
    btn.disabled = true;
    try { const up = await uploadFile(file); await api('/compliance/documents', {method: 'POST', body: {requirementKey: key, workerId, filename: up.filename, url: up.url, issuedAt: f.get('issuedAt'), expiresAt: f.get('expiresAt')}}); closeModal(); toast('Document uploaded for review'); route(); }
    catch (x) { document.getElementById('cmDocError').textContent = x.message; btn.disabled = false; }
  };
}
async function cmBriefing(siteId) {
  const [{site}, {workers = []}] = await Promise.all([api(`/sites/${siteId}`), api('/workers')]);
  modal(`Safety briefing · ${site.name}`, `<div class="legal-body cm-briefing-text">${legalHtml(site.briefing.content)}</div><form id="cmBriefForm" class="modal-form"><p class="subtle">Hand the device to the worker: they read the briefing above, confirm and sign with their full name. Valid for 12 months or until the site changes the briefing.</p><label>Worker<select name="workerId" required><option value="">Choose…</option>${workers.filter(w => w.active !== false).map(w => `<option value="${w.id}">${cmEsc(w.name)}</option>`).join('')}</select></label><label class="cc-check-label"><input type="checkbox" name="confirm" required> I have read and understood the safety briefing (version ${site.briefing.version}) and will follow it.</label><label>Signature — type your full name<input name="signatureName" required autocomplete="off"></label><div id="cmBriefError" class="form-error"></div><button class="btn primary">Sign briefing</button></form>`);
  document.getElementById('cmBriefForm').onsubmit = async e => {
    e.preventDefault(); const f = new FormData(e.target);
    try { await api(`/sites/${siteId}/briefings`, {method: 'POST', body: {workerId: f.get('workerId'), confirm: f.has('confirm'), signatureName: f.get('signatureName')}}); toast('Briefing signed'); e.target.reset(); document.getElementById('cmBriefError').textContent = ''; route(); }
    catch (x) { document.getElementById('cmBriefError').textContent = x.message; }
  };
}
async function cmAccessForm(siteId) {
  const [cat, {sites = []}, {workers = []}] = await Promise.all([cmCat(), api('/sites'), api('/workers')]);
  if (!sites.length) { toast('You have no work at a customer site yet', 'error'); return; }
  const site = sites.find(s => s.id === siteId) || sites[0];
  const detail = await api(`/sites/${site.id}`), permits = ['none', ...(site.permitTypes || [])];
  modal('Request site access', `<form id="cmAccessForm" class="modal-form"><label>Site<select name="siteId" onchange="cmAccessForm(this.value)">${sites.map(s => `<option value="${s.id}" ${s.id === site.id ? 'selected' : ''}>${cmEsc(s.name)}</option>`).join('')}</select></label><label>Project<select name="projectId">${detail.projects.map(p => `<option value="${p.id}">${cmEsc(p.name)}</option>`).join('')}</select></label><div class="two"><label>From<input name="date" type="date" min="${cmToday()}" value="${cmToday()}" required></label><label>Until<input name="endDate" type="date" min="${cmToday()}" value="${cmToday()}"></label></div>
    <fieldset class="cm-fieldset"><legend>Workers</legend><div class="cm-checks">${workers.filter(w => w.active !== false).map(w => { const r = site.readiness.workers.find(x => x.workerId === w.id); return `<label class="cc-check-label"><input type="checkbox" name="workerIds" value="${w.id}"> ${cmEsc(w.name)} ${r?.ready ? '<span class="status completed">Ready</span>' : '<span class="status rejected">Incomplete</span>'}</label>`; }).join('') || '<small class="subtle">Add workers first.</small>'}</div></fieldset>
    <label>Work permit<select name="permitType" id="cmPermit">${permits.map(k => `<option value="${k}">${cmEsc(cat.permits[k].label)}</option>`).join('')}</select></label><div id="cmChecklist" class="cm-checks"></div>
    <label>Work description<textarea name="description" rows="2" placeholder="What will be done where on site"></textarea></label>${site.readiness.companyReady ? '' : '<p class="danger-text">Your company documents for this site are incomplete — the customer may reject the request.</p>'}<div id="cmAccessError" class="form-error"></div><button class="btn primary">Send request</button></form>`);
  const renderChecklist = () => { const k = document.getElementById('cmPermit').value; document.getElementById('cmChecklist').innerHTML = cat.permits[k].checklist.map((c, i) => `<label class="cc-check-label"><input type="checkbox" name="check_${i}" required> ${cmEsc(c)}</label>`).join(''); };
  document.getElementById('cmPermit').onchange = renderChecklist; renderChecklist();
  document.getElementById('cmAccessForm').onsubmit = async e => {
    e.preventDefault(); const f = new FormData(e.target), k = f.get('permitType');
    const b = {siteId: f.get('siteId'), projectId: f.get('projectId'), date: f.get('date'), endDate: f.get('endDate'), workerIds: f.getAll('workerIds'), permitType: k, checklist: cat.permits[k].checklist.map((_, i) => f.has('check_' + i)), description: f.get('description')};
    try { await api('/site-visits', {method: 'POST', body: b}); closeModal(); toast('Access requested'); route(); } catch (x) { document.getElementById('cmAccessError').textContent = x.message; }
  };
}

/* ================= Approvals inbox additions ================= */
const cmBaseApprovals = srApprovals;
srApprovals = async function () {
  await cmBaseApprovals();
  const [{visits = []}, {documents = []}] = await Promise.all([api('/site-visits').catch(() => ({})), api('/compliance/documents').catch(() => ({}))]);
  await cmCat();
  const grid = document.querySelector('.dashboard-content .in-grid');
  if (!grid) return;
  const pending = visits.filter(v => v.status === 'Requested'), toReview = documents.filter(d => !d.review || d.review.status === 'Pending review');
  grid.insertAdjacentHTML('afterbegin', `<section class="panel"><div class="panel-title"><h3>${uiIcon('vetting', 'ui-icon sr-h-icon')} Site access requests</h3><span class="ui-count">${pending.length}</span></div>${pending.map(cmVisitRow).join('') || '<p class="pa-empty">All clear.</p>'}</section><section class="panel"><div class="panel-title"><h3>${uiIcon('vetting', 'ui-icon sr-h-icon')} Compliance documents</h3><span class="ui-count">${toReview.length}</span></div>${toReview.map(cmDocReviewRow).join('') || '<p class="pa-empty">All clear.</p>'}</section>`);
};

/* ================= Navigation & routing ================= */
function cmNav() {
  const nav = document.querySelector('.sidebar nav'), role = state.user?.role;
  if (!nav || !['customer', 'supplier'].includes(role)) return;
  const key = role === 'customer' ? 'sites' : 'compliance', label = role === 'customer' ? 'Sites & safety' : 'Compliance';
  if (nav.querySelector(`[href="#/${role}/${key}"]`)) return;
  const a = document.createElement('a'); a.href = `#/${role}/${key}`; a.textContent = label;
  if (location.hash.split('?')[0].startsWith(`#/${role}/${key}`)) { nav.querySelectorAll('a.active').forEach(x => x.classList.remove('active')); a.className = 'active'; }
  (nav.querySelector(`[href="#/${role}/contracts"]`) || nav.lastElementChild).after(a);
}
const cmBaseRoute = window.route;
window.route = async function () {
  const parts = location.hash.replace(/^#/, '').split('?')[0].split('/').filter(Boolean), role = state.user?.role;
  try {
    if (role === 'customer' && parts[0] === 'customer' && parts[1] === 'sites') { await cmCat(); parts[2] ? await cmSiteDetail(parts[2]) : await cmSites(); inNav(); srNav(); cmNav(); return; }
    if (role === 'supplier' && parts[0] === 'supplier' && parts[1] === 'compliance') { await cmSupplierPage(); inNav(); srNav(); cmNav(); return; }
  } catch (e) { console.error(e); toast(e.message, 'error'); return; }
  const result = await cmBaseRoute();
  cmNav();
  return result;
};
