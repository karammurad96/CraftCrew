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
  const photos = dsTimePhotosField(form);
  const oldParts = [...form.children];
  form.prepend(banner, group(row("Job", target), row("Date", day)), group(row("Start", start), row("End", end), row("Break", seg)), work, photos, details);
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

/* ---------- Photos on time entries (T106, board PhoneLogTime "Photos") ----------
   Up to 6 JPG or PNG photos, shrunk on the phone before upload. They are kept as data URLs until the form is
   sent, so oflPostWithPhotos can queue the entry together with its photos when there is no signal. */
const DS_TIME_PHOTOS_MAX = 6;
let dsTimePhotos = null; // the photos of the time entry being sent right now
function dsPhotoData(file) {
  return new Promise((resolve, reject) => {
    if (!/^image\/(jpeg|png)$/.test(file.type)) return reject(new Error("Choose JPG or PNG photos."));
    const img = new Image(),
      src = URL.createObjectURL(file);
    img.onload = () => {
      const scale = Math.min(1, 1600 / Math.max(img.naturalWidth, img.naturalHeight)),
        canvas = document.createElement("canvas");
      canvas.width = Math.round(img.naturalWidth * scale);
      canvas.height = Math.round(img.naturalHeight * scale);
      canvas.getContext("2d").drawImage(img, 0, 0, canvas.width, canvas.height);
      URL.revokeObjectURL(src);
      const name = (file.name.replace(/\.[^.]*$/, "") || "photo").replace(/[^a-zA-Z0-9._-]/g, "_");
      resolve({ filename: name + ".jpg", content: canvas.toDataURL("image/jpeg", 0.82) });
    };
    img.onerror = () => {
      URL.revokeObjectURL(src);
      reject(new Error("This photo could not be read."));
    };
    img.src = src;
  });
}
function dsTimePhotosField(form) {
  const list = [],
    box = document.createElement("div");
  box.className = "ds-photos";
  box.innerHTML =
    '<span class="ds-group-label ds-ui" id="dsPhotosLabel">Photos</span><div class="ds-photo-grid" role="group" aria-labelledby="dsPhotosLabel"></div>';
  const grid = box.querySelector(".ds-photo-grid"),
    error = () => form.querySelector("#ffTimeError");
  const draw = () => {
    grid.innerHTML =
      list
        .map(
          (p, i) =>
            `<div class="ds-photo"><img src="${esc(p.content)}" alt="${esc(p.filename)}"><button type="button" class="ds-photo-remove" data-i="${i}" aria-label="Remove photo ${i + 1}">×</button></div>`,
        )
        .join("") +
      (list.length < DS_TIME_PHOTOS_MAX
        ? '<label class="ds-photo-add"><input type="file" accept="image/jpeg,image/png" multiple aria-label="Add photo" data-ui-drop="off"><span aria-hidden="true">+</span></label>'
        : "");
    grid.querySelector("input")?.addEventListener("change", async (e) => {
      const files = [...e.target.files];
      try {
        if (list.length + files.length > DS_TIME_PHOTOS_MAX) throw new Error("Attach up to 6 photos");
        for (const f of files) list.push(await dsPhotoData(f));
        if (error()) error().textContent = "";
      } catch (x) {
        if (error()) error().textContent = x.message;
      }
      draw();
    });
  };
  grid.addEventListener("click", (e) => {
    const b = e.target.closest(".ds-photo-remove");
    if (!b) return;
    list.splice(Number(b.dataset.i), 1);
    draw();
  });
  draw();
  const baseSubmit = form.onsubmit;
  form.onsubmit = async (e) => {
    dsTimePhotos = list.length ? list.slice() : null;
    try {
      await baseSubmit.call(form, e);
    } finally {
      dsTimePhotos = null;
    }
  };
  return box;
}
// The time entry form posts through api(); with photos attached the post goes through oflPostWithPhotos.
const dsBaseApi = api;
api = function (path, opts = {}) {
  if (dsTimePhotos && path === "/time-entries" && (opts.method || "GET").toUpperCase() === "POST") {
    const files = dsTimePhotos;
    dsTimePhotos = null;
    return oflPostWithPhotos(path, opts.body, files);
  }
  return dsBaseApi(path, opts);
};
// The time lists show the photos as thumbnails; a tap opens the protected-file viewer.
async function dsFillThumbs(root) {
  for (const img of root.querySelectorAll("img[data-ds-src]:not([src])")) {
    try {
      const r = await fetch(img.dataset.dsSrc, { credentials: "same-origin" });
      if (r.ok) img.src = URL.createObjectURL(await r.blob());
    } catch {}
  }
}
function dsTimeThumbs(urls) {
  return urls?.length
    ? `<div class="ds-thumbs">${urls
        .map(
          (u, i) =>
            `<a href="${esc(u)}" aria-label="Photo ${i + 1}"><img data-ds-src="${esc(u)}" alt=""></a>`,
        )
        .join("")}</div>`
    : "";
}
const dsBaseTimeFilter = ccTimeFilter;
ccTimeFilter = function (...args) {
  const r = dsBaseTimeFilter(...args),
    rows = [...(document.getElementById("ffTimeRows")?.rows || [])];
  (window.__ccTimeFiltered || []).forEach((e, i) => {
    const cell = rows[i]?.cells[3];
    if (cell && e.photoUrls?.length) cell.insertAdjacentHTML("beforeend", dsTimeThumbs(e.photoUrls));
  });
  const body = document.getElementById("ffTimeRows");
  if (body) dsFillThumbs(body);
  return r;
};

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
