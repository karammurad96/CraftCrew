// The new-project form is a white card in the page column. A later wrapper rule once removed its padding, so its
// fields sat on the card's edge. The last rule for it, in the page's stylesheet order, must keep a padding.
const { it } = require("node:test");
const assert = require("node:assert/strict");
const { readFileSync } = require("node:fs");
const path = require("node:path");

const PUBLIC = path.join(__dirname, "..", "public");

it("keeps an inner padding on a form card in the page column", () => {
  const sheets = [
    ...readFileSync(path.join(PUBLIC, "index.html"), "utf8").matchAll(
      /<link rel="stylesheet" href="([^"]+\.css)">/g,
    ),
  ].map((m) => m[1]);
  let last = null;
  for (const sheet of sheets) {
    const css = readFileSync(path.join(PUBLIC, sheet), "utf8")
      .replace(/\/\*[\s\S]*?\*\//g, "")
      .replace(/@media[^{]+\{[\s\S]*?\}\s*\}/g, "");
    for (const m of css.matchAll(/([^{}]+)\{([^{}]*)\}/g))
      if (
        m[1].split(",").some((s) => /\.dashboard-content\s*>\s*\.form-card\s*$/.test(s.trim())) &&
        /padding\s*:/.test(m[2])
      )
        last = { sheet, padding: m[2].match(/padding\s*:\s*([^;]+)/)[1].trim() };
  }
  assert.ok(last, "a padding rule exists");
  assert.doesNotMatch(last.padding, /^0(px)?\s*(!important)?$/, `${last.sheet} sets padding ${last.padding}`);
});
