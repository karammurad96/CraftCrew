// T69: hourly-rate benchmarks per service: median and 25th–75th percentile, hidden below 5 data points,
// never listing individual prices.
const { describe, it, before, after } = require("node:test");
const assert = require("node:assert/strict");
const { percentile, stats } = require("../benchmarks");
const { startApp, vettedSupplier, projectWithTasks } = require("./helpers");

describe("benchmark statistics", () => {
  it("computes median and quartiles with interpolation", () => {
    assert.equal(percentile([100, 120, 140, 160, 200], 0.5), 140);
    assert.equal(percentile([100, 120, 140, 160, 200], 0.25), 120);
    assert.equal(percentile([100, 120, 140, 160, 200], 0.75), 160);
    assert.equal(percentile([100, 110, 130, 150, 160, 190], 0.5), 140, "even count: mean of the middle two");
    assert.equal(percentile([100, 110, 130, 150, 160, 190], 0.25), 115);
    assert.deepEqual(stats([160, 100, 140, 120, 200]), {
      count: 5,
      available: true,
      median: 140,
      p25: 120,
      p75: 160,
    });
  });
  it("hides the benchmark below 5 data points", () => {
    assert.deepEqual(stats([100, 120, 140, 160]), { count: 4, available: false });
    assert.deepEqual(stats([100, 0, -5, NaN, 120]), { count: 2, available: false }, "ignores invalid rates");
  });
});

describe("benchmark API", () => {
  let app, admin, customer, firstSupplier;
  const rates = [120, 135, 148, 160, 175];
  const get = (service) =>
    app.call("GET", "/benchmarks?service=" + encodeURIComponent(service), undefined, customer);
  before(async () => {
    app = await startApp();
    admin = await app.login("admin@test.local", "Admin-Password-2026!");
    customer = (await app.signup("customer", "buyer@test.local")).token;
    for (const [i, rate] of rates.slice(0, 4).entries()) {
      const s = await vettedSupplier(app, admin, `s${i}@test.local`, `Supplier ${i} GmbH`);
      firstSupplier ||= s;
      await app.call("PUT", "/profile", { services: ["Weld Inspection"], hourlyRate: rate }, s.token);
    }
  });
  after(() => app.stop());

  it("stays hidden with 4 rates and appears with the fifth", async () => {
    const before = await get("weld inspection");
    assert.equal(before.status, 200);
    assert.deepEqual(before.benchmark, { service: "Weld Inspection", count: 4, available: false });
    const s = await vettedSupplier(app, admin, "s4@test.local", "Supplier 4 GmbH");
    await app.call("PUT", "/profile", { services: ["Weld Inspection"], hourlyRate: rates[4] }, s.token);
    const r = await get("Weld inspection");
    assert.deepEqual(r.benchmark, {
      service: "Weld Inspection",
      count: 5,
      available: true,
      median: 148,
      p25: 135,
      p75: 160,
    });
    const all = await app.call("GET", "/benchmarks", undefined, customer);
    const listed = all.benchmarks.find((b) => b.service === "Weld Inspection");
    assert.ok(listed);
    // Only aggregates: none of the individual rates outside the reported figures appear.
    for (const rate of [120, 175])
      assert.ok(!JSON.stringify(all).includes(String(rate)), `rate ${rate} leaked`);
  });

  it("needs a signed-in user and checks offer hourly rates", async () => {
    assert.equal((await app.call("GET", "/benchmarks?service=x")).status, 401);
    const { project, phase } = await projectWithTasks(app, customer);
    const bid = (
      await app.call(
        "POST",
        "/bids",
        {
          projectId: project.id,
          phaseId: phase.id,
          taskId: phase.tasks[0].id,
          title: "Weld check",
          category: "Weld Inspection",
          dueDate: "2030-01-01",
        },
        customer,
      )
    ).bid;
    const s = firstSupplier;
    const offer = (b) =>
      app.call("POST", `/bids/${bid.id}/offers`, { amount: 5000, deliveryDays: 5, ...b }, s.token);
    assert.equal((await offer({ hourlyRate: "cheap" })).status, 400);
    assert.equal((await offer({ hourlyRate: -1 })).status, 400);
    const ok = await offer({ hourlyRate: 150 });
    assert.equal(ok.status, 201, ok.error);
    assert.equal(ok.offer.hourlyRate, 150);
  });
});
