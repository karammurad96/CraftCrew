// T66: personal iCalendar feeds with all-day events; a new link invalidates the old one.
const { describe, it, before, after } = require("node:test");
const assert = require("node:assert/strict");
const { startApp, vettedSupplier, projectWithTasks, assignAndAccept } = require("./helpers");
const createCalendar = require("../calendar");

// Unfolds continuation lines and returns the VEVENT blocks as {NAME: value} maps.
function parseIcs(text) {
  assert.ok(text.startsWith("BEGIN:VCALENDAR\r\n"), "starts with VCALENDAR and uses CRLF");
  assert.ok(text.trimEnd().endsWith("END:VCALENDAR"));
  for (const line of text.split("\r\n")) assert.ok(Buffer.byteLength(line) <= 75, `line too long: ${line}`);
  const lines = text.replace(/\r\n /g, "").split("\r\n"),
    events = [];
  let current = null;
  for (const line of lines) {
    if (line === "BEGIN:VEVENT") current = {};
    else if (line === "END:VEVENT") (events.push(current), (current = null));
    else if (current) {
      const i = line.indexOf(":");
      current[line.slice(0, i)] = line.slice(i + 1);
    }
  }
  return events;
}

describe("calendar feeds", () => {
  let app, admin, customer, supplier, project, phase, task;
  const inDays = (n) => new Date(Date.now() + n * 86400000).toISOString().slice(0, 10);
  const feed = async (url) => {
    const r = await fetch(url.replace(/^https?:\/\/[^/]+/, app.base));
    return { status: r.status, type: r.headers.get("content-type"), text: await r.text() };
  };
  before(async () => {
    app = await startApp();
    admin = await app.login("admin@test.local", "Admin-Password-2026!");
    customer = (await app.signup("customer", "buyer@test.local")).token;
    supplier = (await vettedSupplier(app, admin, "crew@test.local", "Crew GmbH")).token;
    ({ project, phase } = await projectWithTasks(app, customer, {
      tasks: [
        "Guarding, fencing; and cabling for robot cell 1 with a name long enough to fold",
        "Other work",
      ],
    }));
    task = await assignAndAccept(app, customer, supplier, project, phase.tasks[0]);
    const bid = await app.call(
      "POST",
      "/bids",
      {
        projectId: project.id,
        phaseId: phase.id,
        taskId: phase.tasks[1].id,
        title: "Paint shop quote",
        dueDate: inDays(5),
        invitedSupplierIds: [(await app.call("GET", "/profile", undefined, supplier)).supplier.id],
      },
      customer,
    );
    assert.equal(bid.status, 201, bid.error);
  });
  after(() => app.stop());

  it("gives the customer a feed with task, phase and bid dates as all-day events", async () => {
    assert.deepEqual((await app.call("GET", "/calendar", undefined, customer)).active, false);
    const link = await app.call("POST", "/calendar", undefined, customer);
    assert.equal(link.status, 201);
    assert.match(link.url, /\/ics\/[\w-]{20,}\.ics$/);
    const r = await feed(link.url);
    assert.equal(r.status, 200);
    assert.match(r.type, /^text\/calendar/);
    const events = parseIcs(r.text);
    for (const e of events) {
      assert.match(e.UID, /@craftcrew$/);
      assert.match(e["DTSTART;VALUE=DATE"], /^\d{8}$/);
      assert.ok(e["DTEND;VALUE=DATE"] > e["DTSTART;VALUE=DATE"], "all-day events end the next day");
      assert.ok(e.DTSTAMP && e.SUMMARY);
    }
    const summaries = events.map((e) => e.SUMMARY);
    assert.ok(summaries.includes(`Due: ${task.name.replace(/[,;]/g, "\\$&")}`), "escaped task name");
    assert.ok(summaries.includes("Due: Other work"));
    assert.ok(summaries.includes("Phase due: Phase 1"));
    assert.ok(summaries.includes("Bid deadline: Paint shop quote"));
    const due = events.find((e) => e.SUMMARY === "Due: Other work");
    assert.equal(due["DTSTART;VALUE=DATE"], phase.tasks[1].dueDate.replaceAll("-", ""));
  });

  it("shows a supplier only their own work and invitations", async () => {
    const link = await app.call("POST", "/calendar", undefined, supplier);
    const summaries = parseIcs((await feed(link.url)).text).map((e) => e.SUMMARY);
    assert.ok(summaries.some((s) => s.startsWith("Due: Guarding")));
    assert.ok(!summaries.includes("Due: Other work"), "not someone else's task");
    assert.ok(summaries.includes("Bid deadline: Paint shop quote"));
  });

  it("stops the old link when a new one is created, and can be switched off", async () => {
    const first = (await app.call("POST", "/calendar", undefined, customer)).url;
    const second = (await app.call("POST", "/calendar", undefined, customer)).url;
    assert.equal((await feed(first)).status, 404);
    assert.equal((await feed(second)).status, 200);
    const me = await app.call("GET", "/auth/me", undefined, customer);
    assert.equal(me.user.icsTokenHash, undefined, "the token hash never leaves the server");
    assert.equal((await app.call("DELETE", "/calendar", undefined, customer)).active, false);
    assert.equal((await feed(second)).status, 404);
    assert.equal((await fetch(app.base + "/ics/not-a-real-token-at-all-1234.ics")).status, 404);
  });
});

describe("calendar events from sites and contracts", () => {
  const db = {
    users: [],
    projects: [],
    bids: [],
    suppliers: [{ id: "sup_1", company: "Crew GmbH" }],
    sites: [{ id: "site_1", customerId: "u_c", name: "Plant Regensburg" }],
    siteVisits: [
      {
        id: "v1",
        siteId: "site_1",
        supplierId: "sup_1",
        status: "Approved",
        date: "2030-03-02",
        endDate: "2030-03-04",
      },
      {
        id: "v2",
        siteId: "site_1",
        supplierId: "sup_1",
        status: "Requested",
        date: "2030-03-09",
        endDate: "2030-03-09",
      },
    ],
    contracts: [
      { id: "c1", title: "Maintenance 2030", supplierId: "sup_1", customerId: "u_c", status: "Active" },
    ],
  };
  const cal = createCalendar({
    getDb: () => db,
    now: () => "2030-01-01T00:00:00.000Z",
    projectFor: () => null,
    contracts: {
      canSee: (u, c) => u.role === "customer" && c.customerId === u.id,
      view: () => ({ state: "Active", noticeBy: "2030-09-30", supplierCompany: "Crew GmbH" }),
    },
    appUrl: () => "https://craftcrew.example",
  });

  it("lists approved site visits over their days and contract notice deadlines", () => {
    const customer = cal.events({ id: "u_c", role: "customer" }),
      supplier = cal.events({ id: "u_s", role: "supplier", supplierId: "sup_1" });
    const visit = customer.find((e) => e.uid === "visit-v1");
    assert.equal(visit.day, "2030-03-02");
    assert.equal(visit.endDay, "2030-03-05", "a three-day visit ends after its last day");
    assert.ok(!customer.some((e) => e.uid === "visit-v2"), "requested visits are not in the calendar");
    assert.ok(customer.some((e) => e.uid === "contract-notice-c1" && e.day === "2030-09-30"));
    assert.ok(supplier.some((e) => e.uid === "visit-v1"));
    assert.ok(!supplier.some((e) => e.uid === "contract-notice-c1"));
    const ics = cal.feed({ id: "u_c", role: "customer", name: "Maya" });
    assert.match(ics, /DTSTART;VALUE=DATE:20300302\r\nDTEND;VALUE=DATE:20300305/);
  });
});
