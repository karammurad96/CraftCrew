// Shared UI improvements and completed marketplace flows.
function modal(title, body) {
  modalRoot.innerHTML = `<div class="modal-backdrop" id="mb" onclick="if(event.target===this){closeModal();if(location.hash.split('?')[0]==='#/supplier/invoices/new')navigate('/supplier/invoices')}"><div class="modal" onclick="event.stopPropagation()"><div class="modal-head"><h2>${esc(title)}</h2><button class="close" type="button" aria-label="Close" onclick="closeModal()">×</button></div>${body}</div></div>`;
}

function supplierSelectCard(s) {
  return `<article class="supplier-card supplier-card-click" role="button" tabindex="0" onclick="supplierDetail('${esc(s.id)}')" onkeydown="if(event.key==='Enter'||event.key===' '){event.preventDefault();supplierDetail('${esc(s.id)}')}"><div class="supplier-top"><div class="supplier-avatar">${esc(s.avatar || "CC")}</div><div class="supplier-card-main"><h3>${esc(s.company)}</h3><small>${esc(s.location || "Location not set")}</small></div><span class="badge ${(s.badge || "bronze").toLowerCase()}">${esc(supplierBadge(s))}</span></div><p>${
    (s.services || [])
      .slice(0, 4)
      .map((x) => `<span class="chip">${esc(x)}</span>`)
      .join("") || '<span class="muted">Services being updated</span>'
  }</p><div class="supplier-facts"><span>${Number(s.employees) || 0} team members</span><span>${Number(s.experience) || 0}+ years</span><span>${money(s.hourlyRate || 0)}/h</span></div><div class="supplier-meta"><span>★ ${Number(s.rating || 0).toFixed(1)} · ${Number(s.projectsCompleted) || 0} projects</span><button type="button" class="btn small outline" onclick="event.stopPropagation();supplierDetail('${esc(s.id)}')">View profile</button></div></article>`;
}

async function renderSuppliers() {
  const q = document.getElementById("sq")?.value || "";
  const data = await api("/suppliers?q=" + encodeURIComponent(q));
  const filters = `<div class="searchbar"><input id="sq" value="${esc(q)}" placeholder="Search company, service or location"><select id="ss"><option value="">All services</option>${data.services.map((x) => `<option>${esc(x)}</option>`).join("")}</select><select id="sb"><option value="">All badges</option><option>Gold</option><option>Silver</option><option>Bronze</option></select><select id="sa"><option value="">Availability</option><option>Available</option><option>Busy</option></select><button class="btn primary" onclick="loadSupplierFilters()">Search</button></div>`;
  const content = `<div class="cc-page"><div class="page-head"><div><div class="eyebrow">SUPPLIER DIRECTORY</div><h1>Find the right industrial specialist.</h1><p>Explore services, workforce, experience, certifications, pricing and location.</p></div><button class="btn outline" onclick="navigate('/supplier-application')">Apply as supplier</button></div>${filters}<div class="supplier-grid">${data.suppliers.map(supplierSelectCard).join("") || '<div class="empty">No suppliers match those filters yet.</div>'}</div></div>`;
  const customerDirectory = location.hash.split("?")[0].startsWith("#/customer/suppliers");
  app.innerHTML =
    customerDirectory || state.user?.role === "customer"
      ? dashboardShell("customer", "suppliers", content)
      : publicLayout(content);
}

async function loadSupplierFilters() {
  const q = document.getElementById("sq")?.value || "",
    service = document.getElementById("ss")?.value || "",
    badge = document.getElementById("sb")?.value || "",
    availability = document.getElementById("sa")?.value || "";
  const d = await api(
    `/suppliers?q=${encodeURIComponent(q)}&service=${encodeURIComponent(service)}&badge=${encodeURIComponent(badge)}&availability=${encodeURIComponent(availability)}`,
  );
  const grid = document.querySelector(".supplier-grid");
  if (grid)
    grid.innerHTML =
      d.suppliers.map(supplierSelectCard).join("") ||
      '<div class="empty">No suppliers match those filters yet.</div>';
}

async function supplierDetail(id) {
  const { supplier: s } = await api("/suppliers/" + encodeURIComponent(id));
  const content = `<div class="breadcrumb"><a href="#/${state.user?.role === "customer" ? "customer/" : ""}suppliers">← Back to supplier directory</a></div><div class="supplier-profile-head"><div class="supplier-avatar large">${esc(s.avatar || "CC")}</div><div><div class="eyebrow">SUPPLIER PROFILE</div><h1>${esc(s.company)}</h1><p>${esc(s.location || "Location not set")} · ${esc(s.availability || "Availability on request")}</p></div><span class="badge ${(s.badge || "bronze").toLowerCase()}">${esc(supplierBadge(s))}</span></div><div class="health"><div class="cc-card"><span class="cc-label">Team</span><b>${Number(s.employees) || 0} employees</b></div><div class="cc-card"><span class="cc-label">Experience</span><b>${Number(s.experience) || 0}+ years · ${Number(s.projectsCompleted) || 0} projects</b></div><div class="cc-card"><span class="cc-label">Rates</span><b>${money(s.hourlyRate || 0)}/hour · from ${money(s.projectRate || 0)}</b></div></div><div class="supplier-profile-grid"><section class="cc-card"><h2>About</h2><p>${esc(s.description || "Supplier profile and capabilities.")}</p><h2>Services</h2><div>${(s.services || []).map((x) => `<span class="chip">${esc(x)}</span>`).join("") || '<span class="muted">No services listed</span>'}</div><h2>Certifications</h2><div>${(s.certifications || []).map((x) => `<span class="chip">${esc(x)}</span>`).join("") || '<span class="muted">No certifications listed</span>'}</div></section><section class="cc-card"><h2>Team & delivery</h2><p>${Number(s.employees) || 0} employees · ${Number(s.experience) || 0} years in business</p>${(s.teamMembers || []).map((m) => `<div class="team-row"><b>${esc(m.name || "Team member")}</b><span>${esc(m.role || "")}</span><small>${esc(m.experience || m.certifications || "")}</small></div>`).join("") || '<p class="muted">Detailed team profiles are available on request.</p>'}<h2>Customer reviews</h2>${(s.reviews || []).map((r) => `<div class="notice">★ ${esc(r.rating)} — ${esc(r.text)}</div>`).join("") || '<p class="muted">No reviews yet.</p>'}</section></div><div class="action-row">${state.user?.role === "customer" ? `<button class="btn primary" onclick="requestSupplierQuote('${esc(s.id)}')">Request a quote</button>` : ""}<button class="btn outline" onclick="navigate('/${state.user?.role === "customer" ? "customer/" : ""}suppliers')">Back to directory</button></div>`;
  app.innerHTML =
    state.user?.role === "customer"
      ? dashboardShell("customer", "suppliers", content)
      : publicLayout(`<div class="cc-page">${content}</div>`);
}

async function requestSupplierQuote(supplierId) {
  const { supplier: s } = await api("/suppliers/" + supplierId),
    projects = (await api("/projects")).projects;
  modal(
    "Request a quote",
    `<form id="rfqForm" class="modal-form"><label>Service<select name="service" required>${(s.services || []).map((x) => `<option>${esc(x)}</option>`).join("")}</select></label><label>Project (optional)<select name="projectId"><option value="">General enquiry</option>${projects.map((p) => `<option value="${esc(p.id)}">${esc(p.name)}</option>`).join("")}</select></label><label>Describe the work<textarea name="message" rows="5" required maxlength="5000" placeholder="Scope, location, schedule and expected deliverables"></textarea></label><div class="form-error" id="rfqError" role="alert"></div><button class="btn primary">Send quote request</button></form>`,
  );
  document.getElementById("rfqForm").onsubmit = async (e) => {
    e.preventDefault();
    const b = Object.fromEntries(new FormData(e.target));
    b.supplierId = supplierId;
    try {
      await api("/rfqs", { method: "POST", body: b });
      closeModal();
      toast("Quote request sent");
    } catch (err) {
      document.getElementById("rfqError").textContent = err.message;
    }
  };
}

async function supplierApplication() {
  const services = [
      "Mechanical Engineering",
      "Electrical Engineering",
      "PLC Programming",
      "Robotics",
      "CAD / Design",
      "Manufacturing",
      "Installation",
      "Commissioning",
      "Project Management",
      "Industrial Shipping",
    ],
    certs = [
      "ISO 9001",
      "ISO 13849",
      "ISO 14001",
      "ISO 45001",
      "TÜV",
      "CE Machinery",
      "VDA 6.3",
      "SCC Safety",
    ];
  let profile = null;
  if (state.user?.role === "supplier") profile = await api("/profile");
  const content = `<div class="form-card"><div class="eyebrow">SUPPLIER APPLICATION</div><h1>Join the vetted network.</h1><p>Complete your company profile and start the verification process.</p><div class="stage-flow"><span class="on">Application</span><span>Verification</span><span>References</span><span>Founder review</span><span>Badge</span></div><form id="appF"><div class="two"><label>Company name *<input name="company" value="${esc(profile?.supplier?.company || state.user?.company || "")}" required></label><label>Contact name<input name="contactName" value="${esc(state.user?.name || "")}"></label></div><div class="two"><label>Email *<input name="email" type="email" value="${esc(state.user?.email || "")}" required></label><label>Phone *<input name="phone" type="tel" required></label></div><label>Location<input name="location" value="${esc(profile?.supplier?.location || "")}" placeholder="Munich, Germany"></label><label>Services offered *</label><div class="check-grid2">${services.map((x) => `<label class="choice-row"><input type="checkbox" name="services" value="${esc(x)}" ${(profile?.supplier?.services || []).includes(x) ? "checked" : ""}> ${esc(x)}</label>`).join("")}</div><label>Certifications</label><div class="check-grid2">${certs.map((x) => `<label class="choice-row"><input type="checkbox" name="certifications" value="${esc(x)}" ${(profile?.supplier?.certifications || []).includes(x) ? "checked" : ""}> ${esc(x)}</label>`).join("")}</div><div class="two"><label>Insurance details *<input name="insurance" required></label><label>Years in business *<input name="yearsInBusiness" type="number" min="0" required></label></div><label>Portfolio / past projects *<textarea name="portfolio" required></textarea></label><div class="two"><label>Reference name *<input name="referenceName" required></label><label>Reference email *<input name="referenceEmail" type="email" required></label></div><div id="applicationError" class="form-error" role="alert"></div><button class="btn primary lg">Submit application</button></form></div>`;
  app.innerHTML =
    state.user?.role === "supplier"
      ? dashboardShell("supplier", "suppliers", content)
      : publicLayout(`<div class="simple-page">${content}</div>`);
  document.getElementById("appF").onsubmit = async (e) => {
    e.preventDefault();
    const fd = new FormData(e.target),
      b = {};
    for (const [k, v] of fd.entries()) {
      if (k === "services" || k === "certifications") (b[k] ??= []).push(v);
      else b[k] = v;
    }
    if (!b.services?.length) {
      document.getElementById("applicationError").textContent = "Choose at least one service.";
      return;
    }
    try {
      await api("/applications", { method: "POST", body: b });
      app.innerHTML =
        state.user?.role === "supplier"
          ? dashboardShell(
              "supplier",
              "suppliers",
              `<div class="form-card center-page"><h1>Application submitted</h1><p>Your details are in the supplier vetting queue. Keep your service catalog and team profiles up to date while we review it.</p><button class="btn primary" onclick="navigate('/supplier/suppliers')">Return to service catalog</button></div>`,
            )
          : publicLayout(
              `<div class="simple-page center-page"><div class="login-card"><div class="feature-icon" style="margin:auto">✓</div><h1>Application submitted</h1><p>Your application is in the supplier vetting queue. Create an account with this email so you can manage your catalog after approval.</p><button class="btn primary" onclick="navigate('/signup')">Create supplier account</button></div></div>`,
            );
    } catch (err) {
      document.getElementById("applicationError").textContent = err.message;
    }
  };
}

function renderAuth(mode) {
  app.innerHTML = publicLayout(
    `<div class="simple-page center-page"><div class="login-card"><a class="brand" href="#/"><span class="brand-mark" role="img" aria-label="CraftCrew logo"><svg viewBox="0 0 64 64" aria-hidden="true" focusable="false"><path d="M14 50C24 42 40 22 50 14"/><circle cx="14" cy="50" r="8.5"/><circle cx="50" cy="14" r="8.5"/></svg></span><span class="brand-word">Craft<span>Crew</span></span></a><h1>${mode === "login" ? "Welcome back" : "Create your account"}</h1><p>${mode === "login" ? "Sign in to your CraftCrew workspace." : "Start coordinating industrial work."}</p><form id="authForm">${mode === "signup" ? `<label>Name<input name="name" autocomplete="name" required></label><label>Company<input name="company" autocomplete="organization"></label><label>Account type<select name="role" required><option value="customer">Customer</option><option value="supplier">Supplier</option></select></label>` : ""}<label>Email<input name="email" type="email" autocomplete="email" required></label><label>Password<input name="password" type="password" autocomplete="${mode === "login" ? "current-password" : "new-password"}" minlength="${mode === "login" ? 1 : 12}" required></label><div id="authError" class="form-error" role="alert" aria-live="polite"></div><button class="btn primary full" style="margin-top:15px">${mode === "login" ? "Log in" : "Create account"}</button></form>${mode === "login" ? '<p class="auth-switch">No account? <a href="#/signup">Sign up</a></p>' : '<p class="auth-switch">Already registered? <a href="#/login">Log in</a></p>'}</div></div>`,
  );
  document.getElementById("authForm").onsubmit = async (e) => {
    e.preventDefault();
    const error = document.getElementById("authError");
    error.textContent = "";
    const b = Object.fromEntries(new FormData(e.target));
    try {
      const d = await api("/auth/" + mode, { method: "POST", body: b });
      ccSignedIn(d.user);
      topActions();
      document.body.classList.add("authenticated");
      toast(mode === "login" ? "Signed in" : "Account created");
      navigate("/" + d.user.role + "/dashboard");
      route();
    } catch (err) {
      error.textContent =
        err.message === "Email already registered"
          ? "This email already has an account. Log in instead, or use a different email."
          : err.message;
    }
  };
}

function customerProjectCard(p) {
  return `<article class="cc-card click project-card" role="link" tabindex="0" onclick="openCustomerProject('${esc(p.id)}')" onkeydown="if(event.key==='Enter'||event.key===' '){event.preventDefault();openCustomerProject('${esc(p.id)}')}"><div class="project-card-head"><b>${esc(p.name)}</b><span class="status ${p.status.toLowerCase().replaceAll(" ", "-")}">${esc(p.status)}</span></div><p>${esc(p.description)}</p><div class="timeline-line"><i style="width:${pct(p.phases)}%"></i></div><div class="supplier-meta"><span>${pct(p.phases)}% complete</span><span>Due ${date(p.dueDate)}</span></div><span class="btn small outline project-open">Open project →</span></article>`;
}
async function openCustomerProject(id) {
  try {
    navigate("/customer/projects/" + id);
    await projectDetail(id);
  } catch (err) {
    toast(err.message, "error");
  }
}

async function customerProjects() {
  const d = await api("/projects");
  app.innerHTML = dashboardShell(
    "customer",
    "projects",
    `<div class="dash-top"><div><h1>Projects</h1><p>Waterfall delivery across your industrial work.</p></div><button class="btn primary" onclick="navigate('/customer/projects/new')">+ New project</button></div><div class="cc-grid">${d.projects.map(customerProjectCard).join("") || '<div class="empty">No projects yet. Create your first project to start planning work.</div>'}</div>`,
  );
}

async function newProject() {
  app.innerHTML = dashboardShell(
    "customer",
    "projects",
    `<div class="form-card"><div class="breadcrumb"><a href="#/customer/projects">← Back to projects</a></div><h1>Create new project</h1><p>Set the project envelope. CraftCrew creates five default waterfall phases that you can edit, reorder and assign.</p><form id="newProjectForm"><div class="two"><label>Project name *<input name="name" required maxlength="140"></label><label>Budget (€) *<input name="budget" type="number" min="1" step="0.01" required></label></div><label>Description *<textarea name="description" required maxlength="5000"></textarea></label><div class="two"><label>Start date<input name="startDate" type="date" value="${new Date().toISOString().slice(0, 10)}"></label><label>Due date *<input name="dueDate" type="date" min="${new Date().toISOString().slice(0, 10)}" required></label></div><div id="projectError" class="form-error" role="alert"></div><div class="action-row"><button class="btn primary">Create project</button><button type="button" class="btn outline" onclick="navigate('/customer/projects')">Cancel</button></div></form></div>`,
  );
  document.getElementById("newProjectForm").onsubmit = async (e) => {
    e.preventDefault();
    const error = document.getElementById("projectError");
    error.textContent = "";
    try {
      const d = await api("/projects", { method: "POST", body: Object.fromEntries(new FormData(e.target)) });
      toast("Project created");
      navigate("/customer/projects/" + d.project.id);
      await projectDetail(d.project.id);
    } catch (err) {
      error.textContent = err.message;
    }
  };
}

function timelinePosition(p, ph) {
  const start = new Date(p.startDate).getTime(),
    end = new Date(p.dueDate).getTime(),
    a = new Date(ph.startDate || p.startDate).getTime(),
    b = new Date(ph.dueDate || p.dueDate).getTime(),
    span = Math.max(1, end - start);
  const left = Math.max(0, Math.min(100, ((a - start) / span) * 100)),
    width = Math.max(3, Math.min(100 - left, ((b - a) / span) * 100));
  return `left:${left}%;width:${width}%`;
}

function phaseCard(p, ph, i, sups) {
  const s = sups.find((x) => x.id === ph.supplierId),
    tasks = Array.isArray(ph.subtasks) ? ph.subtasks : [],
    history = ph.assignmentHistory || [];
  return `<article class="phase-card task-card"><div class="phase-card-head"><div><div class="task-title"><span class="phase-dot ${ph.status === "Completed" ? "done" : ph.status === "In Progress" ? "active" : ""}">${i + 1}</span><div><h3>${esc(ph.name)}</h3><span class="status ${ph.status.toLowerCase().replaceAll(" ", "-")}">${esc(ph.status)}</span></div></div><p>${esc(ph.description || "No task details yet.")}</p></div><div class="cc-actions"><button class="btn small outline" onclick="editPhase('${p.id}','${ph.id}')">Edit task</button><button class="btn small danger" onclick="deletePhase('${p.id}','${ph.id}')">Delete</button></div></div><div class="phase-timeline-bar"><span>${date(ph.startDate)}</span><div class="gantt-track"><i class="${ph.status === "Completed" ? "done" : ""}" style="${timelinePosition(p, ph)}"></i></div><span>${date(ph.dueDate)}</span></div><div class="detail-grid"><div class="detail-box"><small>Supplier / invitation</small>${s ? `<div class="supplier-inline"><span class="supplier-avatar">${esc(s.avatar || "CC")}</span><b>${esc(s.company)}</b><span class="tag ${ph.acceptanceStatus === "Accepted" ? "green" : "orange"}">${esc(ph.acceptanceStatus)}</span></div>` : '<span class="muted">Unassigned · planning</span>'}${ph.orderAmount ? `<small class="order-limit">Order limit: ${money(ph.orderAmount)}</small>` : ""}</div><div class="detail-box"><small>Deliverables & current status</small><b>${(ph.deliverables || []).length} files · ${esc(ph.status)}</b><small>${tasks.filter((t) => typeof t === "object" && t.done).length}/${tasks.length} subtasks done</small></div></div>${
    tasks.length
      ? `<div class="subtask-list"><b>Task checklist</b>${tasks
          .map((t, n) => {
            const x = typeof t === "string" ? { text: t, done: false } : t;
            return `<label class="subtask"><input type="checkbox" ${x.done ? "checked" : ""} onchange="toggleSubtask('${p.id}','${ph.id}',${n},this.checked)"><span>${esc(x.text)}</span></label>`;
          })
          .join("")}</div>`
      : ""
  }<div class="phase-tools"><button class="btn small primary" onclick="assignSupplier('${p.id}','${ph.id}')">${s ? "Invite another supplier" : "Request supplier"}</button><label class="btn small outline">Upload document<input type="file" hidden onchange="uploadDeliverable('${p.id}','${ph.id}',this)"></label><button class="btn small outline" onclick="navigate('/customer/invoices')">Invoices</button><button class="btn small outline" onclick="navigate('/customer/messages')">Project messages</button></div>${history.length ? `<details class="assignment-history"><summary>Request and assignment archive · ${history.length}</summary>${history.map((h) => `<div class="history-row"><span>${esc(h.company)}</span><span>${esc(h.status)}</span><small>${date(h.at)}</small></div>`).join("")}</details>` : ""}${(ph.deliverables || []).length ? `<div class="deliverable-list">${ph.deliverables.map((f) => `<span class="tag">📎 ${esc(f.filename)}</span>`).join("")}</div>` : ""}</article>`;
}

async function projectDetail(pid) {
  const d = await api("/projects/" + pid),
    p = d.project,
    canComplete = p.phases.length && p.phases.every((x) => x.status === "Completed");
  const timeline = `<section class="panel project-timeline"><div class="panel-title"><div><h3>Project timeline</h3><small>Ordered phases from planning through delivery</small></div><span>${pct(p.phases)}% complete</span></div><div class="gantt-head"><span>Task</span><span>Schedule</span><span>Status</span></div>${p.phases.map((ph, i) => `<div class="gantt-row"><b>${i + 1}. ${esc(ph.name)}</b><div class="gantt-track"><i class="${ph.status === "Completed" ? "done" : ""}" style="${timelinePosition(p, ph)}"></i></div><span class="status ${ph.status.toLowerCase().replaceAll(" ", "-")}">${esc(ph.status)}</span></div>`).join("")}</section>`;
  app.innerHTML = dashboardShell(
    "customer",
    "projects",
    `<div class="breadcrumb"><a href="#/customer/projects">Projects</a> / ${esc(p.name)}</div><div class="dash-top"><div><div class="eyebrow">PROJECT WORKSPACE</div><h1>${esc(p.name)}</h1><p>${esc(p.description)}</p></div><div class="cc-actions"><button class="btn outline" onclick="editProject('${p.id}')">Edit project</button><button class="btn outline" onclick="openSupport('${p.id}')">Escalate / support</button><button class="btn danger" onclick="deleteProject('${p.id}')">Delete</button></div></div><div class="health"><div class="cc-card"><span class="cc-label">Budget</span><b>${money(p.budget)}</b></div><div class="cc-card"><span class="cc-label">Timeline</span><b>${date(p.startDate)} → ${date(p.dueDate)}</b></div><div class="cc-card"><span class="cc-label">Overall progress</span><b>${pct(p.phases)}%</b><div class="progress"><i style="width:${pct(p.phases)}%"></i></div></div></div>${timeline}<div class="panel project-task-panel"><div class="panel-title"><div><h3>Tasks & supplier requests</h3><small>Plan work, compare supplier responses and track delivery</small></div><button class="btn small primary" onclick="addPhase('${p.id}')">+ Add task</button></div><div id="phaseList">${p.phases.map((ph, i) => phaseCard(p, ph, i, d.suppliers)).join("") || '<div class="empty">Add a task to build the project plan.</div>'}</div><div class="action-row"><button class="btn success" ${canComplete ? "" : "disabled"} onclick="completeProject('${p.id}')">Mark project complete</button>${p.status === "Completed" ? `<button class="btn primary" onclick="reviewProjectSuppliers('${p.id}')">Review suppliers</button>` : '<span class="subtle">All tasks must be completed before closing the project.</span>'}</div></div>`,
  );
}

function taskFromLines(text) {
  return String(text || "")
    .split(/\r?\n/)
    .map((x) => x.trim())
    .filter(Boolean)
    .map((text, i) => ({ id: "task_" + Date.now().toString(36) + "_" + i, text, done: false }));
}
async function toggleSubtask(pid, phid, index, done) {
  try {
    const { project: p } = await api("/projects/" + pid),
      ph = p.phases.find((x) => x.id === phid),
      tasks = (ph.subtasks || []).map((x, i) =>
        typeof x === "string" ? { id: "task_" + i, text: x, done: false } : x,
      );
    if (!tasks[index]) return;
    tasks[index].done = done;
    await api(`/projects/${pid}/phases/${phid}`, { method: "PUT", body: { subtasks: tasks } });
    await projectDetail(pid);
  } catch (e) {
    toast(e.message, "error");
  }
}

async function addPhase(pid) {
  modal(
    "Add task",
    `<form id="phaseF" class="modal-form"><label>Task name<input name="name" required></label><label>Task details<textarea name="description"></textarea></label><div class="two"><label>Start date<input name="startDate" type="date"></label><label>Due date<input name="dueDate" type="date" required></label></div><label>Order amount (€)<input name="orderAmount" type="number" min="0" step="0.01" placeholder="Optional customer-approved cap"></label><label>Subtasks <small>One per line</small><textarea name="subtasksText" rows="4" placeholder="Prepare drawings&#10;Review safety plan"></textarea></label><button class="btn primary">Add task</button></form>`,
  );
  document.getElementById("phaseF").onsubmit = async (e) => {
    e.preventDefault();
    const b = Object.fromEntries(new FormData(e.target));
    b.subtasks = taskFromLines(b.subtasksText);
    delete b.subtasksText;
    try {
      await api(`/projects/${pid}/phases`, { method: "POST", body: b });
      closeModal();
      toast("Task added");
      projectDetail(pid);
    } catch (err) {
      document
        .getElementById("phaseF")
        .insertAdjacentHTML("beforeend", `<div class="form-error">${esc(err.message)}</div>`);
    }
  };
}

async function editPhase(pid, phid) {
  const { project: p } = await api("/projects/" + pid),
    ph = p.phases.find((x) => x.id === phid),
    tasks = ph.subtasks || [];
  modal(
    "Edit task",
    `<form id="phaseF" class="modal-form"><label>Task name<input name="name" value="${esc(ph.name)}" required></label><label>Task details<textarea name="description">${esc(ph.description)}</textarea></label><div class="two"><label>Start date<input name="startDate" type="date" value="${ph.startDate || ""}"></label><label>Due date<input name="dueDate" type="date" value="${ph.dueDate || ""}" required></label></div><div class="two"><label>Status<select name="status">${["Not Started", "In Progress", "Under Review", "Completed", "On Hold"].map((s) => `<option ${ph.status === s ? "selected" : ""}>${s}</option>`).join("")}</select></label><label>Order amount (€)<input name="orderAmount" type="number" min="0" step="0.01" value="${ph.orderAmount || ""}" placeholder="No cap set"></label></div><label>Subtasks <small>One per line</small><textarea name="subtasksText" rows="5">${esc(tasks.map((x) => (typeof x === "string" ? x : x.text)).join("\n"))}</textarea></label><button class="btn primary">Save task</button></form>`,
  );
  document.getElementById("phaseF").onsubmit = async (e) => {
    e.preventDefault();
    const b = Object.fromEntries(new FormData(e.target));
    b.subtasks = taskFromLines(b.subtasksText);
    delete b.subtasksText;
    try {
      await api(`/projects/${pid}/phases/${phid}`, { method: "PUT", body: b });
      closeModal();
      toast("Task updated");
      projectDetail(pid);
    } catch (err) {
      document
        .getElementById("phaseF")
        .insertAdjacentHTML("beforeend", `<div class="form-error">${esc(err.message)}</div>`);
    }
  };
}

async function assignSupplier(pid, phid) {
  const d = await api("/projects/" + pid),
    suppliers = d.suppliers;
  modal(
    "Request supplier for task",
    `<form id="assignF" class="modal-form"><label>Supplier<select name="supplierId" required><option value="">Choose a vetted supplier</option>${suppliers.map((s) => `<option value="${esc(s.id)}">${esc(s.company)} · ${esc(s.location)} · ${esc(supplierBadge(s))} · ★ ${s.rating}</option>`).join("")}</select></label><div class="notice">This sends an invitation. The response will be recorded in the task archive. The task stays in planning until the supplier accepts.</div><button class="btn primary">Send supplier request</button></form>`,
  );
  document.getElementById("assignF").onsubmit = async (e) => {
    e.preventDefault();
    try {
      await api(`/projects/${pid}/assign`, {
        method: "POST",
        body: { phaseId: phid, supplierId: new FormData(e.target).get("supplierId") },
      });
      closeModal();
      toast("Supplier request sent");
      projectDetail(pid);
    } catch (err) {
      document
        .getElementById("assignF")
        .insertAdjacentHTML("beforeend", `<div class="form-error">${esc(err.message)}</div>`);
    }
  };
}

async function supplierCatalog() {
  const d = await api("/profile"),
    s = d.supplier || {};
  app.innerHTML = dashboardShell(
    "supplier",
    "suppliers",
    `<div class="dash-top"><div><div class="eyebrow">YOUR MARKETPLACE PROFILE</div><h1>Service catalog</h1><p>Manage the services, people, credentials and rates customers can evaluate.</p></div><div class="cc-actions"><button class="btn outline" onclick="editProfile()">Edit company details</button><button class="btn primary" onclick="editCatalog()">Edit catalog & team</button></div></div>${!s.live ? '<div class="notice">Your profile is private until the supplier vetting process is approved. You can complete it now.</div>' : ""}<div class="supplier-profile-head"><div class="supplier-avatar large">${esc(s.avatar || "CC")}</div><div><h2>${esc(s.company || d.user.company || "Your company")}</h2><p>${esc(s.location || "Add your location")} · ${esc(s.applicationStatus || "Profile draft")}</p></div><span class="badge ${(s.badge || "bronze").toLowerCase()}">${esc(supplierBadge(s))}</span></div><div class="health"><div class="cc-card"><span class="cc-label">Employees</span><b>${Number(s.employees) || 0}</b></div><div class="cc-card"><span class="cc-label">Experience</span><b>${Number(s.experience) || 0}+ years</b></div><div class="cc-card"><span class="cc-label">Rates</span><b>${money(s.hourlyRate || 0)}/h · ${money(s.projectRate || 0)} starting</b></div></div><div class="supplier-profile-grid"><section class="cc-card"><h2>Services</h2>${(s.services || []).map((x) => `<span class="chip">${esc(x)}</span>`).join("") || '<p class="muted">Add services to make your capabilities clear.</p>'}<h2>Certifications</h2>${(s.certifications || []).map((x) => `<span class="chip">${esc(x)}</span>`).join("") || '<p class="muted">Add your current certifications.</p>'}<h2>About your company</h2><p>${esc(s.description || "Add a short company overview.")}</p></section><section class="cc-card"><h2>Your people</h2><p>${Number(s.employees) || 0} employees</p>${(s.teamMembers || []).map((m) => `<div class="team-row"><b>${esc(m.name)}</b><span>${esc(m.role)}</span><small>${esc(m.experience || m.certifications || "")}</small></div>`).join("") || '<p class="muted">Add key workers and employee roles for customers to review.</p>'}</section></div>`,
  );
}

async function editCatalog() {
  const d = await api("/profile"),
    s = d.supplier || {},
    services = [
      "Mechanical Engineering",
      "Electrical Engineering",
      "PLC Programming",
      "Robotics",
      "CAD / Design",
      "Manufacturing",
      "Installation",
      "Commissioning",
      "Project Management",
      "Industrial Shipping",
    ],
    certs = [
      "ISO 9001",
      "ISO 13849",
      "ISO 14001",
      "ISO 45001",
      "TÜV",
      "CE Machinery",
      "VDA 6.3",
      "SCC Safety",
    ];
  const team = (s.teamMembers || [])
    .map((m) => [m.name, m.role, m.experience || m.certifications].filter(Boolean).join(" — "))
    .join("\n");
  modal(
    "Edit services & team",
    `<form id="catf" class="modal-form"><h3>Services customers can request</h3><div class="check-grid2">${services.map((x) => `<label class="choice-row"><input type="checkbox" name="services" value="${esc(x)}" ${(s.services || []).includes(x) ? "checked" : ""}> ${esc(x)}</label>`).join("")}</div><h3>Certifications</h3><div class="check-grid2">${certs.map((x) => `<label class="choice-row"><input type="checkbox" name="certifications" value="${esc(x)}" ${(s.certifications || []).includes(x) ? "checked" : ""}> ${esc(x)}</label>`).join("")}</div><div class="two"><label>Employees<input name="employees" type="number" min="0" value="${Number(s.employees) || 0}"></label><label>Years of experience<input name="experience" type="number" min="0" value="${Number(s.experience) || 0}"></label></div><label>Key employees <small>One person per line: Name — Role — experience or certification</small><textarea name="teamText" rows="5" placeholder="Marta Keller — Project lead — 12 years&#10;Jonas Weber — PLC engineer — Siemens certified">${esc(team)}</textarea></label><div class="two"><label>Availability<select name="availability"><option>Available</option><option>Busy</option><option>Unavailable</option></select></label><label>Hourly rate (€)<input name="hourlyRate" type="number" min="0" step="0.01" value="${Number(s.hourlyRate) || 0}"></label></div><label>Starting project rate (€)<input name="projectRate" type="number" min="0" step="0.01" value="${Number(s.projectRate) || 0}"></label><div id="catalogError" class="form-error" role="alert"></div><button class="btn primary">Save company catalog</button></form>`,
  );
  document.querySelector("#catf select[name=availability]").value = s.availability || "Available";
  document.getElementById("catf").onsubmit = async (e) => {
    e.preventDefault();
    const fd = new FormData(e.target),
      teamMembers = String(fd.get("teamText") || "")
        .split(/\r?\n/)
        .map((x) => x.trim())
        .filter(Boolean)
        .map((line) => {
          const [name, role, ...rest] = line.split("—").map((x) => x.trim());
          return { name, role: role || "", experience: rest.join(" — ") || "" };
        });
    const b = {
      services: fd.getAll("services"),
      certifications: fd.getAll("certifications"),
      employees: fd.get("employees"),
      experience: fd.get("experience"),
      teamMembers,
      availability: fd.get("availability"),
      hourlyRate: fd.get("hourlyRate"),
      projectRate: fd.get("projectRate"),
    };
    try {
      await api("/profile", { method: "PUT", body: b });
      closeModal();
      toast("Service catalog updated");
      supplierCatalog();
    } catch (err) {
      document.getElementById("catalogError").textContent = err.message;
    }
  };
}

async function editProfile() {
  const d = await api("/profile"),
    s = d.supplier || {};
  modal(
    "Edit company details",
    `<form id="pf" class="modal-form"><label>Contact name<input name="name" value="${esc(d.user.name)}" required></label><label>Company<input name="company" value="${esc(d.user.company || s.company || "")}" required></label><label>Location<input name="location" value="${esc(s.location || "")}" placeholder="City, country"></label><label>Company overview<textarea name="description" rows="5">${esc(s.description || "")}</textarea></label><div id="profileError" class="form-error" role="alert"></div><button class="btn primary">Save company profile</button></form>`,
  );
  document.getElementById("pf").onsubmit = async (e) => {
    e.preventDefault();
    try {
      await api("/profile", { method: "PUT", body: Object.fromEntries(new FormData(e.target)) });
      closeModal();
      toast("Company profile updated");
      route();
    } catch (err) {
      document.getElementById("profileError").textContent = err.message;
    }
  };
}

async function newInvoice() {
  const d = await api("/projects"),
    profile = await api("/profile"),
    s = profile.supplier || {},
    selected = new URLSearchParams(location.hash.split("?")[1] || "");
  const eligible = [];
  for (const p of d.projects)
    for (const ph of p.phases || [])
      if (ph.supplierId === s.id && ph.acceptanceStatus === "Accepted") eligible.push({ p, ph });
  window.__ccInvoiceServices = s.services || [];
  window.__ccInvoiceEligible = eligible;
  if (!eligible.length) {
    await supplierInvoices();
    toast("An accepted phase is required before invoicing", "error");
    return;
  }
  await supplierInvoices();
  const serviceOpts = (s.services || []).map((x) => `<option value="${esc(x)}">${esc(x)}</option>`).join("");
  const phaseOpts = eligible
    .map(
      ({ p, ph }) => `<option value="${esc(p.id)}|${esc(ph.id)}">${esc(p.name)} — ${esc(ph.name)}</option>`,
    )
    .join("");
  modal(
    "Create invoice",
    `<p class="modal-intro">Choose the customer order and itemize the delivered work. CraftCrew compares the total with the phase order limit.</p><form id="invF" class="modal-form"><label>Project / phase *<select name="target" id="invTarget" required><option value="">Select an accepted order</option>${phaseOpts}</select></label><div id="invoiceContext" class="notice">Select a phase to view its customer and approved order amount.</div><div class="invoice-lines-head"><h3>Invoice positions</h3><button class="btn small outline" type="button" onclick="addInvoiceLine()">+ Add position</button></div><div id="invoiceLines"></div><div class="invoice-total-row"><span>Invoice total</span><strong id="invoiceTotal">€0</strong></div><div id="invoiceOrderCheck" class="order-check">Select an order to compare totals.</div><label>Invoice note *<textarea name="description" required maxlength="3000" placeholder="Milestone, work period or delivery reference"></textarea></label><label>Supporting attachment<input name="attachmentFile" type="file"></label><div id="invoiceError" class="form-error" role="alert"></div><div class="action-row"><button class="btn primary">Submit invoice</button><button type="button" class="btn outline" onclick="closeModal();navigate('/supplier/invoices')">Cancel</button></div></form>`,
  );
  const first = eligible.find((x) => x.p.id === selected.get("project") && x.ph.id === selected.get("phase"));
  if (first) document.getElementById("invTarget").value = `${first.p.id}|${first.ph.id}`;
  addInvoiceLine();
  const updateContext = () => {
    const [pid, phid] = (document.getElementById("invTarget").value || "|").split("|"),
      entry = eligible.find((x) => x.p.id === pid && x.ph.id === phid),
      box = document.getElementById("invoiceContext");
    if (!entry) {
      box.textContent = "Select a phase to view its customer and approved order amount.";
      box.className = "notice";
    } else {
      const cap = Number(entry.ph.orderAmount) || 0;
      box.innerHTML = `<b>Customer:</b> ${esc(entry.p.customer?.company || entry.p.customer?.name || "Customer")}<br><b>Order:</b> ${esc(entry.p.name)} · ${esc(entry.ph.name)}<br><b>Approved phase amount:</b> ${cap ? money(cap) : "No amount cap set"}`;
      box.className = "notice";
    }
    refreshInvoiceTotal();
  };
  document.getElementById("invTarget").onchange = updateContext;
  document.getElementById("invoiceLines").addEventListener("input", refreshInvoiceTotal);
  document.getElementById("invoiceLines").addEventListener("change", refreshInvoiceTotal);
  updateContext();
  document.getElementById("invF").onsubmit = async (e) => {
    e.preventDefault();
    const err = document.getElementById("invoiceError");
    err.textContent = "";
    const target = document.getElementById("invTarget").value;
    if (!target) {
      err.textContent = "Choose the customer order this invoice belongs to.";
      return;
    }
    const [projectId, phaseId] = target.split("|"),
      entry = eligible.find((x) => x.p.id === projectId && x.ph.id === phaseId);
    const lineItems = [...document.querySelectorAll(".invoice-line")].map((row) => ({
      service: row.querySelector("[name=service]").value,
      quantity: Number(row.querySelector("[name=quantity]").value),
      unit: row.querySelector("[name=unit]").value,
      unitPrice: Number(row.querySelector("[name=unitPrice]").value),
    }));
    if (!lineItems.length || lineItems.some((x) => !x.service || x.quantity <= 0 || x.unitPrice < 0)) {
      err.textContent = "Add at least one complete invoice position.";
      return;
    }
    const amount = lineItems.reduce((sum, x) => sum + x.quantity * x.unitPrice, 0),
      fd = new FormData(e.target),
      file = fd.get("attachmentFile");
    try {
      const attachment = file && file.size ? await uploadFile(file) : null;
      await api("/invoices", {
        method: "POST",
        body: { projectId, phaseId, lineItems, amount, description: fd.get("description"), attachment },
      });
      closeModal();
      toast("Invoice submitted");
      navigate("/supplier/invoices");
      await supplierInvoices();
    } catch (ex) {
      err.textContent = ex.message;
    }
  };
}

function addInvoiceLine() {
  const services = window.__ccInvoiceServices || [];
  const list = document.getElementById("invoiceLines");
  if (!list) return;
  const row = document.createElement("div");
  row.className = "invoice-line";
  row.innerHTML = `<label>Service<select name="service" required><option value="">Choose service</option>${services.map((x) => `<option value="${esc(x)}">${esc(x)}</option>`).join("")}</select></label><label>Amount<input name="quantity" type="number" min="0.01" step="0.01" value="1" required></label><label>Unit<select name="unit"><option value="hours">Hours</option><option value="units">Units</option></select></label><label>Rate (€)<input name="unitPrice" type="number" min="0" step="0.01" value="0" required></label><button type="button" class="btn small danger" aria-label="Remove position" onclick="this.closest('.invoice-line').remove();refreshInvoiceTotal()">Remove</button>`;
  list.appendChild(row);
}
function refreshInvoiceTotal() {
  const rows = [...document.querySelectorAll(".invoice-line")],
    total = rows.reduce(
      (sum, row) =>
        sum +
        (Number(row.querySelector("[name=quantity]")?.value) || 0) *
          (Number(row.querySelector("[name=unitPrice]")?.value) || 0),
      0,
    );
  const totalEl = document.getElementById("invoiceTotal");
  if (totalEl) totalEl.textContent = money(total);
  const target = document.getElementById("invTarget")?.value || "",
    check = document.getElementById("invoiceOrderCheck");
  if (!check) return;
  const eligible = window.__ccInvoiceEligible || [],
    [pid, phid] = target.split("|"),
    entry = eligible.find((x) => x.p.id === pid && x.ph.id === phid),
    cap = Number(entry?.ph.orderAmount) || 0;
  if (!entry || !cap) {
    check.textContent = entry
      ? "No order amount cap is set for this phase."
      : "Choose an order to compare the invoice.";
    check.className = "order-check";
    return;
  }
  const over = total - cap;
  check.textContent =
    over > 0
      ? `Exceeds order by ${money(over)}. The customer will see the overage before approval.`
      : `Within approved order amount (${money(cap)}); ${money(cap - total)} remaining.`;
  check.className = "order-check " + (over > 0 ? "over" : "within");
}

async function supplierInvoices() {
  const d = await api("/invoices");
  app.innerHTML = dashboardShell(
    "supplier",
    "invoices",
    `<div class="dash-top"><div><h1>Invoices</h1><p>Track customer review, requested changes and payment state.</p></div><button class="btn primary" onclick="navigate('/supplier/invoices/new')">+ Create invoice</button></div><div class="panel"><div class="cc-table-wrap"><table class="cc-table"><thead><tr><th>Invoice</th><th>Order</th><th>Amount / order</th><th>Status</th><th>Comments</th><th>Action</th></tr></thead><tbody>${d.invoices.map((i) => `<tr><td><b>${esc(invNo(i))}</b><small>${date(i.createdAt)}</small></td><td>${esc(i.projectId)}<small>${esc(i.phaseId)}</small></td><td>${money(i.amount)}${i.orderedAmount ? `<small class="${i.exceedsOrder ? "danger-text" : "success-text"}">${i.exceedsOrder ? "Over by " + money(invNet(i) - i.orderedAmount) : "of " + money(i.orderedAmount)}</small>` : ""}</td><td><span class="status ${i.status.toLowerCase().replaceAll(" ", "-")}">${esc(i.status)}</span></td><td>${esc(i.comments || "—")}</td><td>${["Changes Requested", "Rejected"].includes(i.status) ? `<button class="btn small primary" onclick="resubmitInvoice('${i.id}')">Modify & resubmit</button>` : ""}</td></tr>`).join("") || '<tr><td colspan="6">No invoices yet.</td></tr>'}</tbody></table></div></div>`,
  );
}

async function customerInvoices() {
  const [d, pd] = await Promise.all([api("/invoices"), api("/projects")]);
  state.cache.projects = pd.projects;
  app.innerHTML = dashboardShell(
    "customer",
    "invoices",
    `<div class="dash-top"><div><h1>Invoices & payments</h1><p>Check submitted positions against each phase order before approving payment.</p></div></div><div class="panel"><div class="cc-table-wrap"><table class="cc-table"><thead><tr><th>Invoice</th><th>Order</th><th>Positions</th><th>Amount / cap</th><th>Status</th><th>Action</th></tr></thead><tbody>${
      d.invoices
        .map((i) => {
          const p = pd.projects.find((x) => x.id === i.projectId),
            ph = p?.phases.find((x) => x.id === i.phaseId);
          return `<tr><td><b>${esc(invNo(i))}</b><small>${date(i.createdAt)}</small></td><td>${esc(p?.name || i.projectId)}<small>${esc(ph?.name || i.phaseId)}</small></td><td>${(i.lineItems || []).length || "—"}</td><td>${money(i.amount)}${i.orderedAmount || ph?.orderAmount ? `<small class="${i.exceedsOrder || invNet(i) > (ph?.orderAmount || i.orderedAmount) ? "danger-text" : "success-text"}">${i.exceedsOrder || invNet(i) > (ph?.orderAmount || i.orderedAmount) ? "Over approved order" : "Within approved order"} · ${money(ph?.orderAmount || i.orderedAmount)}</small>` : ""}</td><td><span class="status ${i.status.toLowerCase().replaceAll(" ", "-")}">${esc(i.status)}</span></td><td><button class="btn small outline" onclick="reviewInvoice('${i.id}')">${i.status === "Submitted" ? "Review" : "View"}</button></td></tr>`;
        })
        .join("") || '<tr><td colspan="6">No invoices to review.</td></tr>'
    }</tbody></table></div></div>`,
  );
}

async function reviewInvoice(id) {
  const { invoice: i } = await api("/invoices/" + id),
    over = i.orderedAmount && invNet(i) > i.orderedAmount,
    lines = (i.lineItems || [])
      .map(
        (x) =>
          `<tr><td>${esc(x.service)}</td><td>${Number(x.quantity)} ${x.unit === "hours" ? "hours" : "units"}</td><td>${money(x.unitPrice)}</td><td>${money(x.total)}</td></tr>`,
      )
      .join("");
  modal(
    "Invoice " + invNo(i),
    `<div class="detail-grid"><div class="detail-box"><small>Invoice total</small><b>${money(i.amount)}</b></div><div class="detail-box"><small>Customer approved order</small><b>${i.orderedAmount ? money(i.orderedAmount) : "No cap recorded"}</b></div><div class="detail-box"><small>Variance</small><b class="${over ? "danger-text" : "success-text"}">${i.orderedAmount ? (over ? "Exceeds by " + money(invNet(i) - i.orderedAmount) : "Within order by " + money(i.orderedAmount - invNet(i))) : "No order cap"}</b></div><div class="detail-box"><small>Status</small><b>${esc(i.status)}</b></div></div>${lines ? `<h3>Invoice positions</h3><div class="cc-table-wrap"><table class="cc-table"><thead><tr><th>Service</th><th>Quantity</th><th>Unit rate</th><th>Total</th></tr></thead><tbody>${lines}</tbody></table></div>` : ""}<p>${esc(i.description)}</p>${i.comments ? `<div class="notice">${esc(i.comments)}</div>` : ""}${over ? `<div class="notice order-warning">This invoice exceeds the approved phase order by ${money(invNet(i) - i.orderedAmount)}. Review the positions before approval.</div>` : ""}${i.status === "Submitted" ? `<div class="action-row"><button class="btn success" onclick="invoiceAction('${id}','Approve')">Approve & schedule payment</button><button class="btn outline" onclick="invoiceAction('${id}','Request Changes')">Request changes</button><button class="btn danger" onclick="invoiceReject('${id}')">Reject</button></div>` : ""}`,
  );
}

async function supplierRequests() {
  const d = await api("/rfqs");
  app.innerHTML = dashboardShell(
    "supplier",
    "requests",
    `<div class="dash-top"><div><h1>Quote requests</h1><p>Review incoming requests from customers.</p></div></div><div class="cc-grid">${d.rfqs.map((r) => `<article class="cc-card"><div class="project-card-head"><b>${esc(r.service)}</b><span class="status ${r.status === "New" ? "submitted" : "active"}">${esc(r.status)}</span></div><p>${esc(r.customerCompany || r.customerName)} · ${esc(r.projectName || "General enquiry")}</p><p>${esc(r.message)}</p>${r.response ? `<div class="notice">${esc(r.response)}</div>` : ""}<small>${date(r.createdAt)}</small>${["New", "Reviewing"].includes(r.status) ? `<div class="cc-actions" style="margin-top:14px"><button class="btn small outline" onclick="respondQuote('${r.id}','Reviewing')">Reviewing</button><button class="btn small success" onclick="respondQuote('${r.id}','Quoted')">Send quote</button><button class="btn small danger" onclick="respondQuote('${r.id}','Declined')">Decline</button></div>` : ""}</article>`).join("") || '<div class="empty">No quote requests yet.</div>'}</div>`,
  );
}
async function respondQuote(id, status) {
  const response =
    status === "Quoted"
      ? (await uiPrompt("Add a short quote or next step (optional)")) || ""
      : status === "Declined"
        ? (await uiPrompt("Reason for declining (optional)")) || ""
        : "";
  try {
    await api("/rfqs/" + id, { method: "PATCH", body: { status, response } });
    supplierRequests();
  } catch (e) {
    toast(e.message, "error");
  }
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
            ["requests", "Quote Requests"],
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
  )}</div><div><b>${esc(state.user?.name || "")}</b><small>${esc(state.user?.company || role)}</small></div></div><nav>${links.map(([k, t]) => `<a class="${active === k ? "active" : ""}" href="#/${role}/${k}">${t}</a>`).join("")}</nav><div class="help">Industrial services, coordinated end-to-end.<br><button class="btn small ghost" onclick="navigate('/faq')">Help & FAQ</button><button class="btn small danger" style="margin-top:8px;width:100%" onclick="logout()">Log out</button></div></aside>`;
}

async function route() {
  topActions();
  const full = location.hash.replace(/^#/, "") || "/",
    h = full.split("?")[0],
    parts = h.split("/").filter(Boolean);
  if (!state.user && /^\/(customer|supplier|admin)(\/|$)/.test(h)) {
    navigate("/login");
    return;
  }
  try {
    if (h === "/suppliers") return renderSuppliers();
    if (h === "/supplier-application") return supplierApplication();
    if (h === "/login") return renderAuth("login");
    if (h === "/signup") return renderAuth("signup");
    if (parts[0] === "customer") {
      if (parts[1] === "dashboard") return customerDashboard();
      if (parts[1] === "projects" && !parts[2]) return customerProjects();
      if (parts[1] === "projects" && parts[2] === "new") return newProject();
      if (parts[1] === "projects" && parts[2]) return projectDetail(parts[2]);
      if (parts[1] === "suppliers" && parts[2]) return supplierDetail(parts[2]);
      if (parts[1] === "suppliers") return renderSuppliers();
      if (parts[1] === "invoices") return customerInvoices();
      if (parts[1] === "messages") return messages("customer");
      if (parts[1] === "profile") return profilePage("customer");
    }
    if (parts[0] === "supplier") {
      if (parts[1] === "dashboard") return supplierDashboard();
      if (parts[1] === "phases" || parts[1] === "projects") return supplierPhases();
      if (parts[1] === "requests") return supplierRequests();
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
    const content = `<div class="empty"><h2>Something went wrong</h2><p>${esc(e.message)}</p><button class="btn primary" onclick="route()">Retry</button></div>`,
      active =
        parts[0] === state.user?.role
          ? parts[1] === "invoices"
            ? "invoices"
            : parts[1] || "dashboard"
          : "dashboard";
    app.innerHTML = state.user
      ? dashboardShell(state.user.role, active, content)
      : publicLayout(`<div class="cc-page">${content}</div>`);
  }
}

window.addEventListener("DOMContentLoaded", async () => {
  if (state.token) {
    try {
      const d = await api("/auth/me");
      state.user = d.user;
      localStorage.setItem("cc_user", JSON.stringify(d.user));
      document.body.classList.add("authenticated");
    } catch (e) {
      // An expired session keeps the page the user wanted and says why they must sign in again.
      if (e.status === 401) sessionExpired();
      else logout();
      return;
    }
  }
  route();
});
