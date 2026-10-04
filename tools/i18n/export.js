#!/usr/bin/env node
/*
 * A CSV of one language for reviewers (T175): key, English, translation, note.
 *
 *   node tools/i18n/export.js fr > fr.csv
 *   node tools/i18n/export.js fr --from saved-fr.js > fr.csv     a locale file outside public/locales
 *
 * The saved French, Spanish and Arabic files are on the branch saved/locales-ar-fr-es:
 *   git fetch origin saved/locales-ar-fr-es && git show FETCH_HEAD:public/locales/fr.js > saved-fr.js
 *
 * Texts missing in the language have an empty translation; the note says when a translation is missing, has
 * other {placeholders} than English, or is the same as English. Reviewers change only the translation column.
 */
const fs = require("fs"),
  path = require("path");
const { PUBLIC, readLocale, leaves, placeholders, toCsv } = require("./common");

const [code] = process.argv.slice(2).filter((a) => !a.startsWith("--")),
  from = process.argv.includes("--from") ? process.argv[process.argv.indexOf("--from") + 1] : null;
if (!code || !/^[a-z]{2,3}$/.test(code) || code === "en")
  return (
    console.error("Usage: node tools/i18n/export.js <language code> [--from <locale file>]"),
    process.exit(1)
  );
const file = from || path.join(PUBLIC, "locales", `${code}.js`),
  en = leaves(readLocale(path.join(PUBLIC, "locales", "en.js"), "en")),
  mine = fs.existsSync(file) ? leaves(readLocale(file, code)) : new Map();
const rows = [["key", "english", "translation", "note"]];
for (const [key, english] of en) {
  const t = mine.get(key) ?? "",
    note = !t
      ? "missing"
      : placeholders(t) !== placeholders(english)
        ? `placeholders must be {${placeholders(english).split(",").filter(Boolean).join("}, {")}}`
        : t === english && /[a-z]{4}/i.test(english)
          ? "same as English"
          : "";
  rows.push([key, english, t, note]);
}
// A byte order mark, so spreadsheet programs open the file as UTF-8
process.stdout.write("﻿" + toCsv(rows));
console.error(`${code}: ${rows.length - 1} texts, ${rows.filter((r) => r[3] === "missing").length} missing`);
