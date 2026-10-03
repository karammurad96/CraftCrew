/* Area: admin (T134). Supplier applications with the vetting file, profile changes awaiting re-verification, and
   users with badges, account access, password resets and pending deletions. Drawn with translation keys; company
   names, people, addresses, notes and file names are data. reviewApplication stays: the admin dashboard opens it. */
const adk = (key, params) => esc(t("adm." + key, params));
const adKeys = (html) => html.replace(/^<(\w+)/, '<$1 data-i18n="keys"');
const adDom = (text) => `<bdi data-i18n="dom">${esc(text)}</bdi>`;
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
      .map(adKeys)
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
      `<button type="button" class="cc-vetting-file ff-evidence-file" data-action="adm.evidence" data-url="${esc(x.url)}" data-name="${esc(x.filename)}">📄 ${esc(x.filename)} <small>${adDom(x.category)} · ${esc(
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
    `<div data-i18n="keys"><div class="cc-vetting-flow">${["application", "verification", "references", "manual"].map((k, n) => `<span class="on">${n + 1} ${f("flow." + k)}</span>`).join("")}<span>5 ${f("flow.decision")}</span></div><div class="cc-vetting-grid"><section class="panel"><h3>${f(
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
    )}</textarea></label><div id="ccVettingError" class="form-error" role="alert" data-i18n="dom"></div><div class="cc-actions">${a.status === "On Hold" ? btn("New", "outline", "requeue") : ""}${btn("", "outline", "save")}${btn("On Hold", "outline", "hold")}${btn(
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
      .map(adKeys)
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
  const [{ users = [] }, { suppliers = [] }] = await Promise.all([api("/admin/users"), api("/admin/suppliers")]),
    f = (key, params) => adk("users." + key, params),
    pending = users.filter((u) => u.deleteAfter && u.status !== "Deleted");
  const supplierRow = (s) => {
    const account = users.find((u) => u.supplierId === s.id);
    return `<tr><td><b>${esc(s.company)}</b><small>${f(s.live ? "live" : "notLive")}</small></td><td>${s.location ? adDom(s.location) : "—"}</td><td>${account ? esc(account.email) : f("noAccount")}</td><td>${esc(
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
      `<section class="panel"><div class="panel-title"><h3>${f("badges")}</h3><span>${esc(t.plural("adm.users.suppliers", suppliers.length))}</span></div><div class="cc-table-wrap"><table class="cc-table"><thead><tr><th>${f("supplier")}</th><th>${f(
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
      .map(adKeys)
      .join(""),
  );
}
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
      `<div data-i18n="keys"><p>${tHtml("adm.reset.give", { email: `<b>${esc(email)}</b>` })}</p><div class="legal-temp"><code id="legalTemp">${esc(temporaryPassword)}</code><button type="button" class="btn small outline" data-action="adm.copy">${f(
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
