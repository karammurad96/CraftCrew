/* Translations by key (T125): t("invoice.due", { date }) looks the key up in LOCALES[language] at render time,
   so a page is drawn in the right language from the start. Pages built this way set data-i18n="keys" on their
   root; the old DOM translation in i18n.js leaves them alone. */
const ccLang = (() => {
  try {
    const saved = localStorage.getItem("cc_lang");
    if (saved === "de" || saved === "en") return saved;
    return (navigator.language || "").toLowerCase().startsWith("de") ? "de" : "en";
  } catch {
    return "en";
  }
})();
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
  const form = new Intl.PluralRules(ccLang === "de" ? "de-DE" : "en-GB").select(Number(n));
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
// Dates, amounts and numbers in the user's language.
const fmt = {
  locale: () => (ccLang === "de" ? "de-DE" : "en-GB"),
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
};
