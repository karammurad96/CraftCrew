// T138: right-to-left layout. A language with dir "rtl" sets <html dir="rtl">; the CSS uses logical properties,
// so the layout mirrors by itself; values keep their own reading order.
const { describe, it } = require("node:test");
const assert = require("node:assert/strict");
const { readFileSync, readdirSync } = require("node:fs");
const path = require("node:path");
const vm = require("node:vm");

const PUBLIC = path.join(__dirname, "..", "public");
const read = (f) => readFileSync(path.join(PUBLIC, f), "utf8");

function browser(dir) {
  const html = { lang: "", dir: "" },
    ctx = {
      console: { warn() {}, error() {}, log() {} },
      localStorage: { getItem: (k) => (k === "cc_lang" ? "xr" : null) },
      navigator: { language: "en-GB" },
      document: { documentElement: html },
      Intl,
      LANGUAGES: [
        { code: "en", name: "English", locale: "en-GB", dir: "ltr" },
        { code: "xr", name: "Test", locale: "en-GB", dir },
      ],
    };
  ctx.window = ctx;
  vm.createContext(ctx);
  vm.runInContext(read("locales/en.js"), ctx);
  ctx.LOCALES.xr = ctx.LOCALES.en;
  vm.runInContext(read("app.js").match(/const esc = [\s\S]*?\n  \);\n/)[0] + read("core/t.js") + ";this.fmt = fmt; this.ltr = ltr;", ctx);
  return { ctx, html };
}

describe("right-to-left (T138)", () => {
  it("sets <html dir> from the language registry", () => {
    assert.equal(browser("rtl").html.dir, "rtl");
    assert.equal(browser("ltr").html.dir, "ltr");
  });

  it("isolates dates, amounts and numbers in a right-to-left language only", () => {
    const rtl = browser("rtl").ctx,
      ltr = browser("ltr").ctx;
    assert.equal(rtl.fmt.money(7400), "⁨€7,400⁩");
    assert.equal(rtl.fmt.range("2026-09-15", "2026-09-29").split("⁨").length, 3, "each date of a range on its own");
    assert.equal(ltr.fmt.money(7400), "€7,400");
    assert.equal(ltr.fmt.number(12.5, 1), "12.5");
    // Phone numbers, ids and addresses always read left to right
    assert.equal(rtl.ltr("+49 941 <x>"), '<bdi dir="ltr">+49 941 &lt;x&gt;</bdi>');
  });

  it("uses logical properties instead of left/right in every stylesheet", () => {
    const found = [];
    const sheets = readdirSync(PUBLIC)
      .filter((f) => f.endsWith(".css"))
      .map((f) => [f, read(f)]);
    sheets.push(["index.html <style>", read("index.html").match(/<style>([\s\S]*?)<\/style>/)[1]]);
    for (const [f, css] of sheets)
      for (const block of css.match(/\{[^{}]*\}/g) || []) {
        // Centring with left: 50% and translateX(-50%) is the same in both directions
        const centred = /translateX\(/.test(block);
        const re = /(?:^|[;{\s])((?:margin|padding|border)-(?:left|right)[a-z-]*|left|right|text-align\s*:\s*(?:left|right)|float\s*:\s*(?:left|right))\s*:?/g;
        for (const m of block.matchAll(re))
          if (!(centred && /^(left|right)$/.test(m[1]))) found.push(`${f}: ${m[1]}`);
      }
    assert.deepEqual(found, []);
  });

  it("mirrors the gantt, the phone drawer and direction arrows", () => {
    assert.match(read("areas/workspace.js"), /inset-inline-start:\$\{left\}%/);
    assert.match(read("mobile-nav.css"), /\[dir="rtl"\] body \.app-shell > \.sidebar\.mnav-open \{\s*animation-name: mnav-in-rtl;/);
    assert.match(read("design-screens.css"), /\[dir="rtl"\] \.dir-flip/);
    for (const f of ["areas/projects.js", "areas/workspace.js", "areas/sourcing.js"])
      assert.doesNotMatch(read(f), /\} → \$\{/, `${f}: arrows between dates use .dir-flip`);
  });
});
