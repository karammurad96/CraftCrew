// Escalations: valid values, admins and the other party are notified, status changes reach both sides.
const { describe, it, before, after } = require("node:test");
const assert = require("node:assert/strict");
const { startApp, vettedSupplier, projectWithTasks, assignAndAccept } = require("./helpers");

describe("escalations", () => {
  let app, admin, customer, supplier, rival, rivalId, project;
  const notes = async (token) =>
    (await app.call("GET", "/notifications", undefined, token)).notifications.map((n) => n.text).join(" | ");
  before(async () => {
    app = await startApp();
    admin = await app.login("admin@test.local", "Admin-Password-2026!");
    customer = (await app.signup("customer", "buyer@test.local")).token;
    supplier = (await vettedSupplier(app, admin, "crew@test.local", "Crew GmbH")).token;
    const r = await vettedSupplier(app, admin, "rival@test.local", "Rival GmbH");
    rival = r.token;
    rivalId = r.supplierId;
    let task;
    ({
      project,
      tasks: [task],
    } = await projectWithTasks(app, customer));
    await assignAndAccept(app, customer, supplier, project, task);
  });
  after(() => app.stop());

  const open = (body, token) => app.call("POST", "/disputes", { projectId: project.id, ...body }, token);

  it("rejects invalid types, short descriptions and suppliers not on the project", async () => {
    assert.equal((await open({ type: "Rant", description: "Nothing works at all" }, customer)).status, 400);
    assert.equal((await open({ type: "Quality", description: "bad" }, customer)).status, 400);
    const r = await open(
      { type: "Quality", description: "Welds fail inspection", supplierId: rivalId },
      customer,
    );
    assert.equal(r.status, 400);
  });

  it("notifies all admins and the supplier when the customer opens an escalation", async () => {
    const { supplier: s } = await app.call("GET", "/profile", undefined, supplier);
    const r = await open(
      { type: "Quality", description: "Welds fail inspection", supplierId: s.id },
      customer,
    );
    assert.equal(r.status, 201, r.error);
    assert.match(await notes(admin), /Escalation opened/);
    assert.match(await notes(supplier), /Escalation opened/);
    assert.doesNotMatch(await notes(rival), /Escalation opened/);
  });

  it("links a supplier's escalation to that supplier and notifies the customer", async () => {
    const r = await open({ type: "Payment", description: "Invoice unpaid for 30 days" }, supplier);
    assert.equal(r.status, 201, r.error);
    const { supplier: s } = await app.call("GET", "/profile", undefined, supplier);
    assert.equal(r.dispute.supplierId, s.id);
    assert.match(await notes(customer), /Escalation opened.*Payment/);
  });

  it("accepts only known statuses and tells both parties about a change", async () => {
    const { disputes } = await app.call("GET", "/disputes", undefined, admin);
    const d = disputes[0];
    assert.equal(
      (await app.call("PATCH", `/admin/disputes/${d.id}`, { status: "Done-ish" }, admin)).status,
      400,
    );
    const r = await app.call(
      "PATCH",
      `/admin/disputes/${d.id}`,
      { status: "Resolved", resolution: "Paid" },
      admin,
    );
    assert.equal(r.status, 200, r.error);
    assert.match(await notes(customer), /is now Resolved/);
    assert.match(await notes(supplier), /is now Resolved/);
  });
});
