/* Punch list (T64): defects per task with photos. Customers record and verify, suppliers mark them fixed. */
const puEsc = (s) =>
  String(s ?? "").replace(
    /[&<>"']/g,
    (c) => ({ "&": "&amp;", "<": "&lt;", ">": "&gt;", '"': "&quot;", "'": "&#39;" })[c],
  );
const PU_SEVERITY = { minor: "Minor", major: "Major", critical: "Critical" };
const PU_STATUS = { open: "Open", fixed: "Fixed – to verify", verified: "Verified" };

async function puFiles(input) {
  const urls = [];
  for (const file of [...(input?.files || [])].slice(0, 5)) urls.push((await uploadFile(file)).url);
  return urls;
}
const puPhotos = (urls, label) =>
  (urls || [])
    .map(
      (u, i) =>
        `<a class="btn small outline" href="${puEsc(u)}" target="_blank" rel="noopener">📷 ${label} ${i + 1}</a>`,
    )
    .join("");

async function puOpen(projectId, taskId) {
  const { defects } = await api(`/projects/${projectId}/tasks/${taskId}/defects`),
    customer = state.user?.role === "customer",
    supplier = state.user?.role === "supplier";
  const row = (d) => {
    const actions =
      supplier && d.status === "open"
        ? `<div class="pu-step"><label>Photo of the fix<input type="file" accept=".png,.jpg,.jpeg" multiple id="puFix_${puEsc(d.id)}"></label><label>Note<input id="puNote_${puEsc(d.id)}" maxlength="1000"></label><button type="button" class="btn small primary" onclick="puStep('${puEsc(projectId)}','${puEsc(taskId)}','${puEsc(d.id)}','fixed')">Mark fixed</button></div>`
        : customer && d.status === "fixed"
          ? `<div class="pu-step"><label>Note (required to reopen)<input id="puNote_${puEsc(d.id)}" maxlength="1000"></label><button type="button" class="btn small success" onclick="puStep('${puEsc(projectId)}','${puEsc(taskId)}','${puEsc(d.id)}','verified')">Verify fix</button><button type="button" class="btn small outline" onclick="puStep('${puEsc(projectId)}','${puEsc(taskId)}','${puEsc(d.id)}','reopen')">Reopen</button></div>`
          : "";
    return `<li class="pu-item pu-${puEsc(d.status)}"><div class="pu-head"><b>${puEsc(d.title)}</b><span class="status ${d.status === "verified" ? "completed" : d.status === "fixed" ? "submitted" : "rejected"}">${PU_STATUS[d.status] || ""}</span><span class="tag">${PU_SEVERITY[d.severity] || ""}</span>${d.dueDate ? `<small><span>Fix by</span> ${date(d.dueDate)}</small>` : ""}</div>${d.description ? `<p>${puEsc(d.description)}</p>` : ""}${d.reopenNote && d.status === "open" ? `<p class="pu-note"><b>Reopened:</b> ${puEsc(d.reopenNote)}</p>` : ""}${d.fixNote ? `<p class="pu-note"><b>Supplier note:</b> ${puEsc(d.fixNote)}</p>` : ""}<div class="pu-photos">${puPhotos(d.photoUrls, "Photo")}${puPhotos(d.fixPhotoUrls, "Fix photo")}</div>${actions}</li>`;
  };
  const order = { open: 0, fixed: 1, verified: 2 };
  modal(
    "Defects",
    `<ul class="pu-list">${
      [...defects]
        .sort((a, b) => order[a.status] - order[b.status])
        .map(row)
        .join("") || '<li class="pa-empty">No defects recorded.</li>'
    }</ul>${
      customer
        ? `<form id="puForm" class="modal-form pu-form"><h3>Record a defect</h3><div class="two"><label>Title<input name="title" required maxlength="160" placeholder="e.g. Paint scratch on panel 3"></label><label>Severity<select name="severity">${Object.entries(
            PU_SEVERITY,
          )
            .map(([k, v]) => `<option value="${k}">${v}</option>`)
            .join(
              "",
            )}</select></label></div><div class="two"><label>Fix by<input name="dueDate" type="date"></label><label>Photos (up to 5)<input name="photos" type="file" accept=".png,.jpg,.jpeg" multiple></label></div><label>Description<textarea name="description" rows="2" maxlength="3000"></textarea></label><div id="puError" class="form-error" role="alert"></div><button class="btn primary">Add defect</button></form>`
        : '<div id="puError" class="form-error" role="alert"></div>'
    }`,
  );
  const form = document.getElementById("puForm");
  if (form)
    form.onsubmit = async (e) => {
      e.preventDefault();
      const f = new FormData(form);
      try {
        await api(`/projects/${projectId}/tasks/${taskId}/defects`, {
          method: "POST",
          body: {
            title: f.get("title"),
            severity: f.get("severity"),
            dueDate: f.get("dueDate"),
            description: f.get("description"),
            photoUrls: await puFiles(form.photos),
          },
        });
        toast("Defect recorded");
        puRefresh(projectId, taskId);
      } catch (x) {
        document.getElementById("puError").textContent = x.message;
      }
    };
}
async function puStep(projectId, taskId, defectId, action) {
  try {
    await api(`/projects/${projectId}/tasks/${taskId}/defects/${defectId}`, {
      method: "PATCH",
      body: {
        action,
        note: document.getElementById("puNote_" + defectId)?.value || "",
        ...(action === "fixed"
          ? { photoUrls: await puFiles(document.getElementById("puFix_" + defectId)) }
          : {}),
      },
    });
    toast(
      action === "fixed" ? "Marked as fixed" : action === "verified" ? "Fix verified" : "Defect reopened",
    );
    puRefresh(projectId, taskId);
  } catch (x) {
    const box = document.getElementById("puError");
    if (box) box.textContent = x.message;
  }
}
// Redraw the page behind the list so the counters match, then show the list again with fresh data.
async function puRefresh(projectId, taskId) {
  await Promise.resolve(route()).catch(() => {});
  await puOpen(projectId, taskId);
}
