/* Platform additions from the sitemap review: role-aware settings (security, notifications,
   payouts), admin analytics and audit log, project activity,
   project templates and the completion review flow. Loaded after all other layers. */
const paEsc = (value) => esc(value ?? "");
const paToday = () => new Date().toISOString().slice(0, 10);
const paDaysFrom = (n) => new Date(Date.now() + n * 86400000).toISOString().slice(0, 10);
const paStatusClass = (s) =>
  String(s || "")
    .toLowerCase()
    .replaceAll(" ", "-");
const paTime = (d) =>
  d
    ? new Date(d).toLocaleString("en-GB", {
        day: "2-digit",
        month: "short",
        hour: "2-digit",
        minute: "2-digit",
      })
    : "—";

/* Work items (phases with a direct supplier and tasks) flattened for deadline checks. */
function paWorkItems(projects, supplierId) {
  const items = [];
  for (const p of projects)
    for (const ph of p.phases || []) {
      const tasks = ph.tasks || [];
      if (!tasks.length && (!supplierId || ph.supplierId === supplierId))
        items.push({
          p,
          ph,
          name: ph.name,
          dueDate: ph.dueDate,
          status: ph.status,
          link: `/${state.user.role}/projects/${p.id}/phases/${ph.id}`,
        });
      for (const t of tasks)
        if (!supplierId || (t.assignedSupplierId === supplierId && t.acceptanceStatus === "Accepted"))
          items.push({
            p,
            ph,
            t,
            name: t.name,
            dueDate: t.dueDate,
            status: t.status,
            link: `/${state.user.role}/projects/${p.id}/tasks/${t.id}`,
          });
    }
  return items.filter((x) => x.p.status !== "Completed");
}
function paMonths(n) {
  const out = [],
    d = new Date();
  d.setDate(1);
  for (let i = n - 1; i >= 0; i--) {
    const x = new Date(d.getFullYear(), d.getMonth() - i, 1);
    out.push(`${x.getFullYear()}-${String(x.getMonth() + 1).padStart(2, "0")}`);
  }
  return out;
}

/* ---------- Session integrity ----------
   The stored user record is only a display cache. On load the session token is
   confirmed with the server, and the identity shown always comes from the server.
   Any 401 (expired, revoked or suspended session) signs the browser out. */
function paClearSession(message) {
  // An ended session keeps the page the user wanted; the login form explains why (see not-found.js).
  if (message)
    try {
      if (/^#\/(customer|supplier|admin)\//.test(location.hash))
        sessionStorage.setItem("cc_return", location.hash);
      sessionStorage.setItem("cc_expired", "1");
    } catch {}
  state.user = null;
  state.token = "";
  localStorage.removeItem("cc_user");
  localStorage.removeItem("cc_token");
  document.body.classList.remove("authenticated");
  topActions();
  if (/^#\/(customer|supplier|admin)(\/|$)/.test(location.hash)) navigate("/login");
  else route();
}
const paBaseApi = api;
api = async function (path, opts = {}) {
  const tokenUsed = state.token;
  try {
    return await paBaseApi(path, opts);
  } catch (e) {
    if (tokenUsed && tokenUsed === state.token && /^Authentication required$/.test(e.message))
      paClearSession(t("ui.sessionEnded"));
    throw e;
  }
};
async function paVerifySession() {
  if (!state.token) {
    if (state.user) paClearSession();
    return;
  }
  try {
    await ccSessionReady;
    const r = await fetch("/api/auth/me", { credentials: "same-origin" });
    if (r.status === 401 || r.status === 403)
      return paClearSession(t("ui.sessionEnded"));
    if (!r.ok) return;
    const { user } = await r.json(),
      changed = !state.user || state.user.id !== user.id || state.user.role !== user.role;
    state.user = user;
    localStorage.setItem("cc_user", JSON.stringify(user));
    if (changed) route();
    else topActions();
  } catch {}
}
paVerifySession();

/* ---------- Router hook ---------- */
const paBaseRoute = window.route;
let paRouteSeq = 0,
  paRouteDone = 0;
window.route = async function () {
  const seq = ++paRouteSeq;
  const result = await paBaseRoute();
  // A slower, older navigation must not leave its page on screen after a newer one rendered.
  if (seq < paRouteDone) return window.route();
  paRouteDone = Math.max(paRouteDone, seq);
  return result;
};
