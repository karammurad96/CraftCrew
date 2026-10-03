/* Area: sites, compliance and approvals (T133). Customer sites (requirements, briefing, access requests, on-site
   list, supplier readiness), the supplier compliance page (documents, workers, briefings, access requests) and the
   approvals inbox. Drawn with translation keys; requirement, permit and state names are keys too. Site, company,
   worker and file names, addresses and briefings are data. cmSupplierVisit stays: the supplier dashboard calls it. */
const cmk = (key, params) => esc(t("cm." + key, params));
const cmToday = () => new Date().toISOString().slice(0, 10);
let cmCatalog = null;
async function cmCat() {
  if (!cmCatalog) cmCatalog = await api("/compliance/catalog");
  return cmCatalog;
}
// Known names come from keys; a requirement or permit the server adds later shows its English label
const cmName = (group, k, label) => esc(typeof ccLookup("en", `cm.${group}.${k}`) === "string" ? t(`cm.${group}.${k}`) : label || k);
const cmReq = (k) => cmName("req", k, cmCatalog?.requirements?.[k]?.label);
const cmPermit = (k) => cmName("permit", k, cmCatalog?.permits?.[k]?.label);
const cmChecks = (k) => (Array.isArray(ccLookup("en", "cm.check." + k)) ? t.list("cm.check." + k) : cmCatalog?.permits?.[k]?.checklist || []);
const CM_STATE_CLASS = {
  Valid: "completed",
  Expiring: "expiring",
  "Pending review": "pending",
  Missing: "rejected",
  Expired: "expired",
  Rejected: "rejected",
  Outdated: "expiring",
  Accepted: "completed",
  Requested: "pending",
  Approved: "approved",
  "Checked in": "in-progress",
  "Checked out": "closed",
  Cancelled: "closed",
};
// The chip tone is fixed here, so it no longer depends on the English text (design-screens.js reads that)
const CM_STATE_TONE = { Valid: "green", Accepted: "green", Approved: "green", "Checked out": "green", Missing: "red", Expired: "red", Rejected: "red", "Checked in": "blue", Cancelled: "grey" };
const cmTag = (s) =>
  CM_STATE_CLASS[s] ? `<span class="status ${CM_STATE_CLASS[s]}" data-ds-fixed data-ds-tone="${CM_STATE_TONE[s] || "orange"}">${cmk("state." + s)}</span>` : `<span class="status">${esc(s)}</span>`;
const cmKpi = (label, value, sub, tone = "") => inKpi(esc(label), esc(value), esc(sub), tone);
const cmPlural = (key, n, params) => esc(t.plural("cm." + key, n, params));
const cmDates = (v) => esc(fmt.date(v.date)) + (v.endDate !== v.date ? " – " + esc(fmt.date(v.endDate)) : "");

Object.assign(UI_NAV_ICONS, { sites: "vetting", compliance: "vetting" });

/* ---------- Customer: sites ---------- */
async function cmSites() {
  const [, { sites = [] }, { visits = [] }, { documents = [] }] = await Promise.all([cmCat(), api("/sites"), api("/site-visits"), api("/compliance/documents")]);
  const pending = visits.filter((v) => v.status === "Requested"),
    toReview = documents.filter((d) => !d.review || d.review.status === "Pending review"),
    onSite = visits.filter((v) => v.status === "Checked in"),
    s = (key, params) => cmk("sites." + key, params);
  const card = (x) =>
    `<a class="cc-card click project-card" href="#/customer/sites/${esc(x.id)}"><div class="project-card-head"><b>${esc(x.name)}</b>${x.onSiteCount ? `<span class="status in-progress">${s("onSiteCount", { n: x.onSiteCount })}</span>` : ""}</div><p>${
      x.address ? esc(x.address) : s("noAddress")
    }</p><div class="cm-req-chips">${(x.requirements || [])
      .slice(0, 6)
      .map((k) => `<span class="tag" title="${cmReq(k)}">${cmName("short", k, k)}</span>`)
      .join("")}</div><div class="supplier-meta"><span>${s("counts", { suppliers: t.plural("cm.sites.suppliers", x.supplierCount), projects: t.plural("cm.sites.projects", x.projectIds.length) })}</span><span>${
      x.pendingRequests ? cmPlural("sites.openRequests", x.pendingRequests) : s("noRequests")
    }</span></div><span class="btn small outline project-open">${s("open")}</span></a>`;
  app.innerHTML = dashboardShell(
    "customer",
    "sites",
    [
      `<div class="dash-top"><div><div class="eyebrow">${s("eyebrow")}</div><h1>${s("title")}</h1><p>${s("lead")}</p></div><button class="btn primary" data-action="cm.siteForm">${s("new")}</button></div>`,
      `<div class="in-kpis">${cmKpi(t("cm.sites.onSite"), onSite.reduce((a, v) => a + v.workers.length, 0), t.plural("cm.sites.visits", onSite.length))}${cmKpi(
        t("cm.sites.requests"),
        pending.length,
        t("cm.sites.waiting"),
        pending.length ? "warn" : "good",
      )}${cmKpi(t("cm.sites.toReview"), toReview.length, t("cm.sites.certs"), toReview.length ? "warn" : "good")}${cmKpi(
        t("cm.sites.sites"),
        sites.length,
        t.plural("cm.sites.links", sites.reduce((a, x) => a + x.supplierCount, 0)),
      )}</div>`,
      sites.length
        ? `<div class="cc-grid cm-site-grid">${sites.map(card).join("")}</div>`
        : `<section class="panel cm-empty">${uiIcon("vetting", "ui-icon cm-empty-icon")}<h3>${s("firstTitle")}</h3><p>${s("firstText")}</p><button class="btn primary" data-action="cm.siteForm">${s("new")}</button></section>`,
      `<div class="in-grid"><section class="panel"><div class="panel-title"><h3>${s("requests")}</h3><span class="ui-count">${pending.length}</span></div>${
        pending.map(cmVisitRow).join("") || `<p class="pa-empty">${s("noneWaiting")}</p>`
      }</section><section class="panel"><div class="panel-title"><h3>${s("toReview")}</h3><span class="ui-count">${toReview.length}</span></div>${
        toReview.map(cmDocReviewRow).join("") || `<p class="pa-empty">${s("allReviewed")}</p>`
      }</section></div>`,
    ]
      .join(""),
  );
}
function cmVisitRow(v) {
  const btn = (action, label, cls = "outline", extra = "") => `<button class="btn small ${cls}" data-action="cm.visit" data-id="${esc(v.id)}" data-step="${action}"${extra}>${cmk(label)}</button>`;
  const act =
    v.status === "Requested"
      ? btn("approve", "approve", "primary", ` data-ready="${v.ready ? "1" : ""}"`) + btn("reject", "reject")
      : v.status === "Approved" && v.date <= cmToday()
        ? btn("checkin", "checkIn")
        : v.status === "Checked in"
          ? btn("checkout", "checkOut")
          : "";
  return `<div class="cm-visit"><div><b>${esc(v.supplierCompany)} · ${v.workers.map((w) => esc(w.name)).join(", ")}</b><small>${esc(v.siteName)} · ${cmDates(v)}${v.startTime ? " · " + esc(v.startTime) : ""}${
    v.projectName ? " · " + esc(v.projectName) : ""
  }${v.permitType !== "none" ? " · " + cmPermit(v.permitType) : ""}</small>${v.override ? `<small class="danger-text">${cmk("override", { reason: v.override })}</small>` : ""}</div><div class="cm-visit-side">${cmTag(v.status)}${
    v.status === "Requested" ? (v.ready ? `<span class="status completed">${cmk("compliant")}</span>` : `<span class="status rejected">${cmk("incomplete")}</span>`) : ""
  }<div class="cc-actions">${act}</div></div></div>`;
}
function cmDocReviewRow(d) {
  return `<div class="cm-visit"><div><b>${cmReq(d.requirementKey)}</b><small>${esc(d.supplierCompany)}${d.workerName ? " · " + esc(d.workerName) : ""}${
    d.expiresAt ? " · " + cmk("validUntil", { date: fmt.date(d.expiresAt) }) : ""
  }</small></div><div class="cm-visit-side"><div class="cc-actions"><a class="btn small outline" href="${esc(d.url)}">${cmk("view")}</a><button class="btn small primary" data-action="cm.reviewDoc" data-id="${esc(
    d.id,
  )}" data-status="Accepted">${cmk("accept")}</button><button class="btn small outline" data-action="cm.reviewDoc" data-id="${esc(d.id)}" data-status="Rejected">${cmk("reject")}</button></div></div></div>`;
}
const CM_DONE = { approve: "approved", reject: "rejected", checkin: "checkedIn", checkout: "checkedOut", cancel: "cancelled" };
async function cmDecideVisit(id, action, ready = true) {
  const body = { action };
  if (action === "reject") {
    const note = await uiPrompt(t("cm.decide.rejectPrompt"));
    if (!note) return;
    body.note = note;
  }
  if (action === "approve" && !ready) {
    const reason = await uiPrompt(t("cm.decide.overridePrompt"));
    if (!reason) return;
    body.overrideReason = reason;
  }
  try {
    await api(`/site-visits/${encodeURIComponent(id)}`, { method: "PATCH", body });
    tToast(t("cm.decide." + CM_DONE[action]));
    route();
  } catch (x) {
    toast(x.message, "error");
  }
}
actions.on("cm.visit", (el) => cmDecideVisit(el.dataset.id, el.dataset.step, el.dataset.ready !== ""));
async function cmReviewDoc(id, status) {
  const body = { status };
  if (status === "Rejected") {
    const note = await uiPrompt(t("cm.decide.docRejectPrompt"));
    if (!note) return;
    body.note = note;
  }
  try {
    await api(`/compliance/documents/${encodeURIComponent(id)}`, { method: "PATCH", body });
    tToast(t(status === "Rejected" ? "cm.decide.docRejected" : "cm.decide.docAccepted"));
    route();
  } catch (x) {
    toast(x.message, "error");
  }
}
actions.on("cm.reviewDoc", (el) => cmReviewDoc(el.dataset.id, el.dataset.status));

/* ---------- Customer: site form ---------- */
async function cmSiteForm(id) {
  const [cat, { projects = [] }, site] = await Promise.all([
    cmCat(),
    api("/projects"),
    id ? api(`/sites/${encodeURIComponent(id)}`).then((d) => d.site) : Promise.resolve({ requirements: ["insurance", "minimumWage"], permitTypes: [], projectIds: [] }),
  ]);
  const f = (key) => cmk("form." + key),
    box = (name, value, checked, label) => `<label class="cc-check-label"><input type="checkbox" name="${name}" value="${esc(value)}" ${checked ? "checked" : ""}> ${label}</label>`,
    req = (scope) =>
      Object.entries(cat.requirements)
        .filter(([, r]) => r.scope === scope)
        .map(([k, r]) => box("req", k, site.requirements?.includes(k), cmReq(k) + (r.expires ? ` <small class="subtle">${f("expires")}</small>` : "")))
        .join(""),
    input = (name, label, extra = "") => `<label>${f(label)}<input name="${name}" value="${esc(site[name] ?? "")}"${extra}></label>`;
  modal(
    t(id ? "cm.form.edit" : "cm.form.new"),
    `<form id="cmSiteForm" class="modal-form" data-action="cm.saveSite" data-id="${esc(id || "")}"><div class="two">${input("name", "name", ` required placeholder="${f("nameHint")}"`)}${input("address", "address")}</div><div class="three">${input(
      "contactName",
      "contact",
    )}${input("contactPhone", "phone")}${input("emergencyNumber", "emergency")}</div>
    <label>${f("coverage")}<input name="minCoverage" type="number" min="0" step="100000" value="${esc(site.minCoverage ?? "")}" placeholder="${f("coverageHint")}"></label>
    <fieldset class="cm-fieldset"><legend>${f("company")}</legend><div class="cm-checks">${req("company")}</div></fieldset>
    <fieldset class="cm-fieldset"><legend>${f("worker")}</legend><div class="cm-checks">${req("worker")}</div></fieldset>
    <fieldset class="cm-fieldset"><legend>${f("permits")}</legend><div class="cm-checks">${Object.keys(cat.permits)
      .filter((k) => k !== "none")
      .map((k) => box("permit", k, site.permitTypes?.includes(k), cmPermit(k)))
      .join("")}</div></fieldset>
    <label>${f("briefing")}<textarea name="briefingContent" rows="6" placeholder="${f("briefingHint")}">${esc(site.briefing?.content || "")}</textarea></label>
    <fieldset class="cm-fieldset"><legend>${f("projects")}</legend><div class="cm-checks">${
      projects.map((p) => box("project", p.id, site.projectIds?.includes(p.id), esc(p.name))).join("") || `<small class="subtle">${f("noProjects")}</small>`
    }</div></fieldset>
    <div id="cmSiteError" class="form-error"></div><button class="btn primary">${f(id ? "save" : "create")}</button></form>`,
  );
}
actions.on("cm.siteForm", (el) => cmSiteForm(el.dataset.id));
actions.on("cm.saveSite", async (form) => {
  const f = new FormData(form),
    id = form.dataset.id;
  const b = {
    name: f.get("name"),
    address: f.get("address"),
    contactName: f.get("contactName"),
    contactPhone: f.get("contactPhone"),
    emergencyNumber: f.get("emergencyNumber"),
    minCoverage: f.get("minCoverage") === "" ? null : Number(f.get("minCoverage")),
    briefingContent: f.get("briefingContent"),
    requirements: f.getAll("req"),
    permitTypes: f.getAll("permit"),
    projectIds: f.getAll("project"),
  };
  try {
    const r = await api(id ? `/sites/${encodeURIComponent(id)}` : "/sites", { method: id ? "PATCH" : "POST", body: b });
    closeModal();
    tToast(t(id ? "cm.form.saved" : "cm.form.created"));
    navigate("/customer/sites/" + r.site.id);
    route();
  } catch (x) {
    document.getElementById("cmSiteError").textContent = x.message;
  }
});

/* ---------- Customer: site detail ---------- */
// The site asks for more liability coverage than the supplier's application states (T60). A warning, not a blocker.
function cmCoverageNote(c) {
  return c?.below
    ? `<span class="cm-coverage-warn" role="note"><b>${cmk("coverage")}</b> <small>${cmk("coverageOf", { actual: fmt.money(c.actual), required: fmt.money(c.required) })}</small></span>`
    : "";
}
async function cmSiteDetail(siteId) {
  const [, d, { visits = [] }, { documents = [] }] = await Promise.all([cmCat(), api(`/sites/${encodeURIComponent(siteId)}`), api("/site-visits"), api("/compliance/documents")]);
  const s = d.site,
    k = (key, params) => cmk("detail." + key, params),
    mine = visits.filter((v) => v.siteId === siteId),
    open = mine.filter((v) => ["Requested", "Approved", "Checked in"].includes(v.status)),
    supplierIds = new Set(d.readiness.map((r) => r.supplierId)),
    toReview = documents.filter((x) => supplierIds.has(x.supplierId) && (!x.review || x.review.status === "Pending review") && (s.requirements || []).includes(x.requirementKey)),
    onSiteWorkers = d.onSite.flatMap((v) => v.workers.map((w) => ({ ...w, company: v.supplierCompany, since: v.checkedInAt, permit: v.permitType !== "none" ? v.permitType : "" }))),
    item = (x) => `<div><span>${cmReq(x.key)}</span>${cmTag(x.state)}<small>${x.expiresAt ? esc(fmt.date(x.expiresAt)) : ""}</small></div>`,
    ready = (r) =>
      `<details class="cm-ready"><summary>${r.ready ? `<span class="status completed">${cmk("ready")}</span>` : `<span class="status rejected">${cmk("notReady")}</span>`}<b>${esc(r.company_name)}</b><small>${k("companyDocs", {
        ok: r.company.filter((c) => ["Valid", "Expiring"].includes(c.state)).length,
        n: r.company.length,
      })} · ${k("workersReady", { ok: r.workers.filter((w) => w.ready).length, n: r.workers.length })}${r.expiringSoon ? " · " + k("expiringSoon", { n: r.expiringSoon }) : ""}</small>${cmCoverageNote(r.coverage)}</summary><div class="cm-matrix">${r.company.map(item).join("")}${
        r.workers.map((w) => `<h4>${esc(w.name)} <small>${esc(w.role || "")}</small></h4>${w.items.map(item).join("")}`).join("") || `<p class="pa-empty">${k("noWorkers")}</p>`
      }</div></details>`,
    head = [s.address ? esc(s.address) : "", s.emergencyNumber ? k("emergency", { number: s.emergencyNumber }) : "", s.contactName ? k("contact", { name: `${s.contactName} ${s.contactPhone || ""}`.trim() }) : ""].filter(Boolean).join(" · ");
  app.innerHTML = dashboardShell(
    "customer",
    "sites",
    [
      `<div class="breadcrumb"><a href="#/customer/sites">${k("back")}</a></div>`,
      `<div class="dash-top"><div><div class="eyebrow">${k("eyebrow")}</div><h1>${esc(s.name)}</h1><p>${head}</p></div><div class="in-toolbar"><button class="btn outline" data-action="cm.print" data-id="${esc(siteId)}">${k(
        "print",
      )}</button><button class="btn primary" data-action="cm.siteForm" data-id="${esc(siteId)}">${k("edit")}</button></div></div>`,
      `<div class="in-kpis">${cmKpi(t("cm.sites.onSite"), onSiteWorkers.length, t.plural("cm.sites.visits", d.onSite.length))}${cmKpi(
        t("cm.detail.openRequests"),
        mine.filter((v) => v.status === "Requested").length,
        t("cm.sites.waiting"),
        mine.some((v) => v.status === "Requested") ? "warn" : "good",
      )}${cmKpi(t("cm.detail.suppliersReady"), `${d.readiness.filter((r) => r.ready).length}/${d.readiness.length}`, t("cm.detail.meetAll"), d.readiness.every((r) => r.ready) ? "good" : "warn")}${cmKpi(
        t("cm.detail.briefing"),
        s.briefing?.content ? `v${s.briefing.version}` : "—",
        s.briefing?.content ? t("cm.detail.updated", { date: fmt.date(s.briefing.updatedAt) }) : t("cm.detail.notWritten"),
        s.briefing?.content ? "" : "warn",
      )}</div>`,
      `<div class="in-grid"><section class="panel"><div class="panel-title"><h3>${cmk("sites.onSite")}</h3><span class="ui-count">${onSiteWorkers.length}</span></div>${
        onSiteWorkers
          .map((w) => `<div class="pa-row"><span><b>${esc(w.name)}</b><small>${esc(w.company)} · ${esc(w.role || "")} · ${k("since", { time: paTime(w.since) })}${w.permit ? " · " + cmPermit(w.permit) : ""}</small></span></div>`)
          .join("") || `<p class="pa-empty">${k("nobody")}</p>`
      }</section><section class="panel"><div class="panel-title"><h3>${cmk("sites.requests")}</h3><span class="ui-count">${open.length}</span></div>${open.map(cmVisitRow).join("") || `<p class="pa-empty">${k("noOpen")}</p>`}</section></div>`,
      `<section class="panel"><div class="panel-title"><h3>${k("readiness")}</h3><small class="subtle">${cmPlural("detail.reqCount", (s.requirements || []).length)}</small></div>${d.readiness.map(ready).join("") || `<p class="pa-empty">${k("noSuppliers")}</p>`}</section>`,
      `<section class="panel"><div class="panel-title"><h3>${cmk("sites.toReview")}</h3><span class="ui-count">${toReview.length}</span></div>${toReview.map(cmDocReviewRow).join("") || `<p class="pa-empty">${cmk("sites.allReviewed")}</p>`}</section>`,
      s.briefing?.content ? `<details class="panel cm-briefing"><summary><h3>${k("briefingVersion", { n: s.briefing.version })}</h3></summary><div class="legal-body">${legalHtml(s.briefing.content)}</div></details>` : "",
    ]
      .filter(Boolean)
      .join(""),
  );
}
async function cmPrintRollCall(siteId) {
  const d = await api(`/sites/${encodeURIComponent(siteId)}`),
    p = (key, params) => cmk("print." + key, params),
    rows = d.onSite.flatMap((v) => v.workers.map((w) => `<tr><td>${esc(w.name)}</td><td>${esc(v.supplierCompany)}</td><td>${esc(w.role || "")}</td><td>${paTime(v.checkedInAt)}</td><td></td></tr>`)).join("");
  const win = window.open("", "_blank");
  if (!win) return tToast(t("cm.print.popups"), "error");
  win.document.write(
    `<!doctype html><html lang="${ccLang}"><title>${p("title", { site: d.site.name })}</title><style>body{font:14px system-ui;padding:24px}table{border-collapse:collapse;width:100%}td,th{border:1px solid #999;padding:8px;text-align:left}th{background:#eee}</style><h1>${p(
      "heading",
      { site: d.site.name },
    )}</h1><p>${esc(new Date().toLocaleString(fmt.locale()))} · ${p("emergency", { number: d.site.emergencyNumber || "—" })}</p><table><tr><th>${p("name")}</th><th>${p("company")}</th><th>${p("role")}</th><th>${p(
      "checkedIn",
    )}</th><th>${p("present")}</th></tr>${rows || `<tr><td colspan="5">${p("nobody")}</td></tr>`}</table></html>`,
  );
  win.document.close();
  win.focus();
  win.print();
}
actions.on("cm.print", (el) => cmPrintRollCall(el.dataset.id));

/* ---------- Supplier: compliance page ---------- */
async function cmSupplierPage() {
  const [cat, { sites = [] }, { workers = [] }, { documents = [] }, { visits = [] }] = await Promise.all([cmCat(), api("/sites"), api("/workers"), api("/compliance/documents"), api("/site-visits")]);
  const u = (key, params) => cmk("sup." + key, params),
    company = Object.entries(cat.requirements).filter(([, r]) => r.scope === "company"),
    workerReqs = Object.entries(cat.requirements).filter(([, r]) => r.scope === "worker"),
    latest = (k, wid = null) => documents.filter((d) => d.requirementKey === k && (d.workerId || null) === wid).sort((a, b) => String(b.uploadedAt).localeCompare(String(a.uploadedAt)))[0];
  const docCell = (k, wid = null) => {
    const d = latest(k, wid),
      reviews = Object.values(d?.reviews || {}),
      rej = reviews.find((r) => r.status === "Rejected"),
      state = !d ? "Missing" : d.expiresAt && d.expiresAt < cmToday() ? "Expired" : rej ? "Rejected" : reviews.some((r) => r.status === "Accepted") ? "Accepted" : "Pending review";
    return `<div class="cm-doc"><div><b>${cmReq(k)}</b><small>${d ? `${esc(d.filename)}${d.expiresAt ? " · " + cmk("validUntil", { date: fmt.date(d.expiresAt) }) : ""}` : u("notUploaded")}${
      rej ? ` · <bdi>${esc(rej.note)}</bdi>` : ""
    }</small></div>${cmTag(state)}<div class="cc-actions">${d ? `<a class="btn small outline" href="${esc(d.url)}">${cmk("view")}</a>` : ""}<button class="btn small ${d ? "outline" : "primary"}" data-action="cm.upload" data-req="${esc(k)}" data-worker="${esc(
      wid || "",
    )}">${u(d ? "replace" : "upload")}</button></div></div>`;
  };
  const siteRow = (s) => {
    const r = s.readiness,
      missing = [
        ...r.company.filter((c) => !["Valid", "Expiring"].includes(c.state)).map((c) => cmReq(c.key)),
        ...r.workers.flatMap((w) => w.items.filter((i) => !["Valid", "Expiring"].includes(i.state)).map((i) => `${esc(w.name)}: ${cmReq(i.key)}`)),
      ];
    return `<div class="cm-site-ready"><div><b>${esc(s.name)}</b><small>${esc(s.address || "")}</small>${cmCoverageNote(r.coverage)}${
      missing.length
        ? `<ul>${missing
            .slice(0, 6)
            .map((m) => `<li>${m}</li>`)
            .join("")}${missing.length > 6 ? `<li>${u("more", { n: missing.length - 6 })}</li>` : ""}</ul>`
        : ""
    }</div><div class="cm-visit-side">${r.ready ? `<span class="status completed">${cmk("ready")}</span>` : `<span class="status rejected">${cmk("actionNeeded")}</span>`}<div class="cc-actions">${
      s.briefing?.content ? `<button class="btn small outline" data-action="cm.briefing" data-id="${esc(s.id)}">${u("briefing")}</button>` : ""
    }<button class="btn small primary" data-action="cm.access" data-id="${esc(s.id)}">${u("requestAccess")}</button></div></div></div>`;
  };
  const visitRow = (v) => {
    const btn = (step, label, cls = "outline") => `<button class="btn small ${cls}" data-action="cm.supplierVisit" data-id="${esc(v.id)}" data-step="${step}">${cmk(label)}</button>`;
    return `<div class="cm-visit"><div><b>${esc(v.siteName)} · ${cmDates(v)}${v.startTime ? " · " + esc(v.startTime) : ""}</b><small>${v.workers.map((w) => esc(w.name)).join(", ")}${v.permitType !== "none" ? " · " + cmPermit(v.permitType) : ""}</small></div><div class="cm-visit-side">${cmTag(
      v.status,
    )}<div class="cc-actions">${v.status === "Approved" && v.date <= cmToday() && cmToday() <= v.endDate ? btn("checkin", "checkIn", "primary") : ""}${v.status === "Checked in" ? btn("checkout", "checkOut") : ""}${
      ["Requested", "Approved"].includes(v.status) ? btn("cancel", "cancel") : ""
    }</div></div></div>`;
  };
  const workerRow = (w) =>
    `<details class="cm-ready"><summary><b>${esc(w.name)}</b><small>${esc(w.role || "")}${w.postedFromAbroad ? " · " + u("posted") : ""}</small></summary><div class="cm-summary-actions"><button type="button" class="btn small outline" data-action="cm.worker" data-id="${esc(
      w.id,
    )}">${u("editWorker")}</button></div>${workerReqs
      .filter(([, r]) => !r.onlyPosted || w.postedFromAbroad)
      .map(([k]) => docCell(k, w.id))
      .join("")}</details>`;
  app.innerHTML = dashboardShell(
    "supplier",
    "compliance",
    [
      `<div class="dash-top"><div><div class="eyebrow">${u("eyebrow")}</div><h1>${u("title")}</h1><p>${u("lead")}</p></div><button class="btn primary" data-action="cm.access">${u("request")}</button></div>`,
      `<section class="panel"><div class="panel-title"><h3>${u("sites")}</h3><span class="ui-count">${sites.length}</span></div>${sites.map(siteRow).join("") || `<p class="pa-empty">${u("noSites")}</p>`}</section>`,
      `<section class="panel"><div class="panel-title"><h3>${u("companyDocs")}</h3></div>${company.map(([k]) => docCell(k)).join("")}</section>`,
      `<section class="panel"><div class="panel-title"><h3>${u("workers")}</h3><button class="btn small primary" data-action="cm.worker">${u("addWorker")}</button></div>${
        workers
          .filter((w) => w.active !== false)
          .map(workerRow)
          .join("") || `<p class="pa-empty">${u("noWorkers")}</p>`
      }</section>`,
      `<section class="panel"><div class="panel-title"><h3>${u("access")}</h3><span class="ui-count">${visits.length}</span></div>${visits.map(visitRow).join("") || `<p class="pa-empty">${u("noAccess")}</p>`}</section>`,
    ]
      .join(""),
  );
}
// The supplier dashboard calls this too
async function cmSupplierVisit(id, action) {
  try {
    await api(`/site-visits/${encodeURIComponent(id)}`, { method: "PATCH", body: { action } });
    tToast(t("cm.decide." + CM_DONE[action]));
    route();
  } catch (x) {
    toast(x.message, "error");
  }
}
actions.on("cm.supplierVisit", (el) => cmSupplierVisit(el.dataset.id, el.dataset.step));

/* ---------- Supplier: dialogs ---------- */
async function cmWorkerForm(id) {
  const { workers = [] } = await api("/workers"),
    w = workers.find((x) => x.id === id) || {},
    f = (key) => cmk("worker." + key);
  modal(
    t(id ? "cm.worker.edit" : "cm.worker.add"),
    `<form id="cmWorkerForm" class="modal-form" data-action="cm.saveWorker" data-id="${esc(id || "")}"><div class="two"><label>${f("name")}<input name="name" value="${esc(w.name || "")}" required></label><label>${f(
      "role",
    )}<input name="role" value="${esc(w.role || "")}" placeholder="${f("roleHint")}"></label></div><label>${f("phone")}<input name="phone" value="${esc(w.phone || "")}"></label><label class="cc-check-label"><input type="checkbox" name="postedFromAbroad" ${
      w.postedFromAbroad ? "checked" : ""
    }> ${f("posted")}</label>${id ? `<label class="cc-check-label"><input type="checkbox" name="inactive" ${w.active === false ? "checked" : ""}> ${f("inactive")}</label>` : ""}<div id="cmWorkerError" class="form-error"></div><button class="btn primary">${f(
      id ? "save" : "add",
    )}</button></form>`,
  );
}
actions.on("cm.worker", (el) => cmWorkerForm(el.dataset.id));
actions.on("cm.saveWorker", async (form) => {
  const f = new FormData(form),
    id = form.dataset.id,
    b = { name: f.get("name"), role: f.get("role"), phone: f.get("phone"), postedFromAbroad: f.has("postedFromAbroad"), active: !f.has("inactive") };
  try {
    await api(id ? `/workers/${encodeURIComponent(id)}` : "/workers", { method: id ? "PATCH" : "POST", body: b });
    closeModal();
    tToast(t(id ? "cm.worker.saved" : "cm.worker.added"));
    route();
  } catch (x) {
    document.getElementById("cmWorkerError").textContent = x.message;
  }
});
async function cmUploadDoc(key, workerId) {
  const cat = await cmCat(),
    r = cat.requirements[key],
    f = (k) => cmk("doc." + k);
  modal(
    t("cm.doc.title"),
    `<form id="cmDocForm" class="modal-form" data-action="cm.saveDoc" data-req="${esc(key)}" data-worker="${esc(workerId || "")}"><p><b>${cmReq(key)}</b></p><label>${f(
      "file",
    )}<input name="file" type="file" accept=".pdf,.png,.jpg,.jpeg" required></label><div class="two"><label>${f("issued")}<input name="issuedAt" type="date"></label><label>${f(r.expires ? "validRequired" : "validOptional")}<input name="expiresAt" type="date" min="${cmToday()}" ${
      r.expires ? "required" : ""
    }></label></div><p class="subtle">${f("note")}</p><div id="cmDocError" class="form-error"></div><button class="btn primary">${f("upload")}</button></form>`,
  );
}
actions.on("cm.upload", (el) => cmUploadDoc(el.dataset.req, el.dataset.worker || undefined));
actions.on("cm.saveDoc", async (form) => {
  const f = new FormData(form),
    file = form.elements.file.files[0],
    btn = form.querySelector("button.primary");
  btn.disabled = true;
  try {
    const up = await uploadFile(file);
    await api("/compliance/documents", {
      method: "POST",
      body: { requirementKey: form.dataset.req, workerId: form.dataset.worker || undefined, filename: up.filename, url: up.url, issuedAt: f.get("issuedAt"), expiresAt: f.get("expiresAt") },
    });
    closeModal();
    tToast(t("cm.doc.uploaded"));
    route();
  } catch (x) {
    document.getElementById("cmDocError").textContent = x.message;
    btn.disabled = false;
  }
});
async function cmBriefing(siteId) {
  const [{ site }, { workers = [] }] = await Promise.all([api(`/sites/${encodeURIComponent(siteId)}`), api("/workers")]),
    f = (key, params) => cmk("brief." + key, params);
  modal(
    t("cm.brief.title", { site: site.name }),
    `<div class="legal-body cm-briefing-text">${legalHtml(site.briefing.content)}</div><form id="cmBriefForm" class="modal-form" data-action="cm.sign" data-id="${esc(siteId)}"><p class="subtle">${f("note")}</p><label>${f(
      "worker",
    )}<select name="workerId" required><option value="">${f("choose")}</option>${workers
      .filter((w) => w.active !== false)
      .map((w) => `<option value="${esc(w.id)}">${esc(w.name)}</option>`)
      .join("")}</select></label><label class="cc-check-label"><input type="checkbox" name="confirm" required> ${f("confirm", { n: site.briefing.version })}</label><label>${f(
      "signature",
    )}<input name="signatureName" required autocomplete="off"></label><div id="cmBriefError" class="form-error"></div><button class="btn primary">${f("sign")}</button></form>`,
  );
}
actions.on("cm.briefing", (el) => cmBriefing(el.dataset.id));
actions.on("cm.sign", async (form) => {
  const f = new FormData(form);
  try {
    await api(`/sites/${encodeURIComponent(form.dataset.id)}/briefings`, { method: "POST", body: { workerId: f.get("workerId"), confirm: f.has("confirm"), signatureName: f.get("signatureName") } });
    tToast(t("cm.brief.signed"));
    form.reset();
    document.getElementById("cmBriefError").textContent = "";
    route();
  } catch (x) {
    document.getElementById("cmBriefError").textContent = x.message;
  }
});
async function cmAccessForm(siteId) {
  const [cat, { sites = [] }, { workers = [] }] = await Promise.all([cmCat(), api("/sites"), api("/workers")]);
  if (!sites.length) return tToast(t("cm.access.noSites"), "error");
  const site = sites.find((s) => s.id === siteId) || sites[0],
    detail = await api(`/sites/${encodeURIComponent(site.id)}`),
    permits = ["none", ...(site.permitTypes || [])].filter((k) => cat.permits[k]),
    f = (key) => cmk("access." + key);
  modal(
    t("cm.access.title"),
    `<form id="cmAccessForm" class="modal-form" data-action="cm.requestAccess"><label>${f("site")}<select name="siteId" data-action="cm.accessSite">${sites
      .map((s) => `<option value="${esc(s.id)}" ${s.id === site.id ? "selected" : ""}>${esc(s.name)}</option>`)
      .join("")}</select></label><label>${f("project")}<select name="projectId">${detail.projects.map((p) => `<option value="${esc(p.id)}">${esc(p.name)}</option>`).join("")}</select></label><div class="two"><label>${f(
      "from",
    )}<input name="date" type="date" min="${cmToday()}" value="${cmToday()}" required></label><label>${f("until")}<input name="endDate" type="date" min="${cmToday()}" value="${cmToday()}"></label></div><label>${f("arrival")}<input name="startTime" type="time"></label>
    <fieldset class="cm-fieldset"><legend>${f("workers")}</legend><div class="cm-checks">${
      workers
        .filter((w) => w.active !== false)
        .map((w) => {
          const r = site.readiness.workers.find((x) => x.workerId === w.id);
          return `<label class="cc-check-label"><input type="checkbox" name="workerIds" value="${esc(w.id)}"> ${esc(w.name)} ${r?.ready ? `<span class="status completed">${cmk("ready")}</span>` : `<span class="status rejected">${cmk("incomplete")}</span>`}</label>`;
        })
        .join("") || `<small class="subtle">${f("addWorkers")}</small>`
    }</div></fieldset>
    <label>${f("permit")}<select name="permitType" id="cmPermit" data-action="cm.permit">${permits.map((k) => `<option value="${esc(k)}">${cmPermit(k)}</option>`).join("")}</select></label><div id="cmChecklist" class="cm-checks"></div>
    <label>${f("description")}<textarea name="description" rows="2" placeholder="${f("descriptionHint")}"></textarea></label>${site.readiness.companyReady ? "" : `<p class="danger-text">${f("companyIncomplete")}</p>`}<div id="cmAccessError" class="form-error"></div><button class="btn primary">${f(
      "send",
    )}</button></form>`,
  );
  cmRenderChecklist();
}
// The checklist of the chosen permit; every point must be ticked
function cmRenderChecklist() {
  const k = document.getElementById("cmPermit")?.value;
  if (!k) return;
  document.getElementById("cmChecklist").innerHTML = cmChecks(k)
    .map((c, i) => `<label class="cc-check-label"><input type="checkbox" name="check_${i}" required> ${esc(c)}</label>`)
    .join("");
}
actions.on("cm.access", (el) => cmAccessForm(el.dataset.id));
actions.on("cm.accessSite", (sel) => cmAccessForm(sel.value));
actions.on("cm.permit", () => cmRenderChecklist());
actions.on("cm.requestAccess", async (form) => {
  const cat = await cmCat(),
    f = new FormData(form),
    k = f.get("permitType");
  const b = {
    siteId: f.get("siteId"),
    projectId: f.get("projectId"),
    date: f.get("date"),
    endDate: f.get("endDate"),
    startTime: f.get("startTime"),
    workerIds: f.getAll("workerIds"),
    permitType: k,
    checklist: cat.permits[k].checklist.map((_, i) => f.has("check_" + i)),
    description: f.get("description"),
  };
  try {
    await api("/site-visits", { method: "POST", body: b });
    closeModal();
    tToast(t("cm.access.requested"));
    route();
  } catch (x) {
    document.getElementById("cmAccessError").textContent = x.message;
  }
});

/* ---------- Approvals inbox (T104, board PhoneApprove) ----------
   One panel per kind of decision, oldest first: invoices as cards with their checks, time entries as a grouped
   list, both with approve buttons; site access, compliance documents, project documents, offers and contracts as
   rows that link to their page. A filter shows all, invoices or time. */
async function srApprovals() {
  const [{ invoices = [] }, { projects = [] }, { entries = [] }, { bids = [] }, { contracts = [] }, { visits = [] }, { documents: complianceDocs = [] }] = await Promise.all([
    api("/invoices"),
    api("/projects"),
    api("/time-entries").catch(() => ({})),
    api("/bids"),
    api("/contracts"),
    api("/site-visits").catch(() => ({})),
    api("/compliance/documents").catch(() => ({})),
    cmCat(),
  ]);
  const docs = (
    await Promise.all(projects.map((p) => api(`/projects/${encodeURIComponent(p.id)}/documents`).then((d) => (d.documents || []).map((x) => ({ ...x, projectName: p.name }))).catch(() => [])))
  ).flat();
  const a = (key, params) => esc(t("appr." + key, params)),
    oldest = (list, at) => [...list].sort((x, y) => String(at(x) || "").localeCompare(String(at(y) || ""))),
    days = (d) => srDays(d || new Date(), new Date()),
    row = (x) =>
      `<a class="pa-row" href="#${esc(x.link)}"><span><b>${esc(x.title)}</b><small>${x.sub}</small></span><span class="pa-pill ${days(x.since) > 5 ? "red" : ""}">${
        days(x.since) ? esc(t.plural("appr.age", days(x.since))) : a("today")
      }</span></a>`;
  const waitingInvoices = invoices.filter((i) => i.status === "Submitted"),
    approvedTime = entries.filter((e) => e.status === "Approved"),
    pendingTime = entries.filter((e) => e.status === "Pending approval"),
    pendingVisits = visits.filter((v) => v.status === "Requested"),
    toReview = complianceDocs.filter((d) => !d.review || d.review.status === "Pending review");
  const invoiceCard = (i) => {
    const net = i.vatMode ? Number(i.netAmount) : Number(i.amount),
      cap = Number(i.orderedAmount) || 0,
      hourLines = (i.lineItems || []).filter((x) => /^(h|hour|hours|std|stunden)$/i.test(String(x.unit))),
      hours = hourLines.reduce((s, x) => s + Number(x.quantity || 0), 0),
      okHours = approvedTime.filter((e) => e.taskId === i.taskId).reduce((s, e) => s + Number(e.hours || 0), 0),
      check = (ok, key) => `<li class="${ok ? "ds-ok" : "ds-warn"}"><span aria-hidden="true">${ok ? "✓" : "!"}</span>${a(key)}</li>`,
      checks = [cap ? check(net <= cap, net <= cap ? "withinCap" : "overCapCheck") : "", hourLines.length ? check(hours <= okHours, hours <= okHours ? "hoursMatch" : "hoursOver") : ""].join(""),
      btn = (decision, cls, label) => `<button type="button" class="btn ${cls}" data-action="appr.invoice" data-id="${esc(i.id)}" data-decision="${decision}">${a(label)}</button>`;
    return `<article class="ds-approve-card"><div class="ds-approve-top"><a class="ds-approve-kicker" href="#/customer/invoice/${encodeURIComponent(i.id)}">${a("invoice", { number: invNo(i) })}</a><span class="status" data-ds-fixed data-ds-tone="orange">${a(
      (i.revisions || []).length ? "corrected" : "submitted",
    )}</span></div><b class="ds-approve-amount">${esc(fmt.money(i.vatMode ? i.grossAmount : i.amount))}</b><span class="ds-approve-sub">${esc([i.supplierCompany, i.taskName || i.description].filter(Boolean).join(" · "))}</span>${
      checks ? `<ul class="ds-approve-checks">${checks}</ul>` : ""
    }<div class="ds-approve-btns">${btn("Request Changes", "secondary", "changes")}${btn("Approve", "primary", "approve")}</div></article>`;
  };
  const timeRow = (e) =>
    `<div class="ds-time-row"><a href="#/customer/time"><b>${a("hours", { n: fmt.number(Number(e.hours), 1), name: e.employeeName })}</b><span>${esc(
      [new Date(String(e.workDate).slice(0, 10) + "T12:00:00").toLocaleDateString(fmt.locale(), { weekday: "short", day: "numeric", month: "short" }), e.location || e.projectName].filter(Boolean).join(" · "),
    )}</span></a><button type="button" class="ds-pill-approve" data-action="appr.time" data-id="${esc(e.id)}">${a("approve")}</button></div>`;
  const rows = (list) => list.map(row).join("");
  const groups = [
    ["invoices", "invoices", "invoices", waitingInvoices.length, waitingInvoices.map(invoiceCard).join("")],
    ["time", "time", "time", pendingTime.length, pendingTime.length ? `<div class="ds-time-list">${pendingTime.map(timeRow).join("")}</div>` : ""],
    ["other", "visits", "vetting", pendingVisits.length, pendingVisits.map(cmVisitRow).join("")],
    ["other", "compliance", "vetting", toReview.length, toReview.map(cmDocReviewRow).join("")],
    [
      "other",
      "documents",
      "contracts",
      ...((list) => [list.length, rows(list)])(
        oldest(
          docs.filter((d) => d.status === "Pending approval"),
          (d) => d.uploadedAt,
        ).map((d) => ({ title: d.filename, sub: `${esc(d.projectName)} · ${d.taskName || d.phaseName ? `<bdi>${esc(d.taskName || d.phaseName)}</bdi>` : a("project")}`, since: d.uploadedAt, link: `/customer/projects/${d.projectId}/documents` })),
      ),
    ],
    [
      "other",
      "offers",
      "sourcing",
      ...((list) => [list.length, rows(list)])(
        oldest(
          bids.filter((b) => SR_ACTIVE.includes(b.status) && (b.offers || []).some((o) => o.status === "Submitted")),
          (b) => b.updatedAt,
        ).map((b) => ({ title: b.title, sub: esc(t.plural("appr.offers", b.offers.filter((o) => o.status === "Submitted").length, { date: fmt.date(b.dueDate) })), since: b.updatedAt, link: `/customer/sourcing/${b.id}` })),
      ),
    ],
    [
      "other",
      "contracts",
      "contracts",
      ...((list) => [list.length, rows(list)])(
        oldest(
          contracts.filter((c) => c.state === "Draft"),
          (c) => c.createdAt,
        ).map((c) => ({ title: c.title, sub: esc(`${c.supplierCompany} · ${fmt.money(c.value)}`), since: c.createdAt, link: "/customer/contracts?state=Draft" })),
      ),
    ],
  ];
  const total = groups.reduce((s, g) => s + g[3], 0);
  app.innerHTML = dashboardShell(
    "customer",
    "approvals",
    [
      `<div class="dash-top ds-approve-head"><div><div class="eyebrow">${a("eyebrow")}</div><h1>${a("title")}</h1><p>${total ? esc(t.plural("appr.waiting", total)) : a("nothing")}</p></div></div>`,
      `<div class="ds-seg ds-approve-filter ds-ui" role="group" aria-label="${a("show")}">${[
        ["all", a("all", { n: total })],
        ["invoices", a("invoicesTab")],
        ["time", a("timeTab")],
      ]
        .map(([k, l], n) => `<button type="button" data-show="${k}" aria-pressed="${n === 0}" data-action="appr.show">${l}</button>`)
        .join("")}</div>`,
      `<div class="in-grid">${groups
        .map(
          ([kind, key, icon, n, body]) =>
            `<section class="panel" data-ds-kind="${kind}"><div class="panel-title"><h3>${uiIcon(icon, "ui-icon sr-h-icon")} ${a("group." + key)}</h3><span class="ui-count">${n}</span></div>${body || `<p class="pa-empty">${a("clear")}</p>`}</section>`,
        )
        .join("")}</div>`,
    ]
      .join(""),
  );
  document.querySelector(".dashboard-content")?.classList.add("ds-approvals");
}
actions.on("appr.show", (b) => {
  b.parentElement.querySelectorAll("button").forEach((x) => x.setAttribute("aria-pressed", String(x === b)));
  document.querySelectorAll(".ds-approvals .in-grid > section").forEach((sec) => sec.classList.toggle("ds-hidden", b.dataset.show !== "all" && sec.dataset.dsKind !== b.dataset.show));
});
// The invoice and time decisions re-render the current page when they are done, so Approvals stays open
actions.on("appr.invoice", (el) => invoiceAction(el.dataset.id, el.dataset.decision));
actions.on("appr.time", (el) => ccReviewTime(el.dataset.id, "Approved"));

routes.add("/customer/sites", cmSites);
routes.add("/customer/sites/:id", ({ id }) => cmSiteDetail(id));
routes.add("/supplier/compliance", cmSupplierPage);
routes.add("/customer/approvals", srApprovals);
