// T176: at most 30 chat messages per minute per user; the 31st is refused with 429, another user is not affected.
const { describe, it, before, after } = require("node:test");
const assert = require("node:assert/strict");
const { startApp, vettedSupplier, projectWithTasks, assignAndAccept } = require("./helpers");

describe("chat rate limit", () => {
  let app, customer, supplier, customerId, supplierUserId, where;
  before(async () => {
    app = await startApp();
    const admin = await app.login("admin@test.local", "Admin-Password-2026!");
    const s = await vettedSupplier(app, admin, "rate.supplier@test.local", "Rate Crew GmbH");
    supplier = s.token;
    supplierUserId = s.user.id;
    const c = await app.signup("customer", "rate.customer@test.local");
    customerId = c.user.id;
    customer = await app.login("rate.customer@test.local", "Test-Password-2026");
    const { project, phase, tasks } = await projectWithTasks(app, customer);
    await assignAndAccept(app, customer, supplier, project, tasks[0]);
    where = { projectId: project.id, phaseId: phase.id, taskId: tasks[0].id };
  });
  after(async () => app?.stop());

  it("refuses the 31st message within a minute, and not another user's", async () => {
    for (let i = 1; i <= 30; i++) {
      const r = await app.call("POST", "/messages", { recipientId: supplierUserId, text: "Message " + i, ...where }, customer);
      assert.ok(r.status < 300, `message ${i}: ${r.status} ${r.error}`);
    }
    const over = await app.call("POST", "/messages", { recipientId: supplierUserId, text: "One too many", ...where }, customer);
    assert.equal(over.status, 429);
    assert.equal(over.code, "chatTooFast");
    const other = await app.call("POST", "/messages", { recipientId: customerId, text: "Still fine", ...where }, supplier);
    assert.ok(other.status < 300, other.error);
  });
});
