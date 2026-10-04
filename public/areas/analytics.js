/* Area: analytics (T135c). The customer's project analytics and the supplier's business analytics with their
   scorecard panel. Drawn with translation keys; project, supplier and customer names are data. The chart helpers
   (inBars, inDonut, inHBars, inKpi) stay in insights.js; admin reports use them too. */
const ank = (key, params) => esc(t("an." + key, params));
const anMoney = (n) => fmt.money(n);
const anRate = (a, b) => (b ? `${inPct(a, b)}%` : "—");
const anStatus = (s) => (typeof ccLookup("en", "inv.statuses." + s) === "string" ? t("inv.statuses." + s) : s);
const anKpi = (label, value, sub, tone) => inKpi(ank(label), esc(value), esc(sub), tone);
const anPeriod = (value) =>
  `<select id="inPeriod" aria-label="${ank("period")}" data-action="an.filter">${[3, 6, 12].map((v) => `<option value="${v}" ${Number(value) === v ? "selected" : ""}>${ank("months", { n: v })}</option>`).join("")}</select>`;
let anReport = {};
// A late item shows its days late in the user's language
const anLate = (due) => esc(t.plural("an.late", Math.max(1, Math.round((Date.now() - Date.parse(due)) / 86400000))));

/* ---------- Customer: project analytics ---------- */
async function inCustomerAnalytics() {
  const q = new URLSearchParams(location.hash.split("?")[1] || ""),
    period = Number(q.get("period")) || 6,
    projectId = q.get("project") || "";
  const [{ projects: allProjects = [] }, { invoices: allInvoices = [] }] = await Promise.all([api("/projects"), api("/invoices"), anLoadCharts()]);
  const projects = allProjects.filter((p) => !projectId || p.id === projectId),
    ids = new Set(projects.map((p) => p.id)),
    invoices = allInvoices.filter((i) => ids.has(i.projectId)),
    items = inWorkItems(projects),
    today = inToday(),
    months = inMonths(period),
    live = (i) => !["Rejected", "Refunded"].includes(i.status);
  const budget = inSum(projects, (p) => p.budget),
    committed = inSum(items),
    invoiced = inSum(invoices.filter(live)),
    approved = inSum(invoices.filter((i) => ["Approved", "Paid"].includes(i.status))),
    paid = inSum(invoices.filter((i) => i.status === "Paid")),
    done = items.filter((x) => x.status === "Completed").length,
    overdue = items.filter((x) => x.status !== "Completed" && x.dueDate && x.dueDate < today),
    open = invoices.filter((i) => i.status === "Submitted"),
    bySupplier = new Map();
  for (const i of invoices.filter((i) => ["Approved", "Paid", "Submitted"].includes(i.status))) bySupplier.set(i.supplierCompany || i.supplierId, (bySupplier.get(i.supplierCompany || i.supplierId) || 0) + Number(i.amount));
  const statusCounts = ["Completed", "In Progress", "Not Started", "On Hold"]
    .map((s) => ({ label: t("an.work." + s.replaceAll(" ", "")), value: items.filter((x) => x.status === s && !(s !== "Completed" && x.dueDate < today)).length, color: IN_STATUS_COLORS[s] }))
    .concat([{ label: t("an.work.Overdue"), value: overdue.length, color: IN_STATUS_COLORS.Overdue }]);
  anReport = { projects, invoices };
  anData = { projects, invoices, items, months, live };
  const c = (key, params) => ank("c." + key, params);
  app.innerHTML = dashboardShell(
    "customer",
    "analytics",
    [
      `<div class="dash-top"><div><div class="eyebrow">${ank("eyebrow")}</div><h1>${c("title")}</h1><p>${c("lead")}</p></div><div class="in-toolbar"><select id="inProject" aria-label="${c("project")}" data-action="an.filter"><option value="">${c(
        "allProjects",
      )}</option>${allProjects.map((p) => `<option value="${esc(p.id)}" ${p.id === projectId ? "selected" : ""}>${esc(p.name)}</option>`).join("")}</select>${anPeriod(period)}<button class="btn outline" data-action="an.exportCustomer">${ank(
        "export",
      )}</button></div></div>`,
      `<div class="in-kpis">${anKpi("c.budget", anMoney(budget), t.plural("an.c.projects", projects.length))}${anKpi("c.committed", anMoney(committed), t("an.c.ofBudget", { n: inPct(committed, budget) }), committed > budget ? "warn" : "")}${anKpi(
        "c.invoiced",
        anMoney(invoiced),
        t("an.c.paidApproved", { paid: anMoney(paid), approved: anMoney(approved - paid) }),
      )}${anKpi("c.remaining", anMoney(budget - invoiced), t("an.c.left", { n: 100 - inPct(invoiced, budget) }), budget - invoiced < 0 ? "bad" : "good")}${anKpi(
        "c.schedule",
        anRate(done, done + overdue.length),
        t("an.doneOverdue", { done, late: overdue.length }),
        overdue.length ? "warn" : "good",
      )}${anKpi("c.toReview", open.length, anMoney(inSum(open)), open.length ? "warn" : "")}</div>`,
      `<div class="in-grid"><section class="panel in-wide"><div class="panel-title"><h3>${c("budgetVsSpend")}</h3></div>${inHBars(
        projects.map((p) => ({
          label: p.name,
          values: [
            { label: t("an.c.budgetShort"), value: Number(p.budget) || 0, color: "#cbd5e1" },
            { label: t("an.c.committedShort"), value: inSum(inWorkItems([p])), color: "#0ea5e9" },
            { label: t("an.c.invoicedShort"), value: inSum(invoices.filter((i) => i.projectId === p.id && live(i))), color: "#2563eb" },
          ],
        })),
        anMoney,
      )}<div class="in-legend"><span><i style="background:#cbd5e1"></i>${c("budgetShort")}</span><span><i style="background:#0ea5e9"></i>${c("committedCaps")}</span><span><i style="background:#2563eb"></i>${c(
        "invoicedShort",
      )}</span></div></section><section class="panel"><div class="panel-title"><h3>${c("monthly")}</h3></div>${inBars(
        months,
        [
          { label: t("an.c.invoicedShort"), color: "#93c5fd", values: months.map((m) => inSum(invoices.filter((i) => String(i.createdAt).slice(0, 7) === m && live(i)))) },
          { label: t("an.paid"), color: "#2563eb", values: months.map((m) => inSum(invoices.filter((i) => i.status === "Paid" && String(i.paymentDate || i.updatedAt).slice(0, 7) === m))) },
        ],
        anMoney,
      )}</section><section class="panel"><div class="panel-title"><h3>${c("bySupplier")}</h3></div>${inDonut(inTopN(bySupplier), t("an.c.suppliers"), anMoney)}</section><section class="panel"><div class="panel-title"><h3>${c(
        "workStatus",
      )}</h3></div>${inDonut(
        statusCounts.filter((s) => s.value),
        t("an.c.workItems"),
        (v) => v,
      )}</section><section class="panel"><div class="panel-title"><h3>${c("overdue")}</h3></div>${
        overdue
          .slice(0, 8)
          .map(
            (x) =>
              `<a class="pa-row" href="#/customer/projects/${esc(x.p.id)}${x.t ? "/tasks/" + esc(x.t.id) : ""}"><span><b>${x.t ? esc(x.t.name) : `<bdi>${esc(x.ph.name)}</bdi>`}</b><small>${esc(x.p.name)} · <bdi>${esc(x.ph.name)}</bdi></small></span><span class="pa-pill red">${anLate(
                x.dueDate,
              )}</span></a>`,
          )
          .join("") || `<p class="pa-empty">${c("nothingOverdue")}</p>`
      }</section></div>`,
      anCustomSection("customer"),
    ]
      .join(""),
  );
}
actions.on("an.filter", () => {
  const p = new URLSearchParams(),
    pr = document.getElementById("inProject")?.value,
    pe = document.getElementById("inPeriod")?.value;
  if (pr) p.set("project", pr);
  if (pe && pe !== "6") p.set("period", pe);
  navigate(`/${state.user.role}/analytics` + (p.toString() ? "?" + p : ""));
});
actions.on("an.exportCustomer", () => {
  const { projects = [], invoices = [] } = anReport,
    h = (k) => t("an.csv." + k);
  inCsv("craftcrew-project-analytics.csv", [
    ["project", "status", "budget", "committed", "invoiced", "paid", "due"].map(h),
    ...projects.map((p) => {
      const inv = invoices.filter((i) => i.projectId === p.id);
      return [p.name, p.status, p.budget, inSum(inWorkItems([p])), inSum(inv.filter((i) => !["Rejected", "Refunded"].includes(i.status))), inSum(inv.filter((i) => i.status === "Paid")), p.dueDate];
    }),
  ]);
});

/* ---------- Supplier: business analytics ---------- */
async function inSupplierAnalytics() {
  const q = new URLSearchParams(location.hash.split("?")[1] || ""),
    period = Number(q.get("period")) || 6,
    sid = state.user.supplierId;
  const [{ projects = [] }, { invoices = [] }, { bids = [] }, { entries = [] }] = await Promise.all([
    api("/projects"),
    api("/invoices"),
    api("/bids").catch(() => ({})),
    api("/time-entries").catch(() => ({})),
    anLoadCharts(),
  ]);
  const months = inMonths(period),
    today = inToday(),
    items = inWorkItems(projects, sid).filter((x) => !x.t || x.t.acceptanceStatus === "Accepted"),
    paid = invoices.filter((i) => i.status === "Paid"),
    approved = invoices.filter((i) => i.status === "Approved"),
    review = invoices.filter((i) => ["Submitted", "Changes Requested"].includes(i.status)),
    decided = invoices.filter((i) => ["Approved", "Paid", "Rejected", "Changes Requested", "Refunded"].includes(i.status)),
    offers = bids.flatMap((b) => (b.offers || []).filter((o) => o.supplierId === sid).map((o) => ({ ...o, bid: b }))),
    won = offers.filter((o) => o.status === "Accepted"),
    lost = offers.filter((o) => ["Not selected", "Declined"].includes(o.status)),
    done = items.filter((x) => x.status === "Completed").length,
    overdue = items.filter((x) => x.status !== "Completed" && x.dueDate && x.dueDate < today).length,
    byCustomer = new Map(),
    byPerson = new Map();
  for (const i of invoices.filter((i) => ["Approved", "Paid"].includes(i.status))) {
    const name = i.customerCompany || t("an.s.customer");
    byCustomer.set(name, (byCustomer.get(name) || 0) + Number(i.amount));
  }
  for (const e of entries.filter((e) => e.status === "Approved" && months.includes(String(e.workDate).slice(0, 7)))) byPerson.set(e.employeeName, (byPerson.get(e.employeeName) || 0) + Number(e.hours));
  const hoursMonth = inSum(
      entries.filter((e) => e.status === "Approved" && String(e.workDate).slice(0, 7) === months.at(-1)),
      (e) => e.hours,
    ),
    hours = (v) => `${fmt.number(v, 1)} h`,
    s = (key, params) => ank("s." + key, params),
    offerTone = (o) => (o.status === "Accepted" ? "completed" : ["Not selected", "Declined"].includes(o.status) ? "rejected" : "submitted"),
    offerStatus = (st) => (typeof ccLookup("en", "an.s.offer." + st.replaceAll(" ", "")) === "string" ? s("offer." + st.replaceAll(" ", "")) : esc(st));
  anReport = { invoices, offers };
  anData = { projects, invoices, items, months, offers, entries };
  app.innerHTML = dashboardShell(
    "supplier",
    "analytics",
    [
      `<div class="dash-top"><div><div class="eyebrow">${ank("eyebrow")}</div><h1>${s("title")}</h1><p>${s("lead")}</p></div><div class="in-toolbar">${anPeriod(period)}<button class="btn outline" data-action="an.exportSupplier">${ank("export")}</button></div></div>`,
      `<div class="in-kpis">${anKpi("s.revenue", anMoney(inSum(paid)), t.plural("an.s.invoices", paid.length), "good")}${anKpi(
        "s.pipeline",
        anMoney(inSum(approved) + inSum(review)),
        t("an.s.pipelineSub", { approved: anMoney(inSum(approved)), review: anMoney(inSum(review)) }),
      )}${anKpi("s.winRate", anRate(won.length, won.length + lost.length), t("an.s.winSub", { won: won.length, lost: lost.length, open: offers.length - won.length - lost.length }))}${anKpi(
        "s.approvalRate",
        anRate(decided.filter((i) => ["Approved", "Paid"].includes(i.status)).length, decided.length),
        t.plural("an.s.decided", decided.length),
      )}${anKpi("s.onTime", anRate(done, done + overdue), t("an.doneOverdue", { done, late: overdue }), overdue ? "warn" : "good")}${anKpi(
        "s.hours",
        hours(hoursMonth),
        t("an.s.pending", {
          hours: hours(
            inSum(
              entries.filter((e) => e.status === "Pending approval"),
              (e) => e.hours,
            ),
          ),
        }),
      )}</div>`,
      `<div class="in-grid"><section class="panel in-wide"><div class="panel-title"><h3>${s("monthly")}</h3></div>${inBars(
        months,
        [
          { label: t("an.approved"), color: "#93c5fd", values: months.map((m) => inSum(invoices.filter((i) => ["Approved", "Paid"].includes(i.status) && String(i.updatedAt || i.createdAt).slice(0, 7) === m))) },
          { label: t("an.paid"), color: "#2563eb", values: months.map((m) => inSum(paid.filter((i) => String(i.paymentDate || i.updatedAt).slice(0, 7) === m))) },
        ],
        anMoney,
      )}</section><section class="panel"><div class="panel-title"><h3>${s("byCustomer")}</h3></div>${inDonut(inTopN(byCustomer), t("an.s.customers"), anMoney)}</section><section class="panel"><div class="panel-title"><h3>${s(
        "invoiceStatus",
      )}</h3></div>${inDonut(
        ["Paid", "Approved", "Submitted", "Changes Requested", "Rejected"].map((st) => ({ label: anStatus(st), value: inSum(invoices.filter((i) => i.status === st)), color: IN_STATUS_COLORS[st] })).filter((x) => x.value),
        t("an.s.statuses"),
        anMoney,
      )}</section><section class="panel"><div class="panel-title"><h3>${s("byPerson")}</h3></div>${
        byPerson.size
          ? inHBars(
              [...byPerson.entries()].sort((a, b) => b[1] - a[1]).map(([label, value]) => ({ label, values: [{ label: t("an.s.hoursLabel"), value, color: "#2563eb" }] })),
              hours,
            )
          : `<p class="pa-empty">${s("noTime")}</p>`
      }</section><section class="panel"><div class="panel-title"><h3>${s("offers")}</h3></div>${
        offers
          .slice(0, 8)
          .map(
            (o) =>
              `<div class="pa-row"><span><b>${esc(o.bid.title || o.bid.taskName)}</b><small>${esc(anMoney(o.amount))} · ${esc(t.plural("an.s.days", o.deliveryDays))}</small></span><span class="status ${offerTone(o)}">${offerStatus(o.status)}</span></div>`,
          )
          .join("") || `<p class="pa-empty">${s("noOffers")}</p>`
      }</section></div>`,
      anCustomSection("supplier"),
    ]
      .join(""),
  );
  // The supplier's own scorecard (areas/directory.js)
  if (sid) await srScorecardPanel(sid, document.querySelector(".dashboard-content")).catch((e) => console.error(e));
}
actions.on("an.exportSupplier", () => {
  const { invoices = [] } = anReport,
    h = (k) => t("an.csv." + k);
  inCsv("craftcrew-revenue.csv", [
    ["invoice", "customer", "project", "task", "status", "amount", "created"].map(h),
    ...invoices.map((i) => [invNo(i), i.customerCompany, i.projectName || i.projectId, i.taskName, i.status, i.amount, String(i.createdAt).slice(0, 10)]),
  ]);
});

routes.add("/customer/analytics", inCustomerAnalytics);
routes.add("/supplier/analytics", inSupplierAnalytics);

/* ---------- Your own charts (T148): choose the data and the chart type, resize, remove; saved on the account ---------- */
const AN_TYPES = ["bar", "line", "donut"];
const AN_SIZES = ["small", "wide", "full"];
let anCharts = [],
  anData = null;
// What a chart can show, per role. Each source returns month values (months) or labelled values (rows).
const AN_SOURCES = {
  customer: {
    spendMonth: (d) => ({ months: d.months.map((m) => inSum(d.invoices.filter((i) => String(i.createdAt).slice(0, 7) === m && d.live(i)))), fmt: "money" }),
    paidMonth: (d) => ({ months: d.months.map((m) => inSum(d.invoices.filter((i) => i.status === "Paid" && String(i.paymentDate || i.updatedAt).slice(0, 7) === m))), fmt: "money" }),
    invoicesStatus: (d) => ({ rows: anCount(d.invoices, (i) => anStatus(i.status)), fmt: "count" }),
    budgetProject: (d) => ({ rows: d.projects.map((p) => ({ label: p.name, value: Number(p.budget) || 0 })), fmt: "money" }),
    invoicedProject: (d) => ({ rows: d.projects.map((p) => ({ label: p.name, value: inSum(d.invoices.filter((i) => i.projectId === p.id && d.live(i))) })), fmt: "money" }),
    spendSupplier: (d) => ({ rows: anSumBy(d.invoices.filter((i) => ["Approved", "Paid", "Submitted"].includes(i.status)), (i) => i.supplierCompany || i.supplierId, (i) => i.amount), fmt: "money" }),
    workStatus: (d) => ({ rows: anCount(d.items, (x) => tStatus(x.status || "Not Started")), fmt: "count" }),
  },
  supplier: {
    revenueMonth: (d) => ({ months: d.months.map((m) => inSum(d.invoices.filter((i) => i.status === "Paid" && String(i.paymentDate || i.updatedAt).slice(0, 7) === m))), fmt: "money" }),
    invoicedMonth: (d) => ({ months: d.months.map((m) => inSum(d.invoices.filter((i) => String(i.createdAt).slice(0, 7) === m && !["Rejected", "Refunded"].includes(i.status)))), fmt: "money" }),
    revenueCustomer: (d) => ({ rows: anSumBy(d.invoices.filter((i) => ["Approved", "Paid"].includes(i.status)), (i) => i.customerCompany || t("an.s.customer"), (i) => i.amount), fmt: "money" }),
    invoicesStatus: (d) => ({ rows: anCount(d.invoices, (i) => anStatus(i.status)), fmt: "count" }),
    hoursPerson: (d) => ({ rows: anSumBy(d.entries.filter((e) => e.status === "Approved" && d.months.includes(String(e.workDate).slice(0, 7))), (e) => e.employeeName, (e) => e.hours), fmt: "hours" }),
    hoursMonth: (d) => ({ months: d.months.map((m) => inSum(d.entries.filter((e) => e.status === "Approved" && String(e.workDate).slice(0, 7) === m), (e) => e.hours)), fmt: "hours" }),
    offersStatus: (d) => ({ rows: anCount(d.offers, (o) => tStatus(o.status || "Submitted")), fmt: "count" }),
  },
};
function anCount(list, key) {
  const m = new Map();
  for (const x of list) m.set(key(x), (m.get(key(x)) || 0) + 1);
  return [...m].map(([label, value]) => ({ label, value }));
}
function anSumBy(list, key, val) {
  const m = new Map();
  for (const x of list) m.set(key(x), (m.get(key(x)) || 0) + Number(val(x) || 0));
  return [...m].map(([label, value]) => ({ label, value })).sort((a, b) => b.value - a.value);
}
const anFmt = (kind) => (kind === "money" ? anMoney : kind === "hours" ? (v) => `${fmt.number(v, 1)} h` : (v) => fmt.number(v, 0));
// A line chart over the months or the labelled values
function anLine(rows, f) {
  if (!rows.some((r) => r.value)) return `<p class="pa-empty in-empty-chart">${esc(t("common.chart.noData"))}</p>`;
  const W = 600,
    H = 220,
    pad = { l: 12, r: 12, t: 22, b: 30 },
    max = Math.max(1, ...rows.map((r) => r.value)),
    x = (i) => pad.l + (rows.length === 1 ? (W - pad.l - pad.r) / 2 : (i * (W - pad.l - pad.r)) / (rows.length - 1)),
    y = (v) => H - pad.b - (v / max) * (H - pad.t - pad.b),
    pts = rows.map((r, i) => `${x(i).toFixed(1)},${y(r.value).toFixed(1)}`).join(" ");
  return `<svg class="an-line" viewBox="0 0 ${W} ${H}" role="img" aria-label="${esc(rows.map((r) => `${r.label}: ${f(r.value)}`).join(", "))}"><line x1="${pad.l}" x2="${W - pad.r}" y1="${H - pad.b}" y2="${H - pad.b}" class="an-axis"/><polygon points="${pad.l},${H - pad.b} ${pts} ${x(rows.length - 1)},${H - pad.b}" class="an-area"/><polyline points="${pts}" class="an-stroke"/>${rows
    .map(
      (r, i) =>
        `<circle cx="${x(i).toFixed(1)}" cy="${y(r.value).toFixed(1)}" r="4" class="an-dot"><title>${esc(r.label)}: ${esc(f(r.value))}</title></circle><text x="${x(i).toFixed(1)}" y="${H - 10}" text-anchor="middle" class="an-tick">${esc(r.label)}</text>`,
    )
    .join("")}<text x="${pad.l}" y="14" class="an-tick">${esc(f(max))}</text></svg>`;
}
function anChartBody(c, role) {
  const src = AN_SOURCES[role][c.source];
  if (!src || !anData) return "";
  const data = src(anData),
    f = anFmt(data.fmt),
    rows = data.months ? anData.months.map((m, i) => ({ label: inMonthLabel(m), value: data.months[i] })) : data.rows;
  if (c.type === "line") return anLine(rows, f);
  if (c.type === "donut") {
    const top = [...rows].sort((a, b) => b.value - a.value),
      seg = top.slice(0, 5).map((r, i) => ({ ...r, color: IN_COLORS[i] })),
      rest = top.slice(5).reduce((a, r) => a + r.value, 0);
    return inDonut(rest ? [...seg, { label: t("an.others"), value: rest, color: IN_COLORS[5] }] : seg, t("an.my.items"), f);
  }
  if (data.months) return inBars(anData.months, [{ label: c.title || t(`an.my.src.${c.source}`), color: IN_COLORS[0], values: data.months }], f);
  return rows.length ? inHBars(rows.map((r) => ({ label: r.label, values: [{ label: r.label, value: r.value, color: IN_COLORS[0] }] })), f) : `<p class="pa-empty">${esc(t("common.chart.noData"))}</p>`;
}
function anCustomSection(role) {
  const m = (key, params) => ank("my." + key, params),
    tool = (action, c, label, title) => `<button type="button" class="btn small ghost" data-action="${action}" data-id="${esc(c.id)}" title="${title}">${label}</button>`;
  const panels = anCharts
    .filter((c) => AN_SOURCES[role][c.source])
    .map(
      (c) =>
        `<section class="panel an-chart an-${esc(c.size)}${c.tall ? " an-tall" : ""}" data-chart="${esc(c.id)}"><div class="panel-title"><h3>${esc(c.title || t(`an.my.src.${c.source}`))}</h3><div class="an-tools">${tool(
          "an.chartSize",
          c,
          `⤢ ${m("size." + c.size)}`,
          m("resize"),
        )}${tool("an.chartTall", c, c.tall ? m("lower") : m("taller"), m("height"))}${tool("an.chartEdit", c, m("edit"), m("edit"))}${tool("an.chartRemove", c, m("remove"), m("remove"))}</div></div>${anChartBody(c, role)}</section>`,
    )
    .join("");
  return `<section class="an-custom"><div class="an-custom-head"><div><h2>${m("title")}</h2><p>${m("lead")}</p></div><button class="btn primary" data-action="an.chartAdd">${m("add")}</button></div>${
    panels ? `<div class="in-grid an-grid">${panels}</div>` : `<p class="pa-empty an-empty">${m("empty")}</p>`
  }</section>`;
}
const anChartsPage = () => `/${state.user.role}/analytics/charts`;
async function anLoadCharts() {
  try {
    const all = typeof lcLayouts !== "undefined" && lcLayouts && Object.keys(lcLayouts).length ? lcLayouts : (await api("/profile")).user?.layouts || {};
    const list = all[anChartsPage()]?.charts;
    anCharts = Array.isArray(list)
      ? list.filter((c) => c && typeof c.id === "string" && AN_TYPES.includes(c.type)).map((c) => ({ ...c, size: AN_SIZES.includes(c.size) ? c.size : "small", tall: !!c.tall }))
      : [];
  } catch {
    anCharts = [];
  }
}
async function anSaveCharts() {
  try {
    const r = await api("/account/layout", { method: "PUT", body: { page: anChartsPage(), layout: { charts: anCharts } } });
    if (typeof lcLayouts !== "undefined" && r.layouts) lcLayouts = r.layouts;
  } catch (x) {
    toast(x.message, "error");
  }
  route();
}
function anChartForm(c = {}) {
  const role = state.user.role,
    m = (key, params) => ank("my." + key, params),
    opt = (v, label, on) => `<option value="${esc(v)}"${on ? " selected" : ""}>${label}</option>`;
  modal(
    t(c.id ? "an.my.editTitle" : "an.my.addTitle"),
    `<form id="anChartForm" class="modal-form" data-action="an.chartSave" data-id="${esc(c.id || "")}"><label>${m("data")}<select name="source" required>${Object.keys(AN_SOURCES[role])
      .map((k) => opt(k, m("src." + k), k === c.source))
      .join("")}</select></label><label>${m("type")}<select name="type">${AN_TYPES.map((k) => opt(k, m("types." + k), k === (c.type || "bar"))).join("")}</select></label><label>${m("chartTitle")}<input name="title" maxlength="80" value="${esc(
      c.title || "",
    )}" placeholder="${m("titleHint")}"></label><label>${m("sizeLabel")}<select name="size">${AN_SIZES.map((k) => opt(k, m("size." + k), k === (c.size || "small"))).join("")}</select></label><button class="btn primary">${m("save")}</button></form>`,
  );
}
actions.on("an.chartAdd", () => anChartForm());
actions.on("an.chartEdit", (el) => anChartForm(anCharts.find((c) => c.id === el.dataset.id)));
actions.on("an.chartSave", (form) => {
  const b = Object.fromEntries(new FormData(form)),
    id = form.dataset.id,
    c = { source: b.source, type: AN_TYPES.includes(b.type) ? b.type : "bar", title: String(b.title || "").trim().slice(0, 80), size: AN_SIZES.includes(b.size) ? b.size : "small" };
  if (!AN_SOURCES[state.user.role][c.source]) return;
  anCharts = id ? anCharts.map((x) => (x.id === id ? { ...x, ...c } : x)) : [...anCharts, { id: "ch" + Date.now().toString(36), tall: false, ...c }];
  closeModal();
  anSaveCharts();
});
actions.on("an.chartSize", (el) => {
  anCharts = anCharts.map((c) => (c.id === el.dataset.id ? { ...c, size: AN_SIZES[(AN_SIZES.indexOf(c.size) + 1) % AN_SIZES.length] } : c));
  anSaveCharts();
});
actions.on("an.chartTall", (el) => {
  anCharts = anCharts.map((c) => (c.id === el.dataset.id ? { ...c, tall: !c.tall } : c));
  anSaveCharts();
});
actions.on("an.chartRemove", async (el) => {
  if (!(await uiConfirm(t("an.my.removeConfirm")))) return;
  anCharts = anCharts.filter((c) => c.id !== el.dataset.id);
  anSaveCharts();
});
