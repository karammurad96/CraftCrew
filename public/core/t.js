/* Translations by key (T125): t("invoice.due", { date }) looks the key up in LOCALES[language] at render time,
   so a page is drawn in the right language from the start. Pages built this way set data-i18n="keys" on their
   root; the old DOM translation in i18n.js leaves them alone. */
// The language: the saved choice, else the browser's, else English. LANGUAGES comes from core/languages.js.
const ccLanguages = typeof LANGUAGES !== "undefined" ? LANGUAGES : [{ code: "en", name: "English", locale: "en-GB", dir: "ltr" }];
const ccLang = (() => {
  const known = (code) => ccLanguages.some((l) => l.code === code);
  try {
    const saved = localStorage.getItem("cc_lang");
    if (known(saved)) return saved;
    const browser = (navigator.language || "").toLowerCase().split("-")[0];
    return known(browser) ? browser : "en";
  } catch {
    return "en";
  }
})();
const ccLanguage = ccLanguages.find((l) => l.code === ccLang) || ccLanguages[0];
if (typeof document !== "undefined" && document.documentElement) {
  document.documentElement.lang = ccLang;
  document.documentElement.dir = ccLanguage.dir || "ltr";
}
// The language buttons (one per registered language), for the sidebar and the public top bar
function langSwitch(label, action) {
  return `<div class="i18n-switch" role="group" aria-label="${esc(label)}">${ccLanguages
    .map((l) => `<button type="button" class="${l.code === ccLang ? "on" : ""}" data-action="${action}" data-lang="${l.code}" lang="${l.code}" title="${esc(l.name)}">${l.code.toUpperCase()}</button>`)
    .join("")}</div>`;
}
// Switch the language: saved in this browser and, when signed in, on the account (emails use it), then reload.
async function langSet(code) {
  try {
    localStorage.setItem("cc_lang", code);
  } catch {}
  if (typeof state !== "undefined" && state.user) await api("/account/preferences", { method: "PUT", body: { language: code } }).catch(() => {});
  location.reload();
}
const ccMissingKeys = new Set();
function ccLookup(lang, key) {
  return key.split(".").reduce((node, part) => (node && typeof node === "object" ? node[part] : undefined), (window.LOCALES || {})[lang]);
}
function ccFill(text, params) {
  return String(text).replace(/\{(\w+)\}/g, (m, name) => (params && params[name] !== undefined ? String(params[name]) : m));
}
// A missing key shows the key itself (so it is easy to spot) and is logged once.
function t(key, params) {
  let text = ccLookup(ccLang, key);
  if (text === undefined) text = ccLookup("en", key);
  if (typeof text !== "string") {
    if (!ccMissingKeys.has(key)) {
      ccMissingKeys.add(key);
      console.warn("Missing translation key:", key);
    }
    return key;
  }
  return ccFill(text, params);
}
// t.plural("common.items", 3) → "3 items"; the key holds { one, other }.
t.plural = function (key, n, params) {
  const forms = ccLookup(ccLang, key) || ccLookup("en", key);
  if (!forms || typeof forms !== "object") return t(key, params);
  const form = new Intl.PluralRules(ccLanguage.locale).select(Number(n));
  return ccFill(forms[form] ?? forms.other, { n, ...params });
};
// t.list("public.pricing.customer.items") → the array stored under the key (empty when missing).
t.list = function (key) {
  const list = ccLookup(ccLang, key) || ccLookup("en", key);
  if (Array.isArray(list)) return list;
  if (!ccMissingKeys.has(key)) {
    ccMissingKeys.add(key);
    console.warn("Missing translation list:", key);
  }
  return [];
};
// A text with markup inside, e.g. a link: the translated text is escaped, then each {name} is replaced by the
// given HTML, which the caller has built and escaped itself.
function tHtml(key, html = {}) {
  return esc(t(key)).replace(/\{(\w+)\}/g, (m, name) => (name in html ? html[name] : m));
}
// Status, priority and category values (T137): the server keeps English values ("Changes Requested"); they are
// shown through common.status.<camelCase> ("changesRequested"). A value without a key is shown as it is.
const ccStatusKey = (value) =>
  "common.status." +
  String(value ?? "")
    .replace(/[^A-Za-z0-9 ]/g, " ")
    .trim()
    .split(/\s+/)
    .map((w, i) => (i ? w[0].toUpperCase() + w.slice(1).toLowerCase() : w.toLowerCase()))
    .join("");
function tStatus(value) {
  const key = ccStatusKey(value);
  return value && typeof ccLookup("en", key) === "string" ? t(key) : String(value ?? "");
}
// The same as HTML. A value without a key (free text, e.g. a service category) keeps the old translation.
function statusHtml(value) {
  return value && typeof ccLookup("en", ccStatusKey(value)) === "string" ? esc(tStatus(value)) : `<bdi data-i18n="dom">${esc(value ?? "")}</bdi>`;
}
// An API error in the user's language (T137): the server sends { error, code, params }. The text comes from
// errors.api.<code>; an error with its own code (e.g. TOTP_REQUIRED) is found by its English message; an unknown
// message is shown as sent.
let ccErrorTexts;
function apiErrorText(d) {
  if (!d || !d.error) return t("ui.requestFailed");
  if (d.code && typeof ccLookup("en", "errors.api." + d.code) === "string") return t("errors.api." + d.code, d.params);
  if (!ccErrorTexts) {
    ccErrorTexts = new Map();
    (function walk(node, prefix) {
      for (const [key, text] of Object.entries(node || {}))
        if (typeof text === "object") walk(text, prefix + key + ".");
        else ccErrorTexts.has(text) || ccErrorTexts.set(text, prefix + key);
    })(ccLookup("en", "errors.api"), "");
  }
  return ccErrorTexts.has(d.error) ? t("errors.api." + ccErrorTexts.get(d.error)) : d.error;
}
// A toast whose text comes from t(): marked so the old DOM translation leaves it alone.
function tToast(text, type) {
  toast(text, type, { translated: true });
  toastEl.dataset.i18n = "keys";
}
// Dates, amounts and numbers in the user's language.
const fmt = {
  locale: () => ccLanguage.locale,
  date: (d, opts = { day: "2-digit", month: "short", year: "numeric" }) =>
    d ? new Date(String(d).length === 10 ? d + "T12:00:00" : d).toLocaleDateString(fmt.locale(), opts) : "—",
  money: (n, digits = 0) =>
    new Intl.NumberFormat(fmt.locale(), {
      style: "currency",
      currency: "EUR",
      minimumFractionDigits: digits,
      maximumFractionDigits: digits,
    }).format(Number(n) || 0),
  number: (n, digits = 0) =>
    new Intl.NumberFormat(fmt.locale(), { minimumFractionDigits: digits, maximumFractionDigits: digits }).format(Number(n) || 0),
  // "24 Sep – 11 Oct" for two YYYY-MM-DD dates (the year only when it is not this year); one date alone also works
  range: (a, b) => {
    const year = String(new Date().getFullYear()),
      f = (d) => (d ? new Date(d + "T12:00:00").toLocaleDateString(fmt.locale(), { day: "numeric", month: "short", ...(d.startsWith(year) ? {} : { year: "numeric" }) }) : "");
    return a && b && a !== b ? `${f(a)} – ${f(b)}` : f(a || b) || "—";
  },
  // "€16.6K" for amounts in small cards
  compact: (n) => new Intl.NumberFormat(fmt.locale(), { style: "currency", currency: "EUR", notation: "compact", maximumFractionDigits: 1 }).format(Number(n) || 0),
};
