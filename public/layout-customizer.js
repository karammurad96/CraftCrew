/* Customizable page layouts: on dashboards, analytics and sourcing pages the user can drag cards
   within their group, hide cards, move whole sections, and reset. Saved per user on the server. */
const LC_PAGES = /^\/(customer|supplier|admin)\/(dashboard|analytics|sourcing|reports|sites)$/;
const LC_GRIDS = '.stats, .wf-stat-grid, .in-kpis, .pa-earnings, .pa-grid, .dashboard-grid, .in-grid, .cc-grid4';
let lcLayouts = null, lcEditing = false;
const lcPage = () => location.hash.replace(/^#/, '').split('?')[0];

async function lcLoad() {
  if (lcLayouts) return lcLayouts;
  try { lcLayouts = (await api('/profile')).user.layouts || {}; } catch { lcLayouts = {}; }
  return lcLayouts;
}
/* Stable keys: a card is identified by its heading or label text; a section by its class or heading. */
// Uses the original (English) text even after the German translation has replaced it.
const lcOriginal = node => node ? ((typeof I18N_ORIGINAL !== 'undefined' && I18N_ORIGINAL.get(node)) || node.textContent) : '';
const lcText = el => { const h = el.querySelector('h3, .cc-label, .stats span, span.cc-label, h2') || el.querySelector('span'); const node = h && [...h.childNodes].find(n => n.nodeType === 3 && n.textContent.trim()); return lcOriginal(node).trim().toLowerCase().slice(0, 60); };
function lcCardKey(card, i) { return card.dataset.lcKey ||= (lcText(card) || `card-${i}`); }
function lcGridKey(grid, i) { return grid.dataset.lcGrid ||= `${[...grid.classList].find(c => LC_GRIDS.includes('.' + c)) || 'grid'}-${i}`; }
function lcSectionKey(sec, i) { return sec.dataset.lcSection ||= (sec.classList.contains('dash-top') ? 'header' : [...sec.classList].filter(c => !['panel'].includes(c))[0] || lcText(sec) || `section-${i}`); }
const lcRoot = () => { const c = document.querySelector('.dashboard-content'); return c?.querySelector(':scope > .cc-page') || c; };
const lcCards = g => [...g.children].filter(c => !c.classList.contains('lc-section-tools'));
const lcGrids = () => [...(lcRoot()?.querySelectorAll(LC_GRIDS) || [])].filter(g => lcCards(g).length > 1);
const lcSections = () => [...(lcRoot()?.children || [])].filter(s => !s.classList.contains('dash-top') && !s.classList.contains('breadcrumb') && !s.classList.contains('lc-bar'));

/* Apply the saved layout to the freshly rendered page. */
async function lcApply() {
  const page = lcPage();
  if (!LC_PAGES.test(page) || !document.querySelector('.dashboard-content')) return;
  const saved = (await lcLoad())[page];
  lcToolbar();
  // Keys come from the untranslated English text, so a saved layout works in every language.
  const root = lcRoot(), sections = lcSections();
  sections.forEach(lcSectionKey);
  lcGrids().forEach((g, gi) => { lcGridKey(g, gi); lcCards(g).forEach(lcCardKey); });
  if (!saved) return;
  (saved.sections || []).forEach(k => { const s = sections.find(x => x.dataset.lcSection === k); if (s) root.appendChild(s); });
  lcGrids().forEach((g, gi) => {
    const key = lcGridKey(g, gi), cards = lcCards(g);
    cards.forEach(lcCardKey);
    (saved.grids?.[key] || []).forEach(k => { const c = cards.find(x => x.dataset.lcKey === k); if (c) g.appendChild(c); });
  });
  for (const el of root.querySelectorAll('[data-lc-key], [data-lc-section]')) {
    const k = el.dataset.lcSection ? 's:' + el.dataset.lcSection : el.dataset.lcKey;
    el.classList.toggle('lc-hidden', (saved.hidden || []).includes(k));
  }
}
function lcCollect() {
  const layout = {sections: lcSections().map((s, i) => lcSectionKey(s, i)), grids: {}, hidden: []};
  lcGrids().forEach((g, gi) => { layout.grids[lcGridKey(g, gi)] = lcCards(g).map((c, i) => lcCardKey(c, i)); });
  for (const el of lcRoot().querySelectorAll('.lc-hidden')) layout.hidden.push(el.dataset.lcSection ? 's:' + el.dataset.lcSection : el.dataset.lcKey);
  return layout;
}
async function lcSave(layout) {
  const page = lcPage();
  try { lcLayouts = (await api('/account/layout', {method: 'PUT', body: {page, layout}})).layouts; } catch (x) { toast(x.message, 'error'); }
}

/* ---------- Edit mode ---------- */
function lcToolbar() {
  const top = document.querySelector('.dashboard-content .dash-top');
  if (!top || top.querySelector('.lc-toggle')) return;
  const holder = top.querySelector('.in-toolbar') || top.querySelector(':scope > .btn, :scope > button')?.parentElement || top;
  const btn = document.createElement('button');
  btn.type = 'button'; btn.className = 'btn outline lc-toggle'; btn.innerHTML = '<span aria-hidden="true">⠿</span> Customize';
  btn.onclick = lcStart;
  holder === top ? top.appendChild(btn) : holder.prepend(btn);
}
function lcStart() {
  if (lcEditing) return;
  lcEditing = true;
  const root = lcRoot(), content = document.querySelector('.dashboard-content');
  content.classList.add('lc-editing');
  document.querySelector('.lc-toggle')?.setAttribute('hidden', '');
  content.insertAdjacentHTML('afterbegin', `<div class="lc-bar" role="region" aria-label="Layout editor"><div><b>Customize this page</b><small>Drag cards to rearrange them, use the eye to hide or show a card, and the arrows to move whole sections.</small></div><div class="cc-actions"><button type="button" class="btn outline" onclick="lcReset()">Reset</button><button type="button" class="btn outline" onclick="lcCancel()">Cancel</button><button type="button" class="btn primary" onclick="lcDone()">Done</button></div></div>`);
  lcSections().forEach((s, i) => {
    lcSectionKey(s, i);
    s.insertAdjacentHTML('afterbegin', `<div class="lc-section-tools"><button type="button" class="lc-tool" title="Move section up" onclick="lcMoveSection(this,-1)">↑</button><button type="button" class="lc-tool" title="Move section down" onclick="lcMoveSection(this,1)">↓</button>${s.matches(LC_GRIDS) ? '' : `<button type="button" class="lc-tool" title="Hide or show section" onclick="lcToggle(this.closest('[data-lc-section]'))">👁</button>`}</div>`);
  });
  lcGrids().forEach((g, gi) => {
    lcGridKey(g, gi);
    lcCards(g).forEach((card, i) => {
      lcCardKey(card, i);
      card.classList.add('lc-card');
      card.draggable = true;
      card.insertAdjacentHTML('afterbegin', `<div class="lc-card-tools"><span class="lc-grip" aria-hidden="true">⠿</span><button type="button" class="lc-tool" title="Hide or show card" onclick="event.stopPropagation();lcToggle(this.closest('.lc-card'))">👁</button></div>`);
      card.addEventListener('dragstart', lcDragStart);
      card.addEventListener('dragend', lcDragEnd);
      card.addEventListener('dragover', lcDragOver);
      card.addEventListener('click', lcBlockClicks, true);
    });
  });
}
function lcBlockClicks(e) { if (lcEditing && !e.target.closest('.lc-tool')) { e.preventDefault(); e.stopPropagation(); } }
let lcDragged = null;
function lcDragStart(e) { lcDragged = e.currentTarget; lcDragged.classList.add('ui-dragging'); e.dataTransfer.effectAllowed = 'move'; e.dataTransfer.setData('text/plain', lcDragged.dataset.lcKey); }
function lcDragEnd() { lcDragged?.classList.remove('ui-dragging'); lcDragged = null; }
function lcDragOver(e) {
  const over = e.currentTarget;
  if (!lcDragged || over === lcDragged || over.parentElement !== lcDragged.parentElement) return;
  e.preventDefault();
  const r = over.getBoundingClientRect(), horizontal = getComputedStyle(over.parentElement).display.includes('grid') && r.width < over.parentElement.clientWidth * .9;
  const after = horizontal ? (e.clientX - r.left) / r.width > .5 : (e.clientY - r.top) / r.height > .5;
  over.parentElement.insertBefore(lcDragged, after ? over.nextSibling : over);
}
function lcToggle(el) { el.classList.toggle('lc-hidden'); }
function lcMoveSection(btn, dir) {
  const s = btn.closest('[data-lc-section]'), list = lcSections(), i = list.indexOf(s), target = list[i + dir];
  if (!target) return;
  dir < 0 ? target.before(s) : target.after(s);
  s.scrollIntoView({block: 'nearest', behavior: 'smooth'});
}
async function lcDone() { const layout = lcCollect(); lcEditing = false; await lcSave(layout); toast('Layout saved'); route(); }
function lcCancel() { lcEditing = false; route(); }
async function lcReset() { lcEditing = false; await lcSave(null); toast('Layout reset'); route(); }

/* Replace the earlier always-visible drag grips with the explicit edit mode. */
if (typeof uiSortablePanels === 'function') uiSortablePanels = () => {};

const lcBaseRoute = window.route;
window.route = async function () {
  lcEditing = false;
  const result = await lcBaseRoute();
  try { await lcApply(); } catch (e) { console.error(e); }
  return result;
};
