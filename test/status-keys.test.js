// T137: status, priority and category values stay English on the server and are shown through common.status.*.
const { describe, it } = require("node:test");
const assert = require("node:assert/strict");
const { readFileSync, readdirSync } = require("node:fs");
const path = require("node:path");
const vm = require("node:vm");

const ROOT = path.join(__dirname, "..");
const read = (f) => readFileSync(path.join(ROOT, f), "utf8");

function browser(lang, languages, locales = {}) {
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
  // From app.js only esc(); the rest of it needs a real page
  vm.runInContext(read("public/app.js").match(/const esc = [\s\S]*?\n  \);\n/)[0] + read("public/core/t.js"), ctx);
  return ctx;
}
const EN = { code: "en", name: "English", locale: "en-GB", dir: "ltr" },
  DE = { code: "de", name: "Deutsch", locale: "de-DE", dir: "ltr" },
  ZZ = { code: "zz", name: "Test", locale: "en-GB", dir: "ltr" };

describe("status keys (T137)", () => {
  it("has a key for every status list of the server", () => {
    const en = browser("en", [EN, DE]),
      values = new Set();
    for (const f of readdirSync(ROOT).filter((x) => x.endsWith(".js")))
      for (const m of read(f).matchAll(/[A-Z_]*STATUSES = \[([^\]]+)\]|\b(?:status|stage|acceptanceStatus|availability)(?: =|:) "([^"]+)"/g))
        if (m[2]) /[a-z]/.test(m[2]) && m[2] !== "ok" && values.add(m[2]); // not the health check or a CSV header
        else for (const v of m[1].matchAll(/"([^"]+)"/g)) values.add(v[1]);
    assert.ok(values.size > 30, `found ${values.size} values`);
    const missing = [...values].filter((v) => en.statusHtml(v).startsWith("<bdi>"));
    assert.deepEqual(missing, [], "add these to common.status in public/locales/en.js and de.js");
  });

  it("shows values in German, whatever their capitals", () => {
    const de = browser("de", [EN, DE]);
    assert.equal(de.tStatus("Changes Requested"), "Änderungen angefordert");
    assert.equal(de.tStatus("Changes requested"), "Änderungen angefordert");
    assert.equal(de.tStatus("Needs follow-up"), "Nachfassen nötig");
    assert.equal(de.statusHtml("In Progress"), "In Bearbeitung");
  });

  it("shows unknown values as they are, still marked for the old translation", () => {
    const de = browser("de", [EN, DE]);
    assert.equal(de.tStatus("Robot cell <b>"), "Robot cell <b>");
    assert.equal(de.statusHtml("Robot cell <b>"), '<bdi>Robot cell &lt;b&gt;</bdi>');
    assert.equal(de.tStatus(undefined), "");
  });

  it("works in a test language", () => {
    const zz = browser("zz", [EN, DE, ZZ], { zz: { common: { status: { onHold: "⟦On hold⟧" } } } });
    assert.equal(zz.tStatus("On Hold"), "⟦On hold⟧");
    assert.equal(zz.tStatus("Paid"), "Paid", "falls back to English for a key the language lacks");
  });

  it("is used by the area pages instead of the old translation", () => {
    for (const f of readdirSync(path.join(ROOT, "public/areas")))
      assert.doesNotMatch(read("public/areas/" + f), /\b[a-z]+Dom\([a-zA-Z.?]+\.(status|stage|availability)\b/, f);
  });
});
