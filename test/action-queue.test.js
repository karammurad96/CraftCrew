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
      [["invitation", `/supplier/projects?invite=${phase.tasks[1].id}`]],
    );

    const task = await assignAndAccept(app, customer, supplier, project, phase.tasks[0]);
    const inv = await submitInvoice(app, supplier, project, phase, task, 250);
    const cq = await queue(customer);
    const item = cq.items.find((x) => x.kind === "invoice");
    assert.equal(item.link, `/customer/invoice/${inv.id}`);
    assert.equal(item.text, `Review invoice ${inv.number}`);
    assert.equal(item.amount, inv.amount);
    // The dashboard words it from a key with values, in the user's language (T136)
    assert.deepEqual(item.q, { title: ["reviewInvoice", { number: inv.number }] });
    assert.deepEqual(sq.items[0].q.title, ["taskInvitation", { name: phase.tasks[1].name }]);
  });

  it("gives the supplier dashboard the invitation details (T96)", async () => {
    const sq = await queue(supplier);
    const inv = sq.items.find((x) => x.kind === "invitation");
    assert.equal(inv.invite.projectId, project.id);
    assert.equal(inv.invite.taskId, phase.tasks[1].id);
    assert.equal(inv.invite.name, phase.tasks[1].name);
    assert.equal(inv.invite.phase, phase.name);
    assert.equal(inv.invite.project, project.name);
    assert.equal(inv.invite.dueDate, phase.tasks[1].dueDate);
    assert.equal(typeof inv.invite.orderAmount, "number");
    assert.equal(typeof inv.invite.customer, "string");
    assert.ok(inv.invite.invitedAt, "invitedAt tells which invitation is newest");
  });

  it("gives the customer dashboard the ids it acts on (T95)", async () => {
    const cq = await queue(customer);
    const inv = cq.items.find((x) => x.kind === "invoice");
    assert.ok(inv.invoiceId, "invoice item has invoiceId");
    assert.equal(inv.link, `/customer/invoice/${inv.invoiceId}`);
    assert.match(inv.number, /^\d{4}-\d{4}$/);
    assert.equal(inv.supplier, "Crew GmbH");
    assert.equal(inv.projectId, project.id);

    // An overdue task names its project, task and supplier
    const yesterday = new Date(Date.now() - 86400000).toISOString().slice(0, 10);
    const task = phase.tasks[0];
    const r = await app.call(
      "PATCH",
      `/projects/${project.id}/phases/${phase.id}/tasks/${task.id}`,
      { startDate: new Date(Date.now() - 5 * 86400000).toISOString().slice(0, 10), dueDate: yesterday },
      customer,
    );
    assert.equal(r.status, 200, JSON.stringify(r));
    const late = (await queue(customer)).items.find((x) => x.kind === "overdue");
    assert.equal(late.projectId, project.id);
    assert.equal(late.taskId, task.id);
    assert.equal(late.taskName, task.name);
    assert.equal(late.dueDate, yesterday);
    assert.equal(late.supplier, "Crew GmbH");
  });

  it("lists invoices to mark paid for admins and asks for a signed-in user", async () => {
    const { invoices } = await app.call("GET", "/invoices", undefined, customer);
    await app.call("PATCH", `/invoices/${invoices[0].id}`, { action: "Approve" }, customer);
    const aq = await queue(admin);
    assert.ok(aq.items.some((x) => x.kind === "payment" && x.link === "/admin/billing"));
    assert.equal((await queue()).status, 401);
  });
});
