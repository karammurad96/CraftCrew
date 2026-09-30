// Re-ordering phases never drops a phase.
const { describe, it, before, after } = require("node:test");
const assert = require("node:assert/strict");
const { startApp } = require("./helpers");

describe("phase re-ordering", () => {
  let app, customer, project;
  const ids = async () =>
    (await app.call("GET", `/projects/${project.id}`, undefined, customer)).project.phases.map((ph) => ph.id);
  const reorder = (body) => app.call("POST", `/projects/${project.id}/reorder`, body, customer);
  before(async () => {
    app = await startApp();
    customer = (await app.signup("customer", "planner@test.local")).token;
    const dueDate = new Date(Date.now() + 90 * 86400000).toISOString().slice(0, 10);
    project = (
      await app.call(
        "POST",
        "/projects",
        {
          name: "Reorder project",
          description: "Five phases",
          budget: 1000,
          dueDate,
          phases: ["P1", "P2", "P3", "P4", "P5"].map((name) => ({ name, tasks: [] })),
        },
        customer,
      )
    ).project;
    assert.equal(project.phases.length, 5);
  });
  after(() => app.stop());

  it("a partial list moves the listed phase first and keeps all phases", async () => {
    const old = await ids();
    const last = old.at(-1);
    const r = await reorder({ phaseIds: [last] });
    assert.equal(r.status, 200);
    assert.deepEqual(
      r.project.phases.map((ph) => ph.id),
      [last, ...old.slice(0, -1)],
    );
    assert.deepEqual(await ids(), [last, ...old.slice(0, -1)]);
  });

  it("a full list sets the given order", async () => {
    const reversed = (await ids()).reverse();
    assert.equal((await reorder({ phaseIds: reversed })).status, 200);
    assert.deepEqual(await ids(), reversed);
  });

  it("invalid lists are refused and leave the phases unchanged", async () => {
    const old = await ids();
    for (const body of [{}, { phaseIds: "x" }, { phaseIds: [old[0], old[0]] }, { phaseIds: ["phs_other"] }]) {
      const r = await reorder(body);
      assert.equal(r.status, 400, JSON.stringify(body));
      assert.deepEqual(await ids(), old);
    }
  });
});
