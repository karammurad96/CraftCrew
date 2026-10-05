// T223: automatic supplier suggestions for a customer request, and invitations from the request into a brokered
// bid round that names no customer to suppliers and shows no supplier to the customer.
const { describe, it, before, after } = require("node:test");
const assert = require("node:assert/strict");
const { startApp, vettedSupplier } = require("./helpers");

describe("suggestSuppliers ranks with fixed data", () => {
  const supplier = (id, extra) => ({
    id,
    company: "Company " + id,
    live: true,
    services: ["Commissioning"],
    location: "Regensburg",
    reviews: [],
    ...extra,
  });
  const task = (id, supplierId, extra = {}) => ({
    id,
    name: id,
    assignedSupplierId: supplierId,
    acceptanceStatus: "Accepted",
    status: "In Progress",
    ...extra,
  });
  const db = {
    suppliers: [
      supplier("near_gold", { badge: "Gold" }),
      supplier("far_silver", { badge: "Silver", location: "Hamburg" }),
      supplier("wrong_category", { services: ["Welding"] }),
      supplier("not_live", { live: false, badge: "Gold" }),
      supplier("busy"),
    ],
    projects: [
      {
        id: "p_old",
        customerId: "c1",
        phases: [
          { id: "ph", tasks: [task("t_done", "far_silver", { status: "Completed", dueDate: "2026-03-01" })] },
        ],
      },
      {
        id: "p_other",
        customerId: "c2",
        phases: [
          {
            id: "ph2",
            tasks: ["a", "b", "c"].map((x) =>
              task("t_" + x, "busy", { startDate: "2026-11-01", dueDate: "2026-11-30" }),
            ),
          },
        ],
      },
    ],
    invoices: [],
    bids: [],
    applications: [],
  };
  const sourcing = require("../sourcing")({ getDb: () => db });
  const request = {
    customerId: "c1",
    category: "Commissioning",
    sitePostcode: "93055",
    startDate: "2026-11-02",
    dueDate: "2026-11-20",
  };

  it("puts the best fit first, explains each score and never suggests a supplier who is not live", () => {
    const list = sourcing.suggestSuppliers(request),
      ids = list.map((x) => x.supplierId),
      of = (id) => list.find((x) => x.supplierId === id),
      keys = (id) => of(id).reasons.map((r) => r.key);
    assert.ok(!ids.includes("not_live"));
    assert.equal(ids[0], "near_gold");
    assert.equal(ids.at(-1), "wrong_category", "no category match ranks last");
    assert.ok(keys("near_gold").includes("category") && keys("near_gold").includes("badge"));
    assert.ok(!keys("wrong_category").includes("category"));
    assert.ok(of("busy").score < of("near_gold").score);
    assert.deepEqual(of("busy").reasons.find((r) => r.key === "busy").params, { n: 3 });
    assert.ok(keys("far_silver").includes("worked"), "earlier work for the same customer counts");
    assert.ok(of("far_silver").reasons.find((r) => r.key === "distance").params.km > 500);
    assert.ok(of("near_gold").reasons.find((r) => r.key === "distance").params.km < 20);
  });

  it("limits the list", () => {
    assert.equal(sourcing.suggestSuppliers(request, { limit: 2 }).length, 2);
  });
});

describe("invitations from a request", () => {
  let app, admin, customer, supplier, other, req;
  before(async () => {
    app = await startApp({ env: { PLATFORM_MODE: "brokered" } });
    admin = await app.login("admin@test.local", "Admin-Password-2026!");
    supplier = await vettedSupplier(app, admin, "sugg.supplier@test.local", "Suggested Robotics GmbH");
    other = await vettedSupplier(app, admin, "sugg.other@test.local", "Other Robotics GmbH");
    await app.signup("customer", "sugg.customer@test.local", { company: "Secret Customer AG" });
    customer = await app.login("sugg.customer@test.local", "Test-Password-2026");
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
  });
  after(() => app?.stop());

  it("suggests suppliers when the request arrives, for the operator only", async () => {
    const { request } = await app.call("GET", `/requests/${req.id}`, undefined, admin);
    assert.ok(request.suggestions.list.some((x) => x.supplierId === supplier.supplierId));
    assert.equal(
      (await app.call("GET", `/requests/${req.id}`, undefined, customer)).request.suggestions,
      undefined,
    );
    assert.equal((await app.call("GET", `/requests/${req.id}/suggestions`, undefined, customer)).status, 403);
    assert.equal(
      (await app.call("GET", `/requests/${req.id}/suggestions`, undefined, supplier.token)).status,
      403,
    );
    const again = await app.call("GET", `/requests/${req.id}/suggestions`, undefined, admin);
    assert.equal(again.status, 200);
    assert.ok(again.suggestions.list.length >= 2);
  });

  it("opens a brokered bid that hides the customer from suppliers and the offers from the customer", async () => {
    const invite = (body) => app.call("POST", `/requests/${req.id}/invitations`, body, admin);
    assert.equal((await invite({ supplierIds: [supplier.supplierId] })).code, "setAFutureDeadlineFor");
    assert.equal(
      (
        await app.call(
          "POST",
          `/requests/${req.id}/invitations`,
          { supplierIds: [supplier.supplierId], dueDate: "2030-01-01" },
          customer,
        )
      ).status,
      403,
    );
    const r = await invite({ supplierIds: [supplier.supplierId, other.supplierId], dueDate: "2030-01-01" });
    assert.equal(r.status, 200, r.error);
    assert.equal(r.request.status, "Sourcing", "inviting takes a new request");
    assert.equal(r.request.sourcing.invited.length, 2);

    const { bids } = await app.call("GET", "/bids", undefined, supplier.token);
    const bid = bids.find((b) => b.id === r.request.sourcing.bidId);
    assert.ok(bid, "the invited supplier sees the bid");
    const seen = JSON.stringify(bid);
    for (const secret of ["Secret Customer AG", "sugg.customer", req.id, "customerId", "requestId"])
      assert.ok(!seen.includes(secret), `the supplier does not see ${secret}`);
    assert.equal(bid.region, "93");

    const offer = await app.call(
      "POST",
      `/bids/${bid.id}/offers`,
      { amount: 12000, deliveryDays: 10 },
      supplier.token,
    );
    assert.equal(offer.status, 201, offer.error);
    const adminNotes = (await app.call("GET", "/notifications", undefined, admin)).notifications;
    assert.ok(
      adminNotes.some((n) => n.text.includes("Commissioning of a robot cell") && /offer/i.test(n.text)),
    );
    const customerNotes = (await app.call("GET", "/notifications", undefined, customer)).notifications;
    assert.ok(
      !customerNotes.some((n) => /Suggested Robotics/.test(n.text)),
      "the customer hears nothing of the offer",
    );

    assert.ok(!(await app.call("GET", "/bids", undefined, customer)).bids.some((b) => b.id === bid.id));
    assert.equal((await app.call("PATCH", `/bids/${bid.id}`, { action: "Close bid" }, customer)).status, 403);
    const award = await app.call(
      "PATCH",
      `/bids/${bid.id}`,
      { action: "Accept offer", offerId: offer.offer.id },
      admin,
    );
    assert.equal(award.code, "theCustomerChoosesAmongThe");

    const { request } = await app.call("GET", `/requests/${req.id}`, undefined, admin);
    assert.equal(
      request.sourcing.invited.find((x) => x.supplierId === supplier.supplierId).offer.amount,
      12000,
    );

    // Questions go between the supplier and the platform
    const q = await app.call(
      "POST",
      `/bids/${bid.id}/clarifications`,
      { offerId: offer.offer.id, text: "Is the site accessible on Saturdays?" },
      supplier.token,
    );
    assert.equal(q.status, 201, q.error);
    assert.equal(
      (
        await app.call(
          "POST",
          `/bids/${bid.id}/clarifications`,
          { offerId: offer.offer.id, text: "Hello" },
          customer,
        )
      ).status,
      403,
    );
    assert.equal(
      (
        await app.call(
          "POST",
          `/bids/${bid.id}/clarifications`,
          { offerId: offer.offer.id, text: "Yes, from 7 am." },
          admin,
        )
      ).status,
      201,
    );
  });

  it("closes the bid round when the request is closed", async () => {
    const closed = await app.call(
      "PATCH",
      `/requests/${req.id}`,
      { action: "close", reason: "Customer postponed" },
      admin,
    );
    assert.equal(closed.request.sourcing.status, "Closed");
    assert.equal(closed.request.sourcing.invited.find((x) => x.offer).offer.status, "Not selected");
  });
});
