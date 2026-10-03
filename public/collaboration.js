// Consolidated fixes for the latest browser review comments.
const ccEsc = (s) => esc(s ?? "");
const ccProjects = async () => (await api("/projects")).projects || [];

// Searchable invoice selector is added directly by the rich invoice form.

// Page routing + persistent sidebar links.
const ccBaseRoute = window.route;
window.route = async function () {
  const path = location.hash.replace(/^#/, "").split("?")[0],
    parts = path.split("/").filter(Boolean),
    role = state.user?.role;
  try {
    await ccBaseRoute();
  } catch (e) {
    console.error(e);
    toast(e.message, "error");
    app.innerHTML = dashboardShell(
      role || "supplier",
      "dashboard",
      `<div class="panel"><h2>Could not load this page</h2><p>${ccEsc(e.message)}</p></div>`,
    );
  }
};

// Admin account controls and the persistent platform-configuration workspace.

adminUsers = async function () {
  const [d, sd] = await Promise.all([api("/admin/users"), api("/admin/suppliers")]),
    users = d.users || [];
  app.innerHTML = dashboardShell(
    "admin",
    "users",
    `<div class="dash-top"><div><h1>Users & supplier badges</h1><p>Manage account access and supplier verification badges.</p></div></div><section class="panel"><div class="panel-title"><h3>Supplier directory badges</h3><span>${sd.suppliers.length} suppliers</span></div><div class="cc-table-wrap"><table class="cc-table"><thead><tr><th>Supplier</th><th>Location</th><th>Account</th><th>Current badge</th><th>Change badge</th></tr></thead><tbody>${
      sd.suppliers
        .map((s) => {
          const account = users.find((u) => u.supplierId === s.id);
          return `<tr><td><b>${ccEsc(s.company)}</b><small>${s.live ? "Live in directory" : "Not live"}</small></td><td>${ccEsc(s.location || "—")}</td><td>${ccEsc(account?.email || "No linked account")}</td><td>${ccEsc(supplierBadge(s))}</td><td><select aria-label="Badge for ${ccEsc(s.company)}" onchange="reviewChangeBadge('${s.id}',this.value)">${["None", "Bronze", "Silver", "Gold"].map((x) => `<option ${x === (s.badge || "None") ? "selected" : ""}>${x}</option>`).join("")}</select></td></tr>`;
        })
        .join("") || '<tr><td colspan="5">No supplier companies yet.</td></tr>'
    }</tbody></table></div></section><section class="panel"><div class="panel-title"><h3>Accounts</h3><span>${users.length} users</span></div><div class="cc-table-wrap"><table class="cc-table"><thead><tr><th>Name</th><th>Email</th><th>Role</th><th>Company</th><th>Access</th><th></th></tr></thead><tbody>${users
      .map((u) => {
        const status = u.status || "Active",
          self = u.id === state.user.id;
        return `<tr><td><b>${ccEsc(u.name)}</b></td><td>${ccEsc(u.email)}</td><td><span class="tag">${ccEsc(u.role)}</span></td><td>${ccEsc(u.company || "—")}</td><td><span class="status ${status === "Active" ? "completed" : "rejected"}">${ccEsc(status)}</span></td><td>${self ? "<small>Current admin</small>" : `<button class="btn small ${status === "Active" ? "danger" : "success"}" onclick="ccSetAccountStatus('${u.id}','${status === "Active" ? "Suspended" : "Active"}')">${status === "Active" ? "Suspend" : "Reactivate"}</button>`}</td></tr>`;
      })
      .join(
        "",
      )}</tbody></table></div><p class="subtle">Suspending revokes active sessions and blocks future sign-ins. The last active admin account is protected.</p></section>`,
  );
};
async function ccSetAccountStatus(id, status) {
  if (!(await uiConfirm(`${status === "Suspended" ? "Suspend" : "Reactivate"} this account?`))) return;
  try {
    await api(`/admin/users/${encodeURIComponent(id)}`, { method: "PATCH", body: { status } });
    toast(`Account ${status.toLowerCase()}`);
    adminUsers();
  } catch (e) {
    toast(e.message, "error");
  }
}

async function ccAdminPlatform() {
  const { settings: s } = await api("/admin/settings");
  app.innerHTML = dashboardShell(
    "admin",
    "platform",
    `<div class="dash-top"><div><div class="eyebrow">OPERATIONS CONFIGURATION</div><h1>Platform management</h1><p>Maintain marketplace rules and help content. Payment, map and email connectors are shown as configuration notes; live credentials are not stored here.</p></div></div><form id="ccPlatformSettings" class="cc-platform-settings"><section class="panel"><div class="panel-title"><h3>Service categories</h3><small>One category per line</small></div><textarea name="serviceCategories" rows="7" required aria-label="Service categories, one per line">${ccEsc(s.serviceCategories.join("\n"))}</textarea></section><section class="panel"><div class="panel-title"><h3>Supplier badge criteria</h3><small>Thresholds used by admins when assigning Bronze, Silver or Gold</small></div><div class="cc-badge-criteria">${["bronze", "silver", "gold"].map((k) => `<fieldset><legend>${k[0].toUpperCase() + k.slice(1)}</legend><label>Completed projects<input type="number" min="0" name="${k}Projects" value="${Number(s.badgeCriteria?.[k]?.projects) || 0}"></label><label>Minimum rating<input type="number" min="0" max="5" step="0.1" name="${k}Rating" value="${Number(s.badgeCriteria?.[k]?.rating) || 0}"></label></fieldset>`).join("")}</div></section><section class="panel"><div class="panel-title"><h3>System settings</h3></div><div class="cc-platform-grid"><label>Support email<input type="email" name="supportEmail" value="${ccEsc(s.supportEmail)}" required></label><label>Platform fee estimate (%)<input type="number" name="platformFeePercent" min="0" max="25" step="0.1" value="${Number(s.platformFeePercent) || 0}" required></label><label>Default payment terms (days)<input type="number" name="defaultPaymentTermsDays" min="0" max="180" value="${Number(s.defaultPaymentTermsDays) || 0}" required></label><label>Upload limit (MB)<input type="number" name="uploadLimitMb" min="1" max="5" value="${Number(s.uploadLimitMb) || 5}" required></label></div></section><section class="panel"><div class="panel-title"><h3>FAQ & help content</h3><small>Shared public help text</small></div><textarea name="faqContent" rows="6" maxlength="10000" placeholder="Add support articles or updated FAQ content">${ccEsc(s.faqContent || "")}</textarea></section><section class="panel"><div class="panel-title"><h3>Email template subjects</h3><small>Editable labels for future outbound mail integration</small></div><div class="cc-platform-grid">${Object.entries(
      s.emailTemplates || {},
    )
      .map(
        ([k, v]) =>
          `<label>${ccEsc(k.replaceAll(/([A-Z])/g, " $1"))}<input name="email_${ccEsc(k)}" value="${ccEsc(v)}" maxlength="300"></label>`,
      )
      .join(
        "",
      )}</div></section><section class="panel"><div class="panel-title"><h3>Integrations</h3><small>Current MVP connector status</small></div><div class="cc-integration-list">${Object.entries(
      s.integrations || {},
    )
      .map(
        ([k, v]) =>
          `<div><b>${ccEsc(k[0].toUpperCase() + k.slice(1))}</b><span>${ccEsc(v)}</span><em>Configuration only</em></div>`,
      )
      .join(
        "",
      )}</div><p class="subtle">Live payment processing, email delivery and external map credentials require provider setup before activation.</p></section><div class="cc-actions"><button class="btn primary">Save platform settings</button><span id="ccPlatformSaved" class="subtle"></span></div></form>`,
  );
  document.getElementById("ccPlatformSettings").onsubmit = async (e) => {
    e.preventDefault();
    const f = new FormData(e.target),
      emailTemplates = {};
    for (const k of Object.keys(s.emailTemplates || {})) emailTemplates[k] = f.get("email_" + k) || "";
    const badgeCriteria = {};
    for (const k of ["bronze", "silver", "gold"])
      badgeCriteria[k] = { projects: Number(f.get(k + "Projects")), rating: Number(f.get(k + "Rating")) };
    const body = {
      serviceCategories: String(f.get("serviceCategories"))
        .split(/\r?\n/)
        .map((x) => x.trim())
        .filter(Boolean),
      badgeCriteria,
      supportEmail: f.get("supportEmail"),
      platformFeePercent: f.get("platformFeePercent"),
      defaultPaymentTermsDays: f.get("defaultPaymentTermsDays"),
      uploadLimitMb: f.get("uploadLimitMb"),
      faqContent: f.get("faqContent"),
      emailTemplates,
    };
    try {
      await api("/admin/settings", { method: "PUT", body });
      document.getElementById("ccPlatformSaved").textContent = "Saved";
      toast("Platform settings saved");
    } catch (x) {
      toast(x.message, "error");
    }
  };
}

const ccRouteWithAdmin = window.route;
window.route = async function () {
  const parts = location.hash.replace(/^#/, "").split("?")[0].split("/").filter(Boolean);
  if (parts[0] === "admin" && parts[1] === "platform") {
    try {
      await ccAdminPlatform();
      return;
    } catch (e) {
      toast(e.message, "error");
      return;
    }
  }
  return ccRouteWithAdmin();
};


adminApplications = async function () {
  const { applications = [] } = await api("/admin/applications");
  app.innerHTML = dashboardShell(
    "admin",
    "applications",
    `<div class="dash-top"><div><h1>Supplier verification pipeline</h1><p>Check evidence, record references and risk, then approve, hold or reject each application.</p></div></div><section class="panel"><div class="cc-table-wrap"><table class="cc-table"><thead><tr><th>Company / contact</th><th>Vetting stage</th><th>Decision</th><th>Submitted</th><th></th></tr></thead><tbody>${applications.map((a) => `<tr><td><b>${ccEsc(a.company)}</b><small>${ccEsc(a.contactName || a.directorName || "")} · ${ccEsc(a.email)}</small></td><td>${ccEsc(a.stage || "New")}</td><td><span class="status ${a.status === "Approved" ? "completed" : a.status === "Rejected" ? "rejected" : a.status === "On Hold" ? "submitted" : "active"}">${ccEsc(a.status || "New")}</span></td><td>${date(a.createdAt)}</td><td><button class="btn small primary" onclick="reviewApplication('${a.id}')">Review file</button></td></tr>`).join("") || '<tr><td colspan="5">No applications received.</td></tr>'}</tbody></table></div></section>`,
  );
};

reviewApplication = async function (id) {
  const { applications = [] } = await api("/admin/applications"),
    a = applications.find((x) => x.id === id);
  if (!a) return;
  const v = a.verification || { checks: {}, riskLevel: "Not assessed" },
    checks = [
      ["registration", "Company registration"],
      ["vat", "VAT / tax check"],
      ["insurance", "Insurance evidence"],
      ["certifications", "Certificates"],
      ["references", "Reference calls"],
      ["sanctions", "Sanctions / KYC"],
    ];
  modal(
    "Supplier verification file",
    `<div class="cc-vetting-flow"><span class="on">1 Application</span><span class="on">2 Verification</span><span class="on">3 References</span><span class="on">4 Manual review</span><span>5 Decision & badge</span></div><div class="cc-vetting-grid"><section class="panel"><h3>Company & capability</h3><dl>${[
      ["Company", a.company],
      ["Contact", a.contactName || a.directorName],
      ["Email / phone", `${a.email} · ${a.phone}`],
      ["Registration / VAT", `${a.registrationNumber || "—"} · ${a.vatId || "—"}`],
      ["Legal address", a.legalAddress || a.location],
      ["Insurance", `${a.insuranceProvider || "—"} · ${a.insurancePolicy || a.insurance || "—"}`],
      [
        "Coverage / expiry",
        `${a.insuranceCoverage ? money(a.insuranceCoverage) : "—"} · ${a.insuranceExpiry || "—"}`,
      ],
      ["Website", a.website],
      ["Experience", `${a.yearsInBusiness || "—"} years`],
      ["Services", (a.services || []).join(", ")],
      ["Certifications", (a.certifications || []).join(", ")],
      ["Portfolio", a.portfolio],
    ]
      .map(([k, val]) => `<div><dt>${ccEsc(k)}</dt><dd>${ccEsc(val || "—")}</dd></div>`)
      .join(
        "",
      )}</dl></section><section class="panel"><h3>Evidence files</h3>${(a.proofUploads || []).map((f) => `<a class="cc-vetting-file" href="${ccEsc(f.url)}" target="_blank" rel="noopener">📄 ${ccEsc(f.filename)} <small>${ccEsc(f.category)} · ${Math.ceil((f.size || 0) / 1024)} KB</small></a>`).join("") || '<p class="subtle">No supporting documents uploaded.</p>'}<h3>References</h3><p>${ccEsc(a.referenceName)} · ${ccEsc(a.referenceEmail)}</p><p>${ccEsc(a.reference2 || "No second reference supplied")}</p></section></div><section class="panel cc-preflight"><h3>Automatic intake checks</h3><p>These checks validate submitted fields and files. The VAT ID is also checked with the EU VIES service; credit and sanctions databases are not queried.</p><div>${
      Object.entries(a.preflight || {})
        .map(([k, val]) => `<span><b>${ccEsc(k.replaceAll(/([A-Z])/g, " $1"))}</b>${ccEsc(val)}</span>`)
        .join("") || ""
    }</div>${ccViesPanel(a)}</section><form id="ccVettingReview" class="modal-form"><div class="cc-vetting-checks"><h3>Verification checks</h3>${checks.map(([key, label]) => `<label>${label}<select name="check_${key}">${["Not checked", "Passed", "Needs follow-up", "Failed", "Not applicable"].map((x) => `<option ${x === (v.checks?.[key] || "Not checked") ? "selected" : ""}>${x}</option>`).join("")}</select></label>`).join("")}</div><div class="two"><label>Vetting stage<select name="stage">${["New", "Verified", "References", "Manual Review", "Decision & Badge"].map((x) => `<option ${x === (a.stage || "New") ? "selected" : ""}>${x}</option>`).join("")}</select></label><label>Risk level<select name="riskLevel">${["Not assessed", "Low", "Medium", "High"].map((x) => `<option ${x === (v.riskLevel || "Not assessed") ? "selected" : ""}>${x}</option>`).join("")}</select></label></div><div class="two"><label>Reference call outcome<select name="referenceOutcome">${["Not started", "Reached - positive", "Reached - concerns", "No response", "Not applicable"].map((x) => `<option ${x === (v.referenceOutcome || "Not started") ? "selected" : ""}>${x}</option>`).join("")}</select></label><label>Badge decision<select name="badge">${["Bronze", "Silver", "Gold"].map((x) => `<option ${x === (a.badgeDecision || "Bronze") ? "selected" : ""}>${x}</option>`).join("")}</select></label></div><label>Risk assessment / verification notes<textarea name="riskNotes" rows="3" maxlength="3000">${ccEsc(v.riskNotes || "")}</textarea></label><label>Decision note to applicant<textarea name="decisionNote" rows="2" maxlength="3000">${ccEsc(a.decisionNote || "")}</textarea></label><div id="ccVettingError" class="form-error" role="alert"></div><div class="cc-actions">${a.status === "On Hold" ? `<button type="button" class="btn outline" onclick="ccSaveVetting('${id}','New')">Return to review queue</button>` : ""}<button type="button" class="btn outline" onclick="ccSaveVetting('${id}','')">Save review</button><button type="button" class="btn outline" onclick="ccSaveVetting('${id}','On Hold')">Put on hold</button><button type="button" class="btn danger" onclick="ccSaveVetting('${id}','Rejected')">Reject</button><button type="button" class="btn success" onclick="ccSaveVetting('${id}','Approved')">Approve & assign badge</button></div></form>`,
  );
};

// EU VIES result for the VAT ID (T60). The "VAT / tax check" below is pre-filled from it; the admin decides.
function ccViesPanel(a) {
  if (!a.vatId) return "";
  const r = a.verification?.vies,
    when = r?.checkedAt ? ` <small>${date(r.checkedAt)}</small>` : "";
  const text = !r
    ? "Not checked with VIES yet"
    : r.unreachable
      ? "VIES not reachable – check manually"
      : r.valid
        ? `<b>VIES: VAT ID valid</b>${r.name ? ` · ${ccEsc(r.name)}` : ""}${r.address ? ` · ${ccEsc(r.address)}` : ""}${r.requestId ? ` · <small>${ccEsc(r.requestId)}</small>` : ""}`
        : "<b>VIES: VAT ID not valid</b>";
  return `<p class="cm-vies" id="ccVies">${text}${when} <button type="button" class="btn small outline" onclick="ccViesCheck('${ccEsc(a.id)}')">Check now</button></p>`;
}
async function ccViesCheck(id) {
  try {
    await api(`/admin/applications/${encodeURIComponent(id)}/vies`, { method: "POST" });
    await reviewApplication(id);
    toast("VIES check finished");
  } catch (e) {
    toast(e.message);
  }
}

async function ccSaveVetting(id, status) {
  const form = document.getElementById("ccVettingReview"),
    fd = new FormData(form),
    checks = {};
  for (const key of ["registration", "vat", "insurance", "certifications", "references", "sanctions"])
    checks[key] = fd.get("check_" + key);
  const verification = {
    checks,
    riskLevel: fd.get("riskLevel"),
    riskNotes: fd.get("riskNotes"),
    referenceOutcome: fd.get("referenceOutcome"),
  };
  const body = {
    stage: fd.get("stage"),
    badge: fd.get("badge"),
    verification,
    decisionNote: fd.get("decisionNote"),
  };
  if (status) body.status = status;
  try {
    await api(`/admin/applications/${encodeURIComponent(id)}`, { method: "PATCH", body });
    closeModal();
    toast(status ? `Application ${status.toLowerCase()}` : "Verification review saved");
    adminApplications();
  } catch (e) {
    document.getElementById("ccVettingError").textContent = e.message;
  }
}

adminBilling = async function () {
  const [{ invoices = [] }, { settings }] = await Promise.all([api("/invoices"), api("/admin/settings")]),
    rate = Number(settings.platformFeePercent) || 0,
    total = invoices.reduce((n, i) => n + Number(i.amount || 0), 0),
    paid = invoices.filter((i) => i.status === "Paid"),
    refunded = invoices.filter((i) => i.status === "Refunded"),
    scheduled = invoices.filter((i) => i.status === "Approved");
  app.innerHTML = dashboardShell(
    "admin",
    "billing",
    `<div class="dash-top"><div><h1>Payments, fees & supplier payouts</h1><p>Track invoice decisions and payout records. Actual bank transfers and refunds still require a connected payment provider.</p></div></div><div class="wf-stat-grid"><div class="cc-card"><span class="cc-label">Invoice volume</span><b>${money(total)}</b></div><div class="cc-card"><span class="cc-label">Awaiting payment</span><b>${money(scheduled.reduce((n, i) => n + Number(i.amount || 0), 0))}</b></div><div class="cc-card"><span class="cc-label">Paid / payout recorded</span><b>${money(paid.reduce((n, i) => n + Number(i.payment?.supplierPayout ?? i.amount * (1 - rate / 100)), 0))}</b></div><div class="cc-card"><span class="cc-label">Platform fee estimate · ${rate}%</span><b>${money(invoices.filter((i) => ["Approved", "Paid", "Refunded"].includes(i.status)).reduce((n, i) => n + Number(i.payment?.platformFee ?? (i.amount * rate) / 100), 0))}</b></div></div><section class="panel"><div class="cc-table-wrap"><table class="cc-table"><thead><tr><th>Invoice</th><th>Project / supplier</th><th>Gross</th><th>Fee · payout</th><th>Payment / payout status</th><th>Actions</th></tr></thead><tbody>${
      invoices
        .map((i) => {
          const fee = Number(i.payment?.platformFee ?? (i.amount * rate) / 100),
            payout = Number(i.payment?.supplierPayout ?? i.amount - fee);
          return `<tr><td><b>${ccEsc(invNo(i))}</b><small>${date(i.createdAt)}</small></td><td>${ccEsc(i.projectName || i.projectId)}<small>${ccEsc(i.supplierCompany || "Supplier")}</small></td><td>${money(i.amount)}</td><td>${money(fee)} · ${money(payout)}<small>${rate}% configured rate</small></td><td><span class="status ${i.status === "Paid" ? "completed" : i.status === "Refunded" || i.status === "Rejected" ? "rejected" : "submitted"}">${ccEsc(i.status)}</span>${i.status === "Approved" && i.overdue ? ` <span class="status overdue">${dsDaysLate(i.scheduledPayment)}</span>` : ""}<small>${ccEsc(i.payment?.status || "No payout record")}</small></td><td>${i.status === "Approved" ? `<button class="btn small success" onclick="markPaid('${i.id}')">Record paid</button>` : ""}${i.status === "Paid" ? `<button class="btn small danger" onclick="ccRefundInvoice('${i.id}')">Record refund</button>` : ""}</td></tr>`;
        })
        .join("") || '<tr><td colspan="6">No invoices recorded.</td></tr>'
    }</tbody></table></div></section><section class="panel"><h3>Refunds & disputes</h3><p>Refunds change the CraftCrew ledger and notify the supplier. Complete the matching refund with your payment provider separately.</p><a class="btn outline" href="#/admin/disputes">Open dispute resolution</a>${refunded.length ? `<p>${refunded.length} refund(s) recorded · ${money(refunded.reduce((n, i) => n + Number(i.amount), 0))}</p>` : ""}</section>`,
  );
};
async function ccRefundInvoice(id) {
  const reason = await uiPrompt("Reason for recording this refund");
  if (!reason?.trim()) return;
  try {
    await api(`/admin/invoices/${encodeURIComponent(id)}`, {
      method: "PATCH",
      body: { action: "Refund", reason },
    });
    toast("Refund recorded in the invoice ledger");
    adminBilling();
  } catch (e) {
    toast(e.message, "error");
  }
}
