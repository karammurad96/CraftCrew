// T108: a submitted invoice gets a due date from the payment terms ("N days net"), payment is scheduled for it,
// a corrected invoice starts the terms again, and the customer is reminded once when it passes unreviewed.
const { describe, it, before, after } = require("node:test");
const assert = require("node:assert/strict");
const { mkdtempSync, rmSync, readFileSync, writeFileSync } = require("node:fs");
const os = require("node:os");
const path = require("node:path");
const { startApp, vettedSupplier, projectWithTasks, assignAndAccept, submitInvoice } = require("./helpers");

const PASSWORD = "Test-Password-2026";
const day = (offset) => new Date(Date.now() + offset * 86400000).toISOString().slice(0, 10);

describe("invoice due date", () => {
  let dir, app, admin, customer, supplier, project, phase, task;
  const get = async (id) => (await app.call("GET", `/invoices/${id}`, undefined, customer)).invoice;
  const act = (id, body, token) => app.call("PATCH", `/invoices/${id}`, body, token);
  const setTerms = async (days) => {
    const { settings } = await app.call("GET", "/admin/settings", undefined, admin);
    const r = await app.call("PUT", "/admin/settings", { ...settings, defaultPaymentTermsDays: days }, admin);
    assert.equal(r.status, 200);
  };

  before(async () => {
    dir = mkdtempSync(path.join(os.tmpdir(), "craftcrew-due-"));
    app = await startApp({ dataDir: dir });
    admin = await app.login("admin@test.local", "Admin-Password-2026!");
    customer = (await app.signup("customer", "due-buyer@test.local")).token;
    supplier = (await vettedSupplier(app, admin, "due-crew@test.local", "Due Crew GmbH")).token;
    ({ project, phase } = await projectWithTasks(app, customer));
    task = await assignAndAccept(app, customer, supplier, project, phase.tasks[0]);
  });
  after(async () => {
    await app.stop();
    rmSync(dir, { recursive: true, force: true });
  });

  it("sets the due date from the payment terms when the invoice is submitted", async () => {
    const inv = await submitInvoice(app, supplier, project, phase, task, 100);
    assert.equal(inv.paymentTermsDays, 14);
    assert.equal(inv.dueDate, day(14));
    await setTerms(30);
    const later = await submitInvoice(app, supplier, project, phase, task, 101);
    assert.equal(later.paymentTermsDays, 30);
    assert.equal(later.dueDate, day(30));
    // The e-invoice carries the due date and the terms
    const put = (token, companyProfile) => app.call("PUT", "/profile", { companyProfile }, token);
    await put(supplier, { phone: "+49 941 1234", procurementEmail: "billing@crew.example" });
    await put(customer, { legalName: "Buyer GmbH", address: "Hafenstraße 21, 20457 Hamburg" });
    await app.call("PUT", `/projects/${project.id}`, { buyerReference: "PO-778" }, customer);
    await app.call("PUT", "/account/payout", { accountHolder: "Due Crew GmbH", iban: "DE02120300000000202051" }, supplier);
    const xml = await (
      await fetch(`${app.base}/api/invoices/${later.id}/xrechnung`, { headers: { Authorization: "Bearer " + supplier } })
    ).text();
    assert.match(xml, new RegExp(`<udt:DateTimeString format="102">${day(30).replaceAll("-", "")}</udt:DateTimeString>`));
    assert.match(xml, /Zahlbar innerhalb von 30 Tagen ohne Abzug/);
  });

  it("schedules the payment for the due date when approved", async () => {
    await setTerms(14);
    const inv = await submitInvoice(app, supplier, project, phase, task, 102);
    const r = await act(inv.id, { action: "Approve" }, customer);
    assert.equal(r.status, 200);
    assert.equal(r.invoice.scheduledPayment, day(14));
  });

  it("starts the terms again for a corrected invoice", async () => {
    await setTerms(10);
    const inv = await submitInvoice(app, supplier, project, phase, task, 103);
    assert.equal((await act(inv.id, { action: "Request Changes", comments: "Split the hours" }, customer)).status, 200);
    await setTerms(20);
    const r = await act(inv.id, { action: "Resubmit", amount: 99 }, supplier);
    assert.equal(r.status, 200);
    // The terms agreed on the invoice stay; the clock restarts from the resubmission
    assert.equal(r.invoice.paymentTermsDays, 10);
    assert.equal(r.invoice.dueDate, day(10));
  });

  it("reminds the customer once when a submitted invoice passes its due date, and pays late approvals at once", async () => {
    const late = await submitInvoice(app, supplier, project, phase, task, 104),
      legacy = await submitInvoice(app, supplier, project, phase, task, 105);
    const restart = async (change) => {
      await app.stop();
      const file = path.join(dir, "db.json"),
        db = JSON.parse(readFileSync(file, "utf8"));
      if (change) change(db);
      writeFileSync(file, JSON.stringify(db));
      app = await startApp({ dataDir: dir });
      admin = await app.login("admin@test.local", "Admin-Password-2026!");
      customer = await app.login("due-buyer@test.local", PASSWORD);
      supplier = await app.login("due-crew@test.local", PASSWORD);
    };
    await restart((db) => {
      db.invoices.find((i) => i.id === late.id).dueDate = day(-2);
      const old = db.invoices.find((i) => i.id === legacy.id);
      delete old.dueDate;
      delete old.paymentTermsDays;
    });
    const texts = async () =>
      (await app.call("GET", "/notifications", undefined, customer)).notifications
        .map((n) => n.text)
        .filter((t) => /still waits for your review/.test(t));
    assert.deepEqual(await texts(), [`Invoice ${late.number} was due on ${day(-2)} and still waits for your review`]);
    // An invoice from before T108 gets a due date from the current terms, counted from its submission
    assert.equal((await get(legacy.id)).dueDate, day(20));
    await restart();
    assert.equal((await texts()).length, 1, "sent only once");
    const r = await act(late.id, { action: "Approve" }, customer);
    assert.equal(r.invoice.scheduledPayment, day(0));
  });
});
