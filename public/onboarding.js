/* First-run experience: honest landing-page numbers, featured suppliers and feature highlights,
   plus a self-completing "Getting started" checklist on every role's dashboard. */
const obEsc = (v) => esc(v ?? "");
const obKey = () => `cc_onboarding_hidden_${state.user?.id}`;

/* ---------- Landing page ---------- */

/* ---------- Getting-started checklist ---------- */
async function obSteps(role) {
  const [{ user = {}, supplier, companyProfile: cp = {} }] = await Promise.all([
    api("/profile").catch(() => ({})),
  ]);
  const filled = (...v) => v.every((x) => String(x || "").trim());
  obSteps.user = user;
  if (role === "customer") {
    const [{ projects = [] }, { bids = [] }] = await Promise.all([
      api("/projects"),
      api("/bids").catch(() => ({})),
    ]);
    const tasks = projects.flatMap((p) => p.phases.flatMap((ph) => ph.tasks || []));
    return [
      {
        done: filled(cp.legalName, cp.address),
        title: "Complete your company profile",
        text: "Legal name, address and procurement contact appear on invoices and supplier requests.",
        link: "/customer/profile",
        cta: "Edit profile",
      },
      {
        done: projects.length > 0,
        title: "Create your first project",
        text: "Pick a template to generate phases and tasks, set budget and dates.",
        link: "/customer/projects/new",
        cta: "New project",
      },
      {
        done: tasks.some((t) => t.assignedSupplierId) || bids.length > 0,
        title: "Source a supplier for a task",
        text: "Invite a vetted supplier directly or run a sourcing event to compare offers.",
        link: projects[0] ? `/customer/projects/${projects[0].id}` : "/customer/suppliers",
        cta: projects[0] ? "Open project" : "Find suppliers",
      },
      {
        done:
          !!user.notificationPrefsSavedAt ||
          (!!user.notificationPrefs && Object.values(user.notificationPrefs).some(Boolean)),
        title: "Choose email notifications",
        text: "Decide which events should also reach you by email.",
        link: "/customer/profile",
        cta: "Settings",
      },
    ];
  }
  if (role === "supplier") {
    const [{ application }, { bids = [] }] = await Promise.all([
      api("/applications/mine").catch(() => ({})),
      api("/bids").catch(() => ({})),
    ]);
    const live = !!supplier?.live,
      appText = live
        ? "Your company is verified and visible in the directory."
        : application
          ? `Application status: ${application.status}${application.stage ? " · " + application.stage : ""}${application.decisionNote ? " — " + application.decisionNote : ""}`
          : "Submit your company, insurance and certification evidence to be listed.";
    return [
      {
        done: filled(cp.legalName, cp.address),
        title: "Complete your company profile",
        text: "Legal name, address and tax ID are printed on your invoices.",
        link: "/supplier/profile",
        cta: "Edit profile",
      },
      {
        done: live,
        pending: !live && application && !["Rejected"].includes(application.status),
        title: "Get verified",
        text: appText,
        link: "/supplier-application",
        cta: application ? (application.status === "Rejected" ? "Apply again" : "View") : "Apply now",
      },
      {
        done: (supplier?.serviceCatalog || []).length > 0,
        title: "Publish your service catalog",
        text: "Services, rates, capacity and key people help customers choose you.",
        link: "/supplier/suppliers",
        cta: "Service catalog",
      },
      {
        done: !!user.payoutDetails,
        title: "Add payout details",
        text: "Your bank account is printed on invoices so customers can pay you.",
        link: "/supplier/profile",
        cta: "Add IBAN",
      },
      {
        done: bids.some((b) => (b.offers || []).some((o) => o.supplierId === state.user.supplierId)),
        title: "Answer your first sourcing event",
        text: "Open bid opportunities and send an offer.",
        link: "/supplier/bids",
        cta: "Opportunities",
      },
    ];
  }
  const [cfg, { applications = [] }, { emails = [] }] = await Promise.all([
    api("/platform-config").catch(() => ({})),
    api("/admin/applications").catch(() => ({})),
    api("/admin/outbox").catch(() => ({})),
  ]);
  const settings = (await api("/admin/settings").catch(() => ({}))).settings || {};
  return [
    {
      done: !!user.passwordChangedAt,
      title: "Change the bootstrap password",
      text: "Replace the initial administrator password with your own.",
      link: "/admin/profile",
      cta: "Security",
    },
    {
      done: filled(cfg.legal?.imprint, cfg.legal?.privacy),
      title: "Publish Impressum and privacy policy",
      text: "Required in Germany before inviting users.",
      link: "/admin/platform",
      cta: "Legal pages",
    },
    {
      done: !!settings.updatedAt,
      title: "Review platform settings",
      text: "Service categories, badge criteria, platform fee and payment terms.",
      link: "/admin/platform",
      cta: "Settings",
    },
    {
      done: cfg.mailEnabled && emails.some((m) => m.status === "Sent"),
      title: "Confirm email delivery",
      text: cfg.mailEnabled
        ? "Send a test email from the email outbox."
        : "Configure SMTP on the server (see DEPLOY.md), then send a test email.",
      link: "/admin/platform",
      cta: "Email outbox",
    },
    {
      done: applications.some((a) => ["Approved", "Rejected"].includes(a.status)),
      title: "Decide your first supplier application",
      text: "Verify evidence and references, then approve with a badge.",
      link: "/admin/applications",
      cta: "Vetting queue",
    },
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
  const html = `<section class="panel ob-checklist${compact ? " ob-compact" : ""}"><div class="ob-check-head"><div><div class="eyebrow">GETTING STARTED</div><h3>${compact ? `<span>${done} of ${steps.length} steps done</span>${next ? ` — <span>Next:</span> <span>${obEsc(next.title)}</span>` : ""}` : `Welcome to CraftCrew${state.user.name ? ", " + obEsc(state.user.name.split(" ")[0]) : ""}`}</h3></div><div class="ob-progress" title="${done} of ${steps.length} done"><i style="width:${(done / steps.length) * 100}%"></i></div><span class="ob-count">${done}/${steps.length}</span>${compact && next ? `<a class="btn small primary ob-next" href="#${next.link}">${obEsc(next.cta)}</a><button type="button" class="ui-link-btn" aria-expanded="false" onclick="obToggleSteps(this)">Show all steps</button>` : ""}<button type="button" class="ui-link-btn" onclick="obHide()">Hide</button></div><ol class="ob-steps">${steps.map((s) => `<li class="${s.done ? "done" : s.pending ? "pending" : ""} ${s === next ? "next" : ""}"><span class="ob-tick">${s.done ? "✓" : s.pending ? "…" : ""}</span><div><b>${obEsc(s.title)}</b><small>${obEsc(s.text)}</small></div>${s.done ? "" : `<a class="btn small ${s === next ? "primary" : "outline"}" href="#${s.link}">${obEsc(s.cta)}</a>`}</li>`).join("")}</ol></section>`;
  (content.querySelector(".dash-top") || content.firstElementChild)?.insertAdjacentHTML("afterend", html);
}
function obToggleSteps(btn) {
  const open = btn.closest(".ob-checklist").classList.toggle("ob-open");
  btn.setAttribute("aria-expanded", String(open));
  btn.textContent = open ? "Show fewer" : "Show all steps";
}
function obHide() {
  try {
    localStorage.setItem(obKey(), "1");
  } catch {}
  api("/account/preferences", { method: "PUT", body: { onboardingHidden: true } }).catch(() => {});
  document.querySelector(".ob-checklist")?.remove();
  toast("Checklist hidden — reopen it any time from the sidebar");
}
async function obShow() {
  if (obShow.allDone) {
    toast("All getting-started steps are done");
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
