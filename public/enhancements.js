// Shared UI improvements and completed marketplace flows.
function modal(title, body) {
  modalRoot.innerHTML = `<div class="modal-backdrop" id="mb" onclick="if(event.target===this){closeModal();if(location.hash.split('?')[0]==='#/supplier/invoices/new')navigate('/supplier/invoices')}"><div class="modal" onclick="event.stopPropagation()"><div class="modal-head"><h2>${esc(title)}</h2><button class="close" type="button" aria-label="Close" onclick="closeModal()">×</button></div>${body}</div></div>`;
}



async function supplierCatalog() {
  const d = await api("/profile"),
    s = d.supplier || {};
  app.innerHTML = dashboardShell(
    "supplier",
    "suppliers",
    `<div class="dash-top"><div><div class="eyebrow">YOUR MARKETPLACE PROFILE</div><h1>Service catalog</h1><p>Manage the services, people, credentials and rates customers can evaluate.</p></div><div class="cc-actions"><button class="btn outline" onclick="editProfile()">Edit company details</button><button class="btn primary" onclick="editCatalog()">Edit catalog & team</button></div></div>${!s.live ? '<div class="notice">Your profile is private until the supplier vetting process is approved. You can complete it now.</div>' : ""}<div class="supplier-profile-head"><div class="supplier-avatar large">${esc(s.avatar || "CC")}</div><div><h2>${esc(s.company || d.user.company || "Your company")}</h2><p>${esc(s.location || "Add your location")} · ${esc(s.applicationStatus || "Profile draft")}</p></div><span class="badge ${(s.badge || "bronze").toLowerCase()}">${esc(supplierBadge(s))}</span></div><div class="health"><div class="cc-card"><span class="cc-label">Employees</span><b>${Number(s.employees) || 0}</b></div><div class="cc-card"><span class="cc-label">Experience</span><b>${Number(s.experience) || 0}+ years</b></div><div class="cc-card"><span class="cc-label">Rates</span><b>${money(s.hourlyRate || 0)}/h · ${money(s.projectRate || 0)} starting</b></div></div><div class="supplier-profile-grid"><section class="cc-card"><h2>Services</h2>${(s.services || []).map((x) => `<span class="chip">${esc(x)}</span>`).join("") || '<p class="muted">Add services to make your capabilities clear.</p>'}<h2>Certifications</h2>${(s.certifications || []).map((x) => `<span class="chip">${esc(x)}</span>`).join("") || '<p class="muted">Add your current certifications.</p>'}<h2>About your company</h2><p>${esc(s.description || "Add a short company overview.")}</p></section><section class="cc-card"><h2>Your people</h2><p>${Number(s.employees) || 0} employees</p>${(s.teamMembers || []).map((m) => `<div class="team-row"><b>${esc(m.name)}</b><span>${esc(m.role)}</span><small>${esc(m.experience || m.certifications || "")}</small></div>`).join("") || '<p class="muted">Add key workers and employee roles for customers to review.</p>'}</section></div>`,
  );
}

async function editCatalog() {
  const d = await api("/profile"),
    s = d.supplier || {},
    services = [
      "Mechanical Engineering",
      "Electrical Engineering",
      "PLC Programming",
      "Robotics",
      "CAD / Design",
      "Manufacturing",
      "Installation",
      "Commissioning",
      "Project Management",
      "Industrial Shipping",
    ],
    certs = [
      "ISO 9001",
      "ISO 13849",
      "ISO 14001",
      "ISO 45001",
      "TÜV",
      "CE Machinery",
      "VDA 6.3",
      "SCC Safety",
    ];
  const team = (s.teamMembers || [])
    .map((m) => [m.name, m.role, m.experience || m.certifications].filter(Boolean).join(" — "))
    .join("\n");
  modal(
    "Edit services & team",
    `<form id="catf" class="modal-form"><h3>Services customers can request</h3><div class="check-grid2">${services.map((x) => `<label class="choice-row"><input type="checkbox" name="services" value="${esc(x)}" ${(s.services || []).includes(x) ? "checked" : ""}> ${esc(x)}</label>`).join("")}</div><h3>Certifications</h3><div class="check-grid2">${certs.map((x) => `<label class="choice-row"><input type="checkbox" name="certifications" value="${esc(x)}" ${(s.certifications || []).includes(x) ? "checked" : ""}> ${esc(x)}</label>`).join("")}</div><div class="two"><label>Employees<input name="employees" type="number" min="0" value="${Number(s.employees) || 0}"></label><label>Years of experience<input name="experience" type="number" min="0" value="${Number(s.experience) || 0}"></label></div><label>Key employees <small>One person per line: Name — Role — experience or certification</small><textarea name="teamText" rows="5" placeholder="Marta Keller — Project lead — 12 years&#10;Jonas Weber — PLC engineer — Siemens certified">${esc(team)}</textarea></label><div class="two"><label>Availability<select name="availability"><option>Available</option><option>Busy</option><option>Unavailable</option></select></label><label>Hourly rate (€)<input name="hourlyRate" type="number" min="0" step="0.01" value="${Number(s.hourlyRate) || 0}"></label></div><label>Starting project rate (€)<input name="projectRate" type="number" min="0" step="0.01" value="${Number(s.projectRate) || 0}"></label><div id="catalogError" class="form-error" role="alert"></div><button class="btn primary">Save company catalog</button></form>`,
  );
  document.querySelector("#catf select[name=availability]").value = s.availability || "Available";
  document.getElementById("catf").onsubmit = async (e) => {
    e.preventDefault();
    const fd = new FormData(e.target),
      teamMembers = String(fd.get("teamText") || "")
        .split(/\r?\n/)
        .map((x) => x.trim())
        .filter(Boolean)
        .map((line) => {
          const [name, role, ...rest] = line.split("—").map((x) => x.trim());
          return { name, role: role || "", experience: rest.join(" — ") || "" };
        });
    const b = {
      services: fd.getAll("services"),
      certifications: fd.getAll("certifications"),
      employees: fd.get("employees"),
      experience: fd.get("experience"),
      teamMembers,
      availability: fd.get("availability"),
      hourlyRate: fd.get("hourlyRate"),
      projectRate: fd.get("projectRate"),
    };
    try {
      await api("/profile", { method: "PUT", body: b });
      closeModal();
      toast("Service catalog updated");
      supplierCatalog();
    } catch (err) {
      document.getElementById("catalogError").textContent = err.message;
    }
  };
}

async function editProfile() {
  const d = await api("/profile"),
    s = d.supplier || {};
  modal(
    "Edit company details",
    `<form id="pf" class="modal-form"><label>Contact name<input name="name" value="${esc(d.user.name)}" required></label><label>Company<input name="company" value="${esc(d.user.company || s.company || "")}" required></label><label>Location<input name="location" value="${esc(s.location || "")}" placeholder="City, country"></label><label>Company overview<textarea name="description" rows="5">${esc(s.description || "")}</textarea></label><div id="profileError" class="form-error" role="alert"></div><button class="btn primary">Save company profile</button></form>`,
  );
  document.getElementById("pf").onsubmit = async (e) => {
    e.preventDefault();
    try {
      await api("/profile", { method: "PUT", body: Object.fromEntries(new FormData(e.target)) });
      closeModal();
      toast("Company profile updated");
      route();
    } catch (err) {
      document.getElementById("profileError").textContent = err.message;
    }
  };
}


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
      if (parts[1] === "suppliers") return supplierCatalog();
      if (parts[1] === "profile") return profilePage("supplier");
    }
    if (parts[0] === "admin") {
      if (parts[1] === "applications") return adminApplications();
      if (parts[1] === "users") return adminUsers();
      if (parts[1] === "billing") return adminBilling();
      if (parts[1] === "reports") return adminReports();
      if (parts[1] === "disputes") return adminDisputes();
      if (parts[1] === "profile") return profilePage("admin");
    }
  } catch (e) {
    console.error(e);
    toast(e.message, "error");
    const content = `<div class="empty"><h2>Something went wrong</h2><p>${esc(e.message)}</p><button class="btn primary" onclick="route()">Retry</button></div>`,
      active =
        parts[0] === state.user?.role
          ? parts[1] === "invoices"
            ? "invoices"
            : parts[1] || "dashboard"
          : "dashboard";
    app.innerHTML = state.user
      ? dashboardShell(state.user.role, active, content)
      : publicLayout(`<div class="cc-page">${content}</div>`);
  }
}

window.addEventListener("DOMContentLoaded", async () => {
  if (state.token) {
    try {
      const d = await api("/auth/me");
      state.user = d.user;
      localStorage.setItem("cc_user", JSON.stringify(d.user));
      document.body.classList.add("authenticated");
    } catch (e) {
      // An expired session keeps the page the user wanted and says why they must sign in again.
      if (e.status === 401) sessionExpired();
      else logout();
      return;
    }
  }
  route();
});
