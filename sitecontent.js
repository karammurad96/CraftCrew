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
    c.details ||= {};
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

  /* ---------- T265: own pages, built-in pages, menu and footer, site details ---------- */
  // Text per language: {en: "…", de: "…"}, registered languages only, English required when `need`
  function perLang(v, max, need) {
    const out = {};
    for (const code of langs()) {
      const x = text(v?.[code], max);
      if (x) out[code] = x;
    }
    if (need && !out.en) return null;
    return out;
  }
  const PLACES = ["none", "top", "footer"];
  function checkPage(b, selfId, pages = content().pages) {
    const slug = text(b.slug, 60).toLowerCase();
    if (!SLUG.test(slug)) return { error: "Use lowercase letters, digits and dashes for the address." };
    if (pages.some((p) => p.slug === slug && p.id !== selfId))
      return { error: "Another page already uses this address." };
    const title = perLang(b.title, 120, true);
    if (!title) return { error: "Give the page an English title." };
    const bodyText = perLang(b.body, 20000, true);
    if (!bodyText) return { error: "Write the English text of the page." };
    const status = b.status === "Published" ? "Published" : "Draft",
      place = PLACES.includes(b.place) ? b.place : "none",
      order = Number.isInteger(Number(b.order)) ? Math.max(0, Math.min(99, Number(b.order))) : 0,
      seoTitle = perLang(b.seoTitle, 70, false),
      seoDescription = perLang(b.seoDescription, 160, false);
    return { page: { slug, title, body: bodyText, status, place, order, seoTitle, seoDescription } };
  }
  // A menu or footer link: a built-in page, an own page, or an address (https://, mailto: or #/)
  function checkLink(x, pages = content().pages) {
    const kind = String(x?.kind || "");
    const label = perLang(x?.label, 40, false);
    if (kind === "builtin") {
      if (![...BUILTINS, "home", "imprint", "privacy", "terms"].includes(x.ref))
        return { error: "Choose a page of the website for each link." };
      return { link: { kind, ref: x.ref, label } };
    }
    if (kind === "page") {
      if (!pages.some((p) => p.slug === x.ref)) return { error: "Choose a page of the website for each link." };
      return { link: { kind, ref: x.ref, label } };
    }
    if (kind === "link") {
      const url = text(x.url, 300);
      if (!/^(https:\/\/[^\s<>"']+|mailto:[^\s<>"']+|#\/[\w\-/?=&.]*)$/.test(url))
        return { error: "A link must start with https://, mailto: or #/." };
      if (!label?.en) return { error: "Give every outside link an English label." };
      return { link: { kind, url, label } };
    }
    return { error: "Choose a page of the website for each link." };
  }
  function checkNav(b, pages = content().pages) {
    const out = {};
    for (const where of ["top", "footer"]) {
      const list = Array.isArray(b?.[where]) ? b[where] : [];
      if (list.length > 12) return { error: "A menu can have up to 12 links." };
      out[where] = [];
      for (const x of list) {
        const { error, link } = checkLink(x, pages);
        if (error) return { error };
        out[where].push(link);
      }
    }
    return { nav: out };
  }
  function checkBuiltins(b) {
    const out = {};
    for (const k of BUILTINS) if (b?.[k] === false) out[k] = false;
    return out;
  }
  // T266: one banner with a text per language, a kind, an optional link, an audience and dates
  const KINDS = ["info", "success", "warning"],
    AUDIENCES = ["everyone", "visitors", "customers", "suppliers"],
    isDay = (v) => /^\d{4}-\d{2}-\d{2}$/.test(v) && !Number.isNaN(Date.parse(v));
  function checkBanner(b) {
    const on = b?.on === true,
      bannerText = perLang(b?.text, 300, false);
    if (on && !bannerText?.en) return { error: "Write the English text of the banner." };
    const from = b?.from ? String(b.from) : "",
      until = b?.until ? String(b.until) : "";
    if ((from && !isDay(from)) || (until && !isDay(until)) || (from && until && until < from))
      return { error: "Check the dates: the end cannot be before the start." };
    let link = null;
    if (b?.link?.url) {
      const url = text(b.link.url, 300);
      if (!/^(https:\/\/[^\s<>"']+|mailto:[^\s<>"']+|#\/[\w\-/?=&.]*)$/.test(url))
        return { error: "A link must start with https://, mailto: or #/." };
      link = { url, label: perLang(b.link.label, 40, false) };
      if (!link.label?.en) return { error: "Give every outside link an English label." };
    }
    return {
      banner: {
        on,
        text: bannerText,
        kind: KINDS.includes(b?.kind) ? b.kind : "info",
        audience: AUDIENCES.includes(b?.audience) ? b.audience : "everyone",
        from,
        until,
        closable: b?.closable !== false,
        link,
      },
    };
  }
  function checkDetails(b) {
    // Only filled fields, so an unchanged export compares equal
    const out = {},
      title = perLang(b?.title, 70, false),
      description = perLang(b?.description, 160, false);
    if (Object.keys(title).length) out.title = title;
    if (Object.keys(description).length) out.description = description;
    return out;
  }
  // The public view of one page; drafts only for admins (preview)
  function pageView(p) {
    return { slug: p.slug, title: p.title, body: p.body, seoTitle: p.seoTitle, seoDescription: p.seoDescription, status: p.status };
  }
  async function handlePublic(req, res, parts, user) {
    if (parts[1] !== "site-pages" || !parts[2] || parts.length !== 3 || req.method !== "GET") return false;
    const p = content().pages.find((x) => x.slug === parts[2]);
    if (!p || (p.status !== "Published" && user?.role !== "admin"))
      return (send(res, 404, { error: "Page not found" }), true);
    return (send(res, 200, { page: pageView(p) }), true);
  }

  /* ---------- the published part for the browser ---------- */
  function published() {
    const c = content();
    return {
      texts: c.texts,
      builtins: c.builtins,
      nav: c.nav,
      details: c.details || {},
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

  /* ---------- T267: undo, export and import ---------- */
  const AREAS = ["texts", "pages", "builtins", "nav", "details", "banner"];
  const snapshot = () => {
    const c = content();
    return clone(Object.fromEntries(AREAS.map((k) => [k, c[k] ?? null])));
  };
  // Puts back the value before a change; returns an error or null
  function undo(entry) {
    const c = content();
    if (entry.area === "text") {
      setText(entry.target.lang, entry.target.key, entry.before);
      return null;
    }
    if (entry.area === "page") {
      const at = c.pages.findIndex((p) => p.id === entry.target.id);
      if (!entry.before) {
        if (at >= 0) {
          const gone = c.pages[at];
          c.pages.splice(at, 1);
          for (const where of ["top", "footer"]) c.nav[where] = c.nav[where].filter((l) => !(l.kind === "page" && l.ref === gone.slug));
        }
        return null;
      }
      if (c.pages.some((p) => p.slug === entry.before.slug && p.id !== entry.target.id))
        return "Another page already uses this address.";
      if (at >= 0) c.pages[at] = clone(entry.before);
      else c.pages.push(clone(entry.before));
      return null;
    }
    if (entry.area === "import") {
      Object.assign(c, clone(entry.before));
      return null;
    }
    if (["builtins", "nav", "details", "banner"].includes(entry.area)) {
      c[entry.area] = clone(entry.before) ?? (entry.area === "nav" ? { top: [], footer: [] } : entry.area === "banner" ? null : {});
      return null;
    }
    return "This change cannot be undone.";
  }
  const currentOf = (entry) => {
    const c = content();
    if (entry.area === "text") return getText(entry.target.lang, entry.target.key);
    if (entry.area === "page") return c.pages.find((p) => p.id === entry.target.id) || null;
    if (entry.area === "import") return snapshot();
    return c[entry.area] ?? null;
  };
  function exported() {
    return { format: "craftcrew-site", version: 1, exportedAt: now(), content: snapshot() };
  }
  // Checks a whole export: {error} or {content, summary}
  function checkImport(data) {
    if (!data || data.format !== "craftcrew-site" || data.version !== 1 || typeof data.content !== "object")
      return { error: "This is not an export of the site editor." };
    const inc = data.content,
      fail = (reason) => ({ error: `The import was refused: ${reason}` });
    const texts = {};
    for (const [lang, list] of Object.entries(inc.texts || {}))
      for (const [key, value] of Object.entries(list || {})) {
        const r = checkText(lang, key, value);
        if (r.error) return fail(`${lang} ${key}: ${r.error}`);
        if (r.value !== null) (texts[lang] ||= {})[key] = r.value;
      }
    const pages = [],
      seen = new Set();
    for (const raw of Array.isArray(inc.pages) ? inc.pages : []) {
      const r = checkPage(raw, null, []);
      if (r.error) return fail(`${raw?.slug || "?"}: ${r.error}`);
      const page = r.page;
      if (seen.has(page.slug)) return fail(`${page.slug}: Another page already uses this address.`);
      seen.add(page.slug);
      pages.push({ id: /^spg_[\w]+$/.test(raw.id || "") ? raw.id : id("spg"), ...page, createdAt: raw.createdAt || now(), updatedAt: now() });
    }
    const nav = checkNav(inc.nav || {}, pages);
    if (nav.error) return fail(nav.error);
    const banner = inc.banner ? checkBanner(inc.banner) : { banner: null };
    if (banner.error) return fail(banner.error);
    const next = { texts, pages, builtins: checkBuiltins(inc.builtins || {}), nav: nav.nav, details: checkDetails(inc.details || {}), banner: banner.banner };
    const now_ = snapshot(),
      count = (o) => Object.values(o || {}).reduce((n, l) => n + Object.keys(l || {}).length, 0),
      changedTexts = [...new Set([...Object.keys(now_.texts || {}), ...Object.keys(texts)])].reduce(
        (n, lang) =>
          n +
          [...new Set([...Object.keys(now_.texts?.[lang] || {}), ...Object.keys(texts[lang] || {})])].filter(
            (k) => JSON.stringify(now_.texts?.[lang]?.[k] ?? null) !== JSON.stringify(texts[lang]?.[k] ?? null),
          ).length,
        0,
      ),
      slugs = new Set((now_.pages || []).map((p) => p.slug));
    return {
      content: next,
      summary: {
        texts: count(texts),
        changedTexts,
        pages: pages.length,
        newPages: pages.filter((p) => !slugs.has(p.slug)).length,
        removedPages: (now_.pages || []).filter((p) => !seen.has(p.slug)).length,
        nav: JSON.stringify(now_.nav) !== JSON.stringify(next.nav),
        builtins: JSON.stringify(now_.builtins || {}) !== JSON.stringify(next.builtins),
        details: JSON.stringify(now_.details || {}) !== JSON.stringify(next.details),
        banner: JSON.stringify(now_.banner ?? null) !== JSON.stringify(next.banner),
      },
    };
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
    if (parts[3] === "pages" && method === "POST" && parts.length === 4) {
      const { error, page } = checkPage(await body(req), null);
      if (error) return (send(res, 400, { error }), true);
      const p = { id: id("spg"), ...page, createdAt: now(), updatedAt: now() };
      c.pages.push(p);
      record(user, "page", { id: p.id, slug: p.slug }, null, p);
      activity(user, `Website page ${p.slug} created`);
      save();
      return (send(res, 201, { page: p }), true);
    }
    if (parts[3] === "pages" && parts[4] && parts.length === 5) {
      const p = c.pages.find((x) => x.id === parts[4]);
      if (!p) return (send(res, 404, { error: "Page not found" }), true);
      if (method === "PUT") {
        const { error, page } = checkPage(await body(req), p.id);
        if (error) return (send(res, 400, { error }), true);
        const before = clone(p);
        // A new address: links to the old one follow
        if (page.slug !== p.slug)
          for (const where of ["top", "footer"])
            for (const l of c.nav[where]) if (l.kind === "page" && l.ref === p.slug) l.ref = page.slug;
        Object.assign(p, page, { updatedAt: now() });
        record(user, "page", { id: p.id, slug: p.slug }, before, p);
        activity(user, `Website page ${p.slug} changed`);
        save();
        return (send(res, 200, { page: p }), true);
      }
      if (method === "DELETE") {
        c.pages = c.pages.filter((x) => x.id !== p.id);
        for (const where of ["top", "footer"]) c.nav[where] = c.nav[where].filter((l) => !(l.kind === "page" && l.ref === p.slug));
        record(user, "page", { id: p.id, slug: p.slug }, p, null);
        activity(user, `Website page ${p.slug} deleted`);
        save();
        return (send(res, 200, { ok: true }), true);
      }
    }
    if (parts[3] === "history" && parts.length === 4 && method === "GET")
      return (send(res, 200, { history: history() }), true);
    if (parts[3] === "history" && parts[4] && parts[5] === "undo" && parts.length === 6 && method === "POST") {
      const entry = history().find((h) => h.id === parts[4]);
      if (!entry) return (send(res, 404, { error: "This change is no longer in the history." }), true);
      const now_ = currentOf(entry),
        failed = undo(entry);
      if (failed) return (send(res, 409, { error: failed }), true);
      record(user, entry.area, entry.target, now_, entry.before, "undo");
      activity(user, `Website change undone (${entry.area})`);
      save();
      return (send(res, 200, { content: c, history: history().slice(0, 100) }), true);
    }
    if (parts[3] === "export" && parts.length === 4 && method === "GET") return (send(res, 200, exported()), true);
    if (parts[3] === "import" && parts.length === 4 && method === "POST") {
      const b = await body(req),
        out = checkImport(b.data);
      if (out.error) return (send(res, 400, { error: out.error }), true);
      if (b.apply !== true) return (send(res, 200, { preview: out.summary }), true);
      const before = snapshot();
      Object.assign(c, clone(out.content));
      record(user, "import", null, before, snapshot());
      activity(user, "Website content imported");
      save();
      return (send(res, 200, { imported: out.summary, content: c }), true);
    }
    const whole = { builtins: checkBuiltins, nav: checkNav, details: checkDetails, banner: checkBanner };
    if (whole[parts[3]] && parts.length === 4 && method === "PUT") {
      const area = parts[3],
        out = whole[area](await body(req));
      if (out.error) return (send(res, 400, { error: out.error }), true);
      const value = area === "nav" ? out.nav : area === "banner" ? out.banner : out,
        before = clone(c[area]);
      c[area] = value;
      record(user, area, null, before, value);
      activity(user, `Website ${area} changed`);
      save();
      return (send(res, 200, { [area]: value }), true);
    }
    return false;
  }

  return { handlePublic, handle, serveScript, override, published, checkText, BUILTINS, SLUG };
};
