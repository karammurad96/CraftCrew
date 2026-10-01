// Design 2026 (T90–T105): static checks that the design layers are wired up correctly.
const { describe, it } = require("node:test");
const assert = require("node:assert/strict");
const { readFileSync } = require("node:fs");
const path = require("node:path");

const PUBLIC = path.join(__dirname, "..", "public");
const read = (f) => readFileSync(path.join(PUBLIC, f), "utf8");
const index = read("index.html");

describe("design 2026", () => {
  it("loads design-2026.css after every other stylesheet", () => {
    const sheets = [...index.matchAll(/<link rel="stylesheet" href="([^"]+)"/g)].map((m) => m[1]);
    const at = sheets.indexOf("design-2026.css");
    assert.ok(at >= 0, "design-2026.css is not loaded");
    const later = sheets.slice(at + 1).filter((s) => s !== "design-screens.css");
    assert.deepEqual(later, [], "stylesheets loaded after design-2026.css");
    // The inline <style> block must come before it too.
    assert.ok(index.lastIndexOf("</style>") < index.indexOf("design-2026.css"));
  });

  it("translates fixed labels inside .ds-ui", () => {
    const scope = read("i18n.js").match(/const I18N_UI_SCOPE =\s*"([^"]+)"/)[1];
    assert.ok(
      scope.split(",").map((s) => s.trim()).includes(".ds-ui"),
      ".ds-ui is missing from I18N_UI_SCOPE",
    );
  });

  it("draws every .brand-mark with the Flow mark (T91)", () => {
    const { readdirSync } = require("node:fs");
    const FLOW =
      '<svg viewBox="0 0 64 64" aria-hidden="true" focusable="false"><path d="M14 50C24 42 40 22 50 14"/><circle cx="14" cy="50" r="8.5"/><circle cx="50" cy="14" r="8.5"/></svg>';
    const files = [...readdirSync(PUBLIC).filter((f) => f.endsWith(".js")), "index.html"];
    let marks = 0;
    for (const f of files) {
      const src = read(f);
      assert.doesNotMatch(src, /M25\.8 8\.5/, `${f} still has the old logo`);
      for (const m of src.matchAll(/<span class="brand-mark"[^>]*>(<svg[\s\S]*?<\/svg>)/g)) {
        marks++;
        assert.equal(m[1], FLOW, `${f} has a .brand-mark that is not the Flow mark`);
      }
    }
    assert.ok(marks >= 8, `expected at least 8 logos, found ${marks}`);
  });

  it("uses a new service worker cache so installed apps load the new files", () => {
    assert.match(read("sw.js"), /const CACHE = "craftcrew-shell-v2"/);
  });
});
