// T124: browsers keep the session in an HttpOnly cookie; cookie-authenticated changes need the CSRF header and
// the site's own origin. API clients keep using Bearer tokens.
const { describe, it, before, after } = require("node:test");
const assert = require("node:assert/strict");
const { startApp } = require("./helpers");

const PW = "Test-Password-2026";

describe("cookie sessions", () => {
  let app, cookie;
  const browserLogin = async () => {
    const r = await fetch(app.base + "/api/auth/login", {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({ email: "cookie@test.local", password: PW }),
    });
    return { status: r.status, setCookie: r.headers.get("set-cookie") || "", body: await r.json() };
  };
  const withCookie = (path, opts = {}) =>
    fetch(app.base + "/api" + path, {
      ...opts,
      headers: { "Content-Type": "application/json", Cookie: cookie, ...(opts.headers || {}) },
    });

  before(async () => {
    app = await startApp();
    await app.signup("customer", "cookie@test.local");
  });
  after(() => app.stop());

  it("sets an HttpOnly, SameSite=Strict cookie and keeps the token out of the browser's reply", async () => {
    const r = await browserLogin();
    assert.equal(r.status, 200);
    assert.match(r.setCookie, /^cc_session=[a-f0-9]{64}; HttpOnly; SameSite=Strict; Path=\/; Max-Age=604800$/);
    assert.equal(r.body.token, undefined, "no token in the body for browsers");
    assert.equal(r.body.user.email, "cookie@test.local");
    cookie = r.setCookie.split(";")[0];
    // API clients still get it
    assert.match((await app.call("POST", "/auth/login", { email: "cookie@test.local", password: PW })).token, /^[a-f0-9]{64}$/);
  });

  it("signs the browser in with the cookie alone", async () => {
    const r = await withCookie("/auth/me");
    assert.equal(r.status, 200);
    assert.equal((await r.json()).user.email, "cookie@test.local");
  });

  it("refuses cookie changes without the CSRF header or from another site", async () => {
    const body = JSON.stringify({ language: "de" });
    const noHeader = await withCookie("/account/preferences", { method: "PUT", body });
    assert.equal(noHeader.status, 403);
    assert.equal((await noHeader.json()).code, "CSRF");
    const foreign = await withCookie("/account/preferences", {
      method: "PUT",
      body,
      headers: { "X-CSRF": "1", Origin: "https://evil.example" },
    });
    assert.equal(foreign.status, 403);
    const ok = await withCookie("/account/preferences", {
      method: "PUT",
      body,
      headers: { "X-CSRF": "1", Origin: app.base },
    });
    assert.equal(ok.status, 200);
  });

  it("doesn't need the CSRF header for Bearer clients", async () => {
    const token = await app.login("cookie@test.local", PW);
    assert.equal((await app.call("PUT", "/account/preferences", { language: "en" }, token)).status, 200);
  });

  it("moves an old localStorage token to the cookie once", async () => {
    const token = await app.login("cookie@test.local", PW);
    const r = await fetch(app.base + "/api/auth/upgrade", { method: "POST", headers: { Authorization: "Bearer " + token } });
    assert.equal(r.status, 200);
    assert.match(r.headers.get("set-cookie"), new RegExp(`^cc_session=${token}; HttpOnly`));
    assert.equal((await fetch(app.base + "/api/auth/upgrade", { method: "POST", headers: { Authorization: "Bearer " + "0".repeat(64) } })).status, 401);
  });

  it("keeps the browser's own session when it signs out other sessions or changes the password (T135a)", async () => {
    const other = await app.login("cookie@test.local", PW),
      change = (path, method, body) => withCookie(path, { method, body: JSON.stringify(body || {}), headers: { "X-CSRF": "1" } }),
      bearerMe = (token) => fetch(app.base + "/api/auth/me", { headers: { Authorization: "Bearer " + token } }).then((r) => r.status);
    const r = await change("/account/sessions", "DELETE");
    assert.equal(r.status, 200);
    assert.ok((await r.json()).revoked >= 1);
    assert.equal((await withCookie("/auth/me")).status, 200, "this browser stays signed in");
    assert.equal(await bearerMe(other), 401, "the other session ended");
    const other2 = await app.login("cookie@test.local", PW);
    assert.equal((await change("/account/password", "POST", { currentPassword: PW, newPassword: PW + "x1", confirm: PW + "x1" })).status, 200);
    assert.equal((await withCookie("/auth/me")).status, 200, "still signed in after the change");
    assert.equal(await bearerMe(other2), 401);
    assert.equal((await change("/account/password", "POST", { currentPassword: PW + "x1", newPassword: PW, confirm: PW })).status, 200);
  });

  it("signs out: ends the session and clears the cookie", async () => {
    const r = await withCookie("/auth/logout", { method: "POST", headers: { "X-CSRF": "1" } });
    assert.equal(r.status, 200);
    assert.match(r.headers.get("set-cookie"), /^cc_session=; HttpOnly; SameSite=Strict; Path=\/; Max-Age=0$/);
    assert.equal((await withCookie("/auth/me")).status, 401);
  });

  it("keeps the session out of reach of page scripts", () => {
    const { readdirSync, readFileSync } = require("node:fs"),
      path = require("node:path"),
      dir = path.join(__dirname, "..", "public");
    for (const f of readdirSync(dir).filter((x) => x.endsWith(".js"))) {
      const src = readFileSync(path.join(dir, f), "utf8");
      assert.doesNotMatch(src, /"Bearer " \+ state\.token|Bearer \$\{state\.token\}/, `${f} sends the token by hand`);
      assert.doesNotMatch(src, /localStorage\.setItem\("cc_token"/, `${f} stores the token`);
    }
    // api() sends the CSRF header with every request
    assert.match(readFileSync(path.join(dir, "app.js"), "utf8"), /opts\.headers = \{ \.\.\.\(opts\.headers \|\| \{\}\), "X-CSRF": "1" \};/);
  });

  it("marks the cookie Secure behind HTTPS", async () => {
    const r = await fetch(app.base + "/api/auth/login", {
      method: "POST",
      headers: { "Content-Type": "application/json", "X-Forwarded-Proto": "https" },
      body: JSON.stringify({ email: "cookie@test.local", password: PW }),
    });
    assert.match(r.headers.get("set-cookie"), /; HttpOnly; Secure; SameSite=Strict;/);
  });
});

// T141: behind a proxy that rewrites Host (port forwarding, load balancers) the browser's Origin is the public
// address. It passes when the proxy forwards it (TRUST_PROXY=1) or when it is the configured APP_URL.
describe("cookie sessions behind a proxy", () => {
  let app, cookie;
  const change = (headers) =>
    fetch(app.base + "/api/account/preferences", {
      method: "PUT",
      body: JSON.stringify({ language: "en" }),
      headers: { "Content-Type": "application/json", Cookie: cookie, "X-CSRF": "1", ...headers },
    }).then((r) => r.status);

  before(async () => {
    app = await startApp({ env: { TRUST_PROXY: "1", APP_URL: "https://app.example" } });
    await app.signup("customer", "proxy@test.local");
    const r = await fetch(app.base + "/api/auth/login", {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({ email: "proxy@test.local", password: PW }),
    });
    cookie = (r.headers.get("set-cookie") || "").split(";")[0];
  });
  after(() => app.stop());

  it("accepts the configured public address and the host the proxy forwarded", async () => {
    assert.equal(await change({ Origin: "https://app.example" }), 200);
    assert.equal(await change({ Origin: "https://tunnel.example", "X-Forwarded-Host": "tunnel.example" }), 200);
    assert.equal(await change({ Referer: "https://app.example/#/customer/projects/new" }), 200);
  });

  it("still blocks other websites", async () => {
    assert.equal(await change({ Origin: "https://evil.example" }), 403);
    assert.equal(await change({ Origin: "https://evil.example", "X-Forwarded-Host": "app.example" }), 403);
  });
});

describe("cookie sessions without a trusted proxy", () => {
  it("ignores a forwarded host", async () => {
    const app = await startApp();
    try {
      await app.signup("customer", "direct@test.local");
      const r = await fetch(app.base + "/api/auth/login", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ email: "direct@test.local", password: PW }),
      });
      const cookie = (r.headers.get("set-cookie") || "").split(";")[0];
      const status = await fetch(app.base + "/api/account/preferences", {
        method: "PUT",
        body: JSON.stringify({ language: "en" }),
        headers: { "Content-Type": "application/json", Cookie: cookie, "X-CSRF": "1", Origin: "https://tunnel.example", "X-Forwarded-Host": "tunnel.example" },
      }).then((x) => x.status);
      assert.equal(status, 403);
    } finally {
      app.stop();
    }
  });
});
