// T129a: the supplier directory, profile, preferred suppliers and quote requests render from translation keys with
// data-action handlers. Supplier data stays on the old translation; filter and status values stay English.
const { describe, it } = require("node:test");
const assert = require("node:assert/strict");
const { readFileSync, existsSync } = require("node:fs");
const path = require("node:path");
const vm = require("node:vm");

const read = (f) => readFileSync(path.join(__dirname, "..", "public", f), "utf8");
const SUPPLIERS = [
  {
    id: "s1",
    company: "Keller Automation",
    location: "Regensburg, Germany",
    badge: "Gold",
    services: ["PLC programming", "Robotics"],
    rating: 4.8,
    projectsCompleted: 12,
    experience: 10,
    hourlyRate: 95,
    projectRate: 2400,
    availability: "Available",
    certifications: ["ISO 9001"],
    serviceCatalog: [{ name: "Robot cell", category: "Robotics", rate: 165, unit: "hour", capacity: "2 project teams", leadTime: "2 weeks" }],
    teamMembers: [{ name: "Ana", role: "Lead", experience: "12 years", certifications: "TÜV" }],
    reliability: { onTimeRate: 96, firstTimeRightRate: 90, responseRate: 88, completed: 14, reviews: 6, isNew: false },
  },
  { id: "s2", company: "Nordbau", location: "Hamburg, Germany", services: ["Welding"], rating: 4.1, hourlyRate: 70, availability: "Booked" },
];
const RFQS = [
  { id: "r1", service: "Vision inspection", kind: "Service request", status: "New", customerCompany: "MAKBERG", projectId: "p1", projectName: "Line 4", phaseId: "ph1", phaseName: "Build", taskId: "t1", taskName: "PLC", message: "Two cameras", createdAt: "2026-10-01T10:00:00Z" },
  { id: "r2", service: "ISO 9001", kind: "Evidence request", status: "Reviewing", customerCompany: "MAKBERG", message: "Certificate please", response: "Checking", createdAt: "2026-09-01T10:00:00Z" },
];
const DOCS = {
  documents: [{ id: "d1", title: "ISO 9001", category: "Quality certificate", source: "profile", visibility: "public", state: "Valid", expiresAt: "2027-01-01", url: "/uploads/a.pdf" }],
  qualifications: { workers: 2, documents: 3, expired: 0 },
  vetting: { status: "Approved", badge: "Gold", checks: { registration: "verified", vat: "pending" }, files: [], fileCount: 2 },
  worksWith: false,
};

function area(lang, { role = "customer", hash = "#/customer/suppliers" } = {}) {
  const warnings = [],
    calls = [],
    toasts = [],
    shown = [];
  const ctx = {
    console: { warn: (...a) => warnings.push(a.join(" ")), error() {}, log() {} },
    localStorage: { getItem: (k) => (k === "cc_lang" ? lang : null), setItem() {} },
    sessionStorage: { getItem: () => '["s1","s2"]', setItem() {} },
    navigator: { language: "en-GB" },
    document: { addEventListener() {}, querySelector: () => null, querySelectorAll: () => [], getElementById: (id) => (ctx.elements[id] ||= { textContent: "", value: "", hidden: false }) },
    elements: {},
    location: { hash },
    Intl,
    URLSearchParams,
    app: { innerHTML: "" },
    state: { user: role ? { role, id: "u1", supplierId: role === "supplier" ? "s1" : undefined } : null },
    route: async () => calls.push(["route"]),
    topActions() {},
    navigate: (to) => calls.push(["navigate", to]),
    toast: (m, type) => toasts.push([m, type]),
    toastEl: { dataset: {} },
    modal: (title, body) => shown.push({ title, body }),
    closeModal: () => calls.push(["close"]),
    uiConfirm: async (message) => (calls.push(["confirm", message]), true),
    dashboardShell: (r, active, html) => `[${r}:${active}]${html}`,
    publicLayout: (html) => `[public]${html}`,
    uiIcon: (n) => `<svg data-icon="${n}"></svg>`,
    ccBadge: (s) => (s.badge ? s.badge : "Verified"),
    reviewTokens: (q) => String(q || "").toLowerCase().split(/\W+/).filter(Boolean),
    reviewScore: (s, q) => (String(s.company).toLowerCase().includes(String(q).toLowerCase()) ? 5 : 0),
    reviewGeo: () => [50, 10],
    reviewProjects: async () => [{ id: "p1", name: "Line 4", phases: [{ id: "ph1", name: "Build", tasks: [{ id: "t1", name: "PLC" }] }] }],
    ccProjects: async () => [],
    pvData: { suppliers: [], invites: [] },
    pvLoad: async () => ctx.pvData,
    esc: (s) => String(s ?? "").replace(/[&<>'"]/g, (c) => ({ "&": "&amp;", "<": "&lt;", ">": "&gt;", "'": "&#39;", '"': "&quot;" })[c]),
    api: async (p, opts) => {
      calls.push(["api", p, opts?.method || "GET", opts?.body]);
      if (p.startsWith("/suppliers?")) return { suppliers: JSON.parse(JSON.stringify(SUPPLIERS)), certifications: ["ISO 9001"] };
      if (p === "/shortlist") return { supplierIds: ["s1"] };
      if (p === "/suppliers/s1") return { supplier: JSON.parse(JSON.stringify(SUPPLIERS[0])) };
      if (p === "/supplier-documents") return { ...JSON.parse(JSON.stringify(DOCS)), categories: ["Quality certificate", "Insurance"] };
      if (p.endsWith("/documents")) return JSON.parse(JSON.stringify(DOCS));
      if (p.endsWith("/scorecard")) return { scorecard: { score: 82, riskLevel: "Low", metrics: { rating: 4.8, quality: 5, onTimeRate: 96 }, risks: [] } };
      if (p === "/rfqs") return { rfqs: JSON.parse(JSON.stringify(RFQS)) };
      return {};
    },
  };
  ctx.window = ctx;
  vm.createContext(ctx);
  // pvData/pvLoad come from preferred-ui.js as top-level bindings
  vm.runInContext("var pvData = window.pvData; var pvLoad = window.pvLoad;", ctx);
  for (const f of ["core/languages.js", "locales/en.js", "locales/de.js", "core/t.js", "core/actions.js", "core/router.js", "areas/directory.js"]) vm.runInContext(read(f), ctx, { filename: f });
  Object.assign(ctx, { warnings, calls, toasts, shown });
  ctx.run = (name, el) => vm.runInContext("actions", ctx).run(name, el, { type: "click", preventDefault() {} });
  ctx.render = async (to) => {
    if (to) ctx.location.hash = to;
    await ctx.route();
    return ctx.app.innerHTML;
  };
  return ctx;
}
const settle = () => new Promise((r) => setTimeout(r, 5));
const text = (html) => html.replace(/<[^>]*>/g, " ");

describe("supplier directory (T129a)", () => {
  for (const lang of ["en", "de"])
    it(`draws the directory, profile, preferred list and requests in ${lang === "en" ? "English" : "German"} from keys`, async () => {
      const customer = area(lang);
      const pages = [await customer.render(), await customer.render("#/customer/suppliers/s1"), await customer.render("#/customer/preferred")];
      const supplier = area(lang, { role: "supplier", hash: "#/supplier/requests" });
      pages.push(await supplier.render());
      for (const html of pages) {
        assert.doesNotMatch(text(html), /\bdir\.[a-zA-Z.]+/, "raw key");
        assert.doesNotMatch(html, /\son[a-z]+="/, "no inline handlers");
        assert.doesNotMatch(html, /data-i18n/); // no markers of the old translation layer (T136)
      }
      assert.deepEqual([...customer.warnings, ...supplier.warnings], []);
      if (lang === "de") {
        assert.ok(pages[0].includes("Den passenden Industriespezialisten finden.") && pages[0].includes("2 Lieferanten gefunden"));
        assert.ok(pages[1].includes("Veröffentlichte Leistungen") && pages[1].includes("/ Stunde"));
        assert.ok(pages[3].includes("Anfragen &amp; Nachweise") && pages[3].includes("Als in Prüfung markieren"));
      }
    });

  it("links cards to the profile and keeps filter values English", async () => {
    const html = await area("de").render();
    assert.ok(html.includes('<a class="btn small outline" href="#/customer/suppliers/s1">Profil ansehen</a>'));
    assert.ok(html.includes('<option value="Gold">Gold</option>'));
    assert.ok(html.includes('<option value="rating">Beste Bewertung</option>'));
    assert.ok(html.includes('<span class="chip">PLC programming</span>'), "services stay on the old translation");
    assert.match(html, /data-action="dir\.star" data-id="s1">★ Auf der Merkliste/);
    assert.match(html, /data-action="dir\.view" data-view="map"/);
    assert.match(html, /<form id="ccSupplierSearch" class="cc-supplier-filters" data-action="dir\.search">/);
    // The directory is not public (T140): visitors go to sign-in, customers to their own directory
    const visitor = area("en", { role: null, hash: "#/suppliers" });
    await visitor.render();
    assert.deepEqual(visitor.calls.at(-1), ["navigate", "/login"]);
    const old = area("en", { hash: "#/suppliers/s1" });
    await old.render();
    assert.deepEqual(old.calls.at(-1), ["navigate", "/customer/suppliers/s1"]);
  });

  it("shows certificates after the reliability panel, the scorecard, and request buttons only to customers", async () => {
    const html = await area("en").render("#/customer/suppliers/s1");
    const at = (s) => html.indexOf(s);
    assert.ok(at("cc-rel-panel") < at("dc-panel") && at("dc-panel") < at("Published services"));
    assert.ok(html.includes("Supplier scorecard") && html.includes("Low risk"));
    assert.match(html, /data-action="dir\.ask" data-kind="service" data-supplier="s1" data-name="Robot cell">Request service/);
    assert.match(html, /data-action="pv\.add" data-supplier="s1"/);
    const supplier = area("en", { role: "supplier", hash: "#/suppliers/s1" });
    await supplier.render();
    assert.deepEqual(supplier.calls.at(-1), ["navigate", "/supplier/dashboard"]);
  });

  it("sends a service request with an English kind", async () => {
    const ctx = area("de");
    ctx.run("dir.ask", { dataset: { kind: "service", supplier: "s1", name: "Robot cell" } });
    await settle();
    assert.equal(ctx.shown.at(-1).title, "Lieferanten zu einer Leistung kontaktieren");
    const values = { service: "Robot cell", projectId: "", taskRef: "p1|ph1|t1", message: "Bitte" };
    ctx.FormData = class {
      constructor() {
        return new Map(Object.entries(values));
      }
    };
    vm.runInContext("FormData = window.FormData", ctx);
    ctx.run("dir.askSend", { dataset: { supplier: "s1", kind: "service" } });
    await settle();
    const sent = ctx.calls.find((c) => c[1] === "/rfqs" && c[2] === "POST");
    assert.deepEqual(JSON.parse(JSON.stringify(sent[3])), { service: "Robot cell", projectId: "p1", message: "Bitte", phaseId: "ph1", taskId: "t1", supplierId: "s1", kind: "Service request" });
  });

  it("marks a request as reviewing without a dialog and keeps the response", async () => {
    const ctx = area("de", { role: "supplier", hash: "#/supplier/requests" });
    const html = await ctx.render();
    assert.ok(html.includes('<option value="Reviewing">In Prüfung</option>'));
    assert.ok(html.includes('href="#/supplier/messages?project=p1&phase=ph1&task=t1"'));
    ctx.run("rq.reviewing", { dataset: { id: "r2" } });
    await settle();
    assert.equal(ctx.shown.length, 0);
    assert.deepEqual(JSON.parse(JSON.stringify(ctx.calls.find((c) => c[2] === "PATCH"))), ["api", "/rfqs/r2", "PATCH", { status: "Reviewing", response: "Checking" }]);
  });

  it("opens the detailed quote with positions and translated labels", async () => {
    const ctx = area("de", { role: "supplier", hash: "#/supplier/requests" });
    ctx.run("rq.quote", { dataset: { id: "r1" } });
    await settle();
    const { title, body } = ctx.shown.at(-1);
    assert.equal(title, "Angebot erstellen");
    assert.match(body, /data-action="rq\.send" data-input="rq\.total" data-id="r1"/);
    assert.equal((body.match(/class="ff-quote-item"/g) || []).length, 2);
    assert.match(body, /data-action="rq\.removeItem">Entfernen/);
  });

  it("offers document categories with English values on the supplier's own panel", async () => {
    const ctx = area("de", { role: "supplier", hash: "#/supplier/suppliers" });
    ctx.run("dc.upload", {});
    await settle();
    assert.ok(ctx.shown.at(-1).body.includes('<option value="Quality certificate">Qualitätszertifikat</option>'));
    const panel = vm.runInContext("dirDocsPanel", ctx)(DOCS, { manage: true });
    assert.match(panel, /data-action="dc\.visibility" data-id="d1" data-to="partners">Nur für Partner/);
    assert.ok(panel.includes("Verifiziert · Abzeichen Gold"));
  });

  it("replaced the old directory, profile, preferred and request pages", () => {
    assert.ok(!existsSync(path.join(__dirname, "..", "public", "directory.js")));
    const old = ["app.js", "enhancements.js", "workflows.js", "reviews.js", "collaboration.js", "feedback-fixes.js", "preferred-ui.js", "documents-ui.js", "sourcing-ui.js"].map(read).join("\n");
    assert.doesNotMatch(old, /function (renderSuppliers|supplierDetail|supplierRequests|pvPage|dcPanel|srScorecardPanel)\b|ccRespondRfq = /);
    const index = read("index.html");
    assert.ok(!index.includes('src="directory.js"'));
    assert.ok(index.includes('<script src="areas/documents.js"></script><script src="areas/directory.js"></script>'));
  });
});
