/* Not-found pages and expired sessions.
   - renderNotFound(): "Page not found" inside the app shell (or the public layout), used by the router.
   - When the item a page is about (project, invoice, supplier in the URL) returns 404, the page shows one clean
     not-found card with a link back to the list instead of error panels, stray buttons and toasts.
   - A 401 while signed in keeps the requested page, signs out and asks the user to sign in again; after
     signing in they return to that page. */
const NF_KINDS = {
  projects: [
    "Project not found",
    "This project does not exist or you no longer have access to it.",
    "projects",
    "Back to projects",
  ],
  invoices: [
    "Invoice not found",
    "This invoice does not exist or you no longer have access to it.",
    "invoices",
    "Back to invoices",
  ],
  suppliers: [
    "Supplier not found",
    "This supplier profile does not exist or is no longer listed.",
    "suppliers",
    "Back to suppliers",
  ],
};

function renderNotFound(kind) {
  const role = state.user?.role,
    [title, text, list, back] = NF_KINDS[kind] || [
      "Page not found",
      "The page you opened does not exist. Check the link or go back.",
      "dashboard",
      "Go to dashboard",
    ],
    home = role ? `#/${role}/${list}` : "#/";
  const card = `<section class="panel nf-card" role="alert"><h1>${title}</h1><p>${text}</p><div class="cc-actions"><a class="btn primary" href="${home}">${role ? back : "Go to the home page"}</a><button type="button" class="btn outline" onclick="history.back()">Back</button></div></section>`;
  app.innerHTML = role
    ? dashboardShell(role, kind ? list : "dashboard", card)
    : publicLayout(`<div class="cc-page">${card}</div>`);
  document.getElementById("toast")?.classList.remove("show");
  document.title = `${title} · CraftCrew`;
}

function sessionExpired() {
  try {
    const here = location.hash;
    if (here && !/^#\/(login|signup)?$/.test(here)) sessionStorage.setItem("cc_return", here);
    sessionStorage.setItem("cc_expired", "1");
  } catch {}
  state.user = null;
  state.token = "";
  localStorage.removeItem("cc_user");
  localStorage.removeItem("cc_token");
  document.body.classList.remove("authenticated");
  topActions();
  if (location.hash === "#/login") route();
  else navigate("/login");
}

// Remember a 404 for the item the current page is about, and handle expired sessions.
let nfMissing = null;
const nfBaseApi = api;
api = async function (path, opts = {}) {
  try {
    return await nfBaseApi(path, opts);
  } catch (e) {
    if (e.status === 401 && state.token && !String(path).startsWith("/auth/")) sessionExpired();
    const m = String(path).match(/^\/(projects|invoices|suppliers)\/([^/?]+)/);
    if (e.status === 404 && m && location.hash.split("?")[0].split("/").includes(m[2])) nfMissing = m[1];
    throw e;
  }
};

let nfReturnTo = null;
const nfBaseRoute = window.route;
window.route = async function () {
  nfMissing = null;
  const path = location.hash.replace(/^#/, "").split("?")[0] || "/";
  // After signing in again, go back to the page the expired session interrupted.
  if (state.user && nfReturnTo && path === `/${state.user.role}/dashboard`) {
    const target = nfReturnTo;
    nfReturnTo = null;
    if (target.startsWith(`#/${state.user.role}/`)) {
      location.hash = target;
      return;
    }
  }
  const result = await nfBaseRoute();
  if (nfMissing) renderNotFound(nfMissing);
  return result;
};
// The login form says why the user has to sign in again, however often the page is re-rendered.
new MutationObserver(() => {
  const form = document.querySelector(".login-card form");
  if (!form || document.querySelector(".nf-expired")) return;
  let expired = false;
  try {
    expired = sessionStorage.getItem("cc_expired") === "1";
  } catch {}
  if (expired)
    form.insertAdjacentHTML(
      "beforebegin",
      `<div class="notice warn nf-expired" role="status">Your session has expired. Please sign in again.</div>`,
    );
}).observe(document.getElementById("app"), { childList: true, subtree: true });
// A successful sign-in picks up the saved page.
const nfLoginApi = api;
api = async function (path, opts = {}) {
  const result = await nfLoginApi(path, opts);
  if (path === "/auth/login" && result?.token)
    try {
      nfReturnTo = sessionStorage.getItem("cc_return");
      sessionStorage.removeItem("cc_return");
      sessionStorage.removeItem("cc_expired");
    } catch {}
  return result;
};
