// T285: only delivered history is bounded; queued, retrying, failed and not-sent emails are never pruned away.
const { describe, it, before, after } = require("node:test");
const assert = require("node:assert/strict");
const { mkdtempSync, rmSync } = require("node:fs");
const { tmpdir } = require("node:os");
const path = require("node:path");
const { startApp, fakeSmtp, editDb } = require("./helpers");

const mail = (n, status, extra = {}) => ({
  id: `mail_t285_${n}`,
  to: `u${n}@test.local`,
  template: "test",
  subject: `Mail ${n}`,
  body: "Body",
  status,
  attempts: 0,
  createdAt: new Date(Date.parse("2026-01-01T00:00:00Z") + n * 1000).toISOString(),
  ...extra,
});

describe("outbox pruning (T285)", () => {
  let dir, smtp, app, admin;
  const restart = async () => {
    await app.stop();
    app = await startApp({ smtp, dataDir: dir });
    admin = await app.login("admin@test.local", "Admin-Password-2026!");
  };
  const waitFor = async (fn, ms = 30000) => {
    for (let i = 0; i < ms / 250; i++) {
      if (await fn()) return true;
      await new Promise((r) => setTimeout(r, 250));
    }
    return false;
  };
  before(async () => {
    dir = mkdtempSync(path.join(tmpdir(), "craftcrew-outbox-"));
    smtp = await fakeSmtp();
    app = await startApp({ smtp, dataDir: dir });
    await app.stop();
    // Newest first, like the real list: 2,100 delivered, then a mix of old undelivered messages at the end
    await editDb(dir, (db) => {
      const list = [];
      for (let i = 0; i < 2100; i++) list.push(mail(5000 - i, "Sent", { sentAt: "2026-01-02T00:00:00Z" }));
      list.push(mail(11, "Failed", { attempts: 5, lastError: "SMTP down" }));
      list.push(mail(10, "Queued", { attempts: 3, nextAttemptAt: "2999-01-01T00:00:00Z", lastError: "retry later" }));
      list.push(mail(9, "Not sent — no mail server configured"));
      list.push(mail(8, "Failed", { attempts: 5, lastError: "SMTP down" }));
      list.push(mail(1, "Queued"));
      db.outbox = list;
    });
    app = await startApp({ smtp, dataDir: dir });
    admin = await app.login("admin@test.local", "Admin-Password-2026!");
  });
  after(async () => {
    await app.stop();
    smtp.close();
    rmSync(dir, { recursive: true, force: true });
  });
  const summary = async () => (await app.call("GET", "/admin/outbox", undefined, admin)).summary;

  it("adding mail beyond the history limit keeps every undelivered message and bounds the delivered ones", async () => {
    for (let i = 0; i < 3; i++) assert.equal((await app.signup("customer", `outbox-${i}@test.local`)).status, 201);
    const s = await summary();
    assert.equal(s.failed, 2, "failed messages stay");
    assert.equal(s.notSent, 1, "not-sent messages stay");
    assert.ok(s.queued >= 1, "the retrying message stays");
    assert.ok(s.sent <= 2000, `delivered history is bounded (${s.sent})`);
    const failed = await app.call("GET", "/admin/outbox?status=Failed", undefined, admin);
    assert.deepEqual(failed.emails.map((m) => m.id).sort(), ["mail_t285_11", "mail_t285_8"]);
  });

  it("the oldest queued message is still delivered", async () => {
    assert.ok(await waitFor(() => smtp.inbox.some((m) => m.to === "u1@test.local")), "delivered to the SMTP server");
    const queued = (await app.call("GET", "/admin/outbox?status=Queued", undefined, admin)).emails;
    assert.ok(!queued.some((m) => m.id === "mail_t285_1"), "and no longer queued");
  });

  it("a retrying message survives further inserts, with its attempts and error", async () => {
    for (let i = 3; i < 6; i++) await app.signup("customer", `outbox-${i}@test.local`);
    const queued = (await app.call("GET", "/admin/outbox?status=Queued", undefined, admin)).emails.find((m) => m.id === "mail_t285_10");
    assert.equal(queued.attempts, 3);
    assert.equal(queued.lastError, "retry later");
  });

  it("survives a restart unchanged, and the summary says what is waiting", async () => {
    const before = await summary();
    await restart();
    const after = await summary();
    assert.equal(after.failed, before.failed);
    assert.equal(after.notSent, before.notSent);
    assert.ok(after.sent <= 2000);
    assert.ok(after.oldestQueuedAt, "the age of the oldest waiting message");
    assert.equal((await app.call("GET", "/admin/outbox")).status, 401);
  });
});
