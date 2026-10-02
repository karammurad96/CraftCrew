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

/* ---------- Supplier view of a customer project ---------- */
// The supplier sees its own scope: its order value instead of the customer's budget, no project
// editing or offer comparison, and while only invited, the invitation to answer first.
const invBaseProjectDetail = projectDetail;
projectDetail = async function (pid) {
  await invBaseProjectDetail(pid);
  if (state.user?.role !== "supplier") return;
  const content = document.querySelector(".dashboard-content");
  if (!content) return;
  const d = await api("/projects/" + pid),
    p = d.project,
    sid = state.user.supplierId,
    own = p.phases.flatMap((ph) => (ph.tasks || []).map((t) => ({ ph, t }))).filter((x) => x.t.assignedSupplierId === sid),
    pending = own.filter((x) => x.t.acceptanceStatus === "Pending"),
    orderValue = own.reduce((a, x) => a + (Number(x.t.orderAmount) || 0), 0),
    invoiced = (d.invoices || [])
      .filter((i) => !["Rejected", "Changes Requested"].includes(i.status))
      .reduce((a, i) => a + Number(i.amount || 0), 0);
  content.querySelectorAll(".dash-top .cc-actions button").forEach((b) => {
    if (/editProject/.test(b.getAttribute("onclick") || "")) b.remove();
  });
  content.querySelectorAll(".wf-project-nav button").forEach((b) => {
    if (/\/offers\?/.test(b.getAttribute("onclick") || "")) b.remove();
  });
  const cards = content.querySelectorAll(".wf-stat-grid .cc-card");
  if (cards[0])
    cards[0].innerHTML = `<span class="cc-label">Your order value</span><b>${money(orderValue)}</b><small>${money(invoiced)} invoiced by you</small>`;
  const desk = cards[3]?.querySelector("small");
  if (desk) desk.textContent = `${(d.invoices || []).length} invoice(s) from you`;
  const sub = content.querySelector(".project-task-panel .panel-title small");
  if (sub) sub.textContent = "Only the tasks given to your company are shown.";
  if (p.involvement === "invited") {
    content.querySelector(".wf-project-nav")?.remove();
    content.querySelector(".wf-stat-grid")?.insertAdjacentHTML(
      "beforebegin",
      `<div class="inv-wait"><span>You are invited to ${pending.length === 1 ? "a task" : pending.length + " tasks"} on this project. Accept to see the full scope, documents and messages.</span><span class="cc-actions">${pending
        .map(
          (x) =>
            `<button class="btn small primary" onclick="invAnswerTask('${p.id}','${x.t.id}',true)">Accept ${pending.length > 1 ? invEsc(x.t.name) : "task"}</button><button class="btn small outline" onclick="invAnswerTask('${p.id}','${x.t.id}',false)">Decline</button>`,
        )
        .join("")}</span></div>`,
    );
  }
};
