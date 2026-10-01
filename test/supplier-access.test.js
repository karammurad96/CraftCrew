// A supplier sees only its own work on a customer's project — and only the invitation before accepting.
const { describe, it, before, after } = require("node:test");
const assert = require("node:assert/strict");
const { startApp, vettedSupplier } = require("./helpers");

const inDays = (n) => new Date(Date.now() + n * 86400000).toISOString().slice(0, 10);
const pdf = (name) => ({
  filename: name,
  content: "data:application/pdf;base64," + Buffer.from("%PDF-1.4 " + name).toString("base64"),
});

describe("supplier access to customer projects", () => {
  let app, admin, customer, crew, rival, crewId, rivalId, project, ph1, ph2, taskA, taskB, taskC;
  const view = (token) => app.call("GET", `/projects/${project.id}`, undefined, token);
  before(async () => {
    app = await startApp();
    admin = await app.login("admin@test.local", "Admin-Password-2026!");
    customer = (await app.signup("customer", "buyer@test.local", { company: "Plant GmbH" })).token;
    crew = (await vettedSupplier(app, admin, "crew@test.local", "Crew GmbH")).token;
    rival = (await vettedSupplier(app, admin, "rival@test.local", "Rival KG")).token;
    crewId = (await app.call("GET", "/profile", undefined, crew)).supplier.id;
    rivalId = (await app.call("GET", "/profile", undefined, rival)).supplier.id;
    project = (
      await app.call(
        "POST",
        "/projects",
        {
          name: "Line 9",
          description: "Confidential scope",
          budget: 90000,
          dueDate: inDays(90),
          phases: [
            { name: "Engineering", tasks: ["PLC", "Safety"] },
            { name: "Install", tasks: ["Cabling"] },
          ],
        },
        customer,
      )
    ).project;
    [ph1, ph2] = project.phases;
    [taskA, taskB] = ph1.tasks;
    [taskC] = ph2.tasks;
    await app.call("PATCH", `/projects/${project.id}/phases/${ph1.id}/tasks/${taskB.id}`, { dependencies: [taskA.id] }, customer);
    // The rival works on task A; the crew is only invited to task B.
    await app.call("POST", `/projects/${project.id}/tasks/${taskA.id}/assign`, { supplierId: rivalId }, customer);
    await app.call("POST", `/projects/${project.id}/tasks/${taskA.id}/accept`, { accept: true }, rival);
    await app.call("POST", `/projects/${project.id}/tasks/${taskB.id}/assign`, { supplierId: crewId }, customer);
  });
  after(() => app.stop());

  it("shows an invited supplier only the invitation", async () => {
    const r = await view(crew);
    assert.equal(r.status, 200);
    const p = r.project;
    assert.equal(p.involvement, "invited");
    assert.equal(p.description, "", "no project scope before accepting");
    assert.equal(p.budget, undefined);
    assert.equal(p.participantIds, undefined);
    assert.deepEqual(p.phases.map((x) => x.name), ["Engineering"], "only the phase with the invitation");
    assert.deepEqual(p.phases[0].tasks.map((t) => t.name), ["Safety"], "only the invited task");
    assert.deepEqual(r.suppliers.map((s) => s.id), [crewId], "no list of other companies");
    // Invited suppliers cannot use the project yet.
    for (const [method, path] of [
      ["GET", `/projects/${project.id}/documents`],
      ["GET", `/projects/${project.id}/activity`],
    ])
      assert.equal((await app.call(method, path, undefined, crew)).status, 404, path);
  });
  it("after accepting: own work and what it depends on, nothing about other suppliers", async () => {
    await app.call("POST", `/projects/${project.id}/tasks/${taskB.id}/accept`, { accept: true }, crew);
    const p = (await view(crew)).project;
    assert.equal(p.involvement, "active");
    assert.equal(p.description, "Confidential scope");
    assert.equal(p.budget, undefined);
    const tasks = p.phases.flatMap((x) => x.tasks);
    assert.deepEqual(tasks.map((t) => t.name), ["Safety"], "the rival's task and the other phase stay hidden");
    assert.deepEqual(tasks[0].dependencyInfo.map((d) => d.name), ["PLC"], "predecessor name and status only");
    assert.equal(tasks[0].dependencyInfo[0].assignedSupplierId, undefined);
    const json = JSON.stringify(p);
    assert.doesNotMatch(json, new RegExp(rivalId), "no trace of the other supplier");
    assert.doesNotMatch(json, /Cabling/);
  });
  it("shows files only for the supplier's own work", async () => {
    const shared = async (name, extra, token = customer) => {
      const up = await app.call("POST", "/upload", pdf(name), token);
      return (
        await app.call("POST", `/projects/${project.id}/documents`, { filename: name, url: up.file.url, ...extra }, token)
      ).document;
    };
    const general = await shared("General-layout.pdf", {});
    const onRivalTask = await shared("Rival-task.pdf", { phaseId: ph1.id, taskId: taskA.id });
    const onOwnTask = await shared("Own-task.pdf", { phaseId: ph1.id, taskId: taskB.id });
    const rivalUpload = await shared("Rival-upload.pdf", { phaseId: ph1.id, taskId: taskA.id }, rival);
    const names = (await app.call("GET", `/projects/${project.id}/documents`, undefined, crew)).documents.map(
      (d) => d.filename,
    );
    assert.deepEqual(names.sort(), ["General-layout.pdf", "Own-task.pdf"]);
    const get = (url) => fetch(app.base + url, { headers: { Authorization: "Bearer " + crew } });
    assert.equal((await get(general.url)).status, 200);
    assert.equal((await get(onOwnTask.url)).status, 200);
    assert.equal((await get(onRivalTask.url)).status, 404, "files on other suppliers' work stay closed");
    assert.equal((await get(rivalUpload.url)).status, 404);
  });
  it("keeps the activity log and dashboard to the supplier's own company", async () => {
    const entries = (await app.call("GET", `/projects/${project.id}/activity`, undefined, crew)).entries;
    assert.ok(entries.length > 0);
    assert.ok(entries.every((e) => e.actorEmail === "crew@test.local"), "only the crew's own actions");
    const dash = await app.call("GET", "/dashboard", undefined, crew);
    const crewUserIds = new Set([(await app.call("GET", "/profile", undefined, crew)).user.id]);
    assert.ok(dash.activities.every((a) => crewUserIds.has(a.actorId)), "no other companies' activity");
  });
  it("gives a declined supplier no access at all", async () => {
    await app.call("POST", `/projects/${project.id}/tasks/${taskC.id}/assign`, { supplierId: rivalId }, customer);
    await app.call("POST", `/projects/${project.id}/tasks/${taskC.id}/accept`, { accept: false }, rival);
    const outsider = (await vettedSupplier(app, admin, "x@test.local", "Outsider AG")).token;
    assert.equal((await view(outsider)).status, 404);
  });
});
