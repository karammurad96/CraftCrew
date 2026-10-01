/*
 * Two-factor sign-in (T67): RFC 6238 TOTP with Node's crypto only (HMAC-SHA1, 30-second steps, 6 digits,
 * ±1 step), set up from settings with a confirmation code and 10 one-time recovery codes (stored hashed).
 * Admins can require it for every admin account.
 */
const crypto = require("node:crypto");

const ALPHABET = "ABCDEFGHIJKLMNOPQRSTUVWXYZ234567";
function base32Encode(buf) {
  let bits = 0,
    value = 0,
    out = "";
  for (const byte of buf) {
    value = (value << 8) | byte;
    bits += 8;
    while (bits >= 5) {
      out += ALPHABET[(value >>> (bits - 5)) & 31];
      bits -= 5;
    }
  }
  if (bits > 0) out += ALPHABET[(value << (5 - bits)) & 31];
  return out;
}
function base32Decode(text) {
  const clean = String(text)
    .toUpperCase()
    .replace(/[\s=-]/g, "");
  let bits = 0,
    value = 0;
  const out = [];
  for (const ch of clean) {
    const i = ALPHABET.indexOf(ch);
    if (i < 0) throw new Error("bad base32");
    value = (value << 5) | i;
    bits += 5;
    if (bits >= 8) {
      out.push((value >>> (bits - 8)) & 255);
      bits -= 8;
    }
  }
  return Buffer.from(out);
}
// RFC 4226 HOTP value for a counter.
function hotp(secret, counter, digits = 6) {
  const msg = Buffer.alloc(8);
  msg.writeBigUInt64BE(BigInt(counter));
  const mac = crypto.createHmac("sha1", base32Decode(secret)).update(msg).digest(),
    offset = mac[mac.length - 1] & 15,
    code = (mac.readUInt32BE(offset) & 0x7fffffff) % 10 ** digits;
  return String(code).padStart(digits, "0");
}
const STEP = 30;
const stepAt = (ms = Date.now()) => Math.floor(ms / 1000 / STEP);
const totp = (secret, ms = Date.now()) => hotp(secret, stepAt(ms));
// Returns the matching time step (current ±1) or null. A step at or before `lastStep` is refused (no replay).
function verifyTotp(secret, code, lastStep = -1, ms = Date.now()) {
  if (!/^\d{6}$/.test(String(code || ""))) return null;
  const now = stepAt(ms);
  for (const step of [now - 1, now, now + 1]) {
    const expected = Buffer.from(hotp(secret, step)),
      given = Buffer.from(String(code));
    if (step > lastStep && crypto.timingSafeEqual(expected, given)) return step;
  }
  return null;
}
const hashCode = (code) =>
  crypto
    .createHash("sha256")
    .update(
      String(code)
        .toLowerCase()
        .replace(/[^a-z0-9]/g, ""),
    )
    .digest("hex");
const newRecoveryCodes = () =>
  Array.from({ length: 10 }, () => {
    const raw = crypto.randomBytes(5).toString("hex");
    return `${raw.slice(0, 5)}-${raw.slice(5)}`;
  });

module.exports = function createTwoFactor(ctx) {
  const { getDb, save, send, body, now, verifyPassword } = ctx;
  const enabled = (account) => !!account?.totp?.enabledAt;
  const required = (user) => user.role === "admin" && !!getDb().settings?.requireAdmin2fa;

  // Login step: checks a TOTP or recovery code for an account with two-factor sign-in.
  // Returns {ok, usedRecovery, left} or {ok: false}.
  function checkLogin(account, code) {
    const text = String(code || "").trim();
    const step = verifyTotp(account.totp.secret, text.replace(/\s/g, ""), account.totp.lastStep ?? -1);
    if (step !== null) {
      account.totp.lastStep = step;
      return { ok: true };
    }
    const i = (account.totp.recovery || []).findIndex((r) => !r.usedAt && r.hash === hashCode(text));
    if (i >= 0) {
      account.totp.recovery[i].usedAt = now();
      return { ok: true, usedRecovery: true, left: account.totp.recovery.filter((r) => !r.usedAt).length };
    }
    return { ok: false };
  }

  async function handle(req, res, url, parts, user) {
    if (!(parts[1] === "account" && parts[2] === "2fa")) {
      if (parts[1] === "admin" && parts[2] === "security" && req.method === "PUT") {
        if (user.role !== "admin") return (send(res, 403, { error: "Admin only" }), true);
        const b = await body(req),
          db = getDb();
        if (typeof b.requireAdmin2fa !== "boolean")
          return (send(res, 400, { error: "Turn the admin two-factor requirement on or off" }), true);
        if (b.requireAdmin2fa && !enabled(user.self || user))
          return (send(res, 409, { error: "Turn on two-factor sign-in for your own account first." }), true);
        db.settings = { ...(db.settings || {}), requireAdmin2fa: b.requireAdmin2fa };
        save();
        return (send(res, 200, { requireAdmin2fa: b.requireAdmin2fa }), true);
      }
      return false;
    }
    const account = getDb().users.find((u) => u.id === (user.self || user).id),
      method = req.method,
      action = parts[3] || "";
    if (!account) return false;
    // GET /api/account/2fa: status only, never the secret.
    if (!action && method === "GET")
      return (
        send(res, 200, {
          enabled: enabled(account),
          required: required(user),
          enabledAt: account.totp?.enabledAt || null,
          recoveryLeft: enabled(account) ? account.totp.recovery.filter((r) => !r.usedAt).length : 0,
        }),
        true
      );
    // POST /api/account/2fa/setup: a new secret to scan or type in; it is active only after confirmation.
    if (action === "setup" && method === "POST") {
      if (enabled(account))
        return (
          send(res, 409, {
            error: "Two-factor sign-in is already on. Turn it off first to set it up again.",
          }),
          true
        );
      const secret = base32Encode(crypto.randomBytes(20));
      account.totpPending = { secret, createdAt: now() };
      save();
      const label = `CraftCrew:${encodeURIComponent(account.email)}`;
      return (
        send(res, 200, {
          secret,
          otpauthUrl: `otpauth://totp/${label}?secret=${secret}&issuer=CraftCrew&algorithm=SHA1&digits=6&period=30`,
        }),
        true
      );
    }
    // POST /api/account/2fa/enable {code}: confirms the app works and returns the recovery codes once.
    if (action === "enable" && method === "POST") {
      const b = await body(req),
        pending = account.totpPending;
      if (!pending || Date.now() - Date.parse(pending.createdAt) > 15 * 60000)
        return (send(res, 400, { error: "Start the setup again; it expires after 15 minutes." }), true);
      const step = verifyTotp(pending.secret, String(b.code || "").replace(/\s/g, ""));
      if (step === null)
        return (
          send(res, 400, { error: "That code is not right. Check the time on your phone and try again." }),
          true
        );
      const codes = newRecoveryCodes();
      account.totp = {
        secret: pending.secret,
        enabledAt: now(),
        lastStep: step,
        recovery: codes.map((c) => ({ hash: hashCode(c), usedAt: null })),
      };
      delete account.totpPending;
      save();
      return (send(res, 200, { enabled: true, recoveryCodes: codes }), true);
    }
    // POST /api/account/2fa/disable {password, code}: needs the password and a current or recovery code.
    if (action === "disable" && method === "POST") {
      const b = await body(req);
      if (!enabled(account)) return (send(res, 200, { enabled: false }), true);
      if (required(user))
        return (send(res, 409, { error: "Two-factor sign-in is required for admin accounts." }), true);
      if (!verifyPassword(String(b.password || ""), account))
        return (send(res, 400, { error: "Your password is incorrect" }), true);
      if (!checkLogin(account, b.code).ok)
        return (
          send(res, 400, { error: "That code is not right. Check the time on your phone and try again." }),
          true
        );
      delete account.totp;
      save();
      return (send(res, 200, { enabled: false }), true);
    }
    return false;
  }

  // While admins must use two-factor sign-in, an admin without it may only set it up.
  function setupRequired(user, parts) {
    return required(user) && !enabled(user.self || user) && !(parts[1] === "account" && parts[2] === "2fa");
  }

  return { handle, checkLogin, enabled, setupRequired };
};
module.exports.totp = totp;
module.exports.hotp = hotp;
module.exports.verifyTotp = verifyTotp;
module.exports.base32Encode = base32Encode;
module.exports.base32Decode = base32Decode;
