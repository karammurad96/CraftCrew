// T230: every request belongs to a project, and its work packages are tasks of that project: chosen open tasks,
// or new ones the server adds. Without effort, the hours are estimated from the wished dates.
const { describe, it, before, after } = require("node:test");
const assert = require("node:assert/strict");
const { startApp, projectWithTasks, vettedSupplier, assignAndAccept } = require("./helpers");

describe("request projects and work packages", () => {
  let app, admin, customer, other, project, phase;
  const send = (body, token = customer) =>
    app.call(
      "POST",
      "/requests",
      { title: "Line 5 automation", description: "Automation of the new line 5 in hall C.", ...body },
      token,
    );
  const projectOf = async (id) => (await app.call("GET", `/projects/${id}`, undefined, customer)).project;
  before(async () => {
    app = await startApp({ env: { PLATFORM_MODE: "brokered" } });
    admin = await app.login("admin@test.local", "Admin-Password-2026!");
    await app.signup("customer", "pkg.customer@test.local");
    await app.signup("customer", "pkg.other@test.local");
    customer = await app.login("pkg.customer@test.local", "Test-Password-2026");
    other = await app.login("pkg.other@test.local", "Test-Password-2026");
    ({ project, phase } = await projectWithTasks(app, customer, {
      tasks: ["Wiring", "PLC program", "Taken"],
    }));
  });
  after(() => app?.stop());

  it("creates a project with one task when the request names none", async () => {
    const r = await send({ category: "Commissioning", startDate: "2026-11-02", dueDate: "2026-11-13" });
    assert.equal(r.status, 201, r.error);
    const req = r.request;
    assert.ok(req.projectId);
    assert.equal(req.packages.length, 1);
    assert.equal(req.packages[0].hours, 80, "ten working days of eight hours");
    assert.equal(req.packages[0].rough, true);
    const p = await projectOf(req.projectId);
    assert.equal(p.name, "Line 5 automation");
    const task = p.phases.flatMap((ph) => ph.tasks).find((t) => t.id === req.taskId);
    assert.equal(task.name, "Line 5 automation");
    assert.equal(task.estimatedHours, 80);
  });

  it("takes open tasks of an existing project and adds new packages to it", async () => {
    const [wiring, plc] = phase.tasks;
    const r = await send({
      projectId: project.id,
      packages: [
        { taskId: wiring.id, category: "Electrical Engineering", hours: 120 },
        { taskId: plc.id, category: "PLC Programming", hours: 80 },
        { name: "Safety acceptance", category: "Commissioning" },
      ],
    });
    assert.equal(r.status, 201, r.error);
    const req = r.request;
    assert.equal(req.projectId, project.id);
    assert.deepEqual(
      req.packages.map((x) => [x.name, x.category, x.hours, !!x.rough]),
      [
        ["Wiring", "Electrical Engineering", 120, false],
        ["PLC program", "PLC Programming", 80, false],
        ["Safety acceptance", "Commissioning", 40, true],
      ],
    );
    assert.equal(req.taskId, null, "several packages: no single task");
    const p = await projectOf(project.id);
    const added = p.phases.find((ph) => ph.name === "Requested work").tasks;
    assert.deepEqual(
      added.map((t) => t.name),
      ["Safety acceptance"],
    );
    assert.equal(req.packages[2].taskId, added[0].id);
  });

  it("refuses foreign projects, assigned tasks, duplicates and bad packages", async () => {
    const supplier = await vettedSupplier(app, admin, "pkg.supplier@test.local", "Pkg GmbH");
    const taken = phase.tasks[2];
    // An assigned task (assigned directly, in marketplace mode)
    await app.call("PUT", "/admin/platform-mode", { mode: "marketplace" }, admin);
    await assignAndAccept(app, customer, supplier.token, project, taken);
    await app.call("PUT", "/admin/platform-mode", { mode: "brokered" }, admin);
    for (const [body, code, token] of [
      [
        { projectId: project.id, packages: [{ taskId: taken.id, category: "Commissioning" }] },
        "chooseOpenTasksOfThe",
      ],
      [
        { projectId: project.id, packages: [{ taskId: "tsk_x", category: "Commissioning" }] },
        "chooseOpenTasksOfThe",
      ],
      [
        {
          projectId: project.id,
          packages: [phase.tasks[0], phase.tasks[0]].map((t) => ({
            taskId: t.id,
            category: "Commissioning",
          })),
        },
        "chooseOpenTasksOfThe",
      ],
      [
        { projectId: project.id, packages: [{ name: "Painting", category: "Knitting" }] },
        "chooseACategoryFromThe",
      ],
      [{ packages: [{ name: "x", category: "Commissioning" }] }, "giveEveryWorkPackageA"],
      [{ packages: [{ name: "Big", category: "Commissioning", hours: 9000 }] }, "enterTheEffortInHours"],
      [
        { packages: Array.from({ length: 11 }, (_, i) => ({ name: "P" + i, category: "Commissioning" })) },
        "aRequestCanHaveUp",
      ],
      [{ projectId: project.id, category: "Commissioning" }, "theSelectedProjectPhaseOr", other],
    ]) {
      const r = await send(body, token || customer);
      assert.equal(r.status, 400, JSON.stringify(body).slice(0, 80));
      assert.equal(r.code, code, JSON.stringify(body).slice(0, 80));
    }
  });
});
