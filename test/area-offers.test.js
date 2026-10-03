// T129b: offers and bids render from translation keys with data-action handlers. Bid and offer statuses are
// translated labels for English values; the actions sent to the server stay English.
const { describe, it } = require("node:test");
const assert = require("node:assert/strict");
const { readFileSync } = require("node:fs");
const path = require("node:path");
const vm = require("node:vm");

const read = (f) => readFileSync(path.join(__dirname, "..", "public", f), "utf8");
const BIDS = [
  {
    id: "b1",
    projectId: "p1",
    projectName: "Line 4",
    phaseName: "Build",
    taskName: "Vision",
    title: "Vision station",
    description: "Cameras & training",
    status: "Open",
    dueDate: "2026-10-11",
    category: "Controls",
    eventType: "RFQ",
    questions: ["Which cameras?"],
    offers: [
      { id: "o1", supplierId: "s1", supplierCompany: "Keller", amount: 28400, deliveryDays: 21, status: "Submitted", hourlyRate: 148, notes: "FAT included", clarifications: [{ authorName: "Ann", text: "Lens?", createdAt: "2026-10-01T10:00:00Z" }] },
      { id: "o2", supplierId: "s2", supplierCompany: "Nordbau", amount: 31000, deliveryDays: 14, status: "Changes requested", changeNote: "Split price" },
    ],
  },
  { id: "b2", projectId: "p1", title: "Old work", status: "Awarded", dueDate: "2026-09-01", offers: [] },
];

function area(lang, { role = "customer", hash = "#/customer/offers", answer = true, prompt = "Split it" } = {}) {
  const warnings = [],
    calls = [],
    toasts = [],
    shown = [];
  const ctx = {
    console: { warn: (...a) => warnings.push(a.join(" ")), error() {}, log() {} },
    localStorage: { getItem: (k) => (k === "cc_lang" ? lang : null), setItem() {} },
    navigator: { language: "en-GB" },
    document: { addEventListener() {}, querySelector: () => null, querySelectorAll: () => [], getElementById: (id) => (ctx.elements[id] ||= { textContent: "", value: "" }) },
    elements: {},
    location: { hash },
    Intl,
    URLSearchParams,
    app: { innerHTML: "" },
    state: { user: { role, id: "u1", supplierId: role === "supplier" ? "s1" : undefined } },
    route: async () => calls.push(["route"]),
    topActions() {},
    navigate: (to) => calls.push(["navigate", to]),
    toast: (m, type) => toasts.push([m, type]),
    toastEl: { dataset: {} },
    modal: (title, body) => shown.push({ title, body }),
    closeModal: () => calls.push(["close"]),
    uiConfirm: async (message) => (calls.push(["confirm", message]), answer),
    uiPrompt: async (message, value, opts) => (calls.push(["prompt", message, opts.confirmLabel]), prompt),
    dashboardShell: (r, active, html) => `[${r}:${active}]${html}`,
    ccBadge: (s) => s.badge || "Verified",
    ccProjects: async () => [{ id: "p1", name: "Line 4", phases: [] }],
    bmEnsure: async () => {},
    bmFor: (service) => (service === "Controls" ? { service: "Controls", p25: 107, p75: 137, median: 120 } : null),
    pvData: { suppliers: [{ supplierId: "s2", live: true }], invites: [] },
    pvLoad: async () => ctx.pvData,
    SR_WEIGHTS: { price: 50 },
    srToday: () => "2026-10-02",
    uploadFile: async () => ({ url: "/uploads/x.pdf" }),
    esc: (s) => String(s ?? "").replace(/[&<>'"]/g, (c) => ({ "&": "&amp;", "<": "&lt;", ">": "&gt;", "'": "&#39;", '"': "&quot;" })[c]),
    api: async (p, opts) => {
      calls.push(["api", p, opts?.method || "GET", opts?.body]);
      if (p === "/bids" && !opts) return { bids: JSON.parse(JSON.stringify(BIDS)) };
      if (p === "/bids") return { bid: { id: "b9" } };
      if (p === "/projects/p1") return { project: { id: "p1", dueDate: "2026-12-01", phases: [{ id: "ph1", tasks: [{ id: "t1", name: "Vision & optics", orderAmount: 18500 }] }] } };
      if (p === "/platform-config") return { serviceCategories: ["Controls", "Welding"] };
      if (p === "/suppliers") return { suppliers: [{ id: "s2", company: "Nordbau", location: "Hamburg", services: ["Welding"] }] };
      return {};
    },
  };
  ctx.window = ctx;
  vm.createContext(ctx);
  for (const f of ["core/languages.js", "locales/en.js", "locales/de.js", "core/t.js", "core/actions.js", "core/router.js", "areas/offers.js"]) vm.runInContext(read(f), ctx, { filename: f });
  Object.assign(ctx, { warnings, calls, toasts, shown });
  ctx.run = (name, el) => vm.runInContext("actions", ctx).run(name, el, { type: "click", preventDefault() {} });
  ctx.call = (code) => vm.runInContext(code, ctx);
  ctx.render = async () => (await ctx.route(), ctx.app.innerHTML);
  return ctx;
}
const settle = () => new Promise((r) => setTimeout(r, 5));
const text = (html) => html.replace(/<[^>]*>/g, " ");
const fd = (values) =>
  class {
    constructor() {
      return Object.assign(new Map(Object.entries(values)), { getAll: (k) => [].concat(values[k] || []) });
    }
  };

describe("offers and bids (T129b)", () => {
  for (const lang of ["en", "de"])
    for (const role of ["customer", "supplier"])
      it(`draws the ${role} page in ${lang === "en" ? "English" : "German"} from keys`, async () => {
        const ctx = area(lang, { role, hash: role === "customer" ? "#/customer/offers" : "#/supplier/bids" }),
          html = await ctx.render();
        assert.deepEqual(ctx.warnings, []);
        assert.doesNotMatch(text(html), /\boffers\.[a-zA-Z.]+/, "raw key");
        assert.doesNotMatch(html, /\son[a-z]+="/, "no inline handlers");
        assert.ok(html.startsWith(`[${role}:${role === "customer" ? "offers" : "bids"}]<div class="dash-top">`));
        if (lang === "de") {
          assert.ok(html.includes('<option value="Open">Offen</option>'), "bid status is a noun, not the verb Öffnen");
          assert.ok(html.includes("2 Angebote") && html.includes("Änderungen angefordert"));
          assert.match(html, /148\s€\/h – über dem üblichen Bereich 107\s€–137\s€\/h/);
        }
      });

  it("shows the decisions a customer can take and links offers to the comparison", async () => {
    const html = await area("en").render();
    assert.ok(html.includes('href="#/customer/sourcing/b1">Compare offers ›</a>'));
    assert.match(html, /data-action="offers\.award" data-bid="b1" data-offer="o1">Award task/);
    assert.match(html, /data-action="offers\.changes" data-bid="b1" data-offer="o1">Request changes/);
    assert.match(html, /data-action="offers\.close" data-bid="b1">Close bidding/);
    assert.ok(html.includes("Changes requested: <bdi>Split price</bdi>"));
    assert.ok(!html.includes('href="#/customer/sourcing/b2"'), "no comparison without offers");
    const supplier = await area("en", { role: "supplier", hash: "#/supplier/bids" }).render();
    assert.match(supplier, /data-action="offers\.offer" data-bid="b1">Edit \/ resend offer/);
    assert.ok(!supplier.includes("offers.award"));
  });

  it("sends English actions for award, close and change requests", async () => {
    const ctx = area("de");
    ctx.run("offers.award", { dataset: { bid: "b1", offer: "o1" } });
    await settle();
    ctx.run("offers.close", { dataset: { bid: "b1" } });
    await settle();
    ctx.run("offers.changes", { dataset: { bid: "b1", offer: "o1" } });
    await settle();
    const writes = JSON.parse(JSON.stringify(ctx.calls.filter((c) => c[2] === "PATCH").map((c) => c[3])));
    assert.deepEqual(writes, [{ offerId: "o1", action: "Accept offer" }, { offerId: "", action: "Close bid" }, { action: "Request changes", offerId: "o1", note: "Split it" }]);
    assert.ok(ctx.calls.some((c) => c[0] === "prompt" && c[2] === "Anfrage senden"));
  });

  it("offers the questions and the hourly rate in the supplier's offer form", async () => {
    const ctx = area("de", { role: "supplier", hash: "#/supplier/bids" });
    await ctx.call("ccOpenBidOffer('b1')");
    const { title, body } = ctx.shown.at(-1);
    assert.equal(title, "Angebot überarbeiten", "s1 already sent an offer");
    assert.match(body, /<form id="srOfferForm" class="modal-form" data-action="offers\.send" data-bid="b1">/);
    assert.ok(body.includes('name="answer_0"') && body.includes('name="hourlyRate"') && body.includes("Üblicher Satz für"));
  });

  it("creates an event only for the preferred suppliers when asked", async () => {
    const ctx = area("de");
    await ctx.call("wfCreateBid('p1','ph1','t1')");
    const { body } = ctx.shown.at(-1);
    assert.ok(body.includes("<b>Vision &amp; optics</b>"));
    assert.ok(body.includes('<option value="Controls">Controls</option>') && body.includes('<option value="RFQ">RFQ — Angebotsanfrage</option>'));
    assert.match(body, /Meine bevorzugten Anbieter einladen \(1\)/);
    ctx.FormData = fd({ eventType: "RFQ", category: "Controls", title: "Vision", description: "x", dueDate: "2026-12-01", questions: "A\n\nB", preferredOnly: "on" });
    ctx.call("FormData = window.FormData");
    ctx.run("offers.publish", { dataset: { project: "p1", phase: "ph1", task: "t1" } });
    await settle();
    const sent = JSON.parse(JSON.stringify(ctx.calls.find((c) => c[1] === "/bids" && c[2] === "POST")[3]));
    assert.deepEqual(sent.questions, ["A", "B"]);
    assert.deepEqual(sent.invitedSupplierIds, ["s2"]);
    assert.ok(!("preferredOnly" in sent));
    assert.deepEqual(ctx.calls.at(-1), ["navigate", "/customer/sourcing/b9"]);
  });

  it("replaced the old offers pages and their wrappers", () => {
    const old = ["workflows.js", "reviews.js", "collaboration.js", "sourcing-ui.js", "benchmarks-ui.js", "preferred-ui.js", "design-screens.js"].map(read).join("\n");
    assert.doesNotMatch(old, /function (wfOffers|ccRenderOffers|reviewInviteBid|reviewOfferTalk|rvRequestOfferChanges|dsEnhanceOffers)\b|(ccOpenBidOffer|wfCreateBid|reviewInviteBid|api) = async function/);
    assert.ok(read("index.html").includes('<script src="areas/directory.js"></script><script src="areas/offers.js"></script>'));
  });
});
