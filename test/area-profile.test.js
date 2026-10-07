// T135a: the profile and settings page of every role, two-factor sign-in, the calendar feed, "Your data" and the
// supplier's service catalog render from translation keys with data-action handlers.
const { describe, it } = require("node:test");
const assert = require("node:assert/strict");
const { readFileSync, existsSync } = require("node:fs");
const path = require("node:path");
const vm = require("node:vm");

const read = (f) => readFileSync(path.join(__dirname, "..", "public", f), "utf8");
const SUPPLIER = {
  badge: "Gold",
  employees: 12,
  experience: 18,
  availability: "Busy",
  certifications: ["ISO 9001"],
  serviceCatalog: [{ name: "PLC programming", category: "Automation", rate: 95, unit: "day", status: "Published" }],
  teamMembers: [{ name: "Marta", role: "Engineer", availability: "Available" }],
  pendingVerification: { company: "Keller GmbH", submittedAt: "2026-10-01" },
};

function area(lang, role) {
  const warnings = [],
    calls = [],
    toasts = [],
    shown = [],
    els = {};
  const ctx = {
    console: { warn: (...a) => warnings.push(a.join(" ")), error() {}, log() {} },
    localStorage: { getItem: (k) => (k === "cc_lang" ? lang : null), setItem() {} },
    navigator: { language: "en-GB" },
    document: { addEventListener() {}, querySelector: () => null, querySelectorAll: () => [], getElementById: (id) => els[id] || null, contains: () => true },
    location: { hash: "" },
    Intl,
    URLSearchParams,
    app: { innerHTML: "" },
    state: { user: { role, id: "u1", email: "m@x.de" } },
    route: async () => calls.push(["route"]),
    navigate: (to) => calls.push(["navigate", to]),
    logout: async () => calls.push(["logout"]),
    toast: (m, type) => toasts.push([m, type]),
    toastEl: { dataset: {} },
    modal: (title, body) => shown.push({ title, body }),
    closeModal() {},
    uiConfirm: async (m) => (calls.push(["confirm", m]), true),
    dashboardShell: (r, active, html) => `[${r}:${active}]${html}`,
    ccBadge: (s) => s.badge || "Verified",
    dcRefreshOwn: async () => calls.push(["dcRefreshOwn"]),
    routes: { add: (p) => calls.push(["routes", p]) },
    FormData: class {
      constructor(form) {
        return new Map(Object.entries(form.values || {}));
      }
    },
    esc: (s) => String(s ?? "").replace(/[&<>'"]/g, (c) => ({ "&": "&amp;", "<": "&lt;", ">": "&gt;", "'": "&#39;", '"': "&quot;" })[c]),
    api: async (p, opts) => {
      calls.push(["api", p, opts?.method || "GET", opts?.body]);
      if (p === "/profile")
        return {
          user: { name: "Marta", email: "m@x.de", company: "Keller", notificationPrefs: { invoices: true }, passwordChangedAt: "2026-09-01", payoutDetails: role === "supplier" ? { accountHolder: "Keller", iban: "DE89370400440532013000" } : null },
          companyProfile: { legalName: "Keller GmbH", industry: "Automation" },
          supplier: role === "supplier" ? SUPPLIER : null,
        };
      if (p === "/price-rules") return { enabled: true, version: 1, accepted: true, clause: { text: "Clause", hash: "h" }, rules: [{ category: "Welding", auto: true, regions: ["93"], radiusKm: 0, maxValue: 5000, leadDays: 7, freeCrewDays: 0 }] };
      if (p === "/calendar") return { active: true, createdAt: "2026-09-01" };
      if (p === "/account/2fa") return { enabled: role === "admin", recoveryLeft: 8, required: role === "admin" };
      if (p === "/account/deletion") return { graceDays: 14, blockers: [], coversTeam: false };
      if (p === "/account/sessions") return { revoked: 2 };
      return {};
    },
  };
  ctx.window = ctx;
  vm.createContext(ctx);
  for (const f of ["core/languages.js", "locales/en.js", "locales/de.js", "core/t.js", "core/actions.js", "areas/profile.js"]) vm.runInContext(read(f), ctx, { filename: f });
  Object.assign(ctx, { warnings, calls, toasts, shown, els });
  ctx.run = (name, el) => vm.runInContext("actions", ctx).run(name, el, { type: "submit", preventDefault() {} });
  return ctx;
}
const settle = () => new Promise((r) => setTimeout(r, 5));
const text = (html) => html.replace(/<[^>]*>/g, " ");
const clean = (ctx, html) => {
  assert.deepEqual(ctx.warnings, []);
  assert.doesNotMatch(text(html), /\bprof\.[a-zA-Z.]+/, "raw key");
  assert.doesNotMatch(html, /\son[a-z]+="/, "no inline handlers");
  assert.doesNotMatch(html, /data-i18n/); // no markers of the old translation layer (T136)
};

describe("profile and settings (T135a)", () => {
  for (const lang of ["en", "de"])
    for (const role of ["customer", "supplier", "admin"])
      it(`draws the ${role}'s settings in ${lang === "de" ? "German" : "English"} from keys`, async () => {
        const ctx = area(lang, role);
        await vm.runInContext(`profilePage("${role}")`, ctx);
        const html = ctx.app.innerHTML;
        clean(ctx, html);
        for (const id of ["paPasswordForm", "paPrefsForm", "tfPanel", "gdPanel"]) assert.ok(html.includes(`id="${id}"`), id);
        assert.match(html, /<form id="paPasswordForm" class="modal-form" data-action="prof\.password">/);
        assert.match(html, /data-action="prof\.signOutOthers"/);
        assert.ok(html.includes('<input type="checkbox" name="invoices" checked>'));
        assert.equal(html.includes('id="cfPanel"'), role !== "admin", "calendar for customers and suppliers");
        assert.equal(html.includes('id="paPayoutForm"'), role === "supplier", "payouts for suppliers");
        assert.equal(html.includes('id="rzPanel"'), role === "supplier", "pending re-verification");
        assert.equal(html.includes('id="tfRequire"'), role === "admin");
        if (role === "admin") assert.ok(html.includes('href="#/admin/platform"'));
        else assert.match(html, /data-action="prof\.edit"/);
        if (lang === "de" && role === "supplier") assert.ok(html.includes("Änderung wartet auf erneute Prüfung") && html.includes("Passwort zuletzt geändert am"));
        // T151: a section menu right under the title leads to every section, "Your data" (export, delete) last
        const nav = html.slice(html.indexOf('<nav class="pf-sections"'), html.indexOf("</nav>", html.indexOf('<nav class="pf-sections"')));
        assert.ok(html.indexOf('<nav class="pf-sections"') < html.indexOf('id="paSecurity"'));
        const targets = [...nav.matchAll(/data-target="(\w+)"/g)].map((x) => x[1]);
        assert.deepEqual(targets, [...(role === "admin" ? [] : ["pfCompany"]), "paSecurity", "pfNotify", ...(role === "admin" ? [] : ["cfPanel"]), "tfPanel", "gdPanel"]);
        for (const id of targets) assert.ok(html.includes(`id="${id}"`), id);
        assert.match(nav, /class="pf-section pf-section-data" data-action="prof\.jump" data-target="gdPanel">/);
      });

  it("draws the service catalog and its editor from keys and keeps the values in English", async () => {
    const ctx = area("de", "supplier");
    await vm.runInContext("supplierCatalog()", ctx);
    const html = ctx.app.innerHTML;
    clean(ctx, html);
    assert.match(html, /95(,00)?\s€ \/ Tag/, "rate per unit");
    assert.ok(html.includes("Verfügbar"));
    assert.ok(html.includes("Automatische Bestätigung") && html.includes("Welding"), "T244: the price rules panel");
    assert.ok(ctx.calls.some((c) => c[0] === "dcRefreshOwn"), "own certificates panel");
    await vm.runInContext("pfEditCatalog()", ctx);
    const body = ctx.shown.at(-1).body;
    clean(ctx, body);
    assert.ok(body.includes('<option value="day" selected>Tag</option>'));
    assert.ok(body.includes('<option value="Busy" selected>Ausgelastet</option>'));
    assert.match(body, /data-action="prof\.removeRow"/);
  });

  it("asks before signing out other sessions and counts them", async () => {
    const ctx = area("en", "customer");
    ctx.run("prof.signOutOthers", {});
    await settle();
    assert.ok(ctx.calls.some((c) => c[0] === "confirm"));
    assert.ok(ctx.calls.some((c) => c[1] === "/account/sessions" && c[2] === "DELETE"));
    assert.equal(ctx.toasts[0][0], "2 other sessions signed out");
  });

  it("checks the new password twice before sending it", async () => {
    const ctx = area("de", "customer"),
      err = { textContent: "" };
    ctx.run("prof.password", { values: { currentPassword: "a", newPassword: "Secret-2026-x", confirm: "Secret-2026-y" }, querySelector: () => err });
    await settle();
    assert.equal(err.textContent, "Die neuen Passwörter stimmen nicht überein");
    assert.ok(!ctx.calls.some((c) => c[1] === "/account/password"));
  });

  it("replaced the old profile layers", () => {
    for (const f of ["calendar-ui.js", "reverify-ui.js"]) assert.ok(!existsSync(path.join(__dirname, "..", "public", f)), f);
    const old = ["app.js", "enhancements.js", "workflows.js", "platform-additions.js", "twofactor-ui.js", "gdpr-ui.js", "safe-actions.js", "documents-ui.js"].map(read).join("\n");
    assert.doesNotMatch(old, /profilePage|supplierCatalog|paSettingsPanels|tfPanelHtml|gdDeletion|wfEditCatalog|paSignOutOthers/);
    assert.ok(read("index.html").includes('<script src="areas/admin.js"></script><script src="areas/profile.js"></script>'));
  });
});
