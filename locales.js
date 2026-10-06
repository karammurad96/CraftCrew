/* The languages and texts of the server (T137): the same registry (public/core/languages.js) and locale files
   (public/locales/<code>.js) as the browser. Emails, notifications and PDFs use the `server` group of a locale
   file, in the recipient's language (user.language, default English); a missing text falls back to English.
   Adding a language therefore needs no server change. */
const fs = require("fs");
const path = require("path");
const vm = require("vm");

const PUBLIC = path.join(__dirname, "public");
const ctx = { window: {} };
ctx.window = ctx;
vm.createContext(ctx);
vm.runInContext(fs.readFileSync(path.join(PUBLIC, "core", "languages.js"), "utf8"), ctx);
// The product's name (T171), the same file as in the browser
vm.runInContext(fs.readFileSync(path.join(PUBLIC, "core", "brand.js"), "utf8"), ctx);
const BRAND = { ...ctx.BRAND };
const LANGUAGES = ctx.LANGUAGES.map((l) => ({ ...l }));
for (const l of LANGUAGES) vm.runInContext(fs.readFileSync(path.join(PUBLIC, "locales", `${l.code}.js`), "utf8"), ctx);
const LOCALES = ctx.LOCALES;

const codes = () => LANGUAGES.map((l) => l.code);
// The language of a user, an application or a code; English when it is not a registered language.
function langOf(x) {
  const code = typeof x === "string" ? x : x?.language;
  return codes().includes(code) ? code : "en";
}
const localeOf = (lang) => (LANGUAGES.find((l) => l.code === lang) || LANGUAGES[0]).locale;
function defaultText(lang, key) {
  return key.split(".").reduce((node, part) => (node && typeof node === "object" ? node[part] : undefined), LOCALES[lang]);
}
// T264: texts an admin changed in the site editor come first (set by server.js)
let override = () => undefined;
function setOverride(fn) {
  override = fn;
}
function lookup(lang, key) {
  const changed = override(lang, key);
  return changed !== undefined ? changed : defaultText(lang, key);
}
// {brand} is the product's name unless the caller passes its own (T171).
const fill = (text, params) =>
  String(text).replace(/\{(\w+)\}/g, (m, k) =>
    params && params[k] !== undefined ? String(params[k]) : k === "brand" ? BRAND.name : m,
  );
// text("de", "server.notify.invoicePaid", { number }) → the German text, else the English one, else the key.
function text(lang, key, params) {
  let value = lookup(lang, key);
  if (typeof value !== "string") value = lookup("en", key);
  return typeof value === "string" ? fill(value, params) : key;
}
// A whole group, e.g. the labels of one PDF, with English for anything the language lacks.
function group(lang, key) {
  const all = { ...defaultText("en", key), ...defaultText(lang, key) };
  for (const [k, v] of Object.entries(all)) if (typeof v === "string") all[k] = text(lang, `${key}.${k}`);
  return all;
}
// Status, priority and category values: common.status.<camelCase>, as in the browser (tStatus); others unchanged.
// English keeps the value exactly as stored.
function statusText(lang, value) {
  if (langOf(lang) === "en") return String(value ?? "");
  const slug = String(value ?? "")
    .replace(/[^A-Za-z0-9 ]/g, " ")
    .trim()
    .split(/\s+/)
    .map((w, i) => (i ? w[0].toUpperCase() + w.slice(1).toLowerCase() : w.toLowerCase()))
    .join("");
  return value && typeof lookup("en", "common.status." + slug) === "string" ? text(lang, "common.status." + slug) : String(value ?? "");
}
// A notification: a plain string, or { key, params } from server.notify. Statuses and types in it are translated.
function notifyText(spec, lang) {
  if (typeof spec === "string") return spec;
  lang = langOf(lang);
  const params = { ...spec.params };
  for (const k of ["status", "type"]) if (params[k] !== undefined) params[k] = statusText(lang, params[k]);
  // A value given as { t: key, or: fallback } is a text of the locale files, e.g. a compliance requirement
  for (const [k, v] of Object.entries(params))
    if (v && typeof v === "object" && v.t) params[k] = typeof lookup("en", v.t) === "string" ? text(lang, v.t) : v.or;
  return text(lang, "server.notify." + spec.key, params);
}
// An email: { subject, body } from server.email.<name>.
function email(name, lang, params) {
  return { subject: text(lang, `server.email.${name}.subject`, params), body: text(lang, `server.email.${name}.body`, params) };
}
/* PDFs use the built-in Helvetica font, which only has Western European letters (WinAnsi). A language whose PDF
   texts need other letters (Polish, Arabic, …) gets English PDFs until the PDFs embed a font. */
const WIN_ANSI = /^[\x20-\x7e\xa0-\xff€‚„…‘’“”•–—™\n]*$/;
function pdfLang(lang) {
  const all = [];
  (function walk(node) {
    for (const v of Object.values(node || {})) typeof v === "string" ? all.push(v) : walk(v);
  })(lookup(langOf(lang), "server.pdf"));
  return all.every((s) => WIN_ANSI.test(s)) ? langOf(lang) : "en";
}
// For tests: add a language (code, locale, texts) as if it were in the registry.
function addLanguage(language, texts) {
  LANGUAGES.push(language);
  LOCALES[language.code] = texts;
}

module.exports = {
  BRAND,
  LANGUAGES,
  codes,
  langOf,
  localeOf,
  text,
  group,
  statusText,
  notifyText,
  email,
  pdfLang,
  addLanguage,
  defaultText,
  setOverride,
};
