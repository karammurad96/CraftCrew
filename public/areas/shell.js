/* Area: the app shell (T127a). The sidebar (daily pages, a collapsible "More", counts, the project list inside a
   project), the phone menu and bottom bar, the notification bell and search, the user, language and help rows,
   drawn in one place with translation keys. Before this, about a dozen scripts inserted links and rearranged
   the sidebar after every render. */

// Daily pages first, then "More" (board Dashboard / SupplierDash, T93). Keys are the second path segment.
const SHELL_NAV = {
  customer: {
    daily: ["dashboard", "projects", "approvals", "sourcing", "invoices", "messages"],
    more: ["analytics", "contracts", "sites", "offers", "suppliers", "preferred", "inbox", "time", "team", "profile"],
  },
  supplier: {
    daily: ["dashboard", "projects", "planning", "bids", "invoices", "compliance"],
    more: ["analytics", "requests", "contracts", "suppliers", "inbox", "time", "messages", "team", "profile"],
  },
  admin: {
    daily: ["dashboard", "applications", "users", "billing", "disputes", "reports"],
    more: ["audit", "platform", "profile-changes", "profile"],
  },
};
// Phone bottom bar (T102): four pages per role, then "More" opens the drawer
const SHELL_BOTTOM = {
  customer: ["dashboard", "projects", "approvals", "messages"],
  supplier: ["dashboard", "projects", "time", "messages"],
  admin: ["dashboard", "applications", "billing", "disputes"],
};
const sk = (key, params) => esc(t("shell." + key, params));

function shellIcon(role, key) {
  let icon = UI_NAV_ICONS[key] || "dashboard";
  if (role === "supplier" && key === "projects") icon = "work";
  if (role === "supplier" && key === "suppliers") icon = "catalog";
  return uiIcon(icon);
}
// Team members only see the areas their role may open; the Team page is for the main account.
function shellVisible(role, key) {
  if (key === "team") return ["customer", "supplier"].includes(role) && !state.user?.isMember;
  const area = typeof TM_NAV !== "undefined" ? TM_NAV[role]?.[key] : null;
  return !area || typeof tmLevel !== "function" || tmLevel(area) !== "none";
}
// The current page's link: an exact match, or a page inside a project; else the page's own "active" key
function shellActive(role, key) {
  const path = location.hash.replace(/^#/, "").split("?")[0],
    href = `/${role}/${key}`;
  return path === href || (key === "projects" && path.startsWith(href + "/"));
}
function shellMoreOpen() {
  try {
    return localStorage.getItem("cc_sidebar_more") === "1";
  } catch {
    return false;
  }
}

function dashboardShell(role, active, content) {
  const nav = SHELL_NAV[role] || SHELL_NAV.customer,
    user = state.user || {},
    keys = [...nav.daily, ...nav.more].filter((key) => shellVisible(role, key)),
    anyActive = keys.some((key) => shellActive(role, key)),
    isActive = (key) => shellActive(role, key) || (!anyActive && key === active);
  const link = (key) =>
    `<a${isActive(key) ? ' class="active" aria-current="page"' : ""} href="#/${role}/${key}" data-ui-icon="${key}">${shellIcon(role, key)}${sk(`nav.${role}.${key}`)}</a>`;
  const more = nav.more.filter((key) => keys.includes(key)),
    open = shellMoreOpen();
  const initials = (user.name || "U")
    .split(" ")
    .map((x) => x[0])
    .join("")
    .slice(0, 2);
  const lang = typeof i18nLang !== "undefined" ? i18nLang : ccLang;
  const bottom = (SHELL_BOTTOM[role] || []).filter((key) => keys.includes(key)),
    path = location.hash.split("?")[0];
  return `<div class="app-shell"><aside class="sidebar" id="mnavSidebar" data-i18n="keys"><button type="button" class="mnav-menu-btn" aria-controls="mnavSidebar" aria-expanded="false" aria-label="${sk("menu")}" data-action="shell.menu">${MNAV_MENU_ICON}</button><div class="ui-side-top"><div class="brand side-brand"><span class="brand-mark" role="img" aria-label="${esc(t("auth.logo"))}"><svg viewBox="0 0 64 64" aria-hidden="true" focusable="false"><path d="M14 50C24 42 40 22 50 14"/><circle cx="14" cy="50" r="8.5"/><circle cx="50" cy="14" r="8.5"/></svg></span><span class="brand-word">Craft<span>Crew</span></span></div><button type="button" class="ui-bell" aria-label="${sk("bellLabel", { n: uiUnread })}" aria-haspopup="true" aria-expanded="false" data-action="shell.bell">${uiIcon("bell")}<span class="ui-badge"${uiUnread ? "" : " hidden"}>${uiUnread > 99 ? "99+" : uiUnread}</span></button></div><button type="button" class="ui-search-btn" data-action="shell.search">${uiIcon("search")}<span>${sk("search")}</span><kbd>Ctrl K</kbd></button><button class="user-mini wf-user-link" data-action="shell.profile"><div class="avatar">${user.profileImage ? `<img src="${esc(user.profileImage)}" alt="">` : esc(initials)}</div><div><b>${esc(user.name)}${user.isMember ? ` <span class="tm-badge">${sk("teamBadge")}</span>` : ""}</b><small>${esc(user.company || role)} · ${sk("profile")}</small></div></button><nav data-ds-role="${role}"${open ? "" : ' class="ds-more-closed"'}><div class="ng-title" data-title=""></div>${nav.daily
    .filter((key) => keys.includes(key))
    .map(link)
    .join("")}${
    more.length
      ? `<div class="ng-title" data-title="More" role="button" tabindex="0" aria-expanded="${open}" data-action="shell.more" data-key="shell.more" data-key-on="Enter,Space">${sk("more")}</div>${more.map(link).join("")}`
      : ""
  }</nav><div class="help" data-ui="1" data-ds="1"><div class="i18n-switch" role="group" aria-label="${sk("language")}"><button type="button" class="${lang === "de" ? "on" : ""}" data-action="shell.lang" data-lang="de">DE</button><button type="button" class="${lang === "en" ? "on" : ""}" data-action="shell.lang" data-lang="en">EN</button></div><button class="btn small ghost" data-action="shell.help">${uiIcon("help")}<span>${sk("help")}</span></button><button class="btn small danger" style="margin-top:8px;width:100%" data-action="shell.logout">${uiIcon("logout")}<span>${sk("logout")}</span></button><button type="button" class="ui-link-btn ob-reopen" data-action="shell.checklist"${user.isMember || (typeof obShow !== "undefined" && obShow.allDone) ? " hidden" : ""}>${sk("checklist")}</button></div></aside><section class="dashboard-content">${content}</section>${
    bottom.length
      ? `<nav class="mnav-bottom" aria-label="${sk("quickNav")}" data-i18n="keys">${bottom
          .map((key) => {
            const href = `#/${role}/${key}`;
            return `<a href="${href}" class="${path === href || path.startsWith(href + "/") ? "active" : ""}">${shellIcon(role, key)}<span>${sk(`bottom.${role}.${key}`)}</span></a>`;
          })
          .join("")}<button type="button" aria-controls="mnavSidebar" data-action="shell.menu">${MNAV_MORE_ICON}<span>${sk("more")}</span></button></nav>`
      : ""
  }</div>`;
}

/* ---------- After each shell render: counts, the project list inside a project, the bell ---------- */
let shellCounts = null,
  shellCountsAt = 0,
  shellCountsLoading = null;
function shellLoadCounts() {
  if (shellCountsLoading) return shellCountsLoading;
  if (shellCounts && Date.now() - shellCountsAt < 20000) return Promise.resolve(shellCounts);
  shellCountsLoading = api("/nav-counts")
    .then((d) => ((shellCounts = d.counts || {}), (shellCountsAt = Date.now()), shellCounts))
    .catch(() => shellCounts || {})
    .finally(() => (shellCountsLoading = null));
  return shellCountsLoading;
}
// Counts go stale when the user acts elsewhere; refresh them on the next page change
window.addEventListener("hashchange", () => (shellCountsAt = 0));
let shellProjects = null;
function shellProjectList() {
  shellProjects ||= api("/projects")
    .then((d) => (d.projects || []).slice(0, 5))
    .catch(() => (shellProjects = null) || []);
  return shellProjects;
}
function shellEnhance() {
  const side = document.querySelector(".app-shell > .sidebar[data-i18n=keys]"),
    nav = side?.querySelector(":scope > nav"),
    role = state.user?.role;
  if (!nav || !role || nav.dataset.shellDone) return;
  nav.dataset.shellDone = "1";
  shellLoadCounts().then((counts) => {
    for (const a of nav.querySelectorAll(":scope > a")) {
      const n = Number(counts[a.dataset.uiIcon]) || 0;
      if (!n || a.querySelector(".ng-count")) continue;
      a.insertAdjacentHTML("beforeend", `<span class="ng-count" aria-label="${sk("countLabel", { n })}">${n > 99 ? "99+" : n}</span>`);
    }
  });
  // Projects of this user under "Projects", on any page inside a project
  const m = location.hash.match(/^#\/(customer|supplier)\/projects\/([^/?]+)/),
    projectsLink = nav.querySelector(':scope > a[data-ui-icon="projects"]');
  projectsLink?.classList.toggle("ds-section-active", !!m);
  if (m && projectsLink) {
    const sub = document.createElement("div");
    sub.className = "ds-side-projects";
    projectsLink.after(sub);
    shellProjectList().then((list) => {
      sub.innerHTML = list
        .map((p) => `<a href="#/${role}/projects/${encodeURIComponent(p.id)}"${p.id === m[2] ? ' class="ds-current" aria-current="page"' : ""}>${esc(p.name)}</a>`)
        .join("");
    });
  }
  uiRefreshBadge();
}
new MutationObserver(() => shellEnhance()).observe(document.getElementById("app"), { childList: true });

/* ---------- Actions ---------- */
actions.on("shell.menu", () => mnavSetOpen(!mnavIsOpen()));
actions.on("shell.bell", (el, event) => uiToggleNotifications({ stopPropagation: () => event.stopPropagation(), currentTarget: el }));
actions.on("shell.search", () => {
  uiSearchIndex = null;
  uiOpenSearch();
});
actions.on("shell.profile", () => navigate(`/${state.user.role}/profile`));
actions.on("shell.lang", (el) => i18nSet(el.dataset.lang));
actions.on("shell.help", () => navigate("/faq"));
actions.on("shell.logout", () => logout());
actions.on("shell.checklist", () => obShow());
actions.on("shell.markAll", () => uiMarkAllRead());
actions.on("shell.openInbox", () => {
  uiCloseNotifications();
  navigate(state.user.role === "admin" ? "/admin/dashboard" : `/${state.user.role}/inbox`);
});
actions.on("shell.more", (el, event) => {
  if (event.type === "keydown") event.preventDefault();
  const nav = el.parentElement,
    open = nav.classList.contains("ds-more-closed");
  nav.classList.toggle("ds-more-closed", !open);
  el.setAttribute("aria-expanded", String(open));
  try {
    localStorage.setItem("cc_sidebar_more", open ? "1" : "0");
  } catch {}
});
// A link in the open phone drawer closes it, also when it points to the page already shown
document.addEventListener("click", (e) => {
  if (e.target.closest(".app-shell .sidebar nav a") && mnavIsOpen()) mnavSetOpen(false);
});
