// Projects, phases and tasks accept only known statuses, ISO dates in order, valid amounts,
// names of 1-160 characters and dependencies inside the same project.
const { describe, it, before, after } = require("node:test");
const assert = require("node:assert/strict");
const { startApp, vettedSupplier, projectWithTasks, assignAndAccept } = require("./helpers");

describe("project, phase and task validation", () => {
  let app, customer, supplier, project, phase, tasks, other;
  const P = () => `/projects/${project.id}`;
  const expect400 = async (method, url, body, token = customer) => {
    const r = await app.call(method, url, body, token);
    assert.equal(r.status, 400, `${method} ${url} ${JSON.stringify(body)} → ${r.status}`);
    assert.ok(r.error, "a message explains the problem");
  };
  const expectOk = async (method, url, body, token = customer) => {
    const r = await app.call(method, url, body, token);
    assert.ok(r.status === 200 || r.status === 201, `${method} ${url} → ${r.status} ${r.error || ""}`);
    return r;
  };
  before(async () => {
    app = await startApp();
    const admin = await app.login("admin@test.local", "Admin-Password-2026!");
    customer = (await app.signup("customer", "buyer@test.local")).token;
    supplier = (await vettedSupplier(app, admin, "crew@test.local", "Crew GmbH")).token;
    ({ project, phase, tasks } = await projectWithTasks(app, customer));
    other = await projectWithTasks(app, customer, { tasks: ["Elsewhere"] });
  });
  after(() => app.stop());

  it("project: status, dates, budget and name", async () => {
    await expect400("PUT", P(), { status: "Almost done" });
    await expect400("PUT", P(), { dueDate: "next week" });
    await expect400("PUT", P(), { startDate: "2030-05-10", dueDate: "2030-05-01" });
    await expect400("PUT", P(), { budget: -5 });
    await expect400("PUT", P(), { name: "x".repeat(161) });
    await expect400("POST", "/projects", {
      name: "Bad dates",
      description: "d",
      budget: 1000,
      startDate: "2030-01-10",
      dueDate: "2030/01/20",
    });
    const r = await expectOk("PUT", P(), {
      status: "On Hold",
      budget: 0,
      name: "Renamed",
      startDate: "2030-01-01",
      dueDate: "2030-06-30",
    });
    assert.equal(r.project.status, "On Hold");
  });

  it("phase: status, dates, order amount and dependencies", async () => {
    const url = `${P()}/phases/${phase.id}`;
    await expect400("PUT", url, { status: "Whatever" });
    await expect400("PUT", url, { startDate: "2030-03-10", dueDate: "2030-03-01" });
    await expect400("PUT", url, { orderAmount: "abc" });
    await expect400("PUT", url, { dependencies: [other.phase.id] });
    await expect400("POST", `${P()}/phases`, { name: "", dueDate: "2030-02-01" });
    await expect400("POST", `${P()}/phases`, { name: "Late", dueDate: "2030-02-30x" });
    const created = await expectOk("POST", `${P()}/phases`, {
      name: "Handover",
      startDate: "2030-02-01",
      dueDate: "2030-02-10",
      dependencies: [phase.id],
      subtasks: [{ text: "Sign", done: true }, "Hand over keys", { bogus: 1 }],
    });
    assert.deepEqual(
      created.phase.subtasks.map((x) => [x.name, x.done]),
      [
        ["Sign", true],
        ["Hand over keys", false],
      ],
    );
    await expectOk("PUT", url, { status: "Under Review", orderAmount: 1200, dependencies: [] });
  });

  it("task: status, dates, order amount, name and dependencies", async () => {
    const url = `${P()}/phases/${phase.id}/tasks/${tasks[0].id}`;
    await expect400("PATCH", url, { status: "Totally Done!!" });
    await expect400("PATCH", url, { dueDate: "tomorrow" });
    await expect400("PATCH", url, { orderAmount: -1 });
    await expect400("PATCH", url, { name: "   " });
    await expect400("PATCH", url, { dependencies: [other.tasks[0].id] });
    await expect400("POST", `${P()}/phases/${phase.id}/tasks`, {
      name: "Backwards",
      startDate: "2030-04-10",
      dueDate: "2030-04-01",
    });
    await expectOk("POST", `${P()}/phases/${phase.id}/tasks`, {
      name: "Wiring",
      startDate: "2030-04-01",
      dueDate: "2030-04-10",
      dependencies: [tasks[1].id, phase.id],
    });
    await expectOk("PATCH", url, { status: "In Progress", orderAmount: 500, dependencies: [tasks[1].id] });
  });

  it("suppliers set only work statuses, and only on tasks they accepted", async () => {
    const url = (t) => `${P()}/phases/${phase.id}/tasks/${t.id}`;
    const { supplier: s } = await app.call("GET", "/profile", undefined, supplier);
    await app.call(`POST`, `${P()}/tasks/${tasks[1].id}/assign`, { supplierId: s.id }, customer);
    const pending = await app.call("PATCH", url(tasks[1]), { status: "In Progress" }, supplier);
    assert.equal(pending.status, 404, "not accepted yet: an invited supplier cannot reach the task");
    await assignAndAccept(app, customer, supplier, project, tasks[0]);
    await expect400("PATCH", url(tasks[0]), { status: "Totally Done!!" }, supplier);
    await expect400("PATCH", url(tasks[0]), { status: "Not Started" }, supplier);
    const r = await expectOk("PATCH", url(tasks[0]), { status: "Under Review" }, supplier);
    assert.equal(r.task.status, "Under Review");
  });
});
