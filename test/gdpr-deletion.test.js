// T121: account deletion requests. Open business blocks them; the password starts a 14-day grace period that
// a sign-in cancels; a team member deletes only their own login; the main account's request covers its team.
const { describe, it, before, after } = require("node:test");
const assert = require("node:assert/strict");
const { startApp, vettedSupplier, projectWithTasks, assignAndAccept, submitInvoice } = require("./helpers");

const PW = "Test-Password-2026";
const day = (offset) => new Date(Date.now() + offset * 86400000).toISOString().slice(0, 10);

describe("account deletion request", () => {
  let app, admin, customer, supplier, project, phase, task, invoice;
  const status = (token) => app.call("GET", "/account/deletion", undefined, token);
  const request = (token, body = { password: PW }) => app.call("POST", "/account/deletion", body, token);

  before(async () => {
    app = await startApp();
    admin = await app.login("admin@test.local", "Admin-Password-2026!");
    customer = (await app.signup("customer", "del-buyer@test.local")).token;
    supplier = (await vettedSupplier(app, admin, "del-crew@test.local", "Del Crew GmbH")).token;
    ({ project, phase } = await projectWithTasks(app, customer));
    task = await assignAndAccept(app, customer, supplier, project, phase.tasks[0]);
    invoice = await submitInvoice(app, supplier, project, phase, task, 800);
  });
  after(() => app.stop());

  it("lists what still blocks the deletion, for each role", async () => {
    const c = await status(customer);
    assert.equal(c.status, 200);
    assert.equal(c.graceDays, 14);
    assert.ok(c.blockers.some((b) => /^Project ".+" is still/.test(b.label) && b.link === `/customer/projects/${project.id}`));
    assert.ok(c.blockers.some((b) => /^Invoice \S+ is not decided yet$/.test(b.label)));
    const s = await status(supplier);
    assert.ok(s.blockers.some((b) => b.label.startsWith(`Task "${task.name}"`)));
    assert.ok(s.blockers.some((b) => /^Invoice \S+ is not paid yet$/.test(b.label)));
    // Each blocker also comes as a key with values for the profile page (T136)
    assert.ok(c.blockers.some((b) => b.q?.[0] === "projectOpen" && b.q[1].name === project.name));
    assert.ok(s.blockers.every((b) => b.q && b.q[0]));
    const r = await request(supplier);
    assert.equal(r.status, 409);
    assert.ok(r.blockers.length >= 2);
  });

  it("refuses admins and wrong passwords", async () => {
    assert.equal((await request(admin, { password: "Admin-Password-2026!" })).status, 409);
    const fresh = (await app.signup("customer", "del-wrong@test.local")).token;
    assert.equal((await request(fresh, { password: "nope" })).status, 400);
  });

  it("starts the 14-day grace period, ends every session, and a sign-in cancels it", async () => {
    const fresh = (await app.signup("customer", "del-free@test.local")).token,
      second = await app.login("del-free@test.local", PW);
    const r = await request(fresh);
    assert.equal(r.status, 200, r.error);
    assert.equal(r.deleteAfter.slice(0, 10), day(14));
    assert.equal((await app.call("GET", "/auth/me", undefined, fresh)).status, 401);
    assert.equal((await app.call("GET", "/auth/me", undefined, second)).status, 401);
    const login = await app.call("POST", "/auth/login", { email: "del-free@test.local", password: PW });
    assert.equal(login.status, 200);
    assert.equal(login.deletionCancelled, true);
    const after = await status(login.token);
    assert.equal(after.deleteAfter, null);
    const notes = (await app.call("GET", "/notifications", undefined, login.token)).notifications;
    assert.ok(notes.some((n) => /deletion was cancelled/.test(n.text)));
  });

  it("deletes only a team member's own login, and covers the team when the main account asks", async () => {
    const owner = (await app.signup("customer", "del-owner@test.local")).token;
    const invite = await app.call("POST", "/team", { name: "Tim Team", email: "del-member@test.local", permissions: {} }, owner);
    let member = await app.login("del-member@test.local", invite.temporaryPassword);
    await app.call("POST", "/account/password", { currentPassword: invite.temporaryPassword, newPassword: PW }, member);
    member = await app.login("del-member@test.local", PW);
    // A member has no company blockers and needs no settings access to ask
    const m = await status(member);
    assert.equal(m.status, 200);
    assert.deepEqual(m.blockers, []);
    assert.equal((await request(member)).status, 200);
    assert.equal((await app.call("GET", "/auth/me", undefined, owner)).status, 200, "the owner stays signed in");
    // The member cancels their own request by signing in again
    assert.equal((await app.call("POST", "/auth/login", { email: "del-member@test.local", password: PW })).deletionCancelled, true);
    // Now the owner deletes the company: the member is locked out and can't cancel it
    const o = await status(owner);
    assert.equal(o.coversTeam, true);
    assert.equal((await request(owner)).status, 200);
    const blocked = await app.call("POST", "/auth/login", { email: "del-member@test.local", password: PW });
    assert.equal(blocked.status, 403);
    assert.match(blocked.error, /company account is being deleted/);
    // The owner signs in: both are back
    assert.equal((await app.call("POST", "/auth/login", { email: "del-owner@test.local", password: PW })).deletionCancelled, true);
    assert.equal((await app.call("POST", "/auth/login", { email: "del-member@test.local", password: PW })).status, 200);
  });
});
