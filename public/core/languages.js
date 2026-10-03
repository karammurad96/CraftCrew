/* Languages (T137). Adding a language means one line here and one file public/locales/<code>.js (a copy of en.js,
   translated). Everything else reads this list: the language switchers, the date and number formats (fmt), the
   plural rules (t.plural, through Intl.PluralRules: one/few/many/other), <html lang dir>, the locale tests and the
   translation tools. Right-to-left languages set dir: "rtl". */
var LANGUAGES = [
  { code: "en", name: "English", locale: "en-GB", dir: "ltr" },
  { code: "de", name: "Deutsch", locale: "de-DE", dir: "ltr" },
];
// In the browser the locale files load in order right after this script, before core/t.js.
if (typeof document !== "undefined" && typeof document.write === "function")
  for (const l of LANGUAGES) document.write(`<script src="locales/${l.code}.js"></script>`);
