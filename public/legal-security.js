/* Go-live essentials: legal pages (Impressum, privacy policy, terms), consent at sign-up,
   admin password resets and forced password change after a reset. */
const LEGAL_PAGES = { imprint: "Impressum / Legal notice", privacy: "Privacy policy", terms: "Terms of use" };
let legalCache = null;
async function legalContent() {
  if (!legalCache) legalCache = (await api("/platform-config").catch(() => ({}))).legal || {};
  return legalCache;
}

/* Plain-text content → safe HTML: blank lines make paragraphs, "# " lines make headings. */
function legalHtml(text) {
  return String(text || "")
    .trim()
    .split(/\n{2,}/)
    .map((block) =>
      block.startsWith("# ")
        ? `<h2>${esc(block.slice(2))}</h2>`
        : `<p>${esc(block).replace(/\n/g, "<br>")}</p>`,
    )
    .join("");
}
function legalFooter() {
  const footer = document.querySelector("body > footer");
  if (!footer || footer.querySelector(".legal-footer-links")) return;
  footer.insertAdjacentHTML(
    "beforeend",
    `<nav class="legal-footer-links" aria-label="Legal">${Object.entries(LEGAL_PAGES)
      .map(([k, t]) => `<a href="#/${k}">${t.split(" / ")[0]}</a>`)
      .join("")}</nav>`,
  );
}

/* Sign-up: explicit acceptance of terms and privacy policy. */

/* Admin: legal page editor on Platform management. */
async function legalAdminPanel() {
  const content = document.querySelector(".dashboard-content");
  if (!content || content.querySelector(".legal-admin")) return;
  const legal = await legalContent();
  content.insertAdjacentHTML(
    "beforeend",
    `<section class="panel legal-admin"><div class="panel-title"><h3>Legal pages</h3><small class="subtle">Public at /#/imprint, /#/privacy and /#/terms</small></div><p class="subtle">Required before going live in Germany (§ 5 DDG Impressum, Art. 13 GDPR privacy notice). Plain text: blank line = new paragraph, a line starting with "# " = heading. Have the final texts checked by a lawyer or a trusted generator.</p><form id="legalForm" class="modal-form">${Object.entries(
      LEGAL_PAGES,
    )
      .map(
        ([k, t]) =>
          `<label>${t}<textarea name="${k}" rows="8" placeholder="${k === "imprint" ? "Company name, legal form, address, managing director, contact email/phone, register court and number, VAT ID" : k === "privacy" ? "Controller, data collected, purposes, legal bases, processors (hosting, email), storage periods, rights of data subjects, supervisory authority" : "Scope, account rules, supplier vetting, invoicing and payment tracking, liability, governing law"}">${esc(legal[k] || "")}</textarea></label>`,
      )
      .join(
        "",
      )}<div class="cc-actions"><button class="btn primary">Save legal pages</button><a class="btn outline" href="#/imprint" target="_blank">Preview</a></div></form></section>`,
  );
  document.getElementById("legalForm").onsubmit = async (e) => {
    e.preventDefault();
    try {
      await api("/admin/legal", { method: "PUT", body: Object.fromEntries(new FormData(e.target)) });
      legalCache = null;
      toast("Legal pages published");
    } catch (x) {
      toast(x.message, "error");
    }
  };
}

/* Admin: "Reset password" next to every account. */
function legalResetButtons() {
  for (const btn of document.querySelectorAll('.dashboard-content button[onclick^="ccSetAccountStatus"]')) {
    if (btn.nextElementSibling?.classList.contains("legal-reset")) continue;
    const userId = (btn.getAttribute("onclick").match(/ccSetAccountStatus\('([^']+)'/) || [])[1];
    if (userId)
      btn.insertAdjacentHTML(
        "afterend",
        `<button class="btn small outline legal-reset" onclick="legalResetPassword('${esc(userId)}', this)">Reset password</button>`,
      );
  }
}
async function legalResetPassword(userId, btn) {
  const email = btn.closest("tr")?.children[1]?.textContent || "this user";
  if (
    !(await uiConfirm(
      `Reset the password for ${email}? They will be signed out everywhere and must choose a new password after signing in.`,
    ))
  )
    return;
  try {
    const { temporaryPassword } = await api(`/admin/users/${encodeURIComponent(userId)}/reset-password`, {
      method: "POST",
      body: {},
    });
    modal(
      "Temporary password",
      `<p>Give this temporary password to <b>${esc(email)}</b> through a secure channel (e.g. by phone). It is shown only once.</p><div class="legal-temp"><code id="legalTemp">${esc(temporaryPassword)}</code><button type="button" class="btn small outline" onclick="navigator.clipboard.writeText(document.getElementById('legalTemp').textContent).then(()=>toast('Copied'))">Copy</button></div><p class="subtle">They will be asked to set a new password right after signing in.</p><button class="btn primary" onclick="closeModal()">Done</button>`,
    );
  } catch (x) {
    toast(x.message, "error");
  }
}

/* Forced password change after an admin reset or a team invite.
   The server refuses every other call until then, so this page needs no other data. */
function legalForceChangePage() {
  app.innerHTML = publicLayout(
    `<div class="cc-page"><section class="panel" id="paSecurity" style="max-width:560px;margin:40px auto"><h1>Choose a new password</h1><div class="notice legal-force-note">${state.user.isMember ? "Welcome to the team. Please replace your temporary password with your own to continue." : "Your password was reset by an administrator. Please choose a new password to continue."}</div><form id="legalForceForm" class="modal-form"><label>Current password<input name="currentPassword" type="password" autocomplete="current-password" placeholder="Temporary password" required></label><label>New password<input name="newPassword" type="password" autocomplete="new-password" minlength="10" required></label><label>Repeat new password<input name="confirm" type="password" autocomplete="new-password" minlength="10" required></label><small class="subtle">At least 10 characters with letters and numbers. Other signed-in devices are signed out.</small><div class="form-error" role="alert"></div><div class="cc-actions"><button class="btn primary">Change password</button><button type="button" class="btn outline" onclick="logout()">Sign out</button></div></form></section></div>`,
  );
  const form = document.getElementById("legalForceForm");
  form.onsubmit = async (e) => {
    e.preventDefault();
    const f = Object.fromEntries(new FormData(form)),
      err = form.querySelector(".form-error");
    err.textContent = "";
    if (f.newPassword !== f.confirm) {
      err.textContent = "The new passwords do not match";
      return;
    }
    try {
      await api("/account/password", { method: "POST", body: f });
      toast("Password changed");
      navigate(`/${state.user.role}`);
    } catch (x) {
      err.textContent = x.message;
    }
  };
}
const legalBaseApi = api;
api = async function (path, opts = {}) {
  const result = await legalBaseApi(path, opts);
  if (path === "/account/password" && opts.method === "POST" && state.user) {
    delete state.user.mustChangePassword;
    localStorage.setItem("cc_user", JSON.stringify(state.user));
  }
  return result;
};

async function adminTestEmail() {
  try {
    const r = await api("/admin/test-email", { method: "POST", body: {} });
    toast(`Test email sent to ${r.to}`);
  } catch (x) {
    toast(x.message, "error");
  }
}
function adminMailStatus() {
  const panel = document.querySelector(".pa-outbox");
  if (!panel || panel.querySelector(".mail-test")) return;
  panel
    .querySelector("summary")
    // Buttons may not sit inside <summary>; the test button opens the panel body instead.
    ?.insertAdjacentHTML(
      "afterend",
      '<div class="cc-actions mail-test-row"><button type="button" class="btn small outline mail-test" onclick="adminTestEmail()">Send test email</button></div>',
    );
}

/* ---------- Router hook ---------- */
const legalBaseRoute = window.route;
window.route = async function () {
  const path = location.hash.replace(/^#/, "").split("?")[0];
  const key = path.replace(/^\//, "");
  if (state.user?.mustChangePassword && /^\/(customer|supplier|admin)(\/|$)/.test(path)) {
    legalForceChangePage();
    return;
  }
  const result = await legalBaseRoute();
  legalFooter();
  if (path === "/admin/platform") {
    await legalAdminPanel();
    adminMailStatus();
  }
  if (path === "/admin/users") legalResetButtons();
  return result;
};
legalFooter();
