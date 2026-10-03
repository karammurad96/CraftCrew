// Missing and extra translation keys per registered language (T137).
// Usage: node tools/i18n/locales.js [code]      — every language, or one
// English is the reference: a key in en.js but not in xx.js is missing in xx; a key only in xx.js is extra (stale).
// Placeholders must match too ("{n} items" ↔ "{n} Einträge"). Exits with 1 when anything is wrong.
const fs = require("fs"),
  path = require("path"),
  vm = require("vm");
const PUBLIC = path.join(__dirname, "..", "..", "public"),
  ctx = { window: {} };
ctx.window = ctx;
vm.createContext(ctx);
vm.runInContext(fs.readFileSync(path.join(PUBLIC, "core/languages.js"), "utf8"), ctx);
const languages = vm.runInContext("LANGUAGES", ctx);
for (const l of languages) vm.runInContext(fs.readFileSync(path.join(PUBLIC, `locales/${l.code}.js`), "utf8"), ctx);
const leaves = (node, prefix = "", out = {}) => {
  for (const [k, v] of Object.entries(node || {})) {
    const key = prefix ? `${prefix}.${k}` : k;
    if (v && typeof v === "object" && !Array.isArray(v)) leaves(v, key, out);
    else out[key] = Array.isArray(v) ? `[${v.length}]` : [...String(v).matchAll(/\{(\w+)\}/g)].map((m) => m[1]).sort().join(",");
  }
  return out;
};
const en = leaves(ctx.LOCALES.en),
  only = process.argv[2];
let problems = 0;
for (const l of languages.filter((x) => x.code !== "en" && (!only || x.code === only))) {
  const mine = leaves(ctx.LOCALES[l.code]),
    missing = Object.keys(en).filter((k) => !(k in mine)),
    extra = Object.keys(mine).filter((k) => !(k in en)),
    placeholders = Object.keys(en).filter((k) => k in mine && mine[k] !== en[k]),
    same = Object.keys(en).filter((k) => k in mine && ccLookup(l.code, k) === ccLookup("en", k) && /[a-z]{4}/.test(ccLookup("en", k)));
  console.log(`${l.code} (${l.name}): ${Object.keys(mine).length} keys · ${missing.length} missing · ${extra.length} extra · ${placeholders.length} placeholder mismatches · ${same.length} same as English`);
  for (const k of missing.slice(0, 30)) console.log("  missing   " + k);
  for (const k of extra.slice(0, 30)) console.log("  extra     " + k);
  for (const k of placeholders.slice(0, 30)) console.log(`  {…}       ${k}: ${mine[k]} ≠ ${en[k]}`);
  if (process.env.SAME) for (const k of same) console.log("  same      " + k);
  problems += missing.length + extra.length + placeholders.length;
}
function ccLookup(lang, key) {
  return key.split(".").reduce((n, p) => (n && typeof n === "object" ? n[p] : undefined), ctx.LOCALES[lang]);
}
process.exit(problems ? 1 : 0);
