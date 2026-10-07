/*
 * Public pages per category and region (T246, Wave 16), for search engines and for customers who look for
 * "PLC programming in Bavaria": /services (the list), /services/<category>/<region>, /sitemap.xml and /robots.txt.
 * The pages are plain HTML rendered by the server (no script), in English and German (?lang=de).
 *
 * Only real pages: a pair exists only inside the served area (T255) and with at least 3 vetted suppliers (live
 * suppliers that offer the category and sit in the region). The price range is the T69 benchmark of the category
 * and only shown with enough data points; the number of suppliers is rounded down; the case study is one anonymised
 * finished project whose customer allowed it (POST /api/requests/<id>/case-study).
 */
const { MIN_POINTS } = require("./benchmarks");

const MIN_SUPPLIERS = 3;
const ROUNDS = [1000, 500, 200, 100, 50, 20, 10, 5]; // the number of suppliers is rounded down to one of these
const key = (s) =>
  String(s || "")
    .trim()
    .toLowerCase();
const plain = (s) =>
  String(s || "")
    .toLowerCase()
    .normalize("NFKD")
    .replace(/[̀-ͯ]/g, "")
    .replace(/ß/g, "ss")
    .trim();
const slugify = (s) =>
  plain(s)
    .replace(/&/g, " and ")
    .replace(/[^a-z0-9]+/g, "-")
    .replace(/^-+|-+$/g, "");
const esc = (s) =>
  String(s ?? "").replace(/[&<>"']/g, (c) => ({ "&": "&amp;", "<": "&lt;", ">": "&gt;", '"': "&quot;", "'": "&#39;" })[c]);

// German states by the first two digits of the postcode (an approximation: a few areas straddle a border) and the
// cities of the geocoder, so a supplier's location text puts it in a region.
const range = (a, b) => Array.from({ length: b - a + 1 }, (_, i) => String(a + i).padStart(2, "0"));
const REGIONS = [
  { slug: "baden-wuerttemberg", en: "Baden-Württemberg", de: "Baden-Württemberg", prefixes: [...range(68, 79), "88", "89"], cities: ["stuttgart", "ulm", "karlsruhe", "mannheim"] },
  { slug: "bavaria", en: "Bavaria", de: "Bayern", prefixes: [...range(80, 87), ...range(90, 97)], cities: ["munich", "munchen", "nuremberg", "nurnberg", "regensburg", "ingolstadt", "augsburg", "wurzburg"] },
  { slug: "berlin", en: "Berlin", de: "Berlin", prefixes: ["10", "12", "13"], cities: ["berlin"] },
  { slug: "brandenburg", en: "Brandenburg", de: "Brandenburg", prefixes: ["03", "14", "15", "16"], cities: [] },
  { slug: "bremen", en: "Bremen", de: "Bremen", prefixes: ["28"], cities: ["bremen"] },
  { slug: "hamburg", en: "Hamburg", de: "Hamburg", prefixes: ["20", "22"], cities: ["hamburg"] },
  { slug: "hesse", en: "Hesse", de: "Hessen", prefixes: ["34", "35", "36", "60", "61", "63", "64", "65"], cities: ["frankfurt"] },
  { slug: "lower-saxony", en: "Lower Saxony", de: "Niedersachsen", prefixes: ["21", "26", "27", "29", "30", "31", "37", "38", "49"], cities: ["hannover", "hanover", "wolfsburg"] },
  { slug: "mecklenburg-vorpommern", en: "Mecklenburg-Vorpommern", de: "Mecklenburg-Vorpommern", prefixes: ["17", "18", "19"], cities: [] },
  { slug: "north-rhine-westphalia", en: "North Rhine-Westphalia", de: "Nordrhein-Westfalen", prefixes: ["32", "33", ...range(40, 48), "50", "51", "52", "53", "57", "58", "59"], cities: ["cologne", "koln", "dusseldorf", "dortmund", "essen"] },
  { slug: "rhineland-palatinate", en: "Rhineland-Palatinate", de: "Rheinland-Pfalz", prefixes: ["54", "55", "56", "67"], cities: [] },
  { slug: "saarland", en: "Saarland", de: "Saarland", prefixes: ["66"], cities: [] },
  { slug: "saxony", en: "Saxony", de: "Sachsen", prefixes: ["01", "04", "08", "09"], cities: ["dresden", "leipzig", "chemnitz"] },
  { slug: "saxony-anhalt", en: "Saxony-Anhalt", de: "Sachsen-Anhalt", prefixes: ["06", "39"], cities: [] },
  { slug: "schleswig-holstein", en: "Schleswig-Holstein", de: "Schleswig-Holstein", prefixes: ["23", "24", "25"], cities: [] },
  { slug: "thuringia", en: "Thuringia", de: "Thüringen", prefixes: ["07", "98", "99"], cities: ["erfurt"] },
];

const roundedDown = (n) => ROUNDS.find((r) => n >= r) || 0;

module.exports = function createServicePages(ctx) {
  const { getDb, send, body, benchmarks, categories, appUrl, pageHeaders, text, langOf, brand, notify, activity } = ctx;
  const localeOf = (lang) => (lang === "de" ? "de" : "en");

  // The region of a supplier's location text: a postcode, else a known city
  function regionOfLocation(location) {
    const s = plain(location),
      zip = s.match(/\b(\d{5})\b/);
    if (zip) return REGIONS.find((r) => r.prefixes.includes(zip[1].slice(0, 2))) || null;
    return REGIONS.find((r) => r.cities.some((c) => new RegExp(`(^|[^a-z])${c}([^a-z]|$)`).test(s))) || null;
  }
  const offers = (s, category) =>
    (s.services || []).some((x) => key(x) === key(category)) ||
    (s.serviceCatalog || []).some((c) => key(c.category) === key(category) || key(c.name) === key(category));
  const servedRegion = (region, settings) => {
    const served = Array.isArray(settings?.servedRegions) ? settings.servedRegions : [];
    return !served.length || region.prefixes.some((p) => served.some((sp) => p.startsWith(sp) || sp.startsWith(p)));
  };
  const servedCategory = (category, settings) => {
    const served = Array.isArray(settings?.servedCategories) ? settings.servedCategories : [];
    return !served.length || served.some((c) => key(c) === key(category));
  };

  // Every real page: a served pair with at least 3 vetted suppliers
  function pairs() {
    const db = getDb(),
      list = categories(),
      out = [];
    for (const category of list) {
      if (!servedCategory(category, db.settings)) continue;
      for (const region of REGIONS) {
        if (!servedRegion(region, db.settings)) continue;
        const suppliers = (db.suppliers || []).filter(
          (s) => s.live && offers(s, category) && regionOfLocation(s.location)?.slug === region.slug,
        );
        if (suppliers.length >= MIN_SUPPLIERS) out.push({ category, region, suppliers: suppliers.length, slug: slugify(category) });
      }
    }
    return out.filter((p) => p.slug);
  }
  const find = (catSlug, regSlug) => pairs().find((p) => p.slug === catSlug && p.region.slug === regSlug);

  // One anonymised finished project of the category and region whose customer allowed it
  function caseStudy(pair) {
    const db = getDb();
    for (const r of [...(db.requests || [])].reverse()) {
      if (!r.caseStudy?.allowed || !r.caseStudy.summary || r.status !== "Contracted") continue;
      if (!(r.packages || []).some((p) => key(p.category) === key(pair.category))) continue;
      if (regionOfLocation(r.sitePostcode || "")?.slug !== pair.region.slug) continue;
      const project = (db.projects || []).find((p) => p.id === r.projectId),
        tasks = project ? project.phases.flatMap((ph) => ph.tasks || []) : [];
      const ids = new Set((r.packages || []).map((p) => p.taskId));
      const mine = tasks.filter((t) => ids.has(t.id));
      if (!mine.length || !mine.every((t) => t.status === "Completed")) continue;
      return { summary: r.caseStudy.summary, hours: (r.packages || []).reduce((n, p) => n + (Number(p.hours) || 0), 0), packages: r.packages.length };
    }
    return null;
  }

  const url = (path, lang) => `${appUrl()}${path}${lang === "de" ? "?lang=de" : ""}`;
  const pagePath = (p) => `/services/${p.slug}/${p.region.slug}`;

  function layout(lang, { title, description, canonical, alternates = [], head = "", main }) {
    const t = (k, params) => esc(text(lang, "server.servicePage." + k, params));
    return `<!doctype html>
<html lang="${lang}"><head><meta charset="utf-8"><meta name="viewport" content="width=device-width,initial-scale=1">
<title>${esc(title)}</title><meta name="description" content="${esc(description)}"><link rel="canonical" href="${esc(canonical)}">${alternates
      .map((a) => `<link rel="alternate" hreflang="${a.lang}" href="${esc(a.href)}">`)
      .join("")}<meta name="theme-color" content="#F5F5F7"><link rel="icon" href="/icons/favicon.svg" type="image/svg+xml"><link rel="stylesheet" href="/servicepages.css">${head}</head>
<body><a class="sp-skip" href="#main">${t("skip")}</a><header class="sp-header"><a class="sp-brand" href="/">${esc(brand().name)}</a><nav class="sp-lang" aria-label="${t("language")}">${alternates
      .map((a) => `<a href="${esc(a.href.replace(appUrl(), ""))}" hreflang="${a.lang}"${a.lang === lang ? ' aria-current="true"' : ""}>${a.lang.toUpperCase()}</a>`)
      .join("")}</nav></header><main id="main" class="sp-main">${main(t)}</main><footer class="sp-footer"><a href="/#/terms">${t("terms")}</a> <a href="/#/ranking">${t("ranking")}</a> <a href="/services${lang === "de" ? "?lang=de" : ""}">${t("allServices")}</a></footer></body></html>`;
  }
  const alternatesOf = (path) => [
    { lang: "en", href: url(path, "en") },
    { lang: "de", href: url(path, "de") },
  ];

  function render(pair, lang) {
    const db = getDb(),
      region = pair.region[lang],
      category = pair.category,
      bench = benchmarks.benchmark(category),
      range = bench?.available && bench.count >= MIN_POINTS ? bench : null,
      rounded = roundedDown(pair.suppliers),
      study = caseStudy(pair),
      names = [
        ...new Set(
          (db.suppliers || [])
            .filter((s) => s.live && regionOfLocation(s.location)?.slug === pair.region.slug)
            .flatMap((s) => (s.serviceCatalog || []).filter((c) => key(c.category) === key(category)).map((c) => String(c.name || "").trim())),
        ),
      ]
        .filter(Boolean)
        .slice(0, 8),
      path = pagePath(pair),
      params = { category, region, brand: brand().name };
    const ld = {
      "@context": "https://schema.org",
      "@type": "Service",
      name: text(lang, "server.servicePage.title", params),
      serviceType: category,
      areaServed: { "@type": "AdministrativeArea", name: region },
      provider: { "@type": "Organization", name: brand().name, url: appUrl() },
      url: url(path, lang),
      ...(range ? { offers: { "@type": "AggregateOffer", priceCurrency: "EUR", lowPrice: range.p25, highPrice: range.p75 } } : {}),
    };
    return layout(lang, {
      title: text(lang, "server.servicePage.title", params) + " | " + brand().name,
      description: text(lang, "server.servicePage.description", params),
      canonical: url(path, lang),
      alternates: alternatesOf(path),
      head: `<script type="application/ld+json">${JSON.stringify(ld).replace(/</g, "\\u003c")}</script>`,
      main: (t) => `<h1>${t("title", params)}</h1><p class="sp-lead">${t("lead", params)}</p>
<section aria-labelledby="sp-covers"><h2 id="sp-covers">${t("coversTitle")}</h2><p>${t("covers", params)}</p>${
        names.length ? `<ul>${names.map((n) => `<li>${esc(n)}</li>`).join("")}</ul>` : ""
      }</section>
<section aria-labelledby="sp-price"><h2 id="sp-price">${t("priceTitle")}</h2>${
        range
          ? `<p>${t("price", { low: range.p25, high: range.p75, points: range.count })}</p><p class="sp-note">${t("priceNote")}</p>`
          : `<p>${t("noPrice")}</p>`
      }</section>
<section aria-labelledby="sp-suppliers"><h2 id="sp-suppliers">${t("suppliersTitle")}</h2><p>${rounded ? t("suppliers", { n: rounded, region }) : t("suppliersFew", { region })}</p></section>
<section aria-labelledby="sp-how"><h2 id="sp-how">${t("howTitle")}</h2><ol><li>${t("how1")}</li><li>${t("how2")}</li><li>${t("how3")}</li><li>${t("how4")}</li></ol></section>${
        study
          ? `<section aria-labelledby="sp-case"><h2 id="sp-case">${t("caseTitle")}</h2><blockquote>${esc(study.summary)}</blockquote><p class="sp-note">${t("caseFacts", { hours: study.hours, n: study.packages })}</p></section>`
          : ""
      }<p class="sp-cta"><a class="sp-button" href="/#/customer/requests/new">${t("cta")}</a></p>`,
    });
  }

  function renderIndex(lang) {
    const list = pairs(),
      byCategory = new Map();
    for (const p of list) byCategory.set(p.category, [...(byCategory.get(p.category) || []), p]);
    return layout(lang, {
      title: text(lang, "server.servicePage.indexTitle", { brand: brand().name }),
      description: text(lang, "server.servicePage.indexDescription", { brand: brand().name }),
      canonical: url("/services", lang),
      alternates: alternatesOf("/services"),
      main: (t) =>
        `<h1>${t("indexTitle", { brand: brand().name })}</h1><p class="sp-lead">${t("indexLead")}</p>${
          list.length
            ? [...byCategory.entries()]
                .map(([category, ps]) => `<section><h2>${esc(category)}</h2><ul>${ps.map((p) => `<li><a href="${pagePath(p)}${lang === "de" ? "?lang=de" : ""}">${esc(p.region[lang])}</a></li>`).join("")}</ul></section>`)
                .join("")
            : `<p>${t("indexNone")}</p>`
        }<p class="sp-cta"><a class="sp-button" href="/#/customer/requests/new">${t("cta")}</a></p>`,
    });
  }

  function sitemap() {
    const links = (path) => ["en", "de"].map((l) => `<xhtml:link rel="alternate" hreflang="${l}" href="${esc(url(path, l))}"/>`).join("");
    const entry = (path, lang) => `<url><loc>${esc(url(path, lang))}</loc>${links(path)}</url>`;
    const paths = ["/services", ...pairs().map(pagePath)];
    return `<?xml version="1.0" encoding="UTF-8"?>\n<urlset xmlns="http://www.sitemaps.org/schemas/sitemap/0.9" xmlns:xhtml="http://www.w3.org/1999/xhtml">${paths
      .flatMap((p) => [entry(p, "en"), entry(p, "de")])
      .join("")}</urlset>\n`;
  }

  // GET /services, /services/<category>/<region>, /sitemap.xml, /robots.txt
  function serve(req, res, u) {
    if (!["GET", "HEAD"].includes(req.method)) return false;
    const send200 = (type, payload) => {
      res.writeHead(200, { ...pageHeaders(req), "Content-Type": type, "Cache-Control": "public, max-age=300" });
      res.end(req.method === "HEAD" ? undefined : payload);
      return true;
    };
    if (u.pathname === "/robots.txt")
      return send200("text/plain; charset=utf-8", `User-agent: *\nAllow: /\nDisallow: /api/\nSitemap: ${appUrl()}/sitemap.xml\n`);
    if (u.pathname === "/sitemap.xml") return send200("application/xml; charset=utf-8", sitemap());
    const m = u.pathname.match(/^\/services(?:\/([a-z0-9-]+)\/([a-z0-9-]+))?\/?$/);
    if (!m) return false;
    const lang = localeOf(u.searchParams.get("lang") === "de" ? "de" : "en");
    if (!m[1]) return send200("text/html; charset=utf-8", renderIndex(lang));
    const pair = find(m[1], m[2]);
    if (!pair) {
      res.writeHead(404, { ...pageHeaders(req), "Content-Type": "text/html; charset=utf-8", "Cache-Control": "no-store" });
      res.end(
        layout(lang, {
          title: text(lang, "server.servicePage.notFoundTitle"),
          description: text(lang, "server.servicePage.notFoundTitle"),
          canonical: url("/services", lang),
          head: '<meta name="robots" content="noindex">',
          main: (t) => `<h1>${t("notFoundTitle")}</h1><p>${t("notFound")}</p><p><a href="/services${lang === "de" ? "?lang=de" : ""}">${t("allServices")}</a></p>`,
        }),
      );
      return true;
    }
    return send200("text/html; charset=utf-8", render(pair, lang));
  }

  // POST /api/requests/<id>/case-study: the customer allows an anonymised case study of a finished project
  async function handle(req, res, parts, user) {
    if (parts[1] !== "requests" || parts[3] !== "case-study" || parts[4]) return false;
    if (req.method !== "POST") return false;
    const r = (getDb().requests || []).find((x) => x.id === parts[2] && x.customerId === user.id);
    if (user.role !== "customer" || !r) return (send(res, 404, { error: "Request not found" }), true);
    if (r.status !== "Contracted")
      return (send(res, 409, { error: "A case study is possible once the work is contracted." }), true);
    const b = await body(req),
      summary = String(b.summary || "").trim().slice(0, 400);
    if (b.allow === true && summary.length < 20)
      return (send(res, 400, { error: "Describe the project in at least 20 characters, without names." }), true);
    r.caseStudy = b.allow === true ? { allowed: true, summary, at: ctx.now() } : { allowed: false, summary: "", at: ctx.now() };
    activity(user, b.allow === true ? "Allowed a case study" : "Withdrew the case study");
    ctx.save();
    return (send(res, 200, { caseStudy: r.caseStudy }), true);
  }

  return { serve, handle, pairs, regionOfLocation };
};
Object.assign(module.exports, { REGIONS, slugify, roundedDown, MIN_SUPPLIERS });
