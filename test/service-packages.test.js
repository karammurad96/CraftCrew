// T260: suppliers offer ready-made, fixed-price packages; only vetted suppliers publish them; admins can pause one.
const { describe, it, before, after } = require("node:test");
const assert = require("node:assert/strict");
const { mkdtempSync, rmSync } = require("node:fs");
const os = require("node:os");
const path = require("node:path");
const { startApp, vettedSupplier } = require("./helpers");

const PACKAGE = {
  title: "Commissioning team, one week on site",
  description: "Two engineers commission one cell, with daily reports.",
  category: "Commissioning",
  included: "2 commissioning engineers\nTravel and hotel\nDaily report",
  teamSize: 2,
  days: 5,
  leadDays: 5,
  perWeek: 2,
  price: 9800,
  regions: "93, 94",
  travelIncluded: true,
};

describe("service packages", () => {
  let app, dataDir, admin, vetted, fresh, customer;
  before(async () => {
    dataDir = mkdtempSync(path.join(os.tmpdir(), "craftcrew-test-"));
    app = await startApp({ dataDir });
    admin = await app.login("admin@test.local", "Admin-Password-2026!");
    vetted = await vettedSupplier(app, admin, "pk.vetted@test.local", "Vetted Crew GmbH");
    await app.signup("supplier", "pk.fresh@test.local", { company: "Fresh Crew GmbH" });
    fresh = await app.login("pk.fresh@test.local", "Test-Password-2026");
    await app.signup("customer", "pk.customer@test.local", { company: "Pk Customer AG" });
    customer = await app.login("pk.customer@test.local", "Test-Password-2026");
  });
  after(async () => {
    await app?.stop();
    rmSync(dataDir, { recursive: true, force: true });
  });

  it("checks every field and saves a new package as a draft", async () => {
    const bad = async (change, code) =>
      assert.equal(
        (await app.call("POST", "/service-packages", { ...PACKAGE, ...change }, vetted.token)).code,
        code,
        JSON.stringify(change),
      );
    await bad({ title: "" }, "pkGiveTitle");
    await bad({ category: "Juggling" }, "chooseACategoryFromThe");
    await bad({ teamSize: 0 }, "pkTeamSize");
    await bad({ days: 61 }, "pkDays");
    await bad({ leadDays: 1.5 }, "pkLeadDays");
    await bad({ price: 10 }, "pkPrice");
    await bad({ regions: "93a" }, "pkRegions");
    await bad({ radiusKm: -5 }, "pkRadius");
    const r = await app.call("POST", "/service-packages", PACKAGE, vetted.token);
    assert.equal(r.status, 201, r.error);
    assert.equal(r.package.status, "Draft");
    assert.deepEqual(r.package.included, ["2 commissioning engineers", "Travel and hotel", "Daily report"]);
    assert.deepEqual(r.package.regions, ["93", "94"]);
    assert.equal(r.package.supplierId, vetted.supplierId);
  });

  it("lets only a vetted supplier publish, and only the owner change a package", async () => {
    const draft = (await app.call("POST", "/service-packages", PACKAGE, fresh)).package;
    assert.ok(draft, "an unvetted supplier can prepare a draft");
    const refused = await app.call("POST", `/service-packages/${draft.id}/status`, { status: "Active" }, fresh);
    assert.equal(refused.code, "pkVettedFirst");
    const mine = (await app.call("POST", "/service-packages", PACKAGE, vetted.token)).package;
    assert.equal(
      (await app.call("PUT", `/service-packages/${mine.id}`, { ...PACKAGE, title: "Taken over" }, fresh)).status,
      404,
    );
    assert.equal((await app.call("GET", `/service-packages/${mine.id}`, undefined, fresh)).status, 404);
    const live = await app.call("POST", `/service-packages/${mine.id}/status`, { status: "Active" }, vetted.token);
    assert.equal(live.package.status, "Active");
    const changed = await app.call(
      "PUT",
      `/service-packages/${mine.id}`,
      { ...PACKAGE, price: 9500 },
      vetted.token,
    );
    assert.equal(changed.package.price, 9500);
    assert.equal((await app.call("POST", "/service-packages", PACKAGE, customer)).status, 404);
  });

  it("archives and deletes; an archived package can no longer change", async () => {
    const p = (await app.call("POST", "/service-packages", PACKAGE, vetted.token)).package;
    const archived = await app.call("POST", `/service-packages/${p.id}/status`, { status: "Archived" }, vetted.token);
    assert.equal(archived.package.status, "Archived");
    assert.equal((await app.call("PUT", `/service-packages/${p.id}`, PACKAGE, vetted.token)).code, "pkArchived");
    const q = (await app.call("POST", "/service-packages", PACKAGE, vetted.token)).package;
    assert.equal((await app.call("DELETE", `/service-packages/${q.id}`, undefined, vetted.token)).status, 200);
    assert.equal((await app.call("GET", `/service-packages/${q.id}`, undefined, vetted.token)).status, 404);
  });

  it("lets the admin pause a package with a reason the supplier sees", async () => {
    const p = (await app.call("POST", "/service-packages", PACKAGE, vetted.token)).package;
    await app.call("POST", `/service-packages/${p.id}/status`, { status: "Active" }, vetted.token);
    const all = (await app.call("GET", "/service-packages", undefined, admin)).packages;
    assert.equal(all.find((x) => x.id === p.id).company, "Vetted Crew GmbH");
    assert.equal(
      (await app.call("POST", `/service-packages/${p.id}/moderate`, { action: "pause" }, admin)).code,
      "pkPauseReason",
    );
    const paused = await app.call(
      "POST",
      `/service-packages/${p.id}/moderate`,
      { action: "pause", reason: "Price list does not match the profile" },
      admin,
    );
    assert.equal(paused.package.status, "Paused");
    assert.equal(
      (await app.call("POST", `/service-packages/${p.id}/status`, { status: "Active" }, vetted.token)).code,
      "pkPausedByPlatform",
    );
    const notes = (await app.call("GET", "/notifications", undefined, vetted.token)).notifications;
    assert.ok(notes.some((n) => n.text.includes("Price list does not match the profile")));
    await app.call("POST", `/service-packages/${p.id}/moderate`, { action: "release" }, admin);
    const again = await app.call("POST", `/service-packages/${p.id}/status`, { status: "Active" }, vetted.token);
    assert.equal(again.package.status, "Active");
  });
});
