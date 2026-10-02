/* The German that the old DOM translation (public/i18n.js) shows today for an English text (T126–T135).
   Area tasks use it to move each text's German into public/locales/de.js unchanged, and to find I18N_DE
   entries that no page uses any more.

     node tools/i18n/legacy.js "Start a project" "Due 16 Oct 2026"
     const { german, entries } = require("./tools/i18n/legacy");  german("Start a project", { ui: true })   */
const { readFileSync } = require("node:fs");
const path = require("node:path");
const vm = require("node:vm");

const src = readFileSync(path.join(__dirname, "..", "..", "public", "i18n.js"), "utf8");
// Only the dictionaries and the pure text functions; the DOM wiring at the end of the file is not needed.
const pure = src.slice(0, src.indexOf("function i18nApply("));
const ctx = { localStorage: { getItem: () => "de" }, navigator: { language: "de" }, console };
vm.createContext(ctx);
vm.runInContext(pure + ";this.api={I18N_DE,I18N_PATTERNS,i18nText};", ctx);
const { I18N_DE, i18nText } = ctx.api;

// ui: the text sits in a button, label, heading … (single words translate only there)
// status: the text is a status chip ("Open" → "Offen")
function german(text, { ui = true, status = false } = {}) {
  // i18n.js asks closest(".status, …") for chips and closest(I18N_UI_SCOPE) for interface text
  const el = { closest: (sel) => (sel.startsWith(".status") ? status : ui) };
  return i18nText(text, el);
}
module.exports = { german, entries: I18N_DE };

if (require.main === module)
  for (const text of process.argv.slice(2)) console.log(`${text}\n  → ${german(text)}`);
