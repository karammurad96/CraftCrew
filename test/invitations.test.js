// Selecting a supplier is only an invitation: work, time and invoices start after the supplier accepts.
const { describe, it, before, after } = require("node:test");
const assert = require("node:assert/strict");
const { startApp, vettedSupplier, projectWithTasks } = require("./helpers");

describe("task invitations", () => {
  let app, admin, customer, supplier, other, supplierId, otherId, project, phase, task;
  const notes = async (token) =>
    (await app.call("GET", "/notifications", undefined, token)).notifications.map((n) => `${n.text} -> ${n.link}`).join(" | ");
  const assign = (sid) =>
    app.call("POST", `/projects/${project.id}/tasks/${task.id}/assign`, { supplierId: sid }, customer);
  const answer = (token, accept, reason) =>
    app.call("POST", `/projects/${project.id}/tasks/${task.id}/accept`, { accept, reason }, token);
  const getTask = async () =>
    (await app.call("GET", `/projects/${project.id}`, undefined, customer)).project.phases[0].tasks[0];

  before(async () => {
    app = await startApp();
    admin = await app.login("admin@test.local", "Admin-Password-2026!");
    customer = (await app.signup("customer", "buyer@test.local")).token;
    supplier = (await vettedSupplier(app, admin, "crew@test.local", "Crew GmbH")).token;
    other = (await vettedSupplier(app, admin, "other@test.local", "Other KG")).token;
    supplierId = (await app.call("GET", "/profile", undefined, supplier)).supplier.id;
    otherId = (await app.call("GET", "/profile", undefined, other)).supplier.id;
    ({ project, phase } = await projectWithTasks(app, customer));
    task = phase.tasks[0];
  });
  after(() => app.stop());

  it("sends an invitation that links straight to the answer", async () => {
    assert.equal((await assign(supplierId)).status, 200);
    const t = await getTask();
    assert.equal(t.acceptanceStatus, "Pending");
    assert.equal(t.status, "Not Started");
    assert.match(await notes(supplier), new RegExp(`/supplier/projects\\?invite=${task.id}`));
    assert.equal((await assign(supplierId)).status, 409, "no second invitation to the same supplier");
  });
  it("blocks work, invoices and status changes until the supplier accepts", async () => {
    const start = await app.call(
      "PATCH",
      `/projects/${project.id}/phases/${phase.id}/tasks/${task.id}`,
      { status: "In Progress" },
      customer,
    );
    assert.equal(start.status, 409);
    assert.match(start.error, /not accepted/);
    assert.equal(
      (await app.call("PATCH", `/projects/${project.id}/phases/${phase.id}/tasks/${task.id}`, { progress: 30 }, supplier))
        .status,
      403,
    );
    const inv = await app.call(
      "POST",
      "/invoices",
      { projectId: project.id, phaseId: phase.id, taskId: task.id, description: "Early", amount: 100 },
      supplier,
    );
    assert.equal(inv.status, 409);
    assert.equal((await app.call("GET", "/planning", undefined, supplier)).jobs.length, 0, "not plannable yet");
  });
  it("lets the customer withdraw an open invitation", async () => {
    assert.equal((await app.call("POST", `/projects/${project.id}/tasks/${task.id}/withdraw`, {}, customer)).status, 200);
    const t = await getTask();
    assert.equal(t.assignedSupplierId, null);
    assert.equal(t.assignmentHistory.at(-1).status, "Withdrawn");
    assert.match(await notes(supplier), /Task invitation withdrawn/);
    assert.equal((await answer(supplier, true)).status, 403, "a withdrawn invitation cannot be accepted");
    assert.equal(
      (await app.call("POST", `/projects/${project.id}/tasks/${task.id}/withdraw`, {}, customer)).status,
      409,
    );
  });
  it("tells the customer why a supplier declined", async () => {
    await assign(otherId);
    assert.equal((await answer(other, false, "No capacity in October")).status, 200);
    const t = await getTask();
    assert.equal(t.acceptanceStatus, "Declined");
    assert.equal(t.assignmentHistory.at(-1).reason, "No capacity in October");
    assert.match(await notes(customer), /declined .*: No capacity in October/);
  });
  it("starts the work once the supplier accepts, and only once", async () => {
    await assign(supplierId);
    assert.equal((await answer(supplier, true)).status, 200);
    assert.equal((await answer(supplier, false)).status, 409, "an answered invitation cannot be changed");
    const t = await getTask();
    assert.equal(t.acceptanceStatus, "Accepted");
    assert.equal(t.status, "In Progress");
    assert.equal(
      (await app.call("PATCH", `/projects/${project.id}/phases/${phase.id}/tasks/${task.id}`, { progress: 30 }, supplier))
        .status,
      200,
    );
    assert.equal((await app.call("GET", "/planning", undefined, supplier)).jobs.length, 1);
  });
});
