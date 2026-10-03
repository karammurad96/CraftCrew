/* Go-live essentials: legal pages (Impressum, privacy policy, terms), consent at sign-up,
   admin password resets and forced password change after a reset. */
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
    `<nav class="legal-footer-links" aria-label="${esc(t("ui.legal.label"))}" data-i18n="keys">${["imprint", "privacy", "terms"].map((k) => `<a href="#/${k}">${esc(t("ui.legal." + k))}</a>`).join("")}</nav>`,
  );
}

/* Forced password change after an admin reset or a team invite.
   The server refuses every other call until then, so this page needs no other data. */
function legalForceChangePage() {
  const f = (key) => esc(t("ui.force." + key)),
    s = (key) => esc(t("prof.sec." + key));
  app.innerHTML = publicLayout(
    `<div class="cc-page" data-i18n="keys"><section class="panel" id="paSecurity" style="max-width:560px;margin:40px auto"><h1>${f("title")}</h1><div class="notice legal-force-note">${f(state.user.isMember ? "member" : "reset")}</div><form id="legalForceForm" class="modal-form" data-action="ui.forcePassword"><label>${s(
      "current",
    )}<input name="currentPassword" type="password" autocomplete="current-password" placeholder="${f("temporary")}" required></label><label>${s("new")}<input name="newPassword" type="password" autocomplete="new-password" minlength="10" required></label><label>${s(
      "repeat",
    )}<input name="confirm" type="password" autocomplete="new-password" minlength="10" required></label><small class="subtle">${s("rules")}</small><div class="form-error" role="alert" data-i18n="dom"></div><div class="cc-actions"><button class="btn primary">${s(
      "change",
    )}</button><button type="button" class="btn outline" data-action="ui.signOut">${f("signOut")}</button></div></form></section></div>`,
  );
}
actions.on("ui.forcePassword", async (form) => {
  const f = Object.fromEntries(new FormData(form)),
    err = form.querySelector(".form-error");
  err.textContent = "";
  if (f.newPassword !== f.confirm) return (err.textContent = t("prof.sec.mismatch"));
  try {
    await api("/account/password", { method: "POST", body: f });
    tToast(t("prof.sec.done"));
    navigate(`/${state.user.role}`);
  } catch (x) {
    err.textContent = x.message;
  }
});
actions.on("ui.signOut", () => logout());
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
  if (state.user?.mustChangePassword && /^\/(customer|supplier|admin)(\/|$)/.test(path)) {
    legalForceChangePage();
    return;
  }
  const result = await legalBaseRoute();
  legalFooter();
  return result;
};
legalFooter();
