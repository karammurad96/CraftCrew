/* Area: team planner (T135c). The supplier's people × days calendar with job assignments, absences and site
   visits. Click an empty day to plan, click a bar to edit, drag a bar to move it to another day or person. Drawn
   with translation keys; names, jobs, titles and notes are data. */
const plk = (key, params) => esc(t("pl." + key, params));
const plDom = (text) => `<bdi>${esc(text)}</bdi>`;
const PL_DAY = 86400000;
const plIso = (d) => new Date(d.getTime() - d.getTimezoneOffset() * 60000).toISOString().slice(0, 10);
const plParse = (s) => {
  const [y, m, d] = s.split("-").map(Number);
  return new Date(y, m - 1, d);
};
const plAdd = (s, n) => plIso(new Date(plParse(s).getTime() + n * PL_DAY + 3600000));
const plDiff = (a, b) => Math.round((plParse(b) - plParse(a)) / PL_DAY);
const plMonday = (s) => plAdd(s, -((plParse(s).getDay() + 6) % 7));
const PL_SPANS = { week: 7, twoweeks: 14, month: 28 };
const PL_TYPES = ["assignment", "visit", "vacation", "sick", "training", "other"];
const plType = (k, label) => (PL_TYPES.includes(k) ? t("pl.type." + k) : label || k);
let pl = { start: plMonday(plIso(new Date())), span: "twoweeks", data: null };
try {
  const saved = localStorage.getItem("cc_pl_span");
  if (PL_SPANS[saved]) pl.span = saved;
} catch {}

Object.assign(UI_ICON_PATHS, { calendar: '<rect x="3" y="5" width="18" height="16" rx="2"/><path d="M3 10h18M8 3v4M16 3v4"/>' });
UI_NAV_ICONS.planning = "calendar";

async function plPage() {
  const days = PL_SPANS[pl.span],
    end = plAdd(pl.start, days - 1);
  pl.data = await api(`/planning?from=${pl.start}&to=${end}`);
  const { people, entries, visits, jobs } = pl.data,
    today = plIso(new Date()),
    all = [...entries, ...visits],
    dates = Array.from({ length: days }, (_, i) => plAdd(pl.start, i)),
    on = (e, d) => e.start <= d && e.end >= d,
    workdays = dates.filter((d) => ![0, 6].includes(plParse(d).getDay())),
    absentToday = people.filter((p) => entries.some((e) => e.personId === p.id && ["vacation", "sick", "training"].includes(e.type) && on(e, today))).length,
    bookedToday = people.filter((p) => all.some((e) => e.personId === p.id && ["assignment", "visit"].includes(e.type) && on(e, today))).length,
    planned = new Set(entries.filter((e) => e.type === "assignment").map((e) => e.taskId)),
    unplanned = jobs.filter((j) => !planned.has(j.taskId)),
    conflicts = entries.filter((e) => e.conflict).length,
    monthName = (d) => plParse(d).toLocaleDateString(fmt.locale(), { month: "long", year: "numeric" }),
    title = monthName(pl.start) === monthName(end) ? monthName(pl.start) : `${monthName(pl.start)} – ${monthName(end)}`;
  const util = (p) => {
    const booked = workdays.filter((d) => all.some((e) => e.personId === p.id && ["assignment", "visit"].includes(e.type) && on(e, d))).length;
    return workdays.length ? Math.round((booked / workdays.length) * 100) : 0;
  };
  // Stack overlapping bars of one person into lanes.
  const lanesFor = (pid) => {
    const items = all.filter((e) => e.personId === pid && e.end >= pl.start && e.start <= end).sort((a, b) => a.start.localeCompare(b.start) || b.end.localeCompare(a.end)),
      lanes = [];
    for (const e of items) {
      let i = lanes.findIndex((l) => l.every((x) => x.end < e.start || x.start > e.end));
      if (i < 0) i = lanes.push([]) - 1;
      lanes[i].push(e);
      e.lane = i;
    }
    return { items, count: Math.max(1, lanes.length) };
  };
  const bar = (e) => {
    const s = Math.max(0, plDiff(pl.start, e.start)),
      f = Math.min(days - 1, plDiff(pl.start, e.end)),
      when = esc(fmt.date(e.start)) + (e.end !== e.start ? " – " + esc(fmt.date(e.end)) : "");
    return `<div class="pl-bar pl-${esc(e.type)} ${e.conflict ? "conflict" : ""} ${e.readOnly ? "ro" : ""}" style="grid-column:${s + 1} / ${f + 2};grid-row:${e.lane + 1}" ${
      e.readOnly ? 'data-action="pl.visit"' : `draggable="true" data-entry="${esc(e.id)}" data-action="pl.edit"`
    } title="${esc(plType(e.type, e.typeLabel))}: ${esc(e.title)} (${when})${e.conflict ? " — " + plk("overlaps") : ""}${e.note ? "\n" + esc(e.note) : ""}"><span>${e.conflict ? "⚠ " : ""}${esc(e.title)}</span></div>`;
  };
  const rows = people
    .map((p) => {
      const { items, count } = lanesFor(p.id),
        u = util(p);
      return `<div class="pl-row" style="--lanes:${count}"><div class="pl-person"><span class="pl-avatar pl-${esc(p.kind)}">${esc(
        p.name
          .split(" ")
          .map((x) => x[0])
          .join("")
          .slice(0, 2),
      )}</span><div><b>${esc(p.name)}</b><small>${plDom(p.role)}</small></div><span class="pl-util ${u > 90 ? "high" : u < 30 ? "low" : ""}" title="${plk("utilTip", { n: u })}">${u}%</span></div><div class="pl-track" data-person="${esc(
        p.id,
      )}" style="grid-template-columns:repeat(${days},minmax(0,1fr));grid-template-rows:repeat(${count},26px)">${dates
        .map(
          (d, i) =>
            `<div class="pl-cell ${[0, 6].includes(plParse(d).getDay()) ? "weekend" : ""} ${d === today ? "today" : ""}" style="grid-column:${i + 1};grid-row:1 / -1" data-date="${d}" data-person="${esc(p.id)}" data-action="pl.new"></div>`,
        )
        .join("")}${items.map(bar).join("")}</div></div>`;
    })
    .join("");
  const head = dates
    .map((d) => {
      const dt = plParse(d);
      return `<div class="pl-day ${[0, 6].includes(dt.getDay()) ? "weekend" : ""} ${d === today ? "today" : ""}"><small>${esc(dt.toLocaleDateString(fmt.locale(), { weekday: "short" }))}</small><b>${dt.getDate()}</b></div>`;
    })
    .join("");
  const kpi = (label, value, sub, tone) => inKpi(plk(label), value, sub, tone);
  const job = (j) => {
    const n = new Set(entries.filter((e) => e.taskId === j.taskId).map((e) => e.personId)).size;
    return `<div class="pa-row pl-job"><span><b>${esc(j.taskName)}</b><small>${esc(j.projectName)} · ${plDom(j.phaseName)}${j.startDate ? ` · ${esc(fmt.date(j.startDate))} – ${esc(fmt.date(j.dueDate))}` : ""}</small></span><span class="status ${
      n ? "completed" : "pending"
    }">${n ? esc(t.plural("pl.planned", n)) : plk("nobody")}</span><button class="btn small ${n ? "outline" : "primary"}" data-action="pl.planJob" data-task="${esc(j.taskId)}">${plk("planPeople")}</button></div>`;
  };
  app.innerHTML = dashboardShell(
    "supplier",
    "planning",
    [
      `<div class="dash-top"><div><div class="eyebrow">${plk("eyebrow")}</div><h1>${plk("title")}</h1><p>${plk("lead")}</p></div><div class="cc-actions"><button class="btn outline" data-action="pl.planJob">${plk(
        "planJob",
      )}</button><button class="btn primary" data-action="pl.new">${plk("newEntry")}</button></div></div>`,
      `<div class="in-kpis">${kpi("kpi.team", people.length, esc(t.plural("pl.kpi.workers", people.filter((p) => p.kind === "worker").length)))}${kpi("kpi.working", bookedToday, plk("kpi.workingSub"))}${kpi(
        "kpi.absent",
        absentToday,
        plk("kpi.absentSub"),
        absentToday ? "warn" : "",
      )}${kpi("kpi.unstaffed", unplanned.length, esc(t.plural("pl.kpi.double", conflicts)), unplanned.length || conflicts ? "warn" : "good")}</div>`,
      `<section class="panel pl-panel"><div class="pl-toolbar"><div class="pl-nav"><button class="btn small outline" data-action="pl.shift" data-dir="-1" title="${plk("prev")}">‹</button><button class="btn small outline" data-action="pl.today">${plk(
        "today",
      )}</button><button class="btn small outline" data-action="pl.shift" data-dir="1" title="${plk("next")}">›</button><h3>${esc(title)}</h3></div><div class="pl-legend">${PL_TYPES.map((k) => `<span><i class="pl-${k}"></i>${plk("legend." + k)}</span>`).join(
        "",
      )}</div><div class="xp-views pl-spans">${Object.keys(PL_SPANS)
        .map((k) => `<button type="button" class="${pl.span === k ? "on" : ""}" data-action="pl.span" data-span="${k}">${plk("span." + k)}</button>`)
        .join("")}</div></div>${
        people.length
          ? `<div class="pl-scroll"><div class="pl-grid" style="--days:${days}"><div class="pl-row pl-head"><div class="pl-person"><b>${esc(t.plural("pl.people", people.length))}</b></div><div class="pl-track" style="grid-template-columns:repeat(${days},minmax(0,1fr))">${head}</div></div>${rows}</div></div>`
          : `<div class="cm-empty">${uiIcon("users", "ui-icon cm-empty-icon")}<h3>${plk("emptyTitle")}</h3><p>${plk("emptyText")}</p><div class="cc-actions"><a class="btn outline" href="#/supplier/team">${plk("inviteTeam")}</a><a class="btn primary" href="#/supplier/compliance">${plk(
              "registerWorkers",
            )}</a></div></div>`
      }</section>`,
      `<section class="panel"><div class="panel-title"><h3>${plk("jobs")}</h3><span class="ui-count">${jobs.length}</span></div>${jobs.map(job).join("") || `<p class="pa-empty">${plk("noJobs")}</p>`}</section>`,
    ]
      .join(""),
  );
  plBindDrag();
}
actions.on("pl.shift", (el) => {
  pl.start = plAdd(pl.start, Number(el.dataset.dir) * (pl.span === "week" ? 7 : 14));
  plPage();
});
actions.on("pl.today", () => {
  pl.start = plMonday(plIso(new Date()));
  plPage();
});
actions.on("pl.span", (el) => {
  pl.span = el.dataset.span;
  try {
    localStorage.setItem("cc_pl_span", pl.span);
  } catch {}
  plPage();
});
actions.on("pl.visit", () => tToast(t("pl.visitHint")));

/* ---------- Entry dialog ---------- */
let plEditing = null; // the entry being edited, or null for a new one
function plForm(e) {
  const { people, jobs, types } = pl.data,
    f = (key) => plk("form." + key);
  plEditing = e.id ? e : null;
  modal(
    t(e.id ? "pl.form.editTitle" : "pl.form.newTitle"),
    `<form id="plForm" class="modal-form" data-action="pl.save"><div class="two"><label>${f("person")}<select name="personId" required>${people
      .map((p) => `<option value="${esc(p.id)}" ${e.personId === p.id ? "selected" : ""}>${esc(p.name)} · ${esc(p.role)}</option>`)
      .join("")}</select></label><label>${f("type")}<select name="type" data-action="pl.type">${Object.entries(types)
      .map(([k, l]) => `<option value="${esc(k)}" ${e.type === k ? "selected" : ""}>${esc(plType(k, l))}</option>`)
      .join("")}</select></label></div><label class="pl-job-field">${f("job")}<select name="taskId" data-action="pl.job"><option value="">${f("chooseJob")}</option>${jobs
      .map((j) => `<option value="${esc(j.taskId)}" data-start="${esc(j.startDate || "")}" data-end="${esc(j.dueDate || "")}" ${e.taskId === j.taskId ? "selected" : ""}>${esc(j.projectName)} · ${esc(j.taskName)}</option>`)
      .join("")}</select></label><label class="pl-title-field">${f("title")}<input name="title" value="${esc(e.type === "assignment" ? "" : e.title || "")}" placeholder="${f("titleHint")}"></label><div class="two"><label>${f(
      "from",
    )}<input name="start" type="date" value="${esc(e.start || "")}" required data-action="pl.start"></label><label>${f("to")}<input name="end" type="date" value="${esc(e.end || e.start || "")}" required></label></div><label>${f(
      "note",
    )} <small class="subtle">${f("optional")}</small><textarea name="note" rows="2">${esc(e.note || "")}</textarea></label><div id="plError" class="form-error"></div><div class="cc-actions">${
      e.id ? `<button type="button" class="btn outline danger-text" data-action="pl.delete">${f("delete")}</button>` : ""
    }<button class="btn primary">${f("save")}</button></div></form>`,
  );
  plSyncType();
}
// A job entry needs a task; other entries a title
function plSyncType() {
  const form = document.getElementById("plForm");
  if (!form) return;
  const job = form.type.value === "assignment";
  form.querySelector(".pl-job-field").hidden = !job;
  form.querySelector(".pl-title-field").hidden = job;
  form.taskId.required = job;
}
actions.on("pl.type", () => plSyncType());
actions.on("pl.job", (select) => {
  const form = select.form,
    o = select.selectedOptions[0];
  if (o?.dataset.start && !form.start.value) {
    form.start.value = o.dataset.start;
    form.end.value = o.dataset.end || o.dataset.start;
  }
});
actions.on("pl.start", (input) => {
  const form = input.form;
  if (!form.end.value || form.end.value < form.start.value) form.end.value = form.start.value;
});
actions.on("pl.new", (el) => {
  if (!pl.data?.people.length) return tToast(t("pl.addPeople"), "error");
  const day = el.dataset.date || "";
  plForm({ personId: el.dataset.person || "", start: day, end: day, type: pl.data.jobs.length ? "assignment" : "vacation" });
});
actions.on("pl.edit", (el) => {
  const e = pl.data.entries.find((x) => x.id === el.dataset.entry);
  if (e) plForm(e);
});
actions.on("pl.save", async (form) => {
  const b = Object.fromEntries(new FormData(form));
  try {
    const r = plEditing ? await api("/planning/" + encodeURIComponent(plEditing.id), { method: "PATCH", body: b }) : await api("/planning", { method: "POST", body: b });
    closeModal();
    if (r?.conflicts?.length) tToast(t("pl.savedOverlap", { titles: r.conflicts.map((c) => c.title).join(", ") }), "error");
    else tToast(t("pl.saved"));
    plPage();
  } catch (x) {
    document.getElementById("plError").textContent = x.message;
  }
});
actions.on("pl.delete", async () => {
  if (!plEditing || !(await uiConfirm(t("pl.deleteConfirm"), { confirmLabel: t("pl.form.delete") }))) return;
  try {
    await api("/planning/" + encodeURIComponent(plEditing.id), { method: "DELETE" });
    closeModal();
    tToast(t("pl.deleted"));
    plPage();
  } catch (x) {
    toast(x.message, "error");
  }
});

/* ---------- Staff a job: several people at once for the task's dates ---------- */
function plPlanJob(taskId = "") {
  const { people, jobs } = pl.data;
  if (!jobs.length) return tToast(t("pl.noOpenJobs"), "error");
  const job = jobs.find((j) => j.taskId === taskId) || jobs[0],
    planned = new Set(pl.data.entries.filter((e) => e.taskId === job.taskId).map((e) => e.personId)),
    f = (key) => plk("jobForm." + key);
  modal(
    t("pl.jobForm.title"),
    `<form id="plJobForm" class="modal-form" data-action="pl.saveJob"><label>${f("job")}<select name="taskId" data-action="pl.switchJob">${jobs
      .map((j) => `<option value="${esc(j.taskId)}" ${j.taskId === job.taskId ? "selected" : ""}>${esc(j.projectName)} · ${esc(j.taskName)}</option>`)
      .join("")}</select></label><div class="two"><label>${f("from")}<input name="start" type="date" value="${esc(job.startDate || plIso(new Date()))}" required></label><label>${f("to")}<input name="end" type="date" value="${esc(
      job.dueDate || job.startDate || plIso(new Date()),
    )}" required></label></div><fieldset class="cm-fieldset"><legend>${f("people")}</legend><div class="cm-checks">${people
      .map(
        (p) =>
          `<label class="cc-check-label"><input type="checkbox" name="people" value="${esc(p.id)}" ${planned.has(p.id) ? "checked disabled" : ""}> ${esc(p.name)} <small class="subtle">${plDom(p.role)}${
            planned.has(p.id) ? " · " + f("already") : ""
          }</small></label>`,
      )
      .join("")}</div></fieldset><div id="plJobError" class="form-error"></div><button class="btn primary">${f("save")}</button></form>`,
  );
}
actions.on("pl.planJob", (el) => plPlanJob(el.dataset.task || ""));
actions.on("pl.switchJob", (select) => {
  closeModal();
  plPlanJob(select.value);
});
actions.on("pl.saveJob", async (form) => {
  const f = new FormData(form),
    ids = f.getAll("people");
  if (!ids.length) return (document.getElementById("plJobError").textContent = t("pl.jobForm.choose"));
  try {
    let clashes = 0;
    for (const personId of ids) {
      const r = await api("/planning", { method: "POST", body: { personId, type: "assignment", taskId: f.get("taskId"), start: f.get("start"), end: f.get("end") } });
      clashes += r.conflicts.length ? 1 : 0;
    }
    closeModal();
    if (clashes) tToast(t("pl.jobForm.clashes", { n: ids.length, clashes }), "error");
    else tToast(t.plural("pl.jobForm.done", ids.length));
    plPage();
  } catch (x) {
    document.getElementById("plJobError").textContent = x.message;
  }
});

/* ---------- Drag a bar to another day or person ---------- */
function plBindDrag() {
  let drag = null;
  document.querySelectorAll(".pl-bar[data-entry]").forEach((b) => {
    b.addEventListener("dragstart", (ev) => {
      const e = pl.data.entries.find((x) => x.id === b.dataset.entry),
        r = b.parentElement.getBoundingClientRect(),
        grabDay = Math.floor((ev.clientX - r.left) / (r.width / PL_SPANS[pl.span]));
      drag = { e, offset: grabDay - Math.max(0, plDiff(pl.start, e.start)) };
      ev.dataTransfer.effectAllowed = "move";
      ev.dataTransfer.setData("text/plain", e.id);
      b.classList.add("dragging");
    });
    b.addEventListener("dragend", () => {
      b.classList.remove("dragging");
      document.querySelectorAll(".pl-cell.drop").forEach((c) => c.classList.remove("drop"));
    });
  });
  document.querySelectorAll(".pl-track[data-person]").forEach((track) => {
    const cellAt = (ev) => {
      const r = track.getBoundingClientRect(),
        days = PL_SPANS[pl.span];
      return Math.max(0, Math.min(days - 1, Math.floor((ev.clientX - r.left) / (r.width / days))));
    };
    track.addEventListener("dragover", (ev) => {
      if (!drag) return;
      ev.preventDefault();
      track.querySelectorAll(".pl-cell").forEach((c, i) => c.classList.toggle("drop", i === cellAt(ev)));
    });
    track.addEventListener("dragleave", () => track.querySelectorAll(".pl-cell.drop").forEach((c) => c.classList.remove("drop")));
    track.addEventListener("drop", async (ev) => {
      if (!drag) return;
      ev.preventDefault();
      const { e, offset } = drag;
      drag = null;
      const len = plDiff(e.start, e.end),
        start = plAdd(pl.start, cellAt(ev) - offset),
        personId = track.dataset.person;
      if (start === e.start && personId === e.personId) return;
      try {
        const r = await api("/planning/" + encodeURIComponent(e.id), { method: "PATCH", body: { start, end: plAdd(start, len), personId } });
        tToast(t(r.conflicts.length ? "pl.movedOverlap" : "pl.moved"), r.conflicts.length ? "error" : undefined);
        plPage();
      } catch (x) {
        toast(x.message, "error");
        plPage();
      }
    });
  });
}

/* Workspace pages belong to one role: a supplier opening a customer link lands on their own dashboard. */
const plBaseRoute = window.route;
window.route = async function () {
  const parts = location.hash.replace(/^#/, "").split("?")[0].split("/").filter(Boolean);
  if (state.user && ["customer", "supplier", "admin"].includes(parts[0]) && parts[0] !== state.user.role) return navigate(`/${state.user.role}/dashboard`);
  return plBaseRoute();
};
routes.add("/supplier/planning", plPage);
