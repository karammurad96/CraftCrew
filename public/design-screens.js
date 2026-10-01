/* Design 2026 screens layer (T92 onwards). Loaded after invitations.js and before i18n.js.
   Pages are changed by wrapping their last renderer or by small enhancers that run after every render.
   Every enhancer is safe to run twice: finished nodes are marked with data-ds="1". */

/* English original of a node's text, even after i18n.js translated it. */
function dsText(el) {
  if (!el) return "";
  const parts = [];
  const walk = (n) => {
    if (n.nodeType === 3)
      parts.push((typeof I18N_ORIGINAL !== "undefined" && I18N_ORIGINAL.get(n)) || n.textContent);
    else if (n.nodeType === 1) n.childNodes.forEach(walk);
  };
  walk(el);
  return parts.join("").replace(/\s+/g, " ").trim();
}

/* "5 days late" for a date in the past (YYYY-MM-DD); "Overdue" when the date is unknown. */
function dsDaysLate(isoDate) {
  const due = Date.parse(String(isoDate || "").slice(0, 10));
  if (!due) return "Overdue";
  const days = Math.max(1, Math.floor((Date.now() - due) / 86400000));
  return days === 1 ? "1 day late" : `${days} days late`;
}

/* ---------- Status chips (T92, board StatusSystem): tint and icon by meaning ---------- */
const DS_TONE_TEXT = [
  ["red", /^(rejected|changes|changes requested|overdue|late|\d+ days? late|\d+d late|expired.*|missing|incomplete|action needed|not selected|declined|failed|suspended|blocked)$/],
  ["green", /^(approved|paid|completed|complete|accepted|verified|done|awarded|valid|valid until .*|no expiry|live|sent|reviewed|signed|checked out)$/],
  ["purple", /^(review|in review|reviewing|under review)$/],
  ["blue", /^(active|in progress|working|checked in)$/],
  ["orange", /^(pending|pending .*|submitted|requested|awaiting .*|on hold|expires .*|expiring.*|invited|queued|waiting.*|nobody planned)$/],
  ["grey", /^(not started|draft|open|new|closed|off|terminated|refunded|archived|to do)$/],
];
const DS_TONE_CLASS = {
  red: ["rejected", "changes", "changes-requested", "overdue", "expired", "late", "declined", "failed", "suspended", "not-selected"],
  green: ["approved", "paid", "completed", "accepted", "verified", "awarded", "sent", "reviewed", "live"],
  purple: ["review", "in-review", "reviewing"],
  blue: ["active", "in-progress"],
  orange: ["pending", "submitted", "requested", "awaiting-acceptance", "pending-approval", "on-hold", "expiring", "queued"],
  grey: ["not-started", "draft", "open", "new", "closed", "terminated", "refunded"],
};
function dsTone(el) {
  const t = dsText(el).toLowerCase();
  for (const [tone, re] of DS_TONE_TEXT) if (re.test(t)) return tone;
  for (const [tone, list] of Object.entries(DS_TONE_CLASS)) if (list.some((c) => el.classList.contains(c))) return tone;
  return "";
}
function dsEnhanceChips(root) {
  root.querySelectorAll(".status, .tag").forEach((el) => {
    const tone = dsTone(el);
    if (tone) el.dataset.dsTone = tone;
    else delete el.dataset.dsTone;
  });
}

/* ---------- Destructive actions: red text, no fill (they keep their confirmation) ---------- */
const DS_DESTRUCTIVE = /^(reject|delete|delete .*|remove|archive|archive project)$/i;
function dsEnhanceButtons(root) {
  root.querySelectorAll(".btn:not([data-ds-danger])").forEach((b) => {
    if (DS_DESTRUCTIVE.test(dsText(b))) b.dataset.dsDanger = "1";
  });
}

/* ---------- Empty states: "No … yet" texts in panels look like .empty ---------- */
function dsEnhanceEmpty(root) {
  root.querySelectorAll(".panel p:not([data-ds]), .cc-card p:not([data-ds])").forEach((p) => {
    p.dataset.ds = "1";
    if (!p.children.length && /^No .+ yet\.?$/.test(dsText(p))) p.classList.add("ds-empty");
  });
}

/* ---------- Form errors: the browser's message right under the field ---------- */
function dsFieldError(field) {
  let msg = field.nextElementSibling;
  if (!msg || !msg.classList.contains("ds-field-error")) {
    msg = document.createElement("small");
    msg.className = "ds-field-error";
    msg.setAttribute("role", "alert");
    field.insertAdjacentElement("afterend", msg);
  }
  return msg;
}
document.addEventListener(
  "invalid",
  (e) => {
    const f = e.target;
    if (!f.matches?.("input, select, textarea")) return;
    f.setAttribute("aria-invalid", "true");
    // Checkboxes and radios sit inside their label text; the browser's own bubble is enough there.
    if (!/^(checkbox|radio)$/.test(f.type)) dsFieldError(f).textContent = f.validationMessage;
  },
  true,
);
document.addEventListener(
  "input",
  (e) => {
    const f = e.target;
    if (f.getAttribute?.("aria-invalid") !== "true" || !f.checkValidity()) return;
    f.removeAttribute("aria-invalid");
    const msg = f.nextElementSibling;
    if (msg?.classList.contains("ds-field-error")) msg.remove();
  },
  true,
);

/* ---------- Sidebar (T93, boards Dashboard / SupplierDash / Workspace) ----------
   Five or six daily pages on top, everything else under a collapsible "More". Labels change, routes do not. */
Object.assign(NG_GROUPS, {
  customer: [["", ["dashboard", "projects", "approvals", "sourcing", "invoices", "messages"]]],
  supplier: [["", ["dashboard", "projects", "planning", "bids", "invoices", "compliance"]]],
  admin: [["", ["dashboard", "applications", "users", "billing", "disputes", "reports"]]],
});
const DS_SIDE_LABELS = {
  customer: {
    dashboard: "Today",
    projects: "Projects",
    approvals: "Approvals",
    sourcing: "Sourcing",
    invoices: "Invoices",
    messages: "Messages",
  },
  supplier: {
    dashboard: "Today",
    projects: "Work",
    planning: "Team planner",
    bids: "Opportunities",
    invoices: "Invoices",
    compliance: "Compliance",
  },
  admin: {
    dashboard: "Today",
    applications: "Vetting",
    users: "Users",
    billing: "Payments",
    disputes: "Escalations",
    reports: "Reports",
  },
};
// The project list under "Projects" is not one of the grouped links: keep it right after "Projects" while
// nav-groups.js sorts the rest. Working on a view of the children means a stable sidebar is never touched.
const dsBaseNgGroup = ngGroup;
ngGroup = function (nav, role) {
  const sub = nav.querySelector(":scope > .ds-side-projects");
  if (!sub) return dsBaseNgGroup(nav, role);
  dsBaseNgGroup(
    {
      children: [...nav.children].filter((el) => el !== sub),
      replaceChildren: (...els) => {
        els.splice(els.findIndex((el) => el.dataset?.uiIcon === "projects") + 1, 0, sub);
        nav.replaceChildren(...els);
      },
    },
    role,
  );
};
function dsMoreOpen() {
  try {
    return localStorage.getItem("cc_sidebar_more") === "1";
  } catch {
    return false;
  }
}
function dsSetMore(nav, open) {
  nav.classList.toggle("ds-more-closed", !open);
  nav.querySelector(':scope > .ng-title[data-title="More"]')?.setAttribute("aria-expanded", String(open));
}
function dsToggleMore(title) {
  const nav = title.parentElement,
    open = nav.classList.contains("ds-more-closed");
  dsSetMore(nav, open);
  try {
    localStorage.setItem("cc_sidebar_more", open ? "1" : "0");
  } catch {}
}
document.addEventListener("click", (e) => {
  const t = e.target.closest?.('.sidebar nav > .ng-title[data-title="More"]');
  if (t) dsToggleMore(t);
});
document.addEventListener("keydown", (e) => {
  const t = e.target.closest?.('.sidebar nav > .ng-title[data-title="More"]');
  if (t && (e.key === "Enter" || e.key === " ")) {
    e.preventDefault();
    dsToggleMore(t);
  }
});
let dsSideProjects = null;
function dsSideProjectList() {
  dsSideProjects ||= api("/projects")
    .then((d) => (d.projects || []).slice(0, 5))
    .catch(() => (dsSideProjects = null) || []);
  return dsSideProjects;
}
function dsEnhanceSidebar(root) {
  const side = root.querySelector(".app-shell > .sidebar"),
    nav = side?.querySelector(":scope > nav"),
    role = state.user?.role;
  if (!nav || !role) return;
  nav.dataset.dsRole = role;
  // Labels of the main links (the icon and count stay; only the text node changes)
  const labels = DS_SIDE_LABELS[role] || {};
  for (const a of nav.querySelectorAll(":scope > a")) {
    const label = labels[a.dataset.uiIcon || ngKey(a)];
    if (!label) continue;
    const text = [...a.childNodes].find((n) => n.nodeType === 3 && n.textContent.trim());
    // A new text node (not an edit), so i18n.js sees a childList change and translates it
    if (text && dsText({ nodeType: 1, childNodes: [text] }) !== label) text.replaceWith(document.createTextNode(label));
  }
  // "More": a keyboard-friendly toggle, collapsed unless the user opened it
  const more = nav.querySelector(':scope > .ng-title[data-title="More"]');
  if (more && !more.hasAttribute("role")) {
    more.setAttribute("role", "button");
    more.setAttribute("tabindex", "0");
    more.classList.add("ds-ui");
  }
  if (more && !nav.dataset.dsMore) {
    nav.dataset.dsMore = "1";
    dsSetMore(nav, dsMoreOpen());
  }
  // Help row: no tagline, language switch + help + log out in one row
  const help = side.querySelector(":scope > .help");
  if (help && !help.dataset.ds) {
    help.dataset.ds = "1";
    for (const n of [...help.childNodes])
      if (n.nodeType === 3 && /Industrial services, coordinated end-to-end\./.test(dsText({ nodeType: 1, childNodes: [n] }))) {
        if (n.nextSibling?.nodeName === "BR") n.nextSibling.remove();
        n.remove();
      }
  }
  // Projects of this user under "Projects", on any page inside a project
  const m = location.hash.match(/^#\/(customer|supplier)\/projects\/([^/?]+)/);
  const projectsLink = nav.querySelector(':scope > a[data-ui-icon="projects"]');
  projectsLink?.classList.toggle("ds-section-active", !!m);
  if (m && projectsLink && !nav.querySelector(":scope > .ds-side-projects")) {
    const sub = document.createElement("div");
    sub.className = "ds-side-projects";
    projectsLink.after(sub);
    dsSideProjectList().then((list) => {
      sub.innerHTML = list
        .map(
          (p) =>
            `<a href="#/${role}/projects/${encodeURIComponent(p.id)}"${p.id === m[2] ? ' class="ds-current" aria-current="page"' : ""}>${esc(p.name)}</a>`,
        )
        .join("");
    });
  }
}

/* ---------- Landing page (T94, board Landing) ---------- */
// The route wrapper in onboarding.js calls obEnhanceHome after renderHome; the new page renders those parts itself.
obEnhanceHome = async function () {};
renderHome = async function () {
  const step = (label, lead, text) =>
    `<div class="ds-step"><span class="ds-step-label">${label}</span><span class="ds-step-lead">${lead}</span><span class="ds-step-text">${text}</span></div>`;
  const phase = (name, width, colour, end) =>
    `<div class="ds-win-phase"><span>${name}</span><div class="ds-win-bar"><i style="width:${width}%;background:${colour}"></i></div><span class="ds-win-end">${end}</span></div>`;
  const note = (kicker, title, sub) =>
    `<div class="ds-win-note"><span>${kicker}</span><b>${title}</b><small>${sub}</small></div>`;
  const tile = (title, text) => `<article class="ds-tile"><h3>${title}</h3><p>${text}</p></article>`;
  app.innerHTML = publicLayout(`<div class="ds-landing">
  <section class="ds-hero ds-ui">
    <span class="ds-hero-kicker">Industrial services, coordinated.</span>
    <h1>Every crew. One project. Zero chaos.</h1>
    <p class="ds-hero-sub">Find vetted industrial specialists, compare their offers side by side and run the whole job — from site safety to the final invoice — in one place.</p>
    <div class="ds-hero-cta"><a class="btn primary lg" href="#/signup">Start a project</a><a class="ds-text-link" href="#/suppliers">Explore suppliers ›</a></div>
    <div class="ds-window-frame" aria-hidden="true"><div class="ds-window">
      <div class="ds-window-bar"><i style="background:#FF5F57"></i><i style="background:#FEBC2E"></i><i style="background:#28C840"></i><span>craftcrew · Regensburg Line 4</span></div>
      <div class="ds-window-body">
        <div class="ds-win-main"><div class="ds-win-title"><span>Project</span><b>Robot Cell Upgrade</b></div>
          <div class="ds-win-phases">${phase("Engineering", 100, "#34C759", "Done")}${phase("Build & integration", 55, "#2563EB", "55 %")}${phase("Site acceptance", 0, "#2563EB", "Oct")}</div></div>
        <div class="ds-win-notes">${note("Waiting for you", "Invoice 2026-0001 · €8,806", "All checks passed")}${note("On site today", "2 people · Keller Automation", "Briefed and checked in")}</div>
      </div></div></div>
  </section>
  <section class="ds-steps-band ds-ui"><div class="ds-wrap">
    <h2>From request to paid invoice. <span>Without the spreadsheets.</span></h2>
    <div class="ds-steps">${step("Describe", "Phases, tasks and budget from a template.", "Commissioning, retrofit or shutdown — set up in minutes.")}${step("Compare", "Vetted offers, side by side.", "Price, delivery and track record, weighted the way you decide.")}${step("Run", "One workspace for everyone.", "Each company sees only its own part — nothing more.")}</div>
  </div></section>
  <section class="ds-bento-band ds-ui"><div class="ds-bento">
    <div class="ds-bento-sourcing"><div><span class="ds-bento-label">Sourcing</span><h3>The best offer is obvious.</h3></div><div class="ds-bento-bars" aria-hidden="true"><i></i><i></i><i></i></div></div>
    <div class="ds-bento-safety"><div><span class="ds-bento-label">Site safety</span><h3>Who's on site. Right now.</h3></div><span class="ds-bento-big" aria-hidden="true">2</span></div>
    <div class="ds-bento-plain"><span class="ds-bento-label">Invoices</span><h3>Checked against the order before you approve.</h3><p>VAT, sequential numbers and XRechnung export included.</p></div>
    <div class="ds-bento-plain"><span class="ds-bento-label">Field app</span><h3>Time and photos in two taps.</h3><p>Works without signal on the shop floor and syncs later.</p></div>
  </div></section>
  <section class="ds-partners-band" id="dsPartners" hidden><div class="ds-wrap"></div></section>
  <section class="ds-tiles-band ds-ui"><div class="ds-wrap">
    <div class="ds-band-head"><span class="ds-hero-kicker">Strategic sourcing</span><h2>From sourcing event to signed contract</h2><p>Run competitive sourcing the way large procurement teams do — sized for industrial SMEs.</p></div>
    <div class="ds-tiles">${tile("Sourcing events", "RFQ, RFP and RFI with supplier questionnaires, multiple rounds and clarifications.")}${tile("Weighted evaluation", "Rank offers on price, delivery, supplier performance and experience — with an automatic summary.")}${tile("Contract management", "Awarded offers become contracts with value, term, notice deadline and renewal alerts.")}${tile("Scorecards & risk", "On-time delivery, invoice quality, responsiveness and insurance or vetting risk per supplier.")}${tile("Approvals inbox", "Invoices, documents, time entries, offers and contracts waiting for you — in one list.")}${tile("Full audit trail", "Every change is recorded with who, what and when for compliance and disputes.")}</div>
    <div class="ds-band-head ds-band-head-2"><span class="ds-hero-kicker">For both sides</span><h2>A professional operating layer for industrial work.</h2></div>
    <div class="ds-tiles">${tile("For SMEs", "Find vetted specialists, coordinate phases, approve invoices and close projects with reviews.")}${tile("For suppliers", "Show your capabilities, receive phase invitations, deliver work and get paid through one workflow.")}${tile("For operations teams", "Use badges, vetting stages, metrics and activity data to maintain marketplace quality.")}</div>
  </div></section>
  <section class="ds-final-cta ds-ui">
    <h2>Your next project starts here.</h2>
    <p>Free for customers. Suppliers join after a 5-step verification.</p>
    <div class="ds-hero-cta"><a class="btn primary lg" href="#/signup">Start a project</a><a class="ds-text-link" href="#/supplier-application">Apply as a supplier ›</a></div>
  </section>
</div>`);
  // Featured suppliers from the real directory, as obEnhanceHome did
  const { suppliers = [] } = await api("/suppliers").catch(() => ({}));
  const band = document.getElementById("dsPartners");
  if (!band || !suppliers.length) return;
  const rank = { Gold: 3, Silver: 2, Bronze: 1 };
  const featured = [...suppliers]
    .sort((a, b) => (b.rating || 0) - (a.rating || 0) || (rank[b.badge] || 0) - (rank[a.badge] || 0))
    .slice(0, 6);
  band.querySelector(".ds-wrap").innerHTML = `<div class="ds-partners-head"><h2>Vetted partners for your next project.</h2><a class="ds-text-link" href="#/suppliers">See all ${suppliers.length} suppliers ›</a></div><div class="ds-partners">${featured
    .map(
      (s) =>
        `<a class="ds-partner" href="#/suppliers?q=${encodeURIComponent(s.company)}"><span class="ds-partner-avatar">${esc(s.avatar || s.company.slice(0, 2))}</span><span class="ds-partner-text"><b>${esc(s.company)}</b><small>${esc([s.location, ...(s.services || []).slice(0, 2)].filter(Boolean).join(" · "))}</small></span><span class="badge ${esc(String(s.badge || "").toLowerCase())}">${esc(supplierBadge(s))}</span></a>`,
    )
    .join("")}</div>`;
  band.hidden = false;
};

/* Top bar for visitors: "Sign in" as a text link and a small "Start a project" pill (board Landing) */
const dsBaseTopActions = topActions;
topActions = function () {
  dsBaseTopActions();
  const el = document.getElementById("topActions");
  if (!el || state.user) return;
  el.innerHTML = `<a class="ds-top-signin" href="#/login">Sign in</a><a class="btn small primary ds-top-start" href="#/signup">Start a project</a>`;
};
// The header links follow the board's wording; the routes stay the same.
(function dsHeaderLinks() {
  const nav = document.querySelector("body > .topbar .main-nav");
  if (!nav) return;
  const rename = { "#/suppliers": "Suppliers", "#/faq": "Support" };
  for (const a of nav.querySelectorAll("a")) if (rename[a.getAttribute("href")]) a.textContent = rename[a.getAttribute("href")];
})();
topActions();

/* ---------- Run the enhancers after every render ---------- */
const DS_ENHANCERS = [dsEnhanceChips, dsEnhanceButtons, dsEnhanceEmpty, dsEnhanceSidebar];
function dsEnhance() {
  for (const root of [document.getElementById("app"), document.getElementById("modalRoot")])
    if (root) for (const fn of DS_ENHANCERS) fn(root);
}
let dsQueued = false;
function dsSchedule() {
  if (dsQueued) return;
  dsQueued = true;
  requestAnimationFrame(() => {
    dsQueued = false;
    dsObserver.disconnect();
    try {
      dsEnhance();
    } finally {
      dsObserve();
    }
  });
}
const dsObserver = new MutationObserver(dsSchedule);
function dsObserve() {
  for (const id of ["app", "modalRoot"]) {
    const el = document.getElementById(id);
    if (el) dsObserver.observe(el, { childList: true, subtree: true, characterData: true });
  }
}
dsObserve();
dsSchedule();
