/* Supplier team planner: people × days calendar with job assignments, absences and site visits.
   Click an empty day to plan, click a bar to edit, drag a bar to move it to another day or person. */
const plEsc = v => esc(v ?? '');
const PL_DAY = 86400000;
const plIso = d => new Date(d.getTime() - d.getTimezoneOffset() * 60000).toISOString().slice(0, 10);
const plParse = s => { const [y, m, d] = s.split('-').map(Number); return new Date(y, m - 1, d); };
const plAdd = (s, n) => plIso(new Date(plParse(s).getTime() + n * PL_DAY + 3600000));
const plDiff = (a, b) => Math.round((plParse(b) - plParse(a)) / PL_DAY);
const plMonday = s => { const d = plParse(s), wd = (d.getDay() + 6) % 7; return plAdd(s, -wd); };
const PL_SPANS = {week: 7, twoweeks: 14, month: 28};
let pl = {start: plMonday(plIso(new Date())), span: 'twoweeks', data: null};
try { const saved = localStorage.getItem('cc_pl_span'); if (PL_SPANS[saved]) pl.span = saved; } catch {}

Object.assign(UI_NAV_ICONS, {planning: 'time'});
Object.assign(UI_ICON_PATHS, {calendar: '<rect x="3" y="5" width="18" height="16" rx="2"/><path d="M3 10h18M8 3v4M16 3v4"/>'});
UI_NAV_ICONS.planning = 'calendar';
if (typeof TM_NAV !== 'undefined') TM_NAV.supplier.planning = 'projects';

async function plPage() {
  const days = PL_SPANS[pl.span], end = plAdd(pl.start, days - 1);
  pl.data = await api(`/planning?from=${pl.start}&to=${end}`);
  const {people, entries, visits, jobs} = pl.data, today = plIso(new Date());
  const all = [...entries, ...visits], dates = Array.from({length: days}, (_, i) => plAdd(pl.start, i));
  const on = (e, d) => e.start <= d && e.end >= d;
  const workdays = dates.filter(d => { const w = plParse(d).getDay(); return w !== 0 && w !== 6; });
  const absentToday = people.filter(p => entries.some(e => e.personId === p.id && ['vacation', 'sick', 'training'].includes(e.type) && on(e, today))).length;
  const bookedToday = people.filter(p => all.some(e => e.personId === p.id && ['assignment', 'visit'].includes(e.type) && on(e, today))).length;
  const planned = new Set(entries.filter(e => e.type === 'assignment').map(e => e.taskId)), unplanned = jobs.filter(j => !planned.has(j.taskId));
  const conflicts = entries.filter(e => e.conflict).length;
  const monthName = d => plParse(d).toLocaleDateString(document.documentElement.lang === 'de' ? 'de-DE' : 'en-GB', {month: 'long', year: 'numeric'});
  const title = monthName(pl.start) === monthName(end) ? monthName(pl.start) : `${monthName(pl.start)} – ${monthName(end)}`;
  const util = p => { const booked = workdays.filter(d => all.some(e => e.personId === p.id && ['assignment', 'visit'].includes(e.type) && on(e, d))).length; return workdays.length ? Math.round(booked / workdays.length * 100) : 0; };

  // Stack overlapping bars of one person into lanes.
  const lanesFor = pid => {
    const items = all.filter(e => e.personId === pid && e.end >= pl.start && e.start <= end).sort((a, b) => a.start.localeCompare(b.start) || b.end.localeCompare(a.end)), lanes = [];
    for (const e of items) { let i = lanes.findIndex(l => l.every(x => x.end < e.start || x.start > e.end)); if (i < 0) { lanes.push([]); i = lanes.length - 1; } lanes[i].push(e); e.lane = i; }
    return {items, count: Math.max(1, lanes.length)};
  };
  const bar = e => {
    const s = Math.max(0, plDiff(pl.start, e.start)), f = Math.min(days - 1, plDiff(pl.start, e.end));
    return `<div class="pl-bar pl-${e.type} ${e.conflict ? 'conflict' : ''} ${e.readOnly ? 'ro' : ''}" style="grid-column:${s + 1} / ${f + 2};grid-row:${e.lane + 1}" ${e.readOnly ? '' : `draggable="true" data-entry="${e.id}"`} title="${plEsc(e.typeLabel)}: ${plEsc(e.title)} (${date(e.start)}${e.end !== e.start ? ' – ' + date(e.end) : ''})${e.conflict ? ' — overlaps another booking' : ''}${e.note ? '\n' + plEsc(e.note) : ''}" onclick="event.stopPropagation();${e.readOnly ? `toast('Site visits are managed under Compliance')` : `plEdit('${e.id}')`}"><span>${e.conflict ? '⚠ ' : ''}${plEsc(e.title)}</span></div>`;
  };
  const rows = people.map(p => {
    const {items, count} = lanesFor(p.id), u = util(p);
    return `<div class="pl-row" style="--lanes:${count}"><div class="pl-person"><span class="pl-avatar pl-${p.kind}">${plEsc(p.name.split(' ').map(x => x[0]).join('').slice(0, 2))}</span><div><b>${plEsc(p.name)}</b><small>${plEsc(p.role)}</small></div><span class="pl-util ${u > 90 ? 'high' : u < 30 ? 'low' : ''}" title="Booked on ${u}% of working days in this view">${u}%</span></div>
      <div class="pl-track" data-person="${p.id}" style="grid-template-columns:repeat(${days},minmax(0,1fr));grid-template-rows:repeat(${count},26px)">${dates.map((d, i) => `<div class="pl-cell ${[0, 6].includes(plParse(d).getDay()) ? 'weekend' : ''} ${d === today ? 'today' : ''}" style="grid-column:${i + 1};grid-row:1 / -1" data-date="${d}" onclick="plNew('${p.id}','${d}')"></div>`).join('')}${items.map(bar).join('')}</div></div>`;
  }).join('');
  const head = dates.map(d => { const dt = plParse(d); return `<div class="pl-day ${[0, 6].includes(dt.getDay()) ? 'weekend' : ''} ${d === today ? 'today' : ''}"><small>${dt.toLocaleDateString(document.documentElement.lang === 'de' ? 'de-DE' : 'en-GB', {weekday: 'short'})}</small><b>${dt.getDate()}</b></div>`; }).join('');

  app.innerHTML = dashboardShell('supplier', 'planning', `<div class="dash-top"><div><div class="eyebrow">TEAM PLANNER</div><h1>Team planner</h1><p>Plan who works on which job, see vacations and site visits, and spot double bookings.</p></div><div class="cc-actions"><button class="btn outline" onclick="plPlanJob()">Plan a job</button><button class="btn primary" onclick="plNew()">+ New entry</button></div></div>
    <div class="in-kpis">${inKpi('Team', people.length, `${people.filter(p => p.kind === 'worker').length} field worker(s)`)}${inKpi('Working today', bookedToday, 'on jobs or site visits')}${inKpi('Absent today', absentToday, 'vacation, sick or training', absentToday ? 'warn' : '')}${inKpi('Jobs without people', unplanned.length, `${conflicts} double booking(s)`, unplanned.length || conflicts ? 'warn' : 'good')}</div>
    <section class="panel pl-panel"><div class="pl-toolbar"><div class="pl-nav"><button class="btn small outline" onclick="plShift(-1)" title="Previous">‹</button><button class="btn small outline" onclick="plToday()">Today</button><button class="btn small outline" onclick="plShift(1)" title="Next">›</button><h3>${plEsc(title)}</h3></div>
      <div class="pl-legend">${[['assignment', 'Job'], ['visit', 'Site visit'], ['vacation', 'Vacation'], ['sick', 'Sick'], ['training', 'Training'], ['other', 'Other']].map(([k, l]) => `<span><i class="pl-${k}"></i>${l}</span>`).join('')}</div>
      <div class="xp-views pl-spans">${[['week', 'Week'], ['twoweeks', '2 weeks'], ['month', '4 weeks']].map(([k, l]) => `<button type="button" class="${pl.span === k ? 'on' : ''}" onclick="plSpan('${k}')">${l}</button>`).join('')}</div></div>
      ${people.length ? `<div class="pl-scroll"><div class="pl-grid" style="--days:${days}"><div class="pl-row pl-head"><div class="pl-person"><b>${people.length} people</b></div><div class="pl-track" style="grid-template-columns:repeat(${days},minmax(0,1fr))">${head}</div></div>${rows}</div></div>`
        : `<div class="cm-empty">${uiIcon('users', 'ui-icon cm-empty-icon')}<h3>Add your team first</h3><p>Invite team members or register field workers under Compliance — they appear here automatically.</p><div class="cc-actions"><a class="btn outline" href="#/supplier/team">Invite team members</a><a class="btn primary" href="#/supplier/compliance">Register workers</a></div></div>`}
    </section>
    <section class="panel"><div class="panel-title"><h3>Jobs to staff</h3><span class="ui-count">${jobs.length}</span></div>${jobs.map(j => { const n = new Set(entries.filter(e => e.taskId === j.taskId).map(e => e.personId)).size; return `<div class="pa-row pl-job"><span><b>${plEsc(j.taskName)}</b><small>${plEsc(j.projectName)} · ${plEsc(j.phaseName)}${j.startDate ? ` · ${date(j.startDate)} – ${date(j.dueDate)}` : ''}</small></span><span class="status ${n ? 'completed' : 'pending'}">${n ? `${n} person(s) planned` : 'Nobody planned'}</span><button class="btn small ${n ? 'outline' : 'primary'}" onclick="plPlanJob('${j.taskId}')">Plan people</button></div>`; }).join('') || '<p class="pa-empty">No open jobs assigned to your company.</p>'}</section>`);
  plBindDrag();
}
function plShift(dir) { pl.start = plAdd(pl.start, dir * (pl.span === 'week' ? 7 : 14)); plPage(); }
function plToday() { pl.start = plMonday(plIso(new Date())); plPage(); }
function plSpan(s) { pl.span = s; try { localStorage.setItem('cc_pl_span', s); } catch {} plPage(); }

/* ---------- Entry dialog ---------- */
function plForm(title, e, onSave, onDelete) {
  const {people, jobs, types} = pl.data;
  modal(title, `<form id="plForm" class="modal-form"><div class="two"><label>Person<select name="personId" required>${people.map(p => `<option value="${p.id}" ${e.personId === p.id ? 'selected' : ''}>${plEsc(p.name)} · ${plEsc(p.role)}</option>`).join('')}</select></label>
    <label>Type<select name="type">${Object.entries(types).map(([k, l]) => `<option value="${k}" ${e.type === k ? 'selected' : ''}>${plEsc(l)}</option>`).join('')}</select></label></div>
    <label class="pl-job-field">Job<select name="taskId"><option value="">Choose an assigned task…</option>${jobs.map(j => `<option value="${j.taskId}" data-start="${j.startDate || ''}" data-end="${j.dueDate || ''}" ${e.taskId === j.taskId ? 'selected' : ''}>${plEsc(j.projectName)} · ${plEsc(j.taskName)}</option>`).join('')}</select></label>
    <label class="pl-title-field">Title<input name="title" value="${plEsc(e.type === 'assignment' ? '' : e.title || '')}" placeholder="e.g. Summer vacation, SCC course"></label>
    <div class="two"><label>From<input name="start" type="date" value="${e.start || ''}" required></label><label>To<input name="end" type="date" value="${e.end || e.start || ''}" required></label></div>
    <label>Note <small class="subtle">optional</small><textarea name="note" rows="2">${plEsc(e.note || '')}</textarea></label>
    <div id="plError" class="form-error"></div><div class="cc-actions">${onDelete ? '<button type="button" class="btn outline danger-text" id="plDelete">Delete</button>' : ''}<button class="btn primary">Save</button></div></form>`);
  const form = document.getElementById('plForm'), sync = () => { const job = form.type.value === 'assignment'; form.querySelector('.pl-job-field').hidden = !job; form.querySelector('.pl-title-field').hidden = job; form.taskId.required = job; };
  form.type.onchange = sync; sync();
  form.taskId.onchange = () => { const o = form.taskId.selectedOptions[0]; if (o?.dataset.start && !form.start.value) { form.start.value = o.dataset.start; form.end.value = o.dataset.end || o.dataset.start; } };
  form.start.onchange = () => { if (!form.end.value || form.end.value < form.start.value) form.end.value = form.start.value; };
  if (onDelete) document.getElementById('plDelete').onclick = onDelete;
  form.onsubmit = async ev => {
    ev.preventDefault(); const b = Object.fromEntries(new FormData(form));
    try { const r = await onSave(b); closeModal(); toast(r?.conflicts?.length ? `Saved — overlaps ${r.conflicts.map(c => c.title).join(', ')}` : 'Planner updated', r?.conflicts?.length ? 'error' : undefined); plPage(); }
    catch (x) { document.getElementById('plError').textContent = x.message; }
  };
}
function plNew(personId = '', day = '') {
  if (!pl.data?.people.length) { toast('Add team members or workers first', 'error'); return; }
  plForm('New planner entry', {personId, start: day, end: day, type: pl.data.jobs.length ? 'assignment' : 'vacation'}, b => api('/planning', {method: 'POST', body: b}));
}
function plEdit(id) {
  const e = pl.data.entries.find(x => x.id === id); if (!e) return;
  plForm('Edit planner entry', e, b => api('/planning/' + id, {method: 'PATCH', body: b}), async () => {
    if (!await uiConfirm('Delete this planner entry?', {confirmLabel: 'Delete'})) return;
    try { await api('/planning/' + id, {method: 'DELETE'}); closeModal(); toast('Entry deleted'); plPage(); } catch (x) { toast(x.message, 'error'); }
  });
}
/* Staff a job: pick several people at once for the task's dates. */
function plPlanJob(taskId = '') {
  const {people, jobs} = pl.data;
  if (!jobs.length) { toast('There are no open jobs assigned to your company', 'error'); return; }
  const job = jobs.find(j => j.taskId === taskId) || jobs[0], planned = new Set(pl.data.entries.filter(e => e.taskId === job.taskId).map(e => e.personId));
  modal('Plan people on a job', `<form id="plJobForm" class="modal-form"><label>Job<select name="taskId">${jobs.map(j => `<option value="${j.taskId}" data-start="${j.startDate || ''}" data-end="${j.dueDate || ''}" ${j.taskId === job.taskId ? 'selected' : ''}>${plEsc(j.projectName)} · ${plEsc(j.taskName)}</option>`).join('')}</select></label>
    <div class="two"><label>From<input name="start" type="date" value="${job.startDate || plIso(new Date())}" required></label><label>To<input name="end" type="date" value="${job.dueDate || job.startDate || plIso(new Date())}" required></label></div>
    <fieldset class="cm-fieldset"><legend>People</legend><div class="cm-checks">${people.map(p => `<label class="cc-check-label"><input type="checkbox" name="people" value="${p.id}" ${planned.has(p.id) ? 'checked disabled' : ''}> ${plEsc(p.name)} <small class="subtle">${plEsc(p.role)}${planned.has(p.id) ? ' · already planned' : ''}</small></label>`).join('')}</div></fieldset>
    <div id="plJobError" class="form-error"></div><button class="btn primary">Plan selected people</button></form>`);
  const form = document.getElementById('plJobForm');
  form.taskId.onchange = () => { closeModal(); plPlanJob(form.taskId.value); };
  form.onsubmit = async ev => {
    ev.preventDefault(); const f = new FormData(form), ids = f.getAll('people');
    if (!ids.length) { document.getElementById('plJobError').textContent = 'Choose at least one person'; return; }
    try {
      let clashes = 0;
      for (const personId of ids) { const r = await api('/planning', {method: 'POST', body: {personId, type: 'assignment', taskId: f.get('taskId'), start: f.get('start'), end: f.get('end')}}); clashes += r.conflicts.length ? 1 : 0; }
      closeModal(); toast(clashes ? `${ids.length} planned — ${clashes} with overlapping bookings` : `${ids.length} person(s) planned`, clashes ? 'error' : undefined); plPage();
    } catch (x) { document.getElementById('plJobError').textContent = x.message; }
  };
}

/* ---------- Drag a bar to another day or person ---------- */
function plBindDrag() {
  let drag = null;
  document.querySelectorAll('.pl-bar[data-entry]').forEach(b => {
    b.addEventListener('dragstart', ev => {
      const e = pl.data.entries.find(x => x.id === b.dataset.entry), track = b.parentElement, r = track.getBoundingClientRect(), days = PL_SPANS[pl.span];
      const grabDay = Math.floor((ev.clientX - r.left) / (r.width / days));
      drag = {e, offset: grabDay - Math.max(0, plDiff(pl.start, e.start))};
      ev.dataTransfer.effectAllowed = 'move'; ev.dataTransfer.setData('text/plain', e.id); b.classList.add('dragging');
    });
    b.addEventListener('dragend', () => { b.classList.remove('dragging'); document.querySelectorAll('.pl-cell.drop').forEach(c => c.classList.remove('drop')); });
  });
  document.querySelectorAll('.pl-track[data-person]').forEach(track => {
    const cellAt = ev => { const r = track.getBoundingClientRect(), days = PL_SPANS[pl.span]; return Math.max(0, Math.min(days - 1, Math.floor((ev.clientX - r.left) / (r.width / days)))); };
    track.addEventListener('dragover', ev => { if (!drag) return; ev.preventDefault(); track.querySelectorAll('.pl-cell').forEach((c, i) => c.classList.toggle('drop', i === cellAt(ev))); });
    track.addEventListener('dragleave', () => track.querySelectorAll('.pl-cell.drop').forEach(c => c.classList.remove('drop')));
    track.addEventListener('drop', async ev => {
      if (!drag) return; ev.preventDefault();
      const {e, offset} = drag; drag = null;
      const len = plDiff(e.start, e.end), start = plAdd(pl.start, cellAt(ev) - offset), personId = track.dataset.person;
      if (start === e.start && personId === e.personId) return;
      try { const r = await api('/planning/' + e.id, {method: 'PATCH', body: {start, end: plAdd(start, len), personId}}); toast(r.conflicts.length ? 'Moved — overlaps another booking' : 'Moved', r.conflicts.length ? 'error' : undefined); plPage(); }
      catch (x) { toast(x.message, 'error'); plPage(); }
    });
  });
}

/* ---------- Navigation & routing ---------- */
function plNav() {
  const nav = document.querySelector('.sidebar nav');
  if (!nav || state.user?.role !== 'supplier' || nav.querySelector('[href="#/supplier/planning"]')) return;
  if (state.user.isMember && typeof tmLevel === 'function' && tmLevel('projects') === 'none') return;
  const a = document.createElement('a'); a.href = '#/supplier/planning'; a.textContent = 'Team planner';
  if (location.hash.split('?')[0] === '#/supplier/planning') { nav.querySelectorAll('a.active').forEach(x => x.classList.remove('active')); a.className = 'active'; }
  (nav.querySelector('[href="#/supplier/projects"]') || nav.querySelector('[href="#/supplier/phases"]') || nav.lastElementChild).after(a);
  if (typeof uiEnhanceSidebar === 'function') uiEnhanceSidebar();
}
const plBaseRoute = window.route;
window.route = async function () {
  const parts = location.hash.replace(/^#/, '').split('?')[0].split('/').filter(Boolean);
  // Workspace pages belong to one role: a supplier opening a customer link lands on their own dashboard.
  if (state.user && ['customer', 'supplier', 'admin'].includes(parts[0]) && parts[0] !== state.user.role) { navigate(`/${state.user.role}/dashboard`); return; }
  if (state.user?.role === 'supplier' && parts[0] === 'supplier' && parts[1] === 'planning') {
    try { await plPage(); } catch (e) { console.error(e); toast(e.message, 'error'); }
    for (const fn of ['inNav', 'srNav', 'cmNav', 'tmNav']) if (typeof window[fn] === 'function') try { window[fn](); } catch {}
    plNav(); return;
  }
  const result = await plBaseRoute(); plNav(); return result;
};
// Pages rendered outside the router get the planner link too.
new MutationObserver(() => requestAnimationFrame(plNav)).observe(document.getElementById('app'), {childList: true});
