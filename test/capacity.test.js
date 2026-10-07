// T245: the capacity calendar. A full week leaves a supplier out of the estimate, half-free weeks stretch the time,
// blocked days from an imported iCal feed count, the free crew-days feed T244's rules, and the supplier's calendar
// feed carries its bookings.
const { describe, it, before, after } = require("node:test");
const assert = require("node:assert/strict");
const http = require("node:http");
const capacity = require("../capacity");
const { startApp, vettedSupplier } = require("./helpers");

// 2 November 2026 is a Monday
const MON = "2026-11-02",
  FRI = "2026-11-06";
const supplier = (extra = {}) => ({
  id: "s1",
  company: "S1",
  live: true,
  services: ["Welding"],
  location: "Regensburg",
  rating: 4.5,
  serviceCatalog: [{ name: "MIG", category: "Welding", unit: "hour", rate: 100 }],
  ...extra,
});
const task = (over = {}) => ({ id: "t1", name: "Frame", assignedSupplierId: "s1", status: "In Progress", startDate: MON, dueDate: FRI, ...over });
const world = (s, tasks = []) => ({
  suppliers: [s],
  projects: [{ name: "P", phases: [{ tasks }] }],
  invoices: [],
  bids: [],
  applications: [],
  requests: [],
});
const engine = (db) => require("../estimate")({ getDb: () => db, scorecard: () => null });
const request = (hours, over = {}) => ({
  customerId: "c1",
  sitePostcode: "93055",
  startDate: MON,
  dueDate: FRI,
  packages: [{ id: "p0", category: "Welding", hours }],
  ...over,
});
const part = (db, req) => engine(db).build(req).options[0]?.parts[0];

describe("capacity in the estimate", () => {
  it("keeps the open-task rule without a capacity", () => {
    const db = world(supplier(), [task({ id: "a" }), task({ id: "b" }), task({ id: "c" })]);
    assert.equal(engine(db).build(request(8)).options.length, 0, "three open tasks: not available");
    assert.ok(part(world(supplier()), request(8)));
  });

  it("leaves out a supplier whose week is full", () => {
    // 5 crew-days a week, one booked every day (40 hours over the week)
    const db = world(supplier({ capacity: { crewDaysPerWeek: 5 } }), [task({ estimatedHours: 40 })]);
    assert.equal(capacity.freeCrewDays(db, "s1", undefined, MON, FRI), 0);
    assert.equal(engine(db).build(request(8)).options.length, 0);
    // more than three open tasks no longer matter when there is room
    const roomy = world(supplier({ capacity: { crewDaysPerWeek: 50 } }), ["a", "b", "c"].map((id) => task({ id, estimatedHours: 8 })));
    assert.ok(part(roomy, request(8)));
  });

  it("stretches the time over half-free weeks", () => {
    const free = world(supplier({ capacity: { crewDaysPerWeek: 10 } })),
      half = world(supplier({ capacity: { crewDaysPerWeek: 10 } }), [task({ estimatedHours: 40 })]);
    // 16 hours = 2 crew-days: one day at 2 crew-days free, two days at 1 crew-day free; plus 2 days to start
    assert.equal(part(free, request(16)).days, 1 + 2);
    assert.equal(part(half, request(16)).days, 2 + 2);
    assert.equal(capacity.freeCrewDays(half, "s1", undefined, MON, FRI), 5);
    // not finished within the period: no candidate
    assert.equal(engine(half).build(request(48)).options.length, 0);
  });

  it("counts blocked days, own and from an imported feed", () => {
    const own = world(supplier({ capacity: { crewDaysPerWeek: 10, blocked: [{ id: "b", from: MON, to: "2026-11-03" }] } })),
      feed = world(supplier({ capacity: { crewDaysPerWeek: 10, feeds: [{ url: "x", days: [MON, "2026-11-03"] }] } }));
    for (const db of [own, feed]) {
      assert.equal(capacity.freeCrewDays(db, "s1", undefined, MON, FRI), 6);
      assert.equal(part(db, request(16)).days, 3 + 2, "Wednesday is the first free day");
    }
  });

  it("books by estimated hours, and per category only the matching tasks", () => {
    const db = world(supplier({ capacity: { crewDaysPerWeek: 5, perCategory: { Painting: 10 } } }), [task({ estimatedHours: 20 })]);
    assert.equal(capacity.freeCrewDays(db, "s1", "Welding", MON, FRI), 2.5);
    db.requests = [{ packages: [{ taskId: "t1", category: "Welding" }] }];
    assert.equal(capacity.freeCrewDays(db, "s1", "Painting", MON, FRI), 10, "10 a week for painting; the welding task does not count against it");
  });

  it("gives the schedule and the weeks", () => {
    const db = world(supplier({ capacity: { crewDaysPerWeek: 5 } }), [task({ estimatedHours: 20 })]);
    const s = capacity.schedule(db, db.suppliers[0], undefined, MON, 8, null);
    assert.deepEqual([s.finished, s.workdays, s.end], [true, 2, "2026-11-03"]);
    const w = capacity.weeks(db, db.suppliers[0], undefined, 2, Date.parse(MON + "T10:00:00Z"));
    assert.deepEqual(w[0], { week: MON, capacity: 5, booked: 2.5, blocked: 0, free: 2.5 });
    assert.equal(w[1].free, 5);
  });
});

describe("iCal import", () => {
  const ics = (events) => `BEGIN:VCALENDAR\r\nVERSION:2.0\r\n${events}END:VCALENDAR\r\n`;
  it("reads all-day and timed events, and skips transparent and cancelled ones", () => {
    const text = ics(
      "BEGIN:VEVENT\r\nDTSTART;VALUE=DATE:20261102\r\nDTEND;VALUE=DATE:20261104\r\nSUMMARY:Holiday\r\nEND:VEVENT\r\n" +
        "BEGIN:VEVENT\r\nDTSTART:20261110T080000Z\r\nDTEND:20261110T160000Z\r\nEND:VEVENT\r\n" +
        "BEGIN:VEVENT\r\nDTSTART:20261112T230000Z\r\nDTEND:20261113T000000Z\r\nEND:VEVENT\r\n" +
        "BEGIN:VEVENT\r\nDTSTART;VALUE=DATE:20261120\r\nTRANSP:TRANSPARENT\r\nEND:VEVENT\r\n" +
        "BEGIN:VEVENT\r\nDTSTART;VALUE=DATE:20261121\r\nSTATUS:CANCELLED\r\nEND:VEVENT\r\n",
    );
    assert.deepEqual(capacity.parseBlockedDays(text, Date.parse("2026-10-01")), ["2026-11-02", "2026-11-03", "2026-11-10", "2026-11-12"]);
  });
  it("refuses addresses of the machine's own network", () => {
    for (const ip of ["127.0.0.1", "10.0.0.5", "192.168.1.1", "172.16.0.1", "169.254.169.254", "::1", "fd00::1"])
      assert.equal(capacity.privateAddress(ip), true, ip);
    assert.equal(capacity.privateAddress("93.184.216.34"), false);
  });
});

describe("capacity API and the calendar feed", () => {
  let app, admin, sup, feedServer, feedUrl, customer;
  before(async () => {
    feedServer = http.createServer((req, res) => {
      res.writeHead(200, { "Content-Type": "text/calendar" });
      res.end("BEGIN:VCALENDAR\r\nBEGIN:VEVENT\r\nDTSTART;VALUE=DATE:20261224\r\nDTEND;VALUE=DATE:20261227\r\nEND:VEVENT\r\nEND:VCALENDAR\r\n");
    });
    await new Promise((r) => feedServer.listen(0, "127.0.0.1", r));
    feedUrl = `http://127.0.0.1:${feedServer.address().port}/blocked.ics`;
    app = await startApp({ env: { PLATFORM_MODE: "brokered", ICAL_ALLOW_LOCAL: "1" } });
    admin = await app.login("admin@test.local", "Admin-Password-2026!");
    sup = await vettedSupplier(app, admin, "cap.sup@test.local", "Cap GmbH");
    await app.signup("customer", "cap.customer@test.local");
    customer = await app.login("cap.customer@test.local", "Test-Password-2026");
  });
  after(async () => {
    await app?.stop();
    feedServer?.close();
  });

  it("saves the capacity, blocked days and a feed, and shows the weeks", async () => {
    assert.equal((await app.call("PUT", "/capacity", { crewDaysPerWeek: 10 }, customer)).status, 403);
    assert.equal((await app.call("PUT", "/capacity", { crewDaysPerWeek: -1 }, sup.token)).status, 400);
    assert.equal((await app.call("PUT", "/capacity", { crewDaysPerWeek: 10, blocked: [{ from: "2026-12-05", to: "2026-12-01" }] }, sup.token)).status, 400);
    const r = await app.call(
      "PUT",
      "/capacity",
      { crewDaysPerWeek: 10, perCategory: { Welding: 4 }, blocked: [{ from: "2026-12-07", to: "2026-12-08", note: "Training" }], feeds: [feedUrl] },
      sup.token,
    );
    assert.equal(r.status, 200, r.error);
    assert.equal(r.crewDaysPerWeek, 10);
    assert.equal(r.perCategory.Welding, 4);
    assert.equal(r.feeds[0].days, 3, "the feed's three days were imported");
    assert.equal(r.feeds[0].error, null);
    assert.equal(r.weeks.length, 12);
    const again = await app.call("POST", "/capacity/refresh", {}, sup.token);
    assert.equal(again.feeds[0].days, 3);
  });

  it("refuses feeds on the machine's own network when not allowed", async () => {
    const real = process.env.ICAL_ALLOW_LOCAL;
    delete process.env.ICAL_ALLOW_LOCAL;
    try {
      await assert.rejects(capacity.fetchFeed("https://127.0.0.1/x.ics"), /not allowed|ECONN|EPROTO|socket|ssl/i);
      await assert.rejects(capacity.fetchFeed("http://example.com/x.ics"), /https/);
    } finally {
      if (real !== undefined) process.env.ICAL_ALLOW_LOCAL = real;
    }
  });

  it("exports the bookings and blocked days in the supplier's calendar feed", async () => {
    const created = await app.call("POST", "/calendar", {}, sup.token);
    assert.equal(created.status, 201);
    const res = await fetch(created.url.replace(/^https?:\/\/[^/]+/, app.base || `http://127.0.0.1:${app.port}`));
    const text = await res.text();
    assert.match(text, /BEGIN:VCALENDAR/);
    assert.match(text, /SUMMARY:Blocked: Training/);
    assert.match(text, /DTSTART;VALUE=DATE:20261207\r\nDTEND;VALUE=DATE:20261209/);
    assert.match(text, /TRANSP:OPAQUE/);
  });
});
