/* Area: projects (T128). T128a moves the customer's project list, "Create new project" and the supplier's
   "Assigned work" here, drawn with translation keys and data-action handlers. Project, phase and task names,
   descriptions and statuses are stored data: they keep the old translation for display (data-i18n="dom"). */
const prk = (key, params) => esc(t("projects." + key, params));
const prDom = (text) => `<span data-i18n="dom">${esc(text)}</span>`;
const prStatus = (s) => `<span class="status ${esc(String(s || "").toLowerCase().replaceAll(" ", "-"))}" data-i18n="dom">${esc(s)}</span>`;
// Every top-level element of the page is marked, so the page keeps the structure the styles expect
const prKeys = (...parts) => parts.filter(Boolean).map((html) => html.replace(/^<(\w+)/, '<$1 data-i18n="keys"')).join("");

/* ---------- Customer: project list ---------- */
async function prCustomerProjects(params, query) {
  const archived = query.get("archived") === "1",
    { projects = [] } = await api("/projects" + (archived ? "?archived=1" : ""));
  const card = (p) =>
    `<a class="cc-card click project-card" href="#/customer/projects/${esc(p.id)}"><div class="project-card-head"><b>${esc(p.name)}</b>${prStatus(p.status)}</div><p data-i18n="dom">${esc(p.description)}</p><div class="timeline-line"><i style="width:${pct(p.phases)}%"></i></div><div class="supplier-meta"><span>${prk("list.complete", { n: pct(p.phases) })}</span><span>${prk("list.due", { date: fmt.date(p.dueDate) })}</span></div><span class="btn small outline project-open">${prk("list.open")}</span></a>`;
  app.innerHTML = dashboardShell(
    "customer",
    "projects",
    prKeys(
      `<div class="dash-top"><div><h1>${prk("list.title")}</h1><p>${prk("list.intro")}</p></div><div class="cc-actions"><label class="btn outline"><input type="checkbox" data-action="projects.archived"${archived ? " checked" : ""}> ${prk("list.showArchived")}</label><a class="btn outline" href="#/customer/offers">${prk("list.offers")}</a><a class="btn primary" href="#/customer/projects/new">${prk("list.new")}</a></div></div>`,
      `<div class="cc-grid">${projects.map(card).join("") || `<div class="empty">${prk("list.empty")}</div>`}</div>`,
    ),
  );
}
actions.on("projects.archived", (el) => navigate("/customer/projects" + (el.checked ? "?archived=1" : "")));

/* ---------- Customer: create a project from a template ---------- */
// Phase and task names are saved as written here, so they stay English data
const PR_TEMPLATES = {
  waterfall: [
    ["Design", ["Concept & specification"]],
    ["Manufacturing", ["Fabrication"]],
    ["Programming", ["PLC / controls programming"]],
    ["Installation", ["Site installation"]],
    ["Commissioning", ["Commissioning & SAT"]],
  ],
  robotcell: [
    ["Engineering & validation", ["Layout & interface design", "Machine safety review"]],
    ["Build & integration", ["Cell fabrication", "PLC and safety controls"]],
    ["FAT", ["Factory acceptance test"]],
    ["Site acceptance & handover", ["Installation and SAT", "Operator training & handover"]],
  ],
  retrofit: [
    ["Assessment", ["Condition survey", "Retrofit concept"]],
    ["Procurement", ["Parts & BOM ordering"]],
    ["Retrofit execution", ["Mechanical rework", "Electrical & controls upgrade"]],
    ["Validation", ["Restart & acceptance"]],
  ],
  lineexpansion: [
    ["Planning", ["Capacity study", "Line layout"]],
    ["Design", ["Mechanical design", "Electrical design"]],
    ["Build", ["Manufacturing", "Assembly"]],
    ["Installation", ["Installation", "Utilities hook-up"]],
    ["Ramp-up", ["Commissioning", "Production ramp-up support"]],
  ],
  blank: [["Planning", []]],
};
const prTemplatePreview = (key) =>
  PR_TEMPLATES[key]
    .map(([name, tasks], i) => `<div><b>${i + 1}. ${prDom(name)}</b>${tasks.length ? `<small>${tasks.map(prDom).join(" · ")}</small>` : ""}</div>`)
    .join("");
function prNewProject() {
  const today = new Date().toISOString().slice(0, 10),
    c = (key) => prk("create." + key);
  app.innerHTML = dashboardShell(
    "customer",
    "projects",
    `<div class="form-card pa-new-project" data-i18n="keys"><div class="breadcrumb"><a href="#/customer/projects">${c("back")}</a></div><h1>${c("title")}</h1><p>${c("intro")}</p><form id="paNewProject" data-action="projects.create"><div class="two"><label>${c("name")}<input name="name" required maxlength="140"></label><label>${c("budget")}<input name="budget" type="number" min="1" step="0.01" required></label></div><label>${c("description")}<textarea name="description" required maxlength="5000" rows="3" placeholder="${c("descriptionHint")}"></textarea></label><label>${c("requirements")}<textarea name="requirements" maxlength="5000" rows="3" placeholder="${c("requirementsHint")}"></textarea></label><div class="two"><label>${c("location")}<input name="location" maxlength="240" placeholder="${c("locationHint")}"></label><label>${c("template")}<select name="template" data-action="projects.template">${Object.keys(PR_TEMPLATES)
      .map((k) => `<option value="${k}">${c("templates." + k)}</option>`)
      .join("")}</select></label></div><div class="pa-template-preview" id="paTemplatePreview">${prTemplatePreview("waterfall")}</div><div class="two"><label>${c("start")}<input name="startDate" type="date" value="${today}"></label><label>${c("dueDate")}<input name="dueDate" type="date" min="${today}" required></label></div><label>${c("files")}<input name="files" type="file" multiple accept=".pdf,.png,.jpg,.jpeg,.dwg,.dxf,.step,.stp,.xlsx,.csv,.docx,.zip"></label><div id="projectError" class="form-error" data-i18n="dom" role="alert"></div><div class="action-row"><button class="btn primary">${c("submit")}</button><a class="btn outline" href="#/customer/projects">${c("cancel")}</a></div></form></div>`,
  );
}
actions.on("projects.template", (el) => (document.getElementById("paTemplatePreview").innerHTML = prTemplatePreview(el.value)));
actions.on("projects.create", async (form) => {
  const error = document.getElementById("projectError"),
    btn = form.querySelector("button.primary");
  error.textContent = "";
  const f = Object.fromEntries(new FormData(form));
  delete f.files;
  f.phases = PR_TEMPLATES[f.template].map(([name, tasks]) => ({ name, description: `${name} work package`, tasks }));
  btn.disabled = true;
  try {
    const { project } = await api("/projects", { method: "POST", body: f });
    for (const file of [...form.files.files].slice(0, 10)) {
      try {
        const up = await uploadFile(file);
        await api(`/projects/${project.id}/documents`, {
          method: "POST",
          body: { filename: up.filename, url: up.url, category: "Specifications", description: "Attached at project creation" },
        });
      } catch (x) {
        toast(`${file.name}: ${x.message}`, "error");
      }
    }
    tToast(t("projects.create.created"));
    navigate("/customer/projects/" + project.id);
  } catch (x) {
    // Server messages keep the old translation
    error.innerHTML = `<span data-i18n="dom">${esc(x.message)}</span>`;
    btn.disabled = false;
  }
});

/* ---------- Supplier: assigned work, invitations first ---------- */
async function prSupplierWork(params, query) {
  const projects = (await api("/projects")).projects || [],
    sid = state.user.supplierId,
    invites = [],
    work = [];
  for (const p of projects)
    for (const ph of p.phases || []) {
      if (ph.supplierId === sid && ph.acceptanceStatus === "Pending") invites.push({ p, ph });
      for (const x of ph.tasks || []) {
        if (x.assignedSupplierId !== sid) continue;
        (x.acceptanceStatus === "Pending" ? invites : work).push({ p, ph, t: x });
      }
    }
  const highlight = query.get("invite"),
    w = (key, params) => prk("work." + key, params);
  const inviteCard = (x) => {
    const item = x.t || x.ph,
      invited = [...(item.assignmentHistory || [])].reverse().find((h) => h.status === "Invited")?.at || item.invitedAt,
      answer = (accept, cls, label) =>
        `<button class="${cls}" data-action="dash.answer" data-project="${esc(x.p.id)}" ${x.t ? `data-task="${esc(x.t.id)}"` : `data-phase="${esc(x.ph.id)}"`} data-accept="${accept}">${label}</button>`;
    return `<article class="inv-card ${highlight === item.id ? "inv-highlight" : ""}" id="inv-${esc(item.id)}"><div class="inv-card-main"><span class="eyebrow">${w(x.t ? "taskInvite" : "phaseInvite")} · ${esc(x.p.name)}${x.t ? " · " + prDom(x.ph.name) : ""}</span><h3>${esc(item.name)}</h3>${item.description ? `<p data-i18n="dom">${esc(item.description)}</p>` : ""}<div class="inv-facts"><span><small>${w("schedule")}</small><b>${esc(fmt.date(item.startDate))} → ${esc(fmt.date(item.dueDate))}</b></span><span><small>${w("orderValue")}</small><b>${item.orderAmount ? esc(fmt.money(item.orderAmount)) : w("notSet")}</b></span>${invited ? `<span><small>${w("invited")}</small><b>${esc(fmt.date(invited))}</b></span>` : ""}</div></div><div class="inv-card-actions">${answer(true, "btn primary", w(x.t ? "acceptTask" : "acceptPhase"))}${answer(false, "btn outline", w("decline"))}<a class="btn ghost small" href="#/supplier/projects/${esc(x.p.id)}">${w("viewProject")}</a></div></article>`;
  };
  const workCard = ({ p, ph, t: x }) => {
    const progress = Math.min(100, Number(x.progress) || 0),
      q = `project=${encodeURIComponent(p.id)}&phase=${encodeURIComponent(ph.id)}&task=${encodeURIComponent(x.id)}`,
      back = `&back=${encodeURIComponent("/supplier/projects/" + p.id)}`;
    return `<article class="panel review-work-card"><div class="project-card-head"><div><span class="eyebrow">${esc(p.name)} · ${prDom(ph.name)}</span><h3>${esc(x.name)}</h3></div>${prStatus(x.status || "Not Started")}</div><p data-i18n="dom">${esc(x.description || "")}</p><div class="wf-task-meta"><span>${esc(fmt.date(x.startDate))} → ${esc(fmt.date(x.dueDate))}</span><span>${w("complete", { n: progress })}</span></div><div class="timeline-line"><i style="width:${progress}%"></i></div><div class="cc-actions"><button class="btn small outline" data-action="projects.progress" data-project="${esc(p.id)}" data-phase="${esc(ph.id)}" data-task="${esc(x.id)}" data-progress="${progress}">${w("updateProgress")}</button><a class="btn small outline" href="#/supplier/projects/${esc(p.id)}/documents?phase=${esc(encodeURIComponent(ph.id))}&amp;task=${esc(encodeURIComponent(x.id))}">${w("documents")}</a><a class="btn small outline" href="#/supplier/invoices?${esc(q + back)}">${w("invoices")}</a><a class="btn small outline" href="#/supplier/messages?${esc(q + back)}">${w("messages")}</a></div></article>`;
  };
  app.innerHTML = dashboardShell(
    "supplier",
    "phases",
    prKeys(
      `<div class="dash-top"><div><h1>${w("title")}</h1><p>${w("intro")}</p></div><a class="btn outline" href="#/supplier/bids">${w("findMore")}</a></div>`,
      invites.length
        ? `<section class="panel inv-panel"><div class="panel-title"><h3>${w("waiting")}</h3><span class="ui-count">${invites.length}</span></div><p class="subtle inv-hint">${w("hint")}</p><div class="inv-list">${invites.map(inviteCard).join("")}</div></section>`
        : "",
      `<div class="panel-title inv-work-title"><h3>${w("accepted")}</h3><span class="ui-count">${work.length}</span></div>`,
      `<div class="review-work-grid">${work.map(workCard).join("") || `<div class="empty">${w("empty")}</div>`}</div>`,
    ),
  );
  if (highlight) document.getElementById("inv-" + highlight)?.scrollIntoView({ block: "center" });
}
actions.on("projects.progress", (el) => pdProgress(el.dataset.project, el.dataset.phase, el.dataset.task, Number(el.dataset.progress)));

routes.add("/customer/projects", prCustomerProjects);
routes.add("/customer/projects/new", prNewProject);
routes.add("/supplier/projects", prSupplierWork);
routes.add("/supplier/phases", prSupplierWork);
