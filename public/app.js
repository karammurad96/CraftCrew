/* CraftCrew frontend. Business data is server-persisted. The session lives in an HttpOnly cookie that scripts
   can't read (T124); localStorage keeps only the signed-in user's profile and UI preferences. */
const API = "/api";
// A supplier's badge for display: the tier, "Verified" without a tier, or "Not yet verified" — never "None".
const supplierBadge = (s) =>
  s?.badge && s.badge !== "None" ? s.badge : s?.verified || s?.live ? "Verified" : "Not yet verified";
let apiBusy = 0;
// Invoices show their sequential number to people; the id stays for links and the API.
const invNo = (i) => i?.number || i?.id || "";
// Net amount of an invoice; older invoices without VAT data only have `amount`, which is net.
const invNet = (i) => Number(i?.netAmount ?? i?.amount) || 0;
// state.token is only a "signed in" marker now; the secret itself is in the cookie.
const state = {
  user: JSON.parse(localStorage.getItem("cc_user") || "null"),
  token: localStorage.getItem("cc_user") ? "session" : "",
  cache: {},
};
// Browsers signed in before T124 still hold the token in localStorage: move it to the cookie once, then forget it.
const ccSessionReady = (() => {
  const legacy = localStorage.getItem("cc_token");
  if (!legacy) return Promise.resolve();
  localStorage.removeItem("cc_token");
  return fetch("/api/auth/upgrade", { method: "POST", headers: { Authorization: "Bearer " + legacy } })
    .then(async (r) => {
      await r.text(); // read the reply, so the request is finished and not left open
      if (r.ok) state.token = "session";
    })
    .catch(() => {});
})();
// After a successful sign-in or sign-up: remember who is signed in (the server has set the cookie).
function ccSignedIn(user) {
  state.user = user;
  state.token = "session";
  localStorage.setItem("cc_user", JSON.stringify(user));
  localStorage.removeItem("cc_token");
}
const app = document.getElementById("app"),
  modalRoot = document.getElementById("modalRoot"),
  toastEl = document.getElementById("toast");
const esc = (s) =>
  String(s ?? "").replace(
    /[&<>'"]/g,
    (c) => ({ "&": "&amp;", "<": "&lt;", ">": "&gt;", "'": "&#39;", '"': "&quot;" })[c],
  );
const money = (n) =>
  new Intl.NumberFormat("en-US", { style: "currency", currency: "EUR", maximumFractionDigits: 0 }).format(
    Number(n) || 0,
  );
const date = (d) =>
  d ? new Date(d).toLocaleDateString("en-GB", { day: "2-digit", month: "short", year: "numeric" }) : "—";
const pct = (p) =>
  Math.round((p?.length ? p.filter((x) => x.status === "Completed").length / p.length : 0) * 100);
function toast(msg, type = "success") {
  delete toastEl.dataset.i18n; // tToast marks text that is already translated
  toastEl.textContent = msg;
  toastEl.className = "toast " + type;
  toastEl.style.display = "block";
  setTimeout(() => (toastEl.style.display = "none"), 2800);
}
async function api(path, opts = {}) {
  await ccSessionReady;
  // The cookie goes along automatically; X-CSRF proves the request comes from this page (T124).
  opts.credentials = "same-origin";
  opts.headers = { ...(opts.headers || {}), "X-CSRF": "1" };
  if (opts.body && typeof opts.body !== "string") {
    opts.headers["Content-Type"] = "application/json";
    opts.body = JSON.stringify(opts.body);
  }
  // While a change is being saved, submit buttons are blocked so a double click can't send it twice.
  const busy = opts.method && opts.method !== "GET",
    button = busy && document.activeElement?.tagName === "BUTTON" ? document.activeElement : null;
  if (busy) {
    apiBusy++;
    document.body.classList.add("cc-busy");
    if (button) button.disabled = true;
  }
  try {
    const r = await fetch(API + path, opts);
    let d = {};
    try {
      d = await r.json();
    } catch {}
    if (!r.ok)
      throw Object.assign(new Error(d.error || "Request failed"), { status: r.status, code: d.code });
    return d;
  } finally {
    if (busy) {
      if (!--apiBusy) document.body.classList.remove("cc-busy");
      if (button) button.disabled = false;
    }
  }
}
async function uploadFile(file) {
  return new Promise((resolve, reject) => {
    const r = new FileReader();
    r.onload = async () => {
      try {
        resolve(
          (await api("/upload", { method: "POST", body: { filename: file.name, content: r.result } })).file,
        );
      } catch (e) {
        reject(e);
      }
    };
    r.onerror = reject;
    r.readAsDataURL(file);
  });
}
function navigate(path) {
  location.hash = path.startsWith("#") ? path.slice(1) : path;
}
function modal(title, body) {
  modalRoot.innerHTML = `<div class="modal-backdrop" id="mb"><div class="modal"><div class="modal-head"><h2>${title}</h2><button class="close" onclick="closeModal()">×</button></div>${body}</div></div>`;
}
function closeModal() {
  modalRoot.innerHTML = "";
}
function formFields(fields) {
  return fields
    .map(
      (f) =>
        `<label>${esc(f.label)}${f.required ? " *" : ""}<${f.type === "textarea" ? "textarea" : "input"} name="${f.name}" ${f.type === "number" ? 'type="number"' : f.type === "date" ? 'type="date"' : f.type === "email" ? 'type="email"' : f.type === "password" ? 'type="password"' : ""} ${f.required ? "required" : ""} placeholder="${esc(f.placeholder || "")}">${f.type === "textarea" ? "" : ""}</${f.type === "textarea" ? "textarea" : "input"}></label>`,
    )
    .join("");
}
function topActions() {
  const el = document.getElementById("topActions");
  if (state.user)
    el.innerHTML = `<span class="subtle">${esc(state.user.name)}</span><button class="btn outline" onclick="navigate('/${state.user.role}/dashboard')">Dashboard</button><button class="btn ghost" onclick="logout()">Log out</button>`;
  else el.innerHTML = `<button class="btn ghost login-btn" onclick="navigate('/login')">Log in</button>`;
}
async function logout() {
  const token = state.token;
  state.user = null;
  state.token = "";
  localStorage.removeItem("cc_user");
  localStorage.removeItem("cc_token");
  document.body.classList.remove("authenticated");
  try {
    // Ends the session on the server and clears the cookie
    if (token) await (await fetch(API + "/auth/logout", { method: "POST", headers: { "X-CSRF": "1" } })).text();
  } catch (e) {}
  topActions();
  navigate("/");
  setTimeout(updateCraftCrewShell, 0);
}
function publicLayout(content) {
  return `<div class="cc-shell">${content}</div>`;
}
function sidebar(role, active) {
  const links =
    role === "customer"
      ? [
          ["dashboard", "Dashboard"],
          ["projects", "Projects"],
          ["suppliers", "Find Suppliers"],
          ["invoices", "Invoices"],
          ["messages", "Messages"],
          ["profile", "Profile / Settings"],
        ]
      : role === "supplier"
        ? [
            ["dashboard", "Dashboard"],
            ["phases", "Assigned Phases"],
            ["projects", "Projects"],
            ["invoices", "Invoices"],
            ["suppliers", "Service Catalog"],
            ["messages", "Messages"],
            ["profile", "Profile / Billing"],
          ]
        : [
            ["dashboard", "Admin Dashboard"],
            ["applications", "Vetting Queue"],
            ["users", "Users"],
            ["billing", "Payments & Billing"],
            ["reports", "Reports & Analytics"],
            ["disputes", "Escalations"],
            ["profile", "Settings"],
          ];
  return `<aside class="sidebar"><div class="brand side-brand"><span class="brand-mark" role="img" aria-label="CraftCrew logo"><svg viewBox="0 0 64 64" aria-hidden="true" focusable="false"><path d="M14 50C24 42 40 22 50 14"/><circle cx="14" cy="50" r="8.5"/><circle cx="50" cy="14" r="8.5"/></svg></span><span class="brand-word">Craft<span>Crew</span></span></div><div class="user-mini"><div class="avatar">${esc(
    (state.user?.name || "U")
      .split(" ")
      .map((x) => x[0])
      .join("")
      .slice(0, 2),
  )}</div><div><b>${esc(state.user?.name)}</b><small>${esc(state.user?.company || role)}</small></div></div><nav>${links.map(([k, t]) => `<a class="${active === k ? "active" : ""}" href="#/${role}/${k}">${t}</a>`).join("")}</nav><div class="help">Industrial services, coordinated end-to-end.<br><button class="btn small ghost" onclick="navigate('/faq')">Help & FAQ</button><button class="btn small danger" style="margin-top:8px;width:100%" onclick="logout()">Log out</button></div></aside>`;
}
function dashboardShell(role, active, content) {
  return `<div class="app-shell">${sidebar(role, active)}<section class="dashboard-content">${content}</section></div>`;
}
function publicHero() {
  return `<section class="hero-lite"><div><div class="eyebrow">INDUSTRIAL SERVICES, COORDINATED</div><h1>Build complex projects with <span>trusted crews.</span></h1><p>CraftCrew connects SMEs with vetted mechanical, electrical, automation and industrial service specialists — managed through one transparent waterfall workflow.</p><div class="hero-actions"><button class="btn primary lg" onclick="navigate('/signup')">Start a project</button><button class="btn outline lg" onclick="navigate('/suppliers')">Explore suppliers</button></div><div class="trust-row"><div><b>20+</b><small>vetted suppliers</small></div><div><b>5-stage</b><small>waterfall delivery</small></div><div><b>1 place</b><small>projects & payments</small></div></div></div><div class="hero-box"><div class="small-label">LIVE PROJECT CONTROL</div><h3 style="font-size:20px;margin:10px 0">Line 15 Integration</h3><div class="progress"><i style="width:68%"></i></div><div style="font-size:11px;color:#9eabc0">68% complete · 12 days remaining</div><div class="mini"><div><div class="small-label">ACTIVE PHASE</div><b>Programming</b><p style="color:#9eabc0">SPS Experts GmbH</p></div><div><div class="small-label">NEXT MILESTONE</div><b>Installation</b><p style="color:#9eabc0">18 Sep 2026</p></div></div></div></section>`;
}
async function renderSuppliers() {
  const q = document.getElementById("sq")?.value || "";
  let data;
  try {
    data = await api("/suppliers?q=" + encodeURIComponent(q));
  } catch (e) {
    toast(e.message, "error");
    return;
  }
  const filters = `<div class="searchbar"><input id="sq" value="${esc(q)}" placeholder="Search company, service or location"><select id="ss"><option value="">All services</option>${data.services.map((x) => `<option>${esc(x)}</option>`).join("")}</select><select id="sb"><option value="">All badges</option><option>Gold</option><option>Silver</option><option>Bronze</option></select><select id="sa"><option value="">Availability</option><option>Available</option><option>Busy</option></select><button class="btn primary" onclick="loadSupplierFilters()">Search</button></div>`;
  app.innerHTML = publicLayout(
    `<div class="cc-page"><div class="page-head"><div><div class="eyebrow">SUPPLIER DIRECTORY</div><h1>Find the right industrial specialist.</h1><p>Vetted suppliers with transparent capability and verification signals.</p></div><button class="btn outline" onclick="navigate('/supplier-application')">Apply as supplier</button></div>${filters}<div class="supplier-grid">${data.suppliers.map((s) => `<article class="supplier-card" onclick="supplierDetail('${s.id}')"><div class="supplier-top"><div class="supplier-avatar">${esc(s.avatar)}</div><div style="flex:1"><h3>${esc(s.company)}</h3><small>${esc(s.location)}</small></div><span class="badge ${s.badge.toLowerCase()}">${esc(supplierBadge(s))}</span></div><p>${s.services.map((x) => `<span class="chip">${esc(x)}</span>`).join("")}</p><div class="supplier-meta"><span>★ ${s.rating} · ${s.projectsCompleted} projects</span><span class="availability ${s.availability.toLowerCase()}">${s.availability}</span></div></article>`).join("")}</div></div>`,
  );
}
async function loadSupplierFilters() {
  const q = document.getElementById("sq").value,
    service = document.getElementById("ss").value,
    badge = document.getElementById("sb").value,
    availability = document.getElementById("sa").value;
  const d = await api(
    `/suppliers?q=${encodeURIComponent(q)}&service=${encodeURIComponent(service)}&badge=${encodeURIComponent(badge)}&availability=${encodeURIComponent(availability)}`,
  );
  document.querySelector(".supplier-grid").innerHTML = d.suppliers
    .map(
      (s) =>
        `<article class="supplier-card" onclick="supplierDetail('${s.id}')"><div class="supplier-top"><div class="supplier-avatar">${esc(s.avatar)}</div><div style="flex:1"><h3>${esc(s.company)}</h3><small>${esc(s.location)}</small></div><span class="badge ${s.badge.toLowerCase()}">${esc(supplierBadge(s))}</span></div><p>${s.services.map((x) => `<span class="chip">${esc(x)}</span>`).join("")}</p><div class="supplier-meta"><span>★ ${s.rating} · ${s.projectsCompleted} projects</span><span class="availability ${s.availability.toLowerCase()}">${s.availability}</span></div></article>`,
    )
    .join("");
}
async function supplierDetail(id) {
  const { supplier: s } = await api("/suppliers/" + id);
  modal(
    s.company,
    `<div class="detail-grid"><div class="detail-box"><small>Location</small><b>${esc(s.location)}</b></div><div class="detail-box"><small>Badge / Rating</small><b>${esc(supplierBadge(s))} · ★ ${s.rating}</b></div><div class="detail-box"><small>Experience</small><b>${s.experience} years · ${s.projectsCompleted} projects</b></div><div class="detail-box"><small>Rates</small><b>${money(s.hourlyRate)}/h · from ${money(s.projectRate)}</b></div></div><p>${esc(s.description)}</p><h4>Services</h4><div>${s.services.map((x) => `<span class="chip">${esc(x)}</span>`).join("")}</div><h4>Certifications</h4><div>${s.certifications.map((x) => `<span class="chip">${esc(x)}</span>`).join("")}</div><h4>Reviews</h4>${s.reviews.map((r) => `<div class="notice">★ ${r.rating} — ${esc(r.text)}</div>`).join("")}`,
  );
}
async function customerDashboard() {
  const d = await api("/dashboard");
  const ps = d.projects;
  app.innerHTML = dashboardShell(
    "customer",
    "dashboard",
    `<div class="dash-top"><div><h1>Customer dashboard</h1><p>Coordinate active projects, phases and payments.</p></div><button class="btn primary" onclick="navigate('/customer/projects/new')">+ New project</button></div><div class="stats"><div><span class="cc-label">Active projects</span><strong>${ps.filter((p) => p.status === "In Progress").length}</strong></div><div><span class="cc-label">Completed</span><strong>${ps.filter((p) => p.status === "Completed").length}</strong></div><div><span class="cc-label">Pending invoices</span><strong>${d.invoices.filter((i) => i.status === "Submitted").length}</strong></div><div><span class="cc-label">Project value</span><strong>${money(ps.reduce((a, p) => a + p.budget, 0))}</strong></div></div><div class="dashboard-grid"><div class="panel"><div class="panel-title"><h3>Active projects</h3><a href="#/customer/projects">View all</a></div>${ps.map((p) => `<div class="project-row project-click" onclick="navigate('/customer/projects/${p.id}')"><div><b>${esc(p.name)}</b><small>${p.status} · due ${date(p.dueDate)}</small></div><div><div class="bar"><i style="width:${pct(p.phases)}%"></i></div></div><b>${pct(p.phases)}%</b></div>`).join("")}</div><div class="panel"><div class="panel-title"><h3>Invoices</h3><a href="#/customer/invoices">Review</a></div>${
      d.invoices
        .slice(0, 6)
        .map(
          (i) =>
            `<div class="project-row" style="grid-template-columns:1fr auto"><div><b>${esc(invNo(i))}</b><small>${money(i.amount)}</small></div><span class="status ${i.status.toLowerCase().replaceAll(" ", "-")}">${esc(i.status)}</span></div>`,
        )
        .join("") || '<div class="empty">No invoices.</div>'
    }</div></div>`,
  );
}
async function customerProjects() {
  const d = await api("/projects");
  app.innerHTML = dashboardShell(
    "customer",
    "projects",
    `<div class="dash-top"><div><h1>Projects</h1><p>Waterfall delivery across your industrial work.</p></div><button class="btn primary" onclick="navigate('/customer/projects/new')">+ New project</button></div><div class="cc-grid">${d.projects.map((p) => `<article class="cc-card click" onclick="navigate('/customer/projects/${p.id}')"><div style="display:flex;justify-content:space-between"><b>${esc(p.name)}</b><span class="status ${p.status.toLowerCase().replaceAll(" ", "-")}">${p.status}</span></div><p>${esc(p.description)}</p><div class="timeline-line"><i style="width:${pct(p.phases)}%"></i></div><div class="supplier-meta"><span>${pct(p.phases)}% complete</span><span>Due ${date(p.dueDate)}</span></div></article>`).join("")}</div>`,
  );
}
async function newProject() {
  app.innerHTML = dashboardShell(
    "customer",
    "projects",
    `<div class="form-card"><h1>Create new project</h1><p>Set the project envelope. CraftCrew creates five default waterfall phases that you can edit, reorder and assign.</p><form id="newProjectForm"><div class="two"><label>Project name *<input name="name" required></label><label>Budget (€) *<input name="budget" type="number" min="1" required></label></div><label>Description *<textarea name="description" required></textarea></label><div class="two"><label>Start date<input name="startDate" type="date" value="${new Date().toISOString().slice(0, 10)}"></label><label>Due date *<input name="dueDate" type="date" required></label></div><button class="btn primary">Create project</button></form></div>`,
  );
  document.getElementById("newProjectForm").onsubmit = async (e) => {
    e.preventDefault();
    const b = Object.fromEntries(new FormData(e.target));
    try {
      const d = await api("/projects", { method: "POST", body: b });
      toast("Project created");
      navigate("/customer/projects/" + d.project.id);
    } catch (err) {
      toast(err.message, "error");
    }
  };
}
async function projectDetail(pid) {
  const d = await api("/projects/" + pid),
    p = d.project;
  const canComplete = p.phases.length && p.phases.every((x) => x.status === "Completed");
  app.innerHTML = dashboardShell(
    "customer",
    "projects",
    `<div class="breadcrumb"><a href="#/customer/projects">Projects</a> / ${esc(p.name)}</div><div class="dash-top"><div><h1>${esc(p.name)}</h1><p>${esc(p.description)}</p></div><div class="cc-actions"><button class="btn outline" onclick="editProject('${p.id}')">Edit</button><button class="btn outline" onclick="openSupport('${p.id}')">Escalate / Support</button><button class="btn danger" onclick="deleteProject('${p.id}')">Delete</button></div></div><div class="health"><div class="cc-card"><span class="cc-label">Budget</span><b>${money(p.budget)}</b></div><div class="cc-card"><span class="cc-label">Timeline</span><b>${date(p.startDate)} → ${date(p.dueDate)}</b></div><div class="cc-card"><span class="cc-label">Overall progress</span><b>${pct(p.phases)}%</b><div class="progress"><i style="width:${pct(p.phases)}%"></i></div></div></div><div class="panel" style="margin-top:15px"><div class="panel-title"><h3>Waterfall phases</h3><button class="btn small primary" onclick="addPhase('${p.id}')">+ Add phase</button></div><div id="phaseList">${p.phases.map((ph, i) => phaseCard(p, ph, i, d.suppliers)).join("")}</div>${p.status !== "Completed" ? `<div class="action-row"><button class="btn success" ${canComplete ? "" : "disabled"} onclick="completeProject('${p.id}')">Mark project complete</button><span class="subtle">All phases must be completed first. Final completion closes the lifecycle.</span></div>` : `<div class="action-row"><button class="btn primary" onclick="reviewProjectSuppliers('${p.id}')">Review suppliers</button></div>`}</div>`,
  );
}
function phaseCard(p, ph, i, sups) {
  const s = sups.find((x) => x.id === ph.supplierId);
  return `<div class="phase-card" draggable="true" data-id="${ph.id}" ondragstart="dragStart(event)" ondragover="event.preventDefault()" ondrop="dropPhase(event,'${p.id}')"><div class="phase-card-head"><div><div style="display:flex;gap:8px;align-items:center"><span class="phase-dot ${ph.status === "Completed" ? "done" : ph.status === "In Progress" ? "active" : ""}">${i + 1}</span><h3>${esc(ph.name)}</h3><span class="status ${ph.status.toLowerCase().replaceAll(" ", "-")}">${ph.status}</span></div><p>${esc(ph.description)}</p></div><div class="cc-actions"><button class="btn small outline" onclick="editPhase('${p.id}','${ph.id}')">Edit</button><button class="btn small danger" onclick="deletePhase('${p.id}','${ph.id}')">Delete</button></div></div><div class="detail-grid"><div class="detail-box"><small>Timeline</small><b>${date(ph.startDate)} → ${date(ph.dueDate)}</b></div><div class="detail-box"><small>Supplier</small>${s ? `<div class="supplier-inline"><span class="supplier-avatar">${esc(s.avatar)}</span><b>${esc(s.company)}</b><span class="tag ${ph.acceptanceStatus === "Accepted" ? "green" : "orange"}">${esc(ph.acceptanceStatus)}</span></div>` : '<span class="muted">Unassigned</span>'}</div></div><div class="phase-tools"><button class="btn small primary" onclick="assignSupplier('${p.id}','${ph.id}')">${s ? "Reassign supplier" : "Assign supplier"}</button><label class="btn small outline">Upload deliverable<input type="file" hidden onchange="uploadDeliverable('${p.id}','${ph.id}',this)"></label>${(ph.deliverables || []).map((f) => `<span class="tag">📎 ${esc(f.filename)}</span>`).join("")}</div></div>`;
}
let dragged = null;
function dragStart(e) {
  dragged = e.currentTarget.dataset.id;
  e.dataTransfer.effectAllowed = "move";
}
async function dropPhase(e, pid) {
  const target = e.currentTarget.dataset.id;
  if (!dragged || dragged === target) return;
  const cards = [...document.querySelectorAll(".phase-card")],
    ids = cards.map((x) => x.dataset.id),
    a = ids.indexOf(dragged),
    b = ids.indexOf(target);
  ids.splice(a, 1);
  ids.splice(b, 0, dragged);
  await api(`/projects/${pid}/reorder`, { method: "POST", body: { phaseIds: ids } });
  toast("Phase order saved");
  projectDetail(pid);
}
async function editProject(id) {
  const { project: p } = await api("/projects/" + id);
  modal(
    "Edit project",
    `<form id="editP" class="modal-form"><label>Name<input name="name" value="${esc(p.name)}" required></label><label>Description<textarea name="description" required>${esc(p.description)}</textarea></label><div class="two"><label>Budget<input name="budget" type="number" value="${p.budget}" required></label><label>Due date<input name="dueDate" type="date" value="${p.dueDate}" required></label></div><label>Order reference (for e-invoices)<input name="buyerReference" maxlength="100" value="${esc(p.buyerReference || "")}" placeholder="Your purchase order or cost centre number"></label><label class="cc-check-label"><input type="checkbox" name="invoicesAfterAcceptance" ${p.invoicesAfterAcceptance ? "checked" : ""}> Invoices only after acceptance (suppliers can invoice a task once you have signed its acceptance report)</label><button class="btn primary">Save</button></form>`,
  );
  document.getElementById("editP").onsubmit = async (e) => {
    e.preventDefault();
    const fd = new FormData(e.target),
      body = Object.fromEntries(fd);
    body.invoicesAfterAcceptance = fd.has("invoicesAfterAcceptance");
    await api("/projects/" + id, { method: "PUT", body });
    closeModal();
    toast("Project updated");
    projectDetail(id);
  };
}
async function deleteProject(id) {
  if (
    !(await uiConfirm(
      "Delete this project? Projects with invoices, documents or accepted suppliers are archived instead.",
    ))
  )
    return;
  try {
    const r = await api("/projects/" + id, { method: "DELETE" });
    toast(r.archived ? "Project archived" : "Project deleted");
    navigate("/customer/projects");
  } catch (e) {
    toast(e.message, "error");
  }
}
async function addPhase(pid) {
  modal(
    "Add phase",
    `<form id="phaseF" class="modal-form"><label>Name<input name="name" required></label><label>Description<textarea name="description"></textarea></label><div class="two"><label>Start date<input name="startDate" type="date"></label><label>Due date<input name="dueDate" type="date" required></label></div><button class="btn primary">Add phase</button></form>`,
  );
  document.getElementById("phaseF").onsubmit = async (e) => {
    e.preventDefault();
    await api(`/projects/${pid}/phases`, {
      method: "POST",
      body: Object.fromEntries(new FormData(e.target)),
    });
    closeModal();
    toast("Phase added");
    projectDetail(pid);
  };
}
async function editPhase(pid, phid) {
  const { project: p } = await api("/projects/" + pid),
    ph = p.phases.find((x) => x.id === phid);
  modal(
    "Edit phase",
    `<form id="phaseF" class="modal-form"><label>Name<input name="name" value="${esc(ph.name)}" required></label><label>Description<textarea name="description">${esc(ph.description)}</textarea></label><div class="two"><label>Start date<input name="startDate" type="date" value="${ph.startDate}"></label><label>Due date<input name="dueDate" type="date" value="${ph.dueDate}" required></label></div><label>Status<select name="status"><option>Not Started</option><option>In Progress</option><option>Completed</option><option>On Hold</option></select></label><button class="btn primary">Save</button></form>`,
  );
  document.querySelector("#phaseF select").value = ph.status;
  document.getElementById("phaseF").onsubmit = async (e) => {
    e.preventDefault();
    await api(`/projects/${pid}/phases/${phid}`, {
      method: "PUT",
      body: Object.fromEntries(new FormData(e.target)),
    });
    closeModal();
    toast("Phase updated");
    projectDetail(pid);
  };
}
async function deletePhase(pid, phid) {
  if (!(await uiConfirm("Delete phase?"))) return;
  try {
    await api(`/projects/${pid}/phases/${phid}`, { method: "DELETE" });
    toast("Phase deleted");
    projectDetail(pid);
  } catch (e) {
    toast(e.message, "error");
  }
}
async function assignSupplier(pid, phid) {
  const d = await api("/projects/" + pid);
  const suppliers = d.suppliers;
  modal(
    "Assign supplier",
    `<form id="assignF" class="modal-form"><label>Supplier<select name="supplierId" required><option value="">Select a vetted supplier</option>${suppliers.map((s) => `<option value="${s.id}">${esc(s.company)} — ${esc(s.location)} — ★${s.rating} — ${esc(supplierBadge(s))}</option>`).join("")}</select></label><div class="notice">The supplier will receive a pending invitation. They must Accept before the phase becomes active.</div><button class="btn primary">Send invitation</button></form>`,
  );
  document.getElementById("assignF").onsubmit = async (e) => {
    e.preventDefault();
    await api(`/projects/${pid}/assign`, {
      method: "POST",
      body: { phaseId: phid, supplierId: new FormData(e.target).get("supplierId") },
    });
    closeModal();
    toast("Supplier invitation sent");
    projectDetail(pid);
  };
}
async function uploadDeliverable(pid, phid, input) {
  const f = input.files[0];
  if (!f) return;
  try {
    const file = await uploadFile(f);
    await api(`/projects/${pid}/deliverables`, {
      method: "POST",
      body: { phaseId: phid, filename: file.filename, size: file.size, url: file.url },
    });
    toast("Deliverable uploaded");
    projectDetail(pid);
  } catch (e) {
    toast(e.message, "error");
  }
}
async function completeProject(id) {
  await api(`/projects/${id}/complete`, { method: "POST" });
  toast("Project completed");
  projectDetail(id);
}
async function reviewProjectSuppliers(pid) {
  const d = await api("/projects/" + pid),
    p = d.project;
  const ids = [...new Set(p.phases.map((x) => x.supplierId).filter(Boolean))];
  const opts = ids
    .map((id) => {
      const s = d.suppliers.find((x) => x.id === id);
      return s ? `<option value="${s.id}">${esc(s.company)}</option>` : "";
    })
    .join("");
  modal(
    "Project completion review",
    `<form id="rf" class="modal-form"><label>Supplier<select name="supplierId" required>${opts}</select></label><label>Rating<select name="rating"><option>5</option><option>4</option><option>3</option><option>2</option><option>1</option></select></label><label>Review<textarea name="text" required></textarea></label><button class="btn primary">Submit review</button></form>`,
  );
  document.getElementById("rf").onsubmit = async (e) => {
    e.preventDefault();
    await api("/reviews", {
      method: "POST",
      body: { projectId: pid, ...Object.fromEntries(new FormData(e.target)) },
    });
    closeModal();
    toast("Review submitted");
  };
}
async function openSupport(pid) {
  modal(
    "Escalate / support",
    `<form id="sf" class="modal-form"><label>Issue type<select name="type">${["Support", "Quality", "Schedule", "Payment", "Safety", "Other"].map((x) => `<option value="${x}">${x}</option>`).join("")}</select></label><label>Description<textarea name="description" required minlength="10" maxlength="5000"></textarea></label><button class="btn primary">Open escalation</button></form>`,
  );
  document.getElementById("sf").onsubmit = async (e) => {
    e.preventDefault();
    try {
      await api("/disputes", {
        method: "POST",
        body: { projectId: pid, ...Object.fromEntries(new FormData(e.target)) },
      });
    } catch (err) {
      toast(err.message, "error");
      return;
    }
    closeModal();
    toast("Support escalation opened");
  };
}
async function customerInvoices() {
  const d = await api("/invoices");
  app.innerHTML = dashboardShell(
    "customer",
    "invoices",
    `<div class="dash-top"><div><h1>Invoices & payments</h1><p>Review submitted invoices before payment is scheduled.</p></div></div><div class="panel"><div class="cc-table-wrap"><table class="cc-table"><thead><tr><th>Invoice</th><th>Project / Phase</th><th>Amount</th><th>Status</th><th>Action</th></tr></thead><tbody>${d.invoices
      .map((i) => {
        const p = state.cache.projects?.find((x) => x.id === i.projectId);
        return `<tr><td><b>${esc(invNo(i))}</b><small>${date(i.createdAt)}</small></td><td>${esc(p?.name || i.projectId)}<small>${i.phaseId}</small></td><td>${money(i.amount)}</td><td><span class="status ${i.status.toLowerCase().replaceAll(" ", "-")}">${esc(i.status)}</span></td><td><button class="btn small outline" onclick="reviewInvoice('${i.id}')">${i.status === "Submitted" ? "Review" : "View"}</button></td></tr>`;
      })
      .join("")}</tbody></table></div></div>`,
  );
  state.cache.projects = (await api("/projects")).projects;
}
async function reviewInvoice(id) {
  const { invoice: i } = await api("/invoices/" + id);
  modal(
    "Invoice " + invNo(i),
    `<div class="detail-grid"><div class="detail-box"><small>Amount</small><b>${money(i.amount)}</b></div><div class="detail-box"><small>Status</small><b>${esc(i.status)}</b></div></div><p>${esc(i.description)}</p>${i.comments ? `<div class="notice">${esc(i.comments)}</div>` : ""}${i.status === "Submitted" ? `<div class="action-row"><button class="btn success" onclick="invoiceAction('${id}','Approve')">Approve & schedule payment</button><button class="btn outline" onclick="invoiceAction('${id}','Request Changes')">Request changes</button><button class="btn danger" onclick="invoiceReject('${id}')">Reject</button></div>` : ""}`,
  );
}
async function invoiceAction(id, action) {
  let comment = "";
  if (action === "Request Changes") comment = (await uiPrompt("What should the supplier change?")) || "";
  await api("/invoices/" + id, { method: "PATCH", body: { action, comment } });
  closeModal();
  toast(action === "Approve" ? "Invoice approved; payment scheduled" : "Changes requested");
  customerInvoices();
}
async function invoiceReject(id) {
  const reason = await uiPrompt("Reason for rejection?");
  if (!reason) return;
  await api("/invoices/" + id, { method: "PATCH", body: { action: "Rejected", comment: reason } });
  closeModal();
  toast("Invoice rejected");
  customerInvoices();
}
async function supplierDashboard() {
  const d = await api("/dashboard"),
    s = (await api("/profile")).supplier;
  const pending = [];
  d.projects.forEach((p) =>
    p.phases
      .filter((ph) => ph.supplierId === s?.id && ph.acceptanceStatus === "Pending")
      .forEach((ph) => pending.push({ p, ph })),
  );
  app.innerHTML = dashboardShell(
    "supplier",
    "dashboard",
    `<div class="dash-top"><div><h1>Supplier dashboard</h1><p>${esc(s?.company || "Supplier workspace")} · ${esc(supplierBadge(s))}</p></div><button class="btn primary" onclick="navigate('/supplier/invoices')">+ Create invoice</button></div><div class="stats"><div><span class="cc-label">Assigned projects</span><strong>${d.projects.length}</strong></div><div><span class="cc-label">Pending invitations</span><strong>${pending.length}</strong></div><div><span class="cc-label">Invoices</span><strong>${d.invoices.length}</strong></div><div><span class="cc-label">Paid</span><strong>${d.invoices.filter((i) => i.status === "Paid").length}</strong></div></div><div class="dashboard-grid"><div class="panel"><div class="panel-title"><h3>Pending invitations</h3></div>${pending.map((x) => `<div class="project-row" style="grid-template-columns:1fr auto"><div><b>${esc(x.ph.name)}</b><small>${esc(x.p.name)} · due ${date(x.ph.dueDate)}</small></div><div class="cc-actions"><button class="btn small success" onclick="acceptPhase('${x.p.id}','${x.ph.id}',true)">Accept</button><button class="btn small danger" onclick="acceptPhase('${x.p.id}','${x.ph.id}',false)">Decline</button></div></div>`).join("") || '<div class="empty">No pending invitations.</div>'}</div><div class="panel"><div class="panel-title"><h3>Invoice status</h3></div>${d.invoices.map((i) => `<div class="project-row" style="grid-template-columns:1fr auto"><div><b>${esc(invNo(i))}</b><small>${money(i.amount)}</small></div><span class="status ${i.status.toLowerCase().replaceAll(" ", "-")}">${i.status}</span></div>`).join("")}</div></div>`,
  );
}
async function acceptPhase(pid, phid, accept) {
  await api(`/projects/${pid}/accept`, { method: "POST", body: { phaseId: phid, accept } });
  toast(accept ? "Phase accepted" : "Phase declined");
  supplierDashboard();
}
async function supplierPhases() {
  const d = await api("/projects"),
    s = (await api("/profile")).supplier;
  const rows = [];
  d.projects.forEach((p) =>
    p.phases.filter((ph) => ph.supplierId === s.id).forEach((ph) => rows.push({ p, ph })),
  );
  app.innerHTML = dashboardShell(
    "supplier",
    "phases",
    `<div class="dash-top"><div><h1>Assigned phases</h1><p>Your accepted and pending work packages.</p></div></div><div class="cc-grid">${rows.map((x) => `<article class="cc-card"><div style="display:flex;justify-content:space-between"><b>${esc(x.ph.name)}</b><span class="tag ${x.ph.acceptanceStatus === "Accepted" ? "green" : "orange"}">${x.ph.acceptanceStatus}</span></div><p>${esc(x.p.name)} · ${esc(x.ph.description)}</p><div class="supplier-meta"><span>Due ${date(x.ph.dueDate)}</span><span>${x.ph.status}</span></div>${x.ph.acceptanceStatus === "Pending" ? `<div class="cc-actions" style="margin-top:12px"><button class="btn small success" onclick="acceptPhase('${x.p.id}','${x.ph.id}',true)">Accept</button><button class="btn small danger" onclick="acceptPhase('${x.p.id}','${x.ph.id}',false)">Decline</button></div>` : ""}<div class="cc-actions" style="margin-top:12px"><button class="btn small outline" onclick="supplierPhaseUpdate('${x.p.id}','${x.ph.id}')">Update phase</button><button class="btn small primary" onclick="navigate('/supplier/invoices/new?project=${x.p.id}&phase=${x.ph.id}')">Create invoice</button></div></article>`).join("")}</div>`,
  );
}
async function supplierPhaseUpdate(pid, phid) {
  const { project: p } = await api("/projects/" + pid),
    ph = p.phases.find((x) => x.id === phid);
  modal(
    "Update phase",
    `<form id="spf" class="modal-form"><label>Status<select name="status"><option>Not Started</option><option>In Progress</option><option>Completed</option><option>On Hold</option></select></label><label>Notes<textarea name="description">${esc(ph.description)}</textarea></label><button class="btn primary">Save update</button></form>`,
  );
  document.querySelector("#spf select").value = ph.status;
  document.getElementById("spf").onsubmit = async (e) => {
    e.preventDefault();
    await api(`/projects/${pid}/phases/${phid}`, {
      method: "PUT",
      body: Object.fromEntries(new FormData(e.target)),
    });
    closeModal();
    toast("Phase updated");
    supplierPhases();
  };
}
async function supplierInvoices() {
  const d = await api("/invoices");
  app.innerHTML = dashboardShell(
    "supplier",
    "invoices",
    `<div class="dash-top"><div><h1>Invoices</h1><p>Submit invoices and resubmit changes requested by customers.</p></div><button class="btn primary" onclick="navigate('/supplier/invoices/new')">+ Create invoice</button></div><div class="panel"><div class="cc-table-wrap"><table class="cc-table"><thead><tr><th>Invoice</th><th>Amount</th><th>Status</th><th>Comments</th><th>Action</th></tr></thead><tbody>${d.invoices.map((i) => `<tr><td><b>${esc(invNo(i))}</b><small>${date(i.createdAt)}</small></td><td>${money(i.amount)}</td><td><span class="status ${i.status.toLowerCase().replaceAll(" ", "-")}">${i.status}</span></td><td>${esc(i.comments || "—")}</td><td>${["Changes Requested", "Rejected"].includes(i.status) ? `<button class="btn small primary" onclick="resubmitInvoice('${i.id}')">Modify & resubmit</button>` : ""}</td></tr>`).join("")}</tbody></table></div></div>`,
  );
}
async function newInvoice() {
  const d = await api("/projects"),
    selectedProject = new URLSearchParams(location.hash.split("?")[1] || "").get("project"),
    selectedPhase = new URLSearchParams(location.hash.split("?")[1] || "").get("phase");
  let options = "";
  d.projects.forEach((p) =>
    p.phases
      .filter((ph) => ph.supplierId === state.user.supplierId && ph.acceptanceStatus === "Accepted")
      .forEach(
        (ph) =>
          (options += `<option value="${p.id}|${ph.id}" ${selectedProject === p.id && selectedPhase === ph.id ? "selected" : ""}>${esc(p.name)} — ${esc(ph.name)}</option>`),
      ),
  );
  app.innerHTML = dashboardShell(
    "supplier",
    "invoices",
    `<div class="form-card"><h1>Create invoice</h1><p>Submit against an accepted phase. The customer must review before payment is scheduled.</p><form id="invF"><label>Project / Phase *<select name="target" required><option value="">Select</option>${options}</select></label><div class="two"><label>Amount (€) *<input name="amount" type="number" min="1" step="0.01" required></label><label>Attachment<input name="attachmentFile" type="file"></label></div><label>Description *<textarea name="description" required></textarea></label><button class="btn primary">Submit invoice</button></form></div>`,
  );
  document.getElementById("invF").onsubmit = async (e) => {
    e.preventDefault();
    const fd = new FormData(e.target),
      b = Object.fromEntries(fd.entries());
    const file = fd.get("attachmentFile");
    const [projectId, phaseId] = b.target.split("|");
    delete b.target;
    delete b.attachmentFile;
    let attachment = null;
    if (file && file.size) {
      attachment = await uploadFile(file);
    }
    await api("/invoices", { method: "POST", body: { ...b, attachment, projectId, phaseId } });
    toast("Invoice submitted");
    navigate("/supplier/invoices");
  };
}
async function resubmitInvoice(id) {
  const { invoice: i } = await api("/invoices/" + id);
  modal(
    "Modify invoice",
    `<form id="rif" class="modal-form"><label>Amount<input name="amount" type="number" value="${i.amount}" required></label><label>Description<textarea name="description" required>${esc(i.description)}</textarea></label><label>New attachment<input name="attachmentFile" type="file"></label><button class="btn primary">Resubmit for approval</button></form>`,
  );
  document.getElementById("rif").onsubmit = async (e) => {
    e.preventDefault();
    const fd = new FormData(e.target),
      b = Object.fromEntries(fd.entries());
    const file = fd.get("attachmentFile");
    delete b.attachmentFile;
    let attachment = i.attachment;
    if (file && file.size) attachment = await uploadFile(file);
    await api("/invoices/" + id, { method: "PATCH", body: { action: "Resubmit", ...b, attachment } });
    closeModal();
    toast("Invoice resubmitted");
    supplierInvoices();
  };
}
async function supplierCatalog() {
  const d = await api("/profile"),
    s = d.supplier;
  app.innerHTML = dashboardShell(
    "supplier",
    "suppliers",
    `<div class="dash-top"><div><h1>Service catalog</h1><p>What customers see when evaluating your company.</p></div><div class="cc-actions"><button class="btn outline" onclick="editProfile()">Edit profile</button><button class="btn primary" onclick="editCatalog()">Edit services & rates</button></div></div><div class="cc-card"><div class="supplier-top"><div class="supplier-avatar">${esc(s.avatar)}</div><div><h2 style="margin:0">${esc(s.company)}</h2><p>${esc(s.location)} · ${esc(supplierBadge(s))} · ★ ${s.rating}</p></div></div><h4>Services</h4>${s.services.map((x) => `<span class="chip">${esc(x)}</span>`).join("")}<h4>Certifications</h4>${s.certifications.map((x) => `<span class="chip">${esc(x)}</span>`).join("")}<div class="detail-grid" style="margin-top:20px"><div class="detail-box"><small>Experience</small><b>${s.experience} years</b></div><div class="detail-box"><small>Projects</small><b>${s.projectsCompleted}</b></div><div class="detail-box"><small>Hourly rate</small><b>${money(s.hourlyRate)}</b></div><div class="detail-box"><small>Availability</small><b>${s.availability}</b></div></div><p>${esc(s.description)}</p></div>`,
  );
}
async function editCatalog() {
  const d = await api("/profile"),
    s = d.supplier;
  modal(
    "Edit service catalog",
    `<form id="catf" class="modal-form"><label>Services</label><div class="check-grid2">${["Mechanical Engineering", "Electrical Engineering", "PLC Programming", "Robotics", "CAD / Design", "Manufacturing", "Installation", "Commissioning", "Project Management", "Industrial Shipping"].map((x) => `<label><input type="checkbox" name="services" value="${esc(x)}" ${s.services.includes(x) ? "checked" : ""}> ${esc(x)}</label>`).join("")}</div><label>Certifications</label><div class="check-grid2">${["ISO 9001", "ISO 13849", "ISO 14001", "ISO 45001", "TÜV", "CE Machinery", "VDA 6.3", "SCC Safety"].map((x) => `<label><input type="checkbox" name="certifications" value="${esc(x)}" ${s.certifications.includes(x) ? "checked" : ""}> ${esc(x)}</label>`).join("")}</div><div class="two"><label>Availability<select name="availability"><option>Available</option><option>Busy</option><option>Unavailable</option></select></label><label>Hourly rate (€)<input name="hourlyRate" type="number" value="${s.hourlyRate}"></label></div><label>Starting project rate (€)<input name="projectRate" type="number" value="${s.projectRate}"></label><button class="btn primary">Save catalog</button></form>`,
  );
  document.querySelector("#catf select").value = s.availability;
  document.getElementById("catf").onsubmit = async (e) => {
    e.preventDefault();
    const fd = new FormData(e.target),
      b = {
        availability: fd.get("availability"),
        hourlyRate: fd.get("hourlyRate"),
        projectRate: fd.get("projectRate"),
        services: fd.getAll("services"),
        certifications: fd.getAll("certifications"),
      };
    await api("/profile", { method: "PUT", body: b });
    closeModal();
    toast("Service catalog updated");
    supplierCatalog();
  };
}
async function profilePage(role) {
  const d = await api("/profile");
  app.innerHTML = dashboardShell(
    role,
    "profile",
    `<div class="dash-top"><div><h1>Profile & settings</h1><p>Account information and platform preferences.</p></div><button class="btn primary" onclick="editProfile()">Edit</button></div><div class="cc-grid"><div class="cc-card"><span class="cc-label">Name</span><h3>${esc(d.user.name)}</h3><p>${esc(d.user.email)}</p></div><div class="cc-card"><span class="cc-label">Company</span><h3>${esc(d.user.company || "—")}</h3></div>${d.supplier ? `<div class="cc-card"><span class="cc-label">Supplier badge</span><h3>${esc(supplierBadge(d.supplier))}</h3><p>Verified · ${d.supplier.availability}</p></div>` : ""}</div><div class="cc-card" style="margin-top:15px"><h3>Data portability</h3><p>Download a JSON backup of the platform database (admin) or your account data.</p><button class="btn outline" onclick="exportData()">Export JSON</button></div>`,
  );
}
async function editProfile() {
  const d = await api("/profile"),
    s = d.supplier;
  modal(
    "Edit profile",
    `<form id="pf" class="modal-form"><label>Name<input name="name" value="${esc(d.user.name)}" required></label><label>Company<input name="company" value="${esc(d.user.company || "")}"></label>${s ? `<label>Location<input name="location" value="${esc(s.location)}"></label><label>Description<textarea name="description">${esc(s.description)}</textarea></label>` : ""}<button class="btn primary">Save</button></form>`,
  );
  document.getElementById("pf").onsubmit = async (e) => {
    e.preventDefault();
    await api("/profile", { method: "PUT", body: Object.fromEntries(new FormData(e.target)) });
    closeModal();
    toast("Profile updated");
    route();
  };
}
async function exportData() {
  const d = await api("/backup/export");
  const blob = new Blob([JSON.stringify(d, null, 2)], { type: "application/json" }),
    a = document.createElement("a");
  a.href = URL.createObjectURL(blob);
  a.download = "craftcrew-backup.json";
  a.click();
  URL.revokeObjectURL(a.href);
}
async function importData(input) {
  const f = input.files[0];
  if (!f) return;
  try {
    const data = JSON.parse(await f.text()),
      backup = data.data || data,
      n = (k) => (Array.isArray(backup[k]) ? backup[k].length : 0),
      de = typeof i18nLang !== "undefined" && i18nLang === "de";
    const ok = await uiDialog({
      title: "Import backup?",
      message: de
        ? `Alle aktuellen Daten werden durch die Sicherung ersetzt: ${n("users")} Benutzer, ${n("projects")} Projekte, ${n("invoices")} Rechnungen, ${n("suppliers")} Lieferanten. Eine Kopie der aktuellen Daten wird vorher gespeichert.`
        : `All current data will be replaced by the backup: ${n("users")} users, ${n("projects")} projects, ${n("invoices")} invoices, ${n("suppliers")} suppliers. A copy of the current data is saved first.`,
      confirmLabel: "Import backup",
      danger: true,
    });
    input.value = "";
    if (!ok) return;
    await api("/backup/import", { method: "POST", body: { data: backup } });
    toast("Backup imported");
    adminReports();
  } catch (e) {
    toast(e.message, "error");
  }
}
async function adminDashboard() {
  const [m, a] = await Promise.all([api("/admin/metrics"), api("/admin/applications")]);
  app.innerHTML = dashboardShell(
    "admin",
    "dashboard",
    `<div class="dash-top"><div><h1>Admin dashboard</h1><p>Marketplace quality, vetting and financial operations.</p></div></div><div class="stats"><div><span class="cc-label">Users</span><strong>${m.metrics.users}</strong></div><div><span class="cc-label">Live suppliers</span><strong>${m.metrics.suppliers}</strong></div><div><span class="cc-label">Projects</span><strong>${m.metrics.projects}</strong></div><div><span class="cc-label">Invoice volume</span><strong>${money(m.metrics.grossVolume)}</strong></div></div><div class="dashboard-grid"><div class="panel"><div class="panel-title"><h3>Vetting queue</h3><a href="#/admin/applications">Open queue</a></div>${
      a.applications
        .filter((x) => !["Approved", "Rejected"].includes(x.status))
        .map(
          (x) =>
            `<div class="project-row" style="grid-template-columns:1fr auto"><div><b>${esc(x.company)}</b><small>${esc(x.email)} · ${x.stage}</small></div><button class="btn small outline" onclick="reviewApplication('${x.id}')">Review</button></div>`,
        )
        .join("") || '<div class="empty">Queue is clear.</div>'
    }</div><div class="panel"><h3>Quality pipeline</h3><div class="stage-flow" style="flex-wrap:wrap"><span class="on">New</span><span>Verified</span><span>References</span><span>Approved</span><span>Badge</span><span>Live</span></div><p class="subtle">Every approved supplier receives an explicit Bronze, Silver or Gold badge.</p></div></div>`,
  );
}
async function adminApplications() {
  const d = await api("/admin/applications");
  app.innerHTML = dashboardShell(
    "admin",
    "applications",
    `<div class="dash-top"><div><h1>Supplier vetting queue</h1><p>Review applications through New → Verified → References → Approved/Rejected.</p></div></div><div class="panel"><div class="cc-table-wrap"><table class="cc-table"><thead><tr><th>Company</th><th>Stage</th><th>Status</th><th>Submitted</th><th></th></tr></thead><tbody>${d.applications.map((a) => `<tr><td><b>${esc(a.company)}</b><small>${esc(a.email)}</small></td><td><span class="tag blue">${esc(a.stage)}</span></td><td>${esc(a.status)}</td><td>${date(a.createdAt)}</td><td><button class="btn small primary" onclick="reviewApplication('${a.id}')">Review</button></td></tr>`).join("") || '<tr><td colspan="5">No applications.</td></tr>'}</tbody></table></div></div>`,
  );
}
async function reviewApplication(id) {
  const d = await api("/admin/applications"),
    a = d.applications.find((x) => x.id === id);
  modal(
    "Supplier application",
    `<div class="stage-flow"><span class="${a.stage === "New" ? "on" : ""}">New</span><span class="${a.stage === "Verified" ? "on" : ""}">Verified</span><span class="${a.stage === "References" ? "on" : ""}">References</span><span class="${a.status === "Approved" ? "on" : ""}">Approved</span><span>Badge</span><span>Live</span></div><div class="detail-grid"><div class="detail-box"><small>Company</small><b>${esc(a.company)}</b></div><div class="detail-box"><small>Contact</small><b>${esc(a.contactName || "—")}</b></div><div class="detail-box"><small>Email / phone</small><b>${esc(a.email)}<br>${esc(a.phone)}</b></div><div class="detail-box"><small>Insurance</small><b>${esc(a.insurance)}</b></div><div class="detail-box"><small>Years</small><b>${esc(a.yearsInBusiness)}</b></div><div class="detail-box"><small>Reference</small><b>${esc(a.referenceName)}<br>${esc(a.referenceEmail)}</b></div></div><h4>Services</h4>${a.services.map((x) => `<span class="chip">${esc(x)}</span>`).join("")}<h4>Certifications</h4>${a.certifications.map((x) => `<span class="chip">${esc(x)}</span>`).join("")}<h4>Portfolio</h4><p>${esc(a.portfolio)}</p><div class="action-row"><select id="astage"><option>New</option><option>Verified</option><option>References</option></select><button class="btn outline" onclick="updateApplication('${id}',{stage:document.getElementById('astage').value})">Save stage</button><select id="abadge"><option>Bronze</option><option>Silver</option><option>Gold</option></select><button class="btn success" onclick="updateApplication('${id}',{status:'Approved',badge:document.getElementById('abadge').value,stage:'Approved'})">Approve & assign badge</button><button class="btn danger" onclick="updateApplication('${id}',{status:'Rejected',stage:'Rejected'})">Reject</button></div>`,
  );
  document.getElementById("astage").value = a.stage;
}
async function updateApplication(id, b) {
  await api("/admin/applications/" + id, { method: "PATCH", body: b });
  closeModal();
  toast(b.status === "Approved" ? "Supplier approved and published" : "Application updated");
  adminApplications();
}
async function adminUsers() {
  const d = await api("/admin/users");
  app.innerHTML = dashboardShell(
    "admin",
    "users",
    `<div class="dash-top"><div><h1>User management</h1><p>Accounts and roles.</p></div></div><div class="panel"><div class="cc-table-wrap"><table class="cc-table"><thead><tr><th>Name</th><th>Email</th><th>Role</th><th>Company</th></tr></thead><tbody>${d.users.map((u) => `<tr><td>${esc(u.name)}</td><td>${esc(u.email)}</td><td><span class="tag">${u.role}</span></td><td>${esc(u.company || "—")}</td></tr>`).join("")}</tbody></table></div></div>`,
  );
}
async function adminBilling() {
  const d = await api("/invoices");
  app.innerHTML = dashboardShell(
    "admin",
    "billing",
    `<div class="dash-top"><div><h1>Payments & billing</h1><p>Platform-wide invoice state and scheduled payments.</p></div></div><div class="panel"><div class="cc-table-wrap"><table class="cc-table"><thead><tr><th>Invoice</th><th>Customer</th><th>Supplier</th><th>Amount</th><th>Status</th><th>Action</th></tr></thead><tbody>${d.invoices.map((i) => `<tr><td>${esc(invNo(i))}</td><td>${i.customerId}</td><td>${i.supplierId}</td><td>${money(i.amount)}</td><td><span class="status ${i.status.toLowerCase().replaceAll(" ", "-")}">${i.status}</span></td><td>${i.status === "Approved" ? `<button class="btn small success" onclick="markPaid('${i.id}')">Mark paid</button>` : ""}</td></tr>`).join("")}</tbody></table></div></div>`,
  );
}
async function adminDisputes() {
  const d = await api("/disputes");
  app.innerHTML = dashboardShell(
    "admin",
    "disputes",
    `<div class="dash-top"><div><h1>Escalations & support</h1><p>Resolve delivery, quality, timeline and invoice disputes.</p></div></div><div class="cc-grid">${d.disputes.map((x) => `<article class="cc-card"><div style="display:flex;justify-content:space-between"><b>${esc(x.type)}</b><span class="tag ${x.status === "Open" ? "orange" : "green"}">${esc(x.status)}</span></div><p>${esc(x.description)}</p><small>${esc(x.projectId)} · ${date(x.createdAt)}</small>${x.status === "Open" ? `<div class="cc-actions" style="margin-top:12px"><button class="btn small success" onclick="resolveDispute('${x.id}')">Resolve</button></div>` : ""}</article>`).join("") || '<div class="empty">No escalations.</div>'}</div>`,
  );
}
async function resolveDispute(id) {
  const resolution = await uiPrompt("Resolution / outcome");
  if (!resolution) return;
  await api("/admin/disputes/" + id, { method: "PATCH", body: { status: "Resolved", resolution } });
  toast("Escalation resolved");
  adminDisputes();
}
async function markPaid(id) {
  await api("/admin/invoices/" + id, { method: "PATCH", body: { action: "Mark Paid" } });
  toast("Payment marked paid");
  adminBilling();
}
async function adminReports() {
  const m = await api("/admin/metrics");
  app.innerHTML = dashboardShell(
    "admin",
    "reports",
    `<div class="dash-top"><div><h1>Reports & analytics</h1><p>Simple operational metrics for the MVP.</p></div></div><div class="cc-grid4"><div class="cc-card"><span class="cc-label">Users</span><div class="cc-kpi">${m.metrics.users}</div></div><div class="cc-card"><span class="cc-label">Live suppliers</span><div class="cc-kpi">${m.metrics.suppliers}</div></div><div class="cc-card"><span class="cc-label">Projects</span><div class="cc-kpi">${m.metrics.projects}</div></div><div class="cc-card"><span class="cc-label">Gross invoice volume</span><div class="cc-kpi">${money(m.metrics.grossVolume)}</div></div></div><div class="cc-card" style="margin-top:15px"><h3>Backup / restore</h3><p>Export the full JSON database. Admin import is available through the API and can be wired to a file picker for production deployment.</p><button class="btn outline" onclick="exportData()">Export full JSON</button><label class="btn outline">Import JSON<input type="file" hidden accept="application/json" onchange="importData(this)"></label></div>`,
  );
}
async function messages(role) {
  const d = await api("/messages");
  const users = await api(role === "admin" ? "/admin/users" : "/admin/users").catch(() => ({ users: [] }));
  app.innerHTML = dashboardShell(
    role,
    "messages",
    `<div class="dash-top"><div><h1>Messages</h1><p>Project collaboration and supplier/customer communication.</p></div><button class="btn primary" onclick="newMessage()">+ New message</button></div><div class="panel"><div class="msg-list">${d.messages.map((m) => `<div class="msg ${m.senderId === state.user.id ? "mine" : ""}"><b>${m.senderId === state.user.id ? "You" : "Message"}</b><p>${esc(m.text)}</p><small>${date(m.createdAt)} · ${m.projectId || "General"}</small></div>`).join("") || '<div class="empty">No messages yet.</div>'}</div></div>`,
  );
}
async function newMessage() {
  let users = [];
  try {
    users = (await api("/contacts")).users;
  } catch {}
  modal(
    "New message",
    `<form id="mf" class="modal-form"><label>Recipient<select name="recipientId" required>${users.map((u) => `<option value="${u.id}">${esc(u.name)} — ${u.role}</option>`).join("")}</select></label><label>Message<textarea name="text" required maxlength="5000"></textarea></label><button class="btn primary">Send</button></form>`,
  );
  document.getElementById("mf").onsubmit = async (e) => {
    e.preventDefault();
    await api("/messages", { method: "POST", body: Object.fromEntries(new FormData(e.target)) });
    closeModal();
    toast("Message sent");
    messages(state.user.role);
  };
}
async function route() {
  topActions();
  const h = location.hash.replace(/^#/, "") || "/";
  if (!state.user && /^\/(customer|supplier|admin)/.test(h)) {
    navigate("/login");
    return;
  }
  try {
    if (h === "/suppliers") return renderSuppliers();
    const parts = h.split("/").filter(Boolean);
    if (parts[0] === "customer") {
      if (parts[1] === "dashboard") return customerDashboard();
      if (parts[1] === "projects" && !parts[2]) return customerProjects();
      if (parts[1] === "projects" && parts[2] === "new") return newProject();
      if (parts[1] === "projects" && parts[2]) return projectDetail(parts[2]);
      if (parts[1] === "suppliers") return renderSuppliers();
      if (parts[1] === "invoices") return customerInvoices();
      if (parts[1] === "messages") return messages("customer");
      if (parts[1] === "profile") return profilePage("customer");
    }
    if (parts[0] === "supplier") {
      if (parts[1] === "dashboard") return supplierDashboard();
      if (parts[1] === "phases") return supplierPhases();
      if (parts[1] === "projects") return supplierPhases();
      if (parts[1] === "invoices" && !parts[2]) return supplierInvoices();
      if (parts[1] === "invoices" && parts[2] === "new") return newInvoice();
      if (parts[1] === "suppliers") return supplierCatalog();
      if (parts[1] === "messages") return messages("supplier");
      if (parts[1] === "profile") return profilePage("supplier");
    }
    if (parts[0] === "admin") {
      if (parts[1] === "dashboard") return adminDashboard();
      if (parts[1] === "applications") return adminApplications();
      if (parts[1] === "users") return adminUsers();
      if (parts[1] === "billing") return adminBilling();
      if (parts[1] === "reports") return adminReports();
      if (parts[1] === "disputes") return adminDisputes();
      if (parts[1] === "profile") return profilePage("admin");
    }
  } catch (e) {
    console.error(e);
    toast(e.message, "error");
    app.innerHTML = publicLayout(
      `<div class="cc-page"><div class="empty"><h2>Something went wrong</h2><p>${esc(e.message)}</p><button class="btn primary" onclick="route()">Retry</button></div></div>`,
    );
  }
}

/* ============================================================
   Authenticated shell controller
   Public marketing navigation is hidden after login.
   ============================================================ */
function updateCraftCrewShell() {
  // CraftCrew session is stored under cc_user/cc_token.
  const loggedIn = !!state.user && !!state.token;
  const currentRoute = (location.hash.replace(/^#/, "") || "/").split("?")[0];
  const inWorkspace = /^\/(customer|supplier|admin)(\/|$)/.test(currentRoute);
  document.body.classList.toggle("authenticated", loggedIn);
  document.body.classList.toggle("workspace-route", loggedIn && inWorkspace);
  const marketingHeader = document.querySelector(".topbar");
  const footer = document.querySelector("body > footer");
  if (marketingHeader) marketingHeader.style.display = loggedIn && inWorkspace ? "none" : "";
  if (footer) footer.style.display = loggedIn && inWorkspace ? "none" : "";
}

const _originalTopActions = topActions;
topActions = function () {
  _originalTopActions();
  updateCraftCrewShell();
};

document.addEventListener("DOMContentLoaded", updateCraftCrewShell);
window.addEventListener("hashchange", updateCraftCrewShell);
window.addEventListener("storage", updateCraftCrewShell);
