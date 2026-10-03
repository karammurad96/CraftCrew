// T126c: the supplier application renders from translation keys, keeps the verification block and evidence
// uploads, and uses the operator's service categories when they are set.
const { describe, it } = require("node:test");
const assert = require("node:assert/strict");
const { readFileSync } = require("node:fs");
const path = require("node:path");
const vm = require("node:vm");

const read = (f) => readFileSync(path.join(__dirname, "..", "public", f), "utf8");

function area(lang, { user = null, config = {} } = {}) {
  const warnings = [],
    toasts = [];
  const ctx = {
    console: { warn: (...a) => warnings.push(a.join(" ")), error() {}, log() {} },
    localStorage: { getItem: (k) => (k === "cc_lang" ? lang : null) },
    navigator: { language: "en-GB" },
    document: { addEventListener() {} },
    location: { hash: "#/supplier-application" },
    Intl,
    URLSearchParams,
    app: { innerHTML: "" },
    state: { user },
    route: async () => {},
    topActions() {},
    navigate() {},
    toast: (m) => toasts.push(m),
    toastEl: { dataset: {} },
    publicLayout: (html) => `[public]${html}`,
    dashboardShell: (role, active, html) => `[${role}:${active}]${html}`,
    esc: (s) => String(s ?? "").replace(/[&<>'"]/g, (c) => ({ "&": "&amp;", "<": "&lt;", ">": "&gt;", "'": "&#39;", '"': "&quot;" })[c]),
    api: async (p) => (p === "/platform-config" ? config : p === "/profile" ? { supplier: { company: "Keller", services: ["Robotics"], certifications: ["ISO 9001"] } } : {}),
  };
  ctx.window = ctx;
  vm.createContext(ctx);
  for (const f of ["core/languages.js", "locales/en.js", "locales/de.js", "core/t.js", "core/actions.js", "core/router.js", "areas/apply.js"])
    vm.runInContext(read(f), ctx, { filename: f });
  Object.assign(ctx, { warnings, toasts });
  ctx.render = async () => (await ctx.route(), ctx.app.innerHTML);
  return ctx;
}

describe("supplier application area", () => {
  for (const lang of ["en", "de"])
    it(`renders in ${lang === "en" ? "English" : "German"} without a missing key, with every field`, async () => {
      const ctx = area(lang);
      const html = await ctx.render();
      assert.ok(html.startsWith("[public]"));
      assert.deepEqual(ctx.warnings, []);
      for (const name of ["company", "email", "phone", "services", "certifications", "insurance", "yearsInBusiness", "portfolio", "referenceName", "referenceEmail", "registrationNumber", "vatId", "directorName", "legalAddress", "website", "insuranceProvider", "insurancePolicy", "insuranceCoverage", "insuranceExpiry", "reference2", "verificationFiles"])
        assert.ok(html.includes(`name="${name}"`), name);
      assert.doesNotMatch(html.replace(/<[^>]*>/g, " "), /\bapply\.[a-zA-Z]+\b/, "raw key");
      assert.doesNotMatch(html, /onclick|onsubmit/);
      if (lang === "de") assert.ok(html.includes("Werden Sie Teil des geprüften Netzwerks."));
    });

  it("shows a signed-in supplier the form in the workspace, pre-filled from the profile", async () => {
    const html = await area("en", { user: { role: "supplier", name: "Marta", email: "m@k.de" } }).render();
    assert.ok(html.startsWith("[supplier:suppliers]"));
    assert.match(html, /value="Robotics" checked/);
    assert.match(html, /value="ISO 9001" checked/);
  });

  it("offers the operator's service categories when they are set, translated as data", async () => {
    const html = await area("de", { config: { serviceCategories: ["Robotics", "Welding"] } }).render();
    assert.match(html, /<label><input type="checkbox" name="services" value="Welding"> <span>Welding<\/span><\/label>/);
    assert.doesNotMatch(html, /value="PLC Programming"/);
  });

  it("removed the old application code", () => {
    for (const f of ["app.js", "enhancements.js", "collaboration.js", "workflows.js"])
      assert.doesNotMatch(read(f), /supplierApplication/, f);
    // The drop zone on every form is drawn with keys too
    assert.match(read("ui-refresh.js"), /t\("common\.drop\.here"\)/);
  });
});
