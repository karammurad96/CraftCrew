/* Insights: analytics pages for customers and suppliers, the drag & drop task board
   and phase ordering, and trend charts for admin reports. Loaded after ui-refresh.js. */
const inEsc = (v) => esc(v ?? "");
const inSum = (list, f = (x) => x.amount) => list.reduce((a, x) => a + (Number(f(x)) || 0), 0);
const inPct = (a, b) => (b ? Math.round((a / b) * 100) : 0);
const inRate = (a, b) => (b ? `${inPct(a, b)}%` : "—");
const inToday = () => new Date().toISOString().slice(0, 10);
const inMonths = (n) => {
  const out = [],
    d = new Date();
  for (let i = n - 1; i >= 0; i--) {
    const x = new Date(d.getFullYear(), d.getMonth() - i, 1);
    out.push(`${x.getFullYear()}-${String(x.getMonth() + 1).padStart(2, "0")}`);
  }
  return out;
};
const inMonthLabel = (m) => new Date(m + "-01").toLocaleDateString("en-GB", { month: "short" });
const IN_COLORS = ["#2563eb", "#0ea5e9", "#14b8a6", "#f59e0b", "#8b5cf6", "#94a3b8"];
const IN_STATUS_COLORS = {
  Completed: "#16a34a",
  "In Progress": "#2563eb",
  "Not Started": "#94a3b8",
  "On Hold": "#f59e0b",
  Overdue: "#dc2626",
  Paid: "#16a34a",
  Approved: "#0ea5e9",
  Submitted: "#f59e0b",
  "Changes Requested": "#8b5cf6",
  Rejected: "#dc2626",
  Refunded: "#64748b",
};

/* ---------- Tiny SVG charts (no external libraries) ---------- */
function inBars(months, series, fmt = money) {
  if (!series.some((s) => s.values.some((v) => v > 0)))
    return '<p class="pa-empty in-empty-chart">No activity in this period yet.</p>';
  const max = Math.max(1, ...months.flatMap((_, i) => series.map((s) => s.values[i] || 0)));
  return `<div class="in-chart"><div class="in-bars">${months.map((m, i) => `<div class="in-bar-group" title="${series.map((s) => `${s.label}: ${fmt(s.values[i] || 0)}`).join("\n")}">${series.map((s) => `<i style="height:${Math.max(2, ((s.values[i] || 0) / max) * 100)}%;background:${s.color}"></i>`).join("")}<small>${inMonthLabel(m)}</small></div>`).join("")}</div><div class="in-legend">${series.map((s) => `<span><i style="background:${s.color}"></i>${inEsc(s.label)} · ${fmt(s.values.reduce((a, b) => a + b, 0))}</span>`).join("")}</div></div>`;
}
function inDonut(segments, centerLabel, fmt = money) {
  const total = segments.reduce((a, s) => a + s.value, 0);
  if (!total) return '<p class="pa-empty">No data yet.</p>';
  let acc = 0;
  const r = 15.9155,
    arcs = segments
      .filter((s) => s.value > 0)
      .map((s) => {
        const len = (s.value / total) * 100,
          arc = `<circle r="${r}" cx="21" cy="21" fill="none" stroke="${s.color}" stroke-width="6" stroke-dasharray="${len} ${100 - len}" stroke-dashoffset="${25 - acc}"><title>${inEsc(s.label)}: ${fmt(s.value)}</title></circle>`;
        acc += len;
        return arc;
      })
      .join("");
  return `<div class="in-donut"><svg viewBox="0 0 42 42" role="img" aria-label="${inEsc(centerLabel)}"><circle r="${r}" cx="21" cy="21" fill="none" stroke="#eef2f7" stroke-width="6"/>${arcs}<text x="21" y="20.5" text-anchor="middle" class="in-donut-num">${segments.length}</text><text x="21" y="26" text-anchor="middle" class="in-donut-lbl">${inEsc(centerLabel)}</text></svg><ul>${segments.map((s) => `<li><i style="background:${s.color}"></i><span>${inEsc(s.label)}</span><b>${fmt(s.value)}</b><small>${inPct(s.value, total)}%</small></li>`).join("")}</ul></div>`;
}
function inHBars(rows, fmt = money) {
  const max = Math.max(1, ...rows.flatMap((r) => r.values.map((v) => v.value)));
  return `<div class="in-hbars">${rows.map((r) => `<div class="in-hbar"><span title="${inEsc(r.label)}">${inEsc(r.label)}</span><div>${r.values.map((v) => `<div class="in-hbar-track" title="${inEsc(v.label)}: ${fmt(v.value)}"><i style="width:${Math.max(0.5, (v.value / max) * 100)}%;background:${v.color}"></i><em>${fmt(v.value)}</em></div>`).join("")}</div></div>`).join("")}</div>`;
}
function inKpi(label, value, sub, tone = "") {
  return `<div class="in-kpi ${tone}"><span class="cc-label">${label}</span><strong>${value}</strong><small>${sub}</small></div>`;
}
function inTopN(map, n = 5) {
  const rows = [...map.entries()].sort((a, b) => b[1] - a[1]),
    top = rows.slice(0, n).map(([label, value], i) => ({ label, value, color: IN_COLORS[i] })),
    rest = rows.slice(n).reduce((a, [, v]) => a + v, 0);
  return rest ? [...top, { label: "Others", value: rest, color: IN_COLORS[5] }] : top;
}
function inWorkItems(projects, supplierId) {
  const out = [];
  for (const p of projects)
    for (const ph of p.phases || []) {
      const tasks = ph.tasks || [];
      if (!tasks.length && (!supplierId || ph.supplierId === supplierId))
        out.push({ p, ph, status: ph.status, dueDate: ph.dueDate, amount: ph.orderAmount });
      for (const t of tasks)
        if (!supplierId || t.assignedSupplierId === supplierId)
          out.push({ p, ph, t, status: t.status, dueDate: t.dueDate, amount: t.orderAmount });
    }
  return out;
}
function inCsv(name, rows) {
  const q = (v) => `"${String(v ?? "").replaceAll('"', '""')}"`,
    a = document.createElement("a");
  a.href = URL.createObjectURL(
    new Blob(["﻿" + rows.map((r) => r.map(q).join(";")).join("\r\n")], { type: "text/csv;charset=utf-8" }),
  );
  a.download = name;
  a.click();
  setTimeout(() => URL.revokeObjectURL(a.href), 5000);
}
function inPeriodSelect(value) {
  return `<select id="inPeriod" aria-label="Period">${[
    [3, "Last 3 months"],
    [6, "Last 6 months"],
    [12, "Last 12 months"],
  ]
    .map(([v, l]) => `<option value="${v}" ${Number(value) === v ? "selected" : ""}>${l}</option>`)
    .join("")}</select>`;
}

/* ---------- Customer analytics ---------- */
async function inCustomerAnalytics() {
  const q = new URLSearchParams(location.hash.split("?")[1] || ""),
    period = Number(q.get("period")) || 6,
    projectId = q.get("project") || "";
  const [{ projects: allProjects = [] }, { invoices: allInvoices = [] }] = await Promise.all([
    api("/projects"),
    api("/invoices"),
  ]);
  const projects = allProjects.filter((p) => !projectId || p.id === projectId),
    ids = new Set(projects.map((p) => p.id)),
    invoices = allInvoices.filter((i) => ids.has(i.projectId));
  const items = inWorkItems(projects),
    today = inToday(),
    months = inMonths(period);
  const budget = inSum(projects, (p) => p.budget),
    committed = inSum(items),
    invoiced = inSum(invoices.filter((i) => !["Rejected", "Refunded"].includes(i.status))),
    approved = inSum(invoices.filter((i) => ["Approved", "Paid"].includes(i.status))),
    paid = inSum(invoices.filter((i) => i.status === "Paid"));
  const done = items.filter((x) => x.status === "Completed").length,
    overdue = items.filter((x) => x.status !== "Completed" && x.dueDate && x.dueDate < today),
    open = invoices.filter((i) => i.status === "Submitted");
  const bySupplier = new Map();
  for (const i of invoices.filter((i) => ["Approved", "Paid", "Submitted"].includes(i.status)))
    bySupplier.set(
      i.supplierCompany || i.supplierId,
      (bySupplier.get(i.supplierCompany || i.supplierId) || 0) + Number(i.amount),
    );
  const statusCounts = ["Completed", "In Progress", "Not Started", "On Hold"]
    .map((s) => ({
      label: s,
      value: items.filter((x) => x.status === s && !(s !== "Completed" && x.dueDate < today)).length,
      color: IN_STATUS_COLORS[s],
    }))
    .concat([{ label: "Overdue", value: overdue.length, color: IN_STATUS_COLORS.Overdue }]);
  window.inReport = { projects, invoices };
  app.innerHTML = dashboardShell(
    "customer",
    "analytics",
    `<div class="dash-top"><div><div class="eyebrow">INSIGHTS</div><h1>Project analytics</h1><p>Budget, spend, schedule health and supplier spend across your projects.</p></div><div class="in-toolbar"><select id="inProject" aria-label="Project"><option value="">All projects</option>${allProjects.map((p) => `<option value="${p.id}" ${p.id === projectId ? "selected" : ""}>${inEsc(p.name)}</option>`).join("")}</select>${inPeriodSelect(period)}<button class="btn outline" onclick="inExportCustomer()">Export CSV</button></div></div>
    <div class="in-kpis">${inKpi("Total budget", money(budget), `${projects.length} project(s)`)}${inKpi("Committed to suppliers", money(committed), `${inPct(committed, budget)}% of budget`, committed > budget ? "warn" : "")}${inKpi("Invoiced", money(invoiced), `${money(paid)} paid · ${money(approved - paid)} approved`)}${inKpi("Budget remaining", money(budget - invoiced), `${100 - inPct(invoiced, budget)}% left`, budget - invoiced < 0 ? "bad" : "good")}${inKpi("Schedule health", inRate(done, done + overdue.length), `${done} done · ${overdue.length} overdue`, overdue.length ? "warn" : "good")}${inKpi("Invoices to review", open.length, money(inSum(open)), open.length ? "warn" : "")}</div>
    <div class="in-grid">
      <section class="panel in-wide"><div class="panel-title"><h3>Budget vs. spend by project</h3></div>${inHBars(
        projects.map((p) => {
          const inv = invoices.filter(
            (i) => i.projectId === p.id && !["Rejected", "Refunded"].includes(i.status),
          );
          return {
            label: p.name,
            values: [
              { label: "Budget", value: Number(p.budget) || 0, color: "#cbd5e1" },
              { label: "Committed", value: inSum(inWorkItems([p])), color: "#0ea5e9" },
              { label: "Invoiced", value: inSum(inv), color: "#2563eb" },
            ],
          };
        }),
      )}<div class="in-legend"><span><i style="background:#cbd5e1"></i>Budget</span><span><i style="background:#0ea5e9"></i>Committed (order caps)</span><span><i style="background:#2563eb"></i>Invoiced</span></div></section>
      <section class="panel"><div class="panel-title"><h3>Monthly spend</h3></div>${inBars(months, [
        {
          label: "Invoiced",
          color: "#93c5fd",
          values: months.map((m) =>
            inSum(
              invoices.filter(
                (i) => String(i.createdAt).slice(0, 7) === m && !["Rejected", "Refunded"].includes(i.status),
              ),
            ),
          ),
        },
        {
          label: "Paid",
          color: "#2563eb",
          values: months.map((m) =>
            inSum(
              invoices.filter(
                (i) => i.status === "Paid" && String(i.paymentDate || i.updatedAt).slice(0, 7) === m,
              ),
            ),
          ),
        },
      ])}</section>
      <section class="panel"><div class="panel-title"><h3>Spend by supplier</h3></div>${inDonut(inTopN(bySupplier), "suppliers")}</section>
      <section class="panel"><div class="panel-title"><h3>Work status</h3></div>${inDonut(
        statusCounts.filter((s) => s.value),
        "work items",
        (v) => v,
      )}</section>
      <section class="panel"><div class="panel-title"><h3>Overdue work</h3></div>${
        overdue
          .slice(0, 8)
          .map(
            (x) =>
              `<a class="pa-row" href="#/customer/projects/${x.p.id}${x.t ? "/tasks/" + x.t.id : ""}"><span><b>${inEsc(x.t?.name || x.ph.name)}</b><small>${inEsc(x.p.name)} · ${inEsc(x.ph.name)}</small></span><span class="pa-pill red">${Math.round((Date.now() - Date.parse(x.dueDate)) / 86400000)}d late</span></a>`,
          )
          .join("") || '<p class="pa-empty">Nothing is overdue. 🎉</p>'
      }</section>
    </div>`,
  );
  inBindToolbar("/customer/analytics");
}
function inExportCustomer() {
  const { projects = [], invoices = [] } = window.inReport || {};
  inCsv("craftcrew-project-analytics.csv", [
    ["Project", "Status", "Budget", "Committed", "Invoiced", "Paid", "Due"],
    ...projects.map((p) => {
      const inv = invoices.filter((i) => i.projectId === p.id);
      return [
        p.name,
        p.status,
        p.budget,
        inSum(inWorkItems([p])),
        inSum(inv.filter((i) => !["Rejected", "Refunded"].includes(i.status))),
        inSum(inv.filter((i) => i.status === "Paid")),
        p.dueDate,
      ];
    }),
  ]);
}

/* ---------- Supplier analytics ---------- */
async function inSupplierAnalytics() {
  const q = new URLSearchParams(location.hash.split("?")[1] || ""),
    period = Number(q.get("period")) || 6,
    sid = state.user.supplierId;
  const [{ projects = [] }, { invoices = [] }, { bids = [] }, { entries = [] }] = await Promise.all([
    api("/projects"),
    api("/invoices"),
    api("/bids").catch(() => ({})),
    api("/time-entries").catch(() => ({})),
  ]);
  const months = inMonths(period),
    today = inToday(),
    items = inWorkItems(projects, sid).filter((x) => !x.t || x.t.acceptanceStatus === "Accepted");
  const paid = invoices.filter((i) => i.status === "Paid"),
    approved = invoices.filter((i) => i.status === "Approved"),
    review = invoices.filter((i) => ["Submitted", "Changes Requested"].includes(i.status)),
    decided = invoices.filter((i) =>
      ["Approved", "Paid", "Rejected", "Changes Requested", "Refunded"].includes(i.status),
    );
  const offers = bids.flatMap((b) =>
      (b.offers || []).filter((o) => o.supplierId === sid).map((o) => ({ ...o, bid: b })),
    ),
    won = offers.filter((o) => o.status === "Accepted"),
    lost = offers.filter((o) => ["Not selected", "Declined"].includes(o.status));
  const done = items.filter((x) => x.status === "Completed").length,
    overdue = items.filter((x) => x.status !== "Completed" && x.dueDate && x.dueDate < today).length;
  const byCustomer = new Map();
  for (const i of invoices.filter((i) => ["Approved", "Paid"].includes(i.status)))
    byCustomer.set(
      i.customerCompany || "Customer",
      (byCustomer.get(i.customerCompany || "Customer") || 0) + Number(i.amount),
    );
  const byPerson = new Map();
  for (const e of entries.filter(
    (e) => e.status === "Approved" && months.includes(String(e.workDate).slice(0, 7)),
  ))
    byPerson.set(e.employeeName, (byPerson.get(e.employeeName) || 0) + Number(e.hours));
  const hoursMonth = inSum(
    entries.filter((e) => e.status === "Approved" && String(e.workDate).slice(0, 7) === months.at(-1)),
    (e) => e.hours,
  );
  window.inReport = { invoices, offers };
  app.innerHTML = dashboardShell(
    "supplier",
    "analytics",
    `<div class="dash-top"><div><div class="eyebrow">INSIGHTS</div><h1>Business analytics</h1><p>Revenue, pipeline, bid success, delivery performance and team utilisation.</p></div><div class="in-toolbar">${inPeriodSelect(period)}<button class="btn outline" onclick="inExportSupplier()">Export CSV</button></div></div>
    <div class="in-kpis">${inKpi("Revenue paid", money(inSum(paid)), `${paid.length} invoice(s)`, "good")}${inKpi("Pipeline", money(inSum(approved) + inSum(review)), `${money(inSum(approved))} approved · ${money(inSum(review))} in review`)}${inKpi("Bid win rate", inRate(won.length, won.length + lost.length), `${won.length} won · ${lost.length} lost · ${offers.length - won.length - lost.length} open`)}${inKpi("Invoice approval rate", inRate(decided.filter((i) => ["Approved", "Paid"].includes(i.status)).length, decided.length), `${decided.length} decided invoice(s)`)}${inKpi("On-time delivery", inRate(done, done + overdue), `${done} done · ${overdue} overdue`, overdue ? "warn" : "good")}${inKpi(
      "Approved hours this month",
      `${hoursMonth.toFixed(1)} h`,
      `${inSum(
        entries.filter((e) => e.status === "Pending approval"),
        (e) => e.hours,
      ).toFixed(1)} h pending approval`,
    )}</div>
    <div class="in-grid">
      <section class="panel in-wide"><div class="panel-title"><h3>Monthly revenue</h3></div>${inBars(months, [
        {
          label: "Approved",
          color: "#93c5fd",
          values: months.map((m) =>
            inSum(
              invoices.filter(
                (i) =>
                  ["Approved", "Paid"].includes(i.status) &&
                  String(i.updatedAt || i.createdAt).slice(0, 7) === m,
              ),
            ),
          ),
        },
        {
          label: "Paid",
          color: "#2563eb",
          values: months.map((m) =>
            inSum(paid.filter((i) => String(i.paymentDate || i.updatedAt).slice(0, 7) === m)),
          ),
        },
      ])}</section>
      <section class="panel"><div class="panel-title"><h3>Revenue by customer</h3></div>${inDonut(inTopN(byCustomer), "customers")}</section>
      <section class="panel"><div class="panel-title"><h3>Invoice status</h3></div>${inDonut(
        ["Paid", "Approved", "Submitted", "Changes Requested", "Rejected"]
          .map((s) => ({
            label: s,
            value: inSum(invoices.filter((i) => i.status === s)),
            color: IN_STATUS_COLORS[s],
          }))
          .filter((s) => s.value),
        "statuses",
      )}</section>
      <section class="panel"><div class="panel-title"><h3>Approved hours by team member</h3></div>${
        byPerson.size
          ? inHBars(
              [...byPerson.entries()]
                .sort((a, b) => b[1] - a[1])
                .map(([label, value]) => ({ label, values: [{ label: "Hours", value, color: "#2563eb" }] })),
              (v) => `${v.toFixed(1)} h`,
            )
          : '<p class="pa-empty">No approved time in this period.</p>'
      }</section>
      <section class="panel"><div class="panel-title"><h3>Offers</h3></div>${
        offers
          .slice(0, 8)
          .map(
            (o) =>
              `<div class="pa-row"><span><b>${inEsc(o.bid.title || o.bid.taskName)}</b><small>${money(o.amount)} · ${o.deliveryDays} days</small></span><span class="status ${o.status === "Accepted" ? "completed" : ["Not selected", "Declined"].includes(o.status) ? "rejected" : "submitted"}">${inEsc(o.status)}</span></div>`,
          )
          .join("") || '<p class="pa-empty">No offers submitted yet.</p>'
      }</section>
    </div>`,
  );
  inBindToolbar("/supplier/analytics");
}
function inExportSupplier() {
  const { invoices = [] } = window.inReport || {};
  inCsv("craftcrew-revenue.csv", [
    ["Invoice", "Customer", "Project", "Task", "Status", "Amount", "Created"],
    ...invoices.map((i) => [
      invNo(i),
      i.customerCompany,
      i.projectName || i.projectId,
      i.taskName,
      i.status,
      i.amount,
      String(i.createdAt).slice(0, 10),
    ]),
  ]);
}
function inBindToolbar(base) {
  const go = () => {
    const p = new URLSearchParams();
    const pr = document.getElementById("inProject")?.value,
      pe = document.getElementById("inPeriod")?.value;
    if (pr) p.set("project", pr);
    if (pe && pe !== "6") p.set("period", pe);
    navigate(base + (p.toString() ? "?" + p : ""));
  };
  document.getElementById("inProject")?.addEventListener("change", go);
  document.getElementById("inPeriod")?.addEventListener("change", go);
}

/* ---------- Task board with drag & drop (and phase ordering) ---------- */
const IN_COLUMNS = ["Not Started", "In Progress", "On Hold", "Completed"];
async function inBoard(role, pid) {
  const { project: p, suppliers = [] } = await api(`/projects/${pid}`),
    q = new URLSearchParams(location.hash.split("?")[1] || ""),
    phaseFilter = q.get("phase") || "",
    mine = role === "supplier";
  const supplierName = (id) => suppliers.find((s) => s.id === id)?.company || "",
    today = inToday();
  const cards = inWorkItems([p], mine ? state.user.supplierId : null)
    .filter((x) => !phaseFilter || x.ph.id === phaseFilter)
    .map((x) => {
      const canMove =
        role === "customer" ||
        (x.t
          ? x.t.assignedSupplierId === state.user.supplierId && x.t.acceptanceStatus === "Accepted"
          : x.ph.supplierId === state.user.supplierId);
      const late = x.status !== "Completed" && x.dueDate && x.dueDate < today,
        sup = supplierName(x.t ? x.t.assignedSupplierId : x.ph.supplierId);
      return {
        x,
        canMove,
        html: `<article class="in-card ${late ? "late" : ""} ${canMove ? "" : "locked"}" draggable="${canMove}" data-phase="${x.ph.id}" data-task="${x.t?.id || ""}" tabindex="0"><div class="in-card-top"><span class="in-card-phase">${inEsc(x.ph.name)}</span>${canMove ? '<span class="in-card-grip" aria-hidden="true">⋮⋮</span>' : '<span title="Only the assigned supplier or the customer can move this card">🔒</span>'}</div><a href="#/${role}/projects/${pid}/${x.t ? "tasks/" + x.t.id : "phases/" + x.ph.id}"><b>${inEsc(x.t?.name || x.ph.name)}</b></a>${x.t ? `<div class="in-card-progress"><i style="width:${Number(x.t.progress) || 0}%"></i></div>` : ""}<div class="in-card-meta"><span class="${late ? "danger-text" : ""}">📅 ${date(x.dueDate)}</span>${sup ? `<span title="${inEsc(sup)}">🏭 ${inEsc(sup)}</span>` : '<span class="subtle">Unassigned</span>'}</div></article>`,
      };
    });
  const phases = p.phases || [];
  app.innerHTML = dashboardShell(
    role,
    "projects",
    `<div class="breadcrumb"><a href="#/${role}/projects/${pid}">← ${inEsc(p.name)}</a></div><div class="dash-top"><div><div class="eyebrow">TASK BOARD</div><h1>${inEsc(p.name)}</h1><p>Drag cards between columns to update their status. ${role === "customer" ? "Drag phases on the right to change the delivery order." : "You can move the work assigned to your company."}</p></div><div class="in-toolbar"><select id="inPhase" aria-label="Phase"><option value="">All phases</option>${phases.map((ph) => `<option value="${ph.id}" ${ph.id === phaseFilter ? "selected" : ""}>${inEsc(ph.name)}</option>`).join("")}</select><a class="btn outline" href="#/${role}/projects/${pid}">List view</a></div></div>
    <div class="in-board-wrap ${role === "customer" ? "with-phases" : ""}"><div class="in-board">${IN_COLUMNS.map(
      (col) => {
        const list = cards.filter((c) => (c.x.status || "Not Started") === col);
        return `<section class="in-col" data-status="${col}"><header><span class="in-dot" style="background:${IN_STATUS_COLORS[col]}"></span><b>${col}</b><span class="ui-count">${list.length}</span></header><div class="in-col-body">${list.map((c) => c.html).join("") || '<p class="in-col-empty">Drop cards here</p>'}</div></section>`;
      },
    ).join("")}</div>
    ${role === "customer" ? `<aside class="panel in-phase-order"><div class="panel-title"><h3>Phase order</h3></div><p class="subtle">Drag to reorder the waterfall sequence.</p><ol id="inPhaseList">${phases.map((ph, i) => `<li draggable="true" data-id="${ph.id}"><span class="in-card-grip">⋮⋮</span><span class="in-phase-num">${i + 1}</span><span><b>${inEsc(ph.name)}</b><small>${date(ph.startDate)} – ${date(ph.dueDate)} · ${inEsc(ph.status)}</small></span></li>`).join("")}</ol></aside>` : ""}</div>`,
  );
  document.getElementById("inPhase").onchange = (e) =>
    navigate(`/${role}/projects/${pid}/board${e.target.value ? "?phase=" + e.target.value : ""}`);
  inBindBoard(role, p);
  if (role === "customer") inBindPhaseOrder(p);
}
function inBindBoard(role, p) {
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
      const col = card.closest(".in-col"),
        i = IN_COLUMNS.indexOf(col.dataset.status),
        next = IN_COLUMNS[i + (e.key === "ArrowRight" ? 1 : -1)];
      if (next) inMoveCard(role, p, card, next);
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
      if (dragged && dragged.closest(".in-col") !== col) inMoveCard(role, p, dragged, col.dataset.status);
      dragged = null;
    });
  });
}
async function inMoveCard(role, p, card, status) {
  const from = card.closest(".in-col"),
    to = document.querySelector(`.in-col[data-status="${status}"] .in-col-body`);
  to.querySelector(".in-col-empty")?.remove();
  to.prepend(card);
  card.focus();
  const count = () =>
    document
      .querySelectorAll(".in-col")
      .forEach(
        (c) => (c.querySelector("header .ui-count").textContent = c.querySelectorAll(".in-card").length),
      );
  count();
  try {
    if (card.dataset.task)
      await api(`/projects/${p.id}/phases/${card.dataset.phase}/tasks/${card.dataset.task}`, {
        method: "PATCH",
        body: { status, ...(status === "Completed" ? { progress: 100 } : {}) },
      });
    else await api(`/projects/${p.id}/phases/${card.dataset.phase}`, { method: "PUT", body: { status } });
    toast(`Moved to ${status}`);
    if (status === "Completed") card.querySelector(".in-card-progress i")?.style.setProperty("width", "100%");
  } catch (e) {
    from.querySelector(".in-col-body").prepend(card);
    count();
    toast(e.message, "error");
  }
}
function inBindPhaseOrder(p) {
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
        toast("Phase order saved");
      } catch (e) {
        toast(e.message, "error");
      }
    });
  });
}

/* ---------- Admin reports: trend charts ---------- */
const inBaseAdminReports = adminReports;
adminReports = async function () {
  await inBaseAdminReports();
  const [{ invoices = [] }, { users = [] }, { applications = [] }] = await Promise.all([
    api("/invoices"),
    api("/admin/users"),
    api("/admin/applications"),
  ]);
  const months = inMonths(12),
    funnel = [
      ["Received", applications.length],
      [
        "In verification",
        applications.filter(
          (a) =>
            ["Verified", "References", "Manual Review", "Decision & Badge"].includes(a.stage) ||
            a.status === "Approved",
        ).length,
      ],
      ["Approved", applications.filter((a) => a.status === "Approved").length],
    ];
  const html = `<div class="in-grid in-admin-charts"><section class="panel in-wide"><div class="panel-title"><h3>Gross marketplace volume · 12 months</h3></div>${inBars(
    months,
    [
      {
        label: "Invoiced",
        color: "#93c5fd",
        values: months.map((m) => inSum(invoices.filter((i) => String(i.createdAt).slice(0, 7) === m))),
      },
      {
        label: "Paid",
        color: "#2563eb",
        values: months.map((m) =>
          inSum(
            invoices.filter(
              (i) => i.status === "Paid" && String(i.paymentDate || i.updatedAt).slice(0, 7) === m,
            ),
          ),
        ),
      },
    ],
  )}</section>
    <section class="panel"><div class="panel-title"><h3>New accounts · 12 months</h3></div>${inBars(
      months,
      [
        {
          label: "Customers",
          color: "#14b8a6",
          values: months.map(
            (m) => users.filter((u) => u.role === "customer" && String(u.createdAt).slice(0, 7) === m).length,
          ),
        },
        {
          label: "Suppliers",
          color: "#8b5cf6",
          values: months.map(
            (m) => users.filter((u) => u.role === "supplier" && String(u.createdAt).slice(0, 7) === m).length,
          ),
        },
      ],
      (v) => v,
    )}</section>
    <section class="panel"><div class="panel-title"><h3>Vetting funnel</h3></div>${inHBars(
      funnel.map(([label, value], i) => ({ label, values: [{ label, value, color: IN_COLORS[i] }] })),
      (v) => v,
    )}<p class="pa-note">${inPct(funnel[2][1], funnel[0][1])}% of applications approved · ${applications.filter((a) => a.status === "Rejected").length} rejected · ${applications.filter((a) => a.status === "On Hold").length} on hold</p></section></div>`;
  (
    document.querySelector(".dashboard-content .pa-reports") ||
    document.querySelector(".dashboard-content .cc-grid4")
  )?.insertAdjacentHTML("beforebegin", html);
};

/* ---------- Navigation: Analytics link, Board button on project pages ---------- */
function inNav() {
  const nav = document.querySelector(".sidebar nav"),
    role = state.user?.role;
  // Pages rendered here bypass the older router layers, so apply their sidebar additions too.
  if (nav && role && !nav.dataset.ccEnhanced && typeof ccNav === "function") ccNav(role);
  if (typeof ffFixSidebarState === "function") ffFixSidebarState();
  if (!nav || !["customer", "supplier"].includes(role) || nav.querySelector(`[href="#/${role}/analytics"]`))
    return;
  const a = document.createElement("a"),
    here = location.hash.split("?")[0] === `#/${role}/analytics`;
  a.href = `#/${role}/analytics`;
  a.textContent = "Analytics";
  if (here) {
    nav.querySelectorAll("a.active").forEach((x) => x.classList.remove("active"));
    a.className = "active";
  }
  nav.querySelector(`[href="#/${role}/dashboard"]`)?.after(a);
}
function inBoardButton(role, pid) {
  const top =
    document
      .querySelector(
        ".dashboard-content .dash-top, .dashboard-content .wf-project-head, .dashboard-content h1",
      )
      ?.closest(".dash-top") || document.querySelector(".dashboard-content .dash-top");
  if (document.querySelector(".in-board-btn")) return;
  const html = `<a class="btn outline in-board-btn" href="#/${role}/projects/${pid}/board">▦ Board view</a>`;
  const actions = top?.querySelector(".action-row, .cc-actions, div:last-child");
  if (actions && actions !== top.firstElementChild) actions.insertAdjacentHTML("afterbegin", html);
  else
    (top || document.querySelector(".dashboard-content"))?.insertAdjacentHTML(
      top ? "beforeend" : "afterbegin",
      html,
    );
}
const inBaseRoute = window.route;
window.route = async function () {
  const path = location.hash.replace(/^#/, "").split("?")[0],
    parts = path.split("/").filter(Boolean),
    role = state.user?.role;
  try {
    if (parts[1] === "analytics" && parts[0] === role && role === "customer") {
      await inCustomerAnalytics();
      inNav();
      return;
    }
    if (parts[1] === "analytics" && parts[0] === role && role === "supplier") {
      await inSupplierAnalytics();
      inNav();
      return;
    }
    if (
      ["customer", "supplier"].includes(parts[0]) &&
      parts[0] === role &&
      parts[1] === "projects" &&
      parts[2] &&
      parts[3] === "board"
    ) {
      await inBoard(role, parts[2]);
      inNav();
      return;
    }
  } catch (e) {
    console.error(e);
    toast(e.message, "error");
    return;
  }
  const result = await inBaseRoute();
  inNav();
  if (
    ["customer", "supplier"].includes(parts[0]) &&
    parts[1] === "projects" &&
    parts[2] &&
    parts[2] !== "new" &&
    parts.length === 3
  )
    inBoardButton(parts[0], parts[2]);
  return result;
};
