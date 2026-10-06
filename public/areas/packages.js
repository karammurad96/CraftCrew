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
    }<p class="rq-description"><bdi>${esc(p.description)}</bdi></p>${pkIncluded(p)}${pkFacts(p)}<p class="pk-price"><b>${esc(fmt.money(p.price))}</b> <small>${pkk("net")}</small></p><p class="subtle">${pkk("bookingsLine", {
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
actions.on("pk.edit", (el) => {
  const p = pkCache.find((x) => x.id === el.dataset.id) || { teamSize: 2, days: 5, leadDays: 5, perWeek: 1, included: [], regions: [] };
  const v = (k) => esc(p[k] ?? "");
  modal(
    t(p.id ? "pk.editTitle" : "pk.newTitle"),
    `<form class="modal-form pk-form" data-action="pk.save" data-id="${esc(p.id || "")}">
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

routes.add("/supplier/packages", pkSupplierList);
routes.add("/admin/packages", pkAdminList);
