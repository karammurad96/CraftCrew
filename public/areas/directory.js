/* Area: the supplier directory (T129a). The directory with its filters, grid, list and map, compare and shortlist,
   one quote request to several suppliers; the supplier profile with reliability, certificates and proofs,
   scorecard and preferred list; the request dialog (service or evidence); the customer's preferred suppliers;
   the supplier's quote requests with the detailed quote. Drawn with translation keys; supplier data (names,
   services, locations) stays as stored and goes through the old translation in <bdi data-i18n="dom">. */
const dirk = (key, params) => esc(t("dir." + key, params));
const dirDom = (text) => `<bdi data-i18n="dom">${esc(text)}</bdi>`;
const dirKeys = (html) => html.replace(/^<(\w+)/, '<$1 data-i18n="keys"');
const dirBase = () => (state.user?.role === "customer" ? "/customer/suppliers" : "/suppliers");
const DIR_MAX = 3;
const DIR_UNITS = ["hour", "day", "project", "unit", "fixed"];
let dirShortlist = [];

/* ---------- Compare selection and shortlist ---------- */
function dirSelected() {
  try {
    const ids = JSON.parse(sessionStorage.getItem("cc_compare") || "[]");
    return Array.isArray(ids) ? ids.slice(0, DIR_MAX) : [];
  } catch {
    return [];
  }
}
function dirSetSelected(ids) {
  try {
    sessionStorage.setItem("cc_compare", JSON.stringify(ids.slice(0, DIR_MAX)));
  } catch {}
}
async function dirLoadShortlist() {
  try {
    dirShortlist = (await api("/shortlist")).supplierIds || [];
  } catch {
    dirShortlist = [];
  }
  return dirShortlist;
}
async function dirSuppliers(ids) {
  return (await Promise.all(ids.map((id) => api("/suppliers/" + encodeURIComponent(id)).catch(() => null))))
    .map((r) => r?.supplier)
    .filter(Boolean);
}

// Public reliability (T61): rates appear only with at least 3 data points; otherwise "New on CraftCrew"
function dirReliability(s, full = false) {
  const r = s.reliability;
  if (!r) return "";
  const rates = [
    [r.onTimeRate, "onTime"],
    [r.firstTimeRightRate, "firstTime"],
    [r.responseRate, "response"],
  ].filter(([v]) => v !== null && v !== undefined);
  const item = (v, label) => `<span><b>${esc(v)}</b> <span>${dirk("rel." + label)}</span></span>`;
  const body = r.isNew ? `<span class="cc-rel-new">${dirk("rel.new")}</span>` : rates.map(([v, l]) => item(v + "%", l)).join("");
  return full
    ? `<section class="panel cc-rel-panel"><h2>${dirk("rel.title")}</h2><div class="cc-rel">${body}${item(r.completed, "completed")}${item(r.reviews, "reviews")}</div></section>`
    : `<div class="cc-rel">${body}</div>`;
}

/* ---------- Directory ---------- */
async function dirPage(params, query) {
  const v = {
      q: query.get("q") || "",
      service: query.get("service") || "",
      badge: query.get("badge") || "",
      available: query.get("available") === "1",
      country: query.get("country") || "",
      minRating: query.get("rating") || "",
      maxRate: query.get("maxRate") || "",
      minExperience: query.get("experience") || "",
      certs: (query.get("certs") || "").split(",").filter(Boolean),
      near: query.get("near") || "",
      radius: query.get("radius") || "100",
      onlyShortlist: query.get("shortlist") === "1",
      sort: query.get("sort") || "relevance",
      view: query.get("view") || "grid",
    },
    customer = state.user?.role === "customer",
    // Certification and region filters run on the server (T62); the rest filters this list
    serverQuery = new URLSearchParams(
      Object.entries({ certs: query.get("certs") || "", near: v.near, radius: v.near ? v.radius : "" }).filter(([, x]) => x),
    ),
    [directory, shortlist] = await Promise.all([api("/suppliers?" + serverQuery), customer ? dirLoadShortlist() : []]),
    all = directory.suppliers || [],
    tokens = reviewTokens(v.q);
  const rows = all
    .filter((s) => !tokens.length || reviewScore(s, v.q) > 0)
    .filter(
      (s) =>
        (!v.service || (s.services || []).includes(v.service)) &&
        (!v.badge || s.badge === v.badge) &&
        (!v.available || s.availability === "Available") &&
        (!v.country || s.location?.toLowerCase().includes(v.country.toLowerCase())) &&
        (!v.minRating || Number(s.rating) >= Number(v.minRating)) &&
        (!v.maxRate || Number(s.hourlyRate) <= Number(v.maxRate)) &&
        (!v.minExperience || Number(s.experience) >= Number(v.minExperience)) &&
        (!v.onlyShortlist || shortlist.includes(s.id)),
    )
    .sort((a, b) =>
      v.sort === "price"
        ? Number(a.hourlyRate) - Number(b.hourlyRate)
        : v.sort === "rating"
          ? Number(b.rating) - Number(a.rating)
          : v.sort === "experience"
            ? Number(b.experience) - Number(a.experience)
            : reviewScore(b, v.q) - reviewScore(a, v.q),
    );
  const html = `<div class="cc-page"><div class="page-head"><div><div class="eyebrow">${dirk("eyebrow")}</div><h1>${dirk("title")}</h1><p>${dirk("intro")}</p></div></div>${dirFilters(v, all, directory.certifications || [], customer)}<div class="review-directory-toolbar"><span>${esc(t.plural("dir.found", rows.length))}</span><div class="cc-actions">${["grid", "list", "map"]
    .map((x) => `<button class="btn small ${v.view === x ? "primary" : "outline"}" data-action="dir.view" data-view="${x}">${dirk("view." + x)}</button>`)
    .join("")}</div></div>${directory.region && !directory.region.found ? `<div class="notice" role="status">${dirk("region")}</div>` : ""}${dirListing(rows, v.view, customer, shortlist)}${dirBarHtml()}</div>`;
  app.innerHTML = customer ? dashboardShell("customer", "suppliers", dirKeys(html)) : publicLayout(dirKeys(html));
  if (v.view === "map") dirMap(rows);
}
function dirFilters(v, all, certifications, customer) {
  const opt = (value, label, on) => `<option value="${esc(value)}"${on ? " selected" : ""}>${label}</option>`,
    services = [...new Set(all.flatMap((s) => s.services || []))].sort(),
    countries = [...new Set(all.map((s) => (s.location || "").split(",").at(-1).trim()).filter(Boolean))].sort(),
    more = v.certs.length || v.near || v.onlyShortlist || v.country || v.minRating || v.maxRate || v.minExperience;
  return `<form id="ccSupplierSearch" class="cc-supplier-filters" data-action="dir.search"><label class="cc-search-wide">${dirk("f.search")}<input id="ccSq" value="${esc(v.q)}" placeholder="${dirk("f.searchHint")}"></label><label>${dirk("f.service")}<select id="ccSs" data-i18n="dom">${opt("", esc(t("dir.f.allServices")))}${services.map((s) => opt(s, esc(s), s === v.service)).join("")}</select></label><label>${dirk("f.badge")}<select id="ccSb">${opt("", dirk("f.allBadges"))}${["Gold", "Silver", "Bronze"].map((s) => opt(s, esc(t("common.badge." + s)), s === v.badge)).join("")}</select></label><label class="cc-check-label"><input id="ccSa" type="checkbox"${v.available ? " checked" : ""}> ${dirk("f.available")}</label><button class="btn primary">${dirk("f.go")}</button><details class="cc-advanced-filters"${more ? " open" : ""}><summary>${dirk("f.more")}</summary><div class="cc-advanced-grid"><label>${dirk("f.country")}<select id="ccCountry" data-i18n="dom">${opt("", esc(t("dir.f.anyLocation")))}${countries.map((s) => opt(s, esc(s), s === v.country)).join("")}</select></label><label>${dirk("f.rating")}<select id="ccRating">${opt("", dirk("f.anyRating"))}${["3", "3.5", "4", "4.5"].map((s) => opt(s, s, s === v.minRating)).join("")}</select></label><label>${dirk("f.maxRate")}<input id="ccRate" type="number" min="0" value="${esc(v.maxRate)}" placeholder="${dirk("f.rateHint")}"></label><label>${dirk("f.experience")}<input id="ccExperience" type="number" min="0" value="${esc(v.minExperience)}" placeholder="${dirk("f.years")}"></label><label>${dirk("f.near")}<input id="ccNear" value="${esc(v.near)}" placeholder="${dirk("f.nearHint")}"></label><label>${dirk("f.radius")}<select id="ccRadius">${["25", "50", "100", "200", "500"].map((r) => opt(r, dirk("f.km", { n: r }), r === v.radius)).join("")}</select></label>${customer ? `<label class="cc-check-label"><input id="ccShortlistOnly" type="checkbox"${v.onlyShortlist ? " checked" : ""}> ${dirk("f.shortlist")}</label>` : ""}<fieldset class="dir-certs"><legend>${dirk("f.certs")}</legend>${[...new Set([...certifications, ...v.certs])]
    .map((c) => `<label class="cc-check-label"><input type="checkbox" name="ccCerts" value="${esc(c)}"${v.certs.includes(c) ? " checked" : ""}> ${dirDom(c)}</label>`)
    .join("")}</fieldset><label>${dirk("f.sort")}<select id="ccSort">${[
    ["relevance", "sortRelevance"],
    ["rating", "sortRating"],
    ["price", "sortPrice"],
    ["experience", "sortExperience"],
  ]
    .map(([value, key]) => opt(value, dirk("f." + key), value === v.sort))
    .join("")}</select></label></div></details></form>`;
}
function dirCard(s, customer, shortlist) {
  const href = `#${dirBase()}/${encodeURIComponent(s.id)}`,
    picked = dirSelected().includes(s.id),
    starred = shortlist.includes(s.id);
  return `<article class="supplier-card review-supplier-card" data-supplier-id="${esc(s.id)}"><div class="supplier-top"><div class="supplier-avatar">${esc(s.avatar || "CC")}</div><div><h3>${esc(s.company)}</h3><small>${dirDom(s.location || "")}</small></div><span class="badge ${esc((s.badge || "none").toLowerCase())}">${esc(ccBadge(s))}</span></div><p>${(s.services || [])
    .slice(0, 4)
    .map((x) => `<span class="chip" data-i18n="dom">${esc(x)}</span>`)
    .join("")}</p><div class="supplier-meta">${dirk("meta", {
    rating: Number(s.rating || 0).toFixed(1),
    projects: s.projectsCompleted || 0,
    years: s.experience || 0,
    rate: fmt.money(s.hourlyRate || 0),
  })}</div>${dirReliability(s)}<div class="dir-picks"><label class="cc-check-label"><input type="checkbox" class="dir-compare" value="${esc(s.id)}"${picked ? " checked" : ""} data-action="dir.compare"> ${dirk("pick.compare")}</label>${
    customer
      ? `<button type="button" class="btn small outline dir-star" aria-pressed="${starred}" data-action="dir.star" data-id="${esc(s.id)}">${dirk(starred ? "pick.starOn" : "pick.starOff")}</button>`
      : ""
  }</div><div class="cc-actions"><a class="btn small outline" href="${href}">${dirk("viewProfile")}</a>${customer ? `<a class="btn small primary" href="${href}">${dirk("requestQuote")}</a>` : ""}</div></article>`;
}
function dirListing(rows, view, customer, shortlist) {
  const cards = rows.map((s) => dirCard(s, customer, shortlist)).join("");
  if (view === "map")
    return `<div class="cc-map-layout"><div id="ccRealMap" role="img" aria-label="${dirk("map.label")}"></div><div class="cc-map-list">${cards || `<div class="empty">${dirk("noMatch")}</div>`}</div></div>`;
  if (view === "list") return `<div class="review-supplier-list">${cards}</div>`;
  return `<div class="supplier-grid">${cards || `<div class="empty">${dirk("noneFilters")}</div>`}</div>`;
}
async function dirMap(rows) {
  if (!window.L)
    await new Promise((resolve) => {
      const css = document.createElement("link");
      css.rel = "stylesheet";
      css.href = "vendor/leaflet/leaflet.css";
      document.head.appendChild(css);
      const s = document.createElement("script");
      s.src = "vendor/leaflet/leaflet.js";
      s.onload = resolve;
      s.onerror = resolve;
      document.head.appendChild(s);
    });
  const el = document.getElementById("ccRealMap");
  if (!el) return;
  if (!window.L) {
    el.innerHTML = `<div class="notice">${dirk("map.failed")}</div>`;
    return;
  }
  const map = L.map(el).setView([50.5, 10.5], 4);
  L.tileLayer("https://tile.openstreetmap.org/{z}/{x}/{y}.png", { maxZoom: 18, attribution: "&copy; OpenStreetMap contributors" }).addTo(map);
  const pts = rows.map((s) => {
    const point = reviewGeo(s.location);
    L.marker(point)
      .addTo(map)
      .bindPopup(`<b>${esc(s.company)}</b><br>${esc(s.location)}<br><a href="#${dirBase()}/${encodeURIComponent(s.id)}">${dirk("map.open")}</a>`);
    return point;
  });
  if (pts.length > 1) map.fitBounds(pts, { padding: [24, 24] });
  else if (pts.length) map.setView(pts[0], 8);
}
// Going to the same address again (search without changes) still draws the page again
function dirGo(path) {
  if (location.hash === "#" + path) route();
  else navigate(path);
}
actions.on("dir.search", (form) => {
  const val = (id) => form.querySelector("#" + id)?.value || "",
    q = new URLSearchParams({
      q: val("ccSq"),
      service: val("ccSs"),
      badge: val("ccSb"),
      available: form.querySelector("#ccSa").checked ? "1" : "0",
      country: val("ccCountry"),
      rating: val("ccRating"),
      maxRate: val("ccRate"),
      experience: val("ccExperience"),
      certs: [...form.querySelectorAll('input[name="ccCerts"]:checked')].map((x) => x.value).join(","),
      near: val("ccNear").trim(),
      radius: val("ccRadius") || "100",
      shortlist: form.querySelector("#ccShortlistOnly")?.checked ? "1" : "",
      sort: val("ccSort") || "relevance",
      view: new URLSearchParams(location.hash.split("?")[1] || "").get("view") || "grid",
    });
  dirGo(`${dirBase()}?${q}`);
});
actions.on("dir.view", (el) => {
  const q = new URLSearchParams(location.hash.split("?")[1] || "");
  q.set("view", el.dataset.view);
  dirGo(`${dirBase()}?${q}`);
});

/* ---------- Compare bar, shortlist ---------- */
function dirBarInner() {
  const n = dirSelected().length,
    customer = state.user?.role === "customer";
  return `<span><b>${n}</b> <span>${dirk("pick.selected")}</span></span><div class="cc-actions"><button type="button" class="btn small primary" data-action="dir.compareOpen"${n < 2 ? " disabled" : ""}>${dirk("pick.compareBtn")}</button>${
    customer ? `<button type="button" class="btn small success" data-action="dir.requestQuotes"${n ? "" : " disabled"}>${dirk("pick.request")}</button>` : ""
  }<button type="button" class="btn small outline" data-action="dir.clear">${dirk("pick.clear")}</button></div>`;
}
function dirBarHtml() {
  return `<div class="dir-bar" id="dirBar" role="region" aria-label="${dirk("pick.barLabel")}"${dirSelected().length ? "" : " hidden"}>${dirBarInner()}</div>`;
}
function dirUpdateBar() {
  const bar = document.getElementById("dirBar");
  if (!bar) return;
  bar.innerHTML = dirBarInner();
  bar.hidden = !dirSelected().length;
}
function dirClear() {
  dirSetSelected([]);
  document.querySelectorAll(".dir-compare").forEach((x) => (x.checked = false));
  dirUpdateBar();
}
actions.on("dir.compare", (input) => {
  const ids = dirSelected().filter((x) => x !== input.value);
  if (input.checked) {
    if (ids.length >= DIR_MAX) {
      input.checked = false;
      return tToast(t("dir.pick.max"));
    }
    ids.push(input.value);
  }
  dirSetSelected(ids);
  dirUpdateBar();
});
actions.on("dir.clear", dirClear);
actions.on("dir.star", async (btn) => {
  const id = btn.dataset.id,
    on = !dirShortlist.includes(id),
    next = on ? [...dirShortlist, id] : dirShortlist.filter((x) => x !== id);
  try {
    dirShortlist = (await api("/shortlist", { method: "PUT", body: { supplierIds: next } })).supplierIds;
    btn.setAttribute("aria-pressed", String(on));
    btn.textContent = t(on ? "dir.pick.starOn" : "dir.pick.starOff");
    tToast(t(on ? "dir.pick.added" : "dir.pick.removed"));
  } catch (e) {
    toast(e.message);
  }
});
actions.on("dir.compareOpen", async () => {
  const list = await dirSuppliers(dirSelected());
  if (list.length < 2) return tToast(t("dir.pick.min"));
  const lead = (s) => [...new Set((s.serviceCatalog || []).map((x) => x.leadTime).filter(Boolean))].join(", ");
  const rows = [
    ["location", (s) => (s.location ? dirDom(s.location) : "—")],
    ["badge", (s) => esc(ccBadge(s))],
    ["services", (s) => ((s.services || []).length ? dirDom(s.services.join(", ")) : "—")],
    ["certifications", (s) => ((s.certifications || []).length ? dirDom(s.certifications.join(", ")) : "—")],
    ["hourly", (s) => dirk("cmp.perHour", { rate: fmt.money(s.hourlyRate || 0) })],
    ["projectsFrom", (s) => esc(fmt.money(s.projectRate || 0))],
    ["rating", (s) => `★ ${Number(s.rating || 0).toFixed(1)}`],
    ["reliability", (s) => dirReliability(s)],
    ["team", (s) => esc(String(Number(s.employees) || "—"))],
    ["lead", (s) => (lead(s) ? dirDom(lead(s)) : dirk("cmp.onRequest"))],
    ["availability", (s) => (s.availability ? dirDom(s.availability) : dirk("cmp.onRequest"))],
  ];
  modal(
    t("dir.cmp.title"),
    `<div data-i18n="keys"><div class="cc-table-wrap"><table class="cc-table dir-compare-table"><thead><tr><th scope="col"><span class="sr-only">${dirk("cmp.detail")}</span></th>${list
      .map((s) => `<th scope="col">${esc(s.company)}</th>`)
      .join("")}</tr></thead><tbody>${rows
      .map(([key, cell]) => `<tr><th scope="row">${dirk("cmp." + key)}</th>${list.map((s) => `<td>${cell(s)}</td>`).join("")}</tr>`)
      .join("")}</tbody></table></div><div class="cc-actions">${
      state.user?.role === "customer" ? `<button type="button" class="btn primary" data-action="dir.requestQuotes">${dirk("cmp.request")}</button>` : ""
    }<button type="button" class="btn outline" data-action="dir.closeModal">${dirk("cmp.close")}</button></div></div>`,
  );
});
actions.on("dir.closeModal", () => closeModal());

/* ---------- One quote request to several suppliers (POST /api/bids with invitedSupplierIds) ---------- */
let dirQuote = null; // { list, open } of the open request dialog
actions.on("dir.requestQuotes", async () => {
  const [list, projects] = await Promise.all([dirSuppliers(dirSelected()), ccProjects()]);
  if (!list.length) return tToast(t("dir.rq.selectFirst"));
  const open = projects.filter((p) => !["Archived", "Completed"].includes(p.status));
  if (!open.length) return tToast(t("dir.rq.createFirst"));
  dirQuote = { list, open };
  const services = [...new Set(list.flatMap((s) => s.services || []))],
    today = new Date().toISOString().slice(0, 10),
    due = new Date(Date.now() + 14 * 86400000).toISOString().slice(0, 10),
    r = (key, params) => dirk("rq." + key, params);
  modal(
    t("dir.rq.title"),
    `<form id="dirQuoteForm" class="modal-form" data-i18n="keys" data-action="dir.quoteSend"><p>${tHtml("dir.rq.to", { names: `<b>${list.map((s) => esc(s.company)).join(", ")}</b>` })}</p><div class="two"><label>${r("project")}<select name="project" id="dirProject" data-action="dir.quoteProject">${open
      .map((p) => `<option value="${esc(p.id)}">${esc(p.name)}</option>`)
      .join("")}</select></label><label>${r("task")}<select name="task" id="dirTask" data-action="dir.quoteTask"></select></label></div><div class="two" id="dirNewTask" hidden><label>${r("phase")}<select name="phase" id="dirPhase"></select></label><label>${r("taskName")}<input name="taskName" maxlength="160"></label></div><div class="two"><label>${r("service")}<input name="service" list="dirServices" required maxlength="80" value="${esc(services[0] || "")}"><datalist id="dirServices">${services
      .map((x) => `<option value="${esc(x)}"></option>`)
      .join("")}</datalist></label><label>${r("due")}<input name="dueDate" type="date" required min="${today}" value="${due}"></label></div><label>${r("description")}<textarea name="description" rows="4" maxlength="5000" required placeholder="${r("descriptionHint")}"></textarea></label><label>${r("files")}<input name="files" type="file" multiple accept=".pdf,.png,.jpg,.jpeg,.docx,.xlsx,.csv,.txt,.zip"></label><div id="dirQuoteError" class="form-error" role="alert"></div><button class="btn primary">${r("send", { n: list.length })}</button></form>`,
  );
  dirFillTasks();
});
function dirFillTasks() {
  const p = dirQuote?.open.find((x) => x.id === document.getElementById("dirProject")?.value),
    taskSel = document.getElementById("dirTask");
  if (!taskSel) return;
  const tasks = (p?.phases || []).flatMap((ph) =>
    (ph.tasks || []).filter((x) => x.status !== "Completed").map((x) => ({ value: `${ph.id}|${x.id}`, label: `${ph.name} — ${x.name}` })),
  );
  taskSel.innerHTML =
    tasks.map((x) => `<option value="${esc(x.value)}">${esc(x.label)}</option>`).join("") + `<option value="new">${dirk("rq.newTask")}</option>`;
  document.getElementById("dirPhase").innerHTML = (p?.phases || []).map((ph) => `<option value="${esc(ph.id)}">${esc(ph.name)}</option>`).join("");
  document.getElementById("dirNewTask").hidden = taskSel.value !== "new";
}
actions.on("dir.quoteProject", dirFillTasks);
actions.on("dir.quoteTask", (sel) => (document.getElementById("dirNewTask").hidden = sel.value !== "new"));
actions.on("dir.quoteSend", async (form) => {
  const f = new FormData(form),
    error = document.getElementById("dirQuoteError"),
    button = form.querySelector("button.primary"),
    files = [...form.files.files],
    list = dirQuote.list;
  if (files.length > 5) return (error.textContent = t("dir.rq.maxFiles"));
  button.disabled = true;
  try {
    const projectId = f.get("project");
    let [phaseId, taskId] = String(f.get("task")).split("|");
    if (f.get("task") === "new") {
      const name = String(f.get("taskName") || "").trim();
      if (!name) throw new Error(t("dir.rq.nameMissing"));
      phaseId = f.get("phase");
      taskId = (
        await api(`/projects/${projectId}/phases/${phaseId}/tasks`, {
          method: "POST",
          body: { name, dueDate: f.get("dueDate"), description: f.get("description") },
        })
      ).task.id;
    }
    const attachments = [];
    for (const file of files) attachments.push((await uploadFile(file)).url);
    await api("/bids", {
      method: "POST",
      body: {
        projectId,
        phaseId,
        taskId,
        // The request title is stored data, the same in every language
        title: `${f.get("service")} — quote request`,
        category: f.get("service"),
        description: f.get("description"),
        dueDate: f.get("dueDate"),
        invitedSupplierIds: list.map((s) => s.id),
        attachments,
      },
    });
    closeModal();
    dirClear();
    tToast(t("dir.rq.sent", { n: list.length }));
    navigate("/customer/offers");
  } catch (x) {
    error.textContent = x.message;
    button.disabled = false;
  }
});

/* ---------- Supplier profile ---------- */
async function dirProfile(params) {
  const id = params.id,
    customer = state.user?.role === "customer",
    { supplier: s } = await api("/suppliers/" + encodeURIComponent(id)),
    [docs, card] = await Promise.all([
      state.user ? api(`/suppliers/${encodeURIComponent(id)}/documents`).catch(() => null) : null,
      customer ? api(`/suppliers/${encodeURIComponent(id)}/scorecard`).catch(() => ({})) : {},
      customer ? pvLoad().catch(() => {}) : null,
    ]),
    p = (key, params) => dirk("p." + key, params),
    catalog = s.serviceCatalog || [],
    certs = s.certifications || [],
    ask = (kind, name, label, cls = "btn small primary") =>
      `<button class="${cls}" data-action="dir.ask" data-kind="${kind}" data-supplier="${esc(s.id)}" data-name="${esc(name)}">${label}</button>`;
  const serviceRows = catalog.length
    ? catalog
        .map(
          (x) =>
            `<tr><td><b>${esc(x.name)}</b><small>${x.category ? dirDom(x.category) : p("service")}</small></td><td>${x.description ? dirDom(x.description) : p("scope")}</td><td>${tHtml("dir.p.rate", { rate: esc(fmt.money(x.rate || 0)), unit: DIR_UNITS.includes(x.unit || "hour") ? dirk("p.units." + (x.unit || "hour")) : dirDom(x.unit) })}</td><td>${x.capacity ? dirDom(x.capacity) : p("capacity")}<small>${x.leadTime ? dirDom(x.leadTime) : p("lead")}</small></td><td>${customer ? ask("service", x.name, p("requestService")) : ""}</td></tr>`,
        )
        .join("")
    : `<tr><td colspan="5"><div class="notice">${p("noServices")}</div>${customer ? ask("service", "", p("contact")) : ""}</td></tr>`;
  const onList = customer && pvData.suppliers.some((x) => x.supplierId === id),
    preferred = customer
      ? `<div class="pv-profile">${
          onList
            ? `<span class="status completed">${p("onList")}</span><button class="btn small outline" data-action="pv.edit" data-supplier="${esc(id)}">${p("editNote")}</button>`
            : `<button class="btn small primary" data-action="pv.add" data-supplier="${esc(id)}">${p("addPreferred")}</button>`
        }</div>`
      : "";
  const reliability = dirReliability(s, true),
    services = `<section class="panel"><div class="panel-title"><div><h2>${p("services")}</h2><small>${p("servicesIntro")}</small></div></div><div class="cc-table-wrap"><table class="cc-table"><thead><tr><th>${p("colService")}</th><th>${p("colScope")}</th><th>${p("colRate")}</th><th>${p("colCapacity")}</th><th></th></tr></thead><tbody>${serviceRows}</tbody></table></div></section>`,
    // Certificates follow the reliability panel, or the services when there is none
    documents = docs ? dirDocsPanel(docs, { supplierId: customer ? id : "" }) : "";
  const html = `<div class="cc-page"><a class="btn small outline review-back" href="#${dirBase()}">${p("back")}</a><div class="supplier-profile-head"><div class="supplier-avatar large">${esc(s.avatar || "CC")}</div><div><div class="eyebrow">${p("eyebrow")}</div><h1>${esc(s.company)}</h1><p>${s.location ? dirDom(s.location) : p("noLocation")} · ${s.availability ? dirDom(s.availability) : p("availability")}</p></div><span class="badge ${esc((s.badge || "none").toLowerCase())}">${esc(ccBadge(s))}</span>${preferred}</div><div class="health"><div class="cc-card"><span class="cc-label">${p("team")}</span><b>${p("teamValue", { n: Number(s.employees) || 0, people: (s.teamMembers || []).length })}</b></div><div class="cc-card"><span class="cc-label">${p("experience")}</span><b>${p("experienceValue", { years: Number(s.experience) || 0, projects: Number(s.projectsCompleted) || 0 })}</b></div><div class="cc-card"><span class="cc-label">${p("rates")}</span><b>${p("ratesValue", { hourly: fmt.money(s.hourlyRate || 0), project: fmt.money(s.projectRate || 0) })}</b></div></div>${
    reliability ? reliability + documents + services : services + documents
  }<div class="supplier-profile-grid"><section class="cc-card"><h2>${p("about")}</h2><p>${s.description ? dirDom(s.description) : p("aboutFallback")}</p><h3>${p("certs")}</h3><div>${
    certs.map((x) => `<span class="chip" data-i18n="dom">${esc(x)}</span>${customer ? " " + ask("evidence", x, p("requestProof"), "btn small outline") : ""}`).join("") ||
    `<p class="muted">${p("noCerts")}</p>`
  }</div>${customer ? `<button class="btn small outline dir-evidence" data-action="dir.ask" data-kind="evidence" data-supplier="${esc(s.id)}" data-name="">${p("requestEvidence")}</button>` : ""}</section><section class="cc-card"><h2>${p("delivery")}</h2>${
    (s.teamMembers || [])
      .map((m) => `<div class="team-row"><b>${esc(m.name)}</b><span>${dirDom(m.role || "")}</span><small>${dirDom(m.experience || "")} · ${dirDom(m.certifications || "")}</small></div>`)
      .join("") || `<p class="muted">${p("noTeam")}</p>`
  }<h3>${p("reviews")}</h3>${(s.reviews || []).map((r) => `<div class="notice">★ ${esc(r.rating)} — ${dirDom(r.text)}</div>`).join("") || `<p class="muted">${p("noReviews")}</p>`}</section></div>${
    card?.scorecard ? dirScorecard(card.scorecard) : ""
  }</div>`;
  app.innerHTML = customer ? dashboardShell("customer", "suppliers", dirKeys(html)) : publicLayout(dirKeys(html));
}

/* ---------- Request a service or evidence from one supplier (POST /api/rfqs) ---------- */
actions.on("dir.ask", async (el, event) => {
  event?.preventDefault();
  const evidence = el.dataset.kind === "evidence",
    projects = await reviewProjects(),
    a = (key) => dirk("ask." + key),
    tasks = projects.flatMap((p) => (p.phases || []).flatMap((ph) => (ph.tasks || []).map((x) => ({ p, ph, x }))));
  modal(
    t(evidence ? "dir.ask.evidenceTitle" : "dir.ask.serviceTitle"),
    `<form id="reviewSupplierRequest" class="modal-form" data-i18n="keys" data-action="dir.askSend" data-supplier="${esc(el.dataset.supplier)}" data-kind="${evidence ? "evidence" : "service"}"><p class="modal-intro">${a(evidence ? "evidenceIntro" : "serviceIntro")}</p><label>${a(evidence ? "evidence" : "service")}<input name="service" value="${esc(el.dataset.name || "")}" placeholder="${a(evidence ? "evidenceHint" : "serviceHint")}" required></label><label>${a("project")}<select id="reviewRequestProject" name="projectId"><option value="">${a("general")}</option>${projects
      .map((p) => `<option value="${esc(p.id)}">${esc(p.name)}</option>`)
      .join("")}</select></label><label>${a("task")}<select name="taskRef"><option value="">${a("noTask")}</option>${tasks
      .map(({ p, ph, x }) => `<option value="${esc(`${p.id}|${ph.id}|${x.id}`)}">${esc(p.name)} · ${esc(ph.name)} · ${esc(x.name)}</option>`)
      .join("")}</select></label><label>${a("details")}<textarea name="message" rows="4" maxlength="5000" required placeholder="${a("detailsHint")}"></textarea></label><div id="reviewSupplierRequestError" class="form-error" role="alert"></div><button class="btn primary">${a("send")}</button></form>`,
  );
});
actions.on("dir.askSend", async (form) => {
  const b = Object.fromEntries(new FormData(form)),
    [projectId, phaseId, taskId] = (b.taskRef || "").split("|"),
    evidence = form.dataset.kind === "evidence";
  delete b.taskRef;
  if (projectId) Object.assign(b, { projectId, phaseId, taskId });
  b.supplierId = form.dataset.supplier;
  // The kind is stored and shown to the supplier, so it is sent in English
  b.kind = evidence ? "Evidence request" : "Service request";
  try {
    await api("/rfqs", { method: "POST", body: b });
    closeModal();
    tToast(t(evidence ? "dir.ask.evidenceSent" : "dir.ask.serviceSent"));
  } catch (x) {
    document.getElementById("reviewSupplierRequestError").textContent = x.message;
  }
});

/* ---------- Certificates & proofs: on the profile, and managed by the supplier on the service catalog ---------- */
const DIR_DOC_STATE = { Valid: "completed", Expiring: "expiring", Expired: "expired" };
const DIR_DOC_CATEGORIES = ["Quality certificate", "Trade licence / registration", "Insurance", "Safety certificate", "Training & qualification", "Reference letter", "Other proof"];
const DIR_CHECKS = ["registration", "vat", "insurance", "certifications", "references", "sanctions"];
function dirDocRow(d, manage) {
  const c = (key, params) => dirk("dc." + key, params),
    state_ = d.expiresAt
      ? `<span class="status ${DIR_DOC_STATE[d.state] || ""}">${c(d.state === "Valid" ? "validUntil" : d.state === "Expiring" ? "expires" : "expired", { date: fmt.date(d.expiresAt) })}</span>`
      : `<span class="status completed">${c("noExpiry")}</span>`,
    open = d.url
      ? `<a class="btn small outline" href="${esc(d.url)}" target="_blank" rel="noopener">${c("open")}</a>`
      : `<span class="dc-locked" title="${c("onRequestTitle")}">${c("onRequest")}</span>`,
    own = manage && d.source === "profile",
    tools = own
      ? `<button class="btn small outline" data-action="dc.visibility" data-id="${esc(d.id)}" data-to="${d.visibility === "public" ? "partners" : "public"}">${c(d.visibility === "public" ? "makePartner" : "makePublic")}</button><button class="btn small outline danger-text" data-action="dc.delete" data-id="${esc(d.id)}">${c("delete")}</button>`
      : "";
  const where = own ? ` · ${c(d.visibility === "public" ? "visPublic" : "visPartners")}` : manage && d.source === "compliance" ? ` · ${c("compliance")}` : "";
  return `<div class="dc-row"><span class="dc-icon" aria-hidden="true">${uiIcon(d.source === "compliance" ? "vetting" : "file")}</span><div class="dc-main"><b>${dirDom(d.title)}</b><small>${dirDom(d.category)}${d.issuer ? " · " + esc(d.issuer) : ""}${where}</small></div><div class="dc-side">${state_}<div class="cc-actions">${open}${tools}</div></div></div>`;
}
function dirVetting(v, own) {
  if (!v) return "";
  const c = (key, params) => dirk("dc." + key, params),
    ok = (s) => /pass|verified|ok|valid|clear/i.test(s),
    checks = Object.entries(v.checks || {}).filter(([k]) => DIR_CHECKS.includes(k)),
    status =
      v.status === "Approved"
        ? c("verified") + (v.badge && v.badge !== "None" ? " · " + c("badge", { badge: t("common.badge." + v.badge) }) : "")
        : dirDom(v.status);
  const files =
    own && v.files.length
      ? `<details class="dc-files"><summary>${c("ownFiles", { n: v.files.length })}</summary>${v.files
          .map(
            (f) =>
              `<div class="dc-row"><span class="dc-icon">${uiIcon("paperclip")}</span><div class="dc-main"><b>${esc(f.filename)}</b><small>${dirDom(f.category)} · ${esc(fmt.date(f.uploadedAt))}</small></div><div class="dc-side"><a class="btn small outline" href="${esc(f.url)}" target="_blank" rel="noopener">${c("open")}</a></div></div>`,
          )
          .join("")}</details>`
      : !own && v.fileCount
        ? `<small class="subtle">${c("reviewedFiles", { n: v.fileCount })}</small>`
        : "";
  return `<div class="dc-vetting"><div><b>${c("vetting")}</b><small>${status}${v.decidedAt ? " · " + esc(fmt.date(v.decidedAt)) : ""}</small></div><div class="dc-checks">${checks
    .map(([k, s]) => `<span class="dc-check ${ok(s) ? "ok" : ""}">${ok(s) ? "✓" : "·"} ${c("checks." + k)}</span>`)
    .join("")}</div>
    ${files}</div>`;
}
function dirDocsPanel(d, { manage = false, supplierId = "" } = {}) {
  const c = (key, params) => dirk("dc." + key, params),
    q = d.qualifications || {},
    link = `<a href="#" data-action="dir.ask" data-kind="evidence" data-supplier="${esc(supplierId)}" data-name="">${c("askLink")}</a>`;
  return `<section class="panel dc-panel" id="dcPanel" data-i18n="keys"><div class="panel-title"><h3>${c("title")}</h3>${
    manage ? `<button class="btn small primary" data-action="dc.upload">${c("add")}</button>` : `<span class="ui-count">${d.documents.length}</span>`
  }</div>
    ${dirVetting(d.vetting, manage)}
    ${d.documents.length ? `<div class="dc-list">${d.documents.map((x) => dirDocRow(x, manage)).join("")}</div>` : `<p class="pa-empty">${c(manage ? "emptyOwn" : "empty")}</p>`}
    ${q.workers ? `<p class="subtle dc-foot">${c("workers", { n: q.workers, docs: q.documents })}${q.expired ? " · " + c("expiredCount", { n: q.expired }) : ""}.</p>` : ""}
    ${!manage && !d.worksWith && d.documents.some((x) => x.locked) ? `<p class="subtle dc-foot">${supplierId ? tHtml("dir.dc.lockedAsk", { link }) : c("locked")}</p>` : ""}</section>`;
}
// The supplier's own panel on the service catalog page (the documents-ui route hook calls this)
async function dcRefreshOwn() {
  const d = await api("/supplier-documents"),
    html = dirDocsPanel(d, { manage: true }),
    cur = document.getElementById("dcPanel");
  if (cur) cur.outerHTML = html;
  else document.querySelector(".dashboard-content")?.insertAdjacentHTML("beforeend", html);
}
actions.on("dc.upload", async () => {
  const { categories } = await api("/supplier-documents"),
    c = (key) => dirk("dc." + key),
    optional = ` <small class="subtle">${c("optional")}</small>`;
  modal(
    t("dir.dc.uploadTitle"),
    `<form id="dcForm" class="modal-form" data-i18n="keys" data-action="dc.save"><label>${c("docTitle")}<input name="title" required placeholder="${c("docTitleHint")}"></label><div class="two"><label>${c("category")}<select name="category">${categories
      .map((x) => `<option value="${esc(x)}">${esc(DIR_DOC_CATEGORIES.includes(x) ? t("dir.dc.categories." + x) : x)}</option>`)
      .join("")}</select></label><label>${c("issuer")}${optional}<input name="issuer" placeholder="${c("issuerHint")}"></label></div>
    <div class="two"><label>${c("issued")}${optional}<input name="issuedAt" type="date"></label><label>${c("until")}${optional}<input name="expiresAt" type="date"></label></div>
    <label>${c("who")}<select name="visibility"><option value="public">${c("whoPublic")}</option><option value="partners">${c("whoPartners")}</option></select></label>
    <label>${c("file")}<input name="file" type="file" accept=".pdf,.png,.jpg,.jpeg" required></label><div id="dcError" class="form-error"></div><button class="btn primary">${c("save")}</button></form>`,
  );
});
actions.on("dc.save", async (form) => {
  const f = new FormData(form),
    file = f.get("file");
  try {
    const up = await uploadFile(file);
    await api("/supplier-documents", {
      method: "POST",
      body: {
        title: f.get("title"),
        category: f.get("category"),
        issuer: f.get("issuer"),
        issuedAt: f.get("issuedAt"),
        expiresAt: f.get("expiresAt"),
        visibility: f.get("visibility"),
        url: up.url,
        filename: file.name,
      },
    });
    closeModal();
    tToast(t("dir.dc.added"));
    dcRefreshOwn();
  } catch (x) {
    document.getElementById("dcError").textContent = x.message;
  }
});
actions.on("dc.visibility", async (el) => {
  const visibility = el.dataset.to;
  try {
    await api("/supplier-documents/" + encodeURIComponent(el.dataset.id), { method: "PATCH", body: { visibility } });
    tToast(t(visibility === "public" ? "dir.dc.nowPublic" : "dir.dc.nowPartner"));
    dcRefreshOwn();
  } catch (x) {
    toast(x.message, "error");
  }
});
actions.on("dc.delete", async (el) => {
  if (!(await uiConfirm(t("dir.dc.confirmDelete"), { confirmLabel: t("dir.dc.delete") }))) return;
  try {
    await api("/supplier-documents/" + encodeURIComponent(el.dataset.id), { method: "DELETE" });
    tToast(t("dir.dc.deleted"));
    dcRefreshOwn();
  } catch (x) {
    toast(x.message, "error");
  }
});

/* ---------- Scorecard: on the profile for customers, and on the supplier's analytics page ---------- */
function dirScorecard(c) {
  const m = c.metrics,
    s = (key) => dirk("sc." + key),
    stat = (key, v, suffix = "") => `<div><span class="cc-label">${s(key)}</span><b>${v === null || v === undefined ? "—" : esc(v) + suffix}</b></div>`;
  return `<section class="panel sr-card-panel" data-i18n="keys"><div class="panel-title"><h3>${s("title")}</h3><span class="sr-risk ${esc(String(c.riskLevel).toLowerCase())}">${
    ["Low", "Medium", "High"].includes(c.riskLevel) ? s("risk." + c.riskLevel) : dirDom(c.riskLevel)
  }</span></div><div class="sr-card-top"><div class="sr-big-score" style="--s:${Number(c.score) || 0}"><b>${c.score ?? "—"}</b><small>${s("of100")}</small></div><div class="sr-card-stats">${stat(
    "rating",
    m.rating ? "★ " + Number(m.rating).toFixed(1) : null,
  )}${stat("quality", m.quality)}${stat("schedule", m.schedule)}${stat("communication", m.communication)}${stat("onTime", m.onTimeRate, "%")}${stat("firstTime", m.firstTimeRightRate, "%")}${stat(
    "response",
    m.responseRate,
    "%",
  )}${stat("win", m.winRate, "%")}</div></div>${
    c.risks.length ? `<ul class="sr-risks">${c.risks.map((r) => `<li class="${esc(r.level)}">${dirDom(r.text)}</li>`).join("")}</ul>` : `<p class="success-text">${s("noRisks")}</p>`
  }</section>`;
}
async function srScorecardPanel(supplierId, target) {
  if (!target || target.querySelector(".sr-card-panel")) return;
  const { scorecard } = await api(`/suppliers/${supplierId}/scorecard`).catch(() => ({}));
  if (scorecard) target.insertAdjacentHTML("beforeend", dirScorecard(scorecard));
}

/* ---------- Preferred suppliers (T68) ---------- */
async function pvPage() {
  await pvLoad();
  const v = (key, params) => dirk("pv." + key, params);
  const cards = pvData.suppliers
    .map(
      (s) =>
        `<article class="cc-card pv-card"><div class="pv-head"><div><h3><a href="#/customer/suppliers/${esc(s.supplierId)}">${esc(s.company)}</a></h3><small>${dirDom(s.location || "")}${
          s.badge ? ` · ${["Gold", "Silver", "Bronze"].includes(s.badge) ? esc(t("common.badge." + s.badge)) : dirDom(s.badge)}` : ""
        }</small></div>${s.invited ? `<span class="tag">${v("invited")}</span>` : ""}</div><div class="pv-tags">${(s.tags || []).map((x) => `<span class="chip">${esc(x)}</span>`).join("")}</div>${
          s.note ? `<p class="pv-note">${esc(s.note)}</p>` : `<p class="subtle">${v("noNote")}</p>`
        }<div class="cc-actions"><button class="btn small outline" data-action="pv.edit" data-supplier="${esc(s.supplierId)}">${v("edit")}</button><button class="btn small outline" data-action="pv.remove" data-supplier="${esc(s.supplierId)}">${v("remove")}</button></div></article>`,
    )
    .join("");
  const invites = pvData.invites
    .map(
      (i) =>
        `<tr><td><b>${esc(i.company)}</b><small>${esc(i.email)}</small></td><td><span class="status ${i.status === "Joined" ? "completed" : "submitted"}">${v(i.status === "Joined" ? "joined" : "pending")}</span></td><td>${esc(fmt.date(i.createdAt))}</td></tr>`,
    )
    .join("");
  app.innerHTML = dashboardShell(
    "customer",
    "preferred",
    [
      `<div class="dash-top"><div><h1>${v("title")}</h1><p>${v("intro")}</p></div><a class="btn outline" href="#/customer/suppliers">${v("find")}</a></div>`,
      `<div class="pv-grid">${cards || `<div class="empty">${v("empty")}</div>`}</div>`,
      `<section class="panel"><div class="panel-title"><h2>${v("inviteTitle")}</h2></div><form id="pvInvite" class="modal-form" data-action="pv.invite"><div class="two"><label>${v("company")}<input name="company" required maxlength="160"></label><label>${v("email")}<input name="email" type="email" required maxlength="200"></label></div><div class="two"><label>${v("tags")}<input name="tags" maxlength="200" placeholder="${v("tagsHint")}"></label><label>${v("note")}<input name="note" maxlength="2000"></label></div><div id="pvError" class="form-error" role="alert"></div><button class="btn primary">${v("send")}</button></form>${
        invites
          ? `<div class="cc-table-wrap"><table class="cc-table"><thead><tr><th>${v("colSupplier")}</th><th>${v("colStatus")}</th><th>${v("colInvited")}</th></tr></thead><tbody>${invites}</tbody></table></div>`
          : ""
      }</section>`,
    ]
      .map(dirKeys)
      .join("\n    "),
  );
}
actions.on("pv.invite", async (form) => {
  try {
    await api("/preferred-suppliers/invite", { method: "POST", body: Object.fromEntries(new FormData(form)) });
    tToast(t("dir.pv.sent"));
    await pvPage();
  } catch (x) {
    document.getElementById("pvError").textContent = x.message;
  }
});
function pvEdit(supplierId) {
  const s = pvData.suppliers.find((x) => x.supplierId === supplierId) || { tags: [], note: "" };
  modal(
    t("dir.pv.edit"),
    `<form id="pvEditForm" class="modal-form" data-i18n="keys" data-action="pv.save" data-supplier="${esc(supplierId)}"><label>${dirk("pv.tags")}<input name="tags" maxlength="400" value="${esc((s.tags || []).join(", "))}"></label><label>${dirk("pv.note")}<textarea name="note" rows="4" maxlength="2000">${esc(s.note || "")}</textarea></label><div id="pvEditError" class="form-error" role="alert"></div><button class="btn primary">${dirk("pv.save")}</button></form>`,
  );
}
actions.on("pv.edit", (el) => pvEdit(el.dataset.supplier));
actions.on("pv.save", async (form) => {
  const f = new FormData(form);
  try {
    await api(`/preferred-suppliers/${encodeURIComponent(form.dataset.supplier)}`, { method: "PUT", body: { tags: f.get("tags"), note: f.get("note") } });
    closeModal();
    tToast(t("dir.pv.saved"));
    await route();
  } catch (x) {
    document.getElementById("pvEditError").textContent = x.message;
  }
});
actions.on("pv.remove", async (el) => {
  if (!(await uiConfirm(t("dir.pv.confirmRemove")))) return;
  await api(`/preferred-suppliers/${encodeURIComponent(el.dataset.supplier)}`, { method: "DELETE" });
  tToast(t("dir.pv.removed"));
  await pvPage();
});
actions.on("pv.add", async (el) => {
  const id = el.dataset.supplier;
  try {
    await api(`/preferred-suppliers/${encodeURIComponent(id)}`, { method: "PUT", body: {} });
    await pvLoad();
    tToast(t("dir.pv.added"));
    pvEdit(id);
  } catch (x) {
    toast(x.message);
  }
});

/* ---------- Supplier: quote requests and evidence requests ---------- */
let dirRfqs = [];
let dirRfqFilters = { q: "", status: "All", sort: "newest" };
const DIR_RFQ_STATUSES = ["All", "New", "Reviewing", "Quoted", "Declined"];
async function dirRequests() {
  dirRfqs = (await api("/rfqs")).rfqs || [];
  const f = dirRfqFilters,
    r = (key, params) => dirk("req." + key, params),
    rows = dirRfqs
      .filter(
        (x) =>
          (f.status === "All" || x.status === f.status) &&
          (!f.q || `${x.service} ${x.customerCompany} ${x.projectName} ${x.taskName} ${x.message}`.toLowerCase().includes(f.q.toLowerCase())),
      )
      .sort((a, b) => (f.sort === "oldest" ? a.createdAt.localeCompare(b.createdAt) : b.createdAt.localeCompare(a.createdAt)));
  const card = (x) => {
    const kind = x.kind || "Service request",
      open = ["New", "Reviewing"].includes(x.status),
      chat = x.projectId
        ? `<a class="btn small outline" href="#/supplier/messages?project=${esc(x.projectId)}&phase=${esc(x.phaseId || "")}&task=${esc(x.taskId || "")}">${r("message")}</a>`
        : "",
      btn = (action, cls, label) => `<button class="btn small ${cls}" data-action="${action}" data-id="${esc(x.id)}">${r(label)}</button>`;
    return `<article class="panel review-work-card"><div class="project-card-head"><div><span class="eyebrow">${
      ["Service request", "Evidence request"].includes(kind) ? r("kinds." + kind) : dirDom(kind)
    }</span><h3>${esc(x.service)}</h3></div><span class="status ${x.status === "New" ? "submitted" : "active"}">${DIR_RFQ_STATUSES.includes(x.status) ? r("statuses." + x.status) : dirDom(x.status)}</span></div><p><b>${esc(
      x.customerCompany || x.customerName,
    )}</b> · ${x.projectName ? esc(x.projectName) : r("general")}</p>${
      x.taskName ? `<div class="notice">${tHtml("dir.req.linked", { phase: esc(x.phaseName), task: esc(x.taskName) })}</div>` : ""
    }<p>${esc(x.message)}</p>${x.response ? `<div class="notice">${tHtml("dir.req.response", { text: dirDom(x.response) })}</div>` : ""}<small>${esc(fmt.date(x.createdAt))}</small>${
      open
        ? `<div class="cc-actions">${btn("rq.reviewing", "outline", "markReviewing")}${btn("rq.quote", "success", "quote")}${btn("rq.decline", "danger", "decline")}${chat}</div>`
        : ""
    }</article>`;
  };
  app.innerHTML = dashboardShell(
    "supplier",
    "requests",
    [
      `<div class="dash-top"><div><h1>${r("title")}</h1><p>${r("intro")}</p></div><a class="btn outline" href="#/supplier/suppliers">${r("catalog")}</a></div>`,
      `<section class="panel cc-request-filters"><label>${r("search")}<input id="ccRfqQ" placeholder="${r("searchHint")}" value="${esc(f.q)}"></label><label>${r("status")}<select id="ccRfqStatus">${DIR_RFQ_STATUSES.map(
        (x) => `<option value="${x}"${f.status === x ? " selected" : ""}>${r("statuses." + x)}</option>`,
      ).join("")}</select></label><label>${r("sort")}<select id="ccRfqSort"><option value="newest"${f.sort === "newest" ? " selected" : ""}>${r("newest")}</option><option value="oldest"${
        f.sort === "oldest" ? " selected" : ""
      }>${r("oldest")}</option></select></label><button class="btn primary" data-action="rq.apply">${r("apply")}</button><button class="btn outline" data-action="rq.reset">${r("reset")}</button></section>`,
      `<div class="review-work-grid">${rows.map(card).join("") || `<div class="empty">${r("empty")}</div>`}</div>`,
    ]
      .map(dirKeys)
      .join(""),
  );
}
actions.on("rq.apply", () => {
  dirRfqFilters = {
    q: document.getElementById("ccRfqQ").value,
    status: document.getElementById("ccRfqStatus").value,
    sort: document.getElementById("ccRfqSort").value,
  };
  return dirRequests();
});
actions.on("rq.reset", () => {
  dirRfqFilters = { q: "", status: "All", sort: "newest" };
  return dirRequests();
});
// "Mark reviewing" only changes the status; the response so far stays
actions.on("rq.reviewing", async (el) => {
  const x = dirRfqs.find((r) => r.id === el.dataset.id);
  try {
    await api("/rfqs/" + encodeURIComponent(el.dataset.id), { method: "PATCH", body: { status: "Reviewing", response: x?.response || "" } });
    tToast(t("dir.req.reviewing"));
    await dirRequests();
  } catch (e) {
    toast(e.message, "error");
  }
});
actions.on("rq.decline", async (el) => {
  if (!(await uiConfirm(t("dir.req.confirmDecline")))) return;
  try {
    // The response is stored and shown to the customer as it is
    await api("/rfqs/" + encodeURIComponent(el.dataset.id), {
      method: "PATCH",
      body: { status: "Declined", response: "We are unable to take on this request at this time." },
    });
    await dirRequests();
  } catch (e) {
    toast(e.message, "error");
  }
});
function dirQuoteItem(x = {}) {
  const q = (key) => dirk("req.q." + key);
  return `<div class="ff-quote-item"><label>${q("position")}<input name="itemName" value="${esc(x.name || "")}" placeholder="${q("positionHint")}" required></label><label>${q("qty")}<input name="itemQty" type="number" min="0.01" step="0.01" value="${
    Number(x.quantity) || 1
  }" required></label><label>${q("unit")}<input name="itemUnit" value="${esc(x.unit || "item")}" required></label><label>${q("price")}<input name="itemPrice" type="number" min="0" step="0.01" value="${
    Number(x.unitPrice) || ""
  }" required></label><button class="btn small danger" type="button" data-action="rq.removeItem">${q("remove")}</button></div>`;
}
function dirQuoteTotal() {
  const form = document.getElementById("ffRfqForm"),
    el = document.getElementById("ffQuoteTotal");
  if (!form || !el) return;
  el.textContent = fmt.money(
    [...form.querySelectorAll(".ff-quote-item")].reduce(
      (sum, row) => sum + (Number(row.querySelector("[name=itemQty]").value) || 0) * (Number(row.querySelector("[name=itemPrice]").value) || 0),
      0,
    ),
  );
}
// Structured supplier quote with editable positions and attachments
actions.on("rq.quote", async (el) => {
  const id = el.dataset.id,
    x = (await api("/rfqs")).rfqs.find((r) => r.id === id);
  if (!x) return;
  const q = (key) => dirk("req.q." + key),
    items = x.quoteItems || [];
  modal(
    t("dir.req.q.title"),
    `<form id="ffRfqForm" class="modal-form ff-rfq-form" data-i18n="keys" data-action="rq.send" data-input="rq.total" data-id="${esc(id)}"><div class="ff-rfq-context"><span class="feature-icon">↗</span><span><b>${esc(x.service)}</b><small>${esc(x.customerCompany)} · ${
      x.projectName ? esc(x.projectName) : dirk("req.general")
    }${x.taskName ? " · " + esc(x.taskName) : ""}</small></span></div><label>${q("response")}<textarea name="response" rows="3" maxlength="5000" required placeholder="${q("responseHint")}">${esc(x.response || "")}</textarea></label><div class="ff-quote-head"><div><h3>${q(
      "positions",
    )}</h3><p>${q("positionsIntro")}</p></div><button type="button" class="btn small outline" data-action="rq.addItem">${q("add")}</button></div><div id="ffQuoteItems">${(items.length ? items : [{}, {}]).map(dirQuoteItem).join("")}</div><div class="two"><label>${q(
      "leadDays",
    )}<input name="leadDays" type="number" min="0" value="${Number(x.leadDays) || 14}" required></label><label>${q("validUntil")}<input name="validUntil" type="date" value="${esc(x.validUntil || "")}" required></label></div><label>${q(
      "files",
    )}<input name="quoteFiles" type="file" multiple accept=".pdf,.png,.jpg,.jpeg,.xlsx,.docx,.csv" data-action="rq.files"><small>${q("filesHint")}</small></label><div id="ffQuoteFileList" class="ff-file-list"></div><div class="ff-quote-total">${q(
      "total",
    )} <b id="ffQuoteTotal">${esc(fmt.money(0))}</b></div><div id="ffRfqError" class="form-error" role="alert"></div><button class="btn primary">${q("send")}</button></form>`,
  );
  dirQuoteTotal();
});
actions.on("rq.total", dirQuoteTotal);
actions.on("rq.addItem", () => document.getElementById("ffQuoteItems")?.insertAdjacentHTML("beforeend", dirQuoteItem()));
actions.on("rq.removeItem", (el) => {
  el.closest(".ff-quote-item").remove();
  dirQuoteTotal();
});
actions.on("rq.files", (input) => {
  document.getElementById("ffQuoteFileList").textContent = [...input.files]
    .map((f) => t("dir.req.q.file", { name: f.name, n: Math.ceil(f.size / 1024) }))
    .join(" · ");
});
actions.on("rq.send", async (form) => {
  const fd = new FormData(form),
    prices = fd.getAll("itemPrice"),
    qty = fd.getAll("itemQty"),
    unit = fd.getAll("itemUnit"),
    quoteItems = fd.getAll("itemName").map((name, i) => ({
      name,
      quantity: Number(qty[i]),
      unit: unit[i],
      unitPrice: Number(prices[i]),
      total: Number(qty[i]) * Number(prices[i]),
    }));
  if (!quoteItems.length || quoteItems.some((x) => !x.name || !Number.isFinite(x.total))) return tToast(t("dir.req.q.invalid"), "error");
  const files = [...form.querySelector("[name=quoteFiles]").files];
  if (files.length > 5) return tToast(t("dir.req.q.maxFiles"), "error");
  try {
    const attachments = await Promise.all(
      files.map(
        (file) =>
          new Promise((resolve, reject) => {
            const reader = new FileReader();
            reader.onload = async () => {
              try {
                resolve((await api("/upload", { method: "POST", body: { filename: file.name, content: reader.result } })).file);
              } catch (x) {
                reject(x);
              }
            };
            reader.onerror = reject;
            reader.readAsDataURL(file);
          }),
      ),
    );
    await api("/rfqs/" + encodeURIComponent(form.dataset.id), {
      method: "PATCH",
      body: {
        status: "Quoted",
        response: fd.get("response"),
        quoteItems,
        quoteTotal: quoteItems.reduce((n, x) => n + x.total, 0),
        leadDays: Number(fd.get("leadDays")),
        validUntil: fd.get("validUntil"),
        attachments,
      },
    });
    closeModal();
    tToast(t("dir.req.q.sent"));
    await dirRequests();
  } catch (x) {
    document.getElementById("ffRfqError").textContent = x.message;
  }
});

routes.add("/suppliers", dirPage);
routes.add("/customer/suppliers", dirPage);
routes.add("/suppliers/:id", dirProfile);
routes.add("/customer/suppliers/:id", dirProfile);
routes.add("/customer/preferred", () => pvPage());
routes.add("/supplier/requests", () => dirRequests());
