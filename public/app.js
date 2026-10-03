/* CraftCrew frontend. Business data is server-persisted. The session lives in an HttpOnly cookie that scripts
   can't read (T124); localStorage keeps only the signed-in user's profile and UI preferences. */
const API = "/api";
let apiBusy = 0;
// Invoices show their sequential number to people; the id stays for links and the API.
const invNo = (i) => i?.number || i?.id || "";
// Net amount of an invoice; older invoices without VAT data only have `amount`, which is net.
const invNet = (i) => Number(i?.netAmount ?? i?.amount) || 0;
// state.token is only a "signed in" marker now; the secret itself is in the cookie.
const state = {
  user: JSON.parse(localStorage.getItem("cc_user") || "null"),
  token: localStorage.getItem("cc_user") ? "session" : "",
  cache: {},
};
// Browsers signed in before T124 still hold the token in localStorage: move it to the cookie once, then forget it.
const ccSessionReady = (() => {
  const legacy = localStorage.getItem("cc_token");
  if (!legacy) return Promise.resolve();
  localStorage.removeItem("cc_token");
  return fetch("/api/auth/upgrade", { method: "POST", headers: { Authorization: "Bearer " + legacy } })
    .then(async (r) => {
      await r.text(); // read the reply, so the request is finished and not left open
      if (r.ok) state.token = "session";
    })
    .catch(() => {});
})();
// After a successful sign-in or sign-up: remember who is signed in (the server has set the cookie).
function ccSignedIn(user) {
  state.user = user;
  state.token = "session";
  localStorage.setItem("cc_user", JSON.stringify(user));
  localStorage.removeItem("cc_token");
}
const app = document.getElementById("app"),
  modalRoot = document.getElementById("modalRoot"),
  toastEl = document.getElementById("toast");
const esc = (s) =>
  String(s ?? "").replace(
    /[&<>'"]/g,
    (c) => ({ "&": "&amp;", "<": "&lt;", ">": "&gt;", "'": "&#39;", '"': "&quot;" })[c],
  );
const money = (n) =>
  new Intl.NumberFormat("en-US", { style: "currency", currency: "EUR", maximumFractionDigits: 0 }).format(
    Number(n) || 0,
  );
const date = (d) =>
  d ? new Date(d).toLocaleDateString("en-GB", { day: "2-digit", month: "short", year: "numeric" }) : "—";
const pct = (p) =>
  Math.round((p?.length ? p.filter((x) => x.status === "Completed").length / p.length : 0) * 100);
function toast(msg, type = "success") {
  delete toastEl.dataset.i18n; // tToast marks text that is already translated
  toastEl.textContent = msg;
  toastEl.className = "toast " + type;
  toastEl.style.display = "block";
  setTimeout(() => (toastEl.style.display = "none"), 2800);
}
async function api(path, opts = {}) {
  await ccSessionReady;
  // The cookie goes along automatically; X-CSRF proves the request comes from this page (T124).
  opts.credentials = "same-origin";
  opts.headers = { ...(opts.headers || {}), "X-CSRF": "1" };
  if (opts.body && typeof opts.body !== "string") {
    opts.headers["Content-Type"] = "application/json";
    opts.body = JSON.stringify(opts.body);
  }
  // While a change is being saved, submit buttons are blocked so a double click can't send it twice.
  const busy = opts.method && opts.method !== "GET",
    button = busy && document.activeElement?.tagName === "BUTTON" ? document.activeElement : null;
  if (busy) {
    apiBusy++;
    document.body.classList.add("cc-busy");
    if (button) button.disabled = true;
  }
  try {
    const r = await fetch(API + path, opts);
    let d = {};
    try {
      d = await r.json();
    } catch {}
    if (!r.ok)
      throw Object.assign(new Error(d.error || t("ui.requestFailed")), { status: r.status, code: d.code });
    return d;
  } finally {
    if (busy) {
      if (!--apiBusy) document.body.classList.remove("cc-busy");
      if (button) button.disabled = false;
    }
  }
}
async function uploadFile(file) {
  return new Promise((resolve, reject) => {
    const r = new FileReader();
    r.onload = async () => {
      try {
        resolve(
          (await api("/upload", { method: "POST", body: { filename: file.name, content: r.result } })).file,
        );
      } catch (e) {
        reject(e);
      }
    };
    r.onerror = reject;
    r.readAsDataURL(file);
  });
}
function navigate(path) {
  location.hash = path.startsWith("#") ? path.slice(1) : path;
}
function modal(title, body) {
  modalRoot.innerHTML = `<div class="modal-backdrop" id="mb"><div class="modal"><div class="modal-head"><h2>${title}</h2><button class="close" onclick="closeModal()">×</button></div>${body}</div></div>`;
}
function closeModal() {
  modalRoot.innerHTML = "";
}
// The top bar: for visitors "Sign in" and a small "Start a project" pill (board Landing); signed in, an account
// chip, the way back to the workspace and sign-out. The header links and the footer take their words from keys.
function topActions() {
  const el = document.getElementById("topActions"),
    k = (key) => esc(t("ui.top." + key));
  if (el) {
    el.dataset.i18n = "keys";
    const u = state.user;
    if (!u) el.innerHTML = `${langSwitch(t("shell.language"), "shell.lang")}<a class="ds-top-signin" href="#/login">${k("signIn")}</a><a class="btn small primary ds-top-start" href="#/signup">${k("start")}</a>`;
    else {
      const initials = String(u.name || "U")
        .split(" ")
        .map((x) => x[0])
        .join("")
        .slice(0, 2)
        .toUpperCase();
      el.innerHTML = `<a class="pa-account" href="#/${esc(u.role)}/profile" title="${k("profile")}"><span class="avatar">${esc(initials)}</span><span class="pa-account-text"><b>${esc(u.name)}</b><small>${esc(
        t("ui.role." + u.role),
      )}</small></span></a>${langSwitch(t("shell.language"), "shell.lang")}<a class="btn primary" href="#/${esc(u.role)}/dashboard">${k("dashboard")}</a><button type="button" class="btn outline" data-action="ui.signOut">${k("logout")}</button>`;
    }
  }
  uiStaticTexts();
  updateCraftCrewShell();
}
function uiStaticTexts() {
  const nav = document.querySelector("body > .topbar .main-nav");
  if (nav && !nav.dataset.i18n) {
    nav.dataset.i18n = "keys";
    for (const a of nav.querySelectorAll("a")) {
      const key = { "#/how-it-works": "how", "#/suppliers": "suppliers", "#/pricing": "pricing", "#/faq": "support" }[a.getAttribute("href")];
      if (key) a.textContent = t("ui.nav." + key);
    }
  }
  const footer = document.querySelector("body > footer");
  if (footer && !footer.dataset.i18n) {
    footer.dataset.i18n = "keys";
    const p = footer.querySelector(":scope > p");
    if (p) p.textContent = t("ui.footer.claim");
  }
}
async function logout() {
  const token = state.token;
  state.user = null;
  state.token = "";
  localStorage.removeItem("cc_user");
  localStorage.removeItem("cc_token");
  document.body.classList.remove("authenticated");
  try {
    // Ends the session on the server and clears the cookie
    if (token) await (await fetch(API + "/auth/logout", { method: "POST", headers: { "X-CSRF": "1" } })).text();
  } catch (e) {}
  topActions();
  navigate("/");
  setTimeout(updateCraftCrewShell, 0);
}
function publicLayout(content) {
  return `<div class="cc-shell">${content}</div>`;
}
async function route() {
  topActions();
  const h = location.hash.replace(/^#/, "") || "/";
  if (!state.user && /^\/(customer|supplier|admin)/.test(h)) {
    navigate("/login");
    return;
  }
  try {
    const parts = h.split("/").filter(Boolean);
  } catch (e) {
    console.error(e);
    toast(e.message, "error");
    app.innerHTML = publicLayout(
      `<div class="cc-page" data-i18n="keys"><div class="empty"><h2>${esc(t("errors.pageFailed"))}</h2><p data-i18n="dom">${esc(e.message)}</p><a class="btn primary" href="#/">${esc(t("ui.home"))}</a></div></div>`,
    );
  }
}

/* ============================================================
   Authenticated shell controller
   Public marketing navigation is hidden after login.
   ============================================================ */
function updateCraftCrewShell() {
  // CraftCrew session is stored under cc_user/cc_token.
  const loggedIn = !!state.user && !!state.token;
  const currentRoute = (location.hash.replace(/^#/, "") || "/").split("?")[0];
  const inWorkspace = /^\/(customer|supplier|admin)(\/|$)/.test(currentRoute);
  document.body.classList.toggle("authenticated", loggedIn);
  document.body.classList.toggle("workspace-route", loggedIn && inWorkspace);
  const marketingHeader = document.querySelector(".topbar");
  const footer = document.querySelector("body > footer");
  if (marketingHeader) marketingHeader.style.display = loggedIn && inWorkspace ? "none" : "";
  if (footer) footer.style.display = loggedIn && inWorkspace ? "none" : "";
}

document.addEventListener("DOMContentLoaded", updateCraftCrewShell);
window.addEventListener("hashchange", updateCraftCrewShell);
window.addEventListener("storage", updateCraftCrewShell);
