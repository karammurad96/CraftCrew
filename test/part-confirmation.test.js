// T232, T233: after the customer chooses an estimate, each supplier confirms its part, names a lower price, or a
// higher one that waits for the customer; a decline, a rejected price or no answer brings in the next supplier;
// with every part confirmed each supplier gets its tasks and a contract, and both sides are named.
const { describe, it, before, after } = require("node:test");
const assert = require("node:assert/strict");
const { mkdtempSync, rmSync } = require("node:fs");
const os = require("node:os");
const path = require("node:path");
const { startApp, vettedSupplier, editDb } = require("./helpers");

const ENV = { PLATFORM_MODE: "brokered", INSTANT_ESTIMATES: "on" };

describe("supplier confirmation per part", () => {
  let app, dataDir, admin, customer, s;
  const hash = async () => (await app.call("GET", "/clause", undefined, customer)).clause.hash;
  const login = async () => {
    admin = await app.login("admin@test.local", "Admin-Password-2026!");
    customer = await app.login("part.customer@test.local", "Test-Password-2026");
    for (const k of Object.keys(s))
      s[k].token = await app.login(`part.${k}@test.local`, "Test-Password-2026");
  };
  // A request split into PLC (specialist) and commissioning (full service), chosen by the customer
  const chosenSplit = async (title) => {
    const { request } = await app.call(
      "POST",
      "/requests",
      {
        title,
        description: "PLC programming and commissioning of a new line.",
        sitePostcode: "93055",
        packages: [
          { name: "PLC program", category: "PLC Programming", hours: 80 },
          { name: "Commissioning", category: "Commissioning", hours: 80 },
        ],
      },
      customer,
    );
    const split = request.options.find((o) => o.split);
    assert.ok(split, "a split option");
    const r = await app.call(
      "POST",
      `/requests/${request.id}/choose`,
      { optionId: split.id, acceptClause: true, clauseHash: await hash() },
      customer,
    );
    assert.equal(r.status, 200, r.error);
    return r.request;
  };
  const answer = async (who, req, body) =>
    app.call(
      "POST",
      `/brokered-orders/${req.id}/${body ? "accept" : "decline"}`,
      body && { acceptClause: true, clauseHash: await hash(), ...body },
      s[who].token,
    );
  const seen = async (req) => (await app.call("GET", `/requests/${req.id}`, undefined, customer)).request;
  const part = (r, name) => r.award.parts.find((p) => p.packages.includes(name));

  before(async () => {
    dataDir = mkdtempSync(path.join(os.tmpdir(), "craftcrew-test-"));
    app = await startApp({ dataDir, env: ENV });
    admin = await app.login("admin@test.local", "Admin-Password-2026!");
    s = {};
    for (const [k, company, profile] of [
      ["full", "Full Service GmbH", { hourlyRate: 100, services: ["PLC Programming", "Commissioning"] }],
      ["plc", "PLC Specialists GmbH", { hourlyRate: 70, services: ["PLC Programming"] }],
      ["com", "Commissioning Crew GmbH", { hourlyRate: 110, services: ["Commissioning"] }],
    ]) {
      s[k] = await vettedSupplier(app, admin, `part.${k}@test.local`, company);
      await app.call("PUT", "/profile", profile, s[k].token);
    }
    await app.signup("customer", "part.customer@test.local", { company: "Part Customer AG" });
    customer = await app.login("part.customer@test.local", "Test-Password-2026");
  });
  after(async () => {
    await app?.stop();
    rmSync(dataDir, { recursive: true, force: true });
  });

  it("asks each supplier for its part, with its own price and no customer name", async () => {
    const req = await chosenSplit("Line 8 automation");
    assert.equal(req.status, "Chosen");
    assert.deepEqual(
      req.award.parts.map((p) => p.status),
      ["Waiting for supplier", "Waiting for supplier"],
    );
    assert.ok(!JSON.stringify(req).includes("PLC Specialists"));
    const { orders } = await app.call("GET", "/brokered-orders", undefined, s.plc.token);
    const o = orders.find((x) => x.requestId === req.id);
    assert.equal(o.amount, 5600);
    assert.equal(o.estimate, true);
    assert.deepEqual(
      o.packages.map((x) => x.name),
      ["PLC program"],
    );
    assert.ok(!JSON.stringify(o).includes("Part Customer"));
    assert.equal((await app.call("GET", "/brokered-orders", undefined, s.com.token)).orders.length, 0);
  });

  it("takes a lower price at once, sends a higher one to the customer, and replaces a rejected or declining supplier", async () => {
    const req = await chosenSplit("Line 9 automation");
    assert.equal(
      (await answer("plc", req, { price: 5000 })).code,
      "tellTheCustomerWhyThe2",
      "a changed price needs a reason",
    );
    const low = await answer("plc", req, { price: 5000, note: "Reuse of the line 7 program" });
    assert.equal(low.order.status, "Confirmed");
    assert.equal(low.order.amount, 5000);
    const high = await answer("full", req, { price: 9500, note: "Extra safety tests" });
    assert.equal(high.order.status, "Price changed");
    let r = await seen(req);
    assert.equal(part(r, "Commissioning").status, "Price changed");
    assert.equal(part(r, "Commissioning").proposedPrice, 9500);
    assert.equal(part(r, "Commissioning").note, "Extra safety tests");
    // Rejected: the commissioning crew is asked instead, at its own estimate
    const rej = await app.call(
      "POST",
      `/requests/${req.id}/parts/${part(r, "Commissioning").id}`,
      { action: "reject" },
      customer,
    );
    assert.equal(rej.status, 200, rej.error);
    r = await seen(req);
    assert.equal(part(r, "Commissioning").status, "Waiting for supplier");
    assert.equal(part(r, "Commissioning").replacement, true);
    assert.equal(part(r, "Commissioning").price, 8800);
    assert.equal(
      (await app.call("GET", "/brokered-orders", undefined, s.full.token)).orders.some(
        (x) => x.requestId === req.id,
      ),
      false,
    );
    // The crew declines: nobody is left for commissioning, the operator is told
    assert.equal((await answer("com", req)).status, 200);
    r = await seen(req);
    assert.deepEqual(r.award.gap, ["Commissioning"]);
    const notes = (await app.call("GET", "/notifications", undefined, admin)).notifications;
    assert.ok(notes.some((n) => /No supplier left/.test(n.text)));
  });

  it("replaces a supplier who does not answer in time", async () => {
    const req = await chosenSplit("Line 10 automation");
    await app.stop();
    await editDb(dataDir, (data) => {
      const p = data.requests
        .find((x) => x.id === req.id)
        .award.parts.find((x) => x.supplierId === s.full.supplierId);
      p.expiresAt = "2020-01-01T00:00:00.000Z";
    });
    app = await startApp({ dataDir, env: ENV });
    await login();
    const r = await seen(req);
    assert.equal(part(r, "Commissioning").replacement, true);
    const { orders } = await app.call("GET", "/brokered-orders", undefined, s.com.token);
    assert.ok(orders.some((x) => x.requestId === req.id));
  });

  it("contracts each supplier for its part once every part is confirmed, and names them all", async () => {
    const req = await chosenSplit("Line 11 automation");
    await answer("plc", req, {});
    await answer("full", req, { price: 8400, note: "Weekend work" });
    let r = await seen(req);
    assert.equal(r.status, "Chosen", "the higher price still waits");
    await app.call(
      "POST",
      `/requests/${req.id}/parts/${part(r, "Commissioning").id}`,
      { action: "approve" },
      customer,
    );
    r = await seen(req);
    assert.equal(r.status, "Contracted");
    assert.deepEqual(
      r.suppliers.map((x) => [x.company, x.packages]),
      [
        ["PLC Specialists GmbH", ["PLC program"]],
        ["Full Service GmbH", ["Commissioning"]],
      ],
    );
    const project = (await app.call("GET", `/projects/${r.projectId}`, undefined, customer)).project,
      tasks = project.phases.flatMap((ph) => ph.tasks);
    assert.equal(tasks.find((t) => t.name === "PLC program").assignedSupplierId, s.plc.supplierId);
    assert.equal(tasks.find((t) => t.name === "Commissioning").assignedSupplierId, s.full.supplierId);
    assert.equal(tasks.find((t) => t.name === "Commissioning").orderAmount, 8400);
    const contracts = (await app.call("GET", "/contracts", undefined, customer)).contracts.filter(
      (c) => c.requestId === req.id,
    );
    assert.deepEqual(contracts.map((c) => c.value).sort(), [5600, 8400]);
    assert.ok(
      contracts.every(
        (c) => c.brokered && c.status === "Active" && c.acceptances.supplier.hash === c.clause.hash,
      ),
    );
    const intro = (await app.call("GET", "/admin/introductions", undefined, admin)).introductions.filter(
      (x) => x.requestIds.includes(req.id),
    );
    assert.equal(intro.length, 2);
    const plcOrder = (await app.call("GET", "/brokered-orders", undefined, s.plc.token)).orders.find(
      (x) => x.requestId === req.id,
    );
    assert.equal(plcOrder.customerCompany, "Part Customer AG");
  });
});
