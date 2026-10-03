// T126b: sign-in, sign-up, confirmation, forgotten and reset password render from translation keys and keep
// their behaviour: consent box, two-factor code field, resend link, "check your inbox", session-expired notice.
const { describe, it } = require("node:test");
const assert = require("node:assert/strict");
const { readFileSync } = require("node:fs");
const path = require("node:path");
const vm = require("node:vm");

const read = (f) => readFileSync(path.join(__dirname, "..", "public", f), "utf8");

// A tiny DOM: enough for the auth page's own code (forms, error box, insertAdjacentHTML).
function area(lang, { mail = false, session = {} } = {}) {
  const warnings = [],
    calls = [],
    handlers = {};
  const ctx = {
    console: { warn: (...a) => warnings.push(a.join(" ")), error() {}, log() {} },
    localStorage: { getItem: (k) => (k === "cc_lang" ? lang : null), setItem() {}, removeItem() {} },
    sessionStorage: { getItem: (k) => session[k] ?? null, removeItem: (k) => delete session[k] },
    navigator: { language: "en-GB" },
    document: { addEventListener: (type, fn) => (handlers[type] = fn), querySelector: () => null, getElementById: () => null, body: { classList: { add() {} } } },
    location: { hash: "" },
    Intl,
    URLSearchParams,
    app: { innerHTML: "" },
    state: { user: null },
    route: async () => {},
    topActions() {},
    navigate: (p) => calls.push("navigate " + p),
    toast: (m) => calls.push("toast " + m),
    toastEl: { dataset: {} },
    ccSignedIn: (u) => calls.push("signed in " + u.email),
    publicLayout: (html) => html,
    esc: (s) => String(s ?? "").replace(/[&<>'"]/g, (c) => ({ "&": "&amp;", "<": "&lt;", ">": "&gt;", "'": "&#39;", '"': "&quot;" })[c]),
    api: async (p, o) => {
      calls.push(`api ${p} ${JSON.stringify(o?.body || {})}`);
      if (p === "/platform-config") return { mailEnabled: mail };
      return ctx.reply(p, o);
    },
    reply: async () => ({}),
    setTimeout: () => {},
  };
  ctx.window = ctx;
  vm.createContext(ctx);
  for (const f of ["core/languages.js", "locales/en.js", "locales/de.js", "core/t.js", "core/actions.js", "core/router.js", "areas/auth.js"])
    vm.runInContext(read(f), ctx, { filename: f });
  Object.assign(ctx, { warnings, calls, handlers });
  ctx.render = async (hash) => {
    ctx.location.hash = "#" + hash;
    await ctx.route();
    return ctx.app.innerHTML;
  };
  ctx.run = (name, el) => vm.runInContext("actions", ctx).run(name, el, {});
  return ctx;
}
const PAGES = ["/login", "/signup", "/forgot", "/reset?token=abc", "/verify?token=abc"];

describe("auth area", () => {
  for (const lang of ["en", "de"])
    it(`renders every page in ${lang === "en" ? "English" : "German"} without a missing key`, async () => {
      const ctx = area(lang);
      for (const p of PAGES) {
        const html = await ctx.render(p);
        assert.match(html, /data-i18n="keys"/, p);
        // text only: data-action="auth.submit" is an action name, not a text
        assert.doesNotMatch(html.replace(/<[^>]*>/g, " "), /\bauth\.[a-zA-Z]+\b/, `${p} shows a raw key`);
      }
      assert.deepEqual(ctx.warnings, []);
    });

  it("draws the sign-up form in German with the consent box and links", async () => {
    const html = await area("de").render("/signup");
    assert.ok(html.includes("<h1>Konto erstellen</h1>") || html.includes("Konto"));
    assert.match(html, /<label class="legal-consent"><input type="checkbox" name="legalConsent" required> <span>Ich akzeptiere die <a href="#\/terms" target="_blank">Nutzungsbedingungen<\/a> und habe die <a href="#\/privacy" target="_blank">Datenschutzerklärung<\/a> gelesen\.<\/span><\/label>/);
    assert.ok(html.includes('<form id="authForm" data-action="auth.submit" data-mode="signup">'));
    assert.doesNotMatch(html, /onclick|onsubmit/);
  });

  it("shows the expired-session notice and the forgot link only when they apply", async () => {
    assert.ok(!(await area("en").render("/login")).includes("nf-expired"));
    assert.ok((await area("en", { session: { cc_expired: "1" } }).render("/login")).includes('class="notice warn nf-expired"'));
  });

  it("keeps every old sign-in behaviour in one place", () => {
    const src = read("areas/auth.js");
    for (const behaviour of [
      'err.code === "TOTP_REQUIRED" || err.code === "TOTP_INVALID"', // two-factor code field
      'err.code === "EMAIL_UNVERIFIED"', // resend the confirmation link
      "if (d.verificationRequired) return authCheckInbox(d.email);", // check your inbox
      'err.code === "emailAlreadyRegistered"', // friendlier duplicate message
      'span.dataset.i18n = translated ? "keys" : "dom";', // server messages keep the old translation
      "language: ccLang", // new accounts start in the chosen language
    ])
      assert.ok(src.includes(behaviour), behaviour);
    // The old decorators are gone
    for (const [f, gone] of [
      ["legal-security.js", /legalSignupConsent|authLoginExtras|authForgotPage|authResetPage|authVerifyPage|legalSignupApi/],
      ["twofactor-ui.js", /tfCodeField/],
      ["not-found.js", /nf-expired/],
      ["app.js", /function renderAuth/],
      ["enhancements.js", /function renderAuth/],
      ["workflows.js", /renderAuth/],
    ])
      assert.doesNotMatch(read(f), gone, f);
  });

  it("lets the server's error messages keep the old translation inside the key page", () => {
    const src = read("i18n.js");
    assert.ok(src.includes('const i18nKeyPage = (el) => el.closest("[data-i18n]")?.dataset.i18n === "keys";'));
  });
});
