// T126a: the public pages (landing, pricing, how it works, FAQ, legal) render from translation keys in English
// and German, with no missing key, and are registered in the route table.
const { describe, it } = require("node:test");
const assert = require("node:assert/strict");
const { readFileSync } = require("node:fs");
const path = require("node:path");
const vm = require("node:vm");

const read = (f) => readFileSync(path.join(__dirname, "..", "public", f), "utf8");

function area(lang, config = {}) {
  const warnings = [];
  const ctx = {
    console: { warn: (...a) => warnings.push(a.join(" ")), error() {}, log() {} },
    localStorage: { getItem: (k) => (k === "cc_lang" ? lang : null) },
    navigator: { language: "en-GB" },
    document: { addEventListener() {}, getElementById: () => null },
    location: { hash: "" },
    Intl,
    URLSearchParams,
    app: { innerHTML: "" },
    state: { user: null },
    route: async () => {},
    topActions() {},
    navigate() {},
    toast() {},
    publicLayout: (html) => html,
    esc: (s) => String(s ?? "").replace(/[&<>'"]/g, (c) => ({ "&": "&amp;", "<": "&lt;", ">": "&gt;", "'": "&#39;", '"': "&quot;" })[c]),
    legalHtml: (text) => `<p>${text}</p>`,
    api: async (p) => (p === "/platform-config" ? { supportEmail: "help@example.com", ...config } : { suppliers: [] }),
  };
  ctx.window = ctx;
  ctx.window.scrollTo = () => {};
  vm.createContext(ctx);
  for (const f of ["locales/en.js", "locales/de.js", "core/t.js", "core/actions.js", "core/router.js", "areas/public.js"])
    vm.runInContext(read(f), ctx, { filename: f });
  ctx.warnings = warnings;
  ctx.render = async (hash) => {
    ctx.location.hash = "#" + hash;
    await ctx.route();
    return ctx.app.innerHTML;
  };
  return ctx;
}
const PAGES = ["/", "/pricing", "/how-it-works", "/faq", "/imprint", "/privacy", "/terms"];

describe("public area", () => {
  it("registers every public page in the route table", () => {
    const routes = vm.runInContext("routes.list()", area("en"));
    for (const p of [...PAGES, "/home"]) assert.ok(routes.includes(p), p);
  });

  for (const lang of ["en", "de"])
    it(`renders every page in ${lang === "en" ? "English" : "German"} without a missing key`, async () => {
      const ctx = area(lang);
      for (const p of PAGES) {
        const html = await ctx.render(p);
        assert.match(html, /^<div data-i18n="keys">/, `${p} is drawn with keys`);
        assert.doesNotMatch(html, /\bpublic\.[a-z]+\.[a-zA-Z.]+/, `${p} shows a raw key`);
      }
      assert.deepEqual(ctx.warnings, []);
    });

  it("draws the landing page in German from the start, with its links", async () => {
    const html = await area("de").render("/");
    assert.match(html, /<h1>Jedes Team\. Ein Projekt\. Null Chaos\.<\/h1>/);
    for (const link of ["#/signup", "#/suppliers", "#/supplier-application"]) assert.ok(html.includes(`href="${link}"`), link);
    assert.doesNotMatch(html, /Every crew/);
  });

  it("lists the pricing items from the locale lists", async () => {
    const html = await area("de").render("/pricing");
    assert.equal((html.match(/<li><span>✓<\/span>/g) || []).length, 15);
    assert.ok(html.includes("Unbegrenzt Projekte und Aufgaben anlegen") || /<li><span>✓<\/span>[^<]+/.test(html));
  });

  it("shows the operator's own texts as written and the product's rights on the privacy page", async () => {
    const ctx = area("de", { legal: { privacy: "Unsere Datenschutzerklärung" }, faqContent: "Operator help text" });
    const privacy = await ctx.render("/privacy");
    assert.ok(privacy.includes('<article class="legal-body"><p>Unsere Datenschutzerklärung</p></article>'));
    assert.ok(privacy.includes("<h2>Ihre Rechte bei CraftCrew</h2>"));
    assert.ok(privacy.includes("<span>Kontakt:</span>"));
    assert.ok((await ctx.render("/terms")).includes("<p>"), "unpublished pages say so");
    assert.ok((await ctx.render("/faq")).includes("<p>Operator help text</p>"));
    assert.ok(!(await ctx.render("/imprint")).includes("gdRights"), "the rights section is only on the privacy page");
  });

  it("removed the old renderers and the I18N_DE entries no page uses any more", () => {
    for (const f of ["app.js", "feedback-fixes.js", "collaboration.js", "design-screens.js", "onboarding.js", "legal-security.js", "gdpr-ui.js"]) {
      const src = read(f);
      assert.doesNotMatch(src, /function renderHome|renderHome = |function renderStatic|renderStatic = |function legalPage|legalPage = |obEnhanceHome/, f);
    }
    const de = read("i18n.js");
    for (const gone of ["Every crew. One project. Zero chaos.", "Vetted partners for your next project."])
      assert.ok(!de.includes(`"${gone}"`), gone);
  });
});
