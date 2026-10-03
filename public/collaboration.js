// Consolidated fixes for the latest browser review comments.
const ccEsc = (s) => esc(s ?? "");
const ccProjects = async () => (await api("/projects")).projects || [];

// Searchable invoice selector is added directly by the rich invoice form.

// Page routing + persistent sidebar links.
const ccBaseRoute = window.route;
window.route = async function () {
  const path = location.hash.replace(/^#/, "").split("?")[0],
    parts = path.split("/").filter(Boolean),
    role = state.user?.role;
  try {
    await ccBaseRoute();
  } catch (e) {
    console.error(e);
    toast(e.message, "error");
    app.innerHTML = dashboardShell(
      role || "supplier",
      "dashboard",
      `<div class="panel"><h2>Could not load this page</h2><p>${ccEsc(e.message)}</p></div>`,
    );
  }
};

