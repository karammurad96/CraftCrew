/* Safer destructive actions: every delete explains its consequences first, and deleting something for good
   needs its name typed in. Projects with records are archived (the server keeps invoices, §147 AO), phases
   and tasks with suppliers or invoices cannot be deleted, and the dialog says so before anything happens. */
async function saTypeToConfirm({ title, message, name, confirmLabel }) {
  const typed = await uiDialog({
    title,
    message,
    input: true,
    required: true,
    placeholder: name,
    confirmLabel,
    danger: true,
  });
  if (typed === null) return false;
  if (typed.trim() === String(name).trim()) return true;
  toast("The name does not match. Nothing was deleted.", "error");
  return false;
}
const saSuppliersOf = (phases) =>
  new Set(
    phases.flatMap((ph) => [
      ...(ph.supplierId && ph.acceptanceStatus === "Accepted" ? [ph.supplierId] : []),
      ...(ph.tasks || [])
        .filter((t) => t.assignedSupplierId && t.acceptanceStatus === "Accepted")
        .map((t) => t.assignedSupplierId),
    ]),
  ).size;

deleteProject = async function (id) {
  try {
    const [{ project: p }, { invoices = [] }, docs] = await Promise.all([
      api("/projects/" + id),
      api("/invoices").catch(() => ({})),
      api(`/projects/${id}/documents`).catch(() => ({})),
    ]);
    const invoiceCount = invoices.filter((i) => i.projectId === id).length,
      documentCount = (docs.documents || []).length,
      supplierCount = saSuppliersOf(p.phases || []);
    const ok =
      invoiceCount || documentCount || supplierCount
        ? await uiConfirm(
            `This project has ${invoiceCount} invoice(s), ${documentCount} document(s) and ${supplierCount} supplier(s). It will be archived, not deleted.`,
            { title: "Archive project?", confirmLabel: "Archive project", danger: true },
          )
        : await saTypeToConfirm({
            title: "Delete project for good?",
            message: `"${p.name}" has no invoices, documents or suppliers, so it will be deleted for good. Type the project name to confirm.`,
            name: p.name,
            confirmLabel: "Delete project",
          });
    if (!ok) return;
    const r = await api("/projects/" + id, { method: "DELETE" });
    toast(r.archived ? "Project archived" : "Project deleted");
    navigate("/customer/projects");
  } catch (e) {
    toast(e.message, "error");
  }
};

deletePhase = async function (pid, phid) {
  try {
    const [{ project: p }, { invoices = [] }] = await Promise.all([
      api("/projects/" + pid),
      api("/invoices").catch(() => ({})),
    ]);
    const ph = p.phases.find((x) => x.id === phid);
    if (!ph) return;
    if (
      ph.supplierId ||
      (ph.tasks || []).some((t) => t.assignedSupplierId) ||
      invoices.some((i) => i.phaseId === phid)
    ) {
      await uiDialog({
        title: "This phase cannot be deleted",
        message:
          "It has supplier assignments or invoices. Remove the assignments and resolve the invoices first.",
        confirmLabel: "OK",
      });
      return;
    }
    const ok = await saTypeToConfirm({
      title: "Delete phase?",
      message: `"${ph.name}" and its ${(ph.tasks || []).length} task(s) will be deleted for good. Type the phase name to confirm.`,
      name: ph.name,
      confirmLabel: "Delete phase",
    });
    if (!ok) return;
    await api(`/projects/${pid}/phases/${phid}`, { method: "DELETE" });
    toast("Phase deleted");
    projectDetail(pid);
  } catch (e) {
    toast(e.message, "error");
  }
};

wfDeleteTask = async function (pid, phid, tid) {
  try {
    const [{ project: p }, { invoices = [] }] = await Promise.all([
      api("/projects/" + pid),
      api("/invoices").catch(() => ({})),
    ]);
    const t = p.phases.find((x) => x.id === phid)?.tasks?.find((x) => x.id === tid);
    if (!t) return;
    if (t.assignedSupplierId || invoices.some((i) => i.taskId === tid)) {
      await uiDialog({
        title: "This task cannot be deleted",
        message:
          "It has a supplier assignment or invoices. Remove the assignment and resolve the invoices first.",
        confirmLabel: "OK",
      });
      return;
    }
    const ok = await saTypeToConfirm({
      title: "Delete task?",
      message: `"${t.name}" will be deleted for good. Type the task name to confirm.`,
      name: t.name,
      confirmLabel: "Delete task",
    });
    if (!ok) return;
    await api(`/projects/${pid}/phases/${phid}/tasks/${tid}`, { method: "DELETE" });
    closeModal();
    projectDetail(pid);
  } catch (e) {
    toast(e.message, "error");
  }
};

if (typeof paSignOutOthers === "function") {
  const saBaseSignOutOthers = paSignOutOthers;
  paSignOutOthers = async function () {
    if (
      await uiConfirm(
        "Sign out all your other sessions? Other browsers and devices will need to sign in again.",
        {
          confirmLabel: "Sign out others",
        },
      )
    )
      return saBaseSignOutOthers();
  };
}

// The project page keeps delete and archive out of the main button row, in a "More" (⋯) menu.
function saMoreMenu(pid) {
  return `<details class="sa-more"><summary class="btn outline" aria-label="More actions">⋯</summary><div class="sa-more-list" role="menu"><button type="button" role="menuitem" class="sa-danger" onclick="this.closest('details').open=false;deleteProject('${pid}')">Delete or archive project…</button></div></details>`;
}
document.addEventListener("click", (e) => {
  for (const d of document.querySelectorAll("details.sa-more[open]"))
    if (!d.contains(e.target)) d.open = false;
});
