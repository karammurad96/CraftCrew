// T231: instant estimates with fixed data. Rates come from the service catalogue (hour, or day ÷ 8), else the
// profile; busy or fully booked suppliers are left out; a split is offered when nobody covers everything or when
// it is clearly cheaper or faster; nothing is offered when a package cannot be priced.
const { describe, it } = require("node:test");
const assert = require("node:assert/strict");

const supplier = (id, services, extra = {}) => ({
  id,
  company: "Company " + id,
  live: true,
  services,
  location: "Regensburg",
  rating: 4.5,
  reviews: [],
  ...extra,
});
const engine = (suppliers, projects = []) =>
  require("../estimate")({
    getDb: () => ({ suppliers, projects, invoices: [], bids: [], applications: [] }),
    scorecard: () => null,
  });
const request = (packages) => ({
  customerId: "c1",
  sitePostcode: "93055",
  startDate: "2026-11-02",
  dueDate: "2026-11-30",
  packages: packages.map(([category, hours], i) => ({ id: "pkg" + i, category, hours })),
});

describe("instant estimate", () => {
  it("takes the rate from the catalogue (hour or day), else from the profile, else leaves the supplier out", () => {
    const e = engine([]);
    const cat = (unit, rate, extra = {}) => ({
      serviceCatalog: [{ name: "Wiring", category: "Electrical Engineering", unit, rate, ...extra }],
    });
    assert.deepEqual(e.rateFor(cat("hour", 90), "Electrical Engineering"), { rate: 90, source: "catalog" });
    assert.deepEqual(e.rateFor(cat("day", 720), "Electrical Engineering"), { rate: 90, source: "catalog" });
    assert.deepEqual(
      e.rateFor({ ...cat("hour", 90, { status: "Paused" }), hourlyRate: 100 }, "Electrical Engineering"),
      { rate: 100, source: "profile" },
    );
    assert.equal(e.rateFor({}, "Electrical Engineering"), null);
  });

  it("leaves out suppliers that are not live, busy, fully booked or without a price", () => {
    const booked = {
      id: "p",
      customerId: "c2",
      phases: [
        {
          tasks: [1, 2, 3].map((n) => ({
            id: "t" + n,
            assignedSupplierId: "full",
            status: "In Progress",
            startDate: "2026-11-01",
            dueDate: "2026-11-20",
          })),
        },
      ],
    };
    const e = engine(
      [
        supplier("ok", ["Commissioning"], { hourlyRate: 100 }),
        supplier("off", ["Commissioning"], { hourlyRate: 80, live: false }),
        supplier("busy", ["Commissioning"], { hourlyRate: 80, availability: "Busy" }),
        supplier("full", ["Commissioning"], { hourlyRate: 80 }),
        supplier("noprice", ["Commissioning"]),
      ],
      [booked],
    );
    assert.deepEqual(
      e.candidates(request([]), { category: "Commissioning", hours: 40 }).map((c) => c.supplierId),
      ["ok"],
    );
  });

  it("keeps one supplier when a split does not pay off", () => {
    const e = engine([
      supplier("all", ["PLC Programming", "Commissioning"], { hourlyRate: 100 }),
      supplier("plc", ["PLC Programming"], { hourlyRate: 97 }),
    ]);
    const { options } = e.build(
      request([
        ["PLC Programming", 80],
        ["Commissioning", 8],
      ]),
    );
    // Splitting would save under 3 % and finish one day (8 %) earlier
    assert.ok(
      options.every((o) => !o.split),
      "not worth a second supplier",
    );
    assert.equal(options[0].supplierAmount, 8800);
    assert.equal(options[0].days, 11 + 2);
  });

  it("splits when it is clearly cheaper or faster", () => {
    const e = engine([
      supplier("all", ["PLC Programming", "Commissioning"], { hourlyRate: 120 }),
      supplier("plc", ["PLC Programming"], { hourlyRate: 80 }),
      supplier("com", ["Commissioning"], { hourlyRate: 85 }),
    ]);
    const { options } = e.build(
      request([
        ["PLC Programming", 80],
        ["Commissioning", 80],
      ]),
    );
    // The cheapest split is also the fastest, so it appears once
    const cheapest = options.find((o) => o.label === "cheapest"),
      fastest = [...options].sort((a, b) => a.days - b.days)[0];
    assert.equal(cheapest.split, true);
    assert.equal(cheapest.supplierAmount, 80 * 80 + 80 * 85);
    assert.deepEqual(cheapest.parts.map((p) => p.supplierId).sort(), ["com", "plc"]);
    assert.equal(fastest.split, true, "two parallel parts of 10 days beat 20 days in a row");
    assert.equal(fastest.days, 10 + 2);
    assert.ok(
      options.some((o) => !o.split),
      "the single supplier stays an option",
    );
  });

  it("splits when nobody covers everything, and gives up when a package has no supplier", () => {
    const e = engine([
      supplier("plc", ["PLC Programming"], { hourlyRate: 90 }),
      supplier("com", ["Commissioning"], { hourlyRate: 95 }),
    ]);
    const { options } = e.build(
      request([
        ["PLC Programming", 40],
        ["Commissioning", 16],
      ]),
    );
    assert.ok(options.length >= 1 && options.every((o) => o.split && o.parts.length === 2));
    const none = e.build(
      request([
        ["PLC Programming", 40],
        ["Robotics", 40],
      ]),
    );
    assert.deepEqual(none, { options: [], missing: ["pkg1"], skipped: [] });
  });
});
