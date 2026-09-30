// Financial records are never deleted: projects with records are archived, phases and tasks are guarded.
const { describe, it, before, after } = require("node:test");
const assert = require("node:assert/strict");
const { startApp, vettedSupplier, projectWithTasks, assignAndAccept, submitInvoice } = require("./helpers");

describe("archiving instead of deleting financial records", () => {
  let app, admin, customer, supplier;
  const invoiceIds = async (token) =>
    (await app.call("GET", "/invoices", undefined, token)).invoices.map((i) => i.id);
  const projectIds = async (token, query = "") =>
    (await app.call("GET", "/projects" + query, undefined, token)).projects.map((p) => p.id);
  before(async () => {
    app = await startApp();
    admin = await app.login("admin@test.local", "Admin-Password-2026!");
    customer = (await app.signup("customer", "owner@test.local")).token;
    supplier = (await vettedSupplier(app, admin, "vendor@test.local", "Vendor GmbH")).token;
  });
  after(() => app.stop());

  it("deleting a project with an invoice archives it and keeps the invoice", async () => {
    const { project, phase, tasks } = await projectWithTasks(app, customer);
    const task = await assignAndAccept(app, customer, supplier, project, tasks[0]);
    const inv = await submitInvoice(app, supplier, project, phase, task, 1500);

    const del = await app.call("DELETE", `/projects/${project.id}`, undefined, customer);
    assert.equal(del.status, 200);
    assert.equal(del.archived, true);

    const got = await app.call("GET", `/projects/${project.id}`, undefined, customer);
    assert.equal(got.project.status, "Archived");
    assert.ok(got.project.archivedAt);
    assert.ok(got.project.archivedBy);
    assert.ok((await invoiceIds(supplier)).includes(inv.id));
    assert.ok((await invoiceIds(admin)).includes(inv.id));

    assert.ok(!(await projectIds(customer)).includes(project.id));
    assert.ok((await projectIds(customer, "?archived=1")).includes(project.id));
  });

  it("every write to an archived project returns 409", async () => {
    const { project, phase, tasks } = await projectWithTasks(app, customer);
    const task = await assignAndAccept(app, customer, supplier, project, tasks[0]);
    await submitInvoice(app, supplier, project, phase, task, 500);
    assert.equal((await app.call("DELETE", `/projects/${project.id}`, undefined, customer)).archived, true);

    const writes = [
      ["PUT", `/projects/${project.id}`, { name: "Renamed" }, customer],
      ["POST", `/projects/${project.id}/phases`, { name: "New phase", dueDate: "2027-01-31" }, customer],
      ["PUT", `/projects/${project.id}/phases/${phase.id}`, { name: "Renamed phase" }, customer],
      ["POST", `/projects/${project.id}/phases/${phase.id}/tasks`, { name: "New task" }, customer],
      [
        "PATCH",
        `/projects/${project.id}/phases/${phase.id}/tasks/${task.id}`,
        { status: "Completed" },
        supplier,
      ],
      ["DELETE", `/projects/${project.id}/phases/${phase.id}/tasks/${tasks[1].id}`, undefined, customer],
      ["DELETE", `/projects/${project.id}`, undefined, customer],
    ];
    for (const [method, path, body, token] of writes) {
      const r = await app.call(method, path, body, token);
      assert.equal(r.status, 409, `${method} ${path}`);
      assert.match(r.error, /archived/);
    }
    const got = await app.call("GET", `/projects/${project.id}`, undefined, customer);
    assert.equal(got.project.name, "Test project");
    assert.equal(got.project.phases[0].tasks.length, 2);
  });

  it("an empty project is really deleted", async () => {
    const { project } = await projectWithTasks(app, customer);
    const del = await app.call("DELETE", `/projects/${project.id}`, undefined, customer);
    assert.equal(del.status, 200);
    assert.equal(del.archived, false);
    assert.equal((await app.call("GET", `/projects/${project.id}`, undefined, customer)).status, 404);
    assert.ok(!(await projectIds(customer, "?archived=1")).includes(project.id));
  });

  it("a task with an invoice cannot be deleted", async () => {
    const { project, phase, tasks } = await projectWithTasks(app, customer);
    const task = await assignAndAccept(app, customer, supplier, project, tasks[0]);
    const inv = await submitInvoice(app, supplier, project, phase, task, 700);
    const r = await app.call(
      "DELETE",
      `/projects/${project.id}/phases/${phase.id}/tasks/${task.id}`,
      undefined,
      customer,
    );
    assert.equal(r.status, 409);
    assert.equal(r.error, "This task has invoices, so it cannot be deleted.");
    assert.ok((await invoiceIds(admin)).includes(inv.id));
    const got = await app.call("GET", `/projects/${project.id}`, undefined, customer);
    assert.ok(got.project.phases[0].tasks.some((t) => t.id === task.id));
  });

  it("a phase with an assigned supplier cannot be deleted", async () => {
    const { project, phase, tasks } = await projectWithTasks(app, customer);
    await assignAndAccept(app, customer, supplier, project, tasks[0]);
    const r = await app.call("DELETE", `/projects/${project.id}/phases/${phase.id}`, undefined, customer);
    assert.equal(r.status, 409);
    assert.equal(r.error, "Remove supplier assignments and resolve invoices before deleting this phase.");
    const got = await app.call("GET", `/projects/${project.id}`, undefined, customer);
    assert.ok(got.project.phases.some((ph) => ph.id === phase.id));
  });

  it("an unused phase can still be deleted", async () => {
    const { project } = await projectWithTasks(app, customer);
    const added = await app.call(
      "POST",
      `/projects/${project.id}/phases`,
      { name: "Spare phase", dueDate: "2027-01-31" },
      customer,
    );
    const ph = added.project?.phases?.at(-1) || added.phase;
    const r = await app.call("DELETE", `/projects/${project.id}/phases/${ph.id}`, undefined, customer);
    assert.equal(r.status, 200);
  });
});
