/*
 * Estimate calibration (T243, Wave 16). The instant estimate learns from what suppliers confirm.
 *
 * Supplier factor: per supplier and category, the median of confirmed price ÷ the price-list amount over the last
 * 12 months, from at least 3 confirmed parts, limited to 0.8–1.3. A part stores its price-list amount before any
 * correction (`baseAmount`); comparing with the corrected estimate would let the factor drift back to 1.
 * Hours factor: per category, the median of approved hours ÷ package hours of finished tasks, from at least 5
 * tasks; it corrects the hours of rough packages, and only upwards (up to HOURS_MAX).
 * All functions are pure: they read `db` and a point in time.
 */
const DAY = 86400000;
const CALIBRATION = {
  months: 12, // older confirmations drop out
  minParts: 3, // parts needed for a supplier factor
  min: 0.8, // the factor is limited to ...
  max: 1.3, // ... 0.8-1.3
  minTasks: 5, // finished tasks needed for the hours factor
  hoursMax: 2, // the hours factor never more than doubles the hours
  weakUnchangedPercent: 50, // track record: fewer parts confirmed unchanged than this ...
  weakGapPercent: 15, // ... or a factor further than this from 1 lowers the confidence one step
};
const key = (s) =>
  String(s || "")
    .trim()
    .toLowerCase();
const round = (n, d = 3) => Math.round(n * 10 ** d) / 10 ** d;
function median(list) {
  const s = [...list].sort((a, b) => a - b),
    m = s.length >> 1;
  return s.length % 2 ? s[m] : (s[m - 1] + s[m]) / 2;
}
const clamp = (n, lo, hi) => Math.min(hi, Math.max(lo, n));
const since = (at) => {
  const d = new Date(at);
  d.setUTCMonth(d.getUTCMonth() - CALIBRATION.months);
  return d.getTime();
};

// A supplier's confirmed estimate parts in a category within the window: { base, confirmed, estimate }
function confirmedParts(db, supplierId, category, at = Date.now()) {
  const from = since(at),
    out = [];
  for (const r of db.requests || [])
    for (const p of r.award?.estimate ? r.award.parts || [] : []) {
      // an automatic confirmation (T244) is the estimate itself and says nothing new
      if (p.supplierId !== supplierId || p.status !== "Confirmed" || p.auto || !(p.baseAmount > 0)) continue;
      if (category !== undefined && key(p.category) !== key(category)) continue;
      const when = Date.parse(p.confirmedAt || "") || 0;
      if (when < from || when > at) continue;
      out.push({ base: p.baseAmount, confirmed: p.supplierAmount, estimate: p.estimate, category: p.category });
    }
  return out;
}

// The supplier's factor and track record for a category. factor is 1 until there are enough parts.
function supplierRecord(db, supplierId, category, at = Date.now()) {
  const parts = confirmedParts(db, supplierId, category, at),
    n = parts.length;
  if (n < CALIBRATION.minParts) return { n, factor: 1, raw: null, unchangedPercent: null, active: false };
  const raw = median(parts.map((p) => p.confirmed / p.base)),
    unchanged = parts.filter((p) => Math.round(p.confirmed) === Math.round(p.estimate)).length;
  return {
    n,
    raw: round(raw),
    factor: round(clamp(raw, CALIBRATION.min, CALIBRATION.max)),
    unchangedPercent: Math.round((unchanged / n) * 100),
    active: true,
  };
}

// T241's confidence: a supplier whose confirmations often differ from the estimate is less sure
function weakRecord(rec) {
  return (
    rec.active &&
    (rec.unchangedPercent < CALIBRATION.weakUnchangedPercent ||
      Math.abs(rec.factor - 1) * 100 > CALIBRATION.weakGapPercent)
  );
}

// The hours factor of a category: approved hours of finished tasks against the hours of their packages
function hoursFactor(db, category, at = Date.now()) {
  const from = since(at),
    approved = new Map();
  for (const t of db.timeEntries || []) {
    if (t.status !== "Approved" || !t.taskId) continue;
    const e = approved.get(t.taskId) || { hours: 0, last: 0 };
    e.hours += Number(t.hours) || 0;
    e.last = Math.max(e.last, Date.parse(t.workDate || "") || 0);
    approved.set(t.taskId, e);
  }
  const tasks = new Map();
  for (const p of db.projects || [])
    for (const ph of p.phases || []) for (const t of ph.tasks || []) tasks.set(t.id, t);
  const ratios = [];
  for (const r of db.requests || [])
    for (const pkg of r.packages || []) {
      if (key(pkg.category) !== key(category) || !(pkg.hours > 0) || !pkg.taskId) continue;
      const task = tasks.get(pkg.taskId),
        e = approved.get(pkg.taskId);
      if (task?.status !== "Completed" || !e || e.last < from || e.last > at) continue;
      ratios.push(e.hours / pkg.hours);
    }
  const n = ratios.length;
  if (n < CALIBRATION.minTasks) return { n, factor: 1, raw: null, active: false };
  const raw = median(ratios);
  return { n, raw: round(raw), factor: round(clamp(raw, 1, CALIBRATION.hoursMax)), active: raw > 1 };
}

// What a supplier sees about itself: one entry per category with a factor
function forSupplier(db, supplierId, at = Date.now()) {
  const cats = [...new Set(confirmedParts(db, supplierId, undefined, at).map((p) => p.category))].filter(Boolean);
  return cats
    .map((category) => ({ category, ...supplierRecord(db, supplierId, category, at) }))
    .filter((x) => x.active)
    .map((x) => ({ ...x, percent: Math.round((x.factor - 1) * 100) }));
}

module.exports = { CALIBRATION, supplierRecord, weakRecord, hoursFactor, forSupplier, median };
