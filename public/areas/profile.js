/* Area: profile and settings (T135a). The company profile and its editor, the supplier's marketplace panel and
   pending re-verification banner, security (password, other sessions, two-factor sign-in), email notifications,
   payouts, the calendar feed, "Your data" with account deletion, the admin's account page, and the supplier's
   service catalog page with its editors. Drawn with translation keys; names, addresses, descriptions, services and
   people are data. profilePage, supplierCatalog and paSignOutOthers keep their names for older callers. */
const pfk = (key, params) => esc(t("prof." + key, params));
const pfDom = (text) => `<bdi>${esc(text)}</bdi>`;
// What still blocks an account deletion: a key with values from the server (T136), else its English label
const pfBlocker = (b) => (b.q ? pfk("del.b." + b.q[0], { ...b.q[1], ...(b.q[1]?.status ? { status: tStatus(b.q[1].status) } : {}) }) : pfDom(b.label));
const pfAvailability = (v) => (["Available", "Busy", "Unavailable"].includes(v) ? pfk("availability." + v) : pfDom(v));

/* ---------- The settings page of each role ---------- */
async function profilePage(role) {
  let d;
  try {
    d = await api("/profile");
  } catch (e) {
    // Admins who still need to set up two-factor sign-in cannot load the rest of the settings yet
    if (e.code !== "TOTP_SETUP_REQUIRED") throw e;
    app.innerHTML = dashboardShell(role, "profile", `<div class="dash-top"><div><h1>${pfk("settings")}</h1></div></div>` + (await pfTwoFactorPanel(role)));
    return;
  }
  state.user = { ...state.user, ...d.user };
  localStorage.setItem("cc_user", JSON.stringify(state.user));
  const [calendar, twoFactor] = await Promise.all([role === "admin" ? "" : pfCalendarPanel(), pfTwoFactorPanel(role)]);
  const parts =
    role === "admin"
      ? [
          `<div class="dash-top"><div><div class="eyebrow">${pfk("admin.eyebrow")}</div><h1>${pfk("admin.title")}</h1><p>${pfk("admin.lead")}</p></div><a class="btn outline" href="#/admin/platform">${pfk("admin.platform")}</a></div>`,
          `<section class="panel"><h3>${pfk("admin.administrator")}</h3><div class="pa-kv"><span>${pfk("admin.name")}</span><b>${esc(d.user.name)}</b><span>${pfk("admin.email")}</span><b>${esc(d.user.email)}</b><span>${pfk("admin.role")}</span><b>${pfk(
            "admin.roleText",
          )}</b></div></section>`,
        ]
      : [
          `<div class="dash-top"><div><div class="eyebrow">${pfk("eyebrow")}</div><h1>${pfk("title")}</h1><p>${pfk("lead")}</p></div><button class="btn primary" data-action="prof.edit">${pfk("editCompany")}</button></div>`,
          role === "supplier" ? pfPendingBanner(d.supplier?.pendingVerification) : "",
          ...pfCompany(d),
          role === "supplier" && d.supplier ? pfMarketplace(d.supplier) : "",
        ];
  // T151: a section menu at the top, so security, notifications and "Your data" (export, delete account) are one click away
  const sections = [
    role === "admin" ? null : ["pfCompany", "company"],
    ["paSecurity", "security"],
    ["pfNotify", "notifications"],
    calendar ? ["cfPanel", "calendar"] : null,
    twoFactor ? ["tfPanel", "twoFactor"] : null,
    ["gdPanel", "data"],
  ].filter(Boolean);
  const menu = `<nav class="pf-sections" aria-label="${pfk("sections.label")}">${sections
    .map(([id, key]) => `<button type="button" class="pf-section${key === "data" ? " pf-section-data" : ""}" data-action="prof.jump" data-target="${id}">${pfk("sections." + key)}</button>`)
    .join("")}</nav>`;
  app.innerHTML = dashboardShell(
    role,
    "profile",
    [parts[0], menu, ...parts.slice(1), pfSettings(role, d.user), calendar, twoFactor, pfDataPanel()]
      .filter(Boolean)
      .join(""),
  );
  if (role !== "admin") pfDeletion();
  // A link to "Your data & account" (?section=data) opens the page at that section
  const want = { data: "gdPanel", security: "paSecurity", notifications: "pfNotify" }[new URLSearchParams(location.hash.split("?")[1] || "").get("section")];
  if (want) document.getElementById(want)?.scrollIntoView({ block: "start" });
}
actions.on("prof.jump", (el) => {
  const target = document.getElementById(el.dataset.target);
  if (!target) return;
  target.scrollIntoView({ behavior: "smooth", block: "start" });
  target.classList.add("pf-flash");
  setTimeout(() => target.classList.remove("pf-flash"), 1200);
});
function pfCompany(d) {
  const c = d.companyProfile || {},
    u = d.user,
    fields = ["legalName", "taxId", "industry", "companySize", "address", "website", "contactName", "phone", "procurementEmail", "description"],
    value = { ...c, contactName: c.contactName || u.name };
  return [`<div class="wf-profile-head" id="pfCompany">${
    u.profileImage ? `<img class="wf-profile-image" src="${esc(u.profileImage)}" alt="${pfk("photoAlt")}">` : `<div class="supplier-avatar large">${esc((u.company || u.name).slice(0, 2).toUpperCase())}</div>`
  }<div><h2>${u.company ? esc(u.company) : pfk("companyRequired")}</h2><b>${esc(u.name)}</b><p>${ltr(u.email)} · ${c.phone ? ltr(c.phone) : pfk("addPhone")}</p></div></div>`, `<div class="wf-profile-grid">${fields
    .map((k) => `<article class="cc-card"><span class="cc-label">${pfk("field." + k)}</span><b>${value[k] ? (k === "description" || k === "industry" ? pfDom(value[k]) : ["taxId", "website", "phone", "procurementEmail"].includes(k) ? ltr(value[k]) : esc(value[k])) : pfk("addInfo")}</b></article>`)
    .join("")}</div>`];
}
function pfMarketplace(s) {
  return `<div class="panel" style="margin-top:16px"><h3>${pfk("marketplace")}</h3><p>${esc(ccBadge(s))} · ${pfk("staffYears", { staff: Number(s.employees) || 0, years: Number(s.experience) || 0 })}</p><a class="btn outline" href="#/supplier/suppliers">${pfk(
    "manageCatalog",
  )}</a></div>`;
}
// A live supplier's changed company name, legal details or certifications wait for an admin (T86)
function pfPendingBanner(pending) {
  if (!pending) return "";
  const rows = [
    pending.company ? ["company", pending.company] : null,
    pending.companyProfile?.legalName ? ["legalName", pending.companyProfile.legalName] : null,
    pending.companyProfile?.address ? ["address", pending.companyProfile.address] : null,
    pending.companyProfile?.taxId ? ["taxId", pending.companyProfile.taxId] : null,
    pending.certifications ? ["certifications", pending.certifications.join(", ")] : null,
  ].filter(Boolean);
  return `<section class="panel rz-panel" id="rzPanel" role="note"><div class="panel-title"><h3>${pfk("pending.title")}</h3><span class="status submitted">${pfk("pending.status")}</span></div><p><small>${pfk("pending.submitted", {
    date: fmt.date(pending.submittedAt),
  })}</small> ${pfk("pending.lead")}</p><dl class="rz-rows">${rows.map(([k, v]) => `<div><dt>${pfk("pending.f." + k)}</dt><dd>${esc(v)}</dd></div>`).join("")}</dl></section>`;
}
const PF_PREFS = ["messages", "invoices", "documents", "bids", "projects", "time"];
function pfSettings(role, user) {
  const prefs = user.notificationPrefs || {},
    p = user.payoutDetails,
    s = (key, params) => pfk("sec." + key, params);
  const payouts =
    role !== "supplier"
      ? ""
      : `<section class="panel"><h3>${pfk("pay.title")}</h3><p class="subtle">${pfk("pay.lead")}</p>${
          p
            ? `<div class="pa-kv"><span>${pfk("pay.holder")}</span><b>${esc(p.accountHolder)}</b><span>IBAN</span><b>${ltr(p.iban.slice(0, 4) + " •••• " + p.iban.slice(-4))}</b><span>BIC</span><b>${esc(p.bic || "—")}</b><span>${pfk(
                "pay.bank",
              )}</span><b>${esc(p.bankName || "—")}</b><span>${pfk("pay.email")}</span><b>${esc(p.billingEmail || user.email)}</b></div>`
            : `<p class="danger-text">${pfk("pay.none")}</p>`
        }<form id="paPayoutForm" class="modal-form" data-action="prof.payout" ${p ? "hidden" : ""}><div class="two"><label>${pfk("pay.holder")} *<input name="accountHolder" value="${esc(
          p?.accountHolder || user.companyProfile?.legalName || user.company || "",
        )}" required></label><label>${pfk("pay.bank")}<input name="bankName" value="${esc(p?.bankName || "")}"></label></div><div class="two"><label>IBAN *<input name="iban" placeholder="DE89 3704 0044 0532 0130 00" required></label><label>BIC / SWIFT<input name="bic" value="${esc(
          p?.bic || "",
        )}"></label></div><label>${pfk("pay.email")}<input name="billingEmail" type="email" value="${esc(p?.billingEmail || "")}"></label><div class="form-error" role="alert"></div><button class="btn primary">${pfk("pay.save")}</button></form>${
          p ? `<button class="btn outline small" data-action="prof.changePayout">${pfk("pay.change")}</button>` : ""
        }</section><section class="panel"><h3>${pfk("team.title")}</h3><p class="subtle">${pfk("team.lead")}</p><a class="btn outline" href="#/supplier/suppliers">${pfk("team.manage")}</a></section>`;
  return `<div class="pa-settings"><section class="panel" id="paSecurity"><h3>${s("title")}</h3><p class="subtle">${user.passwordChangedAt ? s("changed", { date: fmt.date(user.passwordChangedAt) }) : s("choose")}</p><form id="paPasswordForm" class="modal-form" data-action="prof.password"><label>${s(
    "current",
  )}<input name="currentPassword" type="password" autocomplete="current-password" required></label><div class="two"><label>${s("new")}<input name="newPassword" type="password" autocomplete="new-password" minlength="10" required></label><label>${s(
    "repeat",
  )}<input name="confirm" type="password" autocomplete="new-password" minlength="10" required></label></div><small class="subtle">${s("rules")}</small><div class="form-error" role="alert"></div><div class="cc-actions"><button class="btn primary">${s(
    "change",
  )}</button><button type="button" class="btn outline" data-action="prof.signOutOthers">${s("others")}</button></div></form></section><section class="panel" id="pfNotify"><h3>${pfk("prefs.title")}</h3><p class="subtle">${pfk(
    "prefs.lead",
  )}</p><form id="paPrefsForm" class="pa-prefs" data-action="prof.prefs">${PF_PREFS.map((k) => `<label class="cc-check-label"><input type="checkbox" name="${k}" ${prefs[k] ? "checked" : ""}> ${pfk("prefs." + k)}</label>`).join(
    "",
  )}<div><button class="btn outline small">${pfk("prefs.save")}</button></div></form></section>${payouts}</div>`;
}
actions.on("prof.password", async (form) => {
  const f = Object.fromEntries(new FormData(form)),
    err = form.querySelector(".form-error");
  err.textContent = "";
  if (f.newPassword !== f.confirm) return (err.textContent = t("prof.sec.mismatch"));
  try {
    await api("/account/password", { method: "POST", body: f });
    form.reset();
    tToast(t("prof.sec.done"));
  } catch (x) {
    err.textContent = x.message;
  }
});
async function paSignOutOthers() {
  if (!(await uiConfirm(t("prof.sec.othersConfirm"), { confirmLabel: t("prof.sec.othersConfirmLabel") }))) return;
  try {
    const r = await api("/account/sessions", { method: "DELETE" });
    tToast(t.plural("prof.sec.othersDone", r.revoked));
  } catch (x) {
    toast(x.message, "error");
  }
}
actions.on("prof.signOutOthers", () => paSignOutOthers());
actions.on("prof.prefs", async (form) => {
  const notificationPrefs = {};
  form.querySelectorAll("input[type=checkbox]").forEach((c) => (notificationPrefs[c.name] = c.checked));
  try {
    await api("/account/preferences", { method: "PUT", body: { notificationPrefs } });
    tToast(t("prof.prefs.saved"));
  } catch (x) {
    toast(x.message, "error");
  }
});
actions.on("prof.changePayout", (btn) => {
  document.getElementById("paPayoutForm").hidden = false;
  btn.remove();
});
actions.on("prof.payout", async (form) => {
  const err = form.querySelector(".form-error");
  err.textContent = "";
  try {
    await api("/account/payout", { method: "PUT", body: Object.fromEntries(new FormData(form)) });
    tToast(t("prof.pay.saved"));
    profilePage("supplier");
  } catch (x) {
    err.textContent = x.message;
  }
});

/* ---------- Company profile editor ---------- */
async function pfReadImage(file) {
  if (file.size > 1200000) throw new Error(t("prof.form.imageTooBig"));
  if (!file.type.startsWith("image/")) throw new Error(t("prof.form.imageType"));
  return await new Promise((resolve, reject) => {
    const r = new FileReader();
    r.onload = () => resolve(r.result);
    r.onerror = reject;
    r.readAsDataURL(file);
  });
}
async function pfEditCompany() {
  const d = await api("/profile"),
    c = d.companyProfile || {},
    f = (key) => pfk("form." + key),
    input = (name, label, value, extra = "") => `<label>${f(label)}<input name="${name}" value="${esc(value || "")}"${extra}></label>`;
  modal(
    t("prof.form.title"),
    `<form id="wfProfile" class="modal-form" data-action="prof.saveCompany"><label>${f("photo")}<input name="profileFile" type="file" accept="image/*"></label><div class="two">${input("legalName", "legalName", c.legalName)}${input(
      "company",
      "company",
      d.user.company,
      " required",
    )}</div><div class="two">${input("taxId", "taxId", c.taxId)}${input("industry", "industry", c.industry)}</div><div class="two"><label>${f("size")}<select name="companySize">${["", "1–10", "11–50", "51–250", "251–1000", "1000+"]
      .map((x) => `<option value="${x}" ${x === (c.companySize || "") ? "selected" : ""}>${x}</option>`)
      .join("")}</select></label>${input("phone", "phone", c.phone)}</div><label>${f("address")}<textarea name="address">${esc(c.address || "")}</textarea></label><div class="two">${input("website", "website", c.website, ' type="url"')}${input(
      "procurementEmail",
      "procurementEmail",
      c.procurementEmail,
      ' type="email"',
    )}</div>${input("contactName", "contactName", c.contactName || d.user.name)}<label>${f("description")}<textarea name="description">${esc(c.description || "")}</textarea></label><div id="wfProfileError" class="form-error"></div><button class="btn primary">${f(
      "save",
    )}</button></form>`,
  );
}
actions.on("prof.edit", () => pfEditCompany());
actions.on("prof.saveCompany", async (form) => {
  const fd = new FormData(form),
    file = fd.get("profileFile"),
    d = await api("/profile");
  let profileImage = d.user.profileImage || "";
  try {
    if (file?.size) profileImage = await pfReadImage(file);
    const companyProfile = Object.fromEntries([...fd.entries()].filter(([k]) => k !== "profileFile"));
    await api("/profile", { method: "PUT", body: { company: companyProfile.company, profileImage, companyProfile } });
    closeModal();
    profilePage(state.user.role);
  } catch (x) {
    document.getElementById("wfProfileError").textContent = x.message;
  }
});

/* ---------- Calendar feed (T66) ---------- */
async function pfCalendarPanel() {
  const status = await api("/calendar").catch(() => ({ active: false }));
  return `<section class="panel" id="cfPanel">${pfCalendarHtml(status)}</section>`;
}
function pfCalendarHtml(status, url = "") {
  const c = (key, params) => pfk("cal." + key, params);
  return `<div class="panel-title"><h3>${c("title")}</h3>${status.active ? `<span class="status completed">${c("on")}</span>` : ""}</div><p>${c("lead")}</p>${
    url
      ? `<label for="cfUrl">${c("link")}</label><div class="cf-url"><input id="cfUrl" readonly value="${esc(url)}"><button type="button" class="btn small primary" data-action="prof.calCopy">${c(
          "copy",
        )}</button></div><details class="cf-help" open><summary>${c("how")}</summary><ul>${["outlook", "google", "apple"].map((k) => `<li><b>${c("app." + k)}:</b> ${c("steps." + k)}</li>`).join("")}</ul><p class="subtle">${c("refresh")}</p></details>`
      : status.active
        ? `<p class="subtle">${c("created", { date: fmt.date(status.createdAt) })}</p>`
        : ""
  }<div class="cc-actions"><button type="button" class="btn small ${status.active ? "outline" : "primary"}" data-action="prof.calCreate">${c(status.active ? "renew" : "create")}</button>${
    status.active ? `<button type="button" class="btn small outline" data-action="prof.calOff">${c("off")}</button>` : ""
  }</div>`;
}
const pfCalendarRender = (html) => {
  const panel = document.getElementById("cfPanel");
  panel.innerHTML = html;
};
actions.on("prof.calCreate", async () => {
  if (document.querySelector("#cfPanel .status") && !(await uiConfirm(t("prof.cal.renewConfirm")))) return;
  try {
    const r = await api("/calendar", { method: "POST" });
    pfCalendarRender(pfCalendarHtml(r, r.url));
  } catch (x) {
    toast(x.message);
  }
});
actions.on("prof.calOff", async () => {
  if (!(await uiConfirm(t("prof.cal.offConfirm")))) return;
  const r = await api("/calendar", { method: "DELETE" });
  pfCalendarRender(pfCalendarHtml(r));
  tToast(t("prof.cal.offDone"));
});
actions.on("prof.calCopy", async () => {
  const input = document.getElementById("cfUrl");
  try {
    await navigator.clipboard.writeText(input.value);
  } catch {
    input.select();
    document.execCommand("copy");
  }
  tToast(t("prof.cal.copied"));
});

/* ---------- Two-factor sign-in (T67) ---------- */
async function pfTwoFactorPanel(role) {
  const status = await api("/account/2fa").catch(() => null);
  return status ? `<section class="panel" id="tfPanel">${pfTwoFactorHtml(status, role)}</section>` : "";
}
function pfTwoFactorHtml(s, role) {
  const f = (key) => pfk("tf." + key);
  return `<div class="panel-title"><h3>${f("title")}</h3>${s.enabled ? `<span class="status completed">${f("on")}</span>` : `<span class="status rejected">${f("off")}</span>`}</div><p>${f(s.enabled ? "leadOn" : "leadOff")}</p>${
    s.enabled ? `<p class="subtle"><span>${f("codesLeft")}</span> <b>${s.recoveryLeft}</b></p>` : ""
  }${s.required && !s.enabled ? `<p class="danger-text">${f("adminsMust")}</p>` : ""}<div class="cc-actions">${
    s.enabled ? (s.required ? "" : `<button type="button" class="btn small outline" data-action="prof.tfDisable">${f("turnOff")}</button>`) : `<button type="button" class="btn small primary" data-action="prof.tfSetup">${f("turnOn")}</button>`
  }</div>${
    role === "admin" ? `<label class="cc-check-label tf-require"><input type="checkbox" id="tfRequire" ${s.required ? "checked" : ""} data-action="prof.tfRequire"> ${f("require")}</label>` : ""
  }`;
}
async function tfRefreshPanel() {
  const panel = document.getElementById("tfPanel");
  if (panel) panel.innerHTML = pfTwoFactorHtml(await api("/account/2fa"), state.user.role);
}
async function tfSetup() {
  let d;
  try {
    d = await api("/account/2fa/setup", { method: "POST" });
  } catch (x) {
    return toast(x.message);
  }
  const f = (key) => pfk("tf." + key);
  modal(
    t("prof.tf.setupTitle"),
    `<div><ol class="tf-steps"><li>${f("step1")} <a href="${esc(d.otpauthUrl)}">${f("openApp")}</a></li><li>${f("step2")}<code class="tf-secret">${esc(d.secret.replace(/(.{4})/g, "$1 ").trim())}</code><small class="subtle">${f(
      "step2Hint",
    )}</small></li><li>${f("step3")}</li></ol><form id="tfEnable" class="modal-form" data-action="prof.tfEnable"><label>${f("code")}<input name="code" inputmode="numeric" autocomplete="one-time-code" maxlength="6" pattern="[0-9]{6}" required></label><div id="tfError" class="form-error" role="alert"></div><button class="btn primary">${f(
      "turnOn",
    )}</button></form></div>`,
  );
}
actions.on("prof.tfSetup", () => tfSetup());
actions.on("prof.tfEnable", async (form) => {
  try {
    const r = await api("/account/2fa/enable", { method: "POST", body: { code: form.code.value.trim() } });
    pfShowRecovery(r.recoveryCodes);
    tfRefreshPanel().catch(() => {});
  } catch (x) {
    document.getElementById("tfError").textContent = x.message;
  }
});
let pfRecoveryCodes = [];
function pfShowRecovery(codes) {
  pfRecoveryCodes = codes;
  const f = (key) => pfk("tf." + key);
  modal(
    t("prof.tf.codesTitle"),
    `<div><p>${f("codesLead")}</p><ul class="tf-codes">${codes.map((c) => `<li><code>${esc(c)}</code></li>`).join("")}</ul><div class="cc-actions"><button type="button" class="btn outline" data-action="prof.tfDownload">${f(
      "download",
    )}</button><button type="button" class="btn primary" data-action="prof.tfSaved">${f("saved")}</button></div></div>`,
  );
}
actions.on("prof.tfDownload", () => {
  const a = document.createElement("a");
  a.href = URL.createObjectURL(new Blob([`${t("prof.tf.fileTitle", { email: state.user.email })}\n\n${pfRecoveryCodes.join("\n")}\n`], { type: "text/plain" }));
  a.download = "craftcrew-recovery-codes.txt";
  a.click();
  setTimeout(() => URL.revokeObjectURL(a.href), 1000);
});
actions.on("prof.tfSaved", () => {
  closeModal();
  route();
});
actions.on("prof.tfDisable", () => {
  const f = (key) => pfk("tf." + key);
  modal(
    t("prof.tf.disableTitle"),
    `<form id="tfDisable" class="modal-form" data-action="prof.tfDisableSend"><label>${f("password")}<input name="password" type="password" autocomplete="current-password" required></label><label>${f(
      "codeOrRecovery",
    )}<input name="code" autocomplete="one-time-code" maxlength="20" required></label><div id="tfError" class="form-error" role="alert"></div><button class="btn danger">${f("turnOff")}</button></form>`,
  );
});
actions.on("prof.tfDisableSend", async (form) => {
  try {
    await api("/account/2fa/disable", { method: "POST", body: { password: form.password.value, code: form.code.value } });
    closeModal();
    tToast(t("prof.tf.turnedOff"));
    tfRefreshPanel();
  } catch (x) {
    document.getElementById("tfError").textContent = x.message;
  }
});
actions.on("prof.tfRequire", async (box) => {
  try {
    await api("/admin/security", { method: "PUT", body: { requireAdmin2fa: box.checked } });
    tToast(t(box.checked ? "prof.tf.required" : "prof.tf.notRequired"));
  } catch (x) {
    box.checked = !box.checked;
    toast(x.message);
  }
});

/* ---------- Your data: download and account deletion (T120–T121) ---------- */
function pfDataPanel() {
  return `<section class="panel" id="gdPanel"><div class="panel-title"><h3>${pfk("data.title")}</h3></div><p>${pfk("data.lead")}</p><div class="cc-actions"><button type="button" class="btn small outline" data-action="prof.export">${pfk(
    "data.download",
  )}</button></div><div id="gdDelete" class="gd-delete"></div></section>`;
}
actions.on("prof.export", async () => {
  try {
    const d = await api("/account/export"),
      a = document.createElement("a");
    a.href = URL.createObjectURL(new Blob([JSON.stringify(d, null, 2)], { type: "application/json" }));
    a.download = `craftcrew-my-data-${new Date().toISOString().slice(0, 10)}.json`;
    a.click();
    setTimeout(() => URL.revokeObjectURL(a.href), 30000);
    tToast(t("prof.data.downloaded"));
  } catch (x) {
    toast(x.message, "error");
  }
});
// Open business blocks the deletion; otherwise the password (and code) starts the grace period
let pfGraceDays = 14;
async function pfDeletion() {
  const box = document.getElementById("gdDelete");
  if (!box) return;
  const d = await api("/account/deletion").catch(() => null);
  if (!d || !document.contains(box)) return;
  pfGraceDays = d.graceDays;
  const f = (key, params) => pfk("del." + key, params);
  box.innerHTML = `<h4>${f("title")}</h4><p>${state.user?.isMember ? f("member") : f("lead", { days: d.graceDays }) + (d.coversTeam ? " " + f("team") : "")}</p>${
    d.blockers.length
      ? `<p class="gd-blocked"><b>${f("blocked")}</b></p><ul class="gd-blockers">${d.blockers.map((b) => `<li><a href="#${esc(b.link)}">${pfBlocker(b)}</a></li>`).join("")}</ul>`
      : `<form id="gdDeleteForm" class="modal-form gd-delete-form" data-action="prof.delete"><label>${f("password")}<input name="password" type="password" autocomplete="current-password" required></label>${
          state.user?.twoFactor ? `<label>${f("code")}<input name="code" inputmode="numeric" autocomplete="one-time-code" required></label>` : ""
        }<div id="gdDeleteError" class="form-error"></div><button class="btn danger">${f("submit")}</button></form>`
  }`;
}
actions.on("prof.delete", async (form) => {
  const f = new FormData(form);
  if (!(await uiConfirm(t("prof.del.confirm", { days: pfGraceDays })))) return;
  try {
    const r = await api("/account/deletion", { method: "POST", body: { password: f.get("password"), code: f.get("code") || undefined } });
    await logout();
    setTimeout(() => tToast(t("prof.del.done", { date: fmt.date(r.deleteAfter) })), 300);
  } catch (x) {
    document.getElementById("gdDeleteError").textContent = x.message;
  }
});

/* ---------- The supplier's service catalog page ---------- */
async function supplierCatalog() {
  const d = await api("/profile"),
    s = d.supplier || {},
    items = s.serviceCatalog || [],
    team = s.teamMembers || [],
    c = (key, params) => pfk("cat." + key, params),
    card = (label, value) => `<div class="cc-card"><span class="cc-label">${label}</span><b>${value}</b></div>`;
  const service = (x) =>
    `<tr><td><b>${pfDom(x.name)}</b><small>${x.category ? statusHtml(x.category) : c("service")}</small></td><td>${pfDom(x.description || "")}<small>${pfDom(x.qualifications || "")}</small></td><td>${esc(fmt.money(x.rate || 0))} / ${
      PF_UNITS.includes(x.unit || "hour") ? pfk("unit." + (x.unit || "hour")) : pfDom(x.unit)
    }</td><td>${x.capacity ? pfDom(x.capacity) : c("byAgreement")}<small>${x.leadTime ? pfDom(x.leadTime) : c("onRequest")}</small></td><td>${x.status && x.status !== "Published" ? statusHtml(x.status) : c("published")}</td></tr>`;
  const person = (x) => `<tr><td>${esc(x.name)}</td><td>${pfDom(x.role || "")}</td><td>${pfDom(x.experience || "")}</td><td>${pfDom(x.certifications || "")}</td><td>${pfAvailability(x.availability || "Available")}</td></tr>`;
  app.innerHTML = dashboardShell(
    "supplier",
    "suppliers",
    [
      `<div class="dash-top"><div><div class="eyebrow">${c("eyebrow")}</div><h1>${c("title")}</h1><p>${c("lead")}</p></div><div class="cc-actions"><button class="btn outline" data-action="prof.editDetails">${c(
        "editDetails",
      )}</button><button class="btn primary" data-action="prof.editCatalog">${c("editCatalog")}</button></div></div>`,
      `<div class="notice">${c("notice")}</div>`,
      `<div class="wf-stat-grid">${card(c("employees"), Number(s.employees) || 0)}${card(c("keyPeople"), team.length)}${card(c("experience"), c("years", { n: Number(s.experience) || 0 }))}</div>`,
      `<section class="panel"><div class="panel-title"><h3>${c("services")}</h3><button class="btn small primary" data-action="prof.editCatalog">${c("add")}</button></div><div class="cc-table-wrap"><table class="cc-table"><thead><tr>${[
        "colService",
        "colDescription",
        "colRate",
        "colCapacity",
        "colStatus",
      ]
        .map((k) => `<th>${c(k)}</th>`)
        .join("")}</tr></thead><tbody>${items.map(service).join("") || `<tr><td colspan="5">${c("noServices")}</td></tr>`}</tbody></table></div></section>`,
      `<section class="panel"><div class="panel-title"><h3>${c("people")}</h3><span>${c("listed", { n: team.length })}</span></div><div class="cc-table-wrap"><table class="cc-table"><thead><tr>${["colName", "colRole", "colExperience", "colCerts", "colAvailability"]
        .map((k) => `<th>${c(k)}</th>`)
        .join("")}</tr></thead><tbody>${team.map(person).join("") || `<tr><td colspan="5">${c("noPeople")}</td></tr>`}</tbody></table></div></section>`,
    ]
      .join(""),
  );
  // The supplier's own certificates and proofs (areas/directory.js)
  await dcRefreshOwn().catch((e) => console.error(e));
}
const PF_UNITS = ["hour", "day", "project", "unit", "fixed"];
function pfServiceRow(x = {}) {
  const f = (key) => pfk("row." + key);
  return `<fieldset class="wf-service-row"><legend>${f("service")}</legend><button type="button" class="btn small danger wf-remove" data-action="prof.removeRow">${f("remove")}</button><div class="two"><label>${f("name")}<input name="name" value="${esc(
    x.name || "",
  )}" required></label><label>${f("category")}<input name="category" value="${esc(x.category || "Service")}"></label></div><label>${f("description")}<input name="description" value="${esc(x.description || "")}"></label><div class="three"><label>${f(
    "rate",
  )}<input name="rate" type="number" min="0" step="0.01" value="${Number(x.rate) || 0}"></label><label>${f("unit")}<select name="unit">${PF_UNITS.map((u) => `<option value="${u}" ${u === (x.unit || "hour") ? "selected" : ""}>${pfk("unit." + u)}</option>`).join(
    "",
  )}</select></label><label>${f("capacity")}<input name="capacity" value="${esc(x.capacity || "")}" placeholder="${f("capacityHint")}"></label></div><div class="two"><label>${f("leadTime")}<input name="leadTime" value="${esc(x.leadTime || "")}"></label><label>${f(
    "qualifications",
  )}<input name="qualifications" value="${esc(x.qualifications || "")}"></label></div></fieldset>`;
}
function pfTeamRow(x = {}) {
  const f = (key) => pfk("row." + key);
  return `<fieldset class="wf-person-row"><legend>${f("person")}</legend><button type="button" class="btn small danger wf-remove" data-action="prof.removeRow">${f("remove")}</button><div class="three"><label>${f("name")}<input name="name" value="${esc(
    x.name || "",
  )}" required></label><label>${f("role")}<input name="role" value="${esc(x.role || "")}"></label><label>${f("experience")}<input name="experience" value="${esc(x.experience || "")}"></label></div><div class="two"><label>${f(
    "certifications",
  )}<input name="certifications" value="${esc(x.certifications || "")}"></label><label>${f("availability")}<input name="availability" value="${esc(x.availability || "Available")}"></label></div></fieldset>`;
}
let pfCatalogSupplier = {};
async function pfEditCatalog() {
  const d = await api("/profile"),
    s = (pfCatalogSupplier = d.supplier || {}),
    catalog = s.serviceCatalog || [],
    team = s.teamMembers || [],
    f = (key) => pfk("edit." + key);
  modal(
    t("prof.edit.title"),
    `<form id="wfCatalog" class="modal-form" data-action="prof.saveCatalog"><h3>${f("services")}</h3><div id="wfServiceRows">${(catalog.length ? catalog : [{}]).map(pfServiceRow).join("")}</div><button type="button" class="btn small outline" data-action="prof.addService">${f(
      "addService",
    )}</button><h3>${f("people")}</h3><div id="wfTeamRows">${(team.length ? team : [{}]).map(pfTeamRow).join("")}</div><button type="button" class="btn small outline" data-action="prof.addPerson">${f("addPerson")}</button><div class="two"><label>${f(
      "employees",
    )}<input name="employees" type="number" min="0" value="${Number(s.employees) || team.length}"></label><label>${f("years")}<input name="experience" type="number" min="0" value="${Number(s.experience) || 0}"></label></div><div class="two"><label>${f(
      "availability",
    )}<select name="availability">${["Available", "Busy", "Unavailable"].map((x) => `<option value="${x}" ${x === s.availability ? "selected" : ""}>${pfk("availability." + x)}</option>`).join("")}</select></label><label>${f(
      "certifications",
    )}<input name="certifications" value="${esc((s.certifications || []).join(", "))}"></label></div><div id="wfCatalogError" class="form-error"></div><button class="btn primary">${f("save")}</button></form>`,
  );
}
actions.on("prof.editCatalog", () => pfEditCatalog());
actions.on("prof.addService", () => document.getElementById("wfServiceRows")?.insertAdjacentHTML("beforeend", pfServiceRow()));
actions.on("prof.addPerson", () => document.getElementById("wfTeamRows")?.insertAdjacentHTML("beforeend", pfTeamRow()));
actions.on("prof.removeRow", (btn) => btn.closest("fieldset").remove());
actions.on("prof.saveCatalog", async (form) => {
  const fd = new FormData(form),
    s = pfCatalogSupplier,
    readRows = (selector) =>
      [...form.querySelectorAll(selector)].map((row) => Object.fromEntries([...row.querySelectorAll("[name]")].map((el) => [el.name, el.value]))).filter((x) => x.name),
    serviceCatalog = readRows(".wf-service-row"),
    teamMembers = readRows(".wf-person-row");
  try {
    await api("/profile", {
      method: "PUT",
      body: {
        serviceCatalog,
        teamMembers,
        services: [...new Set([...serviceCatalog.map((x) => x.name), ...(s.services || [])])],
        employees: fd.get("employees"),
        experience: fd.get("experience"),
        availability: fd.get("availability"),
        certifications: String(fd.get("certifications") || "")
          .split(",")
          .map((x) => x.trim())
          .filter(Boolean),
      },
    });
    closeModal();
    supplierCatalog();
  } catch (x) {
    document.getElementById("wfCatalogError").textContent = x.message;
  }
});
// Contact, company, location and overview for the public profile
async function editProfile() {
  const d = await api("/profile"),
    s = d.supplier || {},
    f = (key) => pfk("details." + key);
  modal(
    t("prof.details.title"),
    `<form id="pf" class="modal-form" data-action="prof.saveDetails"><label>${f("contact")}<input name="name" value="${esc(d.user.name)}" required></label><label>${f("company")}<input name="company" value="${esc(
      d.user.company || s.company || "",
    )}" required></label><label>${f("location")}<input name="location" value="${esc(s.location || "")}" placeholder="${f("locationHint")}"></label><label>${f("overview")}<textarea name="description" rows="5">${esc(
      s.description || "",
    )}</textarea></label><div id="profileError" class="form-error" role="alert"></div><button class="btn primary">${f("save")}</button></form>`,
  );
}
actions.on("prof.editDetails", () => editProfile());
actions.on("prof.saveDetails", async (form) => {
  try {
    await api("/profile", { method: "PUT", body: Object.fromEntries(new FormData(form)) });
    closeModal();
    tToast(t("prof.details.saved"));
    route();
  } catch (err) {
    document.getElementById("profileError").textContent = err.message;
  }
});

routes.add("/customer/profile", () => profilePage("customer"));
routes.add("/supplier/profile", () => profilePage("supplier"));
routes.add("/admin/profile", () => profilePage("admin"));
routes.add("/supplier/suppliers", supplierCatalog);
