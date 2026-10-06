// T261: customers browse the active packages of available suppliers, filtered and sorted; in brokered mode no
// company or contact detail leaves the server; the earliest start respects the lead time and the weekly limit.
const { describe, it, before, after } = require("node:test");
const assert = require("node:assert/strict");
const { mkdtempSync, rmSync } = require("node:fs");
const os = require("node:os");
const path = require("node:path");
const { startApp, vettedSupplier, editDb } = require("./helpers");

const BASE = {
  description: "A team on site with daily reports and a handover.",
  included: "Team\nDaily report",
  teamSize: 2,
  days: 5,
  leadDays: 1,
  perWeek: 1,
  travelIncluded: true,
};
// The working day n working days after today (UTC), as the server counts
function workingDaysAhead(n) {
  const d = new Date(new Date().toISOString().slice(0, 10) + "T00:00:00Z");
  while (n > 0) {
    d.setUTCDate(d.getUTCDate() + 1);
    if (d.getUTCDay() !== 0 && d.getUTCDay() !== 6) n--;
  }
  return d.toISOString().slice(0, 10);
}

describe("package shop", () => {
  let app, dataDir, admin, customer, munich, hamburg, ids;
  const shop = async (query = "") =>
    (await app.call("GET", "/service-packages" + (query ? "?" + query : ""), undefined, customer)).packages;
  const publish = async (s, fields) => {
    const p = (await app.call("POST", "/service-packages", { ...BASE, ...fields }, s.token)).package;
    assert.ok(p, "package created");
    await app.call("POST", `/service-packages/${p.id}/status`, { status: "Active" }, s.token);
    return p.id;
  };

  before(async () => {
    dataDir = mkdtempSync(path.join(os.tmpdir(), "craftcrew-test-"));
    app = await startApp({ dataDir, env: { PLATFORM_MODE: "brokered" } });
    admin = await app.login("admin@test.local", "Admin-Password-2026!");
    munich = await vettedSupplier(app, admin, "shop.munich@test.local", "Munich Secret Crew GmbH");
    hamburg = await vettedSupplier(app, admin, "shop.hamburg@test.local", "Hamburg Secret Crew GmbH");
    await app.call("PUT", "/profile", { location: "Munich, Germany", phone: "+49 89 123456" }, munich.token);
    await app.call("PUT", "/profile", { location: "Hamburg, Germany" }, hamburg.token);
    await app.signup("customer", "shop.customer@test.local", { company: "Shop Customer AG" });
    customer = await app.login("shop.customer@test.local", "Test-Password-2026");
    ids = {
      plc: await publish(munich, { title: "PLC programmer next day", category: "PLC Programming", price: 4200, regions: "80, 81, 93" }),
      com: await publish(munich, { title: "Commissioning week", category: "Commissioning", price: 9800, leadDays: 10, radiusKm: 200 }),
      north: await publish(hamburg, { title: "Northern commissioning crew", category: "Commissioning", price: 7600, leadDays: 3, radiusKm: 150 }),
    };
    // A draft is never shown
    await app.call("POST", "/service-packages", { ...BASE, title: "Draft only", category: "Commissioning", price: 100 }, hamburg.token);
  });
  after(async () => {
    await app?.stop();
    rmSync(dataDir, { recursive: true, force: true });
  });

  it("shows active packages anonymised in brokered mode", async () => {
    const list = await shop();
    assert.deepEqual(list.map((p) => p.title).sort(), ["Commissioning week", "Northern commissioning crew", "PLC programmer next day"]);
    const raw = JSON.stringify(list);
    for (const secret of ["Munich Secret", "Hamburg Secret", "shop.munich", "123456", munich.supplierId])
      assert.ok(!raw.includes(secret), secret);
    assert.equal(list[0].profile.badge, "Silver");
    assert.equal((await app.call("GET", `/service-packages/${ids.plc}`, undefined, customer)).package.title, "PLC programmer next day");
  });

  it("filters by category, postcode, price, text and start, and sorts", async () => {
    assert.deepEqual((await shop("category=PLC%20Programming")).map((p) => p.id), [ids.plc]);
    // Regensburg: the PLC package lists region 93; the Munich radius (about 105 km) reaches it, Hamburg's does not
    assert.deepEqual((await shop("postcode=93055")).map((p) => p.id).sort(), [ids.plc, ids.com].sort());
    assert.deepEqual((await shop("postcode=20095")).map((p) => p.id), [ids.north]);
    assert.deepEqual((await shop("maxPrice=8000")).map((p) => p.id).sort(), [ids.plc, ids.north].sort());
    assert.deepEqual((await shop("q=northern")).map((p) => p.id), [ids.north]);
    assert.deepEqual((await shop("start=next")).map((p) => p.id), [ids.plc]);
    assert.deepEqual((await shop("start=week")).map((p) => p.id).sort(), [ids.plc, ids.north].sort());
    assert.deepEqual((await shop("sort=price")).map((p) => p.price), [4200, 7600, 9800]);
    assert.deepEqual((await shop()).map((p) => p.id), [ids.plc, ids.north, ids.com], "earliest start first");
  });

  it("moves the earliest start to the next week when the week is full", async () => {
    const first = (await shop()).find((p) => p.id === ids.plc).earliestStart;
    assert.equal(first, workingDaysAhead(1));
    await app.stop();
    await editDb(dataDir, (data) => {
      data.requests ||= [];
      data.requests.push({ id: "req_full", servicePackageId: ids.plc, status: "Chosen", startDate: first, customerId: "x" });
    });
    app = await startApp({ dataDir, env: { PLATFORM_MODE: "brokered" } });
    customer = await app.login("shop.customer@test.local", "Test-Password-2026");
    const later = (await shop()).find((p) => p.id === ids.plc).earliestStart,
      monday = new Date(first + "T00:00:00Z");
    monday.setUTCDate(monday.getUTCDate() - ((monday.getUTCDay() + 6) % 7) + 7);
    assert.equal(later, monday.toISOString().slice(0, 10));
  });

  it("hides busy suppliers and paused packages, and names the company in marketplace mode", async () => {
    await app.call("PUT", "/profile", { availability: "Busy" }, hamburg.token);
    assert.ok(!(await shop()).some((p) => p.id === ids.north));
    assert.equal((await app.call("GET", `/service-packages/${ids.north}`, undefined, customer)).status, 404);
    await app.call("PUT", "/profile", { availability: "Available" }, hamburg.token);
    await app.call("POST", `/service-packages/${ids.com}/status`, { status: "Paused" }, munich.token);
    assert.ok(!(await shop()).some((p) => p.id === ids.com));
    admin = await app.login("admin@test.local", "Admin-Password-2026!");
    await app.call("PUT", "/admin/platform-mode", { mode: "marketplace" }, admin);
    const plc = (await shop()).find((p) => p.id === ids.plc);
    assert.equal(plc.company, "Munich Secret Crew GmbH");
    await app.call("PUT", "/admin/platform-mode", { mode: "brokered" }, admin);
  });
});
