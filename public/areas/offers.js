/* Area: offers and bids (T129b). The offers overview (customer) and bid opportunities (supplier), the supplier's
   offer form (with the event questions and the typical hourly rate), creating a sourcing event for a task (with
   "Invite my preferred suppliers"), inviting suppliers, editing a request, clarifications, requesting changes,
   awarding, declining and closing. Drawn with translation keys; bid titles, scopes and company names are data.
   The function names stay, because the sourcing event page (T129c) still calls them. */
const ofk = (key, params) => esc(t("offers." + key, params));
const ofDom = (text) => `<bdi>${esc(text)}</bdi>`;
const OF_ACTIVE = ["Open", "Shortlist", "Second round", "Final round"];
const OF_STATUSES = ["All", ...OF_ACTIVE, "Awarded", "Closed"];
const OF_OFFER_STATUSES = ["Submitted", "Changes requested", "Accepted", "Not selected", "Declined"];
const ofStatus = (s) => (OF_STATUSES.includes(s) ? ofk("statuses." + s) : ofDom(s));
const ofOfferStatus = (s) => (OF_OFFER_STATUSES.includes(s) ? ofk("offerStatuses." + s) : ofDom(s));
const ofBids = async () => (await api("/bids")).bids || [];

/* ---------- Typical hourly rates (T69): shown with 5+ data points; also used by the invoice form ---------- */
function bmRateNote(rate, service) {
  const b = bmFor(service),
    r = Number(rate);
  if (!r) return "";
  if (!b) return `<small class="bm-note">${ofk("rate.plain", { rate: fmt.money(r) })}</small>`;
  const where = r < b.p25 ? "low" : r > b.p75 ? "high" : "ok";
  return `<small class="bm-note bm-${where}">${ofk("rate." + where, { rate: fmt.money(r), from: fmt.money(b.p25), to: fmt.money(b.p75) })}</small>`;
}
function bmRangeNote(service) {
  const b = bmFor(service);
  return b
    ? `<small class="bm-note">${tHtml("offers.rate.range", { service: ofDom(b.service), from: esc(fmt.money(b.p25)), to: esc(fmt.money(b.p75)), median: esc(fmt.money(b.median)) })}</small>`
    : "";
}

/* ---------- Offers overview / bid opportunities ---------- */
async function ofPage(role, query) {
  await bmEnsure();
  const [bids, projects] = await Promise.all([ofBids(), ccProjects()]),
    project = query.get("project") || "",
    status = query.get("status") || "All",
    sort = query.get("offerSort") || "amount",
    customer = role === "customer",
    list = bids.filter((b) => (!project || b.projectId === project) && (status === "All" || b.status === status));
  const card = (b) => {
    const p = projects.find((x) => x.id === b.projectId),
      offers = [...(b.offers || [])].sort((a, z) =>
        sort === "delivery" ? a.deliveryDays - z.deliveryDays : sort === "experience" ? (z.workingTogether || 0) - (a.workingTogether || 0) : a.amount - z.amount,
      ),
      active = OF_ACTIVE.includes(b.status),
      ids = (o) => `data-bid="${esc(b.id)}"${o ? ` data-offer="${esc(o.id)}"` : ""}`,
      btn = (action, cls, label, o) => `<button class="btn small ${cls}" data-action="${action}" ${ids(o)}>${ofk(label)}</button>`;
    const row = (o, i) => {
      const mine = role === "supplier" && o.supplierId === state.user.supplierId;
      return `<div class="wf-offer-row"><b>${i === 0 ? "★ " : ""}${esc(o.supplierCompany)}<small>${ofk("prior", { n: o.workingTogether || 0 })}</small></b><strong>${esc(fmt.money(o.amount))}${
        o.hourlyRate ? bmRateNote(o.hourlyRate, b.category || b.taskName) : ""
      }</strong><span>${ofk("days", { n: o.deliveryDays })}</span><span>${ofOfferStatus(o.status)}</span><small>${o.notes ? ofDom(o.notes) : ofk("noScope")}${
        o.attachment ? `<br><a href="${esc(o.attachment)}" target="_blank" rel="noopener">${ofk("documents")}</a>` : ""
      }${o.clarifications?.length ? `<br>${ofk("clarifications", { n: o.clarifications.length })}` : ""}</small><div class="cc-actions">${
        customer && ["Submitted", "Accepted"].includes(o.status) ? btn("offers.talk", "outline", "askDetails", o) : ""
      }${mine ? btn("offers.talk", "outline", "thread", o) + btn("offers.offer", "primary", "editResend") : ""}${
        customer && active && o.status === "Submitted" ? btn("offers.award", "success", "award", o) + btn("offers.changes", "outline", "changes", o) + btn("offers.decline", "outline", "decline", o) : ""
      }</div>${o.status === "Changes requested" && o.changeNote ? `<small class="rv-change-note">${tHtml("offers.changesNote", { note: ofDom(o.changeNote) })}</small>` : ""}${
        o.revisionNote && o.status === "Submitted" ? `<small class="subtle">${tHtml("offers.revised", { note: ofDom(o.revisionNote) })}</small>` : ""
      }</div>`;
    };
    const table = offers.length
      ? `<div class="wf-offer-table"><div class="wf-offer-head">${["supplier", "offer", "delivery", "decision", "scope", "actions"].map((c) => `<span>${ofk("col." + c)}</span>`).join("")}</div>${offers.map(row).join("")}</div>`
      : `<div class="notice">${ofk("waiting")}</div>`;
    // Bids with offers link to their side-by-side comparison (T100)
    const compare = customer && offers.length ? `<a class="ds-text-link ds-compare-link" href="#/customer/sourcing/${encodeURIComponent(b.id)}">${ofk("compare")}</a>` : "";
    return `<article class="panel wf-bid-card"><div class="project-card-head"><div><span class="eyebrow">${
      b.brokered ? ofk(b.region ? "brokered.eyebrow" : "brokered.eyebrowNoRegion", { region: b.region }) : p?.name || b.projectName ? esc(p?.name || b.projectName) : ofk("projectFallback")
    }</span><h3>${esc(b.title)}</h3>${compare}</div><span class="status">${ofStatus(
      b.status,
    )}</span></div><p>${b.description ? ofDom(b.description) : ""}</p><div class="wf-task-meta"><span>${
      // T223: a brokered bid names the work and its period, not the customer's project
      b.brokered
        ? `<bdi>${esc(b.category || "")}</bdi>${b.startDate || b.finishDate ? " · " + ofk("brokered.period", { from: b.startDate ? fmt.date(b.startDate) : "…", to: b.finishDate ? fmt.date(b.finishDate) : "…" }) : ""}`
        : `${b.phaseName ? esc(b.phaseName) : ofk("phaseFallback")} · ${b.taskName ? esc(b.taskName) : ofk("taskFallback")}`
    }</span><span>${ofk("deadline", {
      date: fmt.date(b.dueDate),
    })}</span><span>${esc(t.plural("offers.offerCount", offers.length))}</span></div>${table}${
      role === "supplier" && active ? btn("offers.offer", "primary", offers.some((o) => o.supplierId === state.user.supplierId) ? "editOffer" : "submitBid") : ""
    }${customer && active ? `<div class="cc-actions">${btn("offers.invite", "outline", "invite")}${btn("offers.edit", "outline", "editRequest")}${btn("offers.close", "outline", "close")}</div>` : ""}</article>`;
  };
  const opt = (value, label, on) => `<option value="${esc(value)}"${on ? " selected" : ""}>${label}</option>`;
  app.innerHTML = dashboardShell(
    role,
    customer ? "offers" : "bids",
    [
      `<div class="dash-top"><div><h1>${ofk(customer ? "titleCustomer" : "titleSupplier")}</h1><p>${ofk("intro")}</p></div>${customer ? `<button class="btn primary" data-action="offers.create">${ofk("create")}</button>` : ""}</div>`,
      `<div class="wf-filter-row"><label>${ofk("project")}<select id="wfBidProject" data-action="offers.filter">${opt("", ofk("allProjects"))}${projects
        .map((p) => opt(p.id, esc(p.name), p.id === project))
        .join("")}</select></label><label>${ofk("status")}<select id="wfBidStatus" data-action="offers.filter">${OF_STATUSES.map((x) => opt(x, ofk("statuses." + x), x === status)).join("")}</select></label><label>${ofk(
        "sort",
      )}<select id="wfOfferSort" data-action="offers.sort">${[
        ["amount", "sortAmount"],
        ["delivery", "sortDelivery"],
        ["experience", "sortExperience"],
      ]
        .map(([v, k]) => opt(v, ofk(k), v === sort))
        .join("")}</select></label></div>`,
      `<div class="wf-bid-grid review-bid-grid">${list.map(card).join("") || `<div class="empty">${ofk("empty")}</div>`}</div>`,
    ]
      .join(""),
  );
}
actions.on("offers.filter", () => {
  const q = new URLSearchParams({ project: document.getElementById("wfBidProject").value, status: document.getElementById("wfBidStatus").value });
  navigate(`/${state.user.role}/offers?${q}`);
});
actions.on("offers.sort", (el) => {
  const q = new URLSearchParams(location.hash.split("?")[1] || "");
  q.set("offerSort", el.value);
  navigate(`/${state.user.role}/offers?${q}`);
});
const ofIds = (el) => [el.dataset.bid, el.dataset.offer || ""];
actions.on("offers.offer", (el) => ccOpenBidOffer(el.dataset.bid));
actions.on("offers.talk", (el) => reviewOfferTalk(...ofIds(el)));
actions.on("offers.award", (el) => reviewConfirmBid(...ofIds(el), "Accept offer"));
actions.on("offers.changes", (el) => rvRequestOfferChanges(...ofIds(el)));
actions.on("offers.decline", (el) => wfBidDecision(...ofIds(el), "Decline offer"));
actions.on("offers.invite", (el) => reviewInviteBid(el.dataset.bid));
actions.on("offers.edit", (el) => ccEditBid(el.dataset.bid));
actions.on("offers.close", (el) => reviewConfirmBid(el.dataset.bid, "", "Close bid"));
actions.on("offers.create", () => wfCreateBidFromPage());
actions.on("offers.closeModal", () => closeModal());

/* ---------- Supplier: send or revise an offer ---------- */
async function ccOpenBidOffer(id) {
  const [, bids] = await Promise.all([bmEnsure(), ofBids()]),
    b = bids.find((x) => x.id === id),
    mine = b?.offers?.find((o) => o.supplierId === state.user.supplierId);
  if (!b) return;
  const f = (key, params) => ofk("form." + key, params);
  modal(
    t(mine ? "offers.form.reviseTitle" : "offers.form.submitTitle"),
    `<form id="srOfferForm" class="modal-form" data-action="offers.send" data-bid="${esc(id)}"><p><b>${esc(b.title)}</b><br><small class="subtle">${f("meta", {
      type: b.eventType || "RFQ",
      project: b.brokered ? t("offers.brokered.eyebrowNoRegion") : b.projectName,
      task: b.brokered ? b.category : b.taskName,
      date: fmt.date(b.dueDate),
    })}</small></p>${b.description ? `<p class="subtle">${ofDom(b.description)}</p>` : ""}${
      mine?.status === "Changes requested" ? `<div class="notice warn"><b>${f("asked")}</b> ${ofDom(mine.changeNote || "")}</div>` : ""
    }<div class="two"><label>${f("amount")}<input name="amount" type="number" min="1" step="0.01" value="${esc(mine?.amount || "")}" required></label><label>${f("days")}<input name="deliveryDays" type="number" min="1" value="${esc(
      mine?.deliveryDays || "",
    )}" required></label></div><label>${f("hourly")}<input name="hourlyRate" type="number" min="1" step="0.01" value="${esc(mine?.hourlyRate || "")}">${bmRangeNote(b.category || b.taskName)}</label>${(b.questions || [])
      .map((q, i) => `<label>${esc(q)}<textarea name="answer_${i}" rows="2" required>${esc(mine?.answers?.[i] || "")}</textarea></label>`)
      .join("")}<label>${f("notes")}<textarea name="notes" rows="3">${esc(mine?.notes || "")}</textarea></label><label>${f("file")}<input name="offerFile" type="file" accept=".pdf,.doc,.docx,.xlsx,.xls"></label>${
      mine?.attachment ? `<a href="${esc(mine.attachment)}">${f("current")}</a>` : ""
    }${
      mine ? `<label>${f("changed")} <small class="subtle">${f("changedHint")}</small><textarea name="revisionNote" rows="2" placeholder="${f("changedPlaceholder")}"></textarea></label>` : ""
    }<div id="srOfferError" class="form-error"></div><button class="btn primary">${f(mine ? "resend" : "send")}</button></form>`,
  );
}
actions.on("offers.send", async (form) => {
  const id = form.dataset.bid,
    f = new FormData(form),
    file = form.elements.offerFile.files[0],
    b = (await ofBids()).find((x) => x.id === id),
    mine = b?.offers?.find((o) => o.supplierId === state.user.supplierId),
    rate = f.get("hourlyRate");
  const body = {
    amount: f.get("amount"),
    deliveryDays: f.get("deliveryDays"),
    notes: f.get("notes"),
    revisionNote: f.get("revisionNote") || "",
    answers: (b?.questions || []).map((_, i) => f.get("answer_" + i)),
    hourlyRate: rate === "" || rate === null ? null : Number(rate),
  };
  try {
    if (file) body.attachment = (await uploadFile(file)).url;
    else if (mine?.attachment) body.attachment = mine.attachment;
    await api(`/bids/${encodeURIComponent(id)}/offers`, { method: "POST", body });
    closeModal();
    tToast(t("offers.form.sent"));
    await route();
  } catch (x) {
    document.getElementById("srOfferError").textContent = x.message;
  }
});
// From the task in the workspace: every active request for that task, each with its own short form
async function wfSupplierBid(pid, phid, tid) {
  const open = (await ofBids()).filter((b) => b.projectId === pid && b.taskId === tid && OF_ACTIVE.includes(b.status)),
    k = (key, params) => ofk("task." + key, params);
  modal(
    t("offers.task.title"),
    `<div>${
      open
        .map(
          (b) =>
            `<article class="cc-card"><span class="status active">${k("due", { status: t("offers.statuses." + b.status), date: fmt.date(b.dueDate) })}</span><h3>${esc(b.title)}</h3><p>${ofDom(b.description || "")}</p>${
              b.invitedSupplierIds?.length ? `<small>${k("inviteOnly")}</small>` : ""
            }<form class="wf-offer-form" data-action="offers.taskSend" data-bid="${esc(b.id)}"><div class="two"><label>${ofk("form.amount")}<input name="amount" type="number" min="1" step="0.01" required></label><label>${ofk(
              "form.days",
            )}<input name="deliveryDays" type="number" min="1" required></label></div><label>${ofk("form.notes")}<textarea name="notes" maxlength="3000"></textarea></label><label>${k(
              "attach",
            )}<input name="offerFile" type="file" accept=".pdf,.doc,.docx,.xlsx,.xls,.png,.jpg"></label><button class="btn primary">${k("submit")}</button></form></article>`,
        )
        .join("") || `<div class="empty">${k("none")}</div>`
    }</div>`,
  );
}
actions.on("offers.taskSend", async (form) => {
  const b = Object.fromEntries(new FormData(form)),
    file = form.querySelector("[name=offerFile]")?.files?.[0];
  try {
    if (file) b.attachment = (await uploadFile(file)).url;
    delete b.offerFile;
    await api(`/bids/${encodeURIComponent(form.dataset.bid)}/offers`, { method: "POST", body: b });
    closeModal();
    tToast(t("offers.task.sent"));
    await route();
  } catch (e) {
    toast(e.message, "error");
  }
});

/* ---------- Customer: create, edit, invite ---------- */
// A sourcing event for one task: type, category, baseline, questions; optionally only for preferred suppliers
async function wfCreateBid(pid, phid, tid) {
  const [{ project: p }, cfg] = await Promise.all([api("/projects/" + encodeURIComponent(pid)), api("/platform-config").catch(() => ({})), pvLoad().catch(() => {})]),
    task = p.phases.find((x) => x.id === phid).tasks.find((x) => x.id === tid),
    preferred = pvData.suppliers.filter((s) => s.live).map((s) => s.supplierId),
    e = (key, params) => ofk("event." + key, params);
  modal(
    t("offers.event.title"),
    `<form id="srEventForm" class="modal-form" data-action="offers.publish" data-project="${esc(pid)}" data-phase="${esc(phid)}" data-task="${esc(tid)}"><p class="modal-intro">${tHtml("offers.event.intro", {
      task: `<b>${esc(task.name)}</b>`,
    })}</p><div class="two"><label>${e("type")}<select name="eventType">${["RFQ", "RFP", "RFI"].map((x) => `<option value="${x}">${e("types." + x)}</option>`).join("")}</select></label><label>${e(
      "category",
    )}<select name="category"><option value="">${esc(t("offers.event.choose"))}</option>${(cfg.serviceCategories || []).map((c) => `<option value="${esc(c)}">${esc(c)}</option>`).join("")}</select></label></div><label>${e(
      "name",
    )}<input name="title" value="${esc(task.name)}" required></label><label>${e("scope")}<textarea name="description" rows="3" required>${esc(task.description || "")}</textarea></label><div class="two"><label>${e(
      "due",
    )}<input name="dueDate" type="date" min="${srToday()}" value="${esc(task.dueDate || p.dueDate)}" required></label><label>${e("baseline")}<input name="baseline" type="number" min="0" step="0.01" value="${esc(
      task.orderAmount || "",
    )}" placeholder="${e("baselineHint")}"></label></div><label>${e("questions")} <small class="subtle">${e("questionsHint")}</small><textarea name="questions" rows="3" placeholder="${e(
      "questionsPlaceholder",
    ).replace(/\n/g, "&#10;")}"></textarea></label><label class="cc-check-label pv-invite"><input type="checkbox" id="pvInviteBox" name="preferredOnly"${preferred.length ? "" : " disabled"}> ${e("preferred", {
      n: preferred.length,
    })} <small class="subtle">${e("preferredHint")}</small></label><div id="srEventError" class="form-error"></div><button class="btn primary">${e("publish")}</button></form>`,
  );
}
actions.on("offers.publish", async (form) => {
  const b = Object.fromEntries(new FormData(form)),
    preferredOnly = !!b.preferredOnly;
  delete b.preferredOnly;
  b.questions = String(b.questions || "")
    .split("\n")
    .map((x) => x.trim())
    .filter(Boolean);
  Object.assign(b, { projectId: form.dataset.project, phaseId: form.dataset.phase, taskId: form.dataset.task, weights: SR_WEIGHTS });
  // Only the preferred suppliers may send offers when the box is ticked
  if (preferredOnly) b.invitedSupplierIds = pvData.suppliers.filter((s) => s.live).map((s) => s.supplierId);
  try {
    const { bid } = await api("/bids", { method: "POST", body: b });
    closeModal();
    tToast(t("offers.event.published"));
    navigate("/customer/sourcing/" + bid.id);
  } catch (x) {
    document.getElementById("srEventError").textContent = x.message;
  }
});
// "Request bids for a task" on the offers page starts with the first task
async function wfCreateBidFromPage() {
  const projects = (await api("/projects")).projects || [],
    first = projects.flatMap((p) => (p.phases || []).flatMap((ph) => (ph.tasks || []).map((x) => [p.id, ph.id, x.id])))[0];
  if (!first) return tToast(t("offers.event.noTasks"), "error");
  await wfCreateBid(...first);
}
async function ccEditBid(id) {
  const b = (await ofBids()).find((x) => x.id === id),
    e = (key) => ofk("edit." + key);
  if (!b) return;
  modal(
    t("offers.edit.title"),
    `<form id="ccEditBidForm" class="modal-form" data-action="offers.saveEdit" data-bid="${esc(id)}"><label>${e("name")}<input name="title" value="${esc(b.title)}" maxlength="160" required></label><label>${e(
      "scope",
    )}<textarea name="description" rows="5">${esc(b.description)}</textarea></label><label>${e("due")}<input name="dueDate" type="date" value="${esc(b.dueDate)}" required></label><p>${e(
      "note",
    )}</p><div id="ccEditBidError" class="form-error"></div><button class="btn primary">${e("save")}</button></form>`,
  );
}
actions.on("offers.saveEdit", async (form) => {
  const f = new FormData(form);
  try {
    await api("/bids/" + encodeURIComponent(form.dataset.bid), {
      method: "PATCH",
      body: { action: "Update details", title: f.get("title"), description: f.get("description"), dueDate: f.get("dueDate") },
    });
    closeModal();
    tToast(t("offers.edit.saved"));
    await route();
  } catch (x) {
    document.getElementById("ccEditBidError").textContent = x.message;
  }
});
async function reviewInviteBid(bidId) {
  const [{ suppliers = [] }, bids] = await Promise.all([api("/suppliers"), ofBids(), pvLoad().catch(() => {})]),
    already = bids.find((x) => x.id === bidId)?.invitedSupplierIds || [],
    k = (key) => ofk("inv." + key);
  modal(
    t("offers.inv.title"),
    `<form id="reviewInviteForm" class="modal-form" data-action="offers.sendInvites" data-bid="${esc(bidId)}"><p class="modal-intro">${k("intro")}</p><label>${k(
      "search",
    )}<input id="reviewInviteSearch" placeholder="${k("searchHint")}" data-input="offers.searchInvite"></label>${
      pvData.suppliers.length ? `<button type="button" class="btn small outline pv-invite" data-action="offers.tickPreferred">${k("preferred")}</button>` : ""
    }<div class="review-invite-list">${
      suppliers
        .map(
          (s) =>
            `<label class="review-invite-row" data-search="${esc([s.company, s.location, ...(s.services || [])].join(" ").toLowerCase())}"><input type="checkbox" name="supplierIds" value="${esc(s.id)}"${
              already.includes(s.id) ? " checked disabled" : ""
            }><span><b>${esc(s.company)}</b><small>${ofDom(s.location || "")} · ${ofDom((s.services || []).slice(0, 3).join(", "))}</small></span><span class="badge ${esc((s.badge || "none").toLowerCase())}">${esc(ccBadge(s))}</span></label>`,
        )
        .join("") || `<p>${k("none")}</p>`
    }</div><button class="btn primary">${k("send")}</button></form>`,
  );
}
actions.on("offers.searchInvite", (input) => {
  const q = input.value.toLowerCase();
  document.querySelectorAll(".review-invite-row").forEach((r) => (r.hidden = !r.dataset.search.includes(q)));
});
actions.on("offers.tickPreferred", () => {
  for (const s of pvData.suppliers) {
    const box = document.querySelector(`#reviewInviteForm input[name="supplierIds"][value="${CSS.escape(s.supplierId)}"]`);
    if (box && !box.disabled) box.checked = true;
  }
});
actions.on("offers.sendInvites", async (form) => {
  const supplierIds = new FormData(form).getAll("supplierIds").filter(Boolean);
  if (!supplierIds.length) return tToast(t("offers.inv.pick"), "error");
  try {
    await api(`/bids/${encodeURIComponent(form.dataset.bid)}/invitations`, { method: "POST", body: { supplierIds } });
    closeModal();
    tToast(t("offers.inv.sent"));
    await route();
  } catch (x) {
    toast(x.message, "error");
  }
});

/* ---------- Clarifications and decisions ---------- */
async function reviewOfferTalk(bidId, offerId) {
  const offer = (await ofBids()).find((x) => x.id === bidId)?.offers?.find((x) => x.id === offerId);
  if (!offer) return;
  const customer = state.user.role === "customer",
    k = (key) => ofk("talk." + key);
  modal(
    t(customer ? "offers.talk.customerTitle" : "offers.talk.supplierTitle"),
    `<div><div class="review-chat-log">${
      (offer.clarifications || []).map((m) => `<article><b>${esc(m.authorName)}</b><p>${esc(m.text)}</p><small>${esc(fmt.date(m.createdAt))}</small></article>`).join("") || `<div class="empty">${k("empty")}</div>`
    }</div><form id="reviewClarifyForm" class="modal-form" data-action="offers.clarify" data-bid="${esc(bidId)}" data-offer="${esc(offerId)}"><label>${k(customer ? "question" : "reply")}<textarea name="text" maxlength="3000" required></textarea></label><button class="btn primary">${k(
      customer ? "ask" : "send",
    )}</button></form></div>`,
  );
}
actions.on("offers.clarify", async (form) => {
  try {
    await api(`/bids/${encodeURIComponent(form.dataset.bid)}/clarifications`, { method: "POST", body: { offerId: form.dataset.offer, text: new FormData(form).get("text") } });
    closeModal();
    await route();
  } catch (x) {
    toast(x.message, "error");
  }
});
async function reviewConfirmBid(id, offerId, action) {
  if (!(await uiConfirm(t(action === "Accept offer" ? "offers.decide.awardConfirm" : "offers.decide.closeConfirm")))) return;
  await wfBidDecision(id, offerId, action);
}
// The action names go to the server in English
async function wfBidDecision(id, offerId, action) {
  try {
    await api("/bids/" + encodeURIComponent(id), { method: "PATCH", body: { offerId, action } });
    tToast(t(action === "Accept offer" ? "offers.decide.awarded" : action === "Close bid" ? "offers.decide.closed" : "offers.decide.updated"));
    await route();
  } catch (e) {
    toast(e.message, "error");
  }
}
async function rvRequestOfferChanges(bidId, offerId) {
  const note = await uiPrompt(t("offers.decide.changesPrompt"), "", { confirmLabel: t("offers.decide.changesSend"), required: true });
  if (!note) return;
  try {
    await api(`/bids/${encodeURIComponent(bidId)}`, { method: "PATCH", body: { action: "Request changes", offerId, note } });
    tToast(t("offers.decide.changesSent"));
    await route();
  } catch (x) {
    toast(x.message, "error");
  }
}

routes.add("/customer/offers", (params, query) => ofPage("customer", query));
routes.add("/supplier/offers", (params, query) => ofPage("supplier", query));
routes.add("/supplier/bids", (params, query) => ofPage("supplier", query));
