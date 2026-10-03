/* Area: work-site dialogs of a task (T131b). Daily site reports (T65), the punch list of defects (T64) and the
   acceptance report with a drawn signature (T63). Drawn with translation keys; reports, defects, names and notes
   are data. The function names (drOpen, puOpen, acOpen) stay because the workspace and the dashboard open them. */
const wsk = (key, params) => esc(t("site." + key, params));
const wsDomText = (text) => `<bdi data-i18n="dom">${esc(text)}</bdi>`;
const wsForm = (id, action, data, html, cls = "modal-form") =>
  `<form id="${id}" class="${cls}" data-action="${action}"${Object.entries(data)
    .map(([k, v]) => ` data-${k}="${esc(v)}"`)
    .join("")}>${html}</form>`;
const wsToday = () => new Date().toISOString().slice(0, 10);

/* ---------- Daily site reports ---------- */
let drData = null; // { base, projectId, taskId, timeEntries } of the open dialog
async function drOpen(projectId, taskId) {
  const base = `/projects/${projectId}/tasks/${taskId}/site-reports`,
    d = await api(base),
    role = state.user?.role,
    ids = { project: projectId, task: taskId },
    k = (key, params) => wsk("dr." + key, params);
  drData = { base, projectId, taskId, timeEntries: d.timeEntries || [] };
  const photos = (urls) => urls.map((u, i) => `<a class="btn small outline" href="${esc(u)}" target="_blank" rel="noopener">${k("photo", { n: i + 1 })}</a>`).join("");
  const item = (r) =>
    `<li class="dr-item"><div class="dr-head"><b>${esc(fmt.date(r.date))}</b>${
      r.acknowledgedAt ? `<span class="status completed">${k("ack")}</span>` : `<span class="status submitted">${k("notAck")}</span>`
    }${r.weather ? `<small>${wsDomText(r.weather)}</small>` : ""}${r.hours ? `<small>${k("hours", { n: r.hours })}</small>` : ""}</div><dl class="dr-facts"><div><dt>${k("team")}</dt><dd>${esc(
      r.workers.map((w) => w.name).join(", ") || "—",
    )}</dd></div><div><dt>${k("workDone")}</dt><dd>${wsDomText(r.workDone)}</dd></div>${r.problems ? `<div><dt>${k("problems")}</dt><dd>${wsDomText(r.problems)}</dd></div>` : ""}</dl><div class="dr-photos">${photos(
      r.photoUrls,
    )}</div>${r.comments.length ? `<ul class="dr-comments">${r.comments.map((c) => `<li><b>${esc(c.authorName)}</b> ${esc(c.text)}</li>`).join("")}</ul>` : ""}<div class="dr-actions"><label class="sr-only" for="drC_${esc(r.id)}">${k(
      "commentLabel",
    )}</label><input id="drC_${esc(r.id)}" maxlength="2000" placeholder="${k("commentHint")}"><button type="button" class="btn small outline" data-action="dr.comment" data-report="${esc(r.id)}">${k("comment")}</button>${
      role === "customer" && !r.acknowledgedAt ? `<button type="button" class="btn small success" data-action="dr.ack" data-report="${esc(r.id)}">${k("acknowledge")}</button>` : ""
    }</div></li>`;
  const first = d.reports.at(-1)?.date || wsToday(),
    last = d.reports[0]?.date || wsToday(),
    error = '<div id="drError" class="form-error" data-i18n="dom" role="alert"></div>';
  modal(
    t("site.dr.title"),
    `<div data-i18n="keys">${
      d.reports.length
        ? wsForm(
            "drExport",
            "dr.pdf",
            ids,
            `<label>${k("from")}<input name="from" type="date" value="${esc(first)}"></label><label>${k("to")}<input name="to" type="date" value="${esc(last)}"></label><button class="btn small outline">${k("pdf")}</button>`,
            "dr-export",
          )
        : ""
    }<ul class="dr-list">${d.reports.map(item).join("") || `<li class="pa-empty">${k("none")}</li>`}</ul>${
      role === "supplier"
        ? wsForm(
            "drForm",
            "dr.save",
            ids,
            `<h3>${k("newTitle")}</h3><div class="two"><label>${k("day")}<input name="date" type="date" required max="${wsToday()}" value="${wsToday()}" data-action="dr.day"></label><label>${k(
              "weather",
            )}<input name="weather" maxlength="120" placeholder="${k("weatherHint")}"></label></div><fieldset class="cm-fieldset"><legend>${k("team")}</legend><div class="cm-checks">${
              d.workers.map((w) => `<label class="cc-check-label"><input type="checkbox" name="worker" value="${esc(w.id)}"> ${esc(w.name)} <small>${wsDomText(w.role || "")}</small></label>`).join("") ||
              `<small class="subtle">${k("addWorkers")}</small>`
            }</div></fieldset><fieldset class="cm-fieldset"><legend>${k("hoursLegend")}</legend><div class="cm-checks" id="drEntries"></div></fieldset><label>${k("workDone")}<textarea name="workDone" rows="3" required maxlength="5000"></textarea></label><label>${k(
              "problems",
            )}<textarea name="problems" rows="2" maxlength="3000"></textarea></label><label>${k("photos")}<input name="photos" type="file" accept=".png,.jpg,.jpeg" multiple></label>${error}<button class="btn primary">${k("save")}</button>`,
            "modal-form dr-form",
          )
        : error
    }</div>`,
  );
  drFillEntries();
}
// Only the chosen day's time entries can be linked
function drFillEntries() {
  const form = document.getElementById("drForm"),
    box = document.getElementById("drEntries");
  if (!form || !box) return;
  const list = drData.timeEntries.filter((x) => x.workDate === form.querySelector('[name="date"]').value);
  box.innerHTML =
    list.map((x) => `<label class="cc-check-label"><input type="checkbox" name="entry" value="${esc(x.id)}" checked> ${wsk("dr.entry", { name: x.employeeName, n: x.hours })}</label>`).join("") ||
    `<small class="subtle">${wsk("dr.noEntries")}</small>`;
}
actions.on("dr.day", drFillEntries);
actions.on("dr.pdf", async (form) => {
  const f = new FormData(form);
  try {
    const res = await fetch(`/api${drData.base}.pdf?from=${encodeURIComponent(f.get("from"))}&to=${encodeURIComponent(f.get("to"))}`, { credentials: "same-origin" });
    if (!res.ok) throw new Error((await res.json().catch(() => ({}))).error || t("site.dr.downloadFailed"));
    const a = document.createElement("a");
    a.href = URL.createObjectURL(await res.blob());
    a.download = `site-reports-${f.get("from")}-${f.get("to")}.pdf`;
    a.click();
    setTimeout(() => URL.revokeObjectURL(a.href), 1000);
  } catch (x) {
    document.getElementById("drError").textContent = x.message;
  }
});
actions.on("dr.save", async (form) => {
  const f = new FormData(form),
    error = document.getElementById("drError");
  try {
    const files = [...form.querySelector('[name="photos"]').files];
    if (files.length > 10) throw new Error(t("site.dr.maxPhotos"));
    const photoUrls = [];
    for (const file of files) photoUrls.push((await uploadFile(file)).url);
    await api(drData.base, {
      method: "POST",
      body: {
        date: f.get("date"),
        weather: f.get("weather"),
        workerIds: f.getAll("worker"),
        timeEntryIds: f.getAll("entry"),
        workDone: f.get("workDone"),
        problems: f.get("problems"),
        photoUrls,
      },
    });
    tToast(t("site.dr.saved"));
    await drOpen(form.dataset.project, form.dataset.task);
  } catch (x) {
    error.textContent = x.message;
  }
});
async function drComment(projectId, taskId, reportId) {
  try {
    await api(`/projects/${projectId}/tasks/${taskId}/site-reports/${reportId}/comments`, { method: "POST", body: { text: document.getElementById("drC_" + reportId).value } });
    await drOpen(projectId, taskId);
  } catch (x) {
    document.getElementById("drError").textContent = x.message;
  }
}
async function drAcknowledge(projectId, taskId, reportId) {
  try {
    await api(`/projects/${projectId}/tasks/${taskId}/site-reports/${reportId}`, { method: "PATCH", body: { action: "acknowledge" } });
    tToast(t("site.dr.acked"));
    await drOpen(projectId, taskId);
  } catch (x) {
    document.getElementById("drError").textContent = x.message;
  }
}
actions.on("dr.comment", (el) => drComment(drData.projectId, drData.taskId, el.dataset.report));
actions.on("dr.ack", (el) => drAcknowledge(drData.projectId, drData.taskId, el.dataset.report));

/* ---------- Punch list ---------- */
const PU_SEVERITIES = ["minor", "major", "critical"];
const puSeverity = (s) => (PU_SEVERITIES.includes(s) ? wsk("pu.severity." + s) : wsDomText(s));
const puStatus = (s) => (["open", "fixed", "verified"].includes(s) ? wsk("pu.status." + s) : wsDomText(s));
let puIds = null; // { projectId, taskId } of the open list
async function puFiles(input) {
  const urls = [];
  for (const file of [...(input?.files || [])].slice(0, 5)) urls.push((await uploadFile(file)).url);
  return urls;
}
async function puOpen(projectId, taskId) {
  const { defects } = await api(`/projects/${projectId}/tasks/${taskId}/defects`),
    role = state.user?.role,
    k = (key, params) => wsk("pu." + key, params),
    photos = (urls, key) => (urls || []).map((u, i) => `<a class="btn small outline" href="${esc(u)}" target="_blank" rel="noopener">${k(key, { n: i + 1 })}</a>`).join(""),
    step = (action, cls, label, d) => `<button type="button" class="btn small ${cls}" data-action="pu.step" data-step="${action}" data-defect="${esc(d.id)}">${k(label)}</button>`;
  puIds = { projectId, taskId };
  const row = (d) => {
    const tools =
      role === "supplier" && d.status === "open"
        ? `<div class="pu-step"><label>${k("fixPhoto")}<input type="file" accept=".png,.jpg,.jpeg" multiple id="puFix_${esc(d.id)}"></label><label>${k("note")}<input id="puNote_${esc(d.id)}" maxlength="1000"></label>${step(
            "fixed",
            "primary",
            "markFixed",
            d,
          )}</div>`
        : role === "customer" && d.status === "fixed"
          ? `<div class="pu-step"><label>${k("noteReopen")}<input id="puNote_${esc(d.id)}" maxlength="1000"></label>${step("verified", "success", "verify", d)}${step("reopen", "outline", "reopen", d)}</div>`
          : "";
    return `<li class="pu-item pu-${esc(d.status)}"><div class="pu-head"><b>${esc(d.title)}</b><span class="status ${d.status === "verified" ? "completed" : d.status === "fixed" ? "submitted" : "rejected"}">${puStatus(
      d.status,
    )}</span><span class="tag">${puSeverity(d.severity)}</span>${d.dueDate ? `<small><span>${k("fixBy")}</span> ${esc(fmt.date(d.dueDate))}</small>` : ""}</div>${d.description ? `<p>${wsDomText(d.description)}</p>` : ""}${
      d.reopenNote && d.status === "open" ? `<p class="pu-note"><b>${k("reopened")}</b> ${wsDomText(d.reopenNote)}</p>` : ""
    }${d.fixNote ? `<p class="pu-note"><b>${k("supplierNote")}</b> ${wsDomText(d.fixNote)}</p>` : ""}<div class="pu-photos">${photos(d.photoUrls, "photo")}${photos(d.fixPhotoUrls, "fixPhotoN")}</div>${tools}</li>`;
  };
  const order = { open: 0, fixed: 1, verified: 2 },
    error = '<div id="puError" class="form-error" data-i18n="dom" role="alert"></div>';
  modal(
    t("site.pu.title"),
    `<div data-i18n="keys"><ul class="pu-list">${[...defects].sort((a, b) => order[a.status] - order[b.status]).map(row).join("") || `<li class="pa-empty">${k("none")}</li>`}</ul>${
      role === "customer"
        ? wsForm(
            "puForm",
            "pu.add",
            {},
            `<h3>${k("record")}</h3><div class="two"><label>${k("name")}<input name="title" required maxlength="160" placeholder="${k("nameHint")}"></label><label>${k("severityLabel")}<select name="severity">${PU_SEVERITIES.map(
              (s) => `<option value="${s}">${k("severity." + s)}</option>`,
            ).join("")}</select></label></div><div class="two"><label>${k("fixBy")}<input name="dueDate" type="date"></label><label>${k("photos")}<input name="photos" type="file" accept=".png,.jpg,.jpeg" multiple></label></div><label>${k(
              "description",
            )}<textarea name="description" rows="2" maxlength="3000"></textarea></label>${error}<button class="btn primary">${k("add")}</button>`,
            "modal-form pu-form",
          )
        : error
    }</div>`,
  );
}
actions.on("pu.add", async (form) => {
  const f = new FormData(form);
  try {
    await api(`/projects/${puIds.projectId}/tasks/${puIds.taskId}/defects`, {
      method: "POST",
      body: { title: f.get("title"), severity: f.get("severity"), dueDate: f.get("dueDate"), description: f.get("description"), photoUrls: await puFiles(form.querySelector('[name="photos"]')) },
    });
    tToast(t("site.pu.recorded"));
    await puRefresh(puIds.projectId, puIds.taskId);
  } catch (x) {
    document.getElementById("puError").textContent = x.message;
  }
});
async function puStep(projectId, taskId, defectId, action) {
  try {
    await api(`/projects/${projectId}/tasks/${taskId}/defects/${defectId}`, {
      method: "PATCH",
      body: {
        action,
        note: document.getElementById("puNote_" + defectId)?.value || "",
        ...(action === "fixed" ? { photoUrls: await puFiles(document.getElementById("puFix_" + defectId)) } : {}),
      },
    });
    tToast(t(action === "fixed" ? "site.pu.fixed" : action === "verified" ? "site.pu.verified" : "site.pu.reopenedToast"));
    await puRefresh(projectId, taskId);
  } catch (x) {
    const box = document.getElementById("puError");
    if (box) box.textContent = x.message;
  }
}
actions.on("pu.step", (el) => puStep(puIds.projectId, puIds.taskId, el.dataset.defect, el.dataset.step));
// Redraw the page behind the list so the counters match, then show the list again with fresh data
async function puRefresh(projectId, taskId) {
  await Promise.resolve(route()).catch(() => {});
  await puOpen(projectId, taskId);
}

/* ---------- Acceptance report ---------- */
const AC_RESULTS = ["accepted", "accepted_with_defects", "rejected"];
let acData = null; // { projectId, taskId, checklist } of the open form
async function acOpen(projectId, taskId) {
  const d = await api(`/projects/${projectId}/tasks/${taskId}/acceptance`),
    k = (key) => wsk("ac." + key);
  acData = { projectId, taskId, checklist: d.checklist };
  modal(
    t("site.ac.title"),
    wsForm(
      "acForm",
      "ac.save",
      {},
      `<fieldset class="cm-fieldset"><legend>${k("checked")}</legend>${
        d.checklist.length
          ? d.checklist.map((c, i) => `<label class="cc-check-label"><input type="checkbox" name="check" value="${i}"> ${wsDomText(c)}</label>`).join("")
          : `<small class="subtle">${k("noChecklist")}</small>`
      }</fieldset>${
        d.defects.length
          ? `<fieldset class="cm-fieldset"><legend>${k("openDefects")}</legend><ul class="ac-defects">${d.defects.map((x) => `<li>${esc(x.title)} <small>${puSeverity(x.severity)} · ${puStatus(x.status)}</small></li>`).join("")}</ul></fieldset>`
          : ""
      }<label>${k("otherDefects")}<textarea name="defects" rows="3" maxlength="6000" placeholder="${k("defectsHint")}"></textarea></label><fieldset class="cm-fieldset"><legend>${k("result")}</legend><div class="ac-results">${AC_RESULTS.map(
        (r, i) => `<label class="cc-check-label"><input type="radio" name="result" value="${r}"${i ? "" : " checked"}> ${k("results." + r)}</label>`,
      ).join("")}</div></fieldset><label>${k("note")}<textarea name="note" rows="2" maxlength="3000"></textarea></label><div class="three"><label>${k("signedBy")}<input name="signerName" required maxlength="120" value="${esc(
        state.user?.name || "",
      )}"></label><label>${k("date")}<input name="date" type="date" required value="${wsToday()}"></label><label>${k("place")}<input name="place" required maxlength="120" placeholder="${k(
        "placeHint",
      )}"></label></div><div class="ac-sign"><span id="acSignLabel">${k("signature")}</span><canvas id="acCanvas" width="560" height="180" role="img" aria-labelledby="acSignLabel"></canvas><button type="button" class="btn small outline" data-action="ac.clear">${k(
        "clear",
      )}</button></div><div id="acError" class="form-error" data-i18n="dom" role="alert"></div><button class="btn primary">${k("sign")}</button>`,
    ).replace("<form ", '<form data-i18n="keys" '),
  );
  const canvas = document.getElementById("acCanvas");
  if (canvas) acSignaturePad(canvas);
}
actions.on("ac.save", async (form) => {
  const f = new FormData(form),
    canvas = document.getElementById("acCanvas"),
    error = document.getElementById("acError");
  if (!canvas.dataset.signed) return (error.textContent = t("site.ac.signFirst"));
  const checked = f.getAll("check").map(Number);
  try {
    await api(`/projects/${acData.projectId}/tasks/${acData.taskId}/acceptance`, {
      method: "POST",
      body: {
        result: f.get("result"),
        note: f.get("note"),
        signerName: f.get("signerName"),
        date: f.get("date"),
        place: f.get("place"),
        signature: canvas.toDataURL("image/png"),
        checklist: acData.checklist.map((label, i) => ({ label, done: checked.includes(i) })),
        defects: String(f.get("defects") || "")
          .split("\n")
          .map((x) => x.trim())
          .filter(Boolean),
      },
    });
    closeModal();
    tToast(t(f.get("result") === "rejected" ? "site.ac.sentBack" : "site.ac.saved"));
    await route();
  } catch (x) {
    error.textContent = x.message;
  }
});
// Drawing with mouse, pen or finger; the canvas keeps its 560 × 180 pixels whatever size it is shown at
function acSignaturePad(canvas) {
  const ctx = canvas.getContext("2d");
  ctx.lineWidth = 2.5;
  ctx.lineCap = "round";
  ctx.lineJoin = "round";
  ctx.strokeStyle = "#0d1b32";
  let drawing = false;
  const at = (e) => {
    const r = canvas.getBoundingClientRect();
    return [((e.clientX - r.left) * canvas.width) / r.width, ((e.clientY - r.top) * canvas.height) / r.height];
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
actions.on("ac.clear", acClearSignature);
