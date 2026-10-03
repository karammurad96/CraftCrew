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
    if (!r.ok) throw new Error("Could not open this document");
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
async function profilePage(role) {
  const d = await api("/profile"),
    s = d.supplier || {},
    c = d.companyProfile || {};
  state.user = { ...state.user, ...d.user };
  localStorage.setItem("cc_user", JSON.stringify(state.user));
  app.innerHTML = dashboardShell(
    role,
    "profile",
    `<div class="dash-top"><div><div class="eyebrow">ACCOUNT WORKSPACE</div><h1>Company profile & settings</h1><p>Share the business identity and contacts project partners need.</p></div><button class="btn primary" onclick="wfEditCompanyProfile()">Edit company details</button></div><div class="wf-profile-head">${d.user.profileImage ? `<img class="wf-profile-image" src="${esc(d.user.profileImage)}" alt="Company profile">` : `<div class="supplier-avatar large">${esc((d.user.company || d.user.name).slice(0, 2).toUpperCase())}</div>`}<div><h2>${esc(d.user.company || "Company name required")}</h2><b>${esc(d.user.name)}</b><p>${esc(d.user.email)} · ${esc(c.phone || "Add phone")}</p></div></div><div class="wf-profile-grid">${[
      ["Legal name", c.legalName],
      ["VAT / tax ID", c.taxId],
      ["Industry", c.industry],
      ["Company size", c.companySize],
      ["Address", c.address],
      ["Website", c.website],
      ["Main contact", c.contactName || d.user.name],
      ["Phone", c.phone],
      ["Procurement email", c.procurementEmail],
      ["About", c.description],
    ]
      .map(
        ([k, v]) =>
          `<article class="cc-card"><span class="cc-label">${k}</span><b>${esc(v || "Add company information")}</b></article>`,
      )
      .join(
        "",
      )}</div>${s ? `<div class="panel" style="margin-top:16px"><h3>Supplier marketplace profile</h3><p>${esc(supplierBadge(s))} · ${Number(s.employees) || 0} staff · ${Number(s.experience) || 0} years</p><button class="btn outline" onclick="navigate('/supplier/suppliers')">Manage service catalog and team</button></div>` : ""}`,
  );
}
async function wfReadImage(file) {
  if (file.size > 1200000) throw new Error("Choose a profile image smaller than 1.2 MB");
  if (!file.type.startsWith("image/")) throw new Error("Choose an image file");
  return await new Promise((resolve, reject) => {
    const r = new FileReader();
    r.onload = () => resolve(r.result);
    r.onerror = reject;
    r.readAsDataURL(file);
  });
}
async function wfEditCompanyProfile() {
  const d = await api("/profile"),
    c = d.companyProfile || {};
  modal(
    "Edit company profile",
    `<form id="wfProfile" class="modal-form"><label>Company profile photo<input name="profileFile" type="file" accept="image/*"></label><div class="two"><label>Legal company name<input name="legalName" value="${esc(c.legalName || "")}"></label><label>Public company name<input name="company" value="${esc(d.user.company || "")}" required></label></div><div class="two"><label>VAT / tax ID<input name="taxId" value="${esc(c.taxId || "")}"></label><label>Industry<input name="industry" value="${esc(c.industry || "")}"></label></div><div class="two"><label>Company size<select name="companySize">${["", "1–10", "11–50", "51–250", "251–1000", "1000+"].map((x) => `<option ${x === c.companySize ? "selected" : ""}>${x}</option>`).join("")}</select></label><label>Phone<input name="phone" value="${esc(c.phone || "")}"></label></div><label>Registered / business address<textarea name="address">${esc(c.address || "")}</textarea></label><div class="two"><label>Website<input name="website" type="url" value="${esc(c.website || "")}"></label><label>Procurement email<input name="procurementEmail" type="email" value="${esc(c.procurementEmail || "")}"></label></div><label>Main contact<input name="contactName" value="${esc(c.contactName || d.user.name)}"></label><label>Company overview<textarea name="description">${esc(c.description || "")}</textarea></label><button class="btn primary">Save company profile</button></form>`,
  );
  document.getElementById("wfProfile").onsubmit = async (e) => {
    e.preventDefault();
    const fd = new FormData(e.target),
      file = fd.get("profileFile");
    let profileImage = d.user.profileImage || "";
    try {
      if (file?.size) profileImage = await wfReadImage(file);
      const companyProfile = Object.fromEntries([...fd.entries()].filter(([k]) => k !== "profileFile"));
      await api("/profile", {
        method: "PUT",
        body: { company: companyProfile.company, profileImage, companyProfile },
      });
      closeModal();
      profilePage(state.user.role);
    } catch (x) {
      toast(x.message, "error");
    }
  };
}
async function supplierCatalog() {
  const d = await api("/profile"),
    s = d.supplier || {},
    items = s.serviceCatalog || [];
  app.innerHTML = dashboardShell(
    "supplier",
    "suppliers",
    `<div class="dash-top"><div><div class="eyebrow">YOUR MARKETPLACE PROFILE</div><h1>Service catalog</h1><p>Manage individually priced services and the people qualified to deliver them.</p></div><div class="cc-actions"><button class="btn outline" onclick="editProfile()">Edit company details</button><button class="btn primary" onclick="wfEditCatalog()">Edit catalog & team</button></div></div><div class="notice">Customers can see your published services and send requests linked to a project task.</div><div class="wf-stat-grid"><div class="cc-card"><span class="cc-label">Employees</span><b>${Number(s.employees) || 0}</b></div><div class="cc-card"><span class="cc-label">Key people</span><b>${(s.teamMembers || []).length}</b></div><div class="cc-card"><span class="cc-label">Experience</span><b>${Number(s.experience) || 0}+ years</b></div></div><section class="panel"><div class="panel-title"><h3>Published services</h3><button class="btn small primary" onclick="wfEditCatalog()">+ Add service / person</button></div><div class="cc-table-wrap"><table class="cc-table"><thead><tr><th>Service / role</th><th>Description / qualifications</th><th>Rate</th><th>Capacity / lead time</th><th>Status</th></tr></thead><tbody>${items.map((x) => `<tr><td><b>${esc(x.name)}</b><small>${esc(x.category || "Service")}</small></td><td>${esc(x.description || "")}<small>${esc(x.qualifications || "")}</small></td><td>${money(x.rate || 0)} / ${esc(x.unit || "hour")}</td><td>${esc(x.capacity || "By agreement")}<small>${esc(x.leadTime || "Schedule on request")}</small></td><td>${esc(x.status || "Published")}</td></tr>`).join("") || '<tr><td colspan="5">Add catalog rows for each service or employee position.</td></tr>'}</tbody></table></div></section><section class="panel"><div class="panel-title"><h3>Key employees & specialist roles</h3><span>${(s.teamMembers || []).length} listed</span></div><div class="cc-table-wrap"><table class="cc-table"><thead><tr><th>Name</th><th>Role</th><th>Experience</th><th>Certifications</th><th>Availability</th></tr></thead><tbody>${(s.teamMembers || []).map((x) => `<tr><td>${esc(x.name)}</td><td>${esc(x.role)}</td><td>${esc(x.experience || "")}</td><td>${esc(x.certifications || "")}</td><td>${esc(x.availability || "Available")}</td></tr>`).join("") || '<tr><td colspan="5">No team profiles yet.</td></tr>'}</tbody></table></div></section>`,
  );
}
async function wfEditCatalog() {
  const d = await api("/profile"),
    s = d.supplier || {},
    catalog = s.serviceCatalog || [],
    team = s.teamMembers || [];
  modal(
    "Edit services and team",
    `<form id="wfCatalog" class="modal-form"><h3>Service rows</h3><div id="wfServiceRows">${catalog.map((x) => wfServiceRow(x)).join("")}</div><button type="button" class="btn small outline" onclick="wfAddServiceRow()">+ Add service position</button><h3>Employee / specialist rows</h3><div id="wfTeamRows">${team.map((x) => wfTeamRow(x)).join("")}</div><button type="button" class="btn small outline" onclick="wfAddTeamRow()">+ Add person</button><div class="two"><label>Total employees<input name="employees" type="number" min="0" value="${Number(s.employees) || team.length}"></label><label>Years in business<input name="experience" type="number" min="0" value="${Number(s.experience) || 0}"></label></div><div class="two"><label>Availability<select name="availability">${["Available", "Busy", "Unavailable"].map((x) => `<option ${x === s.availability ? "selected" : ""}>${x}</option>`).join("")}</select></label><label>Certifications<input name="certifications" value="${esc((s.certifications || []).join(", "))}"></label></div><div id="wfCatalogError" class="form-error"></div><button class="btn primary">Save catalog</button></form>`,
  );
  if (!catalog.length) wfAddServiceRow();
  if (!team.length) wfAddTeamRow();
  document.getElementById("wfCatalog").onsubmit = async (e) => {
    e.preventDefault();
    const fd = new FormData(e.target),
      readRows = (selector) =>
        [...document.querySelectorAll(selector)]
          .map((row) =>
            Object.fromEntries([...row.querySelectorAll("[name]")].map((el) => [el.name, el.value])),
          )
          .filter((x) => x.name),
      serviceCatalog = readRows(".wf-service-row"),
      teamMembers = readRows(".wf-person-row"),
      services = [...new Set([...serviceCatalog.map((x) => x.name), ...(s.services || [])])];
    try {
      await api("/profile", {
        method: "PUT",
        body: {
          serviceCatalog,
          teamMembers,
          services,
          employees: fd.get("employees"),
          experience: fd.get("experience"),
          availability: fd.get("availability"),
          certifications: String(fd.get("certifications") || "")
            .split(",")
            .map((x) => x.trim())
            .filter(Boolean),
        },
      });
      closeModal();
      supplierCatalog();
    } catch (x) {
      document.getElementById("wfCatalogError").textContent = x.message;
    }
  };
}
function wfServiceRow(x = {}) {
  return `<fieldset class="wf-service-row"><legend>Service / position</legend><button type="button" class="btn small danger wf-remove" onclick="this.closest('fieldset').remove()">Remove</button><div class="two"><label>Name<input name="name" value="${esc(x.name || "")}" required></label><label>Category<input name="category" value="${esc(x.category || "Service")}"></label></div><label>Description<input name="description" value="${esc(x.description || "")}"></label><div class="three"><label>Rate (€)<input name="rate" type="number" min="0" step="0.01" value="${Number(x.rate) || 0}"></label><label>Unit<select name="unit">${["hour", "day", "project", "unit", "fixed"].map((u) => `<option value="${u}" ${u === (x.unit || "hour") ? "selected" : ""}>${u}</option>`).join("")}</select></label><label>Capacity<input name="capacity" value="${esc(x.capacity || "")}" placeholder="3 crews"></label></div><div class="two"><label>Lead time<input name="leadTime" value="${esc(x.leadTime || "")}"></label><label>Qualifications<input name="qualifications" value="${esc(x.qualifications || "")}"></label></div></fieldset>`;
}
function wfTeamRow(x = {}) {
  return `<fieldset class="wf-person-row"><legend>Employee / specialist</legend><button type="button" class="btn small danger wf-remove" onclick="this.closest('fieldset').remove()">Remove</button><div class="three"><label>Name<input name="name" value="${esc(x.name || "")}" required></label><label>Role<input name="role" value="${esc(x.role || "")}"></label><label>Experience<input name="experience" value="${esc(x.experience || "")}"></label></div><div class="two"><label>Certifications<input name="certifications" value="${esc(x.certifications || "")}"></label><label>Availability<input name="availability" value="${esc(x.availability || "Available")}"></label></div></fieldset>`;
}
function wfAddServiceRow() {
  document.getElementById("wfServiceRows")?.insertAdjacentHTML("beforeend", wfServiceRow());
}
function wfAddTeamRow() {
  document.getElementById("wfTeamRows")?.insertAdjacentHTML("beforeend", wfTeamRow());
}
const wfOldRoute = async () => {
  const h = (location.hash.replace(/^#/, "") || "/").split("?")[0] || "/",
    parts = h.split("?")[0].split("/").filter(Boolean);
  // Public supplier profile, shareable as a link (T61).
  if (parts[0] === "customer") {
    if (parts[1] === "profile") return profilePage("customer");
  }
  if (parts[0] === "supplier") {
    if (parts[1] === "profile") return profilePage("supplier");
  }
  if (parts[0] === "admin") {
    if (parts[1] === "billing") return adminBilling();
    if (parts[1] === "reports") return adminReports();
    if (parts[1] === "disputes") return adminDisputes();
    if (parts[1] === "profile") return profilePage("admin");
  }
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
    if (parts[0] === "customer") {
      if (parts[1] === "profile") return profilePage("customer");
    }
    if (parts[0] === "supplier") {
      if (parts[1] === "profile") return profilePage("supplier");
      if (parts[1] === "suppliers") return supplierCatalog();
    }
    return await wfOldRoute();
  } catch (e) {
    console.error(e);
    toast(e.message, "error");
    const active = parts[1] || "dashboard";
    app.innerHTML = dashboardShell(
      state.user?.role || "customer",
      active,
      `<div class="empty"><h2>We could not open this page</h2><p>${esc(e.message)}</p><button class="btn primary" onclick="route()">Try again</button></div>`,
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
