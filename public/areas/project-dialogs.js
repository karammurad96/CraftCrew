/* Area: the dialogs of a project (T128d). Edit, archive or delete a project, escalate, add and edit phases and
   tasks, invite a supplier, withdraw an invitation, report progress, close the project, review the suppliers
   and share the project with a colleague. Drawn with translation keys; forms submit through data-action.
   Status choices carry their English value, so the server gets the same status in every language. After a
   change the current page is drawn again. */
const pdk = (key, params) => esc(t("dlg." + key, params));
const pdForm = (action, data, html, id) =>
  `<form${id ? ` id="${id}"` : ""} class="modal-form" data-i18n="keys" data-action="${action}"${Object.entries(data)
    .map(([k, v]) => ` data-${k}="${esc(v)}"`)
    .join("")}>${html}</form>`;
const pdStatuses = (current) =>
  ["Not Started", "In Progress", "Under Review", "Completed", "On Hold"].map((x) => `<option value="${x}"${x === current ? " selected" : ""}>${pdk("status." + x)}</option>`).join("");
const pdDates = (start, due, dueRequired = true) =>
  `<div class="two"><label>${pdk("start")}<input name="startDate" type="date" value="${esc(start || "")}"></label><label>${pdk(dueRequired ? "dueRequired" : "due")}<input name="dueDate" type="date" value="${esc(due || "")}" required></label></div>`;
const pdOne = (form) => {
  const b = Object.fromEntries(new FormData(form));
  b.dependencies = b.dependency ? [b.dependency] : [];
  delete b.dependency;
  return b;
};
const pdProject = async (pid) => (await api("/projects/" + encodeURIComponent(pid))).project;
const pdDone = async (message) => {
  closeModal();
  if (message) tToast(message);
  await route();
};
// Deleting for good needs the name typed in
async function pdTypeToConfirm({ title, message, name, confirmLabel }) {
  const typed = await uiDialog({ title, message, input: true, required: true, placeholder: name, confirmLabel, danger: true });
  if (typed === null) return false;
  if (typed.trim() === String(name).trim()) return true;
  tToast(t("dlg.remove.mismatch"), "error");
  return false;
}

/* ---------- Project ---------- */
async function pdEditProject(pid) {
  const p = await pdProject(pid),
    e = (key) => pdk("edit." + key);
  modal(
    t("dlg.edit.title"),
    pdForm(
      "pd.editProject",
      { project: pid },
      `<label>${e("name")}<input name="name" value="${esc(p.name)}" required></label><label>${e("description")}<textarea name="description" required>${esc(p.description)}</textarea></label><div class="two"><label>${e("budget")}<input name="budget" type="number" value="${esc(p.budget)}" required></label><label>${pdk("due")}<input name="dueDate" type="date" value="${esc(p.dueDate)}" required></label></div><label>${e("buyerRef")}<input name="buyerReference" maxlength="100" value="${esc(p.buyerReference || "")}" placeholder="${e("buyerRefHint")}"></label><label class="cc-check-label"><input type="checkbox" name="invoicesAfterAcceptance"${p.invoicesAfterAcceptance ? " checked" : ""}> ${e("afterAcceptance")}</label><button class="btn primary">${e("save")}</button>`,
      "editP",
    ),
  );
}
actions.on("pd.editProject", async (form) => {
  const fd = new FormData(form),
    body = Object.fromEntries(fd);
  body.invoicesAfterAcceptance = fd.has("invoicesAfterAcceptance");
  try {
    await api("/projects/" + encodeURIComponent(form.dataset.project), { method: "PUT", body });
    await pdDone(t("dlg.edit.saved"));
  } catch (x) {
    toast(x.message, "error");
  }
});
// Projects with invoices, documents or suppliers are archived (the server keeps the records); others are deleted
async function pdDeleteProject(pid) {
  try {
    const [p, { invoices = [] }, docs] = await Promise.all([pdProject(pid), api("/invoices").catch(() => ({})), api(`/projects/${encodeURIComponent(pid)}/documents`).catch(() => ({}))]);
    const counts = {
      invoices: invoices.filter((i) => i.projectId === pid).length,
      documents: (docs.documents || []).length,
      suppliers: new Set(
        (p.phases || []).flatMap((ph) => [
          ...(ph.supplierId && ph.acceptanceStatus === "Accepted" ? [ph.supplierId] : []),
          ...(ph.tasks || []).filter((x) => x.assignedSupplierId && x.acceptanceStatus === "Accepted").map((x) => x.assignedSupplierId),
        ]),
      ).size,
    };
    const ok =
      counts.invoices || counts.documents || counts.suppliers
        ? await uiConfirm(t("dlg.remove.archiveText", counts), { title: t("dlg.remove.archiveTitle"), confirmLabel: t("dlg.remove.archive"), danger: true })
        : await pdTypeToConfirm({ title: t("dlg.remove.deleteTitle"), message: t("dlg.remove.deleteText", { name: p.name }), name: p.name, confirmLabel: t("dlg.remove.delete") });
    if (!ok) return;
    const r = await api("/projects/" + encodeURIComponent(pid), { method: "DELETE" });
    tToast(t(r.archived ? "dlg.remove.archived" : "dlg.remove.deleted"));
    navigate("/customer/projects");
  } catch (x) {
    toast(x.message, "error");
  }
}
function pdSupport(pid) {
  modal(
    t("dlg.support.title"),
    pdForm(
      "pd.support",
      { project: pid },
      `<label>${pdk("support.type")}<select name="type">${["Support", "Quality", "Schedule", "Payment", "Safety", "Other"].map((x) => `<option value="${x}">${pdk("support.types." + x)}</option>`).join("")}</select></label><label>${pdk("support.description")}<textarea name="description" required minlength="10" maxlength="5000"></textarea></label><button class="btn primary">${pdk("support.submit")}</button>`,
      "sf",
    ),
  );
}
actions.on("pd.support", async (form) => {
  try {
    await api("/disputes", { method: "POST", body: { projectId: form.dataset.project, ...Object.fromEntries(new FormData(form)) } });
  } catch (x) {
    return toast(x.message, "error");
  }
  closeModal();
  tToast(t("dlg.support.opened"));
});
async function pdComplete(pid) {
  if (!(await uiConfirm(t("dlg.complete.confirm")))) return;
  try {
    await api(`/projects/${encodeURIComponent(pid)}/complete`, { method: "POST" });
    tToast(t("dlg.complete.done"));
    await route();
    pdReviewSuppliers(pid);
  } catch (x) {
    toast(x.message, "error");
  }
}
// After the project is closed: rate each supplier that worked on it
async function pdReviewSuppliers(pid) {
  const { suppliers = [] } = await api(`/projects/${encodeURIComponent(pid)}/reviews`);
  const pending = suppliers.filter((s) => !s.review);
  if (!pending.length) return;
  const r = (key) => pdk("review." + key),
    stars = (name, label) =>
      `<label>${label}<select name="${name}" required>${[5, 4, 3, 2, 1].map((n) => `<option value="${n}">${"★".repeat(n)}${"☆".repeat(5 - n)} · ${n}</option>`).join("")}</select></label>`;
  modal(
    t("dlg.review.title"),
    `<p class="subtle" data-i18n="keys">${r("intro")}</p>${pending
      .map((s) =>
        pdForm(
          "pd.review",
          { project: pid, supplier: s.id, company: s.company },
          `<h3>${esc(s.company)}</h3><div class="two">${stars("rating", r("overall"))}${stars("quality", r("quality"))}</div><div class="two">${stars("schedule", r("schedule"))}${stars("communication", r("communication"))}</div><label>${r("comment")}<textarea name="text" rows="2" maxlength="2000" placeholder="${r("commentHint")}"></textarea></label><div class="form-error" data-i18n="dom" role="alert"></div><button class="btn primary">${r("submit")}</button>`,
        ).replace('class="modal-form"', 'class="modal-form pa-review-form"'),
      )
      .join("")}`,
  );
}
actions.on("pd.review", async (form) => {
  try {
    await api("/reviews", { method: "POST", body: { projectId: form.dataset.project, supplierId: form.dataset.supplier, ...Object.fromEntries(new FormData(form)) } });
    form.innerHTML = `<p class="success-text">${pdk("review.saved", { company: form.dataset.company })}</p>`;
    tToast(t("dlg.review.submitted"));
    if (!document.querySelector(".pa-review-form button")) {
      closeModal();
      route();
    }
  } catch (x) {
    form.querySelector(".form-error").textContent = x.message;
  }
});

/* ---------- Phases and tasks ---------- */
async function pdAddPhase(pid) {
  const p = await pdProject(pid),
    f = (key) => pdk("phase." + key);
  modal(
    t("dlg.phase.addTitle"),
    pdForm(
      "pd.addPhase",
      { project: pid },
      `<label>${f("nameRequired")}<input name="name" required></label><label>${f("scope")}<textarea name="description"></textarea></label>${pdDates(p.startDate, p.dueDate)}<label>${f("dependsOn")}<select name="dependency"><option value="">${f("none")}</option>${p.phases.map((x) => `<option value="${esc(x.id)}">${esc(x.name)}</option>`).join("")}</select></label><button class="btn primary">${f("add")}</button>`,
      "wfF",
    ),
  );
}
actions.on("pd.addPhase", async (form) => {
  try {
    await api(`/projects/${encodeURIComponent(form.dataset.project)}/phases`, { method: "POST", body: pdOne(form) });
    await pdDone();
  } catch (x) {
    toast(x.message, "error");
  }
});
async function pdEditPhase(pid, phid) {
  const p = await pdProject(pid),
    ph = p.phases.find((x) => x.id === phid),
    f = (key) => pdk("phase." + key);
  modal(
    t("dlg.phase.editTitle"),
    pdForm(
      "pd.editPhase",
      { project: pid, phase: phid },
      `<label>${f("name")}<input name="name" value="${esc(ph.name)}" required></label><label>${f("scope")}<textarea name="description">${esc(ph.description || "")}</textarea></label>${pdDates(ph.startDate, ph.dueDate, false)}<div class="two"><label>${pdk("statusLabel")}<select name="status">${pdStatuses(ph.status)}</select></label><label>${f("dependsOn")}<select name="dependency"><option value="">${f("none")}</option>${p.phases
        .filter((x) => x.id !== phid)
        .map((x) => `<option value="${esc(x.id)}"${(ph.dependencies || []).includes(x.id) ? " selected" : ""}>${esc(x.name)}</option>`)
        .join("")}</select></label></div><button class="btn primary">${f("save")}</button>`,
      "wfF",
    ),
  );
}
actions.on("pd.editPhase", async (form) => {
  try {
    await api(`/projects/${encodeURIComponent(form.dataset.project)}/phases/${encodeURIComponent(form.dataset.phase)}`, { method: "PUT", body: pdOne(form) });
    await pdDone();
  } catch (x) {
    toast(x.message, "error");
  }
});
async function pdAddTask(pid, phid) {
  const p = await pdProject(pid),
    ph = p.phases.find((x) => x.id === phid),
    f = (key) => pdk("task." + key);
  modal(
    t("dlg.task.addTitle"),
    pdForm(
      "pd.addTask",
      { project: pid, phase: phid },
      `<label>${f("nameRequired")}<input name="name" required></label><label>${f("deliverables")}<textarea name="description" required></textarea></label>${pdDates(ph.startDate || p.startDate, ph.dueDate || p.dueDate)}<div class="two"><label>${f("budget")}<input name="orderAmount" type="number" min="0" step="0.01"></label><label>${f("dependsOn")}<select name="dependency"><option value="">${f("none")}</option>${(ph.tasks || []).map((x) => `<option value="${esc(x.id)}">${esc(x.name)}</option>`).join("")}</select></label></div><button class="btn primary">${f("add")}</button>`,
      "wfF",
    ),
  );
}
actions.on("pd.addTask", async (form) => {
  try {
    await api(`/projects/${encodeURIComponent(form.dataset.project)}/phases/${encodeURIComponent(form.dataset.phase)}/tasks`, { method: "POST", body: pdOne(form) });
    await pdDone();
  } catch (x) {
    toast(x.message, "error");
  }
});
async function pdEditTask(pid, phid, tid) {
  const p = await pdProject(pid),
    ph = p.phases.find((x) => x.id === phid),
    x = ph.tasks.find((y) => y.id === tid),
    f = (key) => pdk("task." + key);
  modal(
    t("dlg.task.editTitle"),
    pdForm(
      "pd.editTask",
      { project: pid, phase: phid, task: tid },
      `<label>${f("name")}<input name="name" value="${esc(x.name)}" required></label><label>${f("scope")}<textarea name="description">${esc(x.description || "")}</textarea></label>${pdDates(x.startDate, x.dueDate, false)}<div class="two"><label>${pdk("statusLabel")}<select name="status">${pdStatuses(x.status)}</select></label><label>${f("progress")}<input name="progress" type="number" min="0" max="100" value="${Number(x.progress) || 0}"></label></div><label>${f("amount")}<input name="orderAmount" type="number" min="0" step="0.01" value="${esc(x.orderAmount || "")}"></label><div class="action-row"><button class="btn primary">${f("save")}</button><button type="button" class="btn danger" data-action="pd.deleteTask" data-project="${esc(pid)}" data-phase="${esc(phid)}" data-task="${esc(tid)}">${f("delete")}</button></div>`,
      "wfF",
    ),
  );
}
actions.on("pd.editTask", async (form) => {
  try {
    await api(`/projects/${encodeURIComponent(form.dataset.project)}/phases/${encodeURIComponent(form.dataset.phase)}/tasks/${encodeURIComponent(form.dataset.task)}`, {
      method: "PATCH",
      body: Object.fromEntries(new FormData(form)),
    });
    await pdDone();
  } catch (x) {
    toast(x.message, "error");
  }
});
// A task with a supplier or invoices cannot be deleted; otherwise its name is typed in to confirm
actions.on("pd.deleteTask", async (el) => {
  const { project: pid, phase: phid, task: tid } = el.dataset;
  try {
    const [p, { invoices = [] }] = await Promise.all([pdProject(pid), api("/invoices").catch(() => ({}))]);
    const x = p.phases.find((y) => y.id === phid)?.tasks?.find((y) => y.id === tid);
    if (!x) return;
    if (x.assignedSupplierId || invoices.some((i) => i.taskId === tid))
      return void (await uiDialog({ title: t("dlg.task.cannotTitle"), message: t("dlg.task.cannotText"), confirmLabel: t("dlg.task.ok") }));
    const ok = await pdTypeToConfirm({ title: t("dlg.task.deleteTitle"), message: t("dlg.task.deleteText", { name: x.name }), name: x.name, confirmLabel: t("dlg.task.delete") });
    if (!ok) return;
    await api(`/projects/${encodeURIComponent(pid)}/phases/${encodeURIComponent(phid)}/tasks/${encodeURIComponent(tid)}`, { method: "DELETE" });
    await pdDone();
  } catch (x) {
    toast(x.message, "error");
  }
});

/* ---------- Suppliers of a task ---------- */
async function pdAssign(pid, tid) {
  const d = await api("/projects/" + encodeURIComponent(pid)),
    a = (key, params) => pdk("assign." + key, params);
  modal(
    t("dlg.assign.title"),
    `<div data-i18n="keys"><p class="modal-intro">${a("intro")}</p><div class="wf-compare">${(d.suppliers || [])
      .map(
        (s) =>
          `<article class="cc-card"><b>${esc(s.company)}</b><p>${s.location ? esc(s.location) : a("locationPending")} · ${esc(ccBadge(s))} · ★ ${fmt.number(s.rating || 0, 1)}</p><p>${(s.services || []).map(esc).join(" · ")}</p><strong>${a("rates", { hourly: fmt.money(s.hourlyRate || 0), project: fmt.money(s.projectRate || 0) })}</strong><button class="btn small primary" data-action="pd.invite" data-project="${esc(pid)}" data-task="${esc(tid)}" data-supplier="${esc(s.id)}">${a("invite")}</button></article>`,
      )
      .join("")}</div></div>`,
  );
}
actions.on("pd.invite", async (el) => {
  try {
    await api(`/projects/${encodeURIComponent(el.dataset.project)}/tasks/${encodeURIComponent(el.dataset.task)}/assign`, { method: "POST", body: { supplierId: el.dataset.supplier } });
    await pdDone(t("dlg.assign.sent"));
  } catch (x) {
    toast(x.message, "error");
  }
});
async function pdWithdraw(pid, tid) {
  if (!(await uiConfirm(t("dlg.withdraw.confirm"), { confirmLabel: t("dlg.withdraw.button") }))) return;
  try {
    await api(`/projects/${encodeURIComponent(pid)}/tasks/${encodeURIComponent(tid)}/withdraw`, { method: "POST" });
    tToast(t("dlg.withdraw.done"));
    await route();
  } catch (x) {
    toast(x.message, "error");
  }
}

/* ---------- Supplier: report progress with a note and a milestone ---------- */
function pdProgress(pid, phid, tid, current) {
  const n = Number(current) || 0,
    g = (key) => pdk("progress." + key),
    status = n >= 100 ? "Completed" : n > 0 ? "In Progress" : "Not Started";
  modal(
    t("dlg.progress.title"),
    pdForm(
      "pd.progress",
      { project: pid, phase: phid, task: tid },
      `<div class="two"><label>${g("percent")}<input name="progress" type="range" min="0" max="100" step="5" value="${n}" data-input="pd.progressValue"><output>${n}%</output></label><label>${g("status")}<select name="status">${["Not Started", "In Progress", "Completed"].map((x) => `<option value="${x}"${x === status ? " selected" : ""}>${pdk("status." + x)}</option>`).join("")}</select></label></div><label>${g("milestone")}<input name="milestone" maxlength="140" placeholder="${g("milestoneHint")}"></label><label>${g("note")}<textarea name="note" rows="3" maxlength="2000" placeholder="${g("noteHint")}"></textarea></label><p class="subtle">${g("hint")}</p><div id="paProgressError" class="form-error" data-i18n="dom"></div><div class="cc-actions"><button class="btn primary">${g("save")}</button><a class="btn outline" href="#/supplier/projects/${esc(encodeURIComponent(pid))}/documents" data-action="pd.close">${g("upload")}</a></div>`,
      "paProgressForm",
    ),
  );
}
actions.on("pd.progressValue", (el) => (el.nextElementSibling.value = el.value + "%"));
actions.on("pd.close", () => closeModal());
actions.on("pd.progress", async (form) => {
  const f = new FormData(form);
  try {
    await api(`/projects/${encodeURIComponent(form.dataset.project)}/phases/${encodeURIComponent(form.dataset.phase)}/tasks/${encodeURIComponent(form.dataset.task)}`, {
      method: "PATCH",
      body: { progress: Number(f.get("progress")), status: f.get("status"), note: f.get("note"), milestone: f.get("milestone") },
    });
    await pdDone(t("dlg.progress.sent"));
  } catch (x) {
    document.getElementById("paProgressError").textContent = x.message;
  }
});

/* ---------- Share a project with a colleague (T110) ----------
   Lists who can see the project; the owner invites by name and email (a new email gets its own customer account
   that sees only the shared projects) and removes access again. */
async function pdShare(pid, note) {
  let d;
  try {
    d = await api(`/projects/${encodeURIComponent(pid)}/participants`);
  } catch (x) {
    return toast(x.message, "error");
  }
  const s = (key, params) => pdk("share." + key, params),
    initials = (name) =>
      String(name || "?")
        .split(/\s+/)
        .map((w) => w[0])
        .join("")
        .slice(0, 2)
        .toUpperCase();
  const row = (u) =>
    `<li class="ds-share-person"><span class="ds-avatar ds-tint-blue">${esc(initials(u.name || u.email))}</span><span class="ds-share-who"><b>${esc(u.name || u.email)}</b><small>${esc(u.email)}</small></span><span class="ds-share-access ds-ui">${s("access." + u.access)}</span>${
      d.canManage && u.access === "project"
        ? `<button type="button" class="btn small outline" data-action="pd.unshare" data-project="${esc(pid)}" data-user="${esc(u.id)}" aria-label="${s("removeLabel", { name: u.name || u.email })}">${s("remove")}</button>`
        : ""
    }</li>`;
  modal(
    t("dlg.share.title"),
    `<div class="ds-share" data-i18n="keys">${
      d.canManage
        ? pdForm(
            "pd.share",
            { project: pid },
            `<p class="subtle">${s("intro")}</p><div class="two"><label>${s("name")}<input name="name" autocomplete="name" maxlength="120"></label><label>${s("email")}<input name="email" type="email" autocomplete="email" required></label></div><div id="dsShareError" class="form-error" data-i18n="dom"></div><div id="dsShareNote" class="notice"${note ? "" : " hidden"}>${esc(note || "")}</div><button class="btn primary">${s("invite")}</button>`,
            "dsShareForm",
          )
        : `<p class="subtle">${s("ownerOnly")}</p>`
    }<h3 class="ds-share-h ds-ui">${s("people")}</h3><ul class="ds-share-list">${d.people.map(row).join("")}</ul></div>`,
  );
}
actions.on("pd.share", async (form) => {
  const f = new FormData(form),
    pid = form.dataset.project;
  try {
    const r = await api(`/projects/${encodeURIComponent(pid)}/participants`, { method: "POST", body: { name: f.get("name"), email: f.get("email") } });
    await pdShare(
      pid,
      r.temporaryPassword
        ? t("dlg.share.password", { name: r.person.name, password: r.temporaryPassword })
        : r.emailed
          ? t("dlg.share.emailed", { email: r.person.email })
          : t("dlg.share.ready", { name: r.person.name }),
    );
  } catch (x) {
    document.getElementById("dsShareError").textContent = x.message;
  }
});
actions.on("pd.unshare", async (el) => {
  if (!(await uiConfirm(t("dlg.share.removeConfirm")))) return;
  try {
    await api(`/projects/${encodeURIComponent(el.dataset.project)}/participants/${encodeURIComponent(el.dataset.user)}`, { method: "DELETE" });
    await pdShare(el.dataset.project);
  } catch (x) {
    toast(x.message, "error");
  }
});
