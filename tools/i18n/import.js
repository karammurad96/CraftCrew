#!/usr/bin/env node
/*
 * Writes reviewed texts back from a CSV made by export.js (T175).
 *
 *   node tools/i18n/import.js fr fr.csv            check, then write public/locales/fr.js
 *   node tools/i18n/import.js fr fr.csv --check    check only
 *   node tools/i18n/import.js fr fr.csv --out x.js write somewhere else (to compare first)
 *
 * Every English text needs a translation with the same {placeholders}; keys that are not in English are refused.
 * Nothing is written when anything is wrong. Register a new language in public/core/languages.js as well.
 */
const fs = require("fs"),
  path = require("path");
const { PUBLIC, readLocale, leaves, placeholders, parseCsv } = require("./common");

const outAt = process.argv.indexOf("--out"),
  outFile = outAt > 0 ? process.argv[outAt + 1] : null,
  args = process.argv.slice(2).filter((a, i, all) => !a.startsWith("--") && all[i - 1] !== "--out"),
  [code, csvFile] = args,
  checkOnly = process.argv.includes("--check");
if (!code || !/^[a-z]{2,3}$/.test(code) || code === "en" || !csvFile)
  return (
    console.error("Usage: node tools/i18n/import.js <language code> <file.csv> [--check]"),
    process.exit(1)
  );

const en = leaves(readLocale(path.join(PUBLIC, "locales", "en.js"), "en")),
  [head = [], ...rows] = parseCsv(fs.readFileSync(csvFile, "utf8")),
  col = (name) => head.indexOf(name);
if (col("key") < 0 || col("translation") < 0)
  return (
    console.error(`${csvFile}: the first line must name the columns key and translation.`),
    process.exit(1)
  );
const texts = new Map(rows.map((r) => [r[col("key")], r[col("translation")] ?? ""])),
  problems = [];
for (const [key, english] of en) {
  const t = texts.get(key);
  if (!t) problems.push(`missing      ${key}`);
  else if (english.startsWith("[")) {
    try {
      if (JSON.parse(t).length !== JSON.parse(english).length) problems.push(`list length  ${key}`);
    } catch {
      problems.push(`not a list   ${key}: write it like ${english.slice(0, 40)}`);
    }
  } else if (placeholders(t) !== placeholders(english))
    problems.push(`placeholders ${key}: {${placeholders(english)}} expected, {${placeholders(t)}} found`);
}
for (const key of texts.keys()) if (!en.has(key)) problems.push(`unknown key  ${key}`);
if (problems.length) {
  console.error(`${problems.length} problem(s); nothing was written:\n` + problems.slice(0, 50).join("\n"));
  process.exit(1);
}
if (checkOnly) return console.log(`${code}: ${texts.size} texts, all fine.`);

// The same nesting as en.js, in its order
const tree = {};
for (const key of en.keys()) {
  const parts = key.split("."),
    last = parts.pop(),
    node = parts.reduce((n, p) => (n[p] ||= {}), tree),
    t = texts.get(key);
  node[last] = en.get(key).startsWith("[") ? JSON.parse(t) : t;
}
const out = outFile ? path.resolve(outFile) : path.join(PUBLIC, "locales", `${code}.js`);
fs.writeFileSync(
  out,
  `/* Texts of "${code}" by key, written by tools/i18n/import.js from a reviewed CSV (T175). Same keys and\n` +
    `   {placeholders} as en.js. */\n` +
    `var LOCALES = window.LOCALES || (window.LOCALES = {});\n` +
    `LOCALES.${code} = ${JSON.stringify(tree, null, 2)};\n`,
);
console.log(`${code}: ${texts.size} texts written to ${path.relative(process.cwd(), out)}.`);
