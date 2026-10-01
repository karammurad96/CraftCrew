// Suppliers only see their own invoices and prices on shared projects, and never the customer budget.
const { describe, it, before, after } = require("node:test");
const assert = require("node:assert/strict");
const { startApp, vettedSupplier, projectWithTasks, assignAndAccept, submitInvoice } = require("./helpers");

describe("supplier privacy on shared projects", () => {
  let app, customer, a, b, project, phase, tasks, invoiceB;
  before(async () => {
    app = await startApp();
    const admin = await app.login("admin@test.local", "Admin-Password-2026!");
    customer = (await app.signup("customer", "buyer@test.local")).token;
    a = await vettedSupplier(app, admin, "a@test.local", "Alpha GmbH");
    b = await vettedSupplier(app, admin, "b@test.local", "Beta GmbH");
    ({ project, phase, tasks } = await projectWithTasks(app, customer));
    for (const [task, amount] of [
      [tasks[0], 5000],
      [tasks[1], 9200],
    ]) {
      const r = await app.call(
        "PATCH",
        `/projects/${project.id}/phases/${phase.id}/tasks/${task.id}`,
        { orderAmount: amount },
        customer,
      );
      assert.equal(r.status, 200, r.error);
    }
    await assignAndAccept(app, customer, a.token, project, tasks[0]);
    await assignAndAccept(app, customer, b.token, project, tasks[1]);
    invoiceB = await submitInvoice(app, b.token, project, phase, tasks[1], 9200);
  });
  after(() => app.stop());

  const taskIn = (p, id) => p.phases.flatMap((ph) => ph.tasks).find((t) => t.id === id);

  it("project detail hides the budget, other suppliers' prices and their invoices", async () => {
    const r = await app.call("GET", `/projects/${project.id}`, undefined, a.token);
    assert.equal(r.status, 200);
    assert.equal(r.project.budget, undefined);
    assert.ok(!r.invoices.some((i) => i.id === invoiceB.id), "no invoice of the other supplier");
    const own = taskIn(r.project, tasks[0].id);
    assert.equal(own.orderAmount, 5000, "own price stays visible");
    assert.equal(taskIn(r.project, tasks[1].id), undefined, "other suppliers' tasks are not shown at all");
    assert.doesNotMatch(JSON.stringify(r.project), new RegExp(b.supplierId || "Beta GmbH"));
  });

  it("project list and dashboard hide the budget and other suppliers' prices", async () => {
    for (const path of ["/projects", "/dashboard"]) {
      const r = await app.call("GET", path, undefined, a.token);
      const p = r.projects.find((x) => x.id === project.id);
      assert.ok(p, `${path} lists the project`);
      assert.equal(p.budget, undefined, `${path} has no budget`);
      assert.equal(taskIn(p, tasks[1].id), undefined, `${path} has no foreign task`);
      assert.equal(taskIn(p, tasks[0].id).orderAmount, 5000);
    }
  });

  it("the customer still sees everything", async () => {
    const own = await submitInvoice(app, a.token, project, phase, tasks[0], 1000);
    const r = await app.call("GET", `/projects/${project.id}`, undefined, customer);
    assert.equal(r.project.budget, 50000);
    assert.deepEqual(r.invoices.map((i) => i.id).sort(), [invoiceB.id, own.id].sort());
    assert.equal(taskIn(r.project, tasks[0].id).orderAmount, 5000);
    assert.equal(taskIn(r.project, tasks[1].id).orderAmount, 9200);
    const d = await app.call("GET", "/dashboard", undefined, customer);
    assert.equal(d.projects.find((x) => x.id === project.id).budget, 50000);
  });
});
