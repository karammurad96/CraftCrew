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

/* ---------- Profile & settings per role ---------- */
const paBaseProfilePage = profilePage;
profilePage = async function (role) {
  if (role === "admin") return paAdminSettings();
  await paBaseProfilePage(role);
  const content = document.querySelector(".dashboard-content");
  if (!content) return;
  if (role !== "supplier")
    [...content.querySelectorAll(".panel")]
      .find((p) => p.querySelector("h3")?.textContent === "Supplier marketplace profile")
      ?.remove();
  content.insertAdjacentHTML("beforeend", await paSettingsPanels(role));
  paBindSettings();
};
async function paAdminSettings() {
  const d = await api("/profile");
  state.user = { ...state.user, ...d.user };
  app.innerHTML = dashboardShell(
    "admin",
    "profile",
    `<div class="dash-top"><div><div class="eyebrow">ADMIN ACCOUNT</div><h1>Account settings</h1><p>Your administrator account, security and notification preferences. Marketplace-wide settings live in Platform management.</p></div><button class="btn outline" onclick="navigate('/admin/platform')">Platform management</button></div>
    <section class="panel"><h3>Administrator</h3><div class="pa-kv"><span>Name</span><b>${paEsc(d.user.name)}</b><span>Email</span><b>${paEsc(d.user.email)}</b><span>Role</span><b>Administrator · full access to vetting, users, billing, reports and settings</b></div></section>${await paSettingsPanels("admin")}`,
  );
  paBindSettings();
}
async function paSettingsPanels(role) {
  const { user } = await api("/profile"),
    prefs = user.notificationPrefs || {},
    p = user.payoutDetails;
  const cats = [
    ["messages", "New messages"],
    ["invoices", "Invoices & payments"],
    ["documents", "Documents & approvals"],
    ["bids", "Bids, offers & quote requests"],
    ["projects", "Project & assignment updates"],
    ["time", "Time entries"],
  ];
  return `<div class="pa-settings">
    <section class="panel" id="paSecurity"><h3>Security</h3><p class="subtle">${user.passwordChangedAt ? `Password last changed ${date(user.passwordChangedAt)}.` : "Choose a strong, unique password."}</p><form id="paPasswordForm" class="modal-form"><label>Current password<input name="currentPassword" type="password" autocomplete="current-password" required></label><div class="two"><label>New password<input name="newPassword" type="password" autocomplete="new-password" minlength="10" required></label><label>Repeat new password<input name="confirm" type="password" autocomplete="new-password" minlength="10" required></label></div><small class="subtle">At least 10 characters with letters and numbers. Other signed-in devices are signed out.</small><div class="form-error" role="alert"></div><div class="cc-actions"><button class="btn primary">Change password</button><button type="button" class="btn outline" onclick="paSignOutOthers()">Sign out other sessions</button></div></form></section>
    <section class="panel"><h3>Email notifications</h3><p class="subtle">In-app notifications are always on. Choose which events also send an email copy.</p><form id="paPrefsForm" class="pa-prefs">${cats.map(([k, l]) => `<label class="cc-check-label"><input type="checkbox" name="${k}" ${prefs[k] ? "checked" : ""}> ${l}</label>`).join("")}<div><button class="btn outline small">Save preferences</button></div></form></section>
    ${
      role === "supplier"
        ? `<section class="panel"><h3>Payouts & billing details</h3><p class="subtle">Where customers pay approved invoices. Shown on your invoice PDFs and to CraftCrew administrators only.</p>${p ? `<div class="pa-kv"><span>Account holder</span><b>${paEsc(p.accountHolder)}</b><span>IBAN</span><b>${paEsc(p.iban.slice(0, 4) + " •••• " + p.iban.slice(-4))}</b><span>BIC</span><b>${paEsc(p.bic || "—")}</b><span>Bank</span><b>${paEsc(p.bankName || "—")}</b><span>Billing email</span><b>${paEsc(p.billingEmail || user.email)}</b></div>` : '<p class="danger-text">No payout account yet — add one so approved invoices can be paid.</p>'}<form id="paPayoutForm" class="modal-form" ${p ? "hidden" : ""}><div class="two"><label>Account holder *<input name="accountHolder" value="${paEsc(p?.accountHolder || user.companyProfile?.legalName || user.company || "")}" required></label><label>Bank name<input name="bankName" value="${paEsc(p?.bankName || "")}"></label></div><div class="two"><label>IBAN *<input name="iban" placeholder="DE89 3704 0044 0532 0130 00" required></label><label>BIC / SWIFT<input name="bic" value="${paEsc(p?.bic || "")}"></label></div><label>Billing email<input name="billingEmail" type="email" value="${paEsc(p?.billingEmail || "")}"></label><div class="form-error" role="alert"></div><button class="btn primary">Save payout details</button></form>${p ? '<button class="btn outline small" onclick="document.getElementById(\'paPayoutForm\').hidden=false;this.remove()">Change payout account</button>' : ""}</section>
    <section class="panel"><h3>Team & roles</h3><p class="subtle">Key people, roles and certifications are managed in your service catalog and shown on your public profile.</p><button class="btn outline" onclick="navigate('/supplier/suppliers')">Manage team & service catalog</button></section>`
        : ""
    }
  </div>`;
}
function paBindSettings() {
  const pw = document.getElementById("paPasswordForm");
  if (pw)
    pw.onsubmit = async (e) => {
      e.preventDefault();
      const f = Object.fromEntries(new FormData(pw)),
        err = pw.querySelector(".form-error");
      err.textContent = "";
      if (f.newPassword !== f.confirm) {
        err.textContent = "The new passwords do not match";
        return;
      }
      try {
        await api("/account/password", { method: "POST", body: f });
        pw.reset();
        toast("Password changed");
      } catch (x) {
        err.textContent = x.message;
      }
    };
  const prefs = document.getElementById("paPrefsForm");
  if (prefs)
    prefs.onsubmit = async (e) => {
      e.preventDefault();
      const np = {};
      prefs.querySelectorAll("input[type=checkbox]").forEach((c) => (np[c.name] = c.checked));
      try {
        await api("/account/preferences", { method: "PUT", body: { notificationPrefs: np } });
        toast("Notification preferences saved");
      } catch (x) {
        toast(x.message, "error");
      }
    };
  const pay = document.getElementById("paPayoutForm");
  if (pay)
    pay.onsubmit = async (e) => {
      e.preventDefault();
      const err = pay.querySelector(".form-error");
      err.textContent = "";
      try {
        await api("/account/payout", { method: "PUT", body: Object.fromEntries(new FormData(pay)) });
        toast("Payout details saved");
        profilePage("supplier");
      } catch (x) {
        err.textContent = x.message;
      }
    };
}
async function paSignOutOthers() {
  try {
    const r = await api("/account/sessions", { method: "DELETE" });
    toast(`${r.revoked} other session(s) signed out`);
  } catch (x) {
    toast(x.message, "error");
  }
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
      paClearSession("Your session has ended. Please sign in again.");
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
      return paClearSession("Your session has ended. Please sign in again.");
    if (!r.ok) return;
    const { user } = await r.json(),
      changed = !state.user || state.user.id !== user.id || state.user.role !== user.role;
    state.user = user;
    localStorage.setItem("cc_user", JSON.stringify(user));
    if (changed) route();
    else topActions();
  } catch {}
}
const paBaseTopActions = topActions;
topActions = function () {
  paBaseTopActions();
  const el = document.getElementById("topActions");
  if (!el || !state.user) return;
  // Signed in: one compact account chip, the way back to the workspace, and sign-out.
  const u = state.user,
    initials = String(u.name || "U")
      .split(" ")
      .map((x) => x[0])
      .join("")
      .slice(0, 2)
      .toUpperCase();
  const roleLabel = { customer: "Customer", supplier: "Supplier", admin: "Admin" }[u.role] || u.role;
  el.innerHTML = `<button type="button" class="pa-account" onclick="navigate('/${u.role}/profile')" title="Profile / Settings"><span class="avatar">${paEsc(initials)}</span><span class="pa-account-text"><b>${paEsc(u.name)}</b><small>${paEsc(roleLabel)}</small></span></button><button type="button" class="btn primary" onclick="navigate('/${u.role}/dashboard')">Dashboard</button><button type="button" class="btn outline" onclick="logout()">Log out</button>`;
};
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
