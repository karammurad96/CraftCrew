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
function rqTimeline(r) {
  return `<ol class="rq-timeline">${(r.history || [])
    .map(
      (h) =>
        `<li>${rqChip(h.status)} <span>${esc(fmt.date(h.at))}</span> <small>${rqk("by." + (h.by === "platform" ? "platform" : state.user?.role === "admin" ? "theCustomer" : "customer"))}</small>${h.note ? `<p><bdi>${esc(h.note)}</bdi></p>` : ""}</li>`,
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
async function rqNewPage(params, query) {
  const cfg = await api("/platform-config").catch(() => ({})),
    cats = cfg.serviceCategories || [],
    pre = (k) => esc(query?.get(k) || "");
  app.innerHTML = dashboardShell(
    "customer",
    "requests",
    `<div class="breadcrumb"><a href="#/customer/requests">${rqk("back")}</a></div><div class="dash-top"><div><h1>${rqk("newTitle")}</h1><p>${rqk("newLead")}</p></div></div>
<form class="panel modal-form rq-form" data-action="req.create">
<input type="hidden" name="projectId" value="${pre("project")}"><input type="hidden" name="phaseId" value="${pre("phase")}"><input type="hidden" name="taskId" value="${pre("task")}">
<label>${rqk("field.title")}<input name="title" required minlength="3" maxlength="160" value="${pre("title")}" placeholder="${rqk("ph.title")}"></label>
<label>${rqk("field.category")}<select name="category" required><option value="">${rqk("chooseCategory")}</option>${cats.map((c) => `<option>${esc(c)}</option>`).join("")}</select></label>
<label>${rqk("field.description")}<textarea name="description" rows="7" required minlength="10" maxlength="5000" placeholder="${rqk("ph.description")}"></textarea></label>
<div class="cc-platform-grid"><label>${rqk("field.postcode")}<input name="sitePostcode" maxlength="10"></label><label>${rqk("field.city")}<input name="siteCity" maxlength="80"></label>
<label>${rqk("field.start")}<input type="date" name="startDate"></label><label>${rqk("field.due")}<input type="date" name="dueDate"></label>
<label>${rqk("field.budgetOptional")}<input type="number" name="budget" min="0" step="100"></label></div>
<label>${rqk("field.files")}<input type="file" name="files" multiple></label>
<p class="subtle">${rqk("privacyNote")}</p>
<div class="cc-actions"><button class="btn primary">${rqk("send")}</button><a class="btn outline" href="#/customer/requests">${rqk("cancel")}</a></div></form>`,
  );
}
actions.on("req.create", async (form) => {
  const f = new FormData(form),
    body = Object.fromEntries([...f.entries()].filter(([k]) => k !== "files"));
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
<section class="panel"><h3>${rqk("details")}</h3>${rqFacts(r)}<p class="rq-description"><bdi>${esc(r.description)}</bdi></p>${r.closeReason ? `<p class="rq-closed"><b>${rqk("closedReason")}</b> <bdi>${esc(r.closeReason)}</bdi></p>` : ""}</section>
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
            `<tr><td><a href="#/admin/requests/${esc(r.id)}"><b><bdi>${esc(r.title)}</bdi></b></a><small><bdi>${esc(r.category)}</bdi></small></td><td><bdi>${esc(r.customerCompany || r.customerName)}</bdi></td><td>${rqChip(r.status)}</td><td>${rqk("days", { n: rqAge(r) })}</td><td>${r.operatorName ? `<bdi>${esc(r.operatorName)}</bdi>` : "—"}</td></tr>`,
        )
        .join("") || `<tr><td colspan="5">${rqk("queueEmpty")}</td></tr>`
    }</tbody></table></div></section>`,
  );
}
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
<section class="panel"><h3>${rqk("details")}</h3>${rqFacts(r)}<p class="rq-description"><bdi>${esc(r.description)}</bdi></p></section>
<section class="panel"><h3>${rqk("files")}</h3>${rqFiles(r)}</section>
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

routes.add("/customer/requests", rqCustomerList);
routes.add("/customer/requests/new", rqNewPage);
routes.add("/customer/requests/:id", rqCustomerDetail);
routes.add("/admin/requests", rqAdminQueue);
routes.add("/admin/requests/:id", rqAdminDetail);
