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

async function newInvoice() {
  const d = await api("/projects"),
    profile = await api("/profile"),
    s = profile.supplier || {},
    selected = new URLSearchParams(location.hash.split("?")[1] || "");
  const eligible = [];
  for (const p of d.projects)
    for (const ph of p.phases || [])
      if (ph.supplierId === s.id && ph.acceptanceStatus === "Accepted") eligible.push({ p, ph });
  window.__ccInvoiceServices = s.services || [];
  window.__ccInvoiceEligible = eligible;
  if (!eligible.length) {
    await supplierInvoices();
    toast("An accepted phase is required before invoicing", "error");
    return;
  }
  await supplierInvoices();
  const serviceOpts = (s.services || []).map((x) => `<option value="${esc(x)}">${esc(x)}</option>`).join("");
  const phaseOpts = eligible
    .map(
      ({ p, ph }) => `<option value="${esc(p.id)}|${esc(ph.id)}">${esc(p.name)} — ${esc(ph.name)}</option>`,
    )
    .join("");
  modal(
    "Create invoice",
    `<p class="modal-intro">Choose the customer order and itemize the delivered work. CraftCrew compares the total with the phase order limit.</p><form id="invF" class="modal-form"><label>Project / phase *<select name="target" id="invTarget" required><option value="">Select an accepted order</option>${phaseOpts}</select></label><div id="invoiceContext" class="notice">Select a phase to view its customer and approved order amount.</div><div class="invoice-lines-head"><h3>Invoice positions</h3><button class="btn small outline" type="button" onclick="addInvoiceLine()">+ Add position</button></div><div id="invoiceLines"></div><div class="invoice-total-row"><span>Invoice total</span><strong id="invoiceTotal">€0</strong></div><div id="invoiceOrderCheck" class="order-check">Select an order to compare totals.</div><label>Invoice note *<textarea name="description" required maxlength="3000" placeholder="Milestone, work period or delivery reference"></textarea></label><label>Supporting attachment<input name="attachmentFile" type="file"></label><div id="invoiceError" class="form-error" role="alert"></div><div class="action-row"><button class="btn primary">Submit invoice</button><button type="button" class="btn outline" onclick="closeModal();navigate('/supplier/invoices')">Cancel</button></div></form>`,
  );
  const first = eligible.find((x) => x.p.id === selected.get("project") && x.ph.id === selected.get("phase"));
  if (first) document.getElementById("invTarget").value = `${first.p.id}|${first.ph.id}`;
  addInvoiceLine();
  const updateContext = () => {
    const [pid, phid] = (document.getElementById("invTarget").value || "|").split("|"),
      entry = eligible.find((x) => x.p.id === pid && x.ph.id === phid),
      box = document.getElementById("invoiceContext");
    if (!entry) {
      box.textContent = "Select a phase to view its customer and approved order amount.";
      box.className = "notice";
    } else {
      const cap = Number(entry.ph.orderAmount) || 0;
      box.innerHTML = `<b>Customer:</b> ${esc(entry.p.customer?.company || entry.p.customer?.name || "Customer")}<br><b>Order:</b> ${esc(entry.p.name)} · ${esc(entry.ph.name)}<br><b>Approved phase amount:</b> ${cap ? money(cap) : "No amount cap set"}`;
      box.className = "notice";
    }
    refreshInvoiceTotal();
  };
  document.getElementById("invTarget").onchange = updateContext;
  document.getElementById("invoiceLines").addEventListener("input", refreshInvoiceTotal);
  document.getElementById("invoiceLines").addEventListener("change", refreshInvoiceTotal);
  updateContext();
  document.getElementById("invF").onsubmit = async (e) => {
    e.preventDefault();
    const err = document.getElementById("invoiceError");
    err.textContent = "";
    const target = document.getElementById("invTarget").value;
    if (!target) {
      err.textContent = "Choose the customer order this invoice belongs to.";
      return;
    }
    const [projectId, phaseId] = target.split("|"),
      entry = eligible.find((x) => x.p.id === projectId && x.ph.id === phaseId);
    const lineItems = [...document.querySelectorAll(".invoice-line")].map((row) => ({
      service: row.querySelector("[name=service]").value,
      quantity: Number(row.querySelector("[name=quantity]").value),
      unit: row.querySelector("[name=unit]").value,
      unitPrice: Number(row.querySelector("[name=unitPrice]").value),
    }));
    if (!lineItems.length || lineItems.some((x) => !x.service || x.quantity <= 0 || x.unitPrice < 0)) {
      err.textContent = "Add at least one complete invoice position.";
      return;
    }
    const amount = lineItems.reduce((sum, x) => sum + x.quantity * x.unitPrice, 0),
      fd = new FormData(e.target),
      file = fd.get("attachmentFile");
    try {
      const attachment = file && file.size ? await uploadFile(file) : null;
      await api("/invoices", {
        method: "POST",
        body: { projectId, phaseId, lineItems, amount, description: fd.get("description"), attachment },
      });
      closeModal();
      toast("Invoice submitted");
      navigate("/supplier/invoices");
      await supplierInvoices();
    } catch (ex) {
      err.textContent = ex.message;
    }
  };
}

function addInvoiceLine() {
  const services = window.__ccInvoiceServices || [];
  const list = document.getElementById("invoiceLines");
  if (!list) return;
  const row = document.createElement("div");
  row.className = "invoice-line";
  row.innerHTML = `<label>Service<select name="service" required><option value="">Choose service</option>${services.map((x) => `<option value="${esc(x)}">${esc(x)}</option>`).join("")}</select></label><label>Amount<input name="quantity" type="number" min="0.01" step="0.01" value="1" required></label><label>Unit<select name="unit"><option value="hours">Hours</option><option value="units">Units</option></select></label><label>Rate (€)<input name="unitPrice" type="number" min="0" step="0.01" value="0" required></label><button type="button" class="btn small danger" aria-label="Remove position" onclick="this.closest('.invoice-line').remove();refreshInvoiceTotal()">Remove</button>`;
  list.appendChild(row);
}
function refreshInvoiceTotal() {
  const rows = [...document.querySelectorAll(".invoice-line")],
    total = rows.reduce(
      (sum, row) =>
        sum +
        (Number(row.querySelector("[name=quantity]")?.value) || 0) *
          (Number(row.querySelector("[name=unitPrice]")?.value) || 0),
      0,
    );
  const totalEl = document.getElementById("invoiceTotal");
  if (totalEl) totalEl.textContent = money(total);
  const target = document.getElementById("invTarget")?.value || "",
    check = document.getElementById("invoiceOrderCheck");
  if (!check) return;
  const eligible = window.__ccInvoiceEligible || [],
    [pid, phid] = target.split("|"),
    entry = eligible.find((x) => x.p.id === pid && x.ph.id === phid),
    cap = Number(entry?.ph.orderAmount) || 0;
  if (!entry || !cap) {
    check.textContent = entry
      ? "No order amount cap is set for this phase."
      : "Choose an order to compare the invoice.";
    check.className = "order-check";
    return;
  }
  const over = total - cap;
  check.textContent =
    over > 0
      ? `Exceeds order by ${money(over)}. The customer will see the overage before approval.`
      : `Within approved order amount (${money(cap)}); ${money(cap - total)} remaining.`;
  check.className = "order-check " + (over > 0 ? "over" : "within");
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
      if (parts[1] === "messages") return messages("customer");
      if (parts[1] === "profile") return profilePage("customer");
    }
    if (parts[0] === "supplier") {
      if (parts[1] === "invoices" && parts[2] === "new") return newInvoice();
      if (parts[1] === "suppliers") return supplierCatalog();
      if (parts[1] === "messages") return messages("supplier");
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
