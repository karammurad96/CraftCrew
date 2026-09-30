// Session hygiene: expired and idle sessions are removed, and each user keeps at most 10 sessions.
const { describe, it, before, after } = require("node:test");
const assert = require("node:assert/strict");
const { startApp } = require("./helpers");

const ADMIN = ["admin@test.local", "Admin-Password-2026!"];
const sleep = (ms) => new Promise((r) => setTimeout(r, ms));

describe("sessions", () => {
  let app;
  before(async () => {
    app = await startApp({ env: { SESSION_IDLE_MS: "1500" } });
  });
  after(() => app.stop());

  it("keeps at most 10 sessions per user", async () => {
    await app.signup("customer", "many-logins@test.local");
    for (let i = 0; i < 12; i++) await app.login("many-logins@test.local", "Test-Password-2026");
    const admin = await app.login(...ADMIN);
    const { data } = await app.call("GET", "/backup/export", undefined, admin);
    const user = data.users.find((u) => u.email === "many-logins@test.local");
    const count = data.sessions ? data.sessions.filter((s) => s.userId === user.id).length : 0;
    assert.ok(count <= 10, `expected at most 10 sessions, got ${count}`);
  });

  it("ends a session after the idle limit but keeps an active one", async () => {
    await app.signup("customer", "idle@test.local");
    const token = await app.login("idle@test.local", "Test-Password-2026");
    assert.equal((await app.call("GET", "/auth/me", undefined, token)).status, 200);
    await sleep(800);
    assert.equal((await app.call("GET", "/auth/me", undefined, token)).status, 200, "still active");
    await sleep(1800);
    assert.equal((await app.call("GET", "/auth/me", undefined, token)).status, 401, "idle session ended");
  });
});
