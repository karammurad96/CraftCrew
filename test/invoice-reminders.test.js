// Invoice reminders: 3- and 7-day review reminders (admins at 7 days) and overdue approved invoices, each sent once.
// The job runs at start-up, so the test ages the saved invoices and restarts the server.
const { describe, it, before, after } = require("node:test");
const assert = require("node:assert/strict");
const { mkdtempSync, rmSync } = require("node:fs");
const os = require("node:os");
const path = require("node:path");
const {
  startApp,
  vettedSupplier,
  projectWithTasks,
  assignAndAccept,
  submitInvoice,
  editDb,
} = require("./helpers");

const ADMIN = ["admin@test.local", "Admin-Password-2026!"];
const PASSWORD = "Test-Password-2026";

describe("invoice reminders", () => {
  let dir, app, waiting, approved;
  const texts = async (email, password = PASSWORD) =>
    (await app.call("GET", "/notifications", undefined, await app.login(email, password))).notifications.map(
      (n) => n.text,
    );
  const count = (list, re) => list.filter((t) => re.test(t)).length;
  const restart = async (change) => {
    await app.stop();
    if (change) await editDb(dir, change);
    app = await startApp({ dataDir: dir });
  };
  before(async () => {
    dir = mkdtempSync(path.join(os.tmpdir(), "craftcrew-reminders-"));
    app = await startApp({ dataDir: dir });
    const admin = await app.login(...ADMIN);
    const customer = (await app.signup("customer", "buyer@test.local")).token;
    const supplier = (await vettedSupplier(app, admin, "crew@test.local", "Crew GmbH")).token;
    const { project, phase } = await projectWithTasks(app, customer);
    const task = await assignAndAccept(app, customer, supplier, project, phase.tasks[0]);
    waiting = await submitInvoice(app, supplier, project, phase, task, 500);
    approved = await submitInvoice(app, supplier, project, phase, task, 700);
    assert.equal(
      (await app.call("PATCH", `/invoices/${approved.id}`, { action: "Approve" }, customer)).status,
      200,
    );
    const eightDaysAgo = new Date(Date.now() - 8 * 86400000).toISOString(),
      yesterday = new Date(Date.now() - 86400000).toISOString().slice(0, 10);
    await restart((db) => {
      db.invoices.find((i) => i.id === waiting.id).createdAt = eightDaysAgo;
      db.invoices.find((i) => i.id === approved.id).scheduledPayment = yesterday;
    });
  });
  after(async () => {
    await app.stop();
    rmSync(dir, { recursive: true, force: true });
  });

  it("reminds the customer twice and the admins once for an invoice waiting 8 days", async () => {
    const customer = await texts("buyer@test.local");
    assert.equal(count(customer, /^Reminder: invoice .* is waiting for your review$/), 1);
    assert.equal(count(customer, /^Second reminder: invoice .* waiting for your review for 7 days$/), 1);
    const admin = await texts(...ADMIN);
    assert.equal(count(admin, /has been waiting for customer review for 7 days$/), 1);
  });

  it("marks an approved invoice past its payment date as overdue and tells the supplier and admins", async () => {
    const supplier = await app.login("crew@test.local", PASSWORD);
    const { invoice } = await app.call("GET", `/invoices/${approved.id}`, undefined, supplier);
    assert.equal(invoice.overdue, true);
    assert.deepEqual(invoice.remindersSent, ["overdue"]);
    assert.equal(count(await texts("crew@test.local"), /is overdue: payment was due/), 1);
    assert.equal(count(await texts(...ADMIN), /is overdue: payment was due/), 1);
  });

  it("sends each reminder only once when the job runs again", async () => {
    await restart();
    assert.equal(count(await texts("buyer@test.local"), /[Rr]eminder: invoice/), 2);
    assert.equal(count(await texts(...ADMIN), /7 days$|is overdue/), 2);
    assert.equal(count(await texts("crew@test.local"), /is overdue/), 1);
  });
});
