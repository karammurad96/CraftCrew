/* Strategic sourcing UI: sourcing dashboard, weighted bid evaluation and award,
   contracts with renewal tracking, approvals inbox and supplier scorecards. */
const srEsc = (v) => esc(v ?? "");
const SR_WEIGHTS = { price: 50, delivery: 20, quality: 20, experience: 10 };
const SR_WEIGHT_LABELS = {
  price: "Price",
  delivery: "Delivery time",
  quality: "Supplier performance",
  experience: "Experience & badge",
};
const SR_ACTIVE = ["Open", "Shortlist", "Second round", "Final round"];
const srDays = (a, b) => Math.max(0, Math.round((Date.parse(b) - Date.parse(a)) / 86400000));
const srToday = () => new Date().toISOString().slice(0, 10);

Object.assign(UI_ICON_PATHS, {
  sourcing: '<circle cx="12" cy="12" r="9"/><circle cx="12" cy="12" r="5"/><circle cx="12" cy="12" r="1.5"/>',
  contracts:
    '<path d="M6 2h9l5 5v13a2 2 0 0 1-2 2H6a2 2 0 0 1-2-2V4a2 2 0 0 1 2-2z"/><path d="M14 2v6h6"/><path d="m8 16 2 2 5-5"/>',
  approvals: '<circle cx="12" cy="12" r="9"/><path d="m8 12 3 3 5-6"/>',
});
Object.assign(UI_NAV_ICONS, { sourcing: "sourcing", contracts: "contracts", approvals: "approvals" });

/* ---------- Weighted evaluation ---------- */
function srScoreOffers(bid, cards, suppliers, weights) {
  const offers = (bid.offers || []).filter((o) => !["Declined", "Withdrawn"].includes(o.status));
  if (!offers.length) return [];
  const minPrice = Math.min(...offers.map((o) => Number(o.amount) || Infinity)),
    minDays = Math.min(...offers.map((o) => Number(o.deliveryDays) || Infinity));
  const total = Object.values(weights).reduce((a, b) => a + b, 0) || 1;
  return offers
    .map((o) => {
      const card = cards.find((c) => c.supplierId === o.supplierId),
        s = suppliers.find((x) => x.id === o.supplierId) || {};
      const parts = {
        price: Math.round((minPrice / (Number(o.amount) || minPrice)) * 100),
        delivery: Math.round((minDays / (Number(o.deliveryDays) || minDays)) * 100),
        quality: card?.score ?? (s.rating ? Math.round((s.rating / 5) * 100) : 60),
        experience: Math.min(
          100,
          Math.round(
            ((Number(s.experience) || 0) / 20) * 70 + ({ Gold: 30, Silver: 20, Bronze: 10 }[s.badge] || 0),
          ),
        ),
      };
      const score = Math.round(Object.entries(weights).reduce((a, [k, w]) => a + parts[k] * w, 0) / total);
      return { o, s, card, parts, score, savings: bid.baseline ? bid.baseline - o.amount : null };
    })
    .sort((a, b) => b.score - a.score);
}
function srSummary(bid, ranked) {
  if (typeof i18nLang !== "undefined" && i18nLang === "de") return srSummaryDe(bid, ranked);
  if (!ranked.length) return "No offers received yet.";
  if (ranked.length === 1)
    return `One offer so far from ${ranked[0].o.supplierCompany}: ${money(ranked[0].o.amount)} in ${ranked[0].o.deliveryDays} days${bid.baseline ? `, ${money(Math.abs(ranked[0].savings))} ${ranked[0].savings >= 0 ? "under" : "over"} the baseline` : ""}. Consider inviting more suppliers for a competitive comparison.`;
  const [best, next] = ranked,
    cheapest = [...ranked].sort((a, b) => a.o.amount - b.o.amount)[0],
    fastest = [...ranked].sort((a, b) => a.o.deliveryDays - b.o.deliveryDays)[0];
  const lines = [
    `${best.o.supplierCompany} ranks first with ${best.score}/100 (${best.score - next.score} points ahead of ${next.o.supplierCompany}).`,
  ];
  if (cheapest !== best)
    lines.push(
      `${cheapest.o.supplierCompany} is cheapest at ${money(cheapest.o.amount)} (${Math.round(((best.o.amount - cheapest.o.amount) / best.o.amount) * 100)}% below the leader).`,
    );
  if (fastest !== best)
    lines.push(
      `${fastest.o.supplierCompany} delivers fastest (${fastest.o.deliveryDays} vs ${best.o.deliveryDays} days).`,
    );
  const spread = Math.round(
    (Math.max(...ranked.map((r) => r.o.amount)) / Math.min(...ranked.map((r) => r.o.amount)) - 1) * 100,
  );
  if (spread > 25) lines.push(`Prices differ by ${spread}% — check that all offers cover the same scope.`);
  if (bid.baseline)
    lines.push(
      best.savings >= 0
        ? `Awarding the leader saves ${money(best.savings)} against the ${money(bid.baseline)} baseline.`
        : `The leader is ${money(-best.savings)} over the ${money(bid.baseline)} baseline.`,
    );
  if (best.card?.riskLevel === "High")
    lines.push(
      `⚠ ${best.o.supplierCompany} has high-risk flags: ${best.card.risks
        .filter((r) => r.level === "high")
        .map((r) => r.text)
        .join("; ")}.`,
    );
  return lines.join(" ");
}

function srSummaryDe(bid, ranked) {
  const eur = (n) => `${Math.round(Math.abs(n)).toLocaleString("de-DE")} €`;
  if (!ranked.length) return "Noch keine Angebote eingegangen.";
  if (ranked.length === 1)
    return `Bisher ein Angebot von ${ranked[0].o.supplierCompany}: ${eur(ranked[0].o.amount)} in ${ranked[0].o.deliveryDays} Tagen${bid.baseline ? `, ${eur(ranked[0].savings)} ${ranked[0].savings >= 0 ? "unter" : "über"} dem Referenzbudget` : ""}. Laden Sie für einen echten Vergleich weitere Lieferanten ein.`;
  const [best, next] = ranked,
    cheapest = [...ranked].sort((a, b) => a.o.amount - b.o.amount)[0],
    fastest = [...ranked].sort((a, b) => a.o.deliveryDays - b.o.deliveryDays)[0];
  const lines = [
    `${best.o.supplierCompany} liegt mit ${best.score}/100 vorn (${best.score - next.score} Punkte vor ${next.o.supplierCompany}).`,
  ];
  if (cheapest !== best)
    lines.push(
      `${cheapest.o.supplierCompany} ist mit ${eur(cheapest.o.amount)} am günstigsten (${Math.round(((best.o.amount - cheapest.o.amount) / best.o.amount) * 100)} % unter dem Erstplatzierten).`,
    );
  if (fastest !== best)
    lines.push(
      `${fastest.o.supplierCompany} liefert am schnellsten (${fastest.o.deliveryDays} statt ${best.o.deliveryDays} Tage).`,
    );
  const spread = Math.round(
    (Math.max(...ranked.map((r) => r.o.amount)) / Math.min(...ranked.map((r) => r.o.amount)) - 1) * 100,
  );
  if (spread > 25)
    lines.push(
      `Die Preise weichen um ${spread} % voneinander ab – prüfen Sie, ob alle Angebote denselben Umfang abdecken.`,
    );
  if (bid.baseline)
    lines.push(
      best.savings >= 0
        ? `Ein Zuschlag an den Erstplatzierten spart ${eur(best.savings)} gegenüber dem Referenzbudget von ${eur(bid.baseline)}.`
        : `Der Erstplatzierte liegt ${eur(best.savings)} über dem Referenzbudget von ${eur(bid.baseline)}.`,
    );
  if (best.card?.riskLevel === "High")
    lines.push(`⚠ ${best.o.supplierCompany} hat Hinweise mit hohem Risiko.`);
  return lines.join(" ");
}

/* ---------- Sourcing dashboard ---------- */
async function srDashboard() {
  const [{ bids = [] }, { contracts = [] }, { scorecards = [] }, { invoices = [] }] = await Promise.all([
    api("/bids"),
    api("/contracts"),
    api("/scorecards").catch(() => ({})),
    api("/invoices"),
  ]);
  const year = String(new Date().getFullYear()),
    active = bids.filter((b) => SR_ACTIVE.includes(b.status)),
    awarded = bids.filter((b) => b.status === "Awarded");
  const savingsYtd = awarded
    .filter((b) => String(b.awardedAt || b.updatedAt).startsWith(year) && b.savings)
    .reduce((a, b) => a + b.savings, 0);
  const cycle = awarded.filter((b) => b.awardedAt).map((b) => srDays(b.createdAt, b.awardedAt)),
    avgCycle = cycle.length ? Math.round(cycle.reduce((a, b) => a + b, 0) / cycle.length) : null;
  const liveContracts = contracts.filter((c) => ["Active", "Expiring"].includes(c.state)),
    renewing = contracts.filter((c) => c.state === "Expiring");
  const byCategory = new Map();
  for (const i of invoices.filter((i) => ["Approved", "Paid", "Submitted"].includes(i.status)))
    for (const li of i.lineItems?.length ? i.lineItems : [{ service: "Uncategorised", total: i.amount }])
      byCategory.set(
        li.service || "Uncategorised",
        (byCategory.get(li.service || "Uncategorised") || 0) +
          Number(li.total ?? li.quantity * (li.unitPrice || li.rate) ?? 0),
      );
  const statusTag = (s) =>
    `<span class="status ${s === "Awarded" ? "completed" : s === "Closed" ? "rejected" : "submitted"}">${srEsc(s)}</span>`;
  app.innerHTML = dashboardShell(
    "customer",
    "sourcing",
    `<div class="dash-top"><div><div class="eyebrow">STRATEGIC SOURCING</div><h1>Sourcing</h1><p>Every sourcing event, contract and supplier in one view.</p></div><div class="in-toolbar"><a class="btn outline" href="#/customer/contracts">Contracts</a><a class="btn primary" href="#/customer/projects">+ New event from a task</a></div></div>
    <div class="in-kpis">${inKpi("Active events", active.length, `${bids.filter((b) => Date.now() - Date.parse(b.createdAt) < 7 * 86400000).length} new this week`)}${inKpi("In contract", money(liveContracts.reduce((a, c) => a + Number(c.value || 0), 0)), `${renewing.length} renewing soon`, renewing.length ? "warn" : "")}${inKpi(`Savings ${year}`, money(savingsYtd), `${awarded.length} awarded event(s) vs. baseline`, savingsYtd > 0 ? "good" : "")}${inKpi("Avg. cycle time", avgCycle === null ? "—" : `${avgCycle} d`, "request → award")}</div>
    <section class="panel"><div class="panel-title"><h3>Sourcing events</h3></div><div class="cc-table-wrap"><table class="cc-table sr-table"><thead><tr><th>Event</th><th>Category</th><th>Project</th><th>Baseline</th><th>Bids</th><th>Deadline</th><th>Status</th><th></th></tr></thead><tbody>${bids.map((b) => `<tr><td><b>${srEsc(b.title)}</b><small>${srEsc(b.eventType || "RFQ")} · ${srEsc(b.taskName || "")}</small></td><td>${srEsc(b.category || "—")}</td><td>${srEsc(b.projectName || "")}</td><td>${b.baseline ? money(b.baseline) : "—"}</td><td>${(b.offers || []).length}</td><td>${date(b.dueDate)}</td><td>${statusTag(b.status)}${b.savings ? `<small class="${b.savings >= 0 ? "success-text" : "danger-text"}">${b.savings >= 0 ? "Saved" : "Over"} ${money(Math.abs(b.savings))}</small>` : ""}</td><td><a class="btn small outline" href="#/customer/sourcing/${b.id}">${SR_ACTIVE.includes(b.status) ? "Evaluate" : "Open"}</a></td></tr>`).join("") || '<tr><td colspan="8">No sourcing events yet. Open a project task and choose <b>Request bids</b>.</td></tr>'}</tbody></table></div></section>
    <div class="in-grid"><section class="panel"><div class="panel-title"><h3>Spend by category</h3></div>${inDonut(inTopN(byCategory), "categories")}</section>
    <section class="panel"><div class="panel-title"><h3>Contracts renewing</h3><a href="#/customer/contracts">All contracts</a></div>${renewing.map((c) => `<a class="pa-row" href="#/customer/contracts"><span><b>${srEsc(c.title)}</b><small>${srEsc(c.supplierCompany)} · ends ${date(c.endDate)}${c.noticeBy ? ` · notice by ${date(c.noticeBy)}` : ""}</small></span><span class="pa-pill red">${c.daysToEnd} d</span></a>`).join("") || '<p class="pa-empty">No contracts end in the next 60 days.</p>'}</section></div>
    <section class="panel"><div class="panel-title"><h3>Supplier scorecards</h3><small class="subtle">Suppliers you have worked with or received offers from</small></div>${srScorecardTable(scorecards)}</section>`,
  );
}
function srScorecardTable(cards) {
  const riskTag = (l) => `<span class="sr-risk ${String(l).toLowerCase()}">${srEsc(l)}</span>`;
  return `<div class="cc-table-wrap"><table class="cc-table sr-table"><thead><tr><th>Supplier</th><th>Score</th><th>Rating</th><th>On time</th><th>Invoices right first time</th><th>Response rate</th><th>Risk</th></tr></thead><tbody>${
    [...cards]
      .sort((a, b) => (b.score ?? -1) - (a.score ?? -1))
      .map(
        (c) =>
          `<tr><td><b>${srEsc(c.company)}</b><small>${srEsc(c.badge || "No badge")}</small></td><td>${srScoreBar(c.score)}</td><td>${c.metrics.rating ? "★ " + Number(c.metrics.rating).toFixed(1) : "—"}</td><td>${c.metrics.onTimeRate ?? "—"}${c.metrics.onTimeRate === null ? "" : "%"}</td><td>${c.metrics.firstTimeRightRate ?? "—"}${c.metrics.firstTimeRightRate === null ? "" : "%"}</td><td>${c.metrics.responseRate ?? "—"}${c.metrics.responseRate === null ? "" : "%"}</td><td>${riskTag(c.riskLevel)}${c.risks.length ? `<small>${srEsc(c.risks[0].text)}</small>` : ""}</td></tr>`,
      )
      .join("") || '<tr><td colspan="7">No suppliers yet.</td></tr>'
  }</tbody></table></div>`;
}
const srScoreBar = (s) =>
  s === null || s === undefined
    ? '<span class="subtle">—</span>'
    : `<div class="sr-score"><b>${s}</b><i><em style="width:${s}%;background:${s >= 75 ? "#16a34a" : s >= 50 ? "#f59e0b" : "#dc2626"}"></em></i></div>`;

/* ---------- Event evaluation & award ---------- */
async function srEvent(bidId) {
  const [{ bids = [] }, { scorecards = [] }, { suppliers = [] }] = await Promise.all([
    api("/bids"),
    api("/scorecards").catch(() => ({})),
    api("/suppliers"),
  ]);
  const bid = bids.find((b) => b.id === bidId);
  if (!bid) {
    app.innerHTML = dashboardShell(
      "customer",
      "sourcing",
      '<div class="panel"><h2>Event not found</h2><a href="#/customer/sourcing">Back to sourcing</a></div>',
    );
    return;
  }
  const weights = { ...SR_WEIGHTS, ...(bid.weights || {}) },
    active = SR_ACTIVE.includes(bid.status);
  const render = () => {
    const ranked = srScoreOffers(bid, scorecards, suppliers, weights),
      questions = bid.questions || [];
    document.getElementById("srResults").innerHTML =
      `<div class="sr-summary"><b>Automatic evaluation</b><p>${srEsc(srSummary(bid, ranked))}</p></div>
      <div class="cc-table-wrap"><table class="cc-table sr-table"><thead><tr><th>#</th><th>Supplier</th><th>Offer</th><th>Delivery</th><th>vs. baseline</th>${Object.keys(
        weights,
      )
        .map((k) => `<th>${SR_WEIGHT_LABELS[k]}</th>`)
        .join("")}<th>Weighted score</th><th></th></tr></thead><tbody>${
        ranked
          .map(
            (r, i) =>
              `<tr class="${i === 0 ? "sr-best" : ""}"><td>${i + 1}</td><td><b>${srEsc(r.o.supplierCompany)}</b><small>${srEsc(r.s.badge || "")} ${r.card ? "· risk " + srEsc(r.card.riskLevel) : ""}</small></td><td><b>${money(r.o.amount)}</b></td><td>${r.o.deliveryDays} d</td><td>${r.savings === null ? "—" : `<span class="${r.savings >= 0 ? "success-text" : "danger-text"}">${r.savings >= 0 ? "−" : "+"}${money(Math.abs(r.savings))}</span>`}</td>${Object.keys(
                weights,
              )
                .map((k) => `<td>${r.parts[k]}</td>`)
                .join(
                  "",
                )}<td>${srScoreBar(r.score)}${i === 0 ? '<small class="sr-rec">Recommended</small>' : ""}</td><td>${active && r.o.status === "Submitted" ? `<button class="btn small ${i === 0 ? "primary" : "outline"}" onclick="srAward('${bid.id}','${r.o.id}')">Award</button><button class="btn small outline" onclick="rvRequestOfferChanges('${bid.id}','${r.o.id}')">Request changes</button>` : `<span class="status ${r.o.status === "Accepted" ? "completed" : "rejected"}">${srEsc(r.o.status)}</span>`}</td></tr>`,
          )
          .join("") || `<tr><td colspan="${7 + Object.keys(weights).length}">No offers yet.</td></tr>`
      }</tbody></table></div>
      ${questions.length && ranked.length ? `<h3 class="sr-h">Answers side by side</h3><div class="cc-table-wrap"><table class="cc-table sr-table sr-answers"><thead><tr><th>Question</th>${ranked.map((r) => `<th>${srEsc(r.o.supplierCompany)}</th>`).join("")}</tr></thead><tbody>${questions.map((q, qi) => `<tr><td><b>${srEsc(q)}</b></td>${ranked.map((r) => `<td>${srEsc(r.o.answers?.[qi] || "—")}</td>`).join("")}</tr>`).join("")}</tbody></table></div>` : ""}
      ${ranked.some((r) => r.o.notes) ? `<h3 class="sr-h">Scope notes</h3>${ranked.map((r) => (r.o.notes ? `<div class="sr-note"><b>${srEsc(r.o.supplierCompany)}</b><p>${srEsc(r.o.notes)}</p>${r.o.attachment ? `<a href="${srEsc(r.o.attachment)}">Offer document</a>` : ""}</div>` : "")).join("")}` : ""}`;
  };
  app.innerHTML = dashboardShell(
    "customer",
    "sourcing",
    `<div class="breadcrumb"><a href="#/customer/sourcing">← Sourcing</a></div><div class="dash-top"><div><div class="eyebrow">${srEsc(bid.eventType || "RFQ")} · ${srEsc(bid.status)}</div><h1>${srEsc(bid.title)}</h1><p>${srEsc(bid.projectName)} · ${srEsc(bid.taskName)} · deadline ${date(bid.dueDate)}${bid.baseline ? ` · baseline ${money(bid.baseline)}` : ""}</p></div>${active ? `<div class="in-toolbar"><button class="btn outline" onclick="reviewInviteBid('${bid.id}')">+ Invite suppliers</button><button class="btn outline" onclick="srCloseEvent('${bid.id}')">Close without award</button></div>` : ""}</div>
    ${bid.description ? `<section class="panel"><h3>Scope</h3><p>${srEsc(bid.description)}</p></section>` : ""}
    <section class="panel"><div class="panel-title"><h3>Evaluation weights</h3><div class="cc-actions"><button class="btn small outline" id="srReset">Reset</button><button class="btn small primary" id="srSaveWeights">Save weights</button></div></div><div class="sr-weights">${Object.keys(
      weights,
    )
      .map(
        (k) =>
          `<label>${SR_WEIGHT_LABELS[k]}<input type="range" min="0" max="100" step="5" name="${k}" value="${weights[k]}"><output>${weights[k]}</output></label>`,
      )
      .join(
        "",
      )}</div><p class="subtle">Scores are relative within this event: the best price and the fastest delivery score 100. Supplier performance uses the scorecard (rating, on-time delivery, invoice quality, responsiveness).</p></section>
    <section class="panel"><div class="panel-title"><h3>Offers ranked</h3><span class="ui-count">${(bid.offers || []).length}</span></div><div id="srResults"></div></section>`,
  );
  document.querySelectorAll(".sr-weights input").forEach(
    (inp) =>
      (inp.oninput = () => {
        weights[inp.name] = Number(inp.value);
        inp.nextElementSibling.value = inp.value;
        render();
      }),
  );
  document.getElementById("srReset").onclick = () => {
    Object.assign(weights, SR_WEIGHTS);
    document.querySelectorAll(".sr-weights input").forEach((i) => {
      i.value = weights[i.name];
      i.nextElementSibling.value = i.value;
    });
    render();
  };
  document.getElementById("srSaveWeights").onclick = async () => {
    try {
      await api(`/bids/${bid.id}`, { method: "PATCH", body: { action: "Set weights", weights } });
      toast("Evaluation weights saved");
    } catch (x) {
      toast(x.message, "error");
    }
  };
  render();
}
async function srAward(bidId, offerId) {
  const { bids = [] } = await api("/bids"),
    bid = bids.find((b) => b.id === bidId),
    offer = bid?.offers.find((o) => o.id === offerId);
  if (
    !offer ||
    !(await uiConfirm(
      `Award "${bid.title}" to ${offer.supplierCompany} for ${money(offer.amount)}?\n\nThe task is assigned to them, other bidders are notified, and a draft contract is created.`,
    ))
  )
    return;
  try {
    await api(`/bids/${bidId}`, { method: "PATCH", body: { action: "Accept offer", offerId } });
    toast("Awarded — draft contract created");
    navigate("/customer/contracts");
  } catch (x) {
    toast(x.message, "error");
  }
}
async function srCloseEvent(bidId) {
  if (!(await uiConfirm("Close this event without an award? Open offers are marked as not selected.")))
    return;
  try {
    await api(`/bids/${bidId}`, { method: "PATCH", body: { action: "Close bid" } });
    toast("Event closed");
    srEvent(bidId);
  } catch (x) {
    toast(x.message, "error");
  }
}

/* Richer event creation (type, category, baseline, questionnaire) replaces the basic form. */
wfCreateBid = async function (pid, phid, tid) {
  const [{ project: p }, cfg] = await Promise.all([
      api("/projects/" + pid),
      api("/platform-config").catch(() => ({})),
    ]),
    ph = p.phases.find((x) => x.id === phid),
    t = ph.tasks.find((x) => x.id === tid);
  modal(
    "Create sourcing event",
    `<form id="srEventForm" class="modal-form"><p class="modal-intro">Invite suppliers to quote for <b>${srEsc(t.name)}</b>. Offers are ranked with your evaluation weights; the task is awarded to one supplier.</p><div class="two"><label>Event type<select name="eventType"><option value="RFQ">RFQ — request for quotation</option><option value="RFP">RFP — request for proposal</option><option value="RFI">RFI — request for information</option></select></label><label>Category<select name="category"><option value="">Choose…</option>${(cfg.serviceCategories || []).map((c) => `<option>${srEsc(c)}</option>`).join("")}</select></label></div><label>Title<input name="title" value="${srEsc(t.name)}" required></label><label>Scope<textarea name="description" rows="3" required>${srEsc(t.description || "")}</textarea></label><div class="two"><label>Response deadline<input name="dueDate" type="date" min="${srToday()}" value="${t.dueDate || p.dueDate}" required></label><label>Baseline budget (€)<input name="baseline" type="number" min="0" step="0.01" value="${t.orderAmount || ""}" placeholder="Used to calculate savings"></label></div><label>Questions for suppliers <small class="subtle">(one per line, optional)</small><textarea name="questions" rows="3" placeholder="Which certifications apply to this scope?&#10;Who is the site lead and what is their availability?"></textarea></label><div id="srEventError" class="form-error"></div><button class="btn primary">Publish event</button></form>`,
  );
  document.getElementById("srEventForm").onsubmit = async (e) => {
    e.preventDefault();
    const b = Object.fromEntries(new FormData(e.target));
    b.questions = String(b.questions || "")
      .split("\n")
      .map((x) => x.trim())
      .filter(Boolean);
    Object.assign(b, { projectId: pid, phaseId: phid, taskId: tid, weights: SR_WEIGHTS });
    try {
      const { bid } = await api("/bids", { method: "POST", body: b });
      closeModal();
      toast("Sourcing event published");
      navigate("/customer/sourcing/" + bid.id);
    } catch (x) {
      document.getElementById("srEventError").textContent = x.message;
    }
  };
};
/* Supplier offer form with the event's questionnaire. */
ccOpenBidOffer = async function (id) {
  const b = (await api("/bids")).bids.find((x) => x.id === id),
    mine = b?.offers?.find((o) => o.supplierId === state.user.supplierId);
  if (!b) return;
  modal(
    mine ? "Revise offer" : "Submit offer",
    `<form id="srOfferForm" class="modal-form"><p><b>${srEsc(b.title)}</b><br><small class="subtle">${srEsc(b.eventType || "RFQ")} · ${srEsc(b.projectName)} · ${srEsc(b.taskName)} · deadline ${date(b.dueDate)}</small></p>${b.description ? `<p class="subtle">${srEsc(b.description)}</p>` : ""}${mine?.status === "Changes requested" ? `<div class="notice warn"><b>The customer asked for changes:</b> ${srEsc(mine.changeNote || "")}</div>` : ""}<div class="two"><label>Total offer (€)<input name="amount" type="number" min="1" step="0.01" value="${mine?.amount || ""}" required></label><label>Delivery days<input name="deliveryDays" type="number" min="1" value="${mine?.deliveryDays || ""}" required></label></div>${(b.questions || []).map((q, i) => `<label>${srEsc(q)}<textarea name="answer_${i}" rows="2" required>${srEsc(mine?.answers?.[i] || "")}</textarea></label>`).join("")}<label>Included scope & assumptions<textarea name="notes" rows="3">${srEsc(mine?.notes || "")}</textarea></label><label>Offer document<input name="offerFile" type="file" accept=".pdf,.doc,.docx,.xlsx,.xls"></label>${mine?.attachment ? `<a href="${srEsc(mine.attachment)}">Current offer document</a>` : ""}${mine ? `<label>What did you change? <small class="subtle">shown to the customer</small><textarea name="revisionNote" rows="2" placeholder="e.g. Split the price per robot cell and added commissioning hours"></textarea></label>` : ""}<div id="srOfferError" class="form-error"></div><button class="btn primary">${mine ? "Save and resend" : "Send offer"}</button></form>`,
  );
  document.getElementById("srOfferForm").onsubmit = async (e) => {
    e.preventDefault();
    const f = new FormData(e.target),
      file = e.target.elements.offerFile.files[0];
    const body = {
      amount: f.get("amount"),
      deliveryDays: f.get("deliveryDays"),
      notes: f.get("notes"),
      revisionNote: f.get("revisionNote") || "",
      answers: (b.questions || []).map((_, i) => f.get("answer_" + i)),
    };
    try {
      if (file) body.attachment = (await uploadFile(file)).url;
      else if (mine?.attachment) body.attachment = mine.attachment;
      await api(`/bids/${id}/offers`, { method: "POST", body });
      closeModal();
      toast("Offer sent");
      route();
    } catch (x) {
      document.getElementById("srOfferError").textContent = x.message;
    }
  };
};

/* ---------- Contracts ---------- */
async function srContracts(role) {
  const { contracts = [] } = await api("/contracts"),
    q = new URLSearchParams(location.hash.split("?")[1] || ""),
    filter = q.get("state") || "";
  const list = contracts.filter((c) => !filter || c.state === filter),
    stateTag = (s) =>
      `<span class="status ${{ Active: "completed", Expiring: "submitted", Expired: "rejected", Terminated: "rejected", Draft: "" }[s] || ""}">${srEsc(s)}</span>`;
  const counts = ["Draft", "Active", "Expiring", "Expired", "Terminated"].map((s) => [
    s,
    contracts.filter((c) => c.state === s).length,
  ]);
  app.innerHTML = dashboardShell(
    role,
    "contracts",
    `<div class="dash-top"><div><div class="eyebrow">CONTRACT MANAGEMENT</div><h1>Contracts</h1><p>${role === "customer" ? "Agreements with your suppliers, their value, terms and renewal deadlines." : "Active agreements with your customers."}</p></div>${role === "customer" ? '<button class="btn primary" onclick="srContractForm()">+ New contract</button>' : ""}</div>
    <div class="sr-chips"><a class="${filter ? "" : "on"}" href="#/${role}/contracts">All <b>${contracts.length}</b></a>${counts
      .filter(([, n]) => n)
      .map(
        ([s, n]) =>
          `<a class="${filter === s ? "on" : ""}" href="#/${role}/contracts?state=${s}">${s} <b>${n}</b></a>`,
      )
      .join("")}</div>
    <section class="panel"><div class="cc-table-wrap"><table class="cc-table sr-table"><thead><tr><th>Contract</th><th>${role === "customer" ? "Supplier" : "Customer project"}</th><th>Value</th><th>Term</th><th>Notice by</th><th>Status</th>${role === "customer" ? "<th></th>" : ""}</tr></thead><tbody>${list.map((c) => `<tr><td><b>${srEsc(c.title)}</b><small>${srEsc(c.category || "")}${c.bidId ? " · from sourcing event" : ""}${c.autoRenew ? " · auto-renews" : ""}</small></td><td>${srEsc(role === "customer" ? c.supplierCompany : c.projectName || "—")}</td><td><b>${money(c.value)}</b></td><td>${c.startDate ? date(c.startDate) : "—"} → ${c.endDate ? date(c.endDate) : '<span class="subtle">open</span>'}${c.daysToEnd !== null && c.daysToEnd >= 0 && c.state !== "Draft" ? `<small>${c.daysToEnd} days left</small>` : ""}</td><td>${c.noticeBy ? date(c.noticeBy) : "—"}</td><td>${stateTag(c.state)}</td>${role === "customer" ? `<td><button class="btn small outline" onclick="srContractForm('${c.id}')">Edit</button></td>` : ""}</tr>`).join("") || `<tr><td colspan="7">${role === "customer" ? "No contracts yet. Awarding a sourcing event creates a draft automatically." : "No contracts shared with you yet."}</td></tr>`}</tbody></table></div></section>`,
  );
}
async function srContractForm(id) {
  const [{ contracts = [] }, { suppliers = [] }, { projects = [] }] = await Promise.all([
      api("/contracts"),
      api("/suppliers"),
      api("/projects"),
    ]),
    c = contracts.find((x) => x.id === id) || { status: "Draft", noticeDays: 30, startDate: srToday() };
  modal(
    id ? "Edit contract" : "New contract",
    `<form id="srContractForm" class="modal-form"><label>Title<input name="title" value="${srEsc(c.title || "")}" required></label><div class="two"><label>Supplier<select name="supplierId" ${id ? "disabled" : ""} required><option value="">Choose…</option>${suppliers.map((s) => `<option value="${s.id}" ${s.id === c.supplierId ? "selected" : ""}>${srEsc(s.company)}</option>`).join("")}</select></label><label>Project (optional)<select name="projectId" ${id ? "disabled" : ""}><option value="">—</option>${projects.map((p) => `<option value="${p.id}" ${p.id === c.projectId ? "selected" : ""}>${srEsc(p.name)}</option>`).join("")}</select></label></div><div class="two"><label>Value (€)<input name="value" type="number" min="0" step="0.01" value="${c.value ?? ""}" required></label><label>Category<input name="category" value="${srEsc(c.category || "")}"></label></div><div class="two"><label>Start<input name="startDate" type="date" value="${c.startDate || ""}"></label><label>End<input name="endDate" type="date" value="${c.endDate || ""}"></label></div><div class="two"><label>Notice period (days)<input name="noticeDays" type="number" min="0" max="365" value="${c.noticeDays ?? 30}"></label><label>Status<select name="status">${["Draft", "Active", "Terminated"].map((s) => `<option ${s === c.status ? "selected" : ""}>${s}</option>`).join("")}</select></label></div><label class="cc-check-label"><input type="checkbox" name="autoRenew" ${c.autoRenew ? "checked" : ""}> Renews automatically unless cancelled</label><label>Key terms<textarea name="terms" rows="3">${srEsc(c.terms || "")}</textarea></label><label>Signed contract (PDF)<input name="file" type="file" accept=".pdf"></label>${c.documentUrl ? `<a href="${srEsc(c.documentUrl)}">Current contract document</a>` : ""}<div id="srContractError" class="form-error"></div><button class="btn primary">${id ? "Save contract" : "Create contract"}</button></form>`,
  );
  document.getElementById("srContractForm").onsubmit = async (e) => {
    e.preventDefault();
    const f = new FormData(e.target),
      b = Object.fromEntries(f),
      file = e.target.elements.file.files[0];
    b.autoRenew = f.has("autoRenew");
    delete b.file;
    try {
      if (file) b.documentUrl = (await uploadFile(file)).url;
      await api(id ? `/contracts/${id}` : "/contracts", { method: id ? "PATCH" : "POST", body: b });
      closeModal();
      toast(id ? "Contract saved" : "Contract created");
      srContracts("customer");
    } catch (x) {
      document.getElementById("srContractError").textContent = x.message;
    }
  };
}

/* ---------- Approvals inbox ---------- */
async function srApprovals() {
  const [{ invoices = [] }, { projects = [] }, { entries = [] }, { bids = [] }, { contracts = [] }] =
    await Promise.all([
      api("/invoices"),
      api("/projects"),
      api("/time-entries").catch(() => ({})),
      api("/bids"),
      api("/contracts"),
    ]);
  const docs = (
    await Promise.all(
      projects.map((p) =>
        api(`/projects/${p.id}/documents`)
          .then((d) => (d.documents || []).map((x) => ({ ...x, projectName: p.name })))
          .catch(() => []),
      ),
    )
  ).flat();
  const groups = [
    [
      "Invoices to approve",
      "invoices",
      invoices
        .filter((i) => i.status === "Submitted")
        .map((i) => ({
          title: `${i.supplierCompany || ""} · ${money(i.amount)}`,
          sub: `${i.taskName || i.description || i.id}${i.orderedAmount && i.amount > i.orderedAmount ? " · over order cap" : ""}`,
          since: i.updatedAt || i.createdAt,
          link: `/customer/invoice/${encodeURIComponent(i.id)}`,
        })),
    ],
    [
      "Documents to review",
      "contracts",
      docs
        .filter((d) => d.status === "Pending approval")
        .map((d) => ({
          title: d.filename,
          sub: `${d.projectName} · ${d.taskName || d.phaseName || "Project"}`,
          since: d.uploadedAt,
          link: `/customer/projects/${d.projectId}/documents`,
        })),
    ],
    [
      "Time entries to approve",
      "time",
      entries
        .filter((t) => t.status === "Pending approval")
        .map((t) => ({
          title: `${t.employeeName} · ${t.hours} h`,
          sub: `${t.taskName} · ${date(t.workDate)}`,
          since: t.submittedAt,
          link: "/customer/time",
        })),
    ],
    [
      "Offers to decide",
      "sourcing",
      bids
        .filter((b) => SR_ACTIVE.includes(b.status) && (b.offers || []).some((o) => o.status === "Submitted"))
        .map((b) => ({
          title: b.title,
          sub: `${b.offers.filter((o) => o.status === "Submitted").length} offer(s) · deadline ${date(b.dueDate)}`,
          since: b.updatedAt,
          link: `/customer/sourcing/${b.id}`,
        })),
    ],
    [
      "Contracts to activate",
      "contracts",
      contracts
        .filter((c) => c.state === "Draft")
        .map((c) => ({
          title: c.title,
          sub: `${c.supplierCompany} · ${money(c.value)}`,
          since: c.createdAt,
          link: "/customer/contracts?state=Draft",
        })),
    ],
  ];
  const total = groups.reduce((a, [, , l]) => a + l.length, 0),
    age = (d) => {
      const n = srDays(d || new Date(), new Date());
      return n ? `${n} d waiting` : "today";
    };
  app.innerHTML = dashboardShell(
    "customer",
    "approvals",
    `<div class="dash-top"><div><div class="eyebrow">WORKFLOW</div><h1>Approvals</h1><p>${total ? `${total} decision(s) waiting for you, oldest first.` : "Nothing is waiting for your decision."}</p></div></div><div class="in-grid">${groups
      .map(
        ([title, icon, list]) =>
          `<section class="panel"><div class="panel-title"><h3>${uiIcon(icon, "ui-icon sr-h-icon")} ${title}</h3><span class="ui-count">${list.length}</span></div>${
            list
              .sort((a, b) => String(a.since).localeCompare(String(b.since)))
              .map(
                (x) =>
                  `<a class="pa-row" href="#${x.link}"><span><b>${srEsc(x.title)}</b><small>${srEsc(x.sub)}</small></span><span class="pa-pill ${srDays(x.since || new Date(), new Date()) > 5 ? "red" : ""}">${age(x.since)}</span></a>`,
              )
              .join("") || '<p class="pa-empty">All clear.</p>'
          }</section>`,
      )
      .join("")}</div>`,
  );
}

/* ---------- Scorecards on supplier pages, supplier analytics and admin reports ---------- */
async function srScorecardPanel(supplierId, target) {
  if (!target || target.querySelector(".sr-card-panel")) return;
  const { scorecard: c } = await api(`/suppliers/${supplierId}/scorecard`).catch(() => ({}));
  if (!c) return;
  const m = c.metrics,
    stat = (l, v, s = "") =>
      `<div><span class="cc-label">${l}</span><b>${v ?? "—"}${v === null || v === undefined ? "" : s}</b></div>`;
  target.insertAdjacentHTML(
    "beforeend",
    `<section class="panel sr-card-panel"><div class="panel-title"><h3>Supplier scorecard</h3><span class="sr-risk ${c.riskLevel.toLowerCase()}">${c.riskLevel} risk</span></div><div class="sr-card-top"><div class="sr-big-score" style="--s:${c.score ?? 0}"><b>${c.score ?? "—"}</b><small>of 100</small></div><div class="sr-card-stats">${stat("Rating", m.rating ? "★ " + Number(m.rating).toFixed(1) : null)}${stat("Quality", m.quality)}${stat("Schedule", m.schedule)}${stat("Communication", m.communication)}${stat("On-time delivery", m.onTimeRate, "%")}${stat("Invoices right first time", m.firstTimeRightRate, "%")}${stat("Bid response rate", m.responseRate, "%")}${stat("Win rate", m.winRate, "%")}</div></div>${c.risks.length ? `<ul class="sr-risks">${c.risks.map((r) => `<li class="${r.level}">${srEsc(r.text)}</li>`).join("")}</ul>` : '<p class="success-text">No risk flags.</p>'}</section>`,
  );
}
async function srAdminScorecards() {
  const content = document.querySelector(".dashboard-content");
  if (!content || content.querySelector(".sr-admin-cards")) return;
  const { scorecards = [] } = await api("/scorecards").catch(() => ({}));
  content.insertAdjacentHTML(
    "beforeend",
    `<section class="panel sr-admin-cards"><div class="panel-title"><h3>Supplier scorecards & risk</h3><span class="ui-count">${scorecards.length}</span></div>${srScorecardTable(scorecards)}</section>`,
  );
}

/* ---------- Navigation and routing ---------- */
function srNav() {
  const nav = document.querySelector(".sidebar nav"),
    role = state.user?.role;
  if (!nav || !["customer", "supplier"].includes(role)) return;
  const here = location.hash.split("?")[0],
    add = (key, label, after) => {
      if (nav.querySelector(`[href="#/${role}/${key}"]`)) return;
      const a = document.createElement("a");
      a.href = `#/${role}/${key}`;
      a.textContent = label;
      if (here.startsWith(`#/${role}/${key}`)) {
        nav.querySelectorAll("a.active").forEach((x) => x.classList.remove("active"));
        a.className = "active";
      }
      (nav.querySelector(`[href="#/${role}/${after}"]`) || nav.lastElementChild).after(a);
    };
  if (role === "customer") {
    add("approvals", "Approvals", "analytics");
    add("sourcing", "Sourcing", "projects");
    add("contracts", "Contracts", "sourcing");
  } else add("contracts", "Contracts", "invoices");
}
const srBaseRoute = window.route;
window.route = async function () {
  const path = location.hash.replace(/^#/, "").split("?")[0],
    parts = path.split("/").filter(Boolean),
    role = state.user?.role;
  const own = parts[0] === role;
  try {
    if (own && role === "customer" && parts[1] === "sourcing") {
      parts[2] ? await srEvent(parts[2]) : await srDashboard();
      inNav();
      srNav();
      return;
    }
    if (own && role === "customer" && parts[1] === "approvals") {
      await srApprovals();
      inNav();
      srNav();
      return;
    }
    if (own && ["customer", "supplier"].includes(role) && parts[1] === "contracts") {
      await srContracts(role);
      inNav();
      srNav();
      return;
    }
  } catch (e) {
    console.error(e);
    toast(e.message, "error");
    return;
  }
  const result = await srBaseRoute();
  srNav();
  try {
    if (parts[0] === "customer" && parts[1] === "suppliers" && parts[2])
      await srScorecardPanel(
        parts[2],
        document.querySelector(".dashboard-content .cc-page") || document.querySelector(".dashboard-content"),
      );
    if (parts[0] === "supplier" && parts[1] === "analytics" && state.user?.supplierId)
      await srScorecardPanel(state.user.supplierId, document.querySelector(".dashboard-content"));
    if (parts[0] === "admin" && parts[1] === "reports") await srAdminScorecards();
  } catch (e) {
    console.error(e);
  }
  return result;
};
