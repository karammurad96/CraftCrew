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
  return result;
};
legalFooter();
