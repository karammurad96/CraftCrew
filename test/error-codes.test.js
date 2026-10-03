// T137: API errors carry a stable code (their key in errors.api of public/locales/en.js), and the browser shows
// them in the user's language. A new server message without an entry fails the first test.
const { describe, it, before, after } = require("node:test");
const assert = require("node:assert/strict");
const { readFileSync, readdirSync } = require("node:fs");
const path = require("node:path");
const vm = require("node:vm");
const { startApp, projectWithTasks } = require("./helpers");

const ROOT = path.join(__dirname, "..");
const read = (f) => readFileSync(path.join(ROOT, f), "utf8");

// The browser files in one VM context, with LANGUAGES given by the test (so a test language can be added)
function browser(lang, languages, locales) {
  const ctx = {
    console: { warn() {}, error() {}, log() {} },
    localStorage: { getItem: (k) => (k === "cc_lang" ? lang : null) },
    navigator: { language: "en-GB" },
    Intl,
    LANGUAGES: languages,
  };
  ctx.window = ctx;
  vm.createContext(ctx);
  for (const f of ["public/locales/en.js", "public/locales/de.js"]) vm.runInContext(read(f), ctx);
  Object.assign(ctx.LOCALES, locales);
  vm.runInContext(read("public/core/t.js"), ctx);
  return ctx;
}
const EN = { code: "en", name: "English", locale: "en-GB", dir: "ltr" },
  DE = { code: "de", name: "Deutsch", locale: "de-DE", dir: "ltr" },
  ZZ = { code: "zz", name: "Test", locale: "en-GB", dir: "ltr" };
// The test language: every text of English wrapped in ⟦ ⟧, placeholders kept
const wrap = (node) =>
  Object.fromEntries(Object.entries(node).map(([k, v]) => [k, typeof v === "string" ? `⟦${v}⟧` : Array.isArray(v) ? v : wrap(v)]));

// The messages in an `error: …` expression of the server files: string literals, and template literals with
// their ${…} parts as placeholders.
function serverMessages() {
  const out = [];
  for (const f of readdirSync(ROOT).filter((x) => x.endsWith(".js"))) {
    const src = read(f),
      re = /\berror:\s*/g;
    let m;
    while ((m = re.exec(src))) {
      let depth = 0,
        j = m.index + m[0].length,
        q = null;
      for (; j < src.length; j++) {
        const c = src[j];
        if (q) {
          if (c === "\\") j++;
          else if (c === q) q = null;
        } else if (c === '"' || c === "`" || c === "'") q = c;
        else if ("([{".includes(c)) depth++;
        else if (")]}".includes(c)) {
          if (!depth) break;
          depth--;
        } else if ((c === "," || c === ";") && !depth) break;
      }
      const expr = src.slice(m.index + m[0].length, j);
      for (const l of expr.matchAll(/"((?:[^"\\]|\\.)*)"|`((?:[^`\\]|\\.)*)`/g)) {
        if (/[!=]==\s*$/.test(expr.slice(0, l.index))) continue; // a comparison inside the expression, not a message
        const text = l[1] !== undefined ? JSON.parse(`"${l[1]}"`) : l[2].replace(/\$\{[^}]*\}/g, "X");
        // Parts of a message built from a list (e.g. "Status must be " + list.join(", ")) are checked through the API
        if (/[a-z]/.test(text) && !/[ :]$/.test(text) && !/^[,.]/.test(text)) out.push({ file: f, text });
      }
    }
  }
  return out;
}

describe("API error codes (T137)", () => {
  const en = browser("en", [EN, DE], {});
  const leaves = (node, prefix = "", out = []) => {
    for (const [k, v] of Object.entries(node)) typeof v === "object" ? leaves(v, `${prefix}${k}.`, out) : out.push([prefix + k, v]);
    return out;
  };
  const table = leaves(en.LOCALES.en.errors.api);
  const known = (text) =>
    table.some(([, v]) => v === text || new RegExp("^" + v.replace(/[.*+?^$()|[\]\\]/g, "\\$&").replace(/\\?\{\w+\\?\}/g, ".+") + "$").test(text));

  it("has an errors.api entry for every server error message", () => {
    const messages = serverMessages();
    assert.ok(messages.length > 250, `found ${messages.length} messages`);
    const missing = messages.filter((m) => !known(m.text)).map((m) => `${m.file}: ${m.text}`);
    assert.deepEqual(missing, [], "add these to errors.api in public/locales/en.js and de.js");
  });

  describe("on the server", () => {
    let app, customer, project;
    before(async () => {
      app = await startApp();
      customer = (await app.signup("customer", "codes@test.local")).token;
      ({ project } = await projectWithTasks(app, customer));
    });
    after(() => app.stop());

    it("adds the code to a fixed message", async () => {
      const r = await app.call("GET", "/projects");
      assert.equal(r.status, 401);
      assert.equal(r.code, "authenticationRequired");
      const short = await app.call("POST", "/auth/signup", { name: "A", email: "x@test.local", password: "short", role: "customer", acceptTerms: true });
      assert.equal(short.status, 400);
      assert.ok(short.code && en.LOCALES.de.errors.api[short.code], `${short.code}: has German`);
    });

    it("adds the code and params to a message with values", async () => {
      const r = await app.call("PUT", `/projects/${project.id}`, { status: "Nope" }, customer);
      assert.equal(r.status, 400);
      assert.equal(r.code, "chooseOneOfTheseStatuses");
      assert.match(r.params.list, /^Not Started, In Progress/);
    });

  });

  describe("in the browser", () => {
    it("shows the message in German, with its values", () => {
      const de = browser("de", [EN, DE], {});
      assert.equal(de.apiErrorText({ error: "Task not found", code: "taskNotFound" }), "Aufgabe nicht gefunden");
      assert.equal(
        de.apiErrorText({ error: "x", code: "checkInIsPossibleFrom", params: { from: "2026-10-04", to: "2026-10-05" } }),
        "Check-in ist vom 2026-10-04 bis 2026-10-05 möglich",
      );
      assert.equal(de.apiErrorText({ error: "x", code: "teamNone.supplier.invoices" }), "Ihre Teamrolle hat keinen Zugriff auf Rechnungen");
    });

    it("finds an error with its own code by its English message, and shows unknown messages as sent", () => {
      const de = browser("de", [EN, DE], {});
      assert.equal(
        de.apiErrorText({ error: "Please confirm your email address first — we sent you a link.", code: "EMAIL_UNVERIFIED" }),
        de.LOCALES.de.errors.api.pleaseConfirmYourEmailAddress,
      );
      assert.equal(de.apiErrorText({ error: "Something new" }), "Something new");
      assert.equal(de.apiErrorText({}), de.LOCALES.de.ui.requestFailed);
    });

    it("works the same in a test language", () => {
      const zz = browser("zz", [EN, DE, ZZ], { zz: wrap(browser("en", [EN], {}).LOCALES.en) });
      assert.equal(zz.apiErrorText({ error: "Task not found", code: "taskNotFound" }), "⟦Task not found⟧");
      assert.equal(zz.apiErrorText({ error: "x", code: "deliveryFailed", params: { reason: "timeout" } }), "⟦Delivery failed: timeout⟧");
    });
  });
});
