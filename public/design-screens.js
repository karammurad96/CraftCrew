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
  const due = String(isoDate || "").slice(0, 10);
  if (!Date.parse(due)) return "Overdue";
  // Calendar days in the user's time zone, not 24-hour periods since midnight UTC
  const now = new Date(),
    today = new Date(now.getTime() - now.getTimezoneOffset() * 60000).toISOString().slice(0, 10),
    days = Math.max(1, Math.round((Date.parse(today) - Date.parse(due)) / 86400000));
  return days === 1 ? "1 day late" : `${days} days late`;
}

/* ---------- Status chips (T92, board StatusSystem): tint and icon by meaning ---------- */
const DS_TONE_TEXT = [
  ["red", /^(rejected|changes|changes requested|overdue|late|\d+ days? late|\d+d late|expired.*|missing|incomplete|action needed|not selected|declined|failed|suspended|blocked)$/],
  ["green", /^(approved|paid|completed|complete|accepted|verified|done|working|awarded|valid|valid until .*|no expiry|live|sent|reviewed|signed|checked out)$/],
  ["purple", /^(review|in review|reviewing|under review)$/],
  ["blue", /^(active|in progress|checked in)$/],
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
  root.querySelectorAll(".status:not([data-ds-fixed]), .tag:not([data-ds-fixed])").forEach((el) => {
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

/* ---------- Dashboards: shared header, decision list and "at a glance" (T95–T97, board Dashboard) ---------- */
const DS_ICON_PATHS = {
  invoice: '<path d="M7 3h7l4 4v14H7z"/><path d="M14 3v4h4M10 12h5M10 16h5"/>',
  document: '<path d="M7 3h7l4 4v14H7z"/><path d="M14 3v4h4M10 12h5M10 16h5"/>',
  offer: '<path d="M6 20V11M12 20V5M18 20v-6"/>',
  time: '<circle cx="12" cy="12" r="9"/><path d="M12 7v5l3 2"/>',
  overdue: '<circle cx="12" cy="12" r="9"/><path d="M12 7v6M12 16.5v.5"/>',
  invitation: '<path d="M4 7h16v12H4z"/><path d="m4 7 8 6 8-6"/>',
  bid: '<path d="M6 20V11M12 20V5M18 20v-6"/>',
  compliance: '<path d="M12 3 5 6v5c0 4.5 3 8 7 10 4-2 7-5.5 7-10V6z"/><path d="m9 12 2 2 4-4"/>',
  application: '<circle cx="12" cy="8" r="4"/><path d="M4 21c1-4 4-6 8-6s7 2 8 6"/>',
  dispute: '<path d="M12 3 2 20h20z"/><path d="M12 10v4M12 17v.5"/>',
  payment: '<rect x="3" y="6" width="18" height="12" rx="2"/><path d="M3 10h18"/>',
};
const DS_TINT = {
  invoice: "blue",
  time: "blue",
  offer: "orange",
  document: "orange",
  overdue: "red",
  invitation: "orange",
  bid: "blue",
  compliance: "orange",
  application: "blue",
  dispute: "red",
  payment: "green",
};
const dsIcon = (kind) =>
  `<span class="ds-dec-icon ds-tint-${DS_TINT[kind] || "blue"}" aria-hidden="true"><svg viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="1.8" stroke-linecap="round" stroke-linejoin="round">${DS_ICON_PATHS[kind] || DS_ICON_PATHS.document}</svg></span>`;
const dsIso = (d) => new Date(d.getTime() - d.getTimezoneOffset() * 60000).toISOString().slice(0, 10);
const dsToday = () => dsIso(new Date());
const dsDaysBetween = (a, b) => Math.round((Date.parse(b) - Date.parse(a)) / 86400000);
function dsGreeting(name) {
  const h = new Date().getHours(),
    part = h < 12 ? "morning" : h < 18 ? "afternoon" : "evening",
    first = String(name || "").trim().split(/\s+/)[0];
  return first ? `Good ${part}, ${first}.` : `Good ${part}.`;
}
function dsDecisionLine(n) {
  if (!n) return "Nothing needs a decision. Everything is on track.";
  if (n === 1) return "One thing needs a decision. Everything else is on track.";
  return `${n} things need a decision. Everything else is on track.`;
}
function dsKickerDate() {
  const lang = typeof i18nLang !== "undefined" && i18nLang === "de" ? "de-DE" : "en-GB";
  return new Date().toLocaleDateString(lang, { weekday: "long", day: "numeric", month: "long" });
}
/* Page header: kicker, greeting, one line; the existing header buttons move to the right. */
function dsDashHeader(kicker, line, { kickerIsDate = false } = {}) {
  const top = document.querySelector(".dashboard-content > .dash-top");
  if (!top) return;
  const text = top.querySelector(":scope > div:first-child");
  if (!text || text.dataset.ds === line) return;
  text.dataset.ds = line;
  text.classList.add("ds-dash-head");
  text.innerHTML = `<span class="ds-dash-kicker"${kickerIsDate ? " data-no-i18n" : ""}>${esc(kicker)}</span><h1>${esc(dsGreeting(state.user?.name))}</h1><p>${esc(line)}</p>`;
  top.classList.add("ds-dash-top");
}
const dsBtn = (label, href, kind = "primary") =>
  `<a class="btn ${kind === "grey" ? "secondary" : "primary"} ds-dec-btn" href="#${esc(href)}">${esc(label)}</a>`;
function dsCustomerRow(x) {
  let title = x.text,
    sub = x.sub || "",
    buttons = dsBtn(x.action || "Open", x.link);
  if (x.kind === "invoice" && x.invoiceId) {
    title = `Invoice ${x.number} · ${money(x.amount || 0)}`;
    sub = [x.supplier, x.sub].filter(Boolean).join(" · ");
    buttons =
      dsBtn("Review", x.link, "grey") +
      `<button type="button" class="btn primary ds-dec-btn" onclick="dsApproveInvoice('${esc(x.invoiceId)}', this)">Approve</button>`;
  } else if (x.kind === "offer" && x.bidId) {
    title = `${x.offers === 1 ? "1 offer" : `${x.offers} offers`} · ${x.title}`;
    sub = x.best
      ? `Best ${money(x.best.amount)} from ${x.best.supplier}${x.dueDate ? ` · closes ${date(x.dueDate)}` : ""}`
      : x.sub;
    buttons = dsBtn("Compare", `/customer/sourcing/${x.bidId}`);
  } else if (x.kind === "time" && x.entries) {
    title = `${x.entries === 1 ? "1 time entry" : `${x.entries} time entries`} · ${Math.round(x.hours * 10) / 10} h`;
    const range = x.from && x.to && x.from !== x.to ? `${date(x.from)} – ${date(x.to)}` : x.from ? date(x.from) : "";
    sub = [(x.suppliers || []).join(", "), range].filter(Boolean).join(" · ");
    buttons = dsBtn("Review", "/customer/time");
  } else if (x.kind === "overdue" && x.taskId) {
    const late = Math.max(1, dsDaysBetween(x.dueDate, dsToday()));
    title = `${x.taskName} is ${late === 1 ? "1 day" : `${late} days`} late`;
    sub = [x.supplier, x.projectName].filter(Boolean).join(" · ");
    buttons = dsBtn(
      "Message",
      `/customer/messages?project=${encodeURIComponent(x.projectId)}&phase=${encodeURIComponent(x.phaseId)}&task=${encodeURIComponent(x.taskId)}`,
      "grey",
    );
  } else if (x.amount) sub = [sub, money(x.amount)].filter(Boolean).join(" · ");
  return dsRow(x.kind, title, sub, x.link, buttons);
}
// One row of a decision list. The title links to the item's page, as the old action queue did.
const dsRow = (kind, title, sub, link, buttons) =>
  `<div class="ds-dec-row">${dsIcon(kind)}<div class="ds-dec-text"><a class="ds-dec-title" href="#${esc(link)}">${esc(title)}</a>${sub ? `<span class="ds-dec-sub">${esc(sub)}</span>` : ""}</div><div class="ds-dec-actions">${buttons}</div></div>`;
async function dsApproveInvoice(id, btn) {
  if (btn) btn.disabled = true;
  try {
    // The same request as invoiceAction(id, 'Approve'), without its jump to the invoice list.
    await api("/invoices/" + id, { method: "PATCH", body: { action: "Approve", comment: "" } });
    toast("Invoice approved; payment scheduled");
    route();
  } catch (e) {
    toast(e.message, "error");
    if (btn) btn.disabled = false;
  }
}
function dsCaughtUp(d) {
  const n = d.nextDeadline;
  return `<div class="ds-dec-empty"><b>You're all caught up</b><span>${
    n
      ? `Next deadline: <a href="#${esc(n.link)}">${esc(n.name)}</a> · ${esc(n.project)} · ${date(n.dueDate)}`
      : "Nothing needs your attention right now."
  }</span></div>`;
}
const dsDashBase = (left, right) =>
  `<section class="aq-panel ds-dash">
    <div class="ds-dash-cols"><div class="ds-dash-main">${left}</div><div class="ds-dash-side">${right}</div></div>
    <h2 class="ds-dash-more ds-ui">More on your dashboard</h2>
  </section>`;

/* Customer (T95) */
const dsBaseAqHtml = aqHtml;
aqHtml = function (d) {
  const role = state.user?.role,
    items = d.items || [];
  if (role === "customer") {
    dsDashHeader(dsKickerDate(), dsDecisionLine(d.total || items.length), { kickerIsDate: true });
    return dsDashBase(
      `<h2 class="ds-dash-h ds-ui">Needs your decision</h2><div class="ds-card ds-dec-list">${items.length ? items.map(dsCustomerRow).join("") : dsCaughtUp(d)}</div>`,
      `<h2 class="ds-dash-h ds-ui">At a glance</h2><div class="ds-card ds-glance" data-ds-fill="customer"></div><div class="ds-card ds-week" data-ds-fill="week"><h3 class="ds-ui">This week</h3><div class="ds-week-list"></div></div>`,
    );
  }
  if (role === "supplier") {
    const invites = items
      .filter((x) => x.kind === "invitation" && x.invite)
      .sort((a, b) => String(b.invite.invitedAt).localeCompare(String(a.invite.invitedAt)));
    const first = invites[0],
      rest = items.filter((x) => x !== first);
    dsDashHeader(
      state.user?.company || "",
      invites.length === 1
        ? "A new job is waiting for your answer."
        : invites.length > 1
          ? `${invites.length} new jobs are waiting for your answer.`
          : dsDecisionLine(d.total || items.length),
    );
    return dsDashBase(
      (first ? dsInviteCard(first) : "") +
        (rest.length || !first
          ? `<h2 class="ds-dash-h ds-ui">${first ? "Also for you" : "Needs your decision"}</h2><div class="ds-card ds-dec-list ds-dec-small">${rest.length ? rest.map((x) => dsRow(x.kind, x.text, x.sub, x.link, dsBtn(x.action || "Open", x.link, x.kind === "compliance" ? "grey" : "primary"))).join("") : dsCaughtUp(d)}</div>`
          : ""),
      `<section class="ds-pay-card" data-ds-fill="pay"><span class="ds-ui">Paid this year</span><b>—</b><small></small></section><div class="ds-card ds-crew" data-ds-fill="crew"><div class="ds-crew-head"><h3 class="ds-ui">Crew this week</h3><a href="#/supplier/planning">Planner ›</a></div><div class="ds-crew-grid"></div><span class="ds-crew-legend ds-ui">Blue job · teal site visit · orange absence</span></div>`,
    );
  }
  if (role === "admin") {
    dsDashHeader("Admin", dsDecisionLine(d.total || items.length));
    return dsDashBase(
      `<h2 class="ds-dash-h ds-ui">Needs your decision</h2><div class="ds-card ds-dec-list">${
        items.length
          ? items
              .map((x) =>
                dsRow(
                  x.kind,
                  x.text,
                  [x.sub, x.amount ? money(x.amount) : ""].filter(Boolean).join(" · "),
                  x.link,
                  dsBtn(x.action || "Open", x.link),
                ),
              )
              .join("")
          : dsCaughtUp(d)
      }</div>`,
      `<h2 class="ds-dash-h ds-ui">At a glance</h2><div class="ds-card ds-glance" data-ds-fill="stats"></div>`,
    );
  }
  return dsBaseAqHtml(d);
};
/* Admin (T97): "At a glance" shows today's statistics row (users, live suppliers, projects, invoice volume). */
function dsFillAdminSide(root) {
  const glance = root.querySelector('.ds-glance[data-ds-fill="stats"]:not([data-ds])'),
    stats = root.querySelector(".dashboard-content > .stats");
  if (!glance || !stats) return;
  glance.dataset.ds = "1";
  glance.innerHTML = [...stats.children]
    .slice(0, 4)
    .map((cell) => {
      const label = cell.querySelector("span, .cc-label"),
        value = cell.querySelector("strong, b");
      return dsGlanceCell(esc(dsText(label)), esc(dsText(value)));
    })
    .join("");
}
/* Supplier (T96): the newest invitation as a card with its facts and the answer buttons */
// "24 Sep – 11 Oct" in the interface language (the year only when it is not this year)
function dsShortRange(a, b) {
  const lang = typeof i18nLang !== "undefined" && i18nLang === "de" ? "de-DE" : "en-GB",
    year = String(new Date().getFullYear()),
    f = (d) =>
      d
        ? new Date(d + "T12:00:00").toLocaleDateString(lang, {
            day: "numeric",
            month: "short",
            ...(d.startsWith(year) ? {} : { year: "numeric" }),
          })
        : "";
  return a && b && a !== b ? `${f(a)} – ${f(b)}` : f(a || b) || "—";
}
function dsInviteCard(x) {
  const v = x.invite,
    answer = v.taskId
      ? (ok) => `invAnswerTask('${esc(v.projectId)}', '${esc(v.taskId)}', ${ok})`
      : (ok) => `invAnswerPhase('${esc(v.projectId)}', '${esc(v.phaseId)}', ${ok})`;
  return `<article class="ds-invite" data-ds-invite="${esc(v.projectId)}" data-from="${esc(v.startDate)}" data-to="${esc(v.dueDate)}">
    <div class="ds-invite-head"><span class="ds-invite-kicker">${esc(v.customer ? `New invitation · ${v.customer}` : "New invitation")}</span><a class="ds-invite-title" href="#${esc(x.link)}">${esc(v.name)}</a><span class="ds-invite-sub">${esc([v.project, v.taskId ? v.phase : ""].filter(Boolean).join(" · "))}</span></div>
    <div class="ds-facts"><div><span class="ds-ui">Dates</span><b data-no-i18n>${esc(dsShortRange(v.startDate, v.dueDate))}</b></div><div><span class="ds-ui">Order value</span><b>${v.orderAmount ? money(v.orderAmount) : "—"}</b></div><div><span class="ds-ui">Your crew</span><b class="ds-crew-count">…</b></div></div>
    <div class="ds-invite-actions"><button type="button" class="btn primary ds-invite-accept" onclick="${answer(true)}">Accept Job</button><button type="button" class="btn secondary ds-invite-decline" onclick="${answer(false)}">Decline</button><a class="ds-text-link" href="#/supplier/messages?project=${encodeURIComponent(v.projectId)}">Ask a question ›</a></div>
  </article>`;
}
const DS_ABSENCE = ["vacation", "sick", "training"];
async function dsFillSupplierSide(root) {
  const pay = root.querySelector('.ds-pay-card[data-ds-fill="pay"]:not([data-ds])'),
    crew = root.querySelector('.ds-crew[data-ds-fill="crew"]:not([data-ds])'),
    invite = root.querySelector(".ds-invite:not([data-ds])");
  if (pay) {
    pay.dataset.ds = "1";
    const { invoices = [] } = await api("/invoices").catch(() => ({}));
    const year = dsToday().slice(0, 4),
      paid = invoices
        .filter((i) => i.status === "Paid" && String(i.paymentDate || i.updatedAt || "").startsWith(year))
        .reduce((a, i) => a + Number(i.amount || 0), 0),
      approved = invoices.filter((i) => i.status === "Approved"),
      next = approved.map((i) => i.scheduledPayment).filter(Boolean).sort()[0];
    pay.querySelector("b").replaceChildren(money(paid));
    const lang = typeof i18nLang !== "undefined" && i18nLang === "de" ? "de-DE" : "en-GB";
    pay.querySelector("small").replaceChildren(approved.length
      ? `+ ${money(approved.reduce((a, i) => a + Number(i.amount || 0), 0))} approved${next ? `, paid ${new Date(next + "T12:00:00").toLocaleDateString(lang, { weekday: "long" })}` : ""}`
      : "No payments waiting");
  }
  if (crew) {
    crew.dataset.ds = "1";
    const now = new Date(),
      monday = new Date(now.getTime() - ((now.getDay() + 6) % 7) * 86400000),
      days = [0, 1, 2, 3, 4].map((i) => dsIso(new Date(monday.getTime() + i * 86400000)));
    const d = await api(`/planning?from=${days[0]}&to=${days[4]}`).catch(() => ({}));
    const people = (d.people || []).slice(0, 4),
      kind = (pid, day) => {
        const hit = [...(d.visits || []), ...(d.entries || [])].find(
          (e) => e.personId === pid && e.start <= day && e.end >= day,
        );
        return !hit ? "free" : hit.type === "visit" ? "visit" : DS_ABSENCE.includes(hit.type) ? "absence" : "job";
      };
    const lang = typeof i18nLang !== "undefined" && i18nLang === "de" ? "de-DE" : "en-GB";
    const head = `<span></span>${days.map((day) => `<span class="ds-crew-day">${new Date(day + "T12:00:00").toLocaleDateString(lang, { weekday: "narrow" })}</span>`).join("")}`;
    const rows = people
      .map((p) => {
        // Neighbouring days of the same kind become one bar
        const spans = [];
        for (const day of days) {
          const k = kind(p.id, day);
          if (spans.at(-1)?.k === k) spans.at(-1).n++;
          else spans.push({ k, n: 1 });
        }
        return `<span class="ds-crew-name">${esc(String(p.name || "").split(" ")[0])}</span>${spans.map((x) => `<i class="ds-crew-${x.k}" style="grid-column: span ${x.n}"></i>`).join("")}`;
      })
      .join("");
    crew.querySelector(".ds-crew-grid").innerHTML = people.length
      ? head + rows
      : '<p class="ds-week-none">Add your team in the planner to see who is free.</p>';
    crew.querySelector(".ds-crew-grid").setAttribute("data-no-i18n", "");
  }
  if (invite) {
    invite.dataset.ds = "1";
    const cell = invite.querySelector(".ds-crew-count"),
      from = invite.dataset.from || invite.dataset.to,
      to = invite.dataset.to || invite.dataset.from;
    if (!from) return cell.replaceChildren("—");
    const d = await api(`/planning?from=${from}&to=${to}`).catch(() => ({}));
    const people = d.people || [],
      busy = new Set([...(d.entries || []), ...(d.visits || [])].map((e) => e.personId)),
      free = people.filter((p) => !busy.has(p.id)).length;
    cell.replaceChildren(!people.length ? "—" : free ? `${free} of ${people.length} free` : "Nobody free");
    cell.classList.toggle("ds-green", free > 0);
    cell.classList.toggle("ds-red", people.length > 0 && !free);
  }
}
const dsGlanceCell = (label, value, red) =>
  `<div class="ds-glance-cell"><span class="ds-ui">${label}</span><b${red ? ' class="ds-red"' : ""}>${value}</b></div>`;
async function dsFillCustomerSide(root) {
  const glance = root.querySelector('.ds-glance[data-ds-fill="customer"]:not([data-ds])'),
    week = root.querySelector('.ds-week[data-ds-fill="week"]:not([data-ds])');
  if (!glance && !week) return;
  if (glance) glance.dataset.ds = "1";
  if (week) week.dataset.ds = "1";
  const [{ projects = [] }, { invoices = [] }, { visits = [] }] = await Promise.all([
    api("/projects").catch(() => ({})),
    api("/invoices").catch(() => ({})),
    api("/site-visits").catch(() => ({})),
  ]);
  const today = dsToday(),
    month = today.slice(0, 7),
    active = projects.filter((p) => !["Completed", "Archived"].includes(p.status) && !p.archived),
    activeIds = new Set(active.map((p) => p.id)),
    tasks = projects.flatMap((p) =>
      (p.phases || []).flatMap((ph) => (ph.tasks || []).map((t) => ({ p, ph, t }))),
    ),
    open = tasks.filter(({ t }) => t.status !== "Completed" && t.dueDate),
    late = open.filter(({ t }) => t.dueDate < today).length,
    unpaid = invoices.filter((i) => i.status === "Approved"),
    toPay = unpaid
      .filter((i) => String(i.scheduledPayment || "").slice(0, 7) === month)
      .reduce((a, i) => a + Number(i.amount || 0), 0),
    budget = active.reduce((a, p) => a + Number(p.budget || 0), 0),
    invoiced = invoices
      .filter((i) => activeIds.has(i.projectId) && !["Rejected", "Draft"].includes(i.status))
      .reduce((a, i) => a + Number(i.amount || 0), 0);
  if (glance)
    glance.innerHTML =
      dsGlanceCell("Active projects", active.length) +
      dsGlanceCell("Late tasks", late, late > 0) +
      dsGlanceCell("To pay this month", money(toPay)) +
      dsGlanceCell("Budget used", budget ? `${Math.round((invoiced / budget) * 100)} %` : "—");
  if (week) {
    const end = dsIso(new Date(Date.now() + 6 * 86400000)),
      inWeek = (d) => d && d >= today && d <= end,
      events = [
        ...visits
          .filter((v) => ["Approved", "Checked in"].includes(v.status) && inWeek(v.date))
          .map((v) => ({
            date: v.date,
            tone: "blue",
            title: `${v.supplierCompany} crew on site`,
            sub: [v.siteName, v.permitLabel].filter(Boolean).join(" · "),
          })),
        ...unpaid
          .filter((i) => inWeek(i.scheduledPayment))
          .map((i) => ({
            date: i.scheduledPayment,
            tone: "orange",
            title: `Invoice ${invNo(i)} due`,
            sub: `${money(i.amount)} · ${i.supplierCompany || ""}`.replace(/ · $/, ""),
          })),
        ...open
          .filter(({ t }) => inWeek(t.dueDate))
          .map(({ t }) => ({
            date: t.dueDate,
            tone: "green",
            title: t.name,
            sub: `${Number(t.progress || 0)} % · ${t.dueDate < today ? "late" : "on track"}`,
          })),
      ]
        .sort((a, b) => a.date.localeCompare(b.date))
        .slice(0, 4);
    const lang = typeof i18nLang !== "undefined" && i18nLang === "de" ? "de-DE" : "en-GB";
    week.querySelector(".ds-week-list").innerHTML = events.length
      ? events
          .map((e) => {
            const d = new Date(e.date + "T12:00:00");
            return `<div class="ds-week-row"><div class="ds-week-date" data-no-i18n><span${e.date === today ? ' class="ds-red"' : ""}>${d.toLocaleDateString(lang, { weekday: "short" }).replace(".", "").toUpperCase()}</span><b>${d.getDate()}</b></div><div class="ds-week-text ds-tone-${e.tone}"><b>${esc(e.title)}</b><span>${esc(e.sub)}</span></div></div>`;
          })
          .join("")
      : '<p class="ds-week-none">Nothing scheduled this week.</p>';
  }
}
function dsEnhanceDashboard(root) {
  if (!/^#\/(customer|supplier|admin)\/dashboard/.test(location.hash)) return;
  dsFillCustomerSide(root);
  dsFillSupplierSide(root);
  dsFillAdminSide(root);
  // "Customize" stays next to the main button as a quiet grey text button
  root.querySelector(".ds-dash-top .lc-toggle")?.classList.add("ds-quiet");
}

/* ---------- Project workspace with tabs (T98, board Workspace) ----------
   projectDetail renders one long page and other scripts add blocks after it. This enhancer builds the header,
   the tab bar and the Overview, then files every block of the page into its tab by class, on every render. */
const DS_WS_TAB = {}; // remembered tab per project (in memory)
const DS_WS_TASKS = ["project-timeline", "ff-task-time-details", "project-task-panel", "cc-project-explorer"];
const DS_WS_ACTIVITY = ["pa-project-activity"];
const dsWsData = new WeakMap();
const dsInitials = (name) =>
  String(name || "?")
    .split(/\s+/)
    .map((w) => w[0])
    .join("")
    .slice(0, 2)
    .toUpperCase();
const dsCompact = (n) => {
  const lang = typeof i18nLang !== "undefined" && i18nLang === "de" ? "de-DE" : "en-GB";
  return new Intl.NumberFormat(lang, { style: "currency", currency: "EUR", notation: "compact", maximumFractionDigits: 1 }).format(n || 0);
};
function dsWsRoute() {
  const m = location.hash.match(/^#\/(customer|supplier)\/projects\/([^/?]+)(\?.*)?$/);
  return m && m[2] !== "new" ? { role: m[1], pid: decodeURIComponent(m[2]), tab: new URLSearchParams(m[3] || "").get("tab") } : null;
}
function dsWsShow(content, tab) {
  const r = dsWsRoute();
  if (r) DS_WS_TAB[r.pid] = tab;
  content.querySelectorAll(":scope > .ds-ws-pane").forEach((p) => (p.hidden = p.dataset.tab !== tab));
  content.querySelectorAll(".ds-ws-tabs [data-tab]").forEach((b) => {
    const on = b.dataset.tab === tab;
    b.setAttribute("aria-selected", String(on));
    b.tabIndex = on ? 0 : -1;
  });
}
function dsWsTabKeys(e) {
  const tabs = [...e.currentTarget.querySelectorAll('[role="tab"]')],
    i = tabs.indexOf(document.activeElement);
  if (i < 0 || !["ArrowLeft", "ArrowRight"].includes(e.key)) return;
  e.preventDefault();
  tabs[(i + (e.key === "ArrowRight" ? 1 : tabs.length - 1)) % tabs.length].focus();
}
async function dsWsLoad(content, r) {
  if (dsWsData.has(content)) return dsWsData.get(content);
  const load = (async () => {
    const [{ project }, { invoices = [] }, time, docs] = await Promise.all([
      api("/projects/" + encodeURIComponent(r.pid)),
      api("/invoices").catch(() => ({})),
      r.role === "customer" ? api("/time-entries?projectId=" + encodeURIComponent(r.pid)).catch(() => ({})) : {},
      api(`/projects/${encodeURIComponent(r.pid)}/documents`).catch(() => ({})),
    ]);
    return {
      project,
      invoices: invoices.filter((i) => i.projectId === r.pid),
      entries: time.entries || [],
      documents: docs.documents || [],
    };
  })();
  dsWsData.set(content, load);
  return load;
}
function dsWsSupplierName(t) {
  return [...(t.assignmentHistory || [])].reverse().find((h) => h.supplierId === t.assignedSupplierId)?.company || "";
}
function dsWsUpNext(r, d) {
  const today = dsToday(),
    p = d.project,
    tasks = (p.phases || []).flatMap((ph) => (ph.tasks || []).map((t) => ({ ph, t }))),
    rows = [],
    row = (tone, title, sub, href, label, primary) =>
      rows.push(
        `<div class="ds-next-row"><span class="ds-next-dot ds-dot-${tone}"></span><div class="ds-next-text"><b>${esc(title)}</b>${sub ? `<span>${esc(sub)}</span>` : ""}</div><a class="btn small ${primary ? "primary" : "secondary"}" href="#${esc(href)}">${esc(label)}</a></div>`,
      ),
    taskLink = (ph, t) => `/${r.role}/projects/${p.id}/tasks/${t.id}`,
    late = ({ t }) => t.status !== "Completed" && t.dueDate && t.dueDate < today;
  if (r.role === "customer") {
    for (const i of d.invoices.filter((i) => i.status === "Submitted"))
      row("blue", `Invoice ${invNo(i)} · ${money(i.amount)}`, i.supplierCompany || i.taskName || "", `/customer/invoice/${i.id}`, "Review", true);
    const pending = d.entries.filter((e) => e.status === "Pending approval");
    if (pending.length)
      row(
        "blue",
        pending.length === 1 ? "Approve 1 time entry" : `Approve ${pending.length} time entries`,
        `${pending.reduce((a, e) => a + Number(e.hours || 0), 0)} h`,
        "/customer/time",
        "Review",
        true,
      );
    for (const { ph, t } of tasks.filter(({ t }) => t.acceptanceStatus === "Pending"))
      row("orange", `${t.name} is waiting for ${dsWsSupplierName(t) || "the supplier"}`, "No answer yet", taskLink(ph, t), "Open");
    const docs = d.documents.filter((x) => x.status === "Pending approval").length;
    if (docs) row("orange", docs === 1 ? "1 document to approve" : `${docs} documents to approve`, "", `/customer/projects/${p.id}/documents`, "Review");
    for (const x of tasks.filter(late)) {
      const n = Math.max(1, dsDaysBetween(x.t.dueDate, today));
      row("red", `${x.t.name} · ${n === 1 ? "1 day" : `${n} days`} late`, dsWsSupplierName(x.t), taskLink(x.ph, x.t), "Open");
    }
  } else {
    const sid = state.user?.supplierId;
    for (const { ph, t } of tasks.filter(({ t }) => t.assignedSupplierId === sid && t.acceptanceStatus === "Pending"))
      row("orange", `${t.name} · invitation`, ph.name, `/supplier/projects?invite=${t.id}`, "Respond", true);
    for (const x of tasks.filter((x) => x.t.assignedSupplierId === sid && late(x))) {
      const n = Math.max(1, dsDaysBetween(x.t.dueDate, today));
      row("red", `${x.t.name} · ${n === 1 ? "1 day" : `${n} days`} late`, x.ph.name, taskLink(x.ph, x.t), "Open");
    }
    for (const i of d.invoices.filter((i) => i.status === "Changes Requested"))
      row("orange", `Changes requested on invoice ${invNo(i)}`, i.comments || "", `/supplier/invoice/${i.id}`, "Fix", true);
  }
  return rows.length ? rows.join("") : '<p class="ds-next-none">Nothing is waiting for you on this project.</p>';
}
function dsWsPhases(r, d) {
  const today = dsToday();
  return (d.project.phases || [])
    .map((ph) => {
      const tasks = ph.tasks || [],
        done = tasks.filter((t) => t.status === "Completed").length,
        late = tasks.filter((t) => t.status !== "Completed" && t.dueDate && t.dueDate < today).length,
        pct = tasks.length ? Math.round(tasks.reduce((a, t) => a + Number(t.status === "Completed" ? 100 : t.progress || 0), 0) / tasks.length) : 0,
        finished = ph.status === "Completed" || (tasks.length && done === tasks.length),
        colour = finished ? "var(--cc-green)" : late ? "var(--cc-orange)" : "var(--cc-blue)";
      return `<div class="ds-phase-row"><div class="ds-phase-name"><b>${esc(ph.name)}</b><span>${tasks.length === 1 ? `${done} of 1 task` : `${done} of ${tasks.length} tasks`}${late ? ` · ${late} late` : ""}</span></div><div class="ds-bar"><i style="width:${finished ? 100 : pct}%;background:${colour}"></i></div><span class="ds-phase-end${finished ? " ds-green ds-ui" : ""}">${finished ? "Done" : ph.dueDate ? dsShortRange(ph.dueDate) : ""}</span></div>`;
    })
    .join("");
}
function dsWsSide(r, d) {
  const p = d.project,
    today = dsToday(),
    tasks = (p.phases || []).flatMap((ph) => ph.tasks || []),
    mine = r.role === "supplier" ? tasks.filter((t) => t.assignedSupplierId === state.user?.supplierId) : tasks,
    pct = mine.length ? Math.round(mine.reduce((a, t) => a + Number(t.status === "Completed" ? 100 : t.progress || 0), 0) / mine.length) : 0,
    left = p.dueDate ? dsDaysBetween(today, p.dueDate) : null,
    C = 2 * Math.PI * 36,
    ring = `<svg class="ds-ring" viewBox="0 0 84 84" aria-hidden="true"><circle cx="42" cy="42" r="36" fill="none" stroke="#F0F0F2" stroke-width="9"/>${pct > 0 ? `<circle cx="42" cy="42" r="36" fill="none" stroke="#2563EB" stroke-width="9" stroke-linecap="round" stroke-dasharray="${(C * pct) / 100} ${C}" transform="rotate(-90 42 42)"/>` : ""}</svg>`,
    late = mine.filter((t) => t.status !== "Completed" && t.dueDate && t.dueDate < today).length,
    open = mine.filter((t) => t.status !== "Completed").length,
    invoiced = d.invoices.filter((i) => !["Rejected", "Draft"].includes(i.status)).reduce((a, i) => a + Number(i.amount || 0), 0),
    ordered = mine.filter((t) => ["Accepted", "Pending"].includes(t.acceptanceStatus)).reduce((a, t) => a + Number(t.orderAmount || 0), 0),
    pendingDocs = d.documents.filter((x) => x.status === "Pending approval").length;
  // The facts of the old four cards that have no other place on this tab
  const facts = [
    p.startDate || p.dueDate ? dsShortRange(p.startDate, p.dueDate) : "",
    `${mine.length - open} of ${mine.length} tasks complete`,
    `${late} overdue · ${open} open tasks`,
    r.role === "customer" && p.budget ? `${money(Math.max(0, p.budget - invoiced))} of budget remaining · ${money(invoiced)} invoiced` : "",
    `${d.documents.length} documents · ${pendingDocs} to approve`,
    d.invoices.length === 1 ? "1 invoice" : `${d.invoices.length} invoices`,
    r.role === "customer" ? dsWsAvailable : "",
  ].filter(Boolean);
  let html = `<h2 class="ds-dash-h ds-ui">Progress</h2><section class="ds-card ds-progress"><div class="ds-progress-top">${ring}<div><b>${pct} %</b><span>${left === null ? "complete" : left >= 0 ? `complete · ${left === 1 ? "1 day" : `${left} days`} left` : `complete · ${-left === 1 ? "1 day" : `${-left} days`} over`}</span></div></div><p class="ds-facts-line">${facts.map((f) => `<span>${esc(f)}</span>`).join("")}</p></section>`;
  if (r.role === "customer") {
    const budget = Number(p.budget || 0),
      w = (n) => (budget ? Math.min(100, (n / budget) * 100) : 0),
      orderedOnly = Math.max(0, ordered - invoiced),
      free = Math.max(0, budget - invoiced - orderedOnly);
    html += `<section class="ds-card ds-budget"><div class="ds-budget-head"><h3 class="ds-ui">Budget</h3><b>${money(budget)}</b></div><div class="ds-budget-bar"><i style="width:${w(invoiced)}%;background:#2563EB"></i><i style="width:${w(orderedOnly)}%;background:#A8C4F7"></i></div><div class="ds-budget-legend ds-ui"><span><b data-no-i18n>${dsCompact(invoiced)}</b>Invoiced</span><span><b data-no-i18n>${dsCompact(orderedOnly)}</b>Ordered</span><span><b data-no-i18n>${dsCompact(free)}</b>Free</span></div></section>`;
    const bySupplier = new Map();
    for (const t of tasks.filter((t) => t.assignedSupplierId)) {
      const name = dsWsSupplierName(t) || t.assignedSupplierId,
        state_ =
          t.acceptanceStatus === "Pending"
            ? "Invited"
            : t.status === "Completed"
              ? "Done"
              : t.dueDate && t.dueDate < today
                ? "Late"
                : "Working",
        rank = { Late: 4, Invited: 3, Working: 2, Done: 1 },
        cur = bySupplier.get(name);
      if (!cur || rank[state_] > rank[cur]) bySupplier.set(name, state_);
    }
    const tone = { Working: "green", Late: "red", Invited: "orange", Done: "grey" };
    html += `<section class="ds-card ds-suppliers"><h3 class="ds-ui">Suppliers</h3>${
      [...bySupplier]
        .map(([name, st]) => `<div class="ds-supplier-row"><span class="ds-avatar ds-tint-${tone[st] === "green" ? "blue" : tone[st] === "red" ? "orange" : "blue"}">${esc(dsInitials(name))}</span><span class="ds-supplier-name">${esc(name)}</span><span class="status" data-ds-fixed data-ds-tone="${tone[st]}">${st}</span></div>`)
        .join("") || '<p class="ds-next-none">No supplier assigned yet.</p>'
    }</section>`;
  } else {
    html += `<section class="ds-card ds-budget"><div class="ds-budget-head"><h3 class="ds-ui">Your order value</h3><b>${money(ordered)}</b></div><div class="ds-budget-bar"><i style="width:${ordered ? Math.min(100, (invoiced / ordered) * 100) : 0}%;background:#2563EB"></i></div><div class="ds-budget-legend ds-two ds-ui"><span><b data-no-i18n>${dsCompact(invoiced)}</b>Invoiced by you</span><span><b data-no-i18n>${dsCompact(Math.max(0, ordered - invoiced))}</b>Still to invoice</span></div></section>`;
  }
  return html;
}
let dsWsAvailable = "";
function dsEnhanceWorkspace(root) {
  const r = dsWsRoute(),
    content = root.querySelector(".dashboard-content");
  if (!r || !content) return;
  const top = content.querySelector(":scope > .dash-top");
  if (!top) return;
  // Remember "N available suppliers" from the old Project desk card before it is hidden
  const desk = [...content.querySelectorAll(":scope > .wf-stat-grid small")].map(dsText).join(" ");
  const avail = desk.match(/(\d+) available suppliers/);
  if (avail) dsWsAvailable = `${avail[1]} available suppliers`;
  const invitedOnly = !!content.querySelector(".inv-wait") && !content.querySelector(":scope > .wf-project-nav, .ds-ws-tabs");
  let tabs = content.querySelector(":scope > .ds-ws-tabs");
  if (!tabs && !invitedOnly && content.querySelector(":scope > .wf-project-nav")) {
    const nav = content.querySelector(":scope > .wf-project-nav");
    tabs = document.createElement("div");
    tabs.className = "ds-ws-tabs ds-ui";
    tabs.setAttribute("role", "tablist");
    tabs.setAttribute("aria-label", "Project sections");
    const tabBtn = (key, label) =>
      `<button type="button" role="tab" data-tab="${key}" aria-selected="false" onclick="dsWsShow(this.closest('.dashboard-content'), '${key}')">${label}</button>`;
    tabs.innerHTML = tabBtn("overview", "Overview") + tabBtn("tasks", "Tasks");
    // Files, Messages and Invoices: the old navigation buttons move into the tab bar and keep their onclick
    const byText = (re) => [...nav.querySelectorAll("button, a")].find((b) => re.test(dsText(b)));
    const files = byText(/documents/i),
      messages = byText(/messages/i),
      invoices = byText(/invoices/i);
    for (const [btn, label] of [
      [files, null],
      [messages, "Messages"],
      [invoices, "Invoices"],
    ]) {
      if (!btn) continue;
      btn.className = "ds-ws-link";
      // Part of the tab bar for assistive tech; activating it opens its page as before
      btn.setAttribute("role", "tab");
      btn.setAttribute("aria-selected", "false");
      btn.tabIndex = -1;
      if (label) btn.replaceChildren(label);
      else btn.replaceChildren(`Files (${(dsText(btn).match(/\((\d+)\)/) || [, "0"])[1]})`);
      tabs.append(btn);
    }
    tabs.insertAdjacentHTML("beforeend", tabBtn("activity", "Activity"));
    tabs.addEventListener("keydown", dsWsTabKeys);
    // Anything else in the old navigation (Compare offers) becomes a grey pill in the header
    const actions = top.querySelector(":scope > .cc-actions");
    for (const rest of [...nav.querySelectorAll("button, a")]) {
      rest.classList.add("btn", "outline");
      actions ? actions.prepend(rest) : top.append(rest);
    }
    nav.remove();
    top.after(tabs);
    for (const key of ["overview", "tasks", "activity"]) {
      const pane = document.createElement("div");
      pane.className = `ds-ws-pane ds-ws-${key}`;
      pane.dataset.tab = key;
      content.append(pane);
    }
    dsWsShow(content, r.tab || DS_WS_TAB[r.pid] || "overview");
  }
  // File every block into its tab (also blocks other scripts add later)
  if (tabs) {
    const pane = (key) => content.querySelector(`:scope > .ds-ws-pane[data-tab="${key}"]`);
    for (const el of [...content.children]) {
      if (el === top || el === tabs || el.classList.contains("ds-ws-pane") || el.classList.contains("breadcrumb") || el.classList.contains("inv-wait")) continue;
      if (el.classList.contains("wf-stat-grid")) {
        el.classList.add("ds-hidden"); // its facts are shown under the progress ring
        continue;
      }
      const target = DS_WS_TASKS.some((c) => el.classList.contains(c))
        ? "tasks"
        : DS_WS_ACTIVITY.some((c) => el.classList.contains(c))
          ? "activity"
          : "overview";
      pane(target).append(el);
    }
  }
  // Header and Overview need the project data once per render
  if (top.dataset.ds || dsWsData.has(content)) return;
  top.dataset.ds = "1";
  dsWsLoad(content, r).then((d) => {
    if (!document.contains(content)) return;
    const p = d.project,
      text = top.querySelector(":scope > div:first-child");
    if (text) {
      const company = r.role === "customer" ? state.user?.company : p.customerCompany;
      text.classList.add("ds-ws-head");
      text.innerHTML = `<span class="ds-ws-meta">${esc([company, p.startDate || p.dueDate ? dsShortRange(p.startDate, p.dueDate) : ""].filter(Boolean).join(" · "))}</span><div class="ds-ws-title"><h1>${esc(p.name)}</h1><span class="status">${esc(p.status || "")}</span></div>${p.description ? `<p>${esc(p.description)}</p>` : ""}`;
    }
    if (r.role === "customer" && d.invoices.some((i) => i.status === "Submitted")) {
      const actions = top.querySelector(":scope > .cc-actions");
      actions?.insertAdjacentHTML(
        "beforeend",
        `<a class="btn primary ds-review-invoices" href="#/customer/invoices?project=${encodeURIComponent(p.id)}">Review invoices</a>`,
      );
    }
    const overview = content.querySelector(':scope > .ds-ws-pane[data-tab="overview"]');
    if (!overview) return;
    overview.insertAdjacentHTML(
      "afterbegin",
      `<div class="ds-dash-cols ds-ws-cols"><div class="ds-dash-main"><h2 class="ds-dash-h ds-ui">Up next</h2><div class="ds-card ds-next">${dsWsUpNext(r, d)}</div><h2 class="ds-dash-h ds-ui ds-gap">Phases</h2><div class="ds-card ds-phases">${dsWsPhases(r, d) || '<p class="ds-next-none">No phases yet.</p>'}</div></div><div class="ds-dash-side">${dsWsSide(r, d)}</div></div>`,
    );
  });
}

/* ---------- Task board with a side panel (T99, board BoardDrawer) ----------
   inBoard renders the columns and binds drag and drop, arrow keys and the move locks; the wrapper restyles the
   header, the columns and the cards, and opens a side panel instead of a new page. */
const DS_COL_LABEL = { "Not Started": "To Do", Completed: "Done" }; // labels only; statuses stay
let dsBoard = null; // { role, project, suppliers }
const dsBaseInBoard = inBoard;
inBoard = async function (role, pid) {
  await dsBaseInBoard(role, pid);
  const content = document.querySelector(".dashboard-content");
  if (!content) return;
  const { project: p, suppliers = [] } = await api(`/projects/${pid}`).catch(() => ({}));
  if (!p || !document.contains(content)) return;
  dsBoard = { role, project: p, suppliers };
  content.classList.add("ds-board");
  // Header: project name as the way back, "Board" as the title; the old breadcrumb link moves here
  const top = content.querySelector(":scope > .dash-top"),
    text = top?.querySelector(":scope > div:first-child"),
    crumb = content.querySelector(":scope > .breadcrumb");
  if (text) {
    const back = crumb?.querySelector("a");
    const hint = text.querySelector("p");
    text.className = "ds-board-head";
    text.replaceChildren();
    if (back) {
      back.className = "ds-board-back";
      back.replaceChildren(p.name);
      text.append(back);
    }
    text.insertAdjacentHTML("beforeend", '<h1 class="ds-ui">Board</h1>');
    if (hint) text.append(hint);
    crumb?.remove();
  }
  // Phase filter as a segmented control (the select stays for more than 4 phases)
  const toolbar = top?.querySelector(".in-toolbar"),
    select = toolbar?.querySelector("#inPhase"),
    phases = p.phases || [];
  if (select && phases.length <= 4) {
    const current = new URLSearchParams(location.hash.split("?")[1] || "").get("phase") || "";
    const seg = (id, label) =>
      `<a role="tab" aria-selected="${id === current}" href="#/${role}/projects/${pid}/board${id ? "?phase=" + encodeURIComponent(id) : ""}">${esc(label)}</a>`;
    select.classList.add("ds-hidden");
    select.insertAdjacentHTML(
      "afterend",
      `<div class="ds-seg" role="tablist" aria-label="Phase">${seg("", "All phases")}${phases.map((ph) => seg(ph.id, String(ph.name).split(/[\s&]+/)[0])).join("")}</div>`,
    );
  }
  // Columns: labels, dots, counts
  for (const col of content.querySelectorAll(".in-col")) {
    const b = col.querySelector("header b"),
      label = DS_COL_LABEL[col.dataset.status];
    if (b && label) b.replaceChildren(label);
    col.classList.add("ds-col-" + String(col.dataset.status).toLowerCase().replace(/\s+/g, "-"));
  }
  // Cards
  const today = dsToday(),
    company = (id) => suppliers.find((s) => s.id === id)?.company || "",
    tasks = new Map(phases.flatMap((ph) => (ph.tasks || []).map((t) => [t.id, { ph, t }])));
  for (const card of content.querySelectorAll(".in-card")) {
    const hit = tasks.get(card.dataset.task),
      ph = hit?.ph || phases.find((x) => x.id === card.dataset.phase),
      t = hit?.t,
      item = t || ph;
    if (!item) continue;
    const link = card.querySelector("a"),
      status = card.closest(".in-col")?.dataset.status,
      done = status === "Completed",
      late = !done && item.dueDate && item.dueDate < today,
      sup = company(t ? t.assignedSupplierId : ph.supplierId),
      pct = Number(t?.progress) || 0,
      lockedNote = card.classList.contains("locked") ? '<span class="ds-lock" title="Only the assigned supplier or the customer can move this card" aria-label="Locked">' +
        '<svg viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2" aria-hidden="true"><rect x="5" y="11" width="14" height="9" rx="2"/><path d="M8 11V8a4 4 0 0 1 8 0v3"/></svg></span>' : "",
      chips = [
        t && t.acceptanceStatus === "Pending" ? `<span class="status" data-ds-fixed data-ds-tone="orange">Awaiting ${esc(sup || "supplier")}</span>` : "",
        late ? `<span class="status" data-ds-fixed data-ds-tone="red">${dsDaysLate(item.dueDate)}</span>` : "",
      ].join(""),
      due = item.dueDate ? `due ${dsShortRange(item.dueDate)}` : "",
      meta = sup && t ? [sup, `${pct} %`, due] : [ph.name, due, t && !sup ? "no supplier yet" : ""];
    link.className = "ds-card-title";
    card.innerHTML = "";
    card.append(link);
    card.insertAdjacentHTML(
      "beforeend",
      `${lockedNote}${chips ? `<div class="ds-card-chips">${chips}</div>` : ""}${!done && status === "In Progress" && t ? `<div class="ds-card-bar"><i style="width:${pct}%"></i></div>` : ""}<div class="ds-card-meta">${done ? `<span class="ds-accepted ds-ui" data-task="${esc(t?.id || "")}">Done</span>` : esc(meta.filter(Boolean).join(" · "))}</div>`,
    );
    card.classList.toggle("ds-done", done);
    if (t) card.dataset.dsPanel = "1";
  }
  // "Accepted <date>" for finished tasks with a signed acceptance report
  for (const el of content.querySelectorAll(".ds-accepted[data-task]:not([data-task=''])"))
    api(`/projects/${pid}/tasks/${el.dataset.task}/acceptance`)
      .then(({ acceptance: a }) => {
        if (a && ["accepted", "accepted_with_defects"].includes(a.result))
          el.replaceChildren(`Accepted ${dsShortRange(String(a.createdAt).slice(0, 10))}`);
      })
      .catch(() => {});
};
function dsBoardCard(el) {
  return el?.closest?.('.ds-board .in-card[data-ds-panel="1"]');
}
// A click or Enter on a card opens the side panel; ctrl/cmd/shift-click and the middle button still open the page.
document.addEventListener(
  "click",
  (e) => {
    const card = dsBoardCard(e.target);
    if (!card || e.ctrlKey || e.metaKey || e.shiftKey || e.button !== 0) return;
    e.preventDefault();
    dsOpenPanel(card);
  },
  true,
);
document.addEventListener("keydown", (e) => {
  if (e.key === "Escape" && document.querySelector(".ds-panel")) return dsClosePanel();
  const card = dsBoardCard(e.target);
  if (card && e.key === "Enter" && e.target === card) {
    e.preventDefault();
    dsOpenPanel(card);
  }
});
function dsClosePanel() {
  const panel = document.querySelector(".ds-panel"),
    card = document.querySelector(".in-card.ds-selected");
  panel?.remove();
  document.querySelector(".ds-board")?.classList.remove("ds-panel-open");
  card?.classList.remove("ds-selected");
  card?.focus();
}
function dsOpenPanel(card) {
  if (!dsBoard) return;
  const { role, project: p, suppliers } = dsBoard,
    ph = (p.phases || []).find((x) => x.id === card.dataset.phase),
    t = ph?.tasks?.find((x) => x.id === card.dataset.task);
  if (!t) return;
  document.querySelector(".ds-panel")?.remove();
  document.querySelectorAll(".in-card.ds-selected").forEach((c) => c.classList.remove("ds-selected"));
  card.classList.add("ds-selected");
  const sup = suppliers.find((s) => s.id === t.assignedSupplierId)?.company || "",
    mineSupplier = role === "supplier" && t.assignedSupplierId === state.user?.supplierId,
    canTick = role === "customer" || (mineSupplier && t.acceptanceStatus === "Accepted"),
    status = card.closest(".in-col")?.dataset.status || t.status,
    items = t.subtasks || [],
    upd = (t.progressUpdates || [])[0],
    fact = (label, value) => `<div><span class="ds-ui">${label}</span><b>${esc(value)}</b></div>`;
  const panel = document.createElement("aside");
  panel.className = "ds-panel";
  panel.setAttribute("role", "dialog");
  panel.setAttribute("aria-label", t.name);
  panel.innerHTML = `<div class="ds-panel-head"><div><span>${esc(ph.name)}</span><h2>${esc(t.name)}</h2></div><button type="button" class="ds-panel-close" aria-label="Close" onclick="dsClosePanel()">×</button></div>
    <div class="ds-panel-facts">${fact("Status", `${status} · ${Number(t.progress) || 0} %`)}${fact("Supplier", sup || "—")}${fact("Dates", dsShortRange(t.startDate, t.dueDate))}${role === "customer" || mineSupplier ? fact("Order", t.orderAmount ? money(t.orderAmount) : "—") : ""}</div>
    ${t.description ? `<p class="ds-panel-desc">${esc(t.description)}</p>` : ""}
    ${items.length ? `<h3 class="ds-panel-h">Checklist · ${items.filter((x) => x.done).length} of ${items.length}</h3><div class="ds-panel-list">${items.map((x, i) => `<label><input type="checkbox" data-i="${i}" ${x.done ? "checked" : ""} ${canTick ? "" : "disabled"}> <span>${esc(x.name || x.text)}</span></label>`).join("")}</div>` : ""}
    ${upd ? `<h3 class="ds-panel-h">Latest update</h3><blockquote class="ds-panel-quote"><p>“${esc(upd.note || upd.milestone || `${upd.status} · ${upd.progress} %`)}”</p><span>${esc([upd.byName, upd.company, dsShortRange(String(upd.at).slice(0, 10))].filter(Boolean).join(" · "))}</span></blockquote>` : ""}
    <div class="ds-panel-foot"><a class="btn secondary" href="#/${role}/messages?project=${encodeURIComponent(p.id)}&phase=${encodeURIComponent(ph.id)}&task=${encodeURIComponent(t.id)}">Message</a><a class="btn primary" href="#/${role}/projects/${encodeURIComponent(p.id)}/tasks/${encodeURIComponent(t.id)}">Open Task</a></div>`;
  panel.querySelectorAll('input[type="checkbox"]').forEach((box) =>
    box.addEventListener("change", async () => {
      const next = items.map((x, i) => (i === Number(box.dataset.i) ? { ...x, done: box.checked } : x));
      box.disabled = true;
      try {
        await api(`/projects/${p.id}/phases/${ph.id}/tasks/${t.id}`, { method: "PATCH", body: { subtasks: next } });
        t.subtasks = next;
        items.splice(0, items.length, ...next);
        panel.querySelector(".ds-panel-h").replaceChildren(`Checklist · ${next.filter((x) => x.done).length} of ${next.length}`);
      } catch (err) {
        box.checked = !box.checked;
        toast(err.message, "error");
      } finally {
        box.disabled = false;
      }
    }),
  );
  document.body.append(panel);
  document.querySelector(".ds-board")?.classList.add("ds-panel-open");
  panel.querySelector(".ds-panel-close").focus();
}
window.addEventListener("hashchange", () => document.querySelector(".ds-panel") && dsClosePanel());

/* ---------- Offer comparison (T100, board OfferCompare) ----------
   srEvent renders the weights panel and the ranked table; the wrapper adds the board's header and one card per
   offer above them, using the same scoring (srScoreOffers) and the same actions (srAward, rvRequestOfferChanges,
   reviewOfferTalk, wfBidDecision). The weights panel folds away behind "Change weights ›". */
const dsBaseSrEvent = srEvent;
srEvent = async function (bidId) {
  await dsBaseSrEvent(bidId);
  const content = document.querySelector(".dashboard-content"),
    top = content?.querySelector(":scope > .dash-top");
  if (!top || !document.getElementById("srResults")) return;
  const [{ bids = [] }, { scorecards = [] }, { suppliers = [] }, { projects = [] }] = await Promise.all([
    api("/bids"),
    api("/scorecards").catch(() => ({})),
    api("/suppliers"),
    api("/projects").catch(() => ({})),
  ]);
  const bid = bids.find((b) => b.id === bidId);
  if (!bid || !document.contains(top)) return;
  content.classList.add("ds-compare");
  const weightsPanel = content.querySelector(".sr-weights")?.closest("section"),
    weights = () => {
      const w = { ...SR_WEIGHTS, ...(bid.weights || {}) };
      weightsPanel?.querySelectorAll("input[type=range]").forEach((i) => (w[i.name] = Number(i.value)));
      return w;
    };
  if (weightsPanel) {
    weightsPanel.id = "dsWeights";
    weightsPanel.classList.add("ds-hidden");
  }
  // Header: kicker, question, the weights in one sentence; the toolbar stays on the right
  const text = top.querySelector(":scope > div:first-child");
  const kickerParts = [bid.projectName, bid.status, bid.dueDate ? `closes ${dsShortRange(bid.dueDate)}` : ""].filter(Boolean);
  if (text) {
    text.className = "ds-compare-head";
    // The bid status is a noun here ("Open" = "Offen", not the verb "Öffnen"), so it is translated directly
    const statusDe = { Open: "Offen", Shortlist: "Vorauswahl", "Second round": "Zweite Runde", "Final round": "Finale Runde", Awarded: "Vergeben", Closed: "Geschlossen" };
    const label = (x) =>
      x === bid.status && typeof i18nLang !== "undefined" && i18nLang === "de" && statusDe[x]
        ? `<span data-no-i18n>${esc(statusDe[x])}</span>`
        : `<span>${esc(x)}</span>`;
    text.innerHTML = `<span class="ds-compare-kicker">${kickerParts.map(label).join("")}</span><h1 class="ds-ui">Which offer is right for you?</h1><p><span class="ds-weights-line"></span> <button type="button" class="ds-text-link ds-weights-toggle" aria-expanded="false" aria-controls="dsWeights">Change weights ›</button></p><span class="ds-compare-title">${esc(bid.title)}${bid.taskName ? ` · ${esc(bid.taskName)}` : ""}</span>`;
    text.querySelector(".ds-weights-toggle").onclick = (e) => {
      const open = weightsPanel?.classList.toggle("ds-hidden") === false;
      e.currentTarget.setAttribute("aria-expanded", String(open));
    };
  }
  const box = document.createElement("div");
  box.className = "ds-offers-wrap";
  top.after(box);
  const jobsWith = (sid) =>
    new Set(projects.filter((p) => (p.phases || []).some((ph) => (ph.tasks || []).some((t) => t.assignedSupplierId === sid && t.acceptanceStatus === "Accepted"))).map((p) => p.id)).size;
  const render = () => {
    const w = weights(),
      total = Object.values(w).reduce((a, b) => a + b, 0) || 1,
      pct = (k) => Math.round(((w[k] || 0) / total) * 100);
    const line = text?.querySelector(".ds-weights-line");
    if (line)
      line.replaceChildren(
        `Ranked by price ${pct("price")} %, delivery ${pct("delivery")} %, track record ${pct("quality")} % and experience ${pct("experience")} %.`,
      );
    const ranked = srScoreOffers(bid, scorecards, suppliers, w),
      active = SR_ACTIVE.includes(bid.status),
      fastest = [...ranked].sort((a, b) => (Number(a.o.deliveryDays) || 1e9) - (Number(b.o.deliveryDays) || 1e9))[0];
    box.innerHTML = ranked.length
      ? `<div class="ds-offers">${ranked.map((r, i) => dsOfferCard(bid, r, i, r === fastest, active, jobsWith(r.o.supplierId))).join("")}</div><p class="ds-offers-foot ds-ui">Awarding assigns the task to this supplier at the offered price, marks the other offers as not selected and creates a draft contract you can review first.</p>`
      : "";
  };
  weightsPanel?.addEventListener("input", render);
  weightsPanel?.querySelector("#srReset")?.addEventListener("click", () => setTimeout(render));
  render();
};
function dsDocsRow(card) {
  const texts = (card?.risks || []).map((r) => r.text);
  if (!card) return "";
  const expired = texts.find((t) => /compliance document\(s\) expired|insurance expired/i.test(t)),
    soon = texts.map((t) => t.match(/insurance expires in (\d+) day/i)).find(Boolean);
  if (expired) return `<span class="ds-red">${esc(expired)}</span>`;
  if (soon) return `<span class="ds-orange">1 expires ${dsShortRange(dsIso(new Date(Date.now() + Number(soon[1]) * 86400000)))}</span>`;
  if (texts.some((t) => /No insurance evidence/i.test(t))) return ""; // unknown: leave the row out
  return '<span class="ds-green">All valid</span>';
}
function dsOfferCard(bid, r, i, isFastest, active, jobs) {
  const o = r.o,
    revised = (o.revisions || []).length > 0,
    was = revised ? o.revisions.at(-1).amount : null,
    chip =
      i === 0
        ? `<span class="ds-offer-chip ds-chip-best">Best match · ${r.score}</span>`
        : revised
          ? `<span class="status" data-ds-fixed data-ds-tone="orange">Revised · ${r.score}</span>`
          : isFastest
            ? `<span class="status" data-ds-fixed data-ds-tone="green">Fastest · ${r.score}</span>`
            : `<span class="status" data-ds-fixed data-ds-tone="grey">${r.score}</span>`,
    under = revised
      ? `<span class="ds-muted">Was ${money(was)}</span>`
      : r.savings === null
        ? ""
        : r.savings >= 0
          ? `<span class="ds-green ds-strong">${money(r.savings)} under your budget</span>`
          : `<span class="ds-red">${money(-r.savings)} over your budget</span>`,
    rating = r.card?.metrics?.rating || r.s.rating,
    docs = dsDocsRow(r.card),
    short = String(o.supplierCompany || "").split(/\s+/)[0],
    decided = !(active && o.status === "Submitted");
  return `<article class="ds-offer${i === 0 ? " ds-offer-best" : ""}">
    <div>${chip}</div>
    <div class="ds-offer-name"><b>${esc(o.supplierCompany)}</b>${r.s.location ? `<span>${esc(r.s.location)}</span>` : ""}</div>
    <div class="ds-offer-price"><b>${money(o.amount)}</b>${under}${o.hourlyRate ? bmRateNote(o.hourlyRate, bid.category || bid.taskName) : ""}</div>
    <dl class="ds-offer-rows">
      <div><dt class="ds-ui">Delivery</dt><dd>${o.deliveryDays ? `${Number(o.deliveryDays)} days` : "—"}</dd></div>
      <div><dt class="ds-ui">Rating</dt><dd>${rating ? `★ ${rating} · ` : ""}${jobs ? `${jobs === 1 ? "1 job" : `${jobs} jobs`} with you` : "new to you"}</dd></div>
      ${docs ? `<div><dt class="ds-ui">Documents</dt><dd>${docs}</dd></div>` : ""}
      ${o.notes ? `<div><dt class="ds-ui">Includes</dt><dd class="ds-clamp">${esc(o.notes)}</dd></div>` : ""}
    </dl>
    ${
      decided
        ? `<div class="ds-offer-decided"><span class="status">${esc(o.status)}</span></div>`
        : `<button type="button" class="btn ${i === 0 ? "primary" : "secondary"} ds-award" onclick="srAward('${esc(bid.id)}','${esc(o.id)}')">Award ${esc(short)}</button>
    <div class="ds-offer-links"><button type="button" onclick="rvRequestOfferChanges('${esc(bid.id)}','${esc(o.id)}')">Request changes</button><button type="button" onclick="reviewOfferTalk('${esc(bid.id)}','${esc(o.id)}')">Ask for details</button><button type="button" class="ds-red" onclick="wfBidDecision('${esc(bid.id)}','${esc(o.id)}','Decline offer')">Eliminate</button></div>`
    }
  </article>`;
}
/* Offers overview: every bid with offers links to its comparison */
function dsEnhanceOffers(root) {
  if (!/^#\/customer\/offers/.test(location.hash)) return;
  root.querySelectorAll(".wf-bid-card:not([data-ds])").forEach((card) => {
    card.dataset.ds = "1";
    const id = (card.innerHTML.match(/'(bid_[A-Za-z0-9_-]+)'/) || [])[1];
    if (!id || !card.querySelector(".wf-offer-row")) return;
    const head = card.querySelector("h3, h2") || card.firstElementChild;
    head?.insertAdjacentHTML("afterend", `<a class="ds-text-link ds-compare-link" href="#/customer/sourcing/${encodeURIComponent(id)}">Compare offers ›</a>`);
  });
}

/* ---------- Invoice review (T101, board InvoiceReview) ----------
   invoiceDetailPage renders the old page; the wrapper lays it out as "paper" on the left and a review panel on the
   right. The existing buttons move (they keep their onclick); the notices and the revision history stay below. */
const dsBaseInvoiceDetail = invoiceDetailPage;
invoiceDetailPage = async function (id) {
  await dsBaseInvoiceDetail(id);
  const content = document.querySelector(".dashboard-content"),
    old = content?.querySelector(":scope > .invoice-paper");
  if (!old) return;
  const role = state.user?.role;
  const [{ invoice: i }, pd] = await Promise.all([
    api("/invoices/" + encodeURIComponent(id)),
    reviewProjects().catch(() => []),
  ]);
  if (!document.contains(old)) return;
  const p = pd.find((x) => x.id === i.projectId),
    ph = p?.phases.find((x) => x.id === i.phaseId),
    task = ph?.tasks?.find((x) => x.id === i.taskId);
  const entries = i.projectId
    ? (await api("/time-entries?projectId=" + encodeURIComponent(i.projectId)).catch(() => ({}))).entries || []
    : [];
  content.classList.add("ds-invoice");
  const back = content.querySelector(":scope > .review-back"),
    top = content.querySelector(":scope > .dash-top"),
    actions = top?.querySelectorAll(".cc-actions .btn") || [];
  // Left column: back link and small pills, then the paper, then everything else of the old page
  const left = document.createElement("div");
  left.className = "ds-inv-left";
  const bar = document.createElement("div");
  bar.className = "ds-inv-bar";
  if (back) {
    back.className = "ds-inv-back";
    back.replaceChildren("‹ Invoices");
    bar.append(back);
  }
  const pills = document.createElement("div");
  pills.className = "ds-inv-pills";
  const rename = (b) => {
      const t = dsText(b);
      b.className = "btn small secondary";
      if (/pdf/i.test(t)) b.replaceChildren("PDF");
      else if (/xrechnung/i.test(t)) b.replaceChildren("XRechnung");
      else if (/email/i.test(t)) b.replaceChildren("Email");
      pills.append(b);
    };
  actions.forEach(rename);
  bar.append(pills);
  left.append(bar);
  // The paper
  const prev = (i.revisions || []).at(-1),
    prevLines = prev?.lineItems || [],
    same = (a, b) =>
      String(a.service) === String(b.service) && Number(a.quantity) === Number(b.quantity) && Number(a.unitPrice || a.rate) === Number(b.unitPrice || b.rate),
    lines = (i.lineItems || []).length ? i.lineItems : [{ service: i.description || "Services delivered", quantity: 1, unit: "unit", unitPrice: i.amount, total: i.amount }],
    period = i.serviceDateFrom ? dsShortRange(i.serviceDateFrom, i.serviceDateTo || i.serviceDateFrom) : "";
  const paper = document.createElement("article");
  paper.className = "ds-paper";
  paper.innerHTML = `<div class="ds-paper-top"><div><b class="ds-paper-from">${esc(i.supplierCompany || "")}</b><span>${esc(i.supplierAddress || "Address not provided")}</span>${i.supplierEmail ? `<span>${esc(i.supplierEmail)}</span>` : ""}<span>VAT ID ${esc(i.supplierTaxId || "—")}</span></div><div class="ds-paper-no"><span class="ds-ui">INVOICE</span><b>${esc(invNo(i))}</b><span>${date(i.createdAt)}</span></div></div>
    <div class="ds-paper-to"><span class="ds-paper-label ds-ui">BILL TO</span><b>${esc(i.customerCompany || "")}</b><span>${esc([i.customerAddress, i.customerTaxId ? `VAT ID ${i.customerTaxId}` : ""].filter(Boolean).join(" · "))}</span><span>${esc([p?.name || i.projectName, ph?.name, task?.name || i.taskName].filter(Boolean).join(" · "))}${period ? `<span class="ds-paper-period"> · ${esc(`service ${period}`)}</span>` : ""}</span></div>
    <table class="ds-paper-lines"><thead><tr><th class="ds-ui">Description</th><th class="ds-ui">Qty</th><th class="ds-ui">Rate</th><th class="ds-ui">Amount</th></tr></thead><tbody>${lines
      .map(
        (x) =>
          `<tr><td>${esc(x.service)}${prev && !prevLines.some((y) => same(x, y)) ? ' <span class="ds-new ds-ui">new</span>' : ""}</td><td>${Number(x.quantity)} ${esc(x.unit === "hours" ? "h" : x.unit || "")}</td><td>${money(x.unitPrice || x.rate || 0)}</td><td>${money(x.total || Number(x.quantity || 0) * Number(x.unitPrice || x.rate || 0))}</td></tr>`,
      )
      .join("")}</tbody></table>
    <div class="ds-paper-totals">${
      i.vatMode
        ? `<div><span class="ds-ui">Net</span><span>${money(i.netAmount)}</span></div><div><span>VAT ${Number(i.vatRate)} %</span><span>${money(i.vatAmount)}</span></div><div class="ds-paper-total"><span class="ds-ui">Total</span><span>${money(i.grossAmount)}</span></div>`
        : `<div><span class="ds-ui">Net</span><span>${money(i.amount)}</span></div><div><span class="ds-ui">VAT</span><span class="ds-muted ds-ui">not recorded</span></div><div class="ds-paper-total"><span class="ds-ui">Total</span><span>${money(i.amount)}</span></div>`
    }</div>`;
  left.append(paper);
  // What stays from the old paper: notices, VAT notes, payment terms, comments, revision history
  const keep = [...old.children].filter(
    (el) =>
      !el.matches(".invoice-paper-head, .wf-stat-grid, .cc-table-wrap, .invoice-totals, .action-row") &&
      !(el.tagName === "H3" && /positions/i.test(dsText(el))),
  );
  const below = document.createElement("div");
  below.className = "ds-inv-below";
  below.append(...keep);
  left.append(below);
  // Review panel
  const total = i.vatMode ? i.grossAmount : i.amount,
    cap = Number(i.orderedAmount) || 0,
    net = i.vatMode ? Number(i.netAmount) : Number(i.amount),
    used = cap ? Math.round((net / cap) * 100) : null,
    hourLines = (i.lineItems || []).filter((x) => /^(h|hour|hours|std|stunden)$/i.test(String(x.unit))),
    invoicedHours = hourLines.reduce((a, x) => a + Number(x.quantity || 0), 0),
    approvedHours = entries.filter((e) => e.taskId === i.taskId && e.status === "Approved").reduce((a, e) => a + Number(e.hours || 0), 0),
    check = (state_, text, detail) =>
      `<div class="ds-check ds-check-${state_}"><span class="ds-check-icon" aria-hidden="true">${state_ === "ok" ? "✓" : state_ === "warn" ? "!" : "×"}</span><span class="ds-check-text">${esc(text)}</span>${detail ? `<span class="ds-check-detail">${esc(detail)}</span>` : ""}</div>`;
  const checks = [
    cap ? (net <= cap ? check("ok", "Within order cap", `${used} % used`) : check("bad", "Over the order cap", `${money(net - cap)} over`)) : "",
    hourLines.length
      ? invoicedHours <= approvedHours
        ? check("ok", "Hours match approved time", `${invoicedHours} h`)
        : check("warn", "More hours than approved time", `${invoicedHours} h of ${approvedHours} h`)
      : "",
    i.supplierTaxId ? check("ok", "VAT ID on the invoice", i.supplierTaxId) : check("warn", "No VAT ID on the invoice", ""),
    task && Number(task.progress) < 100 && task.status !== "Completed" ? check("warn", "Partial invoice", `task ${Number(task.progress) || 0} % done`) : "",
  ].join("");
  const versions = (i.revisions || []).length,
    changeNote = prev?.reviewNote || "",
    amountChange = prev ? Number(i.amount) - Number(prev.amount) : 0;
  const panel = document.createElement("aside");
  panel.className = "ds-inv-panel";
  panel.innerHTML = `<span class="ds-inv-from">${esc(versions ? `Version ${versions + 1} · corrected by ${i.supplierCompany}` : `From ${i.supplierCompany}`)}</span>
    <b class="ds-inv-total">${money(total)}</b>
    <span class="ds-inv-due">${esc([i.scheduledPayment ? `Due ${dsShortRange(i.scheduledPayment)}` : "", i.vatMode && Number(i.vatRate) ? `incl. ${Number(i.vatRate)} % VAT` : ""].filter(Boolean).join(" · "))}</span>
    <div><span class="status">${esc(i.status)}</span> ${rvInvoiceTiming(i, role)}</div>
    ${checks ? `<h3 class="ds-inv-h ds-ui">Checks</h3><div class="ds-checks">${checks}</div>` : ""}
    ${versions ? `<h3 class="ds-inv-h ds-ui">What changed</h3><div class="ds-inv-changed">${changeNote ? `<p><b class="ds-ui">You asked:</b> ${esc(changeNote)}</p>` : ""}${i.resubmitNote ? `<p><b>${esc(i.supplierCompany)}:</b> ${esc(i.resubmitNote)}</p>` : ""}<p>${amountChange ? esc(`The total changed by ${amountChange > 0 ? "+" : "−"}${money(Math.abs(amountChange))}.`) : '<span class="ds-ui">The total is unchanged.</span>'}</p></div>` : ""}`;
  const oldActions = old.querySelector(".action-row");
  if (role === "customer" && i.status === "Submitted" && oldActions) {
    panel.insertAdjacentHTML(
      "beforeend",
      `<label class="ds-inv-note"><span>${esc(`Note to ${String(i.supplierCompany || "the supplier").split(/\s+/)[0]} (optional)`)}</span><textarea id="dsInvNote" rows="3" maxlength="2000"></textarea></label>`,
    );
    const foot = document.createElement("div");
    foot.className = "ds-inv-foot";
    const [approve, changes, reject] = ["Approve", "Request Changes", "invoiceReject"].map((k) =>
      [...oldActions.querySelectorAll("button")].find((b) => (b.getAttribute("onclick") || "").includes(k)),
    );
    if (approve) {
      approve.className = "btn primary lg ds-inv-approve";
      approve.replaceChildren("Approve and Schedule Payment");
      foot.append(approve);
    }
    const row = document.createElement("div");
    row.className = "ds-inv-row";
    if (changes) {
      changes.className = "btn secondary";
      changes.replaceChildren("Request Changes");
      row.append(changes);
    }
    if (reject) {
      reject.className = "btn danger";
      row.append(reject);
    }
    foot.append(row, ...oldActions.querySelectorAll("button"));
    panel.append(foot);
    // A filled note is sent straight away as the comment; empty, the buttons ask as before.
    const send = (action) => async (e) => {
      const note = panel.querySelector("#dsInvNote")?.value.trim();
      if (!note) return;
      e.preventDefault();
      // The inline onclick on the same button would open its prompt; stop it
      e.stopImmediatePropagation();
      try {
        await api("/invoices/" + i.id, { method: "PATCH", body: { action, comment: note } });
        toast(action === "Rejected" ? "Invoice rejected" : "Changes requested");
        customerInvoices();
      } catch (x) {
        toast(x.message, "error");
      }
    };
    changes?.addEventListener("click", send("Request Changes"), true);
    reject?.addEventListener("click", send("Rejected"), true);
    oldActions.remove();
  } else if (oldActions) {
    // Supplier: "Fix & resubmit"; other roles: their existing actions
    const foot = document.createElement("div");
    foot.className = "ds-inv-foot";
    oldActions.querySelectorAll("button").forEach((b) => {
      b.classList.add("lg");
      foot.append(b);
    });
    panel.append(foot);
    oldActions.remove();
  }
  const cols = document.createElement("div");
  cols.className = "ds-inv-cols";
  cols.append(left, panel);
  top?.classList.add("ds-hidden");
  old.replaceWith(cols);
};

/* ---------- Phone: bottom bar and "Today" for suppliers (T102, board PhoneToday) ---------- */
// Labels only; the routes and the "More" button of mobile-nav.js stay.
MNAV_BOTTOM.customer = [
  ["dashboard", "Today"],
  ["projects", "Projects"],
  ["approvals", "Approvals"],
  ["messages", "Messages"],
];
MNAV_BOTTOM.supplier = [
  ["dashboard", "Today"],
  ["projects", "Jobs"],
  ["time", "Time"],
  ["messages", "Messages"],
];
MNAV_BOTTOM.admin[0] = ["dashboard", "Today"];
const DS_QUICK_ICONS = {
  time: '<circle cx="12" cy="12" r="9"/><path d="M12 7v5l3 2"/>',
  photo: '<path d="M4 8h3l2-3h6l2 3h3v11H4z"/><circle cx="12" cy="13" r="3.5"/>',
  report: '<path d="M7 3h7l4 4v14H7z"/><path d="M10 12h5M10 16h5"/>',
  defect: '<path d="M12 3 2 20h20z"/><path d="M12 10v4M12 17v.5"/>',
};
let dsTodayJobs = [];
function dsQuickJob(action) {
  const run = (j) => {
    closeModal();
    if (action === "report") drOpen(j.projectId, j.taskId);
    else if (action === "defect") puOpen(j.projectId, j.taskId);
    else if (action === "photo")
      // The daily report form has the photo field; open it and bring the field into view
      Promise.resolve(drOpen(j.projectId, j.taskId)).then(() =>
        setTimeout(() => document.querySelector('#drForm input[name="photos"]')?.scrollIntoView({ block: "center" }), 300),
      );
  };
  if (!dsTodayJobs.length) return toast("Accept a job first", "error");
  if (dsTodayJobs.length === 1) return run(dsTodayJobs[0]);
  modal(
    "Which job?",
    `<div class="ds-job-pick">${dsTodayJobs.map((j, n) => `<button type="button" class="ds-job-pick-row" data-n="${n}"><b>${esc(j.name)}</b><span>${esc(j.project)}</span></button>`).join("")}</div>`,
  );
  document.querySelectorAll(".ds-job-pick-row").forEach((b) => (b.onclick = () => run(dsTodayJobs[Number(b.dataset.n)])));
}
async function dsEnhanceToday(root) {
  if (state.user?.role !== "supplier" || !/^#\/supplier\/dashboard/.test(location.hash)) return;
  const content = root.querySelector(".dashboard-content");
  if (!content || content.querySelector(":scope > .ds-today")) return;
  const box = document.createElement("section");
  box.className = "ds-today";
  content.prepend(box);
  const [{ projects = [] }, { visits = [] }] = await Promise.all([
    api("/projects").catch(() => ({})),
    api("/site-visits").catch(() => ({})),
  ]);
  if (!document.contains(box)) return;
  const today = dsToday(),
    sid = state.user.supplierId,
    lang = typeof i18nLang !== "undefined" && i18nLang === "de" ? "de-DE" : "en-GB",
    weekday = (d) => {
      const days = dsDaysBetween(today, d);
      return days >= 0 && days < 7
        ? new Date(d + "T12:00:00").toLocaleDateString(lang, { weekday: "long" })
        : dsShortRange(d);
    };
  dsTodayJobs = projects.flatMap((p) =>
    (p.phases || []).flatMap((ph) =>
      (ph.tasks || [])
        .filter((t) => t.assignedSupplierId === sid && t.acceptanceStatus === "Accepted" && t.status !== "Completed")
        .map((t) => ({ projectId: p.id, project: p.name, taskId: t.id, name: t.name, progress: Number(t.progress) || 0, dueDate: t.dueDate })),
    ),
  );
  const visit = visits.find(
    (v) => ["Approved", "Checked in"].includes(v.status) && v.date <= today && (v.endDate || v.date) >= today,
  );
  const names = (visit?.workers || []).map((w) => String(w.name).split(" ")[0]);
  const tile = (key, label, action, tone) =>
    `<button type="button" class="ds-quick${tone ? " ds-quick-" + tone : ""}" onclick="${action}"><svg viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="1.8" stroke-linecap="round" stroke-linejoin="round" aria-hidden="true">${DS_QUICK_ICONS[key]}</svg><span>${label}</span></button>`;
  box.innerHTML = `<div class="ds-today-head"><div><span class="ds-today-date" data-no-i18n>${esc(dsKickerDate())}</span><h2 class="ds-ui ds-today-title">Today</h2></div><a class="ds-today-me" href="#/supplier/profile" aria-label="Profile">${esc(dsInitials(state.user.name))}</a></div>
    ${
      visit
        ? `<div class="ds-visit"><div><span class="ds-visit-kicker">${esc(`Site visit · ${visit.status === "Checked in" ? "checked in" : "today"}`)}</span><b>${esc(visit.siteName || "Site")}</b><span>${esc([names.length ? (names.length <= 2 ? names.join(lang === "de-DE" ? " und " : " and ") : `${names.length} workers`) : "", visit.permitLabel].filter(Boolean).join(" · "))}</span></div><button type="button" class="ds-visit-btn" onclick="cmSupplierVisit('${esc(visit.id)}','${visit.status === "Checked in" ? "checkout" : "checkin"}')">${visit.status === "Checked in" ? "Check Out" : "Check In"}</button></div>`
        : ""
    }
    <div class="ds-today-jobs"><span class="ds-today-label ds-ui">Your jobs</span><div class="ds-today-list">${
      dsTodayJobs
        .map(
          (j) =>
            `<a href="#/supplier/projects/${encodeURIComponent(j.projectId)}/tasks/${encodeURIComponent(j.taskId)}"><span><b>${esc(j.name)}</b><small>${esc(`${j.progress} % · due ${j.dueDate ? weekday(j.dueDate) : "—"}`)}</small></span><i aria-hidden="true">›</i></a>`,
        )
        .join("") || '<p class="ds-week-none">No accepted jobs right now.</p>'
    }</div></div>
    <div class="ds-quicks ds-ui">${tile("time", "Log Time", "ccNewTimeEntry()")}${tile("photo", "Photo", "dsQuickJob('photo')")}${tile("report", "Site Report", "dsQuickJob('report')")}${tile("defect", "Defect", "dsQuickJob('defect')", "orange")}</div>`;
}

/* ---------- Phone: "Log time" form (T103, board PhoneLogTime) ----------
   ccNewTimeEntry opens its modal form; the wrapper regroups the same fields (nothing is removed) into the
   board's grouped rows. Up to 640 px the modal becomes a full-screen sheet. */
const dsBaseNewTime = ccNewTimeEntry;
ccNewTimeEntry = async function (...args) {
  await dsBaseNewTime(...args);
  const form = document.getElementById("ffTimeForm");
  if (form && !form.dataset.ds) dsLogTimeSheet(form);
};
function dsLogTimeSheet(form) {
  form.dataset.ds = "1";
  const modalEl = form.closest(".modal"),
    head = modalEl?.querySelector(".modal-head");
  modalEl?.classList.add("ds-sheet");
  if (head) {
    const close = head.querySelector(".close"),
      title = head.querySelector("h2");
    if (close) {
      close.className = "ds-sheet-cancel";
      close.replaceChildren("Cancel");
      head.prepend(close);
    }
    if (title) title.replaceChildren("Log Time");
    head.insertAdjacentHTML("beforeend", '<button type="submit" form="ffTimeForm" class="ds-sheet-save">Save</button>');
    head.classList.add("ds-ui");
  }
  const $ = (sel) => form.querySelector(sel),
    target = $("#ffTimeTarget"),
    search = $("#ffTimeSearch"),
    employee = $('[name="employeeName"]'),
    day = $('[name="workDate"]'),
    place = $('[name="location"]'),
    start = $('[name="startTime"]'),
    end = $('[name="endTime"]'),
    pause = $('[name="breakMinutes"]'),
    calc = $(".ff-hours-calc"),
    notes = $('[name="description"]'),
    error = $("#ffTimeError"),
    submit = [...form.querySelectorAll("button")].find((b) => !b.type || b.type === "submit");
  const row = (label, ...els) => {
    const r = document.createElement("div");
    r.className = "ds-row";
    r.innerHTML = `<span class="ds-row-label ds-ui">${label}</span>`;
    const v = document.createElement("div");
    v.className = "ds-row-value";
    v.append(...els.filter(Boolean));
    r.append(v);
    return r;
  };
  const group = (...rows) => {
    const g = document.createElement("div");
    g.className = "ds-group";
    g.append(...rows);
    return g;
  };
  // Break as a segmented control that sets the (still editable) break field
  const seg = document.createElement("div");
  seg.className = "ds-seg ds-break";
  seg.setAttribute("role", "group");
  seg.setAttribute("aria-label", "Break");
  seg.innerHTML = [0, 15, 30, 45].map((m) => `<button type="button" data-m="${m}">${m}</button>`).join("");
  const syncSeg = () =>
    seg.querySelectorAll("button").forEach((b) => b.setAttribute("aria-pressed", String(Number(b.dataset.m) === Number(pause.value))));
  seg.addEventListener("click", (e) => {
    const b = e.target.closest("button[data-m]");
    if (!b) return;
    pause.value = b.dataset.m;
    pause.dispatchEvent(new Event("input", { bubbles: true }));
  });
  const banner = document.createElement("div");
  banner.className = "ds-offline ds-ui";
  banner.innerHTML =
    '<svg viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round" aria-hidden="true"><path d="M2 8.5a15 15 0 0 1 20 0M5.5 12a10 10 0 0 1 13 0M9 15.5a5 5 0 0 1 6 0M3 3l18 18"/></svg><span>No signal. Saved on this phone and sent later.</span>';
  const online = () => (banner.hidden = navigator.onLine);
  online();
  window.addEventListener("online", online);
  window.addEventListener("offline", online);
  const work = document.createElement("div");
  work.className = "ds-work";
  work.innerHTML = '<span class="ds-group-label ds-ui">Work done</span>';
  work.append(notes);
  const details = document.createElement("div");
  details.className = "ds-details";
  details.innerHTML = '<span class="ds-group-label ds-ui">Details</span>';
  details.append(group(row("Find job", search), row("Employee", employee), row("Location", place), row("Break (min)", pause)), calc);
  const oldParts = [...form.children];
  form.prepend(banner, group(row("Job", target), row("Date", day)), group(row("Start", start), row("End", end), row("Break", seg)), work, details);
  if (error) form.append(error);
  if (submit) {
    submit.classList.add("ds-sheet-submit");
    form.append(submit);
  }
  // The old labels and wrappers are empty now
  oldParts.forEach((el) => {
    if (el !== error && el !== submit && !el.querySelector("input, select, textarea, button")) el.remove();
  });
  const label = () => {
    syncSeg();
    const h = Number(form.dataset.hours);
    if (submit) submit.replaceChildren(h > 0 ? `Submit ${h.toFixed(1)} Hours` : "Submit time for approval");
  };
  form.addEventListener("input", label);
  form.addEventListener("change", label);
  label();
}

/* ---------- Run the enhancers after every render ---------- */
const DS_ENHANCERS = [dsEnhanceChips, dsEnhanceButtons, dsEnhanceEmpty, dsEnhanceSidebar, dsEnhanceDashboard, dsEnhanceWorkspace, dsEnhanceOffers, dsEnhanceToday];
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
