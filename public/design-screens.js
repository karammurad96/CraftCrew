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

/* ---------- Dates shared by the screens below ---------- */
const dsIso = (d) => new Date(d.getTime() - d.getTimezoneOffset() * 60000).toISOString().slice(0, 10);
const dsToday = () => dsIso(new Date());
const dsDaysBetween = (a, b) => Math.round((Date.parse(b) - Date.parse(a)) / 86400000);
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

/* ---------- Approvals (T104, board PhoneApprove) ----------
   srApprovals (with the site-access and compliance sections from compliance-ui.js) renders one panel per kind of
   decision; the wrapper adds the title and a filter, turns invoices into cards and time entries into a grouped
   list with the existing approve functions, and lets every card hug its content. */
const dsBaseApprovals = srApprovals;
srApprovals = async function (...args) {
  await dsBaseApprovals(...args);
  const content = document.querySelector(".dashboard-content"),
    grid = content?.querySelector(".in-grid");
  if (!grid) return;
  const [{ invoices = [] }, { entries = [] }] = await Promise.all([
    api("/invoices").catch(() => ({})),
    api("/time-entries").catch(() => ({})),
  ]);
  if (!document.contains(grid)) return;
  content.classList.add("ds-approvals");
  const sections = [...grid.querySelectorAll(":scope > section")],
    kindOf = (sec) => {
      const t = dsText(sec.querySelector("h3")).toLowerCase();
      return /^invoices to approve/.test(t) ? "invoices" : /^time entries to approve/.test(t) ? "time" : "other";
    };
  sections.forEach((sec) => (sec.dataset.dsKind = kindOf(sec)));
  // Invoices and time entries first, as on the board; the other sections follow in their order
  for (const kind of ["time", "invoices"]) {
    const sec = sections.find((x) => x.dataset.dsKind === kind);
    if (sec) grid.prepend(sec);
  }
  // Invoice cards
  const invSec = sections.find((x) => x.dataset.dsKind === "invoices"),
    waiting = invoices.filter((i) => i.status === "Submitted");
  if (invSec && waiting.length) {
    invSec.querySelectorAll(".pa-row").forEach((r) => r.remove());
    const approved = entries.filter((e) => e.status === "Approved");
    invSec.insertAdjacentHTML(
      "beforeend",
      waiting
        .map((i) => {
          const net = i.vatMode ? Number(i.netAmount) : Number(i.amount),
            cap = Number(i.orderedAmount) || 0,
            hourLines = (i.lineItems || []).filter((x) => /^(h|hour|hours|std|stunden)$/i.test(String(x.unit))),
            hours = hourLines.reduce((a, x) => a + Number(x.quantity || 0), 0),
            okHours = approved.filter((e) => e.taskId === i.taskId).reduce((a, e) => a + Number(e.hours || 0), 0),
            check = (ok, text) => `<li class="${ok ? "ds-ok" : "ds-warn"}"><span aria-hidden="true">${ok ? "✓" : "!"}</span>${esc(text)}</li>`,
            checks = [
              cap ? check(net <= cap, net <= cap ? "Within order cap" : "Over the order cap") : "",
              hourLines.length ? check(hours <= okHours, hours <= okHours ? "Hours match approved time" : "More hours than approved time") : "",
            ].join("");
          return `<article class="ds-approve-card"><div class="ds-approve-top"><a class="ds-approve-kicker" href="#/customer/invoice/${encodeURIComponent(i.id)}">${esc(`Invoice ${invNo(i)}`)}</a><span class="status" data-ds-fixed data-ds-tone="orange">${(i.revisions || []).length ? "Corrected" : "Submitted"}</span></div><b class="ds-approve-amount">${money(i.vatMode ? i.grossAmount : i.amount)}</b><span class="ds-approve-sub">${esc([i.supplierCompany, i.taskName || i.description].filter(Boolean).join(" · "))}</span>${checks ? `<ul class="ds-approve-checks">${checks}</ul>` : ""}<div class="ds-approve-btns"><button type="button" class="btn secondary" onclick="dsApprovalDo(() => invoiceAction('${esc(i.id)}','Request Changes'))">Changes</button><button type="button" class="btn primary" onclick="dsApprovalDo(() => invoiceAction('${esc(i.id)}','Approve'))">Approve</button></div></article>`;
        })
        .join(""),
    );
  }
  // Time entries as a grouped list
  const timeSec = sections.find((x) => x.dataset.dsKind === "time"),
    pending = entries.filter((e) => e.status === "Pending approval");
  if (timeSec && pending.length) {
    timeSec.querySelectorAll(".pa-row").forEach((r) => r.remove());
    const lang = typeof i18nLang !== "undefined" && i18nLang === "de" ? "de-DE" : "en-GB";
    timeSec.insertAdjacentHTML(
      "beforeend",
      `<div class="ds-time-list">${pending
        .map(
          (e) =>
            `<div class="ds-time-row"><a href="#/customer/time"><b>${esc(`${Number(e.hours).toFixed(1)} h · ${e.employeeName}`)}</b><span>${esc([new Date(String(e.workDate).slice(0, 10) + "T12:00:00").toLocaleDateString(lang, { weekday: "short", day: "numeric", month: "short" }), e.location || e.projectName].filter(Boolean).join(" · "))}</span></a><button type="button" class="ds-pill-approve" onclick="dsApprovalDo(() => ccReviewTime('${esc(e.id)}','Approved'))">Approve</button></div>`,
        )
        .join("")}</div>`,
    );
  }
  // Title and filter
  const top = content.querySelector(":scope > .dash-top"),
    total = waiting.length + pending.length + sections.filter((x) => x.dataset.dsKind === "other").reduce((a, sec) => a + (Number(dsText(sec.querySelector(".ui-count"))) || 0), 0);
  if (top && !content.querySelector(".ds-approve-filter")) {
    top.classList.add("ds-approve-head");
    const filter = document.createElement("div");
    filter.className = "ds-seg ds-approve-filter ds-ui";
    filter.setAttribute("role", "group");
    filter.setAttribute("aria-label", "Show");
    filter.innerHTML = [
      ["all", `All · ${total}`],
      ["invoices", "Invoices"],
      ["time", "Time"],
    ]
      .map(([k, l], n) => `<button type="button" data-show="${k}" aria-pressed="${n === 0}">${l}</button>`)
      .join("");
    filter.addEventListener("click", (e) => {
      const b = e.target.closest("button[data-show]");
      if (!b) return;
      filter.querySelectorAll("button").forEach((x) => x.setAttribute("aria-pressed", String(x === b)));
      sections.forEach((sec) => sec.classList.toggle("ds-hidden", b.dataset.show !== "all" && sec.dataset.dsKind !== b.dataset.show));
    });
    top.after(filter);
  }
};
// Runs an existing approval function and stays on Approvals: those functions end by rendering the invoice list
// or the time page (without waiting for it), so that render is skipped while they run.
async function dsApprovalDo(fn) {
  const keep = { customerInvoices, ccTimePage };
  customerInvoices = ccTimePage = async () => {};
  try {
    await fn();
  } finally {
    customerInvoices = keep.customerInvoices;
    ccTimePage = keep.ccTimePage;
  }
  if (/^#\/customer\/approvals/.test(location.hash)) route();
}

/* ---------- Run the enhancers after every render ---------- */
const DS_ENHANCERS = [dsEnhanceChips, dsEnhanceButtons, dsEnhanceEmpty];
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
