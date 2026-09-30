// Readable styles: no text colour below WCAG AA contrast and no font size under 11 px in the stylesheets.
const { describe, it } = require("node:test");
const assert = require("node:assert/strict");
const { readFileSync, readdirSync } = require("node:fs");
const path = require("node:path");

const PUBLIC = path.join(__dirname, "..", "public");
// Grey and orange text colours that fail 4.5:1 on white (found by the T50 audit).
const FAILING = [
  "8994a4",
  "718096",
  "7b8799",
  "8792a2",
  "8190a3",
  "9eabc0",
  "a0aec0",
  "748195",
  "6b7789",
  "7d8998",
  "8390a3",
  "738096",
  "69778a",
  "627086",
  "8490a0",
  "8a96a6",
  "758297",
  "8b96a5",
  "94a3b8",
  "66768c",
  "738198",
  "6d7b90",
  "b77900",
  "9a6700",
];
// SVG chart labels are drawn in viewBox units and scaled up, so their small numbers are not pixels on screen.
const SVG_TEXT = /\.in-donut-(lbl|num)\b/;

const sheets = [
  ...readdirSync(PUBLIC)
    .filter((f) => f.endsWith(".css"))
    .map((f) => [f, readFileSync(path.join(PUBLIC, f), "utf8")]),
  [
    "index.html",
    readFileSync(path.join(PUBLIC, "index.html"), "utf8").match(/<style>([\s\S]*?)<\/style>/)[1],
  ],
];
const rules = (css) => [...css.matchAll(/([^{}]+)\{([^{}]*)\}/g)].map((m) => [m[1].trim(), m[2]]);

describe("stylesheets", () => {
  it("use no failing grey or orange as a text colour", () => {
    const bad = [];
    for (const [file, css] of sheets)
      for (const [selector, body] of rules(css))
        for (const m of body.matchAll(/(?<![-\w])color\s*:\s*#([0-9a-f]{6})\b/gi))
          if (FAILING.includes(m[1].toLowerCase())) bad.push(`${file}: ${selector} #${m[1]}`);
    assert.deepEqual(bad, []);
  });

  it("set no font size under 11 px", () => {
    const bad = [];
    for (const [file, css] of sheets)
      for (const [selector, body] of rules(css))
        for (const m of body.matchAll(/font-size\s*:\s*([0-9.]+)px/g))
          if (Number(m[1]) > 0 && Number(m[1]) < 11 && !SVG_TEXT.test(selector))
            bad.push(`${file}: ${selector} ${m[1]}px`);
    assert.deepEqual(bad, []);
  });
});
