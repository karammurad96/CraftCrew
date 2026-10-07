// T244: supplier price rules and automatic confirmation. A part inside the rules is confirmed at once, in the
// supplier's name, with the rule version recorded; one outside waits as before. "Binding price" only when every
// part matches. The answer time is an admin setting that changes new parts only. Nothing happens until the admin
// switches the feature on.
const { describe, it, before, after } = require("node:test");
const assert = require("node:assert/strict");
const { startApp, vettedSupplier } = require("./helpers");

const day = (n) => new Date(Date.now() + n * 86400000).toISOString().slice(0, 10);

describe("price rules and automatic confirmation", () => {
  let app, admin, customer, sup, hash;
  const rule = (extra = {}) => ({
    category: "PLC Programming",
    auto: true,
    regions: ["93"],
    maxValue: 5000,
    leadDays: 7,
    ...extra,
  });
  const save = (rules, accept = true, token = sup.token) =>
    app.call("PUT", "/price-rules", { rules, ...(accept ? { acceptClause: true, clauseHash: hash } : {}) }, token);
  const send = (extra = {}, packages = [{ name: "PLC program", category: "PLC Programming", hours: 20 }]) =>
    app.call(
      "POST",
      "/requests",
      {
        title: "Line 7 automation",
        description: "PLC programming of line 7.",
        sitePostcode: "93055",
        startDate: day(30),
        dueDate: day(60),
        packages,
        ...extra,
      },
      customer,
    );
  const choose = (req) => app.call("POST", `/requests/${req.id}/choose`, { optionId: req.options[0].id, acceptClause: true, clauseHash: hash }, customer);
  const asAdmin = async (id) => (await app.call("GET", `/requests/${id}`, undefined, admin)).request;
  const setting = async (patch) => {
    const { settings } = await app.call("GET", "/admin/settings", undefined, admin);
    return app.call("PUT", "/admin/settings", { ...settings, ...patch }, admin);
  };

  before(async () => {
    app = await startApp({ env: { PLATFORM_MODE: "brokered", INSTANT_ESTIMATES: "on" } });
    admin = await app.login("admin@test.local", "Admin-Password-2026!");
    sup = await vettedSupplier(app, admin, "rules.sup@test.local", "Rules GmbH");
    await app.call(
      "PUT",
      "/profile",
      {
        services: ["PLC Programming", "Commissioning"],
        location: "Regensburg",
        serviceCatalog: [
          { name: "S7", category: "PLC Programming", unit: "hour", rate: 100 },
          { name: "Start-up", category: "Commissioning", unit: "hour", rate: 100 },
        ],
      },
      sup.token,
    );
    await app.signup("customer", "rules.customer@test.local");
    customer = await app.login("rules.customer@test.local", "Test-Password-2026");
    hash = (await app.call("GET", "/clause", undefined, customer)).clause.hash;
  });
  after(() => app?.stop());

  it("validates the rules and needs the supplier's acceptance for automatic confirmation", async () => {
    assert.equal((await save([rule()], false)).status, 400, "no acceptance");
    assert.equal((await app.call("PUT", "/price-rules", { rules: [rule()], acceptClause: true, clauseHash: "old" }, sup.token)).status, 409);
    assert.equal((await save([rule({ maxValue: 0 })])).status, 400, "the largest value is required");
    assert.equal((await save([rule({ regions: ["abc"] })])).status, 400);
    assert.equal((await save([rule(), rule()])).status, 400, "one rule per category");
    assert.equal((await app.call("PUT", "/price-rules", { rules: [rule()] }, customer)).status, 403);
    const ok = await save([rule()]);
    assert.equal(ok.status, 200, ok.error);
    assert.equal(ok.version, 1);
    assert.equal(ok.accepted, true);
    // a changed rule is a new version; the same rules again are not
    assert.equal((await save([rule()])).version, 1);
    assert.equal((await save([rule({ maxValue: 6000 })])).version, 2);
    assert.equal((await save([rule()])).version, 3);
  });

  it("does nothing until the admin switches automatic confirmation on", async () => {
    const r = (await send()).request;
    assert.equal(r.options[0].binding, false);
    const chosen = await choose(r);
    assert.equal(chosen.status, 200, chosen.error);
    assert.equal(chosen.request.status, "Chosen");
    const orders = (await app.call("GET", "/brokered-orders", undefined, sup.token)).orders;
    assert.equal(orders.find((o) => o.requestId === r.id).status, "Waiting for supplier");
  });

  it("confirms a part inside the rules at once, in the supplier's name, with the rule version", async () => {
    assert.equal((await setting({ autoConfirm: true })).status, 200);
    const r = (await send()).request;
    assert.equal(r.options[0].binding, true, "Binding price");
    const chosen = await choose(r);
    assert.equal(chosen.status, 200, chosen.error);
    assert.equal(chosen.request.status, "Contracted");
    const op = await asAdmin(r.id),
      part = op.award.parts[0];
    assert.equal(part.status, "Confirmed");
    assert.equal(part.auto, true);
    assert.equal(part.ruleVersion, 3);
    assert.equal(part.supplierAmount, part.estimate, "at the estimate");
    assert.equal(part.supplierAcceptance.context, "price-rule");
    assert.equal(part.supplierAcceptance.ruleVersion, 3);
    assert.equal(part.supplierAcceptance.hash, hash);
    assert.equal(op.contractIds.length, 1);
  });

  it("leaves a part outside every rule waiting, and marks Binding price only when every part matches", async () => {
    // over the largest order value
    let r = (await send({}, [{ name: "PLC program", category: "PLC Programming", hours: 80 }])).request;
    assert.equal(r.options[0].binding, false);
    assert.equal((await choose(r)).request.status, "Chosen");
    // too soon after today (lead time 7 days)
    r = (await send({ startDate: day(2) })).request;
    assert.equal(r.options[0].binding, false);
    // another region
    r = (await send({ sitePostcode: "10115" })).request;
    assert.equal(r.options[0].binding, false);
    // two packages, only one with a rule: the part is not binding
    r = (
      await send({}, [
        { name: "PLC program", category: "PLC Programming", hours: 10 },
        { name: "Start-up", category: "Commissioning", hours: 10 },
      ])
    ).request;
    assert.equal(r.options[0].binding, false);
    assert.equal((await choose(r)).request.status, "Chosen");
    // both categories have a rule: binding
    assert.equal((await save([rule(), rule({ category: "Commissioning" })])).status, 200);
    r = (
      await send({}, [
        { name: "PLC program", category: "PLC Programming", hours: 10 },
        { name: "Start-up", category: "Commissioning", hours: 10 },
      ])
    ).request;
    assert.equal(r.options[0].binding, true);
  });

  it("checks the free crew-days against the capacity calendar (T245)", async () => {
    // without a capacity the field is not checked; with one, the free crew-days of the period must reach it
    assert.equal((await save([rule({ freeCrewDays: 100 })])).status, 200);
    assert.equal((await send()).request.options[0].binding, true, "no capacity set: not checked");
    assert.equal((await app.call("PUT", "/capacity", { crewDaysPerWeek: 10 }, sup.token)).status, 200);
    assert.equal((await send()).request.options[0].binding, false, "100 free crew-days are not there");
    assert.equal((await save([rule({ freeCrewDays: 2 })])).status, 200);
    assert.equal((await send()).request.options[0].binding, true);
    assert.equal((await app.call("PUT", "/capacity", { crewDaysPerWeek: 0 }, sup.token)).status, 200);
    assert.equal((await save([rule(), rule({ category: "Commissioning" })])).status, 200);
  });

  it("lets the supplier switch the rules off at any time; confirmations already made stay", async () => {
    const before = (await app.call("GET", "/requests", undefined, admin)).requests.filter((x) => x.status === "Contracted").length;
    const off = await save([rule({ auto: false })], false);
    assert.equal(off.status, 200, off.error);
    const r = (await send()).request;
    assert.equal(r.options[0].binding, false);
    assert.equal((await choose(r)).request.status, "Chosen");
    const after = (await app.call("GET", "/requests", undefined, admin)).requests.filter((x) => x.status === "Contracted").length;
    assert.equal(after, before, "nothing was undone");
  });

  it("makes the answer time an admin setting that changes new parts only", async () => {
    assert.equal((await setting({ supplierDays: 11 })).status, 400);
    const first = (await send()).request;
    await choose(first);
    const expires = async (id) => (await asAdmin(id)).award.parts[0].expiresAt;
    const was = await expires(first.id);
    assert.equal((await setting({ supplierDays: 8 })).status, 200);
    const second = (await send()).request;
    await choose(second);
    assert.equal(await expires(first.id), was, "an offered part keeps its deadline");
    assert.ok((await expires(second.id)) > was, "a new part has the longer deadline");
    const { settings } = await app.call("GET", "/admin/settings", undefined, admin);
    assert.equal(settings.supplierDays, 8);
  });
});
