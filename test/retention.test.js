// Data retention: notifications are capped per user and old read ones removed; old audit entries move to files.
const { describe, it, before, after } = require("node:test");
const assert = require("node:assert/strict");
const { mkdtempSync, rmSync, readFileSync, readdirSync } = require("node:fs");
const os = require("node:os");
const path = require("node:path");
const { startApp, readDb, writeDb } = require("./helpers");

const ADMIN = ["admin@test.local", "Admin-Password-2026!"];

describe("data retention", () => {
  let dir, app;
  before(async () => {
    dir = mkdtempSync(path.join(os.tmpdir(), "craftcrew-retention-"));
    // First start creates the database; then add old data directly and start again.
    app = await startApp({ dataDir: dir });
    await app.signup("customer", "busy@test.local");
    await app.stop();
    const db = await readDb(dir),
      user = db.users.find((u) => u.email === "busy@test.local"),
      day = (n) => new Date(Date.now() - n * 86400000).toISOString();
    db.notifications = Array.from({ length: 320 }, (_, i) => ({
      id: `not_${i}`,
      userId: user.id,
      text: `Note ${i}`,
      link: "",
      read: false,
      createdAt: day(i / 100),
    }));
    db.notifications.push({ id: "not_old", userId: "other", text: "Old", read: true, createdAt: day(200) });
    db.notifications.push({
      id: "not_unread",
      userId: "other",
      text: "Kept",
      read: false,
      createdAt: day(200),
    });
    db.auditLog = Array.from({ length: 5009 }, (_, i) => ({
      id: `aud_${i}`,
      at: `2026-0${i < 5000 ? 9 : 8}-01T00:00:00.000Z`,
      action: "Test entry",
    }));
    await writeDb(dir, db);
    app = await startApp({ dataDir: dir });
  });
  after(async () => {
    await app.stop();
    rmSync(dir, { recursive: true, force: true });
  });

  it("keeps the newest 300 notifications per user and drops old read ones", async () => {
    const token = await app.login("busy@test.local", "Test-Password-2026");
    const { notifications } = await app.call("GET", "/notifications", undefined, token);
    assert.equal(notifications.length, 300);
    assert.equal(notifications[0].text, "Note 0");
    assert.ok(!notifications.some((n) => n.text === "Note 300"));
    const admin = await app.login(...ADMIN);
    const { data } = await app.call("GET", "/backup/export", undefined, admin);
    const ids = data.notifications.map((n) => n.id);
    assert.ok(!ids.includes("not_old"), "old read notification removed");
    assert.ok(ids.includes("not_unread"), "old unread notification kept");
  });

  it("moves audit entries beyond 5,000 to the monthly file", async () => {
    const admin = await app.login(...ADMIN);
    const { data } = await app.call("GET", "/backup/export", undefined, admin);
    assert.equal(data.auditLog.length, 5000);
    const files = readdirSync(path.join(dir, "audit"));
    const lines = files.flatMap((f) =>
      readFileSync(path.join(dir, "audit", f), "utf8")
        .trim()
        .split("\n")
        .map(JSON.parse),
    );
    // 5,009 seeded entries plus the requests above: everything past 5,000 is archived, oldest (August) first.
    assert.ok(lines.length >= 10, `expected at least 10 archived entries, got ${lines.length}`);
    assert.ok(files.includes("audit-2026-08.jsonl"));
    assert.equal(
      readFileSync(path.join(dir, "audit", "audit-2026-08.jsonl"), "utf8")
        .trim()
        .split("\n").length,
      9,
    );
  });
});
