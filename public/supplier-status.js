/* Suppliers who are not verified yet: every supplier page shows a banner that leads to the application (or its
   status), and "Bid opportunities" and "Create invoice" carry a lock with a tooltip, because the server
   refuses those actions until the company is approved. */
// The tooltip of locked links and buttons (T127a: from the shell keys)
const ssLockTip = () => t("shell.lockTip");
const SS_LOCK_ICON =
  '<svg class="ss-lock" viewBox="0 0 24 24" aria-hidden="true"><rect x="5" y="11" width="14" height="9" rx="2"/><path d="M8 11V8a4 4 0 0 1 8 0v3"/></svg>';
let ssStatus = null,
  ssStatusAt = 0,
  ssLoading = null;
async function ssLoadStatus() {
  if (ssLoading) return ssLoading;
  if (ssStatus && Date.now() - ssStatusAt < 30000) return ssStatus;
  ssLoading = Promise.all([api("/profile"), api("/applications/mine").catch(() => ({}))])
    .then(([profile, mine]) => {
      ssStatus = { live: !!profile.supplier?.live, application: mine.application || null };
      ssStatusAt = Date.now();
      return ssStatus;
    })
    .catch(() => ssStatus)
    .finally(() => (ssLoading = null));
  return ssLoading;
}

function ssDecorate(status) {
  const content = document.querySelector(".app-shell .dashboard-content");
  if (!content) return;
  if (status.live) {
    content.querySelector(".ss-banner")?.remove();
    return;
  }
  if (!content.querySelector(".ss-banner")) {
    const app = status.application,
      [label, detail] = !app
        ? [t("ui.ss.complete"), ""]
        : [t(app.status === "Rejected" ? "ui.ss.again" : "ui.ss.view"), t("ob.supplier.verify.status", { status: obValue("status", app.status || "New") })];
    content.insertAdjacentHTML(
      "afterbegin",
      `<div class="notice warn ss-banner" role="status"><div><b>${esc(t("ui.ss.banner"))}</b>${detail ? `<small>${esc(detail)}</small>` : ""}</div><a class="btn small primary" href="#/supplier-application">${esc(label)}</a></div>`,
    );
  }
  const locked = [
    ...document.querySelectorAll('.sidebar nav a[href="#/supplier/bids"]'),
    ...[...content.querySelectorAll("a")].filter((el) => ["#/supplier/invoices/new", "#/supplier/bids"].includes(el.getAttribute("href"))),
  ];
  for (const el of locked)
    if (!el.classList.contains("ss-locked")) {
      el.classList.add("ss-locked");
      el.title = ssLockTip();
      el.setAttribute("aria-description", ssLockTip());
      el.insertAdjacentHTML("beforeend", SS_LOCK_ICON);
    }
}

let ssQueued = false;
new MutationObserver(() => {
  if (ssQueued || state.user?.role !== "supplier" || !state.token) return;
  ssQueued = true;
  requestAnimationFrame(async () => {
    ssQueued = false;
    const status = await ssLoadStatus();
    if (status) ssDecorate(status);
  });
}).observe(document.getElementById("app"), { childList: true, subtree: true });
window.addEventListener("hashchange", () => (ssStatusAt = 0));
