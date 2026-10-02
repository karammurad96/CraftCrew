/* Phone navigation (below 900 px): the sidebar becomes a slim top bar (logo, bell, menu button) and opens as a
   drawer from the left; a bottom bar holds the four most used pages per role plus "More". Tables get a
   data-label per cell so CSS can show them as stacked cards below 640 px. Works on whatever the page
   renderers produce: it watches #app and enhances each new app shell. */
const MNAV_MENU_ICON =
  '<svg viewBox="0 0 24 24" aria-hidden="true"><path d="M4 7h16M4 12h16M4 17h16"/></svg>';
const MNAV_CLOSE_ICON = '<svg viewBox="0 0 24 24" aria-hidden="true"><path d="M6 6l12 12M18 6L6 18"/></svg>';
const MNAV_MORE_ICON =
  '<svg viewBox="0 0 24 24" aria-hidden="true"><circle cx="5" cy="12" r="1.6"/><circle cx="12" cy="12" r="1.6"/><circle cx="19" cy="12" r="1.6"/></svg>';

let mnavLastFocus = null;
const mnavSidebar = () => document.querySelector(".app-shell .sidebar");
const mnavIsOpen = () => !!mnavSidebar()?.classList.contains("mnav-open");

function mnavSetOpen(open) {
  const sidebar = mnavSidebar(),
    btn = sidebar?.querySelector(".mnav-menu-btn");
  if (!sidebar || !btn) return;
  sidebar.classList.toggle("mnav-open", open);
  sidebar.closest(".app-shell")?.classList.toggle("mnav-drawer-open", open);
  document.body.classList.toggle("mnav-locked", open);
  btn.setAttribute("aria-expanded", String(open));
  btn.setAttribute("aria-label", t(open ? "shell.closeMenu" : "shell.menu"));
  btn.innerHTML = open ? MNAV_CLOSE_ICON : MNAV_MENU_ICON;
  let backdrop = document.querySelector(".mnav-backdrop");
  if (open && !backdrop) {
    backdrop = document.createElement("div");
    backdrop.className = "mnav-backdrop";
    backdrop.addEventListener("click", () => mnavSetOpen(false));
    document.body.append(backdrop);
  }
  if (!open) backdrop?.remove();
  if (open) {
    mnavLastFocus = document.activeElement;
    (sidebar.querySelector("nav a.active") || sidebar.querySelector("nav a"))?.focus();
  } else if (mnavLastFocus && document.contains(mnavLastFocus)) mnavLastFocus.focus();
}

// Keeps Tab inside the open drawer and closes it with Escape.
document.addEventListener("keydown", (e) => {
  if (!mnavIsOpen()) return;
  if (e.key === "Escape") {
    e.preventDefault();
    mnavSetOpen(false);
    return;
  }
  if (e.key !== "Tab") return;
  const focusable = [
    ...mnavSidebar().querySelectorAll(
      "a[href], button:not([disabled]), input, select, [tabindex]:not([tabindex='-1'])",
    ),
  ].filter((el) => el.offsetParent !== null);
  if (!focusable.length) return;
  const first = focusable[0],
    last = focusable[focusable.length - 1];
  if (e.shiftKey && document.activeElement === first) {
    e.preventDefault();
    last.focus();
  } else if (!e.shiftKey && document.activeElement === last) {
    e.preventDefault();
    first.focus();
  }
});
window.addEventListener("hashchange", () => mnavIsOpen() && mnavSetOpen(false));


// Stacked table cards need each cell's column name.
function mnavLabelTables(root) {
  for (const table of root.querySelectorAll("table")) {
    const heads = [...table.querySelectorAll("thead th")].map((th) => th.textContent.trim());
    if (!heads.length) continue;
    table.classList.add("mnav-cards");
    for (const row of table.querySelectorAll("tbody tr")) {
      let col = 0;
      for (const cell of row.children) {
        if (!cell.hasAttribute("data-label") || cell.dataset.label !== (heads[col] || ""))
          cell.setAttribute("data-label", heads[col] || "");
        col += Number(cell.getAttribute("colspan")) || 1;
      }
    }
  }
}

let mnavQueued = false;
function mnavEnhance() {
  mnavQueued = false;
  const app = document.getElementById("app");
  if (!app) return;
  mnavLabelTables(app);
  // A re-rendered page replaces the open sidebar; drop the leftover lock and backdrop.
  if (!mnavIsOpen() && document.body.classList.contains("mnav-locked")) {
    document.body.classList.remove("mnav-locked");
    document.querySelector(".mnav-backdrop")?.remove();
  }
}
new MutationObserver(() => {
  if (mnavQueued) return;
  mnavQueued = true;
  requestAnimationFrame(mnavEnhance);
}).observe(document.getElementById("app"), { childList: true, subtree: true });
mnavEnhance();
