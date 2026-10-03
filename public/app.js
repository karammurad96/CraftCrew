/* CraftCrew frontend. Business data is server-persisted. The session lives in an HttpOnly cookie that scripts
   can't read (T124); localStorage keeps only the signed-in user's profile and UI preferences. */
const API = "/api";
// A supplier's badge for display: the tier, "Verified" without a tier, or "Not yet verified" — never "None".
const supplierBadge = (s) =>
  s?.badge && s.badge !== "None" ? s.badge : s?.verified || s?.live ? "Verified" : "Not yet verified";
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
      throw Object.assign(new Error(d.error || "Request failed"), { status: r.status, code: d.code });
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
function formFields(fields) {
  return fields
    .map(
      (f) =>
        `<label>${esc(f.label)}${f.required ? " *" : ""}<${f.type === "textarea" ? "textarea" : "input"} name="${f.name}" ${f.type === "number" ? 'type="number"' : f.type === "date" ? 'type="date"' : f.type === "email" ? 'type="email"' : f.type === "password" ? 'type="password"' : ""} ${f.required ? "required" : ""} placeholder="${esc(f.placeholder || "")}">${f.type === "textarea" ? "" : ""}</${f.type === "textarea" ? "textarea" : "input"}></label>`,
    )
    .join("");
}
function topActions() {
  const el = document.getElementById("topActions");
  if (state.user)
    el.innerHTML = `<span class="subtle">${esc(state.user.name)}</span><button class="btn outline" onclick="navigate('/${state.user.role}/dashboard')">Dashboard</button><button class="btn ghost" onclick="logout()">Log out</button>`;
  else el.innerHTML = `<button class="btn ghost login-btn" onclick="navigate('/login')">Log in</button>`;
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
function publicHero() {
  return `<section class="hero-lite"><div><div class="eyebrow">INDUSTRIAL SERVICES, COORDINATED</div><h1>Build complex projects with <span>trusted crews.</span></h1><p>CraftCrew connects SMEs with vetted mechanical, electrical, automation and industrial service specialists — managed through one transparent waterfall workflow.</p><div class="hero-actions"><button class="btn primary lg" onclick="navigate('/signup')">Start a project</button><button class="btn outline lg" onclick="navigate('/suppliers')">Explore suppliers</button></div><div class="trust-row"><div><b>20+</b><small>vetted suppliers</small></div><div><b>5-stage</b><small>waterfall delivery</small></div><div><b>1 place</b><small>projects & payments</small></div></div></div><div class="hero-box"><div class="small-label">LIVE PROJECT CONTROL</div><h3 style="font-size:20px;margin:10px 0">Line 15 Integration</h3><div class="progress"><i style="width:68%"></i></div><div style="font-size:11px;color:#9eabc0">68% complete · 12 days remaining</div><div class="mini"><div><div class="small-label">ACTIVE PHASE</div><b>Programming</b><p style="color:#9eabc0">SPS Experts GmbH</p></div><div><div class="small-label">NEXT MILESTONE</div><b>Installation</b><p style="color:#9eabc0">18 Sep 2026</p></div></div></div></section>`;
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
      `<div class="cc-page"><div class="empty"><h2>Something went wrong</h2><p>${esc(e.message)}</p><button class="btn primary" onclick="route()">Retry</button></div></div>`,
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

const _originalTopActions = topActions;
topActions = function () {
  _originalTopActions();
  updateCraftCrewShell();
};

document.addEventListener("DOMContentLoaded", updateCraftCrewShell);
window.addEventListener("hashchange", updateCraftCrewShell);
window.addEventListener("storage", updateCraftCrewShell);
