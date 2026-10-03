/* Insights: the shared chart helpers (bars, donut, horizontal bars, KPI tiles) and small calculations. The
   analytics pages are in areas/analytics.js (T135c), admin reports in areas/admin.js (T134b). */
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
const inMonthLabel = (m) => new Date(m + "-01").toLocaleDateString(fmt.locale(), { month: "short" });
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
    return `<p class="pa-empty in-empty-chart">${esc(t("common.chart.noActivity"))}</p>`;
  const max = Math.max(1, ...months.flatMap((_, i) => series.map((s) => s.values[i] || 0)));
  return `<div class="in-chart"><div class="in-bars">${months.map((m, i) => `<div class="in-bar-group" title="${series.map((s) => `${s.label}: ${fmt(s.values[i] || 0)}`).join("\n")}">${series.map((s) => `<i style="height:${Math.max(2, ((s.values[i] || 0) / max) * 100)}%;background:${s.color}"></i>`).join("")}<small>${inMonthLabel(m)}</small></div>`).join("")}</div><div class="in-legend">${series.map((s) => `<span><i style="background:${s.color}"></i>${inEsc(s.label)} · ${fmt(s.values.reduce((a, b) => a + b, 0))}</span>`).join("")}</div></div>`;
}
function inDonut(segments, centerLabel, fmt = money) {
  const total = segments.reduce((a, s) => a + s.value, 0);
  if (!total) return `<p class="pa-empty">${esc(t("common.chart.noData"))}</p>`;
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
  return `<div class="in-hbars" tabindex="0" role="region" aria-label="${esc(t("common.chart.bars"))}">${rows.map((r) => `<div class="in-hbar"><span title="${inEsc(r.label)}">${inEsc(r.label)}</span><div>${r.values.map((v) => `<div class="in-hbar-track" title="${inEsc(v.label)}: ${fmt(v.value)}"><i style="width:${Math.max(0.5, (v.value / max) * 100)}%;background:${v.color}"></i><em>${fmt(v.value)}</em></div>`).join("")}</div></div>`).join("")}</div>`;
}
function inKpi(label, value, sub, tone = "") {
  return `<div class="in-kpi ${tone}"><span class="cc-label">${label}</span><strong>${value}</strong><small>${sub}</small></div>`;
}
// The n largest entries of a map for a donut; the rest as one "Others" slice
function inTopN(map, n = 5) {
  const rows = [...map.entries()].sort((a, b) => b[1] - a[1]),
    top = rows.slice(0, n).map(([label, value], i) => ({ label, value, color: IN_COLORS[i] })),
    rest = rows.slice(n).reduce((a, [, v]) => a + v, 0);
  return rest ? [...top, { label: t("an.others"), value: rest, color: IN_COLORS[5] }] : top;
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
