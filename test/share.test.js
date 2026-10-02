// T110: "Share" on the project workspace invites a colleague of the same company to one project
// (participantIds). New emails get their own customer account; only the owner shares and removes access.
const { describe, it, before, after } = require("node:test");
const assert = require("node:assert/strict");
const { startApp, vettedSupplier, projectWithTasks } = require("./helpers");

describe("share a project with a colleague", () => {
  let app, owner, colleague, colleagueId, supplier, project, other, newcomer;
  const base = () => `/projects/${project.id}/participants`;
  const share = (body, token = owner) => app.call("POST", base(), body, token);

  before(async () => {
    app = await startApp();
    const admin = await app.login("admin@test.local", "Admin-Password-2026!");
    owner = (await app.signup("customer", "share-owner@test.local")).token;
    const c = await app.signup("customer", "share-colleague@test.local");
    colleague = c.token;
    colleagueId = c.user.id;
    supplier = (await vettedSupplier(app, admin, "share-crew@test.local", "Share Crew GmbH")).token;
    ({ project } = await projectWithTasks(app, owner));
    ({ project: other } = await projectWithTasks(app, owner, { tasks: ["Other"] }));
  });
  after(() => app.stop());

  it("gives an existing colleague access to this project only", async () => {
    assert.equal((await app.call("GET", `/projects/${project.id}`, undefined, colleague)).status, 404);
    const r = await share({ email: "Share-Colleague@test.local" });
    assert.equal(r.status, 201, r.error);
    assert.equal(r.person.access, "project");
    assert.equal(r.created, false);
    assert.equal((await app.call("GET", `/projects/${project.id}`, undefined, colleague)).status, 200);
    assert.equal((await app.call("GET", `/projects/${other.id}`, undefined, colleague)).status, 404);
    const notes = (await app.call("GET", "/notifications", undefined, colleague)).notifications;
    assert.ok(notes.some((n) => /shared the project/.test(n.text) && n.link === `/customer/projects/${project.id}`));
    assert.equal((await share({ email: "share-colleague@test.local" })).status, 409, "no double share");
  });

  it("creates an account for a new email that sees only the shared project", async () => {
    assert.equal((await share({ email: "new@test.local" })).status, 400, "a new account needs a name");
    const r = await share({ name: "Nina Neu", email: "new@test.local" });
    assert.equal(r.status, 201, r.error);
    assert.equal(r.created, true);
    assert.ok(r.temporaryPassword, "no mail server: the owner gets a temporary password to pass on");
    newcomer = await app.login("new@test.local", r.temporaryPassword);
    // The first sign-in asks for a new password, then the shared project opens
    assert.equal((await app.call("GET", `/projects/${project.id}`, undefined, newcomer)).status, 403);
    assert.equal(
      (await app.call("POST", "/account/password", { currentPassword: r.temporaryPassword, newPassword: "Nina-Password-2026" }, newcomer))
        .status,
      200,
    );
    newcomer = await app.login("new@test.local", "Nina-Password-2026");
    assert.equal((await app.call("GET", `/projects/${project.id}`, undefined, newcomer)).status, 200);
    assert.deepEqual(
      (await app.call("GET", "/projects", undefined, newcomer)).projects.map((p) => p.id),
      [project.id],
    );
  });

  it("lists who has access, and only the owner may change it", async () => {
    const list = await app.call("GET", base(), undefined, colleague);
    assert.equal(list.status, 200);
    assert.equal(list.canManage, false);
    assert.deepEqual(
      list.people.map((p) => [p.email, p.access]),
      [
        ["share-owner@test.local", "owner"],
        ["share-colleague@test.local", "project"],
        ["new@test.local", "project"],
      ],
    );
    assert.equal((await app.call("GET", base(), undefined, owner)).canManage, true);
    assert.equal((await share({ email: "x@test.local", name: "X" }, colleague)).status, 403);
    assert.equal((await app.call("DELETE", `${base()}/${colleagueId}`, undefined, colleague)).status, 403);
    assert.equal((await app.call("GET", base(), undefined, supplier)).status, 404);
    assert.equal((await app.call("GET", `/projects/${other.id}/participants`, undefined, colleague)).status, 404);
  });

  it("refuses suppliers, the owner and bad emails", async () => {
    const s = await share({ email: "share-crew@test.local" });
    assert.equal(s.status, 400);
    assert.match(s.error, /task invitations/);
    assert.equal((await share({ email: "share-owner@test.local" })).status, 400);
    assert.equal((await share({ email: "not-an-email", name: "X" })).status, 400);
  });

  it("removes access again", async () => {
    const r = await app.call("DELETE", `${base()}/${colleagueId}`, undefined, owner);
    assert.equal(r.status, 200);
    assert.equal((await app.call("GET", `/projects/${project.id}`, undefined, colleague)).status, 404);
    assert.equal((await app.call("DELETE", `${base()}/${colleagueId}`, undefined, owner)).status, 404);
  });
});
