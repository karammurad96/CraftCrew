// T220: the platform mode. "brokered" is the default, the admin setting wins over PLATFORM_MODE, an invalid value
// counts as brokered, and only an admin can switch it (audit log, the other admins notified).
const { describe, it, before, after } = require("node:test");
const assert = require("node:assert/strict");
const { mkdtempSync } = require("node:fs");
const os = require("node:os");
const path = require("node:path");
const { startApp, editDb } = require("./helpers");

const ADMIN = ["admin@test.local", "Admin-Password-2026!"];

describe("platform mode", () => {
  let app, admin, customer;
  const mode = async () => (await app.call("GET", "/platform-config")).platformMode;
  before(async () => {
    // A second admin, to be notified of the switch
    const dataDir = mkdtempSync(path.join(os.tmpdir(), "craftcrew-test-"));
    app = await startApp({ dataDir, env: { PLATFORM_MODE: "" } });
    await app.stop();
    await editDb(dataDir, (data) => {
      const first = data.users.find((u) => u.role === "admin");
      data.users.push({ ...first, id: "usr_admin2", email: "admin2@test.local", name: "Second Admin" });
    });
    app = await startApp({ dataDir, env: { PLATFORM_MODE: "" } });
    admin = await app.login(...ADMIN);
    await app.signup("customer", "mode.customer@test.local");
    customer = await app.login("mode.customer@test.local", "Test-Password-2026");
  });
  after(async () => {
    await app?.stop();
    require("node:fs").rmSync(app.dataDir, { recursive: true, force: true });
  });

  it("is brokered by default and shown in the public config and admin settings", async () => {
    assert.equal(await mode(), "brokered");
    assert.equal(
      (await app.call("GET", "/admin/settings", undefined, admin)).settings.platformMode,
      "brokered",
    );
  });

  it("can be switched only by an admin, with a valid mode", async () => {
    const r = await app.call("PUT", "/admin/platform-mode", { mode: "marketplace" }, customer);
    assert.equal(r.status, 403);
    const bad = await app.call("PUT", "/admin/platform-mode", { mode: "anything" }, admin);
    assert.equal(bad.status, 400);
    assert.equal(bad.code, "chooseBrokeredOrMarketplace");
    assert.equal(await mode(), "brokered");
  });

  it("switches, logs the change, notifies the other admins and keeps other settings", async () => {
    const r = await app.call("PUT", "/admin/platform-mode", { mode: "marketplace" }, admin);
    assert.equal(r.status, 200);
    assert.equal(r.platformMode, "marketplace");
    assert.equal(await mode(), "marketplace");
    const { entries } = await app.call("GET", "/audit", undefined, admin);
    assert.ok(entries.some((e) => e.action === "Changed platform mode"));
    const other = await app.login("admin2@test.local", ADMIN[1]);
    const { notifications } = await app.call("GET", "/notifications", undefined, other);
    assert.ok(
      notifications.some((n) => /marketplace mode/.test(n.text)),
      "the other admin is told",
    );
    const own = await app.call("GET", "/notifications", undefined, admin);
    assert.ok(!own.notifications.some((n) => /marketplace mode/.test(n.text)), "not the one who switched");
    // Saving the other platform settings keeps the mode
    const { settings } = await app.call("GET", "/admin/settings", undefined, admin);
    assert.equal((await app.call("PUT", "/admin/settings", settings, admin)).status, 200);
    assert.equal(await mode(), "marketplace");
    assert.equal((await app.call("PUT", "/admin/platform-mode", { mode: "brokered" }, admin)).status, 200);
    assert.equal(await mode(), "brokered");
  });
});

describe("platform mode from the environment", () => {
  it("uses PLATFORM_MODE until an admin sets it, and treats an invalid value as brokered", async () => {
    let app = await startApp({ env: { PLATFORM_MODE: "marketplace" } });
    try {
      assert.equal((await app.call("GET", "/platform-config")).platformMode, "marketplace");
      const admin = await app.login(...ADMIN);
      await app.call("PUT", "/admin/platform-mode", { mode: "brokered" }, admin);
      assert.equal((await app.call("GET", "/platform-config")).platformMode, "brokered", "the setting wins");
    } finally {
      await app.stop();
    }
    app = await startApp({ env: { PLATFORM_MODE: "shop" } });
    try {
      assert.equal((await app.call("GET", "/platform-config")).platformMode, "brokered");
    } finally {
      await app.stop();
    }
  });
});
