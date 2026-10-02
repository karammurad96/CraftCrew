/* Strategic sourcing: shared constants and icons, the approvals inbox, and the scorecards on admin reports. The
   sourcing dashboard, the offer comparison and contracts are in areas/sourcing.js (T129c). */
const srEsc = (v) => esc(v ?? "");
const SR_WEIGHTS = { price: 50, delivery: 20, quality: 20, experience: 10 };
const SR_ACTIVE = ["Open", "Shortlist", "Second round", "Final round"];
const srDays = (a, b) => Math.max(0, Math.round((Date.parse(b) - Date.parse(a)) / 86400000));
const srToday = () => new Date().toISOString().slice(0, 10);

Object.assign(UI_ICON_PATHS, {
  sourcing: '<circle cx="12" cy="12" r="9"/><circle cx="12" cy="12" r="5"/><circle cx="12" cy="12" r="1.5"/>',
  contracts:
    '<path d="M6 2h9l5 5v13a2 2 0 0 1-2 2H6a2 2 0 0 1-2-2V4a2 2 0 0 1 2-2z"/><path d="M14 2v6h6"/><path d="m8 16 2 2 5-5"/>',
  approvals: '<circle cx="12" cy="12" r="9"/><path d="m8 12 3 3 5-6"/>',
});
Object.assign(UI_NAV_ICONS, { sourcing: "sourcing", contracts: "contracts", approvals: "approvals" });

/* ---------- Approvals inbox ---------- */
async function srApprovals() {
  const [{ invoices = [] }, { projects = [] }, { entries = [] }, { bids = [] }, { contracts = [] }] =
    await Promise.all([
      api("/invoices"),
      api("/projects"),
      api("/time-entries").catch(() => ({})),
      api("/bids"),
      api("/contracts"),
    ]);
  const docs = (
    await Promise.all(
      projects.map((p) =>
        api(`/projects/${p.id}/documents`)
          .then((d) => (d.documents || []).map((x) => ({ ...x, projectName: p.name })))
          .catch(() => []),
      ),
    )
  ).flat();
  const groups = [
    [
      "Invoices to approve",
      "invoices",
      invoices
        .filter((i) => i.status === "Submitted")
        .map((i) => ({
          title: `${i.supplierCompany || ""} · ${money(i.amount)}`,
          sub: `${i.taskName || i.description || invNo(i)}${i.orderedAmount && invNet(i) > i.orderedAmount ? " · over order cap" : ""}`,
          since: i.updatedAt || i.createdAt,
          link: `/customer/invoice/${encodeURIComponent(i.id)}`,
        })),
    ],
    [
      "Documents to review",
      "contracts",
      docs
        .filter((d) => d.status === "Pending approval")
        .map((d) => ({
          title: d.filename,
          sub: `${d.projectName} · ${d.taskName || d.phaseName || "Project"}`,
          since: d.uploadedAt,
          link: `/customer/projects/${d.projectId}/documents`,
        })),
    ],
    [
      "Time entries to approve",
      "time",
      entries
        .filter((t) => t.status === "Pending approval")
        .map((t) => ({
          title: `${t.employeeName} · ${t.hours} h`,
          sub: `${t.taskName} · ${date(t.workDate)}`,
          since: t.submittedAt,
          link: "/customer/time",
        })),
    ],
    [
      "Offers to decide",
      "sourcing",
      bids
        .filter((b) => SR_ACTIVE.includes(b.status) && (b.offers || []).some((o) => o.status === "Submitted"))
        .map((b) => ({
          title: b.title,
          sub: `${b.offers.filter((o) => o.status === "Submitted").length} offer(s) · deadline ${date(b.dueDate)}`,
          since: b.updatedAt,
          link: `/customer/sourcing/${b.id}`,
        })),
    ],
    [
      "Contracts to activate",
      "contracts",
      contracts
        .filter((c) => c.state === "Draft")
        .map((c) => ({
          title: c.title,
          sub: `${c.supplierCompany} · ${money(c.value)}`,
          since: c.createdAt,
          link: "/customer/contracts?state=Draft",
        })),
    ],
  ];
  const total = groups.reduce((a, [, , l]) => a + l.length, 0),
    age = (d) => {
      const n = srDays(d || new Date(), new Date());
      return n ? `${n} d waiting` : "today";
    };
  app.innerHTML = dashboardShell(
    "customer",
    "approvals",
    `<div class="dash-top"><div><div class="eyebrow">WORKFLOW</div><h1>Approvals</h1><p>${total ? `${total} decision(s) waiting for you, oldest first.` : "Nothing is waiting for your decision."}</p></div></div><div class="in-grid">${groups
      .map(
        ([title, icon, list]) =>
          `<section class="panel"><div class="panel-title"><h3>${uiIcon(icon, "ui-icon sr-h-icon")} ${title}</h3><span class="ui-count">${list.length}</span></div>${
            list
              .sort((a, b) => String(a.since).localeCompare(String(b.since)))
              .map(
                (x) =>
                  `<a class="pa-row" href="#${x.link}"><span><b>${srEsc(x.title)}</b><small>${srEsc(x.sub)}</small></span><span class="pa-pill ${srDays(x.since || new Date(), new Date()) > 5 ? "red" : ""}">${age(x.since)}</span></a>`,
              )
              .join("") || '<p class="pa-empty">All clear.</p>'
          }</section>`,
      )
      .join("")}</div>`,
  );
}
/* ---------- Scorecards on admin reports (the supplier scorecard panel is in areas/directory.js) ---------- */
async function srAdminScorecards() {
  const content = document.querySelector(".dashboard-content");
  if (!content || content.querySelector(".sr-admin-cards")) return;
  const { scorecards = [] } = await api("/scorecards").catch(() => ({}));
  content.insertAdjacentHTML(
    "beforeend",
    `<section class="panel sr-admin-cards"><div class="panel-title"><h3>Supplier scorecards & risk</h3><span class="ui-count">${scorecards.length}</span></div>${srScorecardTable(scorecards)}</section>`,
  );
}

/* ---------- Navigation and routing ---------- */
const srBaseRoute = window.route;
window.route = async function () {
  const path = location.hash.replace(/^#/, "").split("?")[0],
    parts = path.split("/").filter(Boolean),
    role = state.user?.role;
  const own = parts[0] === role;
  try {
    if (own && role === "customer" && parts[1] === "approvals") {
      await srApprovals();
      return;
    }
  } catch (e) {
    console.error(e);
    toast(e.message, "error");
    return;
  }
  const result = await srBaseRoute();
  try {
    if (parts[0] === "supplier" && parts[1] === "analytics" && state.user?.supplierId)
      await srScorecardPanel(state.user.supplierId, document.querySelector(".dashboard-content"));
    if (parts[0] === "admin" && parts[1] === "reports") await srAdminScorecards();
  } catch (e) {
    console.error(e);
  }
  return result;
};
