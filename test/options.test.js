// T224: the operator turns offers into up to three anonymised options; the customer sees price, time, label and
// an anonymised profile, never the supplier's id, name, contact details or own amount.
const { describe, it, before, after } = require("node:test");
const assert = require("node:assert/strict");
const { startApp, vettedSupplier } = require("./helpers");

describe("anonymised options", () => {
  let app, admin, customer, suppliers, req, offers;
  before(async () => {
    app = await startApp({ env: { PLATFORM_MODE: "brokered" } });
    admin = await app.login("admin@test.local", "Admin-Password-2026!");
    suppliers = [];
    for (const [i, name] of ["Alpha Robotics GmbH", "Beta Automation GmbH", "Gamma Controls GmbH"].entries())
      suppliers.push(await vettedSupplier(app, admin, `opt${i}@test.local`, name));
    // A markup, so the supplier's own amount differs from the customer's price
    const { settings } = await app.call("GET", "/admin/settings", undefined, admin);
    assert.equal(
      (await app.call("PUT", "/admin/settings", { ...settings, brokerMarkupPercent: 10 }, admin)).status,
      200,
    );
    await app.signup("customer", "opt.customer@test.local");
    customer = await app.login("opt.customer@test.local", "Test-Password-2026");
    req = (
      await app.call(
        "POST",
        "/requests",
        {
          title: "Commissioning of a robot cell",
          description: "Two cells, PLC handover and safety acceptance on site.",
          category: "Commissioning",
          sitePostcode: "93055",
        },
        customer,
      )
    ).request;
    const inv = await app.call(
      "POST",
      `/requests/${req.id}/invitations`,
      { supplierIds: suppliers.map((s) => s.supplierId), dueDate: "2030-01-01" },
      admin,
    );
    const bidId = inv.request.sourcing.bidId;
    offers = [];
    for (const [i, [amount, deliveryDays]] of [
      [12000, 20],
      [9500, 30],
      [14000, 8],
    ].entries())
      offers.push(
        (await app.call("POST", `/bids/${bidId}/offers`, { amount, deliveryDays }, suppliers[i].token)).offer,
      );
  });
  after(() => app?.stop());

  const patchOptions = (options, token = admin) =>
    app.call("PUT", `/requests/${req.id}/options`, { options }, token);

  it("suggests the labels and checks what the operator picks", async () => {
    const { request } = await app.call("GET", `/requests/${req.id}`, undefined, admin);
    const label = (i) =>
      request.sourcing.invited.find((x) => x.offer?.id === offers[i].id).offer.suggestedLabel;
    assert.equal(label(1), "cheapest");
    assert.equal(label(2), "fastest");
    assert.equal((await patchOptions([{ offerId: offers[0].id, label: "best" }], customer)).status, 403);
    assert.equal((await patchOptions([])).code, "chooseOneToThreeOffers");
    assert.equal(
      (await patchOptions([{ offerId: "offer_x", label: "best" }])).code,
      "chooseOneToThreeOffers",
    );
    assert.equal(
      (await patchOptions([{ offerId: offers[0].id, label: "luxury" }])).code,
      "labelEachOptionAsFastest",
    );
    assert.equal(
      (await patchOptions([offers[0], offers[0]].map((o) => ({ offerId: o.id, label: "best" })))).code,
      "chooseOneToThreeOffers",
    );
  });

  it("shows the customer nothing before publishing, and no supplier after", async () => {
    const saved = await patchOptions([
      { offerId: offers[0].id, label: "best", note: "Strongest track record" },
      { offerId: offers[1].id, label: "cheapest" },
      { offerId: offers[2].id, label: "fastest" },
    ]);
    assert.equal(saved.status, 200, saved.error);
    assert.equal(
      (await app.call("GET", `/requests/${req.id}`, undefined, customer)).request.options.length,
      0,
    );
    assert.equal((await app.call("POST", `/requests/${req.id}/publish`, {}, customer)).status, 403);
    const pub = await app.call("POST", `/requests/${req.id}/publish`, {}, admin);
    assert.equal(pub.request.status, "Options ready");
    const notes = (await app.call("GET", "/notifications", undefined, customer)).notifications;
    assert.ok(notes.some((n) => n.text.includes("Commissioning of a robot cell") && n.text.includes("(3)")));

    const { request } = await app.call("GET", `/requests/${req.id}`, undefined, customer);
    assert.equal(request.options.length, 3);
    const cheapest = request.options.find((o) => o.label === "cheapest");
    assert.equal(cheapest.price, 10450, "the supplier's 9,500 plus the 10 % markup");
    assert.equal(cheapest.deliveryDays, 30);
    assert.equal(cheapest.profile.badge, "Silver");
    const seen = JSON.stringify(request);
    for (const [i, s] of suppliers.entries()) {
      for (const secret of [s.supplierId, s.user.company, s.user.email, `opt${i}@test.local`])
        assert.ok(!seen.includes(secret), `the customer does not see ${secret}`);
    }
    for (const secret of [
      "supplierId",
      "supplierAmount",
      "offerId",
      "9500",
      "Alpha",
      "Beta",
      "Gamma",
      "bidId",
      "operatorNote",
    ])
      assert.ok(!seen.includes(secret), `the customer does not see ${secret}`);
    assert.equal((await app.call("GET", `/requests/${req.id}`, undefined, suppliers[0].token)).status, 403);
    const exported = await (
      await fetch(app.base + "/api/account/export", { headers: { Authorization: "Bearer " + customer } })
    ).text();
    for (const secret of ["supplierAmount", suppliers[0].supplierId]) assert.ok(!exported.includes(secret));
  });

  it("lets customer and platform write to each other, and the customer ask for another round", async () => {
    const say = (body, token) => app.call("POST", `/requests/${req.id}/messages`, body, token);
    assert.equal((await say({ text: "" }, customer)).code, "writeAMessageFirst");
    assert.equal((await say({ text: "Can the fastest option start earlier?" }, customer)).status, 201);
    const adminNotes = (await app.call("GET", "/notifications", undefined, admin)).notifications;
    assert.ok(adminNotes.some((n) => n.text.includes("New message on the request")));
    assert.equal((await say({ text: "Yes, from 2 November." }, admin)).status, 201);
    const round = await say({ text: "Please look for cheaper offers.", anotherRound: true }, customer);
    assert.equal(round.request.status, "Sourcing");
    assert.deepEqual(round.request.options, [], "options are hidden again during the new round");
    assert.deepEqual(
      round.request.thread.map((m) => m.by),
      ["customer", "platform", "customer"],
    );
    assert.ok(round.request.thread.every((m) => !("byId" in m)));
    assert.equal((await say({ text: "Again", anotherRound: true }, customer)).code, "anotherRoundCanBeAsked");
  });
});
