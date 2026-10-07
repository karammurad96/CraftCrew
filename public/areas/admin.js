/* Area: admin (T134). Supplier applications with the vetting file, profile changes awaiting re-verification, users
   with badges, account access, password resets and pending deletions (T134a); billing, escalations, reports, the
   audit log and platform management (T134b). Drawn with translation keys; company names, people, addresses, notes,
   file names, emails and audit entries are data. reviewApplication stays: the admin dashboard opens it. */
const adk = (key, params) => esc(t("adm." + key, params));
const adDom = (text) => `<bdi>${esc(text)}</bdi>`;
// A known value shows from its key; anything else (older data) shows as it is, translated by the old layer
const adValue = (group, value) => (typeof ccLookup("en", `adm.${group}.${value}`) === "string" ? adk(`${group}.${value}`) : adDom(value));
const adOptions = (group, values, current) => values.map((x) => `<option value="${esc(x)}" ${x === current ? "selected" : ""}>${adk(`${group}.${x}`)}</option>`).join("");

/* ---------- Applications ---------- */
const AD_APP_TONE = { Approved: "completed", Rejected: "rejected", "On Hold": "submitted" };
async function adminApplications() {
  const { applications = [] } = await api("/admin/applications");
  const row = (a) =>
    `<tr><td><b>${esc(a.company)}</b><small>${esc(a.contactName || a.directorName || "")} · ${esc(a.email)}</small></td><td>${adValue("stage", a.stage || "New")}</td><td><span class="status ${AD_APP_TONE[a.status] || "active"}">${adValue(
      "status",
      a.status || "New",
    )}</span></td><td>${esc(fmt.date(a.createdAt))}</td><td><button class="btn small primary" data-action="adm.review" data-id="${esc(a.id)}">${adk("apps.review")}</button></td></tr>`;
  app.innerHTML = dashboardShell(
    "admin",
    "applications",
    [
      `<div class="dash-top"><div><h1>${adk("apps.title")}</h1><p>${adk("apps.lead")}</p></div></div>`,
      `<section class="panel"><div class="cc-table-wrap"><table class="cc-table"><thead><tr><th>${adk("apps.company")}</th><th>${adk("apps.stage")}</th><th>${adk("apps.decision")}</th><th>${adk("apps.submitted")}</th><th></th></tr></thead><tbody>${
        applications.map(row).join("") || `<tr><td colspan="5">${adk("apps.none")}</td></tr>`
      }</tbody></table></div></section>`,
    ]
      .join(""),
  );
}
actions.on("adm.review", (el) => reviewApplication(el.dataset.id));

const AD_CHECKS = ["registration", "vat", "insurance", "certifications", "references", "sanctions"];
const AD_CHECK_STATES = ["Not checked", "Passed", "Needs follow-up", "Failed", "Not applicable"];
const AD_STAGES = ["New", "Verified", "References", "Manual Review", "Decision & Badge"];
const AD_RISK = ["Not assessed", "Low", "Medium", "High"];
const AD_REFERENCE = ["Not started", "Reached - positive", "Reached - concerns", "No response", "Not applicable"];
// The vetting file of one application: data, evidence files with an inline preview, intake checks, VIES and the review form
async function reviewApplication(id) {
  const { applications = [] } = await api("/admin/applications"),
    a = applications.find((x) => x.id === id);
  if (!a) return;
  const v = a.verification || { checks: {}, riskLevel: "Not assessed" },
    f = (key, params) => adk("file." + key, params),
    dash = (x) => x || "—";
  const facts = [
    ["company", esc(a.company)],
    ["contact", esc(dash(a.contactName || a.directorName))],
    ["emailPhone", esc(`${a.email} · ${a.phone}`)],
    ["registration", esc(`${dash(a.registrationNumber)} · ${dash(a.vatId)}`)],
    ["address", esc(dash(a.legalAddress || a.location))],
    ["insurance", esc(`${dash(a.insuranceProvider)} · ${dash(a.insurancePolicy || a.insurance)}`)],
    ["coverage", esc(`${a.insuranceCoverage ? fmt.money(a.insuranceCoverage) : "—"} · ${dash(a.insuranceExpiry && fmt.date(a.insuranceExpiry))}`)],
    ["website", esc(dash(a.website))],
    ["experience", a.yearsInBusiness ? f("years", { n: a.yearsInBusiness }) : "—"],
    ["services", adDom(dash((a.services || []).join(", ")))],
    ["certifications", adDom(dash((a.certifications || []).join(", ")))],
    ["portfolio", adDom(dash(a.portfolio))],
  ];
  const files = a.proofUploads || [],
    fileButton = (x) =>
      `<button type="button" class="cc-vetting-file ff-evidence-file" data-action="adm.evidence" data-url="${esc(x.url)}" data-name="${esc(x.filename)}">📄 ${esc(x.filename)} <small>${statusHtml(x.category)} · ${esc(
        fmt.number(Math.ceil((x.size || 0) / 1024)),
      )} KB</small><span class="ff-evidence-open">${f("view")}</span></button>`;
  const preflight = Object.entries(a.preflight || {})
    .map(([k, val]) => {
      const uploaded = /^(\d+) uploaded$/.exec(val),
        text = uploaded ? f("uploaded", { n: uploaded[1] }) : adValue("pre", val),
        evidence = k === "evidenceFiles" && files.length;
      return `<span${evidence ? ` class="ff-tile-link" title="${f("showEvidence")}" data-action="adm.firstEvidence"` : ""}><b>${typeof ccLookup("en", "adm.preKey." + k) === "string" ? adk("preKey." + k) : esc(k)}</b>${text}</span>`;
    })
    .join("");
  const btn = (status, cls, label) => `<button type="button" class="btn ${cls}" data-action="adm.vet" data-id="${esc(id)}" data-status="${status}">${f(label)}</button>`;
  modal(
    t("adm.file.title"),
    `<div><div class="cc-vetting-flow">${["application", "verification", "references", "manual"].map((k, n) => `<span class="on">${n + 1} ${f("flow." + k)}</span>`).join("")}<span>5 ${f("flow.decision")}</span></div><div class="cc-vetting-grid"><section class="panel"><h3>${f(
      "capability",
    )}</h3><dl>${facts.map(([k, val]) => `<div><dt>${f("fact." + k)}</dt><dd>${val}</dd></div>`).join("")}</dl></section><section class="panel"><h3>${f("evidence")}</h3>${
      files.map(fileButton).join("") || `<p class="subtle">${f("noEvidence")}</p>`
    }<h3>${f("references")}</h3><p>${esc(a.referenceName)} · ${esc(a.referenceEmail)}</p><p>${a.reference2 ? esc(a.reference2) : f("noReference2")}</p></section></div>${
      files.length ? '<div id="ffEvidencePreview" class="ff-evidence-preview" hidden></div>' : ""
    }<section class="panel cc-preflight"><h3>${f("intake")}</h3><p>${f("intakeLead")}</p><div>${preflight}</div>${adViesPanel(a)}</section><form id="ccVettingReview" class="modal-form"><div class="cc-vetting-checks"><h3>${f(
      "checks",
    )}</h3>${AD_CHECKS.map((key) => `<label>${f("check." + key)}<select name="check_${key}">${adOptions("checkState", AD_CHECK_STATES, v.checks?.[key] || "Not checked")}</select></label>`).join(
      "",
    )}</div><div class="two"><label>${f("stage")}<select name="stage">${adOptions("stage", AD_STAGES, a.stage || "New")}</select></label><label>${f("risk")}<select name="riskLevel">${adOptions(
      "risk",
      AD_RISK,
      v.riskLevel || "Not assessed",
    )}</select></label></div><div class="two"><label>${f("referenceOutcome")}<select name="referenceOutcome">${adOptions("reference", AD_REFERENCE, v.referenceOutcome || "Not started")}</select></label><label>${f(
      "badge",
    )}<select name="badge">${["Bronze", "Silver", "Gold"].map((x) => `<option value="${x}" ${x === (a.badgeDecision || "Bronze") ? "selected" : ""}>${esc(t("common.badge." + x))}</option>`).join("")}</select></label></div><label>${f(
      "riskNotes",
    )}<textarea name="riskNotes" rows="3" maxlength="3000">${esc(v.riskNotes || "")}</textarea></label><label>${f("decisionNote")}<textarea name="decisionNote" rows="2" maxlength="3000">${esc(
      a.decisionNote || "",
    )}</textarea></label><div id="ccVettingError" class="form-error" role="alert"></div><div class="cc-actions">${a.status === "On Hold" ? btn("New", "outline", "requeue") : ""}${btn("", "outline", "save")}${btn("On Hold", "outline", "hold")}${btn(
      "Rejected",
      "danger",
      "reject",
    )}${btn("Approved", "success", "approve")}</div></form></div>`,
  );
}
// EU VIES result for the VAT ID (T60). The "VAT / tax check" is pre-filled from it; the admin decides.
function adViesPanel(a) {
  if (!a.vatId) return "";
  const r = a.verification?.vies,
    f = (key) => adk("vies." + key),
    when = r?.checkedAt ? ` <small>${esc(fmt.date(r.checkedAt))}</small>` : "",
    text = !r
      ? f("notChecked")
      : r.unreachable
        ? f("unreachable")
        : r.valid
          ? `<b>${f("valid")}</b>${r.name ? ` · ${esc(r.name)}` : ""}${r.address ? ` · ${esc(r.address)}` : ""}${r.requestId ? ` · <small>${esc(r.requestId)}</small>` : ""}`
          : `<b>${f("invalid")}</b>`;
  return `<p class="cm-vies" id="ccVies">${text}${when} <button type="button" class="btn small outline" data-action="adm.vies" data-id="${esc(a.id)}">${f("check")}</button></p>`;
}
actions.on("adm.vies", async (el) => {
  try {
    await api(`/admin/applications/${encodeURIComponent(el.dataset.id)}/vies`, { method: "POST" });
    await reviewApplication(el.dataset.id);
    tToast(t("adm.vies.done"));
  } catch (e) {
    toast(e.message);
  }
});
actions.on("adm.vet", async (el) => {
  const status = el.dataset.status,
    fd = new FormData(document.getElementById("ccVettingReview")),
    checks = Object.fromEntries(AD_CHECKS.map((key) => [key, fd.get("check_" + key)]));
  const body = {
    stage: fd.get("stage"),
    badge: fd.get("badge"),
    verification: { checks, riskLevel: fd.get("riskLevel"), riskNotes: fd.get("riskNotes"), referenceOutcome: fd.get("referenceOutcome") },
    decisionNote: fd.get("decisionNote"),
  };
  if (status) body.status = status;
  try {
    await api(`/admin/applications/${encodeURIComponent(el.dataset.id)}`, { method: "PATCH", body });
    closeModal();
    tToast(t("adm.file.done." + (status || "saved").replace(" ", "")));
    adminApplications();
  } catch (e) {
    document.getElementById("ccVettingError").textContent = e.message;
  }
});
/* Evidence files need the session cookie, so they open in an inline preview with open-in-tab and download */
actions.on("adm.firstEvidence", () => {
  const first = document.querySelector(".ff-evidence-file");
  first?.scrollIntoView({ behavior: "smooth", block: "center" });
  first?.click();
});
actions.on("adm.evidence", async (btn) => {
  const box = document.getElementById("ffEvidencePreview");
  if (!box) return;
  const f = (key) => adk("file." + key);
  document.querySelectorAll(".ff-evidence-file").forEach((x) => x.classList.toggle("active", x === btn));
  box.hidden = false;
  box.innerHTML = `<p class="subtle">${f("loading")}</p>`;
  try {
    const r = await fetch(btn.dataset.url, { credentials: "same-origin" });
    if (!r.ok) throw new Error(t("adm.file.openFailed"));
    const blob = await r.blob();
    if (box.dataset.objectUrl) URL.revokeObjectURL(box.dataset.objectUrl);
    const url = URL.createObjectURL(blob),
      name = btn.dataset.url.split("/").pop();
    box.dataset.objectUrl = url;
    box.innerHTML = `<div class="ff-evidence-bar"><b>${esc(btn.dataset.name)}</b><span><a class="btn small outline" href="${url}" target="_blank" rel="noopener">${f("openTab")}</a><a class="btn small outline" href="${url}" download="${esc(
      name,
    )}">${f("download")}</a><button type="button" class="btn small ghost" data-action="adm.closeEvidence">${f("close")}</button></span></div>${
      blob.type.startsWith("image/") ? `<img src="${url}" alt="${esc(btn.dataset.name)}">` : `<iframe src="${url}" title="${esc(btn.dataset.name)}"></iframe>`
    }`;
    box.scrollIntoView({ behavior: "smooth", block: "nearest" });
  } catch (e) {
    box.innerHTML = `<p class="danger-text">${esc(e.message)}</p>`;
  }
});
actions.on("adm.closeEvidence", () => {
  const box = document.getElementById("ffEvidencePreview");
  if (!box) return;
  if (box.dataset.objectUrl) URL.revokeObjectURL(box.dataset.objectUrl);
  box.hidden = true;
  box.innerHTML = "";
  document.querySelectorAll(".ff-evidence-file").forEach((x) => x.classList.remove("active"));
});

/* ---------- Profile changes awaiting re-verification (T86) ---------- */
async function adminProfileChanges() {
  const { changes = [] } = await api("/admin/profile-changes").catch(() => ({}));
  const f = (key, params) => adk("changes." + key, params);
  const card = (c) => {
    const p = c.proposed,
      cur = c.current,
      fields = [
        p.company ? ["company", cur.company, p.company] : null,
        p.companyProfile?.legalName ? ["legalName", cur.companyProfile.legalName || "—", p.companyProfile.legalName] : null,
        p.companyProfile?.address ? ["address", cur.companyProfile.address || "—", p.companyProfile.address] : null,
        p.companyProfile?.taxId ? ["taxId", cur.companyProfile.taxId || "—", p.companyProfile.taxId] : null,
        p.certifications ? ["certifications", cur.certifications.join(", ") || "—", p.certifications.join(", ") || "—"] : null,
      ].filter(Boolean);
    return `<article class="panel rz-card"><div class="panel-title"><h3>${esc(c.company)}</h3><small>${f("submitted", { date: fmt.date(p.submittedAt) })}</small></div><table class="cc-table rz-diff"><thead><tr><th>${f("field")}</th><th>${f(
      "current",
    )}</th><th>${f("proposed")}</th></tr></thead><tbody>${fields.map(([k, was, now]) => `<tr><td>${f("f." + k)}</td><td>${esc(was)}</td><td><b>${esc(now)}</b></td></tr>`).join("")}</tbody></table><div class="cc-actions"><button class="btn small success" data-action="adm.change" data-id="${esc(
      c.supplierId,
    )}" data-decision="Approve">${f("approve")}</button><button class="btn small danger" data-action="adm.change" data-id="${esc(c.supplierId)}" data-decision="Reject">${f("reject")}</button></div></article>`;
  };
  app.innerHTML = dashboardShell(
    "admin",
    "profile-changes",
    [
      `<div class="dash-top"><div><h1>${f("title")}</h1><p>${f("lead")}</p></div></div>`,
      `<div class="rz-list">${changes.map(card).join("") || `<div class="empty">${f("none")}</div>`}</div>`,
    ]
      .join(""),
  );
}
actions.on("adm.change", async (el) => {
  const action = el.dataset.decision;
  let note = "";
  if (action === "Reject") {
    note = await uiPrompt(t("adm.changes.rejectPrompt"), "", { required: true });
    if (note === null) return;
  } else if (!(await uiConfirm(t("adm.changes.approveConfirm"), { danger: false }))) return;
  try {
    await api(`/admin/profile-changes/${encodeURIComponent(el.dataset.id)}`, { method: "PATCH", body: { action, note } });
    tToast(t(action === "Approve" ? "adm.changes.approved" : "adm.changes.rejected"));
    adminProfileChanges();
  } catch (x) {
    toast(x.message);
  }
});

/* ---------- Users, badges, access and pending deletions ---------- */
async function adminUsers() {
  // T190: the same "Level" filter as the directory, with the counts per level
  const level = new URLSearchParams(location.hash.split("?")[1] || "").get("level") || "",
    [{ users = [] }, { suppliers = [], levels = {} }] = await Promise.all([api("/admin/users"), api("/admin/suppliers" + (level ? "?level=" + encodeURIComponent(level) : ""))]),
    f = (key, params) => adk("users." + key, params),
    pending = users.filter((u) => u.deleteAfter && u.status !== "Deleted");
  const supplierRow = (s) => {
    const account = users.find((u) => u.supplierId === s.id);
    return `<tr><td><b>${esc(s.company)}</b><small>${f(s.live ? "live" : "notLive")} · ${esc(t("dir.level.short." + (s.level || (s.live ? "vetted" : "registered"))))}</small></td><td>${s.location ? adDom(s.location) : "—"}</td><td>${account ? esc(account.email) : f("noAccount")}</td><td>${esc(
      ccBadge(s),
    )}</td><td><select aria-label="${f("badgeFor", { company: s.company })}" data-action="adm.badge" data-id="${esc(s.id)}">${["None", "Bronze", "Silver", "Gold"]
      .map((x) => `<option value="${x}" ${x === (s.badge || "None") ? "selected" : ""}>${x === "None" ? f("noBadge") : esc(t("common.badge." + x))}</option>`)
      .join("")}</select></td></tr>`;
  };
  const accountRow = (u) => {
    const status = u.status || "Active",
      active = status === "Active";
    return `<tr><td><b>${esc(u.name)}</b></td><td>${esc(u.email)}</td><td><span class="tag">${adValue("role", u.role)}</span></td><td>${esc(u.company || "—")}</td><td><span class="status ${active ? "completed" : "rejected"}">${adValue(
      "access",
      status,
    )}</span></td><td>${
      u.id === state.user.id
        ? `<small>${f("currentAdmin")}</small>`
        : `<button class="btn small ${active ? "danger" : "success"}" data-action="adm.access" data-id="${esc(u.id)}" data-status="${active ? "Suspended" : "Active"}">${f(active ? "suspend" : "reactivate")}</button><button class="btn small outline legal-reset" data-action="adm.reset" data-id="${esc(
            u.id,
          )}" data-email="${esc(u.email)}">${f("reset")}</button>`
    }</td></tr>`;
  };
  const deletionRow = (u) =>
    `<tr><td><b>${esc(u.name)}</b>${u.deletionViaOwner ? `<small>${f("viaOwner")}</small>` : ""}</td><td>${esc(u.email)}</td><td><span class="tag">${adValue("role", u.role)}</span></td><td>${esc(fmt.date(u.deletionRequestedAt))}</td><td>${esc(
      fmt.date(u.deleteAfter),
    )}</td></tr>`;
  app.innerHTML = dashboardShell(
    "admin",
    "users",
    [
      `<div class="dash-top"><div><h1>${f("title")}</h1><p>${f("lead")}</p></div></div>`,
      `<section class="panel"><div class="panel-title"><h3>${f("badges")}</h3><span>${esc(t.plural("adm.users.suppliers", suppliers.length))}</span></div><label class="cc-inline-filter">${f("level")} <select data-action="adm.level"><option value="">${f("allLevels")}</option>${["listed", "registered", "vetted"]
        .map((l) => `<option value="${l}"${l === level ? " selected" : ""}>${esc(f("levelOption", { label: t("dir.level.short." + l), n: levels[l] || 0 }))}</option>`)
        .join("")}</select></label><div class="cc-table-wrap"><table class="cc-table"><thead><tr><th>${f("supplier")}</th><th>${f(
        "location",
      )}</th><th>${f("account")}</th><th>${f("currentBadge")}</th><th>${f("changeBadge")}</th></tr></thead><tbody>${suppliers.map(supplierRow).join("") || `<tr><td colspan="5">${f("noSuppliers")}</td></tr>`}</tbody></table></div></section>`,
      `<section class="panel" id="gdPending"><div class="panel-title"><h3>${f("deletions")}</h3><span>${pending.length}</span></div>${
        pending.length
          ? `<div class="cc-table-wrap"><table class="cc-table"><thead><tr><th>${f("name")}</th><th>${f("email")}</th><th>${f("role")}</th><th>${f("requested")}</th><th>${f("deletedOn")}</th></tr></thead><tbody>${pending
              .map(deletionRow)
              .join("")}</tbody></table></div>`
          : `<p class="pa-empty">${f("noDeletions")}</p>`
      }<p class="subtle">${f("deletionsNote")}</p></section>`,
      `<section class="panel"><div class="panel-title"><h3>${f("accounts")}</h3><span>${esc(t.plural("adm.users.count", users.length))}</span></div><div class="cc-table-wrap"><table class="cc-table"><thead><tr><th>${f("name")}</th><th>${f(
        "email",
      )}</th><th>${f("role")}</th><th>${f("company")}</th><th>${f("access")}</th><th></th></tr></thead><tbody>${users.map(accountRow).join("")}</tbody></table></div><p class="subtle">${f("suspendNote")}</p></section>`,
    ]
      .join(""),
  );
}
actions.on("adm.level", (sel) => {
  location.hash = "#/admin/users" + (sel.value ? "?level=" + encodeURIComponent(sel.value) : "");
});
actions.on("adm.badge", async (sel) => {
  try {
    await api(`/admin/suppliers/${encodeURIComponent(sel.dataset.id)}/badge`, { method: "PATCH", body: { badge: sel.value } });
    tToast(t("adm.users.badgeSet", { badge: sel.value === "None" ? t("adm.users.noBadge") : t("common.badge." + sel.value) }));
  } catch (e) {
    toast(e.message, "error");
    route();
  }
});
actions.on("adm.access", async (el) => {
  const status = el.dataset.status;
  if (!(await uiConfirm(t(status === "Suspended" ? "adm.users.suspendConfirm" : "adm.users.reactivateConfirm")))) return;
  try {
    await api(`/admin/users/${encodeURIComponent(el.dataset.id)}`, { method: "PATCH", body: { status } });
    tToast(t(status === "Suspended" ? "adm.users.suspended" : "adm.users.reactivated"));
    adminUsers();
  } catch (e) {
    toast(e.message, "error");
  }
});
actions.on("adm.reset", async (el) => {
  const email = el.dataset.email;
  if (!(await uiConfirm(t("adm.reset.confirm", { email })))) return;
  try {
    const { temporaryPassword } = await api(`/admin/users/${encodeURIComponent(el.dataset.id)}/reset-password`, { method: "POST", body: {} });
    const f = (key, params) => adk("reset." + key, params);
    modal(
      t("adm.reset.title"),
      `<div><p>${tHtml("adm.reset.give", { email: `<b>${esc(email)}</b>` })}</p><div class="legal-temp"><code id="legalTemp">${esc(temporaryPassword)}</code><button type="button" class="btn small outline" data-action="adm.copy">${f(
        "copy",
      )}</button></div><p class="subtle">${f("next")}</p><button class="btn primary" data-action="adm.done">${f("done")}</button></div>`,
    );
  } catch (x) {
    toast(x.message, "error");
  }
});
actions.on("adm.copy", () => navigator.clipboard.writeText(document.getElementById("legalTemp").textContent).then(() => tToast(t("adm.reset.copied"))));
actions.on("adm.done", () => closeModal());

routes.add("/admin/applications", adminApplications);
routes.add("/admin/profile-changes", adminProfileChanges);
routes.add("/admin/users", adminUsers);

/* ---------- Billing: payments, fees and supplier payouts (T134b) ---------- */
const AD_INVOICE_TONE = { Paid: "completed", Refunded: "rejected", Rejected: "rejected" };
async function adminBilling() {
  const [{ invoices = [] }, { settings }] = await Promise.all([api("/invoices"), api("/admin/settings")]),
    f = (key, params) => adk("billing." + key, params),
    rate = Number(settings.platformFeePercent) || 0,
    sum = (list, value = (i) => i.amount) => list.reduce((n, i) => n + Number(value(i) || 0), 0),
    paid = invoices.filter((i) => i.status === "Paid"),
    refunded = invoices.filter((i) => i.status === "Refunded"),
    scheduled = invoices.filter((i) => i.status === "Approved"),
    money = (n) => esc(fmt.money(n)),
    card = (label, value) => `<div class="cc-card"><span class="cc-label">${label}</span><b>${value}</b></div>`;
  const row = (i) => {
    const fee = Number(i.payment?.platformFee ?? (i.amount * rate) / 100),
      payout = Number(i.payment?.supplierPayout ?? i.amount - fee);
    return `<tr><td><b>${esc(invNo(i))}</b><small>${esc(fmt.date(i.createdAt))}</small></td><td>${esc(i.projectName || i.projectId)}<small>${i.supplierCompany ? esc(i.supplierCompany) : f("supplier")}</small></td><td>${money(
      i.amount,
    )}</td><td>${money(fee)} · ${money(payout)}<small>${f("rate", { n: rate })}</small></td><td><span class="status ${AD_INVOICE_TONE[i.status] || "submitted"}">${adValue("invStatus", i.status)}</span>${
      i.status === "Approved" && i.overdue ? ` <span class="status overdue">${inDaysLate(i.scheduledPayment)}</span>` : ""
    }<small>${i.payment?.status ? adValue("payStatus", i.payment.status) : f("noPayout")}</small></td><td>${
      i.status === "Approved" ? `<button class="btn small success" data-action="adm.paid" data-id="${esc(i.id)}">${f("recordPaid")}</button>` : ""
    }${i.status === "Paid" ? `<button class="btn small danger" data-action="adm.refund" data-id="${esc(i.id)}">${f("recordRefund")}</button>` : ""}</td></tr>`;
  };
  app.innerHTML = dashboardShell(
    "admin",
    "billing",
    [
      `<div class="dash-top"><div><h1>${f("title")}</h1><p>${f("lead")}</p></div></div>`,
      `<div class="wf-stat-grid">${card(f("volume"), money(sum(invoices)))}${card(f("awaiting"), money(sum(scheduled)))}${card(
        f("paidOut"),
        money(sum(paid, (i) => i.payment?.supplierPayout ?? i.amount * (1 - rate / 100))),
      )}${card(f("fee", { n: rate }), money(sum(invoices.filter((i) => ["Approved", "Paid", "Refunded"].includes(i.status)), (i) => i.payment?.platformFee ?? (i.amount * rate) / 100)))}</div>`,
      `<section class="panel"><div class="cc-table-wrap"><table class="cc-table"><thead><tr><th>${f("invoice")}</th><th>${f("projectSupplier")}</th><th>${f("gross")}</th><th>${f("feePayout")}</th><th>${f("status")}</th><th>${f(
        "actions",
      )}</th></tr></thead><tbody>${invoices.map(row).join("") || `<tr><td colspan="6">${f("none")}</td></tr>`}</tbody></table></div></section>`,
      `<section class="panel"><h3>${f("refunds")}</h3><p>${f("refundsLead")}</p><a class="btn outline" href="#/admin/disputes">${f("openDisputes")}</a>${
        refunded.length ? `<p>${esc(t.plural("adm.billing.refunded", refunded.length, { amount: fmt.money(sum(refunded)) }))}</p>` : ""
      }</section>`,
    ]
      .join(""),
  );
}
actions.on("adm.paid", async (el) => {
  try {
    await api(`/admin/invoices/${encodeURIComponent(el.dataset.id)}`, { method: "PATCH", body: { action: "Mark Paid" } });
    tToast(t("adm.billing.paid"));
    adminBilling();
  } catch (e) {
    toast(e.message, "error");
  }
});
actions.on("adm.refund", async (el) => {
  const reason = await uiPrompt(t("adm.billing.refundPrompt"));
  if (!reason?.trim()) return;
  try {
    await api(`/admin/invoices/${encodeURIComponent(el.dataset.id)}`, { method: "PATCH", body: { action: "Refund", reason } });
    tToast(t("adm.billing.refundDone"));
    adminBilling();
  } catch (e) {
    toast(e.message, "error");
  }
});

/* ---------- Escalations and support ---------- */
async function adminDisputes() {
  const { disputes = [] } = await api("/disputes"),
    f = (key) => adk("disputes." + key);
  const card = (x) =>
    `<article class="cc-card"><div style="display:flex;justify-content:space-between"><b>${
      typeof ccLookup("en", "dlg.support.types." + x.type) === "string" ? esc(t("dlg.support.types." + x.type)) : statusHtml(x.type)
    }</b><span class="tag ${x.status === "Open" ? "orange" : "green"}">${adValue("disputeStatus", x.status)}</span></div><p>${esc(x.description)}</p><small>${esc(x.projectId)} · ${esc(fmt.date(x.createdAt))}</small>${
      x.status === "Open" ? `<div class="cc-actions" style="margin-top:12px"><button class="btn small success" data-action="adm.resolve" data-id="${esc(x.id)}">${f("resolve")}</button></div>` : ""
    }</article>`;
  app.innerHTML = dashboardShell(
    "admin",
    "disputes",
    [`<div class="dash-top"><div><h1>${f("title")}</h1><p>${f("lead")}</p></div></div>`, `<div class="cc-grid">${disputes.map(card).join("") || `<div class="empty">${f("none")}</div>`}</div>`].join(""),
  );
}
actions.on("adm.resolve", async (el) => {
  const resolution = await uiPrompt(t("adm.disputes.prompt"));
  if (!resolution) return;
  try {
    await api(`/admin/disputes/${encodeURIComponent(el.dataset.id)}`, { method: "PATCH", body: { status: "Resolved", resolution } });
    tToast(t("adm.disputes.resolved"));
    adminDisputes();
  } catch (e) {
    toast(e.message, "error");
  }
});

/* ---------- Reports and analytics: metrics, trend charts, performance tables, backups, scorecards ---------- */
let adReportData = {};
async function adminReports() {
  const [{ metrics: m }, { projects = [] }, { invoices = [] }, { users = [] }, { suppliers = [] }, { applications = [] }, { scorecards = [] }] = await Promise.all([
    api("/admin/metrics"),
    api("/projects"),
    api("/invoices"),
    api("/admin/users"),
    api("/admin/suppliers"),
    api("/admin/applications"),
    api("/scorecards").catch(() => ({})),
  ]);
  const f = (key, params) => adk("reports." + key, params),
    money = (n) => esc(fmt.money(n)),
    sum = (list) => list.reduce((a, i) => a + Number(i.amount || 0), 0),
    today = paToday(),
    approvedInv = invoices.filter((i) => ["Approved", "Paid"].includes(i.status));
  const items = paWorkItems(projects).concat(
    projects.filter((p) => p.status === "Completed").flatMap((p) => (p.phases || []).flatMap((ph) => (ph.tasks || []).map((t) => ({ p, ph, t, status: t.status, dueDate: t.dueDate })))),
  );
  const completed = items.filter((x) => x.status === "Completed").length,
    overdue = items.filter((x) => x.status !== "Completed" && x.dueDate && x.dueDate < today).length,
    onTime = completed + overdue ? Math.round((completed / (completed + overdue)) * 100) : 100;
  const supplierRows = suppliers
    .filter((s) => s.live)
    .map((s) => {
      const mine = items.filter((x) => x.t?.assignedSupplierId === s.id || (!x.t && x.ph.supplierId === s.id)),
        inv = invoices.filter((i) => i.supplierId === s.id);
      return {
        s,
        assigned: mine.length,
        done: mine.filter((x) => x.status === "Completed").length,
        late: mine.filter((x) => x.status !== "Completed" && x.dueDate < today).length,
        invoiced: sum(inv),
        approved: sum(inv.filter((i) => ["Approved", "Paid"].includes(i.status))),
      };
    })
    .filter((r) => r.assigned || r.invoiced)
    .sort((a, b) => b.invoiced - a.invoiced)
    .slice(0, 12);
  const customerRows = users
    .filter((u) => u.role === "customer")
    .map((u) => {
      const ps = projects.filter((p) => p.customerId === u.id),
        inv = invoices.filter((i) => i.customerId === u.id);
      return { u, projects: ps.length, active: ps.filter((p) => p.status === "In Progress").length, budget: ps.reduce((a, p) => a + Number(p.budget || 0), 0), invoiced: sum(inv), approved: sum(inv.filter((i) => ["Approved", "Paid"].includes(i.status))) };
    })
    .filter((r) => r.projects)
    .sort((a, b) => b.budget - a.budget);
  const months = paMonths(6).map((mo) => {
    const inMonth = invoices.filter((i) => String(i.createdAt).slice(0, 7) === mo);
    return { m: mo, invoiced: sum(inMonth), approved: sum(inMonth.filter((i) => ["Approved", "Paid"].includes(i.status))), paid: sum(inMonth.filter((i) => i.status === "Paid")), count: inMonth.length };
  });
  adReportData = { supplierRows, customerRows, months };
  // Trend charts over 12 months and the vetting funnel
  const months12 = inMonths(12),
    inMonth = (d, mo) => String(d).slice(0, 7) === mo,
    funnel = [
      ["received", applications.length],
      ["verifying", applications.filter((a) => ["Verified", "References", "Manual Review", "Decision & Badge"].includes(a.stage) || a.status === "Approved").length],
      ["approved", applications.filter((a) => a.status === "Approved").length],
    ];
  const charts = `<div class="in-grid in-admin-charts"><section class="panel in-wide"><div class="panel-title"><h3>${f("volumeChart")}</h3></div>${inBars(months12, [
    { label: t("adm.reports.invoiced"), color: "#93c5fd", values: months12.map((mo) => inSum(invoices.filter((i) => inMonth(i.createdAt, mo)))) },
    { label: t("adm.reports.paid"), color: "#2563eb", values: months12.map((mo) => inSum(invoices.filter((i) => i.status === "Paid" && inMonth(i.paymentDate || i.updatedAt, mo)))) },
  ], (v) => fmt.money(v))}</section><section class="panel"><div class="panel-title"><h3>${f("accountsChart")}</h3></div>${inBars(
    months12,
    ["customer", "supplier"].map((role, n) => ({ label: t("adm.reports." + role + "s"), color: n ? "#8b5cf6" : "#14b8a6", values: months12.map((mo) => users.filter((u) => u.role === role && inMonth(u.createdAt, mo)).length) })),
    (v) => v,
  )}</section><section class="panel"><div class="panel-title"><h3>${f("funnel")}</h3></div>${inHBars(
    funnel.map(([key, value], i) => ({ label: t("adm.reports.funnelStep." + key), values: [{ label: t("adm.reports.funnelStep." + key), value, color: IN_COLORS[i] }] })),
    (v) => v,
  )}<p class="pa-note">${f("funnelNote", {
    pct: inPct(funnel[2][1], funnel[0][1]),
    rejected: applications.filter((a) => a.status === "Rejected").length,
    hold: applications.filter((a) => a.status === "On Hold").length,
  })}</p></section></div>`;
  const kpi = (label, value, sub) => `<div class="cc-card"><span class="cc-label">${label}</span><div class="cc-kpi">${value}</div>${sub === undefined ? "" : `<small>${sub}</small>`}</div>`,
    exportBtn = (kind) => `<button class="btn small outline" data-action="adm.export" data-kind="${kind}">${f("export")}</button>`,
    table = (title, kind, heads, rows, empty) =>
      `<section class="panel"><div class="panel-title"><h3>${f(title)}</h3>${exportBtn(kind)}</div><div class="cc-table-wrap"><table class="cc-table pa-table"><thead><tr>${heads.map((h) => `<th>${f("col." + h)}</th>`).join("")}</tr></thead><tbody>${
        rows || `<tr><td colspan="${heads.length}">${f(empty)}</td></tr>`
      }</tbody></table></div></section>`;
  const statusCounts = ["In Progress", "On Hold", "Completed"].map((s) => f("projectState." + s.replace(" ", ""), { n: projects.filter((p) => p.status === s).length })).join(" · ");
  const performance = `<section class="pa-reports"><div class="cc-grid4 pa-kpis">${kpi(f("onTime"), `${onTime}%`, f("onTimeSub", { done: completed, late: overdue }))}${kpi(
    f("budget"),
    money(projects.reduce((a, p) => a + Number(p.budget || 0), 0)),
    statusCounts,
  )}${kpi(f("approvedValue"), money(sum(approvedInv)), f("paidSub", { amount: fmt.money(sum(invoices.filter((i) => i.status === "Paid"))) }))}${kpi(
    f("approvalRate"),
    `${invoices.length ? Math.round((approvedInv.length / invoices.length) * 100) : 0}%`,
    f("returnedSub", { n: invoices.filter((i) => ["Rejected", "Changes Requested"].includes(i.status)).length }),
  )}</div>${table(
    "financial",
    "months",
    ["month", "invoices", "invoiced", "approved", "paid"],
    months.map((x) => `<tr><td>${esc(new Date(x.m + "-01").toLocaleDateString(fmt.locale(), { month: "long", year: "numeric" }))}</td><td>${x.count}</td><td>${money(x.invoiced)}</td><td>${money(x.approved)}</td><td>${money(x.paid)}</td></tr>`).join(""),
  )}${table(
    "suppliersTitle",
    "suppliers",
    ["supplier", "badge", "rating", "items", "completed", "overdue", "invoiced", "approved"],
    supplierRows
      .map(
        (r) =>
          `<tr><td><b>${esc(r.s.company)}</b></td><td>${esc(ccBadge(r.s))}</td><td>★ ${esc(fmt.number(r.s.rating || 0, 1))}</td><td>${r.assigned}</td><td>${r.done}</td><td class="${r.late ? "danger-text" : ""}">${r.late}</td><td>${money(r.invoiced)}</td><td>${money(r.approved)}</td></tr>`,
      )
      .join(""),
    "noSuppliers",
  )}${table(
    "customersTitle",
    "customers",
    ["customer", "projects", "active", "budget", "invoiced", "approved"],
    customerRows
      .map((r) => `<tr><td><b>${esc(r.u.company || r.u.name)}</b><small>${esc(r.u.email)}</small></td><td>${r.projects}</td><td>${r.active}</td><td>${money(r.budget)}</td><td>${money(r.invoiced)}</td><td>${money(r.approved)}</td></tr>`)
      .join(""),
    "noCustomers",
  )}</section>`;
  app.innerHTML = dashboardShell(
    "admin",
    "reports",
    [
      `<div class="dash-top"><div><h1>${f("title")}</h1><p>${f("lead")}</p></div></div>`,
      `<div class="cc-grid4">${kpi(f("users"), m.users)}${kpi(f("liveSuppliers"), m.suppliers)}${kpi(f("projects"), m.projects)}${kpi(f("gross"), money(m.grossVolume))}</div>`,
      charts,
      performance,
      `<div class="cc-card" style="margin-top:15px"><h3>${f("backup")}</h3><p>${f("backupLead")}</p><button class="btn outline" data-action="adm.backup">${f("exportJson")}</button><label class="btn outline">${f(
        "importJson",
      )}<input type="file" hidden accept="application/json" data-action="adm.import"></label></div>`,
      `<section class="panel sr-admin-cards"><div class="panel-title"><h3>${f("scorecards")}</h3><span class="ui-count">${scorecards.length}</span></div>${srScorecardTable(scorecards)}</section>`,
    ]
      .join(""),
  );
}
// CSV with a BOM and ";" so Excel opens it with umlauts and columns; the headers in the user's language
actions.on("adm.export", (el) => {
  const kind = el.dataset.kind,
    d = adReportData,
    h = (keys) => keys.map((k) => t("adm.reports.col." + k)),
    quote = (v) => `"${String(v ?? "").replaceAll('"', '""')}"`;
  const rows =
    kind === "months"
      ? [h(["month", "invoices", "invoiced", "approved", "paid"]), ...(d.months || []).map((x) => [x.m, x.count, x.invoiced, x.approved, x.paid])]
      : kind === "suppliers"
        ? [h(["supplier", "badge", "rating", "items", "completed", "overdue", "invoiced", "approved"]), ...(d.supplierRows || []).map((r) => [r.s.company, r.s.badge, r.s.rating, r.assigned, r.done, r.late, r.invoiced, r.approved])]
        : [h(["customer", "email", "projects", "active", "budget", "invoiced", "approved"]), ...(d.customerRows || []).map((r) => [r.u.company || r.u.name, r.u.email, r.projects, r.active, r.budget, r.invoiced, r.approved])];
  const a = document.createElement("a");
  a.href = URL.createObjectURL(new Blob(["﻿" + rows.map((r) => r.map(quote).join(";")).join("\r\n")], { type: "text/csv;charset=utf-8" }));
  a.download = `craftcrew-${kind}-report.csv`;
  a.click();
  setTimeout(() => URL.revokeObjectURL(a.href), 5000);
});
actions.on("adm.backup", async () => {
  const d = await api("/backup/export"),
    a = document.createElement("a");
  a.href = URL.createObjectURL(new Blob([JSON.stringify(d, null, 2)], { type: "application/json" }));
  a.download = "craftcrew-backup.json";
  a.click();
  setTimeout(() => URL.revokeObjectURL(a.href), 5000);
});
actions.on("adm.import", async (input) => {
  const file = input.files[0];
  if (!file) return;
  try {
    const data = JSON.parse(await file.text()),
      backup = data.data || data,
      n = (k) => (Array.isArray(backup[k]) ? backup[k].length : 0);
    const ok = await uiDialog({
      title: t("adm.reports.importTitle"),
      message: t("adm.reports.importText", { users: n("users"), projects: n("projects"), invoices: n("invoices"), suppliers: n("suppliers") }),
      confirmLabel: t("adm.reports.importConfirm"),
      danger: true,
    });
    input.value = "";
    if (!ok) return;
    await api("/backup/import", { method: "POST", body: { data: backup } });
    tToast(t("adm.reports.imported"));
    adminReports();
  } catch (e) {
    toast(e.message, "error");
  }
});

/* ---------- Audit log ---------- */
async function adminAudit() {
  const q = new URLSearchParams(location.hash.split("?")[1] || ""),
    params = new URLSearchParams(),
    f = (key, params) => adk("audit." + key, params);
  for (const k of ["q", "role", "projectId"]) if (q.get(k)) params.set(k, q.get(k));
  const [{ entries = [], total = 0 }, { projects = [] }] = await Promise.all([api("/audit?" + params), api("/projects")]);
  const opt = (value, label, on) => `<option value="${esc(value)}" ${on ? "selected" : ""}>${label}</option>`,
    row = (e) =>
      `<tr><td>${esc(paTime(e.at))}</td><td><b>${esc(e.actorName)}</b><small>${e.actorRole ? adValue("role", e.actorRole) : ""} · ${esc(e.actorEmail)}</small></td><td>${`<bdi>${esc(auditText(e.action))}</bdi>`}${e.status ? `<small>${statusHtml(e.status)}</small>` : ""}</td><td>${e.projectName ? adDom(e.projectName) : "—"}</td><td><small>${esc(e.entityId)}</small></td></tr>`;
  app.innerHTML = dashboardShell(
    "admin",
    "audit",
    [
      `<div class="dash-top"><div><div class="eyebrow">${f("eyebrow")}</div><h1>${f("title")}</h1><p>${f("lead")}</p></div></div>`,
      `<form class="panel pa-filters" id="paAuditFilters" data-action="adm.auditFilter"><label>${f("search")}<input name="q" value="${esc(q.get("q") || "")}" placeholder="${f("searchHint")}"></label><label>${f("role")}<select name="role">${opt(
        "",
        f("allRoles"),
      )}${["customer", "supplier", "admin", "public"].map((r) => opt(r, f("roles." + r), q.get("role") === r)).join("")}</select></label><label>${f("project")}<select name="projectId">${opt("", f("allProjects"))}${projects
        .map((p) => opt(p.id, esc(p.name), q.get("projectId") === p.id))
        .join("")}</select></label><div class="pa-filter-actions"><button class="btn primary">${f("apply")}</button><a class="btn outline" href="#/admin/audit">${f("reset")}</a></div></form>`,
      `<section class="panel"><div class="panel-title"><h3>${esc(t.plural("adm.audit.count", total))}</h3><small class="subtle">${f("latest", { n: Math.min(500, total) })}</small></div><div class="cc-table-wrap"><table class="cc-table pa-table"><thead><tr><th>${f(
        "when",
      )}</th><th>${f("who")}</th><th>${f("action")}</th><th>${f("project")}</th><th>${f("record")}</th></tr></thead><tbody>${entries.map(row).join("") || `<tr><td colspan="5">${f("none")}</td></tr>`}</tbody></table></div></section>`,
    ]
      .join(""),
  );
}
actions.on("adm.auditFilter", (form) => {
  const f = new URLSearchParams();
  for (const [k, v] of new FormData(form)) if (v) f.set(k, v);
  navigate("/admin/audit?" + f);
});

/* ---------- Platform management: settings, email outbox and test email, legal pages ---------- */
async function adminPlatform() {
  const [{ settings: s }, { emails = [] }, legal, cl = {}, { introductions = [] }] = await Promise.all([
      api("/admin/settings"),
      api("/admin/outbox").catch(() => ({})),
      legalContent(),
      api("/admin/clause").catch(() => ({})),
      api("/admin/introductions").catch(() => ({})),
    ]),
    f = (key, params) => adk("platform." + key, params),
    num = (v, fallback = 0) => Number(v) || fallback;
  const tier = (k) =>
    `<fieldset><legend>${esc(t("common.badge." + k[0].toUpperCase() + k.slice(1)))}</legend><label>${f("projectsDone")}<input type="number" min="0" name="${k}Projects" value="${num(s.badgeCriteria?.[k]?.projects)}"></label><label>${f(
      "minRating",
    )}<input type="number" min="0" max="5" step="0.1" name="${k}Rating" value="${num(s.badgeCriteria?.[k]?.rating)}"></label></fieldset>`;
  const templateLabel = (k) => (typeof ccLookup("en", "adm.platform.templates." + k) === "string" ? f("templates." + k) : esc(k.replaceAll(/([A-Z])/g, " $1")));
  // T255: the served area. Empty means everywhere; the placeholder is only an example until the region is decided
  const served = new Set(s.servedCategories || []);
  const servedPanel = `<section class="panel cc-served-area"><div class="panel-title"><h3>${f("served.title")}</h3><small>${f("served.hint")}</small></div><label>${f(
    "served.regions",
  )}<input name="servedRegions" value="${esc((s.servedRegions || []).join(", "))}" placeholder="${f("served.regionsPlaceholder")}" maxlength="700"></label><fieldset><legend>${f("served.categories")}</legend>${s.serviceCategories
    .map((c) => `<label class="cc-check-label"><input type="checkbox" name="servedCategories" value="${esc(c)}"${served.has(c) ? " checked" : ""}> <bdi>${esc(c)}</bdi></label>`)
    .join("")}</fieldset><p class="subtle">${f("served.placeholderNote")}</p></section>`;
  const settings = `<form id="ccPlatformSettings" class="cc-platform-settings" data-action="adm.saveSettings"><section class="panel"><div class="panel-title"><h3>${f("categories")}</h3><small>${f(
    "categoriesHint",
  )}</small></div><textarea name="serviceCategories" rows="7" required aria-label="${f("categoriesLabel")}">${esc(s.serviceCategories.join("\n"))}</textarea></section>${servedPanel}<section class="panel"><div class="panel-title"><h3>${f(
    "badges",
  )}</h3><small>${f("badgesHint")}</small></div><div class="cc-badge-criteria">${["bronze", "silver", "gold"].map(tier).join("")}</div></section><section class="panel"><div class="panel-title"><h3>${f(
    "system",
  )}</h3></div><div class="cc-platform-grid"><label>${f("supportEmail")}<input type="email" name="supportEmail" value="${esc(s.supportEmail)}" required></label><label>${f(
    "feePercent",
  )}<input type="number" name="platformFeePercent" min="0" max="25" step="0.1" value="${num(s.platformFeePercent)}" required></label><label>${f("paymentDays")}<input type="number" name="defaultPaymentTermsDays" min="0" max="180" value="${num(
    s.defaultPaymentTermsDays,
  )}" required></label><label>${f("uploadLimit")}<input type="number" name="uploadLimitMb" min="1" max="5" value="${num(s.uploadLimitMb, 5)}" required></label><label>${f("markup")}<input type="number" name="brokerMarkupPercent" min="0" max="30" step="0.5" value="${num(s.brokerMarkupPercent)}"><small>${f("markupHint")}</small></label><label>${f("supplierDays")}<input type="number" name="supplierDays" min="1" max="10" step="1" value="${num(s.supplierDays, 3)}"><small>${f("supplierDaysHint")}</small></label><label class="cc-check-label"><input type="checkbox" name="autoConfirm"${s.autoConfirm === true ? " checked" : ""}> ${f("autoConfirm")}</label><small class="subtle">${f("autoConfirmHint")}</small><label class="cc-check-label"><input type="checkbox" name="instantEstimates"${s.instantEstimates === false ? "" : " checked"}> ${f("instantEstimates")}</label><label class="cc-check-label"><input type="checkbox" name="autoSuggest"${
    s.autoSuggest === false ? "" : " checked"
  }> ${f("autoSuggest")}</label></div></section><section class="panel"><div class="panel-title"><h3>${f(
    "faq",
  )}</h3><small>${f("faqHint")}</small></div><textarea name="faqContent" rows="6" maxlength="10000" placeholder="${f("faqPlaceholder")}">${esc(s.faqContent || "")}</textarea></section><section class="panel"><div class="panel-title"><h3>${f(
    "emailSubjects",
  )}</h3><small>${f("emailSubjectsHint")}</small></div><div class="cc-platform-grid">${Object.entries(s.emailTemplates || {})
    .map(([k, v]) => `<label>${templateLabel(k)}<input name="email_${esc(k)}" value="${esc(v)}" maxlength="300"></label>`)
    .join("")}</div></section><section class="panel"><div class="panel-title"><h3>${f("integrations")}</h3><small>${f("integrationsHint")}</small></div><div class="cc-integration-list">${Object.entries(s.integrations || {})
    .map(([k, v]) => `<div><b>${typeof ccLookup("en", "adm.platform.integration." + k) === "string" ? f("integration." + k) : esc(k)}</b><span>${adDom(v)}</span><em>${f("configOnly")}</em></div>`)
    .join("")}</div><p class="subtle">${f("integrationsNote")}</p></section><div class="cc-actions"><button class="btn primary">${f("save")}</button><span id="ccPlatformSaved" class="subtle"></span></div></form>`;
  // T220: brokered or marketplace; switching back is the Wave 15 rollback (T228)
  const mode = s.platformMode === "marketplace" ? "marketplace" : "brokered",
    modeChoice = (k) =>
      `<label class="cc-mode-choice"><input type="radio" name="mode" value="${k}"${k === mode ? " checked" : ""}><span><b>${f("mode." + k)}</b>${k === mode ? ` <span class="status completed">${f("mode.current")}</span>` : ""}<small>${f(
        "mode." + k + "Hint",
      )}</small></span></label>`;
  const modePanel = `<section class="panel cc-platform-mode"><div class="panel-title"><h3>${f("mode.title")}</h3><small>${f("mode.hint")}</small></div><form id="ccPlatformMode" data-action="adm.saveMode">${["brokered", "marketplace"]
    .map(modeChoice)
    .join("")}<div class="cc-actions"><button class="btn outline">${f("mode.switch")}</button></div></form></section>`;
  // T227: the non-circumvention clause of brokered contracts, with versions, and the introduced pairs
  const c = cl.clause || {};
  const clausePanel = `<section class="panel cc-clause"><div class="panel-title"><h3>${f("clause.title")}</h3>${
    c.draft ? `<span class="status rejected">${f("clause.draft")}</span>` : `<span class="status completed">${f("clause.version", { n: c.version })}</span>`
  }</div><p class="subtle">${f("clause.lead")}</p><form class="modal-form" data-action="adm.saveClause"><textarea name="text" rows="8" minlength="50" maxlength="20000" required aria-label="${f("clause.title")}">${esc(
    c.text || "",
  )}</textarea><div class="cc-platform-grid"><label>${f("clause.months")}<input type="number" name="months" min="1" max="24" required value="${num(c.months, 12)}"></label><label>${f("clause.penaltyCap")}<input type="number" name="penaltyCap" min="0" max="100000" step="100" value="${num(
    c.penaltyCap,
  )}"></label></div><p class="subtle">${f("clause.hint")}</p><div class="cc-actions"><button class="btn primary">${f("clause.save")}</button></div></form><h4>${f("clause.introductions")}</h4><div class="cc-table-wrap"><table class="cc-table"><thead><tr><th>${f(
    "clause.customer",
  )}</th><th>${f("clause.supplier")}</th><th>${f("clause.lastOrder")}</th><th>${f("clause.until")}</th></tr></thead><tbody>${
    introductions
      .map((x) => `<tr><td><bdi>${esc(x.customerCompany)}</bdi></td><td><bdi>${esc(x.supplierCompany)}</bdi></td><td>${esc(fmt.date(x.lastOrderAt))}</td><td>${esc(fmt.date(x.protectedUntil))}</td></tr>`)
      .join("") || `<tr><td colspan="4">${f("clause.noIntroductions")}</td></tr>`
  }</tbody></table></div></section>`;
  const mailStatus = (m) => `<span class="status ${m.status === "Sent" ? "completed" : m.status === "Failed" ? "rejected" : "submitted"}">${adValue("mailStatus", m.status)}</span>`;
  const outbox = `<details class="panel pa-outbox"><summary><h3>${f("outbox")}</h3><small>${f("outboxCount", {
    messages: t.plural("adm.platform.messages", emails.length),
    sent: emails.filter((m) => m.status === "Sent").length,
  })}</small></summary><div class="cc-actions mail-test-row"><button type="button" class="btn small outline mail-test" data-action="adm.testEmail">${f("testEmail")}</button></div><div class="cc-table-wrap"><table class="cc-table pa-table"><thead><tr><th>${f(
    "queued",
  )}</th><th>${f("to")}</th><th>${f("subject")}</th><th>${f("status")}</th></tr></thead><tbody>${
    emails
      .slice(0, 100)
      .map(
        (m) =>
          `<tr title="${esc(m.body)}"><td>${esc(paTime(m.createdAt))}</td><td>${esc(m.to)}</td><td><b>${esc(m.subject)}</b><small>${esc(m.body.slice(0, 120))}</small></td><td>${mailStatus(m)}${m.lastError ? `<small>${adDom(m.lastError)}</small>` : ""}</td></tr>`,
      )
      .join("") || `<tr><td colspan="4">${f("noEmails")}</td></tr>`
  }</tbody></table></div></details>`;
  const legalPanel = `<section class="panel legal-admin"><div class="panel-title"><h3>${f("legal")}</h3><small class="subtle">${f("legalWhere")}</small></div><p class="subtle">${f(
    "legalLead",
  )}</p><form id="legalForm" class="modal-form" data-action="adm.saveLegal">${["imprint", "privacy", "terms"]
    .map((k) => `<label>${f("legalPage." + k)}<textarea name="${k}" rows="8" placeholder="${f("legalHint." + k)}">${esc(legal[k] || "")}</textarea></label>`)
    .join("")}<div class="cc-actions"><button class="btn primary">${f("saveLegal")}</button><a class="btn outline" href="#/imprint" target="_blank">${f("preview")}</a></div></form></section>`;
  app.innerHTML = dashboardShell(
    "admin",
    "platform",
    [`<div class="dash-top"><div><div class="eyebrow">${f("eyebrow")}</div><h1>${f("title")}</h1><p>${f("lead")}</p></div></div>`, modePanel, settings, clausePanel, outbox, legalPanel].join(""),
  );
}
actions.on("adm.saveSettings", async (form) => {
  const f = new FormData(form),
    { settings: s } = await api("/admin/settings"),
    emailTemplates = Object.fromEntries(Object.keys(s.emailTemplates || {}).map((k) => [k, f.get("email_" + k) || ""])),
    badgeCriteria = Object.fromEntries(["bronze", "silver", "gold"].map((k) => [k, { projects: Number(f.get(k + "Projects")), rating: Number(f.get(k + "Rating")) }]));
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
    autoSuggest: f.get("autoSuggest") === "on",
    instantEstimates: f.get("instantEstimates") === "on",
    autoConfirm: f.get("autoConfirm") === "on",
    supplierDays: f.get("supplierDays"),
    brokerMarkupPercent: f.get("brokerMarkupPercent"),
    emailTemplates,
  };
  // T255: a served category the admin just removed from the list is dropped
  body.servedRegions = String(f.get("servedRegions") || "");
  body.servedCategories = f.getAll("servedCategories").filter((c) => body.serviceCategories.includes(c));
  try {
    await api("/admin/settings", { method: "PUT", body });
    document.getElementById("ccPlatformSaved").textContent = t("adm.platform.saved");
    tToast(t("adm.platform.savedToast"));
  } catch (x) {
    toast(x.message, "error");
  }
});
actions.on("adm.saveMode", async (form) => {
  const mode = new FormData(form).get("mode"),
    name = t("adm.platform.mode." + mode);
  const ok = await uiDialog({ title: t("adm.platform.mode.confirmTitle", { mode: name }), message: t("adm.platform.mode.confirmText"), confirmLabel: t("adm.platform.mode.switch") });
  if (!ok) return;
  try {
    await api("/admin/platform-mode", { method: "PUT", body: { mode } });
    tToast(t("adm.platform.mode.switched", { mode: name }));
    adminPlatform();
  } catch (x) {
    toast(x.message, "error");
  }
});
actions.on("adm.saveClause", async (form) => {
  const ok = await uiDialog({ title: t("adm.platform.clause.confirmTitle"), message: t("adm.platform.clause.confirmText"), confirmLabel: t("adm.platform.clause.save") });
  if (!ok) return;
  try {
    await api("/admin/clause", { method: "PUT", body: Object.fromEntries(new FormData(form)) });
    tToast(t("adm.platform.clause.saved"));
    adminPlatform();
  } catch (x) {
    toast(x.message, "error");
  }
});
actions.on("adm.testEmail", async () => {
  try {
    const r = await api("/admin/test-email", { method: "POST", body: {} });
    tToast(t("adm.platform.testSent", { to: r.to }));
  } catch (x) {
    toast(x.message, "error");
  }
});
actions.on("adm.saveLegal", async (form) => {
  try {
    await api("/admin/legal", { method: "PUT", body: Object.fromEntries(new FormData(form)) });
    legalCache = null;
    tToast(t("adm.platform.legalSaved"));
  } catch (x) {
    toast(x.message, "error");
  }
});

routes.add("/admin/billing", adminBilling);
routes.add("/admin/disputes", adminDisputes);
routes.add("/admin/reports", adminReports);
routes.add("/admin/audit", adminAudit);
routes.add("/admin/platform", adminPlatform);
