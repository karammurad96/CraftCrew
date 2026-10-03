/* Area: the three dashboards (T127b). Each one is drawn in one pass with translation keys: the greeting and the
   decision list (T95–T97), the side cards, the statistics, the attention panels, the lists below and, for
   suppliers, the phone "Today" block (T102). Before this, seven scripts re-rendered and re-arranged each dashboard
   after it was drawn. Stored data and server messages (names, action-queue texts, statuses) keep the old
   translation for display (data-i18n="dom"). The getting-started checklist and the layout editor still add
   themselves after the render; every section and card carries its layout key, so saved layouts keep working. */
const dk = (key, params) => esc(t("dash." + key, params));
// Stored data and server texts: the old DOM translation still handles them
const dashDom = (text) => `<span data-i18n="dom">${esc(text)}</span>`;
const dashStatus = (s) => `<span class="status ${esc(String(s || "").toLowerCase().replaceAll(" ", "-"))}" data-i18n="dom">${esc(s)}</span>`;
const dashIso = (d) => new Date(d.getTime() - d.getTimezoneOffset() * 60000).toISOString().slice(0, 10);
const dashToday = () => dashIso(new Date());
const dashUtcToday = () => new Date().toISOString().slice(0, 10);
const dashDaysFrom = (n) => new Date(Date.now() + n * 86400000).toISOString().slice(0, 10);
const dashTime = (d) => (d ? new Date(d).toLocaleString(fmt.locale(), { day: "2-digit", month: "short", hour: "2-digit", minute: "2-digit" }) : "—");
const dashKicker = () => new Date().toLocaleDateString(fmt.locale(), { weekday: "long", day: "numeric", month: "long" });
// A team member only sees shortcuts into areas they may open; "+ New project" needs full project rights.
function dashCan(to) {
  if (!state.user?.isMember || typeof TM_NAV === "undefined" || typeof tmLevel !== "function") return true;
  const [, role, page] = to.split("/"),
    area = TM_NAV[role]?.[page];
  if (/\/projects\/new$/.test(to)) return tmLevel("projects") === "full";
  return !area || tmLevel(area) !== "none";
}
const dashBtn = (to, label, cls = "btn primary") => (dashCan(to) ? `<a class="${cls}" href="#${esc(to)}">${label}</a>` : "");

/* ---------- Header: kicker, greeting, one line (T95) ---------- */
function dashGreeting(name) {
  const h = new Date().getHours(),
    part = h < 12 ? "morning" : h < 18 ? "afternoon" : "evening",
    first = String(name || "").trim().split(/\s+/)[0];
  return first ? t(`dash.greeting.${part}`, { name: first }) : t(`dash.greeting.${part}Plain`);
}
function dashDecisionLine(n) {
  return n ? (n === 1 ? t("dash.decision.one") : t("dash.decision.many", { n })) : t("dash.decision.none");
}
const dashHeader = (kicker, line, actions) =>
  `<div class="dash-top ds-dash-top"><div class="ds-dash-head"><span class="ds-dash-kicker">${esc(kicker)}</span><h1>${esc(dashGreeting(state.user?.name))}</h1><p>${esc(line)}</p></div><div class="cc-actions dash-actions">${actions}</div></div>`;

/* ---------- Decision list (action queue) ---------- */
const DASH_ICON_PATHS = {
  invoice: '<path d="M7 3h10v18l-3-2-2 2-2-2-3 2z"/><path d="M10 8h4M10 12h4"/>',
  document: '<path d="M7 3h7l4 4v14H7z"/><path d="M14 3v4h4M10 12h5M10 16h5"/>',
  offer: '<path d="M6 20V11M12 20V5M18 20v-6"/>',
  time: '<circle cx="12" cy="12" r="9"/><path d="M12 7v5l3 2"/>',
  overdue: '<circle cx="12" cy="12" r="9"/><path d="M12 7v6M12 16.5v.5"/>',
  invitation: '<path d="M4 7h16v12H4z"/><path d="m4 7 8 6 8-6"/>',
  bid: '<path d="M6 20V11M12 20V5M18 20v-6"/>',
  compliance: '<path d="M12 3 5 6v5c0 4.5 3 8 7 10 4-2 7-5.5 7-10V6z"/><path d="m9 12 2 2 4-4"/>',
  application: '<circle cx="12" cy="8" r="4"/><path d="M4 21c1-4 4-6 8-6s7 2 8 6"/>',
  dispute: '<path d="M12 3 2 20h20z"/><path d="M12 10v4M12 17v.5"/>',
  payment: '<rect x="3" y="6" width="18" height="12" rx="2"/><path d="M3 10h18"/>',
};
const DASH_TINT = { invoice: "blue", time: "blue", offer: "orange", document: "orange", overdue: "red", invitation: "orange", bid: "blue", compliance: "orange", application: "blue", dispute: "red", payment: "green" };
const dashIcon = (kind) =>
  `<span class="ds-dec-icon ds-tint-${DASH_TINT[kind] || "blue"}" aria-hidden="true"><svg viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="1.8" stroke-linecap="round" stroke-linejoin="round">${DASH_ICON_PATHS[kind] || DASH_ICON_PATHS.document}</svg></span>`;
// Labels are HTML here: either a key's text (escaped) or a server text marked for the old translation
const dashDecBtn = (label, href, grey) => `<a class="btn ${grey ? "secondary" : "primary"} ds-dec-btn" href="#${esc(href)}">${label}</a>`;
const dashRow = (kind, title, sub, link, buttons) =>
  `<div class="ds-dec-row">${dashIcon(kind)}<div class="ds-dec-text"><a class="ds-dec-title" href="#${esc(link)}">${title}</a>${sub ? `<span class="ds-dec-sub">${sub}</span>` : ""}</div><div class="ds-dec-actions">${buttons}</div></div>`;
const dashAction = (x) => (x.action ? dashDom(x.action) : dk("open"));
function dashCaughtUp(d) {
  const n = d.nextDeadline;
  return `<div class="ds-dec-empty"><b>${dk("caughtUp")}</b><span>${
    n ? tHtml("dash.nextDeadline", { link: `<a href="#${esc(n.link)}">${esc(n.name)}</a>`, project: esc(n.project), date: esc(fmt.date(n.dueDate)) }) : dk("nothingNow")
  }</span></div>`;
}
// Customer rows: invoices, offers, time and late tasks are worded here from the queue's data (T95)
function dashCustomerRow(x) {
  let title = dashDom(x.text),
    sub = x.sub ? dashDom(x.sub) : "",
    buttons = dashDecBtn(dashAction(x), x.link);
  if (x.kind === "invoice" && x.invoiceId) {
    title = dk("row.invoice", { number: x.number, amount: fmt.money(x.amount || 0) });
    sub = esc([x.supplier, x.sub].filter(Boolean).join(" · "));
    buttons = dashDecBtn(dk("row.review"), x.link, true) + `<button type="button" class="btn primary ds-dec-btn" data-action="dash.approve" data-id="${esc(x.invoiceId)}">${dk("row.approve")}</button>`;
  } else if (x.kind === "offer" && x.bidId) {
    title = esc(t.plural("dash.row.offers", x.offers, { title: x.title }));
    sub = x.best
      ? dk(x.dueDate ? "row.bestCloses" : "row.best", { amount: fmt.money(x.best.amount), supplier: x.best.supplier, date: fmt.date(x.dueDate) })
      : sub;
    buttons = dashDecBtn(dk("row.compare"), `/customer/sourcing/${x.bidId}`);
  } else if (x.kind === "time" && x.entries) {
    const hours = Math.round(x.hours * 10) / 10;
    title = esc(t.plural("dash.row.time", x.entries, { hours: fmt.number(hours, hours % 1 ? 1 : 0) }));
    const range = x.from && x.to && x.from !== x.to ? `${fmt.date(x.from)} – ${fmt.date(x.to)}` : x.from ? fmt.date(x.from) : "";
    sub = esc([(x.suppliers || []).join(", "), range].filter(Boolean).join(" · "));
    buttons = dashDecBtn(dk("row.review"), "/customer/time");
  } else if (x.kind === "overdue" && x.taskId) {
    const late = Math.max(1, Math.round((Date.parse(dashToday()) - Date.parse(x.dueDate)) / 86400000));
    title = esc(t.plural("dash.row.late", late, { task: x.taskName }));
    sub = esc([x.supplier, x.projectName].filter(Boolean).join(" · "));
    buttons = dashDecBtn(
      dk("row.message"),
      `/customer/messages?project=${encodeURIComponent(x.projectId)}&phase=${encodeURIComponent(x.phaseId)}&task=${encodeURIComponent(x.taskId)}`,
      true,
    );
  } else if (x.amount) sub = [sub, esc(fmt.money(x.amount))].filter(Boolean).join(" · ");
  return dashRow(x.kind, title, sub, x.link, buttons);
}
const dashServerRow = (x, sub, grey) => dashRow(x.kind, dashDom(x.text), sub, x.link, dashDecBtn(dashAction(x), x.link, grey));
const dashBase = (left, right) =>
  `<section class="aq-panel ds-dash" data-lc-section="aq-panel"><div class="ds-dash-cols"><div class="ds-dash-main">${left}</div><div class="ds-dash-side">${right}</div></div><h2 class="ds-dash-more ds-ui">${dk("moreBelow")}</h2></section>`;
const dashGlanceCell = (label, value, red) => `<div class="ds-glance-cell"><span class="ds-ui">${label}</span><b${red ? ' class="ds-red"' : ""}>${value}</b></div>`;

/* ---------- Attention panels, statistics, lists ---------- */
const dashPanel = (key, title, link, linkText, body, empty) =>
  `<section class="panel pa-panel" data-lc-key="${esc(key)}"><div class="panel-title"><h3>${title}</h3>${link ? `<a href="#${link}">${linkText}</a>` : ""}</div>${body || `<p class="pa-empty">${empty}</p>`}</section>`;
const dashStats = (cells) =>
  `<div class="stats" data-lc-section="stats" data-lc-grid="stats-0">${cells.map(([key, label, value]) => `<div data-lc-key="${key}"><span class="cc-label">${label}</span><strong>${value}</strong></div>`).join("")}</div>`;
// Phases with a direct supplier and tasks, flattened for deadline checks
function dashWorkItems(projects, supplierId) {
  const items = [],
    role = state.user.role;
  for (const p of projects)
    for (const ph of p.phases || []) {
      const tasks = ph.tasks || [];
      if (!tasks.length && (!supplierId || ph.supplierId === supplierId))
        items.push({ p, ph, name: ph.name, dueDate: ph.dueDate, status: ph.status, link: `/${role}/projects/${p.id}/phases/${ph.id}` });
      for (const t of tasks)
        if (!supplierId || (t.assignedSupplierId === supplierId && t.acceptanceStatus === "Accepted"))
          items.push({ p, ph, t, name: t.name, dueDate: t.dueDate, status: t.status, link: `/${role}/projects/${p.id}/tasks/${t.id}` });
    }
  return items.filter((x) => x.p.status !== "Completed");
}
const dashItemRow = (x, tone) =>
  `<a class="pa-row" href="#${esc(x.link)}"><span><b>${esc(x.name)}</b><small>${esc(x.p.name)} · ${dashDom(x.ph.name)}</small></span><span class="pa-pill ${tone}">${esc(fmt.date(x.dueDate))}</span></a>`;
async function dashMessages(limit = 5) {
  const { messages = [] } = await api("/messages").catch(() => ({}));
  return messages
    .filter((m) => m.senderId !== state.user.id)
    .sort((a, b) => String(b.createdAt).localeCompare(String(a.createdAt)))
    .slice(0, limit);
}
const dashMessageRow = (role, m) =>
  `<a class="pa-row" href="#/${role}/messages${m.chatId ? "?chat=" + esc(m.chatId) : ""}"><span><b>${m.text || m.body ? esc(String(m.text || m.body).slice(0, 70)) : dk("pa.message")}</b><small>${esc(dashTime(m.createdAt))}</small></span></a>`;

/* ---------- Customer (T95) ---------- */
async function dashCustomer() {
  const [d, aq, { projects = [] }, { invoices = [] }, { notifications = [] }, messages, { visits = [] }] = await Promise.all([
    api("/dashboard"),
    api("/action-queue").catch(() => ({})),
    api("/projects"),
    api("/invoices"),
    api("/notifications").catch(() => ({})),
    dashMessages(),
    api("/site-visits").catch(() => ({})),
  ]);
  const items = aq.items || [],
    ps = d.projects;
  // Side cards: at a glance and this week
  const today = dashToday(),
    month = today.slice(0, 7),
    active = projects.filter((p) => !["Completed", "Archived"].includes(p.status) && !p.archived),
    activeIds = new Set(active.map((p) => p.id)),
    tasks = projects.flatMap((p) => (p.phases || []).flatMap((ph) => (ph.tasks || []).map((t) => ({ p, ph, t })))),
    open = tasks.filter(({ t }) => t.status !== "Completed" && t.dueDate),
    late = open.filter(({ t }) => t.dueDate < today).length,
    unpaid = invoices.filter((i) => i.status === "Approved"),
    toPay = unpaid.filter((i) => String(i.scheduledPayment || "").slice(0, 7) === month).reduce((a, i) => a + Number(i.amount || 0), 0),
    budget = active.reduce((a, p) => a + Number(p.budget || 0), 0),
    invoiced = invoices.filter((i) => activeIds.has(i.projectId) && !["Rejected", "Draft"].includes(i.status)).reduce((a, i) => a + Number(i.amount || 0), 0);
  const end = dashIso(new Date(Date.now() + 6 * 86400000)),
    inWeek = (x) => x && x >= today && x <= end,
    events = [
      ...visits
        .filter((v) => ["Approved", "Checked in"].includes(v.status) && inWeek(v.date))
        .map((v) => ({ date: v.date, tone: "blue", title: t("dash.week.crewOnSite", { company: v.supplierCompany }), sub: [v.siteName, v.startTime, v.permitLabel].filter(Boolean).join(" · ") })),
      ...unpaid
        .filter((i) => inWeek(i.scheduledPayment))
        .map((i) => ({ date: i.scheduledPayment, tone: "orange", title: t("dash.week.invoiceDue", { number: invNo(i) }), sub: [fmt.money(i.amount), i.supplierCompany].filter(Boolean).join(" · ") })),
      ...open
        .filter(({ t: x }) => inWeek(x.dueDate))
        .map(({ t: x }) => ({ date: x.dueDate, tone: "green", title: x.name, sub: t(x.dueDate < today ? "dash.week.late" : "dash.week.onTrack", { n: Number(x.progress || 0) }) })),
    ]
      .sort((a, b) => a.date.localeCompare(b.date))
      .slice(0, 4);
  const week = events.length
    ? events
        .map((e) => {
          const day = new Date(e.date + "T12:00:00");
          return `<div class="ds-week-row"><div class="ds-week-date"><span${e.date === today ? ' class="ds-red"' : ""}>${esc(day.toLocaleDateString(fmt.locale(), { weekday: "short" }).replace(".", "").toUpperCase())}</span><b>${day.getDate()}</b></div><div class="ds-week-text ds-tone-${e.tone}"><b>${esc(e.title)}</b><span>${esc(e.sub)}</span></div></div>`;
        })
        .join("")
    : `<p class="ds-week-none">${dk("week.none")}</p>`;
  // Attention panels
  const work = dashWorkItems(projects),
    utc = dashUtcToday(),
    soon = dashDaysFrom(14),
    delayed = work.filter((x) => x.status !== "Completed" && x.dueDate && x.dueDate < utc).sort((a, b) => a.dueDate.localeCompare(b.dueDate)),
    upcoming = work.filter((x) => x.status !== "Completed" && x.dueDate >= utc && x.dueDate <= soon).sort((a, b) => a.dueDate.localeCompare(b.dueDate)),
    due = invoices.filter((i) => i.status === "Submitted");
  const header = dashHeader(dashKicker(), dashDecisionLine(aq.total || items.length), dashBtn("/customer/projects/new", dk("newProject")));
  const decisions = dashBase(
    `<h2 class="ds-dash-h ds-ui">${dk("needsDecision")}</h2><div class="ds-card ds-dec-list">${items.length ? items.map(dashCustomerRow).join("") : dashCaughtUp(aq)}</div>`,
    `<h2 class="ds-dash-h ds-ui">${dk("atAGlance")}</h2><div class="ds-card ds-glance">${
      dashGlanceCell(dk("glance.activeProjects"), active.length) +
      dashGlanceCell(dk("glance.lateTasks"), late, late > 0) +
      dashGlanceCell(dk("glance.toPay"), esc(fmt.money(toPay))) +
      dashGlanceCell(dk("glance.budgetUsed"), budget ? dk("glance.percent", { n: Math.round((invoiced / budget) * 100) }) : "—")
    }</div><div class="ds-card ds-week"><h3 class="ds-ui">${dk("thisWeek")}</h3><div class="ds-week-list">${week}</div></div>`,
  );
  const stats = dashStats([
    ["active projects", dk("stats.activeProjects"), ps.filter((p) => p.status === "In Progress").length],
    ["completed", dk("stats.completed"), ps.filter((p) => p.status === "Completed").length],
    ["pending invoices", dk("stats.pendingInvoices"), d.invoices.filter((i) => i.status === "Submitted").length],
    ["project value", dk("stats.projectValue"), esc(fmt.money(ps.reduce((a, p) => a + p.budget, 0)))],
  ]);
  const attention = `<div class="pa-attention" data-lc-section="pa-attention"><div class="pa-grid" data-lc-grid="pa-grid-1">${
    dashPanel("delayed work", `${dk("pa.delayed")} <span class="pa-count red">${delayed.length}</span>`, "/customer/projects", dk("pa.projects"), delayed.slice(0, 5).map((x) => dashItemRow(x, "red")).join(""), dk("pa.nothingOverdue")) +
    dashPanel("upcoming deadlines", `${dk("pa.upcoming")} <span class="pa-count">${upcoming.length}</span>`, "", "", upcoming.slice(0, 5).map((x) => dashItemRow(x, "blue")).join(""), dk("pa.noDeadlines")) +
    dashPanel(
      "invoices to review",
      `${dk("pa.toReview")} <span class="pa-count orange">${due.length}</span>`,
      "/customer/invoices",
      dk("pa.review"),
      due
        .slice(0, 5)
        .map((i) => `<a class="pa-row" href="#/customer/invoice/${encodeURIComponent(i.id)}"><span><b>${esc(i.supplierCompany || invNo(i))}</b><small>${esc(i.taskName || i.description || invNo(i))}</small></span><b>${esc(fmt.money(i.amount))}</b></a>`)
        .join(""),
      dk("pa.noInvoicesWaiting"),
    ) +
    dashPanel("recent messages", dk("pa.messages"), "/customer/messages", dk("pa.open"), messages.map((m) => dashMessageRow("customer", m)).join(""), dk("pa.noMessages")) +
    dashPanel(
      "notifications",
      dk("pa.notifications"),
      "/customer/inbox",
      dk("pa.inbox"),
      notifications
        .filter((n) => !n.read)
        .slice(0, 5)
        .map((n) => `<a class="pa-row" href="#${esc(n.link || "/customer/inbox")}"><span><b>${dashDom(n.text)}</b><small>${esc(dashTime(n.createdAt))}</small></span></a>`)
        .join(""),
      dk("pa.caughtUp"),
    )
  }</div></div>`;
  const grid = `<div class="dashboard-grid" data-lc-section="dashboard-grid" data-lc-grid="dashboard-grid-2"><div class="panel" data-lc-key="active projects"><div class="panel-title"><h3>${dk("grid.activeProjects")}</h3><a href="#/customer/projects">${dk("grid.viewAll")}</a></div>${ps
    .map(
      (p) =>
        `<a class="project-row project-click" href="#/customer/projects/${esc(p.id)}"><div><b>${esc(p.name)}</b><small>${tHtml("dash.grid.due", { status: statusHtml(p.status), date: esc(fmt.date(p.dueDate)) })}</small></div><div><div class="bar"><i style="width:${pct(p.phases)}%"></i></div></div><b>${pct(p.phases)}%</b></a>`,
    )
    .join("")}</div><div class="panel" data-lc-key="invoices"><div class="panel-title"><h3>${dk("grid.invoices")}</h3><a href="#/customer/invoices">${dk("grid.review")}</a></div>${
    d.invoices
      .slice(0, 6)
      .map((i) => `<div class="project-row" style="grid-template-columns:1fr auto"><div><b>${esc(invNo(i))}</b><small>${esc(fmt.money(i.amount))}</small></div>${dashStatus(i.status)}</div>`)
      .join("") || `<div class="empty">${dk("grid.noInvoices")}</div>`
  }</div></div>`;
  dashRender("customer", [header, decisions, stats, attention, grid]);
}

/* ---------- Supplier (T96, T102) ---------- */
let dashFilters = { from: "", to: "", customer: "", project: "", min: "", max: "" },
  dashJobs = [];
async function dashSupplier() {
  const monday = (() => {
      const now = new Date();
      return new Date(now.getTime() - ((now.getDay() + 6) % 7) * 86400000);
    })(),
    days = [0, 1, 2, 3, 4].map((i) => dashIso(new Date(monday.getTime() + i * 86400000)));
  const [d, { supplier: profile }, aq, { projects = [] }, { invoices = [] }, messages, { visits = [] }, plan] = await Promise.all([
    api("/dashboard"),
    api("/profile"),
    api("/action-queue").catch(() => ({})),
    api("/projects"),
    api("/invoices"),
    dashMessages(),
    api("/site-visits").catch(() => ({})),
    api(`/planning?from=${days[0]}&to=${days[4]}`).catch(() => ({})),
  ]);
  const items = aq.items || [],
    sid = state.user.supplierId;
  const invites = items.filter((x) => x.kind === "invitation" && x.invite).sort((a, b) => String(b.invite.invitedAt).localeCompare(String(a.invite.invitedAt))),
    first = invites[0],
    rest = items.filter((x) => x !== first);
  // The newest invitation: who of the crew is free on its dates
  let crewFree = "—",
    crewTone = "";
  if (first && (first.invite.startDate || first.invite.dueDate)) {
    const v = first.invite,
      r = await api(`/planning?from=${v.startDate || v.dueDate}&to=${v.dueDate || v.startDate}`).catch(() => ({})),
      people = r.people || [],
      busy = new Set([...(r.entries || []), ...(r.visits || [])].map((e) => e.personId)),
      free = people.filter((p) => !busy.has(p.id)).length;
    if (people.length) [crewFree, crewTone] = free ? [t("dash.crew.free", { free, total: people.length }), "ds-green"] : [t("dash.crew.nobody"), "ds-red"];
  }
  // Phone "Today": accepted jobs, today's site visit, quick actions (T102)
  const today = dashToday();
  dashJobs = projects.flatMap((p) =>
    (p.phases || []).flatMap((ph) =>
      (ph.tasks || [])
        .filter((x) => x.assignedSupplierId === sid && x.acceptanceStatus === "Accepted" && x.status !== "Completed")
        .map((x) => ({ projectId: p.id, project: p.name, taskId: x.id, name: x.name, progress: Number(x.progress) || 0, dueDate: x.dueDate })),
    ),
  );
  const visit = visits.find((v) => ["Approved", "Checked in"].includes(v.status) && v.date <= today && (v.endDate || v.date) >= today),
    names = (visit?.workers || []).map((w) => String(w.name).split(" ")[0]),
    weekday = (x) => {
      const n = Math.round((Date.parse(x) - Date.parse(today)) / 86400000);
      return n >= 0 && n < 7 ? new Date(x + "T12:00:00").toLocaleDateString(fmt.locale(), { weekday: "long" }) : fmt.range(x);
    };
  const quick = (key, label, tone) =>
    `<button type="button" class="ds-quick${tone ? " ds-quick-" + tone : ""}" data-action="dash.quick" data-quick="${key}"><svg viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="1.8" stroke-linecap="round" stroke-linejoin="round" aria-hidden="true">${DASH_QUICK_ICONS[key]}</svg><span>${label}</span></button>`;
  const crewWord = names.length ? (names.length <= 2 ? (names.length === 2 ? t("dash.today.and", { a: names[0], b: names[1] }) : names[0]) : t("dash.today.workers", { n: names.length })) : "";
  const todayBlock = `<section class="ds-today" data-lc-section="ds-today"><div class="ds-today-head"><div><span class="ds-today-date">${esc(dashKicker())}</span><h2 class="ds-ui ds-today-title">${dk("today.title")}</h2></div><a class="ds-today-me" href="#/supplier/profile" aria-label="${dk("today.profile")}">${esc(
    String(state.user.name || "?").split(/\s+/).map((w) => w[0]).join("").slice(0, 2).toUpperCase(),
  )}</a></div>${
    visit
      ? `<div class="ds-visit"><div><span class="ds-visit-kicker">${dk("today.visit", { when: visit.status === "Checked in" ? t("dash.today.checkedIn") : visit.startTime || t("dash.today.today") })}</span><b>${visit.siteName ? esc(visit.siteName) : dk("today.site")}</b><span>${esc([crewWord, visit.permitLabel].filter(Boolean).join(" · "))}</span></div><button type="button" class="ds-visit-btn" data-action="dash.visit" data-id="${esc(visit.id)}" data-step="${visit.status === "Checked in" ? "checkout" : "checkin"}">${dk(visit.status === "Checked in" ? "today.checkOut" : "today.checkIn")}</button></div>`
      : ""
  }<div class="ds-today-jobs"><span class="ds-today-label ds-ui">${dk("today.jobs")}</span><div class="ds-today-list">${
    dashJobs
      .map((j) => `<a href="#/supplier/projects/${encodeURIComponent(j.projectId)}/tasks/${encodeURIComponent(j.taskId)}"><span><b>${esc(j.name)}</b><small>${dk("today.jobDue", { n: j.progress, when: j.dueDate ? weekday(j.dueDate) : "—" })}</small></span><i aria-hidden="true">›</i></a>`)
      .join("") || `<p class="ds-week-none">${dk("today.noJobs")}</p>`
  }</div></div><div class="ds-quicks ds-ui">${quick("time", dk("today.logTime"))}${quick("photo", dk("today.photo"))}${quick("report", dk("today.report"))}${quick("defect", dk("today.defect"), "orange")}</div></section>`;
  const header = dashHeader(
    state.user?.company || "",
    invites.length === 1 ? t("dash.jobsWaiting.one") : invites.length > 1 ? t("dash.jobsWaiting.many", { n: invites.length }) : dashDecisionLine(aq.total || items.length),
    dashBtn("/supplier/bids", dk("findBids"), "btn outline") + dashBtn("/supplier/invoices/new", dk("createInvoice")),
  );
  // Side: paid this year, crew this week
  const year = today.slice(0, 4),
    paidYear = invoices.filter((i) => i.status === "Paid" && String(i.paymentDate || i.updatedAt || "").startsWith(year)).reduce((a, i) => a + Number(i.amount || 0), 0),
    approved = invoices.filter((i) => i.status === "Approved"),
    next = approved.map((i) => i.scheduledPayment).filter(Boolean).sort()[0],
    approvedSum = fmt.money(approved.reduce((a, i) => a + Number(i.amount || 0), 0));
  const people = (plan.people || []).slice(0, 4),
    kind = (pid, day) => {
      const hit = [...(plan.visits || []), ...(plan.entries || [])].find((e) => e.personId === pid && e.start <= day && e.end >= day);
      return !hit ? "free" : hit.type === "visit" ? "visit" : ["vacation", "sick", "training"].includes(hit.type) ? "absence" : "job";
    };
  const crewRows = people
    .map((p) => {
      // Neighbouring days of the same kind become one bar
      const spans = [];
      for (const day of days) {
        const k = kind(p.id, day);
        if (spans.at(-1)?.k === k) spans.at(-1).n++;
        else spans.push({ k, n: 1 });
      }
      return `<span class="ds-crew-name">${esc(String(p.name || "").split(" ")[0])}</span>${spans.map((x) => `<i class="ds-crew-${x.k}" style="grid-column: span ${x.n}"></i>`).join("")}`;
    })
    .join("");
  const crewHead = `<span></span>${days.map((day) => `<span class="ds-crew-day">${esc(new Date(day + "T12:00:00").toLocaleDateString(fmt.locale(), { weekday: "narrow" }))}</span>`).join("")}`;
  const v = first?.invite;
  const inviteCard = first
    ? `<article class="ds-invite" data-ds-invite="${esc(v.projectId)}"><div class="ds-invite-head"><span class="ds-invite-kicker">${v.customer ? dk("invite.kickerFrom", { customer: v.customer }) : dk("invite.kicker")}</span><a class="ds-invite-title" href="#${esc(first.link)}">${esc(v.name)}</a><span class="ds-invite-sub">${[esc(v.project), v.taskId && v.phase ? dashDom(v.phase) : ""].filter(Boolean).join(" · ")}</span></div><div class="ds-facts"><div><span class="ds-ui">${dk("invite.dates")}</span><b>${esc(fmt.range(v.startDate, v.dueDate))}</b></div><div><span class="ds-ui">${dk("invite.orderValue")}</span><b>${v.orderAmount ? esc(fmt.money(v.orderAmount)) : "—"}</b></div><div><span class="ds-ui">${dk("invite.yourCrew")}</span><b class="ds-crew-count${crewTone ? " " + crewTone : ""}">${esc(crewFree)}</b></div></div><div class="ds-invite-actions">${dashAnswer(v.projectId, v.taskId, v.phaseId, true, "btn primary ds-invite-accept", dk("invite.accept"))}${dashAnswer(v.projectId, v.taskId, v.phaseId, false, "btn secondary ds-invite-decline", dk("invite.decline"))}<a class="ds-text-link" href="#/supplier/messages?project=${encodeURIComponent(v.projectId)}">${dk("invite.ask")}</a></div></article>`
    : "";
  const decisions = dashBase(
    inviteCard +
      (rest.length || !first
        ? `<h2 class="ds-dash-h ds-ui">${dk(first ? "alsoForYou" : "needsDecision")}</h2><div class="ds-card ds-dec-list ds-dec-small">${rest.length ? rest.map((x) => dashServerRow(x, x.sub ? dashDom(x.sub) : "", x.kind === "compliance")).join("") : dashCaughtUp(aq)}</div>`
        : ""),
    `<section class="ds-pay-card"><span class="ds-ui">${dk("pay.year")}</span><b>${esc(fmt.money(paidYear))}</b><small>${
      approved.length
        ? next
          ? dk("pay.approvedPaid", { amount: approvedSum, day: new Date(next + "T12:00:00").toLocaleDateString(fmt.locale(), { weekday: "long" }) })
          : dk("pay.approved", { amount: approvedSum })
        : dk("pay.none")
    }</small></section><div class="ds-card ds-crew"><div class="ds-crew-head"><h3 class="ds-ui">${dk("crew.title")}</h3><a href="#/supplier/planning">${dk("crew.planner")}</a></div><div class="ds-crew-grid">${
      people.length ? crewHead + crewRows : `<p class="ds-week-none">${dk("crew.empty")}</p>`
    }</div><span class="ds-crew-legend ds-ui">${dk("crew.legend")}</span></div>`,
  );
  // Statistics: pending invitations of phases and tasks
  const allInvoices = d.invoices || [],
    dprojects = d.projects || [],
    pending = [];
  for (const p of dprojects)
    for (const ph of p.phases || []) {
      if (ph.supplierId === profile?.id && ph.acceptanceStatus === "Pending") pending.push({ p, ph, t: null });
      for (const x of ph.tasks || []) if (x.assignedSupplierId === profile?.id && x.acceptanceStatus === "Pending") pending.push({ p, ph, t: x });
    }
  const stats = dashStats([
    ["assigned projects", dk("stats.assignedProjects"), dprojects.length],
    ["pending invitations", dk("stats.pendingInvitations"), pending.length],
    ["invoices", dk("stats.invoices"), allInvoices.length],
    ["paid", dk("stats.paid"), allInvoices.filter((i) => i.status === "Paid").length],
  ]);
  // Earnings and attention panels
  const work = dashWorkItems(projects, sid),
    utc = dashUtcToday(),
    soon = dashDaysFrom(14),
    overdue = work.filter((x) => x.status !== "Completed" && x.dueDate && x.dueDate < utc),
    upcoming = work.filter((x) => x.status !== "Completed" && x.dueDate >= utc && x.dueDate <= soon).sort((a, b) => a.dueDate.localeCompare(b.dueDate)),
    sum = (list) => list.reduce((a, i) => a + Number(i.amount || 0), 0),
    month = utc.slice(0, 7),
    paid = invoices.filter((i) => i.status === "Paid"),
    submitted = invoices.filter((i) => ["Submitted", "Changes Requested"].includes(i.status));
  const earning = (key, label, amount, small) => `<div data-lc-key="${key}"><span class="cc-label">${label}</span><strong>${esc(fmt.money(amount))}</strong><small>${small}</small></div>`;
  const attention = `<div class="pa-attention" data-lc-section="pa-attention"><div class="pa-earnings" data-lc-grid="pa-earnings-1">${
    earning("paid out", dk("pa.paidOut"), sum(paid), dk("pa.invoiceCount", { n: paid.length })) +
    earning("approved · awaiting payment", dk("pa.awaiting"), sum(approved), dk("pa.invoiceCount", { n: approved.length })) +
    earning("in review", dk("pa.inReview"), sum(submitted), dk("pa.invoiceCount", { n: submitted.length })) +
    earning("paid this month", dk("pa.paidMonth"), sum(paid.filter((i) => String(i.paymentDate || i.updatedAt).slice(0, 7) === month)), esc(new Date().toLocaleDateString(fmt.locale(), { month: "long" })))
  }</div><div class="pa-grid" data-lc-grid="pa-grid-2">${
    dashPanel(
      "upcoming deadlines",
      `${dk("pa.upcoming")} <span class="pa-count">${upcoming.length}</span>`,
      "/supplier/projects",
      dk("pa.assignedWork"),
      [...overdue.map((x) => dashItemRow(x, "red")), ...upcoming.map((x) => dashItemRow(x, "blue"))].slice(0, 6).join(""),
      dk("pa.noDeadlines"),
    ) + dashPanel("recent messages", dk("pa.messages"), "/supplier/messages", dk("pa.open"), messages.map((m) => dashMessageRow("supplier", m)).join(""), dk("pa.noMessages"))
  }</div></div>`;
  // Pending invitations, invoice status and the invoice search
  const view = dashFilters,
    customerOf = (i) => i.customerCompany || t("dash.grid.customer"),
    matches = allInvoices.filter((i) => {
      const dt = String(i.createdAt || "").slice(0, 10);
      return (
        (!view.from || dt >= view.from) &&
        (!view.to || dt <= view.to) &&
        (!view.customer || customerOf(i).toLowerCase().includes(view.customer.toLowerCase())) &&
        (!view.project || i.projectId === view.project) &&
        (!view.min || Number(i.amount) >= Number(view.min)) &&
        (!view.max || Number(i.amount) <= Number(view.max))
      );
    }),
    invoiceUrl = (i) => `/supplier/invoice/${encodeURIComponent(i.id)}?back=${encodeURIComponent("/supplier/dashboard")}`;
  const grid = `<div class="dashboard-grid review-supplier-dashboard-grid" data-lc-section="dashboard-grid" data-lc-grid="dashboard-grid-3"><section class="panel" data-lc-key="pending invitations"><div class="panel-title"><div><h3>${dk("grid.pendingInvitations")}</h3><small>${dk("grid.pendingHint")}</small></div>${dashBtn("/supplier/bids", dk("grid.findOffer"), "btn small outline")}</div>${
    pending
      .map(
        (x) =>
          `<article class="review-pending-row"><b>${esc(x.t?.name || x.ph.name)}</b><small>${tHtml("dash.grid.pendingSub", { project: esc(x.p.name), phase: dashDom(x.ph.name), date: esc(fmt.date(x.t?.dueDate || x.ph.dueDate)) })}</small><div class="cc-actions">${dashAnswer(x.p.id, x.t?.id, x.ph.id, true, "btn small success", dk("grid.accept"))}${dashAnswer(x.p.id, x.t?.id, x.ph.id, false, "btn small outline", dk("grid.decline"))}</div></article>`,
      )
      .join("") || `<div class="empty review-empty"><p>${dk("grid.noPending")}</p>${dashBtn("/supplier/bids", dk("grid.browse"))}</div>`
  }</section><section class="panel review-click-invoices" data-lc-key="invoice status"><div class="panel-title"><div><h3>${dk("grid.invoiceStatus")}</h3><small>${dk("grid.invoiceHint")}</small></div><a class="btn small outline" href="#/supplier/invoices">${dk("grid.allInvoices")}</a></div>${
    allInvoices
      .map((i) => `<a class="review-invoice-mini" href="#${esc(invoiceUrl(i))}"><span><b>${esc(invNo(i))}</b><small>${esc(customerOf(i))} · ${esc(fmt.money(i.amount))}</small></span>${dashStatus(i.status)}</a>`)
      .join("") || `<div class="empty">${dk("grid.noInvoicesYet")}</div>`
  }</section></div>`;
  const field = (label, html) => `<label>${label}${html}</label>`;
  const search = `<section class="panel review-dashboard-invoice-filters" data-lc-section="review-dashboard-invoice-filters"><div class="panel-title"><div><h3>${dk("search.title")}</h3><small>${dk("search.hint")}</small></div></div><div class="review-invoice-filters">${
    field(dk("search.from"), `<input type="date" id="reviewSDFrom" value="${esc(view.from)}">`) +
    field(dk("search.to"), `<input type="date" id="reviewSDTo" value="${esc(view.to)}">`) +
    field(dk("search.customer"), `<input id="reviewSDCustomer" value="${esc(view.customer)}" placeholder="${dk("search.companyName")}">`) +
    field(
      dk("search.project"),
      `<select id="reviewSDProject"><option value="">${dk("search.allProjects")}</option>${dprojects.map((p) => `<option value="${esc(p.id)}" ${view.project === p.id ? "selected" : ""}>${esc(p.name)}</option>`).join("")}</select>`,
    ) +
    field(dk("search.min"), `<input type="number" id="reviewSDMin" min="0" step="0.01" value="${esc(view.min)}">`) +
    field(dk("search.max"), `<input type="number" id="reviewSDMax" min="0" step="0.01" value="${esc(view.max)}">`)
  }<button class="btn primary" data-action="dash.filter">${dk("search.apply")}</button></div><div class="cc-table-wrap"><table class="cc-table"><thead><tr><th>${dk("search.invoice")}</th><th>${dk("search.customer")}</th><th>${dk("search.projectTask")}</th><th>${dk("search.issued")}</th><th>${dk("search.amount")}</th><th>${dk("search.status")}</th></tr></thead><tbody>${
    matches
      .map(
        (i) =>
          `<tr><td><a href="#${esc(invoiceUrl(i))}">${esc(invNo(i))}</a></td><td>${esc(customerOf(i))}</td><td>${esc(dprojects.find((p) => p.id === i.projectId)?.name || i.projectId)}<small>${esc(i.taskName || "")}</small></td><td>${esc(fmt.date(i.createdAt))}</td><td>${esc(fmt.money(i.amount))}</td><td>${statusHtml(i.status)}</td></tr>`,
      )
      .join("") || `<tr><td colspan="6">${dk("search.none")}</td></tr>`
  }</tbody></table></div></section>`;
  dashRender("supplier", [todayBlock, header, decisions, stats, attention, grid, search]);
}
// Accept or decline an invitation of a task or a phase (invitations.js asks for a reason or a confirmation)
const dashAnswer = (pid, taskId, phaseId, accept, cls, label) =>
  `<button type="button" class="${cls}" data-action="dash.answer" data-project="${esc(pid)}" ${taskId ? `data-task="${esc(taskId)}"` : `data-phase="${esc(phaseId)}"`} data-accept="${accept}">${label}</button>`;
const DASH_QUICK_ICONS = {
  time: '<circle cx="12" cy="12" r="9"/><path d="M12 7v5l3 2"/>',
  photo: '<path d="M4 8h3l2-3h6l2 3h3v11H4z"/><circle cx="12" cy="13" r="3.5"/>',
  report: '<path d="M7 3h7l4 4v14H7z"/><path d="M10 12h5M10 16h5"/>',
  defect: '<path d="M12 3 2 20h20z"/><path d="M12 10v4M12 17v.5"/>',
};

/* ---------- Admin (T97) ---------- */
async function dashAdmin() {
  const [m, a, aq, { projects = [] }, { invoices = [] }, { disputes = [] }, audit, settings] = await Promise.all([
    api("/admin/metrics"),
    api("/admin/applications"),
    api("/action-queue").catch(() => ({})),
    api("/projects"),
    api("/invoices"),
    api("/disputes").catch(() => ({})),
    api("/audit").catch(() => ({ entries: [] })),
    api("/admin/settings").catch(() => ({ settings: {} })),
  ]);
  const items = aq.items || [],
    applications = a.applications || [];
  const statCells = [
    ["users", dk("stats.users"), m.metrics.users],
    ["live suppliers", dk("stats.liveSuppliers"), m.metrics.suppliers],
    ["projects", dk("stats.projects"), m.metrics.projects],
    ["invoice volume", dk("stats.invoiceVolume"), esc(fmt.money(m.metrics.grossVolume))],
  ];
  const header = dashHeader(t("dash.admin"), dashDecisionLine(aq.total || items.length), "");
  const decisions = dashBase(
    `<h2 class="ds-dash-h ds-ui">${dk("needsDecision")}</h2><div class="ds-card ds-dec-list">${
      items.length ? items.map((x) => dashServerRow(x, [x.sub ? dashDom(x.sub) : "", x.amount ? esc(fmt.money(x.amount)) : ""].filter(Boolean).join(" · "))).join("") : dashCaughtUp(aq)
    }</div>`,
    `<h2 class="ds-dash-h ds-ui">${dk("atAGlance")}</h2><div class="ds-card ds-glance">${statCells.map(([, label, value]) => dashGlanceCell(label, value)).join("")}</div>`,
  );
  // Revenue by month and alerts
  const fee = Number(settings.settings?.platformFeePercent ?? 3) / 100,
    months = (() => {
      const out = [],
        d = new Date();
      d.setDate(1);
      for (let i = 5; i >= 0; i--) {
        const x = new Date(d.getFullYear(), d.getMonth() - i, 1);
        out.push(`${x.getFullYear()}-${String(x.getMonth() + 1).padStart(2, "0")}`);
      }
      return out;
    })(),
    byMonth = months.map((mo) => ({
      m: mo,
      fees: invoices.filter((i) => ["Approved", "Paid"].includes(i.status) && String(i.updatedAt || i.createdAt).slice(0, 7) === mo).reduce((s, i) => s + Number(i.amount) * fee, 0),
    })),
    max = Math.max(1, ...byMonth.map((x) => x.fees)),
    weekAgo = dashDaysFrom(-7),
    threeDaysAgo = dashDaysFrom(-3);
  const alerts = [
    ...dashWorkItems(projects)
      .filter((x) => x.status !== "Completed" && x.dueDate && x.dueDate < dashUtcToday())
      .slice(0, 4)
      .map((x) => ({ tone: "red", text: dk("pa.overdue", { name: x.name }), sub: dk("pa.dueOn", { project: x.p.name, date: fmt.date(x.dueDate) }), link: "/admin/reports" })),
    ...invoices
      .filter((i) => i.status === "Submitted" && String(i.createdAt).slice(0, 10) < weekAgo)
      .map((i) => ({ tone: "orange", text: dk("pa.invoiceWaiting", { number: invNo(i) }), sub: esc(`${i.supplierCompany || ""} · ${fmt.money(i.amount)}`), link: "/admin/billing" })),
    ...applications
      .filter((x) => !["Approved", "Rejected"].includes(x.status) && String(x.createdAt).slice(0, 10) < threeDaysAgo)
      .map((x) => ({ tone: "orange", text: dk("pa.applicationWaiting", { company: x.company }), sub: statusHtml(x.stage || "New"), link: "/admin/applications" })),
    ...disputes
      .filter((x) => x.status !== "Resolved" && x.status !== "Closed")
      .map((x) => ({ tone: "red", text: tHtml("dash.pa.escalation", { type: statusHtml(x.type) }), sub: esc(x.description?.slice(0, 60) || ""), link: "/admin/disputes" })),
  ];
  const attention = `<div class="pa-attention" data-lc-section="pa-attention"><div class="pa-grid" data-lc-grid="pa-grid-1">${
    dashPanel(
      "revenue overview · platform fees",
      dk("pa.revenue"),
      "/admin/billing",
      dk("pa.billing"),
      `<div class="pa-bars">${byMonth
        .map((x) => `<div title="${esc(fmt.money(x.fees))}"><i style="height:${Math.max(3, (x.fees / max) * 100)}%"></i><small>${esc(new Date(x.m + "-01").toLocaleDateString(fmt.locale(), { month: "short" }))}</small></div>`)
        .join("")}</div><p class="pa-note">${dk("pa.feesNote", { amount: fmt.money(byMonth.reduce((s, x) => s + x.fees, 0)), rate: (fee * 100).toFixed(1) })}</p>`,
    ) +
    dashPanel(
      "alerts",
      `${dk("pa.alerts")} <span class="pa-count ${alerts.length ? "red" : ""}">${alerts.length}</span>`,
      "",
      "",
      alerts
        .slice(0, 7)
        .map((x) => `<a class="pa-row" href="#${x.link}"><span><b>${x.text}</b><small>${x.sub}</small></span><span class="pa-dot ${x.tone}"></span></a>`)
        .join(""),
      dk("pa.noAlerts"),
    ) +
    dashPanel(
      "recent activity",
      dk("pa.activity"),
      "/admin/audit",
      dk("pa.auditLog"),
      (audit.entries || [])
        .slice(0, 7)
        .map((e) => `<div class="pa-row"><span><b>${dashDom(e.action)}</b><small>${esc(e.actorName)} · ${esc(e.projectName || e.entityId)} · ${esc(dashTime(e.at))}</small></span></div>`)
        .join(""),
      dk("pa.noActivity"),
    )
  }</div></div>`;
  const stages = t.list("dash.grid.stages");
  const grid = `<div class="dashboard-grid" data-lc-section="dashboard-grid" data-lc-grid="dashboard-grid-2"><div class="panel" data-lc-key="vetting queue"><div class="panel-title"><h3>${dk("grid.vetting")}</h3><a href="#/admin/applications">${dk("grid.openQueue")}</a></div>${
    applications
      .filter((x) => !["Approved", "Rejected"].includes(x.status))
      .map(
        (x) =>
          `<div class="project-row" style="grid-template-columns:1fr auto"><div><b>${esc(x.company)}</b><small>${esc(x.email)} · ${statusHtml(x.stage)}</small></div><button class="btn small outline" data-action="dash.application" data-id="${esc(x.id)}">${dk("grid.review")}</button></div>`,
      )
      .join("") || `<div class="empty">${dk("grid.queueClear")}</div>`
  }</div><div class="panel" data-lc-key="quality pipeline"><h3>${dk("grid.pipeline")}</h3><div class="stage-flow" style="flex-wrap:wrap">${stages.map((s, i) => `<span${i ? "" : ' class="on"'}>${esc(s)}</span>`).join("")}</div><p class="subtle">${dk("grid.badgeNote")}</p></div></div>`;
  dashRender("admin", [header, decisions, dashStats(statCells), attention, grid]);
}

/* Every section is a direct child of the content area, so the layout editor can move it; each one is drawn
   with keys. The getting-started checklist adds itself after the decision list. */
function dashRender(role, sections) {
  app.innerHTML = dashboardShell(role, "dashboard", sections.map((html) => html.replace(/^<(\w+)/, '<$1 data-i18n="keys"')).join(""));
}

routes.add("/customer/dashboard", dashCustomer);
routes.add("/supplier/dashboard", dashSupplier);
routes.add("/admin/dashboard", dashAdmin);

/* ---------- Actions ---------- */
actions.on("dash.approve", async (el) => {
  el.disabled = true;
  try {
    // The same request as approving on the invoice page, without leaving the dashboard
    await api("/invoices/" + el.dataset.id, { method: "PATCH", body: { action: "Approve", comment: "" } });
    tToast(t("dash.row.approved"));
    route();
  } catch (e) {
    toast(e.message, "error");
    el.disabled = false;
  }
});
actions.on("dash.answer", (el) => {
  const accept = el.dataset.accept === "true";
  return el.dataset.task ? invAnswerTask(el.dataset.project, el.dataset.task, accept) : invAnswerPhase(el.dataset.project, el.dataset.phase, accept);
});
actions.on("dash.application", (el) => reviewApplication(el.dataset.id));
actions.on("dash.visit", (el) => cmSupplierVisit(el.dataset.id, el.dataset.step));
actions.on("dash.filter", () => {
  const val = (id) => document.getElementById(id).value;
  dashFilters = { from: val("reviewSDFrom"), to: val("reviewSDTo"), customer: val("reviewSDCustomer"), project: val("reviewSDProject"), min: val("reviewSDMin"), max: val("reviewSDMax") };
  route();
});
// Quick actions of the phone "Today": log time, or a photo, site report or defect for one of the accepted jobs
actions.on("dash.quick", (el) => {
  const action = el.dataset.quick;
  if (action === "time") return ccNewTimeEntry();
  const run = (j) => {
    closeModal();
    if (action === "report") drOpen(j.projectId, j.taskId);
    else if (action === "defect") puOpen(j.projectId, j.taskId);
    // The daily report form has the photo field; open it and bring the field into view
    else Promise.resolve(drOpen(j.projectId, j.taskId)).then(() => setTimeout(() => document.querySelector('#drForm input[name="photos"]')?.scrollIntoView({ block: "center" }), 300));
  };
  if (!dashJobs.length) return tToast(t("dash.today.acceptFirst"), "error");
  if (dashJobs.length === 1) return run(dashJobs[0]);
  modal(
    t("dash.today.whichJob"),
    `<div class="ds-job-pick" data-i18n="keys">${dashJobs.map((j, n) => `<button type="button" class="ds-job-pick-row" data-action="dash.pick" data-n="${n}"><b>${esc(j.name)}</b><span>${esc(j.project)}</span></button>`).join("")}</div>`,
  );
  dashPick = run;
});
let dashPick = null;
actions.on("dash.pick", (el) => dashPick?.(dashJobs[Number(el.dataset.n)]));
