/* GDPR self-service on the profile page (T120–T121): "Download my data" and, later, "Delete account". */
const gdBaseProfilePage = profilePage;
profilePage = async function (role) {
  await gdBaseProfilePage(role);
  const content = document.querySelector(".dashboard-content");
  if (!content || content.querySelector("#gdPanel")) return;
  content.insertAdjacentHTML(
    "beforeend",
    `<section class="panel" id="gdPanel"><div class="panel-title"><h3>Your data</h3></div><p>Download a copy of the personal data CraftCrew stores about you: your account, messages, notifications, projects, invoices and activity. Passwords and security keys are never included.</p><div class="cc-actions"><button type="button" class="btn small outline" onclick="gdExport(this)">Download my data</button></div><div id="gdDelete" class="gd-delete"></div></section>`,
  );
  if (role !== "admin") gdDeletion();
};
/* Delete account (T121): open business blocks it; otherwise the password starts the 14-day grace period. */
async function gdDeletion() {
  const box = document.getElementById("gdDelete");
  if (!box) return;
  const d = await api("/account/deletion").catch(() => null);
  if (!d || !document.contains(box)) return;
  const member = !!state.user?.isMember;
  box.innerHTML = `<h4>Delete account</h4><p>${
    member
      ? "This deletes your own login. The company account and its data stay."
      : `Your account is locked at once and deleted after ${d.graceDays} days. Signing in before then cancels the deletion. Invoices are kept for the legal retention period of 10 years, without your contact details.${d.coversTeam ? " Your team members' logins are deleted too." : ""}`
  }</p>${
    d.blockers.length
      ? `<p class="gd-blocked"><b>Finish or hand over these first:</b></p><ul class="gd-blockers">${d.blockers
          .map((b) => `<li><a href="#${esc(b.link)}">${esc(b.label)}</a></li>`)
          .join("")}</ul>`
      : `<form id="gdDeleteForm" class="modal-form gd-delete-form"><label>Your password<input name="password" type="password" autocomplete="current-password" required></label>${
          state.user?.twoFactor
            ? '<label>Code from your authenticator app<input name="code" inputmode="numeric" autocomplete="one-time-code" required></label>'
            : ""
        }<div id="gdDeleteError" class="form-error"></div><button class="btn danger">Delete my account</button></form>`
  }`;
  const form = document.getElementById("gdDeleteForm");
  if (!form) return;
  form.onsubmit = async (e) => {
    e.preventDefault();
    const f = new FormData(form);
    if (!(await uiConfirm(`Delete your account? It is locked now and deleted after ${d.graceDays} days.`))) return;
    try {
      const r = await api("/account/deletion", { method: "POST", body: { password: f.get("password"), code: f.get("code") || undefined } });
      await logout();
      setTimeout(() => toast(`Your account will be deleted on ${date(r.deleteAfter)}. Sign in before then to cancel.`), 300);
    } catch (x) {
      document.getElementById("gdDeleteError").textContent = x.message;
    }
  };
}
// Signing in during the grace period cancelled the deletion: say so.
const gdBaseApi = api;
api = async function (path, opts = {}) {
  const result = await gdBaseApi(path, opts);
  if (path === "/auth/login" && result?.deletionCancelled)
    setTimeout(() => toast("Your account deletion was cancelled because you signed in."), 700);
  return result;
};
async function gdExport(btn) {
  try {
    const d = await api("/account/export"),
      a = document.createElement("a");
    a.href = URL.createObjectURL(new Blob([JSON.stringify(d, null, 2)], { type: "application/json" }));
    a.download = `craftcrew-my-data-${new Date().toISOString().slice(0, 10)}.json`;
    a.click();
    setTimeout(() => URL.revokeObjectURL(a.href), 30000);
    toast("Your data was downloaded");
  } catch (x) {
    toast(x.message, "error");
  }
}

/* Admin (T123): accounts with a pending deletion, read-only. */
const gdBaseAdminUsers = adminUsers;
adminUsers = async function (...args) {
  await gdBaseAdminUsers(...args);
  const content = document.querySelector(".dashboard-content");
  if (!content || content.querySelector("#gdPending")) return;
  const users = ((await api("/admin/users").catch(() => ({}))).users || []).filter((u) => u.deleteAfter && u.status !== "Deleted");
  const panels = content.querySelectorAll(":scope > section.panel");
  const html = `<section class="panel" id="gdPending"><div class="panel-title"><h3>Pending account deletions</h3><span>${users.length}</span></div>${
    users.length
      ? `<div class="cc-table-wrap"><table class="cc-table"><thead><tr><th>Name</th><th>Email</th><th>Role</th><th>Requested</th><th>Deleted on</th></tr></thead><tbody>${users
          .map(
            (u) =>
              `<tr><td><b>${esc(u.name)}</b>${u.deletionViaOwner ? "<small>With the main account</small>" : ""}</td><td>${esc(u.email)}</td><td><span class="tag">${esc(u.role)}</span></td><td>${date(u.deletionRequestedAt)}</td><td>${date(u.deleteAfter)}</td></tr>`,
          )
          .join("")}</tbody></table></div>`
      : '<p class="pa-empty">No account is waiting to be deleted.</p>'
  }<p class="subtle">People cancel a deletion themselves by signing in before the date. After it, the account is anonymised automatically; invoices are kept with their legal details.</p></section>`;
  (panels[panels.length - 1] || content.lastElementChild).insertAdjacentHTML("beforebegin", html);
};
