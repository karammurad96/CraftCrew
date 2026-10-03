/* A made-up language for the audit tools (T137, T138), registered the way a real one is added — one line in
   core/languages.js and one locale file — and served by request interception, so the repository stays unchanged.
   mark: wrap every English text in ⟦…⟧ to spot texts that are not keys. dir: "rtl" for a right-to-left check. */
const fs = require("fs");
const path = require("path");
const vm = require("vm");

async function pseudoLanguage(ctx, code, { dir = "ltr", mark = true } = {}) {
  const root = path.join(__dirname, "..", "..", "public"),
    box = { window: {} };
  box.window = box;
  vm.createContext(box);
  vm.runInContext(fs.readFileSync(path.join(root, "locales/en.js"), "utf8"), box);
  const wrap = (v) => (typeof v === "string" ? (mark ? `⟦${v}⟧` : v) : Array.isArray(v) ? v.map(wrap) : Object.fromEntries(Object.entries(v).map(([k, x]) => [k, wrap(x)])));
  const locale = `var LOCALES = window.LOCALES || (window.LOCALES = {});\nLOCALES.${code} = ${JSON.stringify(wrap(box.LOCALES.en))};\n`,
    registry = fs
      .readFileSync(path.join(root, "core/languages.js"), "utf8")
      .replace("var LANGUAGES = [", `var LANGUAGES = [\n  { code: "${code}", name: "Pseudo", locale: "en-GB", dir: "${dir}" },`);
  await ctx.route(/\/core\/languages\.js(\?.*)?$/, (r) => r.fulfill({ contentType: "text/javascript", body: registry }));
  await ctx.route(new RegExp(`/locales/${code}\\.js(\\?.*)?$`), (r) => r.fulfill({ contentType: "text/javascript", body: locale }));
}
// The language the tools render in: --lang=<code> or CC_LANG; --rtl adds an English right-to-left test language.
function toolLanguage(argv = process.argv) {
  if (argv.includes("--rtl") || process.env.CC_RTL === "1") return { lang: "xr", rtl: true };
  return { lang: argv.find((a) => a.startsWith("--lang="))?.slice(7) || process.env.CC_LANG || (process.env.LANG === "de" ? "de" : "en"), rtl: false };
}
module.exports = { pseudoLanguage, toolLanguage };
