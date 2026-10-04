// Supplier profile validation and a directory search that bad old data cannot crash.
const { describe, it, before, after } = require("node:test");
const assert = require("node:assert/strict");
const { mkdtempSync, rmSync } = require("node:fs");
const { tmpdir } = require("node:os");
const path = require("node:path");
const { startApp, vettedSupplier, editDb } = require("./helpers");

const ADMIN = ["admin@test.local", "Admin-Password-2026!"];

describe("supplier profile validation", () => {
  let app, supplier;
  before(async () => {
    app = await startApp();
    const admin = await app.login(...ADMIN);
    supplier = (await vettedSupplier(app, admin, "crew@test.local", "Crew Automation GmbH")).token;
  });
  after(() => app.stop());

  const put = (body) => app.call("PUT", "/profile", body, supplier);

  it("rejects a service that is not text and changes nothing", async () => {
    const r = await put({ services: ["PLC programming", 123] });
    assert.equal(r.status, 400);
    assert.match(r.error, /Services/);
    const { supplier: s } = await app.call("GET", "/profile", undefined, supplier);
    assert.deepEqual(s.services, ["PLC programming", "Commissioning"]);
  });
  it("rejects an unknown availability", async () => {
    const r = await put({ availability: "Maybe" });
    assert.equal(r.status, 400);
    assert.match(r.error, /Availability/);
  });
  it("rejects negative rates, invalid catalog units and malformed team members", async () => {
    assert.equal((await put({ hourlyRate: -5 })).status, 400);
    assert.equal((await put({ serviceCatalog: [{ name: "Welding", rate: 90, unit: "moon" }] })).status, 400);
    assert.equal(
      (await put({ serviceCatalog: [{ name: "Welding", rate: "abc", unit: "hour" }] })).status,
      400,
    );
    assert.equal((await put({ teamMembers: [{ role: "Lead" }] })).status, 400, "name required");
    assert.equal((await put({ teamMembers: [{ name: { x: 1 } }] })).status, 400, "name must be text");
    assert.equal(
      (
        await put({
          certifications: Array(31)
            .fill("ISO")
            .map((x, i) => x + i),
        })
      ).status,
      400,
    );
  });
  it("saves valid data and normalises units and rates", async () => {
    const r = await put({
      availability: "Busy",
      hourlyRate: "120",
      certifications: ["ISO 9001", " ISO 9001 "],
      teamMembers: [{ name: "Marta Keller", role: "Lead", experience: "12 years" }],
      serviceCatalog: [{ name: "PLC programming", rate: "148", unit: "Hours", capacity: "2 teams" }],
    });
    assert.equal(r.status, 200, r.error);
    assert.equal(r.supplier.availability, "Busy");
    assert.equal(r.supplier.hourlyRate, 120);
    assert.deepEqual(r.supplier.certifications, ["ISO 9001"]);
    assert.equal(r.supplier.serviceCatalog[0].unit, "hour");
    assert.equal(r.supplier.serviceCatalog[0].rate, 148);
  });
});

describe("directory search with bad stored data", () => {
  let dir;
  before(() => {
    dir = mkdtempSync(path.join(tmpdir(), "craftcrew-test-"));
  });
  after(() => rmSync(dir, { recursive: true, force: true }));

  it("keeps working when an old supplier record contains a number", async () => {
    let app = await startApp({ dataDir: dir });
    const admin = await app.login(...ADMIN);
    const { supplierId } = await vettedSupplier(app, admin, "old@test.local", "Old Data GmbH");
    await app.stop();
    await editDb(dir, (db) => db.suppliers.find((s) => s.id === supplierId).services.push(123));
    app = await startApp({ dataDir: dir });
    try {
      const viewer = await app.login(...ADMIN);
      const r = await app.call("GET", "/suppliers?q=zzzz", undefined, viewer);
      assert.equal(r.status, 200);
      const hit = await app.call("GET", "/suppliers?q=commissioning", undefined, viewer);
      assert.ok(hit.suppliers.some((s) => s.id === supplierId));
      assert.ok(hit.suppliers.find((s) => s.id === supplierId).services.every((x) => typeof x === "string"));
    } finally {
      await app.stop();
    }
  });
});
