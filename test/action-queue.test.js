// Dashboard action queue: each role sees what needs doing, with a link to the page that resolves it.
const { describe, it, before, after } = require("node:test");
const assert = require("node:assert/strict");
const { startApp, vettedSupplier, projectWithTasks, assignAndAccept, submitInvoice } = require("./helpers");

describe("action queue", () => {
  let app, admin, customer, supplier, project, phase;
  const queue = (token) => app.call("GET", "/action-queue", undefined, token);
  before(async () => {
    app = await startApp();
    admin = await app.login("admin@test.local", "Admin-Password-2026!");
    customer = (await app.signup("customer", "buyer@test.local")).token;
    supplier = (await vettedSupplier(app, admin, "crew@test.local", "Crew GmbH")).token;
    ({ project, phase } = await projectWithTasks(app, customer));
  });
  after(() => app.stop());

  it("is empty with the next deadline when nothing needs doing", async () => {
    const q = await queue(customer);
    assert.equal(q.status, 200);
    assert.deepEqual(q.items, []);
    assert.equal(q.nextDeadline?.link, `/customer/projects/${project.id}`);
  });

  it("lists a supplier's task invitation and the customer's invoice to review", async () => {
    const { supplier: s } = await app.call("GET", "/profile", undefined, supplier);
    await app.call(
      "POST",
      `/projects/${project.id}/tasks/${phase.tasks[1].id}/assign`,
      { supplierId: s.id },
      customer,
    );
    const sq = await queue(supplier);
    assert.deepEqual(
      sq.items.map((x) => [x.kind, x.link]),
      [["invitation", "/supplier/projects"]],
    );

    const task = await assignAndAccept(app, customer, supplier, project, phase.tasks[0]);
    const inv = await submitInvoice(app, supplier, project, phase, task, 250);
    const cq = await queue(customer);
    const item = cq.items.find((x) => x.kind === "invoice");
    assert.equal(item.link, `/customer/invoice/${inv.id}`);
    assert.equal(item.text, `Review invoice ${inv.number}`);
    assert.equal(item.amount, inv.amount);
  });

  it("lists invoices to mark paid for admins and asks for a signed-in user", async () => {
    const { invoices } = await app.call("GET", "/invoices", undefined, customer);
    await app.call("PATCH", `/invoices/${invoices[0].id}`, { action: "Approve" }, customer);
    const aq = await queue(admin);
    assert.ok(aq.items.some((x) => x.kind === "payment" && x.link === "/admin/billing"));
    assert.equal((await queue()).status, 401);
  });
});
