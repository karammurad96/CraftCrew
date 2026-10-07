/*
 * Capacity calendar (T245, Wave 16). Instead of counting open tasks, the instant estimate looks at a supplier's
 * free crew-days in the request's period.
 *
 *  - Capacity: crew-days per week (people × days), for all work or per category. Without it the old rule (fewer
 *    than RANKING.maxOpenTasks open tasks) stays.
 *  - Booked days: the supplier's assigned, unfinished tasks fill the calendar from their dates and hours
 *    (estimated hours ÷ 8 crew-days spread over the working days; without hours one crew-day per working day).
 *  - Blocked days: the supplier blocks days (holidays, other work) and can import iCal feeds of blocked days
 *    (read-only, refreshed hourly).
 *  - A part's time is its hours (÷ 8 = crew-days) spread over the free days, so a busy supplier ends later.
 * The functions are pure functions of `db` (the feed fetch is injected), so tests can feed fixed data.
 */
const dns = require("node:dns");
const net = require("node:net");
const HOURS_PER_DAY = 8;
const DAY = 86400000;
const MAX_FEEDS = 3;
const MAX_FEED_BYTES = 1024 * 1024;
const MAX_FEED_DAYS = 800;
const key = (s) =>
  String(s || "")
    .trim()
    .toLowerCase();
const isoDay = (ms) => new Date(ms).toISOString().slice(0, 10);
const dayMs = (d) => Date.parse(String(d).slice(0, 10) + "T00:00:00Z");
const validDay = (d) => /^\d{4}-\d{2}-\d{2}/.test(String(d || "")) && !Number.isNaN(dayMs(d));
const isWorkday = (ms) => ![0, 6].includes(new Date(ms).getUTCDay());
const round = (n, d = 2) => Math.round(n * 10 ** d) / 10 ** d;

/* ---------- the calendar ---------- */
// Crew-days per working day for a category, or null when the supplier has not set a capacity
function perDay(s, category) {
  const c = s?.capacity;
  if (!c) return null;
  const own = Object.entries(c.perCategory || {}).find(([k]) => key(k) === key(category));
  const week = own ? Number(own[1]) : Number(c.crewDaysPerWeek);
  return week > 0 ? week / 5 : null;
}
const blockedDays = (s) => {
  const set = new Set();
  for (const b of s?.capacity?.blocked || [])
    for (let d = dayMs(b.from), end = dayMs(b.to || b.from), n = 0; d <= end && n < 800; d += DAY, n++) set.add(isoDay(d));
  for (const f of s?.capacity?.feeds || []) for (const d of f.days || []) set.add(d);
  return set;
};
// The category of the work package behind a task, when it came from a request
function categoryOfTask(db, taskId) {
  for (const r of db.requests || []) {
    const pkg = (r.packages || []).find((p) => p.taskId === taskId);
    if (pkg) return pkg.category;
  }
  return null;
}
// The supplier's booked crew-days per day: its assigned tasks that are not finished. For a category, tasks known
// to belong to another category do not count; tasks of unknown category count against every category.
function bookings(db, s, category) {
  const out = new Map(),
    list = [];
  for (const p of db.projects || [])
    for (const ph of p.phases || [])
      for (const t of ph.tasks || []) {
        if (t.assignedSupplierId !== s.id || t.status === "Completed" || !validDay(t.startDate)) continue;
        const cat = categoryOfTask(db, t.id);
        if (category && cat && key(cat) !== key(category)) continue;
        const from = dayMs(t.startDate),
          to = validDay(t.dueDate) ? Math.max(from, dayMs(t.dueDate)) : from,
          days = [];
        for (let d = from; d <= to && days.length < 800; d += DAY) if (isWorkday(d)) days.push(isoDay(d));
        if (!days.length) days.push(isoDay(from));
        const hours = Number(t.estimatedHours) > 0 ? Number(t.estimatedHours) : null,
          load = hours ? hours / HOURS_PER_DAY / days.length : 1;
        for (const d of days) out.set(d, (out.get(d) || 0) + load);
        list.push({ id: t.id, name: t.name, from: t.startDate.slice(0, 10), to: (t.dueDate || t.startDate).slice(0, 10), project: p.name });
      }
  return { byDay: out, list };
}
// Free crew-days between two dates (inclusive), or null when the supplier has no capacity
function freeCrewDays(db, supplierId, category, from, to) {
  const s = (db.suppliers || []).find((x) => x.id === supplierId),
    per = perDay(s, category);
  if (per === null) return null;
  const booked = bookings(db, s, category).byDay,
    blocked = blockedDays(s);
  let free = 0;
  const start = validDay(from) ? dayMs(from) : Date.now(),
    end = validDay(to) ? dayMs(to) : start + 365 * DAY;
  for (let d = start, n = 0; d <= end && n < 800; d += DAY, n++) {
    const k = isoDay(d);
    if (isWorkday(d) && !blocked.has(k)) free += Math.max(0, per - (booked.get(k) || 0));
  }
  return round(free);
}
// Spread `hours` over the free days from `from`: when the work ends and how many working days that takes.
// null: no capacity set. finished false: the work does not fit before `limit` (or within a year).
function schedule(db, s, category, from, hours, limit) {
  const per = perDay(s, category);
  if (per === null) return null;
  const booked = bookings(db, s, category).byDay,
    blocked = blockedDays(s),
    start = validDay(from) ? dayMs(from) : Date.now(),
    end = limit && validDay(limit) ? dayMs(limit) : start + 365 * DAY;
  let need = hours / HOURS_PER_DAY,
    workdays = 0,
    last = null;
  for (let d = start, n = 0; n < 800; d += DAY, n++) {
    if (d > end && need > 0) return { finished: false, workdays, end: null };
    if (!isWorkday(d)) continue;
    workdays++;
    const k = isoDay(d),
      free = blocked.has(k) ? 0 : Math.max(0, per - (booked.get(k) || 0));
    need -= free;
    if (free > 0) last = k;
    if (need <= 1e-9) return { finished: true, workdays, end: last || k };
  }
  return { finished: false, workdays, end: null };
}

// The next weeks as the supplier sees them: capacity, booked, blocked and free crew-days per week (Monday)
function weeks(db, s, category, count = 12, at = Date.now()) {
  const per = perDay(s, category);
  if (per === null) return [];
  const booked = bookings(db, s, category).byDay,
    blocked = blockedDays(s),
    out = [],
    d0 = new Date(at),
    monday = Date.UTC(d0.getUTCFullYear(), d0.getUTCMonth(), d0.getUTCDate()) - ((d0.getUTCDay() + 6) % 7) * DAY;
  for (let w = 0; w < count; w++) {
    const row = { week: isoDay(monday + w * 7 * DAY), capacity: 0, booked: 0, blocked: 0, free: 0 };
    for (let i = 0; i < 5; i++) {
      const d = monday + (w * 7 + i) * DAY,
        k = isoDay(d),
        b = booked.get(k) || 0;
      if (blocked.has(k)) row.blocked += per;
      else {
        row.capacity += per;
        row.booked += Math.min(per, b);
        row.free += Math.max(0, per - b);
      }
    }
    for (const f of ["capacity", "booked", "blocked", "free"]) row[f] = round(row[f], 1);
    out.push(row);
  }
  return out;
}

/* ---------- iCal: import of blocked days ---------- */
const unfold = (text) => String(text).replace(/\r?\n[ \t]/g, "");
// The days an iCal feed blocks: all-day and timed events (a transparent or cancelled event does not block).
// Repeating events (RRULE) count only once.
function parseBlockedDays(text, from = Date.now()) {
  const days = new Set(),
    horizon = from + 2 * 365 * DAY;
  for (const block of unfold(text).split(/BEGIN:VEVENT/i).slice(1)) {
    const body = block.split(/END:VEVENT/i)[0],
      prop = (name) => {
        const m = body.match(new RegExp(`^${name}([;:][^\\r\\n]*)$`, "im"));
        if (!m) return null;
        const v = m[1].slice(m[1].lastIndexOf(":") + 1).trim();
        return { value: v, date: /VALUE=DATE(?!-)/i.test(m[1]) || /^\d{8}$/.test(v) };
      },
      start = prop("DTSTART"),
      end = prop("DTEND");
    if (!start || /^STATUS:CANCELLED/im.test(body) || /^TRANSP:TRANSPARENT/im.test(body)) continue;
    const toDay = (v) => `${v.slice(0, 4)}-${v.slice(4, 6)}-${v.slice(6, 8)}`;
    if (!/^\d{8}/.test(start.value)) continue;
    const a = dayMs(toDay(start.value));
    let b = a;
    if (end && /^\d{8}/.test(end.value)) {
      b = dayMs(toDay(end.value));
      // all-day: the end is exclusive; timed: it is the last day unless the event ends at midnight
      if (start.date || /T0{4,6}Z?$/.test(end.value)) b -= DAY;
      if (b < a) b = a;
    }
    for (let d = a; d <= b && days.size < MAX_FEED_DAYS; d += DAY) if (d >= from - DAY && d <= horizon) days.add(isoDay(d));
  }
  return [...days].sort();
}

// Fetches a feed over https (http only with ICAL_ALLOW_LOCAL, for tests). No redirects, 10 s, 1 MB, and never an
// address of the machine's own network.
function privateAddress(ip) {
  if (net.isIPv4(ip)) {
    const [a, b] = ip.split(".").map(Number);
    return a === 10 || a === 127 || a === 0 || (a === 169 && b === 254) || (a === 172 && b >= 16 && b <= 31) || (a === 192 && b === 168) || (a === 100 && b >= 64 && b <= 127) || a >= 224;
  }
  const v = ip.toLowerCase();
  return v === "::1" || v === "::" || v.startsWith("fc") || v.startsWith("fd") || v.startsWith("fe80") || v.startsWith("::ffff:");
}
function fetchFeed(rawUrl) {
  const allowLocal = process.env.ICAL_ALLOW_LOCAL === "1";
  return new Promise((resolve, reject) => {
    let u;
    try {
      u = new URL(String(rawUrl).replace(/^webcal:/i, "https:"));
    } catch {
      return reject(new Error("The address is not valid."));
    }
    if (u.protocol !== "https:" && !(allowLocal && u.protocol === "http:")) return reject(new Error("Use an https address."));
    const lib = require(u.protocol === "https:" ? "node:https" : "node:http"),
      lookup = (host, opts, cb) =>
        dns.lookup(host, opts, (err, address, family) => {
          if (err) return cb(err, address, family);
          const list = Array.isArray(address) ? address : [{ address, family }];
          if (!allowLocal && list.some((x) => privateAddress(x.address))) return cb(new Error("blocked address"));
          cb(null, address, family);
        });
    const req = lib.get(u, { lookup, timeout: 10000, headers: { Accept: "text/calendar", "User-Agent": "CraftCrew-calendar-import" } }, (res) => {
      if (res.statusCode !== 200) {
        res.resume();
        return reject(new Error("The feed answered with status " + res.statusCode + "."));
      }
      let size = 0;
      const chunks = [];
      res.on("data", (c) => {
        size += c.length;
        if (size > MAX_FEED_BYTES) {
          req.destroy();
          reject(new Error("The feed is larger than 1 MB."));
        } else chunks.push(c);
      });
      res.on("end", () => resolve(Buffer.concat(chunks).toString("utf8")));
    });
    req.on("timeout", () => req.destroy(new Error("The feed did not answer in time.")));
    req.on("error", (e) => reject(e.message === "blocked address" ? new Error("This address is not allowed.") : e));
  });
}

module.exports = function createCapacity(ctx) {
  const { getDb, save, send, body, now, activity } = ctx;
  const fetcher = ctx.fetchFeed || fetchFeed;
  const supplierOf = (sid) => getDb().suppliers.find((s) => s.id === sid);

  async function refreshFeed(feed) {
    try {
      const text = await fetcher(feed.url);
      if (!/BEGIN:VCALENDAR/i.test(text)) throw new Error("This is not a calendar feed.");
      Object.assign(feed, { days: parseBlockedDays(text), fetchedAt: now(), error: null });
    } catch (e) {
      Object.assign(feed, { error: String(e.message || e).slice(0, 200), fetchedAt: now() });
    }
  }
  // Hourly (server.js): every supplier's feeds, one after the other
  async function refreshAll() {
    for (const s of getDb().suppliers) for (const f of s.capacity?.feeds || []) await refreshFeed(f);
    save();
  }

  const view = (s) => {
    const c = s.capacity || {};
    return {
      crewDaysPerWeek: c.crewDaysPerWeek || 0,
      perCategory: c.perCategory || {},
      blocked: c.blocked || [],
      feeds: (c.feeds || []).map((f) => ({ id: f.id, url: f.url, days: (f.days || []).length, fetchedAt: f.fetchedAt || null, error: f.error || null })),
      weeks: weeks(getDb(), s, undefined),
      bookings: bookings(getDb(), s).list,
    };
  };

  async function handle(req, res, parts, user) {
    if (parts[1] !== "capacity") return false;
    if (user.role !== "supplier" || !user.supplierId)
      return (send(res, 403, { error: "Only suppliers set a capacity." }), true);
    const s = supplierOf(user.supplierId);
    if (!s) return (send(res, 404, { error: "Supplier not found" }), true);
    if (!parts[2] && req.method === "GET") return (send(res, 200, view(s)), true);
    if (parts[2] === "refresh" && req.method === "POST") {
      for (const f of s.capacity?.feeds || []) await refreshFeed(f);
      save();
      return (send(res, 200, view(s)), true);
    }
    if (parts[2] || req.method !== "PUT") return false;
    const b = await body(req),
      week = Number(b.crewDaysPerWeek || 0);
    if (!Number.isFinite(week) || week < 0 || week > 500)
      return (send(res, 400, { error: "Capacity: crew-days per week from 0 to 500." }), true);
    const per = {};
    for (const [cat, v] of Object.entries(b.perCategory && typeof b.perCategory === "object" ? b.perCategory : {})) {
      const n = Number(v);
      if (v === "" || v === null || v === undefined || n === 0) continue;
      if (!Number.isFinite(n) || n < 0 || n > 500 || Object.keys(per).length >= 30)
        return (send(res, 400, { error: "Capacity: crew-days per week from 0 to 500." }), true);
      per[String(cat).trim().slice(0, 80)] = n;
    }
    const blocked = [];
    for (const x of Array.isArray(b.blocked) ? b.blocked : []) {
      if (!x || !validDay(x.from) || (x.to && !validDay(x.to)) || (x.to && x.to < x.from))
        return (send(res, 400, { error: "Blocked days: enter a start date and an end date that is not before it." }), true);
      blocked.push({ id: x.id || ctx.id("blk"), from: x.from.slice(0, 10), to: (x.to || x.from).slice(0, 10), note: String(x.note || "").trim().slice(0, 120) });
      if (blocked.length > 200) return (send(res, 400, { error: "Blocked days: up to 200 entries." }), true);
    }
    const urls = [...new Set((Array.isArray(b.feeds) ? b.feeds : []).map((u) => String(u).trim()).filter(Boolean))];
    if (urls.length > MAX_FEEDS || urls.some((u) => u.length > 500))
      return (send(res, 400, { error: "Calendar feeds: up to 3 addresses." }), true);
    const old = new Map((s.capacity?.feeds || []).map((f) => [f.url, f])),
      feeds = urls.map((url) => old.get(url) || { id: ctx.id("fed"), url, days: [] });
    s.capacity = { crewDaysPerWeek: week, perCategory: per, blocked, feeds, updatedAt: now() };
    for (const f of feeds) if (!old.has(f.url)) await refreshFeed(f);
    activity(user, "Changed the capacity calendar");
    save();
    return (send(res, 200, view(s)), true);
  }

  return { handle, refreshAll, freeCrewDays: (sid, category, from, to) => freeCrewDays(getDb(), sid, category, from, to), bookings: (s) => bookings(getDb(), s).list, blocked: (s) => [...blockedDays(s)] };
};
Object.assign(module.exports, { perDay, bookings, freeCrewDays, schedule, weeks, parseBlockedDays, fetchFeed, privateAddress, blockedDays, HOURS_PER_DAY });
