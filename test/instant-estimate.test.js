// T231: a new request is priced at once from the suppliers' own price lists. The customer sees estimate options,
// one of them split across two suppliers, without any supplier's identity; a request nobody can price stays with
// the operator; the admin setting turns it off.
const { describe, it, before, after } = require("node:test");
const assert = require("node:assert/strict");
const { startApp, vettedSupplier } = require("./helpers");

describe("instant estimates", () => {
  let app, admin, customer, full, plc;
  const send = (packages, extra = {}) =>
    app.call(
      "POST",
      "/requests",
      {
        title: "Line 7 automation",
        description: "PLC programming and commissioning of line 7.",
        sitePostcode: "93055",
        packages,
        ...extra,
      },
      customer,
    );
  before(async () => {
    app = await startApp({ env: { PLATFORM_MODE: "brokered", INSTANT_ESTIMATES: "on" } });
    admin = await app.login("admin@test.local", "Admin-Password-2026!");
    full = await vettedSupplier(app, admin, "est.full@test.local", "Full Service GmbH");
    plc = await vettedSupplier(app, admin, "est.plc@test.local", "PLC Specialists GmbH");
    // Full Service: 100 €/h for everything; PLC Specialists: 70 €/h for PLC programming from its catalogue
    await app.call(
      "PUT",
      "/profile",
      { hourlyRate: 100, services: ["PLC Programming", "Commissioning"] },
      full.token,
    );
    await app.call(
      "PUT",
      "/profile",
      {
        services: ["PLC Programming"],
        serviceCatalog: [{ name: "S7 programming", category: "PLC Programming", unit: "hour", rate: 70 }],
      },
      plc.token,
    );
    await app.signup("customer", "est.customer@test.local");
    customer = await app.login("est.customer@test.local", "Test-Password-2026");
  });
  after(() => app?.stop());

  it("prices a new request at once, with a split option, and shows no supplier", async () => {
    const r = await send([
      { name: "PLC program", category: "PLC Programming", hours: 80 },
      { name: "Commissioning", category: "Commissioning", hours: 80 },
    ]);
    assert.equal(r.status, 201, r.error);
    const req = r.request;
    assert.equal(req.status, "Options ready", "no operator needed");
    assert.ok(req.options.length >= 2);
    assert.ok(req.options.every((o) => o.estimate));
    const split = req.options.find((o) => o.split),
      single = req.options.find((o) => !o.split);
    assert.equal(
      split.price,
      80 * 70 + 80 * 100,
      "split: PLC from the specialist, commissioning from Full Service",
    );
    assert.equal(single.price, 160 * 100);
    assert.deepEqual(
      split.parts
        .map((p) => p.packages)
        .flat()
        .sort(),
      ["Commissioning", "PLC program"],
    );
    assert.ok(split.parts.every((p) => p.profile && p.price && p.hours === 80));
    const seen = JSON.stringify(req);
    for (const secret of [
      full.supplierId,
      plc.supplierId,
      "Full Service",
      "PLC Specialists",
      "supplierId",
      "supplierAmount",
      "estimateGap",
    ])
      assert.ok(!seen.includes(secret), `the customer does not see ${secret}`);
    const op = (await app.call("GET", `/requests/${req.id}`, undefined, admin)).request;
    assert.deepEqual(
      op.options
        .find((o) => o.split)
        .parts.map((p) => p.supplierId)
        .sort(),
      [full.supplierId, plc.supplierId].sort(),
    );
    assert.equal(op.history.at(-1).note, "Instant estimate");
  });

  it("leaves a request nobody can price with the operator, naming the gap", async () => {
    const r = await send([
      { name: "PLC program", category: "PLC Programming", hours: 40 },
      { name: "Robot cell", category: "Robotics", hours: 40 },
    ]);
    assert.equal(r.request.status, "New");
    assert.equal(r.request.options.length, 0);
    const op = (await app.call("GET", `/requests/${r.request.id}`, undefined, admin)).request;
    assert.deepEqual(op.estimateGap, ["Robot cell"]);
  });

  it("is switched off by the admin setting", async () => {
    const { settings } = await app.call("GET", "/admin/settings", undefined, admin);
    await app.call("PUT", "/admin/settings", { ...settings, instantEstimates: false }, admin);
    const r = await send([{ name: "PLC program", category: "PLC Programming", hours: 40 }]);
    assert.equal(r.request.status, "New");
    await app.call("PUT", "/admin/settings", { ...settings, instantEstimates: true }, admin);
    assert.equal(
      (await send([{ name: "PLC program", category: "PLC Programming", hours: 40 }])).request.status,
      "Options ready",
    );
  });
});
