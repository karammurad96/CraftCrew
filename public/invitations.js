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

