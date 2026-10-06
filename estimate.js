/*
 * Instant estimates (T231, Wave 15b). For each work package of a request: the available suppliers of its category,
 * priced from their own price lists (service catalogue rate × hours). The estimate offers up to three options
 * (best, cheapest, fastest), each either one supplier for everything or split across several suppliers, when no
 * single supplier covers all packages or when the split clearly pays off. The prices are estimates: the supplier
 * confirms after the customer's choice (T232).
 */
const geo = require("./geo");

// The ranking and pricing constants. T253: the page "How suppliers are ranked and priced" reads them from here.
const RANKING = {
  hoursPerDay: 8,
  startDays: 2, // days before work starts
  maxOpenTasks: 3, // more open tasks in the same weeks: not available
  splitCheaper: 0.1, // a split must be at least 10 % cheaper ...
  splitFaster: 0.2, // ... or 20 % faster than the best single supplier,
  splitQualityLead: 5, // ... or, for "best", more than 5 quality points better
  neutralQuality: 60, // quality without a scorecard or a rating
  badgeBonus: { Gold: 6, Silver: 4, Bronze: 2 }, // quality points for the vetting badge
  kmPerPoint: 50, // one rank point less per 50 km to the site ...
  maxDistancePenalty: 15, // ... at most 15
  unknownDistancePenalty: 5, // distance not known
  bandAbove: 2, // T241: a rate above 2 × the 75th percentile is skipped ...
  bandBelow: 0.5, // ... and one under half the 25th percentile
};
const key = (s) =>
  String(s || "")
    .trim()
    .toLowerCase();
const PAUSED = new Set(["paused", "inactive", "unavailable", "pausiert"]);

const round = (n) => Math.round(Number(n || 0) * 100) / 100;
const RANK = { low: 0, medium: 1, high: 2 };

module.exports = function createEstimate({ getDb, scorecard, benchmark = () => null }) {
  // A supplier's hourly rate for a category: catalogue entry for the category or a service of that name (hour, or
  // day ÷ 8), else the profile's hourly rate. Null: no price known.
  function rateFor(s, category) {
    const k = key(category),
      items = (s.serviceCatalog || []).filter(
        (c) =>
          !PAUSED.has(key(c.status)) && (key(c.category) === k || key(c.name) === k) && Number(c.rate) > 0,
      );
    const hour = items.find((c) => c.unit === "hour"),
      day = items.find((c) => c.unit === "day");
    if (hour) return { rate: Number(hour.rate), source: "catalog" };
    if (day) return { rate: Math.round((Number(day.rate) / RANKING.hoursPerDay) * 100) / 100, source: "catalog" };
    if (Number(s.hourlyRate) > 0) return { rate: Number(s.hourlyRate), source: "profile" };
    return null;
  }
  const offers = (s, category) =>
    (s.services || []).some((x) => key(x) === key(category)) ||
    (s.serviceCatalog || []).some((c) => key(c.category) === key(category) || key(c.name) === key(category));
  // Quality 0–100: the scorecard, else the rating, else neutral; plus a little for the vetting badge
  function quality(s) {
    const card = scorecard(s.id),
      base = card?.score ?? (s.rating ? (s.rating / 5) * 100 : RANKING.neutralQuality);
    return Math.min(100, Math.round(base + (RANKING.badgeBonus[s.badge] || 0)));
  }
  const daysFor = (hours) => Math.ceil(hours / RANKING.hoursPerDay) + RANKING.startDays;

  // T241: the price band of a category from the T69 benchmarks (25th–75th percentile), when there is one
  function band(category) {
    const b = benchmark(category);
    return b?.available ? b : null;
  }
  // The suppliers that can take a package, best first. A rate far outside the category's price band is skipped
  // (and listed in `skipped` for the operator); one outside the band is marked unusual.
  function candidates(request, pkg, skipped = null) {
    const db = getDb(),
      from = request.startDate || new Date().toISOString().slice(0, 10),
      to = request.dueDate || "9999-12-31",
      site = geo.geocode(request.sitePostcode || "") || geo.geocode(request.siteCity || ""),
      tasks = db.projects.flatMap((p) => p.phases.flatMap((ph) => ph.tasks || []));
    return db.suppliers
      // T262: a supplier who declined a package booking is not asked again for it
      .filter((s) => !(request.excludeSupplierIds || []).includes(s.id))
      .filter((s) => s.live && !["Busy", "Unavailable"].includes(s.availability) && offers(s, pkg.category))
      .filter(
        (s) =>
          tasks.filter(
            (t) =>
              t.assignedSupplierId === s.id &&
              t.status !== "Completed" &&
              (t.startDate || "0000-00-00") <= to &&
              (t.dueDate || "9999-12-31") >= from,
          ).length < RANKING.maxOpenTasks,
      )
      .map((s) => {
        const r = rateFor(s, pkg.category);
        if (!r) return null;
        const place = geo.geocode(s.location || ""),
          km = site && place ? Math.round(geo.distanceKm(site, place)) : null,
          pr = s.pricing || {};
        // T241: a supplier does not travel beyond its radius
        if (Number(pr.travel?.radiusKm) > 0 && km !== null && km > Number(pr.travel.radiusKm)) return null;
        const b = band(pkg.category);
        let unusual = false;
        if (b) {
          if (r.rate > RANKING.bandAbove * b.p75 || r.rate < RANKING.bandBelow * b.p25) {
            skipped?.push({ supplierId: s.id, package: pkg.name, category: pkg.category, rate: r.rate, p25: b.p25, p75: b.p75 });
            return null;
          }
          unusual = r.rate < b.p25 || r.rate > b.p75;
        }
        // Labour, surcharges for night, weekend or shift work, and the materials share of the category
        const labour = r.rate * pkg.hours,
          pct = (request.shifts || []).reduce((n, k) => n + (Number(pr.surcharges?.[k]) || 0), 0),
          surcharge = (labour * pct) / 100,
          materials = ((labour + surcharge) * (Number(pr.materials?.[pkg.category]) || 0)) / 100;
        // Ranking: quality first, a little less for long journeys
        const rank = quality(s) - (km === null ? RANKING.unknownDistancePenalty : Math.min(RANKING.maxDistancePenalty, km / RANKING.kmPerPoint));
        return {
          supplierId: s.id,
          rate: r.rate,
          rateSource: r.source,
          amount: Math.round(labour + surcharge + materials),
          lines: { labour: round(labour), surcharge: round(surcharge), materials: round(materials) },
          unusual,
          quality: quality(s),
          km,
          rank,
        };
      })
      .filter(Boolean)
      .sort((a, b) => b.rank - a.rank || a.amount - b.amount);
  }

  // T241: one supplier's part: its packages' candidates, plus travel (trips × flat fee and km both ways) and the
  // supplier's minimum order. Returns the amount, the lines and a confidence level.
  function partOf(request, supplierId, items) {
    const s = getDb().suppliers.find((x) => x.id === supplierId) || {},
      pr = s.pricing || {},
      hours = items.reduce((n, x) => n + x.pkg.hours, 0),
      days = daysFor(hours),
      lines = { labour: 0, surcharge: 0, materials: 0, travel: 0, minimum: 0 };
    for (const { c } of items) for (const k of ["labour", "surcharge", "materials"]) lines[k] += c.lines?.[k] ?? (k === "labour" ? c.amount : 0);
    const trips = Number(request.trips) > 0 ? Number(request.trips) : Math.max(1, Math.ceil(days / 5)),
      km = items.find((x) => x.c.km !== null && x.c.km !== undefined)?.c.km ?? null,
      flat = Number(pr.travel?.flat) || 0,
      perKm = Number(pr.travel?.perKm) || 0;
    lines.travel = trips * (flat + (km !== null ? perKm * km * 2 : 0));
    const subtotal = lines.labour + lines.surcharge + lines.materials + lines.travel;
    lines.minimum = Math.max(0, (Number(pr.minimumOrder) || 0) - subtotal);
    for (const k of Object.keys(lines)) lines[k] = round(lines[k]);
    const rough = items.some((x) => x.pkg.rough),
      profileRate = items.some((x) => x.c.rateSource === "profile"),
      unusual = items.some((x) => x.c.unusual);
    return {
      supplierId,
      packageIds: items.map((x) => x.pkg.id),
      hours,
      days,
      supplierAmount: Math.round(subtotal + lines.minimum),
      lines,
      unusual,
      confidence: rough || profileRate ? "low" : unusual ? "medium" : "high",
      quality: items[0]?.c.quality ?? RANKING.neutralQuality,
    };
  }
  // An option from a choice of supplier per package: parts grouped by supplier, running in parallel
  function option(request, choice) {
    const groups = new Map();
    for (const pkg of request.packages) {
      const c = choice.get(pkg.id);
      if (!groups.has(c.supplierId)) groups.set(c.supplierId, []);
      groups.get(c.supplierId).push({ pkg, c });
    }
    const list = [...groups.entries()].map(([sid, items]) => partOf(request, sid, items)),
      hours = list.reduce((n, p) => n + p.hours, 0);
    return {
      parts: list,
      supplierAmount: list.reduce((n, p) => n + p.supplierAmount, 0),
      days: Math.max(...list.map((p) => p.days)),
      quality: Math.round(list.reduce((n, p) => n + p.quality * p.hours, 0) / hours),
      // The option is as sure as its least sure part
      confidence: list.map((p) => p.confidence).sort((a, b) => RANK[a] - RANK[b])[0],
      split: list.length > 1,
      signature: list
        .map((p) => p.supplierId + ":" + p.packageIds.join("+"))
        .sort()
        .join("|"),
    };
  }

  // The estimate: up to three options, or the packages nobody can price (the operator takes over)
  function build(request) {
    const skipped = [],
      per = new Map(request.packages.map((pkg) => [pkg.id, candidates(request, pkg, skipped)])),
      missing = request.packages.filter((pkg) => !per.get(pkg.id).length).map((pkg) => pkg.id);
    if (missing.length) return { options: [], missing, skipped };
    // One supplier for everything: those who can take every package
    const everywhere = per
      .get(request.packages[0].id)
      .map((c) => c.supplierId)
      .filter((sid) => request.packages.every((pkg) => per.get(pkg.id).some((c) => c.supplierId === sid)));
    const singles = everywhere.map((sid) =>
      option(
        request,
        new Map(request.packages.map((pkg) => [pkg.id, per.get(pkg.id).find((c) => c.supplierId === sid)])),
      ),
    );
    const pick = (f) => option(request, new Map(request.packages.map((pkg) => [pkg.id, f(per.get(pkg.id))]))),
      splitBest = pick((list) => list[0]),
      splitCheapest = pick((list) => [...list].sort((a, b) => a.amount - b.amount)[0]);
    const by = (list, f) => [...list].sort(f)[0];
    let best, cheapest, fastest;
    if (!singles.length) {
      // Nobody covers everything: the split is needed
      [best, cheapest, fastest] = [
        splitBest,
        splitCheapest,
        by([splitBest, splitCheapest], (a, b) => a.days - b.days),
      ];
    } else {
      const bestSingle = by(singles, (a, b) => b.quality - a.quality || a.supplierAmount - b.supplierAmount),
        cheapSingle = by(singles, (a, b) => a.supplierAmount - b.supplierAmount),
        fastSingle = by(singles, (a, b) => a.days - b.days || a.supplierAmount - b.supplierAmount);
      best = splitBest.split && splitBest.quality > bestSingle.quality + RANKING.splitQualityLead ? splitBest : bestSingle;
      cheapest =
        splitCheapest.split &&
        splitCheapest.supplierAmount <= cheapSingle.supplierAmount * (1 - RANKING.splitCheaper)
          ? splitCheapest
          : cheapSingle;
      const fastSplit = by([splitBest, splitCheapest], (a, b) => a.days - b.days);
      fastest =
        fastSplit.split && fastSplit.days <= fastSingle.days * (1 - RANKING.splitFaster) ? fastSplit : fastSingle;
    }
    const options = [],
      seen = new Set();
    for (const [label, o] of [
      ["best", best],
      ["cheapest", cheapest],
      ["fastest", fastest],
    ])
      if (!seen.has(o.signature)) {
        seen.add(o.signature);
        options.push({ label, ...o });
      }
    return { options, missing: [], skipped };
  }

  return { build, candidates, partOf, rateFor, daysFor };
};
module.exports.RANKING = RANKING;
