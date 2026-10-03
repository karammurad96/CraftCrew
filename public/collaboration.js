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

// The persistent platform-configuration workspace (admin).
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
