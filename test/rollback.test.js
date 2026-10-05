// T228: the rollback. The whole brokered journey runs, then one admin switch brings the marketplace back with
// every record kept, and switching again closes it, still without losing anything.
const { describe, it, before, after } = require("node:test");
const assert = require("node:assert/strict");
const { startApp, vettedSupplier } = require("./helpers");

describe("rollback to the marketplace", () => {
  let app, admin, customer, alpha, beta, req, snapshot;
  const hash = async () => (await app.call("GET", "/clause", undefined, customer)).clause.hash;
  const setMode = (mode) => app.call("PUT", "/admin/platform-mode", { mode }, admin);
  // Everything the journey created, as the operator and the customer see it
  const state = async () => ({
    request: (await app.call("GET", `/requests/${req.id}`, undefined, admin)).request,
    customerView: (await app.call("GET", `/requests/${req.id}`, undefined, customer)).request,
    contracts: (await app.call("GET", "/contracts", undefined, admin)).contracts,
    introductions: (await app.call("GET", "/admin/introductions", undefined, admin)).introductions,
    projects: (await app.call("GET", "/projects", undefined, customer)).projects.map((p) => p.id),
  });
  before(async () => {
    app = await startApp({ env: { PLATFORM_MODE: "brokered" } });
    admin = await app.login("admin@test.local", "Admin-Password-2026!");
    alpha = await vettedSupplier(app, admin, "rb.alpha@test.local", "Alpha Robotics GmbH");
    beta = await vettedSupplier(app, admin, "rb.beta@test.local", "Beta Automation GmbH");
    await app.signup("customer", "rb.customer@test.local", { company: "Rollback Customer AG" });
    customer = await app.login("rb.customer@test.local", "Test-Password-2026");
  });
  after(() => app?.stop());

  it("runs the whole brokered journey: request, suggestions, offers, options, choice, contract, reveal", async () => {
    req = (
      await app.call(
        "POST",
        "/requests",
        {
          title: "Commissioning of a robot cell",
          description: "Two cells, PLC handover and safety acceptance.",
          category: "Commissioning",
          sitePostcode: "93055",
        },
        customer,
      )
    ).request;
    const { request: op } = await app.call("GET", `/requests/${req.id}`, undefined, admin);
    assert.ok(op.suggestions.list.length >= 2);
    const inv = await app.call(
      "POST",
      `/requests/${req.id}/invitations`,
      { supplierIds: op.suggestions.list.map((x) => x.supplierId), dueDate: "2030-01-01" },
      admin,
    );
    const bidId = inv.request.sourcing.bidId,
      a = (await app.call("POST", `/bids/${bidId}/offers`, { amount: 12000, deliveryDays: 20 }, alpha.token))
        .offer,
      b = (await app.call("POST", `/bids/${bidId}/offers`, { amount: 9000, deliveryDays: 30 }, beta.token))
        .offer;
    await app.call(
      "PUT",
      `/requests/${req.id}/options`,
      {
        options: [
          { offerId: a.id, label: "best" },
          { offerId: b.id, label: "cheapest" },
        ],
      },
      admin,
    );
    await app.call("POST", `/requests/${req.id}/publish`, {}, admin);
    const { request } = await app.call("GET", `/requests/${req.id}`, undefined, customer);
    const best = request.options.find((o) => o.label === "best"),
      cheapest = request.options.find((o) => o.label === "cheapest");
    await app.call(
      "POST",
      `/requests/${req.id}/choose`,
      { optionId: best.id, acceptClause: true, clauseHash: await hash() },
      customer,
    );
    const ok = await app.call(
      "POST",
      `/brokered-orders/${req.id}/accept`,
      { acceptClause: true, clauseHash: await hash() },
      alpha.token,
    );
    assert.equal(ok.status, 200, ok.error);
    snapshot = await state();
    assert.equal(snapshot.customerView.status, "Contracted");
    assert.equal(snapshot.customerView.supplier.company, "Alpha Robotics GmbH");
    // The option that was not chosen stays anonymous
    const other = snapshot.customerView.options.find((o) => o.id === cheapest.id);
    assert.ok(!JSON.stringify(other).includes(beta.supplierId) && !JSON.stringify(other).includes("Beta"));
    assert.equal(snapshot.introductions.length, 1);
  });

  it("switches to the marketplace: the directory and quote requests work, nothing changed", async () => {
    assert.equal((await setMode("marketplace")).status, 200);
    const list = await app.call("GET", "/suppliers", undefined, customer);
    assert.ok(
      list.suppliers.some((s) => s.id === beta.supplierId),
      "the whole directory is back",
    );
    assert.equal((await app.call("GET", `/suppliers/${beta.supplierId}`, undefined, customer)).status, 200);
    const rfq = await app.call(
      "POST",
      "/rfqs",
      { supplierId: beta.supplierId, service: "Commissioning", message: "Please quote" },
      customer,
    );
    assert.equal(rfq.status, 201);
    assert.equal((await app.call("GET", "/preferred-suppliers", undefined, customer)).status, 200);
    const now = await state();
    assert.deepEqual(now, snapshot, "request, contract, introduction and projects are unchanged");
    const seen = JSON.stringify(now.customerView.options.filter((o) => !o.chosen));
    assert.ok(!seen.includes("Beta") && !seen.includes(beta.supplierId), "hidden suppliers stay hidden");
    assert.equal((await app.call("GET", "/platform-config")).platformMode, "marketplace");
  });

  it("switches back to brokered: the marketplace routes are refused again and nothing was lost", async () => {
    assert.equal((await setMode("brokered")).status, 200);
    for (const [method, path, body] of [
      ["GET", `/suppliers/${beta.supplierId}`],
      ["GET", "/preferred-suppliers"],
      ["POST", "/rfqs", { supplierId: beta.supplierId, service: "Commissioning", message: "Again" }],
    ]) {
      const r = await app.call(method, path, body, customer);
      assert.equal(r.status, 403, `${method} ${path}`);
      assert.equal(r.code, "suppliersAreChosenForYou");
    }
    // The supplier from the contract is still known and visible; the quote request from marketplace mode is kept
    assert.equal((await app.call("GET", `/suppliers/${alpha.supplierId}`, undefined, customer)).status, 200);
    assert.equal((await app.call("GET", "/rfqs", undefined, customer)).rfqs.length, 1);
    assert.deepEqual(await state(), snapshot);
  });
});
