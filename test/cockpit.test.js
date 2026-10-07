// T242: the operator cockpit. Every figure from fixed data, the queue's deadlines (in the queue and in the action
// queue), the CSV export, the settings, and the page with 10,000 requests in under a second.
const { describe, it, before, after } = require("node:test");
const assert = require("node:assert/strict");
const { readFileSync, mkdtempSync, rmSync } = require("node:fs");
const os = require("node:os");
const path = require("node:path");
const vm = require("node:vm");
const { startApp, editDb } = require("./helpers");
const { figures, toCsv, deadlinesOf, workingHoursBetween, DEFAULT_LIMITS } = require("../cockpit");

const T0 = Date.parse("2026-09-01T08:00:00Z"); // a Tuesday
const iso = (h) => new Date(T0 + h * 3600000).toISOString();
const AT = Date.parse("2026-09-30T12:00:00Z");
const RANGE = { from: "2026-09-01", to: "2026-09-30", at: AT };
const hist = (...steps) => steps.map(([status, h, note]) => ({ status, at: iso(h), ...(note ? { note } : {}) }));
const FIXTURE = {
  requests: [
    {
      id: "r1",
      customerId: "c1",
      title: "Line 4",
      category: "PLC",
      sitePostcode: "93047",
      projectId: "p1",
      createdAt: iso(0),
      history: hist(["New", 0], ["Options ready", 1, "Instant estimate"], ["Chosen", 5], ["Contracted", 30]),
      packages: [
        { id: "k1", name: "PLC", category: "PLC", candidates: 5 },
        { id: "k2", name: "Wiring", category: "PLC", candidates: 2 },
      ],
      award: {
        estimate: true,
        status: "Accepted",
        parts: [
          { id: "a1", estimate: 1000, supplierAmount: 1000, status: "Confirmed" },
          { id: "a2", estimate: 2000, supplierAmount: 2200, status: "Confirmed" },
          { id: "a3", estimate: 500, supplierAmount: 500, status: "Declined" },
          { id: "a4", estimate: 600, supplierAmount: 600, status: "Confirmed", replaces: "a3" },
        ],
      },
      leakHints: [{ at: iso(10) }, { at: iso(11) }, { at: "2026-10-05T00:00:00Z" }],
    },
    {
      id: "r2",
      customerId: "c2",
      title: "Welding hall",
      category: "Welding",
      sitePostcode: "80331",
      projectId: "p2",
      createdAt: iso(24),
      history: hist(["New", 24], ["Sourcing", 25], ["Options ready", 28], ["Chosen", 40]),
      packages: [{ id: "k3", name: "Welding", category: "Welding", candidates: 1 }],
    },
    {
      id: "r3",
      customerId: "c1",
      title: "Line 5",
      category: "PLC",
      sitePostcode: "93055",
      createdAt: iso(48),
      history: hist(["New", 48]),
      packages: [{ id: "k4", name: "PLC", category: "PLC", candidates: 3 }],
    },
    { id: "r4", customerId: "c3", title: "Old", category: "PLC", createdAt: "2026-05-01T08:00:00Z", history: hist(["New", -3000]), packages: [] },
  ],
  contracts: [
    { id: "ct1", requestId: "r1", value: 3800, createdAt: iso(30) },
    { id: "ct2", requestId: "r4", value: 9999, createdAt: "2026-05-02T00:00:00Z" },
    { id: "ct3", value: 5000, createdAt: iso(30) }, // not brokered
  ],
  invoices: [
    { id: "i1", projectId: "p1" },
    { id: "i2", projectId: "p2" },
  ],
  commissionStatements: [
    { period: "2026-09", status: "Paid", lines: [{ invoiceId: "i1", fee: 100 }] },
    { period: "2026-09", status: "Open", lines: [{ invoiceId: "i2", fee: 50 }] },
    { period: "2026-09", status: "Credited", kind: "credit", lines: [{ invoiceId: "i2", fee: -10 }] },
    { period: "2026-08", status: "Paid", lines: [{ invoiceId: "i1", fee: 999 }] },
  ],
  introductions: [
    { customerId: "c1", supplierId: "s1", requestIds: ["r1"], lastOrderAt: "2026-05-01T00:00:00Z" },
    { customerId: "c1", supplierId: "s2", requestIds: ["r1", "r3"], lastOrderAt: "2026-05-01T00:00:00Z" },
    { customerId: "c2", supplierId: "s3", requestIds: ["r2"], lastOrderAt: "2026-09-10T00:00:00Z" },
  ],
  settings: { clause: { months: 12 } },
};

describe("operator cockpit: the figures (T242)", () => {
  const f = figures(FIXTURE, RANGE);
  it("speed: instant and manual apart", () => {
    assert.deepEqual(f.speed.instant, { n: 1, medianHours: 1, meanHours: 1 });
    assert.deepEqual(f.speed.manual, { n: 1, medianHours: 4, meanHours: 4 });
  });
  it("funnel with the rate at each step", () => {
    assert.deepEqual(
      f.funnel.map((s) => [s.step, s.n, s.rate]),
      [
        ["requests", 3, null],
        ["optionsReady", 2, 66.7],
        ["chosen", 2, 100],
        ["contracted", 1, 50],
      ],
    );
  });
  it("estimates: unchanged share, mean gap, first supplier", () => {
    assert.deepEqual(f.estimates, { confirmedParts: 3, unchangedShare: 66.7, meanGapPercent: 3.3, firstSupplierShare: 66.7 });
  });
  it("liquidity: candidates per package and the thin ones", () => {
    assert.equal(f.liquidity.packages, 4);
    assert.equal(f.liquidity.meanCandidates, 2.8);
    assert.equal(f.liquidity.thin, 2);
    assert.deepEqual(f.liquidity.thinList.map((x) => [x.requestId, x.package, x.candidates]), [["r1", "Wiring", 2], ["r2", "Welding", 1]]);
  });
  it("money: volume, fee invoiced and paid, take rate", () => {
    assert.deepEqual(f.money, { orders: 1, volume: 3800, feeInvoiced: 140, feePaid: 100, takeRate: 3.7 });
  });
  it("retention: a second request within six months", () => {
    assert.deepEqual(f.retention, { customers: 2, returning: 1, rate: 50 });
  });
  it("leakage: hints in the period and quiet pairs", () => {
    assert.equal(f.leakage.hints, 2);
    assert.equal(f.leakage.quietPairs, 1);
    assert.deepEqual(f.leakage.pairs[0], { customerId: "c1", supplierId: "s1", lastOrderAt: "2026-05-01T00:00:00Z", protectedUntil: "2027-05-01", protectionEnded: false });
  });
  it("per month and per week", () => {
    assert.deepEqual(f.series, [{ bucket: "2026-09", requests: 3, optionsReady: 2, chosen: 2, contracted: 1, volume: 3800 }]);
    assert.deepEqual(figures(FIXTURE, { ...RANGE, period: "week" }).series.map((b) => [b.bucket, b.requests]), [["2026-08-31", 3]]);
  });
  it("filters by category and region", () => {
    const w = figures(FIXTURE, { ...RANGE, category: "Welding" });
    assert.equal(w.funnel[0].n, 1);
    assert.deepEqual(w.money, { orders: 0, volume: 0, feeInvoiced: 40, feePaid: 0, takeRate: null });
    assert.equal(w.leakage.quietPairs, 0);
    const r = figures(FIXTURE, { ...RANGE, region: "93" });
    assert.equal(r.funnel[0].n, 2);
    assert.equal(r.money.volume, 3800);
  });
  it("exports every figure as CSV", () => {
    const csv = toCsv(f);
    for (const row of ["speed,instant.medianHours,1", "funnel,optionsReady.rate,66.7", "estimates,meanGapPercent,3.3", "liquidity,thin,2", "money,takeRate,3.7", "retention,rate,50", "leakage,quietPairs,1", "2026-09,3,2,2,1,3800"])
      assert.ok(csv.includes(row), row);
    // A spreadsheet formula in a title is defused
    const evil = toCsv(figures({ ...FIXTURE, requests: [{ ...FIXTURE.requests[1], title: "=HYPERLINK(1)" }] }, RANGE));
    assert.ok(evil.includes("thin,'=HYPERLINK(1),Welding,1"));
  });
});

describe("operator cockpit: the queue's deadlines (T242)", () => {
  const fri = Date.parse("2026-10-02T12:00:00Z"),
    mon = Date.parse("2026-10-05T12:00:00Z");
  it("counts working hours only", () => {
    assert.equal(workingHoursBetween(fri, mon), 24);
    assert.equal(workingHoursBetween(mon, mon + 5 * 3600000), 5);
  });
  it("marks a new request, a part about to expire and a waiting price change", () => {
    const L = DEFAULT_LIMITS,
      kinds = (r, at = mon) => deadlinesOf(r, L, at).map((d) => d.kind);
    assert.deepEqual(kinds({ status: "New", createdAt: new Date(mon - 5 * 3600000).toISOString() }), ["newRequest"]);
    assert.deepEqual(kinds({ status: "New", createdAt: new Date(mon - 3 * 3600000).toISOString() }), []);
    // Sent on Friday at noon: by Monday noon 24 working hours have passed, the weekend not counted
    assert.deepEqual(kinds({ status: "New", createdAt: new Date(fri).toISOString() }), ["newRequest"]);
    const award = (parts) => ({ status: "Chosen", award: { status: "Waiting for supplier", parts } });
    assert.deepEqual(kinds(award([{ id: "a", status: "Waiting for supplier", expiresAt: new Date(mon + 20 * 3600000).toISOString() }])), ["partExpiring"]);
    assert.deepEqual(kinds(award([{ id: "a", status: "Waiting for supplier", expiresAt: new Date(mon + 30 * 3600000).toISOString() }])), []);
    assert.deepEqual(kinds(award([{ id: "a", status: "Price changed", proposed: { at: new Date(mon - 5 * 86400000).toISOString() } }])), ["priceWaiting"]);
    assert.deepEqual(kinds(award([{ id: "a", status: "Price changed", proposed: { at: new Date(mon - 86400000).toISOString() } }])), []);
    // A longer limit from the settings
    assert.deepEqual(deadlinesOf({ status: "New", createdAt: new Date(mon - 5 * 3600000).toISOString() }, { ...L, newHours: 8 }, mon), []);
  });
});

describe("operator cockpit: the page and the API (T242)", () => {
  let app, admin, customer, requestId, dataDir;
  before(async () => {
    dataDir = mkdtempSync(path.join(os.tmpdir(), "craftcrew-test-"));
    app = await startApp({ dataDir, env: { PLATFORM_MODE: "brokered" } });
    admin = await app.login("admin@test.local", "Admin-Password-2026!");
    await app.signup("customer", "biz.customer@test.local");
    customer = await app.login("biz.customer@test.local", "Test-Password-2026");
    const r = await app.call(
      "POST",
      "/requests",
      { title: "Robot cell commissioning", description: "Two cells, PLC handover and safety acceptance.", category: "Commissioning", sitePostcode: "93055" },
      customer,
    );
    assert.equal(r.status, 201, r.error);
    requestId = r.request.id;
    assert.equal(r.request.packages[0].candidates, undefined, "the customer does not see the candidate count");
  });
  after(async () => {
    await app?.stop();
    rmSync(dataDir, { recursive: true, force: true });
  });

  it("answers the admin only, checks the filter and exports CSV", async () => {
    assert.equal((await app.call("GET", "/admin/business", undefined, customer)).status, 403);
    const r = await app.call("GET", "/admin/business?period=week", undefined, admin);
    assert.equal(r.status, 200, r.error);
    assert.equal(r.figures.funnel[0].n, 1);
    assert.equal(r.figures.liquidity.packages, 1);
    assert.equal(r.figures.liquidity.thin, 1, "nobody can price it yet");
    assert.deepEqual(r.limits, DEFAULT_LIMITS);
    assert.equal((await app.call("GET", "/admin/business?from=2026-09-30&to=2026-09-01", undefined, admin)).code, "bizPeriod");
    assert.equal((await app.call("GET", "/admin/business?region=abc", undefined, admin)).code, "bizFilter");
    const csv = await fetch(`${app.base}/api/admin/business/csv`, { headers: { Authorization: "Bearer " + admin } });
    assert.match(csv.headers.get("content-type"), /text\/csv/);
    assert.match(await csv.text(), /funnel,requests,1/);
  });

  it("keeps the deadlines as settings", async () => {
    assert.equal((await app.call("PUT", "/admin/business/deadlines", { newHours: 0, partDays: 1, priceDays: 2 }, admin)).code, "bizDeadlines");
    assert.equal((await app.call("PUT", "/admin/business/deadlines", { newHours: 6, partDays: 1, priceDays: 2 }, customer)).status, 403);
    const r = await app.call("PUT", "/admin/business/deadlines", { newHours: 6, partDays: 2, priceDays: 3 }, admin);
    assert.deepEqual(r.limits, { newHours: 6, partDays: 2, priceDays: 3 });
    assert.deepEqual((await app.call("GET", "/admin/business", undefined, admin)).limits, r.limits);
    await app.call("PUT", "/admin/business/deadlines", DEFAULT_LIMITS, admin);
  });

  it("shows a request waiting too long in the queue and the action queue", async () => {
    let q = (await app.call("GET", "/requests", undefined, admin)).requests.find((x) => x.id === requestId);
    assert.deepEqual(q.deadlines, []);
    await app.stop();
    await editDb(dataDir, (db) => {
      db.requests.find((x) => x.id === requestId).createdAt = new Date(Date.now() - 10 * 86400000).toISOString();
    });
    app = await startApp({ env: { PLATFORM_MODE: "brokered" }, dataDir: dataDir });
    admin = await app.login("admin@test.local", "Admin-Password-2026!");
    q = (await app.call("GET", "/requests", undefined, admin)).requests.find((x) => x.id === requestId);
    assert.deepEqual(q.deadlines.map((d) => d.kind), ["newRequest"]);
    const aq = await app.call("GET", "/action-queue", undefined, admin);
    const item = aq.items.find((x) => x.kind === "deadline");
    assert.equal(item.requestId, requestId);
    assert.deepEqual(item.q.title, ["deadlineNewRequest", { title: "Robot cell commissioning" }]);
    assert.equal(item.link, `/admin/requests/${requestId}`);
  });

  it("loads in under a second with 10,000 requests", async () => {
    await app.stop();
    await editDb(dataDir, (db) => {
      const base = db.requests[0],
        start = Date.now() - 80 * 86400000;
      for (let i = 0; i < 10000; i++) {
        const at = new Date(start + i * 600000).toISOString();
        db.requests.push({
          ...base,
          id: "req_perf" + i,
          customerId: "cust" + (i % 700),
          createdAt: at,
          status: ["New", "Options ready", "Contracted"][i % 3],
          history: [
            { status: "New", at },
            { status: "Options ready", at, note: i % 2 ? "Instant estimate" : undefined },
          ],
          packages: [{ id: "pk" + i, name: "P", category: "Commissioning", candidates: i % 6 }],
          award: { estimate: true, status: "Accepted", parts: [{ id: "x" + i, estimate: 1000, supplierAmount: 1000 + (i % 5) * 10, status: "Confirmed" }] },
        });
      }
    });
    app = await startApp({ env: { PLATFORM_MODE: "brokered" }, dataDir: dataDir });
    admin = await app.login("admin@test.local", "Admin-Password-2026!");
    const t0 = performance.now(),
      r = await app.call("GET", "/admin/business", undefined, admin),
      ms = performance.now() - t0;
    assert.equal(r.status, 200);
    assert.ok(r.figures.funnel[0].n >= 10000);
    assert.ok(ms < 1000, `took ${Math.round(ms)} ms`);
  });
});

describe("operator cockpit: the page (T242)", () => {
  const read = (f) => readFileSync(path.join(__dirname, "..", "public", f), "utf8");
  for (const lang of ["en", "de"])
    it(`draws the page in ${lang === "de" ? "German" : "English"} from keys`, async () => {
      const warnings = [];
      const ctx = {
        console: { warn: (...a) => warnings.push(a.join(" ")), error() {}, log() {} },
        localStorage: { getItem: (k) => (k === "cc_lang" ? lang : null), setItem() {} },
        navigator: { language: "en-GB" },
        document: { addEventListener() {}, querySelector: () => null, querySelectorAll: () => [] },
        Intl,
        URLSearchParams,
        app: { innerHTML: "" },
        routes: { add() {} },
        dashboardShell: (r, active, html) => `[${r}:${active}]${html}`,
        esc: (s) => String(s ?? "").replace(/[&<>'"]/g, (c) => ({ "&": "&amp;", "<": "&lt;", ">": "&gt;", "'": "&#39;", '"': "&quot;" })[c]),
        api: async () => ({ figures: figures(FIXTURE, RANGE), limits: DEFAULT_LIMITS, categories: ["PLC", "Welding"] }),
      };
      ctx.window = ctx;
      vm.createContext(ctx);
      for (const f of ["core/languages.js", "locales/en.js", "locales/de.js", "core/t.js", "core/actions.js", "areas/business.js"]) vm.runInContext(read(f), ctx, { filename: f });
      await vm.runInContext("bzPage({}, new URLSearchParams(''))", ctx);
      const html = ctx.app.innerHTML;
      assert.deepEqual(warnings, []);
      assert.ok(html.startsWith("[admin:business]"));
      assert.doesNotMatch(html.replace(/<[^>]*>/g, " "), /\bbiz\.[a-zA-Z.]+/, "raw key");
      assert.doesNotMatch(html, /\son[a-z]+="/);
      assert.ok(html.includes(lang === "de" ? "Trichter" : "Funnel"));
      assert.match(html, /data-action="biz\.filter"/);
      assert.match(html, /data-action="biz\.deadlines"/);
      assert.match(html, /href="\/api\/admin\/business\/csv\?/);
      assert.match(html, /#\/admin\/requests\/r2/, "the thin packages link to their request");
    });
});
