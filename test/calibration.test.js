// T243: estimate calibration. The supplier factor needs 3 confirmed parts, is limited to 0.8-1.3 and forgets
// parts older than 12 months; the hours factor needs 5 finished tasks; a supplier who always adds 10 % moves
// the estimate towards the confirmed price (and stays there, because the base is the uncorrected price list).
const { describe, it } = require("node:test");
const assert = require("node:assert/strict");
const calibration = require("../calibration");

const AT = Date.parse("2026-10-07T12:00:00Z");
const part = (base, confirmed, over = {}) => ({
  supplierId: "s1",
  status: "Confirmed",
  category: "Electrical Engineering",
  baseAmount: base,
  estimate: base,
  supplierAmount: confirmed,
  confirmedAt: "2026-09-01T10:00:00Z",
  ...over,
});
const dbWith = (parts, extra = {}) => ({ requests: [{ award: { estimate: true, parts } }], ...extra });

describe("supplier factor", () => {
  it("is 1 under 3 confirmed parts", () => {
    const rec = calibration.supplierRecord(dbWith([part(1000, 1100), part(1000, 1100)]), "s1", "Electrical Engineering", AT);
    assert.equal(rec.factor, 1);
    assert.equal(rec.active, false);
    assert.equal(rec.n, 2);
  });
  it("is the median of confirmed ÷ price list", () => {
    const rec = calibration.supplierRecord(dbWith([part(1000, 1100), part(1000, 1100), part(1000, 1500)]), "s1", "Electrical Engineering", AT);
    assert.equal(rec.factor, 1.1);
    assert.equal(rec.active, true);
  });
  it("is limited to 0.8-1.3", () => {
    const high = calibration.supplierRecord(dbWith([1, 2, 3].map(() => part(1000, 2000))), "s1", "Electrical Engineering", AT),
      low = calibration.supplierRecord(dbWith([1, 2, 3].map(() => part(1000, 300))), "s1", "Electrical Engineering", AT);
    assert.equal(high.factor, 1.3);
    assert.equal(high.raw, 2);
    assert.equal(low.factor, 0.8);
  });
  it("drops confirmations older than 12 months and other categories and suppliers", () => {
    const old = { confirmedAt: "2025-09-01T10:00:00Z" },
      db = dbWith([
        part(1000, 1100, old),
        part(1000, 1100, old),
        part(1000, 1100),
        part(1000, 1100, { supplierId: "s2" }),
        part(1000, 1100, { category: "Welding" }),
        part(1000, 1100, { status: "Declined" }),
        part(0, 1100, { baseAmount: undefined }),
      ]);
    assert.equal(calibration.supplierRecord(db, "s1", "Electrical Engineering", AT).n, 1);
    // a year later the same three parts count again, one month earlier they were still there
    const three = dbWith([1, 2, 3].map(() => part(1000, 1100, { confirmedAt: "2025-10-20T10:00:00Z" })));
    assert.equal(calibration.supplierRecord(three, "s1", "Electrical Engineering", AT).factor, 1.1);
    assert.equal(calibration.supplierRecord(three, "s1", "Electrical Engineering", AT + 30 * 86400000).n, 0);
  });
  it("tracks the share confirmed unchanged and flags a weak record", () => {
    const db = dbWith([part(1000, 1000), part(1000, 1250), part(1000, 1250)]),
      rec = calibration.supplierRecord(db, "s1", "Electrical Engineering", AT);
    assert.equal(rec.unchangedPercent, 33);
    assert.equal(calibration.weakRecord(rec), true);
    const good = calibration.supplierRecord(dbWith([1, 2, 3].map(() => part(1000, 1000))), "s1", "Electrical Engineering", AT);
    assert.equal(calibration.weakRecord(good), false);
  });
  it("lists the supplier's own factors", () => {
    const list = calibration.forSupplier(dbWith([1, 2, 3].map(() => part(1000, 1060))), "s1", AT);
    assert.deepEqual(list.map((x) => [x.category, x.percent]), [["Electrical Engineering", 6]]);
  });
});

describe("hours factor", () => {
  const world = (n, logged, planned = 10) => ({
    requests: [
      { packages: Array.from({ length: n }, (_, i) => ({ category: "Welding", hours: planned, taskId: "t" + i })) },
    ],
    projects: [{ phases: [{ tasks: Array.from({ length: n }, (_, i) => ({ id: "t" + i, status: "Completed" })) }] }],
    timeEntries: Array.from({ length: n }, (_, i) => ({ taskId: "t" + i, status: "Approved", hours: logged, workDate: "2026-09-10" })),
  });
  it("needs 5 finished tasks", () => {
    assert.equal(calibration.hoursFactor(world(4, 15), "Welding", AT).factor, 1);
    assert.equal(calibration.hoursFactor(world(5, 15), "Welding", AT).factor, 1.5);
  });
  it("only raises the hours, up to the limit", () => {
    assert.equal(calibration.hoursFactor(world(5, 5), "Welding", AT).factor, 1);
    assert.equal(calibration.hoursFactor(world(5, 50), "Welding", AT).factor, 2);
    assert.equal(calibration.hoursFactor(world(5, 15), "Painting", AT).factor, 1);
  });
  it("ignores unfinished tasks and old entries", () => {
    const w = world(5, 15);
    w.projects[0].phases[0].tasks[0].status = "In Progress";
    assert.equal(calibration.hoursFactor(w, "Welding", AT).n, 4);
    const old = world(5, 15);
    old.timeEntries.forEach((e) => (e.workDate = "2025-01-10"));
    assert.equal(calibration.hoursFactor(old, "Welding", AT).n, 0);
  });
});

describe("the estimate uses the factors", () => {
  const supplier = {
    id: "s1",
    company: "S1",
    live: true,
    services: ["Electrical Engineering"],
    location: "Regensburg",
    rating: 4.5,
    serviceCatalog: [{ name: "Wiring", category: "Electrical Engineering", unit: "hour", rate: 100 }],
  };
  const request = (rough = false) => ({
    customerId: "c1",
    sitePostcode: "93055",
    startDate: "2026-11-02",
    dueDate: "2026-11-30",
    packages: [{ id: "pkg0", category: "Electrical Engineering", hours: 10, rough }],
  });
  const engine = (db) => require("../estimate")({ getDb: () => db, scorecard: () => null });
  const base = () => ({ suppliers: [supplier], projects: [], invoices: [], bids: [], applications: [], requests: [], timeEntries: [] });

  it("moves the estimate of a supplier who always adds 10 % to the confirmed price, and keeps it there", () => {
    const db = base(),
      e = engine(db),
      first = e.build(request()).options[0].parts[0];
    assert.equal(first.supplierAmount, 1000);
    assert.equal(first.baseAmount, 1000);
    assert.equal(first.factor, 1);
    // three confirmed parts, each 10 % above the price list; the stored base is the uncorrected amount
    db.requests = [{ award: { estimate: true, parts: [1, 2, 3].map(() => part(first.baseAmount, 1100)) } }];
    db.requests[0].award.parts.forEach((p) => (p.confirmedAt = new Date().toISOString()));
    const second = e.build(request()).options[0].parts[0];
    assert.equal(second.factor, 1.1);
    assert.equal(second.supplierAmount, 1100);
    assert.equal(second.baseAmount, 1000);
    assert.equal(second.lines.labour, 1100);
    // the next parts store the uncorrected 1000, so confirming 1100 keeps the factor at 1.1
    db.requests.push({ award: { estimate: true, parts: [part(second.baseAmount, 1100, { confirmedAt: new Date().toISOString() })] } });
    assert.equal(e.build(request()).options[0].parts[0].factor, 1.1);
  });

  it("raises rough hours with the category's hours factor and lowers the confidence of a weak record", () => {
    const db = base();
    db.requests = [
      { packages: Array.from({ length: 5 }, (_, i) => ({ category: "Electrical Engineering", hours: 10, taskId: "t" + i })) },
    ];
    db.projects = [{ phases: [{ tasks: Array.from({ length: 5 }, (_, i) => ({ id: "t" + i, status: "Completed" })) }] }];
    const day = new Date().toISOString().slice(0, 10);
    db.timeEntries = Array.from({ length: 5 }, (_, i) => ({ taskId: "t" + i, status: "Approved", hours: 15, workDate: day }));
    const e = engine(db),
      rough = e.build(request(true)).options[0].parts[0],
      exact = e.build(request(false)).options[0].parts[0];
    assert.equal(rough.hours, 15);
    assert.equal(rough.supplierAmount, 1500);
    assert.equal(exact.hours, 10);
    // a supplier whose parts are mostly changed is less sure
    db.requests.push({
      award: {
        estimate: true,
        parts: [1, 2, 3].map(() => part(1000, 1250, { confirmedAt: new Date().toISOString() })),
      },
    });
    assert.equal(e.build(request(false)).options[0].parts[0].confidence, "medium");
  });
});

describe("automatic confirmations (T244)", () => {
  it("say nothing about the supplier's prices and do not count for the factor", () => {
    const db = dbWith([1, 2, 3].map(() => part(1000, 1000, { auto: true })));
    assert.equal(calibration.supplierRecord(db, "s1", "Electrical Engineering", AT).n, 0);
  });
});
