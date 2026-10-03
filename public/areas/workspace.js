/* Area: the project workspace (T128b, board Workspace). One page per project with a header, tabs (Overview,
   Tasks, Files, Messages, Invoices, Activity) and the phase and task cards, drawn in one pass with translation
   keys and data-action handlers. Before this, about ten scripts added their parts after the page was drawn
   (board button, share, more menu, task-card buttons for site reports, defects and acceptance, invitation
   notes, task time, activity log, the tabs and the overview). Project, phase and task names, descriptions,
   and server texts are data, shown as stored; statuses go through common.status (T137).
   The dialogs these buttons open (edit, add, assign, bids, share …) still come from the older files. */
const wk = (key, params) => esc(t("ws." + key, params));
const wkHtml = (key, html) => tHtml("ws." + key, html);
// <bdi> rather than <span>: the page styles target spans inside rows and titles
const wsDom = (text) => `<bdi>${esc(text)}</bdi>`;
const wsStatusClass = (s) => esc(String(s || "").toLowerCase().replaceAll(" ", "-"));
const wsUtcToday = () => new Date().toISOString().slice(0, 10);
const wsLocalToday = () => {
  const d = new Date();
  return new Date(d.getTime() - d.getTimezoneOffset() * 60000).toISOString().slice(0, 10);
};
const wsDaysBetween = (a, b) => Math.round((Date.parse(b) - Date.parse(a)) / 86400000);
const wsInitials = (name) =>
  String(name || "?")
    .split(/\s+/)
    .map((w) => w[0])
    .join("")
    .slice(0, 2)
    .toUpperCase();
// Position of a phase or task bar on the project's time line
function wsBar(p, item) {
  const start = new Date(p.startDate).getTime(),
    end = new Date(p.dueDate).getTime(),
    a = new Date(item.startDate || p.startDate).getTime(),
    b = new Date(item.dueDate || p.dueDate).getTime(),
    span = Math.max(1, end - start),
    left = Math.max(0, Math.min(100, ((a - start) / span) * 100)),
    width = Math.max(3, Math.min(100 - left, ((b - a) / span) * 100));
  return `left:${left}%;width:${width}%`;
}
const wsLastEntry = (x, status) => [...(x.assignmentHistory || [])].reverse().find((h) => !status || h.status === status);
const wsSupplierName = (t) => [...(t.assignmentHistory || [])].reverse().find((h) => h.supplierId === t.assignedSupplierId)?.company || "";
// Shortcuts into the documents, invoices and messages of the project, a phase or a task
function wsScope(role, p, ph, t) {
  const q = `project=${encodeURIComponent(p.id)}${ph ? `&phase=${encodeURIComponent(ph.id)}` : ""}${t ? `&task=${encodeURIComponent(t.id)}` : ""}`,
    back = `&back=${encodeURIComponent(`/${role}/projects/${p.id}`)}`;
  return {
    documents: `#/${role}/projects/${encodeURIComponent(p.id)}/documents${ph ? `?phase=${encodeURIComponent(ph.id)}${t ? `&task=${encodeURIComponent(t.id)}` : ""}` : ""}`,
    invoices: `#/${role}/invoices?${q}${back}`,
    messages: `#/${role}/messages?${q}${back}`,
  };
}
const wsLink = (href, cls, label) => `<a class="${cls}" href="${esc(href)}">${label}</a>`;
const wsBtn = (action, data, cls, label) =>
  `<button class="${cls}" data-action="${action}"${Object.entries(data)
    .map(([k, v]) => ` data-${k}="${esc(v)}"`)
    .join("")}>${label}</button>`;

/* ---------- Task card (also used by the phase pages) ---------- */
function wsTaskCard(p, ph, t, sups) {
  const role = state.user.role,
    s = (sups || []).find((x) => x.id === t.assignedSupplierId),
    late = t.status !== "Completed" && t.dueDate < wsUtcToday(),
    deps = (t.dependencies || []).map((x) => ph.tasks?.find((z) => z.id === x)).filter(Boolean),
    pending = t.assignedSupplierId && t.acceptanceStatus === "Pending",
    declined = !t.assignedSupplierId && t.acceptanceStatus === "Declined" ? wsLastEntry(t, "Declined") : null,
    accepted = t.assignedSupplierId && t.acceptanceStatus === "Accepted",
    ownWork = role !== "supplier" || t.assignedSupplierId === state.user.supplierId,
    ids = { project: p.id, phase: ph.id, task: t.id },
    scope = wsScope(role, p, ph, t),
    progress = Number(t.progress) || 0;
  const chip = pending
    ? `<span class="status pending">${wk(role === "supplier" ? "task.waitingAnswer" : "task.awaiting")}</span>`
    : `<span class="status ${wsStatusClass(t.status || "Not Started")}">${esc(t.status || "Not Started")}</span>`;
  let note = "";
  if (pending) {
    const invited = wsLastEntry(t, "Invited")?.at || t.invitedAt,
      company = `<b>${s ? esc(s.company) : wk("task.theSupplier")}</b>`;
    note =
      role === "customer"
        ? `<div class="inv-wait"><span>${invited ? wkHtml("task.sentOn", { company, date: esc(fmt.date(invited)) }) : wkHtml("task.sent", { company })}</span>${wsBtn("ws.withdraw", ids, "btn small outline", wk("task.withdraw"))}</div>`
        : `<div class="inv-wait"><span>${wk("task.invitedYou")}</span></div>`;
  } else if (declined) {
    const company = `<b>${declined.company ? esc(declined.company) : wk("task.theSupplier")}</b>`;
    note = `<div class="inv-wait inv-declined"><span>${declined.reason ? wkHtml("task.declinedReason", { company, reason: esc(declined.reason) }) : wkHtml("task.declined", { company })}</span></div>`;
  }
  // Acceptance report (T63)
  const a = t.acceptance,
    strip = a
      ? `<div class="ac-strip ac-${esc(a.result)}"><span class="status ${a.result === "rejected" ? "rejected" : "completed"}">${t.acceptance.result in { accepted: 1, accepted_with_defects: 1, rejected: 1 } ? wk("task.result." + a.result) : ""}</span><small>${esc(a.signerName)} · ${esc(fmt.date(a.date))}</small>${a.url ? `<a class="btn small outline" href="${esc(a.url)}" target="_blank" rel="noopener">${wk("task.acceptanceReport")}</a>` : ""}</div>`
      : "";
  const canSign = role === "customer" && ["Under Review", "Completed"].includes(t.status) && t.acceptanceStatus === "Accepted" && !["accepted", "accepted_with_defects"].includes(a?.result);
  const openDefects = (t.defects || []).filter((d) => d.status !== "verified").length;
  let buttons = "";
  if (role === "supplier" && pending) {
    // Before acceptance the supplier can only answer the invitation
    if (t.assignedSupplierId === state.user.supplierId)
      buttons =
        `<button class="btn small success" data-action="dash.answer" data-project="${esc(p.id)}" data-task="${esc(t.id)}" data-accept="true">${wk("task.accept")}</button>` +
        `<button class="btn small outline" data-action="dash.answer" data-project="${esc(p.id)}" data-task="${esc(t.id)}" data-accept="false">${wk("task.decline")}</button>`;
  } else {
    if (accepted && ownWork) buttons += wsBtn("ws.reports", ids, "btn small outline", wk("task.siteReports")) + wsBtn("ws.defects", ids, "btn small outline", `${wk("task.defects")}${openDefects ? ` <span class="pu-count" aria-label="${wk("task.defectsOpen", { n: openDefects })}">${openDefects}</span>` : ""}`);
    if (canSign) buttons += wsBtn("ws.acceptWork", ids, "btn small primary", wk("task.acceptWork"));
    if (role === "customer")
      buttons +=
        wsBtn("ws.editTask", ids, "btn small outline", wk("task.edit")) +
        wsBtn("ws.assign", ids, "btn small outline", wk(s ? "task.changeSupplier" : "task.selectSupplier")) +
        wsBtn("ws.bid", ids, "btn small primary", wk(t.offers?.length ? "task.compareBids" : "task.requestBids"));
    else
      buttons +=
        wsBtn("ws.progress", { ...ids, progress }, "btn small outline", wk("task.updateProgress")) + wsBtn("ws.offer", ids, "btn small primary", wk("task.submitOffer"));
    buttons +=
      wsLink(scope.documents, "btn small outline", wk("task.documents")) + wsLink(scope.invoices, "btn small outline", wk("task.invoices")) + wsLink(scope.messages, "btn small outline", wk("task.messages"));
  }
  return `<article class="wf-task ${late ? "wf-late" : ""}"><div class="wf-task-head"><div><div class="eyebrow">${wk("task.eyebrow")}</div><h4>${esc(t.name)}</h4><p>${t.description ? wsDom(t.description) : wk("task.noDescription")}</p></div>${chip}</div><div class="wf-task-meta"><span>${esc(fmt.date(t.startDate))} → ${esc(fmt.date(t.dueDate))}</span><span>${s ? `${esc(s.company)} · ${statusHtml(t.acceptanceStatus || "Invited")}` : wk("task.noSupplier")}</span><span>${t.orderAmount ? wk("task.order", { amount: fmt.money(t.orderAmount), n: progress }) : wk("task.orderNotSet", { n: progress })}</span></div>${note}${
    deps.length ? `<small>${wk("task.depends", { names: deps.map((x) => x.name).join(", ") })}</small>` : ""
  }${late ? `<div class="notice order-warning">${wk("task.overdue")}</div>` : ""}${strip}<div class="wf-task-actions">${buttons}</div>${
    t.assignmentHistory?.length
      ? `<details><summary>${wk("task.history", { n: t.assignmentHistory.length })}</summary>${t.assignmentHistory.map((x) => `<div class="history-row"><span>${esc(x.company)}</span>${statusHtml(x.status)}<small>${esc(fmt.date(x.at))}</small></div>`).join("")}</details>`
      : ""
  }</article>`;
}

/* ---------- Phase card ---------- */
function wsPhaseCard(p, ph, i, sups, docs) {
  const role = state.user.role,
    tasks = ph.tasks || [],
    late = tasks.some((x) => x.status !== "Completed" && x.dueDate < wsUtcToday()),
    ids = { project: p.id, phase: ph.id },
    deps = (ph.dependencies || []).map((id) => p.phases.find((x) => x.id === id)?.name).filter(Boolean);
  return `<section class="wf-phase"><div class="wf-phase-head"><div class="wf-phase-title"><span class="phase-dot ${ph.status === "Completed" ? "done" : ph.status === "In Progress" ? "active" : ""}">${i + 1}</span><div><h3>${wsDom(ph.name)}</h3><p>${ph.description ? wsDom(ph.description) : wk("phase.noScope")}</p><span class="status ${wsStatusClass(ph.status)}">${esc(ph.status)}</span></div></div><div class="cc-actions">${wsBtn("ws.editPhase", ids, "btn small outline", wk("phase.edit"))}${wsBtn("ws.addTask", ids, "btn small primary", wk("phase.addTask"))}</div></div><div class="phase-timeline-bar"><span>${esc(fmt.date(ph.startDate))}</span><div class="gantt-track"><i class="${ph.status === "Completed" ? "done" : ""}" style="${wsBar(p, ph)}"></i></div><span>${esc(fmt.date(ph.dueDate))}</span></div>${
    late ? `<div class="notice order-warning">${wk("phase.warning")}</div>` : ""
  }${deps.length ? `<small>${wkHtml("phase.depends", { names: deps.map(wsDom).join(", ") })}</small>` : ""}<div class="wf-task-list">${tasks.map((x) => wsTaskCard(p, ph, x, sups)).join("") || `<div class="empty">${wk("phase.noTasks")}</div>`}</div><div class="wf-phase-footer"><span>${wk("phase.footer", {
    n: tasks.length,
    done: tasks.filter((x) => x.status === "Completed").length,
    docs: docs.filter((d) => d.phaseId === ph.id).length,
  })}</span>${wsLink(wsScope(role, p, ph).documents, "btn small outline", wk("phase.documents"))}</div></section>`;
}

/* ---------- Overview: up next, phases, progress, budget, suppliers (T98) ---------- */
function wsUpNext(role, d) {
  const today = wsLocalToday(),
    p = d.project,
    tasks = (p.phases || []).flatMap((ph) => (ph.tasks || []).map((x) => ({ ph, t: x }))),
    rows = [],
    row = (tone, title, sub, href, label, primary) =>
      rows.push(
        `<div class="ds-next-row"><span class="ds-next-dot ds-dot-${tone}"></span><div class="ds-next-text"><b>${title}</b>${sub ? `<span>${sub}</span>` : ""}</div><a class="btn small ${primary ? "primary" : "secondary"}" href="#${esc(href)}">${label}</a></div>`,
      ),
    taskLink = (x) => `/${role}/projects/${p.id}/tasks/${x.id}`,
    isLate = ({ t: x }) => x.status !== "Completed" && x.dueDate && x.dueDate < today,
    lateTitle = (x) => esc(t.plural("ws.next.late", Math.max(1, wsDaysBetween(x.dueDate, today)), { task: x.name }));
  if (role === "customer") {
    for (const i of d.invoices.filter((i) => i.status === "Submitted"))
      row("blue", wk("next.invoice", { number: invNo(i), amount: fmt.money(i.amount) }), esc(i.supplierCompany || i.taskName || ""), `/customer/invoice/${i.id}`, wk("next.review"), true);
    const pending = d.entries.filter((e) => e.status === "Pending approval");
    if (pending.length) {
      const hours = pending.reduce((a, e) => a + Number(e.hours || 0), 0);
      row("blue", esc(t.plural("ws.next.time", pending.length)), wk("next.hours", { n: fmt.number(hours, hours % 1 ? 1 : 0) }), "/customer/time", wk("next.review"), true);
    }
    for (const { t: x } of tasks.filter(({ t: x }) => x.acceptanceStatus === "Pending"))
      row("orange", wk("next.waiting", { task: x.name, supplier: wsSupplierName(x) || t("ws.next.theSupplier") }), wk("next.noAnswer"), taskLink(x), wk("next.open"));
    const docs = d.documents.filter((x) => x.status === "Pending approval").length;
    if (docs) row("orange", esc(t.plural("ws.next.docs", docs)), "", `/customer/projects/${p.id}/documents`, wk("next.review"));
    for (const { t: x } of tasks.filter(isLate)) row("red", lateTitle(x), esc(wsSupplierName(x)), taskLink(x), wk("next.open"));
  } else {
    const sid = state.user.supplierId;
    for (const { ph, t: x } of tasks.filter(({ t: x }) => x.assignedSupplierId === sid && x.acceptanceStatus === "Pending"))
      row("orange", wk("next.invitation", { task: x.name }), wsDom(ph.name), `/supplier/projects?invite=${x.id}`, wk("next.respond"), true);
    for (const { ph, t: x } of tasks.filter((y) => y.t.assignedSupplierId === sid && isLate(y))) row("red", lateTitle(x), wsDom(ph.name), taskLink(x), wk("next.open"));
    for (const i of d.invoices.filter((i) => i.status === "Changes Requested"))
      row("orange", wk("next.changes", { number: invNo(i) }), i.comments ? wsDom(i.comments) : "", `/supplier/invoice/${i.id}`, wk("next.fix"), true);
  }
  return rows.length ? rows.join("") : `<p class="ds-next-none">${wk("next.none")}</p>`;
}
function wsPhaseRows(d) {
  const today = wsLocalToday();
  return (d.project.phases || [])
    .map((ph) => {
      const tasks = ph.tasks || [],
        done = tasks.filter((x) => x.status === "Completed").length,
        late = tasks.filter((x) => x.status !== "Completed" && x.dueDate && x.dueDate < today).length,
        pct = tasks.length ? Math.round(tasks.reduce((a, x) => a + Number(x.status === "Completed" ? 100 : x.progress || 0), 0) / tasks.length) : 0,
        finished = ph.status === "Completed" || (tasks.length && done === tasks.length),
        colour = finished ? "var(--cc-green)" : late ? "var(--cc-orange)" : "var(--cc-blue)",
        count = t.plural("ws.phases.tasks", tasks.length, { done });
      return `<div class="ds-phase-row"><div class="ds-phase-name"><b>${wsDom(ph.name)}</b><span>${esc(late ? t("ws.phases.late", { text: count, n: late }) : count)}</span></div><div class="ds-bar"><i style="width:${finished ? 100 : pct}%;background:${colour}"></i></div><span class="ds-phase-end${finished ? " ds-green ds-ui" : ""}">${finished ? wk("phases.done") : ph.dueDate ? esc(fmt.range(ph.dueDate)) : ""}</span></div>`;
    })
    .join("");
}
function wsSide(role, d) {
  const p = d.project,
    today = wsLocalToday(),
    tasks = (p.phases || []).flatMap((ph) => ph.tasks || []),
    mine = role === "supplier" ? tasks.filter((x) => x.assignedSupplierId === state.user.supplierId) : tasks,
    pct = mine.length ? Math.round(mine.reduce((a, x) => a + Number(x.status === "Completed" ? 100 : x.progress || 0), 0) / mine.length) : 0,
    left = p.dueDate ? wsDaysBetween(today, p.dueDate) : null,
    C = 2 * Math.PI * 36,
    ring = `<svg class="ds-ring" viewBox="0 0 84 84" aria-hidden="true"><circle cx="42" cy="42" r="36" fill="none" stroke="#F0F0F2" stroke-width="9"/>${pct > 0 ? `<circle cx="42" cy="42" r="36" fill="none" stroke="#2563EB" stroke-width="9" stroke-linecap="round" stroke-dasharray="${(C * pct) / 100} ${C}" transform="rotate(-90 42 42)"/>` : ""}</svg>`,
    late = mine.filter((x) => x.status !== "Completed" && x.dueDate && x.dueDate < today).length,
    open = mine.filter((x) => x.status !== "Completed").length,
    invoiced = d.invoices.filter((i) => !["Rejected", "Draft"].includes(i.status)).reduce((a, i) => a + Number(i.amount || 0), 0),
    ordered = mine.filter((x) => ["Accepted", "Pending"].includes(x.acceptanceStatus)).reduce((a, x) => a + Number(x.orderAmount || 0), 0),
    pendingDocs = d.documents.filter((x) => x.status === "Pending approval").length;
  // The facts of the four summary cards, which have no other place on this tab
  const facts = [
    p.startDate || p.dueDate ? fmt.range(p.startDate, p.dueDate) : "",
    t("ws.side.tasksComplete", { done: mine.length - open, total: mine.length }),
    t("ws.side.overdueOpen", { late, open }),
    role === "customer" && p.budget ? t("ws.side.budgetLeft", { remaining: fmt.money(Math.max(0, p.budget - invoiced)), invoiced: fmt.money(invoiced) }) : "",
    t("ws.side.docs", { n: d.documents.length, pending: pendingDocs }),
    t.plural("ws.side.invoices", d.invoices.length),
    role === "customer" ? t("ws.side.available", { n: (d.suppliers || []).length }) : "",
  ].filter(Boolean);
  const when = left === null ? t("ws.side.complete") : left >= 0 ? t.plural("ws.side.left", left) : t.plural("ws.side.over", -left);
  let html = `<h2 class="ds-dash-h ds-ui">${wk("side.progress")}</h2><section class="ds-card ds-progress"><div class="ds-progress-top">${ring}<div><b>${wk("side.percent", { n: pct })}</b><span>${esc(when)}</span></div></div><p class="ds-facts-line">${facts.map((f) => `<span>${esc(f)}</span>`).join("")}</p></section>`;
  const legend = (amount, key) => `<span><b>${esc(fmt.compact(amount))}</b>${wk(key)}</span>`;
  if (role === "customer") {
    const budget = Number(p.budget || 0),
      w = (n) => (budget ? Math.min(100, (n / budget) * 100) : 0),
      orderedOnly = Math.max(0, ordered - invoiced),
      free = Math.max(0, budget - invoiced - orderedOnly);
    html += `<section class="ds-card ds-budget"><div class="ds-budget-head"><h3 class="ds-ui">${wk("side.budget")}</h3><b>${esc(fmt.money(budget))}</b></div><div class="ds-budget-bar"><i style="width:${w(invoiced)}%;background:#2563EB"></i><i style="width:${w(orderedOnly)}%;background:#A8C4F7"></i></div><div class="ds-budget-legend ds-ui">${legend(invoiced, "side.invoiced")}${legend(orderedOnly, "side.ordered")}${legend(free, "side.free")}</div></section>`;
    const bySupplier = new Map(),
      rank = { Late: 4, Invited: 3, Working: 2, Done: 1 };
    for (const x of tasks.filter((y) => y.assignedSupplierId)) {
      const name = wsSupplierName(x) || x.assignedSupplierId,
        st = x.acceptanceStatus === "Pending" ? "Invited" : x.status === "Completed" ? "Done" : x.dueDate && x.dueDate < today ? "Late" : "Working",
        cur = bySupplier.get(name);
      if (!cur || rank[st] > rank[cur]) bySupplier.set(name, st);
    }
    const tone = { Working: "green", Late: "red", Invited: "orange", Done: "grey" };
    html += `<section class="ds-card ds-suppliers"><h3 class="ds-ui">${wk("side.suppliers")}</h3>${
      [...bySupplier]
        .map(
          ([name, st]) =>
            `<div class="ds-supplier-row"><span class="ds-avatar ds-tint-${tone[st] === "red" ? "orange" : "blue"}">${esc(wsInitials(name))}</span><span class="ds-supplier-name">${esc(name)}</span><span class="status" data-ds-fixed data-ds-tone="${tone[st]}">${wk("side.state." + st)}</span></div>`,
        )
        .join("") || `<p class="ds-next-none">${wk("side.noSupplier")}</p>`
    }</section>`;
  } else
    html += `<section class="ds-card ds-budget"><div class="ds-budget-head"><h3 class="ds-ui">${wk("side.orderValue")}</h3><b>${esc(fmt.money(ordered))}</b></div><div class="ds-budget-bar"><i style="width:${ordered ? Math.min(100, (invoiced / ordered) * 100) : 0}%;background:#2563EB"></i></div><div class="ds-budget-legend ds-two ds-ui">${legend(invoiced, "side.invoicedByYou")}${legend(Math.max(0, ordered - invoiced), "side.toInvoice")}</div></section>`;
  return html;
}

/* ---------- The page ---------- */
const WS_TAB = {}; // remembered tab per project (in memory)
async function wsPage(role, pid, query) {
  const enc = encodeURIComponent(pid);
  const [d, docs, all, time, activity, counts] = await Promise.all([
    api("/projects/" + enc),
    api(`/projects/${enc}/documents`).catch(() => ({ documents: [] })),
    api("/invoices").catch(() => ({})),
    api("/time-entries?projectId=" + enc).catch(() => ({ entries: [] })),
    api(`/projects/${enc}/activity`).catch(() => ({})),
    api("/nav-counts?project=" + enc).catch(() => ({})),
  ]);
  const p = d.project,
    documents = docs.documents || [],
    entries = time.entries || [],
    sups = d.suppliers || [],
    projectInvoices = d.invoices || [],
    invoices = (all.invoices || []).filter((i) => i.projectId === p.id),
    customer = role === "customer",
    sid = state.user.supplierId;
  const reviews = customer && p.status === "Completed" ? await api(`/projects/${enc}/reviews`).catch(() => ({})) : null;
  const allTasks = p.phases.flatMap((ph) => ph.tasks || []),
    completed = allTasks.filter((x) => x.status === "Completed").length,
    late = allTasks.filter((x) => x.status !== "Completed" && x.dueDate < wsUtcToday()),
    open = allTasks.filter((x) => x.status !== "Completed").length,
    pendingDocs = documents.filter((x) => x.status === "Pending approval").length,
    spent = projectInvoices.filter((i) => !["Rejected", "Changes Requested"].includes(i.status)).reduce((a, i) => a + Number(i.amount || 0), 0),
    done = allTasks.length ? Math.round((completed / allTasks.length) * 100) : 0,
    own = p.phases.flatMap((ph) => (ph.tasks || []).map((x) => ({ ph, t: x }))).filter((x) => x.t.assignedSupplierId === sid),
    invitedOnly = !customer && p.involvement === "invited",
    scope = wsScope(role, p),
    ids = { project: p.id };
  const duePhaseIds = new Set(p.phases.filter((ph) => late.length && ph.status !== "Completed").flatMap((ph) => p.phases.filter((next) => (next.dependencies || []).includes(ph.id)).map((next) => next.id)));

  // Header: customer, dates, name, status, description, actions
  const company = customer ? state.user.company : p.customerCompany,
    meta = [company, p.startDate || p.dueDate ? fmt.range(p.startDate, p.dueDate) : ""].filter(Boolean).join(" · ");
  const actions = [
    wsLink(`#/${role}/projects/${p.id}/board`, "btn outline in-board-btn", wk("head.board")),
    customer && !invitedOnly ? wsBtn("ws.share", ids, "btn outline ds-share", wk("head.share")) : "",
    invitedOnly ? "" : wsLink(`#/${role}/offers?project=${encodeURIComponent(p.id)}`, "btn outline", wk("head.compareOffers")),
    customer ? wsBtn("ws.edit", ids, "btn outline", wk("head.edit")) : "",
    wsBtn("ws.support", ids, "btn outline", wk("head.support")),
    customer
      ? `<details class="sa-more"><summary class="btn outline" aria-label="${wk("head.more")}">⋯</summary><div class="sa-more-list" role="menu"><button type="button" role="menuitem" class="sa-danger" data-action="ws.delete" data-project="${esc(p.id)}">${wk("head.delete")}</button></div></details>`
      : "",
    customer && invoices.some((i) => i.status === "Submitted") ? wsLink(`#/customer/invoices?project=${encodeURIComponent(p.id)}`, "btn primary ds-review-invoices", wk("head.reviewInvoices")) : "",
  ].join("");
  const header = `<div class="dash-top"><div class="ds-ws-head"><span class="ds-ws-meta">${esc(meta)}</span><div class="ds-ws-title"><h1>${esc(p.name)}</h1><span class="status">${esc(p.status || "")}</span></div>${p.description ? `<p>${esc(p.description)}</p>` : ""}</div><div class="cc-actions">${actions}</div></div>`;

  // The four summary cards: hidden on the tabbed page (their facts are under the progress ring)
  const stat = (label, value, small) => `<div class="cc-card"><span class="cc-label">${label}</span><b>${value}</b><small>${small}</small></div>`;
  const ownInvoiced = projectInvoices.filter((i) => !["Rejected", "Changes Requested"].includes(i.status)).reduce((a, i) => a + Number(i.amount || 0), 0);
  const stats = `<div class="wf-stat-grid${invitedOnly ? "" : " ds-hidden"}">${
    customer
      ? stat(wk("stats.budget"), esc(fmt.money(p.budget)), wk("stats.remaining", { remaining: fmt.money(Math.max(0, p.budget - spent)), invoiced: fmt.money(spent) }))
      : stat(wk("stats.orderValue"), esc(fmt.money(own.reduce((a, x) => a + (Number(x.t.orderAmount) || 0), 0))), wk("stats.invoicedByYou", { amount: fmt.money(ownInvoiced) }))
  }${stat(wk("stats.schedule"), `${esc(fmt.date(p.startDate))} → ${esc(fmt.date(p.dueDate))}`, wk("stats.overdueOpen", { late: late.length, open }))}${stat(wk("stats.delivery"), wk("stats.complete", { n: done }), wk("stats.tasksComplete", { done: completed, total: allTasks.length }))}${stat(
    wk("stats.desk"),
    wk("stats.deskDocs", { docs: documents.length, approvals: pendingDocs }),
    customer ? wk("stats.deskInvoices", { invoices: projectInvoices.length, suppliers: sups.length }) : wk("stats.invoicesFromYou", { n: projectInvoices.length }),
  )}</div>`;

  // A supplier who is only invited answers first
  const pending = own.filter((x) => x.t.acceptanceStatus === "Pending");
  const invited = invitedOnly
    ? `<div class="inv-wait"><span>${pending.length === 1 ? wk("invited.one") : wk("invited.many", { n: pending.length })}</span><span class="cc-actions">${pending
        .map(
          (x) =>
            `<button class="btn small primary" data-action="dash.answer" data-project="${esc(p.id)}" data-task="${esc(x.t.id)}" data-accept="true">${pending.length > 1 ? wk("invited.acceptNamed", { name: x.t.name }) : wk("invited.acceptTask")}</button><button class="btn small outline" data-action="dash.answer" data-project="${esc(p.id)}" data-task="${esc(x.t.id)}" data-accept="false">${wk("invited.decline")}</button>`,
        )
        .join("")}</span></div>`
    : "";
  const lateNotice = late.length ? `<div class="notice order-warning">${wk("lateNotice", { n: late.length })}</div>` : "";

  // Tasks tab: schedule, task time, phases with their tasks
  const gantt = `<section class="panel project-timeline"><div class="panel-title"><div><h3>${wk("gantt.title")}</h3><small>${wk("gantt.hint")}</small></div><span>${wk("gantt.complete", { n: done })}</span></div><div class="wf-gantt-head"><span>${wk("gantt.item")}</span><span>${wk("gantt.schedule")}</span><span>${wk("gantt.owner")}</span></div>${p.phases
    .map(
      (ph, i) =>
        `<div class="wf-gantt-phase"><b>${i + 1}. ${wsDom(ph.name)}</b><span>${esc(fmt.date(ph.startDate))} → ${esc(fmt.date(ph.dueDate))}</span><span>${statusHtml(ph.status)}${duePhaseIds.has(ph.id) ? ` · ${wk("gantt.risk")}` : ""}</span></div>${(ph.tasks || [])
          .map(
            (x) =>
              `<div class="wf-gantt-task"><span>${esc(x.name)}</span><div class="gantt-track"><i class="${x.status === "Completed" ? "done" : x.dueDate < wsUtcToday() ? "late" : ""}" style="${wsBar(p, x)}"></i></div><span>${wk("gantt.due", { date: fmt.date(x.dueDate), n: Number(x.progress) || 0 })}</span></div>`,
          )
          .join("")}`,
    )
    .join("")}</section>`;
  const timeRows = p.phases
    .flatMap((ph) => (ph.tasks || []).map((x) => ({ ph, t: x })))
    .map(({ ph, t: x }) => {
      const approved = entries.filter((e) => e.taskId === x.id && e.status === "Approved"),
        hours = fmt.number(approved.reduce((n, e) => n + Number(e.hours || 0), 0), 1),
        est = Number(x.estimatedHours || 0);
      return `<a class="ff-task-time-row" href="#/${role}/projects/${esc(p.id)}/tasks/${esc(x.id)}"><span><b>${esc(x.name)}</b><small>${wsDom(ph.name)} · ${statusHtml(x.status || "Not started")}</small></span><span>${est ? wk("time.estimate", { n: hours, est }) : wk("time.hours", { n: hours })}</span><span>${esc(fmt.money(approved.reduce((n, e) => n + Number(e.amount || 0), 0)))}</span></a>`;
    })
    .join("");
  const taskTime = `<details class="ff-task-time-details"><summary><span>${wk("time.title")}</span><small>${wk("time.hint", { n: allTasks.length })}</small><span class="ff-details-chevron">⌄</span></summary><div class="ff-task-time-table"><div class="ff-task-time-head"><span>${wk("time.task")}</span><span>${wk("time.approved")}</span><span>${wk("time.value")}</span></div>${timeRows || `<p class="subtle">${wk("time.none")}</p>`}</div></details>`;
  const phasePanel = `<section class="panel project-task-panel"><div class="panel-title"><div><h3>${wk("panel.title")}</h3><small>${wk(customer ? "panel.hint" : "panel.supplierHint")}</small></div>${customer ? wsBtn("ws.addPhase", ids, "btn small primary", wk("panel.addPhase")) : ""}</div><div>${
    p.phases.map((ph, i) => wsPhaseCard(p, ph, i, sups, documents)).join("") || `<div class="empty">${wk("panel.empty")}</div>`
  }</div><div class="action-row"><button class="btn success" data-action="ws.complete" data-project="${esc(p.id)}"${p.phases.length && p.phases.every((x) => x.status === "Completed") ? "" : " disabled"}>${wk("panel.complete")}</button></div></section>`;

  // Activity tab; supplier reviews once the project is completed
  const log = activity.entries || [];
  const activityPanel = `<details class="panel pa-project-activity"><summary><h3>${wk("activity.title")}</h3><small>${wk("activity.count", { n: log.length })}</small></summary>${
    log
      .slice(0, 60)
      .map(
        (e) =>
          `<div class="pa-row"><span><b>${wsDom(e.action)}</b><small>${esc(e.actorName)} · ${esc(new Date(e.at).toLocaleString(fmt.locale(), { day: "2-digit", month: "short", hour: "2-digit", minute: "2-digit" }))}${e.status ? " · " + statusHtml(e.status) : ""}</small></span></div>`,
      )
      .join("") || `<p class="pa-empty">${wk("activity.empty")}</p>`
  }</details>`;
  let reviewPanel = "";
  if (reviews) {
    const list = reviews.suppliers || [],
      waiting = list.filter((s) => !s.review);
    reviewPanel = `<section class="panel pa-review-panel"><div class="panel-title"><h3>${wk("reviews.title")}</h3>${waiting.length ? wsBtn("ws.reviewSuppliers", ids, "btn small primary", wk("reviews.review", { n: waiting.length })) : ""}</div>${
      list
        .map(
          (s) =>
            `<div class="pa-row"><span><b>${esc(s.company)}</b><small>${s.review ? `★ ${esc(s.review.rating)} · ${esc(s.review.text)}` : wk("reviews.notReviewed")}</small></span>${s.review ? `<span class="status completed">${wk("reviews.reviewed")}</span>` : `<span class="status submitted">${wk("reviews.pending")}</span>`}</div>`,
        )
        .join("") || `<p class="pa-empty">${wk("reviews.none")}</p>`
    }<p class="pa-note">${wk("reviews.closed", { date: fmt.date(p.completedAt) })}</p></section>`;
  }

  const breadcrumb = `<div class="breadcrumb"><a href="#/${role}/projects">${wk("projects")}</a> / ${esc(p.name)}</div>`;
  let sections;
  if (invitedOnly) sections = [breadcrumb, header, invited, stats, lateNotice, gantt, taskTime, phasePanel, reviewPanel, activityPanel];
  else {
    const tab = query.get("tab") || WS_TAB[p.id] || "overview",
      tabBtn = (key) => `<button type="button" role="tab" data-tab="${key}" data-action="ws.tab" aria-selected="${key === tab}" tabindex="${key === tab ? 0 : -1}">${wk("tabs." + key)}</button>`,
      tabLink = (href, label) => `<a class="ds-ws-link" href="${esc(href)}" role="tab" aria-selected="false" tabindex="-1">${label}</a>`,
      unread = Number(counts?.counts?.projectMessages) || 0,
      pane = (key, html) => `<div class="ds-ws-pane ds-ws-${key}" data-tab="${key}"${key === tab ? "" : " hidden"}>${html}</div>`;
    const tabs = `<div class="ds-ws-tabs ds-ui" role="tablist" aria-label="${wk("tabs.label")}" data-key="ws.tabkey" data-key-on="ArrowLeft,ArrowRight">${tabBtn("overview")}${tabBtn("tasks")}${tabLink(scope.documents, wk("tabs.files", { n: documents.length }))}${tabLink(
      `#/${role}/messages?project=${encodeURIComponent(p.id)}&back=${encodeURIComponent(`/${role}/projects/${p.id}`)}`,
      unread > 0 ? wk("tabs.messagesCount", { n: unread }) : wk("tabs.messages"),
    )}${tabLink(`#/${role}/invoices?project=${encodeURIComponent(p.id)}&back=${encodeURIComponent(`/${role}/projects/${p.id}`)}`, wk("tabs.invoices"))}${tabBtn("activity")}</div>`;
    const overview = `<div class="ds-dash-cols ds-ws-cols"><div class="ds-dash-main"><h2 class="ds-dash-h ds-ui">${wk("next.title")}</h2><div class="ds-card ds-next">${wsUpNext(role, { project: p, invoices, entries, documents })}</div><h2 class="ds-dash-h ds-ui ds-gap">${wk("phases.title")}</h2><div class="ds-card ds-phases">${
      wsPhaseRows({ project: p }) || `<p class="ds-next-none">${wk("phases.none")}</p>`
    }</div></div><div class="ds-dash-side">${wsSide(role, { project: p, invoices, documents, suppliers: sups })}</div></div>`;
    sections = [breadcrumb, header, tabs, stats, pane("overview", overview + lateNotice + reviewPanel), pane("tasks", gantt + taskTime + phasePanel), pane("activity", activityPanel)];
  }
  app.innerHTML = dashboardShell(role, "projects", sections.filter(Boolean).join(""));
}
// Older dialogs re-render the project after a change: draw the current page again (the tab is remembered)
async function projectDetail() {
  return route();
}

routes.add("/customer/projects/:id", (params, query) => wsPage("customer", params.id, query));
routes.add("/supplier/projects/:id", (params, query) => wsPage("supplier", params.id, query));

/* ---------- Actions ---------- */
function wsShowTab(content, tab) {
  const pid = location.hash.match(/^#\/(?:customer|supplier)\/projects\/([^/?]+)/)?.[1];
  if (pid) WS_TAB[decodeURIComponent(pid)] = tab;
  content.querySelectorAll(":scope > .ds-ws-pane").forEach((p) => (p.hidden = p.dataset.tab !== tab));
  content.querySelectorAll(".ds-ws-tabs [data-tab]").forEach((b) => {
    const on = b.dataset.tab === tab;
    b.setAttribute("aria-selected", String(on));
    b.tabIndex = on ? 0 : -1;
  });
}
actions.on("ws.tab", (el) => wsShowTab(el.closest(".dashboard-content"), el.dataset.tab));
// Arrow keys move between the tabs
actions.on("ws.tabkey", (el, event) => {
  const tabs = [...el.querySelectorAll('[role="tab"]')],
    i = tabs.indexOf(document.activeElement);
  if (i < 0) return;
  event.preventDefault();
  tabs[(i + (event.key === "ArrowRight" ? 1 : tabs.length - 1)) % tabs.length].focus();
});
const wsData = (el) => el.dataset;
actions.on("ws.share", (el) => pdShare(wsData(el).project));
actions.on("ws.edit", (el) => pdEditProject(wsData(el).project));
actions.on("ws.support", (el) => pdSupport(wsData(el).project));
actions.on("ws.delete", (el) => {
  el.closest("details").open = false;
  return pdDeleteProject(wsData(el).project);
});
actions.on("ws.addPhase", (el) => pdAddPhase(wsData(el).project));
actions.on("ws.complete", (el) => pdComplete(wsData(el).project));
actions.on("ws.reviewSuppliers", (el) => pdReviewSuppliers(wsData(el).project));
actions.on("ws.editPhase", (el) => pdEditPhase(wsData(el).project, wsData(el).phase));
actions.on("ws.addTask", (el) => pdAddTask(wsData(el).project, wsData(el).phase));
actions.on("ws.editTask", (el) => pdEditTask(wsData(el).project, wsData(el).phase, wsData(el).task));
actions.on("ws.assign", (el) => pdAssign(wsData(el).project, wsData(el).task));
actions.on("ws.bid", (el) => wfCreateBid(wsData(el).project, wsData(el).phase, wsData(el).task));
actions.on("ws.progress", (el) => pdProgress(wsData(el).project, wsData(el).phase, wsData(el).task, Number(wsData(el).progress)));
actions.on("ws.offer", (el) => wfSupplierBid(wsData(el).project, wsData(el).phase, wsData(el).task));
actions.on("ws.withdraw", (el) => pdWithdraw(wsData(el).project, wsData(el).task));
actions.on("ws.reports", (el) => drOpen(wsData(el).project, wsData(el).task));
actions.on("ws.defects", (el) => puOpen(wsData(el).project, wsData(el).task));
actions.on("ws.acceptWork", (el) => acOpen(wsData(el).project, wsData(el).task));
