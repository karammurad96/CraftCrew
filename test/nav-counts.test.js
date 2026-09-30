// Sidebar counts: pending approvals for customers, open invitations for suppliers, open escalations for admins.
const { describe, it, before, after } = require("node:test");
const assert = require("node:assert/strict");
const { startApp, vettedSupplier, projectWithTasks, assignAndAccept, submitInvoice } = require("./helpers");

describe("nav counts", () => {
  let app, admin, customer, supplier, project, phase;
  const counts = async (token) => (await app.call("GET", "/nav-counts", undefined, token)).counts;
  before(async () => {
    app = await startApp();
    admin = await app.login("admin@test.local", "Admin-Password-2026!");
    customer = (await app.signup("customer", "buyer@test.local")).token;
    supplier = (await vettedSupplier(app, admin, "crew@test.local", "Crew GmbH")).token;
    ({ project, phase } = await projectWithTasks(app, customer));
  });
  after(() => app.stop());

  it("counts a supplier's open task invitations", async () => {
    assert.equal((await counts(supplier)).projects, 0);
    const { supplier: s } = await app.call("GET", "/profile", undefined, supplier);
    const r = await app.call(
      "POST",
      `/projects/${project.id}/tasks/${phase.tasks[1].id}/assign`,
      { supplierId: s.id },
      customer,
    );
    assert.equal(r.status, 200, r.error);
    assert.equal((await counts(supplier)).projects, 1);
  });

  it("counts invoices waiting for the customer's approval", async () => {
    const task = await assignAndAccept(app, customer, supplier, project, phase.tasks[0]);
    assert.equal((await counts(customer)).approvals, 0);
    await submitInvoice(app, supplier, project, phase, task, 400);
    assert.equal((await counts(customer)).approvals, 1);
    assert.equal((await counts(supplier)).approvals, undefined, "suppliers have no approvals count");
  });

  it("counts open escalations for admins and needs a signed-in user", async () => {
    const r = await app.call(
      "POST",
      "/disputes",
      { projectId: project.id, type: "Quality", description: "Welds fail inspection" },
      customer,
    );
    assert.equal(r.status, 201, r.error);
    assert.equal((await counts(admin)).disputes, 1);
    assert.equal((await app.call("GET", "/nav-counts")).status, 401);
  });
});
