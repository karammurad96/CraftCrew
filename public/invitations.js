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

