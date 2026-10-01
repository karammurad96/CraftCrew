/* Two-factor sign-in (T67): the code step at sign-in, setup and recovery codes in settings, and the admin
   requirement. */
const tfEsc = (s) =>
  String(s ?? "").replace(
    /[&<>"']/g,
    (c) => ({ "&": "&amp;", "<": "&lt;", ">": "&gt;", '"': "&quot;", "'": "&#39;" })[c],
  );

const tfBaseApi = api;
api = async function (path, opts = {}) {
  try {
    const result = await tfBaseApi(path, opts);
    if (path === "/auth/login" && result?.recoveryCodesLeft !== undefined)
      setTimeout(() => toast(`Recovery code used. ${result.recoveryCodesLeft} left.`), 600);
    return result;
  } catch (e) {
    if (e.code === "TOTP_REQUIRED" || e.code === "TOTP_INVALID") tfCodeField();
    if (e.code === "TOTP_SETUP_REQUIRED") tfRequireSetup();
    throw e;
  }
};

// Sign-in: the code field appears after the password was right; the form sends it with the next submit.
function tfCodeField() {
  const form = document.getElementById("authForm");
  if (!form) return;
  let input = form.querySelector('input[name="code"]');
  if (!input) {
    form
      .querySelector("button.primary, button[type=submit], button:not([type])")
      ?.insertAdjacentHTML(
        "beforebegin",
        '<label>Authentication code<input name="code" autocomplete="one-time-code" maxlength="20" required placeholder="6-digit code or recovery code"></label>',
      );
    input = form.querySelector('input[name="code"]');
  }
  input.value = "";
  input.focus();
}

let tfRedirecting = false;
function tfRequireSetup() {
  if (tfRedirecting || !state.user) return;
  tfRedirecting = true;
  toast("Admin accounts need two-factor sign-in. Turn it on to continue.");
  navigate(`/${state.user.role}/profile`);
  setTimeout(() => {
    tfRedirecting = false;
    tfSetup();
  }, 400);
}

const tfBaseProfilePage = profilePage;
profilePage = async function (role) {
  try {
    await tfBaseProfilePage(role);
  } catch (e) {
    // Admins who still need to set up two-factor sign-in cannot load the rest of the settings yet.
    if (e.code !== "TOTP_SETUP_REQUIRED") throw e;
    app.innerHTML = dashboardShell(
      role,
      "profile",
      '<div class="dash-top"><div><h1>Settings</h1></div></div>',
    );
  }
  const content = document.querySelector(".dashboard-content");
  if (!content || content.querySelector("#tfPanel")) return;
  const status = await api("/account/2fa").catch(() => null);
  if (!status) return;
  content.insertAdjacentHTML(
    "beforeend",
    `<section class="panel" id="tfPanel">${tfPanelHtml(status, role)}</section>`,
  );
};

function tfPanelHtml(s, role) {
  return `<div class="panel-title"><h3>Two-factor sign-in</h3>${s.enabled ? '<span class="status completed">On</span>' : '<span class="status rejected">Off</span>'}</div><p>${
    s.enabled
      ? "Signing in needs your password and a code from your authenticator app."
      : "Protect your account with a second step: a 6-digit code from an authenticator app such as Microsoft Authenticator, Google Authenticator or 1Password."
  }</p>${s.enabled ? `<p class="subtle"><span>Recovery codes left:</span> <b>${s.recoveryLeft}</b></p>` : ""}${
    s.required && !s.enabled ? '<p class="danger-text">Admin accounts must use two-factor sign-in.</p>' : ""
  }<div class="cc-actions">${
    s.enabled
      ? s.required
        ? ""
        : '<button type="button" class="btn small outline" onclick="tfDisable()">Turn off</button>'
      : '<button type="button" class="btn small primary" onclick="tfSetup()">Turn on</button>'
  }</div>${
    role === "admin"
      ? `<label class="cc-check-label tf-require"><input type="checkbox" id="tfRequire" ${s.required ? "checked" : ""} onchange="tfSetRequired(this)"> Require two-factor sign-in for all admin accounts</label>`
      : ""
  }`;
}
async function tfRefreshPanel() {
  const panel = document.getElementById("tfPanel");
  if (panel) panel.innerHTML = tfPanelHtml(await api("/account/2fa"), state.user.role);
}

async function tfSetup() {
  let d;
  try {
    d = await api("/account/2fa/setup", { method: "POST" });
  } catch (x) {
    return toast(x.message);
  }
  modal(
    "Turn on two-factor sign-in",
    `<ol class="tf-steps"><li>Open your authenticator app and add an account. <a href="${tfEsc(d.otpauthUrl)}">Open in authenticator app</a></li><li>If you can't scan or open the link, enter this key by hand:<code class="tf-secret">${tfEsc(d.secret.replace(/(.{4})/g, "$1 ").trim())}</code><small class="subtle">Time-based, 6 digits, every 30 seconds.</small></li><li>Enter the 6-digit code the app shows.</li></ol><form id="tfEnable" class="modal-form"><label>Code from the app<input name="code" inputmode="numeric" autocomplete="one-time-code" maxlength="6" pattern="[0-9]{6}" required></label><div id="tfError" class="form-error" role="alert"></div><button class="btn primary">Turn on</button></form>`,
  );
  document.getElementById("tfEnable").onsubmit = async (e) => {
    e.preventDefault();
    try {
      const r = await api("/account/2fa/enable", {
        method: "POST",
        body: { code: e.target.code.value.trim() },
      });
      tfShowRecovery(r.recoveryCodes);
      tfRefreshPanel().catch(() => {});
    } catch (x) {
      document.getElementById("tfError").textContent = x.message;
    }
  };
}
function tfShowRecovery(codes) {
  modal(
    "Save your recovery codes",
    `<p>Each code signs you in once if you lose your phone. Store them somewhere safe, like a password manager. They are shown only now.</p><ul class="tf-codes">${codes.map((c) => `<li><code>${tfEsc(c)}</code></li>`).join("")}</ul><div class="cc-actions"><button type="button" class="btn outline" onclick="tfDownloadCodes()">Download as text file</button><button type="button" class="btn primary" onclick="closeModal();route()">I saved them</button></div>`,
  );
  window.tfCodes = codes;
}
function tfDownloadCodes() {
  const a = document.createElement("a");
  a.href = URL.createObjectURL(
    new Blob([`CraftCrew recovery codes for ${state.user.email}\n\n${(window.tfCodes || []).join("\n")}\n`], {
      type: "text/plain",
    }),
  );
  a.download = "craftcrew-recovery-codes.txt";
  a.click();
  setTimeout(() => URL.revokeObjectURL(a.href), 1000);
}
function tfDisable() {
  modal(
    "Turn off two-factor sign-in",
    `<form id="tfDisable" class="modal-form"><label>Password<input name="password" type="password" autocomplete="current-password" required></label><label>Code from the app or a recovery code<input name="code" autocomplete="one-time-code" maxlength="20" required></label><div id="tfError" class="form-error" role="alert"></div><button class="btn danger">Turn off</button></form>`,
  );
  document.getElementById("tfDisable").onsubmit = async (e) => {
    e.preventDefault();
    try {
      await api("/account/2fa/disable", {
        method: "POST",
        body: { password: e.target.password.value, code: e.target.code.value },
      });
      closeModal();
      toast("Two-factor sign-in turned off");
      tfRefreshPanel();
    } catch (x) {
      document.getElementById("tfError").textContent = x.message;
    }
  };
}
async function tfSetRequired(box) {
  try {
    await api("/admin/security", { method: "PUT", body: { requireAdmin2fa: box.checked } });
    toast(box.checked ? "Two-factor sign-in is now required for admins" : "Requirement turned off");
  } catch (x) {
    box.checked = !box.checked;
    toast(x.message);
  }
}
