/* Re-verify profile changes (T86): a live supplier's changed company name, legal invoicing details or
   claimed certifications wait for an admin to re-verify them. A banner on the supplier's own settings page
   shows what is pending; the admin page with every pending change is in areas/admin.js (T134). */
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
