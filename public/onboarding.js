/* First-run experience: a self-completing "Getting started" checklist on every role's dashboard, drawn from
   translation keys (T135d). */
const obKey = () => `cc_onboarding_hidden_${state.user?.id}`;


/* ---------- Getting-started checklist ---------- */
// One step: its texts come from "ob.<role>.<id>.*" keys
const obStep = (role, id, done, link, extra = {}) => ({ done, link, title: t(`ob.${role}.${id}.title`), text: t(`ob.${role}.${id}.text`), cta: t(`ob.${role}.${id}.cta`), ...extra });
// An application's status or stage from the admin area's keys, else as stored
const obValue = (group, v) => (typeof ccLookup("en", `adm.${group}.${v}`) === "string" ? t(`adm.${group}.${v}`) : v);
async function obSteps(role) {
  const { user = {}, supplier, companyProfile: cp = {} } = await api("/profile").catch(() => ({}));
  const filled = (...v) => v.every((x) => String(x || "").trim());
  obSteps.user = user;
  if (role === "customer") {
    const [{ projects = [] }, { bids = [] }] = await Promise.all([api("/projects"), api("/bids").catch(() => ({}))]);
    const tasks = projects.flatMap((p) => p.phases.flatMap((ph) => ph.tasks || []));
    return [
      obStep("customer", "profile", filled(cp.legalName, cp.address), "/customer/profile"),
      obStep("customer", "project", projects.length > 0, "/customer/projects/new"),
      obStep("customer", "source", tasks.some((x) => x.assignedSupplierId) || bids.length > 0, projects[0] ? `/customer/projects/${projects[0].id}` : "/customer/suppliers", {
        cta: t(projects[0] ? "ob.customer.source.cta" : "ob.customer.source.ctaFind"),
      }),
      obStep("customer", "prefs", !!user.notificationPrefsSavedAt || (!!user.notificationPrefs && Object.values(user.notificationPrefs).some(Boolean)), "/customer/profile"),
    ];
  }
  if (role === "supplier") {
    const [{ application }, { bids = [] }] = await Promise.all([api("/applications/mine").catch(() => ({})), api("/bids").catch(() => ({}))]);
    const live = !!supplier?.live,
      appText = live
        ? t("ob.supplier.verify.live")
        : application
          ? t("ob.supplier.verify.status", { status: obValue("status", application.status) }) +
            (application.stage ? " · " + obValue("stage", application.stage) : "") +
            (application.decisionNote ? " — " + application.decisionNote : "")
          : t("ob.supplier.verify.text");
    return [
      obStep("supplier", "profile", filled(cp.legalName, cp.address), "/supplier/profile"),
      obStep("supplier", "verify", live, "/supplier-application", {
        pending: !live && application && application.status !== "Rejected",
        text: appText,
        cta: t(application ? (application.status === "Rejected" ? "ob.supplier.verify.again" : "ob.supplier.verify.view") : "ob.supplier.verify.cta"),
      }),
      obStep("supplier", "catalog", (supplier?.serviceCatalog || []).length > 0, "/supplier/suppliers"),
      obStep("supplier", "payout", !!user.payoutDetails, "/supplier/profile"),
      obStep("supplier", "bid", bids.some((b) => (b.offers || []).some((o) => o.supplierId === state.user.supplierId)), "/supplier/bids"),
    ];
  }
  const [cfg, { applications = [] }, { emails = [] }] = await Promise.all([api("/platform-config").catch(() => ({})), api("/admin/applications").catch(() => ({})), api("/admin/outbox").catch(() => ({}))]);
  const settings = (await api("/admin/settings").catch(() => ({}))).settings || {};
  return [
    obStep("admin", "password", !!user.passwordChangedAt, "/admin/profile"),
    obStep("admin", "legal", filled(cfg.legal?.imprint, cfg.legal?.privacy), "/admin/platform"),
    obStep("admin", "settings", !!settings.updatedAt, "/admin/platform"),
    obStep("admin", "email", cfg.mailEnabled && emails.some((m) => m.status === "Sent"), "/admin/platform", { text: t(cfg.mailEnabled ? "ob.admin.email.text" : "ob.admin.email.smtp") }),
    obStep("admin", "vetting", applications.some((a) => ["Approved", "Rejected"].includes(a.status)), "/admin/applications"),
  ];
}
async function obChecklist() {
  const role = state.user?.role,
    content = document.querySelector(".dashboard-content");
  if (!content || content.querySelector(".ob-checklist") || !/\/dashboard$/.test(location.hash.split("?")[0]))
    return;
  let hidden = false;
  try {
    hidden = localStorage.getItem(obKey()) === "1";
  } catch {}
  const steps = await obSteps(role),
    done = steps.filter((s) => s.done).length;
  // Hiding is saved on the account, so it holds in every browser and after every sign-in.
  if (obSteps.user?.onboardingHidden !== undefined) hidden = obSteps.user.onboardingHidden;
  obShow.allDone = done === steps.length;
  document.querySelector(".ob-reopen")?.toggleAttribute("hidden", obShow.allDone);
  if (done === steps.length || hidden || content.querySelector(".ob-checklist")) return;
  const next = steps.find((s) => !s.done && !s.pending) || steps.find((s) => !s.done);
  // Once a step is done the checklist shrinks to one line ("4 of 5 steps done — Next: …"); the full list opens on click.
  const compact = done > 0;
  const o = (key, params) => esc(t("ob." + key, params)),
    first = state.user.name ? state.user.name.split(" ")[0] : "";
  const html = `<section class="panel ob-checklist${compact ? " ob-compact" : ""}"><div class="ob-check-head"><div><div class="eyebrow">${o("eyebrow")}</div><h3>${
    compact ? `<span>${o("progress", { done, n: steps.length })}</span>${next ? ` — <span>${o("next")}</span> <span>${esc(next.title)}</span>` : ""}` : first ? o("welcomeName", { name: first }) : o("welcome")
  }</h3></div><div class="ob-progress" title="${o("progressTip", { done, n: steps.length })}"><i style="width:${(done / steps.length) * 100}%"></i></div><span class="ob-count">${done}/${steps.length}</span>${
    compact && next ? `<a class="btn small primary ob-next" href="#${next.link}">${esc(next.cta)}</a><button type="button" class="ui-link-btn" aria-expanded="false" data-action="ob.toggle">${o("showAll")}</button>` : ""
  }<button type="button" class="ui-link-btn" data-action="ob.hide">${o("hide")}</button></div><ol class="ob-steps">${steps
    .map(
      (x) =>
        `<li class="${x.done ? "done" : x.pending ? "pending" : ""} ${x === next ? "next" : ""}"><span class="ob-tick">${x.done ? "✓" : x.pending ? "…" : ""}</span><div><b>${esc(x.title)}</b><small>${esc(x.text)}</small></div>${
          x.done ? "" : `<a class="btn small ${x === next ? "primary" : "outline"}" href="#${x.link}">${esc(x.cta)}</a>`
        }</li>`,
    )
    .join("")}</ol></section>`;
  // Below the decision list on the dashboards, else under the page header
  (content.querySelector(":scope > .aq-panel") || content.querySelector(".dash-top") || content.firstElementChild)?.insertAdjacentHTML("afterend", html);
}
actions.on("ob.toggle", (btn) => {
  const open = btn.closest(".ob-checklist").classList.toggle("ob-open");
  btn.setAttribute("aria-expanded", String(open));
  btn.textContent = t(open ? "ob.showFewer" : "ob.showAll");
});
function obHide() {
  try {
    localStorage.setItem(obKey(), "1");
  } catch {}
  api("/account/preferences", { method: "PUT", body: { onboardingHidden: true } }).catch(() => {});
  document.querySelector(".ob-checklist")?.remove();
  tToast(t("ob.hidden"));
}
actions.on("ob.hide", () => obHide());
async function obShow() {
  if (obShow.allDone) {
    tToast(t("ob.allDone"));
    return;
  }
  try {
    localStorage.removeItem(obKey());
  } catch {}
  await api("/account/preferences", { method: "PUT", body: { onboardingHidden: false } }).catch(() => {});
  document.querySelector(".ob-checklist")?.remove();
  location.hash.split("?")[0] === `#/${state.user.role}/dashboard`
    ? obChecklist()
    : navigate(`/${state.user.role}/dashboard`);
}

const obBaseRoute = window.route;
window.route = async function () {
  const result = await obBaseRoute(),
    path = location.hash.replace(/^#/, "").split("?")[0] || "/";
  try {
    // Company setup belongs to the main account, not to invited team members.
    if (state.user?.isMember) return result;
    if (state.user && /^\/(customer|supplier|admin)\/dashboard$/.test(path)) await obChecklist();
  } catch (e) {
    console.error(e);
  }
  return result;
};
