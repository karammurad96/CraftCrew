// T61: public reliability metrics on supplier profiles; rates need 3 data points and risk data never goes public.
const { describe, it, before, after } = require("node:test");
const assert = require("node:assert/strict");
const { startApp, vettedSupplier, projectWithTasks, assignAndAccept, submitInvoice } = require("./helpers");

const PRIVATE = /"(risks|riskLevel|riskNotes|verification|score|decisionNote)"/;

describe("public reliability metrics", () => {
  let app, admin, customer, veteran, newcomer;
  const profile = async (id) => (await app.call("GET", `/suppliers/${id}`)).supplier;
  before(async () => {
    app = await startApp();
    admin = await app.login("admin@test.local", "Admin-Password-2026!");
    customer = (await app.signup("customer", "buyer@test.local")).token;
    veteran = await vettedSupplier(app, admin, "veteran@test.local", "Veteran GmbH");
    newcomer = await vettedSupplier(app, admin, "new@test.local", "Newcomer GmbH");
  });
  after(() => app.stop());

  it("shows 'new' with no rates for a supplier without history", async () => {
    const r = (await profile(newcomer.supplierId)).reliability;
    assert.deepEqual(r, {
      onTimeRate: null,
      firstTimeRightRate: null,
      responseRate: null,
      completed: 0,
      reviews: 0,
      isNew: true,
    });
  });

  it("shows rates once there are 3 data points each", async () => {
    const { project, phase } = await projectWithTasks(app, customer, { tasks: ["A", "B", "C"] });
    for (const t of phase.tasks) {
      const task = await assignAndAccept(app, customer, veteran.token, project, t);
      const inv = await submitInvoice(app, veteran.token, project, phase, task, 500);
      assert.equal(
        (await app.call("PATCH", `/invoices/${inv.id}`, { action: "Approve" }, customer)).status,
        200,
      );
      const done = await app.call(
        "PATCH",
        `/projects/${project.id}/phases/${phase.id}/tasks/${t.id}`,
        { status: "Completed" },
        customer,
      );
      assert.equal(done.status, 200, done.error);
    }
    // Two invitations: still below 3, so the answer rate stays hidden.
    const invite = async (n) => {
      const { project: p, phase: ph } = await projectWithTasks(app, customer, { tasks: ["Quote " + n] });
      const r = await app.call(
        "POST",
        "/bids",
        {
          projectId: p.id,
          phaseId: ph.id,
          taskId: ph.tasks[0].id,
          title: "Quote " + n,
          dueDate: new Date(Date.now() + 10 * 86400000).toISOString().slice(0, 10),
          invitedSupplierIds: [veteran.supplierId],
        },
        customer,
      );
      assert.equal(r.status, 201, r.error);
      return r.bid;
    };
    for (const n of [1, 2]) {
      const bid = await invite(n);
      await app.call("POST", `/bids/${bid.id}/offers`, { amount: 1000, deliveryDays: 5 }, veteran.token);
    }
    let r = (await profile(veteran.supplierId)).reliability;
    assert.equal(r.onTimeRate, 100);
    assert.equal(r.firstTimeRightRate, 100);
    assert.equal(r.responseRate, null);
    assert.equal(r.completed, 3);
    assert.equal(r.isNew, false);
    await invite(3);
    r = (await profile(veteran.supplierId)).reliability;
    assert.equal(r.responseRate, 67, "2 of 3 invitations answered");
  });

  it("keeps risk fields and vetting notes out of the public endpoints", async () => {
    const one = await app.call("GET", `/suppliers/${veteran.supplierId}`);
    const list = await app.call("GET", "/suppliers");
    assert.equal(one.status, 200);
    assert.ok(list.suppliers.every((s) => s.reliability));
    for (const body of [one, list]) assert.doesNotMatch(JSON.stringify(body), PRIVATE);
    // The private scorecard still has them for customers who work with the supplier.
    const card = await app.call("GET", `/suppliers/${veteran.supplierId}/scorecard`, undefined, customer);
    assert.ok(Array.isArray(card.scorecard.risks));
  });
});
