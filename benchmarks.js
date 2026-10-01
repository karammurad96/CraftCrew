/*
 * Price benchmarks per service (T69): median and 25th–75th percentile of hourly rates from accepted offers
 * that state an hourly rate, invoice lines billed in hours and supplier catalogue rates. A benchmark shows
 * only with at least 5 data points, and never lists individual prices.
 */
const MIN_POINTS = 5;
const HOUR_UNITS = new Set(["hour", "hours", "h", "hr", "hrs", "std", "stunde", "stunden"]);
const key = (s) =>
  String(s || "")
    .trim()
    .toLowerCase()
    .replace(/\s+/g, " ");

// Percentile of sorted numbers with linear interpolation between ranks (like PERCENTILE.INC in spreadsheets).
function percentile(sorted, p) {
  if (!sorted.length) return null;
  const rank = (sorted.length - 1) * p,
    lo = Math.floor(rank),
    hi = Math.ceil(rank);
  return sorted[lo] + (sorted[hi] - sorted[lo]) * (rank - lo);
}
function stats(values) {
  const sorted = values.filter((v) => Number.isFinite(v) && v > 0).sort((a, b) => a - b);
  if (sorted.length < MIN_POINTS) return { count: sorted.length, available: false };
  const round = (n) => Math.round(n);
  return {
    count: sorted.length,
    available: true,
    median: round(percentile(sorted, 0.5)),
    p25: round(percentile(sorted, 0.25)),
    p75: round(percentile(sorted, 0.75)),
  };
}

module.exports = function createBenchmarks(ctx) {
  const { getDb, send } = ctx;

  // service key → {label, values}
  function collect() {
    const db = getDb(),
      map = new Map(),
      add = (service, rate) => {
        const k = key(service),
          n = Number(rate);
        if (!k || !Number.isFinite(n) || n <= 0 || n > 10000) return;
        if (!map.has(k)) map.set(k, { label: String(service).trim(), values: [] });
        map.get(k).values.push(n);
      };
    for (const b of db.bids || [])
      for (const o of b.offers || [])
        if (o.status === "Accepted" && o.hourlyRate) add(b.category || b.taskName, o.hourlyRate);
    for (const i of db.invoices || [])
      if (!["Rejected", "Draft"].includes(i.status))
        for (const li of i.lineItems || []) if (HOUR_UNITS.has(key(li.unit))) add(li.service, li.unitPrice);
    for (const s of db.suppliers || []) {
      if (!s.live) continue;
      for (const c of s.serviceCatalog || [])
        if (HOUR_UNITS.has(key(c.unit))) {
          add(c.name, c.rate);
          if (c.category && key(c.category) !== key(c.name)) add(c.category, c.rate);
        }
      // The profile's starting hourly rate counts once for each service the supplier lists.
      if (Number(s.hourlyRate) > 0) for (const svc of s.services || []) add(svc, s.hourlyRate);
    }
    return map;
  }

  function benchmark(service) {
    const entry = collect().get(key(service));
    return { service: entry?.label || String(service || ""), ...stats(entry?.values || []) };
  }

  async function handle(req, res, url, parts, user) {
    if (parts[1] !== "benchmarks" || parts[2] || req.method !== "GET") return false;
    const service = url.searchParams.get("service");
    if (service) return (send(res, 200, { benchmark: benchmark(service.slice(0, 120)) }), true);
    const all = [...collect().values()]
      .map((e) => ({ service: e.label, ...stats(e.values) }))
      .filter((b) => b.available)
      .sort((a, b) => a.service.localeCompare(b.service));
    return (send(res, 200, { benchmarks: all }), true);
  }

  return { handle, benchmark };
};
module.exports.percentile = percentile;
module.exports.stats = stats;
module.exports.MIN_POINTS = MIN_POINTS;
