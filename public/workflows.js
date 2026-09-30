// Expanded collaboration workflows: phase/task planning, offers, document control and scoped workspaces.
const wfToday = () => new Date().toISOString().slice(0, 10);
const wfPath = () => location.hash.replace(/^#/, "");
const wfQuery = () => new URLSearchParams(location.hash.split("?")[1] || "");
function wfSupplier(sups, id) {
  return sups.find((s) => s.id === id);
}
function wfTaskCard(p, ph, t, sups) {
  const s = wfSupplier(sups, t.assignedSupplierId),
    late = t.status !== "Completed" && t.dueDate < wfToday(),
    deps = (t.dependencies || []).map((x) => ph.tasks?.find((z) => z.id === x)).filter(Boolean);
  return `<article class="wf-task ${late ? "wf-late" : ""}"><div class="wf-task-head"><div><div class="eyebrow">ASSIGNABLE TASK</div><h4>${esc(t.name)}</h4><p>${esc(t.description || "No task description")}</p></div><span class="status ${String(
    t.status || "Not Started",
  )
    .toLowerCase()
    .replaceAll(
      " ",
      "-",
    )}">${esc(t.status || "Not Started")}</span></div><div class="wf-task-meta"><span>${date(t.startDate)} → ${date(t.dueDate)}</span><span>${s ? esc(s.company) + " · " + esc(t.acceptanceStatus || "Invited") : "No supplier assigned"}</span><span>Order ${t.orderAmount ? money(t.orderAmount) : "not set"} · ${Number(t.progress) || 0}%</span></div>${deps.length ? `<small>Depends on: ${deps.map((x) => esc(x.name)).join(", ")}</small>` : ""}${late ? `<div class="notice order-warning">This task is overdue. Dependent work may slip and extend project cost.</div>` : ""}<div class="wf-task-actions">${state.user.role === "customer" ? `<button class="btn small outline" onclick="wfEditTask('${p.id}','${ph.id}','${t.id}')">Edit task</button><button class="btn small outline" onclick="wfAssignTask('${p.id}','${t.id}')">${s ? "Change supplier" : "Select supplier"}</button><button class="btn small primary" onclick="wfCreateBid('${p.id}','${ph.id}','${t.id}')">${t.offers?.length ? "Compare bids" : "Request bids"}</button>` : `${t.assignedSupplierId === state.user.supplierId && t.acceptanceStatus === "Pending" ? `<button class="btn small success" onclick="wfAcceptTask('${p.id}','${t.id}',true)">Accept</button><button class="btn small outline" onclick="wfAcceptTask('${p.id}','${t.id}',false)">Decline</button>` : ""}<button class="btn small outline" onclick="wfUpdateProgress('${p.id}','${ph.id}','${t.id}',${Number(t.progress) || 0})">Update progress</button><button class="btn small primary" onclick="wfSupplierBid('${p.id}','${ph.id}','${t.id}')">Submit offer</button>`}<button class="btn small outline" onclick="navigate('/${state.user.role}/projects/${p.id}/documents?phase=${ph.id}&task=${t.id}')">Documents</button><button class="btn small outline" onclick="navigate('/${state.user.role}/invoices?project=${p.id}&phase=${ph.id}&task=${t.id}&back='+encodeURIComponent('/${state.user.role}/projects/${p.id}'))">Invoices</button><button class="btn small outline" onclick="navigate('/${state.user.role}/messages?project=${p.id}&phase=${ph.id}&task=${t.id}&back='+encodeURIComponent('/${state.user.role}/projects/${p.id}'))">Messages</button></div>${t.assignmentHistory?.length ? `<details><summary>Supplier request history (${t.assignmentHistory.length})</summary>${t.assignmentHistory.map((x) => `<div class="history-row"><span>${esc(x.company)}</span><span>${esc(x.status)}</span><small>${date(x.at)}</small></div>`).join("")}</details>` : ""}</article>`;
}
function wfPhaseCard(p, ph, i, sups) {
  const tasks = ph.tasks || [],
    late = tasks.some((t) => t.status !== "Completed" && t.dueDate < wfToday()),
    docsCount = (window.__wfDocs || []).filter((d) => d.phaseId === ph.id).length;
  return `<section class="wf-phase"><div class="wf-phase-head"><div class="wf-phase-title"><span class="phase-dot ${ph.status === "Completed" ? "done" : ph.status === "In Progress" ? "active" : ""}">${i + 1}</span><div><h3>${esc(ph.name)}</h3><p>${esc(ph.description || "Phase scope not set")}</p><span class="status ${String(ph.status).toLowerCase().replaceAll(" ", "-")}">${esc(ph.status)}</span></div></div><div class="cc-actions"><button class="btn small outline" onclick="wfEditPhase('${p.id}','${ph.id}')">Edit phase</button><button class="btn small primary" onclick="wfAddTask('${p.id}','${ph.id}')">+ Add task</button></div></div><div class="phase-timeline-bar"><span>${date(ph.startDate)}</span><div class="gantt-track"><i class="${ph.status === "Completed" ? "done" : ""}" style="${timelinePosition(p, ph)}"></i></div><span>${date(ph.dueDate)}</span></div>${late ? '<div class="notice order-warning">Schedule warning: overdue tasks may affect this phase, its successors and the project budget.</div>' : ""}${
    ph.dependencies?.length
      ? `<small>Depends on phases: ${ph.dependencies
          .map((id) => p.phases.find((x) => x.id === id)?.name)
          .filter(Boolean)
          .map(esc)
          .join(", ")}</small>`
      : ""
  }<div class="wf-task-list">${tasks.map((t) => wfTaskCard(p, ph, t, sups)).join("") || '<div class="empty">No tasks yet. Add assignable work under this phase.</div>'}</div><div class="wf-phase-footer"><span>${tasks.length} tasks · ${tasks.filter((t) => t.status === "Completed").length} complete · ${docsCount} documents</span><button class="btn small outline" onclick="navigate('/${state.user.role}/projects/${p.id}/documents?phase=${ph.id}')">Open phase documents</button></div></section>`;
}
async function projectDetail(pid) {
  const [d, docs] = await Promise.all([
    api("/projects/" + pid),
    api(`/projects/${pid}/documents`).catch(() => ({ documents: [] })),
  ]);
  const p = d.project;
  window.__wfDocs = docs.documents || [];
  const allTasks = p.phases.flatMap((ph) => ph.tasks || []),
    completed = allTasks.filter((t) => t.status === "Completed").length,
    late = allTasks.filter((t) => t.status !== "Completed" && t.dueDate < wfToday()),
    pendingDocs = window.__wfDocs.filter((x) => x.status === "Pending approval").length,
    projectInvoices = d.invoices || [],
    spent = projectInvoices
      .filter((i) => !["Rejected", "Changes Requested"].includes(i.status))
      .reduce((a, i) => a + Number(i.amount || 0), 0),
    openTasks = allTasks.filter((t) => t.status !== "Completed").length;
  const duePhaseIds = new Set(
    p.phases
      .filter((ph) => late.length && ph.status !== "Completed")
      .flatMap((ph) =>
        p.phases.filter((next) => (next.dependencies || []).includes(ph.id)).map((next) => next.id),
      ),
  );
  const gantt = `<section class="panel project-timeline"><div class="panel-title"><div><h3>Project schedule</h3><small>Phases contain tasks · dependency and delay warnings</small></div><span>${allTasks.length ? Math.round((completed / allTasks.length) * 100) : 0}% complete</span></div><div class="wf-gantt-head"><span>Phase / task</span><span>Schedule</span><span>Owner / status</span></div>${p.phases.map((ph, i) => `<div class="wf-gantt-phase"><b>${i + 1}. ${esc(ph.name)}</b><span>${date(ph.startDate)} → ${date(ph.dueDate)}</span><span>${esc(ph.status)}${duePhaseIds.has(ph.id) ? " · ⚠ downstream risk" : ""}</span></div>${(ph.tasks || []).map((t) => `<div class="wf-gantt-task"><span>${esc(t.name)}</span><div class="gantt-track"><i class="${t.status === "Completed" ? "done" : t.dueDate < wfToday() ? "late" : ""}" style="${timelinePosition(p, t)}"></i></div><span>${date(t.dueDate)} · ${Number(t.progress) || 0}%</span></div>`).join("")}`).join("")}</section>`;
  const content = `<div class="breadcrumb"><a href="#/${state.user.role}/projects">Projects</a> / ${esc(p.name)}</div><div class="dash-top"><div><div class="eyebrow">PROJECT WORKSPACE</div><h1>${esc(p.name)}</h1><p>${esc(p.description)}</p></div><div class="cc-actions"><button class="btn outline" onclick="editProject('${p.id}')">Edit project</button><button class="btn outline" onclick="openSupport('${p.id}')">Escalate / support</button><button class="btn danger" onclick="deleteProject('${p.id}')">Delete</button></div></div><div class="wf-stat-grid"><div class="cc-card"><span class="cc-label">Budget</span><b>${money(p.budget)}</b><small>${money(Math.max(0, p.budget - spent))} remaining · ${money(spent)} invoiced</small></div><div class="cc-card"><span class="cc-label">Schedule</span><b>${date(p.startDate)} → ${date(p.dueDate)}</b><small>${late.length} overdue tasks · ${openTasks} open tasks</small></div><div class="cc-card"><span class="cc-label">Delivery</span><b>${allTasks.length ? Math.round((completed / allTasks.length) * 100) : 0}% complete</b><small>${completed}/${allTasks.length} tasks complete</small></div><div class="cc-card"><span class="cc-label">Project desk</span><b>${window.__wfDocs.length} documents · ${pendingDocs} approvals</b><small>${projectInvoices.length} invoices · ${(d.suppliers || []).length} available suppliers</small></div></div>${late.length ? `<div class="notice order-warning">${late.length} overdue task(s). Review dependent dates, supplier schedules and remaining budget.</div>` : ""}${gantt}<div class="wf-project-nav"><button class="btn outline" onclick="navigate('/${state.user.role}/projects/${p.id}/documents')">📁 Project documents (${window.__wfDocs.length})</button><button class="btn outline" onclick="navigate('/${state.user.role}/offers?project=${p.id}')">Compare offers</button><button class="btn outline" onclick="navigate('/${state.user.role}/invoices?project=${p.id}&back='+encodeURIComponent('/${state.user.role}/projects/${p.id}'))">Project invoices</button><button class="btn outline" onclick="navigate('/${state.user.role}/messages?project=${p.id}&back='+encodeURIComponent('/${state.user.role}/projects/${p.id}'))">Project messages</button></div><section class="panel project-task-panel"><div class="panel-title"><div><h3>Project phases</h3><small>Break each phase into supplier-assignable tasks</small></div>${state.user.role === "customer" ? `<button class="btn small primary" onclick="wfAddPhase('${p.id}')">+ Add phase</button>` : ""}</div><div>${p.phases.map((ph, i) => wfPhaseCard(p, ph, i, d.suppliers || [])).join("") || '<div class="empty">Add a phase to start planning.</div>'}</div><div class="action-row"><button class="btn success" ${p.phases.length && p.phases.every((x) => x.status === "Completed") ? "" : "disabled"} onclick="completeProject('${p.id}')">Mark project complete</button></div></section>`;
  app.innerHTML = dashboardShell(state.user.role, "projects", content);
}
async function wfAddPhase(pid) {
  const { project: p } = await api("/projects/" + pid);
  modal(
    "Add project phase",
    `<form id="wfF" class="modal-form"><label>Phase name *<input name="name" required></label><label>Scope<textarea name="description"></textarea></label><div class="two"><label>Start date<input name="startDate" type="date" value="${p.startDate}"></label><label>Due date *<input name="dueDate" type="date" value="${p.dueDate}" required></label></div><label>Depends on phase<select name="dependency"><option value="">No dependency</option>${p.phases.map((x) => `<option value="${x.id}">${esc(x.name)}</option>`).join("")}</select></label><button class="btn primary">Add phase</button></form>`,
  );
  document.getElementById("wfF").onsubmit = async (e) => {
    e.preventDefault();
    const b = Object.fromEntries(new FormData(e.target));
    b.dependencies = b.dependency ? [b.dependency] : [];
    delete b.dependency;
    try {
      await api(`/projects/${pid}/phases`, { method: "POST", body: b });
      closeModal();
      await projectDetail(pid);
    } catch (x) {
      toast(x.message, "error");
    }
  };
}
async function wfEditPhase(pid, phid) {
  const { project: p } = await api("/projects/" + pid),
    ph = p.phases.find((x) => x.id === phid);
  modal(
    "Edit project phase",
    `<form id="wfF" class="modal-form"><label>Phase name<input name="name" value="${esc(ph.name)}" required></label><label>Scope<textarea name="description">${esc(ph.description || "")}</textarea></label><div class="two"><label>Start date<input name="startDate" type="date" value="${ph.startDate || ""}"></label><label>Due date<input name="dueDate" type="date" value="${ph.dueDate || ""}" required></label></div><div class="two"><label>Status<select name="status">${["Not Started", "In Progress", "Under Review", "Completed", "On Hold"].map((x) => `<option ${x === ph.status ? "selected" : ""}>${x}</option>`).join("")}</select></label><label>Depends on phase<select name="dependency"><option value="">No dependency</option>${p.phases
      .filter((x) => x.id !== phid)
      .map(
        (x) =>
          `<option value="${x.id}" ${(ph.dependencies || []).includes(x.id) ? "selected" : ""}>${esc(x.name)}</option>`,
      )
      .join("")}</select></label></div><button class="btn primary">Save phase</button></form>`,
  );
  document.getElementById("wfF").onsubmit = async (e) => {
    e.preventDefault();
    const b = Object.fromEntries(new FormData(e.target));
    b.dependencies = b.dependency ? [b.dependency] : [];
    delete b.dependency;
    await api(`/projects/${pid}/phases/${phid}`, { method: "PUT", body: b });
    closeModal();
    projectDetail(pid);
  };
}
async function wfAddTask(pid, phid) {
  const { project: p } = await api("/projects/" + pid),
    ph = p.phases.find((x) => x.id === phid);
  modal(
    "Add assignable task",
    `<form id="wfF" class="modal-form"><label>Task name *<input name="name" required></label><label>Scope and deliverables<textarea name="description" required></textarea></label><div class="two"><label>Start date<input name="startDate" type="date" value="${ph.startDate || p.startDate}"></label><label>Due date *<input name="dueDate" type="date" value="${ph.dueDate || p.dueDate}" required></label></div><div class="two"><label>Order budget (€)<input name="orderAmount" type="number" min="0" step="0.01"></label><label>Depends on task<select name="dependency"><option value="">No task dependency</option>${(ph.tasks || []).map((t) => `<option value="${t.id}">${esc(t.name)}</option>`).join("")}</select></label></div><button class="btn primary">Add task</button></form>`,
  );
  document.getElementById("wfF").onsubmit = async (e) => {
    e.preventDefault();
    const b = Object.fromEntries(new FormData(e.target));
    b.dependencies = b.dependency ? [b.dependency] : [];
    delete b.dependency;
    await api(`/projects/${pid}/phases/${phid}/tasks`, { method: "POST", body: b });
    closeModal();
    projectDetail(pid);
  };
}
async function wfEditTask(pid, phid, tid) {
  const { project: p } = await api("/projects/" + pid),
    ph = p.phases.find((x) => x.id === phid),
    t = ph.tasks.find((x) => x.id === tid);
  modal(
    "Edit project task",
    `<form id="wfF" class="modal-form"><label>Task name<input name="name" value="${esc(t.name)}" required></label><label>Scope<textarea name="description">${esc(t.description || "")}</textarea></label><div class="two"><label>Start date<input name="startDate" type="date" value="${t.startDate || ""}"></label><label>Due date<input name="dueDate" type="date" value="${t.dueDate || ""}" required></label></div><div class="two"><label>Status<select name="status">${["Not Started", "In Progress", "Under Review", "Completed", "On Hold"].map((x) => `<option ${x === t.status ? "selected" : ""}>${x}</option>`).join("")}</select></label><label>Progress (%)<input name="progress" type="number" min="0" max="100" value="${Number(t.progress) || 0}"></label></div><label>Order amount (€)<input name="orderAmount" type="number" min="0" step="0.01" value="${t.orderAmount || ""}"></label><div class="action-row"><button class="btn primary">Save task</button><button type="button" class="btn danger" onclick="wfDeleteTask('${pid}','${phid}','${tid}')">Delete task</button></div></form>`,
  );
  document.getElementById("wfF").onsubmit = async (e) => {
    e.preventDefault();
    await api(`/projects/${pid}/phases/${phid}/tasks/${tid}`, {
      method: "PATCH",
      body: Object.fromEntries(new FormData(e.target)),
    });
    closeModal();
    projectDetail(pid);
  };
}
async function wfDeleteTask(pid, phid, tid) {
  if (!(await uiConfirm("Delete this task?"))) return;
  try {
    await api(`/projects/${pid}/phases/${phid}/tasks/${tid}`, { method: "DELETE" });
    closeModal();
    projectDetail(pid);
  } catch (e) {
    toast(e.message, "error");
  }
}
async function wfAssignTask(pid, tid) {
  const d = await api("/projects/" + pid);
  modal(
    "Compare and invite a supplier",
    `<div class="wf-compare">${(d.suppliers || []).map((s) => `<article class="cc-card"><b>${esc(s.company)}</b><p>${esc(s.location || "Location pending")} · ${esc(s.badge)} · ★ ${Number(s.rating || 0).toFixed(1)}</p><p>${(s.services || []).map(esc).join(" · ")}</p><strong>${money(s.hourlyRate || 0)}/hour · ${money(s.projectRate || 0)} starting</strong><button class="btn small primary" onclick="wfAssignSupplier('${pid}','${tid}','${s.id}')">Invite supplier</button></article>`).join("")}</div>`,
  );
}
async function wfAssignSupplier(pid, tid, sid) {
  try {
    await api(`/projects/${pid}/tasks/${tid}/assign`, { method: "POST", body: { supplierId: sid } });
    closeModal();
    await projectDetail(pid);
  } catch (e) {
    toast(e.message, "error");
  }
}
async function wfAcceptTask(pid, tid, accept) {
  await api(`/projects/${pid}/tasks/${tid}/accept`, { method: "POST", body: { accept } });
  await supplierPhases();
}
async function wfUpdateProgress(pid, phid, tid, current) {
  const value = await uiPrompt("Progress complete (0–100)", String(current));
  if (value === null) return;
  const n = Math.max(0, Math.min(100, Number(value) || 0));
  const status = n === 100 ? "Completed" : n > 0 ? "In Progress" : "Not Started";
  await api(`/projects/${pid}/phases/${phid}/tasks/${tid}`, {
    method: "PATCH",
    body: { progress: n, status },
  });
  await projectDetail(pid);
}
async function wfCreateBid(pid, phid, tid) {
  const { project: p } = await api("/projects/" + pid),
    ph = p.phases.find((x) => x.id === phid),
    t = ph.tasks.find((x) => x.id === tid);
  modal(
    "Request comparable supplier bids",
    `<form id="wfF" class="modal-form"><p class="modal-intro">Suppliers submit amount, delivery days and scope. The task can be awarded to one supplier only.</p><label>Bid title<input name="title" value="${esc(t.name)}" required></label><label>Scope<textarea name="description" required>${esc(t.description || "")}</textarea></label><label>Response deadline<input name="dueDate" type="date" min="${wfToday()}" value="${t.dueDate || p.dueDate}" required></label><button class="btn primary">Publish bid request</button></form>`,
  );
  document.getElementById("wfF").onsubmit = async (e) => {
    e.preventDefault();
    const b = Object.fromEntries(new FormData(e.target));
    Object.assign(b, { projectId: pid, phaseId: phid, taskId: tid });
    try {
      await api("/bids", { method: "POST", body: b });
      closeModal();
      navigate("/customer/offers?project=" + pid);
      await wfOffers();
    } catch (x) {
      toast(x.message, "error");
    }
  };
}
async function wfSupplierBid(pid, phid, tid) {
  const d = await api("/bids"),
    open = d.bids.filter((b) => b.projectId === pid && b.taskId === tid && b.status === "Open");
  const content = open.length
    ? open
        .map(
          (b) =>
            `<article class="cc-card"><span class="status active">Open until ${date(b.dueDate)}</span><h3>${esc(b.title)}</h3><p>${esc(b.description)}</p><form class="wf-offer-form" onsubmit="event.preventDefault();wfSubmitOffer('${b.id}',this)"><div class="two"><label>Total offer (€)<input name="amount" type="number" min="1" step="0.01" required></label><label>Delivery days<input name="deliveryDays" type="number" min="1" required></label></div><label>Included scope & assumptions<textarea name="notes"></textarea></label><button class="btn primary">Submit offer</button></form></article>`,
        )
        .join("")
    : '<div class="empty">There are no open bid requests for this task.</div>';
  modal("Submit supplier offer", content);
}
async function wfSubmitOffer(id, form) {
  const b = Object.fromEntries(new FormData(form));
  try {
    await api(`/bids/${id}/offers`, { method: "POST", body: b });
    closeModal();
    toast("Offer sent to customer");
    wfOffers();
  } catch (e) {
    toast(e.message, "error");
  }
}
async function wfOffers() {
  const d = await api("/bids"),
    projects = (await api("/projects")).projects;
  const q = wfQuery(),
    project = q.get("project") || "",
    status = q.get("status") || "All";
  let bids = d.bids;
  if (project) bids = bids.filter((x) => x.projectId === project);
  if (status !== "All") bids = bids.filter((x) => x.status === status);
  const content = `<div class="dash-top"><div><h1>${state.user.role === "customer" ? "Offers overview" : "Task bid opportunities"}</h1><p>Compare supplier price, delivery, scope and award one supplier per task.</p></div>${state.user.role === "customer" ? '<button class="btn primary" onclick="wfCreateBidFromPage()">+ Request bids for a task</button>' : ""}</div><div class="wf-filter-row"><label>Project<select id="wfBidProject" onchange="wfBidFilter()"><option value="">All projects</option>${projects.map((p) => `<option value="${p.id}" ${project === p.id ? "selected" : ""}>${esc(p.name)}</option>`).join("")}</select></label><label>Status<select id="wfBidStatus" onchange="wfBidFilter()">${["All", "Open", "Awarded", "Closed"].map((x) => `<option ${status === x ? "selected" : ""}>${x}</option>`).join("")}</select></label></div><div class="wf-bid-grid">${
    bids
      .map((b) => {
        const p = projects.find((x) => x.id === b.projectId),
          task = p?.phases.flatMap((ph) => ph.tasks || []).find((t) => t.id === b.taskId),
          offers = [...(b.offers || [])].sort((a, z) => a.amount - z.amount);
        return `<article class="panel wf-bid-card"><div class="project-card-head"><div><span class="eyebrow">${esc(p?.name || "Project")}</span><h3>${esc(b.title)}</h3></div><span class="status ${b.status === "Open" ? "submitted" : "active"}">${esc(b.status)}</span></div><p>${esc(b.description)}</p><div class="wf-task-meta"><span>Phase/task: ${esc(task?.name || "Task")}</span><span>Deadline ${date(b.dueDate)}</span><span>${offers.length} offers</span></div>${offers.length ? `<div class="wf-offer-table"><div class="wf-offer-head"><span>Supplier</span><span>Offer</span><span>Delivery</span><span>Decision</span></div>${offers.map((o, i) => `<div class="wf-offer-row"><b>${i === 0 ? "★ " : ""}${esc(o.supplierCompany)}</b><strong>${money(o.amount)}</strong><span>${o.deliveryDays} days</span><span>${esc(o.status)}</span><small>${esc(o.notes || "No scope note")}</small>${state.user.role === "customer" && b.status === "Open" && o.status === "Submitted" ? `<div class="cc-actions"><button class="btn small success" onclick="wfBidDecision('${b.id}','${o.id}','Accept offer')">Award this task</button><button class="btn small outline" onclick="wfBidDecision('${b.id}','${o.id}','Decline offer')">Decline</button></div>` : ""}</div>`).join("")}</div>` : '<div class="notice">Waiting for supplier offers.</div>'}${state.user.role === "customer" && b.status === "Open" ? `<button class="btn small outline" onclick="wfBidDecision('${b.id}','','Close bid')">Close bidding</button>` : ""}${b.status === "Awarded" ? '<div class="notice success-text">Task assigned to the selected supplier. Other offers were closed.</div>' : ""}</article>`;
      })
      .join("") || '<div class="empty">No bid requests match this filter.</div>'
  }</div>`;
  app.innerHTML = dashboardShell(
    state.user.role,
    state.user.role === "customer" ? "offers" : "bids",
    content,
  );
}
function wfBidFilter() {
  const p = document.getElementById("wfBidProject").value,
    s = document.getElementById("wfBidStatus").value;
  navigate(`/${state.user.role}/offers?project=${encodeURIComponent(p)}&status=${encodeURIComponent(s)}`);
  wfOffers();
}
async function wfBidDecision(id, offerId, action) {
  try {
    await api("/bids/" + id, { method: "PATCH", body: { offerId, action } });
    toast(action === "Accept offer" ? "Supplier selected and task assigned" : "Bid updated");
    wfOffers();
  } catch (e) {
    toast(e.message, "error");
  }
}
async function wfCreateBidFromPage() {
  const ps = (await api("/projects")).projects,
    opts = ps.flatMap((p) => p.phases.flatMap((ph) => (ph.tasks || []).map((t) => ({ p, ph, t }))));
  if (!opts.length) {
    toast("Add a project phase and task before requesting offers", "error");
    return;
  }
  const first = opts[0];
  await wfCreateBid(first.p.id, first.ph.id, first.t.id);
}
async function wfDocuments(pid) {
  const [pd, d] = await Promise.all([api("/projects/" + pid), api(`/projects/${pid}/documents`)]),
    p = pd.project,
    selectedPhase = wfQuery().get("phase") || "",
    selectedTask = wfQuery().get("task") || "",
    docs = d.documents || [];
  const filtered = docs.filter(
    (x) => (!selectedPhase || x.phaseId === selectedPhase) && (!selectedTask || x.taskId === selectedTask),
  );
  const phaseOpts = p.phases
    .map(
      (ph) =>
        `<option value="${ph.id}" ${selectedPhase === ph.id ? "selected" : ""}>${esc(ph.name)}</option>`,
    )
    .join("");
  const rows = filtered
    .map((x) => {
      const supplier = wfSupplier(pd.suppliers || [], x.supplierId),
        owner = x.uploadedBy === state.user.id ? "You" : x.uploadedBy;
      return `<tr><td><b>${esc(x.filename)}</b><small>${esc(x.description || "")}</small></td><td>${esc(x.phaseName || "Project level")}<small>${esc(x.taskName || "No task")}</small></td><td>${esc(supplier?.company || owner)}</td><td>${esc(x.category)}<small>${date(x.uploadedAt)}</small></td><td><span class="status ${x.status === "Approved" ? "completed" : x.status === "Pending approval" ? "submitted" : "active"}">${esc(x.status)}</span></td><td>${x.url ? `<a class="btn small outline" href="${esc(x.url)}" target="_blank" rel="noopener">Open</a>` : ""}${state.user.role === "customer" && x.status === "Pending approval" ? `<button class="btn small success" onclick="wfReviewDocument('${x.id}','Approved')">Approve</button><button class="btn small outline" onclick="wfReviewDocument('${x.id}','Changes requested')">Request changes</button>` : ""}</td></tr>`;
    })
    .join("");
  const content = `<div class="breadcrumb"><a href="#/${state.user.role}/projects/${p.id}">← Back to ${esc(p.name)}</a></div><div class="dash-top"><div><div class="eyebrow">PROJECT DOCUMENT DESK</div><h1>Documents & handover</h1><p>One project library, grouped by phase, task and supplier. Approval is optional for each upload.</p></div><button class="btn primary" onclick="wfUploadDocument('${p.id}')">+ Upload document</button></div><div class="wf-filter-row"><label>Phase<select id="wfDocPhase" onchange="wfDocFilter('${p.id}')"><option value="">All phases</option>${phaseOpts}</select></label><label>Task<select id="wfDocTask" onchange="wfDocFilter('${p.id}')"><option value="">All tasks</option>${p.phases.flatMap((ph) => (ph.tasks || []).map((t) => `<option value="${t.id}" ${selectedTask === t.id ? "selected" : ""}>${esc(ph.name)} · ${esc(t.name)}</option>`)).join("")}</select></label></div><section class="panel"><div class="cc-table-wrap"><table class="cc-table"><thead><tr><th>Document</th><th>Phase / task</th><th>Supplier / owner</th><th>Category / uploaded</th><th>Approval</th><th>Actions</th></tr></thead><tbody>${rows || '<tr><td colspan="6">No documents in this view.</td></tr>'}</tbody></table></div></section>`;
  app.innerHTML = dashboardShell(state.user.role, "projects", content);
}
function wfDocFilter(pid) {
  const phase = document.getElementById("wfDocPhase").value,
    task = document.getElementById("wfDocTask").value;
  navigate(
    `/${state.user.role}/projects/${pid}/documents?phase=${encodeURIComponent(phase)}&task=${encodeURIComponent(task)}`,
  );
  wfDocuments(pid);
}
async function wfUploadDocument(pid) {
  const pd = await api("/projects/" + pid),
    p = pd.project;
  modal(
    "Share project document",
    `<form id="wfF" class="modal-form"><label>File *<input name="file" type="file" required></label><div class="two"><label>Phase<select name="phaseId"><option value="">Project-wide</option>${p.phases.map((x) => `<option value="${x.id}">${esc(x.name)}</option>`).join("")}</select></label><label>Task<select name="taskId"><option value="">No task</option>${p.phases.flatMap((ph) => (ph.tasks || []).map((t) => `<option value="${t.id}">${esc(ph.name)} · ${esc(t.name)}</option>`)).join("")}</select></label></div><div class="two"><label>Category<select name="category">${["Engineering", "Planning", "Quality & acceptance", "Safety", "Commercial", "Handover", "General"].map((x) => `<option>${x}</option>`).join("")}</select></label><label class="choice-row"><input name="approvalRequired" type="checkbox" value="true"> Require customer approval</label></div><label>Description<textarea name="description" maxlength="2000"></textarea></label><div id="wfFileError" class="form-error"></div><button class="btn primary">Upload and share</button></form>`,
  );
  document.getElementById("wfF").onsubmit = async (e) => {
    e.preventDefault();
    const fd = new FormData(e.target),
      file = fd.get("file"),
      phaseId = fd.get("phaseId"),
      taskId = fd.get("taskId");
    try {
      const uploaded = await uploadFile(file);
      await api(`/projects/${pid}/documents`, {
        method: "POST",
        body: {
          filename: uploaded.filename,
          url: uploaded.url,
          phaseId,
          taskId,
          category: fd.get("category"),
          description: fd.get("description"),
          approvalRequired: fd.get("approvalRequired") === "true",
        },
      });
      closeModal();
      wfDocuments(pid);
    } catch (x) {
      document.getElementById("wfFileError").textContent = x.message;
    }
  };
}
async function wfReviewDocument(id, status) {
  const reviewNote =
    status === "Changes requested"
      ? (await uiPrompt("What should be changed?")) || "Please revise and resubmit."
      : "";
  await api("/documents/" + id, { method: "PATCH", body: { status, reviewNote } });
  const pid = wfPath().split("/")[3];
  wfDocuments(pid);
}
async function wfOpenDocument(url) {
  try {
    const r = await fetch(url, { headers: { Authorization: "Bearer " + state.token } });
    if (!r.ok) throw new Error("Could not open this document");
    const blob = await r.blob(),
      link = document.createElement("a");
    link.href = URL.createObjectURL(blob);
    link.download = url.split("/").pop();
    link.click();
    setTimeout(() => URL.revokeObjectURL(link.href), 2000);
  } catch (e) {
    toast(e.message, "error");
  }
}
async function supplierPhases() {
  const d = await api("/projects"),
    items = [];
  for (const p of d.projects) {
    const full = await api("/projects/" + p.id);
    for (const ph of full.project.phases)
      for (const t of ph.tasks || [])
        if (t.assignedSupplierId === state.user.supplierId)
          items.push({ p: full.project, ph, t, sups: full.suppliers || [] });
    for (const ph of full.project.phases)
      if (ph.supplierId === state.user.supplierId)
        items.push({ p: full.project, ph, t: null, sups: full.suppliers || [] });
  }
  app.innerHTML = dashboardShell(
    "supplier",
    "phases",
    `<div class="dash-top"><div><h1>Assigned work</h1><p>Task invitations, project documents, progress and deadlines.</p></div><button class="btn outline" onclick="navigate('/supplier/bids')">Bid opportunities</button></div><div class="wf-bid-grid">${items.map(({ p, ph, t, sups }) => (t ? `<article class="panel"><span class="eyebrow">${esc(p.name)} · ${esc(ph.name)}</span>${wfTaskCard(p, ph, t, sups)}</article>` : `<article class="panel"><h3>${esc(p.name)} · ${esc(ph.name)}</h3><p>${esc(ph.status)} · ${date(ph.dueDate)}</p><button class="btn outline" onclick="navigate('/supplier/projects/${p.id}/documents?phase=${ph.id}')">Project documents</button></article>`)).join("") || '<div class="empty">No work assigned yet.</div>'}</div>`,
  );
}
async function supplierBids() {
  await wfOffers();
}
async function customerProjects() {
  const showArchived = new URLSearchParams(location.hash.split("?")[1] || "").get("archived") === "1",
    d = await api("/projects" + (showArchived ? "?archived=1" : ""));
  app.innerHTML = dashboardShell(
    "customer",
    "projects",
    `<div class="dash-top"><div><h1>Projects</h1><p>Plan phases and tasks, manage supplier offers, documents and delivery.</p></div><div class="cc-actions"><label class="btn outline"><input type="checkbox" ${showArchived ? "checked" : ""} onchange="navigate('/customer/projects' + (this.checked ? '?archived=1' : ''))"> Show archived</label><button class="btn outline" onclick="navigate('/customer/offers')">Offers overview</button><button class="btn primary" onclick="navigate('/customer/projects/new')">+ New project</button></div></div><div class="cc-grid">${d.projects.map(customerProjectCard).join("") || '<div class="empty">No projects yet.</div>'}</div>`,
  );
}
async function supplierDetail(id) {
  const { supplier: s } = await api("/suppliers/" + encodeURIComponent(id));
  const catalog = s.serviceCatalog || [],
    content = `<div class="breadcrumb"><a href="#/${state.user?.role === "customer" ? "customer/" : ""}suppliers">← Back to supplier directory</a></div><div class="supplier-profile-head"><div class="supplier-avatar large">${esc(s.avatar || "CC")}</div><div><div class="eyebrow">SUPPLIER PROFILE</div><h1>${esc(s.company)}</h1><p>${esc(s.location || "Location not set")} · ${esc(s.availability || "Availability on request")}</p></div><span class="badge ${(s.badge || "bronze").toLowerCase()}">${esc(s.badge || "Pending")}</span></div><div class="health"><div class="cc-card"><span class="cc-label">Team</span><b>${Number(s.employees) || 0} employees · ${(s.teamMembers || []).length} key people</b></div><div class="cc-card"><span class="cc-label">Experience</span><b>${Number(s.experience) || 0}+ years · ${Number(s.projectsCompleted) || 0} projects</b></div><div class="cc-card"><span class="cc-label">Starting rates</span><b>${money(s.hourlyRate || 0)}/hour · from ${money(s.projectRate || 0)}</b></div></div><section class="panel"><h2>Service catalog</h2><div class="cc-table-wrap"><table class="cc-table"><thead><tr><th>Service</th><th>Scope</th><th>Rate</th><th>Capacity</th><th></th></tr></thead><tbody>${catalog.map((x) => `<tr><td><b>${esc(x.name)}</b></td><td>${esc(x.description || "Custom scope")}</td><td>${money(x.rate || 0)} / ${esc(x.unit || "hour")}</td><td>${esc(x.capacity || "By agreement")} · ${esc(x.leadTime || "Schedule on request")}</td><td>${state.user?.role === "customer" ? `<button class="btn small primary" onclick="requestSupplierQuote('${s.id}','${esc(x.name)}')">Request this service</button>` : ""}</td></tr>`).join("") || '<tr><td colspan="5">Contact supplier for service details.</td></tr>'}</tbody></table></div></section><div class="supplier-profile-grid"><section class="cc-card"><h2>About</h2><p>${esc(s.description || "Supplier profile and capabilities.")}</p><h2>Certifications</h2>${(s.certifications || []).map((x) => `<span class="chip">${esc(x)}</span>`).join("")}</section><section class="cc-card"><h2>Team & delivery</h2>${(s.teamMembers || []).map((m) => `<div class="team-row"><b>${esc(m.name)}</b><span>${esc(m.role)}</span><small>${esc(m.experience || "")}</small></div>`).join("")}</section></div>`;
  app.innerHTML =
    state.user?.role === "customer"
      ? dashboardShell("customer", "suppliers", content)
      : publicLayout(`<div class="cc-page">${content}</div>`);
}
async function requestSupplierQuote(supplierId, serviceName = "") {
  const { supplier: s } = await api("/suppliers/" + supplierId),
    projects = (await api("/projects")).projects,
    scopes = projects.flatMap((p) => p.phases.flatMap((ph) => (ph.tasks || []).map((t) => ({ p, ph, t }))));
  modal(
    "Request this service",
    `<form id="wfF" class="modal-form"><label>Service<select name="service" required>${(s.serviceCatalog || []).map((x) => `<option ${serviceName === x.name ? "selected" : ""}>${esc(x.name)}</option>`).join("")}${(
      s.services || []
    )
      .filter((x) => !(s.serviceCatalog || []).some((y) => y.name === x))
      .map((x) => `<option ${serviceName === x ? "selected" : ""}>${esc(x)}</option>`)
      .join(
        "",
      )}</select></label><label>Project task<select name="taskRef"><option value="">General enquiry</option>${scopes.map((x) => `<option value="${x.p.id}|${x.ph.id}|${x.t.id}">${esc(x.p.name)} · ${esc(x.ph.name)} · ${esc(x.t.name)}</option>`).join("")}</select></label><label>Scope / question<textarea name="message" required></textarea></label><button class="btn primary">Send request to supplier</button></form>`,
  );
  document.getElementById("wfF").onsubmit = async (e) => {
    e.preventDefault();
    const b = Object.fromEntries(new FormData(e.target)),
      [projectId, phaseId, taskId] = (b.taskRef || "").split("|");
    delete b.taskRef;
    Object.assign(b, { supplierId, projectId, phaseId, taskId });
    try {
      await api("/rfqs", { method: "POST", body: b });
      closeModal();
      toast("Service request linked and sent");
    } catch (x) {
      toast(x.message, "error");
    }
  };
}
async function customerInvoices() {
  const q = wfQuery(),
    filters = ["project", "phase", "task"],
    params = { projectId: q.get("project"), phaseId: q.get("phase"), taskId: q.get("task") },
    query = new URLSearchParams(Object.entries(params).filter(([, v]) => v));
  const [d, pd] = await Promise.all([
      api("/invoices" + (query.toString() ? "?" + query : "")),
      api("/projects"),
    ]),
    projects = pd.projects,
    back = q.get("back") || "";
  const scoped = filters.some((k) => q.has(k));
  app.innerHTML = dashboardShell(
    "customer",
    "invoices",
    `<div class="dash-top"><div><h1>${scoped ? "Work item invoices" : "Invoices & payments"}</h1><p>${scoped ? "Invoices scoped to the selected project, phase or task." : "Review invoices across your projects."}</p></div><div class="cc-actions">${back ? `<button class="btn outline" onclick="navigate(decodeURIComponent('${encodeURIComponent(back)}'))">← Back to project</button>` : ""}${scoped ? '<button class="btn outline" onclick="navigate(\'/customer/invoices\')">All invoices</button>' : ""}</div></div>${scoped ? `<div class="notice">${esc(projects.find((x) => x.id === params.projectId)?.name || "Project")} · ${esc(params.phaseId || "All phases")} · ${esc(params.taskId || "All tasks")}</div>` : ""}<div class="panel"><div class="cc-table-wrap"><table class="cc-table"><thead><tr><th>Invoice</th><th>Project / phase / task</th><th>Positions</th><th>Amount / cap</th><th>Status</th><th>Actions</th></tr></thead><tbody>${
      d.invoices
        .map((i) => {
          const p = projects.find((x) => x.id === i.projectId),
            ph = p?.phases.find((x) => x.id === i.phaseId),
            t = ph?.tasks?.find((x) => x.id === i.taskId);
          return `<tr><td><b>${esc(invNo(i))}</b><small>${date(i.createdAt)}</small></td><td>${esc(p?.name || i.projectId)}<small>${esc(ph?.name || i.phaseId)} · ${esc(i.taskName || t?.name || "Phase")}</small></td><td>${(i.lineItems || []).length || "—"}</td><td>${money(i.amount)}${i.orderedAmount ? `<small>of ${money(i.orderedAmount)}</small>` : ""}</td><td>${esc(i.status)}</td><td><button class="btn small outline" onclick="reviewInvoice('${i.id}')">${i.status === "Submitted" ? "Review" : "View"}</button><button class="btn small outline" onclick="wfInvoicePrint('${i.id}')">PDF</button><button class="btn small outline" onclick="wfInvoiceEmail('${i.id}')">Email</button></td></tr>`;
        })
        .join("") || '<tr><td colspan="6">No invoices match this work item.</td></tr>'
    }</tbody></table></div></div>`,
  );
}
async function supplierInvoices() {
  const q = wfQuery(),
    params = new URLSearchParams();
  for (const k of ["project", "phase", "task"]) if (q.get(k)) params.set(k + "Id", q.get(k));
  const d = await api("/invoices" + (params.size ? "?" + params : "")),
    back = q.get("back") || "";
  app.innerHTML = dashboardShell(
    "supplier",
    "invoices",
    `<div class="dash-top"><div><h1>Invoices</h1><p>Submit and track invoices for assigned work.</p></div><div class="cc-actions">${back ? `<button class="btn outline" onclick="navigate(decodeURIComponent('${encodeURIComponent(back)}'))">← Back to project</button>` : ""}<button class="btn primary" onclick="navigate('/supplier/invoices/new${location.hash.includes("?") ? "?" + location.hash.split("?")[1] : ""}')">+ Create invoice</button></div></div><div class="panel"><div class="cc-table-wrap"><table class="cc-table"><thead><tr><th>Invoice</th><th>Order / task</th><th>Amount / cap</th><th>Status</th><th>Actions</th></tr></thead><tbody>${d.invoices.map((i) => `<tr><td>${esc(invNo(i))}<small>${date(i.createdAt)}</small></td><td>${esc(i.projectId)}<small>${esc(i.taskName || i.phaseId)}</small></td><td>${money(i.amount)}${i.orderedAmount ? `<small>of ${money(i.orderedAmount)}</small>` : ""}</td><td>${esc(i.status)}</td><td><button class="btn small outline" onclick="wfInvoicePrint('${i.id}')">PDF</button><button class="btn small outline" onclick="wfInvoiceEmail('${i.id}')">Email</button></td></tr>`).join("") || '<tr><td colspan="5">No invoices match.</td></tr>'}</tbody></table></div></div>`,
  );
}
async function newInvoice() {
  const [d, profile] = await Promise.all([api("/projects"), api("/profile")]),
    supplier = profile.supplier,
    eligible = [];
  for (const p of d.projects)
    for (const ph of p.phases || []) {
      for (const t of ph.tasks || [])
        if (t.assignedSupplierId === supplier.id && t.acceptanceStatus === "Accepted")
          eligible.push({ p, ph, t });
      if (ph.supplierId === supplier.id && ph.acceptanceStatus === "Accepted")
        eligible.push({ p, ph, t: null });
    }
  if (!eligible.length) {
    await supplierInvoices();
    toast("Accept an assigned task before submitting an invoice", "error");
    return;
  }
  window.__ccInvoiceServices = supplier.services || [];
  window.__ccInvoiceEligible = eligible;
  const q = wfQuery();
  await supplierInvoices();
  const phaseOpts = eligible
    .map(
      ({ p, ph, t }) =>
        `<option value="${p.id}|${ph.id}|${t?.id || ""}">${esc(p.name)} — ${esc(ph.name)}${t ? " — " + esc(t.name) : ""}</option>`,
    )
    .join("");
  modal(
    "Create invoice",
    `<p class="modal-intro">Link this invoice to its exact project task. The customer can compare the positions with the task order amount.</p><form id="invF" class="modal-form"><label>Accepted project task *<select name="target" id="invTarget" required><option value="">Choose assigned work</option>${phaseOpts}</select></label><div id="invoiceContext" class="notice">Select a task to see the customer and order cap.</div><div class="invoice-lines-head"><h3>Invoice positions</h3><button class="btn small outline" type="button" onclick="addInvoiceLine()">+ Add position</button></div><div id="invoiceLines"></div><div class="invoice-total-row"><span>Invoice total</span><strong id="invoiceTotal">€0</strong></div><div id="invoiceOrderCheck" class="order-check">Select a work item.</div><label>Invoice note *<textarea name="description" required></textarea></label><label>Supporting attachment<input name="attachmentFile" type="file"></label><div id="invoiceError" class="form-error"></div><div class="action-row"><button class="btn primary">Submit invoice</button><button type="button" class="btn outline" onclick="closeModal();supplierInvoices()">Cancel</button></div></form>`,
  );
  const chosen = eligible.find(
    (x) => x.p.id === q.get("project") && x.ph.id === q.get("phase") && x.t?.id === (q.get("task") || ""),
  );
  if (chosen)
    document.getElementById("invTarget").value = `${chosen.p.id}|${chosen.ph.id}|${chosen.t?.id || ""}`;
  addInvoiceLine();
  const update = () => {
    const [pid, phid, tid] = document.getElementById("invTarget").value.split("|"),
      x = eligible.find((z) => z.p.id === pid && z.ph.id === phid && (z.t?.id || "") === tid),
      box = document.getElementById("invoiceContext");
    if (x) {
      const cap = Number(x.t?.orderAmount || x.ph.orderAmount) || 0;
      box.innerHTML = `Customer: <b>${esc(x.p.customer?.company || x.p.customer?.name || "Customer")}</b><br>${esc(x.p.name)} · ${esc(x.ph.name)}${x.t ? " · " + esc(x.t.name) : ""}<br>Order cap: ${cap ? money(cap) : "No cap set"}`;
    }
    refreshInvoiceTotal();
  };
  document.getElementById("invTarget").onchange = update;
  document.getElementById("invoiceLines").addEventListener("input", refreshInvoiceTotal);
  document.getElementById("invoiceLines").addEventListener("change", refreshInvoiceTotal);
  update();
  document.getElementById("invF").onsubmit = async (e) => {
    e.preventDefault();
    const [projectId, phaseId, taskId] = document.getElementById("invTarget").value.split("|"),
      entry = eligible.find((x) => x.p.id === projectId && x.ph.id === phaseId && (x.t?.id || "") === taskId),
      lineItems = [...document.querySelectorAll(".invoice-line")].map((r) => ({
        service: r.querySelector("[name=service]").value,
        quantity: r.querySelector("[name=quantity]").value,
        unit: r.querySelector("[name=unit]").value,
        unitPrice: r.querySelector("[name=unitPrice]").value,
      }));
    if (!lineItems.length || lineItems.some((x) => !x.service || Number(x.quantity) <= 0)) {
      document.getElementById("invoiceError").textContent = "Add at least one complete invoice position.";
      return;
    }
    try {
      await api("/invoices", {
        method: "POST",
        body: {
          projectId,
          phaseId,
          taskId: taskId || undefined,
          description: new FormData(e.target).get("description"),
          lineItems,
        },
      });
      closeModal();
      toast("Invoice submitted to customer");
      navigate(`/supplier/invoices?project=${projectId}&phase=${phaseId}&task=${taskId}`);
      supplierInvoices();
    } catch (x) {
      document.getElementById("invoiceError").textContent = x.message;
    }
  };
}
async function supplierRequests() {
  const d = await api("/rfqs");
  app.innerHTML = dashboardShell(
    "supplier",
    "requests",
    `<div class="dash-top"><div><h1>Service requests</h1><p>Requests retain their project, phase and task link for follow-up.</p></div></div><div class="wf-bid-grid">${d.rfqs.map((r) => `<article class="panel"><div class="project-card-head"><h3>${esc(r.service)}</h3><span class="status submitted">${esc(r.status)}</span></div><p>${esc(r.customerCompany || r.customerName)} · ${esc(r.projectName || "General enquiry")}</p>${r.taskName ? `<div class="notice">Linked task: ${esc(r.phaseName)} · ${esc(r.taskName)}</div>` : ""}<p>${esc(r.message)}</p>${r.response ? `<div class="notice">${esc(r.response)}</div>` : ""}<small>${date(r.createdAt)}</small>${["New", "Reviewing"].includes(r.status) ? `<div class="cc-actions" style="margin-top:12px"><button class="btn small outline" onclick="respondQuote('${r.id}','Reviewing')">Review</button><button class="btn small success" onclick="respondQuote('${r.id}','Quoted')">Send quote</button><button class="btn small danger" onclick="respondQuote('${r.id}','Declined')">Decline</button></div>` : ""}</article>`).join("") || '<div class="empty">No service requests yet.</div>'}</div>`,
  );
}
async function wfInvoicePrint(id) {
  const { invoice: i } = await api("/invoices/" + id),
    p = (await api("/projects")).projects.find((x) => x.id === i.projectId),
    s = (await api("/suppliers/" + i.supplierId).catch(() => ({ supplier: { company: "Supplier" } })))
      .supplier;
  const html = `<html><head><title>Invoice ${esc(invNo(i))}</title><style>body{font:14px Arial;color:#142238;padding:40px}h1{color:#245fe8}table{border-collapse:collapse;width:100%;margin-top:25px}td,th{padding:10px;border-bottom:1px solid #ddd;text-align:left}.total{text-align:right;font-size:20px;margin-top:30px}</style></head><body><h1>CraftCrew · Invoice</h1><h2>${esc(invNo(i))}</h2><p>${esc(p?.name || i.projectId)} · ${esc(i.taskName || i.phaseId)}<br>Supplier: ${esc(s?.company || "Supplier")}<br>Date: ${date(i.createdAt)}</p><p>${esc(i.description || "")}</p><table><thead><tr><th>Service</th><th>Quantity</th><th>Rate</th><th>Total</th></tr></thead><tbody>${(i.lineItems || []).map((x) => `<tr><td>${esc(x.service)}</td><td>${x.quantity} ${esc(x.unit)}</td><td>${money(x.unitPrice || x.rate)}</td><td>${money(x.total)}</td></tr>`).join("")}</tbody></table><div class="total">Total: <b>${money(i.amount)}</b></div><p>Order amount: ${money(i.orderedAmount || 0)} · Status: ${esc(i.status)}</p><script>window.onload=()=>window.print()</script></body></html>`;
  const w = window.open("", "_blank");
  if (!w) {
    toast("Allow popups to print this invoice", "error");
    return;
  }
  w.document.write(html);
  w.document.close();
}
async function wfInvoiceEmail(id) {
  const { invoice: i } = await api("/invoices/" + id),
    p = (await api("/projects")).projects.find((x) => x.id === i.projectId),
    contacts = (await api("/contacts")).users || [],
    recipient =
      state.user.role === "supplier"
        ? contacts.find((x) => x.id === i.customerId)?.email
        : contacts.find((x) => x.supplierId === i.supplierId)?.email,
    subject = encodeURIComponent(`CraftCrew invoice ${invNo(i)} — ${p?.name || ""}`),
    body = encodeURIComponent(
      `Please find invoice ${invNo(i)} for ${p?.name || i.projectId} (${i.taskName || i.phaseId}), amount ${money(i.amount)}.\n\nUse the PDF button to print/save the invoice as PDF and attach it to this email.`,
    );
  location.href = `mailto:${recipient || ""}?subject=${subject}&body=${body}`;
}
function refreshInvoiceTotal() {
  const rows = [...document.querySelectorAll(".invoice-line")],
    total = rows.reduce(
      (sum, row) =>
        sum +
        (Number(row.querySelector("[name=quantity]")?.value) || 0) *
          (Number(row.querySelector("[name=unitPrice]")?.value) || 0),
      0,
    ),
    totalEl = document.getElementById("invoiceTotal");
  if (totalEl) totalEl.textContent = money(total);
  const [pid, phid, tid] = (document.getElementById("invTarget")?.value || "||").split("|"),
    entry = (window.__ccInvoiceEligible || []).find(
      (x) => x.p.id === pid && x.ph.id === phid && (x.t?.id || "") === tid,
    ),
    cap = Number(entry?.t?.orderAmount || entry?.ph?.orderAmount) || 0,
    check = document.getElementById("invoiceOrderCheck");
  if (!check) return;
  if (!entry || !cap) {
    check.textContent = entry
      ? "No order amount is set for this work item."
      : "Choose an order to compare this invoice.";
    check.className = "order-check";
    return;
  }
  const delta = total - cap;
  check.textContent =
    delta > 0
      ? `Exceeds order by ${money(delta)}. The customer will see this before approval.`
      : `Within the approved order (${money(cap)}); ${money(cap - total)} remaining.`;
  check.className = "order-check " + (delta > 0 ? "over" : "within");
}
async function messages(role) {
  const q = wfQuery(),
    projects = (await api("/projects")).projects,
    contacts = (await api("/contacts")).users || [],
    projectId = q.get("project") || "",
    phaseId = q.get("phase") || "",
    taskId = q.get("task") || "",
    back = q.get("back") || "",
    project = projects.find((x) => x.id === projectId);
  let items = [];
  if (project) {
    const full = await api("/projects/" + project.id);
    for (const ph of full.project.phases)
      for (const t of ph.tasks || [])
        if (!phaseId || phaseId === ph.id)
          if (!taskId || taskId === t.id) {
            const sid = t.assignedSupplierId;
            if (sid && state.user.role === "customer")
              contacts.filter((u) => u.supplierId === sid).forEach((u) => items.push({ ph, t, u }));
            else if (sid && state.user.supplierId === sid) {
              const u = contacts.find((x) => x.id === project.customerId);
              if (u) items.push({ ph, t, u });
            }
          }
  }
  const selected = items[0],
    params = new URLSearchParams();
  if (projectId) params.set("projectId", projectId);
  if (phaseId) params.set("phaseId", phaseId);
  if (taskId) params.set("taskId", taskId);
  const d = await api("/messages" + (params.size ? "?" + params : "")),
    messagesBy = new Map();
  for (const m of d.messages) {
    const k = [m.projectId || "", m.phaseId || "", m.taskId || "", m.senderId, m.recipientId].join("|");
    if (!messagesBy.has(k)) messagesBy.set(k, []);
    messagesBy.get(k).push(m);
  }
  const content = `<div class="dash-top"><div><h1>Project messages</h1><p>Private conversations are visible only to the selected project and task participants.</p></div><div class="cc-actions">${back ? `<button class="btn outline" onclick="navigate(decodeURIComponent('${encodeURIComponent(back)}'))">← Back to project</button>` : ""}<button class="btn primary" onclick="wfNewMessage('${projectId}','${phaseId}','${taskId}')" ${selected ? "" : "disabled"}>+ New message</button></div></div>${project ? `<div class="notice">${esc(project.name)}${selected ? " · " + esc(selected.ph.name) + " · " + esc(selected.t.name) : ""}</div>` : `<div class="wf-filter-row"><label>Project<select id="wfMsgProject" onchange="wfMsgSelect()"><option value="">Choose project</option>${projects.map((x) => `<option value="${x.id}" ${x.id === projectId ? "selected" : ""}>${esc(x.name)}</option>`).join("")}</select></label><label>Phase<select id="wfMsgPhase" onchange="wfMsgSelect()"><option value="">All phases</option>${project?.phases.map((x) => `<option value="${x.id}" ${x.id === phaseId ? "selected" : ""}>${esc(x.name)}</option>`).join("") || ""}</select></label><label>Task<select id="wfMsgTask" onchange="wfMsgSelect()"><option value="">All tasks</option>${project?.phases.flatMap((ph) => (ph.tasks || []).map((t) => `<option value="${t.id}" ${t.id === taskId ? "selected" : ""}>${esc(ph.name)} · ${esc(t.name)}</option>`)).join("") || ""}</select></label></div>`}<div class="wf-message-groups">${[...messagesBy.entries()].map(([k, arr]) => `<section class="panel"><div class="panel-title"><b>${esc(projects.find((x) => x.id === arr[0].projectId)?.name || project?.name || "Project")} · ${esc(arr[0].taskId || "Project discussion")}</b><span>${arr.length} messages <a class="btn small outline" href="#/${role}/projects/${encodeURIComponent(arr[0].projectId || project?.id || "")}">Open project</a></span></div>${arr.map((m) => `<article class="wf-message ${m.senderId === state.user.id ? "mine" : ""}"><b>${m.senderId === state.user.id ? "You" : esc(contacts.find((u) => u.id === m.senderId)?.name || "Project participant")}</b><p>${esc(m.text)}</p><small>${date(m.createdAt)}</small></article>`).join("")}</section>`).join("") || '<div class="empty">Select a project and task to view its private conversation.</div>'}</div>`;
  app.innerHTML = dashboardShell(role, "messages", content);
}
function wfMsgSelect() {
  const p = document.getElementById("wfMsgProject").value,
    ph = document.getElementById("wfMsgPhase").value,
    t = document.getElementById("wfMsgTask").value;
  navigate(`/${state.user.role}/messages?project=${p}&phase=${ph}&task=${t}`);
  messages(state.user.role);
}
async function wfNewMessage(pid, phid, tid) {
  if (!pid || !phid || !tid) {
    toast("Choose a task first", "error");
    return;
  }
  const p = (await api("/projects/" + pid)).project,
    ph = p.phases.find((x) => x.id === phid),
    t = ph?.tasks?.find((x) => x.id === tid);
  if (!t?.assignedSupplierId) {
    toast("This task has no assigned supplier", "error");
    return;
  }
  const contacts = (await api("/contacts")).users || [],
    recipients =
      state.user.role === "customer"
        ? contacts.filter((x) => x.supplierId === t.assignedSupplierId)
        : contacts.filter(
            (x) =>
              x.role === "customer" && (x.id === p.customerId || (p.participantIds || []).includes(x.id)),
          );
  if (!recipients.length) {
    toast("No project contact available", "error");
    return;
  }
  modal(
    "Message task participants",
    `<form id="wfF" class="modal-form"><div class="notice">${esc(p.name)} · ${esc(ph.name)} · ${esc(t.name)}</div><label>Send privately to<select name="recipientId" required>${recipients.map((x) => `<option value="${x.id}">${esc(x.name)} — ${esc(x.company || x.role)}</option>`).join("")}</select></label><label>Message<textarea name="text" maxlength="5000" required></textarea></label><button class="btn primary">Send privately</button></form>`,
  );
  document.getElementById("wfF").onsubmit = async (e) => {
    e.preventDefault();
    try {
      await api("/messages", {
        method: "POST",
        body: { ...Object.fromEntries(new FormData(e.target)), projectId: pid, phaseId: phid, taskId: tid },
      });
      closeModal();
      messages(state.user.role);
    } catch (x) {
      toast(x.message, "error");
    }
  };
}
async function profilePage(role) {
  const d = await api("/profile"),
    s = d.supplier || {},
    c = d.companyProfile || {};
  state.user = { ...state.user, ...d.user };
  localStorage.setItem("cc_user", JSON.stringify(state.user));
  app.innerHTML = dashboardShell(
    role,
    "profile",
    `<div class="dash-top"><div><div class="eyebrow">ACCOUNT WORKSPACE</div><h1>Company profile & settings</h1><p>Share the business identity and contacts project partners need.</p></div><button class="btn primary" onclick="wfEditCompanyProfile()">Edit company details</button></div><div class="wf-profile-head">${d.user.profileImage ? `<img class="wf-profile-image" src="${esc(d.user.profileImage)}" alt="Company profile">` : `<div class="supplier-avatar large">${esc((d.user.company || d.user.name).slice(0, 2).toUpperCase())}</div>`}<div><h2>${esc(d.user.company || "Company name required")}</h2><b>${esc(d.user.name)}</b><p>${esc(d.user.email)} · ${esc(c.phone || "Add phone")}</p></div></div><div class="wf-profile-grid">${[
      ["Legal name", c.legalName],
      ["VAT / tax ID", c.taxId],
      ["Industry", c.industry],
      ["Company size", c.companySize],
      ["Address", c.address],
      ["Website", c.website],
      ["Main contact", c.contactName || d.user.name],
      ["Phone", c.phone],
      ["Procurement email", c.procurementEmail],
      ["About", c.description],
    ]
      .map(
        ([k, v]) =>
          `<article class="cc-card"><span class="cc-label">${k}</span><b>${esc(v || "Add company information")}</b></article>`,
      )
      .join(
        "",
      )}</div>${s ? `<div class="panel" style="margin-top:16px"><h3>Supplier marketplace profile</h3><p>${esc(s.badge || "Not vetted")} · ${Number(s.employees) || 0} staff · ${Number(s.experience) || 0} years</p><button class="btn outline" onclick="navigate('/supplier/suppliers')">Manage service catalog and team</button></div>` : ""}`,
  );
}
async function wfReadImage(file) {
  if (file.size > 1200000) throw new Error("Choose a profile image smaller than 1.2 MB");
  if (!file.type.startsWith("image/")) throw new Error("Choose an image file");
  return await new Promise((resolve, reject) => {
    const r = new FileReader();
    r.onload = () => resolve(r.result);
    r.onerror = reject;
    r.readAsDataURL(file);
  });
}
async function wfEditCompanyProfile() {
  const d = await api("/profile"),
    c = d.companyProfile || {};
  modal(
    "Edit company profile",
    `<form id="wfProfile" class="modal-form"><label>Company profile photo<input name="profileFile" type="file" accept="image/*"></label><div class="two"><label>Legal company name<input name="legalName" value="${esc(c.legalName || "")}"></label><label>Public company name<input name="company" value="${esc(d.user.company || "")}" required></label></div><div class="two"><label>VAT / tax ID<input name="taxId" value="${esc(c.taxId || "")}"></label><label>Industry<input name="industry" value="${esc(c.industry || "")}"></label></div><div class="two"><label>Company size<select name="companySize">${["", "1–10", "11–50", "51–250", "251–1000", "1000+"].map((x) => `<option ${x === c.companySize ? "selected" : ""}>${x}</option>`).join("")}</select></label><label>Phone<input name="phone" value="${esc(c.phone || "")}"></label></div><label>Registered / business address<textarea name="address">${esc(c.address || "")}</textarea></label><div class="two"><label>Website<input name="website" type="url" value="${esc(c.website || "")}"></label><label>Procurement email<input name="procurementEmail" type="email" value="${esc(c.procurementEmail || "")}"></label></div><label>Main contact<input name="contactName" value="${esc(c.contactName || d.user.name)}"></label><label>Company overview<textarea name="description">${esc(c.description || "")}</textarea></label><button class="btn primary">Save company profile</button></form>`,
  );
  document.getElementById("wfProfile").onsubmit = async (e) => {
    e.preventDefault();
    const fd = new FormData(e.target),
      file = fd.get("profileFile");
    let profileImage = d.user.profileImage || "";
    try {
      if (file?.size) profileImage = await wfReadImage(file);
      const companyProfile = Object.fromEntries([...fd.entries()].filter(([k]) => k !== "profileFile"));
      await api("/profile", {
        method: "PUT",
        body: { company: companyProfile.company, profileImage, companyProfile },
      });
      closeModal();
      profilePage(state.user.role);
    } catch (x) {
      toast(x.message, "error");
    }
  };
}
async function supplierCatalog() {
  const d = await api("/profile"),
    s = d.supplier || {},
    items = s.serviceCatalog || [];
  app.innerHTML = dashboardShell(
    "supplier",
    "suppliers",
    `<div class="dash-top"><div><div class="eyebrow">YOUR MARKETPLACE PROFILE</div><h1>Service catalog</h1><p>Manage individually priced services and the people qualified to deliver them.</p></div><div class="cc-actions"><button class="btn outline" onclick="editProfile()">Edit company details</button><button class="btn primary" onclick="wfEditCatalog()">Edit catalog & team</button></div></div><div class="notice">Customers can see your published services and send requests linked to a project task.</div><div class="wf-stat-grid"><div class="cc-card"><span class="cc-label">Employees</span><b>${Number(s.employees) || 0}</b></div><div class="cc-card"><span class="cc-label">Key people</span><b>${(s.teamMembers || []).length}</b></div><div class="cc-card"><span class="cc-label">Experience</span><b>${Number(s.experience) || 0}+ years</b></div></div><section class="panel"><div class="panel-title"><h3>Published services</h3><button class="btn small primary" onclick="wfEditCatalog()">+ Add service / person</button></div><div class="cc-table-wrap"><table class="cc-table"><thead><tr><th>Service / role</th><th>Description / qualifications</th><th>Rate</th><th>Capacity / lead time</th><th>Status</th></tr></thead><tbody>${items.map((x) => `<tr><td><b>${esc(x.name)}</b><small>${esc(x.category || "Service")}</small></td><td>${esc(x.description || "")}<small>${esc(x.qualifications || "")}</small></td><td>${money(x.rate || 0)} / ${esc(x.unit || "hour")}</td><td>${esc(x.capacity || "By agreement")}<small>${esc(x.leadTime || "Schedule on request")}</small></td><td>${esc(x.status || "Published")}</td></tr>`).join("") || '<tr><td colspan="5">Add catalog rows for each service or employee position.</td></tr>'}</tbody></table></div></section><section class="panel"><div class="panel-title"><h3>Key employees & specialist roles</h3><span>${(s.teamMembers || []).length} listed</span></div><div class="cc-table-wrap"><table class="cc-table"><thead><tr><th>Name</th><th>Role</th><th>Experience</th><th>Certifications</th><th>Availability</th></tr></thead><tbody>${(s.teamMembers || []).map((x) => `<tr><td>${esc(x.name)}</td><td>${esc(x.role)}</td><td>${esc(x.experience || "")}</td><td>${esc(x.certifications || "")}</td><td>${esc(x.availability || "Available")}</td></tr>`).join("") || '<tr><td colspan="5">No team profiles yet.</td></tr>'}</tbody></table></div></section>`,
  );
}
async function wfEditCatalog() {
  const d = await api("/profile"),
    s = d.supplier || {},
    catalog = s.serviceCatalog || [],
    team = s.teamMembers || [];
  modal(
    "Edit services and team",
    `<form id="wfCatalog" class="modal-form"><h3>Service rows</h3><div id="wfServiceRows">${catalog.map((x) => wfServiceRow(x)).join("")}</div><button type="button" class="btn small outline" onclick="wfAddServiceRow()">+ Add service position</button><h3>Employee / specialist rows</h3><div id="wfTeamRows">${team.map((x) => wfTeamRow(x)).join("")}</div><button type="button" class="btn small outline" onclick="wfAddTeamRow()">+ Add person</button><div class="two"><label>Total employees<input name="employees" type="number" min="0" value="${Number(s.employees) || team.length}"></label><label>Years in business<input name="experience" type="number" min="0" value="${Number(s.experience) || 0}"></label></div><div class="two"><label>Availability<select name="availability">${["Available", "Busy", "Unavailable"].map((x) => `<option ${x === s.availability ? "selected" : ""}>${x}</option>`).join("")}</select></label><label>Certifications<input name="certifications" value="${esc((s.certifications || []).join(", "))}"></label></div><div id="wfCatalogError" class="form-error"></div><button class="btn primary">Save catalog</button></form>`,
  );
  if (!catalog.length) wfAddServiceRow();
  if (!team.length) wfAddTeamRow();
  document.getElementById("wfCatalog").onsubmit = async (e) => {
    e.preventDefault();
    const fd = new FormData(e.target),
      readRows = (selector) =>
        [...document.querySelectorAll(selector)]
          .map((row) =>
            Object.fromEntries([...row.querySelectorAll("[name]")].map((el) => [el.name, el.value])),
          )
          .filter((x) => x.name),
      serviceCatalog = readRows(".wf-service-row"),
      teamMembers = readRows(".wf-person-row"),
      services = [...new Set([...serviceCatalog.map((x) => x.name), ...(s.services || [])])];
    try {
      await api("/profile", {
        method: "PUT",
        body: {
          serviceCatalog,
          teamMembers,
          services,
          employees: fd.get("employees"),
          experience: fd.get("experience"),
          availability: fd.get("availability"),
          certifications: String(fd.get("certifications") || "")
            .split(",")
            .map((x) => x.trim())
            .filter(Boolean),
        },
      });
      closeModal();
      supplierCatalog();
    } catch (x) {
      document.getElementById("wfCatalogError").textContent = x.message;
    }
  };
}
function wfServiceRow(x = {}) {
  return `<fieldset class="wf-service-row"><legend>Service / position</legend><button type="button" class="btn small danger wf-remove" onclick="this.closest('fieldset').remove()">Remove</button><div class="two"><label>Name<input name="name" value="${esc(x.name || "")}" required></label><label>Category<input name="category" value="${esc(x.category || "Service")}"></label></div><label>Description<input name="description" value="${esc(x.description || "")}"></label><div class="three"><label>Rate (€)<input name="rate" type="number" min="0" step="0.01" value="${Number(x.rate) || 0}"></label><label>Unit<select name="unit">${["hour", "day", "project", "unit", "fixed"].map((u) => `<option value="${u}" ${u === (x.unit || "hour") ? "selected" : ""}>${u}</option>`).join("")}</select></label><label>Capacity<input name="capacity" value="${esc(x.capacity || "")}" placeholder="3 crews"></label></div><div class="two"><label>Lead time<input name="leadTime" value="${esc(x.leadTime || "")}"></label><label>Qualifications<input name="qualifications" value="${esc(x.qualifications || "")}"></label></div></fieldset>`;
}
function wfTeamRow(x = {}) {
  return `<fieldset class="wf-person-row"><legend>Employee / specialist</legend><button type="button" class="btn small danger wf-remove" onclick="this.closest('fieldset').remove()">Remove</button><div class="three"><label>Name<input name="name" value="${esc(x.name || "")}" required></label><label>Role<input name="role" value="${esc(x.role || "")}"></label><label>Experience<input name="experience" value="${esc(x.experience || "")}"></label></div><div class="two"><label>Certifications<input name="certifications" value="${esc(x.certifications || "")}"></label><label>Availability<input name="availability" value="${esc(x.availability || "Available")}"></label></div></fieldset>`;
}
function wfAddServiceRow() {
  document.getElementById("wfServiceRows")?.insertAdjacentHTML("beforeend", wfServiceRow());
}
function wfAddTeamRow() {
  document.getElementById("wfTeamRows")?.insertAdjacentHTML("beforeend", wfTeamRow());
}
function sidebar(role, active) {
  const links =
    role === "customer"
      ? [
          ["dashboard", "Dashboard"],
          ["projects", "Projects"],
          ["offers", "Offers overview"],
          ["suppliers", "Find Suppliers"],
          ["invoices", "Invoices"],
          ["messages", "Messages"],
          ["profile", "Profile / Settings"],
        ]
      : role === "supplier"
        ? [
            ["dashboard", "Dashboard"],
            ["phases", "Assigned work"],
            ["bids", "Bid opportunities"],
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
  return `<aside class="sidebar"><div class="brand side-brand"><span class="brand-mark"><svg viewBox="0 0 40 40"><path d="M25.8 8.5a12.5 12.5 0 1 0 0 23"/><path d="M14.2 15.2a7 7 0 1 1 0 9.6"/></svg></span><span class="brand-word">Craft<span>Crew</span></span></div><button class="user-mini wf-user-link" onclick="navigate('/${role}/profile')"><div class="avatar">${
    state.user?.profileImage
      ? `<img src="${esc(state.user?.profileImage)}" alt="">`
      : esc(
          (state.user?.name || "U")
            .split(" ")
            .map((x) => x[0])
            .join("")
            .slice(0, 2),
        )
  }</div><div><b>${esc(state.user?.name)}</b><small>${esc(state.user?.company || role)} · Profile</small></div></button><nav>${links.map(([k, t]) => `<a class="${active === k ? "active" : ""}" href="#/${role}/${k}">${t}</a>`).join("")}</nav><div class="help">Industrial services, coordinated end-to-end.<br><button class="btn small ghost" onclick="navigate('/faq')">Help & FAQ</button><button class="btn small danger" style="margin-top:8px;width:100%" onclick="logout()">Log out</button></div></aside>`;
}
const wfOldRoute = async () => {
  const h = (location.hash.replace(/^#/, "") || "/").split("?")[0] || "/",
    parts = h.split("?")[0].split("/").filter(Boolean);
  if (h === "/" || h === "/home") return renderHome();
  if (h === "/suppliers") return renderSuppliers();
  if (h === "/supplier-application") return supplierApplication();
  if (h === "/pricing") return renderStatic("pricing");
  if (h === "/how-it-works") return renderStatic("how_it_works");
  if (h === "/faq") return renderStatic("faq");
  if (h === "/login") return renderAuth("login");
  if (h === "/signup") return renderAuth("signup");
  if (parts[0] === "customer") {
    if (parts[1] === "dashboard") return customerDashboard();
    if (parts[1] === "projects" && parts[2] === "new") return newProject();
    if (parts[1] === "profile") return profilePage("customer");
  }
  if (parts[0] === "supplier") {
    if (parts[1] === "dashboard") return supplierDashboard();
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
  return renderHome();
};
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
    if (parts[0] === "customer") {
      if (parts[1] === "projects" && parts[2] === "new") return wfOldRoute();
      if (parts[1] === "projects" && parts[2] && parts[3] === "documents") return wfDocuments(parts[2]);
      if (parts[1] === "projects" && parts[2]) return projectDetail(parts[2]);
      if (parts[1] === "projects" && !parts[2]) return customerProjects();
      if (parts[1] === "offers") return wfOffers();
      if (parts[1] === "invoices") return customerInvoices();
      if (parts[1] === "messages") return messages("customer");
      if (parts[1] === "profile") return profilePage("customer");
      if (parts[1] === "suppliers" && parts[2]) return supplierDetail(parts[2]);
      if (parts[1] === "suppliers") return renderSuppliers();
    }
    if (parts[0] === "supplier") {
      if (parts[1] === "projects" && parts[2] === "new") return wfOldRoute();
      if (parts[1] === "projects" && parts[2] && parts[3] === "documents") return wfDocuments(parts[2]);
      if (parts[1] === "projects" && parts[2]) return projectDetail(parts[2]);
      if (parts[1] === "projects" || parts[1] === "phases") return supplierPhases();
      if (parts[1] === "bids" || parts[1] === "offers") return supplierBids();
      if (parts[1] === "invoices" && parts[2] === "new") return newInvoice();
      if (parts[1] === "invoices") return supplierInvoices();
      if (parts[1] === "messages") return messages("supplier");
      if (parts[1] === "profile") return profilePage("supplier");
      if (parts[1] === "suppliers") return supplierCatalog();
      if (parts[1] === "requests") return supplierRequests();
    }
    return await wfOldRoute();
  } catch (e) {
    console.error(e);
    toast(e.message, "error");
    const active = parts[1] || "dashboard";
    app.innerHTML = dashboardShell(
      state.user?.role || "customer",
      active,
      `<div class="empty"><h2>We could not open this page</h2><p>${esc(e.message)}</p><button class="btn primary" onclick="route()">Try again</button></div>`,
    );
  }
}
document.addEventListener("click", (event) => {
  const link = event.target.closest('a[href^="/uploads/"]');
  if (link) {
    event.preventDefault();
    wfOpenDocument(link.getAttribute("href"));
  }
});
window.addEventListener("hashchange", () => {
  if (typeof route === "function") route();
});
