// T120: "Download my data" returns the person's own data and never secrets or other people's data.
const { describe, it, before, after } = require("node:test");
const assert = require("node:assert/strict");
const { startApp, vettedSupplier, projectWithTasks, assignAndAccept, submitInvoice } = require("./helpers");

describe("GDPR data export", () => {
  let app, admin, customer, customerUser, supplier, other, project, phase, task, invoice, member, memberPassword;
  const download = async (token) => {
    const r = await fetch(app.base + "/api/account/export", { headers: { Authorization: "Bearer " + token } });
    return { status: r.status, headers: r.headers, text: await r.text() };
  };

  before(async () => {
    app = await startApp();
    admin = await app.login("admin@test.local", "Admin-Password-2026!");
    const c = await app.signup("customer", "gdpr-buyer@test.local");
    customer = c.token;
    customerUser = c.user;
    supplier = (await vettedSupplier(app, admin, "gdpr-crew@test.local", "GDPR Crew GmbH")).token;
    other = (await vettedSupplier(app, admin, "gdpr-other@test.local", "Other GmbH")).token;
    ({ project, phase } = await projectWithTasks(app, customer));
    task = await assignAndAccept(app, customer, supplier, project, phase.tasks[0]);
    invoice = await submitInvoice(app, supplier, project, phase, task, 1200);
    await app.call("POST", "/messages", { recipientId: customerUser.id, text: "Hello from the crew", projectId: project.id, phaseId: phase.id, taskId: task.id }, supplier);
    const m = await app.call("POST", "/team", { name: "Mia Member", email: "gdpr-member@test.local", permissions: { projects: "view" } }, customer);
    assert.equal(m.status, 201, m.error);
    memberPassword = m.temporaryPassword;
  });
  after(() => app.stop());

  it("gives the customer their account, projects, invoices and messages as a download", async () => {
    const r = await download(customer);
    assert.equal(r.status, 200);
    assert.match(r.headers.get("content-disposition"), /attachment; filename="craftcrew-my-data-\d{4}-\d{2}-\d{2}\.json"/);
    const d = JSON.parse(r.text);
    assert.equal(d.account.email, "gdpr-buyer@test.local");
    assert.deepEqual(d.projects.map((p) => [p.id, p.role]), [[project.id, "owner"]]);
    assert.deepEqual(d.invoices.map((i) => i.id), [invoice.id]);
    assert.ok(d.messages.some((m) => m.text === "Hello from the crew"));
    assert.ok(d.sessions.length >= 1 && !("tokenHash" in d.sessions[0]));
  });

  it("never contains secrets", async () => {
    for (const token of [customer, supplier, admin]) {
      const { text } = await download(token);
      for (const word of ["passwordHash", "salt", "tokenHash", "totp", "recoveryCodes"])
        assert.ok(!text.includes(`"${word}"`), `${word} in export`);
    }
  });

  it("gives the supplier their company, work and invoices but nothing of other suppliers", async () => {
    const d = JSON.parse((await download(supplier)).text);
    assert.equal(d.company.company, "GDPR Crew GmbH");
    assert.equal(d.projects[0].yourWork[0].task, task.name);
    assert.equal(d.invoices.length, 1);
    assert.ok(d.applications.length >= 1);
    const o = (await download(other)).text;
    assert.ok(!o.includes("GDPR Crew GmbH") && !o.includes("Hello from the crew") && !o.includes(invoice.id));
  });

  it("gives a team member their own login data only, even without settings access", async () => {
    let token = await app.login("gdpr-member@test.local", memberPassword);
    assert.equal((await app.call("POST", "/account/password", { currentPassword: memberPassword, newPassword: "Member-Password-2026" }, token)).status, 200);
    token = await app.login("gdpr-member@test.local", "Member-Password-2026");
    const r = await download(token);
    assert.equal(r.status, 200);
    const d = JSON.parse(r.text);
    assert.equal(d.account.email, "gdpr-member@test.local");
    assert.equal(d.invoices, undefined, "company records stay with the main account");
    assert.ok(!r.text.includes("gdpr-buyer@test.local\""), "not the owner's account");
  });

  it("needs a sign-in and limits downloads to 5 per hour", async () => {
    assert.equal((await fetch(app.base + "/api/account/export")).status, 401);
    const statuses = [];
    for (let i = 0; i < 5; i++) statuses.push((await download(other)).status);
    assert.deepEqual(statuses, [200, 200, 200, 200, 429], "one download in an earlier test + 4 more, then refused");
  });
});
