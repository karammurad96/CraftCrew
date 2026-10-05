/*
 * Instant estimates (T231, Wave 15b). For each work package of a request: the available suppliers of its category,
 * priced from their own price lists (service catalogue rate × hours). The estimate offers up to three options
 * (best, cheapest, fastest), each either one supplier for everything or split across several suppliers, when no
 * single supplier covers all packages or when the split clearly pays off. The prices are estimates: the supplier
 * confirms after the customer's choice (T232).
 */
const geo = require("./geo");

const HOURS_PER_DAY = 8,
  START_DAYS = 2, // days before work starts
  MAX_OPEN_TASKS = 3, // more open tasks in the same weeks: not available
  SPLIT_CHEAPER = 0.1, // a split must be at least 10 % cheaper ...
  SPLIT_FASTER = 0.2; // ... or 20 % faster than the best single supplier
const key = (s) =>
  String(s || "")
    .trim()
    .toLowerCase();
const PAUSED = new Set(["paused", "inactive", "unavailable", "pausiert"]);

module.exports = function createEstimate({ getDb, scorecard }) {
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
    if (day) return { rate: Math.round((Number(day.rate) / HOURS_PER_DAY) * 100) / 100, source: "catalog" };
    if (Number(s.hourlyRate) > 0) return { rate: Number(s.hourlyRate), source: "profile" };
    return null;
  }
  const offers = (s, category) =>
    (s.services || []).some((x) => key(x) === key(category)) ||
    (s.serviceCatalog || []).some((c) => key(c.category) === key(category) || key(c.name) === key(category));
  // Quality 0–100: the scorecard, else the rating, else neutral; plus a little for the vetting badge
  function quality(s) {
    const card = scorecard(s.id),
      base = card?.score ?? (s.rating ? (s.rating / 5) * 100 : 60);
    return Math.min(100, Math.round(base + ({ Gold: 6, Silver: 4, Bronze: 2 }[s.badge] || 0)));
  }
  const daysFor = (hours) => Math.ceil(hours / HOURS_PER_DAY) + START_DAYS;

  // The suppliers that can take a package, best first
  function candidates(request, pkg) {
    const db = getDb(),
      from = request.startDate || new Date().toISOString().slice(0, 10),
      to = request.dueDate || "9999-12-31",
      site = geo.geocode(request.sitePostcode || "") || geo.geocode(request.siteCity || ""),
      tasks = db.projects.flatMap((p) => p.phases.flatMap((ph) => ph.tasks || []));
    return db.suppliers
      .filter((s) => s.live && !["Busy", "Unavailable"].includes(s.availability) && offers(s, pkg.category))
      .filter(
        (s) =>
          tasks.filter(
            (t) =>
              t.assignedSupplierId === s.id &&
              t.status !== "Completed" &&
              (t.startDate || "0000-00-00") <= to &&
              (t.dueDate || "9999-12-31") >= from,
          ).length < MAX_OPEN_TASKS,
      )
      .map((s) => {
        const r = rateFor(s, pkg.category);
        if (!r) return null;
        const place = geo.geocode(s.location || ""),
          km = site && place ? Math.round(geo.distanceKm(site, place)) : null;
        // Ranking: quality first, a little less for long journeys
        const rank = quality(s) - (km === null ? 5 : Math.min(15, km / 50));
        return {
          supplierId: s.id,
          rate: r.rate,
          rateSource: r.source,
          amount: Math.round(r.rate * pkg.hours),
          quality: quality(s),
          km,
          rank,
        };
      })
      .filter(Boolean)
      .sort((a, b) => b.rank - a.rank || a.amount - b.amount);
  }

  // An option from a choice of supplier per package: parts grouped by supplier, running in parallel
  function option(request, choice) {
    const parts = new Map();
    for (const pkg of request.packages) {
      const c = choice.get(pkg.id);
      if (!parts.has(c.supplierId))
        parts.set(c.supplierId, {
          supplierId: c.supplierId,
          packageIds: [],
          hours: 0,
          supplierAmount: 0,
          quality: c.quality,
        });
      const part = parts.get(c.supplierId);
      part.packageIds.push(pkg.id);
      part.hours += pkg.hours;
      part.supplierAmount += c.amount;
    }
    const list = [...parts.values()].map((p) => ({ ...p, days: daysFor(p.hours) })),
      hours = list.reduce((n, p) => n + p.hours, 0);
    return {
      parts: list,
      supplierAmount: list.reduce((n, p) => n + p.supplierAmount, 0),
      days: Math.max(...list.map((p) => p.days)),
      quality: Math.round(list.reduce((n, p) => n + p.quality * p.hours, 0) / hours),
      split: list.length > 1,
      signature: list
        .map((p) => p.supplierId + ":" + p.packageIds.join("+"))
        .sort()
        .join("|"),
    };
  }

  // The estimate: up to three options, or the packages nobody can price (the operator takes over)
  function build(request) {
    const per = new Map(request.packages.map((pkg) => [pkg.id, candidates(request, pkg)])),
      missing = request.packages.filter((pkg) => !per.get(pkg.id).length).map((pkg) => pkg.id);
    if (missing.length) return { options: [], missing };
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
      best = splitBest.split && splitBest.quality > bestSingle.quality + 5 ? splitBest : bestSingle;
      cheapest =
        splitCheapest.split &&
        splitCheapest.supplierAmount <= cheapSingle.supplierAmount * (1 - SPLIT_CHEAPER)
          ? splitCheapest
          : cheapSingle;
      const fastSplit = by([splitBest, splitCheapest], (a, b) => a.days - b.days);
      fastest =
        fastSplit.split && fastSplit.days <= fastSingle.days * (1 - SPLIT_FASTER) ? fastSplit : fastSingle;
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
    return { options, missing: [] };
  }

  return { build, candidates, rateFor, daysFor };
};
