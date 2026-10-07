/* Area: requests to the platform (T222, Wave 15). Customers describe the work and the platform finds the
   supplier; operators (admins) take each request from a queue. Titles, descriptions, categories and names are
   data; everything else is a translation key. */
const rqk = (key, params) => esc(t("req." + key, params));
const RQ_OPEN = ["New", "Sourcing", "Options ready"];
const rqChip = (s) =>
  `<span class="status ${s === "Contracted" || s === "Chosen" ? "completed" : s === "Withdrawn" || s === "Closed" ? "rejected" : "submitted"}">${statusHtml(s)}</span>`;
const rqAge = (r) => Math.max(0, Math.floor((Date.now() - Date.parse(r.createdAt)) / 86400000));
const rqFiles = (r) =>
  (r.attachments || []).length
    ? `<ul class="rq-files">${r.attachments.map((u) => `<li><a href="${esc(u)}" target="_blank" rel="noopener">${esc(u.split("/").pop())}</a></li>`).join("")}</ul>`
    : `<p class="subtle">${rqk("noFiles")}</p>`;
// The facts of a request, the same for customer and operator
function rqFacts(r) {
  const row = (label, value) =>
    value ? `<div><dt>${rqk("field." + label)}</dt><dd>${value}</dd></div>` : "";
  return `<dl class="rq-facts">${[
    row("category", `<bdi>${esc(r.category)}</bdi>`),
    row("site", esc([r.sitePostcode, r.siteCity].filter(Boolean).join(" "))),
    row("start", r.startDate ? esc(fmt.date(r.startDate)) : ""),
    row("due", r.dueDate ? esc(fmt.date(r.dueDate)) : ""),
    row("budget", r.budget !== null && r.budget !== undefined ? esc(fmt.money(r.budget)) : ""),
    row(
      "project",
      r.projectName
        ? `<bdi>${esc(r.projectName)}</bdi>${r.taskName ? ` · <bdi>${esc(r.taskName)}</bdi>` : ""}`
        : "",
    ),
    row("optionsBy", r.optionsBy ? esc(fmt.date(r.optionsBy)) : ""),
  ].join("")}</dl>`;
}
// T230: the work packages of a request
function rqPackages(r) {
  if (!(r.packages || []).length) return "";
  return `<ul class="rq-pkg-list">${r.packages
    .map(
      (x) =>
        `<li><b><bdi>${esc(x.name)}</bdi></b> · <bdi>${esc(x.category)}</bdi> · ${rqk(x.rough ? "pkg.hoursRough" : "pkg.hoursN", { n: x.hours })}</li>`,
    )
    .join("")}</ul>`;
}
function rqTimeline(r) {
  return `<ol class="rq-timeline">${(r.history || [])
    .map(
      (h) =>
        `<li>${rqChip(h.status)} <span>${esc(fmt.date(h.at))}</span> <small>${rqk("by." + (h.by === "platform" || h.by === "supplier" ? h.by : state.user?.role === "admin" ? "theCustomer" : "customer"))}</small>${h.note ? `<p><bdi>${esc(h.note)}</bdi></p>` : ""}</li>`,
    )
    .join("")}</ol>`;
}

/* ---------- Customer: list, new request, detail ---------- */
async function rqCustomerList() {
  const { requests = [] } = await api("/requests");
  const rows = requests
    .map(
      (r) =>
        `<tr><td><a href="#/customer/requests/${esc(r.id)}"><b><bdi>${esc(r.title)}</bdi></b></a><small><bdi>${esc(r.category)}</bdi></small></td><td>${rqChip(r.status)}</td><td>${esc(fmt.date(r.createdAt))}</td><td>${r.optionsBy ? esc(fmt.date(r.optionsBy)) : "—"}</td></tr>`,
    )
    .join("");
  app.innerHTML = dashboardShell(
    "customer",
    "requests",
    `<div class="dash-top"><div><h1>${rqk("title")}</h1><p>${rqk("lead")}</p></div><a class="btn primary" href="#/customer/requests/new">${rqk("new")}</a></div>${
      requests.length
        ? `<section class="panel"><div class="cc-table-wrap"><table class="cc-table"><thead><tr><th>${rqk("col.request")}</th><th>${rqk("col.status")}</th><th>${rqk("col.sent")}</th><th>${rqk("col.optionsBy")}</th></tr></thead><tbody>${rows}</tbody></table></div></section>`
        : `<div class="empty"><h2>${rqk("empty")}</h2><p>${rqk("emptyText")}</p><a class="btn primary" href="#/customer/requests/new">${rqk("new")}</a></div>`
    }`,
  );
}
// T230: the request belongs to a project; its work packages are open tasks of it, or new ones
let rqCats = [],
  rqProjects = [];
const rqCatSelect = (name, value = "") =>
  `<select name="${name}" aria-label="${rqk("field.category")}"><option value="">${rqk("chooseCategory")}</option>${rqCats
    .map((c) => `<option${c === value ? " selected" : ""}>${esc(c)}</option>`)
    .join("")}</select>`;
const rqNewRow = (name = "") =>
  `<div class="rq-pkg rq-pkg-new"><input name="pkgName" maxlength="140" value="${esc(name)}" placeholder="${rqk("pkg.namePh")}" aria-label="${rqk("pkg.name")}">${rqCatSelect(
    "pkgCat",
  )}<input name="pkgHours" type="number" min="1" max="5000" placeholder="${rqk("pkg.hoursPh")}" aria-label="${rqk("pkg.hours")}"><button type="button" class="btn small ghost" data-action="req.removePackage" aria-label="${rqk("pkg.remove")}">×</button></div>`;
// The open tasks of the chosen project, to tick as packages
function rqTaskRows(projectId, ticked = "") {
  const p = rqProjects.find((x) => x.id === projectId);
  if (!p) return "";
  const open = p.phases.flatMap((ph) =>
    (ph.tasks || [])
      .filter((x) => !x.assignedSupplierId || x.acceptanceStatus === "Declined")
      .map((x) => ({ ph, x })),
  );
  if (!open.length) return `<p class="subtle">${rqk("pkg.noOpenTasks")}</p>`;
  return open
    .map(
      ({ ph, x }) =>
        `<label class="rq-pkg rq-pkg-task"><input type="checkbox" name="task" value="${esc(x.id)}"${x.id === ticked ? " checked" : ""}><span><b><bdi>${esc(x.name)}</bdi></b><small><bdi>${esc(ph.name)}</bdi></small></span>${rqCatSelect("cat_" + x.id)}<input name="hours_${esc(x.id)}" type="number" min="1" max="5000" value="${esc(x.estimatedHours || "")}" placeholder="${rqk("pkg.hoursPh")}" aria-label="${rqk("pkg.hours")}"></label>`,
    )
    .join("");
}
async function rqNewPage(params, query) {
  const [cfg, { projects = [] }] = await Promise.all([
      api("/platform-config").catch(() => ({})),
      api("/projects").catch(() => ({})),
    ]),
    pre = (k) => esc(query?.get(k) || ""),
    chosen = query?.get("project") || "";
  rqCats = cfg.serviceCategories || [];
  rqProjects = projects.filter((p) => p.status !== "Archived" && p.customerId === state.user.id);
  app.innerHTML = dashboardShell(
    "customer",
    "requests",
    `<div class="breadcrumb"><a href="#/customer/requests">${rqk("back")}</a></div><div class="dash-top"><div><h1>${rqk("newTitle")}</h1><p>${rqk("newLead")}</p></div></div>
<form class="panel modal-form rq-form" data-action="req.create">
<label>${rqk("field.title")}<input name="title" required minlength="3" maxlength="160" value="${pre("title")}" placeholder="${rqk("ph.title")}"></label>
<label>${rqk("field.description")}<textarea name="description" rows="6" required minlength="10" maxlength="5000" placeholder="${rqk("ph.description")}"></textarea></label>
<fieldset class="rq-project"><legend>${rqk("pkg.projectTitle")}</legend><label>${rqk("field.project")}<select name="projectId" data-action="req.project"><option value="">${rqk("pkg.newProject")}</option>${rqProjects
      .map((p) => `<option value="${esc(p.id)}"${p.id === chosen ? " selected" : ""}>${esc(p.name)}</option>`)
      .join("")}</select></label><small class="subtle">${rqk("pkg.projectHint")}</small></fieldset>
<fieldset class="rq-packages"><legend>${rqk("pkg.title")}</legend><p class="subtle">${rqk("pkg.lead")}</p><div id="rqTaskRows">${rqTaskRows(chosen, query?.get("task") || "")}</div><div id="rqNewRows">${
      query?.get("task") ? "" : rqNewRow()
    }</div><button type="button" class="btn small outline" data-action="req.addPackage">${rqk("pkg.add")}</button></fieldset>
<div class="cc-platform-grid"><label>${rqk("field.postcode")}<input name="sitePostcode" maxlength="10"></label><label>${rqk("field.city")}<input name="siteCity" maxlength="80"></label>
<label>${rqk("field.start")}<input type="date" name="startDate"></label><label>${rqk("field.due")}<input type="date" name="dueDate"></label>
<label>${rqk("field.budgetOptional")}<input type="number" name="budget" min="0" step="100"></label><label>${rqk("field.trips")}<input type="number" name="trips" min="1" max="50" placeholder="${rqk("field.tripsPh")}"></label></div>
<fieldset class="rq-shifts"><legend>${rqk("field.shifts")}</legend>${["night", "weekend", "shift"].map((k) => `<label class="cc-check-label"><input type="checkbox" name="shifts" value="${k}"> ${rqk("shift." + k)}</label>`).join("")}</fieldset>
<label>${rqk("field.files")}<input type="file" name="files" multiple></label>
<p class="subtle">${rqk("privacyNote")}</p>
<div class="cc-actions"><button class="btn primary">${rqk("send")}</button><a class="btn outline" href="#/customer/requests">${rqk("cancel")}</a></div></form>`,
  );
}
actions.on("req.project", (el) => {
  document.getElementById("rqTaskRows").innerHTML = rqTaskRows(el.value);
});
actions.on("req.addPackage", () =>
  document.getElementById("rqNewRows").insertAdjacentHTML("beforeend", rqNewRow()),
);
actions.on("req.removePackage", (el) => el.closest(".rq-pkg").remove());
actions.on("req.create", async (form) => {
  const f = new FormData(form),
    keep = [
      "title",
      "description",
      "projectId",
      "sitePostcode",
      "siteCity",
      "startDate",
      "dueDate",
      "budget",
      "trips",
    ],
    body = Object.fromEntries(keep.map((k) => [k, f.get(k) || ""]));
  body.shifts = f.getAll("shifts");
  const names = f.getAll("pkgName"),
    cats = f.getAll("pkgCat"),
    hours = f.getAll("pkgHours");
  body.packages = [
    ...f
      .getAll("task")
      .map((taskId) => ({ taskId, category: f.get("cat_" + taskId), hours: f.get("hours_" + taskId) })),
    // An untouched extra row is left out
    ...names
      .map((name, i) => ({ name: name.trim(), category: cats[i], hours: hours[i] }))
      .filter((x) => x.name || x.category || x.hours),
  ];
  if (!body.packages.length) return toast(t("req.pkg.none"), "error");
  if (body.packages.some((x) => !x.category)) return toast(t("req.pkg.chooseCategory"), "error");
  try {
    body.attachments = [];
    for (const file of form.elements.files.files) body.attachments.push((await uploadFile(file)).url);
    const { request } = await api("/requests", { method: "POST", body });
    tToast(t("req.sent"));
    navigate("/customer/requests/" + request.id);
  } catch (x) {
    toast(x.message, "error");
  }
});
async function rqCustomerDetail(params) {
  const { request: r } = await api("/requests/" + encodeURIComponent(params.id));
  app.innerHTML = dashboardShell(
    "customer",
    "requests",
    `<div class="breadcrumb"><a href="#/customer/requests">${rqk("back")}</a></div><div class="dash-top"><div><h1><bdi>${esc(r.title)}</bdi></h1><p>${rqChip(r.status)} ${rqk("statusText." + ccStatusKey(r.status).split(".").pop())}</p></div>${
      RQ_OPEN.includes(r.status)
        ? `<button class="btn outline danger" data-action="req.withdraw" data-id="${esc(r.id)}">${rqk("withdraw")}</button>`
        : ""
    }</div>
${r.outsideArea && ["New", "Sourcing"].includes(r.status) ? `<div class="notice">${rqk("outsideArea")}</div>` : ""}<section class="panel"><h3>${rqk("details")}</h3>${rqFacts(r)}${rqPackages(r)}<p class="rq-description"><bdi>${esc(r.description)}</bdi></p>${r.closeReason ? `<p class="rq-closed"><b>${rqk("closedReason")}</b> <bdi>${esc(r.closeReason)}</bdi></p>` : ""}</section>
${
  (r.options || []).length
    ? `<section class="panel"><h3>${rqk("optionsTitle")}</h3><p class="subtle">${rqk("optionsLead")}</p>${rqAwardNote(r)}<div class="rq-options">${r.options
        .map((o) => rqOptionCard(o, r.status === "Options ready" && !o.declined ? r.id : ""))
        .join("")}</div></section>`
    : ""
}${rqThread(r, "customer")}
<section class="panel"><h3>${rqk("files")}</h3>${rqFiles(r)}</section>
<section class="panel"><h3>${rqk("timeline")}</h3>${rqTimeline(r)}</section>`,
  );
}
actions.on("req.withdraw", async (el) => {
  const reason = await uiDialog({
    title: t("req.withdrawTitle"),
    message: t("req.withdrawText"),
    input: true,
    confirmLabel: t("req.withdraw"),
    danger: true,
  });
  if (reason === null || reason === false) return;
  try {
    await api("/requests/" + encodeURIComponent(el.dataset.id), {
      method: "PATCH",
      body: { action: "withdraw", reason },
    });
    tToast(t("req.withdrawn"));
    route();
  } catch (x) {
    toast(x.message, "error");
  }
});

/* ---------- Operator (admin): queue and request ---------- */
async function rqAdminQueue(params, query) {
  const { requests = [] } = await api("/requests"),
    filter = query?.get("status") || "open",
    shown = requests
      .filter((r) =>
        filter === "open" ? RQ_OPEN.includes(r.status) : filter === "all" || r.status === filter,
      )
      // New requests first, then the oldest first
      .sort(
        (a, b) =>
          (b.status === "New") - (a.status === "New") ||
          String(a.createdAt).localeCompare(String(b.createdAt)),
      );
  const tabs = ["open", "New", "Sourcing", "Options ready", "Contracted", "all"]
    .map(
      (s) =>
        `<a class="btn small ${s === filter ? "primary" : "outline"}" href="#/admin/requests?status=${encodeURIComponent(s)}">${s === "open" || s === "all" ? rqk("filter." + s) : statusHtml(s)}</a>`,
    )
    .join("");
  app.innerHTML = dashboardShell(
    "admin",
    "requests",
    `<div class="dash-top"><div><h1>${rqk("queueTitle")}</h1><p>${rqk("queueLead")}</p></div></div><div class="cc-actions rq-filters">${tabs}</div><section class="panel"><div class="cc-table-wrap"><table class="cc-table"><thead><tr><th>${rqk("col.request")}</th><th>${rqk("col.customer")}</th><th>${rqk("col.status")}</th><th>${rqk("col.age")}</th><th>${rqk("col.operator")}</th></tr></thead><tbody>${
      shown
        .map(
          (r) =>
            `<tr${(r.deadlines || []).length ? ' class="rq-overdue"' : ""}><td><a href="#/admin/requests/${esc(r.id)}"><b><bdi>${esc(r.title)}</bdi></b></a><small><bdi>${esc(r.category)}</bdi></small></td><td><bdi>${esc(r.customerCompany || r.customerName)}</bdi></td><td>${rqChip(r.status)}${(r.deadlines || [])
              .map((d) => ` <span class="status rejected rq-late">${rqk("late." + d.kind)}</span>`)
              .join("")}</td><td>${rqk("days", { n: rqAge(r) })}</td><td>${r.operatorName ? `<bdi>${esc(r.operatorName)}</bdi>` : "—"}</td></tr>`,
        )
        .join("") || `<tr><td colspan="5">${rqk("queueEmpty")}</td></tr>`
    }</tbody></table></div></section>`,
  );
}
/* T223: suggestions, a search over all suppliers, invitations and the offers received */
const rqPick = (x, invited) =>
  `<tr><td><input type="checkbox" name="supplierIds" value="${esc(x.supplierId)}" aria-label="${esc(x.company)}"${invited.has(x.supplierId) ? " checked disabled" : ""}></td><td><b><bdi>${esc(x.company)}</bdi></b><small><bdi>${esc(x.location || "")}</bdi></small></td><td>${
    x.score === undefined ? "—" : esc(String(x.score))
  }</td><td>${(x.reasons || []).map((y) => esc(t("req.reason." + y.key, y.params || {}))).join(" · ")}</td></tr>`;
function rqSourcingPanel(r) {
  const s = r.sourcing,
    invited = new Set((s?.invited || []).map((x) => x.supplierId)),
    list = r.suggestions?.list || [];
  const offers = s
    ? `<h4>${rqk("invitedTitle", { date: fmt.date(s.dueDate) })}</h4><div class="cc-table-wrap"><table class="cc-table"><thead><tr><th>${rqk("col.supplier")}</th><th>${rqk("col.offer")}</th><th>${rqk("col.days")}</th><th>${rqk("col.status")}</th></tr></thead><tbody>${s.invited
        .map(
          (x) =>
            `<tr><td><bdi>${esc(x.company)}</bdi></td><td>${x.offer ? esc(fmt.money(x.offer.amount)) : "—"}</td><td>${x.offer ? esc(String(x.offer.deliveryDays)) : "—"}</td><td>${x.offer ? statusHtml(x.offer.status) : rqk("noOfferYet")}</td></tr>`,
        )
        .join("")}</tbody></table></div>`
    : "";
  if (!RQ_OPEN.includes(r.status))
    return s
      ? `<section class="panel"><h3>${rqk("sourcingTitle")}</h3>${offers}${rqOptionsBuilder(r)}</section>`
      : "";
  return `<section class="panel rq-sourcing"><div class="panel-title"><h3>${rqk("sourcingTitle")}</h3><button type="button" class="btn small outline" data-action="req.suggest" data-id="${esc(r.id)}">${rqk("refresh")}</button></div>
<p class="subtle">${r.suggestions ? rqk("suggestedAt", { date: fmt.date(r.suggestions.at) }) : rqk("noSuggestions")}</p>
<form data-action="req.invite" data-id="${esc(r.id)}"><div class="cc-table-wrap"><table class="cc-table"><thead><tr><th></th><th>${rqk("col.supplier")}</th><th>${rqk("col.score")}</th><th>${rqk("col.reasons")}</th></tr></thead><tbody id="rqPickRows">${
    list.map((x) => rqPick(x, invited)).join("") || `<tr><td colspan="4">${rqk("noMatches")}</td></tr>`
  }</tbody></table></div>
<div class="cc-actions rq-search"><input type="search" id="rqSearch" placeholder="${rqk("searchPlaceholder")}" aria-label="${rqk("searchPlaceholder")}"><button type="button" class="btn small outline" data-action="req.search">${rqk("search")}</button></div>
<div class="cc-actions rq-take">${
    s
      ? ""
      : `<label>${rqk("offersDue")}<input type="date" name="dueDate" required value="${new Date(Date.now() + 7 * 86400000).toISOString().slice(0, 10)}"></label>`
  }<button class="btn primary">${rqk("invite")}</button></div></form>${offers}${rqOptionsBuilder(r)}</section>`;
}
/* T224: the operator picks up to three offers as anonymised options, labels them and publishes them */
const RQ_LABELS = ["fastest", "cheapest", "best", "recommended"];
function rqOptionsBuilder(r) {
  const offered = (r.sourcing?.invited || []).filter(
      (x) => x.offer && ["Submitted", "Changes requested"].includes(x.offer.status),
    ),
    saved = new Map((r.options || []).map((o) => [o.offerId, o])),
    editable = ["Sourcing", "Options ready"].includes(r.status);
  if (!offered.length && !(r.options || []).length) return "";
  const rows = offered
    .map(({ company, offer: o }) => {
      const s = saved.get(o.id),
        label = s?.label || o.suggestedLabel || "recommended";
      return `<tr><td><input type="checkbox" name="offerIds" value="${esc(o.id)}" aria-label="${esc(company)}"${s ? " checked" : ""}${editable ? "" : " disabled"}></td><td><bdi>${esc(company)}</bdi><small>${esc(fmt.money(o.amount))} · ${rqk("daysN", { n: o.deliveryDays })}</small></td><td><select name="label_${esc(o.id)}" aria-label="${rqk("col.label")}">${RQ_LABELS.map(
        (l) => `<option value="${l}"${l === label ? " selected" : ""}>${rqk("opt." + l)}</option>`,
      ).join(
        "",
      )}</select></td><td><input name="note_${esc(o.id)}" maxlength="1000" value="${esc(s?.note || "")}" aria-label="${rqk("col.note")}"></td><td>${
        o.attachment
          ? `<label class="cc-check-label"><input type="checkbox" name="share_${esc(o.id)}"${s?.attachments?.length ? " checked" : ""}> ${rqk("shareFile")}</label>`
          : "—"
      }</td></tr>`;
    })
    .join("");
  const publish =
    r.status === "Sourcing" && (r.options || []).length
      ? `<button type="button" class="btn primary" data-action="req.publish" data-id="${esc(r.id)}">${rqk("publish")}</button>`
      : "";
  return `<h4>${rqk("optionsBuilder")}</h4><p class="subtle">${rqk("optionsBuilderLead")}</p><form data-action="req.saveOptions" data-id="${esc(r.id)}"><div class="cc-table-wrap"><table class="cc-table"><thead><tr><th></th><th>${rqk("col.offer")}</th><th>${rqk(
    "col.label",
  )}</th><th>${rqk("col.note")}</th><th>${rqk("col.files")}</th></tr></thead><tbody>${rows}</tbody></table></div>${
    editable
      ? `<div class="cc-actions"><button class="btn outline">${rqk("saveOptions")}</button>${publish}</div>`
      : ""
  }</form>${(r.options || []).length ? `<div class="rq-options">${r.options.map(rqOptionCard).join("")}</div>` : ""}`;
}
actions.on("req.saveOptions", async (form) => {
  const f = new FormData(form),
    options = f.getAll("offerIds").map((offerId) => ({
      offerId,
      label: f.get("label_" + offerId),
      note: f.get("note_" + offerId) || "",
      shareAttachment: f.get("share_" + offerId) === "on",
    }));
  try {
    await api(`/requests/${encodeURIComponent(form.dataset.id)}/options`, {
      method: "PUT",
      body: { options },
    });
    tToast(t("req.optionsSaved"));
    route();
  } catch (x) {
    toast(x.message, "error");
  }
});
actions.on("req.publish", async (el) => {
  const ok = await uiDialog({
    title: t("req.publishTitle"),
    message: t("req.publishText"),
    confirmLabel: t("req.publish"),
  });
  if (!ok) return;
  try {
    await api(`/requests/${encodeURIComponent(el.dataset.id)}/publish`, { method: "POST", body: {} });
    tToast(t("req.published"));
    route();
  } catch (x) {
    toast(x.message, "error");
  }
});
// One option as the customer sees it (and as the operator previews it): no supplier name anywhere
// T225: what happened to the choice: waiting for the supplier, or the contract with the supplier named
// T232: each supplier part of the choice: packages, price, state; a higher price waits for the customer
function rqAwardParts(r, role) {
  const parts =
    role === "admin"
      ? (r.award?.parts || []).filter((p) =>
          ["Waiting for supplier", "Price changed", "Confirmed"].includes(p.status),
        )
      : r.award?.parts || [];
  if (!parts.length || (parts.length === 1 && !r.award.estimate)) return "";
  return `<ul class="rq-award-parts">${parts
    .map((p) => {
      const names = p.packages || [],
        changed = p.status === "Price changed",
        price = changed ? (p.proposedPrice ?? p.proposed?.price) : p.price;
      return `<li><span class="status ${p.status === "Confirmed" ? "completed" : changed ? "rejected" : "submitted"}">${statusHtml(p.status)}</span> <b><bdi>${esc(names.join(", "))}</bdi></b>${
        p.company ? ` · <bdi>${esc(p.company)}</bdi>` : ""
      } · ${esc(fmt.money(price))}${p.replacement || p.replaces ? ` · ${rqk("part.replacement")}` : ""}${changed ? `<small>${rqk("part.changed", { was: fmt.money(p.price) })} <bdi>${esc(p.note || p.proposed?.note || "")}</bdi></small>` : ""}${
        changed && role === "customer"
          ? `<span class="cc-actions"><button class="btn small primary" data-action="req.partPrice" data-id="${esc(r.id)}" data-part="${esc(p.id)}" data-do="approve">${rqk("part.approve")}</button><button class="btn small outline" data-action="req.partPrice" data-id="${esc(r.id)}" data-part="${esc(p.id)}" data-do="reject">${rqk("part.reject")}</button></span>`
          : ""
      }</li>`;
    })
    .join(
      "",
    )}</ul>${(r.award.gap || []).length ? `<div class="notice warn">${rqk("part.gap", { list: r.award.gap.join(", ") })}</div>` : ""}`;
}
actions.on("req.partPrice", async (el) => {
  try {
    await api(`/requests/${encodeURIComponent(el.dataset.id)}/parts/${encodeURIComponent(el.dataset.part)}`, {
      method: "POST",
      body: { action: el.dataset.do },
    });
    tToast(t(el.dataset.do === "approve" ? "req.part.approved" : "req.part.rejected"));
    route();
  } catch (x) {
    toast(x.message, "error");
  }
});
function rqAwardNote(r, role = "customer") {
  if (r.status === "Chosen")
    return `<div class="notice">${rqk("awardWaiting", { date: fmt.date(r.award?.expiresAt) })}${rqAwardParts(r, role)}</div>`;
  if (r.status === "Contracted" && (r.suppliers || []).length > 1)
    return `<div class="notice success">${rqk("awardDoneMany")}<ul class="rq-award-parts">${r.suppliers
      .map(
        (s) =>
          `<li><b><bdi>${esc(s.company)}</bdi></b>: <bdi>${esc((s.packages || []).join(", "))}</bdi></li>`,
      )
      .join(
        "",
      )}</ul>${role === "customer" ? `<a href="#/customer/projects/${esc(r.projectId)}">${rqk("openProject")}</a>` : ""}</div>`;
  if (r.status === "Contracted" && r.supplier)
    return `<div class="notice success">${rqk("awardDone", { company: r.supplier.company })}${
      role === "customer"
        ? ` <a href="#/customer/projects/${esc(r.projectId)}">${rqk("openProject")}</a>`
        : ""
    }</div>`;
  return "";
}
// T241: what a part's price is made of; only the lines that are there
function rqLines(x) {
  const l = x.lines;
  if (!l) return "";
  const shown = ["labour", "surcharge", "materials", "travel", "minimum"].filter((k) => Number(l[k]) > 0);
  if (shown.length < 2 && !Number(l.minimum)) return "";
  return `<small class="rq-lines">${shown.map((k) => rqk("line." + k, { amount: fmt.money(l[k]) })).join(" · ")}</small>`;
}
function rqOptionCard(o, chooseFor = "") {
  const p = o.profile || {},
    fact = (k, params) => `<li>${rqk("profile." + k, params)}</li>`;
  // T231: an estimate shows its parts; a split names how many suppliers, never who (the operator sees the company)
  const parts =
    (o.parts || []).length > 1 || o.estimate
      ? `<ul class="rq-parts">${(o.parts || [])
          .map(
            (x, n) =>
              `<li><b>${rqk("part.title", { n: n + 1 })}</b> <bdi>${esc((x.packages || []).join(", "))}</bdi>${x.company ? ` · <bdi>${esc(x.company)}</bdi>` : ""}<small>${rqk(
                "part.facts",
                {
                  hours: x.hours,
                  price: fmt.money(x.price),
                  days: x.days,
                },
              )}${x.profile?.badge ? " · " + esc(t("common.badge." + x.profile.badge)) : ""}${x.profile?.rating ? " · " + rqk("profile.rating", { rating: fmt.number(x.profile.rating, 1) }) : ""}</small>${rqLines(x)}${
                x.unusual ? `<small class="rq-unusual">${rqk("estimate.unusual")}</small>` : ""
              }</li>`,
          )
          .join("")}</ul>`
      : "";
  const flags = `${o.estimate ? `<span class="status submitted rq-estimate">${rqk("estimate.badge")}</span>` : ""}${
    o.confidence ? `<span class="status rq-confidence rq-confidence-${esc(o.confidence)}" title="${rqk("confidence.hint." + o.confidence)}">${rqk("confidence." + o.confidence)}</span>` : ""
  }${o.split ? `<span class="status">${rqk("estimate.split", { n: o.parts.length })}</span>` : ""}`;
  return `<article class="cc-card rq-option${o.chosen ? " chosen" : ""}"><span class="status ${o.label === "recommended" ? "completed" : "submitted"}">${rqk("opt." + o.label)}</span>${flags}<b class="rq-price">${esc(fmt.money(o.price))}</b><small>${rqk("daysN", { n: o.deliveryDays })}</small>${parts}${o.estimate ? `<small class="subtle">${rqk("estimate.note")}</small>` : ""}<ul class="rq-profile">${[
    p.badge ? fact("badge", { badge: t("common.badge." + p.badge) }) : "",
    p.rating ? fact("rating", { rating: fmt.number(p.rating, 1) }) : "",
    p.completedOrders ? fact("completed", { n: p.completedOrders }) : "",
    p.onTimeRate !== null && p.onTimeRate !== undefined ? fact("onTime", { pct: p.onTimeRate }) : "",
    p.yearsInBusiness ? fact("years", { n: p.yearsInBusiness }) : "",
    p.country ? fact("country", { country: p.country }) : "",
    (p.certifications || []).length ? fact("certs", { list: p.certifications.join(", ") }) : "",
  ].join(
    "",
  )}</ul>${o.note ? `<p><bdi>${esc(o.note)}</bdi></p>` : ""}${(o.attachments || []).map((u) => `<a href="${esc(u)}" target="_blank" rel="noopener">${rqk("offerFile")}</a>`).join(" ")}${
    o.declined ? `<small class="subtle">${rqk("optionGone")}</small>` : ""
  }${chooseFor ? `<button class="btn primary" data-action="req.chooseDialog" data-id="${esc(chooseFor)}" data-option="${esc(o.id)}">${rqk("choose")}</button>` : ""}</article>`;
}
// T225: the platform contract with the non-circumvention clause, accepted before the choice becomes binding
actions.on("req.chooseDialog", async (el) => {
  const { clause: c } = await api("/clause");
  modal(
    t("req.chooseTitle"),
    `<form class="modal-form" data-action="req.choose" data-id="${esc(el.dataset.id)}" data-option="${esc(el.dataset.option)}" data-hash="${esc(c.hash)}"><p>${rqk("chooseLead")}</p><div class="rq-clause"><bdi>${esc(c.text)}</bdi></div><small class="subtle">${rqk(
      "clauseVersion",
      {
        n: c.version,
        months: c.months,
      },
    )}</small><label class="cc-check-label"><input type="checkbox" name="accept" required> ${rqk("acceptClause")}</label><div class="cc-actions"><button type="button" class="btn outline" data-action="req.closeModal">${rqk("cancel")}</button><button class="btn primary">${rqk("chooseConfirm")}</button></div></form>`,
  );
});
actions.on("req.closeModal", () => closeModal());
actions.on("req.choose", async (form) => {
  try {
    await api(`/requests/${encodeURIComponent(form.dataset.id)}/choose`, {
      method: "POST",
      body: {
        optionId: form.dataset.option,
        acceptClause: form.elements.accept.checked,
        clauseHash: form.dataset.hash,
      },
    });
    closeModal();
    tToast(t("req.chosen"));
    route();
  } catch (x) {
    toast(x.message, "error");
  }
});
/* T224: messages between the customer and the platform on one request */
function rqThread(r, role) {
  const from = (m) =>
    rqk("from." + (m.by === "platform" ? "platform" : role === "admin" ? "customer" : "you"));
  const open = !["Withdrawn", "Closed"].includes(r.status);
  return `<section class="panel"><h3>${rqk("threadTitle")}</h3>${
    (r.thread || [])
      .map(
        (m) =>
          `<div class="rq-msg ${m.by}"><small>${from(m)} · ${esc(fmt.date(m.at))}</small><p><bdi>${esc(m.text)}</bdi></p></div>`,
      )
      .join("") || `<p class="subtle">${rqk("threadEmpty")}</p>`
  }${
    open
      ? `<form class="modal-form" data-action="req.message" data-id="${esc(r.id)}"><textarea name="text" rows="3" maxlength="3000" required aria-label="${rqk("threadTitle")}" placeholder="${rqk(
          role === "admin" ? "replyPlaceholder" : "askPlaceholder",
        )}"></textarea>${
          role === "customer" && r.status === "Options ready"
            ? `<label class="cc-check-label"><input type="checkbox" name="anotherRound"> ${rqk("anotherRound")}</label>`
            : ""
        }<div class="cc-actions"><button class="btn outline">${rqk("sendMessage")}</button></div></form>`
      : ""
  }</section>`;
}
actions.on("req.message", async (form) => {
  const f = new FormData(form);
  try {
    await api(`/requests/${encodeURIComponent(form.dataset.id)}/messages`, {
      method: "POST",
      body: { text: f.get("text"), anotherRound: f.get("anotherRound") === "on" },
    });
    tToast(t("req.messageSent"));
    route();
  } catch (x) {
    toast(x.message, "error");
  }
});
actions.on("req.suggest", async (el) => {
  try {
    await api(`/requests/${encodeURIComponent(el.dataset.id)}/suggestions`);
    route();
  } catch (x) {
    toast(x.message, "error");
  }
});
actions.on("req.search", async () => {
  const q = document.getElementById("rqSearch")?.value.trim();
  if (!q) return;
  try {
    const { suppliers = [] } = await api("/suppliers?q=" + encodeURIComponent(q)),
      rows = document.getElementById("rqPickRows"),
      shown = new Set([...rows.querySelectorAll("input[name=supplierIds]")].map((x) => x.value));
    rows.insertAdjacentHTML(
      "beforeend",
      suppliers
        .filter((s) => !shown.has(s.id))
        .map((s) => rqPick({ supplierId: s.id, company: s.company, location: s.location }, new Set()))
        .join("") || `<tr><td colspan="4">${rqk("noMatches")}</td></tr>`,
    );
  } catch (x) {
    toast(x.message, "error");
  }
});
actions.on("req.invite", async (form) => {
  const f = new FormData(form),
    supplierIds = f.getAll("supplierIds");
  if (!supplierIds.length) return toast(t("req.chooseSuppliers"), "error");
  try {
    await api(`/requests/${encodeURIComponent(form.dataset.id)}/invitations`, {
      method: "POST",
      body: { supplierIds, dueDate: f.get("dueDate") || undefined },
    });
    tToast(t("req.invited", { n: supplierIds.length }));
    route();
  } catch (x) {
    toast(x.message, "error");
  }
});
async function rqAdminDetail(params) {
  const { request: r } = await api("/requests/" + encodeURIComponent(params.id)),
    open = RQ_OPEN.includes(r.status);
  const take =
    r.status === "New"
      ? `<form class="cc-actions rq-take" data-action="req.take" data-id="${esc(r.id)}"><label>${rqk("optionsByLabel")}<input type="date" name="optionsBy" required value="${new Date(Date.now() + 5 * 86400000).toISOString().slice(0, 10)}"></label><button class="btn primary">${rqk("take")}</button></form>`
      : "";
  app.innerHTML = dashboardShell(
    "admin",
    "requests",
    `<div class="breadcrumb"><a href="#/admin/requests">${rqk("backQueue")}</a></div><div class="dash-top"><div><h1><bdi>${esc(r.title)}</bdi></h1><p>${rqChip(r.status)} · <bdi>${esc(r.customerCompany || "")}</bdi> · <bdi>${esc(r.customerName || "")}</bdi>${r.operatorName ? ` · ${rqk("handledBy", { name: r.operatorName })}` : ""}</p></div>${
      open
        ? `<button class="btn outline danger" data-action="req.close" data-id="${esc(r.id)}">${rqk("close")}</button>`
        : ""
    }</div>${take}
<section class="panel"><h3>${rqk("details")}</h3>${rqFacts(r)}${rqPackages(r)}<p class="rq-description"><bdi>${esc(r.description)}</bdi></p></section>
${rqAwardNote(r, "admin")}${
      r.outsideArea
        ? `<div class="notice warn">${rqk("outsideAreaAdmin", {
            region: r.outsideArea.region || t("req.noPostcode"),
            categories: (r.outsideArea.categories || []).join(", "),
          })}</div>`
        : ""
    }${(r.estimateGap || []).length ? `<div class="notice warn">${rqk("estimate.gap", { list: r.estimateGap.join(", ") })}</div>` : ""}${
      (r.estimateSkipped || []).length
        ? `<div class="notice warn"><b>${rqk("estimate.skippedTitle")}</b><ul>${r.estimateSkipped
            .map((x) => `<li>${rqk("estimate.skipped", { package: x.package, rate: fmt.money(x.rate), low: fmt.money(x.p25), high: fmt.money(x.p75) })}</li>`)
            .join("")}</ul></div>`
        : ""
    }${
      (r.leakHints || []).length
        ? `<div class="notice warn"><b>${rqk("leak.title", { n: r.leakHints.length })}</b> ${r.leakHints
            .slice(-5)
            .map((h) =>
              rqk("leak.item", {
                date: fmt.date(h.at),
                who: rqk("leak.role." + (h.role === "supplier" ? "supplier" : "customer")),
                where: rqk("leak.where." + (h.where === "offer" ? "offer" : "chat")),
              }),
            )
            .join(" · ")}</div>`
        : ""
    }<section class="panel"><h3>${rqk("files")}</h3>${rqFiles(r)}</section>${rqSourcingPanel(r)}${rqThread(r, "admin")}
<section class="panel"><h3>${rqk("note")}</h3><form class="modal-form" data-action="req.note" data-id="${esc(r.id)}"><textarea name="note" rows="4" maxlength="5000" placeholder="${rqk("notePlaceholder")}">${esc(r.operatorNote || "")}</textarea><div class="cc-actions"><button class="btn outline">${rqk("saveNote")}</button></div></form></section>
<section class="panel"><h3>${rqk("timeline")}</h3>${rqTimeline(r)}</section>`,
  );
}
const rqPatch = async (id, body, done) => {
  try {
    await api("/requests/" + encodeURIComponent(id), { method: "PATCH", body });
    tToast(t(done));
    route();
  } catch (x) {
    toast(x.message, "error");
  }
};
actions.on("req.take", (form) =>
  rqPatch(form.dataset.id, { action: "take", optionsBy: new FormData(form).get("optionsBy") }, "req.taken"),
);
actions.on("req.note", (form) =>
  rqPatch(form.dataset.id, { action: "note", note: new FormData(form).get("note") }, "req.noteSaved"),
);
actions.on("req.close", async (el) => {
  const reason = await uiDialog({
    title: t("req.closeTitle"),
    message: t("req.closeText"),
    input: true,
    required: true,
    confirmLabel: t("req.close"),
    danger: true,
  });
  if (!reason) return;
  rqPatch(el.dataset.id, { action: "close", reason }, "req.closed");
});

/* ---------- T225: the supplier confirms a platform order ---------- */
async function rqSupplierOrders() {
  const { orders = [] } = await api("/brokered-orders");
  const card = (o) => {
    const waiting = o.status === "Waiting for supplier",
      pending = o.status === "Price changed";
    return `<article class="panel rq-order"><div class="panel-title"><div><span class="eyebrow">${rqk(o.region ? "order.eyebrow" : "order.eyebrowNoRegion", { region: o.region })}</span><h3><bdi>${esc(o.title)}</bdi></h3></div><span class="status ${
      waiting ? "submitted" : "completed"
    }">${rqk("order.status." + (waiting ? "waiting" : pending ? "priceChanged" : "accepted"))}</span></div><p class="rq-description"><bdi>${esc(o.description)}</bdi></p>${
      (o.packages || []).length
        ? `<ul class="rq-pkg-list">${o.packages.map((x) => `<li><b><bdi>${esc(x.name)}</bdi></b> · <bdi>${esc(x.category)}</bdi> · ${rqk("pkg.hoursN", { n: x.hours })}</li>`).join("")}</ul>`
        : ""
    }${o.fixed ? `<p class="notice">${rqk("order.packageNote", { n: o.units || 1 })}</p>` : ""}${o.estimate && waiting ? `<p class="subtle">${rqk("order.estimateNote")}</p>` : ""}${pending ? `<p class="subtle">${rqk("order.priceWaiting", { price: fmt.money(o.proposedAmount) })}</p>` : ""}<dl class="rq-facts"><div><dt>${rqk("field.category")}</dt><dd><bdi>${esc(o.category)}</bdi></dd></div><div><dt>${rqk(
      "order.amount",
    )}</dt><dd>${esc(fmt.money(o.amount))}</dd></div><div><dt>${rqk("order.days")}</dt><dd>${rqk("daysN", { n: o.deliveryDays })}</dd></div>${
      waiting
        ? `<div><dt>${rqk("order.answerBy")}</dt><dd>${esc(fmt.date(o.expiresAt))}</dd></div>`
        : `<div><dt>${rqk("order.customer")}</dt><dd><bdi>${esc(o.customerCompany || "")}</bdi></dd></div>`
    }</dl>${
      waiting
        ? `<form class="modal-form" data-action="req.acceptOrder" data-id="${esc(o.requestId)}" data-hash="${esc(o.clause.hash)}"><div class="rq-clause"><bdi>${esc(o.clause.text)}</bdi></div><small class="subtle">${rqk(
            "clauseVersion",
            {
              n: o.clause.version,
              months: o.clause.months,
            },
          )}</small>${
            o.estimate
              ? `<div class="cc-platform-grid"><label>${rqk("order.yourPrice")}<input type="number" name="price" min="1" step="1" value="${esc(o.amount)}"></label><label>${rqk("order.priceReason")}<input name="note" maxlength="1000" placeholder="${rqk("order.priceReasonPh")}"></label></div>`
              : ""
          }<label class="cc-check-label"><input type="checkbox" name="accept" required> ${rqk("acceptClauseSupplier")}</label><div class="cc-actions"><button class="btn primary">${rqk("order.accept")}</button><button type="button" class="btn outline danger" data-action="req.declineOrder" data-id="${esc(
            o.requestId,
          )}">${rqk("order.decline")}</button></div></form>`
        : o.projectId
          ? `<a class="btn outline" href="#/supplier/projects/${esc(o.projectId)}">${rqk("openProject")}</a>`
          : ""
    }</article>`;
  };
  app.innerHTML = dashboardShell(
    "supplier",
    "orders",
    `<div class="dash-top"><div><h1>${rqk("order.title")}</h1><p>${rqk("order.lead")}</p><p><a href="#/ranking">${esc(t("public.ranking.link"))}</a></p></div></div>${
      orders.map(card).join("") ||
      `<div class="empty"><h2>${rqk("order.empty")}</h2><p>${rqk("order.emptyText")}</p></div>`
    }`,
  );
}
actions.on("req.acceptOrder", async (form) => {
  try {
    await api(`/brokered-orders/${encodeURIComponent(form.dataset.id)}/accept`, {
      method: "POST",
      body: {
        acceptClause: form.elements.accept.checked,
        clauseHash: form.dataset.hash,
        // T232: a changed price needs a reason; the same price confirms the estimate
        ...(form.elements.price ? { price: form.elements.price.value, note: form.elements.note.value } : {}),
      },
    });
    tToast(t("req.order.accepted"));
    route();
  } catch (x) {
    toast(x.message, "error");
  }
});
actions.on("req.declineOrder", async (el) => {
  const ok = await uiDialog({
    title: t("req.order.declineTitle"),
    message: t("req.order.declineText"),
    confirmLabel: t("req.order.decline"),
    danger: true,
  });
  if (!ok) return;
  try {
    await api(`/brokered-orders/${encodeURIComponent(el.dataset.id)}/decline`, { method: "POST", body: {} });
    tToast(t("req.order.declined"));
    route();
  } catch (x) {
    toast(x.message, "error");
  }
});
routes.add("/supplier/orders", rqSupplierOrders);
routes.add("/customer/requests", rqCustomerList);
routes.add("/customer/requests/new", rqNewPage);
routes.add("/customer/requests/:id", rqCustomerDetail);
routes.add("/admin/requests", rqAdminQueue);
routes.add("/admin/requests/:id", rqAdminDetail);
