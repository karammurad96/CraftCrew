// T67: TOTP two-factor sign-in (RFC 6238), recovery codes, login lockout and the admin requirement.
const { describe, it, before, after } = require("node:test");
const assert = require("node:assert/strict");
const fs = require("node:fs");
const path = require("node:path");
const { startApp } = require("./helpers");
const { hotp, totp, verifyTotp, base32Encode, base32Decode } = require("../twofactor");

describe("TOTP", () => {
  const secret = base32Encode(Buffer.from("12345678901234567890"));
  it("matches the RFC 4226 test values", () => {
    const expected = [
      "755224",
      "287082",
      "359152",
      "969429",
      "338314",
      "254676",
      "287922",
      "162583",
      "399871",
      "520489",
    ];
    assert.deepEqual(
      expected.map((_, i) => hotp(secret, i)),
      expected,
    );
    assert.equal(totp(secret, 59000), "287082", "RFC 6238: T = 59 s is step 1");
    assert.deepEqual(base32Decode(secret), Buffer.from("12345678901234567890"));
  });
  it("accepts one step either side and refuses replays", () => {
    const t = 1_700_000_000_000,
      step = Math.floor(t / 30000);
    assert.equal(verifyTotp(secret, totp(secret, t - 30000), -1, t), step - 1);
    assert.equal(verifyTotp(secret, totp(secret, t + 30000), -1, t), step + 1);
    assert.equal(verifyTotp(secret, totp(secret, t - 60000), -1, t), null, "two steps old");
    assert.equal(verifyTotp(secret, totp(secret, t), step, t), null, "already used");
    assert.equal(verifyTotp(secret, "12345", -1, t), null);
  });
});

describe("two-factor sign-in", () => {
  let app, token, secret, recovery;
  const email = "buyer@test.local",
    password = "Test-Password-2026";
  const login = (code) => app.call("POST", "/auth/login", { email, password, ...(code ? { code } : {}) });
  before(async () => {
    app = await startApp();
    token = (await app.signup("customer", email)).token;
  });
  after(() => app.stop());

  it("sets up with a confirmation code and returns 10 recovery codes once", async () => {
    assert.equal((await app.call("GET", "/account/2fa", undefined, token)).enabled, false);
    const setup = await app.call("POST", "/account/2fa/setup", undefined, token);
    assert.equal(setup.status, 200);
    secret = setup.secret;
    assert.match(
      setup.otpauthUrl,
      /^otpauth:\/\/totp\/CraftCrew:buyer%40test\.local\?secret=[A-Z2-7]+&issuer=CraftCrew/,
    );
    assert.equal((await app.call("POST", "/account/2fa/enable", { code: "000000" }, token)).status, 400);
    const on = await app.call("POST", "/account/2fa/enable", { code: totp(secret) }, token);
    assert.equal(on.status, 200, on.error);
    recovery = on.recoveryCodes;
    assert.equal(recovery.length, 10);
    assert.equal(new Set(recovery).size, 10);
    const me = await app.call("GET", "/auth/me", undefined, token);
    assert.equal(me.user.twoFactor, true);
    assert.equal(me.user.totp, undefined, "the secret never leaves the server");
  });

  it("asks for the code at sign-in and rejects a wrong one", async () => {
    const missing = await login();
    assert.equal(missing.status, 401);
    assert.equal(missing.code, "TOTP_REQUIRED");
    const wrong = await login("123456");
    assert.equal(wrong.status, 401);
    assert.equal(wrong.code, "TOTP_INVALID");
    // The setup used the current step, so the next one is the first that signs in.
    const ok = await login(totp(secret, Date.now() + 30000));
    assert.equal(ok.status, 200, ok.error);
    assert.ok(ok.token);
  });

  it("accepts each recovery code once", async () => {
    const r = await login(recovery[0].toUpperCase());
    assert.equal(r.status, 200, r.error);
    assert.equal(r.recoveryCodesLeft, 9);
    assert.equal((await login(recovery[0])).status, 401, "used up");
  });

  it("locks the account after repeated wrong codes, like wrong passwords", async () => {
    // 8 failed attempts in 15 minutes lock sign-in (the reused recovery code above was the first).
    for (let i = 0; i < 7; i++) assert.equal((await login("000000")).status, 401);
    assert.equal((await login(recovery[1])).status, 429, "even a right code waits for the lockout");
  });
});

describe("required two-factor sign-in for admins", () => {
  let app, dataDir, admin, secret;
  const adminLogin = (code) =>
    app.call("POST", "/auth/login", {
      email: "admin@test.local",
      password: "Admin-Password-2026!",
      ...(code ? { code } : {}),
    });
  before(async () => {
    dataDir = fs.mkdtempSync(path.join(require("node:os").tmpdir(), "craftcrew-2fa-"));
    app = await startApp({ dataDir });
    admin = (await adminLogin()).token;
  });
  after(async () => {
    await app.stop();
    fs.rmSync(dataDir, { recursive: true, force: true });
  });

  it("can only be required by an admin who uses it", async () => {
    const early = await app.call("PUT", "/admin/security", { requireAdmin2fa: true }, admin);
    assert.equal(early.status, 409);
    secret = (await app.call("POST", "/account/2fa/setup", undefined, admin)).secret;
    await app.call("POST", "/account/2fa/enable", { code: totp(secret) }, admin);
    const on = await app.call("PUT", "/admin/security", { requireAdmin2fa: true }, admin);
    assert.equal(on.status, 200, on.error);
    const off = await app.call(
      "POST",
      "/account/2fa/disable",
      { password: "Admin-Password-2026!", code: "x" },
      admin,
    );
    assert.equal(off.status, 409, "admins can't switch it off while it is required");
  });

  it("sends an admin without it to the setup first", async () => {
    // An admin whose second factor was reset by the operator signs in with the password only.
    await app.stop();
    await require("./helpers").editDb(dataDir, (db) => {
      delete db.users.find((u) => u.email === "admin@test.local").totp;
    });
    app = await require("./helpers").startApp({ dataDir });
    const r = await adminLogin();
    assert.equal(r.status, 200, r.error);
    const blocked = await app.call("GET", "/admin/users", undefined, r.token);
    assert.equal(blocked.status, 403);
    assert.equal(blocked.code, "TOTP_SETUP_REQUIRED");
    assert.equal((await app.call("GET", "/account/2fa", undefined, r.token)).required, true);
    const setup = await app.call("POST", "/account/2fa/setup", undefined, r.token);
    assert.equal(setup.status, 200);
    await app.call("POST", "/account/2fa/enable", { code: totp(setup.secret) }, r.token);
    assert.equal((await app.call("GET", "/admin/users", undefined, r.token)).status, 200);
  });
});
