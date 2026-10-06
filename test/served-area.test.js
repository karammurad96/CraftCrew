// T255: the served area. Instant estimates only in the admin's served regions (postcode prefixes) and categories;
// a request outside reaches the operator with a message for the customer and is counted on the waiting list by
// region and category. Empty settings change nothing.
const { describe, it, before, after } = require("node:test");
const assert = require("node:assert/strict");
const { startApp, vettedSupplier } = require("./helpers");
const served = require("../servedarea");

describe("served area (rules)", () => {
  it("cleans the prefixes and categories", () => {
    assert.deepEqual(served.cleanRegions("93, 94 84\n93").regions, ["93", "94", "84"]);
    assert.deepEqual(served.cleanRegions([]).regions, []);
    assert.ok(served.cleanRegions("93, Regensburg").error);
    assert.ok(served.cleanRegions("123456").error);
    assert.ok(served.cleanRegions(Array.from({ length: 101 }, (_, i) => String(i))).error);
    assert.deepEqual(served.cleanCategories(["plc programming"], ["PLC Programming"]).categories, ["PLC Programming"]);
    assert.ok(served.cleanCategories(["Baking"], ["PLC Programming"]).error);
  });

  it("checks a request: empty settings mean everywhere", () => {
    const r = { sitePostcode: "10115", packages: [{ category: "Robotics" }, { category: "PLC Programming" }] };
    assert.equal(served.check({}, r), null);
    assert.equal(served.check({ servedRegions: [], servedCategories: [] }, r), null);
    assert.equal(served.check({ servedRegions: ["10"] }, r), null);
    assert.deepEqual(served.check({ servedRegions: ["93", "94"] }, r), {
      region: "10",
      categories: ["Robotics", "PLC Programming"],
      reasons: ["region"],
    });
    assert.deepEqual(served.check({ servedCategories: ["PLC Programming"] }, r).reasons, ["category"]);
    assert.equal(served.check({ servedRegions: ["93"] }, { packages: [{ category: "Robotics" }] }).region, "", "no postcode");
    assert.ok(served.inside({ servedRegions: ["93"] }, { postcode: "93055" }), "for the outreach desk");
  });

  it("counts the waiting list by region and category", () => {
    const list = served.waitingList([
      { outsideArea: { region: "10", categories: ["Robotics"] }, createdAt: "2026-10-01" },
      { outsideArea: { region: "10", categories: ["Robotics", "PLC Programming"] }, createdAt: "2026-10-03" },
      { outsideArea: { region: "80", categories: ["Robotics"] }, createdAt: "2026-10-02" },
      { createdAt: "2026-10-04" },
    ]);
    assert.deepEqual(
      list.map((x) => [x.region, x.category, x.count]),
      [
        ["10", "Robotics", 2],
        ["10", "PLC Programming", 1],
        ["80", "Robotics", 1],
      ],
    );
    assert.equal(list[0].last, "2026-10-03");
  });
});

describe("served area (API)", () => {
  let app, admin, customer, settings;
  const send = (postcode, category = "PLC Programming") =>
    app.call(
      "POST",
      "/requests",
      {
        title: "Line 7 automation",
        description: "PLC programming of line 7 in the new hall.",
        sitePostcode: postcode,
        packages: [{ name: "PLC program", category, hours: 40 }],
      },
      customer,
    );
  const setArea = (servedRegions, servedCategories) =>
    app.call("PUT", "/admin/settings", { ...settings, servedRegions, servedCategories }, admin);
  before(async () => {
    app = await startApp({ env: { PLATFORM_MODE: "brokered", INSTANT_ESTIMATES: "on" } });
    admin = await app.login("admin@test.local", "Admin-Password-2026!");
    const crew = await vettedSupplier(app, admin, "area.crew@test.local", "Area Crew GmbH");
    await app.call("PUT", "/profile", { hourlyRate: 90, services: ["PLC Programming", "Robotics"] }, crew.token);
    await app.signup("customer", "area.customer@test.local");
    customer = await app.login("area.customer@test.local", "Test-Password-2026");
    settings = (await app.call("GET", "/admin/settings", undefined, admin)).settings;
  });
  after(() => app?.stop());

  it("changes nothing while the setting is empty", async () => {
    assert.deepEqual(settings.servedRegions || [], []);
    const r = await send("10115");
    assert.equal(r.status, 201, r.error);
    assert.equal(r.request.status, "Options ready");
    assert.equal(r.request.outsideArea, undefined);
    const m = (await app.call("GET", "/admin/metrics", undefined, admin)).metrics;
    assert.deepEqual(m.servedArea.waitingList, []);
  });

  it("checks the settings", async () => {
    assert.equal((await setArea("93, Bavaria", [])).status, 400);
    assert.equal((await setArea("93", ["Baking"])).status, 400);
    const ok = await setArea("93, 94, 84", ["PLC Programming"]);
    assert.equal(ok.status, 200, ok.error);
    assert.deepEqual(ok.settings.servedRegions, ["93", "94", "84"]);
    assert.deepEqual(ok.settings.servedCategories, ["PLC Programming"]);
    // A save without the fields keeps them
    const kept = await app.call("PUT", "/admin/settings", settings, admin);
    assert.deepEqual(kept.settings.servedRegions, ["93", "94", "84"]);
  });

  it("prices a request inside the area instantly, and sends one outside to the operator with the message", async () => {
    const inside = await send("93055");
    assert.equal(inside.request.status, "Options ready");
    assert.ok(inside.request.options.length >= 1);

    const outside = await send("10115");
    assert.equal(outside.status, 201, outside.error);
    assert.equal(outside.request.status, "New", "the operator takes it");
    assert.deepEqual(outside.request.options, []);
    assert.equal(outside.request.outsideArea, true, "the customer sees the message, nothing more");
    const forAdmin = (await app.call("GET", `/requests/${outside.request.id}`, undefined, admin)).request;
    assert.deepEqual(forAdmin.outsideArea, { region: "10", categories: ["PLC Programming"], reasons: ["region"] });

    const otherCategory = await send("93055", "Robotics");
    assert.equal(otherCategory.request.status, "New", "a category outside the served ones");
  });

  it("counts the waiting list by region and category on the dashboard", async () => {
    await send("10117");
    const m = (await app.call("GET", "/admin/metrics", undefined, admin)).metrics;
    assert.deepEqual(m.servedArea.regions, ["93", "94", "84"]);
    assert.deepEqual(
      m.servedArea.waitingList.map((x) => [x.region, x.category, x.count]),
      [
        ["10", "PLC Programming", 2],
        ["93", "Robotics", 1],
      ],
    );
  });

  it("goes back to everywhere when emptied", async () => {
    assert.equal((await setArea("", [])).status, 200);
    assert.equal((await send("10115", "Robotics")).request.status, "Options ready");
  });
});

describe("served area (pages)", () => {
  const { readFileSync } = require("node:fs"),
    path = require("node:path"),
    vm = require("node:vm");
  const read = (f) => readFileSync(path.join(__dirname, "..", "public", f), "utf8");
  const REQUEST = {
    id: "req_1",
    title: "Line 7",
    description: "PLC programming of line 7.",
    status: "New",
    category: "PLC Programming",
    sitePostcode: "10115",
    packages: [{ name: "PLC program", category: "PLC Programming", hours: 40 }],
    history: [],
    options: [],
  };
  function page(lang, role, request) {
    const ctx = {
      console: { warn() {}, error() {}, log() {} },
      localStorage: { getItem: (k) => (k === "cc_lang" ? lang : null) },
      navigator: { language: "en-GB" },
      document: { addEventListener() {}, getElementById: () => null },
      location: { hash: "" },
      Intl,
      URLSearchParams,
      app: { innerHTML: "" },
      state: { user: { role } },
      route: async () => {},
      navigate() {},
      dashboardShell: (r, active, html) => html,
      statusHtml: (s) => s,
      ccStatusKey: () => "common.status.new",
      esc: (s) => String(s ?? "").replace(/[&<>'"]/g, (c) => ({ "&": "&amp;", "<": "&lt;", ">": "&gt;", "'": "&#39;", '"': "&quot;" })[c]),
      api: async () => ({ request }),
    };
    ctx.window = ctx;
    vm.createContext(ctx);
    for (const f of ["core/languages.js", "locales/en.js", "locales/de.js", "core/t.js", "core/actions.js", "core/router.js", "areas/requests.js"])
      vm.runInContext(read(f), ctx, { filename: f });
    return ctx;
  }
  for (const lang of ["en", "de"])
    it(`tells the customer and the operator in ${lang === "en" ? "English" : "German"}`, async () => {
      const de = lang === "de";
      let ctx = page(lang, "customer", { ...REQUEST, outsideArea: true });
      await vm.runInContext("rqCustomerDetail({ id: 'req_1' })", ctx);
      assert.ok(
        ctx.app.innerHTML.includes(
          de
            ? "Wir bauen unser Netzwerk in Ihrer Region gerade auf. Wir melden uns innerhalb von zwei Werktagen bei Ihnen."
            : "We are building our network in your region. We will contact you within two working days.",
        ),
      );
      ctx = page(lang, "customer", REQUEST);
      await vm.runInContext("rqCustomerDetail({ id: 'req_1' })", ctx);
      assert.ok(!ctx.app.innerHTML.includes(de ? "Netzwerk in Ihrer Region" : "network in your region"), "inside: no message");
      ctx = page(lang, "admin", { ...REQUEST, outsideArea: { region: "10", categories: ["PLC Programming"], reasons: ["region"] } });
      await vm.runInContext("rqAdminDetail({ id: 'req_1' })", ctx);
      assert.ok(
        ctx.app.innerHTML.includes(
          de ? "Außerhalb des Einsatzgebiets (PLZ-Gebiet 10, PLC Programming)" : "Outside the served area (postcode area 10, PLC Programming)",
        ),
      );
    });
});
