// Session hygiene: expired and idle sessions go away, and each user keeps at most 10 sessions.
const { describe, it, after } = require("node:test");
const assert = require("node:assert/strict");
const { mkdtempSync, readFileSync, writeFileSync, rmSync } = require("node:fs");
const { tmpdir } = require("node:os");
const path = require("node:path");
const { startApp } = require("./helpers");

describe("session hygiene", () => {
  const dir = mkdtempSync(path.join(tmpdir(), "craftcrew-sessions-"));
  const dbFile = path.join(dir, "db.json");
  let app;
  after(async () => {
    await app?.stop();
    rmSync(dir, { recursive: true, force: true });
  });

  it("keeps at most 10 sessions per user", async () => {
    app = await startApp({ env: { DATA_DIR: dir } });
    const { user } = await app.signup("customer", "busy@test.local");
    const tokens = [];
    for (let i = 0; i < 12; i++) tokens.push(await app.login("busy@test.local", "Test-Password-2026"));
    const admin = await app.login("admin@test.local", "Admin-Password-2026!");
    const { data } = await app.call("GET", "/backup/export", undefined, admin);
    assert.equal(data.sessions.filter((s) => s.userId === user.id).length, 10);
    assert.equal((await app.call("GET", "/auth/me", undefined, tokens[0])).status, 401, "oldest ended");
    assert.equal((await app.call("GET", "/auth/me", undefined, tokens[11])).status, 200, "newest works");
  });

  it("rejects a session idle for more than 24 hours and purges expired ones", async () => {
    const idle = await app.login("busy@test.local", "Test-Password-2026");
    const fresh = await app.login("admin@test.local", "Admin-Password-2026!");
    await app.stop();
    // Age the sessions directly in the data file while the server is down.
    const db = JSON.parse(readFileSync(dbFile, "utf8"));
    const busy = db.users.find((u) => u.email === "busy@test.local");
    const day = 86400000;
    for (const s of db.sessions)
      if (s.userId === busy.id) s.lastSeenAt = new Date(Date.now() - day - 60000).toISOString();
    db.sessions.push({
      tokenHash: "expired",
      userId: busy.id,
      createdAt: new Date(Date.now() - 8 * day).toISOString(),
      lastSeenAt: new Date().toISOString(),
      expiresAt: new Date(Date.now() - day).toISOString(),
    });
    writeFileSync(dbFile, JSON.stringify(db));

    app = await startApp({ env: { DATA_DIR: dir } });
    assert.equal((await app.call("GET", "/auth/me", undefined, idle)).status, 401);
    assert.equal((await app.call("GET", "/auth/me", undefined, fresh)).status, 200);
    // A new sign-in clears out the expired and idle sessions of all users.
    await app.login("admin@test.local", "Admin-Password-2026!");
    const { data } = await app.call("GET", "/backup/export", undefined, fresh);
    assert.equal(data.sessions.filter((s) => s.userId === busy.id).length, 0);
    assert.ok(
      data.sessions.every((s) => s.lastSeenAt),
      "sessions record when they were last used",
    );
  });
});
