// T129c: the sourcing dashboard, the offer comparison and contracts render from translation keys with data-action
// handlers; weights re-rank the offers on the page; statuses go to the server in English.
const { describe, it } = require("node:test");
const assert = require("node:assert/strict");
const { readFileSync } = require("node:fs");
const path = require("node:path");
const vm = require("node:vm");

const read = (f) => readFileSync(path.join(__dirname, "..", "public", f), "utf8");
const BID = {
  id: "b1",
  title: "Vision station",
  taskName: "Vision",
  projectName: "Line 4",
  status: "Open",
  dueDate: "2026-10-11",
  baseline: 30000,
  category: "Robotics",
  questions: ["Which cameras?"],
  createdAt: "2026-10-01T10:00:00Z",
  offers: [
    { id: "o1", supplierId: "s1", supplierCompany: "Keller Automation", amount: 28400, deliveryDays: 18, status: "Submitted", notes: "FAT included", answers: ["Basler"] },
    { id: "o2", supplierId: "s2", supplierCompany: "Rhein Robotics", amount: 31750, deliveryDays: 14, status: "Submitted" },
  ],
};
const CONTRACTS = [{ id: "c1", title: "Frame agreement", supplierCompany: "Keller", value: 12000, state: "Draft", status: "Draft", bidId: "b1", daysToEnd: null }];

function area(lang, hash = "#/customer/sourcing/b1") {
  const warnings = [],
    calls = [],
    toasts = [],
    shown = [];
  const els = {};
  const el = (id) => (els[id] ||= { id, innerHTML: "", textContent: "", value: "", classList: { add() {}, toggle: () => false } });
  const ctx = {
    console: { warn: (...a) => warnings.push(a.join(" ")), error() {}, log() {} },
    localStorage: { getItem: (k) => (k === "cc_lang" ? lang : null), setItem() {} },
    navigator: { language: "en-GB" },
    document: { addEventListener() {}, querySelector: (sel) => (sel === ".ds-weights-line" ? el("line") : sel === ".dashboard-content" ? el("content") : null), querySelectorAll: () => [], getElementById: el },
    location: { hash },
    Intl,
    URLSearchParams,
    app: { innerHTML: "" },
    state: { user: { role: "customer", id: "u1" } },
    route: async () => calls.push(["route"]),
    topActions() {},
    navigate: (to) => calls.push(["navigate", to]),
    toast: (m, type) => toasts.push([m, type]),
    toastEl: { dataset: {} },
    modal: (title, body) => shown.push({ title, body }),
    closeModal: () => calls.push(["close"]),
    uiConfirm: async (message) => (calls.push(["confirm", message]), true),
    dashboardShell: (r, active, html) => `[${r}:${active}]${html}`,
    ccBadge: () => "Silver",
    bmEnsure: async () => {},
    bmFor: () => null,
    inDonut: () => "<div class=in-donut></div>",
    inTopN: () => [],
    dsIso: (d) => d.toISOString().slice(0, 10),
    SR_WEIGHTS: { price: 50, delivery: 20, quality: 20, experience: 10 },
    SR_ACTIVE: ["Open", "Shortlist", "Second round", "Final round"],
    srDays: () => 3,
    srToday: () => "2026-10-02",
    esc: (s) => String(s ?? "").replace(/[&<>'"]/g, (c) => ({ "&": "&amp;", "<": "&lt;", ">": "&gt;", "'": "&#39;", '"': "&quot;" })[c]),
    api: async (p, opts) => {
      calls.push(["api", p, opts?.method || "GET", opts?.body]);
      if (p === "/bids") return { bids: [JSON.parse(JSON.stringify(BID))] };
      if (p === "/scorecards") return { scorecards: [{ supplierId: "s1", company: "Keller", score: 90, riskLevel: "Low", metrics: { rating: 4.8, onTimeRate: 96, firstTimeRightRate: null, responseRate: 80 }, risks: [] }] };
      if (p === "/suppliers") return { suppliers: [{ id: "s1", company: "Keller Automation", location: "Regensburg", experience: 10, badge: "Silver" }, { id: "s2", company: "Rhein Robotics" }] };
      if (p === "/projects") return { projects: [{ id: "p1", name: "Line 4" }] };
      if (p === "/contracts") return { contracts: JSON.parse(JSON.stringify(CONTRACTS)) };
      if (p === "/invoices") return { invoices: [] };
      return {};
    },
  };
  ctx.window = ctx;
  vm.createContext(ctx);
  for (const f of ["core/languages.js", "locales/en.js", "locales/de.js", "core/t.js", "core/actions.js", "core/router.js", "areas/offers.js", "areas/sourcing.js"]) vm.runInContext(read(f), ctx, { filename: f });
  Object.assign(ctx, { warnings, calls, toasts, shown, els });
  ctx.run = (name, target) => vm.runInContext("actions", ctx).run(name, target, { type: "click", preventDefault() {} });
  ctx.render = async (to) => {
    if (to) ctx.location.hash = to;
    await ctx.route();
    return [ctx.app.innerHTML, el("srCards").innerHTML, el("srResults").innerHTML, el("line").textContent].join("\n");
  };
  return ctx;
}
const settle = () => new Promise((r) => setTimeout(r, 5));
const text = (html) => html.replace(/<[^>]*>/g, " ");

describe("sourcing (T129c)", () => {
  for (const lang of ["en", "de"])
    it(`draws the dashboard, the comparison and contracts in ${lang === "en" ? "English" : "German"} from keys`, async () => {
      const ctx = area(lang);
      const pages = [await ctx.render("#/customer/sourcing"), await ctx.render("#/customer/sourcing/b1"), await ctx.render("#/customer/contracts")];
      assert.deepEqual(ctx.warnings, []);
      for (const html of pages) {
        assert.doesNotMatch(text(html), /\bsrc\.[a-zA-Z.]+/, "raw key");
        assert.doesNotMatch(html, /\son[a-z]+="/, "no inline handlers");
        assert.doesNotMatch(html, /data-i18n/); // no markers of the old translation layer (T136)
      }
      if (lang === "de") {
        assert.ok(pages[1].includes("Welches Angebot passt zu Ihnen?") && pages[1].includes("Gewichtet nach Preis 50 %"));
        assert.ok(pages[1].includes("Keller Automation liegt mit"), "the evaluation summary in German");
        assert.ok(pages[2].includes("VERTRAGSMANAGEMENT") && pages[2].includes(">Entwurf<"));
      }
    });

  it("shows a card per offer with the award and the other decisions", async () => {
    const html = await area("en").render();
    // T149: the weights sit between the header and the offer cards they rank, not further down the page
    const at = (x) => html.indexOf(x);
    assert.ok(at('class="sr-weights-bar"') > at("</h1>") && at('id="dsWeights"') < at('id="srCards"') && at('class="sr-weights-bar"') < at('id="dsWeights"'));
    assert.match(html, /<div class="sr-weights-bar"><span class="ds-weights-line"><\/span><button type="button" class="ds-text-link ds-weights-toggle"[^>]*>Change weights/);
    assert.ok(html.includes('<span class="ds-offer-chip ds-chip-best">Best match ·'));
    assert.match(html, /data-action="src\.award" data-bid="b1" data-offer="o1">Award Keller</);
    assert.match(html, /data-action="src\.eliminate" data-bid="b1" data-offer="o2">Eliminate</);
    assert.ok(html.includes("€1,600 under your budget"));
    assert.ok(html.includes("Answers side by side") && html.includes("Basler"));
    assert.match(html, /data-input="src\.weight"/);
  });

  it("draws revised, fastest and decided offers and reads the documents row from the risk flags (T100)", async () => {
    const ctx = area("en");
    const card = vm.runInContext("srOfferCard", ctx),
      docs = vm.runInContext("srDocsRow", ctx),
      bid = { id: "bid_1", category: "Robotics" },
      r = (o, extra) => ({ o: { id: "o1", supplierCompany: "Rhein Robotics", amount: 18900, deliveryDays: 21, status: "Submitted", ...o }, s: { location: "Nuremberg" }, card: { metrics: { rating: 4.6 }, risks: [] }, score: 86, savings: 2100, ...extra });
    const best = card(bid, r({}), 0, false, true, 2);
    assert.match(best, /Best match · 86/);
    assert.match(best, /€2,100 under your budget/);
    assert.match(best, /★ 4\.6 · 2 jobs with you/);
    assert.match(best, /All valid/);
    const revised = card(bid, r({ revisions: [{ amount: 18000 }] }, { score: 81 }), 1, false, true, 0);
    assert.match(revised, /Revised · 81/);
    assert.match(revised, /Was €18,000/);
    assert.match(revised, /new to you/);
    assert.match(card(bid, r({}, { savings: -1400 }), 2, true, true, 0), /Fastest · 86[\s\S]*€1,400 over your budget/);
    assert.equal(docs({ risks: [{ text: "No insurance evidence on file" }] }), "");
    assert.match(docs({ risks: [{ text: "Liability insurance expires in 19 day(s)" }] }), /ds-orange">1 expires/);
    // A decided offer shows its status instead of the actions
    const decided = card(bid, r({ status: "Accepted" }), 0, false, true, 0);
    assert.doesNotMatch(decided, /src\.award/);
    assert.match(decided, /<span class="status">Accepted<\/span>/);
  });

  it("re-ranks when a weight changes and saves the weights", async () => {
    const ctx = area("en");
    await ctx.render();
    const output = { value: "" };
    ctx.run("src.weight", { name: "delivery", value: "100", nextElementSibling: output });
    assert.equal(output.value, "100");
    assert.match(ctx.els.line.textContent, /Ranked by price 28 %, delivery 56 %/);
    assert.match(ctx.els.srCards.innerHTML, /Best match[^<]*<\/span>[\s\S]*?<b>Rhein Robotics<\/b>/, "the faster offer leads now");
    ctx.run("src.saveWeights", { dataset: { bid: "b1" } });
    await settle();
    const saved = JSON.parse(JSON.stringify(ctx.calls.find((c) => c[2] === "PATCH")));
    assert.deepEqual(saved[3], { action: "Set weights", weights: { price: 50, delivery: 100, quality: 20, experience: 10 } });
  });

  it("awards in English and opens contracts", async () => {
    const ctx = area("de");
    await ctx.render();
    ctx.run("src.award", { dataset: { bid: "b1", offer: "o2" } });
    await settle();
    assert.ok(ctx.calls.some((c) => c[0] === "confirm" && c[1].startsWith("„Vision station“ an Rhein Robotics")));
    assert.deepEqual(JSON.parse(JSON.stringify(ctx.calls.find((c) => c[2] === "PATCH")[3])), { action: "Accept offer", offerId: "o2" });
    assert.deepEqual(ctx.calls.at(-1), ["navigate", "/customer/contracts"]);
  });

  it("offers contract statuses with English values", async () => {
    const ctx = area("de", "#/customer/contracts");
    await ctx.render();
    ctx.run("src.contract", { dataset: { id: "c1" } });
    await settle();
    const { title, body } = ctx.shown.at(-1);
    assert.equal(title, "Vertrag bearbeiten");
    assert.ok(body.includes('<option value="Draft" selected>Entwurf</option><option value="Active">Aktiv</option>'));
    assert.match(body, /data-action="src\.saveContract" data-id="c1"/);
  });

  it("replaced the old sourcing pages and the comparison wrapper", () => {
    const old = read("sourcing-ui.js") + read("design-screens.js");
    assert.doesNotMatch(old, /function (srDashboard|srEvent|srContracts|srContractForm|srAward|dsOfferCard)\b|srEvent = async function/);
    assert.ok(read("index.html").includes('<script src="areas/offers.js"></script><script src="areas/sourcing.js"></script>'));
  });
});
