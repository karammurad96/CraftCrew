/* Area: service packages (T260–T262, Wave 17). Suppliers offer ready-made work at a fixed price; customers browse
   and book them; admins can pause a package. Titles, descriptions and categories are data; everything else is a
   translation key. */
const pkk = (key, params) => esc(t("pk." + key, params));
const PK_STATUS_CLASS = { Active: "completed", Draft: "submitted", Paused: "rejected", Archived: "rejected" };
const pkChip = (s) => `<span class="status ${PK_STATUS_CLASS[s] || "submitted"}">${statusHtml(s)}</span>`;
// The facts every package shows: team, days, earliest start, region
function pkFacts(p) {
  const row = (label, value) => (value ? `<div><dt>${pkk("field." + label)}</dt><dd>${value}</dd></div>` : "");
  return `<dl class="rq-facts pk-facts">${[
    row("category", `<bdi>${esc(p.category)}</bdi>`),
    row("team", pkk("teamN", { n: p.teamSize })),
    row("days", pkk("daysN", { n: p.days })),
    row("lead", p.earliestStart ? esc(fmt.date(p.earliestStart)) : pkk("leadN", { n: p.leadDays })),
    row(
      "area",
      p.regions?.length
        ? esc(pkk("regions", { list: p.regions.join(", ") }))
        : p.radiusKm
          ? pkk("radius", { n: p.radiusKm })
          : pkk("anywhere"),
    ),
    row("travel", pkk(p.travelIncluded ? "travelYes" : "travelNo")),
  ].join("")}</dl>`;
}
const pkIncluded = (p) =>
  (p.included || []).length
    ? `<ul class="ff-check-list pk-included">${p.included.map((i) => `<li><span aria-hidden="true">✓</span><bdi>${esc(i)}</bdi></li>`).join("")}</ul>`
    : "";

/* ---------- Supplier: my packages ---------- */
let pkCategories = [];
async function pkSupplierList() {
  const { packages = [], canPublish, categories = [] } = await api("/service-packages");
  pkCategories = categories;
  const card = (p) =>
    `<article class="panel pk-own"><div class="panel-title"><div><span class="eyebrow"><bdi>${esc(p.category)}</bdi></span><h3><bdi>${esc(p.title)}</bdi></h3></div>${pkChip(p.status)}</div>${
      p.pausedByAdmin ? `<div class="notice warn">${pkk("pausedByAdmin")} <bdi>${esc(p.pausedByAdmin.reason)}</bdi></div>` : ""
    }${
      p.instantBooking && !p.instantActive ? `<div class="notice warn">${pkk("instantOutdated")}</div>` : ""
    }<p class="rq-description"><bdi>${esc(p.description)}</bdi></p>${pkIncluded(p)}${pkFacts(p)}${p.instantActive ? `<ul class="pk-chips"><li class="pk-instant">${pkk("instantBadge")}</li></ul>` : ""}<p class="pk-price"><b>${esc(fmt.money(p.price))}</b> <small>${pkk("net")}</small></p><p class="subtle">${pkk("bookingsLine", {
      n: p.bookings,
      open: p.openBookings,
      done: p.contracted,
    })}</p><div class="cc-actions">${
      p.status === "Archived"
        ? ""
        : `<button class="btn small outline" data-action="pk.edit" data-id="${esc(p.id)}">${pkk("edit")}</button>${
            p.status === "Active"
              ? `<button class="btn small outline" data-action="pk.status" data-id="${esc(p.id)}" data-status="Paused">${pkk("pause")}</button>`
              : `<button class="btn small primary" data-action="pk.status" data-id="${esc(p.id)}" data-status="Active"${canPublish ? "" : " disabled"}>${pkk("activate")}</button>`
          }<button class="btn small ghost" data-action="pk.status" data-id="${esc(p.id)}" data-status="Archived">${pkk("archive")}</button>${
            p.bookings ? "" : `<button class="btn small ghost danger" data-action="pk.delete" data-id="${esc(p.id)}">${pkk("delete")}</button>`
          }`
    }</div></article>`;
  pkCache = packages;
  app.innerHTML = dashboardShell(
    "supplier",
    "packages",
    `<div class="dash-top"><div><h1>${pkk("mine.title")}</h1><p>${pkk("mine.lead")}</p></div><button class="btn primary" data-action="pk.edit">${pkk("new")}</button></div>${
      canPublish ? "" : `<div class="notice warn">${pkk("notVetted")}</div>`
    }${packages.map(card).join("") || `<div class="empty"><h2>${pkk("mine.empty")}</h2><p>${pkk("mine.emptyText")}</p><button class="btn primary" data-action="pk.edit">${pkk("new")}</button></div>`}`,
  );
}
let pkCache = [];
// The create and edit form
actions.on("pk.edit", async (el) => {
  const { clause: c } = await api("/clause");
  const p = pkCache.find((x) => x.id === el.dataset.id) || { teamSize: 2, days: 5, leadDays: 5, perWeek: 1, included: [], regions: [] };
  const v = (k) => esc(p[k] ?? "");
  modal(
    t(p.id ? "pk.editTitle" : "pk.newTitle"),
    `<form class="modal-form pk-form" data-action="pk.save" data-id="${esc(p.id || "")}" data-hash="${esc(c.hash)}">
<label>${pkk("field.title")}<input name="title" required minlength="3" maxlength="120" value="${v("title")}" placeholder="${pkk("ph.title")}"></label>
<label>${pkk("field.category")}<select name="category" required><option value="">${pkk("chooseCategory")}</option>${pkCategories
      .map((c) => `<option${c === p.category ? " selected" : ""}>${esc(c)}</option>`)
      .join("")}</select></label>
<label>${pkk("field.description")}<textarea name="description" rows="4" required minlength="10" maxlength="3000" placeholder="${pkk("ph.description")}">${v("description")}</textarea></label>
<label>${pkk("field.included")}<textarea name="included" rows="4" maxlength="3000" placeholder="${pkk("ph.included")}">${esc((p.included || []).join("\n"))}</textarea><small class="subtle">${pkk("onePerLine")}</small></label>
<div class="cc-platform-grid">
<label>${pkk("field.team")}<input type="number" name="teamSize" min="1" max="50" required value="${v("teamSize")}"></label>
<label>${pkk("field.days")}<input type="number" name="days" min="1" max="60" required value="${v("days")}"></label>
<label>${pkk("field.leadDays")}<input type="number" name="leadDays" min="1" max="60" required value="${v("leadDays")}"><small class="subtle">${pkk("leadHint")}</small></label>
<label>${pkk("field.perWeek")}<input type="number" name="perWeek" min="1" max="20" required value="${v("perWeek")}"></label>
<label>${pkk("field.price")}<input type="number" name="price" min="50" step="1" required value="${v("price")}"></label>
<label>${pkk("field.regions")}<input name="regions" maxlength="200" value="${esc((p.regions || []).join(", "))}" placeholder="93, 94, 84"><small class="subtle">${pkk("regionsHint")}</small></label>
<label>${pkk("field.radius")}<input type="number" name="radiusKm" min="1" max="2000" value="${v("radiusKm")}"></label>
</div>
<label class="cc-check-label"><input type="checkbox" name="travelIncluded"${p.travelIncluded ? " checked" : ""}> ${pkk("field.travelIncluded")}</label>
<label>${pkk("field.exclusions")}<input name="exclusions" maxlength="1000" value="${v("exclusions")}" placeholder="${pkk("ph.exclusions")}"></label>
<fieldset class="pk-instant-box"><legend>${pkk("field.instant")}</legend><label class="cc-check-label"><input type="checkbox" name="instantBooking"${p.instantBooking ? " checked" : ""}> ${pkk("instantLabel")}</label><small class="subtle">${pkk("instantHint")}</small><div class="rq-clause"><bdi>${esc(c.text)}</bdi></div><label class="cc-check-label"><input type="checkbox" name="acceptClause"> ${pkk(p.instantActive ? "instantAcceptAgain" : "instantAccept")}</label></fieldset>
<div class="cc-actions"><button type="button" class="btn outline" data-action="pk.closeModal">${pkk("cancel")}</button><button class="btn primary">${pkk("save")}</button></div></form>`,
  );
});
actions.on("pk.closeModal", () => closeModal());
actions.on("pk.save", async (form) => {
  const f = new FormData(form),
    body = Object.fromEntries(
      ["title", "category", "description", "included", "teamSize", "days", "leadDays", "perWeek", "price", "regions", "radiusKm", "exclusions"].map((k) => [k, f.get(k) || ""]),
    );
  body.travelIncluded = f.get("travelIncluded") === "on";
  body.instantBooking = f.get("instantBooking") === "on";
  if (f.get("acceptClause") === "on") Object.assign(body, { acceptClause: true, clauseHash: form.dataset.hash });
  try {
    const pid = form.dataset.id;
    await api("/service-packages" + (pid ? "/" + encodeURIComponent(pid) : ""), { method: pid ? "PUT" : "POST", body });
    closeModal();
    tToast(t(pid ? "pk.saved" : "pk.created"));
    route();
  } catch (x) {
    toast(x.message, "error");
  }
});
actions.on("pk.status", async (el) => {
  if (el.dataset.status === "Archived") {
    const ok = await uiDialog({ title: t("pk.archiveTitle"), message: t("pk.archiveText"), confirmLabel: t("pk.archive"), danger: true });
    if (!ok) return;
  }
  try {
    await api(`/service-packages/${encodeURIComponent(el.dataset.id)}/status`, { method: "POST", body: { status: el.dataset.status } });
    tToast(t("pk.statusSaved"));
    route();
  } catch (x) {
    toast(x.message, "error");
  }
});
actions.on("pk.delete", async (el) => {
  const ok = await uiDialog({ title: t("pk.deleteTitle"), message: t("pk.deleteText"), confirmLabel: t("pk.delete"), danger: true });
  if (!ok) return;
  try {
    await api(`/service-packages/${encodeURIComponent(el.dataset.id)}`, { method: "DELETE" });
    tToast(t("pk.deleted"));
    route();
  } catch (x) {
    toast(x.message, "error");
  }
});

/* ---------- Admin: every package, pause with a reason ---------- */
async function pkAdminList() {
  const { packages = [] } = await api("/service-packages");
  const rows = packages
    .map(
      (p) =>
        `<tr><td><b><bdi>${esc(p.title)}</bdi></b><small><bdi>${esc(p.category)}</bdi></small></td><td><bdi>${esc(p.company)}</bdi></td><td>${esc(fmt.money(p.price))}</td><td>${pkChip(p.status)}${
          p.pausedByAdmin ? `<small><bdi>${esc(p.pausedByAdmin.reason)}</bdi></small>` : ""
        }</td><td>${esc(fmt.number(p.bookings))}</td><td>${
          p.pausedByAdmin
            ? `<button class="btn small outline" data-action="pk.moderate" data-id="${esc(p.id)}" data-do="release">${pkk("admin.release")}</button>`
            : p.status === "Active"
              ? `<button class="btn small outline danger" data-action="pk.moderate" data-id="${esc(p.id)}" data-do="pause">${pkk("pause")}</button>`
              : ""
        }</td></tr>`,
    )
    .join("");
  app.innerHTML = dashboardShell(
    "admin",
    "packages",
    `<div class="dash-top"><div><h1>${pkk("admin.title")}</h1><p>${pkk("admin.lead")}</p></div></div>${
      packages.length
        ? `<section class="panel"><div class="cc-table-wrap"><table class="cc-table"><thead><tr><th>${pkk("col.package")}</th><th>${pkk("col.supplier")}</th><th>${pkk("col.price")}</th><th>${pkk("col.status")}</th><th>${pkk("col.bookings")}</th><th><span class="sr-only">${pkk("col.actions")}</span></th></tr></thead><tbody>${rows}</tbody></table></div></section>`
        : `<div class="empty"><h2>${pkk("admin.empty")}</h2></div>`
    }`,
  );
}
actions.on("pk.moderate", async (el) => {
  let reason = "";
  if (el.dataset.do === "pause") {
    reason = await uiDialog({ title: t("pk.admin.pauseTitle"), message: t("pk.admin.pauseText"), input: true, required: true, confirmLabel: t("pk.pause"), danger: true });
    if (!reason) return;
  }
  try {
    await api(`/service-packages/${encodeURIComponent(el.dataset.id)}/moderate`, { method: "POST", body: { action: el.dataset.do, reason } });
    tToast(t("pk.statusSaved"));
    route();
  } catch (x) {
    toast(x.message, "error");
  }
});

/* ---------- Customer: the package shop (T261) ---------- */
// The anonymised profile (brokered mode) or the company (marketplace mode)
function pkWho(p) {
  if (p.company) return `<p class="pk-who"><b><bdi>${esc(p.company)}</bdi></b></p>`;
  const f = p.profile || {},
    fact = (k, params) => `<li>${esc(t("req.profile." + k, params))}</li>`;
  return `<ul class="rq-profile pk-who">${[
    f.badge ? fact("badge", { badge: t("common.badge." + f.badge) }) : "",
    f.rating ? fact("rating", { rating: fmt.number(f.rating, 1) }) : "",
    f.completedOrders ? fact("completed", { n: f.completedOrders }) : "",
    f.yearsInBusiness ? fact("years", { n: f.yearsInBusiness }) : "",
    f.country ? fact("country", { country: f.country }) : "",
    (f.certifications || []).length ? fact("certs", { list: f.certifications.join(", ") }) : "",
  ].join("")}</ul>`;
}
function pkShopCard(p) {
  return `<article class="cc-card pk-card"><span class="eyebrow"><bdi>${esc(p.category)}</bdi></span><h3><a href="#/customer/packages/${esc(p.id)}"><bdi>${esc(p.title)}</bdi></a></h3><p class="pk-price"><b>${esc(fmt.money(p.price))}</b> <small>${pkk("net")}</small></p><ul class="pk-chips">${p.instantBooking ? `<li class="pk-instant">${pkk("instantBadge")}</li>` : ""}<li>${pkk("teamN", { n: p.teamSize })}</li><li>${pkk("daysN", { n: p.days })}</li><li>${pkk("startFrom", { date: fmt.date(p.earliestStart) })}</li></ul>${pkIncluded({ included: (p.included || []).slice(0, 3) })}${pkWho(p)}<a class="btn outline full" href="#/customer/packages/${esc(p.id)}">${pkk("shop.view")}</a></article>`;
}
async function pkShop(params, query) {
  const q = new URLSearchParams();
  for (const k of ["category", "start", "postcode", "maxPrice", "q", "sort"]) if (query?.get(k)) q.set(k, query.get(k));
  const { packages = [], categories = [] } = await api("/service-packages?" + q.toString()),
    v = (k) => esc(query?.get(k) || ""),
    sel = (name, options, label) =>
      `<label>${pkk("filter." + label)}<select name="${name}">${options
        .map(([value, text]) => `<option value="${esc(value)}"${(query?.get(name) || "") === value ? " selected" : ""}>${esc(text)}</option>`)
        .join("")}</select></label>`;
  app.innerHTML = dashboardShell(
    "customer",
    "packages",
    `<div class="dash-top"><div><h1>${pkk("shop.title")}</h1><p>${pkk(ccBrokered() ? "shop.leadBrokered" : "shop.lead")}</p></div></div>
<form class="panel pk-filters" data-action="pk.filter">${sel("category", [["", t("pk.filter.allCategories")], ...categories.map((c) => [c, c])], "category")}${sel(
      "start",
      [
        ["", t("pk.filter.anyStart")],
        ["next", t("pk.filter.next")],
        ["week", t("pk.filter.week")],
        ["2weeks", t("pk.filter.twoWeeks")],
      ],
      "start",
    )}<label>${pkk("filter.postcode")}<input name="postcode" maxlength="10" value="${v("postcode")}" inputmode="numeric"></label><label>${pkk("filter.maxPrice")}<input name="maxPrice" type="number" min="0" step="100" value="${v("maxPrice")}"></label><label>${pkk("filter.search")}<input name="q" type="search" maxlength="100" value="${v("q")}"></label>${sel(
      "sort",
      [
        ["start", t("pk.filter.sortStart")],
        ["price", t("pk.filter.sortPrice")],
        ["rating", t("pk.filter.sortRating")],
      ],
      "sort",
    )}<div class="cc-actions"><button class="btn primary">${pkk("filter.apply")}</button><a class="btn ghost" href="#/customer/packages">${pkk("filter.reset")}</a></div></form>
<p class="subtle">${esc(t.plural("pk.shop.count", packages.length))}</p>${
      packages.length
        ? `<div class="pk-grid">${packages.map(pkShopCard).join("")}</div>`
        : `<div class="empty"><h2>${pkk("shop.empty")}</h2><p>${pkk("shop.emptyText")}</p><a class="btn outline" href="#/customer/requests/new">${pkk("shop.request")}</a></div>`
    }`,
  );
}
actions.on("pk.filter", (form) => {
  const f = new FormData(form),
    q = new URLSearchParams();
  for (const [k, value] of f.entries()) if (String(value).trim()) q.set(k, String(value).trim());
  navigate("/customer/packages" + (q.toString() ? "?" + q.toString() : ""));
});
async function pkShopDetail(params) {
  const { package: p } = await api("/service-packages/" + encodeURIComponent(params.id));
  app.innerHTML = dashboardShell(
    "customer",
    "packages",
    `<div class="breadcrumb"><a href="#/customer/packages">${pkk("shop.back")}</a></div><div class="dash-top"><div><span class="eyebrow"><bdi>${esc(p.category)}</bdi></span><h1><bdi>${esc(p.title)}</bdi></h1></div><p class="pk-price"><b>${esc(fmt.money(p.price))}</b> <small>${pkk("net")}</small></p></div>
<div class="pk-detail"><section class="panel"><h3>${pkk("shop.about")}</h3><p class="rq-description"><bdi>${esc(p.description)}</bdi></p>${pkIncluded(p)}${
      p.exclusions ? `<p class="subtle"><b>${pkk("field.exclusions")}:</b> <bdi>${esc(p.exclusions)}</bdi></p>` : ""
    }${pkFacts(p)}</section><aside class="panel"><h3>${pkk(p.company ? "shop.supplier" : "shop.supplierAnon")}</h3>${pkWho(p)}${p.company ? "" : `<p class="subtle">${pkk("shop.anonNote")}</p>`}<div id="pkBook"></div></aside></div>`,
  );
  if (typeof pkBookingForm === "function") pkBookingForm(p);
}

/* ---------- Customer: booking a package (T262) ---------- */
async function pkBookingForm(p) {
  const box = document.getElementById("pkBook");
  if (!box) return;
  const [{ projects = [] }, { clause: c }] = await Promise.all([api("/projects").catch(() => ({})), api("/clause")]);
  const open = projects.filter((x) => x.status !== "Archived" && x.customerId === state.user.id);
  box.innerHTML = `<form class="modal-form pk-book" data-action="pk.book" data-id="${esc(p.id)}" data-hash="${esc(c.hash)}" data-price="${esc(p.price)}"><h3>${pkk("book.title")}</h3>${
    p.instantBooking ? `<p class="notice success">${pkk("book.instant")}</p>` : `<p class="subtle">${pkk("book.confirmNote")}</p>`
  }<label>${pkk("book.project")}<select name="projectId"><option value="">${pkk("book.newProject")}</option>${open
    .map((x) => `<option value="${esc(x.id)}">${esc(x.name)}</option>`)
    .join("")}</select></label><label>${pkk("book.start")}<input type="date" name="startDate" required min="${esc(p.earliestStart)}" value="${esc(p.earliestStart)}"></label><label>${pkk("book.units")}<input type="number" name="units" min="1" max="10" value="1" required data-action="pk.units"></label><div class="cc-platform-grid"><label>${pkk("book.postcode")}<input name="sitePostcode" maxlength="10" required inputmode="numeric"></label><label>${pkk("book.city")}<input name="siteCity" maxlength="80"></label></div><label>${pkk("book.notes")}<textarea name="notes" rows="3" maxlength="2000" placeholder="${pkk("book.notesPh")}"></textarea></label><div class="rq-clause"><bdi>${esc(c.text)}</bdi></div><small class="subtle">${esc(
    t("req.clauseVersion", { n: c.version, months: c.months }),
  )}</small><label class="cc-check-label"><input type="checkbox" name="accept" required> ${esc(t("req.acceptClause"))}</label><button class="btn primary full" id="pkBookBtn">${pkk("book.button", { price: fmt.money(p.price) })}</button></form>`;
}
actions.on("pk.units", (el) => {
  const form = el.closest("form"),
    n = Math.min(10, Math.max(1, Number(el.value) || 1));
  document.getElementById("pkBookBtn").textContent = t("pk.book.button", { price: fmt.money(Number(form.dataset.price) * n) });
});
actions.on("pk.book", async (form) => {
  const f = new FormData(form);
  try {
    const { request } = await api(`/service-packages/${encodeURIComponent(form.dataset.id)}/book`, {
      method: "POST",
      body: {
        projectId: f.get("projectId") || "",
        startDate: f.get("startDate"),
        units: Number(f.get("units")),
        sitePostcode: f.get("sitePostcode"),
        siteCity: f.get("siteCity"),
        notes: f.get("notes"),
        acceptClause: form.elements.accept.checked,
        clauseHash: form.dataset.hash,
      },
    });
    tToast(t(request.status === "Contracted" ? "pk.book.doneInstant" : "pk.book.done"));
    navigate("/customer/requests/" + request.id);
  } catch (x) {
    toast(x.message, "error");
  }
});

routes.add("/customer/packages", pkShop);
routes.add("/customer/packages/:id", pkShopDetail);
routes.add("/supplier/packages", pkSupplierList);
routes.add("/admin/packages", pkAdminList);
