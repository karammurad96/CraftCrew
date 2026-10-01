// T62: directory filters (certification, region, badge, availability) work together; the shortlist is private;
// one quote request reaches several suppliers with its attachments.
const { describe, it, before, after } = require("node:test");
const assert = require("node:assert/strict");
const { startApp, vettedSupplier, projectWithTasks } = require("./helpers");
const { geocode, distanceKm } = require("../geo");

describe("region lookup", () => {
  it("knows cities and German postcodes, and nothing else", () => {
    assert.deepEqual(geocode("München, Germany"), geocode("Munich"));
    assert.ok(distanceKm(geocode("93055"), geocode("Regensburg")) < 15);
    assert.ok(distanceKm(geocode("Munich"), geocode("Augsburg")) < 70);
    assert.equal(geocode("Atlantis"), null);
  });
});

describe("supplier directory", () => {
  let app, admin, customer, other, a, b, c;
  const ids = async (query) =>
    (await app.call("GET", "/suppliers?" + new URLSearchParams(query))).suppliers.map((s) => s.id).sort();
  before(async () => {
    app = await startApp();
    admin = await app.login("admin@test.local", "Admin-Password-2026!");
    customer = (await app.signup("customer", "buyer@test.local")).token;
    other = (await app.signup("customer", "other@test.local")).token;
    const make = async (email, company, profile) => {
      const s = await vettedSupplier(app, admin, email, company);
      const r = await app.call("PUT", "/profile", profile, s.token);
      assert.equal(r.status, 200, r.error);
      return s;
    };
    a = await make("a@test.local", "Alpha GmbH", {
      location: "Munich, Germany",
      certifications: ["ISO 9001", "TÜV"],
      availability: "Available",
    });
    b = await make("b@test.local", "Beta GmbH", {
      location: "Augsburg, Germany",
      certifications: ["ISO 9001"],
      availability: "Busy",
    });
    c = await make("c@test.local", "Gamma GmbH", {
      location: "Hamburg, Germany",
      certifications: ["ISO 9001", "TÜV"],
      availability: "Available",
    });
  });
  after(() => app.stop());

  it("combines certification, region and availability filters", async () => {
    assert.deepEqual(await ids({ certs: "ISO 9001,TÜV" }), [a.supplierId, c.supplierId].sort());
    assert.deepEqual(await ids({ near: "Munich", radius: 100 }), [a.supplierId, b.supplierId].sort());
    assert.deepEqual(await ids({ near: "80331", radius: 100, certs: "TÜV" }), [a.supplierId]);
    assert.deepEqual(await ids({ near: "Munich", radius: 100, available: "1" }), [a.supplierId]);
    assert.deepEqual(await ids({ certs: "ISO 9001", badge: "Gold" }), []);
    const unknown = await app.call("GET", "/suppliers?near=Atlantis");
    assert.deepEqual(unknown.suppliers, []);
    assert.equal(unknown.region.found, false);
  });

  it("does not publish the private company profile", async () => {
    const { supplier } = await app.call("GET", `/suppliers/${a.supplierId}`);
    assert.equal(supplier.companyProfile, undefined);
    assert.ok(!JSON.stringify(await app.call("GET", "/suppliers")).includes("DE123456789"));
  });

  it("keeps a private shortlist per customer", async () => {
    const r = await app.call(
      "PUT",
      "/shortlist",
      { supplierIds: [a.supplierId, b.supplierId, "sup_missing", a.supplierId] },
      customer,
    );
    assert.deepEqual(r.supplierIds, [a.supplierId, b.supplierId]);
    assert.deepEqual((await app.call("GET", "/shortlist", undefined, customer)).supplierIds, r.supplierIds);
    assert.deepEqual((await app.call("GET", "/shortlist", undefined, other)).supplierIds, []);
    assert.equal((await app.call("GET", "/shortlist", undefined, a.token)).status, 403);
    assert.equal((await app.call("PUT", "/shortlist", { supplierIds: "x" }, customer)).status, 400);
  });

  it("sends one quote request with a file to three suppliers", async () => {
    const { project, phase } = await projectWithTasks(app, customer);
    const up = await app.call(
      "POST",
      "/upload",
      {
        filename: "drawing.pdf",
        content: "data:application/pdf;base64," + Buffer.from("%PDF-1.4 drawing").toString("base64"),
      },
      customer,
    );
    assert.equal(up.status, 201, up.error);
    const fileUrl = up.file.url;
    const r = await app.call(
      "POST",
      "/bids",
      {
        projectId: project.id,
        phaseId: phase.id,
        taskId: phase.tasks[0].id,
        title: "Robot cell guarding",
        description: "Guarding for two robot cells",
        dueDate: new Date(Date.now() + 14 * 86400000).toISOString().slice(0, 10),
        invitedSupplierIds: [a.supplierId, b.supplierId, c.supplierId],
        attachments: [fileUrl],
      },
      customer,
    );
    assert.equal(r.status, 201, r.error);
    assert.equal(r.bid.invitedSupplierIds.length, 3);
    for (const s of [a, b, c]) {
      const { bids } = await app.call("GET", "/bids", undefined, s.token);
      assert.ok(
        bids.some((x) => x.id === r.bid.id),
        "each invited supplier sees the request",
      );
      const { notifications } = await app.call("GET", "/notifications", undefined, s.token);
      assert.ok(notifications.some((n) => /Robot cell guarding/.test(n.text)));
      const file = await fetch(app.base + fileUrl, { headers: { Authorization: "Bearer " + s.token } });
      assert.equal(file.status, 200, "invited suppliers can open the attachment");
    }
    const outsider = await vettedSupplier(app, admin, "d@test.local", "Delta GmbH");
    const denied = await fetch(app.base + fileUrl, { headers: { Authorization: "Bearer " + outsider.token } });
    assert.equal(denied.status, 404);
    const foreign = await app.call(
      "POST",
      "/bids",
      {
        projectId: project.id,
        phaseId: phase.id,
        taskId: phase.tasks[1].id,
        title: "Other",
        dueDate: "2030-01-01",
        attachments: ["/uploads/not-mine.pdf"],
      },
      customer,
    );
    assert.equal(foreign.status, 400);
  });
});
