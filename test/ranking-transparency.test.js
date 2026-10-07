// T253: ranking transparency (EU P2B Regulation 2019/1150). The page "How suppliers are ranked and priced" draws
// every number from /api/ranking, which reads the engine's own constants: a changed constant changes the page
// (and the engine). The page is in English and German and is linked from the terms, the help and Platform orders.
const { describe, it, before, after } = require("node:test");
const assert = require("node:assert/strict");
const { readFileSync } = require("node:fs");
const path = require("node:path");
const vm = require("node:vm");
const { startApp } = require("./helpers");
const ranking = require("../ranking");
const { RANKING } = require("../estimate");
const { SUGGEST } = require("../sourcing");

const read = (f) => readFileSync(path.join(__dirname, "..", "public", f), "utf8");
function area(lang, { facts = ranking.facts({}), config = {}, files = ["areas/public.js"], user = null, orders = [] } = {}) {
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
    state: { user },
    route: async () => {},
    topActions() {},
    navigate() {},
    toast() {},
    publicLayout: (html) => html,
    dashboardShell: (r, active, html) => html,
    esc: (s) => String(s ?? "").replace(/[&<>'"]/g, (c) => ({ "&": "&amp;", "<": "&lt;", ">": "&gt;", "'": "&#39;", '"': "&quot;" })[c]),
    legalHtml: (text) => `<p>${text}</p>`,
    api: async (p) =>
      p === "/ranking"
        ? { ranking: JSON.parse(JSON.stringify(facts)) }
        : p === "/brokered-orders"
          ? { orders }
          : { supportEmail: "help@example.com", ...config },
  };
  ctx.window = ctx;
  ctx.window.scrollTo = () => {};
  vm.createContext(ctx);
  for (const f of ["core/brand.js", "core/languages.js", "locales/en.js", "locales/de.js", "core/t.js", "core/actions.js", "core/router.js", ...files])
    vm.runInContext(read(f), ctx, { filename: f });
  ctx.warnings = warnings;
  ctx.render = async (hash) => {
    ctx.location.hash = "#" + hash;
    await ctx.route();
    return ctx.app.innerHTML;
  };
  return ctx;
}
const text = (html) => html.replace(/<[^>]*>/g, " ").replace(/\s+/g, " ").replaceAll("&#39;", "'").replaceAll("&amp;", "&");

describe("ranking transparency (page)", () => {
  for (const lang of ["en", "de"])
    it(`explains ranking and prices in ${lang === "en" ? "English" : "German"}, with the engine's numbers`, async () => {
      const de = lang === "de",
        ctx = area(lang, { facts: ranking.facts({ platformFeePercent: 8, brokerMarkupPercent: 0 }) }),
        html = await ctx.render("/ranking"),
        plain = text(html);
      assert.deepEqual(ctx.warnings, []);
      assert.doesNotMatch(plain, /\bpublic\.[a-z]+\.[a-zA-Z.]+/, "raw key");
      assert.doesNotMatch(plain, /\{[a-z]+\}/i, "a parameter left in the text");
      assert.ok(plain.includes(de ? "Wie Lieferanten gereiht und bepreist werden" : "How suppliers are ranked and priced"));
      assert.ok(plain.includes("2019/1150"));
      // quality weights, badge, distance, availability, price list, split thresholds, no paid ranking
      assert.ok(plain.includes(de ? "Bewertung 30 %, pünktliche Lieferung 30 %" : "rating 30 %, on-time delivery 30 %"));
      assert.ok(plain.includes("Gold 6, Silver 4, Bronze 2"));
      assert.ok(plain.includes(de ? "einen Punkt pro 50 km ab, höchstens 15" : "one point per 50 km, at most 15"));
      assert.ok(plain.includes(de ? "weniger als 3 offene Aufgaben" : "fewer than 3 open tasks"));
      assert.ok(plain.includes(de ? "mindestens 10 % günstiger oder mindestens 20 % schneller" : "at least 10 % cheaper or at least 20 % faster"));
      assert.ok(plain.includes(de ? "Die Plattformgebühr beträgt 8 %" : "The platform fee is 8 %"));
      assert.ok(plain.includes(de ? "ohne Aufschlag" : "without a markup"));
      assert.ok(plain.includes(de ? "Entfernung zum Einsatzort bis 150 km: 15 Punkte" : "Distance to the site up to 150 km: 15 points"));
      assert.ok(plain.includes(de ? "Kein Lieferant kann für eine bessere Position bezahlen" : "No supplier can pay for a better position"));
    });

  it("changes when a constant of the engine changes", async () => {
    const before = await area("en").render("/ranking");
    const saved = { splitCheaper: RANKING.splitCheaper, gold: RANKING.badgeBonus.Gold, category: SUGGEST.category };
    try {
      RANKING.splitCheaper = 0.25;
      RANKING.badgeBonus.Gold = 9;
      SUGGEST.category = 35;
      const after = text(await area("en", { facts: ranking.facts({}) }).render("/ranking"));
      assert.ok(after.includes("at least 25 % cheaper"), "split threshold");
      assert.ok(after.includes("Gold 9, Silver 4"), "badge points");
      assert.ok(after.includes("You offer the request's category: 35 points."), "T223 points");
      assert.ok(!text(before).includes("at least 25 % cheaper"));
      // The engine uses the same constant: the Gold bonus is in the quality of a candidate
      const engine = require("../estimate")({
        getDb: () => ({
          suppliers: [{ id: "s1", live: true, services: ["Robotics"], hourlyRate: 90, rating: 4, badge: "Gold", location: "Regensburg" }],
          projects: [],
        }),
        scorecard: () => null,
      });
      const [c] = engine.candidates({ sitePostcode: "93055" }, { category: "Robotics", hours: 8 });
      assert.equal(c.quality, 80 + 9);
    } finally {
      RANKING.splitCheaper = saved.splitCheaper;
      RANKING.badgeBonus.Gold = saved.gold;
      SUGGEST.category = saved.category;
    }
  });

  it("shows a markup when the platform sets one", async () => {
    const html = await area("de", { facts: ranking.facts({ brokerMarkupPercent: 12 }) }).render("/ranking");
    assert.ok(text(html).includes("plus einen Plattformaufschlag von 12 %"));
  });

  it("is linked from the terms, the help and Platform orders", async () => {
    for (const lang of ["en", "de"]) {
      const ctx = area(lang);
      assert.ok((await ctx.render("/terms")).includes('href="#/ranking"'), "terms");
      assert.ok((await ctx.render("/faq")).includes('href="#/ranking"'), "built-in help");
      assert.ok((await area(lang, { config: { faqContent: "Operator help" } }).render("/faq")).includes('href="#/ranking"'), "operator help");
      assert.ok(!(await ctx.render("/privacy")).includes('href="#/ranking"'), "only where it belongs");
      const orders = area(lang, { files: ["areas/requests.js"], user: { role: "supplier" } });
      await vm.runInContext("rqSupplierOrders()", orders);
      assert.ok(orders.app.innerHTML.includes('href="#/ranking"'), "Platform orders");
      assert.deepEqual(orders.warnings, []);
    }
  });
});

describe("ranking transparency (API)", () => {
  let app, admin;
  before(async () => {
    app = await startApp();
    admin = await app.login("admin@test.local", "Admin-Password-2026!");
  });
  after(() => app?.stop());

  it("answers without signing in, from the constants and the price settings", async () => {
    const r = await app.call("GET", "/ranking");
    assert.equal(r.status, 200, r.error);
    assert.equal(r.ranking.estimate.splitCheaperPercent, Math.round(RANKING.splitCheaper * 100));
    assert.equal(r.ranking.estimate.maxOpenTasks, RANKING.maxOpenTasks);
    assert.deepEqual(r.ranking.suggestions.badge, SUGGEST.badge);
    const { settings } = await app.call("GET", "/admin/settings", undefined, admin);
    const saved = await app.call("PUT", "/admin/settings", { ...settings, platformFeePercent: 9.5, brokerMarkupPercent: 4 }, admin);
    assert.equal(saved.status, 200, saved.error);
    const now = (await app.call("GET", "/ranking")).ranking.prices;
    assert.deepEqual(now, { platformFeePercent: 9.5, brokerMarkupPercent: 4 });
  });
});
