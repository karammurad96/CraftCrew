/* Re-verify profile changes (T86): a live supplier's changed company name, legal invoicing details or
   claimed certifications wait for an admin to re-verify them. A banner on the supplier's own settings page
   shows what is pending; an admin page lists every pending change with the current and proposed values. */
const rzEsc = (s) =>
  String(s ?? "").replace(
    /[&<>"']/g,
    (c) => ({ "&": "&amp;", "<": "&lt;", ">": "&gt;", '"': "&quot;", "'": "&#39;" })[c],
  );

// Supplier's own settings page: a banner for a pending change, read-only (the fields themselves already
// let the supplier resubmit through the normal edit forms).
const rzBaseProfilePage = profilePage;
profilePage = async function (role) {
  await rzBaseProfilePage(role);
  if (role !== "supplier") return;
  const content = document.querySelector(".dashboard-content");
  if (!content || content.querySelector("#rzPanel")) return;
  const d = await api("/profile").catch(() => null),
    pending = d?.supplier?.pendingVerification;
  if (!pending) return;
  const rows = [
    pending.company ? ["Company name", pending.company] : null,
    pending.companyProfile?.legalName ? ["Legal name", pending.companyProfile.legalName] : null,
    pending.companyProfile?.address ? ["Address", pending.companyProfile.address] : null,
    pending.companyProfile?.taxId ? ["Tax ID", pending.companyProfile.taxId] : null,
    pending.certifications ? ["Certifications", pending.certifications.join(", ")] : null,
  ].filter(Boolean);
  const top = content.querySelector(".dash-top");
  const html = `<section class="panel rz-panel" id="rzPanel" role="note"><div class="panel-title"><h3>Change awaiting re-verification</h3><span class="status submitted">Pending</span></div><p><small>Submitted ${date(pending.submittedAt)}.</small> Until an admin reviews it, your profile still shows the previous values.</p><dl class="rz-rows">${rows.map(([k, v]) => `<div><dt>${rzEsc(k)}</dt><dd>${rzEsc(v)}</dd></div>`).join("")}</dl></section>`;
  top ? top.insertAdjacentHTML("afterend", html) : content.insertAdjacentHTML("afterbegin", html);
};

// Admin page: every pending change, with the current and proposed values, approve or reject.
async function adminProfileChanges() {
  const { changes = [] } = await api("/admin/profile-changes").catch(() => ({}));
  const row = (c) => {
    const fields = [
      c.proposed.company ? ["Company name", c.current.company, c.proposed.company] : null,
      c.proposed.companyProfile?.legalName
        ? ["Legal name", c.current.companyProfile.legalName || "—", c.proposed.companyProfile.legalName]
        : null,
      c.proposed.companyProfile?.address
        ? ["Address", c.current.companyProfile.address || "—", c.proposed.companyProfile.address]
        : null,
      c.proposed.companyProfile?.taxId
        ? ["Tax ID", c.current.companyProfile.taxId || "—", c.proposed.companyProfile.taxId]
        : null,
      c.proposed.certifications
        ? [
            "Certifications",
            c.current.certifications.join(", ") || "—",
            c.proposed.certifications.join(", ") || "—",
          ]
        : null,
    ].filter(Boolean);
    return `<article class="panel rz-card"><div class="panel-title"><h3>${rzEsc(c.company)}</h3><small>Submitted ${date(c.proposed.submittedAt)}</small></div><table class="cc-table rz-diff"><thead><tr><th>Field</th><th>Current</th><th>Proposed</th></tr></thead><tbody>${fields.map(([k, was, now]) => `<tr><td>${rzEsc(k)}</td><td>${rzEsc(was)}</td><td><b>${rzEsc(now)}</b></td></tr>`).join("")}</tbody></table><div class="cc-actions"><button class="btn small success" onclick="rzDecide('${rzEsc(c.supplierId)}','Approve')">Approve</button><button class="btn small danger" onclick="rzDecide('${rzEsc(c.supplierId)}','Reject')">Reject</button></div></article>`;
  };
  app.innerHTML = dashboardShell(
    "admin",
    "profile-changes",
    `<div class="dash-top"><div><h1>Profile changes awaiting re-verification</h1><p>Changes to a company name, legal invoicing details or claimed certifications wait here until approved.</p></div></div><div class="rz-list">${changes.map(row).join("") || '<div class="empty">Nothing is waiting for re-verification.</div>'}</div>`,
  );
}
async function rzDecide(supplierId, action) {
  let note = "";
  if (action === "Reject") {
    note = await uiPrompt("Explain to the supplier why this change was not approved", "", { required: true });
    if (note === null) return;
  } else if (!(await uiConfirm("Approve this change? It goes live right away.", { danger: false }))) return;
  try {
    await api(`/admin/profile-changes/${encodeURIComponent(supplierId)}`, {
      method: "PATCH",
      body: { action, note },
    });
    toast(action === "Approve" ? "Change approved" : "Change rejected");
    adminProfileChanges();
  } catch (x) {
    toast(x.message);
  }
}
