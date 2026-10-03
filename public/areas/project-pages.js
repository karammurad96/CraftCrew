/* Area: the pages inside a project (T128c). The task and phase pages (time against the estimate, the tasks,
   progress updates) and the task board (T99: columns with drag and drop and arrow keys, the phase order and a
   side panel for a card), drawn with translation keys and data-action handlers. Names, descriptions, statuses
   and notes are data: they keep the old translation for display (data-i18n="dom"). */
const ppk = (key, params) => esc(t("sub." + key, params));
const ppDom = (text) => `<bdi data-i18n="dom">${esc(text)}</bdi>`;
const ppKeys = (parts) => parts.filter(Boolean).map((html) => html.replace(/^<(\w+)/, '<$1 data-i18n="keys"')).join("");

/* ---------- Task and phase pages ---------- */
async function ppItemPage(role, pid, type, id) {
  const d = await api("/projects/" + encodeURIComponent(pid)),
    p = d.project,
    ph = type === "phase" ? p.phases.find((x) => x.id === id) : p.phases.find((x) => (x.tasks || []).some((y) => y.id === id)),
    task = type === "task" ? ph?.tasks.find((x) => x.id === id) : null;
  if (!ph || (type === "task" && !task)) return renderNotFound();
  const entries = (await api(`/time-entries?projectId=${encodeURIComponent(p.id)}&${type === "phase" ? "phaseId" : "taskId"}=${encodeURIComponent(id)}`)).entries || [],
    tasks = type === "phase" ? ph.tasks || [] : [task],
    approved = entries.filter((e) => e.status === "Approved"),
    sum = approved.reduce((a, x) => a + Number(x.hours), 0),
    cap = tasks.reduce((a, x) => a + Number(x.orderAmount || 0), 0),
    expected = tasks.reduce((a, x) => a + Number(x.estimatedHours || 0), 0),
    item = (key, params) => ppk("item." + key, params),
    q = `project=${encodeURIComponent(p.id)}&phase=${encodeURIComponent(ph.id)}${task ? `&task=${encodeURIComponent(task.id)}` : ""}`;
  const stat = (label, value) => `<div class="cc-card"><span class="cc-label">${label}</span><b>${value}</b></div>`;
  let updates = "";
  if (task) {
    const mine = role === "supplier" && task.assignedSupplierId === state.user.supplierId,
      progress = Number(task.progress) || 0;
    updates = `<section class="panel pa-updates"><div class="panel-title"><h3>${item("updates", { n: progress })}</h3>${
      mine && task.acceptanceStatus === "Accepted"
        ? `<button class="btn small primary" data-action="sub.progress" data-project="${esc(p.id)}" data-phase="${esc(ph.id)}" data-task="${esc(task.id)}" data-progress="${progress}">${item("postUpdate")}</button>`
        : ""
    }</div>${
      (task.progressUpdates || [])
        .map(
          (u) =>
            `<div class="pa-update"><span class="pa-pill ${u.milestone ? "green" : "blue"}">${esc(u.progress)}%</span><div><b>${u.milestone ? "🏁 " + esc(u.milestone) : statusHtml(u.status)}</b>${u.note ? `<p>${esc(u.note)}</p>` : ""}<small>${esc(u.byName)} · ${esc(u.company)} · ${esc(new Date(u.at).toLocaleString(fmt.locale(), { day: "2-digit", month: "short", hour: "2-digit", minute: "2-digit" }))}</small></div></div>`,
        )
        .join("") || `<p class="pa-empty">${item("noUpdates")}</p>`
    }</section>`;
  }
  app.innerHTML = dashboardShell(
    role,
    "projects",
    `<div class="cc-page">${ppKeys([
      `<a class="breadcrumb" href="#/${role}/projects/${esc(p.id)}">← ${esc(p.name)}</a>`,
      `<div class="dash-top"><div><div class="eyebrow">${item(type === "phase" ? "phaseEyebrow" : "taskEyebrow")}</div><h1>${type === "phase" ? ppDom(ph.name) : esc(task.name)}</h1><p>${esc(p.name)}${task ? " · " + ppDom(ph.name) : ""}</p></div>${
        role === "supplier" ? `<button class="btn primary" data-action="sub.logTime">${item("logTime")}</button>` : ""
      }</div>`,
      `<div class="wf-stat-grid">${stat(item("status"), statusHtml(type === "phase" ? ph.status : task.status))}${stat(item("order"), esc(fmt.money(cap)))}${stat(item("approved"), item("hours", { n: fmt.number(sum, 1) }))}${stat(
        item("estimate"),
        expected ? item("hours", { n: expected }) : item("notSet"),
      )}</div>`,
      `<section class="panel"><h3>${item("timeTitle")}</h3><div class="cc-progress-track"><i style="width:${expected ? Math.min(100, (sum / expected) * 100) : 0}%"></i></div><p>${
        expected ? item("timeOf", { sum: fmt.number(sum, 1), est: expected, pct: Math.round((sum / expected) * 100) }) : item("noEstimate")
      } ${item("value", { amount: fmt.money(approved.reduce((a, x) => a + Number(x.amount), 0)) })}</p></section>`,
      `<section class="panel"><div class="panel-title"><h3>${item("tasks")}</h3><span>${tasks.length}</span></div><div class="cc-subpage-task-list">${tasks
        .map(
          (x) =>
            `<a class="cc-subpage-task" href="#/${role}/projects/${esc(p.id)}/tasks/${esc(x.id)}"><span><b>${esc(x.name)}</b><small>${x.description ? ppDom(x.description) : ""}</small></span><span>${tHtml("sub.item.taskState", { status: statusHtml(x.status), n: String(Number(x.progress) || 0) })}</span></a>`,
        )
        .join("")}</div></section>`,
      `<div class="cc-actions"><a class="btn outline" href="#/${role}/projects/${esc(p.id)}/documents?phase=${esc(encodeURIComponent(ph.id))}${task ? `&amp;task=${esc(encodeURIComponent(task.id))}` : ""}">${item("documents")}</a><a class="btn outline" href="#/${role}/invoices?${esc(q)}">${item("invoices")}</a><a class="btn outline" href="#/${role}/messages?${esc(q)}">${item("messages")}</a></div>`,
      updates,
    ])}</div>`,
  );
}
for (const role of ["customer", "supplier"]) {
  routes.add(`/${role}/projects/:id/tasks/:item`, (params) => ppItemPage(role, params.id, "task", params.item));
  routes.add(`/${role}/projects/:id/phases/:item`, (params) => ppItemPage(role, params.id, "phase", params.item));
}
actions.on("sub.logTime", () => ccNewTimeEntry());
actions.on("sub.progress", (el) => pdProgress(el.dataset.project, el.dataset.phase, el.dataset.task, Number(el.dataset.progress)));

/* ---------- Task board (T99, board BoardDrawer) ---------- */
const PP_COLUMNS = ["Not Started", "In Progress", "On Hold", "Completed"];
const PP_COLUMN_COLOURS = { "Not Started": "#94a3b8", "In Progress": "#2563eb", "On Hold": "#f59e0b", Completed: "#16a34a" };
let ppBoard = null; // { role, project, suppliers } of the board on screen
const ppLocalToday = () => {
  const d = new Date();
  return new Date(d.getTime() - d.getTimezoneOffset() * 60000).toISOString().slice(0, 10);
};
// "3 days late" in calendar days of the user's time zone
function ppLate(due) {
  if (!Date.parse(String(due || "").slice(0, 10))) return t("sub.board.overdue");
  return t.plural("sub.board.late", Math.max(1, Math.round((Date.parse(ppLocalToday()) - Date.parse(String(due).slice(0, 10))) / 86400000)));
}
async function ppBoardPage(role, pid, query) {
  const { project: p, suppliers = [] } = await api(`/projects/${encodeURIComponent(pid)}`),
    phaseFilter = query.get("phase") || "",
    phases = p.phases || [],
    b = (key, params) => ppk("board." + key, params),
    utcToday = new Date().toISOString().slice(0, 10),
    today = ppLocalToday(),
    company = (id) => suppliers.find((s) => s.id === id)?.company || "";
  ppBoard = { role, project: p, suppliers };
  // Phases without tasks are cards themselves; a supplier sees its own work
  const items = [];
  for (const ph of phases) {
    if (phaseFilter && ph.id !== phaseFilter) continue;
    const tasks = ph.tasks || [];
    if (!tasks.length && (role === "customer" || ph.supplierId === state.user.supplierId)) items.push({ ph, status: ph.status, dueDate: ph.dueDate });
    for (const x of tasks) if (role === "customer" || x.assignedSupplierId === state.user.supplierId) items.push({ ph, t: x, status: x.status, dueDate: x.dueDate });
  }
  const card = ({ ph, t: x, status, dueDate }) => {
    const col = status || "Not Started",
      canMove = role === "customer" || (x ? x.assignedSupplierId === state.user.supplierId && x.acceptanceStatus === "Accepted" : ph.supplierId === state.user.supplierId),
      done = col === "Completed",
      late = col !== "Completed" && dueDate && dueDate < utcToday,
      lateChip = !done && dueDate && dueDate < today,
      sup = company(x ? x.assignedSupplierId : ph.supplierId),
      pct = Number(x?.progress) || 0,
      due = dueDate ? t("sub.board.due", { date: fmt.range(dueDate) }) : "";
    const chips = [
      x && x.acceptanceStatus === "Pending" ? `<span class="status" data-ds-fixed data-ds-tone="orange">${sup ? b("awaiting", { supplier: sup }) : b("awaitingSupplier")}</span>` : "",
      lateChip ? `<span class="status" data-ds-fixed data-ds-tone="red">${esc(ppLate(dueDate))}</span>` : "",
    ].join("");
    const meta = done
      ? `<span class="ds-accepted ds-ui" data-task="${esc(x?.id || "")}">${b("done")}</span>`
      : sup && x
        ? esc([sup, t("sub.board.percent", { n: pct }), due].filter(Boolean).join(" · "))
        : [ppDom(ph.name), esc(due), x && !sup ? b("noSupplier") : ""].filter(Boolean).join(" · ");
    return `<article class="in-card ${late ? "late" : ""} ${canMove ? "" : "locked"}${done ? " ds-done" : ""}" draggable="${canMove}" data-phase="${esc(ph.id)}" data-task="${esc(x?.id || "")}" tabindex="0"${x ? ' data-ds-panel="1"' : ""}><a href="#/${role}/projects/${esc(p.id)}/${x ? "tasks/" + esc(x.id) : "phases/" + esc(ph.id)}" class="ds-card-title"><b>${esc(x?.name || ph.name)}</b></a>${
      canMove
        ? ""
        : `<span class="ds-lock" title="${b("locked")}" aria-label="${b("lockedLabel")}"><svg viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2" aria-hidden="true"><rect x="5" y="11" width="14" height="9" rx="2"/><path d="M8 11V8a4 4 0 0 1 8 0v3"/></svg></span>`
    }${chips ? `<div class="ds-card-chips">${chips}</div>` : ""}${!done && col === "In Progress" && x ? `<div class="ds-card-bar"><i style="width:${pct}%"></i></div>` : ""}<div class="ds-card-meta">${meta}</div></article>`;
  };
  const columns = PP_COLUMNS.map((col) => {
    const list = items.filter((x) => (x.status || "Not Started") === col);
    return `<section class="in-col ds-col-${col.toLowerCase().replace(/\s+/g, "-")}" data-status="${col}"><header><span class="in-dot" style="background:${PP_COLUMN_COLOURS[col]}"></span><b>${b("columns." + col)}</b><span class="ui-count">${list.length}</span></header><div class="in-col-body">${list.map(card).join("") || `<p class="in-col-empty">${b("dropHere")}</p>`}</div></section>`;
  }).join("");
  const seg = (id, label) => `<a role="tab" aria-selected="${id === phaseFilter}" href="#/${role}/projects/${esc(p.id)}/board${id ? "?phase=" + esc(encodeURIComponent(id)) : ""}">${label}</a>`;
  const header = `<div class="dash-top"><div class="ds-board-head"><a href="#/${role}/projects/${esc(p.id)}" class="ds-board-back">${esc(p.name)}</a><h1 class="ds-ui">${b("title")}</h1><p>${b(role === "customer" ? "hintCustomer" : "hintSupplier")}</p></div><div class="in-toolbar"><select id="inPhase" aria-label="${b("phase")}" data-action="board.phase"${phases.length <= 4 ? ' class="ds-hidden"' : ""}><option value="">${b("allPhases")}</option>${phases
    .map((ph) => `<option value="${esc(ph.id)}"${ph.id === phaseFilter ? " selected" : ""}>${esc(ph.name)}</option>`)
    .join("")}</select>${
    phases.length <= 4 ? `<div class="ds-seg" role="tablist" aria-label="${b("phase")}">${seg("", b("allPhases"))}${phases.map((ph) => seg(ph.id, ppDom(String(ph.name).split(/[\s&]+/)[0]))).join("")}</div>` : ""
  }<a class="btn outline" href="#/${role}/projects/${esc(p.id)}">${b("listView")}</a></div></div>`;
  const order =
    role === "customer"
      ? `<aside class="panel in-phase-order"><div class="panel-title"><h3>${b("phaseOrder")}</h3></div><p class="subtle">${b("phaseOrderHint")}</p><ol id="inPhaseList">${phases
          .map(
            (ph, i) =>
              `<li draggable="true" data-id="${esc(ph.id)}"><span class="in-card-grip">⋮⋮</span><span class="in-phase-num">${i + 1}</span><span><b>${ppDom(ph.name)}</b><small>${esc(fmt.date(ph.startDate))} – ${esc(fmt.date(ph.dueDate))} · ${statusHtml(ph.status)}</small></span></li>`,
          )
          .join("")}</ol></aside>`
      : "";
  app.innerHTML = dashboardShell(role, "projects", ppKeys([header, `<div class="in-board-wrap ${role === "customer" ? "with-phases" : ""}"><div class="in-board">${columns}</div>${order}</div>`]));
  const content = document.querySelector(".dashboard-content");
  content?.classList.add("ds-board");
  ppBindBoard(role, p);
  if (role === "customer") ppBindPhaseOrder(p);
  // "Accepted <date>" on finished tasks with a signed acceptance report
  for (const el of content?.querySelectorAll(".ds-accepted[data-task]:not([data-task=''])") || [])
    api(`/projects/${encodeURIComponent(p.id)}/tasks/${encodeURIComponent(el.dataset.task)}/acceptance`)
      .then(({ acceptance: a }) => {
        if (a && ["accepted", "accepted_with_defects"].includes(a.result)) el.replaceChildren(t("sub.board.accepted", { date: fmt.range(String(a.createdAt).slice(0, 10)) }));
      })
      .catch(() => {});
}
for (const role of ["customer", "supplier"]) routes.add(`/${role}/projects/:id/board`, (params, query) => ppBoardPage(role, params.id, query));
actions.on("board.phase", (el) => navigate(`/${ppBoard.role}/projects/${ppBoard.project.id}/board${el.value ? "?phase=" + encodeURIComponent(el.value) : ""}`));

// Drag a card to another column, or move it with the arrow keys
function ppBindBoard(role, p) {
  let dragged = null;
  document.querySelectorAll(".in-card[draggable=true]").forEach((card) => {
    card.addEventListener("dragstart", (e) => {
      dragged = card;
      card.classList.add("ui-dragging");
      e.dataTransfer.effectAllowed = "move";
      e.dataTransfer.setData("text/plain", card.dataset.task || card.dataset.phase);
    });
    card.addEventListener("dragend", () => {
      card.classList.remove("ui-dragging");
      document.querySelectorAll(".in-col.over").forEach((c) => c.classList.remove("over"));
    });
    card.addEventListener("keydown", (e) => {
      if (!["ArrowLeft", "ArrowRight"].includes(e.key)) return;
      const next = PP_COLUMNS[PP_COLUMNS.indexOf(card.closest(".in-col").dataset.status) + (e.key === "ArrowRight" ? 1 : -1)];
      if (next) ppMoveCard(p, card, next);
    });
  });
  document.querySelectorAll(".in-col").forEach((col) => {
    col.addEventListener("dragover", (e) => {
      if (!dragged) return;
      e.preventDefault();
      col.classList.add("over");
    });
    col.addEventListener("dragleave", (e) => {
      if (!col.contains(e.relatedTarget)) col.classList.remove("over");
    });
    col.addEventListener("drop", (e) => {
      e.preventDefault();
      col.classList.remove("over");
      if (dragged && dragged.closest(".in-col") !== col) ppMoveCard(p, dragged, col.dataset.status);
      dragged = null;
    });
  });
}
async function ppMoveCard(p, card, status) {
  const from = card.closest(".in-col"),
    to = document.querySelector(`.in-col[data-status="${status}"] .in-col-body`);
  to.querySelector(".in-col-empty")?.remove();
  to.prepend(card);
  card.focus();
  const count = () => document.querySelectorAll(".in-col").forEach((c) => (c.querySelector("header .ui-count").textContent = c.querySelectorAll(".in-card").length));
  count();
  try {
    if (card.dataset.task)
      await api(`/projects/${p.id}/phases/${card.dataset.phase}/tasks/${card.dataset.task}`, { method: "PATCH", body: { status, ...(status === "Completed" ? { progress: 100 } : {}) } });
    else await api(`/projects/${p.id}/phases/${card.dataset.phase}`, { method: "PUT", body: { status } });
    tToast(t("sub.board.moved", { status: t("sub.board.columns." + status) }));
    if (status === "Completed") card.querySelector(".ds-card-bar i")?.style.setProperty("width", "100%");
  } catch (e) {
    from.querySelector(".in-col-body").prepend(card);
    count();
    toast(e.message, "error");
  }
}
// Drag the phases of the aside to change the delivery order
function ppBindPhaseOrder(p) {
  const list = document.getElementById("inPhaseList");
  if (!list) return;
  let dragged = null;
  list.querySelectorAll("li").forEach((li) => {
    li.addEventListener("dragstart", (e) => {
      dragged = li;
      li.classList.add("ui-dragging");
      e.dataTransfer.effectAllowed = "move";
      e.dataTransfer.setData("text/plain", li.dataset.id);
    });
    li.addEventListener("dragover", (e) => {
      if (!dragged || dragged === li) return;
      e.preventDefault();
      const r = li.getBoundingClientRect();
      list.insertBefore(dragged, (e.clientY - r.top) / r.height > 0.5 ? li.nextSibling : li);
    });
    li.addEventListener("dragend", async () => {
      li.classList.remove("ui-dragging");
      dragged = null;
      const ids = [...list.children].map((x) => x.dataset.id);
      list.querySelectorAll(".in-phase-num").forEach((n, i) => (n.textContent = i + 1));
      if (ids.join() === (p.phases || []).map((x) => x.id).join()) return;
      try {
        await api(`/projects/${p.id}/reorder`, { method: "POST", body: { phaseIds: ids } });
        p.phases = ids.map((id) => p.phases.find((x) => x.id === id));
        tToast(t("sub.board.orderSaved"));
      } catch (e) {
        toast(e.message, "error");
      }
    });
  });
}

/* ---------- Side panel for a task card ---------- */
const ppCard = (el) => el?.closest?.('.ds-board .in-card[data-ds-panel="1"]');
// A click or Enter on a card opens the side panel; ctrl/cmd/shift-click and the middle button still open the page
document.addEventListener(
  "click",
  (e) => {
    const card = ppCard(e.target);
    if (!card || e.ctrlKey || e.metaKey || e.shiftKey || e.button !== 0) return;
    e.preventDefault();
    ppOpenPanel(card);
  },
  true,
);
document.addEventListener("keydown", (e) => {
  if (e.key === "Escape" && document.querySelector(".ds-panel")) return ppClosePanel();
  const card = ppCard(e.target);
  if (card && e.key === "Enter" && e.target === card) {
    e.preventDefault();
    ppOpenPanel(card);
  }
});
window.addEventListener("hashchange", () => document.querySelector(".ds-panel") && ppClosePanel());
function ppClosePanel() {
  const card = document.querySelector(".in-card.ds-selected");
  document.querySelector(".ds-panel")?.remove();
  document.querySelector(".ds-board")?.classList.remove("ds-panel-open");
  card?.classList.remove("ds-selected");
  card?.focus();
}
function ppOpenPanel(card) {
  if (!ppBoard) return;
  const { role, project: p, suppliers } = ppBoard,
    ph = (p.phases || []).find((x) => x.id === card.dataset.phase),
    x = ph?.tasks?.find((y) => y.id === card.dataset.task);
  if (!x) return;
  document.querySelector(".ds-panel")?.remove();
  document.querySelectorAll(".in-card.ds-selected").forEach((c) => c.classList.remove("ds-selected"));
  card.classList.add("ds-selected");
  const sup = suppliers.find((s) => s.id === x.assignedSupplierId)?.company || "",
    mineSupplier = role === "supplier" && x.assignedSupplierId === state.user?.supplierId,
    canTick = role === "customer" || (mineSupplier && x.acceptanceStatus === "Accepted"),
    status = card.closest(".in-col")?.dataset.status || x.status,
    list = x.subtasks || [],
    upd = (x.progressUpdates || [])[0],
    pk2 = (key, params) => ppk("board.panel." + key, params),
    fact = (label, value) => `<div><span class="ds-ui">${label}</span><b>${value}</b></div>`;
  const panel = document.createElement("aside");
  panel.className = "ds-panel";
  panel.dataset.i18n = "keys";
  panel.setAttribute("role", "dialog");
  panel.setAttribute("aria-label", x.name);
  panel.innerHTML = `<div class="ds-panel-head"><div><span>${ppDom(ph.name)}</span><h2>${esc(x.name)}</h2></div><button type="button" class="ds-panel-close" aria-label="${pk2("close")}" data-action="board.close">×</button></div><div class="ds-panel-facts">${fact(pk2("status"), `${statusHtml(status)} · ${esc(t("sub.board.percent", { n: Number(x.progress) || 0 }))}`)}${fact(pk2("supplier"), esc(sup || "—"))}${fact(pk2("dates"), esc(fmt.range(x.startDate, x.dueDate)))}${
    role === "customer" || mineSupplier ? fact(pk2("order"), x.orderAmount ? esc(fmt.money(x.orderAmount)) : "—") : ""
  }</div>${x.description ? `<p class="ds-panel-desc" data-i18n="dom">${esc(x.description)}</p>` : ""}${
    list.length
      ? `<h3 class="ds-panel-h">${pk2("checklist", { done: list.filter((y) => y.done).length, n: list.length })}</h3><div class="ds-panel-list">${list
          .map((y, i) => `<label><input type="checkbox" data-action="board.tick" data-i="${i}"${y.done ? " checked" : ""}${canTick ? "" : " disabled"}> <span>${esc(y.name || y.text)}</span></label>`)
          .join("")}</div>`
      : ""
  }${
    upd
      ? `<h3 class="ds-panel-h">${pk2("latest")}</h3><blockquote class="ds-panel-quote"><p>“${upd.note || upd.milestone ? esc(upd.note || upd.milestone) : `${statusHtml(upd.status)} · ${esc(t("sub.board.percent", { n: upd.progress }))}`}”</p><span>${esc([upd.byName, upd.company, fmt.range(String(upd.at).slice(0, 10))].filter(Boolean).join(" · "))}</span></blockquote>`
      : ""
  }<div class="ds-panel-foot"><a class="btn secondary" href="#/${role}/messages?project=${encodeURIComponent(p.id)}&amp;phase=${encodeURIComponent(ph.id)}&amp;task=${encodeURIComponent(x.id)}">${pk2("message")}</a><a class="btn primary" href="#/${role}/projects/${encodeURIComponent(p.id)}/tasks/${encodeURIComponent(x.id)}">${pk2("openTask")}</a></div>`;
  panel.ppItem = { p, ph, x };
  document.body.append(panel);
  document.querySelector(".ds-board")?.classList.add("ds-panel-open");
  panel.querySelector(".ds-panel-close").focus();
}
actions.on("board.close", () => ppClosePanel());
// Ticking a checklist item saves the whole list of the task
actions.on("board.tick", async (box) => {
  const panel = box.closest(".ds-panel"),
    { p, ph, x } = panel.ppItem,
    next = (x.subtasks || []).map((y, i) => (i === Number(box.dataset.i) ? { ...y, done: box.checked } : y));
  box.disabled = true;
  try {
    await api(`/projects/${p.id}/phases/${ph.id}/tasks/${x.id}`, { method: "PATCH", body: { subtasks: next } });
    x.subtasks = next;
    panel.querySelector(".ds-panel-h").textContent = t("sub.board.panel.checklist", { done: next.filter((y) => y.done).length, n: next.length });
  } catch (err) {
    box.checked = !box.checked;
    toast(err.message, "error");
  } finally {
    box.disabled = false;
  }
});
