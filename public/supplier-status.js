/* Suppliers who are not verified yet: every supplier page shows a banner that leads to the application (or its
   status), and "Bid opportunities" and "Create invoice" carry a lock with a tooltip, because the server
   refuses those actions until the company is approved. */
const SS_LOCK_TIP = "Available once your company is verified.";
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
        ? ["Complete your application", ""]
        : app.status === "Rejected"
          ? ["Apply again", `Application status: ${app.status}`]
          : ["View application status", `Application status: ${app.status || "New"}`];
    content.insertAdjacentHTML(
      "afterbegin",
      `<div class="notice warn ss-banner" role="status"><div><b>Your company is not verified yet. Complete your application to receive bid invitations.</b>${detail ? `<small>${detail}</small>` : ""}</div><a class="btn small primary" href="#/supplier-application">${label}</a></div>`,
    );
  }
  const locked = [
    ...document.querySelectorAll('.sidebar nav a[href="#/supplier/bids"]'),
    ...[...content.querySelectorAll("button, a")].filter(
      (el) =>
        /navigate\('\/supplier\/(invoices\/new|bids)'\)/.test(el.getAttribute("onclick") || "") ||
        el.getAttribute("href") === "#/supplier/invoices/new",
    ),
  ];
  for (const el of locked)
    if (!el.classList.contains("ss-locked")) {
      el.classList.add("ss-locked");
      el.title = SS_LOCK_TIP;
      el.setAttribute("aria-description", SS_LOCK_TIP);
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
