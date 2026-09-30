// Sign-in lockout per account across networks, and equal handling of unknown emails.
const { describe, it, before, after } = require("node:test");
const assert = require("node:assert/strict");
const { startApp } = require("./helpers");

describe("sign-in lockout across networks", () => {
  let app;
  const login = (email, password, ip) =>
    fetch(app.base + "/api/auth/login", {
      method: "POST",
      headers: { "Content-Type": "application/json", "X-Forwarded-For": ip },
      body: JSON.stringify({ email, password }),
    }).then((r) => r.status);
  before(async () => {
    app = await startApp({ env: { TRUST_PROXY: "1" } });
  });
  after(() => app.stop());

  it("locks an account after 20 failures spread over many networks", async () => {
    await app.signup("customer", "target@test.local");
    for (let i = 0; i < 20; i++)
      assert.equal(await login("target@test.local", "wrong-" + i, `10.0.${i}.1`), 401, `attempt ${i + 1}`);
    assert.equal(
      await login("target@test.local", "wrong", "10.9.9.9"),
      429,
      "21st attempt from a new network",
    );
    assert.equal(
      await login("target@test.local", "Test-Password-2026", "10.9.9.10"),
      429,
      "locked even with the right password",
    );
  });

  it("does not lock other accounts and clears failures after a successful sign-in", async () => {
    await app.signup("customer", "other@test.local");
    for (let i = 0; i < 5; i++) await login("other@test.local", "wrong", `10.1.${i}.1`);
    assert.equal(await login("other@test.local", "Test-Password-2026", "10.1.99.1"), 200);
    for (let i = 0; i < 19; i++) await login("other@test.local", "wrong", `10.2.${i}.1`);
    assert.equal(
      await login("other@test.local", "Test-Password-2026", "10.2.99.1"),
      200,
      "counter was reset",
    );
  });

  it("answers unknown emails with the same 401", async () => {
    assert.equal(await login("nobody@test.local", "whatever", "10.3.0.1"), 401);
  });
});
