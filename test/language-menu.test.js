// T152: one globe button with the current language opens the list of every registered language, so the top bar
// and the sidebar stay the same size however many languages there are. Old cached shells lose links that no
// longer exist (T140's public directory) instead of showing a raw key.
const { describe, it } = require("node:test");
const assert = require("node:assert/strict");
const vm = require("node:vm");
const path = require("node:path");
const { readFileSync } = require("node:fs");

const read = (f) => readFileSync(path.join(__dirname, "..", "public", f), "utf8");
function load(lang) {
  const ctx = {
    console,
    localStorage: { getItem: (k) => (k === "cc_lang" ? lang : null), setItem() {} },
    navigator: { language: "en-GB" },
    document: { documentElement: {}, addEventListener() {} },
    Intl,
    esc: (s) => String(s ?? "").replace(/[&<>'"]/g, (c) => ({ "&": "&amp;", "<": "&lt;", ">": "&gt;", "'": "&#39;", '"': "&quot;" })[c]),
  };
  ctx.window = ctx;
  vm.createContext(ctx);
  for (const f of ["core/languages.js", "locales/en.js", "locales/de.js", "core/t.js"]) vm.runInContext(read(f), ctx, { filename: f });
  return ctx;
}

describe("language menu (T152)", () => {
  it("is one globe button with the current language and a list of every language", () => {
    const ctx = load("de"),
      html = vm.runInContext('langSwitch("Sprache", "shell.lang")', ctx);
    assert.match(html, /^<details class="i18n-menu"><summary aria-label="Sprache: Deutsch" title="Sprache"><svg class="i18n-globe"/);
    assert.ok(html.includes('<span class="i18n-code">DE</span></summary>'));
    const langs = JSON.parse(vm.runInContext("JSON.stringify(LANGUAGES.map((l) => l.code))", ctx));
    for (const code of langs) assert.match(html, new RegExp(`data-action="shell\\.lang" data-lang="${code}"`), code);
    assert.match(html, /class="on" aria-pressed="true" data-action="shell\.lang" data-lang="de"/);
    assert.ok(html.includes("<span>English</span><small>EN</small>"));
  });

  it("drops top-bar links that the current version has no text for", () => {
    const app = read("app.js");
    assert.match(app, /if \(key\) a\.textContent = t\("ui\.nav\." \+ key\);\n\s+else a\.remove\(\);/);
    assert.ok(!read("index.html").includes('href="#/suppliers"'));
  });
});
