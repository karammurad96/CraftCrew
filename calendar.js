/*
 * Calendar feeds (T66): a personal secret URL per user, /ics/<token>.ics, with task due dates, phase dates,
 * bid deadlines, contract notice dates and approved site visits as all-day events (RFC 5545).
 * Only a hash of the token is stored; creating a new link makes the old one stop working.
 */
const crypto = require("node:crypto");
const { BRAND } = require("./locales");

const hash = (token) => crypto.createHash("sha256").update(token).digest("hex");
const ymd = (day) => String(day).slice(0, 10).replaceAll("-", "");
const nextDay = (day) =>
  new Date(Date.parse(String(day).slice(0, 10) + "T00:00:00Z") + 86400000).toISOString().slice(0, 10);
const validDay = (d) =>
  /^\d{4}-\d{2}-\d{2}/.test(String(d || "")) && !Number.isNaN(Date.parse(String(d).slice(0, 10)));

// TEXT values: backslash, semicolon, comma and line breaks are escaped.
const icsText = (s) =>
  String(s ?? "")
    .replace(/\\/g, "\\\\")
    .replace(/;/g, "\\;")
    .replace(/,/g, "\\,")
    .replace(/\r?\n/g, "\\n");
// Lines longer than 75 octets continue on the next line after a space.
function fold(line) {
  const out = [];
  let current = "";
  for (const ch of line) {
    if (Buffer.byteLength(current + ch) > (out.length ? 74 : 75)) {
      out.push(current);
      current = ch;
    } else current += ch;
  }
  out.push(current);
  return out.join("\r\n ");
}

module.exports = function createCalendar(ctx) {
  const { getDb, save, send, now, projectFor, resolveUser, contracts, appUrl } = ctx;

  function events(user) {
    const db = getDb(),
      list = [],
      add = (uid, day, summary, description, link, endDay) => {
        if (!validDay(day)) return;
        list.push({
          uid,
          day: day.slice(0, 10),
          endDay: validDay(endDay) ? endDay.slice(0, 10) : null,
          summary,
          description,
          link,
        });
      };
    const projects = (db.projects || []).filter((p) => p.status !== "Archived" && projectFor(user, p.id));
    for (const p of projects)
      for (const ph of p.phases || []) {
        const mineTasks = (ph.tasks || []).filter(
          (t) =>
            user.role !== "supplier" ||
            (t.assignedSupplierId === user.supplierId && t.acceptanceStatus === "Accepted"),
        );
        // Suppliers see the phases they work in; customers see every phase.
        if (user.role !== "supplier" || mineTasks.length || ph.supplierId === user.supplierId) {
          add(
            `phase-start-${ph.id}`,
            ph.startDate,
            `Phase starts: ${ph.name}`,
            p.name,
            `/${user.role}/projects/${p.id}`,
          );
          add(
            `phase-due-${ph.id}`,
            ph.dueDate,
            `Phase due: ${ph.name}`,
            p.name,
            `/${user.role}/projects/${p.id}`,
          );
        }
        for (const t of mineTasks)
          if (t.status !== "Completed")
            add(
              `task-${t.id}`,
              t.dueDate,
              `Due: ${t.name}`,
              `${p.name} · ${ph.name}`,
              `/${user.role}/projects/${p.id}`,
            );
      }
    for (const b of db.bids || []) {
      if (!["Open", "Shortlist", "Second round", "Final round"].includes(b.status)) continue;
      const visible =
        user.role === "customer"
          ? !!projectFor(user, b.projectId)
          : user.role === "supplier" &&
            ((b.invitedSupplierIds || []).includes(user.supplierId) ||
              (b.offers || []).some((o) => o.supplierId === user.supplierId));
      if (visible)
        add(
          `bid-${b.id}`,
          b.dueDate,
          `Bid deadline: ${b.title}`,
          b.projectName || "",
          `/${user.role}/offers`,
        );
    }
    for (const c of db.contracts || []) {
      if (!contracts.canSee(user, c)) continue;
      const v = contracts.view(c);
      if (v.noticeBy && ["Active", "Expiring"].includes(v.state))
        add(
          `contract-notice-${c.id}`,
          v.noticeBy,
          `Contract notice deadline: ${c.title}`,
          v.supplierCompany,
          `/${user.role}/contracts`,
        );
    }
    for (const v of db.siteVisits || []) {
      if (v.status !== "Approved") continue;
      const site = (db.sites || []).find((s) => s.id === v.siteId);
      const visible =
        user.role === "supplier"
          ? v.supplierId === user.supplierId
          : user.role === "customer" && site?.customerId === user.id;
      if (visible)
        add(
          `visit-${v.id}`,
          v.date,
          `Site visit: ${site?.name || "Site"}`,
          (db.suppliers || []).find((s) => s.id === v.supplierId)?.company || "",
          `/${user.role}/${user.role === "supplier" ? "compliance" : "sites"}`,
          v.endDate && v.endDate > v.date ? nextDay(v.endDate) : null,
        );
    }
    return list;
  }

  function feed(user) {
    const stamp = now()
        .replace(/[-:]/g, "")
        .replace(/\.\d+Z$/, "Z"),
      lines = [
        "BEGIN:VCALENDAR",
        "VERSION:2.0",
        `PRODID:-//${BRAND.name}//Calendar feed//EN`,
        "CALSCALE:GREGORIAN",
        "METHOD:PUBLISH",
        `X-WR-CALNAME:${icsText(`${BRAND.name} – ${user.name || user.email}`)}`,
      ];
    for (const e of events(user))
      lines.push(
        "BEGIN:VEVENT",
        `UID:${e.uid}@craftcrew`,
        `DTSTAMP:${stamp}`,
        `DTSTART;VALUE=DATE:${ymd(e.day)}`,
        `DTEND;VALUE=DATE:${ymd(e.endDay || nextDay(e.day))}`,
        `SUMMARY:${icsText(e.summary)}`,
        ...(e.description ? [`DESCRIPTION:${icsText(e.description)}`] : []),
        `URL:${appUrl()}/#${e.link}`,
        "TRANSP:TRANSPARENT",
        "END:VEVENT",
      );
    lines.push("END:VCALENDAR");
    return lines.map(fold).join("\r\n") + "\r\n";
  }

  // GET /ics/<token>.ics — no session; the secret token is the key.
  function serveFeed(req, res, url) {
    const m = url.pathname.match(/^\/ics\/([A-Za-z0-9_-]{20,100})\.ics$/);
    if (!m || req.method !== "GET") return false;
    const db = getDb(),
      owner = (db.users || []).find((u) => u.icsTokenHash && u.icsTokenHash === hash(m[1])),
      user = owner && resolveUser(owner);
    if (!user) {
      res.writeHead(404, { "Content-Type": "text/plain; charset=utf-8" });
      res.end("Calendar not found");
      return true;
    }
    const body = Buffer.from(feed(user));
    res.writeHead(200, {
      "Content-Type": "text/calendar; charset=utf-8",
      "Content-Length": body.length,
      "Content-Disposition": 'inline; filename="craftcrew.ics"',
      "Cache-Control": "no-store",
      "X-Content-Type-Options": "nosniff",
    });
    res.end(body);
    return true;
  }

  // GET /api/calendar shows whether a link exists; POST creates a new one (the old one stops working);
  // DELETE switches the feed off. The link is shown once, right after it is created.
  async function handle(req, res, url, parts, user) {
    if (parts[1] !== "calendar" || parts[2]) return false;
    const account = getDb().users.find((u) => u.id === (user.self || user).id);
    if (!account) return false;
    if (req.method === "GET")
      return (
        send(res, 200, { active: !!account.icsTokenHash, createdAt: account.icsTokenCreatedAt || null }),
        true
      );
    if (req.method === "POST") {
      const token = crypto.randomBytes(24).toString("base64url");
      account.icsTokenHash = hash(token);
      account.icsTokenCreatedAt = now();
      save();
      return (
        send(res, 201, {
          active: true,
          createdAt: account.icsTokenCreatedAt,
          url: `${appUrl()}/ics/${token}.ics`,
        }),
        true
      );
    }
    if (req.method === "DELETE") {
      delete account.icsTokenHash;
      delete account.icsTokenCreatedAt;
      save();
      return (send(res, 200, { active: false }), true);
    }
    return false;
  }

  return { handle, serveFeed, events, feed };
};
