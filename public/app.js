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
async function supplierCatalog() {
  const d = await api("/profile"),
    s = d.supplier;
  app.innerHTML = dashboardShell(
    "supplier",
    "suppliers",
    `<div class="dash-top"><div><h1>Service catalog</h1><p>What customers see when evaluating your company.</p></div><div class="cc-actions"><button class="btn outline" onclick="editProfile()">Edit profile</button><button class="btn primary" onclick="editCatalog()">Edit services & rates</button></div></div><div class="cc-card"><div class="supplier-top"><div class="supplier-avatar">${esc(s.avatar)}</div><div><h2 style="margin:0">${esc(s.company)}</h2><p>${esc(s.location)} · ${esc(supplierBadge(s))} · ★ ${s.rating}</p></div></div><h4>Services</h4>${s.services.map((x) => `<span class="chip">${esc(x)}</span>`).join("")}<h4>Certifications</h4>${s.certifications.map((x) => `<span class="chip">${esc(x)}</span>`).join("")}<div class="detail-grid" style="margin-top:20px"><div class="detail-box"><small>Experience</small><b>${s.experience} years</b></div><div class="detail-box"><small>Projects</small><b>${s.projectsCompleted}</b></div><div class="detail-box"><small>Hourly rate</small><b>${money(s.hourlyRate)}</b></div><div class="detail-box"><small>Availability</small><b>${s.availability}</b></div></div><p>${esc(s.description)}</p></div>`,
  );
}
async function editCatalog() {
  const d = await api("/profile"),
    s = d.supplier;
  modal(
    "Edit service catalog",
    `<form id="catf" class="modal-form"><label>Services</label><div class="check-grid2">${["Mechanical Engineering", "Electrical Engineering", "PLC Programming", "Robotics", "CAD / Design", "Manufacturing", "Installation", "Commissioning", "Project Management", "Industrial Shipping"].map((x) => `<label><input type="checkbox" name="services" value="${esc(x)}" ${s.services.includes(x) ? "checked" : ""}> ${esc(x)}</label>`).join("")}</div><label>Certifications</label><div class="check-grid2">${["ISO 9001", "ISO 13849", "ISO 14001", "ISO 45001", "TÜV", "CE Machinery", "VDA 6.3", "SCC Safety"].map((x) => `<label><input type="checkbox" name="certifications" value="${esc(x)}" ${s.certifications.includes(x) ? "checked" : ""}> ${esc(x)}</label>`).join("")}</div><div class="two"><label>Availability<select name="availability"><option>Available</option><option>Busy</option><option>Unavailable</option></select></label><label>Hourly rate (€)<input name="hourlyRate" type="number" value="${s.hourlyRate}"></label></div><label>Starting project rate (€)<input name="projectRate" type="number" value="${s.projectRate}"></label><button class="btn primary">Save catalog</button></form>`,
  );
  document.querySelector("#catf select").value = s.availability;
  document.getElementById("catf").onsubmit = async (e) => {
    e.preventDefault();
    const fd = new FormData(e.target),
      b = {
        availability: fd.get("availability"),
        hourlyRate: fd.get("hourlyRate"),
        projectRate: fd.get("projectRate"),
        services: fd.getAll("services"),
        certifications: fd.getAll("certifications"),
      };
    await api("/profile", { method: "PUT", body: b });
    closeModal();
    toast("Service catalog updated");
    supplierCatalog();
  };
}
async function profilePage(role) {
  const d = await api("/profile");
  app.innerHTML = dashboardShell(
    role,
    "profile",
    `<div class="dash-top"><div><h1>Profile & settings</h1><p>Account information and platform preferences.</p></div><button class="btn primary" onclick="editProfile()">Edit</button></div><div class="cc-grid"><div class="cc-card"><span class="cc-label">Name</span><h3>${esc(d.user.name)}</h3><p>${esc(d.user.email)}</p></div><div class="cc-card"><span class="cc-label">Company</span><h3>${esc(d.user.company || "—")}</h3></div>${d.supplier ? `<div class="cc-card"><span class="cc-label">Supplier badge</span><h3>${esc(supplierBadge(d.supplier))}</h3><p>Verified · ${d.supplier.availability}</p></div>` : ""}</div><div class="cc-card" style="margin-top:15px"><h3>Data portability</h3><p>Download a JSON backup of the platform database (admin) or your account data.</p><button class="btn outline" onclick="exportData()">Export JSON</button></div>`,
  );
}
async function editProfile() {
  const d = await api("/profile"),
    s = d.supplier;
  modal(
    "Edit profile",
    `<form id="pf" class="modal-form"><label>Name<input name="name" value="${esc(d.user.name)}" required></label><label>Company<input name="company" value="${esc(d.user.company || "")}"></label>${s ? `<label>Location<input name="location" value="${esc(s.location)}"></label><label>Description<textarea name="description">${esc(s.description)}</textarea></label>` : ""}<button class="btn primary">Save</button></form>`,
  );
  document.getElementById("pf").onsubmit = async (e) => {
    e.preventDefault();
    await api("/profile", { method: "PUT", body: Object.fromEntries(new FormData(e.target)) });
    closeModal();
    toast("Profile updated");
    route();
  };
}
async function exportData() {
  const d = await api("/backup/export");
  const blob = new Blob([JSON.stringify(d, null, 2)], { type: "application/json" }),
    a = document.createElement("a");
  a.href = URL.createObjectURL(blob);
  a.download = "craftcrew-backup.json";
  a.click();
  URL.revokeObjectURL(a.href);
}
async function importData(input) {
  const f = input.files[0];
  if (!f) return;
  try {
    const data = JSON.parse(await f.text()),
      backup = data.data || data,
      n = (k) => (Array.isArray(backup[k]) ? backup[k].length : 0),
      de = typeof i18nLang !== "undefined" && i18nLang === "de";
    const ok = await uiDialog({
      title: "Import backup?",
      message: de
        ? `Alle aktuellen Daten werden durch die Sicherung ersetzt: ${n("users")} Benutzer, ${n("projects")} Projekte, ${n("invoices")} Rechnungen, ${n("suppliers")} Lieferanten. Eine Kopie der aktuellen Daten wird vorher gespeichert.`
        : `All current data will be replaced by the backup: ${n("users")} users, ${n("projects")} projects, ${n("invoices")} invoices, ${n("suppliers")} suppliers. A copy of the current data is saved first.`,
      confirmLabel: "Import backup",
      danger: true,
    });
    input.value = "";
    if (!ok) return;
    await api("/backup/import", { method: "POST", body: { data: backup } });
    toast("Backup imported");
    adminReports();
  } catch (e) {
    toast(e.message, "error");
  }
}
async function adminBilling() {
  const d = await api("/invoices");
  app.innerHTML = dashboardShell(
    "admin",
    "billing",
    `<div class="dash-top"><div><h1>Payments & billing</h1><p>Platform-wide invoice state and scheduled payments.</p></div></div><div class="panel"><div class="cc-table-wrap"><table class="cc-table"><thead><tr><th>Invoice</th><th>Customer</th><th>Supplier</th><th>Amount</th><th>Status</th><th>Action</th></tr></thead><tbody>${d.invoices.map((i) => `<tr><td>${esc(invNo(i))}</td><td>${i.customerId}</td><td>${i.supplierId}</td><td>${money(i.amount)}</td><td><span class="status ${i.status.toLowerCase().replaceAll(" ", "-")}">${i.status}</span></td><td>${i.status === "Approved" ? `<button class="btn small success" onclick="markPaid('${i.id}')">Mark paid</button>` : ""}</td></tr>`).join("")}</tbody></table></div></div>`,
  );
}
async function adminDisputes() {
  const d = await api("/disputes");
  app.innerHTML = dashboardShell(
    "admin",
    "disputes",
    `<div class="dash-top"><div><h1>Escalations & support</h1><p>Resolve delivery, quality, timeline and invoice disputes.</p></div></div><div class="cc-grid">${d.disputes.map((x) => `<article class="cc-card"><div style="display:flex;justify-content:space-between"><b>${esc(x.type)}</b><span class="tag ${x.status === "Open" ? "orange" : "green"}">${esc(x.status)}</span></div><p>${esc(x.description)}</p><small>${esc(x.projectId)} · ${date(x.createdAt)}</small>${x.status === "Open" ? `<div class="cc-actions" style="margin-top:12px"><button class="btn small success" onclick="resolveDispute('${x.id}')">Resolve</button></div>` : ""}</article>`).join("") || '<div class="empty">No escalations.</div>'}</div>`,
  );
}
async function resolveDispute(id) {
  const resolution = await uiPrompt("Resolution / outcome");
  if (!resolution) return;
  await api("/admin/disputes/" + id, { method: "PATCH", body: { status: "Resolved", resolution } });
  toast("Escalation resolved");
  adminDisputes();
}
async function markPaid(id) {
  await api("/admin/invoices/" + id, { method: "PATCH", body: { action: "Mark Paid" } });
  toast("Payment marked paid");
  adminBilling();
}
async function adminReports() {
  const m = await api("/admin/metrics");
  app.innerHTML = dashboardShell(
    "admin",
    "reports",
    `<div class="dash-top"><div><h1>Reports & analytics</h1><p>Simple operational metrics for the MVP.</p></div></div><div class="cc-grid4"><div class="cc-card"><span class="cc-label">Users</span><div class="cc-kpi">${m.metrics.users}</div></div><div class="cc-card"><span class="cc-label">Live suppliers</span><div class="cc-kpi">${m.metrics.suppliers}</div></div><div class="cc-card"><span class="cc-label">Projects</span><div class="cc-kpi">${m.metrics.projects}</div></div><div class="cc-card"><span class="cc-label">Gross invoice volume</span><div class="cc-kpi">${money(m.metrics.grossVolume)}</div></div></div><div class="cc-card" style="margin-top:15px"><h3>Backup / restore</h3><p>Export the full JSON database. Admin import is available through the API and can be wired to a file picker for production deployment.</p><button class="btn outline" onclick="exportData()">Export full JSON</button><label class="btn outline">Import JSON<input type="file" hidden accept="application/json" onchange="importData(this)"></label></div>`,
  );
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
    if (parts[0] === "customer") {
      if (parts[1] === "profile") return profilePage("customer");
    }
    if (parts[0] === "supplier") {
      if (parts[1] === "suppliers") return supplierCatalog();
      if (parts[1] === "profile") return profilePage("supplier");
    }
    if (parts[0] === "admin") {
      if (parts[1] === "billing") return adminBilling();
      if (parts[1] === "reports") return adminReports();
      if (parts[1] === "disputes") return adminDisputes();
      if (parts[1] === "profile") return profilePage("admin");
    }
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
