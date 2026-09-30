/* Project file manager in the style of Windows Explorer. Every project phase is a folder and every
   task a subfolder below it — created automatically from the project plan. Files can be uploaded
   into the open folder (button or drag & drop from the desktop), moved by dragging onto a folder,
   renamed, deleted, approved, and opened. The window fills the page and can be maximized. */
const xpEsc = (v) => esc(v ?? "");
const XP_TYPES = {
  pdf: "PDF document",
  doc: "Word document",
  docx: "Word document",
  xls: "Excel worksheet",
  xlsx: "Excel worksheet",
  csv: "CSV file",
  png: "PNG image",
  jpg: "JPEG image",
  jpeg: "JPEG image",
  dwg: "CAD drawing",
  dxf: "CAD drawing",
  zip: "ZIP archive",
  txt: "Text document",
};
const xpExt = (n) => (String(n).match(/\.([a-z0-9]+)$/i)?.[1] || "").toLowerCase();
const xpType = (n) => XP_TYPES[xpExt(n)] || (xpExt(n) ? xpExt(n).toUpperCase() + " file" : "File");
const xpSize = (b) =>
  !b
    ? "—"
    : b < 1024
      ? b + " B"
      : b < 1048576
        ? Math.round(b / 1024) + " KB"
        : (b / 1048576).toFixed(1) + " MB";
const xpWhen = (d) =>
  d
    ? new Date(d).toLocaleString(document.documentElement.lang === "de" ? "de-DE" : "en-GB", {
        day: "2-digit",
        month: "2-digit",
        year: "numeric",
        hour: "2-digit",
        minute: "2-digit",
      })
    : "";
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

let xp = null; // {project, docs, folder, selected:Set, view, sort, dir, history, future, q}

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
      t = ph?.tasks?.find((x) => x.id === tid);
    return t ? { kind: "task", phase: ph, task: t, name: t.name } : null;
  }
  if (fid === "all") return { kind: "view", name: "All files" };
  if (fid === "pending") return { kind: "view", name: "Waiting for approval" };
  return { kind: "root", name: p.name };
}
const xpParent = (fid) =>
  fid.startsWith("task:") ? "phase:" + fid.split(":")[1] : fid.startsWith("phase:") ? "root" : null;
function xpFilesIn(fid) {
  const d = xp.docs;
  if (fid === "all") return d;
  if (fid === "pending") return d.filter((x) => x.status === "Pending approval");
  if (fid === "root") return d.filter((x) => !x.phaseId);
  if (fid.startsWith("phase:")) return d.filter((x) => x.phaseId === fid.slice(6) && !x.taskId);
  const [, phid, tid] = fid.split(":");
  return d.filter((x) => x.phaseId === phid && x.taskId === tid);
}
const xpCountDeep = (fid) =>
  fid === "root"
    ? xp.docs.length
    : fid.startsWith("phase:")
      ? xp.docs.filter((x) => x.phaseId === fid.slice(6)).length
      : xpFilesIn(fid).length;
function xpSubfolders(fid) {
  if (fid === "root")
    return xp.project.phases.map((ph) => ({
      id: "phase:" + ph.id,
      name: ph.name,
      meta: `${(ph.tasks || []).length} task folder(s)`,
      status: ph.status,
      when: ph.dueDate,
    }));
  if (fid.startsWith("phase:")) {
    const ph = xp.project.phases.find((x) => x.id === fid.slice(6));
    return (ph?.tasks || []).map((t) => ({
      id: `task:${ph.id}:${t.id}`,
      name: t.name,
      meta: "Task folder",
      status: t.status,
      when: t.dueDate,
    }));
  }
  return [];
}

/* ---------- Render ---------- */
async function wfDocuments(pid) {
  const q = new URLSearchParams(location.hash.split("?")[1] || "");
  const [{ project }, { documents = [] }] = await Promise.all([
    api("/projects/" + pid),
    api(`/projects/${pid}/documents`),
  ]);
  // Older links used ?phase=&task= or ?folder=task:<id>; map them onto the folder tree.
  let folder =
    q.get("folder") ||
    (q.get("task")
      ? `task:${q.get("phase")}:${q.get("task")}`
      : q.get("phase")
        ? "phase:" + q.get("phase")
        : "root");
  if (/^task:[^:]+$/.test(folder)) {
    const tid = folder.slice(5),
      ph = project.phases.find((x) => (x.tasks || []).some((t) => t.id === tid));
    folder = ph ? `task:${ph.id}:${tid}` : "root";
  }
  const keep = xp && xp.project.id === pid ? xp : null;
  xp = {
    project,
    docs: documents,
    folder: "root",
    selected: new Set(),
    view: keep?.view || localStorage.getItem("cc_xp_view") || "details",
    sort: keep?.sort || "name",
    dir: keep?.dir || 1,
    history: keep?.history || [],
    future: keep?.future || [],
    q: "",
    expanded:
      keep?.expanded ||
      new Set(["root", ...(folder.startsWith("task:") ? ["phase:" + folder.split(":")[1]] : [])]),
  };
  xp.folder = xpFolderInfo(folder) ? folder : "root";
  app.innerHTML = dashboardShell(
    state.user.role,
    "projects",
    `<div class="xp-page"><div class="xp-window" id="xpWindow">
    <div class="xp-titlebar"><a class="xp-back-link" href="#/${state.user.role}/projects/${project.id}">← ${xpEsc(project.name)}</a><b>Project files</b><div class="xp-winbtns"><button type="button" class="xp-winbtn" id="xpMax" title="Maximize window" onclick="xpToggleMax()">${document.body.classList.contains("xp-max") ? "❐" : "□"}</button></div></div>
    <div class="xp-navbar"><div class="xp-navbtns"><button type="button" class="xp-nav" id="xpBackBtn" title="Back (Alt+←)" onclick="xpBack()">←</button><button type="button" class="xp-nav" id="xpFwdBtn" title="Forward (Alt+→)" onclick="xpForward()">→</button><button type="button" class="xp-nav" id="xpUpBtn" title="Up one level (Backspace)" onclick="xpUp()">↑</button><button type="button" class="xp-nav" title="Refresh (F5)" onclick="xpReload()">⟳</button></div>
      <div class="xp-address" id="xpAddress"></div><label class="xp-search">${uiIcon("search")}<input id="xpSearch" placeholder="Search project files" autocomplete="off"></label></div>
    <div class="xp-commandbar" id="xpCommands"></div>
    <div class="xp-body"><nav class="xp-tree" id="xpTree" aria-label="Folders"></nav><section class="xp-content" id="xpContent" tabindex="0" aria-label="Files"></section></div>
    <div class="xp-statusbar" id="xpStatus"></div>
    <div class="xp-drop" id="xpDrop"><div>${uiIcon("folder", "ui-icon")}<b>Drop files to upload</b><small id="xpDropTarget"></small></div></div>
  </div></div>`,
  );
  xpBind();
  xpRenderAll();
}
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
      count = xpCountDeep(fid);
    return `<div class="xp-node ${xp.folder === fid ? "active" : ""}" style="--d:${depth}" data-folder="${fid}" role="treeitem" aria-expanded="${children ? open : ""}" draggable="false">
      <button type="button" class="xp-twisty ${children ? "" : "none"}" onclick="event.stopPropagation();xpToggleNode('${fid}')" tabindex="-1">${children ? (open ? "▾" : "▸") : ""}</button>${icon}<span class="xp-node-name">${xpEsc(name)}</span>${count ? `<span class="xp-node-count">${count}</span>` : ""}</div>${children && open ? children() : ""}`;
  };
  const p = xp.project,
    pending = xp.docs.filter((x) => x.status === "Pending approval").length;
  document.getElementById("xpTree").innerHTML = `<div class="xp-tree-group">Quick access</div>
    <div class="xp-node ${xp.folder === "all" ? "active" : ""}" style="--d:0" data-folder="all"><span class="xp-twisty none"></span>${uiIcon("file", "ui-icon xp-qicon")}<span class="xp-node-name">All files</span><span class="xp-node-count">${xp.docs.length}</span></div>
    <div class="xp-node ${xp.folder === "pending" ? "active" : ""}" style="--d:0" data-folder="pending"><span class="xp-twisty none"></span>${uiIcon("approvals", "ui-icon xp-qicon")}<span class="xp-node-name">Waiting for approval</span>${pending ? `<span class="xp-node-count warn">${pending}</span>` : ""}</div>
    <div class="xp-tree-group">This project</div>
    ${node("root", p.name, 0, () => p.phases.map((ph) => node("phase:" + ph.id, ph.name, 1, (ph.tasks || []).length ? () => ph.tasks.map((t) => node(`task:${ph.id}:${t.id}`, t.name, 2, null)).join("") : null)).join(""))}`;
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
  document.getElementById("xpAddress").innerHTML =
    `${xpFolderIcon()}<span class="xp-crumb-sep">›</span>${chain.map((fid, i) => `<button type="button" class="xp-crumb" data-folder="${fid}" onclick="xpGo('${fid}')">${xpEsc(fid === "root" ? xp.project.name : xpFolderInfo(fid)?.name)}</button>${i < chain.length - 1 ? '<span class="xp-crumb-sep">›</span>' : ""}`).join("")}`;
  document.getElementById("xpBackBtn").disabled = !xp.history.length;
  document.getElementById("xpFwdBtn").disabled = !xp.future.length;
  document.getElementById("xpUpBtn").disabled = !xpParent(xp.folder);
}
function xpSelectedDocs() {
  return xp.docs.filter((d) => xp.selected.has(d.id));
}
const xpCanManage = (d) =>
  state.user.role === "customer" ||
  d.uploadedBy === state.user.id ||
  (state.user.role === "supplier" && d.supplierId === state.user.supplierId);
function xpRenderCommands() {
  const sel = xpSelectedDocs(),
    one = sel.length === 1 ? sel[0] : null,
    manage = sel.length && sel.every(xpCanManage);
  const canReview = state.user.role === "customer" && one?.status === "Pending approval";
  const btn = (label, icon, fn, on = true, cls = "") =>
    `<button type="button" class="xp-cmd ${cls}" onclick="${fn}" ${on ? "" : "disabled"}><span aria-hidden="true">${icon}</span>${label}</button>`;
  document.getElementById("xpCommands").innerHTML =
    `${btn("Upload", "⭱", "xpUpload()", !["all", "pending"].includes(xp.folder), "primary")}<span class="xp-cmd-sep"></span>
    ${btn("Open", "↗", "xpOpenSelected()", !!one?.url)}${btn(
      "Download",
      "⭳",
      "xpDownload()",
      sel.some((d) => d.url),
    )}${btn("Rename", "✎", "xpRename()", !!one && manage)}${btn("Move to", "➜", "xpMoveDialog()", manage)}${btn("Delete", "🗑", "xpDelete()", manage, "danger")}
    ${canReview ? `<span class="xp-cmd-sep"></span>${btn("Approve", "✓", `xpReview('Approved')`, true, "ok")}${btn("Request changes", "↺", `xpReview('Changes requested')`)}` : ""}
    <span class="xp-cmd-spacer"></span>
    <label class="xp-sort">Sort<select id="xpSort">${[
      ["name", "Name"],
      ["date", "Date modified"],
      ["type", "Type"],
      ["size", "Size"],
      ["status", "Status"],
    ]
      .map(([v, l]) => `<option value="${v}" ${xp.sort === v ? "selected" : ""}>${l}</option>`)
      .join("")}</select></label>
    <div class="xp-views" role="group" aria-label="View"><button type="button" class="${xp.view === "details" ? "on" : ""}" title="Details" onclick="xpSetView('details')">☰</button><button type="button" class="${xp.view === "tiles" ? "on" : ""}" title="Large icons" onclick="xpSetView('tiles')">▦</button></div>`;
  document.getElementById("xpSort").onchange = (e) => {
    xp.sort = e.target.value;
    xpRenderContent();
  };
}
function xpItems() {
  const q = xp.q.toLowerCase();
  // A search looks through every folder of the project, like Explorer's search.
  const files = q
    ? xp.docs.filter((d) =>
        `${d.filename} ${d.description || ""} ${d.category || ""} ${d.phaseName || ""} ${d.taskName || ""}`
          .toLowerCase()
          .includes(q),
      )
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
  return s
    ? `<span class="status ${s === "Approved" ? "completed" : s === "Pending approval" ? "submitted" : /changes|rejected/i.test(s) ? "rejected" : "active"}">${xpEsc(s)}</span>`
    : "";
}
function xpRenderContent() {
  const { folders, files } = xpItems(),
    el = document.getElementById("xpContent"),
    inSearch = !!xp.q;
  const head = (k, l) =>
    `<button type="button" class="xp-col ${xp.sort === k ? "sorted" : ""}" onclick="xpSortBy('${k}')">${l}${xp.sort === k ? (xp.dir > 0 ? " ▴" : " ▾") : ""}</button>`;
  if (!folders.length && !files.length) {
    el.innerHTML = `<div class="xp-empty">${xpFolderIcon(true)}<b>${inSearch ? "No files match your search." : "This folder is empty."}</b>${inSearch || ["all", "pending"].includes(xp.folder) ? "" : "<small>Drag files here from your computer or use Upload.</small>"}</div>`;
    return;
  }
  if (xp.view === "tiles") {
    el.innerHTML = `<div class="xp-tiles">${folders.map((f) => `<div class="xp-tile" data-folder="${f.id}" tabindex="-1">${xpFolderIcon(true)}<b>${xpEsc(f.name)}</b><small>${xpCountDeep(f.id)} file(s)</small></div>`).join("")}${files.map((d) => `<div class="xp-tile ${xp.selected.has(d.id) ? "sel" : ""}" data-doc="${d.id}" draggable="${xpCanManage(d)}" tabindex="-1">${xpFileIcon(d.filename, true)}<b title="${xpEsc(d.filename)}">${xpEsc(d.filename)}</b><small>${xpStatusTag(d.status)}</small></div>`).join("")}</div>`;
    return;
  }
  el.innerHTML = `<div class="xp-table" role="grid"><div class="xp-row xp-head" role="row">${head("name", "Name")}${head("date", "Date modified")}${head("type", "Type")}${head("size", "Size")}${head("status", "Status")}<span class="xp-col">${inSearch ? "Folder" : "Shared by"}</span></div>
    ${folders.map((f) => `<div class="xp-row" role="row" data-folder="${f.id}" tabindex="-1"><span class="xp-name">${xpFolderIcon()}<b>${xpEsc(f.name)}</b></span><span>${f.when ? date(f.when) : ""}</span><span>File folder</span><span>${xpCountDeep(f.id)} file(s)</span><span>${f.status ? xpStatusTag(f.status) : ""}</span><span class="subtle">${xpEsc(f.meta)}</span></div>`).join("")}
    ${files.map((d) => `<div class="xp-row ${xp.selected.has(d.id) ? "sel" : ""}" role="row" data-doc="${d.id}" draggable="${xpCanManage(d)}" tabindex="-1" title="${xpEsc(d.description || "")}"><span class="xp-name">${xpFileIcon(d.filename)}<b>${xpEsc(d.filename)}</b>${d.version > 1 ? `<small class="xp-ver">v${d.version}</small>` : ""}</span><span>${xpWhen(d.updatedAt || d.uploadedAt)}</span><span>${xpEsc(xpType(d.filename))}</span><span>${xpSize(d.size)}</span><span>${xpStatusTag(d.status)}</span><span class="subtle">${inSearch ? xpEsc([d.phaseName || "Project files", d.taskName].filter(Boolean).join(" › ")) : xpEsc(d.supplierCompany || d.ownerName || (d.supplierId ? "Supplier" : "Customer"))}</span></div>`).join("")}</div>`;
}
function xpRenderStatus() {
  const { folders, files } = xpItems(),
    sel = xpSelectedDocs(),
    size = sel.reduce((a, d) => a + (d.size || 0), 0);
  const one = sel.length === 1 ? sel[0] : null;
  document.getElementById("xpStatus").innerHTML =
    `<span>${folders.length + files.length} item(s)</span>${sel.length ? `<span>${sel.length} selected${size ? " · " + xpSize(size) : ""}</span>` : ""}${one ? `<span class="xp-status-detail">${xpEsc(one.category || "")}${one.description ? " · " + xpEsc(one.description) : ""}${one.reviewNote ? " · Review: " + xpEsc(one.reviewNote) : ""}</span>` : ""}<span class="xp-status-hint">Double-click to open · Drag files onto a folder to move them · Drop files from your computer to upload</span>`;
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
  history.replaceState(
    null,
    "",
    `#/${state.user.role}/projects/${xp.project.id}/documents?folder=${encodeURIComponent(fid)}`,
  );
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
function xpToggleNode(fid) {
  xp.expanded.has(fid) ? xp.expanded.delete(fid) : xp.expanded.add(fid);
  xpRenderTree();
}
function xpSortBy(k) {
  xp.dir = xp.sort === k ? -xp.dir : 1;
  xp.sort = k;
  xpRenderCommands();
  xpRenderContent();
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
function xpToggleMax() {
  document.body.classList.toggle("xp-max");
  const b = document.getElementById("xpMax");
  if (b) {
    b.textContent = document.body.classList.contains("xp-max") ? "❐" : "□";
    b.title = document.body.classList.contains("xp-max") ? "Restore window" : "Maximize window";
  }
}

/* ---------- Selection & events ---------- */
function xpBind() {
  const content = document.getElementById("xpContent"),
    tree = document.getElementById("xpTree"),
    win = document.getElementById("xpWindow");
  document.getElementById("xpSearch").oninput = (e) => {
    xp.q = e.target.value.trim();
    xp.selected.clear();
    xpRenderContent();
    xpRenderStatus();
    xpRenderCommands();
  };
  tree.onclick = (e) => {
    const n = e.target.closest("[data-folder]");
    if (n) xpGo(n.dataset.folder);
  };
  content.onclick = (e) => {
    const row = e.target.closest("[data-doc]"),
      folder = e.target.closest("[data-folder]");
    if (folder) {
      xp.selected.clear();
      content.querySelectorAll(".sel").forEach((x) => x.classList.remove("sel"));
      folder.classList.add("sel");
      xpRenderCommands();
      xpRenderStatus();
      return;
    }
    if (!row) {
      xp.selected.clear();
    } else if (e.ctrlKey || e.metaKey) {
      xp.selected.has(row.dataset.doc)
        ? xp.selected.delete(row.dataset.doc)
        : xp.selected.add(row.dataset.doc);
    } else if (e.shiftKey && xp.anchor) {
      const ids = xpItems().files.map((d) => d.id),
        a = ids.indexOf(xp.anchor),
        b = ids.indexOf(row.dataset.doc);
      xp.selected = new Set(ids.slice(Math.min(a, b), Math.max(a, b) + 1));
    } else {
      xp.selected = new Set([row.dataset.doc]);
    }
    if (row && !e.shiftKey) xp.anchor = row.dataset.doc;
    content
      .querySelectorAll("[data-doc]")
      .forEach((x) => x.classList.toggle("sel", xp.selected.has(x.dataset.doc)));
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
      content
        .querySelectorAll("[data-doc]")
        .forEach((x) => x.classList.toggle("sel", xp.selected.has(x.dataset.doc)));
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
    if (!xp.selected.has(row.dataset.doc)) {
      xp.selected = new Set([row.dataset.doc]);
    }
    e.dataTransfer.setData("application/x-cc-docs", JSON.stringify([...xp.selected]));
    e.dataTransfer.effectAllowed = "move";
  });
  let dragDepth = 0;
  const drop = document.getElementById("xpDrop"),
    isFiles = (e) => [...(e.dataTransfer?.types || [])].includes("Files");
  win.addEventListener("dragover", (e) => {
    const target = e.target.closest?.("[data-folder]");
    win.querySelectorAll(".drop-target").forEach((x) => x.classList.remove("drop-target"));
    if (
      target &&
      (isFiles(e) || [...e.dataTransfer.types].includes("application/x-cc-docs")) &&
      !["all", "pending"].includes(target.dataset.folder)
    ) {
      e.preventDefault();
      target.classList.add("drop-target");
      document.getElementById("xpDropTarget").textContent =
        "into " + (xpFolderInfo(target.dataset.folder)?.name || "");
    } else if (isFiles(e) && !["all", "pending"].includes(xp.folder)) {
      e.preventDefault();
      document.getElementById("xpDropTarget").textContent = "into " + xpFolderInfo(xp.folder).name;
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
  if (!window.xpMenuBound) {
    window.xpMenuBound = true;
    document.addEventListener("click", xpCloseMenu);
    document.addEventListener("keydown", (e) => {
      if (e.key === "Escape") xpCloseMenu();
    });
  }
  content.focus({ preventScroll: true });
}

/* ---------- Context menu ---------- */
function xpMenu(x, y, folderId, onFile) {
  xpCloseMenu();
  const sel = xpSelectedDocs(),
    manage = sel.length && sel.every(xpCanManage),
    one = sel.length === 1 ? sel[0] : null;
  const item = (label, fn, on = true) =>
    `<button type="button" ${on ? "" : "disabled"} onclick="xpCloseMenu();${fn}">${label}</button>`;
  const html = folderId
    ? item("Open", `xpGo('${folderId}')`) + item("Upload into this folder", `xpUpload(null,'${folderId}')`)
    : onFile
      ? item("Open", "xpOpenSelected()", !!one?.url) +
        item("Download", "xpDownload()") +
        "<hr>" +
        item("Rename", "xpRename()", !!one && manage) +
        item("Move to…", "xpMoveDialog()", manage) +
        item("Delete", "xpDelete()", manage) +
        (state.user.role === "customer" && one?.status === "Pending approval"
          ? "<hr>" +
            item("Approve", `xpReview('Approved')`) +
            item("Request changes", `xpReview('Changes requested')`)
          : "")
      : item("Upload files", "xpUpload()", !["all", "pending"].includes(xp.folder)) +
        item("Refresh", "xpReload()") +
        "<hr>" +
        item(
          xp.view === "details" ? "Large icons" : "Details",
          `xpSetView('${xp.view === "details" ? "tiles" : "details"}')`,
        );
  document.body.insertAdjacentHTML(
    "beforeend",
    `<div class="xp-menu" id="xpMenu" role="menu" style="left:${Math.min(x, innerWidth - 220)}px;top:${Math.min(y, innerHeight - 260)}px">${html}</div>`,
  );
}
function xpCloseMenu() {
  document.getElementById("xpMenu")?.remove();
}

/* ---------- Actions ---------- */
function xpOpen(id) {
  const d = xp.docs.find((x) => x.id === id);
  if (d?.url) window.open(d.url, "_blank", "noopener");
  else toast("This entry has no file attached", "error");
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
  const name = await uiPrompt("New file name", d.filename, { confirmLabel: "Rename", required: true });
  if (!name || name === d.filename) return;
  try {
    await api("/documents/" + d.id, { method: "PATCH", body: { action: "rename", filename: name } });
    toast("Renamed");
    xpReload();
  } catch (x) {
    toast(x.message, "error");
  }
}
async function xpDelete() {
  const sel = xpSelectedDocs();
  if (!sel.length) return;
  if (
    !(await uiConfirm(
      sel.length === 1
        ? `Delete "${sel[0].filename}" from the project?`
        : `Delete ${sel.length} files from the project?`,
      { confirmLabel: "Delete" },
    ))
  )
    return;
  try {
    for (const d of sel) await api("/documents/" + d.id, { method: "DELETE" });
    toast(sel.length === 1 ? "File deleted" : `${sel.length} files deleted`);
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
    for (const id of ids)
      await api("/documents/" + id, { method: "PATCH", body: { action: "move", ...xpFolderTarget(fid) } });
    toast(`Moved to ${xpFolderInfo(fid).name}`);
    xp.selected.clear();
    xpReload();
  } catch (x) {
    toast(x.message, "error");
    xpReload();
  }
}
function xpFolderOptions(current) {
  const p = xp.project;
  return `<option value="root" ${current === "root" ? "selected" : ""}>${xpEsc(p.name)} (project files)</option>${p.phases.map((ph) => `<option value="phase:${ph.id}" ${current === "phase:" + ph.id ? "selected" : ""}>${xpEsc(ph.name)}</option>${(ph.tasks || []).map((t) => `<option value="task:${ph.id}:${t.id}" ${current === `task:${ph.id}:${t.id}` ? "selected" : ""}>&nbsp;&nbsp;&nbsp;› ${xpEsc(t.name)}</option>`).join("")}`).join("")}`;
}
function xpMoveDialog() {
  const sel = xpSelectedDocs();
  if (!sel.length) return;
  modal(
    "Move to folder",
    `<form id="xpMoveForm" class="modal-form"><p>${sel.length === 1 ? xpEsc(sel[0].filename) : sel.length + " files"}</p><label>Destination<select name="folder" size="10" class="xp-folder-pick">${xpFolderOptions(xp.folder)}</select></label><button class="btn primary">Move here</button></form>`,
  );
  document.getElementById("xpMoveForm").onsubmit = (e) => {
    e.preventDefault();
    closeModal();
    xpMove(
      sel.map((d) => d.id),
      new FormData(e.target).get("folder"),
    );
  };
}
async function xpReview(status) {
  const [d] = xpSelectedDocs();
  if (!d) return;
  let reviewNote = "";
  if (status !== "Approved") {
    reviewNote = await uiPrompt("What needs to be changed in this document?", "", {
      confirmLabel: "Send",
      required: true,
    });
    if (!reviewNote) return;
  }
  try {
    await api("/documents/" + d.id, { method: "PATCH", body: { status, reviewNote } });
    toast(status === "Approved" ? "Document approved" : "Change request sent");
    xpReload();
  } catch (x) {
    toast(x.message, "error");
  }
}
/* Upload into a folder: from the button (dialog) or dropped files (straight in, with defaults). */
async function xpUpload(files = null, fid = xp.folder) {
  if (["all", "pending"].includes(fid)) fid = "root";
  const cats = [
    "Engineering",
    "Planning",
    "Quality & acceptance",
    "Safety",
    "Commercial",
    "Handover",
    "General",
  ];
  modal(
    "Upload files",
    `<form id="xpUpForm" class="modal-form"><label>Folder<select name="folder">${xpFolderOptions(fid)}</select></label>
    <label>Files<input name="files" type="file" multiple ${files ? "" : "required"}></label>${files ? `<p class="subtle">${files.length} file(s) ready: ${files.map((f) => xpEsc(f.name)).join(", ")}</p>` : ""}
    <div class="two"><label>Category<select name="category">${cats.map((c) => `<option>${c}</option>`).join("")}</select></label><label class="choice-row"><input name="approvalRequired" type="checkbox" value="true"> Ask the customer to approve</label></div>
    <label>Description <small class="subtle">optional</small><textarea name="description" rows="2" maxlength="2000"></textarea></label><div id="xpUpError" class="form-error"></div><button class="btn primary">Upload</button></form>`,
  );
  document.getElementById("xpUpForm").onsubmit = async (e) => {
    e.preventDefault();
    const f = new FormData(e.target),
      list = files || [...e.target.elements.files.files],
      target = xpFolderTarget(f.get("folder"));
    if (!list.length) {
      document.getElementById("xpUpError").textContent = "Choose at least one file";
      return;
    }
    const btn = e.target.querySelector("button.primary");
    btn.disabled = true;
    btn.textContent = "Uploading…";
    try {
      for (const file of list) {
        const up = await uploadFile(file);
        await api(`/projects/${xp.project.id}/documents`, {
          method: "POST",
          body: {
            filename: file.name,
            url: up.url,
            size: up.size || file.size,
            ...target,
            category: f.get("category"),
            description: f.get("description"),
            approvalRequired: f.get("approvalRequired") === "true",
          },
        });
      }
      closeModal();
      toast(list.length === 1 ? "File uploaded" : `${list.length} files uploaded`);
      if (f.get("folder") !== xp.folder) xpGo(f.get("folder"));
      await xpReload();
    } catch (x) {
      btn.disabled = false;
      btn.textContent = "Upload";
      document.getElementById("xpUpError").textContent = x.message;
    }
  };
}
// The project page's "Upload document" shortcut opens the same dialog in the explorer.
wfUploadDocument = async function (pid) {
  if (!xp || xp.project.id !== pid) await wfDocuments(pid);
  xpUpload();
};

// Leaving the explorer restores the normal layout.
window.addEventListener("hashchange", () => {
  if (!/\/documents(\?|$)/.test(location.hash)) document.body.classList.remove("xp-max");
  xpCloseMenu();
});
