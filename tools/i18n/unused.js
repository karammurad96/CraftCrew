/* Lists (or with --write removes) the I18N_DE entries that are used by no page any more: after an area moved
   its texts to translation keys (T126–T135), its old English→German entries only add noise.
   An entry stays when its English text still appears in any frontend file other than i18n.js, the locales
   and the area modules (an old page may still show it), or in a server file (errors and notifications).
     node tools/i18n/unused.js public/locales/en.js            # the texts of these keys, used anywhere else?
     node tools/i18n/unused.js public/locales/en.js --write */
const { readFileSync, writeFileSync, readdirSync } = require("node:fs");
const path = require("node:path");
const vm = require("node:vm");
const PUBLIC = path.join(__dirname, "..", "..", "public");
const { entries } = require("./legacy");

const ctx = { window: {} };
ctx.window = ctx;
vm.createContext(ctx);
vm.runInContext(readFileSync(path.join(PUBLIC, "locales", "en.js"), "utf8"), ctx);
const texts = new Set();
(function walk(node) {
  if (typeof node === "string") texts.add(node);
  else if (node && typeof node === "object") Object.values(node).forEach(walk);
})(ctx.LOCALES.en);

// Old pages in public/*.js and texts the server sends (errors, notifications) still need their entries
const ROOT = path.join(PUBLIC, "..");
const others = [
  ...readdirSync(PUBLIC)
    .filter((f) => f.endsWith(".js") && f !== "i18n.js")
    .map((f) => path.join(PUBLIC, f)),
  ...readdirSync(ROOT)
    .filter((f) => f.endsWith(".js"))
    .map((f) => path.join(ROOT, f)),
]
  .map((f) => readFileSync(f, "utf8"))
  .join("\n");
const unused = [...texts].filter((x) => Object.hasOwn(entries, x) && !others.includes(x));
console.log(unused.length + " unused entries");
for (const x of unused) console.log("  " + x.slice(0, 100));
if (process.argv.includes("--write")) {
  let src = readFileSync(path.join(PUBLIC, "i18n.js"), "utf8");
  for (const x of unused) {
    const key = JSON.stringify(x).replace(/[.*+?^${}()|[\]\\]/g, "\\$&"),
      re = new RegExp(`\\n  (?:${key}|${x.replace(/[.*+?^${}()|[\]\\]/g, "\\$&")}):\\s*"(?:[^"\\\\]|\\\\.)*",`);
    if (!re.test(src)) {
      console.log("  not found as a simple entry: " + x.slice(0, 80));
      continue;
    }
    src = src.replace(re, "");
  }
  writeFileSync(path.join(PUBLIC, "i18n.js"), src);
}
