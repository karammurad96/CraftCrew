/* Area: project files (T128e). A file manager in the style of Windows Explorer. Every project phase is a folder
   and every task a subfolder below it — created automatically from the project plan. Files can be uploaded
   into the open folder (button or drag & drop from the desktop), moved by dragging onto a folder, renamed,
   deleted, approved, and opened. The window fills the page and can be maximized. Drawn with translation keys;
   buttons use data-action. File names, phase and task names and statuses are data (data-i18n="dom"). */
const xpEsc = (v) => esc(v ?? "");
const xk = (key, params) => esc(t("docs." + key, params));
const xpDom = (text) => `<bdi data-i18n="dom">${xpEsc(text)}</bdi>`;
const XP_TYPES = ["pdf", "doc", "docx", "xls", "xlsx", "csv", "png", "jpg", "jpeg", "dwg", "dxf", "zip", "txt"];
const xpExt = (n) => (String(n).match(/\.([a-z0-9]+)$/i)?.[1] || "").toLowerCase();
const xpType = (n) => {
  const ext = xpExt(n);
  return XP_TYPES.includes(ext) ? t("docs.types." + ext) : ext ? t("docs.types.other", { ext: ext.toUpperCase() }) : t("docs.types.file");
};
const xpSize = (b) => (!b ? "—" : b < 1024 ? b + " B" : b < 1048576 ? Math.round(b / 1024) + " KB" : fmt.number(b / 1048576, 1) + " MB");
const xpWhen = (d) => (d ? new Date(d).toLocaleString(fmt.locale(), { day: "2-digit", month: "2-digit", year: "numeric", hour: "2-digit", minute: "2-digit" }) : "");
const XP_FILE_COLORS = {
  pdf: "#dc2626",
  doc: "#2563eb",
  docx: "#2563eb",
  xls: "#16a34a",
  xlsx: "#16a34a",
  csv: "#16a34a",
  png: "#9333ea",
  jpg: "#9333ea",
  jpeg: "#9333ea",
  dwg: "#ea580c",
  dxf: "#ea580c",
};
const xpFileIcon = (n, big) =>
  `<span class="xp-ficon ${big ? "big" : ""}" style="--c:${XP_FILE_COLORS[xpExt(n)] || "#64748b"}"><svg viewBox="0 0 24 24" aria-hidden="true"><path d="M14 2H6a2 2 0 0 0-2 2v16a2 2 0 0 0 2 2h12a2 2 0 0 0 2-2V8z" fill="#fff" stroke="currentColor"/><path d="M14 2v6h6" fill="none" stroke="currentColor"/></svg><i>${xpEsc(xpExt(n).slice(0, 4) || "file")}</i></span>`;
const xpFolderIcon = (big) =>
  `<svg class="xp-folder ${big ? "big" : ""}" viewBox="0 0 24 24" aria-hidden="true"><path d="M2 6.5A2.5 2.5 0 0 1 4.5 4H9l2 2.2h8.5A2.5 2.5 0 0 1 22 8.7v9.8a2.5 2.5 0 0 1-2.5 2.5h-15A2.5 2.5 0 0 1 2 18.5z" fill="#f5c451"/><path d="M2 9.5h20v9a2.5 2.5 0 0 1-2.5 2.5h-15A2.5 2.5 0 0 1 2 18.5z" fill="#fbd96a"/></svg>`;
// Categories are saved in English; the label is translated
const XP_CATEGORIES = ["Engineering", "Planning", "Quality & acceptance", "Safety", "Commercial", "Handover", "General"];

// A menu item does its action and closes the menu
const xpFromMenu = (fn) => (el, event) => {
  xpCloseMenu();
  return fn(el, event);
};

let xp = null; // {project, docs, folder, selected:Set, view, sort, dir, history, future, q, expanded, pendingFiles}

/* Folder ids: 'root' (project files), 'phase:<id>', 'task:<phaseId>:<taskId>', plus the views 'all' and 'pending'. */
function xpFolderInfo(fid) {
  const p = xp.project;
  if (fid.startsWith("phase:")) {
    const ph = p.phases.find((x) => x.id === fid.slice(6));
    return ph ? { kind: "phase", phase: ph, name: ph.name } : null;
  }
  if (fid.startsWith("task:")) {
    const [, phid, tid] = fid.split(":"),
      ph = p.phases.find((x) => x.id === phid),
      task = ph?.tasks?.find((x) => x.id === tid);
    return task ? { kind: "task", phase: ph, task, name: task.name } : null;
  }
  if (fid === "all") return { kind: "view", name: t("docs.allFiles") };
  if (fid === "pending") return { kind: "view", name: t("docs.pending") };
  return { kind: "root", name: p.name };
}
// A folder's name for display: phase names are data with the old translation, view names are keys
const xpFolderLabel = (fid) => {
  const info = xpFolderInfo(fid);
  return info?.kind === "phase" ? xpDom(info.name) : xpEsc(info?.name);
};
const xpParent = (fid) => (fid.startsWith("task:") ? "phase:" + fid.split(":")[1] : fid.startsWith("phase:") ? "root" : null);
function xpFilesIn(fid) {
  const d = xp.docs;
  if (fid === "all") return d;
  if (fid === "pending") return d.filter((x) => x.status === "Pending approval");
  if (fid === "root") return d.filter((x) => !x.phaseId);
  if (fid.startsWith("phase:")) return d.filter((x) => x.phaseId === fid.slice(6) && !x.taskId);
  const [, phid, tid] = fid.split(":");
  return d.filter((x) => x.phaseId === phid && x.taskId === tid);
}
const xpCountDeep = (fid) => (fid === "root" ? xp.docs.length : fid.startsWith("phase:") ? xp.docs.filter((x) => x.phaseId === fid.slice(6)).length : xpFilesIn(fid).length);
function xpSubfolders(fid) {
  if (fid === "root")
    return xp.project.phases.map((ph) => ({ id: "phase:" + ph.id, name: ph.name, phase: true, meta: t("docs.taskFolders", { n: (ph.tasks || []).length }), status: ph.status, when: ph.dueDate }));
  if (fid.startsWith("phase:")) {
    const ph = xp.project.phases.find((x) => x.id === fid.slice(6));
    return (ph?.tasks || []).map((x) => ({ id: `task:${ph.id}:${x.id}`, name: x.name, meta: t("docs.taskFolder"), status: x.status, when: x.dueDate }));
  }
  return [];
}

/* ---------- Render ---------- */
async function xpPage(role, pid, query) {
  const [{ project }, { documents = [] }] = await Promise.all([api("/projects/" + encodeURIComponent(pid)), api(`/projects/${encodeURIComponent(pid)}/documents`)]);
  // Older links used ?phase=&task= or ?folder=task:<id>; map them onto the folder tree.
  let folder = query.get("folder") || (query.get("task") ? `task:${query.get("phase")}:${query.get("task")}` : query.get("phase") ? "phase:" + query.get("phase") : "root");
  if (/^task:[^:]+$/.test(folder)) {
    const tid = folder.slice(5),
      ph = project.phases.find((x) => (x.tasks || []).some((y) => y.id === tid));
    folder = ph ? `task:${ph.id}:${tid}` : "root";
  }
  const keep = xp && xp.project.id === pid ? xp : null;
  let view = keep?.view;
  try {
    view ||= localStorage.getItem("cc_xp_view");
  } catch {}
  xp = {
    project,
    docs: documents,
    folder: "root",
    selected: new Set(),
    view: view || "details",
    sort: keep?.sort || "name",
    dir: keep?.dir || 1,
    history: keep?.history || [],
    future: keep?.future || [],
    q: "",
    expanded: keep?.expanded || new Set(["root", ...(folder.startsWith("task:") ? ["phase:" + folder.split(":")[1]] : [])]),
  };
  xp.folder = xpFolderInfo(folder) ? folder : "root";
  const max = document.body.classList.contains("xp-max");
  app.innerHTML = dashboardShell(
    role,
    "projects",
    `<div class="xp-page" data-i18n="keys"><div class="xp-window" id="xpWindow">
    <div class="xp-titlebar"><a class="xp-back-link" href="#/${role}/projects/${xpEsc(project.id)}">← ${xpEsc(project.name)}</a><h1 class="xp-title-h1">${xk("title")}</h1><div class="xp-winbtns"><button type="button" class="xp-winbtn" id="xpMax" title="${xk(max ? "restore" : "maximize")}" data-action="docs.max">${max ? "❐" : "□"}</button></div></div>
    <div class="xp-navbar"><div class="xp-navbtns"><button type="button" class="xp-nav" id="xpBackBtn" title="${xk("back")}" data-action="docs.back">←</button><button type="button" class="xp-nav" id="xpFwdBtn" title="${xk("forward")}" data-action="docs.forward">→</button><button type="button" class="xp-nav" id="xpUpBtn" title="${xk("up")}" data-action="docs.up">↑</button><button type="button" class="xp-nav" title="${xk("refresh")}" data-action="docs.reload">⟳</button></div>
      <div class="xp-address" id="xpAddress"></div><label class="xp-search">${uiIcon("search")}<input id="xpSearch" placeholder="${xk("search")}" autocomplete="off" data-input="docs.search"></label></div>
    <div class="xp-commandbar" id="xpCommands"></div>
    <div class="xp-body"><nav class="xp-tree" id="xpTree" aria-label="${xk("folders")}"></nav><section class="xp-content" id="xpContent" tabindex="0" aria-label="${xk("files")}"></section></div>
    <div class="xp-statusbar" id="xpStatus"></div>
    <div class="xp-drop" id="xpDrop"><div>${uiIcon("folder", "ui-icon")}<b>${xk("dropTitle")}</b><small id="xpDropTarget"></small></div></div>
  </div></div>`,
  );
  xpBind();
  xpRenderAll();
}
for (const role of ["customer", "supplier"]) routes.add(`/${role}/projects/:id/documents`, (params, query) => xpPage(role, params.id, query));
function xpRenderAll() {
  xpRenderTree();
  xpRenderAddress();
  xpRenderCommands();
  xpRenderContent();
  xpRenderStatus();
}

function xpRenderTree() {
  const node = (fid, name, depth, children, icon = xpFolderIcon()) => {
    const open = xp.expanded.has(fid),
      count = xpCountDeep(fid),
      plain = xpFolderInfo(fid)?.name || "";
    return `<div class="xp-node ${xp.folder === fid ? "active" : ""}" style="--d:${depth}" data-folder="${xpEsc(fid)}" draggable="false">
      <button type="button" class="xp-twisty ${children ? "" : "none"}" data-action="docs.toggle" data-folder="${xpEsc(fid)}" tabindex="-1"${children ? ` aria-expanded="${open}" aria-label="${xk(open ? "collapse" : "expand", { name: plain })}"` : ` aria-hidden="true"`}>${children ? (open ? "▾" : "▸") : ""}</button>${icon}<span class="xp-node-name">${name}</span>${count ? `<span class="xp-node-count">${count}</span>` : ""}</div>${children && open ? children() : ""}`;
  };
  const p = xp.project,
    pending = xp.docs.filter((x) => x.status === "Pending approval").length;
  document.getElementById("xpTree").innerHTML = `<div class="xp-tree-group">${xk("quickAccess")}</div>
    <div class="xp-node ${xp.folder === "all" ? "active" : ""}" style="--d:0" data-folder="all"><span class="xp-twisty none"></span>${uiIcon("file", "ui-icon xp-qicon")}<span class="xp-node-name">${xk("allFiles")}</span><span class="xp-node-count">${xp.docs.length}</span></div>
    <div class="xp-node ${xp.folder === "pending" ? "active" : ""}" style="--d:0" data-folder="pending"><span class="xp-twisty none"></span>${uiIcon("approvals", "ui-icon xp-qicon")}<span class="xp-node-name">${xk("pending")}</span>${pending ? `<span class="xp-node-count warn">${pending}</span>` : ""}</div>
    <div class="xp-tree-group">${xk("thisProject")}</div>
    ${node("root", xpEsc(p.name), 0, () =>
      p.phases
        .map((ph) => node("phase:" + ph.id, xpDom(ph.name), 1, (ph.tasks || []).length ? () => ph.tasks.map((x) => node(`task:${ph.id}:${x.id}`, xpEsc(x.name), 2, null)).join("") : null))
        .join(""),
    )}`;
}
function xpRenderAddress() {
  const chain = [];
  let f = xp.folder;
  if (["all", "pending"].includes(f)) chain.push(f);
  else
    while (f) {
      chain.unshift(f);
      f = xpParent(f);
    }
  document.getElementById("xpAddress").innerHTML = `${xpFolderIcon()}<span class="xp-crumb-sep">›</span>${chain
    .map((fid, i) => `<button type="button" class="xp-crumb" data-folder="${xpEsc(fid)}" data-action="docs.go">${xpFolderLabel(fid)}</button>${i < chain.length - 1 ? '<span class="xp-crumb-sep">›</span>' : ""}`)
    .join("")}`;
  document.getElementById("xpBackBtn").disabled = !xp.history.length;
  document.getElementById("xpFwdBtn").disabled = !xp.future.length;
  document.getElementById("xpUpBtn").disabled = !xpParent(xp.folder);
}
function xpSelectedDocs() {
  return xp.docs.filter((d) => xp.selected.has(d.id));
}
const xpCanManage = (d) => state.user.role === "customer" || d.uploadedBy === state.user.id || (state.user.role === "supplier" && d.supplierId === state.user.supplierId);
function xpRenderCommands() {
  const sel = xpSelectedDocs(),
    one = sel.length === 1 ? sel[0] : null,
    manage = sel.length && sel.every(xpCanManage),
    canReview = state.user.role === "customer" && one?.status === "Pending approval";
  const btn = (key, icon, action, on = true, cls = "", extra = "") =>
    `<button type="button" class="xp-cmd ${cls}" data-action="${action}"${extra}${on ? "" : " disabled"}><span aria-hidden="true">${icon}</span>${xk("cmd." + key)}</button>`;
  document.getElementById("xpCommands").innerHTML = `${btn("upload", "⭱", "docs.upload", !["all", "pending"].includes(xp.folder), "primary")}<span class="xp-cmd-sep"></span>
    ${btn("open", "↗", "docs.open", !!one?.url)}${btn("download", "⭳", "docs.download", sel.some((d) => d.url))}${btn("rename", "✎", "docs.rename", !!one && manage)}${btn("move", "➜", "docs.moveDialog", manage)}${btn("delete", "🗑", "docs.delete", manage, "danger")}
    ${canReview ? `<span class="xp-cmd-sep"></span>${btn("approve", "✓", "docs.review", true, "ok", ' data-status="Approved"')}${btn("changes", "↺", "docs.review", true, "", ' data-status="Changes requested"')}` : ""}
    <span class="xp-cmd-spacer"></span>
    <label class="xp-sort">${xk("cmd.sort")}<select id="xpSort" data-action="docs.sort">${["name", "date", "type", "size", "status"]
      .map((v) => `<option value="${v}"${xp.sort === v ? " selected" : ""}>${xk("col." + v)}</option>`)
      .join("")}</select></label>
    <div class="xp-views" role="group" aria-label="${xk("cmd.view")}"><button type="button" class="${xp.view === "details" ? "on" : ""}" title="${xk("cmd.details")}" data-action="docs.view" data-view="details">☰</button><button type="button" class="${xp.view === "tiles" ? "on" : ""}" title="${xk("cmd.tiles")}" data-action="docs.view" data-view="tiles">▦</button></div>`;
}
function xpItems() {
  const q = xp.q.toLowerCase();
  // A search looks through every folder of the project, like Explorer's search.
  const files = q
    ? xp.docs.filter((d) => `${d.filename} ${d.description || ""} ${d.category || ""} ${d.phaseName || ""} ${d.taskName || ""}`.toLowerCase().includes(q))
    : xpFilesIn(xp.folder);
  const folders = q ? [] : xpSubfolders(xp.folder);
  const key = {
    name: (d) => d.filename.toLowerCase(),
    date: (d) => d.updatedAt || d.uploadedAt || "",
    type: (d) => xpType(d.filename),
    size: (d) => d.size || 0,
    status: (d) => d.status || "",
  }[xp.sort];
  files.sort((a, b) => (key(a) > key(b) ? 1 : key(a) < key(b) ? -1 : 0) * xp.dir);
  return { folders, files };
}
function xpStatusTag(s) {
  return s ? `<span class="status ${s === "Approved" ? "completed" : s === "Pending approval" ? "submitted" : /changes|rejected/i.test(s) ? "rejected" : "active"}" data-i18n="dom">${xpEsc(s)}</span>` : "";
}
function xpRenderContent() {
  const { folders, files } = xpItems(),
    el = document.getElementById("xpContent"),
    inSearch = !!xp.q;
  const head = (k) => `<button type="button" class="xp-col ${xp.sort === k ? "sorted" : ""}" data-action="docs.sortBy" data-key="${k}">${xk("col." + k)}${xp.sort === k ? (xp.dir > 0 ? " ▴" : " ▾") : ""}</button>`;
  if (!folders.length && !files.length) {
    el.innerHTML = `<div class="xp-empty">${xpFolderIcon(true)}<b>${xk(inSearch ? "noMatch" : "empty")}</b>${inSearch || ["all", "pending"].includes(xp.folder) ? "" : `<small>${xk("emptyHint")}</small>`}</div>`;
    return;
  }
  const folderName = (f) => (f.phase ? xpDom(f.name) : xpEsc(f.name));
  if (xp.view === "tiles") {
    el.innerHTML = `<div class="xp-tiles">${folders.map((f) => `<div class="xp-tile" data-folder="${xpEsc(f.id)}" tabindex="-1">${xpFolderIcon(true)}<b>${folderName(f)}</b><small>${xk("fileCount", { n: xpCountDeep(f.id) })}</small></div>`).join("")}${files
      .map(
        (d) =>
          `<div class="xp-tile ${xp.selected.has(d.id) ? "sel" : ""}" data-doc="${xpEsc(d.id)}" draggable="${xpCanManage(d)}" tabindex="-1">${xpFileIcon(d.filename, true)}<b title="${xpEsc(d.filename)}">${xpEsc(d.filename)}</b><small>${xpStatusTag(d.status)}</small></div>`,
      )
      .join("")}</div>`;
    return;
  }
  const owner = (d) =>
    inSearch
      ? [d.phaseName ? xpDom(d.phaseName) : xk("projectFiles"), d.taskName ? xpEsc(d.taskName) : ""].filter(Boolean).join(" › ")
      : d.supplierCompany || d.ownerName
        ? xpEsc(d.supplierCompany || d.ownerName)
        : xk(d.supplierId ? "supplier" : "customer");
  el.innerHTML = `<div class="xp-table"><div class="xp-row xp-head">${head("name")}${head("date")}${head("type")}${head("size")}${head("status")}<span class="xp-col">${xk(inSearch ? "col.folder" : "col.sharedBy")}</span></div>
    ${folders
      .map(
        (f) =>
          `<div class="xp-row" data-folder="${xpEsc(f.id)}" tabindex="-1"><span class="xp-name">${xpFolderIcon()}<b>${folderName(f)}</b></span><span>${f.when ? xpEsc(fmt.date(f.when)) : ""}</span><span>${xk("fileFolder")}</span><span>${xk("fileCount", { n: xpCountDeep(f.id) })}</span><span>${f.status ? xpStatusTag(f.status) : ""}</span><span class="subtle">${xpEsc(f.meta)}</span></div>`,
      )
      .join("")}
    ${files
      .map(
        (d) =>
          `<div class="xp-row ${xp.selected.has(d.id) ? "sel" : ""}" data-doc="${xpEsc(d.id)}" draggable="${xpCanManage(d)}" tabindex="-1" title="${xpEsc(d.description || "")}"><span class="xp-name">${xpFileIcon(d.filename)}<b>${xpEsc(d.filename)}</b>${d.version > 1 ? `<small class="xp-ver">v${xpEsc(d.version)}</small>` : ""}</span><span>${xpWhen(d.updatedAt || d.uploadedAt)}</span><span>${xpEsc(xpType(d.filename))}</span><span>${xpSize(d.size)}</span><span>${xpStatusTag(d.status)}</span><span class="subtle">${owner(d)}</span></div>`,
      )
      .join("")}</div>`;
}
function xpRenderStatus() {
  const { folders, files } = xpItems(),
    sel = xpSelectedDocs(),
    size = sel.reduce((a, d) => a + (d.size || 0), 0),
    one = sel.length === 1 ? sel[0] : null;
  document.getElementById("xpStatus").innerHTML = `<span>${xk("items", { n: folders.length + files.length })}</span>${sel.length ? `<span>${xk("selected", { n: sel.length })}${size ? " · " + xpSize(size) : ""}</span>` : ""}${
    one
      ? `<span class="xp-status-detail">${one.category ? statusHtml(one.category) : ""}${one.description ? " · " + xpEsc(one.description) : ""}${one.reviewNote ? " · " + xk("review", { note: one.reviewNote }) : ""}</span>`
      : ""
  }<span class="xp-status-hint">${xk("hint")}</span>`;
}

/* ---------- Navigation ---------- */
function xpGo(fid, { record = true } = {}) {
  if (!xpFolderInfo(fid) || fid === xp.folder) return;
  if (record) {
    xp.history.push(xp.folder);
    xp.future = [];
  }
  xp.folder = fid;
  xp.selected.clear();
  xp.q = "";
  document.getElementById("xpSearch").value = "";
  xp.expanded.add(fid);
  let f = xpParent(fid);
  while (f) {
    xp.expanded.add(f);
    f = xpParent(f);
  }
  history.replaceState(null, "", `#/${state.user.role}/projects/${xp.project.id}/documents?folder=${encodeURIComponent(fid)}`);
  xpRenderAll();
}
function xpBack() {
  if (!xp.history.length) return;
  xp.future.push(xp.folder);
  xpGo(xp.history.pop(), { record: false });
}
function xpForward() {
  if (!xp.future.length) return;
  xp.history.push(xp.folder);
  xpGo(xp.future.pop(), { record: false });
}
function xpUp() {
  const p = xpParent(xp.folder);
  if (p) xpGo(p);
}
function xpSetView(v) {
  xp.view = v;
  try {
    localStorage.setItem("cc_xp_view", v);
  } catch {}
  xpRenderCommands();
  xpRenderContent();
}
async function xpReload() {
  const { documents = [] } = await api(`/projects/${xp.project.id}/documents`);
  xp.docs = documents;
  xp.selected = new Set([...xp.selected].filter((id) => documents.some((d) => d.id === id)));
  xpRenderAll();
}
actions.on("docs.max", () => {
  document.body.classList.toggle("xp-max");
  const b = document.getElementById("xpMax"),
    on = document.body.classList.contains("xp-max");
  if (b) {
    b.textContent = on ? "❐" : "□";
    b.title = t(on ? "docs.restore" : "docs.maximize");
  }
});
actions.on("docs.back", () => xpBack());
actions.on("docs.forward", () => xpForward());
actions.on("docs.up", () => xpUp());
actions.on("docs.reload", xpFromMenu(() => xpReload()));
actions.on("docs.go", (el) => xpGo(el.dataset.folder));
actions.on("docs.toggle", (el) => {
  const fid = el.dataset.folder;
  xp.expanded.has(fid) ? xp.expanded.delete(fid) : xp.expanded.add(fid);
  xpRenderTree();
});
actions.on("docs.sortBy", (el) => {
  xp.dir = xp.sort === el.dataset.key ? -xp.dir : 1;
  xp.sort = el.dataset.key;
  xpRenderCommands();
  xpRenderContent();
});
actions.on("docs.sort", (el) => {
  xp.sort = el.value;
  xpRenderContent();
});
actions.on("docs.view", xpFromMenu((el) => xpSetView(el.dataset.view)));
actions.on("docs.search", (el) => {
  xp.q = el.value.trim();
  xp.selected.clear();
  xpRenderContent();
  xpRenderStatus();
  xpRenderCommands();
});

/* ---------- Selection & events ---------- */
function xpBind() {
  const content = document.getElementById("xpContent"),
    tree = document.getElementById("xpTree"),
    win = document.getElementById("xpWindow");
  tree.onclick = (e) => {
    // The twisty only folds the node (its own action)
    if (e.target.closest(".xp-twisty")) return;
    const n = e.target.closest("[data-folder]");
    if (n) xpGo(n.dataset.folder);
  };
  content.onclick = (e) => {
    const row = e.target.closest("[data-doc]"),
      folder = e.target.closest("[data-folder]");
    if (e.target.closest("[data-action]")) return;
    if (folder) {
      xp.selected.clear();
      content.querySelectorAll(".sel").forEach((x) => x.classList.remove("sel"));
      folder.classList.add("sel");
      xpRenderCommands();
      xpRenderStatus();
      return;
    }
    if (!row) xp.selected.clear();
    else if (e.ctrlKey || e.metaKey) xp.selected.has(row.dataset.doc) ? xp.selected.delete(row.dataset.doc) : xp.selected.add(row.dataset.doc);
    else if (e.shiftKey && xp.anchor) {
      const ids = xpItems().files.map((d) => d.id),
        a = ids.indexOf(xp.anchor),
        b = ids.indexOf(row.dataset.doc);
      xp.selected = new Set(ids.slice(Math.min(a, b), Math.max(a, b) + 1));
    } else xp.selected = new Set([row.dataset.doc]);
    if (row && !e.shiftKey) xp.anchor = row.dataset.doc;
    content.querySelectorAll("[data-doc]").forEach((x) => x.classList.toggle("sel", xp.selected.has(x.dataset.doc)));
    xpRenderCommands();
    xpRenderStatus();
  };
  content.ondblclick = (e) => {
    const folder = e.target.closest("[data-folder]"),
      row = e.target.closest("[data-doc]");
    if (folder) xpGo(folder.dataset.folder);
    else if (row) xpOpen(row.dataset.doc);
  };
  content.oncontextmenu = (e) => {
    const row = e.target.closest("[data-doc]"),
      folder = e.target.closest("[data-folder]");
    e.preventDefault();
    if (row && !xp.selected.has(row.dataset.doc)) {
      xp.selected = new Set([row.dataset.doc]);
      content.querySelectorAll("[data-doc]").forEach((x) => x.classList.toggle("sel", xp.selected.has(x.dataset.doc)));
      xpRenderCommands();
      xpRenderStatus();
    }
    xpMenu(e.clientX, e.clientY, folder ? folder.dataset.folder : null, !!row);
  };
  content.onkeydown = (e) => {
    if (e.target.closest("input")) return;
    if (e.key === "Delete" && xp.selected.size) {
      e.preventDefault();
      xpDelete();
    } else if (e.key === "F2" && xp.selected.size === 1) {
      e.preventDefault();
      xpRename();
    } else if (e.key === "Enter" && xp.selected.size === 1) {
      e.preventDefault();
      xpOpenSelected();
    } else if (e.key === "a" && (e.ctrlKey || e.metaKey)) {
      e.preventDefault();
      xp.selected = new Set(xpItems().files.map((d) => d.id));
      xpRenderContent();
      xpRenderCommands();
      xpRenderStatus();
    }
  };
  win.onkeydown = (e) => {
    if (e.target.closest("input, select, textarea")) return;
    if (e.key === "Backspace") {
      e.preventDefault();
      xpUp();
    } else if (e.altKey && e.key === "ArrowLeft") {
      e.preventDefault();
      xpBack();
    } else if (e.altKey && e.key === "ArrowRight") {
      e.preventDefault();
      xpForward();
    } else if (e.key === "F5") {
      e.preventDefault();
      xpReload();
    }
  };
  // Drag files onto folders (tree, content, address bar) to move them.
  win.addEventListener("dragstart", (e) => {
    const row = e.target.closest?.("[data-doc]");
    if (!row) return;
    if (!xp.selected.has(row.dataset.doc)) xp.selected = new Set([row.dataset.doc]);
    e.dataTransfer.setData("application/x-cc-docs", JSON.stringify([...xp.selected]));
    e.dataTransfer.effectAllowed = "move";
  });
  let dragDepth = 0;
  const drop = document.getElementById("xpDrop"),
    isFiles = (e) => [...(e.dataTransfer?.types || [])].includes("Files");
  win.addEventListener("dragover", (e) => {
    const target = e.target.closest?.("[data-folder]");
    win.querySelectorAll(".drop-target").forEach((x) => x.classList.remove("drop-target"));
    if (target && (isFiles(e) || [...e.dataTransfer.types].includes("application/x-cc-docs")) && !["all", "pending"].includes(target.dataset.folder)) {
      e.preventDefault();
      target.classList.add("drop-target");
      document.getElementById("xpDropTarget").textContent = t("docs.dropInto", { name: xpFolderInfo(target.dataset.folder)?.name || "" });
    } else if (isFiles(e) && !["all", "pending"].includes(xp.folder)) {
      e.preventDefault();
      document.getElementById("xpDropTarget").textContent = t("docs.dropInto", { name: xpFolderInfo(xp.folder).name });
    }
  });
  win.addEventListener("dragenter", (e) => {
    if (isFiles(e)) {
      dragDepth++;
      drop.classList.add("on");
    }
  });
  win.addEventListener("dragleave", (e) => {
    if (isFiles(e) && --dragDepth <= 0) {
      dragDepth = 0;
      drop.classList.remove("on");
    }
  });
  win.addEventListener("drop", async (e) => {
    const target = e.target.closest?.("[data-folder]")?.dataset.folder;
    win.querySelectorAll(".drop-target").forEach((x) => x.classList.remove("drop-target"));
    drop.classList.remove("on");
    dragDepth = 0;
    const moving = e.dataTransfer.getData("application/x-cc-docs");
    if (moving) {
      e.preventDefault();
      if (target && !["all", "pending"].includes(target)) await xpMove(JSON.parse(moving), target);
      return;
    }
    if (e.dataTransfer.files?.length) {
      e.preventDefault();
      const into = target && !["all", "pending"].includes(target) ? target : xp.folder;
      if (!["all", "pending"].includes(into)) xpUpload([...e.dataTransfer.files], into);
    }
  });
  content.focus({ preventScroll: true });
}
document.addEventListener("click", (e) => {
  if (!e.target.closest?.("#xpMenu")) xpCloseMenu();
});
document.addEventListener("keydown", (e) => {
  if (e.key === "Escape") xpCloseMenu();
});

/* ---------- Context menu ---------- */
function xpMenu(x, y, folderId, onFile) {
  xpCloseMenu();
  const sel = xpSelectedDocs(),
    manage = sel.length && sel.every(xpCanManage),
    one = sel.length === 1 ? sel[0] : null;
  const item = (label, action, on = true, extra = "") => `<button type="button" data-action="${action}"${extra}${on ? "" : " disabled"}>${label}</button>`;
  const html = folderId
    ? item(xk("cmd.open"), "docs.menuGo", true, ` data-folder="${xpEsc(folderId)}"`) + item(xk("menu.uploadHere"), "docs.upload", true, ` data-folder="${xpEsc(folderId)}"`)
    : onFile
      ? item(xk("cmd.open"), "docs.open", !!one?.url) +
        item(xk("cmd.download"), "docs.download") +
        "<hr>" +
        item(xk("cmd.rename"), "docs.rename", !!one && manage) +
        item(xk("menu.moveTo"), "docs.moveDialog", manage) +
        item(xk("cmd.delete"), "docs.delete", manage) +
        (state.user.role === "customer" && one?.status === "Pending approval"
          ? "<hr>" + item(xk("cmd.approve"), "docs.review", true, ' data-status="Approved"') + item(xk("cmd.changes"), "docs.review", true, ' data-status="Changes requested"')
          : "")
      : item(xk("menu.uploadFiles"), "docs.upload", !["all", "pending"].includes(xp.folder)) +
        item(xk("menu.refresh"), "docs.reload") +
        "<hr>" +
        item(xk(xp.view === "details" ? "cmd.tiles" : "cmd.details"), "docs.view", true, ` data-view="${xp.view === "details" ? "tiles" : "details"}"`);
  document.body.insertAdjacentHTML(
    "beforeend",
    `<div class="xp-menu" id="xpMenu" role="menu" data-i18n="keys" style="left:${Math.min(x, innerWidth - 220)}px;top:${Math.min(y, innerHeight - 260)}px">${html}</div>`,
  );
}
function xpCloseMenu() {
  document.getElementById("xpMenu")?.remove();
}
actions.on("docs.menuGo", xpFromMenu((el) => xpGo(el.dataset.folder)));

/* ---------- Actions ---------- */
function xpOpen(id) {
  const d = xp.docs.find((x) => x.id === id);
  if (d?.url) window.open(d.url, "_blank", "noopener");
  else tToast(t("docs.noFile"), "error");
}
function xpOpenSelected() {
  const [d] = xpSelectedDocs();
  if (d) xpOpen(d.id);
}
function xpDownload() {
  for (const d of xpSelectedDocs().filter((x) => x.url)) {
    const a = document.createElement("a");
    a.href = d.url;
    a.download = d.filename;
    document.body.appendChild(a);
    a.click();
    a.remove();
  }
}
async function xpRename() {
  const [d] = xpSelectedDocs();
  if (!d) return;
  const name = await uiPrompt(t("docs.renamePrompt"), d.filename, { confirmLabel: t("docs.cmd.rename"), required: true });
  if (!name || name === d.filename) return;
  try {
    await api("/documents/" + d.id, { method: "PATCH", body: { action: "rename", filename: name } });
    tToast(t("docs.renamed"));
    xpReload();
  } catch (x) {
    toast(x.message, "error");
  }
}
async function xpDelete() {
  const sel = xpSelectedDocs();
  if (!sel.length) return;
  if (!(await uiConfirm(sel.length === 1 ? t("docs.deleteOne", { name: sel[0].filename }) : t("docs.deleteMany", { n: sel.length }), { confirmLabel: t("docs.cmd.delete") }))) return;
  try {
    for (const d of sel) await api("/documents/" + d.id, { method: "DELETE" });
    tToast(sel.length === 1 ? t("docs.deletedOne") : t("docs.deletedMany", { n: sel.length }));
    xp.selected.clear();
    xpReload();
  } catch (x) {
    toast(x.message, "error");
    xpReload();
  }
}
function xpFolderTarget(fid) {
  if (fid === "root") return { phaseId: "", taskId: "" };
  if (fid.startsWith("phase:")) return { phaseId: fid.slice(6), taskId: "" };
  const [, phaseId, taskId] = fid.split(":");
  return { phaseId, taskId };
}
async function xpMove(ids, fid) {
  try {
    for (const id of ids) await api("/documents/" + id, { method: "PATCH", body: { action: "move", ...xpFolderTarget(fid) } });
    tToast(t("docs.moved", { name: xpFolderInfo(fid).name }));
    xp.selected.clear();
    xpReload();
  } catch (x) {
    toast(x.message, "error");
    xpReload();
  }
}
function xpFolderOptions(current) {
  const p = xp.project;
  return `<option value="root"${current === "root" ? " selected" : ""}>${xk("projectFilesOption", { name: p.name })}</option>${p.phases
    .map(
      (ph) =>
        `<option value="phase:${xpEsc(ph.id)}"${current === "phase:" + ph.id ? " selected" : ""}>${xpEsc(ph.name)}</option>${(ph.tasks || [])
          .map((x) => `<option value="task:${xpEsc(ph.id)}:${xpEsc(x.id)}"${current === `task:${ph.id}:${x.id}` ? " selected" : ""}>&nbsp;&nbsp;&nbsp;› ${xpEsc(x.name)}</option>`)
          .join("")}`,
    )
    .join("")}`;
}
function xpMoveDialog() {
  const sel = xpSelectedDocs();
  if (!sel.length) return;
  modal(
    t("docs.moveTitle"),
    `<form id="xpMoveForm" class="modal-form" data-i18n="keys" data-action="docs.move"><p>${sel.length === 1 ? xpEsc(sel[0].filename) : xk("nFiles", { n: sel.length })}</p><label>${xk("destination")}<select name="folder" size="10" class="xp-folder-pick">${xpFolderOptions(xp.folder)}</select></label><button class="btn primary">${xk("moveHere")}</button></form>`,
  );
}
actions.on("docs.move", (form) => {
  const ids = xpSelectedDocs().map((d) => d.id);
  closeModal();
  xpMove(ids, new FormData(form).get("folder"));
});
async function xpReview(status) {
  const [d] = xpSelectedDocs();
  if (!d) return;
  let reviewNote = "";
  if (status !== "Approved") {
    reviewNote = await uiPrompt(t("docs.changesPrompt"), "", { confirmLabel: t("docs.send"), required: true });
    if (!reviewNote) return;
  }
  try {
    await api("/documents/" + d.id, { method: "PATCH", body: { status, reviewNote } });
    tToast(t(status === "Approved" ? "docs.approved" : "docs.changesSent"));
    xpReload();
  } catch (x) {
    toast(x.message, "error");
  }
}
/* Upload into a folder: from the button (dialog) or dropped files (straight in, with defaults). */
function xpUpload(files = null, fid = xp.folder) {
  if (["all", "pending"].includes(fid)) fid = "root";
  xp.pendingFiles = files;
  modal(
    t("docs.uploadTitle"),
    `<form id="xpUpForm" class="modal-form" data-i18n="keys" data-action="docs.uploadSubmit"><label>${xk("folder")}<select name="folder">${xpFolderOptions(fid)}</select></label>
    <label>${xk("filesLabel")}<input name="files" type="file" multiple${files ? "" : " required"}></label>${files ? `<p class="subtle">${xk("ready", { n: files.length, names: files.map((f) => f.name).join(", ") })}</p>` : ""}
    <div class="two"><label>${xk("category")}<select name="category">${XP_CATEGORIES.map((c) => `<option value="${xpEsc(c)}">${xk("categories." + c)}</option>`).join("")}</select></label><label class="choice-row"><input name="approvalRequired" type="checkbox" value="true"> ${xk("askApproval")}</label></div>
    <label>${xk("description")} <small class="subtle">${xk("optional")}</small><textarea name="description" rows="2" maxlength="2000"></textarea></label><div id="xpUpError" class="form-error" data-i18n="dom"></div><button class="btn primary">${xk("cmd.upload")}</button></form>`,
  );
}
actions.on("docs.uploadSubmit", async (form) => {
  const f = new FormData(form),
    list = xp.pendingFiles || [...form.elements.files.files],
    target = xpFolderTarget(f.get("folder"));
  if (!list.length) return void (document.getElementById("xpUpError").textContent = t("docs.chooseFile"));
  const btn = form.querySelector("button.primary");
  btn.disabled = true;
  btn.textContent = t("docs.uploading");
  try {
    for (const file of list) {
      const up = await uploadFile(file);
      await api(`/projects/${xp.project.id}/documents`, {
        method: "POST",
        body: { filename: file.name, url: up.url, size: up.size || file.size, ...target, category: f.get("category"), description: f.get("description"), approvalRequired: f.get("approvalRequired") === "true" },
      });
    }
    closeModal();
    tToast(list.length === 1 ? t("docs.uploadedOne") : t("docs.uploadedMany", { n: list.length }));
    if (f.get("folder") !== xp.folder) xpGo(f.get("folder"));
    await xpReload();
  } catch (x) {
    btn.disabled = false;
    btn.textContent = t("docs.cmd.upload");
    document.getElementById("xpUpError").textContent = x.message;
  }
});
// Commands from the command bar and from the context menu
actions.on("docs.upload", xpFromMenu((el) => xpUpload(null, el.dataset.folder || xp.folder)));
actions.on("docs.open", xpFromMenu(() => xpOpenSelected()));
actions.on("docs.download", xpFromMenu(() => xpDownload()));
actions.on("docs.rename", xpFromMenu(() => xpRename()));
actions.on("docs.moveDialog", xpFromMenu(() => xpMoveDialog()));
actions.on("docs.delete", xpFromMenu(() => xpDelete()));
actions.on("docs.review", xpFromMenu((el) => xpReview(el.dataset.status)));

// Leaving the explorer restores the normal layout.
window.addEventListener("hashchange", () => {
  if (!/\/documents(\?|$)/.test(location.hash)) document.body.classList.remove("xp-max");
  xpCloseMenu();
});
