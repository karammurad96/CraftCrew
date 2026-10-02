// T109: unread messages per project for the workspace "Messages · N" tab. Opening a conversation reads it.
const { describe, it, before, after } = require("node:test");
const assert = require("node:assert/strict");
const { startApp, vettedSupplier, projectWithTasks, assignAndAccept } = require("./helpers");

describe("unread messages per project", () => {
  let app, customer, customerId, supplier, supplierUser, outsider, project, phase, task, other, chat;
  const counts = async (pid, token = customer) =>
    app.call("GET", "/nav-counts" + (pid ? "?project=" + pid : ""), undefined, token);

  before(async () => {
    app = await startApp();
    const admin = await app.login("admin@test.local", "Admin-Password-2026!");
    const c = await app.signup("customer", "unread-buyer@test.local");
    customer = c.token;
    customerId = c.user.id;
    outsider = (await app.signup("customer", "unread-other@test.local")).token;
    const s = await vettedSupplier(app, admin, "unread-crew@test.local", "Unread Crew GmbH");
    supplier = s.token;
    supplierUser = s.user;
    ({ project, phase } = await projectWithTasks(app, customer));
    task = await assignAndAccept(app, customer, supplier, project, phase.tasks[0]);
    ({ project: other } = await projectWithTasks(app, customer, { tasks: ["Other task"] }));
    chat = (
      await app.call("POST", "/chats", { projectId: project.id, participantIds: [supplierUser.id], title: "Site" }, customer)
    ).chat;
  });
  after(() => app.stop());

  it("counts unread messages of one project only", async () => {
    for (const text of ["Crane arrives at 7", "Gate code is 4711"])
      assert.equal((await app.call("POST", `/chats/${chat.id}/messages`, { text }, supplier)).status, 201);
    const direct = await app.call(
      "POST",
      "/messages",
      { recipientId: customerId, text: "Photos follow", projectId: project.id, phaseId: phase.id, taskId: task.id },
      supplier,
    );
    assert.equal(direct.status, 201);
    const r = await counts(project.id);
    assert.equal(r.status, 200);
    assert.equal(r.counts.projectMessages, 3);
    assert.equal(r.counts.messages, 3);
    assert.equal((await counts(other.id)).counts.projectMessages, 0);
    assert.equal((await counts()).counts.projectMessages, undefined);
  });

  it("refuses the count for a project the user can't open", async () => {
    assert.equal((await counts(project.id, outsider)).status, 404);
  });

  it("stops counting a conversation once it is opened", async () => {
    assert.equal((await app.call("GET", `/chats/${chat.id}/messages`, undefined, customer)).status, 200);
    const r = await counts(project.id);
    assert.equal(r.counts.projectMessages, 1, "the direct message is still unread");
    assert.equal(r.counts.messages, 1);
    // The supplier's own reading does not touch the customer's count
    await app.call("POST", `/chats/${chat.id}/messages`, { text: "Thanks" }, customer);
    assert.equal((await counts(project.id, supplier)).counts.projectMessages, 1);
    assert.equal((await counts(project.id)).counts.projectMessages, 1);
  });
});
