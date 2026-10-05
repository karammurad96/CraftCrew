// T225: the customer chooses an option and accepts the platform contract with the clause; the supplier confirms
// within three working days. Only then are both sides named to each other, the work assigned and the contract
// written. A declined or unanswered order goes back to the options.
const { describe, it, before, after } = require("node:test");
const assert = require("node:assert/strict");
const { mkdtempSync, rmSync } = require("node:fs");
const os = require("node:os");
const path = require("node:path");
const { startApp, vettedSupplier, editDb } = require("./helpers");

const ADMIN = ["admin@test.local", "Admin-Password-2026!"];

describe("choosing an option", () => {
  let app, admin, customer, alpha, beta, dataDir;
  const login = async () => {
    admin = await app.login(...ADMIN);
    customer = await app.login("choose.customer@test.local", "Test-Password-2026");
    alpha.token = await app.login("choose.alpha@test.local", "Test-Password-2026");
    beta.token = await app.login("choose.beta@test.local", "Test-Password-2026");
  };
  // A request with two published options, Alpha's and Beta's; returns the customer's view of it
  const requestWithOptions = async (title) => {
    const { request } = await app.call(
      "POST",
      "/requests",
      {
        title,
        description: "Two cells, PLC handover and safety acceptance on site.",
        category: "Commissioning",
        sitePostcode: "93055",
      },
      customer,
    );
    const inv = await app.call(
      "POST",
      `/requests/${request.id}/invitations`,
      { supplierIds: [alpha.supplierId, beta.supplierId], dueDate: "2030-01-01" },
      admin,
    );
    const bidId = inv.request.sourcing.bidId,
      a = (await app.call("POST", `/bids/${bidId}/offers`, { amount: 12000, deliveryDays: 20 }, alpha.token))
        .offer,
      b = (await app.call("POST", `/bids/${bidId}/offers`, { amount: 9000, deliveryDays: 30 }, beta.token))
        .offer;
    await app.call(
      "PUT",
      `/requests/${request.id}/options`,
      {
        options: [
          { offerId: a.id, label: "best" },
          { offerId: b.id, label: "cheapest" },
        ],
      },
      admin,
    );
    await app.call("POST", `/requests/${request.id}/publish`, {}, admin);
    return (await app.call("GET", `/requests/${request.id}`, undefined, customer)).request;
  };
  const hash = async () => (await app.call("GET", "/clause", undefined, customer)).clause.hash;

  before(async () => {
    dataDir = mkdtempSync(path.join(os.tmpdir(), "craftcrew-test-"));
    app = await startApp({ dataDir, env: { PLATFORM_MODE: "brokered" } });
    admin = await app.login(...ADMIN);
    alpha = await vettedSupplier(app, admin, "choose.alpha@test.local", "Alpha Robotics GmbH");
    beta = await vettedSupplier(app, admin, "choose.beta@test.local", "Beta Automation GmbH");
    await app.signup("customer", "choose.customer@test.local", { company: "Secret Customer AG" });
    await login();
  });
  after(async () => {
    await app?.stop();
    rmSync(dataDir, { recursive: true, force: true });
  });

  it("names nobody until both sides accept, then assigns the work, writes the contract and reveals both", async () => {
    const req = await requestWithOptions("Commissioning of a robot cell"),
      best = req.options.find((o) => o.label === "best"),
      choose = (body, token = customer) => app.call("POST", `/requests/${req.id}/choose`, body, token);
    assert.equal(
      (await choose({ optionId: best.id, acceptClause: true, clauseHash: await hash() }, alpha.token)).status,
      403,
    );
    assert.equal((await choose({ optionId: best.id })).code, "acceptThePlatformContractTo");
    assert.equal(
      (await choose({ optionId: best.id, acceptClause: true, clauseHash: "old" })).code,
      "theContractTermsChangedRead",
    );
    const chosen = await choose({ optionId: best.id, acceptClause: true, clauseHash: await hash() });
    assert.equal(chosen.status, 200, chosen.error);
    assert.equal(chosen.request.status, "Chosen");
    assert.equal(chosen.request.award.status, "Waiting for supplier");
    assert.ok(!JSON.stringify(chosen.request).includes("Alpha"), "still anonymous");
    assert.equal(
      (await choose({ optionId: best.id, acceptClause: true, clauseHash: await hash() })).code,
      "thisOptionCanNoLonger",
    );

    assert.deepEqual((await app.call("GET", "/brokered-orders", undefined, beta.token)).orders, []);
    const { orders } = await app.call("GET", "/brokered-orders", undefined, alpha.token);
    assert.equal(orders.length, 1);
    assert.equal(orders[0].amount, 12000);
    assert.equal(orders[0].customerCompany, undefined, "the customer is not named before the contract");
    assert.ok(!JSON.stringify(orders).includes("Secret Customer"));
    assert.equal((await app.call("GET", "/brokered-orders", undefined, customer)).status, 403);

    const accept = (body) => app.call("POST", `/brokered-orders/${req.id}/accept`, body, alpha.token);
    assert.equal(
      (await accept({ acceptClause: true, clauseHash: "old" })).code,
      "theContractTermsChangedRead",
    );
    const ok = await accept({ acceptClause: true, clauseHash: await hash() });
    assert.equal(ok.status, 200, ok.error);
    assert.equal(ok.order.customerCompany, "Secret Customer AG", "the supplier now sees the customer");
    assert.equal(
      (await accept({ acceptClause: true, clauseHash: await hash() })).code,
      "thisOrderWasAlreadyAnswered",
    );

    const after = (await app.call("GET", `/requests/${req.id}`, undefined, customer)).request;
    assert.equal(after.status, "Contracted");
    assert.equal(after.supplier.company, "Alpha Robotics GmbH", "the customer now sees the supplier");
    const project = (await app.call("GET", `/projects/${after.projectId}`, undefined, customer)).project;
    const task = project.phases.flatMap((ph) => ph.tasks).find((t) => t.id === after.taskId);
    assert.equal(task.assignedSupplierId, alpha.supplierId);
    assert.equal(task.orderAmount, 12000);
    assert.equal((await app.call("GET", `/projects/${after.projectId}`, undefined, alpha.token)).status, 200);

    const { contracts } = await app.call("GET", "/contracts", undefined, customer);
    const c = contracts.find((x) => x.requestId === req.id);
    assert.equal(c.status, "Active");
    assert.equal(c.brokered, true);
    assert.equal(c.acceptances.customer.hash, await hash());
    assert.equal(c.acceptances.supplier.version, 0);
    assert.equal(c.acceptances.customer.context, "brokered-contract");
    // The acceptance records cannot be changed through the contract form
    await app.call("PATCH", `/contracts/${c.id}`, { title: c.title, acceptances: {}, clause: {} }, customer);
    const again = (await app.call("GET", "/contracts", undefined, customer)).contracts.find(
      (x) => x.id === c.id,
    );
    assert.deepEqual(again.acceptances, c.acceptances);
    assert.deepEqual(again.clause, c.clause);

    const { introductions } = await app.call("GET", "/admin/introductions", undefined, admin);
    assert.equal(introductions.length, 1);
    assert.equal(introductions[0].supplierCompany, "Alpha Robotics GmbH");
    // Beta's offer was not selected
    const bids = (await app.call("GET", "/bids", undefined, beta.token)).bids;
    assert.equal(bids[0].offers[0].status, "Not selected");
  });

  it("puts the options back when the supplier declines", async () => {
    const req = await requestWithOptions("Retrofit of a press line"),
      cheapest = req.options.find((o) => o.label === "cheapest");
    await app.call(
      "POST",
      `/requests/${req.id}/choose`,
      { optionId: cheapest.id, acceptClause: true, clauseHash: await hash() },
      customer,
    );
    assert.equal((await app.call("POST", `/brokered-orders/${req.id}/decline`, {}, beta.token)).status, 200);
    const back = (await app.call("GET", `/requests/${req.id}`, undefined, customer)).request;
    assert.equal(back.status, "Options ready");
    assert.equal(back.options.find((o) => o.id === cheapest.id).declined, true);
    assert.equal(back.supplier, undefined);
    const notes = (await app.call("GET", "/notifications", undefined, customer)).notifications;
    assert.ok(
      notes.some((n) => n.text.includes("Retrofit of a press line") && /no longer available/.test(n.text)),
    );
    const retry = await app.call(
      "POST",
      `/requests/${req.id}/choose`,
      { optionId: cheapest.id, acceptClause: true, clauseHash: await hash() },
      customer,
    );
    assert.equal(retry.code, "thisOptionCanNoLonger");
  });

  it("puts the options back when the supplier does not answer in three working days", async () => {
    const req = await requestWithOptions("Painting of a hall floor"),
      best = req.options.find((o) => o.label === "best");
    const chosen = await app.call(
      "POST",
      `/requests/${req.id}/choose`,
      { optionId: best.id, acceptClause: true, clauseHash: await hash() },
      customer,
    );
    const days = (Date.parse(chosen.request.award.expiresAt) - Date.now()) / 86400000;
    assert.ok(days > 2.99 && days <= 5, `three working days (${days.toFixed(1)} calendar days)`);
    await app.stop();
    await editDb(dataDir, (data) => {
      // The deadline is kept per supplier part (T232)
      for (const part of data.requests.find((r) => r.id === req.id).award.parts) part.expiresAt = "2020-01-01T00:00:00.000Z";
    });
    app = await startApp({ dataDir, env: { PLATFORM_MODE: "brokered" } });
    await login();
    const back = (await app.call("GET", `/requests/${req.id}`, undefined, customer)).request;
    assert.equal(back.status, "Options ready");
    assert.equal(back.history.at(-1).note, "Expired");
    assert.deepEqual(
      (await app.call("GET", "/brokered-orders", undefined, alpha.token)).orders.filter(
        (o) => o.requestId === req.id,
      ),
      [],
    );
  });
});
