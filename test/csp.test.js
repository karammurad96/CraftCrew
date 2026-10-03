// T136: the Content-Security-Policy allows scripts from this site only, so the page has no inline scripts and no
// inline event handlers; the old DOM translation layer (i18n.js) is gone.
const { describe, it, before, after } = require("node:test");
const assert = require("node:assert/strict");
const { readFileSync, readdirSync, existsSync } = require("node:fs");
const path = require("node:path");
const { startApp } = require("./helpers");

const PUBLIC = path.join(__dirname, "..", "public");
// Every frontend file except third-party code
function files(dir = PUBLIC, out = []) {
  for (const e of readdirSync(dir, { withFileTypes: true })) {
    const p = path.join(dir, e.name);
    if (e.isDirectory()) e.name !== "vendor" && files(p, out);
    else if (/\.(js|html)$/.test(e.name)) out.push(p);
  }
  return out;
}

describe("strict CSP (T136)", () => {
  it("has no inline event handlers in the frontend", () => {
    const found = [];
    for (const f of files())
      for (const m of readFileSync(f, "utf8").matchAll(/<[a-z][^<>]*\son[a-z]+\s*=\s*["'\\]/gi)) found.push(`${path.relative(PUBLIC, f)}: ${m[0].slice(0, 80)}`);
    assert.deepEqual(found, []);
  });

  it("has no inline scripts: every script tag has a src", () => {
    const found = [];
    for (const f of files())
      for (const m of readFileSync(f, "utf8").matchAll(/<script(?![^>]*\bsrc=)[^>]*>/gi)) found.push(`${path.relative(PUBLIC, f)}: ${m[0]}`);
    assert.deepEqual(found, []);
    const index = readFileSync(path.join(PUBLIC, "index.html"), "utf8");
    assert.match(index, /<script src="core\/boot\.js"><\/script><\/body>/, "core/boot.js starts the app last");
    assert.match(readFileSync(path.join(PUBLIC, "core", "boot.js"), "utf8"), /navigator\.serviceWorker\.register\("sw\.js"\)/);
  });

  it("removed the DOM translation layer", () => {
    assert.ok(!existsSync(path.join(PUBLIC, "i18n.js")));
    const index = readFileSync(path.join(PUBLIC, "index.html"), "utf8");
    assert.doesNotMatch(index, /i18n\.js/);
    for (const f of files()) assert.doesNotMatch(readFileSync(f, "utf8"), /data-i18n|I18N_DE|i18nText/, path.relative(PUBLIC, f));
  });

  describe("on the server", () => {
    let app;
    before(async () => (app = await startApp()));
    after(() => app.stop());

    it("sends script-src 'self' without 'unsafe-inline'", async () => {
      const r = await fetch(app.base + "/");
      const csp = r.headers.get("content-security-policy");
      assert.match(csp, /(^|; )script-src 'self'(;|$)/);
      assert.match(csp, /style-src 'self' 'unsafe-inline'/, "style= attributes still work");
    });
  });
});
