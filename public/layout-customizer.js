/* Customizable page layouts: on dashboards, analytics and sourcing pages the user can drag cards
   within their group, hide cards, move whole sections, and reset. Saved per user on the server. */
const LC_PAGES = /^\/(customer|supplier|admin)\/(dashboard|analytics|sourcing|reports|sites)$/;
const LC_GRIDS =
  ".stats, .wf-stat-grid, .in-kpis, .pa-earnings, .pa-grid, .dashboard-grid, .in-grid, .cc-grid4";
let lcLayouts = null,
  lcEditing = false;
const lcPage = () => location.hash.replace(/^#/, "").split("?")[0];

async function lcLoad() {
  if (lcLayouts) return lcLayouts;
  try {
    lcLayouts = (await api("/profile")).user.layouts || {};
  } catch {
    lcLayouts = {};
  }
  return lcLayouts;
}
/* Stable keys: a card is identified by its heading or label text; a section by its class or heading. */
// Uses the original (English) text even after the German translation has replaced it.
const lcOriginal = (node) =>
  node ? (typeof I18N_ORIGINAL !== "undefined" && I18N_ORIGINAL.get(node)) || node.textContent : "";
const lcText = (el) => {
  const h = el.querySelector("h3, .cc-label, .stats span, span.cc-label, h2") || el.querySelector("span");
  const node = h && [...h.childNodes].find((n) => n.nodeType === 3 && n.textContent.trim());
  return lcOriginal(node).trim().toLowerCase().slice(0, 60);
};
function lcCardKey(card, i) {
  return (card.dataset.lcKey ||= lcText(card) || `card-${i}`);
}
function lcGridKey(grid, i) {
  return (grid.dataset.lcGrid ||= `${[...grid.classList].find((c) => LC_GRIDS.includes("." + c)) || "grid"}-${i}`);
}
function lcSectionKey(sec, i) {
  return (sec.dataset.lcSection ||= sec.classList.contains("dash-top")
    ? "header"
    : [...sec.classList].filter((c) => !["panel"].includes(c))[0] || lcText(sec) || `section-${i}`);
}
const lcRoot = () => {
  const c = document.querySelector(".dashboard-content");
  return c?.querySelector(":scope > .cc-page") || c;
};
const lcCards = (g) => [...g.children].filter((c) => !c.classList.contains("lc-section-tools"));
const lcGrids = () => [...(lcRoot()?.querySelectorAll(LC_GRIDS) || [])].filter((g) => lcCards(g).length > 1);
const lcSections = () =>
  [...(lcRoot()?.children || [])].filter(
    (s) =>
      !s.classList.contains("dash-top") &&
      !s.classList.contains("breadcrumb") &&
      !s.classList.contains("lc-bar"),
  );

/* Apply the saved layout to the freshly rendered page. */
async function lcApply() {
  const page = lcPage();
  if (!LC_PAGES.test(page) || !document.querySelector(".dashboard-content")) return;
  const saved = (await lcLoad())[page];
  lcToolbar();
  // Keys come from the untranslated English text, so a saved layout works in every language.
  const root = lcRoot(),
    sections = lcSections();
  sections.forEach(lcSectionKey);
  lcGrids().forEach((g, gi) => {
    lcGridKey(g, gi);
    lcCards(g).forEach(lcCardKey);
  });
  if (!saved) return;
  (saved.sections || []).forEach((k) => {
    const s = sections.find((x) => x.dataset.lcSection === k);
    if (s) root.appendChild(s);
  });
  lcGrids().forEach((g, gi) => {
    const key = lcGridKey(g, gi),
      cards = lcCards(g);
    cards.forEach(lcCardKey);
    (saved.grids?.[key] || []).forEach((k) => {
      const c = cards.find((x) => x.dataset.lcKey === k);
      if (c) g.appendChild(c);
    });
  });
  for (const el of root.querySelectorAll("[data-lc-key], [data-lc-section]")) {
    const k = el.dataset.lcSection ? "s:" + el.dataset.lcSection : el.dataset.lcKey;
    el.classList.toggle("lc-hidden", (saved.hidden || []).includes(k));
  }
}
function lcCollect() {
  const layout = { sections: lcSections().map((s, i) => lcSectionKey(s, i)), grids: {}, hidden: [] };
  lcGrids().forEach((g, gi) => {
    layout.grids[lcGridKey(g, gi)] = lcCards(g).map((c, i) => lcCardKey(c, i));
  });
  for (const el of lcRoot().querySelectorAll(".lc-hidden"))
    layout.hidden.push(el.dataset.lcSection ? "s:" + el.dataset.lcSection : el.dataset.lcKey);
  return layout;
}
async function lcSave(layout) {
  const page = lcPage();
  try {
    lcLayouts = (await api("/account/layout", { method: "PUT", body: { page, layout } })).layouts;
  } catch (x) {
    toast(x.message, "error");
  }
}

/* ---------- Edit mode ---------- */
function lcToolbar() {
  const top = document.querySelector(".dashboard-content .dash-top");
  if (!top || top.querySelector(".lc-toggle")) return;
  let holder = top.querySelector(":scope > .in-toolbar, :scope > .cc-actions, :scope > .dash-actions");
  if (!holder) {
    // Keep the page's own buttons and Customize together on the right of the header.
    holder = document.createElement("div");
    holder.className = "cc-actions dash-actions";
    top
      .querySelectorAll(":scope > .btn, :scope > button, :scope > a.btn")
      .forEach((b) => holder.appendChild(b));
    top.appendChild(holder);
  }
  const btn = document.createElement("button");
  btn.type = "button";
  // On the dashboards it stays next to the main button as a quiet grey text button (T95)
  btn.className = "btn outline lc-toggle" + (top.classList.contains("ds-dash-top") ? " ds-quiet" : "");
  btn.innerHTML = `<span aria-hidden="true">⠿</span> ${esc(t("layout.customize"))}`;
  btn.dataset.action = "lc.start";
  holder.prepend(btn);
}
function lcStart() {
  if (lcEditing) return;
  lcEditing = true;
  const root = lcRoot(),
    content = document.querySelector(".dashboard-content");
  content.classList.add("lc-editing");
  document.querySelector(".lc-toggle")?.setAttribute("hidden", "");
  content.insertAdjacentHTML(
    "afterbegin",
    `<div class="lc-bar" role="region" aria-label="${lk("editor")}" data-i18n="keys"><div><b>${lk("title")}</b><small>${lk("hint")}</small></div><div class="cc-actions"><button type="button" class="btn outline" data-action="lc.reset">${lk("reset")}</button><button type="button" class="btn outline" data-action="lc.cancel">${lk("cancel")}</button><button type="button" class="btn primary" data-action="lc.done">${lk("done")}</button></div></div>`,
  );
  lcSections().forEach((s, i) => {
    lcSectionKey(s, i);
    s.insertAdjacentHTML(
      "afterbegin",
      `<div class="lc-section-tools" data-i18n="keys"><button type="button" class="lc-tool" title="${lk("up")}" data-action="lc.move" data-dir="-1">↑</button><button type="button" class="lc-tool" title="${lk("down")}" data-action="lc.move" data-dir="1">↓</button>${s.matches(LC_GRIDS) ? "" : `<button type="button" class="lc-tool" title="${lk("hideSection")}" data-action="lc.toggleSection">👁</button>`}</div>`,
    );
  });
  lcGrids().forEach((g, gi) => {
    lcGridKey(g, gi);
    lcCards(g).forEach((card, i) => {
      lcCardKey(card, i);
      card.classList.add("lc-card");
      card.draggable = true;
      card.insertAdjacentHTML(
        "afterbegin",
        `<div class="lc-card-tools" data-i18n="keys"><span class="lc-grip" aria-hidden="true">⠿</span><button type="button" class="lc-tool" title="${lk("hideCard")}" data-action="lc.toggleCard">👁</button></div>`,
      );
      card.addEventListener("dragstart", lcDragStart);
      card.addEventListener("dragend", lcDragEnd);
      card.addEventListener("dragover", lcDragOver);
      card.addEventListener("click", lcBlockClicks, true);
    });
  });
}
function lcBlockClicks(e) {
  if (lcEditing && !e.target.closest(".lc-tool")) {
    e.preventDefault();
    e.stopPropagation();
  }
}
let lcDragged = null;
function lcDragStart(e) {
  lcDragged = e.currentTarget;
  lcDragged.classList.add("ui-dragging");
  e.dataTransfer.effectAllowed = "move";
  e.dataTransfer.setData("text/plain", lcDragged.dataset.lcKey);
}
function lcDragEnd() {
  lcDragged?.classList.remove("ui-dragging");
  lcDragged = null;
}
function lcDragOver(e) {
  const over = e.currentTarget;
  if (!lcDragged || over === lcDragged || over.parentElement !== lcDragged.parentElement) return;
  e.preventDefault();
  const r = over.getBoundingClientRect(),
    horizontal =
      getComputedStyle(over.parentElement).display.includes("grid") &&
      r.width < over.parentElement.clientWidth * 0.9;
  const after = horizontal ? (e.clientX - r.left) / r.width > 0.5 : (e.clientY - r.top) / r.height > 0.5;
  over.parentElement.insertBefore(lcDragged, after ? over.nextSibling : over);
}
function lcToggle(el) {
  el.classList.toggle("lc-hidden");
}
function lcMoveSection(btn, dir) {
  const s = btn.closest("[data-lc-section]"),
    list = lcSections(),
    i = list.indexOf(s),
    target = list[i + dir];
  if (!target) return;
  dir < 0 ? target.before(s) : target.after(s);
  s.scrollIntoView({ block: "nearest", behavior: "smooth" });
}
async function lcDone() {
  const layout = lcCollect();
  lcEditing = false;
  await lcSave(layout);
  tToast(t("layout.saved"));
  route();
}
function lcCancel() {
  lcEditing = false;
  route();
}
async function lcReset() {
  lcEditing = false;
  await lcSave(null);
  tToast(t("layout.resetDone"));
  route();
}

const lk = (key) => esc(t("layout." + key));
actions.on("lc.start", () => lcStart());
actions.on("lc.reset", () => lcReset());
actions.on("lc.cancel", () => lcCancel());
actions.on("lc.done", () => lcDone());
actions.on("lc.move", (el) => lcMoveSection(el, Number(el.dataset.dir)));
actions.on("lc.toggleSection", (el) => lcToggle(el.closest("[data-lc-section]")));
actions.on("lc.toggleCard", (el) => lcToggle(el.closest(".lc-card")));

/* Replace the earlier always-visible drag grips with the explicit edit mode. */
if (typeof uiSortablePanels === "function") uiSortablePanels = () => {};

const lcBaseRoute = window.route;
window.route = async function () {
  lcEditing = false;
  const result = await lcBaseRoute();
  try {
    await lcApply();
  } catch (e) {
    console.error(e);
  }
  return result;
};
