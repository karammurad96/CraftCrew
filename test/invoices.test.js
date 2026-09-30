// Invoice status flow: customers decide each submitted invoice once, and approval never pays twice.
const { describe, it, before, after } = require("node:test");
const assert = require("node:assert/strict");
const { startApp, vettedSupplier, projectWithTasks, assignAndAccept, submitInvoice } = require("./helpers");

describe("invoice status flow", () => {
  let app, admin, customer, supplier, project, phase, task;
  const payments = async (invoiceId) =>
    (await app.call("GET", "/backup/export", undefined, admin)).data.payments.filter(
      (p) => p.invoiceId === invoiceId,
    );
  const decide = (inv, action, comment) =>
    app.call("PATCH", `/invoices/${inv.id}`, { action, comment }, customer);
  before(async () => {
    app = await startApp();
    admin = await app.login("admin@test.local", "Admin-Password-2026!");
    customer = (await app.signup("customer", "buyer@test.local")).token;
    supplier = (await vettedSupplier(app, admin, "crew@test.local", "Crew GmbH")).token;
    ({ project, phase } = await projectWithTasks(app, customer));
    task = await assignAndAccept(app, customer, supplier, project, phase.tasks[0]);
  });
  after(() => app.stop());

  it("approving twice is refused and creates exactly one payment", async () => {
    const inv = await submitInvoice(app, supplier, project, phase, task, 1000);
    assert.equal((await decide(inv, "Approve")).status, 200);
    const again = await decide(inv, "Approve");
    assert.equal(again.status, 409);
    assert.match(again.error, /already decided \(status: Approved\)/);
    assert.equal((await payments(inv.id)).length, 1);
  });

  it("a paid invoice cannot be rejected afterwards", async () => {
    const inv = await submitInvoice(app, supplier, project, phase, task, 2000);
    assert.equal((await decide(inv, "Approve")).status, 200);
    assert.equal(
      (await app.call("PATCH", `/admin/invoices/${inv.id}`, { action: "Mark Paid" }, admin)).status,
      200,
    );
    assert.equal((await decide(inv, "Rejected", "Too late")).status, 409);
    assert.equal((await app.call("GET", `/invoices/${inv.id}`, undefined, customer)).invoice.status, "Paid");
    assert.equal((await payments(inv.id)).length, 1);
  });

  it("changes can still be requested on a submitted invoice and the supplier can resubmit", async () => {
    const inv = await submitInvoice(app, supplier, project, phase, task, 3000);
    const r = await decide(inv, "Request Changes", "Split the hours");
    assert.equal(r.status, 200);
    assert.equal(r.invoice.status, "Changes Requested");
    assert.equal((await decide(inv, "Request Changes", "Again")).status, 409);
    const re = await app.call("PATCH", `/invoices/${inv.id}`, { action: "Resubmit", amount: 2900 }, supplier);
    assert.equal(re.status, 200, re.error);
    assert.equal(re.invoice.status, "Submitted");
    assert.equal((await decide(inv, "Approve")).status, 200);
  });
});
