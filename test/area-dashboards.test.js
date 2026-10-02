// T127b: the three dashboards render in one pass from translation keys: greeting and decision list (T95–T97),
// side cards, statistics, attention panels and lists, and the supplier's phone "Today" (T102). Server texts and
// stored data keep the old translation (data-i18n="dom"); every section keeps its layout key.
const { describe, it } = require("node:test");
const assert = require("node:assert/strict");
const { readFileSync, existsSync } = require("node:fs");
const path = require("node:path");
const vm = require("node:vm");

const read = (f) => readFileSync(path.join(__dirname, "..", "public", f), "utf8");
const today = new Date().toISOString().slice(0, 10);
const days = (n) => new Date(Date.now() + n * 86400000).toISOString().slice(0, 10);

const PROJECTS = [
  {
    id: "p1",
    name: "Line 4",
    status: "In Progress",
    budget: 100000,
    dueDate: days(30),
    phases: [
      {
        id: "ph1",
        name: "Build & integration",
        status: "In Progress",
        dueDate: days(30),
        tasks: [
          { id: "t1", name: "PLC", status: "In Progress", dueDate: days(-3), progress: 40, assignedSupplierId: "s1", acceptanceStatus: "Accepted" },
          { id: "t2", name: "Weld test", status: "Not Started", dueDate: days(5), progress: 0, assignedSupplierId: "s1", acceptanceStatus: "Pending" },
        ],
      },
    ],
  },
];
const INVOICES = [
  { id: "inv_1", number: "2026-0001", projectId: "p1", amount: 8806, status: "Submitted", createdAt: days(-10), supplierCompany: "Keller", taskName: "PLC" },
  { id: "inv_2", number: "2026-0002", projectId: "p1", amount: 1200, status: "Paid", createdAt: days(-40), paymentDate: today, customerCompany: "MAKBERG" },
];
const QUEUE = {
  customer: {
    total: 5,
    items: [
      { kind: "invoice", link: "/customer/invoice/inv_1", invoiceId: "inv_1", number: "2026-0001", amount: 8806, supplier: "Keller", sub: "Robot cell" },
      { kind: "offer", link: "/customer/offers?project=p1", bidId: "bid_1", offers: 3, title: "Vision", best: { amount: 18900, supplier: "Rhein" } },
      { kind: "time", link: "/customer/time", entries: 2, hours: 14.5, suppliers: ["Keller"] },
      { kind: "overdue", link: "/customer/projects/p1", projectId: "p1", phaseId: "ph1", taskId: "t1", taskName: "PLC", dueDate: "2000-01-01" },
      { kind: "document", link: "/customer/projects/p1/documents", text: "Approve document FAT.pdf", sub: "Line 4", action: "Review" },
    ],
  },
  supplier: {
    total: 2,
    items: [
      { kind: "invitation", link: "/supplier/projects?invite=t2", invite: { projectId: "p1", taskId: "t2", name: "Weld test", project: "Line 4", phase: "Build & integration", customer: "MAKBERG", startDate: days(2), dueDate: days(5), orderAmount: 1000, invitedAt: today } },
      { kind: "compliance", link: "/supplier/compliance", text: "Expiring: BG.pdf", sub: "Valid until 2026-10-23", action: "Renew" },
    ],
  },
  admin: {
    total: 2,
    items: [
      { kind: "application", text: "Vet application: NordWerk", sub: "New", link: "/admin/applications", action: "Review" },
      { kind: "payment", text: "Mark invoice 2026-0001 as paid", sub: "Due 2026-10-04", link: "/admin/billing", action: "Record", amount: 32000 },
    ],
  },
};

function area(lang, role, { user = {}, queue = QUEUE[role], extra = {} } = {}) {
  const warnings = [],
    toasts = [],
    calls = [];
  const ctx = {
    console: { warn: (...a) => warnings.push(a.join(" ")), error() {}, log() {} },
    localStorage: { getItem: (k) => (k === "cc_lang" ? lang : null) },
    navigator: { language: "en-GB" },
    document: { addEventListener() {}, getElementById: (id) => ctx.fields[id] },
    location: { hash: `#/${role}/dashboard` },
    Intl,
    URLSearchParams,
    app: { innerHTML: "" },
    state: { user: { role, name: "Maya Hartmann", company: "Keller Automation", supplierId: "s1", id: "u1", ...user } },
    fields: {},
    route: async () => {},
    topActions() {},
    navigate() {},
    toast: (m, type) => toasts.push([m, type]),
    toastEl: { dataset: {} },
    dashboardShell: (r, active, html) => `[${r}:${active}]${html}`,
    esc: (s) => String(s ?? "").replace(/[&<>'"]/g, (c) => ({ "&": "&amp;", "<": "&lt;", ">": "&gt;", "'": "&#39;", '"': "&quot;" })[c]),
    invNo: (i) => i.number,
    pct: () => 50,
    modal() {},
    closeModal() {},
    invAnswerTask: (...a) => calls.push(["task", ...a]),
    invAnswerPhase: (...a) => calls.push(["phase", ...a]),
    reviewApplication: (id) => calls.push(["application", id]),
    api: async (p, opts) => {
      calls.push(["api", p, opts?.method || "GET"]);
      if (p === "/action-queue") return queue;
      if (p === "/dashboard") return { projects: PROJECTS, invoices: INVOICES };
      if (p === "/projects") return { projects: PROJECTS };
      if (p === "/invoices") return { invoices: INVOICES };
      if (p === "/profile") return { supplier: { id: "s1", company: "Keller Automation" } };
      if (p.startsWith("/planning")) return { people: [{ id: "a", name: "Marta K" }, { id: "b", name: "Jonas B" }, { id: "c", name: "Lea C" }], entries: [{ personId: "a", start: days(2), end: days(5), type: "job" }] };
      if (p === "/admin/metrics") return { metrics: { users: 28, suppliers: 25, projects: 8, grossVolume: 184200 } };
      if (p === "/admin/applications") return { applications: [{ id: "app_1", company: "NordWerk", email: "v@n.de", stage: "New", status: "New", createdAt: "2000-01-01" }] };
      if (p === "/disputes") return { disputes: [{ type: "Quality", status: "Open", description: "Weld seams" }] };
      if (p === "/audit") return { entries: [{ action: "Signed in", actorName: "Admin", entityId: "u_admin", at: new Date().toISOString() }] };
      return {};
    },
    ...extra,
  };
  ctx.window = ctx;
  vm.createContext(ctx);
  for (const f of ["locales/en.js", "locales/de.js", "core/t.js", "core/actions.js", "core/router.js", "areas/dashboards.js"])
    vm.runInContext(read(f), ctx, { filename: f });
  Object.assign(ctx, { warnings, toasts, calls });
  ctx.render = async () => (await ctx.route(), ctx.app.innerHTML);
  ctx.run = (name, data = {}) => vm.runInContext("actions", ctx).run(name, { dataset: data, closest: () => null }, { type: "click" });
  return ctx;
}
const text = (html) => html.replace(/<[^>]*>/g, " ").replace(/\s+/g, " ");

describe("dashboards area", () => {
  for (const lang of ["en", "de"])
    for (const role of ["customer", "supplier", "admin"])
      it(`draws the ${role} dashboard in ${lang === "en" ? "English" : "German"} from keys`, async () => {
        const ctx = area(lang, role),
          html = await ctx.render();
        assert.ok(html.startsWith(`[${role}:dashboard]`));
        assert.deepEqual(ctx.warnings, []);
        assert.doesNotMatch(text(html), /\bdash\.[a-zA-Z.]+/, "raw key");
        assert.doesNotMatch(html, /\son[a-z]+="/, "no inline handlers");
        assert.match(html, /<div data-i18n="keys" class="dash-top ds-dash-top">/);
        assert.match(html, /<section data-i18n="keys" class="aq-panel ds-dash" data-lc-section="aq-panel">/);
        assert.match(html, /<div data-i18n="keys" class="stats" data-lc-section="stats" data-lc-grid="stats-0">/);
        assert.match(html, /data-lc-section="pa-attention"/);
        assert.match(html, /data-lc-section="dashboard-grid"/);
        if (lang === "de") {
          assert.ok(html.includes(role === "supplier" ? "Außerdem für Sie" : "Braucht Ihre Entscheidung"));
          assert.ok(html.includes("Mehr auf Ihrer Übersicht"));
        }
      });

  it("words the customer's decisions from the queue and keeps every link (T95)", async () => {
    const html = await area("en", "customer").render();
    assert.match(html, /<span class="ds-dash-kicker">\w+day \d+ \w+<\/span><h1>Good (morning|afternoon|evening), Maya\.<\/h1><p>5 things need a decision\. Everything else is on track\.<\/p>/);
    assert.ok(html.includes("Invoice 2026-0001 · €8,806"));
    assert.match(html, /href="#\/customer\/invoice\/inv_1">Review</);
    assert.match(html, /data-action="dash\.approve" data-id="inv_1">Approve</);
    assert.ok(html.includes("3 offers · Vision"));
    assert.match(html, /class="ds-dec-title" href="#\/customer\/offers\?project=p1"/);
    assert.match(html, /href="#\/customer\/sourcing\/bid_1">Compare</);
    assert.ok(html.includes("2 time entries · 14.5 h"));
    assert.match(html, /PLC is \d+ days late/);
    assert.ok(html.includes('href="#/customer/messages?project=p1&amp;phase=ph1&amp;task=t1">Message<'));
    // A server text keeps the old translation
    assert.ok(html.includes('<span data-i18n="dom">Approve document FAT.pdf</span>'));
    assert.ok(html.includes('<a class="btn primary" href="#/customer/projects/new">+ New project</a>'));
    // Side cards, attention panels, lists
    assert.ok(html.includes('<span class="ds-ui">Late tasks</span><b class="ds-red">1</b>'));
    assert.match(html, /Delayed work <span class="pa-count red">1<\/span>/);
    assert.ok(html.includes('<a class="project-row project-click" href="#/customer/projects/p1">'));
    assert.ok(html.includes('<span class="status submitted" data-i18n="dom">Submitted</span>'));
    assert.ok(html.includes("Line 4 · <span data-i18n=\"dom\">Build &amp; integration</span>"));
  });

  it("says when nothing needs a decision, with the next deadline", async () => {
    const html = await area("de", "customer", { queue: { items: [], total: 0, nextDeadline: { link: "/customer/projects/p1", name: "FAT", project: "Line 4", dueDate: "2026-10-09" } } }).render();
    assert.ok(html.includes("Nichts braucht eine Entscheidung. Alles läuft nach Plan."));
    assert.ok(html.includes('Alles erledigt</b><span>Nächste Frist: <a href="#/customer/projects/p1">FAT</a> · Line 4 · 09. Okt. 2026</span>'));
  });

  it("shows the supplier the newest invitation with crew, answers and Today (T96, T102)", async () => {
    const ctx = area("en", "supplier"),
      html = await ctx.render();
    assert.ok(html.includes("A new job is waiting for your answer."));
    assert.ok(html.includes("New invitation · MAKBERG"));
    assert.match(html, /<b class="ds-crew-count ds-green">2 of 3 free<\/b>/);
    assert.match(html, /data-action="dash\.answer" data-project="p1" data-task="t2" data-accept="true">Accept Job</);
    assert.match(html, /href="#\/supplier\/messages\?project=p1">Ask a question ›</);
    assert.ok(html.includes("Also for you"));
    assert.match(html, /class="btn secondary ds-dec-btn" href="#\/supplier\/compliance"><span data-i18n="dom">Renew<\/span>/);
    // The phone "Today" comes first, with the accepted job and the quick actions
    assert.match(html, /^\[supplier:dashboard\]<section data-i18n="keys" class="ds-today" data-lc-section="ds-today">/);
    assert.match(html, /<b>PLC<\/b><small>40 % · due /);
    for (const q of ["time", "photo", "report", "defect"]) assert.ok(html.includes(`data-action="dash.quick" data-quick="${q}"`), q);
    // Pending invitations in the list and the invoice search
    assert.match(html, /<article class="review-pending-row"><b>Weld test<\/b>/);
    assert.ok(html.includes('<button class="btn primary" data-action="dash.filter">Apply</button>'));
    assert.ok(html.includes('href="#/supplier/invoice/inv_2?back=%2Fsupplier%2Fdashboard"'));
    for (const s of ["ds-today", "aq-panel", "stats", "pa-attention", "dashboard-grid", "review-dashboard-invoice-filters"]) assert.ok(html.includes(`data-lc-section="${s}"`), s);
    // Answering uses the invitation flow with its reason prompt and confirmation
    ctx.run("dash.answer", { project: "p1", task: "t2", accept: "false" });
    ctx.run("dash.answer", { project: "p1", phase: "ph1", accept: "true" });
    assert.deepEqual(ctx.calls.filter((c) => c[0] !== "api"), [["task", "p1", "t2", false], ["phase", "p1", "ph1", true]]);
  });

  it("filters the supplier's invoice search", async () => {
    const ctx = area("en", "supplier");
    await ctx.render();
    const value = (v) => ({ value: v });
    ctx.fields = { reviewSDFrom: value(""), reviewSDTo: value(""), reviewSDCustomer: value("nobody"), reviewSDProject: value(""), reviewSDMin: value(""), reviewSDMax: value("") };
    ctx.run("dash.filter");
    const html = await ctx.render();
    assert.ok(html.includes('<td colspan="6">No invoices fit these filters.</td>'));
    assert.ok(html.includes('id="reviewSDCustomer" value="nobody"'));
  });

  it("gives the admin the decision list, glance, alerts and vetting queue (T97)", async () => {
    const ctx = area("en", "admin", { user: { name: "CraftCrew Admin" } }),
      html = await ctx.render();
    assert.ok(html.includes('<span class="ds-dash-kicker">Admin</span><h1>Good'));
    assert.ok(html.includes('<a class="ds-dec-title" href="#/admin/applications"><span data-i18n="dom">Vet application: NordWerk</span></a>'));
    assert.ok(html.includes('<span class="ds-dec-sub"><span data-i18n="dom">Due 2026-10-04</span> · €32,000</span>'));
    assert.ok(html.includes('<span class="ds-ui">Live suppliers</span><b>25</b>'));
    assert.ok(html.includes("Open escalation: <span data-i18n=\"dom\">Quality</span>"));
    assert.ok(html.includes("Application waiting &gt; 3 days: NordWerk"));
    assert.ok(html.includes('<b><span data-i18n="dom">Signed in</span></b>'));
    assert.match(html, /<span class="on">New<\/span><span>Verified<\/span>/);
    ctx.run("dash.application", { id: "app_1" });
    assert.deepEqual(ctx.calls.at(-1), ["application", "app_1"]);
  });

  it("approves an invoice from the dashboard with a translated message", async () => {
    const ctx = area("de", "customer");
    await ctx.render();
    const btn = { dataset: { id: "inv_1" }, disabled: false };
    await vm.runInContext("actions", ctx).run("dash.approve", btn, { type: "click" });
    await new Promise((r) => setTimeout(r, 0));
    assert.ok(ctx.calls.some((c) => c[1] === "/invoices/inv_1" && c[2] === "PATCH"));
    assert.deepEqual(ctx.toasts.at(-1)[0], "Rechnung freigegeben; Zahlung geplant");
  });

  it("hides shortcuts a team member may not use", async () => {
    const extra = { TM_NAV: { customer: { projects: "projects" }, supplier: { bids: "sourcing", invoices: "invoices" } }, tmLevel: (a) => ({ projects: "view", sourcing: "none", invoices: "full" })[a] || "full" };
    const customer = await area("en", "customer", { user: { isMember: true }, extra }).render();
    assert.doesNotMatch(customer, /\/customer\/projects\/new/);
    const supplier = await area("en", "supplier", { user: { isMember: true }, extra }).render();
    assert.doesNotMatch(supplier, /href="#\/supplier\/bids"/);
    assert.match(supplier, /href="#\/supplier\/invoices\/new"/);
  });

  it("removed the old dashboard code from every layer", () => {
    for (const f of ["app.js", "enhancements.js", "workflows.js", "reviews.js", "platform-additions.js"])
      assert.doesNotMatch(read(f), /(customer|supplier|admin)Dashboard\(|paInsertAfterHeader|reviewApplySupplierDashFilters/, f);
    assert.doesNotMatch(read("design-screens.js"), /aqHtml|dsDashHeader|dsFillCustomerSide|dsEnhanceDashboard|dsEnhanceToday|dsQuickJob/);
    assert.ok(!existsSync(path.join(__dirname, "..", "public", "action-queue.js")));
    const index = read("index.html");
    assert.ok(!index.includes('src="action-queue.js"'));
    assert.ok(index.includes('<script src="areas/shell.js"></script><script src="areas/dashboards.js"></script>'));
    // The layout editor and the checklist work with the new dashboards
    const lc = read("layout-customizer.js");
    assert.doesNotMatch(lc, /onclick=|\.onclick =/);
    assert.ok(lc.includes('t("layout.customize")'));
    assert.ok(read("onboarding.js").includes('content.querySelector(":scope > .aq-panel")'));
  });
});
