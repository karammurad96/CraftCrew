// T246: public pages per category and region. Only real pages (served area, at least 3 vetted suppliers), a price
// range only from at least 5 data points, the supplier count rounded down, a case study only with the customer's
// permission, English and German, structured data, a sitemap with the real pairs only, and the server's own CSP.
const { describe, it, before, after } = require("node:test");
const assert = require("node:assert/strict");
const createServicePages = require("../servicepages");
const createBenchmarks = require("../benchmarks");
const locales = require("../locales");
const { startApp, vettedSupplier } = require("./helpers");

const supplier = (id, location = "93055 Regensburg", extra = {}) => ({
  id,
  company: "Company " + id,
  live: true,
  services: ["PLC Programming"],
  location,
  serviceCatalog: [{ name: "S7 programming " + id, category: "PLC Programming", unit: "hour", rate: 80 + Number(id.slice(1)) }],
  ...extra,
});
function build(db) {
  const pages = createServicePages({
    getDb: () => db,
    save() {},
    send: (res, status, payload) => ((res.status = status), (res.payload = payload)),
    body: async (req) => req.body,
    now: () => "2026-10-07T10:00:00Z",
    activity() {},
    benchmarks: createBenchmarks({ getDb: () => db, send() {} }),
    categories: () => ["PLC Programming", "Welding"],
    appUrl: () => "https://craftcrew.example",
    pageHeaders: () => ({ "Content-Security-Policy": "default-src 'self'" }),
    text: (...a) => locales.text(...a),
    brand: () => locales.BRAND,
  });
  const get = (path) => {
    const res = { head: null, out: "" };
    res.writeHead = (status, headers) => (res.head = { status, headers });
    res.end = (s) => (res.out = s || "");
    const u = new URL(path, "https://craftcrew.example");
    const handled = pages.serve({ method: "GET", headers: {} }, res, u);
    return { handled, status: res.head?.status, headers: res.head?.headers, html: res.out };
  };
  return { pages, get };
}
const world = (n, extra = {}) => ({
  suppliers: Array.from({ length: n }, (_, i) => supplier("s" + (i + 1))),
  settings: {},
  requests: [],
  projects: [],
  ...extra,
});

describe("service pages", () => {
  it("exist only for pairs with at least 3 vetted suppliers", () => {
    const two = build(world(2));
    assert.equal(two.get("/services/plc-programming/bavaria").status, 404);
    assert.equal(two.pages.pairs().length, 0);
    const three = build(world(3));
    assert.equal(three.get("/services/plc-programming/bavaria").status, 200);
    assert.equal(three.get("/services/plc-programming/saxony").status, 404, "nobody there");
    assert.equal(three.get("/services/welding/bavaria").status, 404, "nobody offers it");
    // a supplier that is not live does not count
    const db = world(3);
    db.suppliers[0].live = false;
    assert.equal(build(db).get("/services/plc-programming/bavaria").status, 404);
  });

  it("stays inside the served area", () => {
    const db = world(3, { settings: { servedRegions: ["10"] } });
    assert.equal(build(db).get("/services/plc-programming/bavaria").status, 404);
    db.settings = { servedRegions: ["93"], servedCategories: ["Welding"] };
    assert.equal(build(db).get("/services/plc-programming/bavaria").status, 404, "category not served");
    db.settings = { servedRegions: ["93"], servedCategories: ["PLC Programming"] };
    assert.equal(build(db).get("/services/plc-programming/bavaria").status, 200);
  });

  it("shows a price range only from 5 data points, and the supplier number rounded down", () => {
    const few = build(world(4)).get("/services/plc-programming/bavaria");
    assert.doesNotMatch(few.html, /between \d+ and \d+ euros/);
    assert.match(few.html, /not enough prices/);
    assert.match(few.html, /Several vetted suppliers/);
    const five = build(world(5)).get("/services/plc-programming/bavaria");
    assert.match(five.html, /between 82 and 84 euros/);
    assert.match(five.html, /More than 5 vetted suppliers/);
    assert.match(five.html, /"lowPrice":82,"highPrice":84/);
    assert.match(build(world(12)).get("/services/plc-programming/bavaria").html, /More than 10 vetted suppliers/);
    const pages = require("../servicepages");
    assert.deepEqual([4, 5, 9, 10, 19, 20, 49, 50].map(pages.roundedDown), [0, 5, 5, 10, 10, 20, 20, 50]);
  });

  it("has English and German text, a title, a description, hreflang links and structured data", () => {
    const en = build(world(5)).get("/services/plc-programming/bavaria"),
      de = build(world(5)).get("/services/plc-programming/bavaria?lang=de");
    assert.match(en.html, /<html lang="en">/);
    assert.match(en.html, /<title>PLC Programming in Bavaria \| /);
    assert.match(en.html, /<meta name="description" content="Vetted PLC Programming suppliers in Bavaria/);
    assert.match(en.html, /rel="canonical" href="https:\/\/craftcrew.example\/services\/plc-programming\/bavaria"/);
    assert.match(en.html, /hreflang="de" href="https:\/\/craftcrew.example\/services\/plc-programming\/bavaria\?lang=de"/);
    assert.match(en.html, /<script type="application\/ld\+json">/);
    const ld = JSON.parse(en.html.match(/<script type="application\/ld\+json">(.*?)<\/script>/)[1]);
    assert.equal(ld["@type"], "Service");
    assert.equal(ld.areaServed.name, "Bavaria");
    assert.match(de.html, /<html lang="de">/);
    assert.match(de.html, /in Bayern/);
    assert.match(de.html, /Geprüfte Auftragnehmer/);
    assert.match(de.html, /Arbeit beschreiben/);
    assert.match(en.html, /href="\/#\/customer\/requests\/new"/, "the request form");
  });

  it("passes the CSP rules: no inline script, handler or style, and the server's CSP header", () => {
    const page = build(world(5)).get("/services/plc-programming/bavaria");
    assert.ok(page.headers["Content-Security-Policy"]);
    assert.deepEqual(
      [...page.html.matchAll(/<script\b[^>]*>/g)].map((m) => m[0]),
      ['<script type="application/ld+json">'],
    );
    assert.doesNotMatch(page.html, /\son\w+=|style=|javascript:/i);
    assert.match(page.html, /<main id="main"/);
    assert.match(page.html, /<h1>/);
    assert.match(page.html, /class="sp-skip"/);
  });

  it("lists in the sitemap only the pairs with enough suppliers", () => {
    const { get } = build(world(3));
    const map = get("/sitemap.xml");
    assert.match(map.headers["Content-Type"], /application\/xml/);
    assert.match(map.html, /<loc>https:\/\/craftcrew.example\/services\/plc-programming\/bavaria<\/loc>/);
    assert.match(map.html, /<loc>https:\/\/craftcrew.example\/services\/plc-programming\/bavaria\?lang=de<\/loc>/);
    assert.doesNotMatch(map.html, /saxony|welding/);
    assert.match(build(world(2)).get("/sitemap.xml").html, /<loc>https:\/\/craftcrew.example\/services<\/loc>/);
    assert.doesNotMatch(build(world(2)).get("/sitemap.xml").html, /bavaria/);
    const robots = get("/robots.txt").html;
    assert.match(robots, /Sitemap: https:\/\/craftcrew.example\/sitemap.xml/);
    assert.match(robots, /Disallow: \/api\//);
    assert.match(get("/services").html, /services\/plc-programming\/bavaria/);
  });

  it("escapes names and shows a case study only with the customer's permission and a finished project", () => {
    const db = world(3);
    db.suppliers[0].serviceCatalog[0].name = '<img src=x onerror="alert(1)">';
    const request = (over = {}) => ({
      id: "r1",
      customerId: "c1",
      status: "Contracted",
      sitePostcode: "93055",
      projectId: "p1",
      packages: [{ id: "k1", category: "PLC Programming", hours: 40, taskId: "t1" }],
      caseStudy: { allowed: true, summary: "Line 7 was automated in four weeks <b>fast</b>." },
      ...over,
    });
    const project = (status) => [{ id: "p1", phases: [{ tasks: [{ id: "t1", status }] }] }];
    db.requests = [request()];
    db.projects = project("In Progress");
    let html = build(db).get("/services/plc-programming/bavaria").html;
    assert.doesNotMatch(html, /<img src=x/);
    assert.match(html, /&lt;img src=x/);
    assert.doesNotMatch(html, /Line 7 was automated/, "not finished yet");
    db.projects = project("Completed");
    html = build(db).get("/services/plc-programming/bavaria").html;
    assert.match(html, /Line 7 was automated in four weeks &lt;b&gt;fast&lt;\/b&gt;\./);
    assert.match(html, /40 hours/);
    assert.doesNotMatch(html, /Company s1|c1/);
    db.requests = [request({ caseStudy: { allowed: false, summary: "" } })];
    assert.doesNotMatch(build(db).get("/services/plc-programming/bavaria").html, /Line 7/);
    db.requests = [request({ sitePostcode: "01067" })];
    assert.doesNotMatch(build(db).get("/services/plc-programming/bavaria").html, /Line 7/, "another region");
  });
});

describe("service pages on the server", () => {
  let app, admin;
  before(async () => {
    app = await startApp({ env: { PLATFORM_MODE: "brokered", APP_URL: "https://craftcrew.example" } });
    admin = await app.login("admin@test.local", "Admin-Password-2026!");
    for (const n of [1, 2, 3]) {
      const s = await vettedSupplier(app, admin, `sp${n}@test.local`, "Page Supplier " + n);
      await app.call("PUT", "/profile", { services: ["PLC Programming"], location: "Regensburg, Germany", hourlyRate: 90 }, s.token);
    }
    const { settings } = await app.call("GET", "/admin/settings", undefined, admin);
    await app.call("PUT", "/admin/settings", { ...settings, serviceCategories: [...new Set([...settings.serviceCategories, "PLC Programming"])] }, admin);
  });
  after(() => app?.stop());

  it("serves the page, the sitemap and robots.txt with the CSP header", async () => {
    const r = await fetch(app.base + "/services/plc-programming/bavaria");
    assert.equal(r.status, 200);
    assert.match(r.headers.get("content-type"), /text\/html/);
    assert.match(r.headers.get("content-security-policy"), /script-src 'self'/);
    assert.match(await r.text(), /PLC Programming in Bavaria/);
    assert.equal((await fetch(app.base + "/services/plc-programming/saxony")).status, 404);
    const map = await (await fetch(app.base + "/sitemap.xml")).text();
    assert.match(map, /services\/plc-programming\/bavaria/);
    assert.match(await (await fetch(app.base + "/robots.txt")).text(), /Sitemap: https:\/\/craftcrew.example\/sitemap.xml/);
    assert.equal((await fetch(app.base + "/servicepages.css")).status, 200);
  });

  it("lets the customer allow a case study of a contracted request only", async () => {
    await app.signup("customer", "sp.customer@test.local");
    const customer = await app.login("sp.customer@test.local", "Test-Password-2026");
    const sent = await app.call(
      "POST",
      "/requests",
      { title: "Line 7", description: "PLC programming of line 7.", sitePostcode: "93055", packages: [{ name: "PLC", category: "PLC Programming", hours: 20 }] },
      customer,
    );
    const id = sent.request.id;
    const early = await app.call("POST", `/requests/${id}/case-study`, { allow: true, summary: "A short anonymous summary of the project." }, customer);
    assert.equal(early.status, 409, "not contracted yet");
    assert.equal((await app.call("POST", `/requests/${id}/case-study`, { allow: true }, admin)).status, 404);
  });
});
