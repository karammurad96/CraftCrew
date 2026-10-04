// T135d: what the old layer still drew — the top bar, header and footer, the getting-started checklist, the
// not-found and forced-password pages, the supplier's verification banner, invitations, the offline queue and
// the quick search — takes its words from translation keys, so it works without the DOM translation.
const { describe, it } = require("node:test");
const assert = require("node:assert/strict");
const { readFileSync } = require("node:fs");
const path = require("node:path");
const vm = require("node:vm");

const read = (f) => readFileSync(path.join(__dirname, "..", "public", f), "utf8");

function ctxFor(lang, user) {
  const els = {};
  const ctx = {
    console: { warn() {}, error() {}, log() {} },
    localStorage: { getItem: (k) => (k === "cc_lang" ? lang : null), setItem() {}, removeItem() {} },
    sessionStorage: { getItem: () => null, setItem() {}, removeItem() {} },
    navigator: { language: "en-GB" },
    document: { addEventListener() {}, querySelector: () => null, querySelectorAll: () => [], getElementById: (id) => els[id] || null, body: { classList: { toggle() {}, remove() {} } } },
    location: { hash: "#/customer/nothing-here" },
    history: { back() {} },
    Intl,
    URLSearchParams,
    app: { innerHTML: "" },
    state: { user, token: user ? "session" : "" },
    publicLayout: (html) => html,
    dashboardShell: (r, a, html) => `[${r}:${a}]${html}`,
    esc: (s) => String(s ?? "").replace(/[&<>'"]/g, (c) => ({ "&": "&amp;", "<": "&lt;", ">": "&gt;", "'": "&#39;", '"': "&quot;" })[c]),
    api: async () => ({}),
    toast() {},
    toastEl: { dataset: {} },
  };
  ctx.window = ctx;
  ctx.els = els;
  vm.createContext(ctx);
  for (const f of ["core/brand.js", "core/languages.js", "locales/en.js", "locales/de.js", "core/t.js", "core/actions.js"]) vm.runInContext(read(f), ctx, { filename: f });
  return ctx;
}

describe("the rest of the old layer uses keys (T135d)", () => {
  it("draws the top bar for visitors and members in German", () => {
    const ctx = ctxFor("de", { name: "Maya Hartmann", role: "customer" }),
      top = { dataset: {}, innerHTML: "" };
    ctx.els.topActions = top;
    vm.runInContext(read("app.js").match(/function topActions\(\) \{[\s\S]*?\n\}\nfunction uiStaticTexts\(\) \{[\s\S]*?\n\}/)[0] + ";function updateCraftCrewShell(){}; topActions();", ctx);
    assert.match(top.innerHTML, /<small>Kunde<\/small>/);
    assert.match(top.innerHTML, /<a class="btn primary" href="#\/customer\/dashboard">Übersicht<\/a><button type="button" class="btn outline" data-action="ui\.signOut">Abmelden<\/button>/);
    assert.doesNotMatch(top.innerHTML, /\son[a-z]+="/);
  });

  it("draws the not-found page from keys", () => {
    const ctx = ctxFor("de", { role: "customer" });
    vm.runInContext(read("not-found.js").split("function sessionExpired")[0] + "; renderNotFound('invoices');", ctx);
    assert.match(ctx.app.innerHTML, /<h1>Rechnung nicht gefunden<\/h1>/);
    assert.match(ctx.app.innerHTML, /href="#\/customer\/invoices">Zurück zu den Rechnungen<\/a><button type="button" class="btn outline" data-action="ui\.back">Zurück<\/button>/);
  });

  // modal() in enhancements.js keeps its inline handlers until T136 (strict CSP)
  it("keeps English texts and inline handlers out of the remaining old files", () => {
    for (const f of ["onboarding.js", "not-found.js", "supplier-status.js", "invitations.js", "offline-sync.js", "legal-security.js", "feedback-fixes.js", "workflows.js", "collaboration.js"]) {
      const src = read(f).replace(/\/\*[\s\S]*?\*\/|\/\/.*$/gm, "");
      assert.doesNotMatch(src, /\son(click|change|submit|input)="/, `${f}: inline handler`);
      assert.doesNotMatch(src, /toast\("[A-Z]/, `${f}: English toast`);
    }
    for (const k of ["ob.customer.profile.title", "ui.ofl.title", "ui.search.page.supplier_invoices_new", "ui.nf.page.title"]) assert.ok(read("locales/de.js").includes(`"${k.split(".").at(-1)}"`), k);
  });
});
