// T134b: the admin's billing, escalations, reports, audit log and platform management render from translation keys
// with data-action handlers; actions and settings go to the server unchanged.
const { describe, it } = require("node:test");
const assert = require("node:assert/strict");
const { readFileSync } = require("node:fs");
const path = require("node:path");
const vm = require("node:vm");

const read = (f) => readFileSync(path.join(__dirname, "..", "public", f), "utf8");
const INVOICES = [
  { id: "i1", number: "2026-0004", status: "Approved", amount: 1000, overdue: true, scheduledPayment: "2026-09-01", projectName: "Line 4", supplierCompany: "Keller", createdAt: "2026-09-01", supplierId: "s1", customerId: "c1" },
  { id: "i2", number: "2026-0005", status: "Paid", amount: 500, payment: { status: "Paid", platformFee: 25, supplierPayout: 475 }, projectName: "Line 4", createdAt: "2026-09-02", supplierId: "s1", customerId: "c1" },
  { id: "i3", number: "2026-0006", status: "Refunded", amount: 200, projectName: "Line 4", createdAt: "2026-09-03" },
];
const SETTINGS = {
  platformFeePercent: 5,
  serviceCategories: ["Welding", "PLC"],
  badgeCriteria: { gold: { projects: 20, rating: 4.5 } },
  supportEmail: "help@x.de",
  defaultPaymentTermsDays: 30,
  uploadLimitMb: 5,
  faqContent: "",
  emailTemplates: { applicationReceived: "Received", customTemplate: "Custom" },
  integrations: { payments: "Manual payment tracking" },
};

function area(lang) {
  const warnings = [],
    calls = [],
    toasts = [],
    els = {};
  const ctx = {
    console: { warn: (...a) => warnings.push(a.join(" ")), error() {}, log() {} },
    localStorage: { getItem: (k) => (k === "cc_lang" ? lang : null), setItem() {} },
    navigator: { language: "en-GB" },
    document: { addEventListener() {}, querySelector: () => null, querySelectorAll: () => [], getElementById: (id) => els[id] || null },
    location: { hash: "#/admin/audit?role=supplier" },
    Intl,
    URLSearchParams,
    app: { innerHTML: "" },
    state: { user: { role: "admin", id: "u_admin" } },
    route: async () => calls.push(["route"]),
    navigate: (to) => calls.push(["navigate", to]),
    toast: (m, type) => toasts.push([m, type]),
    toastEl: { dataset: {} },
    modal() {},
    closeModal() {},
    uiPrompt: async (m) => (calls.push(["prompt", m]), "Duplicate payment"),
    dashboardShell: (r, active, html) => `[${r}:${active}]${html}`,
    ccBadge: (s) => s.badge || "Verified",
    invNo: (i) => i.number,
    inDaysLate: () => "32 days late",
    paToday: () => "2026-10-03",
    paTime: (d) => String(d),
    paWorkItems: () => [],
    paMonths: () => ["2026-09"],
    inMonths: () => ["2026-09"],
    inBars: (months, series) => `<div class="in-chart">${series.map((s) => s.label).join("|")}</div>`,
    inHBars: (rows) => `<div class="in-hbars">${rows.map((r) => r.label).join("|")}</div>`,
    inSum: (list) => list.reduce((a, x) => a + x.amount, 0),
    inPct: (a, b) => (b ? Math.round((a / b) * 100) : 0),
    IN_COLORS: ["#1", "#2", "#3"],
    srScorecardTable: () => '<div class="cc-table-wrap"></div>',
    legalContent: async () => ({ imprint: "CraftCrew GmbH" }),
    legalCache: {},
    routes: { add() {} },
    FormData: class {
      constructor(form) {
        return new Map(Object.entries(form.values || {}));
      }
    },
    esc: (s) => String(s ?? "").replace(/[&<>'"]/g, (c) => ({ "&": "&amp;", "<": "&lt;", ">": "&gt;", "'": "&#39;", '"': "&quot;" })[c]),
    api: async (p, opts) => {
      calls.push(["api", p, opts?.method || "GET", opts?.body]);
      if (p === "/invoices") return { invoices: INVOICES };
      if (p === "/admin/settings") return { settings: SETTINGS };
      if (p === "/disputes") return { disputes: [{ id: "d1", type: "Quality", status: "Open", description: "Weld seam", projectId: "p1", createdAt: "2026-10-01" }] };
      if (p === "/admin/metrics") return { metrics: { users: 28, suppliers: 25, projects: 4, grossVolume: 1700 } };
      if (p === "/admin/users") return { users: [{ id: "c1", role: "customer", company: "Makberg", email: "c@x.de", createdAt: "2026-09-05" }] };
      if (p === "/admin/suppliers") return { suppliers: [{ id: "s1", company: "Keller", live: true, rating: 4.5, badge: "Gold" }] };
      if (p === "/admin/applications") return { applications: [{ status: "Approved", stage: "Decision & Badge" }, { status: "On Hold", stage: "New" }] };
      if (p === "/projects") return { projects: [{ id: "p1", name: "Line 4", customerId: "c1", status: "In Progress", budget: 9000 }] };
      if (p === "/scorecards") return { scorecards: [] };
      if (p.startsWith("/audit")) return { total: 1, entries: [{ at: "2026-10-02", actorName: "Ann", actorRole: "supplier", actorEmail: "a@x.de", action: "Invoice submitted", entityId: "i1" }] };
      if (p === "/admin/outbox") return { emails: [{ createdAt: "2026-10-02", to: "a@x.de", subject: "Hi", body: "Body", status: "Failed", lastError: "SMTP down" }] };
      if (p === "/admin/test-email") return { to: "admin@x.de" };
      return {};
    },
  };
  ctx.window = ctx;
  vm.createContext(ctx);
  for (const f of ["core/languages.js", "locales/en.js", "locales/de.js", "core/t.js", "core/actions.js", "areas/admin.js"]) vm.runInContext(read(f), ctx, { filename: f });
  Object.assign(ctx, { warnings, calls, toasts, els });
  ctx.run = (name, el) => vm.runInContext("actions", ctx).run(name, el, { type: "submit", preventDefault() {} });
  return ctx;
}
const settle = () => new Promise((r) => setTimeout(r, 5));
const text = (html) => html.replace(/<[^>]*>/g, " ");
const clean = (ctx, html) => {
  assert.deepEqual(ctx.warnings, []);
  assert.doesNotMatch(text(html), /\badm\.[a-zA-Z.]+/, "raw key");
  assert.doesNotMatch(html, /\son[a-z]+="/, "no inline handlers");
  assert.doesNotMatch(html, /data-i18n/); // no markers of the old translation layer (T136)
};

describe("admin: billing, escalations, reports, audit, platform (T134b)", () => {
  for (const lang of ["en", "de"]) {
    const de = lang === "de";
    it(`draws the five pages in ${de ? "German" : "English"} from keys`, async () => {
      const ctx = area(lang),
        page = async (fn) => (await vm.runInContext(fn + "()", ctx), clean(ctx, ctx.app.innerHTML), ctx.app.innerHTML);
      let html = await page("adminBilling");
      assert.match(html, /data-action="adm\.paid" data-id="i1"/);
      assert.match(html, /data-action="adm\.refund" data-id="i2"/);
      assert.ok(html.includes("32 days late") && html.includes(de ? "Erstattet" : "Refunded"));
      assert.ok(html.includes(de ? "1 Erstattung erfasst" : "1 refund recorded"));
      html = await page("adminDisputes");
      assert.match(html, /data-action="adm\.resolve" data-id="d1"/);
      assert.ok(html.includes(de ? "Qualität" : "Quality"));
      html = await page("adminReports");
      for (const kind of ["months", "suppliers", "customers"]) assert.match(html, new RegExp(`data-action="adm\\.export" data-kind="${kind}"`));
      assert.match(html, /<input type="file" hidden accept="application\/json" data-action="adm\.import">/);
      assert.ok(html.includes("sr-admin-cards") && html.includes("in-admin-charts") && html.includes("pa-reports"));
      assert.ok(html.includes(de ? "50 % der Bewerbungen freigegeben" : "50% of applications approved"));
      html = await page("adminAudit");
      assert.match(html, /<form class="panel pa-filters" id="paAuditFilters" data-action="adm\.auditFilter">/);
      assert.ok(html.includes(`<option value="supplier" selected>${de ? "Lieferant" : "Supplier"}</option>`));
      assert.ok(html.includes(de ? "1 protokollierte Aktion" : "1 recorded action"));
      html = await page("adminPlatform");
      assert.match(html, /<form id="ccPlatformSettings" class="cc-platform-settings" data-action="adm\.saveSettings">/);
      assert.match(html, /data-action="adm\.testEmail"/);
      assert.match(html, /<form id="legalForm" class="modal-form" data-action="adm\.saveLegal">/);
      assert.ok(html.includes("CraftCrew GmbH") && html.includes("SMTP down"));
      assert.ok(html.includes("custom Template"), "unknown template names stay readable");
      assert.ok(html.indexOf("ccPlatformSettings") < html.indexOf("pa-outbox") && html.indexOf("pa-outbox") < html.indexOf("legal-admin"));
    });
  }

  it("records payments and refunds, resolves escalations and filters the audit log", async () => {
    const ctx = area("de");
    ctx.run("adm.paid", { dataset: { id: "i1" } });
    ctx.run("adm.refund", { dataset: { id: "i2" } });
    ctx.run("adm.resolve", { dataset: { id: "d1" } });
    ctx.run("adm.auditFilter", { values: { q: "invoice", role: "", projectId: "p1" } });
    await settle();
    const patches = JSON.parse(JSON.stringify(ctx.calls.filter((c) => c[2] === "PATCH").map((c) => [c[1], c[3]])));
    assert.deepEqual(patches, [
      ["/admin/invoices/i1", { action: "Mark Paid" }],
      ["/admin/invoices/i2", { action: "Refund", reason: "Duplicate payment" }],
      ["/admin/disputes/d1", { status: "Resolved", resolution: "Duplicate payment" }],
    ]);
    assert.ok(ctx.calls.some((c) => c[0] === "navigate" && c[1] === "/admin/audit?q=invoice&projectId=p1"));
    assert.equal(ctx.toasts[0][0], "Zahlung als bezahlt markiert");
  });

  it("saves the platform settings with every field", async () => {
    const ctx = area("en");
    ctx.els.ccPlatformSaved = { textContent: "" };
    ctx.run("adm.saveSettings", {
      values: { serviceCategories: "Welding\n\nPLC ", goldProjects: "20", goldRating: "4.5", bronzeProjects: "1", bronzeRating: "3", silverProjects: "5", silverRating: "4", supportEmail: "help@x.de", platformFeePercent: "5", defaultPaymentTermsDays: "30", uploadLimitMb: "5", faqContent: "", email_applicationReceived: "Thanks", email_customTemplate: "Custom" },
    });
    await settle();
    const body = JSON.parse(JSON.stringify(ctx.calls.find((c) => c[2] === "PUT")[3]));
    assert.deepEqual(body.serviceCategories, ["Welding", "PLC"]);
    assert.deepEqual(body.badgeCriteria.gold, { projects: 20, rating: 4.5 });
    assert.deepEqual(body.emailTemplates, { applicationReceived: "Thanks", customTemplate: "Custom" });
    assert.equal(ctx.els.ccPlatformSaved.textContent, "Saved");
  });

  it("replaced the old admin pages and wrappers", () => {
    const old = ["app.js", "collaboration.js", "platform-additions.js", "insights.js", "sourcing-ui.js", "legal-security.js", "workflows.js", "enhancements.js"].map(read).join("\n");
    assert.doesNotMatch(old, /adminBilling|adminDisputes|adminReports|ccAdminPlatform|paAuditPage|paOutboxPanel|srAdminScorecards|legalAdminPanel|adminMailStatus|markPaid|ccRefundInvoice/);
  });
});
