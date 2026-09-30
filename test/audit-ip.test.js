// The audit log records the client address added by the trusted proxy, not the proxy's own address.
const { describe, it, before, after } = require("node:test");
const assert = require("node:assert/strict");
const { startApp } = require("./helpers");

describe("audit log client address", () => {
  let app;
  before(async () => {
    app = await startApp({ env: { TRUST_PROXY: "1" } });
  });
  after(() => app.stop());

  it("uses the last X-Forwarded-For entry", async () => {
    await app.signup("customer", "ip@test.local");
    const r = await fetch(app.base + "/api/auth/login", {
      method: "POST",
      headers: { "Content-Type": "application/json", "X-Forwarded-For": "1.1.1.1, 9.9.9.9" },
      body: JSON.stringify({ email: "ip@test.local", password: "Test-Password-2026" }),
    });
    assert.equal(r.status, 200);
    const admin = await app.login("admin@test.local", "Admin-Password-2026!");
    const { entries } = await app.call("GET", "/audit?q=ip@test.local", undefined, admin);
    const login = entries.find((e) => e.action === "Signed in" && e.actorEmail === "ip@test.local");
    assert.ok(login, "login is in the audit log");
    assert.equal(login.ip, "9.9.9.9");
  });
});
