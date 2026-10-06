// T241: estimate guardrails. The supplier's minimum order, travel (flat fee and km both ways, within a radius),
// night/weekend/shift surcharges and a materials share; the category's price band from the benchmarks skips far-off
// rates and marks unusual ones; every option has a confidence level.
const { describe, it, before, after } = require("node:test");
const assert = require("node:assert/strict");
const { startApp, vettedSupplier } = require("./helpers");

const supplier = (id, extra = {}) => ({
  id,
  company: "Company " + id,
  live: true,
  services: ["Electrical Engineering"],
  serviceCatalog: [{ name: "Wiring", category: "Electrical Engineering", unit: "hour", rate: 100 }],
  location: "Regensburg",
  rating: 4.5,
  ...extra,
});
const engine = (suppliers, bench = null) =>
  require("../estimate")({
    getDb: () => ({ suppliers, projects: [], invoices: [], bids: [] }),
    scorecard: () => null,
    benchmark: () => bench,
  });
const request = (hours = 10, extra = {}) => ({
  sitePostcode: "93055",
  startDate: "2026-11-02",
  dueDate: "2026-11-30",
  packages: [{ id: "p1", name: "Wiring", category: "Electrical Engineering", hours }],
  ...extra,
});
const onlyPart = (e, r) => e.build(r).options[0].parts[0];

describe("estimate guardrails (engine)", () => {
  it("lifts a small order to the supplier's minimum", () => {
    const p = onlyPart(engine([supplier("s1", { pricing: { minimumOrder: 5000 } })]), request(10));
    assert.equal(p.lines.labour, 1000);
    assert.equal(p.lines.minimum, 4000);
    assert.equal(p.supplierAmount, 5000);
  });

  it("adds travel per trip, and leaves out a supplier beyond its radius", () => {
    const munich = (pricing) => supplier("s1", { location: "Munich, Germany", pricing });
    const e = engine([munich({ travel: { flat: 50, perKm: 0.5 } })]),
      km = e.candidates(request(80), request(80).packages[0])[0].km,
      p = onlyPart(e, request(80));
    assert.ok(km > 80 && km < 140, `Munich to Regensburg (${km} km)`);
    // 80 h: 10 working days plus 2 to start, so 3 weeks and 3 trips
    assert.equal(p.lines.travel, Math.round(3 * (50 + 0.5 * km * 2) * 100) / 100);
    assert.equal(onlyPart(e, request(80, { trips: 1 })).lines.travel, Math.round((50 + km) * 100) / 100, "trips given");
    assert.equal(engine([munich({ travel: { radiusKm: 50 } })]).build(request()).options.length, 0, "beyond the radius");
  });

  it("adds the surcharges of the shifts asked for, and the materials share", () => {
    const e = engine([supplier("s1", { pricing: { surcharges: { weekend: 25, night: 50 }, materials: { "Electrical Engineering": 10 } } })]);
    const p = onlyPart(e, request(10, { shifts: ["weekend"] }));
    assert.equal(p.lines.surcharge, 250);
    assert.equal(p.lines.materials, 125);
    assert.equal(p.supplierAmount, 1375);
    assert.equal(onlyPart(e, request(10)).lines.surcharge, 0, "no shift asked for");
  });

  it("skips rates far outside the price band, marks unusual ones, and sets the confidence", () => {
    const band = { available: true, p25: 80, p75: 120 };
    const far = supplier("far", { serviceCatalog: [{ name: "Wiring", category: "Electrical Engineering", unit: "hour", rate: 300 }] }),
      low = supplier("low", { serviceCatalog: [{ name: "Wiring", category: "Electrical Engineering", unit: "hour", rate: 60 }] });
    const result = engine([far, low], band).build(request());
    assert.deepEqual(result.skipped.map((x) => x.supplierId), ["far"]);
    assert.equal(result.options.length, 1);
    assert.equal(result.options[0].confidence, "medium", "60 is under the 25th percentile");
    assert.equal(engine([supplier("ok")], band).build(request()).options[0].confidence, "high");
    assert.equal(engine([supplier("ok")], band).build({ ...request(), packages: [{ ...request().packages[0], rough: true }] }).options[0].confidence, "low", "rough hours");
    const profileOnly = supplier("pr", { serviceCatalog: [], hourlyRate: 100 });
    assert.equal(engine([profileOnly], band).build(request()).options[0].confidence, "low", "a rate from the profile only");
  });
});

describe("estimate guardrails (API)", () => {
  let app, admin, customer, crew;
  before(async () => {
    app = await startApp({ env: { PLATFORM_MODE: "brokered", INSTANT_ESTIMATES: "on" } });
    admin = await app.login("admin@test.local", "Admin-Password-2026!");
    crew = await vettedSupplier(app, admin, "guard.crew@test.local", "Guard Crew GmbH");
    await app.signup("customer", "guard.customer@test.local");
    customer = await app.login("guard.customer@test.local", "Test-Password-2026");
  });
  after(async () => app?.stop());

  it("checks the pricing rules and the request's shifts and trips", async () => {
    assert.equal((await app.call("PUT", "/profile", { pricing: { minimumOrder: -1 } }, crew.token)).status, 400);
    assert.equal((await app.call("PUT", "/profile", { pricing: { surcharges: { night: 500 } } }, crew.token)).status, 400);
    const ok = await app.call(
      "PUT",
      "/profile",
      {
        hourlyRate: 100,
        services: ["Commissioning"],
        serviceCatalog: [{ name: "Commissioning", category: "Commissioning", unit: "hour", rate: 100 }],
        pricing: { minimumOrder: 2000, surcharges: { weekend: 20 }, materials: { Commissioning: 5 } },
      },
      crew.token,
    );
    assert.equal(ok.status, 200, ok.error);
    const body = (extra) => ({ title: "Weekend start-up", description: "Commissioning of a cell over a weekend.", sitePostcode: "93055", packages: [{ name: "Start-up", category: "Commissioning", hours: 10 }], ...extra });
    assert.equal((await app.call("POST", "/requests", body({ shifts: ["holiday"] }), customer)).status, 400);
    assert.equal((await app.call("POST", "/requests", body({ trips: 0 }), customer)).status, 400);
    const { request } = await app.call("POST", "/requests", body({ shifts: ["weekend"] }), customer);
    const opt = request.options[0];
    assert.ok(opt.confidence, "the customer sees the confidence");
    assert.equal(opt.parts[0].lines.minimum > 0, true, "10 h at 100 plus 20 % and 5 % stays under the minimum of 2,000");
    assert.equal(opt.price, 2000);
  });
});
