// Consolidated fixes for the latest browser review comments.
const ccEsc = (s) => esc(s ?? "");
const ccProjects = async () => (await api("/projects")).projects || [];
async function ccInbox(role) {
  const d = await api("/notifications"),
    rows = d.notifications || [];
  app.innerHTML = dashboardShell(
    role,
    "inbox",
    `<div class="cc-page cc-inbox"><div class="cc-inbox-toolbar"><div><div class="eyebrow">WORKSPACE ACTIVITY</div><h1>Inbox</h1><p>Messages, bid updates, document reviews and work notifications in one place.</p></div><button class="btn outline" onclick="ccReadAll()">Mark all read</button></div><section class="panel"><div class="cc-inbox-filters"><input id="ccInboxSearch" placeholder="Search notifications"><select id="ccInboxState" aria-label="Filter by read state"><option value="all">All activity (${rows.length})</option><option value="unread">Unread (${d.unread || 0})</option><option value="read">Read</option></select><select id="ccInboxType" aria-label="Filter by type"><option value="all">All types</option><option value="message">Messages</option><option value="invoice">Invoices</option><option value="bid">Bids & offers</option><option value="time">Time entries</option><option value="document">Documents</option><option value="request">Requests</option></select></div><div id="ccInboxRows">${ccInboxRows(rows, role)}</div></section></div>`,
  );
  const draw = () => {
    const q = document.getElementById("ccInboxSearch").value.toLowerCase(),
      s = document.getElementById("ccInboxState").value,
      t = document.getElementById("ccInboxType").value;
    document.getElementById("ccInboxRows").innerHTML = ccInboxRows(
      rows.filter((n) => {
        const text = n.text.toLowerCase(),
          kind = /message/i.test(text)
            ? "message"
            : /invoice/i.test(text)
              ? "invoice"
              : /bid|offer/i.test(text)
                ? "bid"
                : /time|hour/i.test(text)
                  ? "time"
                  : /document|approval/i.test(text)
                    ? "document"
                    : /request|quote/i.test(text)
                      ? "request"
                      : "other";
        return (
          (!q || text.includes(q)) &&
          (s === "all" || (s === "unread" ? !n.read : n.read)) &&
          (t === "all" || kind === t)
        );
      }),
      role,
    );
  };
  document.getElementById("ccInboxSearch").oninput = draw;
  document.getElementById("ccInboxState").onchange = draw;
  document.getElementById("ccInboxType").onchange = draw;
}
function ccNotificationLink(n, role) {
  if (n.link) return n.link;
  const x = String(n.text || "").toLowerCase();
  if (/time entry|\d+(?:\.\d+)?h time|submitted .*h/.test(x))
    return role === "customer" ? "/customer/time" : "/supplier/time";
  if (/message|chat/.test(x)) return `/${role}/messages`;
  if (/invoice|payment/.test(x)) return `/${role}/invoices`;
  if (/bid|offer/.test(x)) return role === "supplier" ? "/supplier/bids" : "/customer/offers";
  if (/document|handover/.test(x)) return `/${role}/projects`;
  if (/request|quote/.test(x)) return role === "supplier" ? "/supplier/requests" : "/customer/offers";
  return `/${role}/inbox`;
}
function ccInboxRows(rows, role) {
  return rows.length
    ? `<div class="cc-inbox-list">${rows.map((n) => `<article class="cc-inbox-item ${n.read ? "" : "unread"}"><span class="cc-inbox-dot"></span><div><b>${ccEsc(n.text)}</b><small>${date(n.createdAt)}</small></div><div class="cc-actions"><button class="btn small primary" onclick="ccOpenNotification('${n.id}','${ccEsc(ccNotificationLink(n, role))}')">Open</button>${!n.read ? `<button class="btn small outline" onclick="ccMarkRead('${n.id}')">Mark read</button>` : ""}</div></article>`).join("")}</div>`
    : '<div class="empty">No notifications match these filters.</div>';
}
async function ccMarkRead(id) {
  await api("/notifications/" + id, { method: "PATCH", body: { read: true } });
  ccInbox(state.user.role);
}
async function ccReadAll() {
  await api("/notifications/read-all", { method: "PATCH", body: {} });
  ccInbox(state.user.role);
}
async function ccOpenNotification(id, link) {
  await api("/notifications/" + id, { method: "PATCH", body: { read: true } });
  navigate(link);
}

async function ccTimePage(role) {
  const [pData, profile, d] = await Promise.all([ccProjects(), api("/profile"), api("/time-entries")]),
    projects = pData,
    entries = d.entries || [],
    supplier = profile.supplier || {},
    team = supplier.teamMembers || [],
    allTasks = [];
  for (const p of projects)
    for (const ph of p.phases || [])
      for (const t of ph.tasks || [])
        if (
          role === "customer" ||
          (t.assignedSupplierId === supplier.id && t.acceptanceStatus === "Accepted")
        )
          allTasks.push({ p, ph, t });
  const approvedHours = entries
      .filter((x) => x.status === "Approved")
      .reduce((a, x) => a + Number(x.hours), 0),
    pending = entries.filter((x) => x.status === "Pending approval").length;
  app.innerHTML = dashboardShell(
    role,
    "time",
    `<div class="dash-top"><div><div class="eyebrow">TIME & COST CONTROL</div><h1>${role === "supplier" ? "Team time log" : "Supplier time approvals"}</h1><p>Record work against accepted tasks and compare approved hours with the project estimate.</p></div>${role === "supplier" ? '<button class="btn primary" onclick="ccNewTimeEntry()">+ Log time</button>' : ""}<button class="btn outline" onclick="ccExportTime('${role}','csv')">Export CSV</button><button class="btn outline" onclick="ccExportTime('${role}','xml')">Export XML</button><button class="btn outline" onclick="ccExportTime('${role}','pdf')">Export PDF</button></div><div class="wf-stat-grid"><div class="cc-card"><span class="cc-label">Entries</span><b>${entries.length}</b></div><div class="cc-card"><span class="cc-label">Awaiting approval</span><b>${pending}</b></div><div class="cc-card"><span class="cc-label">Approved hours</span><b>${approvedHours.toFixed(1)} h</b></div><div class="cc-card"><span class="cc-label">Approved value</span><b>${money(entries.filter((x) => x.status === "Approved").reduce((a, x) => a + Number(x.amount), 0))}</b></div></div><section class="panel"><div class="panel-title"><div><h3>${role === "supplier" ? "Submitted time" : "Entries for your projects"}</h3><small>Approval status and variance against each task estimate.</small></div><select id="ccTimeStatus" onchange="ccTimeFilter()"><option>All statuses</option><option>Pending approval</option><option>Approved</option><option>Changes requested</option><option>Rejected</option></select></div><div class="cc-table-wrap"><table class="cc-table"><thead><tr><th>Work date / employee</th><th>Project / task</th><th>Hours / value</th><th>Estimate / logged</th><th>Approval</th><th>Actions</th></tr></thead><tbody>${
      entries
        .map((e) => {
          const item = allTasks.find((x) => x.t.id === e.taskId),
            est = Number(item?.t.estimatedHours || 0),
            logged = entries
              .filter((x) => x.taskId === e.taskId && x.status === "Approved")
              .reduce((a, x) => a + Number(x.hours), 0);
          return `<tr data-time-status="${ccEsc(e.status)}"><td><b>${ccEsc(e.employeeName)}</b><small>${date(e.workDate)}</small></td><td>${ccEsc(e.projectName)}<small>${ccEsc(e.phaseName)} · ${ccEsc(e.taskName)}</small></td><td>${Number(e.hours).toFixed(2)} h<small>${money(e.amount)} · ${ccEsc(e.description || "")}</small></td><td>${est ? `${logged.toFixed(1)} / ${est} h` : "No estimate"}${est ? `<small>${Math.round((logged / est) * 100)}% approved</small>` : ""}</td><td><span class="status ${e.status === "Approved" ? "completed" : e.status === "Pending approval" ? "submitted" : "active"}">${ccEsc(e.status)}</span>${e.reviewNote ? `<small>${ccEsc(e.reviewNote)}</small>` : ""}</td><td>${role === "customer" && e.status === "Pending approval" ? `<div class="cc-actions"><button class="btn small success" onclick="ccReviewTime('${e.id}','Approved')">Approve</button><button class="btn small outline" onclick="ccReviewTime('${e.id}','Changes requested')">Request changes</button><button class="btn small danger" onclick="ccReviewTime('${e.id}','Rejected')">Reject</button></div>` : ""}${role === "supplier" && e.status === "Pending approval" ? `<button class="btn small outline" onclick="ccEditTime('${e.id}',${e.hours},'${ccEsc(e.description)}')">Edit</button>` : ""}</td></tr>`;
        })
        .join("") || '<tr><td colspan="6">No time entries yet.</td></tr>'
    }</tbody></table></div></section>`,
  );
  window.__ccTimeEntries = entries;
  window.__ccTimeTasks = allTasks;
}
function ccTimeFilter() {
  const v = document.getElementById("ccTimeStatus").value;
  document
    .querySelectorAll("[data-time-status]")
    .forEach((x) => (x.hidden = v !== "All statuses" && x.dataset.timeStatus !== v));
}
async function ccNewTimeEntry() {
  const [d, p] = await Promise.all([ccProjects(), api("/profile")]),
    supplier = p.supplier || {},
    opts = [];
  for (const project of d)
    for (const phase of project.phases || [])
      for (const task of phase.tasks || [])
        if (task.assignedSupplierId === supplier.id && task.acceptanceStatus === "Accepted")
          opts.push({ project, phase, task });
  if (!opts.length) {
    toast("There are no accepted tasks to log time against", "error");
    return;
  }
  const members = supplier.teamMembers || [];
  modal(
    "Log team time",
    `<form id="ccTimeForm" class="modal-form"><label>Assigned work *<input id="ccTimeTaskSearch" placeholder="Search project or task"><select name="target" id="ccTimeTarget" required><option value="">Choose assigned work</option>${opts.map((x) => `<option value="${x.project.id}|${x.phase.id}|${x.task.id}">${ccEsc(x.project.name)} — ${ccEsc(x.phase.name)} — ${ccEsc(x.task.name)}</option>`).join("")}</select></label><label>Employee *<select name="employeeName" required>${members.map((x) => `<option>${ccEsc(x.name)}</option>`).join("") || `<option>${ccEsc(state.user.name)}</option>`}</select></label><div class="two"><label>Work date *<input name="workDate" type="date" value="${new Date().toISOString().slice(0, 10)}" required></label><label>Hours *<input name="hours" type="number" min="0.25" max="24" step="0.25" required></label></div><label>Work completed<textarea name="description" rows="3" maxlength="2000" placeholder="Describe the work completed"></textarea></label><div id="ccTimeError" class="form-error"></div><button class="btn primary">Submit for approval</button></form>`,
  );
  const search = document.getElementById("ccTimeTaskSearch"),
    select = document.getElementById("ccTimeTarget");
  search.oninput = () => {
    const q = search.value.toLowerCase();
    [...select.options].forEach((o, i) => {
      if (i) o.hidden = !o.text.toLowerCase().includes(q);
    });
  };
  document.getElementById("ccTimeForm").onsubmit = async (e) => {
    e.preventDefault();
    const fd = new FormData(e.target),
      [projectId, phaseId, taskId] = fd.get("target").split("|");
    try {
      await api("/time-entries", {
        method: "POST",
        body: {
          projectId,
          phaseId,
          taskId,
          employeeName: fd.get("employeeName"),
          workDate: fd.get("workDate"),
          hours: fd.get("hours"),
          description: fd.get("description"),
        },
      });
      closeModal();
      toast("Time submitted for customer approval");
      ccTimePage("supplier");
    } catch (x) {
      document.getElementById("ccTimeError").textContent = x.message;
    }
  };
}
async function ccReviewTime(id, status) {
  let reviewNote = "";
  if (status === "Changes requested") {
    reviewNote = (await uiPrompt("What needs to be clarified or corrected?", "")) || "";
    if (!reviewNote.trim()) return;
  }
  try {
    await api("/time-entries/" + id, { method: "PATCH", body: { status, reviewNote } });
    ccTimePage("customer");
  } catch (e) {
    toast(e.message, "error");
  }
}
async function ccEditTime(id, hours, description) {
  modal(
    "Edit pending time",
    `<form id="ccEditTimeForm" class="modal-form"><label>Hours<input name="hours" type="number" min="0.25" max="24" step="0.25" value="${hours}" required></label><label>Work completed<textarea name="description" rows="3">${description}</textarea></label><button class="btn primary">Save entry</button></form>`,
  );
  document.getElementById("ccEditTimeForm").onsubmit = async (e) => {
    e.preventDefault();
    const f = new FormData(e.target);
    await api("/time-entries/" + id, {
      method: "PATCH",
      body: { hours: f.get("hours"), description: f.get("description") },
    });
    closeModal();
    ccTimePage("supplier");
  };
}
function ccExportTime(role, type) {
  const data = window.__ccTimeEntries || [],
    rows = [
      ["Date", "Employee", "Project", "Phase", "Task", "Hours", "Rate", "Amount", "Status", "Description"],
      ...data.map((x) => [
        x.workDate,
        x.employeeName,
        x.projectName,
        x.phaseName,
        x.taskName,
        x.hours,
        x.hourlyRate,
        x.amount,
        x.status,
        x.description || "",
      ]),
    ];
  if (type === "pdf") {
    const w = window.open("", "_blank");
    if (!w) {
      toast("Allow pop-ups to print the PDF export", "error");
      return;
    }
    w.document.write(
      `<html><head><title>CraftCrew time report</title><style>body{font:12px Arial;padding:36px;color:#172b47}h1{font-size:24px}table{border-collapse:collapse;width:100%}td,th{padding:8px;border-bottom:1px solid #dce3ec;text-align:left}th{background:#eef3fa}</style></head><body><h1>CraftCrew · Time report</h1><p>${new Date().toLocaleDateString()} · ${data.length} entries</p><table>${rows.map((r, i) => `<tr>${r.map((c) => `<${i ? "td" : "th"}>${ccEsc(c)}</${i ? "td" : "th"}>`).join("")}</tr>`).join("")}</table><script>onload=()=>print()</script></body></html>`,
    );
    w.document.close();
    return;
  }
  const text =
    type === "csv"
      ? rows
          .map((r) => r.map((c) => '"' + String(c ?? "").replaceAll('"', '""') + '"').join(","))
          .join("\r\n")
      : `<?xml version="1.0" encoding="UTF-8"?><timeEntries>${data
          .map(
            (x) =>
              `<entry>${rows[0]
                .map(
                  (k, i) =>
                    `<${["date", "employee", "project", "phase", "task", "hours", "rate", "amount", "status", "description"][i]}>${String(
                      [
                        x.workDate,
                        x.employeeName,
                        x.projectName,
                        x.phaseName,
                        x.taskName,
                        x.hours,
                        x.hourlyRate,
                        x.amount,
                        x.status,
                        x.description || "",
                      ][i] ?? "",
                    )
                      .replaceAll("&", "&amp;")
                      .replaceAll(
                        "<",
                        "&lt;",
                      )}</${["date", "employee", "project", "phase", "task", "hours", "rate", "amount", "status", "description"][i]}>`,
                )
                .join("")}</entry>`,
          )
          .join("")}</timeEntries>`;
  const a = document.createElement("a");
  a.href = URL.createObjectURL(new Blob([text], { type: type === "csv" ? "text/csv" : "application/xml" }));
  a.download = `craftcrew-time-report.${type}`;
  a.click();
  URL.revokeObjectURL(a.href);
}

// Messages: use the whole dashboard height, searchable chats, and searchable participant selection.
async function messages(role) {
  const chats = (await api("/chats")).chats || [],
    q = new URLSearchParams(location.hash.split("?")[1] || ""),
    selected = q.get("chat"),
    // From a project's Messages tab (?project=): open that project's conversation first (T109)
    active =
      chats.find((c) => c.id === selected) ||
      (q.get("project") && chats.find((c) => c.projectId === q.get("project"))) ||
      chats[0],
    detail = active ? await api(`/chats/${active.id}/messages`) : null,
    search = q.get("search") || "",
    matches = chats.filter((c) =>
      `${c.title} ${c.members?.map((x) => x.name).join(" ")} ${c.lastMessage?.text || ""}`
        .toLowerCase()
        .includes(search.toLowerCase()),
    );
  app.innerHTML = dashboardShell(
    role,
    "messages",
    `<h1 class="sr-only">Messages</h1><section class="cc-chat-workspace"><aside class="cc-chat-sidebar"><div class="cc-chat-sidebar-head"><b>Chats <span>${chats.length}</span></b><button class="btn small primary" onclick="reviewNewChat()">+ New chat</button></div><input id="ccChatSearch" placeholder="Search chats or people" value="${ccEsc(search)}"><div class="cc-chat-threads">${matches.map((c) => `<a class="cc-chat-thread ${c.id === active?.id ? "active" : ""}" href="#/${role}/messages?chat=${encodeURIComponent(c.id)}&search=${encodeURIComponent(search)}"><b>${ccEsc(c.title)}</b><small>${ccEsc(c.members?.map((x) => x.name).join(", ") || "Project team")}</small><p>${ccEsc(c.lastMessage?.text || "No messages yet")}</p></a>`).join("") || '<div class="empty">No chats match your search.</div>'}</div></aside><section class="cc-chat-main">${active ? `<header class="cc-chat-header"><div><b>${ccEsc(active.title)}</b><small>${ccEsc([active.projectName, active.phaseName, active.taskName].filter(Boolean).join(" · "))} · ${(active.members || []).map((x) => ccEsc(x.name)).join(", ")}</small></div><a class="btn small outline" href="#/${role}/projects/${ccEsc(active.projectId)}">Open project</a></header><div class="cc-chat-messages" id="ccChatMessages">${(detail.messages || []).map((m) => `<article class="cc-chat-bubble ${m.senderId === state.user.id ? "mine" : ""}"><b>${m.senderId === state.user.id ? "You" : ccEsc(active.members?.find((x) => x.id === m.senderId)?.name || "Participant")}</b><p>${ccEsc(m.text)}</p><small>${date(m.createdAt)}</small></article>`).join("") || '<div class="empty">No messages yet. Start the conversation below.</div>'}</div><form id="ccChatCompose" class="cc-chat-compose"><textarea name="text" maxlength="5000" placeholder="Write a message…" required></textarea><button class="btn primary">Send</button></form>` : '<div class="cc-chat-empty">Select an authorized project conversation or start a new chat.</div>'}</section></section>`,
  );
  const input = document.getElementById("ccChatSearch");
  input.oninput = () => {
    const next = new URLSearchParams(location.hash.split("?")[1] || "");
    next.set("search", input.value);
    history.replaceState(null, "", `#/${role}/messages?${next}`);
    document
      .querySelectorAll(".cc-chat-thread")
      .forEach((a) => (a.hidden = !a.textContent.toLowerCase().includes(input.value.toLowerCase())));
  };
  if (active) {
    const box = document.getElementById("ccChatMessages");
    box.scrollTop = box.scrollHeight;
    document.getElementById("ccChatCompose").onsubmit = async (e) => {
      e.preventDefault();
      try {
        await api(`/chats/${active.id}/messages`, {
          method: "POST",
          body: { text: new FormData(e.target).get("text") },
        });
        messages(role);
      } catch (x) {
        toast(x.message, "error");
      }
    };
  }
}
async function reviewNewChat() {
  const projects = await ccProjects(),
    contacts = (await api("/contacts")).users || [];
  if (!projects.length) return toast("Create or join a project before starting a chat", "error");
  modal(
    "Start a project chat",
    `<form class="modal-form" id="ccNewChatForm"><label>Project<select name="projectId" id="ccChatProject">${projects.map((p) => `<option value="${p.id}">${ccEsc(p.name)}</option>`).join("")}</select></label><label>Scope<select name="scope" id="ccChatScope"><option value="project">Project-wide</option><option value="phase">Phase</option><option value="task">Task</option></select></label><label id="ccChatPhaseWrap" hidden>Phase<select id="ccChatPhase">${projects.flatMap((p) => (p.phases || []).map((ph) => `<option value="${p.id}|${ph.id}">${ccEsc(p.name)} · ${ccEsc(ph.name)}</option>`)).join("")}</select></label><label id="ccChatTaskWrap" hidden>Task<select id="ccChatTask">${projects.flatMap((p) => (p.phases || []).flatMap((ph) => (ph.tasks || []).map((t) => `<option value="${p.id}|${ph.id}|${t.id}">${ccEsc(p.name)} · ${ccEsc(ph.name)} · ${ccEsc(t.name)}</option>`))).join("")}</select></label><label>Conversation name<input name="title" maxlength="120" placeholder="Optional"></label><label>Find participants<input id="ccContactSearch" placeholder="Search names or companies"></label><div class="cc-contact-list">${contacts.map((u) => `<label class="cc-contact"><input type="checkbox" name="participantIds" value="${u.id}"><span><b>${ccEsc(u.name)}</b><small>${ccEsc(u.company || u.role)}</small></span></label>`).join("")}</div><div id="ccChatError" class="form-error"></div><button class="btn primary">Create chat</button></form>`,
  );
  const context = document.getElementById("ccChatScope");
  context.onchange = () => {
    document.getElementById("ccChatPhaseWrap").hidden = context.value !== "phase";
    document.getElementById("ccChatTaskWrap").hidden = context.value !== "task";
  };
  document.getElementById("ccContactSearch").oninput = (e) =>
    document
      .querySelectorAll(".cc-contact")
      .forEach((x) => (x.hidden = !x.textContent.toLowerCase().includes(e.target.value.toLowerCase())));
  document.getElementById("ccNewChatForm").onsubmit = async (e) => {
    e.preventDefault();
    const projectId = document.getElementById("ccChatProject").value,
      scope = context.value;
    let phaseId = "",
      taskId = "";
    if (scope === "phase") [, phaseId] = document.getElementById("ccChatPhase").value.split("|");
    if (scope === "task") [, phaseId, taskId] = document.getElementById("ccChatTask").value.split("|");
    const participantIds = [...e.target.querySelectorAll("[name=participantIds]:checked")].map(
        (x) => x.value,
      ),
      title = new FormData(e.target).get("title");
    try {
      const { chat } = await api("/chats", {
        method: "POST",
        body: { projectId, phaseId, taskId, participantIds, title },
      });
      closeModal();
      navigate(`/${role}/messages?chat=${chat.id}`);
      messages(role);
    } catch (x) {
      document.getElementById("ccChatError").textContent = x.message;
    }
  };
}

// Searchable invoice selector is added directly by the rich invoice form.

// Page routing + persistent sidebar links.
const ccBaseRoute = window.route;
window.route = async function () {
  const path = location.hash.replace(/^#/, "").split("?")[0],
    parts = path.split("/").filter(Boolean),
    role = state.user?.role;
  try {
    if (parts[0] === "customer" && parts[1] === "inbox") {
      await ccInbox("customer");
      return;
    }
    if (parts[0] === "supplier" && parts[1] === "inbox") {
      await ccInbox("supplier");
      return;
    }
    if (parts[1] === "time" && ["customer", "supplier"].includes(parts[0])) {
      await ccTimePage(parts[0]);
      return;
    }
    await ccBaseRoute();
    if (parts[0] === "supplier" && parts[1] === "invoices" && parts[2] === "new") ccInstallInvoiceSearch();
  } catch (e) {
    console.error(e);
    toast(e.message, "error");
    app.innerHTML = dashboardShell(
      role || "supplier",
      "dashboard",
      `<div class="panel"><h2>Could not load this page</h2><p>${ccEsc(e.message)}</p></div>`,
    );
  }
};
function ccInstallInvoiceSearch() {
  const target = document.getElementById("invTarget");
  if (!target || target.dataset.searchable) return;
  target.dataset.searchable = "1";
  const label = target.closest("label"),
    search = document.createElement("input");
  search.type = "search";
  search.placeholder = "Search project, phase or task";
  search.className = "cc-invoice-search";
  label.insertBefore(search, target);
  search.oninput = () => {
    const q = search.value.toLowerCase();
    [...target.options].forEach((o, i) => {
      if (i) o.hidden = !o.text.toLowerCase().includes(q);
    });
  };
}

// Admin account controls and the persistent platform-configuration workspace.

adminUsers = async function () {
  const [d, sd] = await Promise.all([api("/admin/users"), api("/admin/suppliers")]),
    users = d.users || [];
  app.innerHTML = dashboardShell(
    "admin",
    "users",
    `<div class="dash-top"><div><h1>Users & supplier badges</h1><p>Manage account access and supplier verification badges.</p></div></div><section class="panel"><div class="panel-title"><h3>Supplier directory badges</h3><span>${sd.suppliers.length} suppliers</span></div><div class="cc-table-wrap"><table class="cc-table"><thead><tr><th>Supplier</th><th>Location</th><th>Account</th><th>Current badge</th><th>Change badge</th></tr></thead><tbody>${
      sd.suppliers
        .map((s) => {
          const account = users.find((u) => u.supplierId === s.id);
          return `<tr><td><b>${ccEsc(s.company)}</b><small>${s.live ? "Live in directory" : "Not live"}</small></td><td>${ccEsc(s.location || "—")}</td><td>${ccEsc(account?.email || "No linked account")}</td><td>${ccEsc(supplierBadge(s))}</td><td><select aria-label="Badge for ${ccEsc(s.company)}" onchange="reviewChangeBadge('${s.id}',this.value)">${["None", "Bronze", "Silver", "Gold"].map((x) => `<option ${x === (s.badge || "None") ? "selected" : ""}>${x}</option>`).join("")}</select></td></tr>`;
        })
        .join("") || '<tr><td colspan="5">No supplier companies yet.</td></tr>'
    }</tbody></table></div></section><section class="panel"><div class="panel-title"><h3>Accounts</h3><span>${users.length} users</span></div><div class="cc-table-wrap"><table class="cc-table"><thead><tr><th>Name</th><th>Email</th><th>Role</th><th>Company</th><th>Access</th><th></th></tr></thead><tbody>${users
      .map((u) => {
        const status = u.status || "Active",
          self = u.id === state.user.id;
        return `<tr><td><b>${ccEsc(u.name)}</b></td><td>${ccEsc(u.email)}</td><td><span class="tag">${ccEsc(u.role)}</span></td><td>${ccEsc(u.company || "—")}</td><td><span class="status ${status === "Active" ? "completed" : "rejected"}">${ccEsc(status)}</span></td><td>${self ? "<small>Current admin</small>" : `<button class="btn small ${status === "Active" ? "danger" : "success"}" onclick="ccSetAccountStatus('${u.id}','${status === "Active" ? "Suspended" : "Active"}')">${status === "Active" ? "Suspend" : "Reactivate"}</button>`}</td></tr>`;
      })
      .join(
        "",
      )}</tbody></table></div><p class="subtle">Suspending revokes active sessions and blocks future sign-ins. The last active admin account is protected.</p></section>`,
  );
};
async function ccSetAccountStatus(id, status) {
  if (!(await uiConfirm(`${status === "Suspended" ? "Suspend" : "Reactivate"} this account?`))) return;
  try {
    await api(`/admin/users/${encodeURIComponent(id)}`, { method: "PATCH", body: { status } });
    toast(`Account ${status.toLowerCase()}`);
    adminUsers();
  } catch (e) {
    toast(e.message, "error");
  }
}

async function ccAdminPlatform() {
  const { settings: s } = await api("/admin/settings");
  app.innerHTML = dashboardShell(
    "admin",
    "platform",
    `<div class="dash-top"><div><div class="eyebrow">OPERATIONS CONFIGURATION</div><h1>Platform management</h1><p>Maintain marketplace rules and help content. Payment, map and email connectors are shown as configuration notes; live credentials are not stored here.</p></div></div><form id="ccPlatformSettings" class="cc-platform-settings"><section class="panel"><div class="panel-title"><h3>Service categories</h3><small>One category per line</small></div><textarea name="serviceCategories" rows="7" required aria-label="Service categories, one per line">${ccEsc(s.serviceCategories.join("\n"))}</textarea></section><section class="panel"><div class="panel-title"><h3>Supplier badge criteria</h3><small>Thresholds used by admins when assigning Bronze, Silver or Gold</small></div><div class="cc-badge-criteria">${["bronze", "silver", "gold"].map((k) => `<fieldset><legend>${k[0].toUpperCase() + k.slice(1)}</legend><label>Completed projects<input type="number" min="0" name="${k}Projects" value="${Number(s.badgeCriteria?.[k]?.projects) || 0}"></label><label>Minimum rating<input type="number" min="0" max="5" step="0.1" name="${k}Rating" value="${Number(s.badgeCriteria?.[k]?.rating) || 0}"></label></fieldset>`).join("")}</div></section><section class="panel"><div class="panel-title"><h3>System settings</h3></div><div class="cc-platform-grid"><label>Support email<input type="email" name="supportEmail" value="${ccEsc(s.supportEmail)}" required></label><label>Platform fee estimate (%)<input type="number" name="platformFeePercent" min="0" max="25" step="0.1" value="${Number(s.platformFeePercent) || 0}" required></label><label>Default payment terms (days)<input type="number" name="defaultPaymentTermsDays" min="0" max="180" value="${Number(s.defaultPaymentTermsDays) || 0}" required></label><label>Upload limit (MB)<input type="number" name="uploadLimitMb" min="1" max="5" value="${Number(s.uploadLimitMb) || 5}" required></label></div></section><section class="panel"><div class="panel-title"><h3>FAQ & help content</h3><small>Shared public help text</small></div><textarea name="faqContent" rows="6" maxlength="10000" placeholder="Add support articles or updated FAQ content">${ccEsc(s.faqContent || "")}</textarea></section><section class="panel"><div class="panel-title"><h3>Email template subjects</h3><small>Editable labels for future outbound mail integration</small></div><div class="cc-platform-grid">${Object.entries(
      s.emailTemplates || {},
    )
      .map(
        ([k, v]) =>
          `<label>${ccEsc(k.replaceAll(/([A-Z])/g, " $1"))}<input name="email_${ccEsc(k)}" value="${ccEsc(v)}" maxlength="300"></label>`,
      )
      .join(
        "",
      )}</div></section><section class="panel"><div class="panel-title"><h3>Integrations</h3><small>Current MVP connector status</small></div><div class="cc-integration-list">${Object.entries(
      s.integrations || {},
    )
      .map(
        ([k, v]) =>
          `<div><b>${ccEsc(k[0].toUpperCase() + k.slice(1))}</b><span>${ccEsc(v)}</span><em>Configuration only</em></div>`,
      )
      .join(
        "",
      )}</div><p class="subtle">Live payment processing, email delivery and external map credentials require provider setup before activation.</p></section><div class="cc-actions"><button class="btn primary">Save platform settings</button><span id="ccPlatformSaved" class="subtle"></span></div></form>`,
  );
  document.getElementById("ccPlatformSettings").onsubmit = async (e) => {
    e.preventDefault();
    const f = new FormData(e.target),
      emailTemplates = {};
    for (const k of Object.keys(s.emailTemplates || {})) emailTemplates[k] = f.get("email_" + k) || "";
    const badgeCriteria = {};
    for (const k of ["bronze", "silver", "gold"])
      badgeCriteria[k] = { projects: Number(f.get(k + "Projects")), rating: Number(f.get(k + "Rating")) };
    const body = {
      serviceCategories: String(f.get("serviceCategories"))
        .split(/\r?\n/)
        .map((x) => x.trim())
        .filter(Boolean),
      badgeCriteria,
      supportEmail: f.get("supportEmail"),
      platformFeePercent: f.get("platformFeePercent"),
      defaultPaymentTermsDays: f.get("defaultPaymentTermsDays"),
      uploadLimitMb: f.get("uploadLimitMb"),
      faqContent: f.get("faqContent"),
      emailTemplates,
    };
    try {
      await api("/admin/settings", { method: "PUT", body });
      document.getElementById("ccPlatformSaved").textContent = "Saved";
      toast("Platform settings saved");
    } catch (x) {
      toast(x.message, "error");
    }
  };
}

const ccRouteWithAdmin = window.route;
window.route = async function () {
  const parts = location.hash.replace(/^#/, "").split("?")[0].split("/").filter(Boolean);
  if (parts[0] === "admin" && parts[1] === "platform") {
    try {
      await ccAdminPlatform();
      return;
    } catch (e) {
      toast(e.message, "error");
      return;
    }
  }
  return ccRouteWithAdmin();
};


adminApplications = async function () {
  const { applications = [] } = await api("/admin/applications");
  app.innerHTML = dashboardShell(
    "admin",
    "applications",
    `<div class="dash-top"><div><h1>Supplier verification pipeline</h1><p>Check evidence, record references and risk, then approve, hold or reject each application.</p></div></div><section class="panel"><div class="cc-table-wrap"><table class="cc-table"><thead><tr><th>Company / contact</th><th>Vetting stage</th><th>Decision</th><th>Submitted</th><th></th></tr></thead><tbody>${applications.map((a) => `<tr><td><b>${ccEsc(a.company)}</b><small>${ccEsc(a.contactName || a.directorName || "")} · ${ccEsc(a.email)}</small></td><td>${ccEsc(a.stage || "New")}</td><td><span class="status ${a.status === "Approved" ? "completed" : a.status === "Rejected" ? "rejected" : a.status === "On Hold" ? "submitted" : "active"}">${ccEsc(a.status || "New")}</span></td><td>${date(a.createdAt)}</td><td><button class="btn small primary" onclick="reviewApplication('${a.id}')">Review file</button></td></tr>`).join("") || '<tr><td colspan="5">No applications received.</td></tr>'}</tbody></table></div></section>`,
  );
};

reviewApplication = async function (id) {
  const { applications = [] } = await api("/admin/applications"),
    a = applications.find((x) => x.id === id);
  if (!a) return;
  const v = a.verification || { checks: {}, riskLevel: "Not assessed" },
    checks = [
      ["registration", "Company registration"],
      ["vat", "VAT / tax check"],
      ["insurance", "Insurance evidence"],
      ["certifications", "Certificates"],
      ["references", "Reference calls"],
      ["sanctions", "Sanctions / KYC"],
    ];
  modal(
    "Supplier verification file",
    `<div class="cc-vetting-flow"><span class="on">1 Application</span><span class="on">2 Verification</span><span class="on">3 References</span><span class="on">4 Manual review</span><span>5 Decision & badge</span></div><div class="cc-vetting-grid"><section class="panel"><h3>Company & capability</h3><dl>${[
      ["Company", a.company],
      ["Contact", a.contactName || a.directorName],
      ["Email / phone", `${a.email} · ${a.phone}`],
      ["Registration / VAT", `${a.registrationNumber || "—"} · ${a.vatId || "—"}`],
      ["Legal address", a.legalAddress || a.location],
      ["Insurance", `${a.insuranceProvider || "—"} · ${a.insurancePolicy || a.insurance || "—"}`],
      [
        "Coverage / expiry",
        `${a.insuranceCoverage ? money(a.insuranceCoverage) : "—"} · ${a.insuranceExpiry || "—"}`,
      ],
      ["Website", a.website],
      ["Experience", `${a.yearsInBusiness || "—"} years`],
      ["Services", (a.services || []).join(", ")],
      ["Certifications", (a.certifications || []).join(", ")],
      ["Portfolio", a.portfolio],
    ]
      .map(([k, val]) => `<div><dt>${ccEsc(k)}</dt><dd>${ccEsc(val || "—")}</dd></div>`)
      .join(
        "",
      )}</dl></section><section class="panel"><h3>Evidence files</h3>${(a.proofUploads || []).map((f) => `<a class="cc-vetting-file" href="${ccEsc(f.url)}" target="_blank" rel="noopener">📄 ${ccEsc(f.filename)} <small>${ccEsc(f.category)} · ${Math.ceil((f.size || 0) / 1024)} KB</small></a>`).join("") || '<p class="subtle">No supporting documents uploaded.</p>'}<h3>References</h3><p>${ccEsc(a.referenceName)} · ${ccEsc(a.referenceEmail)}</p><p>${ccEsc(a.reference2 || "No second reference supplied")}</p></section></div><section class="panel cc-preflight"><h3>Automatic intake checks</h3><p>These checks validate submitted fields and files. The VAT ID is also checked with the EU VIES service; credit and sanctions databases are not queried.</p><div>${
      Object.entries(a.preflight || {})
        .map(([k, val]) => `<span><b>${ccEsc(k.replaceAll(/([A-Z])/g, " $1"))}</b>${ccEsc(val)}</span>`)
        .join("") || ""
    }</div>${ccViesPanel(a)}</section><form id="ccVettingReview" class="modal-form"><div class="cc-vetting-checks"><h3>Verification checks</h3>${checks.map(([key, label]) => `<label>${label}<select name="check_${key}">${["Not checked", "Passed", "Needs follow-up", "Failed", "Not applicable"].map((x) => `<option ${x === (v.checks?.[key] || "Not checked") ? "selected" : ""}>${x}</option>`).join("")}</select></label>`).join("")}</div><div class="two"><label>Vetting stage<select name="stage">${["New", "Verified", "References", "Manual Review", "Decision & Badge"].map((x) => `<option ${x === (a.stage || "New") ? "selected" : ""}>${x}</option>`).join("")}</select></label><label>Risk level<select name="riskLevel">${["Not assessed", "Low", "Medium", "High"].map((x) => `<option ${x === (v.riskLevel || "Not assessed") ? "selected" : ""}>${x}</option>`).join("")}</select></label></div><div class="two"><label>Reference call outcome<select name="referenceOutcome">${["Not started", "Reached - positive", "Reached - concerns", "No response", "Not applicable"].map((x) => `<option ${x === (v.referenceOutcome || "Not started") ? "selected" : ""}>${x}</option>`).join("")}</select></label><label>Badge decision<select name="badge">${["Bronze", "Silver", "Gold"].map((x) => `<option ${x === (a.badgeDecision || "Bronze") ? "selected" : ""}>${x}</option>`).join("")}</select></label></div><label>Risk assessment / verification notes<textarea name="riskNotes" rows="3" maxlength="3000">${ccEsc(v.riskNotes || "")}</textarea></label><label>Decision note to applicant<textarea name="decisionNote" rows="2" maxlength="3000">${ccEsc(a.decisionNote || "")}</textarea></label><div id="ccVettingError" class="form-error" role="alert"></div><div class="cc-actions">${a.status === "On Hold" ? `<button type="button" class="btn outline" onclick="ccSaveVetting('${id}','New')">Return to review queue</button>` : ""}<button type="button" class="btn outline" onclick="ccSaveVetting('${id}','')">Save review</button><button type="button" class="btn outline" onclick="ccSaveVetting('${id}','On Hold')">Put on hold</button><button type="button" class="btn danger" onclick="ccSaveVetting('${id}','Rejected')">Reject</button><button type="button" class="btn success" onclick="ccSaveVetting('${id}','Approved')">Approve & assign badge</button></div></form>`,
  );
};

// EU VIES result for the VAT ID (T60). The "VAT / tax check" below is pre-filled from it; the admin decides.
function ccViesPanel(a) {
  if (!a.vatId) return "";
  const r = a.verification?.vies,
    when = r?.checkedAt ? ` <small>${date(r.checkedAt)}</small>` : "";
  const text = !r
    ? "Not checked with VIES yet"
    : r.unreachable
      ? "VIES not reachable – check manually"
      : r.valid
        ? `<b>VIES: VAT ID valid</b>${r.name ? ` · ${ccEsc(r.name)}` : ""}${r.address ? ` · ${ccEsc(r.address)}` : ""}${r.requestId ? ` · <small>${ccEsc(r.requestId)}</small>` : ""}`
        : "<b>VIES: VAT ID not valid</b>";
  return `<p class="cm-vies" id="ccVies">${text}${when} <button type="button" class="btn small outline" onclick="ccViesCheck('${ccEsc(a.id)}')">Check now</button></p>`;
}
async function ccViesCheck(id) {
  try {
    await api(`/admin/applications/${encodeURIComponent(id)}/vies`, { method: "POST" });
    await reviewApplication(id);
    toast("VIES check finished");
  } catch (e) {
    toast(e.message);
  }
}

async function ccSaveVetting(id, status) {
  const form = document.getElementById("ccVettingReview"),
    fd = new FormData(form),
    checks = {};
  for (const key of ["registration", "vat", "insurance", "certifications", "references", "sanctions"])
    checks[key] = fd.get("check_" + key);
  const verification = {
    checks,
    riskLevel: fd.get("riskLevel"),
    riskNotes: fd.get("riskNotes"),
    referenceOutcome: fd.get("referenceOutcome"),
  };
  const body = {
    stage: fd.get("stage"),
    badge: fd.get("badge"),
    verification,
    decisionNote: fd.get("decisionNote"),
  };
  if (status) body.status = status;
  try {
    await api(`/admin/applications/${encodeURIComponent(id)}`, { method: "PATCH", body });
    closeModal();
    toast(status ? `Application ${status.toLowerCase()}` : "Verification review saved");
    adminApplications();
  } catch (e) {
    document.getElementById("ccVettingError").textContent = e.message;
  }
}

adminBilling = async function () {
  const [{ invoices = [] }, { settings }] = await Promise.all([api("/invoices"), api("/admin/settings")]),
    rate = Number(settings.platformFeePercent) || 0,
    total = invoices.reduce((n, i) => n + Number(i.amount || 0), 0),
    paid = invoices.filter((i) => i.status === "Paid"),
    refunded = invoices.filter((i) => i.status === "Refunded"),
    scheduled = invoices.filter((i) => i.status === "Approved");
  app.innerHTML = dashboardShell(
    "admin",
    "billing",
    `<div class="dash-top"><div><h1>Payments, fees & supplier payouts</h1><p>Track invoice decisions and payout records. Actual bank transfers and refunds still require a connected payment provider.</p></div></div><div class="wf-stat-grid"><div class="cc-card"><span class="cc-label">Invoice volume</span><b>${money(total)}</b></div><div class="cc-card"><span class="cc-label">Awaiting payment</span><b>${money(scheduled.reduce((n, i) => n + Number(i.amount || 0), 0))}</b></div><div class="cc-card"><span class="cc-label">Paid / payout recorded</span><b>${money(paid.reduce((n, i) => n + Number(i.payment?.supplierPayout ?? i.amount * (1 - rate / 100)), 0))}</b></div><div class="cc-card"><span class="cc-label">Platform fee estimate · ${rate}%</span><b>${money(invoices.filter((i) => ["Approved", "Paid", "Refunded"].includes(i.status)).reduce((n, i) => n + Number(i.payment?.platformFee ?? (i.amount * rate) / 100), 0))}</b></div></div><section class="panel"><div class="cc-table-wrap"><table class="cc-table"><thead><tr><th>Invoice</th><th>Project / supplier</th><th>Gross</th><th>Fee · payout</th><th>Payment / payout status</th><th>Actions</th></tr></thead><tbody>${
      invoices
        .map((i) => {
          const fee = Number(i.payment?.platformFee ?? (i.amount * rate) / 100),
            payout = Number(i.payment?.supplierPayout ?? i.amount - fee);
          return `<tr><td><b>${ccEsc(invNo(i))}</b><small>${date(i.createdAt)}</small></td><td>${ccEsc(i.projectName || i.projectId)}<small>${ccEsc(i.supplierCompany || "Supplier")}</small></td><td>${money(i.amount)}</td><td>${money(fee)} · ${money(payout)}<small>${rate}% configured rate</small></td><td><span class="status ${i.status === "Paid" ? "completed" : i.status === "Refunded" || i.status === "Rejected" ? "rejected" : "submitted"}">${ccEsc(i.status)}</span>${i.status === "Approved" && i.overdue ? ` <span class="status overdue">${dsDaysLate(i.scheduledPayment)}</span>` : ""}<small>${ccEsc(i.payment?.status || "No payout record")}</small></td><td>${i.status === "Approved" ? `<button class="btn small success" onclick="markPaid('${i.id}')">Record paid</button>` : ""}${i.status === "Paid" ? `<button class="btn small danger" onclick="ccRefundInvoice('${i.id}')">Record refund</button>` : ""}</td></tr>`;
        })
        .join("") || '<tr><td colspan="6">No invoices recorded.</td></tr>'
    }</tbody></table></div></section><section class="panel"><h3>Refunds & disputes</h3><p>Refunds change the CraftCrew ledger and notify the supplier. Complete the matching refund with your payment provider separately.</p><a class="btn outline" href="#/admin/disputes">Open dispute resolution</a>${refunded.length ? `<p>${refunded.length} refund(s) recorded · ${money(refunded.reduce((n, i) => n + Number(i.amount), 0))}</p>` : ""}</section>`,
  );
};
async function ccRefundInvoice(id) {
  const reason = await uiPrompt("Reason for recording this refund");
  if (!reason?.trim()) return;
  try {
    await api(`/admin/invoices/${encodeURIComponent(id)}`, {
      method: "PATCH",
      body: { action: "Refund", reason },
    });
    toast("Refund recorded in the invoice ledger");
    adminBilling();
  } catch (e) {
    toast(e.message, "error");
  }
}
