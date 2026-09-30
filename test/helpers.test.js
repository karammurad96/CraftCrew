// Checks the shared test fixtures in helpers.js.
const { describe, it, before, after } = require("node:test");
const assert = require("node:assert/strict");
const { startApp, vettedSupplier, projectWithTasks, assignAndAccept, submitInvoice } = require("./helpers");

describe("shared test helpers", () => {
  let app, admin, customer;
  before(async () => {
    app = await startApp();
    admin = await app.login("admin@test.local", "Admin-Password-2026!");
    customer = (await app.signup("customer", "buyer@test.local")).token;
  });
  after(() => app.stop());

  it("builds a vetted supplier, a project, an accepted task and an invoice", async () => {
    const s = await vettedSupplier(app, admin, "crew@test.local", "Crew Automation GmbH");
    assert.ok(s.token && s.supplierId);
    assert.equal(s.user.email, "crew@test.local");
    const { suppliers } = await app.call("GET", "/suppliers");
    assert.ok(
      suppliers.some((x) => x.id === s.supplierId),
      "the vetted supplier is listed",
    );

    const { project, phase, tasks } = await projectWithTasks(app, customer, { tasks: ["PLC", "Wiring"] });
    assert.ok(project.id && phase.id);
    assert.deepEqual(
      tasks.map((t) => t.name),
      ["PLC", "Wiring"],
    );
    assert.equal((await projectWithTasks(app, customer)).tasks.length, 2, "defaults to two tasks");

    const task = await assignAndAccept(app, customer, s.token, project, tasks[0]);
    assert.equal(task.assignedSupplierId, s.supplierId);
    assert.equal(task.acceptanceStatus, "Accepted");

    const invoice = await submitInvoice(app, s.token, project, phase, tasks[0], 1234.5);
    assert.equal(invoice.amount, 1234.5);
    assert.equal(invoice.status, "Submitted");
    assert.equal(invoice.supplierId, s.supplierId);
    assert.equal(invoice.lineItems[0].service, "PLC programming");
  });
});
