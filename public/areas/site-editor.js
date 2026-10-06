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
