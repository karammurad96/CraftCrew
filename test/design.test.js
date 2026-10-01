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

  it("uses a new service worker cache so installed apps load the new files", () => {
    assert.match(read("sw.js"), /const CACHE = "craftcrew-shell-v2"/);
  });
});
