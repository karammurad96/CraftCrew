/* UI refresh: sidebar icons, notification bell and small interaction polish.
   Purely presentational; it enhances whatever the page layers render. */
const UI_ICON_PATHS = {
  dashboard:
    '<rect x="3" y="3" width="7" height="9" rx="1.5"/><rect x="14" y="3" width="7" height="5" rx="1.5"/><rect x="14" y="12" width="7" height="9" rx="1.5"/><rect x="3" y="16" width="7" height="5" rx="1.5"/>',
  projects: '<path d="M3 7a2 2 0 0 1 2-2h4l2 2h8a2 2 0 0 1 2 2v8a2 2 0 0 1-2 2H5a2 2 0 0 1-2-2z"/>',
  work: '<path d="M9 5H7a2 2 0 0 0-2 2v12a2 2 0 0 0 2 2h10a2 2 0 0 0 2-2V7a2 2 0 0 0-2-2h-2"/><rect x="9" y="3" width="6" height="4" rx="1"/><path d="m9 14 2 2 4-4"/>',
  offers:
    '<path d="M12 3v18"/><path d="M5 7h14"/><path d="m5 7-3 7a4 4 0 0 0 6 0z"/><path d="m19 7-3 7a4 4 0 0 0 6 0z"/>',
  search: '<circle cx="11" cy="11" r="7"/><path d="m20 20-3.5-3.5"/>',
  catalog:
    '<rect x="3" y="7" width="18" height="13" rx="2"/><path d="M8 7V5a2 2 0 0 1 2-2h4a2 2 0 0 1 2 2v2"/><path d="M3 13h18"/>',
  invoices:
    '<path d="M6 2h9l5 5v13a2 2 0 0 1-2 2H6a2 2 0 0 1-2-2V4a2 2 0 0 1 2-2z"/><path d="M14 2v6h6"/><path d="M8 13h8M8 17h5"/>',
  inbox:
    '<path d="M22 12h-6l-2 3h-4l-2-3H2"/><path d="M5.5 5h13L22 12v6a2 2 0 0 1-2 2H4a2 2 0 0 1-2-2v-6z"/>',
  time: '<circle cx="12" cy="12" r="9"/><path d="M12 7v5l3 2"/>',
  messages: '<path d="M21 15a2 2 0 0 1-2 2H8l-5 4V5a2 2 0 0 1 2-2h14a2 2 0 0 1 2 2z"/>',
  settings:
    '<circle cx="12" cy="12" r="3"/><path d="M19.4 15a1.7 1.7 0 0 0 .3 1.8l.1.1a2 2 0 1 1-2.8 2.8l-.1-.1a1.7 1.7 0 0 0-1.8-.3 1.7 1.7 0 0 0-1 1.5V21a2 2 0 1 1-4 0v-.1a1.7 1.7 0 0 0-1.1-1.5 1.7 1.7 0 0 0-1.8.3l-.1.1a2 2 0 1 1-2.8-2.8l.1-.1a1.7 1.7 0 0 0 .3-1.8 1.7 1.7 0 0 0-1.5-1H3a2 2 0 1 1 0-4h.1a1.7 1.7 0 0 0 1.5-1.1 1.7 1.7 0 0 0-.3-1.8l-.1-.1a2 2 0 1 1 2.8-2.8l.1.1a1.7 1.7 0 0 0 1.8.3H9a1.7 1.7 0 0 0 1-1.5V3a2 2 0 1 1 4 0v.1a1.7 1.7 0 0 0 1 1.5 1.7 1.7 0 0 0 1.8-.3l.1-.1a2 2 0 1 1 2.8 2.8l-.1.1a1.7 1.7 0 0 0-.3 1.8V9a1.7 1.7 0 0 0 1.5 1H21a2 2 0 1 1 0 4h-.1a1.7 1.7 0 0 0-1.5 1z"/>',
  requests: '<path d="M4 4h16v12H7l-3 3z"/><path d="M9 9h6M9 12h4"/>',
  vetting: '<path d="M12 3 4 6v6c0 5 3.4 8.4 8 9 4.6-.6 8-4 8-9V6z"/><path d="m9 12 2 2 4-4"/>',
  users:
    '<circle cx="9" cy="8" r="3.5"/><path d="M2.5 20a6.5 6.5 0 0 1 13 0"/><path d="M16 4.5a3.5 3.5 0 0 1 0 7M18 14a6 6 0 0 1 3.5 6"/>',
  billing: '<rect x="2" y="5" width="20" height="14" rx="2"/><path d="M2 10h20M6 15h4"/>',
  platform: '<path d="M4 21v-7M4 10V3M12 21v-9M12 8V3M20 21v-5M20 12V3M1 14h6M9 8h6M17 16h6"/>',
  reports: '<path d="M3 3v18h18"/><path d="M7 15v-3M12 15V8M17 15v-6"/>',
  audit: '<path d="M3 12a9 9 0 1 0 3-6.7L3 8"/><path d="M3 3v5h5"/><path d="M12 7v5l4 2"/>',
  disputes:
    '<path d="M10.3 3.9 1.8 18a2 2 0 0 0 1.7 3h17a2 2 0 0 0 1.7-3L13.7 3.9a2 2 0 0 0-3.4 0z"/><path d="M12 9v4M12 17h.01"/>',
  bell: '<path d="M6 8a6 6 0 1 1 12 0c0 7 3 9 3 9H3s3-2 3-9"/><path d="M10.3 21a1.9 1.9 0 0 0 3.4 0"/>',
  logout: '<path d="M9 21H5a2 2 0 0 1-2-2V5a2 2 0 0 1 2-2h4"/><path d="m16 17 5-5-5-5M21 12H9"/>',
  help: '<circle cx="12" cy="12" r="9"/><path d="M9.1 9a3 3 0 0 1 5.8 1c0 2-3 3-3 3M12 17h.01"/>',
};
const uiIcon = (name, cls = "ui-icon") =>
  `<svg class="${cls}" viewBox="0 0 24 24" aria-hidden="true" focusable="false">${UI_ICON_PATHS[name] || ""}</svg>`;
const UI_NAV_ICONS = {
  analytics: "reports",
  dashboard: "dashboard",
  projects: "projects",
  phases: "work",
  offers: "offers",
  bids: "offers",
  suppliers: "search",
  invoices: "invoices",
  inbox: "inbox",
  time: "time",
  messages: "messages",
  profile: "settings",
  requests: "requests",
  orders: "offers",
  packages: "catalog",
  site: "platform",
  fees: "invoices",
  business: "reports",
  stripe: "invoices",
  applications: "vetting",
  users: "users",
  billing: "billing",
  platform: "platform",
  reports: "reports",
  audit: "audit",
  disputes: "disputes",
};


/* ---------- Notification bell ---------- */
let uiUnread = 0;
async function uiRefreshBadge() {
  if (!state.token) return;
  try {
    const { unread = 0 } = await api("/notifications");
    uiUnread = unread;
    document.querySelectorAll(".ui-bell .ui-badge").forEach((b) => {
      b.hidden = !unread;
      b.textContent = unread > 99 ? "99+" : unread;
    });
    document
      .querySelectorAll(".ui-bell")
      .forEach((b) => b.setAttribute("aria-label", t("shell.bellLabel", { n: unread })));
  } catch {}
}
function uiCloseNotifications() {
  document.getElementById("uiNotifPanel")?.remove();
  document.querySelectorAll(".ui-bell").forEach((b) => b.setAttribute("aria-expanded", "false"));
}
async function uiToggleNotifications(e) {
  e.stopPropagation();
  if (document.getElementById("uiNotifPanel")) return uiCloseNotifications();
  const bell = e.currentTarget,
    r = bell.getBoundingClientRect();
  bell.setAttribute("aria-expanded", "true");
  document.body.insertAdjacentHTML(
    "beforeend",
    // Drawn with keys (T127a); the notification texts come from the server in the user's language
    `<div id="uiNotifPanel" class="ui-notif-panel" role="dialog" aria-label="${esc(t("shell.notifications"))}"><div class="ui-notif-head"><b>${esc(t("shell.notifications"))}</b><button type="button" class="ui-link-btn" data-action="shell.markAll">${esc(t("shell.markAll"))}</button></div><div class="ui-notif-list"><p class="ui-notif-empty">${esc(t("common.loading"))}</p></div><button type="button" class="ui-notif-foot" data-action="shell.openInbox">${esc(t("shell.openInbox"))}</button></div>`,
  );
  const panel = document.getElementById("uiNotifPanel"),
    narrow = innerWidth < 651;
  panel.style.top = `${Math.min(r.bottom + 8, innerHeight - 120)}px`;
  panel.style.left = narrow ? "8px" : `${Math.max(8, Math.min(r.left, innerWidth - 368))}px`;
  if (narrow) panel.style.right = "8px";
  try {
    const { notifications = [] } = await api("/notifications"),
      list = panel.querySelector(".ui-notif-list");
    list.innerHTML =
      notifications
        .slice(0, 12)
        .map(
          (n) =>
            `<button type="button" class="ui-notif ${n.read ? "" : "unread"}" data-id="${esc(n.id)}" data-link="${esc(n.link || "")}"><span class="ui-notif-dot"></span><span><b>${esc(n.text)}</b><small>${esc(new Date(n.createdAt).toLocaleString(fmt.locale(), { day: "2-digit", month: "short", hour: "2-digit", minute: "2-digit" }))}</small></span></button>`,
        )
        .join("") || `<p class="ui-notif-empty">${esc(t("shell.caughtUp"))}</p>`;
    list.querySelectorAll(".ui-notif").forEach(
      (b) =>
        (b.onclick = async () => {
          if (b.classList.contains("unread"))
            await api(`/notifications/${encodeURIComponent(b.dataset.id)}`, {
              method: "PATCH",
              body: { read: true },
            }).catch(() => {});
          uiCloseNotifications();
          uiRefreshBadge();
          if (b.dataset.link) navigate(b.dataset.link);
        }),
    );
  } catch (x) {
    panel.querySelector(".ui-notif-list").innerHTML = `<p class="ui-notif-empty">${esc(x.message)}</p>`;
  }
}
async function uiMarkAllRead() {
  try {
    await api("/notifications/read-all", { method: "PATCH", body: {} });
    document.querySelectorAll(".ui-notif.unread").forEach((x) => x.classList.remove("unread"));
    uiRefreshBadge();
  } catch (x) {
    toast(x.message, "error");
  }
}
document.addEventListener("click", (e) => {
  if (!e.target.closest("#uiNotifPanel, .ui-bell")) uiCloseNotifications();
});
document.addEventListener("keydown", (e) => {
  if (e.key === "Escape") uiCloseNotifications();
});
window.addEventListener("hashchange", uiCloseNotifications);
setInterval(() => {
  if (!document.hidden && document.querySelector(".ui-bell")) uiRefreshBadge();
}, 45000);

/* ---------- Count badges: bare numbers in panel headers become pills next to the title ---------- */
function uiCountPills(root = document) {
  for (const s of root.querySelectorAll(".panel-title > span:not(.ui-count)")) {
    const h = s.parentElement.querySelector("h3");
    if (h && /^\d+$/.test(s.textContent.trim())) {
      s.classList.add("ui-count");
      h.append(s);
    }
  }
}

/* ---------- Drag & drop file upload on every file input ---------- */
function uiDropZones(root = document) {
  for (const input of root.querySelectorAll("input[type=file]:not([data-ui-drop])")) {
    input.dataset.uiDrop = "1";
    if (input.closest("label.btn")) continue; // compact "Import JSON" style buttons keep their look
    const zone = document.createElement("div");
    zone.className = "ui-drop";
    zone.innerHTML = `<svg class="ui-icon" viewBox="0 0 24 24"><path d="M12 16V4M7 9l5-5 5 5"/><path d="M4 16v3a2 2 0 0 0 2 2h12a2 2 0 0 0 2-2v-3"/></svg><span><b>${esc(t("common.drop.here"))}</b> ${esc(t("common.drop.or"))} <u>${esc(t("common.drop.browse"))}</u></span><small class="ui-drop-files"></small>`;
    input.after(zone);
    zone.prepend(input);
    const show = () => {
      const files = [...input.files];
      zone.querySelector(".ui-drop-files").textContent = files.length
        ? files.map((f) => f.name).join(", ")
        : input.accept
          ? t("common.drop.accepted", { types: input.accept.replaceAll(",", ", ") })
          : "";
      zone.classList.toggle("has-files", !!files.length);
    };
    show();
    input.addEventListener("change", show);
    zone.addEventListener("dragover", (e) => {
      e.preventDefault();
      zone.classList.add("over");
    });
    zone.addEventListener("dragleave", () => zone.classList.remove("over"));
    zone.addEventListener("drop", (e) => {
      e.preventDefault();
      zone.classList.remove("over");
      const dt = new DataTransfer();
      for (const f of [...e.dataTransfer.files].slice(0, input.multiple ? 20 : 1)) dt.items.add(f);
      input.files = dt.files;
      input.dispatchEvent(new Event("change", { bubbles: true }));
    });
  }
}

/* ---------- Dashboard: drag panels to arrange them, remembered per user ---------- */
function uiArrangeKey(container) {
  return `cc_layout_${state.user?.id}_${location.hash.split("?")[0]}_${[...container.parentElement.children].indexOf(container)}`;
}
function uiSortablePanels() {
  if (!/\/dashboard$/.test(location.hash.split("?")[0])) return;
  for (const grid of document.querySelectorAll(
    ".dashboard-content .pa-grid, .dashboard-content .dashboard-grid",
  )) {
    if (grid.dataset.uiSort) continue;
    grid.dataset.uiSort = "1";
    const panels = [...grid.children].filter((x) => x.classList.contains("panel"));
    panels.forEach((p, i) => {
      p.dataset.uiKey = (p.querySelector("h3")?.childNodes[0]?.textContent || "panel" + i).trim();
    });
    try {
      const saved = JSON.parse(localStorage.getItem(uiArrangeKey(grid)) || "[]");
      saved.forEach((k) => {
        const p = panels.find((x) => x.dataset.uiKey === k);
        if (p) grid.appendChild(p);
      });
    } catch {}
    for (const p of panels) {
      const title = p.querySelector("h3");
      if (!title) continue;
      title.insertAdjacentHTML(
        "afterbegin",
        `<span class="ui-grip" title="${esc(t("ui.search.drag"))}" aria-hidden="true">⋮⋮</span>`,
      );
      const grip = title.querySelector(".ui-grip");
      grip.addEventListener("mousedown", () => (p.draggable = true));
      grip.addEventListener("touchstart", () => (p.draggable = true), { passive: true });
      p.addEventListener("dragstart", (e) => {
        p.classList.add("ui-dragging");
        e.dataTransfer.effectAllowed = "move";
        e.dataTransfer.setData("text/plain", p.dataset.uiKey);
      });
      p.addEventListener("dragend", () => {
        p.draggable = false;
        p.classList.remove("ui-dragging");
        grid.querySelectorAll(".ui-drop-target").forEach((x) => x.classList.remove("ui-drop-target"));
        try {
          localStorage.setItem(
            uiArrangeKey(grid),
            JSON.stringify([...grid.children].map((x) => x.dataset.uiKey).filter(Boolean)),
          );
        } catch {}
      });
      p.addEventListener("dragover", (e) => {
        const dragging = grid.querySelector(".ui-dragging");
        if (!dragging || dragging === p) return;
        e.preventDefault();
        const r = p.getBoundingClientRect(),
          after = (e.clientY - r.top) / r.height > 0.5;
        grid.insertBefore(dragging, after ? p.nextSibling : p);
      });
    }
  }
}

/* ---------- Loading bar while a page is fetching ---------- */
let uiLoads = 0;
function uiLoading(on) {
  uiLoads = Math.max(0, uiLoads + (on ? 1 : -1));
  let bar = document.getElementById("uiLoadBar");
  if (!bar) {
    document.body.insertAdjacentHTML("afterbegin", '<div id="uiLoadBar" class="ui-load-bar"></div>');
    bar = document.getElementById("uiLoadBar");
  }
  bar.classList.toggle("on", uiLoads > 0);
}
const uiBaseRoute = window.route;
window.route = async function () {
  uiLoading(true);
  try {
    return await uiBaseRoute();
  } finally {
    uiLoading(false);
  }
};

/* ---------- Quick search (Ctrl/⌘+K): jump to any page, project, invoice or supplier ---------- */
const UI_PAGES = {
  customer: [
    "/customer/dashboard",
    "/customer/projects",
    "/customer/projects/new",
    "/customer/analytics",
    "/customer/offers",
    "/customer/suppliers",
    "/customer/invoices",
    "/customer/inbox",
    "/customer/time",
    "/customer/messages",
    "/customer/profile",
  ],
  supplier: [
    "/supplier/dashboard",
    "/supplier/projects",
    "/supplier/analytics",
    "/supplier/bids",
    "/supplier/requests",
    "/supplier/invoices",
    "/supplier/invoices/new",
    "/supplier/suppliers",
    "/supplier/time",
    "/supplier/inbox",
    "/supplier/messages",
    "/supplier/profile",
  ],
  admin: [
    "/admin/dashboard",
    "/admin/applications",
    "/admin/users",
    "/admin/billing",
    "/admin/platform",
    "/admin/reports",
    "/admin/audit",
    "/admin/disputes",
    "/admin/profile",
  ],
};
let uiSearchIndex = null;
// Search entries: t is the title, s the kind and details, l the link. Page titles come from keys by path.
const uiKind = (kind, ...details) => [t("ui.search.kind." + kind), ...details].filter(Boolean).join(" · ");
const uiKnown = (group, v) => (typeof ccLookup("en", `${group}.${v}`) === "string" ? t(`${group}.${v}`) : v);
async function uiBuildIndex() {
  const role = state.user.role,
    items = (UI_PAGES[role] || []).map((l) => ({ t: t("ui.search.page." + l.slice(1).replaceAll("/", "_")), s: uiKind("page"), l, page: true }));
  const [{ projects = [] }, { invoices = [] }] = await Promise.all([api("/projects").catch(() => ({})), api("/invoices").catch(() => ({}))]);
  for (const p of projects) {
    items.push({ t: p.name, s: uiKind("project", uiKnown("dlg.status", p.status)), l: `/${role === "admin" ? "admin/reports" : role + "/projects/" + p.id}` });
    if (role !== "admin")
      for (const ph of p.phases || []) for (const x of ph.tasks || []) items.push({ t: x.name, s: uiKind("task", p.name), l: `/${role}/projects/${p.id}/tasks/${x.id}` });
  }
  for (const i of invoices)
    items.push({ t: `${invNo(i)} · ${fmt.money(i.amount)}`, s: uiKind("invoice", uiKnown("inv.statuses", i.status), i.supplierCompany || ""), l: role === "admin" ? "/admin/billing" : `/${role}/invoice/${encodeURIComponent(i.id)}` });
  if (role === "customer") {
    const { suppliers = [] } = await api("/suppliers").catch(() => ({}));
    for (const x of suppliers) items.push({ t: x.company, s: uiKind("supplier", ccBadge(x), x.location), l: `/customer/suppliers/${x.id}` });
  }
  return items;
}
async function uiOpenSearch() {
  if (!state.user || document.getElementById("uiSearch")) return;
  document.body.insertAdjacentHTML(
    "beforeend",
    `<div id="uiSearch" class="ui-search-backdrop"><div class="ui-search" role="dialog" aria-label="${esc(t("ui.search.label"))}"><div class="ui-search-input">${uiIcon("search")}<input placeholder="${esc(
      t(state.user.role === "customer" ? "ui.search.hintCustomer" : "ui.search.hint"),
    )}" aria-label="${esc(t("ui.search.input"))}"><kbd>Esc</kbd></div><div class="ui-search-results" role="listbox"></div></div></div>`,
  );
  const box = document.getElementById("uiSearch"),
    input = box.querySelector("input"),
    results = box.querySelector(".ui-search-results");
  box.addEventListener("click", (e) => {
    if (e.target === box) uiCloseSearch();
  });
  let active = 0,
    shown = [];
  const render = () => {
    const q = input.value.trim().toLowerCase(),
      words = q.split(/\s+/).filter(Boolean),
      all = uiSearchIndex || [];
    shown = (
      q
        ? all.filter((x) => words.every((w) => (x.t + " " + x.s).toLowerCase().includes(w)))
        : all.filter((x) => x.page)
    ).slice(0, 12);
    active = Math.min(active, Math.max(0, shown.length - 1));
    results.innerHTML =
      shown
        .map(
          (x, i) =>
            `<button type="button" class="ui-search-item ${i === active ? "active" : ""}" data-i="${i}"><b>${esc(x.t)}</b><small>${esc(x.s)}</small></button>`,
        )
        .join("") || `<p class="ui-notif-empty">${esc(t(uiSearchIndex ? "ui.search.none" : "common.loading"))}</p>`;
    results.querySelectorAll(".ui-search-item").forEach((b) => (b.onclick = () => go(Number(b.dataset.i))));
  };
  const go = (i) => {
    const x = shown[i];
    if (!x) return;
    uiCloseSearch();
    navigate(x.l);
  };
  input.addEventListener("input", () => {
    active = 0;
    render();
  });
  input.addEventListener("keydown", (e) => {
    if (e.key === "ArrowDown") {
      e.preventDefault();
      active = Math.min(shown.length - 1, active + 1);
      render();
    }
    if (e.key === "ArrowUp") {
      e.preventDefault();
      active = Math.max(0, active - 1);
      render();
    }
    if (e.key === "Enter") {
      e.preventDefault();
      go(active);
    }
  });
  render();
  input.focus();
  if (!uiSearchIndex) {
    uiSearchIndex = await uiBuildIndex().catch(() => []);
    render();
  }
}
function uiCloseSearch() {
  document.getElementById("uiSearch")?.remove();
}
document.addEventListener("keydown", (e) => {
  if ((e.ctrlKey || e.metaKey) && e.key.toLowerCase() === "k") {
    e.preventDefault();
    document.getElementById("uiSearch") ? uiCloseSearch() : uiOpenSearch();
  }
  if (e.key === "Escape") uiCloseSearch();
});
window.addEventListener("hashchange", () => {
  uiCloseSearch();
});

/* ---------- Constant layout: panel bodies scroll instead of growing ---------- */
function uiScrollAreas() {
  const wrap = (panel, keep, cls = "ui-scroll") => {
    if (panel.querySelector(":scope > ." + cls)) return;
    const body = [...panel.children].filter((ch) => !keep(ch));
    if (!body.length) return;
    const box = document.createElement("div");
    box.className = cls;
    body[0].before(box);
    body.forEach((ch) => box.appendChild(ch));
    if (cls === "ui-scroll") {
      // A region that scrolls must be reachable by keyboard, with a name taken from its panel heading.
      const label = panel.querySelector(".panel-title h3, h3")?.textContent.trim();
      const fade = () => {
        const scrolls = box.scrollHeight > box.clientHeight + 1 || box.scrollWidth > box.clientWidth + 1;
        box.classList.toggle("ui-fade", box.scrollHeight - box.scrollTop - box.clientHeight > 4);
        if (scrolls && !box.hasAttribute("tabindex")) {
          box.setAttribute("tabindex", "0");
          box.setAttribute("role", "region");
          if (label) box.setAttribute("aria-label", label);
        }
      };
      box.addEventListener("scroll", fade, { passive: true });
      requestAnimationFrame(fade);
      setTimeout(fade, 600);
    }
  };
  document
    .querySelectorAll(".pa-grid>.panel, .dashboard-grid>.panel, .in-grid>.panel:not(.in-wide)")
    .forEach((p) => wrap(p, (ch) => ch.matches(".panel-title, h3, .in-legend")));
  document
    .querySelectorAll(".pa-project-activity, .pa-updates")
    .forEach((p) => wrap(p, (ch) => ch.matches("summary, .panel-title"), "pa-list"));
  // Wide tables scroll sideways inside their wrapper; keyboard users need to reach that area too.
  document.querySelectorAll(".cc-table-wrap:not([tabindex])").forEach((w) => {
    if (w.scrollWidth <= w.clientWidth + 1 && w.scrollHeight <= w.clientHeight + 1) return;
    w.setAttribute("tabindex", "0");
    w.setAttribute("role", "region");
    w.setAttribute("aria-label", w.closest(".panel")?.querySelector("h2, h3")?.textContent.trim() || t("ui.table"));
  });
}

/* ---------- In-app dialogs instead of the browser's confirm()/prompt() ----------
   Embedded browsers and some settings block native pop-ups, which made buttons silently do nothing. */
function uiDialog({
  title,
  message = "",
  input = false,
  required = false,
  defaultValue = "",
  placeholder = "",
  confirmLabel = "OK",
  danger = false,
}) {
  return new Promise((resolve) => {
    document.getElementById("uiDialog")?.remove();
    document.body.insertAdjacentHTML(
      "beforeend",
      `<div id="uiDialog" class="ui-dialog-backdrop" role="dialog" aria-modal="true" aria-labelledby="uiDialogTitle"><form class="ui-dialog"><h2 id="uiDialogTitle">${esc(title)}</h2>${message ? `<p>${esc(message)}</p>` : ""}${input ? `<textarea name="value" rows="3" ${required ? "required" : ""} placeholder="${esc(placeholder)}">${esc(defaultValue)}</textarea>${required ? `<small class="subtle">${esc(t("common.dialog.required"))}</small>` : ""}` : ""}<div class="cc-actions"><button type="button" class="btn outline" data-cancel>${esc(t("common.dialog.cancel"))}</button><button class="btn ${danger ? "danger" : "primary"}">${esc(confirmLabel)}</button></div></form></div>`,
    );
    const box = document.getElementById("uiDialog"),
      form = box.querySelector("form"),
      field = form.elements.value;
    const close = (value) => {
      box.remove();
      document.removeEventListener("keydown", onKey, true);
      resolve(value);
    };
    const onKey = (e) => {
      if (e.key === "Escape") {
        e.stopPropagation();
        close(input ? null : false);
      }
    };
    document.addEventListener("keydown", onKey, true);
    form.querySelector("[data-cancel]").onclick = () => close(input ? null : false);
    box.addEventListener("mousedown", (e) => {
      if (e.target === box) close(input ? null : false);
    });
    form.onsubmit = (e) => {
      e.preventDefault();
      if (input) {
        const v = field.value.trim();
        if (required && !v) {
          field.focus();
          return;
        }
        close(v);
      } else close(true);
    };
    (field || form.querySelector("button.btn:not([data-cancel])")).focus();
  });
}
/* Drop-in replacements: uiConfirm(message) → true/false, uiPrompt(message, default) → text or null. */
const uiConfirm = (message, opts = {}) =>
  uiDialog({
    title: opts.title || t("common.dialog.confirm"),
    message,
    confirmLabel: opts.confirmLabel || t("common.dialog.continue"),
    // English, and German for messages from translation keys
    danger: /delete|reject|suspend|close|decline|remove|lösch|ablehn|sperr|schließ|entfern/i.test(message) || opts.danger,
  });
const uiPrompt = (message, defaultValue = "", opts = {}) =>
  uiDialog({
    title: message,
    input: true,
    required: opts.required ?? /reason|why|what (needs|should)|resolution/i.test(message),
    defaultValue: defaultValue ?? "",
    confirmLabel: opts.confirmLabel || t("common.dialog.save"),
  });

/* Buttons placed next to each other outside a flex/grid row get the standard gap. */
function uiButtonGaps() {
  for (const btn of document.querySelectorAll("#app .btn, #modalRoot .btn")) {
    const prev = btn.previousElementSibling;
    if (!prev || !prev.classList.contains("btn") || btn.classList.contains("ui-btn-gap")) continue;
    const d = getComputedStyle(btn.parentElement).display;
    if (!/flex|grid/.test(d)) btn.classList.add("ui-btn-gap");
  }
}

/* Re-apply after every render: pages replace the shell wholesale. */
let uiPending = false;
function uiEnhanceAll() {
  uiCountPills();
  uiDropZones(document);
  uiSortablePanels();
  uiScrollAreas();
  uiButtonGaps();
}
new MutationObserver(() => {
  if (uiPending) return;
  uiPending = true;
  requestAnimationFrame(() => {
    uiPending = false;
    uiEnhanceAll();
  });
}).observe(document.body, { childList: true, subtree: true });
uiEnhanceAll();
