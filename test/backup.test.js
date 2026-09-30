// Backups: no sign-in secrets in exports; imports are checked and keep a copy of the previous data.
const { describe, it, before, after } = require("node:test");
const assert = require("node:assert/strict");
const { startApp } = require("./helpers");

describe("backup export and import", () => {
  let app, admin;
  before(async () => {
    app = await startApp();
    admin = await app.login("admin@test.local", "Admin-Password-2026!");
    await app.signup("customer", "backup@test.local");
  });
  after(() => app.stop());

  it("exports without sessions or one-time tokens", async () => {
    const r = await app.call("GET", "/backup/export", undefined, admin);
    assert.equal(r.status, 200);
    assert.ok(Array.isArray(r.data.users));
    assert.equal("sessions" in r.data, false);
    assert.equal("authTokens" in r.data, false);
  });

  it("refuses data that is not a backup or has no active admin", async () => {
    assert.equal((await app.call("POST", "/backup/import", { data: { users: [] } }, admin)).status, 400);
    const { data } = await app.call("GET", "/backup/export", undefined, admin);
    const noAdmin = { ...data, users: data.users.filter((u) => u.role !== "admin") };
    const r = await app.call("POST", "/backup/import", { data: noAdmin }, admin);
    assert.equal(r.status, 400);
    assert.match(r.error, /admin/);
  });

  it("imports a valid backup, saves the previous data first and keeps the admin signed in", async () => {
    const { data } = await app.call("GET", "/backup/export", undefined, admin);
    const r = await app.call("POST", "/backup/import", { data }, admin);
    assert.equal(r.status, 200, r.error);
    assert.equal(r.counts.users, data.users.length);
    assert.match(r.previousDataSavedAs, /^pre-import-.*\.json$/);
    assert.equal((await app.call("GET", "/auth/me", undefined, admin)).status, 200, "still signed in");
    assert.ok(await app.login("backup@test.local", "Test-Password-2026"), "imported accounts work");
  });
});
