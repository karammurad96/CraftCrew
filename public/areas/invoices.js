/* Area: invoices (T130a, T130b). The invoice lists of customers and suppliers (filters, sums, CSV), the invoice page laid
   out as paper with a review panel (board InvoiceReview, T101), approve / request changes / reject, the supplier's
   "Fix & resubmit", the new-invoice form, and the PDF, XRechnung and email downloads. Drawn with translation keys; company names,
   positions and notes are data. The function names stay because other pages (approvals) still call them. */
const ink = (key, params) => esc(t("inv." + key, params));
const inDom = (text) => `<bdi data-i18n="dom">${esc(text)}</bdi>`;
const inKeys = (html) => html.replace(/^<(\w+)/, '<$1 data-i18n="keys"');
const IN_STATUSES = ["Submitted", "Approved", "Changes Requested", "Rejected", "Paid"];
const inStatus = (s) => (IN_STATUSES.includes(s) ? ink("statuses." + s) : inDom(s));
const inQuery = () => new URLSearchParams(location.hash.split("?")[1] || "");
function reviewInvoiceScope() {
  const q = inQuery(),
    out = new URLSearchParams();
  for (const k of ["project", "phase", "task", "back"]) if (q.has(k)) out.set(k, q.get(k));
  return out;
}
function reviewInvoiceUrl(role, id) {
  return `/${role}/invoice/${encodeURIComponent(id)}?back=${encodeURIComponent(location.hash.replace(/^#/, ""))}`;
}
// The date an open invoice is due (T108): its payment date once approved, before that the due date of its terms.
const rvDue = (i) => (["Submitted", "Approved", "Changes Requested"].includes(i.status) ? i.scheduledPayment || i.dueDate || "" : "");
function inDaysLate(isoDate) {
  const due = String(isoDate || "").slice(0, 10);
  if (!Date.parse(due)) return ink("time.overdue");
  // Calendar days in the user's time zone, not 24-hour periods since midnight UTC
  const now = new Date(),
    today = new Date(now.getTime() - now.getTimezoneOffset() * 60000).toISOString().slice(0, 10);
  return esc(t.plural("inv.time.late", Math.max(1, Math.round((Date.parse(today) - Date.parse(due)) / 86400000))));
}
// Suppliers see how long an invoice has waited for review; approved invoices past their payment date are overdue,
// and so are invoices still in review after their due date.
function rvInvoiceTiming(i, role) {
  if (i.status === "Approved" && i.overdue) return ` <span class="status overdue">${inDaysLate(i.scheduledPayment)}</span>`;
  if (i.status === "Submitted" && i.dueDate && i.dueDate < dsToday()) return ` <span class="status overdue">${inDaysLate(i.dueDate)}</span>`;
  if (role !== "supplier" || i.status !== "Submitted") return "";
  const days = Math.floor((Date.now() - Date.parse(i.resubmittedAt || i.createdAt)) / 86400000);
  return `<small>${days < 1 ? ink("time.today") : esc(t.plural("inv.time.waiting", days))}</small>`;
}

/* ---------- Downloads ---------- */
async function wfDownloadInvoice(id, kind = "pdf") {
  try {
    const r = await fetch(`/api/invoices/${encodeURIComponent(id)}/${kind === "email" ? "email-draft" : kind === "xrechnung" ? "xrechnung" : "pdf"}`, { credentials: "same-origin" });
    if (!r.ok) {
      const e = await r.json().catch(() => ({}));
      throw new Error(e.error || t("inv.act.fileFailed"));
    }
    const blob = await r.blob(),
      a = document.createElement("a");
    a.href = URL.createObjectURL(blob);
    a.download = r.headers.get("Content-Disposition")?.match(/filename="?([^";]+)"?/)?.[1] || `CraftCrew-${id}.${kind === "email" ? "eml" : kind === "xrechnung" ? "xml" : "pdf"}`;
    document.body.appendChild(a);
    a.click();
    a.remove();
    setTimeout(() => URL.revokeObjectURL(a.href), 30000);
    if (kind === "email") tToast(t("inv.act.emailDownloaded"));
  } catch (e) {
    toast(e.message, "error");
  }
}
function wfInvoicePrint(id) {
  return wfDownloadInvoice(id, "pdf");
}
function wfInvoiceEmail(id) {
  return wfDownloadInvoice(id, "email");
}
actions.on("inv.download", (el) => wfDownloadInvoice(el.dataset.id, el.dataset.kind));
let inVisible = []; // the invoices of the list on screen, for the CSV export
function reviewInvoiceCsv(invoices) {
  const c = (k) => t("inv.csv." + k),
    quote = (x) => '"' + String(x ?? "").replace(/"/g, '""') + '"',
    rows = invoices.map((i) => [invNo(i), i.createdAt, i.customerCompany, i.supplierCompany, i.projectName || i.projectId, i.taskName, i.amount, i.orderedAmount, i.status]),
    head = ["invoice", "issued", "customer", "supplier", "project", "task", "amount", "cap", "status"].map(c),
    blob = new Blob(["﻿" + [head, ...rows].map((r) => r.map(quote).join(";")).join("\r\n")], { type: "text/csv;charset=utf-8" }),
    a = document.createElement("a");
  a.href = URL.createObjectURL(blob);
  a.download = "craftcrew-invoices.csv";
  a.click();
  setTimeout(() => URL.revokeObjectURL(a.href), 30000);
}
actions.on("inv.csv", () => reviewInvoiceCsv(inVisible));

/* ---------- Lists ---------- */
// Function declarations, so the approvals page can swap them for a moment (dsApprovalDo)
async function customerInvoices() {
  return reviewInvoiceList("customer");
}
async function supplierInvoices() {
  return reviewInvoiceList("supplier");
}
async function reviewInvoiceList(role) {
  const q = inQuery(),
    scope = reviewInvoiceScope(),
    l = (key, params) => ink("list." + key, params),
    [d, pd, cd, all] = await Promise.all([
      api("/invoices?" + scope.toString()),
      api("/projects"),
      api("/contacts").catch(() => ({ users: [] })),
      // The sums count every invoice in scope, not only the filtered ones
      api("/invoices?" + scope.toString()).then((x) => x.invoices),
    ]),
    projects = pd.projects || [],
    contacts = cd.users || [],
    projectMap = new Map(projects.map((p) => [p.id, p]));
  const f = {
    status: q.get("status") || "All",
    party: q.get("party") || "All",
    project: q.get("projectFilter") || "",
    search: (q.get("q") || "").toLowerCase(),
    min: q.get("min") || "",
    max: q.get("max") || "",
    from: q.get("from") || "",
    to: q.get("to") || "",
    sort: q.get("sort") || "date-desc",
  };
  const invoices = d.invoices
    .map((i) => ({
      ...i,
      projectName: projectMap.get(i.projectId)?.name || i.projectId,
      partyName:
        role === "customer"
          ? i.supplierCompany || contacts.find((x) => x.supplierId === i.supplierId)?.company || t("inv.list.supplier")
          : i.customerCompany || contacts.find((x) => x.id === i.customerId)?.company || t("inv.list.customer"),
    }))
    .filter(
      (i) =>
        (f.status === "All" || i.status === f.status) &&
        (f.party === "All" || i.partyName === f.party) &&
        (!f.project || i.projectId === f.project) &&
        (!f.search || [i.id, invNo(i), i.projectName, i.taskName, i.partyName, i.description].join(" ").toLowerCase().includes(f.search)) &&
        (f.min === "" || Number(i.amount) >= Number(f.min)) &&
        (f.max === "" || Number(i.amount) <= Number(f.max)) &&
        (!f.from || String(i.createdAt).slice(0, 10) >= f.from) &&
        (!f.to || String(i.createdAt).slice(0, 10) <= f.to),
    );
  const sortFns = {
    "date-desc": (a, b) => String(b.createdAt).localeCompare(String(a.createdAt)),
    "date-asc": (a, b) => String(a.createdAt).localeCompare(String(b.createdAt)),
    "amount-desc": (a, b) => Number(b.amount) - Number(a.amount),
    "amount-asc": (a, b) => Number(a.amount) - Number(b.amount),
    status: (a, b) => a.status.localeCompare(b.status),
    project: (a, b) => a.projectName.localeCompare(b.projectName),
  };
  invoices.sort(sortFns[f.sort] || sortFns["date-desc"]);
  inVisible = invoices;
  const parties = [...new Set(all.map((i) => (role === "customer" ? i.supplierCompany : i.customerCompany)).filter(Boolean))],
    opt = (value, label, on) => `<option value="${esc(value)}"${on ? " selected" : ""}>${label}</option>`,
    sums = [
      ["visible", invoices.length],
      ["visibleTotal", fmt.money(invoices.reduce((a, i) => a + Number(i.amount || 0), 0))],
      ["awaiting", all.filter((i) => i.status === "Submitted").length],
      ["overCap", all.filter((i) => i.exceedsOrder).length],
    ],
    btn = (action, cls, label, i, kind) => `<button class="btn small ${cls}" data-action="${action}" data-id="${esc(i.id)}"${kind ? ` data-kind="${kind}"` : ""}>${l(label)}</button>`;
  const row = (i) => {
    const ph = projectMap.get(i.projectId)?.phases.find((x) => x.id === i.phaseId),
      url = "#" + reviewInvoiceUrl(role, i.id);
    return `<tr><td><b><a href="${esc(url)}">${esc(invNo(i))}</a></b><small>${esc(fmt.date(i.createdAt))}</small>${rvDue(i) ? `<small>${l("due", { date: fmt.date(rvDue(i)) })}</small>` : ""}</td><td>${esc(i.partyName)}<small>${
      role === "customer" ? (i.supplierEmail ? esc(i.supplierEmail) : l("supplier")) : l("customerAccount")
    }</small></td><td>${inDom(i.projectName)}<small>${inDom(ph?.name || i.phaseId)} · ${i.taskName ? inDom(i.taskName) : l("phaseInvoice")}</small></td><td>${(i.lineItems || []).length || "—"}</td><td>${esc(fmt.money(i.amount))}${
      i.orderedAmount
        ? `<small class="${i.exceedsOrder ? "danger-text" : "success-text"}">${i.exceedsOrder ? l("overBy", { amount: fmt.money(invNet(i) - i.orderedAmount) }) : l("of", { amount: fmt.money(i.orderedAmount) })}</small>`
        : ""
    }</td><td><span class="status ${esc(i.status.toLowerCase().replaceAll(" ", "-"))}">${inStatus(i.status)}</span>${rvInvoiceTiming(i, role)}</td><td><div class="cc-actions"><a class="btn small outline" href="${esc(url)}">${l("view")}</a>${
      role === "customer" && i.status === "Submitted" ? btn("inv.review", "success", "review", i) : ""
    }${role === "supplier" && ["Changes Requested", "Rejected"].includes(i.status) ? btn("inv.fix", "primary", "fix", i) : ""}${btn("inv.download", "outline", "pdf", i, "pdf")}${btn("inv.download", "outline", "email", i, "email")}</div></td></tr>`;
  };
  app.innerHTML = dashboardShell(
    role,
    "invoices",
    [
      q.has("back") ? `<a class="btn small outline review-back" href="#${esc(q.get("back"))}">${l("back")}</a>` : "",
      `<div class="dash-top"><div><h1>${l(scope.has("project") ? "titleProject" : "title")}</h1><p>${l("intro")}</p></div><div class="cc-actions"><button class="btn outline" data-action="inv.csv">${l("csv")}</button>${
        role === "supplier" ? `<a class="btn primary" href="#/supplier/invoices/new">${l("create")}</a>` : ""
      }</div></div>`,
      `<div class="wf-stat-grid">${sums.map(([k, v]) => `<div class="cc-card"><span class="cc-label">${l(k)}</span><b>${esc(v)}</b></div>`).join("")}</div>`,
      `<form id="reviewInvoiceFilters" class="review-invoice-filters" data-action="inv.filter" data-role="${role}"><label>${l("find")}<input name="q" value="${esc(f.search)}" placeholder="${l("findHint")}"></label><label>${l(
        "status",
      )}<select name="status">${["All", ...IN_STATUSES].map((x) => opt(x, ink("statuses." + x), f.status === x)).join("")}</select></label><label>${l(role === "customer" ? "supplier" : "customer")}<select name="party">${opt(
        "All",
        l("all"),
      )}${parties.map((x) => opt(x, esc(x), f.party === x)).join("")}</select></label><label>${l("project")}<select name="projectFilter">${opt("", l("allProjects"))}${projects
        .map((p) => opt(p.id, esc(p.name), f.project === p.id))
        .join("")}</select></label><label>${l("from")}<input name="from" type="date" value="${esc(f.from)}"></label><label>${l("to")}<input name="to" type="date" value="${esc(f.to)}"></label><label>${l(
        "min",
      )}<input name="min" type="number" min="0" step="0.01" value="${esc(f.min)}"></label><label>${l("max")}<input name="max" type="number" min="0" step="0.01" value="${esc(f.max)}"></label><label>${l("sort")}<select name="sort">${Object.keys(
        sortFns,
      )
        .map((v) => opt(v, l("sorts." + v), f.sort === v))
        .join("")}</select></label><button class="btn primary">${l("apply")}</button><a class="btn outline" href="#/${role}/invoices${scope.toString() ? `?${scope}` : ""}">${l("reset")}</a></form>`,
      `<section class="panel"><div class="cc-table-wrap"><table class="cc-table review-invoice-table"><thead><tr>${["colInvoice", "colParty", "colWork", "colPositions", "colAmount", "colStatus", "colActions"]
        .map((k) => `<th>${l(k)}</th>`)
        .join("")}</tr></thead><tbody>${invoices.map(row).join("") || `<tr><td colspan="7">${l("empty")}</td></tr>`}</tbody></table></div></section>`,
    ]
      .filter(Boolean)
      .map(inKeys)
      .join(""),
  );
}
actions.on("inv.filter", (form) => {
  const values = Object.fromEntries(new FormData(form)),
    next = reviewInvoiceScope();
  for (const k of ["status", "party", "projectFilter", "q", "min", "max", "from", "to", "sort"]) if (values[k]) next.set(k, values[k]);
  const path = `/${form.dataset.role}/invoices?${next}`;
  if (location.hash === "#" + path) route();
  else navigate(path);
});
actions.on("inv.review", (el) => reviewInvoice(el.dataset.id));
actions.on("inv.fix", (el) => rvFixInvoice(el.dataset.id));
function reviewInvoice(id) {
  navigate(reviewInvoiceUrl(state.user.role, id));
}

/* ---------- One invoice: paper and review panel (T101) ---------- */
async function invoiceDetailPage(id, role = state.user.role) {
  const [{ invoice: i }, projects] = await Promise.all([api("/invoices/" + encodeURIComponent(id)), reviewProjects().catch(() => [])]),
    entries = i.projectId ? (await api("/time-entries?projectId=" + encodeURIComponent(i.projectId)).catch(() => ({}))).entries || [] : [],
    p = projects.find((x) => x.id === i.projectId),
    ph = p?.phases.find((x) => x.id === i.phaseId),
    task = ph?.tasks?.find((x) => x.id === i.taskId),
    back = inQuery().get("back") || `/${role}/invoices`,
    d = (key, params) => ink("doc." + key, params),
    k = (key, params) => ink("panel." + key, params),
    dl = (kind, label) => `<button class="btn small secondary" data-action="inv.download" data-id="${esc(i.id)}" data-kind="${kind}">${d(label)}</button>`;
  // The paper
  const prev = (i.revisions || []).at(-1),
    prevLines = prev?.lineItems || [],
    same = (a, b) => String(a.service) === String(b.service) && Number(a.quantity) === Number(b.quantity) && Number(a.unitPrice || a.rate) === Number(b.unitPrice || b.rate),
    lines = (i.lineItems || []).length ? i.lineItems : [{ service: i.description || t("inv.doc.servicesDelivered"), quantity: 1, unit: "unit", unitPrice: i.amount, total: i.amount }],
    period = i.serviceDateFrom ? fmt.range(i.serviceDateFrom, i.serviceDateTo || i.serviceDateFrom) : "",
    toLine = [i.customerAddress, i.customerTaxId ? t("inv.doc.vatId", { id: i.customerTaxId }) : ""].filter(Boolean).join(" · ");
  const paper = `<article class="ds-paper"><div class="ds-paper-top"><div><b class="ds-paper-from">${esc(i.supplierCompany || "")}</b><span>${i.supplierAddress ? esc(i.supplierAddress) : d("noAddress")}</span>${
    i.supplierEmail ? `<span>${esc(i.supplierEmail)}</span>` : ""
  }<span>${d("vatId", { id: i.supplierTaxId || "—" })}</span></div><div class="ds-paper-no"><span class="ds-ui">${d("invoice")}</span><b>${esc(invNo(i))}</b><span>${esc(fmt.date(i.createdAt))}</span></div></div>
    <div class="ds-paper-to"><span class="ds-paper-label ds-ui">${d("billTo")}</span><b>${esc(i.customerCompany || "")}</b><span>${esc(toLine)}</span><span>${[p?.name || i.projectName, ph?.name, task?.name || i.taskName]
      .filter(Boolean)
      .map(inDom)
      .join(" · ")}${period ? `<span class="ds-paper-period"> · ${d("service", { period })}</span>` : ""}</span></div>
    <table class="ds-paper-lines"><thead><tr><th class="ds-ui">${d("colDescription")}</th><th class="ds-ui">${d("colQty")}</th><th class="ds-ui">${d("colRate")}</th><th class="ds-ui">${d("colAmount")}</th></tr></thead><tbody>${lines
      .map(
        (x) =>
          `<tr><td>${inDom(x.service)}${prev && !prevLines.some((y) => same(x, y)) ? ` <span class="ds-new ds-ui">${d("new")}</span>` : ""}</td><td>${Number(x.quantity)} ${
            x.unit === "hours" ? "h" : inDom(x.unit || "")
          }</td><td>${esc(fmt.money(x.unitPrice || x.rate || 0))}</td><td>${esc(fmt.money(x.total || Number(x.quantity || 0) * Number(x.unitPrice || x.rate || 0)))}</td></tr>`,
      )
      .join("")}</tbody></table>
    <div class="ds-paper-totals">${
      i.vatMode
        ? `<div><span class="ds-ui">${d("net")}</span><span>${esc(fmt.money(i.netAmount))}</span></div><div><span>${d("vatRate", { rate: Number(i.vatRate) })}</span><span>${esc(fmt.money(i.vatAmount))}</span></div><div class="ds-paper-total"><span class="ds-ui">${d(
            "total",
          )}</span><span>${esc(fmt.money(i.grossAmount))}</span></div>`
        : `<div><span class="ds-ui">${d("net")}</span><span>${esc(fmt.money(i.amount))}</span></div><div><span class="ds-ui">${d("vat")}</span><span class="ds-muted ds-ui">${d("notRecorded")}</span></div><div class="ds-paper-total"><span class="ds-ui">${d(
            "total",
          )}</span><span>${esc(fmt.money(i.amount))}</span></div>`
    }</div></article>`;
  // Below the paper: notices, VAT notes, payment terms, comments, revision history
  const over = Number(i.orderedAmount) > 0 && invNet(i) > Number(i.orderedAmount),
    terms = i.paymentTerms ? inDom(i.paymentTerms) : i.paymentTermsDays != null ? d("termsDays", { n: i.paymentTermsDays }) : d("termsDefault"),
    fixable = role === "supplier" && ["Changes Requested", "Rejected"].includes(i.status),
    below = [
      over ? `<div class="notice order-warning">${d("overCap", { amount: fmt.money(invNet(i) - i.orderedAmount) })}</div>` : "",
      ["reverseCharge13b", "smallBusiness19", "intraEU"].includes(i.vatMode) ? `<div class="notice"><b>${d("vatNotes." + i.vatMode)}</b></div>` : "",
      `<div class="notice">${tHtml("inv.doc.terms", { note: i.description ? inDom(i.description) : d("noNotes"), terms })}</div>`,
      i.comments
        ? `<div class="notice ${["Changes Requested", "Rejected"].includes(i.status) ? "warn" : ""}"><b>${d(i.status === "Rejected" ? "rejected" : "changesRequested")}</b> ${inDom(i.comments)}</div>`
        : "",
      i.resubmitNote && i.status === "Submitted" ? `<div class="notice">${tHtml("inv.doc.corrected", { note: inDom(i.resubmitNote) })}</div>` : "",
      (i.revisions || []).length ? rvRevisionList(i.revisions) : "",
    ].join("");
  // The review panel
  const total = i.vatMode ? i.grossAmount : i.amount,
    cap = Number(i.orderedAmount) || 0,
    net = i.vatMode ? Number(i.netAmount) : Number(i.amount),
    hourLines = (i.lineItems || []).filter((x) => /^(h|hour|hours|std|stunden)$/i.test(String(x.unit))),
    invoicedHours = hourLines.reduce((a, x) => a + Number(x.quantity || 0), 0),
    approvedHours = entries.filter((e) => e.taskId === i.taskId && e.status === "Approved").reduce((a, e) => a + Number(e.hours || 0), 0),
    check = (state_, text, detail) =>
      `<div class="ds-check ds-check-${state_}"><span class="ds-check-icon" aria-hidden="true">${state_ === "ok" ? "✓" : state_ === "warn" ? "!" : "×"}</span><span class="ds-check-text">${text}</span>${
        detail ? `<span class="ds-check-detail">${detail}</span>` : ""
      }</div>`,
    checks = [
      cap ? (net <= cap ? check("ok", k("withinCap"), k("used", { n: Math.round((net / cap) * 100) })) : check("bad", k("overCap"), k("over", { amount: fmt.money(net - cap) }))) : "",
      hourLines.length
        ? invoicedHours <= approvedHours
          ? check("ok", k("hoursOk"), k("hours", { n: invoicedHours }))
          : check("warn", k("hoursOver"), k("hoursOf", { n: invoicedHours, approved: approvedHours }))
        : "",
      i.supplierTaxId ? check("ok", k("vatOk"), esc(i.supplierTaxId)) : check("warn", k("vatMissing"), ""),
      task && Number(task.progress) < 100 && task.status !== "Completed" ? check("warn", k("partial"), k("partialDetail", { n: Number(task.progress) || 0 })) : "",
    ].join(""),
    versions = (i.revisions || []).length,
    changeNote = prev?.reviewNote || "",
    amountChange = prev ? Number(i.amount) - Number(prev.amount) : 0,
    dueLine = [i.scheduledPayment || i.dueDate ? k("due", { date: fmt.range(i.scheduledPayment || i.dueDate) }) : "", i.vatMode && Number(i.vatRate) ? k("inclVat", { rate: Number(i.vatRate) }) : ""]
      .filter(Boolean)
      .join(" · "),
    ids = `data-id="${esc(i.id)}"`;
  const review =
    role === "customer" && i.status === "Submitted"
      ? `<label class="ds-inv-note"><span>${k("noteTo", { name: i.supplierCompany ? String(i.supplierCompany).split(/\s+/)[0] : t("inv.panel.theSupplier") })}</span><textarea id="dsInvNote" rows="3" maxlength="2000"></textarea></label><div class="ds-inv-foot"><button class="btn primary lg ds-inv-approve" data-action="inv.approve" ${ids}>${k(
          "approve",
        )}</button><div class="ds-inv-row"><button class="btn secondary" data-action="inv.changes" ${ids}>${k("changes")}</button><button class="btn danger" data-action="inv.reject" ${ids}>${k("reject")}</button></div></div>`
      : fixable
        ? `<div class="ds-inv-foot"><button class="btn primary lg" data-action="inv.fix" ${ids}>${d("fixButton")}</button></div>`
        : "";
  const panel = `<aside class="ds-inv-panel"><span class="ds-inv-from">${versions ? k("versionFrom", { n: versions + 1, company: i.supplierCompany }) : k("from", { company: i.supplierCompany })}</span>
    <b class="ds-inv-total">${esc(fmt.money(total))}</b>
    <span class="ds-inv-due">${dueLine}</span>
    <div><span class="status">${inStatus(i.status)}</span> ${rvInvoiceTiming(i, role)}</div>
    ${checks ? `<h3 class="ds-inv-h ds-ui">${k("checks")}</h3><div class="ds-checks">${checks}</div>` : ""}
    ${
      versions
        ? `<h3 class="ds-inv-h ds-ui">${k("changed")}</h3><div class="ds-inv-changed">${changeNote ? `<p><b class="ds-ui">${k("youAsked")}</b> ${inDom(changeNote)}</p>` : ""}${
            i.resubmitNote ? `<p><b>${esc(i.supplierCompany)}:</b> ${inDom(i.resubmitNote)}</p>` : ""
          }<p>${amountChange ? k("totalChanged", { amount: (amountChange > 0 ? "+" : "−") + fmt.money(Math.abs(amountChange)) }) : `<span class="ds-ui">${k("unchanged")}</span>`}</p></div>`
        : ""
    }${review}</aside>`;
  app.innerHTML = dashboardShell(
    role,
    "invoices",
    inKeys(
      `<div class="ds-inv-cols"><h1 class="sr-only">${d("title", { number: invNo(i) })}</h1><div class="ds-inv-left"><div class="ds-inv-bar"><a class="ds-inv-back" href="#${esc(back)}">${d("back")}</a><div class="ds-inv-pills">${dl("pdf", "pdf")}${dl("xrechnung", "xrechnung")}${dl(
        "email",
        "email",
      )}</div></div>${paper}<div class="ds-inv-below">${below}</div></div>${panel}</div>`,
    ),
  );
  document.querySelector(".dashboard-content")?.classList.add("ds-invoice");
}
/* Earlier versions of an invoice, newest first. */
function rvRevisionList(revisions) {
  return `<details class="rv-history"><summary>${ink("doc.earlier", { n: revisions.length })}</summary>${[...revisions]
    .reverse()
    .map(
      (r, n) =>
        `<div class="rv-version"><div><b>${ink("doc.version", { n: revisions.length - n })}</b> · ${esc(fmt.money(r.amount))}<small>${esc(fmt.date(r.at))} · ${inStatus(r.status)}</small></div>${
          r.reviewNote ? `<small>${tHtml("inv.doc.customerNote", { note: inDom(r.reviewNote) })}</small>` : ""
        }${(r.lineItems || []).length ? `<small>${r.lineItems.map((x) => `${esc(x.service)} (${x.quantity} × ${esc(fmt.money(x.unitPrice))})`).join(" · ")}</small>` : ""}</div>`,
    )
    .join("")}</details>`;
}

/* ---------- Decisions (also used by the approvals page) ---------- */
// A note typed into the review panel is sent as the comment; without one, the buttons ask as before
const inNote = () => document.getElementById("dsInvNote")?.value.trim() || "";
async function inDecide(id, action, comment, message) {
  try {
    await api("/invoices/" + encodeURIComponent(id), { method: "PATCH", body: { action, comment } });
    closeModal();
    tToast(t(message));
    await route();
  } catch (x) {
    toast(x.message, "error");
  }
}
async function invoiceAction(id, action) {
  if (action === "Approve") return inDecide(id, "Approve", "", "inv.act.approved");
  const comment = inNote() || (await uiPrompt(t("inv.act.changesPrompt"))) || "";
  return inDecide(id, "Request Changes", comment, "inv.act.changesSent");
}
async function invoiceReject(id) {
  const reason = inNote() || (await uiPrompt(t("inv.act.rejectPrompt")));
  if (!reason) return;
  return inDecide(id, "Rejected", reason, "inv.act.rejected");
}
actions.on("inv.approve", (el) => invoiceAction(el.dataset.id, "Approve"));
actions.on("inv.changes", (el) => invoiceAction(el.dataset.id, "Request Changes"));
actions.on("inv.reject", (el) => invoiceReject(el.dataset.id));

/* ---------- Supplier: fix & resubmit ---------- */
let inFixing = null; // the invoice in the fix dialog
function inFixRow(x = {}) {
  const f = (key) => ink("fix." + key);
  return `<tr><td><input name="service" value="${esc(x.service || "")}" placeholder="${f("servicePlaceholder")}" required></td><td><input name="quantity" type="number" min="0.01" step="0.01" value="${esc(
    x.quantity ?? 1,
  )}" required></td><td><input name="unit" value="${esc(x.unit || "units")}"></td><td><input name="unitPrice" type="number" min="0" step="0.01" value="${esc(x.unitPrice ?? x.rate ?? 0)}" required></td><td class="rv-line-total"></td><td><button type="button" class="lc-tool" title="${f(
    "remove",
  )}" data-action="inv.fixRemove">×</button></td></tr>`;
}
async function rvFixInvoice(id) {
  const { invoice: i } = await api("/invoices/" + encodeURIComponent(id)),
    f = (key, params) => ink("fix." + key, params),
    lines = (i.lineItems || []).length ? i.lineItems : [{ service: i.description || t("inv.doc.servicesDelivered"), quantity: 1, unit: "units", unitPrice: i.amount }];
  inFixing = i;
  modal(
    t("inv.fix.title"),
    `<form id="rvInvoiceForm" class="modal-form" data-i18n="keys" data-action="inv.resubmit" data-input="inv.fixTotal" data-id="${esc(id)}">
    ${i.comments ? `<div class="notice warn"><b>${f(i.status === "Rejected" ? "reasonRejected" : "requested")}:</b> ${inDom(i.comments)}</div>` : ""}
    <div class="cc-table-wrap"><table class="cc-table rv-lines"><thead><tr><th>${f("colPosition")}</th><th>${f("colQty")}</th><th>${f("colUnit")}</th><th>${f("colPrice")}</th><th>${f("colTotal")}</th><th></th></tr></thead><tbody id="rvLines">${lines
      .map(inFixRow)
      .join("")}</tbody></table></div>
    <div class="rv-lines-foot"><button type="button" class="btn small outline" id="rvAddLine" data-action="inv.fixAdd">${f("add")}</button><span>${f("newTotal")} <b id="rvTotal"></b> <small class="subtle">${f("was", { amount: fmt.money(i.amount) })}</small></span></div>
    <label>${f("description")}<textarea name="description" rows="2" required>${esc(i.description || "")}</textarea></label>
    <label>${f("whatChanged")} <small class="subtle">${f("shown")}</small><textarea name="note" rows="2" required placeholder="${f("changedPlaceholder")}"></textarea></label>
    <label>${f("replace")} <small class="subtle">${f("optional")}</small><input name="attachmentFile" type="file"></label>
    <div id="rvInvoiceError" class="form-error" data-i18n="dom"></div><button class="btn primary">${f("resubmit")}</button></form>`,
  );
  rvInvoiceTotal();
}
function rvInvoiceTotal() {
  let sum = 0;
  for (const tr of document.querySelectorAll("#rvLines tr")) {
    const line = (Number(tr.querySelector("[name=quantity]").value) || 0) * (Number(tr.querySelector("[name=unitPrice]").value) || 0);
    sum += line;
    tr.querySelector(".rv-line-total").textContent = fmt.money(line);
  }
  const el = document.getElementById("rvTotal");
  if (el) el.textContent = fmt.money(sum);
}
actions.on("inv.fixTotal", rvInvoiceTotal);
actions.on("inv.fixAdd", () => {
  document.getElementById("rvLines").insertAdjacentHTML("beforeend", inFixRow());
  rvInvoiceTotal();
});
actions.on("inv.fixRemove", (el) => {
  el.closest("tr").remove();
  rvInvoiceTotal();
});
actions.on("inv.resubmit", async (form) => {
  const lineItems = [...form.querySelectorAll("#rvLines tr")].map((tr) => Object.fromEntries(["service", "quantity", "unit", "unitPrice"].map((k) => [k, tr.querySelector(`[name=${k}]`).value])));
  if (!lineItems.length) return (document.getElementById("rvInvoiceError").textContent = t("inv.fix.addOne"));
  const f = new FormData(form),
    file = f.get("attachmentFile");
  try {
    const attachment = file && file.size ? await uploadFile(file) : inFixing?.attachment;
    await api("/invoices/" + encodeURIComponent(form.dataset.id), {
      method: "PATCH",
      body: { action: "Resubmit", lineItems, description: f.get("description"), note: f.get("note"), attachment },
    });
    closeModal();
    tToast(t("inv.fix.resubmitted"));
    await route();
  } catch (x) {
    document.getElementById("rvInvoiceError").textContent = x.message;
  }
});

/* ---------- Supplier: new invoice (T130b) ---------- */
// VAT modes on the invoice form; the server applies the same rates
const WF_VAT_MODES = { standard: { rate: 19 }, reduced: { rate: 7 }, reverseCharge13b: { rate: 0 }, smallBusiness19: { rate: 0 }, intraEU: { rate: 0 } };
let inNew = { eligible: [], services: [] }; // accepted work and the supplier's services of the open form
const inTarget = () => {
  const [pid, phid, tid] = (document.getElementById("invTarget")?.value || "||").split("|");
  return inNew.eligible.find((x) => x.p.id === pid && x.ph.id === phid && (x.t?.id || "") === tid);
};
async function newInvoice() {
  const [{ projects = [] }, profile] = await Promise.all([api("/projects"), api("/profile")]),
    supplier = profile.supplier,
    eligible = [];
  for (const p of projects)
    for (const ph of p.phases || []) {
      for (const x of ph.tasks || []) if (x.assignedSupplierId === supplier.id && x.acceptanceStatus === "Accepted") eligible.push({ p, ph, t: x });
      if (ph.supplierId === supplier.id && ph.acceptanceStatus === "Accepted") eligible.push({ p, ph, t: null });
    }
  // The list stays underneath the form
  await supplierInvoices();
  if (!eligible.length) return tToast(t("inv.new.acceptFirst"), "error");
  inNew = { eligible, services: supplier.services || [] };
  const q = inQuery(),
    n = (key, params) => ink("new." + key, params),
    cp = profile.companyProfile || {},
    today = new Date().toISOString().slice(0, 10),
    taxMissing = !["legalName", "address", "taxId"].every((k) => String(cp[k] || "").trim()),
    chosen = eligible.find((x) => x.p.id === q.get("project") && x.ph.id === q.get("phase") && (x.t?.id || "") === (q.get("task") || ""));
  modal(
    t("inv.new.title"),
    `<div data-i18n="keys">${
      taxMissing ? `<div class="notice warn">${n("taxMissing")} <a href="#/supplier/profile" data-action="inv.closeModal">${n("openProfile")}</a></div>` : ""
    }<p class="modal-intro">${n("intro")}</p><form id="invF" class="modal-form" data-action="inv.submit" data-input="inv.newTotal"><label>${n("target")}<input type="search" class="cc-invoice-search" placeholder="${n(
      "search",
    )}" data-input="inv.searchTarget"><select name="target" id="invTarget" required data-action="inv.target"><option value="">${n("choose")}</option>${eligible
      .map(({ p, ph, t: x }) => {
        const value = `${p.id}|${ph.id}|${x?.id || ""}`;
        return `<option value="${esc(value)}"${chosen && x === chosen.t && ph === chosen.ph ? " selected" : ""}>${esc(p.name)} — ${esc(ph.name)}${x ? " — " + esc(x.name) : ""}</option>`;
      })
      .join("")}</select></label><div id="invoiceContext" class="notice">${n("context")}</div><div class="invoice-lines-head"><h3>${n("positions")}</h3><button class="btn small outline" type="button" data-action="inv.addLine">${n(
      "add",
    )}</button></div><div id="invoiceLines">${inLine()}</div><div class="two"><label>${n("vat")}<select name="vatMode" id="invVatMode" data-action="inv.vatMode">${Object.keys(WF_VAT_MODES)
      .map((k) => `<option value="${k}">${n("modes." + k)}</option>`)
      .join("")}</select></label><div class="two"><label>${n("from")}<input name="serviceDateFrom" type="date" value="${today}" required></label><label>${n(
      "to",
    )}<input name="serviceDateTo" type="date" value="${today}" required></label></div></div><p id="invVatHelp" class="subtle">${n("help.standard")}</p><div class="invoice-total-row sub"><span>${n(
      "net",
    )}</span><strong id="invoiceNet"></strong></div><div class="invoice-total-row sub"><span>${n("vatAmount")}</span><strong id="invoiceVat"></strong></div><div class="invoice-total-row"><span>${n(
      "total",
    )}</span><strong id="invoiceTotal"></strong></div><div id="invoiceOrderCheck" class="order-check">${n("selectWork")}</div><label>${n("note")}<textarea name="description" required></textarea></label><label>${n(
      "attachment",
    )}<input name="attachmentFile" type="file"></label><div id="invoiceError" class="form-error" data-i18n="dom"></div><div class="action-row"><button class="btn primary">${n("submit")}</button><button type="button" class="btn outline" data-action="inv.closeModal">${n(
      "cancel",
    )}</button></div></form></div>`,
  );
  inShowTarget();
}
// One invoice position; services are the supplier's own (data, on the old translation)
function inLine() {
  const l = (key) => ink("new.line." + key);
  return `<div class="invoice-line"><label>${l("service")}<select name="service" required data-i18n="dom"><option value="">${esc(t("inv.new.line.chooseService"))}</option>${inNew.services
    .map((x) => `<option value="${esc(x)}">${esc(x)}</option>`)
    .join("")}</select></label><label>${l("amount")}<input name="quantity" type="number" min="0.01" step="0.01" value="1" required></label><label>${l("unit")}<select name="unit"><option value="hours">${l(
    "hours",
  )}</option><option value="units">${l("units")}</option></select></label><label>${l("rate")}<input name="unitPrice" type="number" min="0" step="0.01" value="0" required></label><button type="button" class="btn small danger" aria-label="${l(
    "removeLabel",
  )}" data-action="inv.removeLine">${l("remove")}</button></div>`;
}
function inShowTarget() {
  const x = inTarget(),
    box = document.getElementById("invoiceContext");
  if (x && box) {
    const cap = Number(x.t?.orderAmount || x.ph.orderAmount) || 0;
    box.innerHTML = `${tHtml("inv.new.customer", { name: `<b>${esc(x.p.customer?.company || x.p.customer?.name || t("inv.new.customerFallback"))}</b>` })}<br>${inDom(x.p.name)} · ${inDom(x.ph.name)}${x.t ? " · " + inDom(x.t.name) : ""}<br>${ink("new.cap", { amount: cap ? fmt.money(cap) : t("inv.new.noCap") })}`;
  }
  refreshInvoiceTotal();
}
function refreshInvoiceTotal() {
  const n = (key, params) => t("inv.new." + key, params),
    total = [...document.querySelectorAll(".invoice-line")].reduce(
      (sum, row) => sum + (Number(row.querySelector("[name=quantity]")?.value) || 0) * (Number(row.querySelector("[name=unitPrice]")?.value) || 0),
      0,
    ),
    rate = WF_VAT_MODES[document.getElementById("invVatMode")?.value]?.rate || 0,
    vat = Math.round(total * rate) / 100,
    set = (id, value) => {
      const el = document.getElementById(id);
      if (el) el.textContent = value;
    };
  set("invoiceNet", fmt.money(total));
  set("invoiceVat", n("vatLine", { amount: fmt.money(vat), rate }));
  set("invoiceTotal", fmt.money(total + vat));
  const x = inTarget(),
    cap = Number(x?.t?.orderAmount || x?.ph?.orderAmount) || 0,
    check = document.getElementById("invoiceOrderCheck");
  if (!check) return;
  if (!x || !cap) {
    check.textContent = n(x ? "noOrder" : "chooseOrder");
    check.className = "order-check";
    return;
  }
  const delta = total - cap;
  check.textContent = delta > 0 ? n("exceeds", { amount: fmt.money(delta) }) : n("within", { cap: fmt.money(cap), remaining: fmt.money(cap - total) });
  check.className = "order-check " + (delta > 0 ? "over" : "within");
}
actions.on("inv.closeModal", () => closeModal());
actions.on("inv.target", inShowTarget);
actions.on("inv.newTotal", refreshInvoiceTotal);
actions.on("inv.addLine", () => document.getElementById("invoiceLines")?.insertAdjacentHTML("beforeend", inLine()));
actions.on("inv.removeLine", (el) => {
  el.closest(".invoice-line").remove();
  refreshInvoiceTotal();
});
actions.on("inv.vatMode", (sel) => {
  document.getElementById("invVatHelp").textContent = t("inv.new.help." + sel.value);
  refreshInvoiceTotal();
});
actions.on("inv.searchTarget", (input) => {
  const q = input.value.toLowerCase();
  [...document.getElementById("invTarget").options].forEach((o, i) => {
    if (i) o.hidden = !o.text.toLowerCase().includes(q);
  });
});
actions.on("inv.submit", async (form) => {
  const [projectId, phaseId, taskId] = document.getElementById("invTarget").value.split("|"),
    f = new FormData(form),
    error = document.getElementById("invoiceError"),
    lineItems = [...form.querySelectorAll(".invoice-line")].map((r) =>
      Object.fromEntries(["service", "quantity", "unit", "unitPrice"].map((k) => [k, r.querySelector(`[name=${k}]`).value])),
    );
  if (!lineItems.length || lineItems.some((x) => !x.service || Number(x.quantity) <= 0)) return (error.textContent = t("inv.new.lineError"));
  try {
    const file = f.get("attachmentFile"),
      // The supporting attachment was offered but never sent before
      attachment = file && file.size ? await uploadFile(file) : undefined;
    await api("/invoices", {
      method: "POST",
      body: {
        projectId,
        phaseId,
        taskId: taskId || undefined,
        description: f.get("description"),
        lineItems,
        vatMode: f.get("vatMode"),
        serviceDateFrom: f.get("serviceDateFrom"),
        serviceDateTo: f.get("serviceDateTo"),
        attachment,
      },
    });
    closeModal();
    tToast(t("inv.new.submitted"));
    navigate(`/supplier/invoices?project=${projectId}&phase=${phaseId}&task=${taskId}`);
  } catch (x) {
    error.textContent = x.message;
  }
});

routes.add("/customer/invoices", () => customerInvoices());
routes.add("/supplier/invoices", () => supplierInvoices());
routes.add("/supplier/invoices/new", () => newInvoice());
routes.add("/customer/invoice/:id", (params) => invoiceDetailPage(params.id, "customer"));
routes.add("/supplier/invoice/:id", (params) => invoiceDetailPage(params.id, "supplier"));
