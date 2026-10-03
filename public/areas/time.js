/* Area: time (T131a). The time pages of customers (approvals) and suppliers (team log) with filters, photos and the
   Excel/PDF export of the filtered rows; the "Log time" sheet (board PhoneLogTime, T103) with photos (T106) that
   are queued with the entry when there is no signal; editing a pending entry; approve / request changes / reject.
   Drawn with translation keys; names, projects and notes are data. The function names stay because the
   dashboard and the approvals page still call them. */
const tmk = (key, params) => esc(t("time." + key, params));
const tmDom = (text) => `<bdi>${esc(text)}</bdi>`;
const TM_STATUSES = ["Pending approval", "Approved", "Changes requested", "Rejected"];
const tmStatus = (s) => (TM_STATUSES.includes(s) ? tmk("statuses." + s) : tmDom(s));
let tmData = { role: "customer", entries: [], tasks: [], filtered: [] };

/* ---------- Page ---------- */
// A function declaration, so the approvals page can swap it for a moment (dsApprovalDo)
async function ccTimePage(role) {
  const [projects, profile, d] = await Promise.all([ccProjects(), api("/profile"), api("/time-entries")]),
    entries = d.entries || [],
    supplier = profile.supplier || {},
    tasks = [];
  for (const p of projects)
    for (const ph of p.phases || [])
      for (const x of ph.tasks || []) if (role === "customer" || (x.assignedSupplierId === supplier.id && x.acceptanceStatus === "Accepted")) tasks.push({ p, ph, t: x });
  tmData = { role, entries, tasks, filtered: entries };
  const approved = entries.filter((x) => x.status === "Approved"),
    f = (key) => tmk("f." + key),
    opts = (values, all) => `<option value="">${f(all)}</option>${[...new Set(values.filter(Boolean))].sort((a, b) => String(a).localeCompare(String(b))).map((v) => `<option value="${esc(v)}">${esc(v)}</option>`).join("")}`,
    company = (x) => (role === "customer" ? x.supplierCompany : x.customerCompany);
  const filters = `<form class="ff-time-filters" id="ffTimeFilters" data-action="time.filter"><label>${f("person")}<input name="person" placeholder="${f("personHint")}"></label><label>${f("company")}<select name="company">${opts(
    entries.map(company),
    "allCompanies",
  )}</select></label><label>${f("project")}<select name="project">${opts(entries.map((x) => x.projectName), "allProjects")}</select></label><label>${f("phase")}<select name="phase">${opts(
    entries.map((x) => x.phaseName),
    "allPhases",
  )}</select></label><label>${f("task")}<select name="task">${opts(entries.map((x) => x.taskName), "allTasks")}</select></label><label>${f("status")}<select name="status"><option value="">${f("allStatuses")}</option>${[
    ...new Set(entries.map((x) => x.status)),
  ]
    .sort()
    .map((s) => `<option value="${esc(s)}">${TM_STATUSES.includes(s) ? tmk("statuses." + s) : esc(s)}</option>`)
    .join("")}</select></label><label>${f("from")}<input type="date" name="from"></label><label>${f("to")}<input type="date" name="to"></label><div class="ff-filter-actions"><button class="btn primary small">${f(
    "apply",
  )}</button><button class="btn outline small" type="reset" data-action="time.reset">${f("reset")}</button></div></form>`;
  const card = (label, value) => `<div class="cc-card"><span class="cc-label">${tmk(label)}</span><b>${value}</b></div>`;
  app.innerHTML = dashboardShell(
    role,
    "time",
    [
      `<div class="dash-top ff-time-head"><div><div class="eyebrow">${tmk("eyebrow")}</div><h1>${tmk(role === "supplier" ? "titleSupplier" : "titleCustomer")}</h1><p>${tmk("intro")}</p></div><div class="ff-time-actions">${
        role === "supplier" ? `<button class="btn primary" data-action="time.log">${tmk("log")}</button>` : ""
      }<button class="btn outline" data-action="time.export" data-kind="xlsx">${tmk("excel")}</button><button class="btn outline" data-action="time.export" data-kind="pdf">${tmk("pdf")}</button></div></div>`,
      `<div class="wf-stat-grid">${card("entries", entries.length)}${card("awaiting", entries.filter((x) => x.status === "Pending approval").length)}${card(
        "approvedHours",
        tmk("hours", { n: approved.reduce((a, x) => a + Number(x.hours || 0), 0).toFixed(1) }),
      )}${card("approvedValue", esc(fmt.money(approved.reduce((a, x) => a + Number(x.amount || 0), 0))))}</div>`,
      `<section class="panel ff-time-panel"><div class="panel-title"><div><h3>${tmk(role === "supplier" ? "panelSupplier" : "panelCustomer")}</h3><small>${tmk("panelHint")}</small></div></div>${filters}<div class="cc-table-wrap"><table class="cc-table ff-time-table"><thead><tr>${[
        "date",
        "person",
        "work",
        "site",
        "hours",
        "approval",
        "actions",
      ]
        .map((k) => `<th>${tmk("col." + k)}</th>`)
        .join("")}</tr></thead><tbody id="ffTimeRows"></tbody></table></div></section>`,
    ]
      .join(""),
  );
  ccTimeFilter();
}
// Thumbnails of the photos; the files need the session, so they are fetched and shown as blobs
async function dsFillThumbs(root) {
  for (const img of root.querySelectorAll("img[data-ds-src]:not([src])")) {
    try {
      const r = await fetch(img.dataset.dsSrc, { credentials: "same-origin" });
      if (r.ok) img.src = URL.createObjectURL(await r.blob());
    } catch {}
  }
}
function dsTimeThumbs(urls) {
  return urls?.length ? `<div class="ds-thumbs">${urls.map((u, i) => `<a href="${esc(u)}" aria-label="${tmk("photo", { n: i + 1 })}"><img data-ds-src="${esc(u)}" alt=""></a>`).join("")}</div>` : "";
}
function ccTimeFilter() {
  const form = document.getElementById("ffTimeFilters"),
    body = document.getElementById("ffTimeRows");
  if (!form || !body) return;
  const f = Object.fromEntries(new FormData(form).entries()),
    { role, entries, tasks } = tmData,
    company = (x) => (role === "customer" ? x.supplierCompany : x.customerCompany);
  const data = entries.filter(
    (x) =>
      (!f.person || x.employeeName.toLowerCase().includes(f.person.toLowerCase())) &&
      (!f.company || company(x) === f.company) &&
      (!f.project || x.projectName === f.project) &&
      (!f.phase || x.phaseName === f.phase) &&
      (!f.task || x.taskName === f.task) &&
      (!f.status || x.status === f.status) &&
      (!f.from || x.workDate >= f.from) &&
      (!f.to || x.workDate <= f.to),
  );
  tmData.filtered = data;
  const btn = (status, cls, label, e) => `<button class="btn small ${cls}" data-action="time.review" data-id="${esc(e.id)}" data-status="${status}">${tmk(label)}</button>`;
  body.innerHTML =
    data
      .map((e) => {
        const est = Number(tasks.find((x) => x.t.id === e.taskId)?.t.estimatedHours || 0),
          hrs = entries.filter((x) => x.taskId === e.taskId && x.status === "Approved").reduce((n, x) => n + Number(x.hours || 0), 0),
          tone = e.status === "Approved" ? "completed" : e.status === "Pending approval" ? "submitted" : e.status === "Rejected" ? "rejected" : "active";
        return `<tr data-time-status="${esc(e.status)}"><td><b>${esc(fmt.date(e.workDate))}</b><small>${esc(e.startTime || "—")} – ${esc(e.endTime || "—")}</small></td><td><b>${esc(e.employeeName)}</b><small>${esc(
          e.supplierCompany || e.customerCompany || "",
        )}</small></td><td><b>${tmDom(e.projectName)}</b><small>${tmDom(e.phaseName)} · ${tmDom(e.taskName)}</small></td><td>${tmDom(e.location || e.projectLocation || "—")}<small>${tmDom(e.description || "")}</small>${dsTimeThumbs(
          e.photoUrls,
        )}</td><td>${tmk("hoursLine", { hours: Number(e.hours).toFixed(2), amount: fmt.money(e.amount) })}<small>${est ? tmk("estimate", { logged: hrs.toFixed(1), est }) : tmk("noEstimate")}</small></td><td><span class="status ${tone}">${tmStatus(
          e.status,
        )}</span>${e.status === "Approved" ? `<small>${e.approverName ? tmk("by", { name: e.approverName }) : tmk("byCustomer")}</small>` : ""}${e.reviewNote ? `<small>${tmDom(e.reviewNote)}</small>` : ""}</td><td>${
          role === "customer" && e.status === "Pending approval"
            ? `<div class="cc-actions">${btn("Approved", "success", "approve", e)}${btn("Changes requested", "outline", "changes", e)}${btn("Rejected", "danger", "reject", e)}</div>`
            : ""
        }${role === "supplier" && e.status === "Pending approval" ? `<button class="btn small outline" data-action="time.edit" data-id="${esc(e.id)}">${tmk("edit")}</button>` : ""}</td></tr>`;
      })
      .join("") || `<tr><td colspan="7" class="empty">${tmk("empty")}</td></tr>`;
  dsFillThumbs(body);
}
actions.on("time.filter", () => ccTimeFilter());
// The reset button empties the form first, then the rows follow
actions.on("time.reset", () => setTimeout(ccTimeFilter, 0));
actions.on("time.log", () => ccNewTimeEntry());
actions.on("time.edit", (el) => ccEditTime(el.dataset.id));
actions.on("time.export", (el) => ccExportTime(tmData.role, el.dataset.kind));
actions.on("time.review", (el) => ccReviewTime(el.dataset.id, el.dataset.status));
// The statuses go to the server in English; the approvals page calls this too
async function ccReviewTime(id, status) {
  let reviewNote = "";
  if (status === "Changes requested") {
    reviewNote = (await uiPrompt(t("time.changesPrompt"), "")) || "";
    if (!reviewNote.trim()) return;
  }
  try {
    await api("/time-entries/" + encodeURIComponent(id), { method: "PATCH", body: { status, reviewNote } });
    await route();
  } catch (e) {
    toast(e.message, "error");
  }
}

/* ---------- Export of the filtered rows ---------- */
function ccExportTime(role, type) {
  const data = tmData.filtered || [],
    keys = ["date", "start", "end", "employee", "supplier", "customer", "project", "site", "due", "phase", "task", "hours", "rate", "amount", "status", "by", "at", "comments"],
    headers = keys.map((k) => t("time.x.head." + k)),
    matrix = [
      headers,
      ...data.map((e) => [
        e.workDate,
        e.startTime || "",
        e.endTime || "",
        e.employeeName,
        e.supplierCompany || "",
        e.customerCompany || "",
        e.projectName,
        e.location || e.projectLocation || "",
        e.projectDueDate || "",
        e.phaseName,
        e.taskName,
        e.hours,
        e.hourlyRate,
        e.amount,
        e.status,
        e.status === "Approved" ? e.approverName || t("time.customerFallback") : "",
        e.reviewedAt || "",
        e.description || "",
      ]),
    ];
  if (type === "pdf") {
    const w = window.open("", "_blank");
    if (!w) return tToast(t("time.x.popups"), "error");
    w.document.write(
      `<html><head><title>${tmk("x.title")}</title><style>body{font:11px Arial;padding:28px;color:#172b47}h1{font-size:20px}table{border-collapse:collapse;width:100%}td,th{padding:6px;border-bottom:1px solid #dce3ec;text-align:left}th{background:#eef3fa}</style></head><body><h1>${tmk(
        "x.title",
      )}</h1><p>${tmk("x.meta", { date: fmt.date(new Date().toISOString()), n: data.length })}</p><table>${matrix
        .map((r, i) => `<tr>${r.map((c) => `<${i ? "td" : "th"}>${esc(c)}</${i ? "td" : "th"}>`).join("")}</tr>`)
        .join("")}</table></body></html>`,
    );
    w.document.close();
    // Printed from here: the popup shares this page's CSP, which allows no inline script (T136)
    w.focus();
    w.print();
    return;
  }
  tmDownloadXlsx(matrix, t("time.x.sheet"), "craftcrew-selected-time-entries.xlsx");
}
// A minimal .xlsx (stored zip, one sheet) without a library
function tmDownloadXlsx(matrix, sheetName, filename) {
  const escXml = (s) => String(s ?? "").replaceAll("&", "&amp;").replaceAll("<", "&lt;").replaceAll(">", "&gt;").replaceAll('"', "&quot;").replaceAll("'", "&apos;");
  const crc32 = (bytes) => {
    let crc = -1;
    for (const b of bytes) {
      crc ^= b;
      for (let k = 0; k < 8; k++) crc = (crc >>> 1) ^ (crc & 1 ? 0xedb88320 : 0);
    }
    return (crc ^ -1) >>> 0;
  };
  const u16 = (n) => [n & 255, (n >>> 8) & 255],
    u32 = (n) => [n & 255, (n >>> 8) & 255, (n >>> 16) & 255, (n >>> 24) & 255],
    enc = (s) => new TextEncoder().encode(s),
    concat = (parts) => {
      const out = new Uint8Array(parts.reduce((n, x) => n + x.length, 0));
      let off = 0;
      for (const p of parts) {
        out.set(p, off);
        off += p.length;
      }
      return out;
    };
  const sheetRows = matrix
    .map(
      (row, ri) =>
        `<row r="${ri + 1}">${row
          .map((v, ci) => {
            const ref = String.fromCharCode(65 + ci) + (ri + 1);
            return typeof v === "number" && Number.isFinite(v) ? `<c r="${ref}"><v>${v}</v></c>` : `<c r="${ref}" t="inlineStr"><is><t>${escXml(v)}</t></is></c>`;
          })
          .join("")}</row>`,
    )
    .join("");
  const sheet = `<?xml version="1.0" encoding="UTF-8" standalone="yes"?><worksheet xmlns="http://schemas.openxmlformats.org/spreadsheetml/2006/main"><sheetViews><sheetView workbookViewId="0"><pane ySplit="1" topLeftCell="A2" activePane="bottomLeft" state="frozen"/></sheetView></sheetViews><sheetFormatPr defaultRowHeight="18"/><cols>${matrix[0]
    .map((_, i) => `<col min="${i + 1}" max="${i + 1}" width="${i < 7 ? 20 : 18}" customWidth="1"/>`)
    .join("")}</cols><sheetData>${sheetRows}</sheetData><autoFilter ref="A1:R${Math.max(1, matrix.length)}"/></worksheet>`;
  const files = [
    [
      "[Content_Types].xml",
      '<?xml version="1.0" encoding="UTF-8"?><Types xmlns="http://schemas.openxmlformats.org/package/2006/content-types"><Default Extension="rels" ContentType="application/vnd.openxmlformats-package.relationships+xml"/><Default Extension="xml" ContentType="application/xml"/><Override PartName="/xl/workbook.xml" ContentType="application/vnd.openxmlformats-officedocument.spreadsheetml.sheet.main+xml"/><Override PartName="/xl/worksheets/sheet1.xml" ContentType="application/vnd.openxmlformats-officedocument.spreadsheetml.worksheet+xml"/></Types>',
    ],
    [
      "_rels/.rels",
      '<?xml version="1.0" encoding="UTF-8"?><Relationships xmlns="http://schemas.openxmlformats.org/package/2006/relationships"><Relationship Id="rId1" Type="http://schemas.openxmlformats.org/officeDocument/2006/relationships/officeDocument" Target="xl/workbook.xml"/></Relationships>',
    ],
    [
      "xl/workbook.xml",
      `<?xml version="1.0" encoding="UTF-8"?><workbook xmlns="http://schemas.openxmlformats.org/spreadsheetml/2006/main" xmlns:r="http://schemas.openxmlformats.org/officeDocument/2006/relationships"><sheets><sheet name="${escXml(
        sheetName.slice(0, 31),
      )}" sheetId="1" r:id="rId1"/></sheets></workbook>`,
    ],
    [
      "xl/_rels/workbook.xml.rels",
      '<?xml version="1.0" encoding="UTF-8"?><Relationships xmlns="http://schemas.openxmlformats.org/package/2006/relationships"><Relationship Id="rId1" Type="http://schemas.openxmlformats.org/officeDocument/2006/relationships/worksheet" Target="worksheets/sheet1.xml"/></Relationships>',
    ],
    ["xl/worksheets/sheet1.xml", sheet],
  ];
  const local = [],
    central = [];
  let offset = 0;
  for (const [name, value] of files) {
    const nb = enc(name),
      dataBytes = enc(value),
      crc = crc32(dataBytes),
      lh = new Uint8Array([...u32(0x04034b50), ...u16(20), ...u16(0x0800), ...u16(0), ...u16(0), ...u16(0), ...u32(crc), ...u32(dataBytes.length), ...u32(dataBytes.length), ...u16(nb.length), ...u16(0)]),
      entry = concat([lh, nb, dataBytes]);
    local.push(entry);
    const ch = new Uint8Array([
      ...u32(0x02014b50),
      ...u16(20),
      ...u16(20),
      ...u16(0x0800),
      ...u16(0),
      ...u16(0),
      ...u16(0),
      ...u32(crc),
      ...u32(dataBytes.length),
      ...u32(dataBytes.length),
      ...u16(nb.length),
      ...u16(0),
      ...u16(0),
      ...u16(0),
      ...u16(0),
      ...u32(0),
      ...u32(offset),
    ]);
    central.push(concat([ch, nb]));
    offset += entry.length;
  }
  const cd = concat(central),
    end = new Uint8Array([...u32(0x06054b50), ...u16(0), ...u16(0), ...u16(files.length), ...u16(files.length), ...u32(cd.length), ...u32(offset), ...u16(0)]),
    blob = new Blob([...local, cd, end], { type: "application/vnd.openxmlformats-officedocument.spreadsheetml.sheet" }),
    a = document.createElement("a");
  a.href = URL.createObjectURL(blob);
  a.download = filename;
  a.click();
  setTimeout(() => URL.revokeObjectURL(a.href), 1000);
}

/* ---------- Log time: the sheet (T103) with photos (T106) ---------- */
const DS_TIME_PHOTOS_MAX = 6;
let tmPhotos = []; // photos of the open sheet as {filename, content} with data URLs
async function ccNewTimeEntry() {
  const [projects, profile] = await Promise.all([ccProjects(), api("/profile")]),
    supplier = profile.supplier || {},
    opts = [];
  for (const project of projects)
    for (const phase of project.phases || []) for (const task of phase.tasks || []) if (task.assignedSupplierId === supplier.id && task.acceptanceStatus === "Accepted") opts.push({ project, phase, task });
  if (!opts.length) return tToast(t("time.s.noTasks"), "error");
  tmPhotos = [];
  const s = (key, params) => tmk("s." + key, params),
    members = (supplier.teamMembers || []).map((x) => x.name),
    row = (label, html) => `<div class="ds-row"><span class="ds-row-label ds-ui">${s(label)}</span><div class="ds-row-value">${html}</div></div>`,
    names = members.length ? members : [state.user.name];
  modal(
    t("time.s.title"),
    `<form id="ffTimeForm" class="modal-form ff-time-entry-form" data-action="time.submit" data-input="time.calc"><div class="ds-offline ds-ui"${navigator.onLine ? " hidden" : ""}><svg viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round" aria-hidden="true"><path d="M2 8.5a15 15 0 0 1 20 0M5.5 12a10 10 0 0 1 13 0M9 15.5a5 5 0 0 1 6 0M3 3l18 18"/></svg><span>${s(
      "offline",
    )}</span></div><div class="ds-group">${row(
      "job",
      `<select name="target" id="ffTimeTarget" required><option value="">${s("choose")}</option>${opts
        .map((x) => `<option value="${esc(`${x.project.id}|${x.phase.id}|${x.task.id}`)}">${esc(x.project.name)} — ${esc(x.phase.name)} — ${esc(x.task.name)}</option>`)
        .join("")}</select>`,
    )}${row("date", `<input name="workDate" type="date" value="${new Date().toISOString().slice(0, 10)}" required>`)}</div><div class="ds-group">${row("start", '<input name="startTime" type="time" value="08:00" required>')}${row(
      "end",
      '<input name="endTime" type="time" value="16:30" required>',
    )}${row(
      "break",
      `<div class="ds-seg ds-break" role="group" aria-label="${s("break")}">${[0, 15, 30, 45].map((m) => `<button type="button" data-m="${m}" data-action="time.break">${m}</button>`).join("")}</div>`,
    )}</div><div class="ds-work"><span class="ds-group-label ds-ui">${s("workDone")}</span><textarea name="description" rows="4" maxlength="2000" placeholder="${s(
      "notesHint",
    )}" required></textarea></div><div class="ds-photos"><span class="ds-group-label ds-ui" id="dsPhotosLabel">${s("photos")}</span><div class="ds-photo-grid" id="tmPhotoGrid" role="group" aria-labelledby="dsPhotosLabel"></div></div><div class="ds-details"><span class="ds-group-label ds-ui">${s(
      "details",
    )}</span><div class="ds-group">${row("findJob", `<input id="ffTimeSearch" placeholder="${s("searchHint")}" data-input="time.search">`)}${row(
      "employee",
      `<select name="employeeName" required>${names.map((n) => `<option value="${esc(n)}">${esc(n)}</option>`).join("")}</select>`,
    )}${row("location", `<input name="location" placeholder="${s("locationHint")}" required>`)}${row(
      "breakMin",
      '<input name="breakMinutes" type="number" min="0" max="600" step="5" value="30">',
    )}</div><div class="ff-hours-calc"><span>${s("billable")}</span><strong id="ffTimeCalculated"></strong><small>${s(
      "calcHint",
    )}</small></div></div><div id="ffTimeError" class="form-error"></div><button class="btn primary ds-sheet-submit">${s("submit")}</button></form>`,
  );
  // The sheet's header: Cancel on the left, Save on the right
  const form = document.getElementById("ffTimeForm"),
    modalEl = form?.closest(".modal"),
    head = modalEl?.querySelector(".modal-head");
  modalEl?.classList.add("ds-sheet");
  if (head) {
    const close = head.querySelector(".close");
    if (close) {
      close.className = "ds-sheet-cancel";
      close.replaceChildren(t("time.s.cancel"));
      head.prepend(close);
    }
    head.insertAdjacentHTML("beforeend", `<button type="submit" form="ffTimeForm" class="ds-sheet-save">${s("save")}</button>`);
    head.classList.add("ds-ui");
  }
  tmDrawPhotos();
  tmCalc();
}
// Billable hours from start, end and break; the submit button says how many
function tmCalc() {
  const form = document.getElementById("ffTimeForm");
  if (!form) return;
  const f = new FormData(form),
    start = f.get("startTime"),
    end = f.get("endTime"),
    br = Number(f.get("breakMinutes")) || 0,
    mins = start && end ? Number(end.slice(0, 2)) * 60 + Number(end.slice(3)) - Number(start.slice(0, 2)) * 60 - Number(start.slice(3)) - br : 0,
    out = document.getElementById("ffTimeCalculated"),
    submit = form.querySelector(".ds-sheet-submit");
  form.dataset.hours = mins > 0 ? (mins / 60).toFixed(2) : "";
  out.textContent = mins > 0 ? t("time.hours", { n: (mins / 60).toFixed(2) }) : t("time.s.checkRange");
  form.querySelectorAll(".ds-break button").forEach((b) => b.setAttribute("aria-pressed", String(Number(b.dataset.m) === br)));
  if (submit) submit.textContent = mins > 0 ? t("time.s.submitN", { n: (mins / 60).toFixed(1) }) : t("time.s.submit");
}
actions.on("time.calc", tmCalc);
actions.on("time.break", (b) => {
  document.querySelector('#ffTimeForm [name="breakMinutes"]').value = b.dataset.m;
  tmCalc();
});
actions.on("time.search", (input) => {
  const q = input.value.toLowerCase();
  [...document.getElementById("ffTimeTarget").options].forEach((o, i) => {
    if (i) o.hidden = !o.text.toLowerCase().includes(q);
  });
});
// Up to 6 JPG or PNG photos, shrunk on the phone before upload
function dsPhotoData(file) {
  return new Promise((resolve, reject) => {
    if (!/^image\/(jpeg|png)$/.test(file.type)) return reject(new Error(t("time.s.photoType")));
    const img = new Image(),
      src = URL.createObjectURL(file);
    img.onload = () => {
      const scale = Math.min(1, 1600 / Math.max(img.naturalWidth, img.naturalHeight)),
        canvas = document.createElement("canvas");
      canvas.width = Math.round(img.naturalWidth * scale);
      canvas.height = Math.round(img.naturalHeight * scale);
      canvas.getContext("2d").drawImage(img, 0, 0, canvas.width, canvas.height);
      URL.revokeObjectURL(src);
      const name = (file.name.replace(/\.[^.]*$/, "") || "photo").replace(/[^a-zA-Z0-9._-]/g, "_");
      resolve({ filename: name + ".jpg", content: canvas.toDataURL("image/jpeg", 0.82) });
    };
    img.onerror = () => {
      URL.revokeObjectURL(src);
      reject(new Error(t("time.s.photoRead")));
    };
    img.src = src;
  });
}
function tmDrawPhotos() {
  const grid = document.getElementById("tmPhotoGrid");
  if (!grid) return;
  grid.innerHTML =
    tmPhotos
      .map(
        (p, i) =>
          `<div class="ds-photo"><img src="${esc(p.content)}" alt="${esc(p.filename)}"><button type="button" class="ds-photo-remove" data-action="time.removePhoto" data-i="${i}" aria-label="${tmk("s.removePhoto", {
            n: i + 1,
          })}">×</button></div>`,
      )
      .join("") +
    (tmPhotos.length < DS_TIME_PHOTOS_MAX
      ? `<label class="ds-photo-add"><input type="file" accept="image/jpeg,image/png" multiple aria-label="${tmk("s.addPhoto")}" data-ui-drop="off" data-action="time.addPhotos"><span aria-hidden="true">+</span></label>`
      : "");
}
actions.on("time.addPhotos", async (input) => {
  const files = [...input.files],
    error = document.getElementById("ffTimeError");
  try {
    if (tmPhotos.length + files.length > DS_TIME_PHOTOS_MAX) throw new Error(t("time.s.photoMax"));
    for (const f of files) tmPhotos.push(await dsPhotoData(f));
    error.textContent = "";
  } catch (x) {
    error.textContent = x.message;
  }
  tmDrawPhotos();
});
actions.on("time.removePhoto", (b) => {
  tmPhotos.splice(Number(b.dataset.i), 1);
  tmDrawPhotos();
});
actions.on("time.submit", async (form) => {
  const f = new FormData(form),
    [projectId, phaseId, taskId] = (f.get("target") || "").split("|"),
    hours = form.dataset.hours;
  if (!hours) return tToast(t("time.s.endAfter"), "error");
  const body = {
    projectId,
    phaseId,
    taskId,
    employeeName: f.get("employeeName"),
    workDate: f.get("workDate"),
    startTime: f.get("startTime"),
    endTime: f.get("endTime"),
    breakMinutes: f.get("breakMinutes"),
    hours,
    location: f.get("location"),
    description: f.get("description"),
  };
  try {
    // With photos the post uploads them first; without a signal both are queued (offline-sync.js)
    if (tmPhotos.length) await oflPostWithPhotos("/time-entries", body, tmPhotos.slice());
    else await api("/time-entries", { method: "POST", body });
    closeModal();
    tToast(t("time.s.submitted"));
    await route();
  } catch (x) {
    document.getElementById("ffTimeError").textContent = x.message;
  }
});

/* ---------- Edit a pending entry ---------- */
function ccEditTime(id) {
  const e = tmData.entries.find((x) => x.id === id),
    k = (key) => tmk("e." + key);
  if (!e) return;
  modal(
    t("time.e.title"),
    `<form id="ffEditTime" class="modal-form" data-action="time.saveEdit" data-id="${esc(id)}"><div class="two"><label>${k("from")}<input name="startTime" type="time" value="${esc(e.startTime || "08:00")}" required></label><label>${k(
      "until",
    )}<input name="endTime" type="time" value="${esc(e.endTime || "16:00")}" required></label></div><label>${k("location")}<input name="location" value="${esc(e.location || "")}" required></label><label>${k(
      "notes",
    )}<textarea name="description" rows="4" required>${esc(e.description || "")}</textarea></label><button class="btn primary">${k("save")}</button></form>`,
  );
}
actions.on("time.saveEdit", async (form) => {
  const f = new FormData(form),
    mins = Number(f.get("endTime").slice(0, 2)) * 60 + Number(f.get("endTime").slice(3)) - (Number(f.get("startTime").slice(0, 2)) * 60 + Number(f.get("startTime").slice(3)));
  if (mins <= 0) return tToast(t("time.e.endAfterStart"), "error");
  try {
    await api("/time-entries/" + encodeURIComponent(form.dataset.id), {
      method: "PATCH",
      body: { startTime: f.get("startTime"), endTime: f.get("endTime"), hours: (mins / 60).toFixed(2), location: f.get("location"), description: f.get("description") },
    });
    closeModal();
    await route();
  } catch (x) {
    toast(x.message, "error");
  }
});

routes.add("/customer/time", () => ccTimePage("customer"));
routes.add("/supplier/time", () => ccTimePage("supplier"));
