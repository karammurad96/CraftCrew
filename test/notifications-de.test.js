// Server notifications in the recipient's language: a German customer gets German texts, an English one English.
const { describe, it, before, after } = require("node:test");
const assert = require("node:assert/strict");
const { startApp, vettedSupplier, projectWithTasks, assignAndAccept, submitInvoice } = require("./helpers");

describe("notification language", () => {
  let app, admin, german, english, supplier;
  const texts = async (token) =>
    (await app.call("GET", "/notifications", undefined, token)).notifications.map((n) => n.text);
  before(async () => {
    app = await startApp();
    admin = await app.login("admin@test.local", "Admin-Password-2026!");
    german = (await app.signup("customer", "kunde@test.local", { language: "de" })).token;
    english = (await app.signup("customer", "buyer@test.local")).token;
    supplier = (await vettedSupplier(app, admin, "crew@test.local", "Crew GmbH")).token;
  });
  after(() => app.stop());

  it("tells a German customer about a submitted invoice in German", async () => {
    const { project, phase } = await projectWithTasks(app, german);
    const task = await assignAndAccept(app, german, supplier, project, phase.tasks[0]);
    const inv = await submitInvoice(app, supplier, project, phase, task, 300);
    assert.ok((await texts(german)).includes(`Rechnung ${inv.number} zur Prüfung eingereicht`));
  });

  it("keeps English for English users and translates status values for German ones", async () => {
    const { project, phase } = await projectWithTasks(app, english);
    const task = await assignAndAccept(app, english, supplier, project, phase.tasks[0]);
    const inv = await submitInvoice(app, supplier, project, phase, task, 400);
    assert.ok((await texts(english)).includes(`Invoice ${inv.number} submitted for review`));
    await app.call("PUT", "/account/preferences", { language: "de" }, supplier);
    await app.call("PATCH", `/invoices/${inv.id}`, { action: "Approve" }, english);
    assert.ok((await texts(supplier)).includes(`Rechnung ${inv.number}: Freigegeben`));
  });
});
