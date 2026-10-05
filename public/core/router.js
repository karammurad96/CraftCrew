/* One route table (T125). Area modules register their pages: routes.add("/customer/invoice/:id", page, { role }).
   It is loaded right after workflows.js, so it wraps the base route() and every later wrapper still wraps it:
   pages that moved into an area pass through the same checks as before. Unknown paths fall back to the old
   route() chain until their area moves. */
const routes = (() => {
  const table = [];
  function compile(pattern) {
    const names = [];
    const re = new RegExp(
      "^" +
        pattern.replace(/[.*+?^${}()|[\]\\]/g, "\\$&").replace(/\/:(\w+)/g, (_, n) => (names.push(n), "/([^/]+)")) +
        "/?$",
    );
    return { re, names };
  }
  function add(pattern, page, opts = {}) {
    table.push({ pattern, page, ...compile(pattern), role: opts.role || (pattern.match(/^\/(customer|supplier|admin)\//) || [])[1] || null });
  }
  function match(path) {
    for (const r of table) {
      const m = path.match(r.re);
      if (m) return { route: r, params: Object.fromEntries(r.names.map((n, i) => [n, decodeURIComponent(m[i + 1])])) };
    }
    return null;
  }
  return { add, match, list: () => table.map((r) => r.pattern) };
})();
// T221: the platform mode decides which customer pages exist. Asked from the server at most once a minute;
// brokered until it answers, so a customer never sees the directory by mistake.
let ccMode = { at: 0, value: "brokered" };
async function ccPlatformMode() {
  if (Date.now() - ccMode.at > 60000)
    try {
      const cfg = await api("/platform-config");
      ccMode = { at: Date.now(), value: cfg.platformMode === "marketplace" ? "marketplace" : "brokered" };
    } catch {}
  return ccMode.value;
}
const ccBrokered = () => ccMode.value === "brokered";
// Customer pages of the marketplace; in brokered mode they lead to the dashboard
const CC_MARKETPLACE_PAGES = ["/customer/suppliers", "/customer/preferred"];
const routerBaseRoute = route;
window.route = route = async function () {
  const full = location.hash.replace(/^#/, "") || "/",
    path = full.split("?")[0],
    found = routes.match(path);
  if (!found) return routerBaseRoute();
  topActions();
  const { route: r, params } = found;
  await ccPlatformMode();
  if (state.user?.role === "customer" && ccBrokered() && CC_MARKETPLACE_PAGES.includes(r.pattern))
    return navigate("/customer/dashboard");
  if (r.role && !state.user) return navigate("/login");
  if (r.role && state.user.role !== r.role) {
    toast(t("errors.wrongAccount"), "error");
    return navigate(`/${state.user.role}/dashboard`);
  }
  try {
    return await r.page(params, new URLSearchParams(full.split("?")[1] || ""));
  } catch (e) {
    console.error(e);
    toast(e.message, "error");
    app.innerHTML = dashboardShell(
      state.user?.role || "customer",
      path.split("/")[2] || "dashboard",
      `<div class="empty"><h2>${esc(t("errors.pageFailed"))}</h2><p>${esc(e.message)}</p><button class="btn primary" data-action="router.retry">${esc(t("common.retry"))}</button></div>`,
    );
  }
};
actions.on("router.retry", () => route());
