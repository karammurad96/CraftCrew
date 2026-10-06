// T262: a customer books a package into a project; the supplier confirms at the fixed price (or instant booking
// confirms for it); then the contract, the assigned task and the reveal follow. A decline brings alternatives.
const { describe, it, before, after } = require("node:test");
const assert = require("node:assert/strict");
const { mkdtempSync, rmSync } = require("node:fs");
const os = require("node:os");
const path = require("node:path");
const { startApp, vettedSupplier, projectWithTasks } = require("./helpers");

const PKG = {
  title: "Commissioning team, one week",
  description: "Two engineers commission one cell, with daily reports.",
  category: "Commissioning",
  teamSize: 2,
  days: 5,
  leadDays: 2,
  perWeek: 1,
  price: 9000,
};
function workingDaysAhead(n) {
  const d = new Date(new Date().toISOString().slice(0, 10) + "T00:00:00Z");
  while (n > 0) {
    d.setUTCDate(d.getUTCDate() + 1);
    if (d.getUTCDay() !== 0 && d.getUTCDay() !== 6) n--;
  }
  return d.toISOString().slice(0, 10);
}
const nextWeek = (day, weeks = 1) => {
  const d = new Date(day + "T00:00:00Z");
  d.setUTCDate(d.getUTCDate() - ((d.getUTCDay() + 6) % 7) + 7 * weeks);
  return d.toISOString().slice(0, 10);
};

describe("booking a package", () => {
  let app, dataDir, admin, customer, crew, other;
  const hash = async (token = customer) => (await app.call("GET", "/clause", undefined, token)).clause.hash;
  const publish = async (s, fields = {}) => {
    const p = (await app.call("POST", "/service-packages", { ...PKG, ...fields }, s.token)).package;
    assert.ok(p, "package created");
    await app.call("POST", `/service-packages/${p.id}/status`, { status: "Active" }, s.token);
    return p;
  };
  const book = async (pkg, body = {}) =>
    app.call(
      "POST",
      `/service-packages/${pkg.id}/book`,
      { startDate: workingDaysAhead(3), units: 1, sitePostcode: "93055", acceptClause: true, clauseHash: await hash(), ...body },
      customer,
    );

  before(async () => {
    dataDir = mkdtempSync(path.join(os.tmpdir(), "craftcrew-test-"));
    app = await startApp({ dataDir, env: { PLATFORM_MODE: "brokered", INSTANT_ESTIMATES: "on" } });
    admin = await app.login("admin@test.local", "Admin-Password-2026!");
    crew = await vettedSupplier(app, admin, "book.crew@test.local", "Crew Secret GmbH");
    other = await vettedSupplier(app, admin, "book.other@test.local", "Other Commissioning GmbH");
    await app.call("PUT", "/profile", { hourlyRate: 95, services: ["Commissioning"] }, other.token);
    await app.signup("customer", "book.customer@test.local", { company: "Booking Customer AG" });
    customer = await app.login("book.customer@test.local", "Test-Password-2026");
  });
  after(async () => {
    await app?.stop();
    rmSync(dataDir, { recursive: true, force: true });
  });

  it("refuses a booking that breaks a rule", async () => {
    const pkg = await publish(crew, { regions: "93, 94" });
    assert.equal((await book(pkg, { startDate: workingDaysAhead(1) })).code, "pkTooEarly");
    assert.equal((await book(pkg, { units: 11 })).code, "pkUnits");
    assert.equal((await book(pkg, { sitePostcode: "20095" })).code, "pkNotServed");
    assert.equal((await book(pkg, { acceptClause: false })).code, "acceptThePlatformContractTo");
    await app.call("POST", `/service-packages/${pkg.id}/status`, { status: "Archived" }, crew.token);
  });

  it("runs from the booking to a contract, an assigned task and the reveal, at the fixed price", async () => {
    const pkg = await publish(crew, { title: "Fixed price week", perWeek: 2 });
    const booked = await book(pkg, { units: 2, notes: "Gate 3, ask for Mr Weber" });
    assert.equal(booked.status, 201, booked.error);
    const r = booked.request;
    assert.equal(r.status, "Chosen");
    assert.ok(r.projectId, "a new project");
    assert.equal(r.packages[0].hours, 2 * 5 * 8 * 2);
    assert.equal(r.options[0].price, 18000);
    assert.ok(!JSON.stringify(r).includes("Crew Secret"));
    const { orders } = await app.call("GET", "/brokered-orders", undefined, crew.token);
    const order = orders.find((o) => o.requestId === r.id);
    assert.equal(order.fixed, true);
    assert.equal(order.amount, 18000);
    assert.equal(order.units, 2);
    const accept = (body) => app.call("POST", `/brokered-orders/${r.id}/accept`, body, crew.token);
    assert.equal((await accept({ acceptClause: true, clauseHash: await hash(crew.token), price: 20000, note: "More" })).code, "pkFixedPrice");
    const ok = await accept({ acceptClause: true, clauseHash: await hash(crew.token) });
    assert.equal(ok.status, 200, ok.error);
    const after = (await app.call("GET", `/requests/${r.id}`, undefined, customer)).request;
    assert.equal(after.status, "Contracted");
    assert.equal(after.supplier.company, "Crew Secret GmbH");
    const project = (await app.call("GET", `/projects/${r.projectId}`, undefined, customer)).project,
      task = project.phases.flatMap((ph) => ph.tasks).find((t) => t.id === r.taskId);
    assert.equal(task.assignedSupplierId, crew.supplierId);
    assert.equal(task.orderAmount, 18000);
    const contract = (await app.call("GET", "/contracts", undefined, customer)).contracts.find((c) => c.requestId === r.id);
    assert.equal(contract.value, 18000);
    const mine = (await app.call("GET", "/service-packages", undefined, crew.token)).packages.find((p) => p.id === pkg.id);
    assert.equal(mine.contracted, 1);
  });

  it("books into an existing project and refuses a full week", async () => {
    const pkg = await publish(crew, { title: "One slot a week", perWeek: 1 });
    const { project } = await projectWithTasks(app, customer);
    const start = nextWeek(workingDaysAhead(3), 2);
    const first = await book(pkg, { projectId: project.id, startDate: start });
    assert.equal(first.request.projectId, project.id);
    assert.equal((await book(pkg, { startDate: start })).code, "pkWeekFull");
    const shopView = (await app.call("GET", `/service-packages/${pkg.id}`, undefined, customer)).package;
    assert.ok(shopView.earliestStart <= start, "other weeks stay free");
  });

  it("confirms at once with instant booking, until the contract terms change", async () => {
    const refused = await app.call("POST", "/service-packages", { ...PKG, title: "Instant crew", instantBooking: true }, crew.token);
    assert.equal(refused.code, "pkInstantAccept");
    const p = (
      await app.call(
        "POST",
        "/service-packages",
        { ...PKG, title: "Instant crew", perWeek: 5, instantBooking: true, acceptClause: true, clauseHash: await hash(crew.token) },
        crew.token,
      )
    ).package;
    assert.equal(p.instantActive, true);
    await app.call("POST", `/service-packages/${p.id}/status`, { status: "Active" }, crew.token);
    assert.equal((await app.call("GET", `/service-packages/${p.id}`, undefined, customer)).package.instantBooking, true);
    const instant = await book(p);
    assert.equal(instant.request.status, "Contracted");
    const contract = (await app.call("GET", "/contracts", undefined, customer)).contracts.find((c) => c.requestId === instant.request.id);
    assert.equal(contract.acceptances.supplier.context, "instant-booking");
    // A new clause version: instant booking waits for the supplier's new acceptance
    await app.call("PUT", "/admin/clause", { text: "New clause text. ".repeat(5), months: 12 }, admin);
    const waiting = await book(p, { startDate: nextWeek(workingDaysAhead(3)) });
    assert.equal(waiting.request.status, "Chosen");
    const mine = (await app.call("GET", "/service-packages", undefined, crew.token)).packages.find((x) => x.id === p.id);
    assert.equal(mine.instantActive, false);
  });

  it("brings alternatives without the declining supplier", async () => {
    const pkg = await publish(crew, { title: "Declined week", perWeek: 5 });
    const r = (await book(pkg)).request;
    assert.equal((await app.call("POST", `/brokered-orders/${r.id}/decline`, {}, crew.token)).status, 200);
    const back = (await app.call("GET", `/requests/${r.id}`, undefined, customer)).request;
    assert.equal(back.status, "Options ready", "the instant estimate found an alternative");
    assert.ok(back.options.length >= 1);
    const adminView = (await app.call("GET", `/requests/${r.id}`, undefined, admin)).request;
    assert.ok(adminView.options.every((o) => o.parts.every((p) => p.supplierId !== crew.supplierId)));
    const notes = (await app.call("GET", "/notifications", undefined, customer)).notifications;
    assert.ok(notes.some((n) => /looking for alternatives/.test(n.text)));
  });
});
