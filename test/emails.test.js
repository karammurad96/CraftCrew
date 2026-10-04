// Email addresses are trimmed and lower-cased for every lookup, so one address means one account.
const { describe, it, before, after } = require("node:test");
const assert = require("node:assert/strict");
const { mkdtempSync, rmSync } = require("node:fs");
const { tmpdir } = require("node:os");
const path = require("node:path");
const { startApp, fakeSmtp, writeDb } = require("./helpers");

describe("email normalisation", () => {
  let app, smtp;
  before(async () => {
    smtp = await fakeSmtp();
    app = await startApp({ smtp });
  });
  after(async () => {
    await app.stop();
    smtp.close();
  });
  const waitMail = async (n) => {
    for (let i = 0; i < 80 && smtp.inbox.length < n; i++) await new Promise((r) => setTimeout(r, 250));
    return smtp.inbox[n - 1];
  };
  const token = (mail, kind) => (mail.body.match(new RegExp(`#/${kind}\\?token=([\\w-]+)`)) || [])[1];

  it("refuses a second account for the same address in another spelling", async () => {
    assert.equal((await app.signup("customer", "a@test.local")).status, 201);
    const again = await app.signup("customer", " A@Test.local ");
    assert.equal(again.status, 409);
    const verify = await waitMail(1);
    assert.equal(verify.to, "a@test.local");
    assert.ok((await app.call("POST", "/auth/verify", { token: token(verify, "verify") })).token);
  });

  it("signs in and resets the password with any capitalisation", async () => {
    assert.ok(await app.login("A@TEST.LOCAL", "Test-Password-2026"));
    const before = smtp.inbox.length;
    assert.equal((await app.call("POST", "/auth/forgot", { email: "  A@Test.Local" })).status, 200);
    const mail = await waitMail(before + 1);
    assert.equal(mail.to, "a@test.local");
    const reset = await app.call("POST", "/auth/reset", {
      token: token(mail, "reset"),
      newPassword: "Another-Pass-2026",
    });
    assert.equal(reset.status, 200, reset.error);
    assert.ok(await app.login("a@test.local", "Another-Pass-2026"));
  });
});

describe("email normalisation of stored accounts at start-up", () => {
  let dir, app;
  before(async () => {
    const first = await startApp();
    const admin = await first.login("admin@test.local", "Admin-Password-2026!");
    await first.signup("customer", "old@test.local");
    await first.signup("customer", "twin@test.local");
    const { data } = await first.call("GET", "/backup/export", undefined, admin);
    await first.stop();
    // Simulate data written before normalisation: mixed case, spaces and a now-shared address.
    data.users.find((u) => u.email === "old@test.local").email = "  Old@Test.LOCAL";
    data.users.find((u) => u.email === "twin@test.local").email = "Twin@test.local";
    data.users.push({ ...data.users.find((u) => u.email === "Twin@test.local"), id: "usr_twin2" });
    dir = mkdtempSync(path.join(tmpdir(), "craftcrew-emails-"));
    await writeDb(dir, data);
    app = await startApp({ dataDir: dir });
  });
  after(async () => {
    await app.stop();
    rmSync(dir, { recursive: true, force: true });
  });

  it("lower-cases stored emails and tells admins about shared addresses", async () => {
    assert.ok(await app.login("old@test.local", "Test-Password-2026"));
    const admin = await app.login("admin@test.local", "Admin-Password-2026!");
    const notes = (await app.call("GET", "/notifications", undefined, admin)).notifications.map(
      (n) => n.text,
    );
    assert.ok(
      notes.some((t) => t.includes("twin@test.local") && t.includes("usr_twin2")),
      "admins are told about the shared address",
    );
    assert.match(app.stderr(), /share the email twin@test\.local/);
  });
});
