/* Acceptance report (T63): "Accept work" on tasks the supplier handed over, with a checklist, defects, the
   result, a drawn signature, date and place. The signed PDF lands in the project documents. */
const acEsc = (s) =>
  String(s ?? "").replace(
    /[&<>"']/g,
    (c) => ({ "&": "&amp;", "<": "&lt;", ">": "&gt;", '"': "&quot;", "'": "&#39;" })[c],
  );
const AC_RESULTS = {
  accepted: "Work accepted",
  accepted_with_defects: "Accepted with defects",
  rejected: "Not accepted",
};

const acBaseTaskCard = wfTaskCard;
wfTaskCard = function (p, ph, t, sups) {
  const html = acBaseTaskCard(p, ph, t, sups),
    a = t.acceptance,
    handedOver = ["Under Review", "Completed"].includes(t.status) && t.acceptanceStatus === "Accepted",
    canSign =
      state.user?.role === "customer" &&
      handedOver &&
      !["accepted", "accepted_with_defects"].includes(a?.result);
  const strip = a
    ? `<div class="ac-strip ac-${acEsc(a.result)}"><span class="status ${a.result === "rejected" ? "rejected" : "completed"}">${AC_RESULTS[a.result] || ""}</span><small>${acEsc(a.signerName)} · ${date(a.date)}</small>${a.url ? `<a class="btn small outline" href="${acEsc(a.url)}" target="_blank" rel="noopener">Acceptance report</a>` : ""}</div>`
    : "";
  const button = canSign
    ? `<button class="btn small primary" onclick="acOpen('${acEsc(p.id)}','${acEsc(t.id)}')">Accept work</button>`
    : "";
  return html.replace('<div class="wf-task-actions">', `${strip}<div class="wf-task-actions">${button}`);
};

async function acOpen(projectId, taskId) {
  const d = await api(`/projects/${projectId}/tasks/${taskId}/acceptance`),
    today = new Date().toISOString().slice(0, 10);
  modal(
    "Accept work",
    `<form id="acForm" class="modal-form"><fieldset class="cm-fieldset"><legend>Deliverables and documents checked</legend>${
      d.checklist.length
        ? d.checklist
            .map(
              (c, i) =>
                `<label class="cc-check-label"><input type="checkbox" name="check" value="${i}"> ${acEsc(c)}</label>`,
            )
            .join("")
        : '<small class="subtle">No deliverables or documents on this task yet.</small>'
    }</fieldset>${
      d.defects.length
        ? `<fieldset class="cm-fieldset"><legend>Open defects (listed in the report)</legend><ul class="ac-defects">${d.defects.map((x) => `<li>${acEsc(x.title)} <small>${acEsc(x.severity)} · ${acEsc(x.status)}</small></li>`).join("")}</ul></fieldset>`
        : ""
    }<label>Other defects (one per line)<textarea name="defects" rows="3" maxlength="6000" placeholder="e.g. Paint scratch on panel 3"></textarea></label><fieldset class="cm-fieldset"><legend>Result</legend><div class="ac-results">${Object.entries(
      AC_RESULTS,
    )
      .map(
        ([k, label], i) =>
          `<label class="cc-check-label"><input type="radio" name="result" value="${k}" ${i ? "" : "checked"}> ${label}</label>`,
      )
      .join(
        "",
      )}</div></fieldset><label>Note (required when the work is not accepted)<textarea name="note" rows="2" maxlength="3000"></textarea></label><div class="three"><label>Signed by<input name="signerName" required maxlength="120" value="${acEsc(state.user?.name || "")}"></label><label>Date<input name="date" type="date" required value="${today}"></label><label>Place<input name="place" required maxlength="120" placeholder="e.g. Plant Regensburg"></label></div><div class="ac-sign"><span id="acSignLabel">Signature</span><canvas id="acCanvas" width="560" height="180" role="img" aria-labelledby="acSignLabel"></canvas><button type="button" class="btn small outline" onclick="acClearSignature()">Clear signature</button></div><div id="acError" class="form-error" role="alert"></div><button class="btn primary">Sign and save report</button></form>`,
  );
  acSignaturePad(document.getElementById("acCanvas"));
  const form = document.getElementById("acForm");
  form.onsubmit = async (e) => {
    e.preventDefault();
    const f = new FormData(form),
      canvas = document.getElementById("acCanvas"),
      error = document.getElementById("acError");
    if (!canvas.dataset.signed) return (error.textContent = "Sign in the signature box before saving");
    const checked = f.getAll("check").map(Number);
    try {
      await api(`/projects/${projectId}/tasks/${taskId}/acceptance`, {
        method: "POST",
        body: {
          result: f.get("result"),
          note: f.get("note"),
          signerName: f.get("signerName"),
          date: f.get("date"),
          place: f.get("place"),
          signature: canvas.toDataURL("image/png"),
          checklist: d.checklist.map((label, i) => ({ label, done: checked.includes(i) })),
          defects: String(f.get("defects") || "")
            .split("\n")
            .map((x) => x.trim())
            .filter(Boolean),
        },
      });
      closeModal();
      toast(f.get("result") === "rejected" ? "Sent back to the supplier" : "Acceptance report saved");
      route();
    } catch (x) {
      error.textContent = x.message;
    }
  };
}

// Drawing with mouse, pen or finger; the canvas keeps its 560 × 180 pixels whatever size it is shown at.
function acSignaturePad(canvas) {
  const ctx = canvas.getContext("2d");
  ctx.lineWidth = 2.5;
  ctx.lineCap = "round";
  ctx.lineJoin = "round";
  ctx.strokeStyle = "#0d1b32";
  let drawing = false;
  const at = (e) => {
    const r = canvas.getBoundingClientRect();
    return [
      ((e.clientX - r.left) * canvas.width) / r.width,
      ((e.clientY - r.top) * canvas.height) / r.height,
    ];
  };
  canvas.addEventListener("pointerdown", (e) => {
    drawing = true;
    canvas.setPointerCapture(e.pointerId);
    ctx.beginPath();
    ctx.moveTo(...at(e));
  });
  canvas.addEventListener("pointermove", (e) => {
    if (!drawing) return;
    ctx.lineTo(...at(e));
    ctx.stroke();
    canvas.dataset.signed = "1";
  });
  for (const type of ["pointerup", "pointercancel"]) canvas.addEventListener(type, () => (drawing = false));
}
function acClearSignature() {
  const canvas = document.getElementById("acCanvas");
  canvas.getContext("2d").clearRect(0, 0, canvas.width, canvas.height);
  delete canvas.dataset.signed;
}
