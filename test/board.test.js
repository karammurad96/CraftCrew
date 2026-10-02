// Task board side panel (T99): the checklist of a task can be ticked by the customer and by the accepted,
// assigned supplier; only the customer changes the list itself.
const { describe, it, before, after } = require("node:test");
const assert = require("node:assert/strict");
const { startApp, vettedSupplier, projectWithTasks, assignAndAccept } = require("./helpers");

describe("board checklist", () => {
  let app, admin, customer, supplier, other, project, phase, task;
  const patch = (body, token) =>
    app.call("PATCH", `/projects/${project.id}/phases/${phase.id}/tasks/${task.id}`, body, token);
  const items = async () =>
    (await app.call("GET", `/projects/${project.id}`, undefined, customer)).project.phases[0].tasks.find(
      (t) => t.id === task.id,
    ).subtasks;

  before(async () => {
    app = await startApp();
    admin = await app.login("admin@test.local", "Admin-Password-2026!");
    customer = (await app.signup("customer", "board-buyer@test.local")).token;
    supplier = (await vettedSupplier(app, admin, "board-crew@test.local", "Board Crew GmbH")).token;
    other = (await vettedSupplier(app, admin, "board-other@test.local", "Other GmbH")).token;
    ({ project, phase } = await projectWithTasks(app, customer));
    task = phase.tasks[0];
    const r = await patch({ subtasks: [{ name: "Frame welded" }, { name: "Guarding fitted" }] }, customer);
    assert.equal(r.status, 200);
  });
  after(() => app.stop());

  it("lets the customer tick an item and keeps it after a reload", async () => {
    const list = await items();
    list[0].done = true;
    assert.equal((await patch({ subtasks: list }, customer)).status, 200);
    assert.deepEqual(
      (await items()).map((x) => x.done),
      [true, false],
    );
  });

  it("lets the accepted supplier tick items but not change the list", async () => {
    await assignAndAccept(app, customer, supplier, project, task);
    const list = await items();
    const sent = [
      { ...list[0], done: false },
      { ...list[1], done: true, name: "Renamed" },
      { id: "new", name: "Added by supplier", done: true },
    ];
    assert.equal((await patch({ subtasks: sent }, supplier)).status, 200);
    const after = await items();
    assert.deepEqual(
      after.map((x) => [x.name, x.done]),
      [
        ["Frame welded", false],
        ["Guarding fitted", true],
      ],
    );
  });

  it("refuses suppliers who are not assigned to the task", async () => {
    const list = await items();
    const r = await patch({ subtasks: list.map((x) => ({ ...x, done: true })) }, other);
    assert.notEqual(r.status, 200);
    assert.deepEqual(
      (await items()).map((x) => x.done),
      [false, true],
    );
  });
});
