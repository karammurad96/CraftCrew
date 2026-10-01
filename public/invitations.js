/* Task and phase invitations. Selecting a supplier only invites them: the supplier must accept
   before work, time sheets and invoices can start. Customers see clearly that an invitation is
   waiting (and can withdraw it); suppliers find Accept / Decline at the top of "Assigned work". */
const invEsc = (v) => esc(v ?? "");
const invQuery = () => new URLSearchParams(location.hash.split("?")[1] || "");
const invLastEntry = (x, status) =>
  [...(x.assignmentHistory || [])].reverse().find((h) => !status || h.status === status);

/* ---------- Supplier: answer an invitation ---------- */
async function invAnswerTask(pid, tid, accept) {
  let reason = "";
  if (!accept) {
    reason = await uiPrompt(
      "Decline this task? You can tell the customer why (optional).",
      "",
      { confirmLabel: "Decline task", required: false },
    );
    if (reason === null) return;
  }
  try {
    await api(`/projects/${pid}/tasks/${tid}/accept`, { method: "POST", body: { accept, reason } });
    toast(accept ? "Task accepted — it is now in your assigned work" : "Invitation declined");
    route();
  } catch (e) {
    toast(e.message, "error");
  }
}
async function invAnswerPhase(pid, phid, accept) {
  if (!accept && !(await uiConfirm("Decline this phase invitation?", { confirmLabel: "Decline" }))) return;
  try {
    await api(`/projects/${pid}/accept`, { method: "POST", body: { phaseId: phid, accept } });
    toast(accept ? "Phase accepted" : "Invitation declined");
    route();
  } catch (e) {
    toast(e.message, "error");
  }
}
// Older buttons (project page, dashboards) use the same flow.
wfAcceptTask = (pid, tid, accept) => invAnswerTask(pid, tid, accept);
acceptPhase = (pid, phid, accept) => invAnswerPhase(pid, phid, accept);

/* ---------- Supplier: "Assigned work" with invitations first ---------- */
function invWorkCard(x) {
  const t = x.t,
    pct = Math.min(100, Number(t.progress) || 0),
    q = `project=${x.p.id}&phase=${x.ph.id}&task=${t.id}`,
    back = `&back=${encodeURIComponent("/supplier/projects/" + x.p.id)}`;
  return `<article class="panel review-work-card"><div class="project-card-head"><div><span class="eyebrow">${invEsc(x.p.name)} · ${invEsc(x.ph.name)}</span><h3>${invEsc(t.name)}</h3></div><span class="status ${String(t.status || "Not Started").toLowerCase().replaceAll(" ", "-")}">${invEsc(t.status || "Not Started")}</span></div><p>${invEsc(t.description || "")}</p><div class="wf-task-meta"><span>${date(t.startDate)} → ${date(t.dueDate)}</span><span>${pct}% complete</span></div><div class="timeline-line"><i style="width:${pct}%"></i></div><div class="cc-actions"><button class="btn small outline" onclick="wfUpdateProgress('${x.p.id}','${x.ph.id}','${t.id}',${pct})">Update progress</button><button class="btn small outline" onclick="navigate('/supplier/projects/${x.p.id}/documents?phase=${x.ph.id}&task=${t.id}')">Documents</button><button class="btn small outline" onclick="navigate('/supplier/invoices?${q}${back}')">Invoices</button><button class="btn small outline" onclick="navigate('/supplier/messages?${q}${back}')">Messages</button></div></article>`;
}
function invInviteCard(x, highlight) {
  const item = x.t || x.ph,
    invited = invLastEntry(item, "Invited")?.at || item.invitedAt,
    answer = x.t
      ? `invAnswerTask('${x.p.id}','${x.t.id}',`
      : `invAnswerPhase('${x.p.id}','${x.ph.id}',`;
  return `<article class="inv-card ${highlight ? "inv-highlight" : ""}" id="inv-${item.id}"><div class="inv-card-main"><span class="eyebrow">${x.t ? "Task invitation" : "Phase invitation"} · ${invEsc(x.p.name)}${x.t ? " · " + invEsc(x.ph.name) : ""}</span><h3>${invEsc(item.name)}</h3>${item.description ? `<p>${invEsc(item.description)}</p>` : ""}<div class="inv-facts"><span><small>Schedule</small><b>${date(item.startDate)} → ${date(item.dueDate)}</b></span><span><small>Order value</small><b>${item.orderAmount ? money(item.orderAmount) : "Not set"}</b></span>${invited ? `<span><small>Invited</small><b>${date(invited)}</b></span>` : ""}</div></div><div class="inv-card-actions"><button class="btn primary" onclick="${answer}true)">Accept ${x.t ? "task" : "phase"}</button><button class="btn outline" onclick="${answer}false)">Decline</button><button class="btn ghost small" onclick="navigate('/supplier/projects/${x.p.id}')">View project</button></div></article>`;
}
supplierPhases = async function () {
  const projects = await reviewProjects(),
    sid = state.user.supplierId,
    invites = [],
    work = [];
  for (const p of projects)
    for (const ph of p.phases || []) {
      if (ph.supplierId === sid && ph.acceptanceStatus === "Pending") invites.push({ p, ph });
      for (const t of ph.tasks || []) {
        if (t.assignedSupplierId !== sid) continue;
        (t.acceptanceStatus === "Pending" ? invites : work).push({ p, ph, t });
      }
    }
  const highlight = invQuery().get("invite");
  app.innerHTML = dashboardShell(
    "supplier",
    "phases",
    `<div class="dash-top"><div><h1>Assigned work</h1><p>Answer new invitations, then report progress, documents and invoices on the work you accepted.</p></div><button class="btn outline" onclick="navigate('/supplier/bids')">Find more work</button></div>
    ${
      invites.length
        ? `<section class="panel inv-panel"><div class="panel-title"><h3>Waiting for your answer</h3><span class="ui-count">${invites.length}</span></div><p class="subtle inv-hint">The customer has invited you. Nothing starts until you accept — declined work goes back to the customer.</p><div class="inv-list">${invites.map((x) => invInviteCard(x, highlight && highlight === (x.t || x.ph).id)).join("")}</div></section>`
        : ""
    }
    <div class="panel-title inv-work-title"><h3>Accepted work</h3><span class="ui-count">${work.length}</span></div>
    <div class="review-work-grid">${work.map(invWorkCard).join("") || '<div class="empty">No accepted work yet. Answer an invitation above or browse task bids.</div>'}</div>`,
  );
  if (highlight) document.getElementById("inv-" + highlight)?.scrollIntoView({ block: "center" });
};

/* ---------- Customer: invitation state on the task card ---------- */
async function invWithdraw(pid, tid) {
  if (!(await uiConfirm("Withdraw this invitation? The supplier is told and the task is free again.", { confirmLabel: "Withdraw" })))
    return;
  try {
    await api(`/projects/${pid}/tasks/${tid}/withdraw`, { method: "POST" });
    toast("Invitation withdrawn");
    await projectDetail(pid);
  } catch (e) {
    toast(e.message, "error");
  }
}
const invBaseTaskCard = wfTaskCard;
wfTaskCard = function (p, ph, t, sups) {
  const html = invBaseTaskCard(p, ph, t, sups),
    pending = t.assignedSupplierId && t.acceptanceStatus === "Pending",
    declined = !t.assignedSupplierId && t.acceptanceStatus === "Declined" ? invLastEntry(t, "Declined") : null;
  if (!pending && !declined) return html;
  const tpl = document.createElement("template");
  tpl.innerHTML = html;
  const card = tpl.content.firstElementChild,
    meta = card?.querySelector(".wf-task-meta");
  if (!card || !meta) return html;
  const company = (sups || []).find((s) => s.id === t.assignedSupplierId)?.company || "The supplier";
  if (pending) {
    const pill = card.querySelector(".wf-task-head .status");
    if (pill) {
      pill.className = "status pending";
      pill.textContent = state.user.role === "supplier" ? "Waiting for your answer" : "Awaiting acceptance";
    }
    const invited = invLastEntry(t, "Invited")?.at || t.invitedAt;
    meta.insertAdjacentHTML(
      "afterend",
      state.user.role === "customer"
        ? `<div class="inv-wait"><span>Invitation sent to <b>${invEsc(company)}</b>${invited ? " on " + date(invited) : ""}. Work, time sheets and invoices start once they accept.</span><button class="btn small outline" onclick="invWithdraw('${p.id}','${t.id}')">Withdraw invitation</button></div>`
        : `<div class="inv-wait"><span>You are invited to this task. Accept it to start reporting progress.</span></div>`,
    );
    // Before acceptance the supplier can only answer the invitation.
    if (state.user.role === "supplier")
      card.querySelectorAll("button").forEach((b) => {
        if (!/invAnswerTask|wfAcceptTask/.test(b.getAttribute("onclick") || "")) b.remove();
      });
  } else {
    meta.insertAdjacentHTML(
      "afterend",
      `<div class="inv-wait inv-declined"><span><b>${invEsc(declined.company || "The supplier")}</b> declined this task${declined.reason ? `: “${invEsc(declined.reason)}”` : "."} Choose another supplier or request bids.</span></div>`,
    );
  }
  return card.outerHTML;
};
/* Inviting is explicit about what happens next. */
const invBaseAssignTask = wfAssignTask;
wfAssignTask = async function (pid, tid) {
  await invBaseAssignTask(pid, tid);
  document
    .querySelector(".modal .wf-compare")
    ?.insertAdjacentHTML(
      "beforebegin",
      '<p class="modal-intro">The supplier receives an invitation and has to accept it before the task starts.</p>',
    );
};
wfAssignSupplier = async function (pid, tid, sid) {
  try {
    await api(`/projects/${pid}/tasks/${tid}/assign`, { method: "POST", body: { supplierId: sid } });
    closeModal();
    toast("Invitation sent — waiting for the supplier to accept");
    await projectDetail(pid);
  } catch (e) {
    toast(e.message, "error");
  }
};
