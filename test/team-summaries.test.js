// T256: the dashboard's action queue and the navigation counts work for every team member, and show only the
// areas the member's role can open (before, a member without "settings" access got 403 on every page).
const { describe, it, before, after } = require("node:test");
const assert = require("node:assert/strict");
const { startApp, vettedSupplier, projectWithTasks, assignAndAccept, submitInvoice } = require("./helpers");

describe("team members: action queue and counts", () => {
  let app, owner, limited, full;
  const member = async (email, permissions) => {
    const r = await app.call("POST", "/team", { name: email.split("@")[0], email, permissions }, owner);
    const temp = await app.login(email, r.temporaryPassword);
    await app.call("POST", "/account/password", { currentPassword: r.temporaryPassword, newPassword: "Member-Pass-2026" }, temp);
    return app.login(email, "Member-Pass-2026");
  };
  before(async () => {
    app = await startApp();
    const admin = await app.login("admin@test.local", "Admin-Password-2026!");
    const s = await vettedSupplier(app, admin, "sum.supplier@test.local", "Summary Crew GmbH");
    await app.signup("customer", "sum.owner@test.local");
    owner = await app.login("sum.owner@test.local", "Test-Password-2026");
    const { project, phase, tasks } = await projectWithTasks(app, owner);
    await assignAndAccept(app, owner, s.token, project, tasks[0]);
    await submitInvoice(app, s.token, project, phase, tasks[0], 1200);
    limited = await member("sum.limited@test.local", { projects: "view" });
    full = await member("sum.full@test.local", { projects: "full", invoices: "full", messages: "full" });
  });
  after(async () => app?.stop());

  it("answers a member without settings access, without the areas it cannot open", async () => {
    const q = await app.call("GET", "/action-queue", undefined, limited);
    assert.equal(q.status, 200, q.error);
    assert.ok(!q.items.some((x) => x.kind === "invoice"), "no invoice to review");
    const c = await app.call("GET", "/nav-counts", undefined, limited);
    assert.equal(c.status, 200, c.error);
    assert.equal(c.counts.approvals, 0);
    assert.equal(c.counts.messages, undefined);
  });

  it("shows a member with invoice access the same items as the owner", async () => {
    const own = await app.call("GET", "/action-queue", undefined, owner),
      mine = await app.call("GET", "/action-queue", undefined, full);
    assert.ok(own.items.some((x) => x.kind === "invoice"));
    assert.ok(mine.items.some((x) => x.kind === "invoice"));
    assert.equal((await app.call("GET", "/nav-counts", undefined, full)).counts.approvals, 1);
  });
});
