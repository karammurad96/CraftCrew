/* Area: sign-in and sign-up (T126b). Sign-in, sign-up with the consent box, the confirmation email ("check your
   inbox", verify link), forgotten and reset password, the two-factor code and the "session expired" notice,
   drawn with translation keys. Messages from the server come in the user's language (api(), T137). */

const ak = (key, params) => esc(t("auth." + key, params));

function authCardHtml(title, textHtml, inner = "") {
  return `<div class="simple-page center-page"><div class="login-card"><a class="brand" href="#/"><span class="brand-mark" role="img" aria-label="${ak("logo")}"><svg viewBox="0 0 64 64" aria-hidden="true" focusable="false"><path d="M14 50C24 42 40 22 50 14"/><circle cx="14" cy="50" r="8.5"/><circle cx="50" cy="14" r="8.5"/></svg></span><span class="brand-word">Craft<span>Crew</span></span></a><h1>${title}</h1><p>${textHtml}</p>${inner}</div></div>`;
}
function authCard(title, textHtml, inner) {
  app.innerHTML = publicLayout(authCardHtml(title, textHtml, inner));
}
// An error under the form: ours from t(), the server's already in the user's language (api(), T137).
function authError(el, message) {
  el.replaceChildren();
  const span = document.createElement("span");
  span.textContent = message;
  el.append(span);
}
function authSignedIn(user) {
  ccSignedIn(user);
  document.body.classList.add("authenticated");
  topActions();
  navigate("/" + user.role + "/dashboard");
}

/* ---------- Sign-in and sign-up ---------- */
async function authPage(mode) {
  const login = mode === "login";
  let expired = false;
  try {
    expired = sessionStorage.getItem("cc_expired") === "1";
  } catch {}
  const consent = login
    ? ""
    : `<label class="legal-consent"><input type="checkbox" name="legalConsent" required> <span>${tHtml("auth.consent", {
        terms: `<a href="#/terms" target="_blank">${ak("terms")}</a>`,
        privacy: `<a href="#/privacy" target="_blank">${ak("privacy")}</a>`,
      })}</span></label>`;
  authCard(
    ak(login ? "loginTitle" : "signupTitle"),
    ak(login ? "loginText" : "signupText"),
    `${expired ? `<div class="notice warn nf-expired" role="status">${ak("expired")}</div>` : ""}<form id="authForm" data-action="auth.submit" data-mode="${mode}">${
      login
        ? ""
        : `<label>${ak("name")}<input name="name" autocomplete="name" required></label><label>${ak("company")}<input name="company" autocomplete="organization"></label><label>${ak("accountType")}<select name="role" required><option value="customer">${ak("customer")}</option><option value="supplier">${ak("supplier")}</option></select></label>`
    }<label>${ak("email")}<input name="email" type="email" autocomplete="email" required></label><label class="auth-password">${ak("password")}<input name="password" type="password" autocomplete="${login ? "current-password" : "new-password"}" minlength="${login ? 1 : 12}" required></label><div id="authError" class="form-error" role="alert" aria-live="polite"></div>${consent}<button class="btn primary full" style="margin-top:15px">${ak(login ? "logIn" : "createAccount")}</button></form>${
      login
        ? `<p class="auth-switch">${ak("noAccount")} <a href="#/signup">${ak("signUp")}</a></p>`
        : `<p class="auth-switch">${ak("registered")} <a href="#/login">${ak("logIn")}</a></p>`
    }`,
  );
  // "Forgot password?" only when the server can send the link
  if (login) {
    const cfg = await api("/platform-config").catch(() => ({}));
    if (cfg.mailEnabled)
      document.querySelector("#authForm .auth-password")?.insertAdjacentHTML("afterend", `<a class="auth-forgot" href="#/forgot">${ak("forgotLink")}</a>`);
  }
}
actions.on("auth.submit", async (form) => {
  const mode = form.dataset.mode,
    error = document.getElementById("authError");
  error.replaceChildren();
  const body = { ...Object.fromEntries(new FormData(form)), ...(mode === "signup" ? { language: ccLang } : {}) };
  if (body.legalConsent) body.legalConsent = true;
  try {
    const d = await api("/auth/" + mode, { method: "POST", body });
    // With email delivery a new account is activated through the emailed link
    if (d.verificationRequired) return authCheckInbox(d.email);
    try {
      sessionStorage.removeItem("cc_expired");
    } catch {}
    tToast(t(mode === "login" ? "auth.signedIn" : "auth.created"));
    authSignedIn(d.user);
    route();
  } catch (err) {
    if (err.code === "emailAlreadyRegistered") return authError(error, t("auth.emailTaken"));
    authError(error, err.message);
    // Two-factor sign-in: the code field appears once the password was right
    if (err.code === "TOTP_REQUIRED" || err.code === "TOTP_INVALID") {
      let input = form.querySelector('input[name="code"]');
      if (!input) {
        form
          .querySelector("button.primary")
          .insertAdjacentHTML("beforebegin", `<label>${ak("code")}<input name="code" autocomplete="one-time-code" maxlength="20" required placeholder="${ak("codePlaceholder")}"></label>`);
        input = form.querySelector('input[name="code"]');
      }
      input.value = "";
      input.focus();
    }
    // An unconfirmed account gets a one-click way to receive the confirmation link again
    if (err.code === "EMAIL_UNVERIFIED")
      error.insertAdjacentHTML("beforeend", ` <button type="button" class="ui-link-btn" data-action="auth.resend" data-email="${esc(body.email)}">${ak("resend")}</button>`);
  }
});
actions.on("auth.resend", async (btn) => {
  btn.disabled = true;
  try {
    await api("/auth/resend-verification", { method: "POST", body: { email: btn.dataset.email } });
    tToast(t("auth.resentConfirmation"));
  } catch (x) {
    toast(x.message, "error");
  }
  setTimeout(() => (btn.disabled = false), 30000);
});

/* ---------- Confirmation email ---------- */
function authCheckInbox(email) {
  authCard(
    ak("inboxTitle"),
    tHtml("auth.inboxText", { email: `<b>${esc(email)}</b>` }),
    `<button class="btn outline full" id="authResend" data-action="auth.resendInbox" data-email="${esc(email)}">${ak("resend")}</button><p class="auth-switch"><a href="#/login">${ak("backToSignIn")}</a></p>`,
  );
}
actions.on("auth.resendInbox", async (btn) => {
  btn.disabled = true;
  try {
    await api("/auth/resend-verification", { method: "POST", body: { email: btn.dataset.email } });
    tToast(t("auth.resent"));
  } catch (x) {
    toast(x.message, "error");
  }
  setTimeout(() => (btn.disabled = false), 30000);
});
async function authVerify(params, query) {
  authCard(ak("confirming"), ak("moment"));
  try {
    const d = await api("/auth/verify", { method: "POST", body: { token: query.get("token") } });
    tToast(t("auth.confirmed"));
    authSignedIn(d.user);
  } catch (x) {
    authCard(ak("linkInvalid"), `<span>${esc(x.message)}</span>`, `<a class="btn primary full" href="#/login">${ak("goToSignIn")}</a>`);
  }
}

/* ---------- Forgotten and reset password ---------- */
function authForgot() {
  authCard(
    ak("forgotTitle"),
    ak("forgotText"),
    `<form id="authForgot" data-action="auth.forgot"><label>${ak("email")}<input name="email" type="email" autocomplete="email" required></label><div class="form-error" role="alert"></div><button class="btn primary full" style="margin-top:15px">${ak("sendReset")}</button></form><p class="auth-switch"><a href="#/login">${ak("backToSignIn")}</a></p>`,
  );
}
actions.on("auth.forgot", async (form) => {
  const email = new FormData(form).get("email");
  try {
    await api("/auth/forgot", { method: "POST", body: { email } });
    authCard(ak("inboxTitle"), tHtml("auth.resetSent", { email: `<b>${esc(email)}</b>` }), `<p class="auth-switch"><a href="#/login">${ak("backToSignIn")}</a></p>`);
  } catch (x) {
    authError(form.querySelector(".form-error"), x.message);
  }
});
function authReset(params, query) {
  authCard(
    ak("resetTitle"),
    ak("resetText"),
    `<form id="authReset" data-action="auth.reset" data-token="${esc(query.get("token") || "")}"><label>${ak("newPassword")}<input name="newPassword" type="password" autocomplete="new-password" minlength="12" required></label><label>${ak("repeatPassword")}<input name="confirm" type="password" autocomplete="new-password" minlength="12" required></label><div class="form-error" role="alert"></div><button class="btn primary full" style="margin-top:15px">${ak("savePassword")}</button></form>`,
  );
}
actions.on("auth.reset", async (form) => {
  const f = Object.fromEntries(new FormData(form)),
    err = form.querySelector(".form-error");
  if (f.newPassword !== f.confirm) return authError(err, t("auth.mismatch"));
  try {
    await api("/auth/reset", { method: "POST", body: { token: form.dataset.token, newPassword: f.newPassword } });
    authCard(ak("changedTitle"), ak("changedText"), `<a class="btn primary full" href="#/login">${ak("signIn")}</a>`);
  } catch (x) {
    authError(err, x.message);
  }
});

routes.add("/login", () => authPage("login"));
routes.add("/signup", () => authPage("signup"));
routes.add("/verify", authVerify);
routes.add("/forgot", authForgot);
routes.add("/reset", authReset);
