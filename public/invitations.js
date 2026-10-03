/* Task and phase invitations. Selecting a supplier only invites them: the supplier must accept
   before work, time sheets and invoices can start. Customers see clearly that an invitation is
   waiting (and can withdraw it); suppliers find Accept / Decline at the top of "Assigned work". */
const invQuery = () => new URLSearchParams(location.hash.split("?")[1] || "");
const invLastEntry = (x, status) =>
  [...(x.assignmentHistory || [])].reverse().find((h) => !status || h.status === status);

/* ---------- Supplier: answer an invitation ---------- */
async function invAnswerTask(pid, tid, accept) {
  let reason = "";
  if (!accept) {
    reason = await uiPrompt(t("ui.inv.declineTask"), "", { confirmLabel: t("ui.inv.declineTaskLabel"), required: false });
    if (reason === null) return;
  }
  try {
    await api(`/projects/${pid}/tasks/${tid}/accept`, { method: "POST", body: { accept, reason } });
    tToast(t(accept ? "ui.inv.taskAccepted" : "ui.inv.declined"));
    route();
  } catch (e) {
    toast(e.message, "error");
  }
}
async function invAnswerPhase(pid, phid, accept) {
  if (!accept && !(await uiConfirm(t("ui.inv.declinePhase"), { confirmLabel: t("ui.inv.decline") }))) return;
  try {
    await api(`/projects/${pid}/accept`, { method: "POST", body: { phaseId: phid, accept } });
    tToast(t(accept ? "ui.inv.phaseAccepted" : "ui.inv.declined"));
    route();
  } catch (e) {
    toast(e.message, "error");
  }
}

