// Session hygiene: expired and idle sessions are removed, and each user keeps at most 10 sessions.
const { describe, it, before, after } = require("node:test");
const assert = require("node:assert/strict");
const { startApp } = require("./helpers");

const sleep = (ms) => new Promise((r) => setTimeout(r, ms));

describe("sessions per user", () => {
  let app;
  before(async () => {
    app = await startApp();
  });
  after(() => app.stop());

  it("keeps at most 10 sessions per user", async () => {
    await app.signup("customer", "many-logins@test.local");
    const tokens = [];
    for (let i = 0; i < 12; i++) tokens.push(await app.login("many-logins@test.local", "Test-Password-2026"));
    const status = async (t) => (await app.call("GET", "/auth/me", undefined, t)).status;
    for (const t of tokens.slice(0, 2)) assert.equal(await status(t), 401, "oldest sessions are ended");
    for (const t of tokens.slice(2)) assert.equal(await status(t), 200, "newest 10 sessions still work");
  });
});

describe("idle sessions", () => {
  let app;
  before(async () => {
    app = await startApp({ env: { SESSION_IDLE_MS: "1500" } });
  });
  after(() => app.stop());

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
