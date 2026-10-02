/* Daily site reports (T65): suppliers record each day's team, hours, work, problems, weather and photos on a
   task; customers comment and acknowledge. A date range downloads as one PDF. */
const drEsc = (s) =>
  String(s ?? "").replace(
    /[&<>"']/g,
    (c) => ({ "&": "&amp;", "<": "&lt;", ">": "&gt;", '"': "&quot;", "'": "&#39;" })[c],
  );
const drToday = () => new Date().toISOString().slice(0, 10);

async function drOpen(projectId, taskId) {
  const base = `/projects/${projectId}/tasks/${taskId}/site-reports`,
    d = await api(base),
    supplier = state.user?.role === "supplier",
    customer = state.user?.role === "customer";
  const photos = (urls) =>
    urls
      .map(
        (u, i) =>
          `<a class="btn small outline" href="${drEsc(u)}" target="_blank" rel="noopener">📷 Photo ${i + 1}</a>`,
      )
      .join("");
  const item = (r) =>
    `<li class="dr-item"><div class="dr-head"><b>${date(r.date)}</b>${r.acknowledgedAt ? '<span class="status completed">Acknowledged</span>' : '<span class="status submitted">Not acknowledged yet</span>'}${r.weather ? `<small>${drEsc(r.weather)}</small>` : ""}${r.hours ? `<small>${r.hours} h</small>` : ""}</div><dl class="dr-facts"><div><dt>Team on site</dt><dd>${drEsc(r.workers.map((w) => w.name).join(", ") || "—")}</dd></div><div><dt>Work done</dt><dd>${drEsc(r.workDone)}</dd></div>${r.problems ? `<div><dt>Problems or obstructions</dt><dd>${drEsc(r.problems)}</dd></div>` : ""}</dl><div class="dr-photos">${photos(r.photoUrls)}</div>${
      r.comments.length
        ? `<ul class="dr-comments">${r.comments.map((c) => `<li><b>${drEsc(c.authorName)}</b> ${drEsc(c.text)}</li>`).join("")}</ul>`
        : ""
    }<div class="dr-actions"><label class="sr-only" for="drC_${drEsc(r.id)}">Comment</label><input id="drC_${drEsc(r.id)}" maxlength="2000" placeholder="Add a comment"><button type="button" class="btn small outline" onclick="drComment('${drEsc(projectId)}','${drEsc(taskId)}','${drEsc(r.id)}')">Comment</button>${customer && !r.acknowledgedAt ? `<button type="button" class="btn small success" onclick="drAcknowledge('${drEsc(projectId)}','${drEsc(taskId)}','${drEsc(r.id)}')">Acknowledge</button>` : ""}</div></li>`;
  const first = d.reports.at(-1)?.date || drToday(),
    last = d.reports[0]?.date || drToday();
  modal(
    "Daily site reports",
    `${
      d.reports.length
        ? `<form id="drExport" class="dr-export"><label>From<input name="from" type="date" value="${first}"></label><label>To<input name="to" type="date" value="${last}"></label><button class="btn small outline">Download PDF</button></form>`
        : ""
    }<ul class="dr-list">${d.reports.map(item).join("") || '<li class="pa-empty">No site reports yet.</li>'}</ul>${
      supplier
        ? `<form id="drForm" class="modal-form dr-form"><h3>New daily report</h3><div class="two"><label>Day<input name="date" type="date" required max="${drToday()}" value="${drToday()}"></label><label>Weather (optional)<input name="weather" maxlength="120" placeholder="e.g. Dry, 14 °C"></label></div><fieldset class="cm-fieldset"><legend>Team on site</legend><div class="cm-checks">${d.workers.map((w) => `<label class="cc-check-label"><input type="checkbox" name="worker" value="${drEsc(w.id)}"> ${drEsc(w.name)} <small>${drEsc(w.role || "")}</small></label>`).join("") || '<small class="subtle">Add your workers under Compliance first.</small>'}</div></fieldset><fieldset class="cm-fieldset"><legend>Hours (time entries of that day)</legend><div class="cm-checks" id="drEntries"></div></fieldset><label>Work done<textarea name="workDone" rows="3" required maxlength="5000"></textarea></label><label>Problems or obstructions<textarea name="problems" rows="2" maxlength="3000"></textarea></label><label>Photos (up to 10)<input name="photos" type="file" accept=".png,.jpg,.jpeg" multiple></label><div id="drError" class="form-error" role="alert"></div><button class="btn primary">Save report</button></form>`
        : '<div id="drError" class="form-error" role="alert"></div>'
    }`,
  );
  const exportForm = document.getElementById("drExport");
  if (exportForm)
    exportForm.onsubmit = async (e) => {
      e.preventDefault();
      const f = new FormData(exportForm);
      try {
        const res = await fetch(`/api${base}.pdf?from=${f.get("from")}&to=${f.get("to")}`, { credentials: "same-origin" });
        if (!res.ok) throw new Error((await res.json().catch(() => ({}))).error || "Download failed");
        const a = document.createElement("a");
        a.href = URL.createObjectURL(await res.blob());
        a.download = `site-reports-${f.get("from")}-${f.get("to")}.pdf`;
        a.click();
        setTimeout(() => URL.revokeObjectURL(a.href), 1000);
      } catch (x) {
        document.getElementById("drError").textContent = x.message;
      }
    };
  const form = document.getElementById("drForm");
  if (!form) return;
  // Only the chosen day's time entries can be linked.
  const fillEntries = () => {
    const day = form.date.value,
      list = d.timeEntries.filter((t) => t.workDate === day);
    document.getElementById("drEntries").innerHTML =
      list
        .map(
          (t) =>
            `<label class="cc-check-label"><input type="checkbox" name="entry" value="${drEsc(t.id)}" checked> ${drEsc(t.employeeName)} · ${t.hours} h</label>`,
        )
        .join("") || '<small class="subtle">No time entries for this day.</small>';
  };
  form.date.onchange = fillEntries;
  fillEntries();
  form.onsubmit = async (e) => {
    e.preventDefault();
    const f = new FormData(form),
      error = document.getElementById("drError");
    try {
      const files = [...form.photos.files];
      if (files.length > 10) throw new Error("Attach up to 10 photos");
      const photoUrls = [];
      for (const file of files) photoUrls.push((await uploadFile(file)).url);
      await api(base, {
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
      toast("Site report saved");
      drOpen(projectId, taskId);
    } catch (x) {
      error.textContent = x.message;
    }
  };
}
async function drComment(projectId, taskId, reportId) {
  const input = document.getElementById("drC_" + reportId);
  try {
    await api(`/projects/${projectId}/tasks/${taskId}/site-reports/${reportId}/comments`, {
      method: "POST",
      body: { text: input.value },
    });
    drOpen(projectId, taskId);
  } catch (x) {
    document.getElementById("drError").textContent = x.message;
  }
}
async function drAcknowledge(projectId, taskId, reportId) {
  try {
    await api(`/projects/${projectId}/tasks/${taskId}/site-reports/${reportId}`, {
      method: "PATCH",
      body: { action: "acknowledge" },
    });
    toast("Site report acknowledged");
    drOpen(projectId, taskId);
  } catch (x) {
    document.getElementById("drError").textContent = x.message;
  }
}
