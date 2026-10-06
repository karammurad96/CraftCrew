/* Area: the site editor (T264–T267, Wave 17). Admins change the texts of the website and the app per language,
   their own pages, the menu and footer, the banner and the search engine texts, and can undo every change.
   Texts are data here; the editor's own labels are translation keys. */
const sek = (key, params) => esc(t("se." + key, params));
let seData = null;
const SE_TABS = ["texts", "pages", "nav", "banner", "details", "history"];
// The text in a locale file, without the admin's changes
function seDefault(lang, key) {
  return key.split(".").reduce((node, part) => (node && typeof node === "object" ? node[part] : undefined), (window.LOCALES || {})[lang]);
}
// Every editable key: texts and lists of the English file
let seKeys = null;
function seAllKeys() {
  if (seKeys) return seKeys;
  seKeys = [];
  (function walk(node, prefix) {
    for (const [k, v] of Object.entries(node || {})) {
      const key = prefix + k;
      if (typeof v === "string" || Array.isArray(v)) seKeys.push(key);
      else if (v && typeof v === "object") walk(v, key + ".");
    }
  })((window.LOCALES || {}).en, "");
  return seKeys;
}
const seTabsHtml = (tab) =>
  `<div class="ds-ws-tabs ds-ui se-tabs" role="tablist" aria-label="${sek("tabsLabel")}">${SE_TABS.filter((k) => typeof window["seTab_" + k] === "function")
    .map((k) => `<a role="tab" href="#/admin/site?tab=${k}" aria-selected="${k === tab}"${k === tab ? ' class="active"' : ""}>${sek("tab." + k)}</a>`)
    .join("")}</div>`;
async function seLoad() {
  seData = await api("/admin/site");
  return seData;
}
async function sePage(params, query) {
  await seLoad();
  const tab = SE_TABS.includes(query?.get("tab")) && typeof window["seTab_" + query.get("tab")] === "function" ? query.get("tab") : "texts";
  app.innerHTML = dashboardShell(
    "admin",
    "site",
    `<div class="dash-top"><div><h1>${sek("title")}</h1><p>${sek("lead")}</p></div></div>${seTabsHtml(tab)}<div id="seBody" class="se-body"></div>`,
  );
  window["seTab_" + tab](query || new URLSearchParams());
}

/* ---------- Texts (T264) ---------- */
const SE_PAGE_SIZE = 40;
function seTab_texts(query) {
  const langs = seData.languages,
    lang = langs.includes(query.get("lang")) ? query.get("lang") : "en",
    area = query.get("area") || "",
    q = String(query.get("q") || "").trim().toLowerCase(),
    changedOnly = query.get("changed") === "1",
    shown = Math.max(SE_PAGE_SIZE, Number(query.get("n")) || SE_PAGE_SIZE),
    changed = seData.content.texts[lang] || {};
  const areas = Object.keys((window.LOCALES || {}).en || {});
  const matches = seAllKeys().filter((key) => {
    if (area && !key.startsWith(area + ".")) return false;
    if (changedOnly && !(key in changed)) return false;
    if (!q) return true;
    // The changed text and the original both count, so a row stays in the list after it is saved
    const flat = (v) => (Array.isArray(v) ? v.join(" ") : String(v ?? "")).toLowerCase();
    return [key.toLowerCase(), flat(changed[key]), flat(seDefault(lang, key) ?? seDefault("en", key))].some((x) => x.includes(q));
  });
  const row = (key) => {
    const base = seDefault(lang, key) ?? seDefault("en", key),
      isList = Array.isArray(base),
      own = key in changed,
      value = own ? changed[key] : base,
      shownValue = isList ? (value || []).join("\n") : value,
      marks = String(isList ? "" : seDefault("en", key)).match(/\{\w+\}/g) || [];
    return `<form class="se-text${own ? " changed" : ""}" data-action="se.saveText" data-lang="${esc(lang)}" data-key="${esc(key)}"><div class="se-text-head"><code>${esc(key)}</code>${own ? `<span class="status submitted">${sek("changed")}</span>` : ""}</div><p class="se-default"><small>${sek(lang === "en" || seDefault(lang, key) !== undefined ? "original" : "originalEn")}</small><bdi>${esc(isList ? base.join(" · ") : base)}</bdi></p><textarea name="value" rows="${Math.min(8, Math.max(2, Math.ceil(String(shownValue).length / 90) + (isList ? base.length - 1 : 0)))}" aria-label="${esc(key)}" maxlength="5000" dir="auto">${esc(shownValue)}</textarea>${
      marks.length ? `<small class="subtle">${sek("placeholders", { list: [...new Set(marks)].join(" ") })}</small>` : ""
    }${isList ? `<small class="subtle">${sek("onePerLine")}</small>` : ""}<div class="cc-actions"><button class="btn small primary">${sek("save")}</button>${
      own ? `<button type="button" class="btn small outline" data-action="se.resetText" data-lang="${esc(lang)}" data-key="${esc(key)}">${sek("reset")}</button>` : ""
    }</div></form>`;
  };
  const opt = (value, label, current) => `<option value="${esc(value)}"${value === current ? " selected" : ""}>${esc(label)}</option>`;
  document.getElementById("seBody").innerHTML = `<form class="panel se-filters" data-action="se.filterTexts"><label>${sek("lang")}<select name="lang">${langs
    .map((code) => opt(code, (LANGUAGES.find((l) => l.code === code) || {}).name || code, lang))
    .join("")}</select></label><label>${sek("area")}<select name="area">${opt("", t("se.allAreas"), area)}${areas.map((a) => opt(a, a, area)).join("")}</select></label><label>${sek("search")}<input type="search" name="q" maxlength="100" value="${esc(query.get("q") || "")}" placeholder="${sek("searchPh")}"></label><label class="cc-check-label"><input type="checkbox" name="changed"${changedOnly ? " checked" : ""}> ${sek("changedOnly")}</label><div class="cc-actions"><button class="btn primary">${sek("show")}</button></div></form><p class="subtle">${sek("matches", {
    n: matches.length,
    changed: Object.keys(changed).length,
  })}</p><div class="se-texts">${matches.slice(0, shown).map(row).join("") || `<div class="empty"><h2>${sek("noMatches")}</h2></div>`}</div>${
    matches.length > shown ? `<div class="cc-actions"><a class="btn outline" href="#/admin/site?${seQuery(query, { n: shown + SE_PAGE_SIZE })}">${sek("more")}</a></div>` : ""
  }`;
}
window.seTab_texts = seTab_texts;
function seQuery(query, change) {
  const q = new URLSearchParams(query);
  for (const [k, v] of Object.entries(change)) v === "" || v === null ? q.delete(k) : q.set(k, v);
  if (!q.get("tab")) q.set("tab", "texts");
  return q.toString();
}
actions.on("se.filterTexts", (form) => {
  const f = new FormData(form);
  navigate(
    "/admin/site?" +
      seQuery(new URLSearchParams(), { tab: "texts", lang: f.get("lang"), area: f.get("area"), q: String(f.get("q") || "").trim(), changed: f.get("changed") === "on" ? "1" : "" }),
  );
});
// After a save the editor and the admin's own pages show the new text at once
function seApplyText(lang, key, value) {
  const texts = (seData.content.texts[lang] ||= {});
  if (value === null) delete texts[key];
  else texts[key] = value;
  window.CC_SITE ||= { texts: {} };
  window.CC_SITE.texts ||= {};
  const live = (window.CC_SITE.texts[lang] ||= {});
  if (value === null) delete live[key];
  else live[key] = value;
}
actions.on("se.saveText", async (form) => {
  const lang = form.dataset.lang,
    key = form.dataset.key,
    raw = form.elements.value.value,
    value = Array.isArray(seDefault("en", key)) ? raw.split("\n").map((x) => x.trim()).filter(Boolean) : raw;
  try {
    const r = await api("/admin/site/texts", { method: "PUT", body: { lang, key, value } });
    seApplyText(lang, key, r.value);
    tToast(t("se.saved"));
    route();
  } catch (x) {
    toast(x.message, "error");
  }
});
actions.on("se.resetText", async (el) => {
  try {
    await api("/admin/site/texts", { method: "PUT", body: { lang: el.dataset.lang, key: el.dataset.key, value: null } });
    seApplyText(el.dataset.lang, el.dataset.key, null);
    tToast(t("se.resetDone"));
    route();
  } catch (x) {
    toast(x.message, "error");
  }
});

routes.add("/admin/site", sePage);

/* ---------- T265: what visitors see: own pages, menu and footer, site details, built-in pages off ---------- */
const seSite = () => window.CC_SITE || {};
const seLangText = (v) => (v && (v[ccLang] || v.en)) || "";
// The safe markup of own pages: # and ## headings, paragraphs, - lists, **bold** and [text](link) with https,
// mailto: or #/ links. Everything is escaped first, so HTML and scripts show as plain text.
function siteMarkup(src) {
  const inline = (s) =>
    esc(s)
      .replace(/\*\*([^*]+)\*\*/g, "<strong>$1</strong>")
      .replace(/\[([^\]]+)\]\(([^)\s]+)\)/g, (m, label, url) => {
        const raw = url.replace(/&amp;/g, "&");
        if (!/^(https:\/\/|mailto:|#\/)/.test(raw)) return m;
        const out = /^https:/.test(raw) ? ' target="_blank" rel="noopener"' : "";
        return `<a href="${url}"${out}>${label}</a>`;
      });
  return String(src || "")
    .replace(/\r/g, "")
    .trim()
    .split(/\n{2,}/)
    .map((block) => {
      if (block.startsWith("## ")) return `<h3>${inline(block.slice(3))}</h3>`;
      if (block.startsWith("# ")) return `<h2>${inline(block.slice(2))}</h2>`;
      const lines = block.split("\n");
      if (lines.every((l) => l.startsWith("- "))) return `<ul>${lines.map((l) => `<li>${inline(l.slice(2))}</li>`).join("")}</ul>`;
      return `<p>${lines.map(inline).join("<br>")}</p>`;
    })
    .join("");
}
async function sePublicPage(params, query) {
  const preview = query?.get("preview") === "1";
  let page;
  try {
    ({ page } = await api("/site-pages/" + encodeURIComponent(params.slug)));
  } catch {
    return renderNotFound();
  }
  app.innerHTML = publicLayout(
    `<div class="cc-page site-page">${preview || page.status !== "Published" ? `<div class="notice warn">${sek("previewNote")}</div>` : ""}<h1><bdi>${esc(seLangText(page.title))}</bdi></h1><article class="legal-body site-body">${siteMarkup(seLangText(page.body))}</article></div>`,
  );
  document.title = `${seLangText(page.seoTitle) || seLangText(page.title)} · ${BRAND.name}`;
  seMeta(seLangText(page.seoDescription) || seLangText(seSite().details?.description));
  window.scrollTo(0, 0);
}
routes.add("/p/:slug", sePublicPage);
function seMeta(description) {
  let m = document.querySelector('meta[name="description"]');
  if (!description) return m?.remove();
  if (!m) {
    m = document.createElement("meta");
    m.name = "description";
    document.head.appendChild(m);
  }
  m.content = description;
}
const SE_BUILTIN_HREF = { home: "#/", "how-it-works": "#/how-it-works", pricing: "#/pricing", faq: "#/faq", imprint: "#/imprint", privacy: "#/privacy", terms: "#/terms" };
const seBuiltinLabel = (ref) => t("se.builtin." + ref);
function seLink(l) {
  const s = seSite();
  if (l.kind === "builtin") {
    if (s.builtins?.[l.ref] === false) return "";
    return `<a href="${SE_BUILTIN_HREF[l.ref]}" data-site-link>${esc(seLangText(l.label) || seBuiltinLabel(l.ref))}</a>`;
  }
  if (l.kind === "page") {
    const p = (s.pages || []).find((x) => x.slug === l.ref);
    if (!p) return "";
    return `<a href="#/p/${esc(p.slug)}" data-site-link>${esc(seLangText(l.label) || seLangText(p.title))}</a>`;
  }
  const out = /^https:/.test(l.url) ? ' target="_blank" rel="noopener"' : "";
  return `<a href="${esc(l.url)}"${out} data-site-link>${esc(seLangText(l.label))}</a>`;
}
// Menu, footer links and site details after every page change
function siteChrome() {
  const s = seSite(),
    nav = s.nav || {},
    pages = [...(s.pages || [])].sort((a, b) => (a.order || 0) - (b.order || 0)),
    listed = (where) => new Set((nav[where] || []).filter((l) => l.kind === "page").map((l) => l.ref)),
    extra = (where) => pages.filter((p) => p.place === where && !listed(where).has(p.slug)).map((p) => ({ kind: "page", ref: p.slug }));
  const top = document.querySelector("body > .topbar .main-nav");
  if (top) {
    const base = (nav.top || []).length ? nav.top : ["how-it-works", "pricing", "faq"].map((ref) => ({ kind: "builtin", ref }));
    top.innerHTML = [...base, ...extra("top")].map(seLink).join("");
  }
  const footer = document.querySelector("body > footer");
  if (footer) {
    let box = footer.querySelector(".site-footer-links");
    const links = [...(nav.footer || []), ...extra("footer")].map(seLink).join("");
    if (!box && links) {
      box = document.createElement("nav");
      box.className = "site-footer-links";
      box.setAttribute("aria-label", t("se.footerLabel"));
      footer.appendChild(box);
    }
    if (box) box.innerHTML = links;
  }
  const path = location.hash.replace(/^#/, "").split("?")[0] || "/";
  if (!/^\/(customer|supplier|admin|p)(\/|$)/.test(path)) {
    const title = seLangText(s.details?.title);
    if (title && path === "/") document.title = title;
    seMeta(seLangText(s.details?.description));
  }
  siteBanner();
}
const seBaseRoute = window.route;
window.route = route = async function () {
  const path = location.hash.replace(/^#/, "").split("?")[0] || "/",
    builtin = path.slice(1);
  // A built-in page the admin switched off is "not found"
  if (seSite().builtins?.[builtin] === false && !/^\/(customer|supplier|admin)/.test(path)) {
    topActions();
    renderNotFound();
    siteChrome();
    return;
  }
  const result = await seBaseRoute();
  siteChrome();
  return result;
};
// After a change the admin's own page uses the new settings: load /site-content.js again
function seRefreshSite() {
  return new Promise((resolve) => {
    const tag = document.createElement("script");
    tag.src = "site-content.js?t=" + Date.now();
    tag.onload = tag.onerror = () => {
      tag.remove();
      resolve();
    };
    document.head.appendChild(tag);
  });
}

/* ---------- Admin: own pages (T265) ---------- */
const seLangName = (code) => (LANGUAGES.find((l) => l.code === code) || {}).name || code;
function sePerLangFields(name, label, values = {}, { textarea = false, max = 120, required = false } = {}) {
  return seData.languages
    .map(
      (code) =>
        `<label>${esc(label)} · ${esc(seLangName(code))}${
          textarea
            ? `<textarea name="${name}.${code}" rows="10" maxlength="${max}" dir="auto"${required && code === "en" ? " required" : ""}>${esc(values?.[code] || "")}</textarea>`
            : `<input name="${name}.${code}" maxlength="${max}" value="${esc(values?.[code] || "")}" dir="auto"${required && code === "en" ? " required" : ""}>`
        }</label>`,
    )
    .join("");
}
const sePerLang = (f, name) => Object.fromEntries(seData.languages.map((code) => [code, String(f.get(`${name}.${code}`) || "")]));
function seTab_pages(query) {
  const pages = seData.content.pages || [],
    editing = query.get("page"),
    p = editing === "new" ? { status: "Draft", place: "none", order: 0 } : pages.find((x) => x.id === editing);
  const box = document.getElementById("seBody");
  if (p) {
    const opt = (v, cur, label) => `<option value="${v}"${v === cur ? " selected" : ""}>${esc(label)}</option>`;
    box.innerHTML = `<div class="breadcrumb"><a href="#/admin/site?tab=pages">${sek("pages.back")}</a></div><form class="panel modal-form se-page-form" data-action="se.savePage" data-id="${esc(p.id || "")}"><h3>${sek(p.id ? "pages.edit" : "pages.new")}</h3><div class="cc-platform-grid"><label>${sek("pages.slug")}<input name="slug" required maxlength="60" pattern="[a-z0-9]+(-[a-z0-9]+)*" value="${esc(p.slug || "")}" placeholder="about-us"><small class="subtle">${sek("pages.slugHint")}</small></label><label>${sek("pages.status")}<select name="status">${opt("Draft", p.status, t("se.pages.draft"))}${opt("Published", p.status, t("se.pages.published"))}</select></label><label>${sek("pages.place")}<select name="place">${opt("none", p.place, t("se.pages.placeNone"))}${opt("top", p.place, t("se.pages.placeTop"))}${opt("footer", p.place, t("se.pages.placeFooter"))}</select></label><label>${sek("pages.order")}<input type="number" name="order" min="0" max="99" value="${esc(p.order || 0)}"></label></div>
${sePerLangFields("title", t("se.pages.title"), p.title, { required: true })}
<p class="subtle">${sek("pages.markupHint")}</p>
${sePerLangFields("body", t("se.pages.body"), p.body, { textarea: true, max: 20000, required: true })}
<details><summary>${sek("pages.seo")}</summary>${sePerLangFields("seoTitle", t("se.pages.seoTitle"), p.seoTitle, { max: 70 })}${sePerLangFields("seoDescription", t("se.pages.seoDescription"), p.seoDescription, { max: 160 })}</details>
<div class="cc-actions"><button class="btn primary">${sek("save")}</button>${p.id ? `<a class="btn outline" href="#/p/${esc(p.slug)}?preview=1" target="_blank" rel="noopener">${sek("pages.preview")}</a><button type="button" class="btn ghost danger" data-action="se.deletePage" data-id="${esc(p.id)}">${sek("pages.delete")}</button>` : ""}</div></form>`;
    return;
  }
  const builtins = seData.content.builtins || {};
  box.innerHTML = `<section class="panel"><div class="panel-title"><h3>${sek("pages.own")}</h3><a class="btn small primary" href="#/admin/site?tab=pages&page=new">${sek("pages.new")}</a></div>${
    pages.length
      ? `<div class="cc-table-wrap"><table class="cc-table"><thead><tr><th>${sek("pages.title")}</th><th>${sek("pages.slug")}</th><th>${sek("pages.status")}</th><th>${sek("pages.place")}</th><th><span class="sr-only">${sek("pages.actions")}</span></th></tr></thead><tbody>${pages
          .map(
            (x) =>
              `<tr><td><b><bdi>${esc(seLangText(x.title))}</bdi></b></td><td><code>/p/${esc(x.slug)}</code></td><td>${statusHtml(x.status)}</td><td>${sek("pages.place" + x.place[0].toUpperCase() + x.place.slice(1))}</td><td><a class="btn small outline" href="#/admin/site?tab=pages&page=${esc(x.id)}">${sek("pages.edit")}</a></td></tr>`,
          )
          .join("")}</tbody></table></div>`
      : `<p class="subtle">${sek("pages.none")}</p>`
  }</section><form class="panel modal-form" data-action="se.saveBuiltins"><h3>${sek("pages.builtins")}</h3><p class="subtle">${sek("pages.builtinsLead")}</p>${seData.builtins
    .map(
      (k) =>
        `<div class="se-builtin"><label class="cc-check-label"><input type="checkbox" name="${esc(k)}"${builtins[k] === false ? "" : " checked"}> ${esc(seBuiltinLabel(k))}</label><a class="btn small ghost" href="#/admin/site?tab=texts&area=public&q=${encodeURIComponent({ "how-it-works": "public.how", pricing: "public.pricing", faq: "public.faq" }[k])}">${sek("pages.editTexts")}</a></div>`,
    )
    .join("")}<p class="subtle">${sek("pages.required")}</p><div class="cc-actions"><button class="btn primary">${sek("save")}</button></div></form>`;
}
actions.on("se.savePage", async (form) => {
  const f = new FormData(form),
    body = {
      slug: f.get("slug"),
      status: f.get("status"),
      place: f.get("place"),
      order: Number(f.get("order")) || 0,
      title: sePerLang(f, "title"),
      body: sePerLang(f, "body"),
      seoTitle: sePerLang(f, "seoTitle"),
      seoDescription: sePerLang(f, "seoDescription"),
    };
  try {
    const pid = form.dataset.id;
    await api("/admin/site/pages" + (pid ? "/" + encodeURIComponent(pid) : ""), { method: pid ? "PUT" : "POST", body });
    await seRefreshSite();
    tToast(t("se.savedSite"));
    navigate("/admin/site?tab=pages");
  } catch (x) {
    toast(x.message, "error");
  }
});
actions.on("se.deletePage", async (el) => {
  const ok = await uiDialog({ title: t("se.pages.deleteTitle"), message: t("se.pages.deleteText"), confirmLabel: t("se.pages.delete"), danger: true });
  if (!ok) return;
  try {
    await api("/admin/site/pages/" + encodeURIComponent(el.dataset.id), { method: "DELETE" });
    await seRefreshSite();
    tToast(t("se.pages.deleted"));
    navigate("/admin/site?tab=pages");
  } catch (x) {
    toast(x.message, "error");
  }
});
actions.on("se.saveBuiltins", async (form) => {
  const body = Object.fromEntries(seData.builtins.map((k) => [k, form.elements[k].checked]));
  try {
    await api("/admin/site/builtins", { method: "PUT", body });
    await seRefreshSite();
    tToast(t("se.savedSite"));
    route();
  } catch (x) {
    toast(x.message, "error");
  }
});

/* ---------- Admin: menu and footer (T265) ---------- */
function seLinkRow(l = { kind: "builtin", ref: "pricing" }) {
  const pages = seData.content.pages || [],
    opt = (v, cur, label) => `<option value="${esc(v)}"${v === cur ? " selected" : ""}>${esc(label)}</option>`,
    target =
      l.kind === "link"
        ? `<input name="url" maxlength="300" value="${esc(l.url || "")}" placeholder="https://… / mailto:… / #/…" aria-label="${sek("nav.url")}">`
        : `<select name="ref" aria-label="${sek("nav.target")}">${
            l.kind === "page"
              ? pages.map((p) => opt(p.slug, l.ref, seLangText(p.title) + " (/p/" + p.slug + ")")).join("")
              : ["home", ...seData.builtins, "imprint", "privacy", "terms"].map((k) => opt(k, l.ref, seBuiltinLabel(k))).join("")
          }</select>`;
  return `<div class="se-link"><select name="kind" data-action="se.linkKind" aria-label="${sek("nav.kind")}">${opt("builtin", l.kind, t("se.nav.builtin"))}${opt("page", l.kind, t("se.nav.page"))}${opt("link", l.kind, t("se.nav.link"))}</select>${target}${seData.languages
    .map((code) => `<input name="label.${code}" maxlength="40" value="${esc(l.label?.[code] || "")}" placeholder="${sek("nav.label")} (${code.toUpperCase()})" aria-label="${sek("nav.label")} ${esc(seLangName(code))}">`)
    .join("")}<span class="se-link-moves"><button type="button" class="btn small ghost" data-action="se.linkUp" aria-label="${sek("nav.up")}">↑</button><button type="button" class="btn small ghost" data-action="se.linkDown" aria-label="${sek("nav.down")}">↓</button><button type="button" class="btn small ghost danger" data-action="se.linkRemove" aria-label="${sek("nav.remove")}">×</button></span></div>`;
}
function seTab_nav() {
  const nav = seData.content.nav || {};
  const list = (where) =>
    `<fieldset class="se-links" data-where="${where}"><legend>${sek("nav." + where)}</legend><p class="subtle">${sek("nav." + where + "Hint")}</p><div class="se-link-rows">${(nav[where] || []).map(seLinkRow).join("")}</div><button type="button" class="btn small outline" data-action="se.linkAdd">${sek("nav.add")}</button></fieldset>`;
  document.getElementById("seBody").innerHTML = `<form class="panel modal-form" data-action="se.saveNav">${list("top")}${list("footer")}<div class="cc-actions"><button class="btn primary">${sek("save")}</button></div></form>`;
}
actions.on("se.linkKind", (el) => {
  const row = el.closest(".se-link"),
    data = { kind: el.value, label: Object.fromEntries(seData.languages.map((c) => [c, row.querySelector(`[name="label.${c}"]`).value])) };
  if (data.kind === "page" && !(seData.content.pages || []).length) {
    el.value = "builtin";
    return toast(t("se.nav.noPages"), "error");
  }
  row.outerHTML = seLinkRow({ ...data, ref: data.kind === "page" ? seData.content.pages[0].slug : "pricing" });
});
actions.on("se.linkAdd", (el) => el.previousElementSibling.insertAdjacentHTML("beforeend", seLinkRow()));
actions.on("se.linkRemove", (el) => el.closest(".se-link").remove());
actions.on("se.linkUp", (el) => {
  const row = el.closest(".se-link");
  if (row.previousElementSibling) row.parentNode.insertBefore(row, row.previousElementSibling);
});
actions.on("se.linkDown", (el) => {
  const row = el.closest(".se-link");
  if (row.nextElementSibling) row.parentNode.insertBefore(row.nextElementSibling, row);
});
actions.on("se.saveNav", async (form) => {
  const read = (where) =>
    [...form.querySelectorAll(`.se-links[data-where="${where}"] .se-link`)].map((row) => {
      const kind = row.querySelector("[name=kind]").value,
        label = Object.fromEntries(seData.languages.map((c) => [c, row.querySelector(`[name="label.${c}"]`).value.trim()]));
      return kind === "link" ? { kind, url: row.querySelector("[name=url]").value.trim(), label } : { kind, ref: row.querySelector("[name=ref]").value, label };
    });
  try {
    await api("/admin/site/nav", { method: "PUT", body: { top: read("top"), footer: read("footer") } });
    await seRefreshSite();
    tToast(t("se.savedSite"));
    route();
  } catch (x) {
    toast(x.message, "error");
  }
});

/* ---------- Admin: site details (T265) ---------- */
function seTab_details() {
  const d = seData.content.details || {};
  document.getElementById("seBody").innerHTML = `<form class="panel modal-form" data-action="se.saveDetails"><h3>${sek("details.title")}</h3><p class="subtle">${sek("details.lead")}</p>${sePerLangFields("title", t("se.details.siteTitle"), d.title, { max: 70 })}${sePerLangFields(
    "description",
    t("se.details.description"),
    d.description,
    { max: 160 },
  )}<div class="cc-actions"><button class="btn primary">${sek("save")}</button></div></form>`;
}
actions.on("se.saveDetails", async (form) => {
  const f = new FormData(form);
  try {
    await api("/admin/site/details", { method: "PUT", body: { title: sePerLang(f, "title"), description: sePerLang(f, "description") } });
    await seRefreshSite();
    tToast(t("se.savedSite"));
    route();
  } catch (x) {
    toast(x.message, "error");
  }
});

/* ---------- T266: the banner ---------- */
// The banner's identity: a changed text shows again to people who closed the old one
const seBannerId = (b) => JSON.stringify([b.text, b.link?.url || "", b.kind]);
function seBannerClosed(b) {
  try {
    return localStorage.getItem("cc_banner_closed") === seBannerId(b);
  } catch {
    return false;
  }
}
function siteBanner() {
  document.getElementById("siteBanner")?.remove();
  const b = seSite().banner,
    role = state.user?.role,
    path = location.hash.replace(/^#/, "").split("?")[0];
  if (!b || !b.on || path.startsWith("/admin/site")) return;
  const fits = { everyone: true, visitors: !role, customers: role === "customer", suppliers: role === "supplier" }[b.audience || "everyone"];
  if (!fits || (b.closable && seBannerClosed(b))) return;
  const host = document.getElementById("app");
  if (!host) return;
  const link = b.link ? ` <a href="${esc(b.link.url)}"${/^https:/.test(b.link.url) ? ' target="_blank" rel="noopener"' : ""}>${esc(seLangText(b.link.label))}</a>` : "";
  host.insertAdjacentHTML(
    "afterbegin",
    `<div id="siteBanner" class="site-banner site-banner-${esc(b.kind || "info")}" role="status"><p><bdi>${esc(seLangText(b.text))}</bdi>${link}</p>${
      b.closable ? `<button type="button" class="site-banner-close" data-action="se.closeBanner" aria-label="${sek("banner.close")}">×</button>` : ""
    }</div>`,
  );
}
actions.on("se.closeBanner", () => {
  try {
    localStorage.setItem("cc_banner_closed", seBannerId(seSite().banner));
  } catch {}
  document.getElementById("siteBanner")?.remove();
});

/* ---------- Admin: banner (T266) ---------- */
function seTab_banner() {
  const b = seData.content.banner || { on: false, kind: "info", audience: "everyone", closable: true },
    opt = (v, cur, label) => `<option value="${v}"${v === cur ? " selected" : ""}>${esc(label)}</option>`;
  document.getElementById("seBody").innerHTML = `<form class="panel modal-form" data-action="se.saveBanner"><h3>${sek("banner.title")}</h3><p class="subtle">${sek("banner.lead")}</p><label class="cc-check-label"><input type="checkbox" name="on"${b.on ? " checked" : ""}> ${sek("banner.on")}</label>${sePerLangFields("text", t("se.banner.text"), b.text, { max: 300 })}<div class="cc-platform-grid"><label>${sek("banner.kind")}<select name="kind">${["info", "success", "warning"].map((k) => opt(k, b.kind, t("se.banner.kinds." + k))).join("")}</select></label><label>${sek("banner.audience")}<select name="audience">${["everyone", "visitors", "customers", "suppliers"]
    .map((k) => opt(k, b.audience, t("se.banner.audiences." + k)))
    .join("")}</select></label><label>${sek("banner.from")}<input type="date" name="from" value="${esc(b.from || "")}"></label><label>${sek("banner.until")}<input type="date" name="until" value="${esc(b.until || "")}"></label><label>${sek("banner.linkUrl")}<input name="linkUrl" maxlength="300" value="${esc(b.link?.url || "")}" placeholder="https://… / #/…"></label></div>${sePerLangFields("linkLabel", t("se.banner.linkLabel"), b.link?.label, { max: 40 })}<label class="cc-check-label"><input type="checkbox" name="closable"${b.closable === false ? "" : " checked"}> ${sek("banner.closable")}</label><div class="cc-actions"><button class="btn primary">${sek("save")}</button></div></form>`;
}
actions.on("se.saveBanner", async (form) => {
  const f = new FormData(form),
    url = String(f.get("linkUrl") || "").trim();
  try {
    await api("/admin/site/banner", {
      method: "PUT",
      body: {
        on: f.get("on") === "on",
        text: sePerLang(f, "text"),
        kind: f.get("kind"),
        audience: f.get("audience"),
        from: f.get("from"),
        until: f.get("until"),
        closable: f.get("closable") === "on",
        link: url ? { url, label: sePerLang(f, "linkLabel") } : null,
      },
    });
    await seRefreshSite();
    tToast(t("se.savedSite"));
    route();
  } catch (x) {
    toast(x.message, "error");
  }
});
