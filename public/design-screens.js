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

const dsInitials = (name) =>
  String(name || "?")
    .split(/\s+/)
    .map((w) => w[0])
    .join("")
    .slice(0, 2)
    .toUpperCase();
/* Share a project with a colleague (T110). Lists who can see the project; the owner invites by name and email
   (a new email gets its own customer account that sees only the shared projects) and removes access again. */
const DS_SHARE_ACCESS = { owner: "Owner", team: "Your team · all projects", project: "This project" };
async function dsShare(pid) {
  let d;
  try {
    d = await api(`/projects/${encodeURIComponent(pid)}/participants`);
  } catch (x) {
    return toast(x.message, "error");
  }
  const row = (u) =>
    `<li class="ds-share-person"><span class="ds-avatar ds-tint-blue">${esc(dsInitials(u.name || u.email))}</span><span class="ds-share-who"><b>${esc(u.name || u.email)}</b><small>${esc(u.email)}</small></span><span class="ds-share-access ds-ui">${DS_SHARE_ACCESS[u.access]}</span>${
      d.canManage && u.access === "project"
        ? `<button type="button" class="btn small outline" onclick="dsShareRemove('${esc(pid)}','${esc(u.id)}')" aria-label="${esc(`Remove access for ${u.name || u.email}`)}">Remove</button>`
        : ""
    }</li>`;
  modal(
    "Share project",
    `<div class="ds-share">${
      d.canManage
        ? `<form id="dsShareForm" class="modal-form"><p class="subtle">Invite a colleague from your company. They see this project and can work on it with you. Someone without an account gets one.</p><div class="two"><label>Name<input name="name" autocomplete="name" maxlength="120"></label><label>Email *<input name="email" type="email" autocomplete="email" required></label></div><div id="dsShareError" class="form-error"></div><div id="dsShareNote" class="notice" hidden></div><button class="btn primary">Invite</button></form>`
        : '<p class="subtle">Only the project owner can invite colleagues.</p>'
    }<h3 class="ds-share-h ds-ui">People with access</h3><ul class="ds-share-list">${d.people.map(row).join("")}</ul></div>`,
  );
  const form = document.getElementById("dsShareForm");
  if (!form) return;
  form.onsubmit = async (e) => {
    e.preventDefault();
    const f = new FormData(form);
    try {
      const r = await api(`/projects/${encodeURIComponent(pid)}/participants`, {
        method: "POST",
        body: { name: f.get("name"), email: f.get("email") },
      });
      await dsShare(pid);
      const note = document.getElementById("dsShareNote");
      if (note) {
        note.hidden = false;
        note.textContent = r.temporaryPassword
          ? `${r.person.name} can sign in with the temporary password ${r.temporaryPassword} and will choose a new one.`
          : r.emailed
            ? `We emailed ${r.person.email} a link to set a password.`
            : `${r.person.name} can open the project now.`;
      }
    } catch (x) {
      document.getElementById("dsShareError").textContent = x.message;
    }
  };
}
async function dsShareRemove(pid, uid) {
  if (!(await uiConfirm("Remove this colleague's access to the project?"))) return;
  try {
    await api(`/projects/${encodeURIComponent(pid)}/participants/${encodeURIComponent(uid)}`, { method: "DELETE" });
    await dsShare(pid);
  } catch (x) {
    toast(x.message, "error");
  }
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
    <span class="ds-inv-due">${esc([i.scheduledPayment || i.dueDate ? `Due ${dsShortRange(i.scheduledPayment || i.dueDate)}` : "", i.vatMode && Number(i.vatRate) ? `incl. ${Number(i.vatRate)} % VAT` : ""].filter(Boolean).join(" · "))}</span>
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
const DS_ENHANCERS = [dsEnhanceChips, dsEnhanceButtons, dsEnhanceEmpty, dsEnhanceOffers];
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
