// T221: in brokered mode customers cannot browse, search, shortlist or contact suppliers, ask them for quotes,
// publish bids to them or assign a supplier they do not already work with. Suppliers and admins are not
// affected, and marketplace mode works as before.
const { describe, it, before, after } = require("node:test");
const assert = require("node:assert/strict");
const { startApp, vettedSupplier, projectWithTasks, assignAndAccept } = require("./helpers");

const CLOSED = "suppliersAreChosenForYou";

describe("brokered mode hides the marketplace from customers", () => {
  let app, admin, customer, supplier, other, project, tasks;
  const setMode = (mode) => app.call("PUT", "/admin/platform-mode", { mode }, admin);
  before(async () => {
    app = await startApp({ env: { PLATFORM_MODE: "brokered" } });
    admin = await app.login("admin@test.local", "Admin-Password-2026!");
    supplier = await vettedSupplier(app, admin, "known@test.local", "Known Robotics GmbH");
    other = await vettedSupplier(app, admin, "other@test.local", "Other Automation GmbH");
    await app.signup("customer", "brokered.customer@test.local");
    customer = await app.login("brokered.customer@test.local", "Test-Password-2026");
    ({ project, tasks } = await projectWithTasks(app, customer, {
      tasks: ["Wiring", "Commissioning", "Docs"],
    }));
  });
  after(() => app?.stop());

  it("refuses every marketplace route to a customer", async () => {
    const id = other.supplierId;
    const refused = [
      ["GET", `/suppliers/${id}`],
      ["GET", `/suppliers/${id}/scorecard`],
      ["GET", `/suppliers/${id}/documents`],
      ["GET", "/shortlist"],
      ["PUT", "/shortlist", { supplierIds: [id] }],
      ["GET", "/preferred-suppliers"],
      ["POST", "/preferred-suppliers/invite", { email: "new@test.local", company: "New GmbH" }],
      ["POST", "/rfqs", { supplierId: id, service: "Commissioning", message: "Please quote" }],
      [
        "POST",
        "/bids",
        {
          projectId: project.id,
          phaseId: tasks[0].phaseId,
          taskId: tasks[0].id,
          title: "Bid",
          dueDate: "2026-12-01",
        },
      ],
    ];
    for (const [method, path, body] of refused) {
      const r = await app.call(method, path, body, customer);
      assert.equal(r.status, 403, `${method} ${path}`);
      assert.equal(r.code, CLOSED, `${method} ${path}`);
    }
    const list = await app.call("GET", "/suppliers", undefined, customer);
    assert.equal(list.status, 200);
    assert.deepEqual(list.suppliers, [], "the list holds only suppliers the customer works with");
  });

  it("lets a customer assign only a supplier they already work with", async () => {
    const r = await app.call(
      "POST",
      `/projects/${project.id}/tasks/${tasks[0].id}/assign`,
      { supplierId: supplier.supplierId },
      customer,
    );
    assert.equal(r.status, 403);
    assert.equal(r.code, "youCanAssignSuppliersWho");
    const phase = await app.call(
      "POST",
      `/projects/${project.id}/assign`,
      { phaseId: project.phases[0].id, supplierId: supplier.supplierId },
      customer,
    );
    assert.equal(phase.status, 403);
    // Once the supplier works on one task (here: assigned in marketplace mode), they are known
    assert.equal((await setMode("marketplace")).status, 200);
    await assignAndAccept(app, customer, supplier.token, project, tasks[0]);
    assert.equal((await setMode("brokered")).status, 200);
    const again = await app.call(
      "POST",
      `/projects/${project.id}/tasks/${tasks[1].id}/assign`,
      { supplierId: supplier.supplierId },
      customer,
    );
    assert.equal(again.status, 200);
    const list = await app.call("GET", "/suppliers", undefined, customer);
    assert.deepEqual(
      list.suppliers.map((s) => s.id),
      [supplier.supplierId],
    );
    assert.equal(
      (await app.call("GET", `/suppliers/${supplier.supplierId}`, undefined, customer)).status,
      200,
    );
    assert.equal((await app.call("GET", `/suppliers/${other.supplierId}`, undefined, customer)).status, 403);
  });

  it("does not affect suppliers and admins", async () => {
    for (const token of [admin, supplier.token]) {
      const r = await app.call("GET", "/suppliers", undefined, token);
      assert.equal(r.status, 200);
      assert.ok(r.suppliers.some((s) => s.id === other.supplierId));
      assert.equal((await app.call("GET", `/suppliers/${other.supplierId}`, undefined, token)).status, 200);
    }
  });

  it("works as before in marketplace mode", async () => {
    assert.equal((await setMode("marketplace")).status, 200);
    try {
      const id = other.supplierId;
      assert.ok(
        (await app.call("GET", "/suppliers", undefined, customer)).suppliers.some((s) => s.id === id),
      );
      for (const [method, path, body, status] of [
        ["GET", `/suppliers/${id}`, undefined, 200],
        ["GET", `/suppliers/${id}/scorecard`, undefined, 200],
        ["GET", `/suppliers/${id}/documents`, undefined, 200],
        ["PUT", "/shortlist", { supplierIds: [id] }, 200],
        ["GET", "/preferred-suppliers", undefined, 200],
        ["POST", "/rfqs", { supplierId: id, service: "Commissioning", message: "Please quote" }, 201],
        ["POST", `/projects/${project.id}/tasks/${tasks[2].id}/assign`, { supplierId: id }, 200],
      ]) {
        const r = await app.call(method, path, body, customer);
        assert.equal(r.status, status, `${method} ${path}: ${r.error || ""}`);
      }
      const bid = await app.call(
        "POST",
        "/bids",
        {
          projectId: project.id,
          phaseId: project.phases[0].id,
          taskId: tasks[1].id,
          title: "Commissioning bid",
          dueDate: "2026-12-01",
        },
        customer,
      );
      assert.equal(bid.status, 201, bid.error);
      // Back in brokered mode, inviting suppliers to that bid is refused
      assert.equal((await setMode("brokered")).status, 200);
      const inv = await app.call("POST", `/bids/${bid.bid.id}/invitations`, { supplierIds: [id] }, customer);
      assert.equal(inv.status, 403);
      assert.equal(inv.code, CLOSED);
    } finally {
      await setMode("brokered");
    }
  });
});
