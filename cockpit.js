/*
 * The operator cockpit (T242, Wave 16): the business figures of the brokered workflow for the admin page
 * "Business", and the deadlines of the request queue.
 *
 * The figures look at the requests created in a period (a cohort), filtered by category and region (postcode
 * prefix): speed to the first options, the funnel, how good the estimates were, liquidity, retention and leakage
 * signals. Money looks at the contracts made and the fees billed (T240) in the period. Every figure is a pure
 * function of the data (`figures(db, opts)`), so tests can feed it fixed data.
 */
const HOUR = 3600000,
  DAY = 24 * HOUR;
// The queue's deadlines (admin settings; T242): a new request waiting for the operator, a supplier's part close to
// its expiry, and a price change waiting for the customer
const DEFAULT_LIMITS = { newHours: 4, partDays: 1, priceDays: 2 };
const STEPS = ["requests", "optionsReady", "chosen", "contracted"];
const REACHED = {
  optionsReady: ["Options ready", "Chosen", "Contracted"],
  chosen: ["Chosen", "Contracted"],
  contracted: ["Contracted"],
};
const QUIET_DAYS = 90; // an introduced pair with one order and none for this long is a leakage signal
const SIX_MONTHS = 183 * DAY;

const round = (n, d = 2) => (n === null || !Number.isFinite(n) ? null : Math.round(n * 10 ** d) / 10 ** d);
const ms = (iso) => Date.parse(iso || "") || 0;
function median(list) {
  if (!list.length) return null;
  const s = [...list].sort((a, b) => a - b),
    m = s.length >> 1;
  return s.length % 2 ? s[m] : (s[m - 1] + s[m]) / 2;
}
const mean = (list) => (list.length ? list.reduce((n, x) => n + x, 0) / list.length : null);
const share = (part, whole) => (whole ? round((part / whole) * 100, 1) : null);

// Hours between two times that fall on working days (Monday to Friday; weekends do not count)
function workingHoursBetween(from, to) {
  let a = typeof from === "number" ? from : ms(from);
  const b = typeof to === "number" ? to : ms(to);
  let h = 0;
  for (let i = 0; a < b && i < 800; i++) {
    const d = new Date(a),
      next = Date.UTC(d.getUTCFullYear(), d.getUTCMonth(), d.getUTCDate() + 1),
      end = Math.min(next, b);
    if (d.getUTCDay() !== 0 && d.getUTCDay() !== 6) h += (end - a) / HOUR;
    a = end;
  }
  return h;
}
function limitsOf(db) {
  return { ...DEFAULT_LIMITS, ...(db.settings?.queueDeadlines || {}) };
}
// The deadlines a request has passed (or, for a supplier's part, is close to), oldest first
function deadlinesOf(r, limits = DEFAULT_LIMITS, at = Date.now()) {
  const out = [];
  if (r.status === "New" && workingHoursBetween(r.createdAt, at) > limits.newHours)
    out.push({ kind: "newRequest", since: r.createdAt });
  if (r.award && r.award.status !== "Accepted")
    for (const p of r.award.parts || []) {
      if (p.status === "Waiting for supplier" && workingHoursBetween(at, p.expiresAt) <= limits.partDays * 24)
        out.push({ kind: "partExpiring", partId: p.id, expiresAt: p.expiresAt });
      if (p.status === "Price changed" && workingHoursBetween(p.proposed?.at || p.offeredAt, at) > limits.priceDays * 24)
        out.push({ kind: "priceWaiting", partId: p.id, since: p.proposed?.at || p.offeredAt });
    }
  return out;
}

// The bucket of a date: the Monday of its week, or its month
function bucketOf(iso, period) {
  if (period === "month") return String(iso).slice(0, 7);
  const d = new Date(String(iso).slice(0, 10) + "T00:00:00Z");
  d.setUTCDate(d.getUTCDate() - ((d.getUTCDay() + 6) % 7));
  return d.toISOString().slice(0, 10);
}

/* opts: { from, to (YYYY-MM-DD), period: "week" | "month", category, region, at (now, ms) } */
function figures(db, opts = {}) {
  const at = opts.at ?? Date.now(),
    to = opts.to || new Date(at).toISOString().slice(0, 10),
    from = opts.from || new Date(ms(to) - 89 * DAY).toISOString().slice(0, 10),
    period = opts.period === "week" ? "week" : "month",
    category = opts.category || "",
    region = opts.region || "",
    inRange = (iso) => {
      const d = String(iso || "").slice(0, 10);
      return d >= from && d <= to;
    },
    requests = db.requests || [];
  const matches = (r) =>
    (!category || r.category === category || (r.packages || []).some((p) => p.category === category)) &&
    (!region || String(r.sitePostcode || "").startsWith(region));
  const matching = requests.filter(matches),
    cohort = matching.filter((r) => inRange(r.createdAt)),
    byId = new Map(matching.map((r) => [r.id, r]));
  const firstAt = (r, statuses) => {
    for (const h of r.history || []) if (statuses.includes(h.status)) return h;
    return null;
  };

  // Speed: hours from the request to its first options, instant estimates and the operator's options apart
  const speed = { instant: [], manual: [] };
  for (const r of cohort) {
    const h = firstAt(r, REACHED.optionsReady);
    if (!h) continue;
    speed[h.note === "Instant estimate" ? "instant" : "manual"].push((ms(h.at) - ms(r.createdAt)) / HOUR);
  }
  const speedOf = (l) => ({ n: l.length, medianHours: round(median(l), 1), meanHours: round(mean(l), 1) });

  // Funnel: how many requests reached each step, and the rate from the step before
  const counts = {
    requests: cohort.length,
    optionsReady: cohort.filter((r) => firstAt(r, REACHED.optionsReady)).length,
    chosen: cohort.filter((r) => firstAt(r, REACHED.chosen)).length,
    contracted: cohort.filter((r) => firstAt(r, REACHED.contracted)).length,
  };
  const funnel = STEPS.map((step, i) => ({
    step,
    n: counts[step],
    rate: i ? share(counts[step], counts[STEPS[i - 1]]) : null,
  }));

  // Estimates: the suppliers' answers to estimate parts (T232)
  const parts = cohort.flatMap((r) => (r.award?.estimate ? r.award.parts || [] : []));
  const confirmed = parts.filter((p) => p.status === "Confirmed" || p.confirmedAt),
    unchanged = confirmed.filter((p) => Math.round(p.supplierAmount) === Math.round(p.estimate)),
    gaps = confirmed.filter((p) => p.estimate > 0).map((p) => ((p.supplierAmount - p.estimate) / p.estimate) * 100),
    firstAsked = parts.filter((p) => !p.replaces && ["Confirmed", "Declined"].includes(p.status)),
    firstConfirmed = firstAsked.filter((p) => p.status === "Confirmed");
  const estimates = {
    confirmedParts: confirmed.length,
    unchangedShare: share(unchanged.length, confirmed.length),
    meanGapPercent: round(mean(gaps), 1),
    firstSupplierShare: share(firstConfirmed.length, firstAsked.length),
  };

  // Liquidity: priced candidates per work package, counted when the request arrived
  const pkgs = cohort.flatMap((r) =>
    (r.packages || []).filter((p) => Number.isFinite(p.candidates)).map((p) => ({ r, p })),
  );
  const thin = pkgs.filter((x) => x.p.candidates < 3);
  const liquidity = {
    packages: pkgs.length,
    meanCandidates: round(mean(pkgs.map((x) => x.p.candidates)), 1),
    thin: thin.length,
    thinList: thin.slice(0, 50).map(({ r, p }) => ({
      requestId: r.id,
      title: r.title,
      package: p.name,
      category: p.category,
      candidates: p.candidates,
    })),
  };

  // Money: the orders contracted in the period, and the fees billed for its months (T240)
  const contracts = (db.contracts || []).filter((c) => c.requestId && byId.has(c.requestId) && inRange(c.createdAt));
  const volume = contracts.reduce((n, c) => n + (Number(c.value) || 0), 0);
  const filtered = category || region,
    projectMatches = new Set(matching.map((r) => r.projectId).filter(Boolean)),
    invoices = new Map((db.invoices || []).map((i) => [i.id, i])),
    months = [from.slice(0, 7), to.slice(0, 7)];
  let feeInvoiced = 0,
    feePaid = 0;
  for (const st of db.commissionStatements || []) {
    if (st.period < months[0] || st.period > months[1]) continue;
    for (const l of st.lines || []) {
      if (filtered && !projectMatches.has(invoices.get(l.invoiceId)?.projectId)) continue;
      feeInvoiced += Number(l.fee) || 0;
      if (st.status === "Paid") feePaid += Number(l.fee) || 0;
    }
  }
  const money = {
    orders: contracts.length,
    volume: round(volume),
    feeInvoiced: round(feeInvoiced),
    feePaid: round(feePaid),
    takeRate: volume ? round((feeInvoiced / volume) * 100, 1) : null,
  };

  // Retention: customers of the period who sent another request within six months of their first one in it
  const firstOf = new Map();
  for (const r of cohort)
    if (!firstOf.has(r.customerId) || r.createdAt < firstOf.get(r.customerId)) firstOf.set(r.customerId, r.createdAt);
  const byCustomer = new Map();
  for (const r of requests) {
    if (!firstOf.has(r.customerId)) continue;
    if (!byCustomer.has(r.customerId)) byCustomer.set(r.customerId, []);
    byCustomer.get(r.customerId).push(ms(r.createdAt));
  }
  let returning = 0;
  for (const [cid, first] of firstOf) {
    const t = ms(first);
    if (byCustomer.get(cid).some((x) => x > t && x - t <= SIX_MONTHS)) returning++;
  }
  const retention = { customers: firstOf.size, returning, rate: share(returning, firstOf.size) };

  // Leakage signals: contact details caught in messages (T226), and introduced pairs (T227) with a single order
  // and no new one for 90 days, while protected or after the protection ran out
  const hints = cohort.reduce((n, r) => n + (r.leakHints || []).filter((h) => inRange(h.at)).length, 0);
  const protectMonths = db.settings?.clause?.months || 12,
    quiet = (db.introductions || [])
      .filter((p) => (p.requestIds || []).length <= 1 && at - ms(p.lastOrderAt) >= QUIET_DAYS * DAY)
      .filter((p) => !filtered || (p.requestIds || []).some((id) => byId.has(id)))
      .map((p) => {
        const until = new Date(ms(p.lastOrderAt));
        until.setUTCMonth(until.getUTCMonth() + protectMonths);
        return {
          customerId: p.customerId,
          supplierId: p.supplierId,
          lastOrderAt: p.lastOrderAt,
          protectedUntil: until.toISOString().slice(0, 10),
          protectionEnded: until.getTime() < at,
        };
      });
  const leakage = { hints, quietPairs: quiet.length, pairs: quiet.slice(0, 50) };

  // The core figures per week or month
  const buckets = new Map();
  const bucket = (iso) => {
    const k = bucketOf(iso, period);
    if (!buckets.has(k)) buckets.set(k, { bucket: k, requests: 0, optionsReady: 0, chosen: 0, contracted: 0, volume: 0 });
    return buckets.get(k);
  };
  for (const r of cohort) {
    const b = bucket(r.createdAt);
    b.requests++;
    for (const step of ["optionsReady", "chosen", "contracted"]) if (firstAt(r, REACHED[step])) b[step]++;
  }
  for (const c of contracts) bucket(c.createdAt).volume += Number(c.value) || 0;
  const series = [...buckets.values()]
    .map((b) => ({ ...b, volume: round(b.volume) }))
    .sort((a, b) => a.bucket.localeCompare(b.bucket));

  return {
    filter: { from, to, period, category, region },
    speed: { instant: speedOf(speed.instant), manual: speedOf(speed.manual) },
    funnel,
    estimates,
    liquidity,
    money,
    retention,
    leakage,
    series,
  };
}

// Every figure as CSV rows: section, figure, value; then the series
function toCsv(f) {
  const cell = (v) => {
    const s = v === null || v === undefined ? "" : String(v);
    // A leading = + - @ would start a formula in a spreadsheet
    const safe = /^[=+\-@]/.test(s) && !/^-?\d/.test(s) ? "'" + s : s;
    return /[",\n;]/.test(safe) ? `"${safe.replace(/"/g, '""')}"` : safe;
  };
  const rows = [["section", "figure", "value"]];
  for (const [k, v] of Object.entries(f.filter)) rows.push(["filter", k, v]);
  for (const kind of ["instant", "manual"])
    for (const [k, v] of Object.entries(f.speed[kind])) rows.push(["speed", `${kind}.${k}`, v]);
  for (const s of f.funnel) rows.push(["funnel", s.step, s.n], ["funnel", s.step + ".rate", s.rate]);
  for (const sec of ["estimates", "money", "retention"])
    for (const [k, v] of Object.entries(f[sec])) rows.push([sec, k, v]);
  for (const k of ["packages", "meanCandidates", "thin"]) rows.push(["liquidity", k, f.liquidity[k]]);
  for (const x of f.liquidity.thinList) rows.push(["thin", x.title, x.package, x.candidates]);
  rows.push(["leakage", "hints", f.leakage.hints], ["leakage", "quietPairs", f.leakage.quietPairs]);
  rows.push([], ["bucket", "requests", "optionsReady", "chosen", "contracted", "volume"]);
  for (const b of f.series) rows.push([b.bucket, b.requests, b.optionsReady, b.chosen, b.contracted, b.volume]);
  return rows.map((r) => r.map(cell).join(",")).join("\r\n") + "\r\n";
}

function createCockpit(ctx) {
  const { getDb, save, send, body, activity, categories } = ctx;
  const isDate = (v) => /^\d{4}-\d{2}-\d{2}$/.test(String(v || "")) && !Number.isNaN(Date.parse(v));
  // The filter from the query; returns {error} or {opts}
  function optsFrom(url) {
    const q = url.searchParams,
      from = q.get("from") || "",
      to = q.get("to") || "",
      period = q.get("period") || "month",
      region = String(q.get("region") || "").trim();
    if ((from && !isDate(from)) || (to && !isDate(to)) || (from && to && to < from))
      return { error: "Check the period: the end cannot be before the start." };
    if (!["week", "month"].includes(period) || !/^\d{0,5}$/.test(region))
      return { error: "Check the filter: weeks or months, and a postcode prefix of up to five digits." };
    return { opts: { from, to, period, region, category: String(q.get("category") || "").slice(0, 80) } };
  }
  // Open requests with a passed deadline, for the queue and the admin's action queue
  function overdue() {
    const db = getDb(),
      limits = limitsOf(db),
      at = Date.now();
    return (db.requests || [])
      .filter((r) => ["New", "Sourcing", "Options ready", "Chosen"].includes(r.status))
      .flatMap((r) => deadlinesOf(r, limits, at).map((d) => ({ r, d })));
  }

  async function handle(req, res, url, parts, user) {
    if (parts[1] !== "admin" || parts[2] !== "business") return false;
    if (user.role !== "admin") return (send(res, 403, { error: "Admin only" }), true);
    const method = req.method,
      db = getDb();
    if ((!parts[3] || parts[3] === "csv") && !parts[4] && method === "GET") {
      const { error, opts } = optsFrom(url);
      if (error) return (send(res, 400, { error }), true);
      const f = figures(db, opts);
      if (parts[3] === "csv") {
        res.writeHead(200, {
          "Content-Type": "text/csv; charset=utf-8",
          "Content-Disposition": `attachment; filename="business-${f.filter.from}-${f.filter.to}.csv"`,
          "X-Content-Type-Options": "nosniff",
          "Cache-Control": "no-store",
        });
        return (res.end("﻿" + toCsv(f)), true);
      }
      return (
        send(res, 200, {
          figures: f,
          limits: limitsOf(db),
          categories: categories(),
        }),
        true
      );
    }
    if (parts[3] === "deadlines" && !parts[4] && method === "PUT") {
      const b = await body(req),
        limits = { newHours: Number(b.newHours), partDays: Number(b.partDays), priceDays: Number(b.priceDays) };
      if (
        !Number.isInteger(limits.newHours) ||
        limits.newHours < 1 ||
        limits.newHours > 72 ||
        ![limits.partDays, limits.priceDays].every((n) => Number.isInteger(n) && n >= 1 && n <= 10)
      )
        return (send(res, 400, { error: "Deadlines: 1 to 72 working hours for new requests, 1 to 10 working days for the others." }), true);
      db.settings = { ...(db.settings || {}), queueDeadlines: limits };
      activity(user, "Changed the request queue deadlines");
      save();
      return (send(res, 200, { limits }), true);
    }
    return false;
  }

  return { handle, overdue, deadlines: (r) => deadlinesOf(r, limitsOf(getDb()), Date.now()) };
}

module.exports = createCockpit;
Object.assign(module.exports, { figures, toCsv, deadlinesOf, workingHoursBetween, DEFAULT_LIMITS });
