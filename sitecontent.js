/*
 * The site editor (T264–T267, Wave 17). An admin changes the texts of the website and the app per language, adds
 * own pages, switches built-in pages on or off, edits the menu and the footer, sets search engine texts and a
 * banner, and can undo, export and import every change.
 *
 * The data lives in db.siteContent; every change is recorded in db.siteHistory (the last 500). The browser gets
 * the published part through /site-content.js, loaded right after the locale files; the server's emails,
 * notifications and PDFs use the changed texts through locales.js.
 */
const HISTORY_MAX = 500;
const TEXT_MAX = 5000;
const LIST_MAX = 30;
const BUILTINS = ["pricing", "how-it-works", "faq"]; // home, imprint, privacy and terms always stay on
const SLUG = /^[a-z0-9]+(?:-[a-z0-9]+)*$/;
const placeholders = (s) =>
  [...new Set(String(s).match(/\{\w+\}/g) || [])].sort().join(",");

module.exports = function createSiteContent(ctx) {
  const { getDb, save, send, body, id, now, activity, locales } = ctx;
  const content = () => {
    const db = getDb();
    db.siteContent ||= {};
    const c = db.siteContent;
    c.texts ||= {};
    c.pages ||= [];
    c.builtins ||= {};
    c.nav ||= { top: [], footer: [] };
    c.seo ||= {};
    return c;
  };
  const history = () => (getDb().siteHistory ||= []);
  const langs = () => locales.codes();
  const clone = (v) => (v === undefined ? null : JSON.parse(JSON.stringify(v)));
  const text = (v, max) =>
    String(v ?? "")
      .trim()
      .slice(0, max);

  function record(user, area, target, before, after, note = "") {
    const list = history();
    list.unshift({
      id: id("shx"),
      at: now(),
      by: user?.id || null,
      byName: user?.name || "",
      area,
      target,
      before: clone(before),
      after: clone(after),
      ...(note ? { note } : {}),
    });
    if (list.length > HISTORY_MAX) list.length = HISTORY_MAX;
  }

  /* ---------- T264: texts ---------- */
  // A changed text: {error} or {value} (null = back to the default)
  function checkText(lang, key, value) {
    if (!langs().includes(lang)) return { error: "Choose a language of the platform." };
    const base = locales.defaultText("en", key);
    if (base === undefined || (typeof base !== "string" && !Array.isArray(base)))
      return { error: "This text does not exist." };
    if (value === null) return { value: null };
    if (Array.isArray(base)) {
      const list = (Array.isArray(value) ? value : String(value).split("\n")).map((x) => text(x, 500)).filter(Boolean);
      if (!list.length || list.length > LIST_MAX) return { error: "Enter 1 to 30 lines for this list." };
      return { value: list };
    }
    if (typeof value !== "string") return { error: "Enter the text." };
    const v = value.trim();
    if (!v) return { error: "Enter the text, or go back to the default." };
    if (v.length > TEXT_MAX) return { error: "A text can have up to 5,000 characters." };
    if (placeholders(v) !== placeholders(base))
      return { error: `Keep the placeholders of the original text: ${placeholders(base) || "none"}.` };
    return { value: v };
  }
  function setText(lang, key, value) {
    const c = content();
    if (value === null) {
      if (c.texts[lang]) delete c.texts[lang][key];
    } else (c.texts[lang] ||= {})[key] = value;
  }
  const getText = (lang, key) => content().texts[lang]?.[key] ?? null;
  // locales.js asks this for every lookup
  function override(lang, key) {
    try {
      return getDb()?.siteContent?.texts?.[lang]?.[key];
    } catch {
      return undefined; // before the data is loaded
    }
  }

  /* ---------- the published part for the browser ---------- */
  function published() {
    const c = content();
    return {
      texts: c.texts,
      builtins: c.builtins,
      nav: c.nav,
      seo: c.seo,
      pages: c.pages
        .filter((p) => p.status === "Published")
        .map((p) => ({ slug: p.slug, title: p.title, place: p.place, order: p.order })),
      banner: liveBanner(),
    };
  }
  function liveBanner() {
    const b = content().banner;
    if (!b || !b.on) return null;
    const today = now().slice(0, 10);
    if ((b.from && today < b.from) || (b.until && today > b.until)) return null;
    return b;
  }
  // The script /site-content.js: plain data, escaped so it cannot end the script element
  function script() {
    const json = JSON.stringify(published())
      .replace(/</g, "\\u003c")
      .replace(/\u2028/g, "\\u2028")
      .replace(/\u2029/g, "\\u2029");
    return `window.CC_SITE = ${json};\n`;
  }
  function serveScript(req, res) {
    const out = script();
    res.writeHead(200, {
      "Content-Type": "text/javascript; charset=utf-8",
      "Cache-Control": "no-store",
      "X-Content-Type-Options": "nosniff",
    });
    res.end(out);
  }

  async function handle(req, res, url, parts, user) {
    if (parts[1] !== "admin" || parts[2] !== "site") return false;
    if (user.role !== "admin") return (send(res, 403, { error: "Admin only" }), true);
    const method = req.method;
    const c = content();
    if (parts.length === 3 && method === "GET")
      return (
        send(res, 200, {
          content: c,
          languages: langs(),
          builtins: BUILTINS,
          history: history().slice(0, 100),
        }),
        true
      );
    if (parts[3] === "texts" && parts.length === 4 && method === "PUT") {
      const b = await body(req),
        lang = String(b.lang || ""),
        key = String(b.key || "");
      const { error, value } = checkText(lang, key, b.value === undefined ? null : b.value);
      if (error) return (send(res, 400, { error }), true);
      const before = getText(lang, key);
      setText(lang, key, value);
      record(user, "text", { lang, key }, before, value);
      activity(user, `Website text ${lang}:${key} ${value === null ? "reset" : "changed"}`);
      save();
      return (send(res, 200, { lang, key, value }), true);
    }
    return false;
  }

  return { handle, serveScript, override, published, checkText, BUILTINS, SLUG };
};
