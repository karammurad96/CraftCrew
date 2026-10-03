// Expanded collaboration workflows: phase/task planning, offers, document control and scoped workspaces.
const wfToday = () => new Date().toISOString().slice(0, 10);
const wfPath = () => location.hash.replace(/^#/, "");
const wfQuery = () => new URLSearchParams(location.hash.split("?")[1] || "");
function wfSupplier(sups, id) {
  return sups.find((s) => s.id === id);
}
// Upload links download through the session (used by every page with a file link)
async function wfOpenDocument(url) {
  try {
    const r = await fetch(url, { credentials: "same-origin" });
    if (!r.ok) throw new Error(t("ui.file.failed"));
    const blob = await r.blob(),
      link = document.createElement("a");
    link.href = URL.createObjectURL(blob);
    link.download = url.split("/").pop();
    link.click();
    setTimeout(() => URL.revokeObjectURL(link.href), 2000);
  } catch (e) {
    toast(e.message, "error");
  }
}
const wfOldRoute = async () => {
  const h = (location.hash.replace(/^#/, "") || "/").split("?")[0] || "/",
    parts = h.split("?")[0].split("/").filter(Boolean);
  // A bare workspace link opens the dashboard; anything else unknown is a proper 404, not the home page.
  if (state.user && parts[0] === state.user.role && !parts[1])
    return navigate(`/${state.user.role}/dashboard`);
  return renderNotFound();
};
async function route() {
  topActions();
  const full = location.hash.replace(/^#/, "") || "/",
    h = full.split("?")[0],
    parts = h.split("/").filter(Boolean);
  if (!state.user && /^\/(customer|supplier|admin)(\/|$)/.test(h)) {
    navigate("/login");
    return;
  }
  try {
    return await wfOldRoute();
  } catch (e) {
    console.error(e);
    toast(e.message, "error");
    const active = parts[1] || "dashboard";
    app.innerHTML = dashboardShell(
      state.user?.role || "customer",
      active,
      `<div class="empty" data-i18n="keys"><h2>${esc(t("errors.pageFailed"))}</h2><p data-i18n="dom">${esc(e.message)}</p><button class="btn primary" data-action="ui.retry">${esc(t("ui.retry"))}</button></div>`,
    );
  }
}
document.addEventListener("click", (event) => {
  const link = event.target.closest('a[href^="/uploads/"]');
  if (link) {
    event.preventDefault();
    wfOpenDocument(link.getAttribute("href"));
  }
});
window.addEventListener("hashchange", () => {
  if (typeof route === "function") route();
});
