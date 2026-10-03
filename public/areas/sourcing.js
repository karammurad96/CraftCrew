/* Area: sourcing (T129c). The sourcing dashboard, the offer comparison of one event (the board OfferCompare, T100:
   one card per offer above the weighted ranking, the weights folded away), award and close, and contracts with
   the contract form. Drawn with translation keys; titles, company names and categories are data. The approvals
   inbox stays in sourcing-ui.js until its invoice, time and compliance rows move (T133). */
const srk = (key, params) => esc(t("src." + key, params));
const srDom = (text) => `<bdi data-i18n="dom">${esc(text)}</bdi>`;
const srKeys = (html) => html.replace(/^<(\w+)/, '<$1 data-i18n="keys"');
const srStatus = (s) => (OF_STATUSES.includes(s) ? ofk("statuses." + s) : srDom(s));
const srRisk = (l) => (["Low", "Medium", "High"].includes(l) ? srk("risk." + l) : srDom(l));
const SR_CONTRACT_STATES = ["Draft", "Active", "Expiring", "Expired", "Terminated"];
const srState = (s) => (SR_CONTRACT_STATES.includes(s) ? srk("con.states." + s) : srDom(s));

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
        experience: Math.min(100, Math.round(((Number(s.experience) || 0) / 20) * 70 + ({ Gold: 30, Silver: 20, Bronze: 10 }[s.badge] || 0))),
      };
      const score = Math.round(Object.entries(weights).reduce((a, [k, w]) => a + parts[k] * w, 0) / total);
      return { o, s, card, parts, score, savings: bid.baseline ? bid.baseline - o.amount : null };
    })
    .sort((a, b) => b.score - a.score);
}
// The automatic evaluation in a few sentences
function srSummary(bid, ranked) {
  const s = (key, params) => t("src.sum." + key, params),
    m = (n) => fmt.money(Math.abs(n));
  if (!ranked.length) return s("none");
  if (ranked.length === 1) {
    const r = ranked[0],
      base = { company: r.o.supplierCompany, amount: m(r.o.amount), days: r.o.deliveryDays, diff: m(r.savings || 0) };
    return s(!bid.baseline ? "one" : r.savings >= 0 ? "oneUnder" : "oneOver", base);
  }
  const [best, next] = ranked,
    cheapest = [...ranked].sort((a, b) => a.o.amount - b.o.amount)[0],
    fastest = [...ranked].sort((a, b) => a.o.deliveryDays - b.o.deliveryDays)[0],
    lines = [s("lead", { company: best.o.supplierCompany, score: best.score, gap: best.score - next.score, next: next.o.supplierCompany })];
  if (cheapest !== best)
    lines.push(s("cheapest", { company: cheapest.o.supplierCompany, amount: m(cheapest.o.amount), pct: Math.round(((best.o.amount - cheapest.o.amount) / best.o.amount) * 100) }));
  if (fastest !== best) lines.push(s("fastest", { company: fastest.o.supplierCompany, days: fastest.o.deliveryDays, leaderDays: best.o.deliveryDays }));
  const spread = Math.round((Math.max(...ranked.map((r) => r.o.amount)) / Math.min(...ranked.map((r) => r.o.amount)) - 1) * 100);
  if (spread > 25) lines.push(s("spread", { pct: spread }));
  if (bid.baseline) lines.push(s(best.savings >= 0 ? "saves" : "over", { amount: m(best.savings), baseline: m(bid.baseline) }));
  if (best.card?.riskLevel === "High")
    lines.push(s("risk", { company: best.o.supplierCompany, flags: best.card.risks.filter((r) => r.level === "high").map((r) => r.text).join("; ") }));
  return lines.join(" ");
}
const srScoreBar = (s) =>
  s === null || s === undefined
    ? '<span class="subtle">—</span>'
    : `<div class="sr-score"><b>${s}</b><i><em style="width:${s}%;background:${s >= 75 ? "#16a34a" : s >= 50 ? "#f59e0b" : "#dc2626"}"></em></i></div>`;
// Also shown on the admin reports page (sourcing-ui.js)
function srScorecardTable(cards) {
  const c = (key) => srk("card." + key),
    pct = (v) => (v === null || v === undefined ? "—" : `${v}%`);
  return `<div class="cc-table-wrap" data-i18n="keys"><table class="cc-table sr-table"><thead><tr><th>${c("supplier")}</th><th>${c("score")}</th><th>${c("rating")}</th><th>${c("onTime")}</th><th>${c(
    "firstTime",
  )}</th><th>${c("response")}</th><th>${c("risk")}</th></tr></thead><tbody>${
    [...cards]
      .sort((a, b) => (b.score ?? -1) - (a.score ?? -1))
      .map(
        (x) =>
          `<tr><td><b>${esc(x.company)}</b><small>${esc(ccBadge(x))}</small></td><td>${srScoreBar(x.score)}</td><td>${x.metrics.rating ? "★ " + Number(x.metrics.rating).toFixed(1) : "—"}</td><td>${pct(
            x.metrics.onTimeRate,
          )}</td><td>${pct(x.metrics.firstTimeRightRate)}</td><td>${pct(x.metrics.responseRate)}</td><td><span class="sr-risk ${esc(String(x.riskLevel).toLowerCase())}">${srRisk(x.riskLevel)}</span>${
            x.risks.length ? `<small>${srDom(x.risks[0].text)}</small>` : ""
          }</td></tr>`,
      )
      .join("") || `<tr><td colspan="7">${c("none")}</td></tr>`
  }</tbody></table></div>`;
}

/* ---------- Sourcing dashboard ---------- */
async function srDashboard() {
  const [{ bids = [] }, { contracts = [] }, { scorecards = [] }, { invoices = [] }] = await Promise.all([
    api("/bids"),
    api("/contracts"),
    api("/scorecards").catch(() => ({})),
    api("/invoices"),
  ]);
  const d = (key, params) => srk("dash." + key, params),
    year = String(new Date().getFullYear()),
    active = bids.filter((b) => SR_ACTIVE.includes(b.status)),
    awarded = bids.filter((b) => b.status === "Awarded"),
    savingsYtd = awarded.filter((b) => String(b.awardedAt || b.updatedAt).startsWith(year) && b.savings).reduce((a, b) => a + b.savings, 0),
    cycle = awarded.filter((b) => b.awardedAt).map((b) => srDays(b.createdAt, b.awardedAt)),
    avgCycle = cycle.length ? Math.round(cycle.reduce((a, b) => a + b, 0) / cycle.length) : null,
    liveContracts = contracts.filter((c) => ["Active", "Expiring"].includes(c.state)),
    renewing = contracts.filter((c) => c.state === "Expiring");
  const byCategory = new Map();
  for (const i of invoices.filter((i) => ["Approved", "Paid", "Submitted"].includes(i.status)))
    for (const li of i.lineItems?.length ? i.lineItems : [{ service: "Uncategorised", total: i.amount }])
      byCategory.set(li.service || "Uncategorised", (byCategory.get(li.service || "Uncategorised") || 0) + Number(li.total ?? li.quantity * (li.unitPrice || li.rate) ?? 0));
  const kpi = (label, value, sub, tone = "") => `<div class="in-kpi ${tone}"><span class="cc-label">${label}</span><strong>${esc(value)}</strong><small>${sub}</small></div>`,
    statusTag = (s) => `<span class="status ${s === "Awarded" ? "completed" : s === "Closed" ? "rejected" : "submitted"}">${srStatus(s)}</span>`,
    row = (b) =>
      `<tr><td><b>${esc(b.title)}</b><small>${esc(b.eventType || "RFQ")} · ${esc(b.taskName || "")}</small></td><td>${b.category ? statusHtml(b.category) : "—"}</td><td>${esc(b.projectName || "")}</td><td>${
        b.baseline ? esc(fmt.money(b.baseline)) : "—"
      }</td><td>${(b.offers || []).length}</td><td>${esc(fmt.date(b.dueDate))}</td><td>${statusTag(b.status)}${
        b.savings ? `<small class="${b.savings >= 0 ? "success-text" : "danger-text"}">${d(b.savings >= 0 ? "saved" : "over", { amount: fmt.money(Math.abs(b.savings)) })}</small>` : ""
      }</td><td><a class="btn small outline" href="#/customer/sourcing/${esc(b.id)}">${d(SR_ACTIVE.includes(b.status) ? "evaluate" : "open")}</a></td></tr>`;
  app.innerHTML = dashboardShell(
    "customer",
    "sourcing",
    [
      `<div class="dash-top"><div><div class="eyebrow">${d("eyebrow")}</div><h1>${d("title")}</h1><p>${d("intro")}</p></div><div class="in-toolbar"><a class="btn outline" href="#/customer/contracts">${d(
        "contracts",
      )}</a><a class="btn primary" href="#/customer/projects">${d("newEvent")}</a></div></div>`,
      `<div class="in-kpis">${kpi(d("active"), active.length, d("newWeek", { n: bids.filter((b) => Date.now() - Date.parse(b.createdAt) < 7 * 86400000).length }))}${kpi(
        d("inContract"),
        fmt.money(liveContracts.reduce((a, c) => a + Number(c.value || 0), 0)),
        d("renewing", { n: renewing.length }),
        renewing.length ? "warn" : "",
      )}${kpi(d("savings", { year }), fmt.money(savingsYtd), d("awarded", { n: awarded.length }), savingsYtd > 0 ? "good" : "")}${kpi(
        d("cycle"),
        avgCycle === null ? "—" : t("src.dash.cycleValue", { n: avgCycle }),
        d("cycleSub"),
      )}</div>`,
      `<section class="panel"><div class="panel-title"><h3>${d("events")}</h3></div><div class="cc-table-wrap"><table class="cc-table sr-table"><thead><tr>${["colEvent", "colCategory", "colProject", "colBaseline", "colBids", "colDeadline", "colStatus"]
        .map((k) => `<th>${d(k)}</th>`)
        .join("")}<th></th></tr></thead><tbody>${bids.map(row).join("") || `<tr><td colspan="8">${tHtml("src.dash.empty", { requestBids: `<b>${d("requestBids")}</b>` })}</td></tr>`}</tbody></table></div></section>`,
      // The donut comes from the analytics helpers, still on the old translation
      `<div class="in-grid"><section class="panel"><div class="panel-title"><h3>${d("spend")}</h3></div><div data-i18n="dom">${inDonut(inTopN(byCategory), t("src.dash.categories"))}</div></section>
    <section class="panel"><div class="panel-title"><h3>${d("renewingTitle")}</h3><a href="#/customer/contracts">${d("allContracts")}</a></div>${
      renewing
        .map(
          (c) =>
            `<a class="pa-row" href="#/customer/contracts"><span><b>${esc(c.title)}</b><small>${d("ends", { supplier: c.supplierCompany, date: fmt.date(c.endDate) })}${
              c.noticeBy ? " · " + d("noticeBy", { date: fmt.date(c.noticeBy) }) : ""
            }</small></span><span class="pa-pill red">${d("days", { n: c.daysToEnd })}</span></a>`,
        )
        .join("") || `<p class="pa-empty">${d("noRenewing")}</p>`
    }</section></div>`,
      `<section class="panel"><div class="panel-title"><h3>${d("scorecards")}</h3><small class="subtle">${d("scorecardsHint")}</small></div>${srScorecardTable(scorecards)}</section>`,
    ]
      .map(srKeys)
      .join("\n    "),
  );
}

/* ---------- One event: offer cards, weights and the ranked table ---------- */
let srCur = null; // { bid, weights, scorecards, suppliers, jobs } of the event on screen
async function srEvent(bidId) {
  const [{ bids = [] }, { scorecards = [] }, { suppliers = [] }, { projects = [] }] = await Promise.all([
    api("/bids"),
    api("/scorecards").catch(() => ({})),
    api("/suppliers"),
    api("/projects").catch(() => ({})),
    bmEnsure(),
  ]);
  const bid = bids.find((b) => b.id === bidId),
    e = (key, params) => srk("ev." + key, params);
  if (!bid) {
    app.innerHTML = dashboardShell("customer", "sourcing", `<div class="panel" data-i18n="keys"><h2>${e("notFound")}</h2><a href="#/customer/sourcing">${e("backTo")}</a></div>`);
    return;
  }
  // Jobs with this customer: projects where the supplier accepted a task
  const jobs = (sid) =>
    new Set(projects.filter((p) => (p.phases || []).some((ph) => (ph.tasks || []).some((x) => x.assignedSupplierId === sid && x.acceptanceStatus === "Accepted"))).map((p) => p.id)).size;
  srCur = { bid, weights: { ...SR_WEIGHTS, ...(bid.weights || {}) }, scorecards, suppliers, jobs };
  const active = SR_ACTIVE.includes(bid.status),
    kicker = [esc(bid.projectName || ""), srStatus(bid.status), bid.dueDate ? e("closes", { date: fmt.range(bid.dueDate) }) : ""].filter(Boolean),
    ids = `data-bid="${esc(bid.id)}"`;
  app.innerHTML = dashboardShell(
    "customer",
    "sourcing",
    [
      `<div class="breadcrumb"><a href="#/customer/sourcing">${e("back")}</a></div>`,
      `<div class="dash-top"><div class="ds-compare-head"><span class="ds-compare-kicker">${kicker.map((x) => `<span>${x}</span>`).join("")}</span><h1 class="ds-ui">${e(
        "question",
      )}</h1><p><span class="ds-weights-line"></span> <button type="button" class="ds-text-link ds-weights-toggle" aria-expanded="false" aria-controls="dsWeights" data-action="src.toggleWeights">${e(
        "changeWeights",
      )}</button></p><span class="ds-compare-title">${esc(bid.title)}${bid.taskName ? ` · ${esc(bid.taskName)}` : ""}</span></div>${
        active
          ? `<div class="in-toolbar"><button class="btn outline" data-action="src.invite" ${ids}>${e("invite")}</button><button class="btn outline" data-action="src.close" ${ids}>${e("closeNoAward")}</button></div>`
          : ""
      }</div>`,
      `<div class="ds-offers-wrap" id="srCards"></div>`,
      bid.description ? `<section class="panel"><h3>${e("scope")}</h3><p>${srDom(bid.description)}</p></section>` : "",
      `<section class="panel ds-hidden" id="dsWeights"><div class="panel-title"><h3>${e("weights")}</h3><div class="cc-actions"><button class="btn small outline" id="srReset" data-action="src.reset">${e(
        "reset",
      )}</button><button class="btn small primary" id="srSaveWeights" data-action="src.saveWeights" ${ids}>${e("saveWeights")}</button></div></div><div class="sr-weights">${Object.keys(srCur.weights)
        .map(
          (k) =>
            `<label>${e("w." + k)}<input type="range" min="0" max="100" step="5" name="${k}" value="${srCur.weights[k]}" data-input="src.weight"><output>${srCur.weights[k]}</output></label>`,
        )
        .join("")}</div><p class="subtle">${e("weightsNote")}</p></section>`,
      `<section class="panel"><div class="panel-title"><h3>${e("ranked")}</h3><span class="ui-count">${(bid.offers || []).length}</span></div><div id="srResults"></div></section>`,
    ]
      .filter(Boolean)
      .map(srKeys)
      .join("\n    "),
  );
  document.querySelector(".dashboard-content")?.classList.add("ds-compare");
  srRender();
}
// Documents row of an offer card, read from the scorecard's risk flags
function srDocsRow(card) {
  if (!card) return "";
  const texts = (card.risks || []).map((r) => r.text),
    expired = texts.find((x) => /compliance document\(s\) expired|insurance expired/i.test(x)),
    soon = texts.map((x) => x.match(/insurance expires in (\d+) day/i)).find(Boolean);
  if (expired) return `<span class="ds-red">${srDom(expired)}</span>`;
  if (soon) return `<span class="ds-orange">${srk("ev.expires", { date: fmt.range(dsIso(new Date(Date.now() + Number(soon[1]) * 86400000))) })}</span>`;
  if (texts.some((x) => /No insurance evidence/i.test(x))) return ""; // unknown: leave the row out
  return `<span class="ds-green">${srk("ev.allValid")}</span>`;
}
function srOfferCard(bid, r, i, isFastest, active, jobs) {
  const o = r.o,
    e = (key, params) => srk("ev." + key, params),
    revised = (o.revisions || []).length > 0,
    tone = (color, text) => `<span class="status" data-ds-fixed data-ds-tone="${color}">${text}</span>`,
    chip =
      i === 0
        ? `<span class="ds-offer-chip ds-chip-best">${e("best", { score: r.score })}</span>`
        : revised
          ? tone("orange", e("revised", { score: r.score }))
          : isFastest
            ? tone("green", e("fastest", { score: r.score }))
            : tone("grey", r.score),
    under = revised
      ? `<span class="ds-muted">${e("was", { amount: fmt.money(o.revisions.at(-1).amount) })}</span>`
      : r.savings === null
        ? ""
        : r.savings >= 0
          ? `<span class="ds-green ds-strong">${e("under", { amount: fmt.money(r.savings) })}</span>`
          : `<span class="ds-red">${e("overBudget", { amount: fmt.money(-r.savings) })}</span>`,
    rating = r.card?.metrics?.rating || r.s.rating,
    docs = srDocsRow(r.card),
    ids = `data-bid="${esc(bid.id)}" data-offer="${esc(o.id)}"`,
    decided = !(active && o.status === "Submitted");
  return `<article class="ds-offer${i === 0 ? " ds-offer-best" : ""}">
    <div>${chip}</div>
    <div class="ds-offer-name"><b>${esc(o.supplierCompany)}</b>${r.s.location ? `<span>${srDom(r.s.location)}</span>` : ""}</div>
    <div class="ds-offer-price"><b>${esc(fmt.money(o.amount))}</b>${under}${o.hourlyRate ? bmRateNote(o.hourlyRate, bid.category || bid.taskName) : ""}</div>
    <dl class="ds-offer-rows">
      <div><dt class="ds-ui">${e("delivery")}</dt><dd>${o.deliveryDays ? e("days", { n: Number(o.deliveryDays) }) : "—"}</dd></div>
      <div><dt class="ds-ui">${e("rating")}</dt><dd>${rating ? `★ ${esc(rating)} · ` : ""}${jobs ? esc(t.plural("src.ev.jobs", jobs)) : e("newToYou")}</dd></div>
      ${docs ? `<div><dt class="ds-ui">${e("documents")}</dt><dd>${docs}</dd></div>` : ""}
      ${o.notes ? `<div><dt class="ds-ui">${e("includes")}</dt><dd class="ds-clamp">${srDom(o.notes)}</dd></div>` : ""}
    </dl>
    ${
      decided
        ? `<div class="ds-offer-decided"><span class="status">${ofOfferStatus(o.status)}</span></div>`
        : `<button type="button" class="btn ${i === 0 ? "primary" : "secondary"} ds-award" data-action="src.award" ${ids}>${e("award", { name: String(o.supplierCompany || "").split(/\s+/)[0] })}</button>
    <div class="ds-offer-links"><button type="button" data-action="src.changes" ${ids}>${e("changes")}</button><button type="button" data-action="src.ask" ${ids}>${e("ask")}</button><button type="button" class="ds-red" data-action="src.eliminate" ${ids}>${e(
      "eliminate",
    )}</button></div>`
    }
  </article>`;
}
function srRender() {
  if (!srCur || !document.getElementById("srResults")) return;
  const { bid, weights, scorecards, suppliers, jobs } = srCur,
    e = (key, params) => srk("ev." + key, params),
    total = Object.values(weights).reduce((a, b) => a + b, 0) || 1,
    pct = (k) => Math.round(((weights[k] || 0) / total) * 100),
    ranked = srScoreOffers(bid, scorecards, suppliers, weights),
    active = SR_ACTIVE.includes(bid.status),
    fastest = [...ranked].sort((a, b) => (Number(a.o.deliveryDays) || 1e9) - (Number(b.o.deliveryDays) || 1e9))[0],
    questions = bid.questions || [],
    ids = (r) => `data-bid="${esc(bid.id)}" data-offer="${esc(r.o.id)}"`;
  document.querySelector(".ds-weights-line").textContent = t("src.ev.weightsLine", { price: pct("price"), delivery: pct("delivery"), quality: pct("quality"), experience: pct("experience") });
  document.getElementById("srCards").innerHTML = ranked.length
    ? `<div class="ds-offers">${ranked.map((r, i) => srOfferCard(bid, r, i, r === fastest, active, jobs(r.o.supplierId))).join("")}</div><p class="ds-offers-foot ds-ui">${e("foot")}</p>`
    : "";
  const keys = Object.keys(weights),
    row = (r, i) =>
      `<tr class="${i === 0 ? "sr-best" : ""}"><td>${i + 1}</td><td><b>${esc(r.o.supplierCompany)}</b><small>${
        r.card ? e("riskSub", { badge: ccBadge(r.s), risk: ["Low", "Medium", "High"].includes(r.card.riskLevel) ? t("src.risk." + r.card.riskLevel) : r.card.riskLevel }) : esc(ccBadge(r.s)) + " "
      }</small></td><td><b>${esc(fmt.money(r.o.amount))}</b>${r.o.hourlyRate ? bmRateNote(r.o.hourlyRate, bid.category || bid.taskName) : ""}</td><td>${e("shortDays", { n: r.o.deliveryDays })}</td><td>${
        r.savings === null ? "—" : `<span class="${r.savings >= 0 ? "success-text" : "danger-text"}">${r.savings >= 0 ? "−" : "+"}${esc(fmt.money(Math.abs(r.savings)))}</span>`
      }</td>${keys.map((k) => `<td>${r.parts[k]}</td>`).join("")}<td>${srScoreBar(r.score)}${i === 0 ? `<small class="sr-rec">${e("recommended")}</small>` : ""}</td><td>${
        active && r.o.status === "Submitted"
          ? `<button class="btn small ${i === 0 ? "primary" : "outline"}" data-action="src.award" ${ids(r)}>${e("awardBtn")}</button><button class="btn small outline" data-action="src.changes" ${ids(r)}>${e("changes")}</button>`
          : `<span class="status ${r.o.status === "Accepted" ? "completed" : "rejected"}">${ofOfferStatus(r.o.status)}</span>`
      }</td></tr>`;
  document.getElementById("srResults").innerHTML = `<div class="sr-summary"><b>${e("auto")}</b><p>${srDom(srSummary(bid, ranked))}</p>${bmRangeNote(bid.category || bid.taskName)}</div>
      <div class="cc-table-wrap"><table class="cc-table sr-table"><thead><tr><th>#</th><th>${e("colSupplier")}</th><th>${e("colOffer")}</th><th>${e("colDelivery")}</th><th>${e("colBaseline")}</th>${keys
        .map((k) => `<th>${e("w." + k)}</th>`)
        .join("")}<th>${e("colScore")}</th><th></th></tr></thead><tbody>${ranked.map(row).join("") || `<tr><td colspan="${7 + keys.length}">${e("noOffers")}</td></tr>`}</tbody></table></div>
      ${
        questions.length && ranked.length
          ? `<h3 class="sr-h">${e("answers")}</h3><div class="cc-table-wrap"><table class="cc-table sr-table sr-answers"><thead><tr><th>${e("colQuestion")}</th>${ranked
              .map((r) => `<th>${esc(r.o.supplierCompany)}</th>`)
              .join("")}</tr></thead><tbody>${questions.map((q, qi) => `<tr><td><b>${esc(q)}</b></td>${ranked.map((r) => `<td>${esc(r.o.answers?.[qi] || "—")}</td>`).join("")}</tr>`).join("")}</tbody></table></div>`
          : ""
      }
      ${
        ranked.some((r) => r.o.notes)
          ? `<h3 class="sr-h">${e("notes")}</h3>${ranked
              .map((r) => (r.o.notes ? `<div class="sr-note"><b>${esc(r.o.supplierCompany)}</b><p>${esc(r.o.notes)}</p>${r.o.attachment ? `<a href="${esc(r.o.attachment)}">${e("offerDoc")}</a>` : ""}</div>` : ""))
              .join("")}`
          : ""
      }`;
}
actions.on("src.toggleWeights", (btn) => {
  const open = document.getElementById("dsWeights")?.classList.toggle("ds-hidden") === false;
  btn.setAttribute("aria-expanded", String(open));
});
actions.on("src.weight", (input) => {
  srCur.weights[input.name] = Number(input.value);
  input.nextElementSibling.value = input.value;
  srRender();
});
actions.on("src.reset", () => {
  Object.assign(srCur.weights, SR_WEIGHTS);
  document.querySelectorAll(".sr-weights input").forEach((i) => {
    i.value = srCur.weights[i.name];
    i.nextElementSibling.value = i.value;
  });
  srRender();
});
actions.on("src.saveWeights", async (el) => {
  try {
    await api(`/bids/${encodeURIComponent(el.dataset.bid)}`, { method: "PATCH", body: { action: "Set weights", weights: srCur.weights } });
    tToast(t("src.ev.weightsSaved"));
  } catch (x) {
    toast(x.message, "error");
  }
});
actions.on("src.invite", (el) => reviewInviteBid(el.dataset.bid));
actions.on("src.close", (el) => srCloseEvent(el.dataset.bid));
actions.on("src.award", (el) => srAward(el.dataset.bid, el.dataset.offer));
actions.on("src.changes", (el) => rvRequestOfferChanges(el.dataset.bid, el.dataset.offer));
actions.on("src.ask", (el) => reviewOfferTalk(el.dataset.bid, el.dataset.offer));
actions.on("src.eliminate", (el) => wfBidDecision(el.dataset.bid, el.dataset.offer, "Decline offer"));
async function srAward(bidId, offerId) {
  const bid = (await ofBids()).find((b) => b.id === bidId),
    offer = bid?.offers.find((o) => o.id === offerId);
  if (!offer || !(await uiConfirm(t("src.ev.awardConfirm", { title: bid.title, company: offer.supplierCompany, amount: fmt.money(offer.amount) })))) return;
  try {
    await api(`/bids/${encodeURIComponent(bidId)}`, { method: "PATCH", body: { action: "Accept offer", offerId } });
    tToast(t("src.ev.awarded"));
    navigate("/customer/contracts");
  } catch (x) {
    toast(x.message, "error");
  }
}
async function srCloseEvent(bidId) {
  if (!(await uiConfirm(t("src.ev.closeConfirm")))) return;
  try {
    await api(`/bids/${encodeURIComponent(bidId)}`, { method: "PATCH", body: { action: "Close bid" } });
    tToast(t("src.ev.closed"));
    await route();
  } catch (x) {
    toast(x.message, "error");
  }
}

/* ---------- Contracts ---------- */
async function srContracts(role, query) {
  const { contracts = [] } = await api("/contracts"),
    filter = query.get("state") || "",
    customer = role === "customer",
    c = (key, params) => srk("con." + key, params),
    list = contracts.filter((x) => !filter || x.state === filter),
    tone = { Active: "completed", Expiring: "submitted", Expired: "rejected", Terminated: "rejected", Draft: "" },
    counts = SR_CONTRACT_STATES.map((s) => [s, contracts.filter((x) => x.state === s).length]).filter(([, n]) => n);
  const row = (x) =>
    `<tr><td><b>${esc(x.title)}</b><small>${[x.category ? statusHtml(x.category) : "", x.bidId ? c("fromEvent") : "", x.autoRenew ? c("autoRenews") : ""].filter(Boolean).join(" · ")}</small></td><td>${esc(
      customer ? x.supplierCompany : x.projectName || "—",
    )}</td><td><b>${esc(fmt.money(x.value))}</b></td><td>${x.startDate ? esc(fmt.date(x.startDate)) : "—"} → ${x.endDate ? esc(fmt.date(x.endDate)) : `<span class="subtle">${c("openEnd")}</span>`}${
      x.daysToEnd !== null && x.daysToEnd >= 0 && x.state !== "Draft" ? `<small>${c("daysLeft", { n: x.daysToEnd })}</small>` : ""
    }</td><td>${x.noticeBy ? esc(fmt.date(x.noticeBy)) : "—"}</td><td><span class="status ${tone[x.state] || ""}">${srState(x.state)}</span></td>${
      customer ? `<td><button class="btn small outline" data-action="src.contract" data-id="${esc(x.id)}">${c("edit")}</button></td>` : ""
    }</tr>`;
  app.innerHTML = dashboardShell(
    role,
    "contracts",
    [
      `<div class="dash-top"><div><div class="eyebrow">${c("eyebrow")}</div><h1>${c("title")}</h1><p>${c(customer ? "introCustomer" : "introSupplier")}</p></div>${
        customer ? `<button class="btn primary" data-action="src.contract">${c("new")}</button>` : ""
      }</div>`,
      `<div class="sr-chips"><a class="${filter ? "" : "on"}" href="#/${role}/contracts">${c("all")} <b>${contracts.length}</b></a>${counts
        .map(([s, n]) => `<a class="${filter === s ? "on" : ""}" href="#/${role}/contracts?state=${s}">${srState(s)} <b>${n}</b></a>`)
        .join("")}</div>`,
      `<section class="panel"><div class="cc-table-wrap"><table class="cc-table sr-table"><thead><tr><th>${c("colContract")}</th><th>${c(customer ? "colSupplier" : "colProject")}</th><th>${c("colValue")}</th><th>${c(
        "colTerm",
      )}</th><th>${c("colNotice")}</th><th>${c("colStatus")}</th>${customer ? "<th></th>" : ""}</tr></thead><tbody>${list.map(row).join("") || `<tr><td colspan="7">${c(customer ? "emptyCustomer" : "emptySupplier")}</td></tr>`}</tbody></table></div></section>`,
    ]
      .map(srKeys)
      .join("\n    "),
  );
}
async function srContractForm(id) {
  const [{ contracts = [] }, { suppliers = [] }, { projects = [] }] = await Promise.all([api("/contracts"), api("/suppliers"), api("/projects")]),
    x = contracts.find((c) => c.id === id) || { status: "Draft", noticeDays: 30, startDate: srToday() },
    c = (key) => srk("con." + key),
    lock = id ? " disabled" : "",
    opt = (value, label, on) => `<option value="${esc(value)}"${on ? " selected" : ""}>${label}</option>`;
  modal(
    t(id ? "src.con.editTitle" : "src.con.newTitle"),
    `<form id="srContractForm" class="modal-form" data-i18n="keys" data-action="src.saveContract" data-id="${esc(id || "")}"><label>${c("name")}<input name="title" value="${esc(x.title || "")}" required></label><div class="two"><label>${c(
      "supplier",
    )}<select name="supplierId"${lock} required>${opt("", c("choose"))}${suppliers.map((s) => opt(s.id, esc(s.company), s.id === x.supplierId)).join("")}</select></label><label>${c("project")}<select name="projectId"${lock}>${opt(
      "",
      "—",
    )}${projects.map((p) => opt(p.id, esc(p.name), p.id === x.projectId)).join("")}</select></label></div><div class="two"><label>${c("value")}<input name="value" type="number" min="0" step="0.01" value="${esc(x.value ?? "")}" required></label><label>${c(
      "category",
    )}<input name="category" value="${esc(x.category || "")}"></label></div><div class="two"><label>${c("start")}<input name="startDate" type="date" value="${esc(x.startDate || "")}"></label><label>${c(
      "end",
    )}<input name="endDate" type="date" value="${esc(x.endDate || "")}"></label></div><div class="two"><label>${c("notice")}<input name="noticeDays" type="number" min="0" max="365" value="${esc(x.noticeDays ?? 30)}"></label><label>${c(
      "status",
    )}<select name="status">${["Draft", "Active", "Terminated"].map((s) => opt(s, srk("con.states." + s), s === x.status)).join("")}</select></label></div><label class="cc-check-label"><input type="checkbox" name="autoRenew"${
      x.autoRenew ? " checked" : ""
    }> ${c("autoRenew")}</label><label>${c("terms")}<textarea name="terms" rows="3">${esc(x.terms || "")}</textarea></label><label>${c("file")}<input name="file" type="file" accept=".pdf"></label>${
      x.documentUrl ? `<a href="${esc(x.documentUrl)}">${c("current")}</a>` : ""
    }<div id="srContractError" class="form-error" data-i18n="dom"></div><button class="btn primary">${c(id ? "save" : "create")}</button></form>`,
  );
}
actions.on("src.contract", (el) => srContractForm(el.dataset.id || ""));
actions.on("src.saveContract", async (form) => {
  const id = form.dataset.id,
    f = new FormData(form),
    b = Object.fromEntries(f),
    file = form.elements.file.files[0];
  b.autoRenew = f.has("autoRenew");
  delete b.file;
  try {
    if (file) b.documentUrl = (await uploadFile(file)).url;
    await api(id ? `/contracts/${encodeURIComponent(id)}` : "/contracts", { method: id ? "PATCH" : "POST", body: b });
    closeModal();
    tToast(t(id ? "src.con.saved" : "src.con.created"));
    await route();
  } catch (x) {
    document.getElementById("srContractError").textContent = x.message;
  }
});

routes.add("/customer/sourcing", () => srDashboard());
routes.add("/customer/sourcing/:id", (params) => srEvent(params.id));
routes.add("/customer/contracts", (params, query) => srContracts("customer", query));
routes.add("/supplier/contracts", (params, query) => srContracts("supplier", query));
