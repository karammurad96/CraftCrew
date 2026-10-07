/* Area: the operator cockpit (T242, Wave 16). The admin page "Business": speed, funnel, estimates, liquidity,
   money, retention and leakage signals for a period, by week or month, filtered by category and region; a CSV
   export of every figure; and the deadlines of the request queue as settings. */
const bzk = (key, params) => esc(t("biz." + key, params));
const bzNum = (v, digits = 0) => (v === null || v === undefined ? "—" : esc(fmt.number(v, digits)));
const bzPct = (v) => (v === null || v === undefined ? "—" : esc(String(v)) + " %");
const bzHours = (v) => (v === null || v === undefined ? "—" : bzk("hours", { n: v }));
const bzKpi = (label, value, sub) =>
  `<div class="cc-card bz-kpi"><span class="cc-label">${label}</span><div class="cc-kpi">${value}</div>${sub ? `<small>${sub}</small>` : ""}</div>`;
const bzSection = (title, cards) => `<section class="bz-section"><h2>${title}</h2><div class="cc-grid4">${cards}</div></section>`;

function bzQuery(f) {
  const q = new URLSearchParams();
  for (const k of ["from", "to", "period", "category", "region"]) if (f[k]) q.set(k, f[k]);
  return q.toString();
}
async function bzPage(params, query) {
  const filter = {
    from: query?.get("from") || "",
    to: query?.get("to") || "",
    period: query?.get("period") || "month",
    category: query?.get("category") || "",
    region: query?.get("region") || "",
  };
  const { figures: f, limits, categories = [] } = await api("/admin/business?" + bzQuery(filter));
  const ff = f.filter,
    money = (v) => (v === null || v === undefined ? "—" : esc(fmt.money(v, 2)));
  const form = `<form class="panel bz-filter" data-action="biz.filter"><label>${bzk("from")}<input type="date" name="from" value="${esc(ff.from)}"></label><label>${bzk("to")}<input type="date" name="to" value="${esc(ff.to)}"></label><label>${bzk("period")}<select name="period">${["month", "week"]
    .map((p) => `<option value="${p}"${p === ff.period ? " selected" : ""}>${bzk("per." + p)}</option>`)
    .join("")}</select></label><label>${bzk("category")}<select name="category"><option value="">${bzk("all")}</option>${categories
    .map((c) => `<option value="${esc(c)}"${c === ff.category ? " selected" : ""}>${esc(c)}</option>`)
    .join("")}</select></label><label>${bzk("region")}<input name="region" inputmode="numeric" maxlength="5" pattern="[0-9]*" value="${esc(ff.region)}" placeholder="93"></label><div class="cc-actions"><button class="btn primary">${bzk("apply")}</button><a class="btn outline" href="/api/admin/business/csv?${esc(bzQuery(ff))}" download>${bzk("csv")}</a></div></form>`;
  const speed = bzSection(
    bzk("speed"),
    ["instant", "manual"]
      .map((k) => bzKpi(bzk("sp." + k), bzHours(f.speed[k].medianHours), bzk("sp.sub", { n: f.speed[k].n, mean: f.speed[k].meanHours ?? "—" })))
      .join(""),
  );
  const funnel = bzSection(
    bzk("funnel"),
    f.funnel.map((s) => bzKpi(bzk("step." + s.step), bzNum(s.n), s.rate === null ? "" : bzk("rate", { n: s.rate }))).join(""),
  );
  const e = f.estimates,
    estimates = bzSection(
      bzk("estimates"),
      bzKpi(bzk("est.unchanged"), bzPct(e.unchangedShare), bzk("est.parts", { n: e.confirmedParts })) +
        bzKpi(bzk("est.gap"), bzPct(e.meanGapPercent)) +
        bzKpi(bzk("est.first"), bzPct(e.firstSupplierShare)),
    );
  const l = f.liquidity,
    liquidity =
      bzSection(
        bzk("liquidity"),
        bzKpi(bzk("liq.mean"), bzNum(l.meanCandidates, 1), bzk("liq.packages", { n: l.packages })) +
          bzKpi(bzk("liq.thin"), `<span class="${l.thin ? "bz-warn" : ""}">${bzNum(l.thin)}</span>`, bzk("liq.thinSub")),
      ) +
      (l.thinList.length
        ? `<div class="panel bz-thin"><h3>${bzk("liq.thinTitle")}</h3><ul>${l.thinList
            .map((x) => `<li><a href="#/admin/requests/${esc(x.requestId)}"><bdi>${esc(x.title)}</bdi></a> · <bdi>${esc(x.package)}</bdi> · <span class="bz-warn">${bzk("liq.candidates", { n: x.candidates })}</span></li>`)
            .join("")}</ul></div>`
        : "");
  const m = f.money,
    moneyHtml = bzSection(
      bzk("money"),
      bzKpi(bzk("mo.volume"), money(m.volume), bzk("mo.orders", { n: m.orders })) +
        bzKpi(bzk("mo.invoiced"), money(m.feeInvoiced)) +
        bzKpi(bzk("mo.paid"), money(m.feePaid)) +
        bzKpi(bzk("mo.take"), bzPct(m.takeRate)),
    );
  const rt = f.retention,
    lk = f.leakage,
    more = bzSection(
      bzk("retLeak"),
      bzKpi(bzk("ret.rate"), bzPct(rt.rate), bzk("ret.sub", { n: rt.returning, of: rt.customers })) +
        bzKpi(bzk("leak.hints"), bzNum(lk.hints)) +
        bzKpi(bzk("leak.quiet"), bzNum(lk.quietPairs), bzk("leak.quietSub")),
    );
  const series = `<section class="panel"><h3>${bzk(ff.period === "week" ? "series.week" : "series.month")}</h3><div class="cc-table-wrap"><table class="cc-table"><thead><tr><th>${bzk("series.bucket")}</th>${["requests", "optionsReady", "chosen", "contracted"]
    .map((s) => `<th class="num">${bzk("step." + s)}</th>`)
    .join("")}<th class="num">${bzk("mo.volume")}</th></tr></thead><tbody>${
    f.series
      .map((b) => `<tr><td>${esc(b.bucket)}</td><td class="num">${bzNum(b.requests)}</td><td class="num">${bzNum(b.optionsReady)}</td><td class="num">${bzNum(b.chosen)}</td><td class="num">${bzNum(b.contracted)}</td><td class="num">${money(b.volume)}</td></tr>`)
      .join("") || `<tr><td colspan="6">${bzk("series.empty")}</td></tr>`
  }</tbody></table></div></section>`;
  const deadlines = `<form class="panel modal-form" data-action="biz.deadlines"><h3>${bzk("dl.title")}</h3><p class="subtle">${bzk("dl.lead")}</p><div class="cc-platform-grid"><label>${bzk("dl.newHours")}<input type="number" name="newHours" min="1" max="72" step="1" value="${esc(limits.newHours)}"></label><label>${bzk("dl.partDays")}<input type="number" name="partDays" min="1" max="10" step="1" value="${esc(limits.partDays)}"></label><label>${bzk("dl.priceDays")}<input type="number" name="priceDays" min="1" max="10" step="1" value="${esc(limits.priceDays)}"></label></div><div class="cc-actions"><button class="btn outline">${bzk("dl.save")}</button></div></form>`;
  app.innerHTML = dashboardShell(
    "admin",
    "business",
    `<div class="dash-top"><div><h1>${bzk("title")}</h1><p>${bzk("lead")}</p></div></div>${form}${speed}${funnel}${estimates}${liquidity}${moneyHtml}${more}${series}${deadlines}`,
  );
}
actions.on("biz.filter", (form) => {
  const data = Object.fromEntries(new FormData(form).entries());
  navigate("/admin/business?" + bzQuery(data));
});
actions.on("biz.deadlines", async (form) => {
  const d = Object.fromEntries(new FormData(form).entries());
  try {
    await api("/admin/business/deadlines", {
      method: "PUT",
      body: { newHours: Number(d.newHours), partDays: Number(d.partDays), priceDays: Number(d.priceDays) },
    });
    tToast(t("biz.dl.saved"));
  } catch (x) {
    toast(x.message, "error");
  }
});
routes.add("/admin/business", bzPage);
