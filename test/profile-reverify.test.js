// T86: once a supplier is live, a changed company name, an already-set legal invoicing detail, or an
// already-claimed certifications list waits for an admin to re-verify it before it shows anywhere.
const { describe, it, before, after } = require("node:test");
const assert = require("node:assert/strict");
const { startApp, vettedSupplier } = require("./helpers");

describe("re-verify profile changes", () => {
  let app, admin, customer, supplier;
  before(async () => {
    app = await startApp();
    admin = await app.login("admin@test.local", "Admin-Password-2026!");
    customer = (await app.signup("customer", "buyer@test.local")).token;
    supplier = await vettedSupplier(app, admin, "crew@test.local", "Crew Automation GmbH");
  });
  after(() => app.stop());

  it("applies the first completion of legal details and certifications right away", async () => {
    // vettedSupplier already filled in companyProfile once; starting from no certifications, the first
    // claim should apply immediately, not wait for re-verification.
    const r = await app.call("PUT", "/profile", { certifications: ["ISO 9001"] }, supplier.token);
    assert.equal(r.status, 200, r.error);
    assert.deepEqual(r.supplier.certifications, ["ISO 9001"]);
    assert.equal(r.supplier.pendingVerification, undefined);
  });

  it("holds a changed company name, legal detail or certification list for admin review", async () => {
    const r = await app.call(
      "PUT",
      "/profile",
      {
        company: "Crew Automation & Robotics GmbH",
        companyProfile: { legalName: "Crew Automation & Robotics GmbH" },
        certifications: ["ISO 9001", "ISO 13849"],
      },
      supplier.token,
    );
    assert.equal(r.status, 200, r.error);
    // Nothing public changed yet.
    assert.equal(r.supplier.company, "Crew Automation GmbH");
    assert.deepEqual(r.supplier.certifications, ["ISO 9001"]);
    assert.ok(r.supplier.pendingVerification);
    assert.equal(r.supplier.pendingVerification.status, "Pending");
    assert.equal(r.supplier.pendingVerification.company, "Crew Automation & Robotics GmbH");
    assert.deepEqual(r.supplier.pendingVerification.certifications, ["ISO 9001", "ISO 13849"]);
    assert.deepEqual(r.supplier.pendingVerification.companyProfile, {
      legalName: "Crew Automation & Robotics GmbH",
    });

    // Unrelated fields in the same request still apply right away.
    const put2 = await app.call(
      "PUT",
      "/profile",
      {
        hourlyRate: 155,
        availability: "Busy",
        companyProfile: { legalName: "Different Name GmbH", phone: "+49 170 1" },
      },
      supplier.token,
    );
    assert.equal(put2.supplier.hourlyRate, 155);
    assert.equal(put2.supplier.availability, "Busy");
    const own = await app.call("GET", "/profile", undefined, supplier.token);
    assert.equal(own.companyProfile.phone, "+49 170 1", "non-legal companyProfile field applies right away");
    assert.equal(
      own.companyProfile.legalName,
      "Crew Automation GmbH",
      "old legal name is kept until approved",
    );
    // Resubmitting a field replaces its proposed value; a field the second request didn't touch keeps
    // what the first request proposed, instead of being silently dropped.
    assert.equal(
      put2.supplier.pendingVerification.company,
      "Crew Automation & Robotics GmbH",
      "company proposal from the first request is kept",
    );
    assert.equal(
      put2.supplier.pendingVerification.companyProfile.legalName,
      "Different Name GmbH",
      "legal name proposal from the second request wins",
    );
    assert.deepEqual(
      put2.supplier.pendingVerification.certifications,
      ["ISO 9001", "ISO 13849"],
      "certifications proposal from the first request is kept",
    );
  });

  it("never shows the pending change publicly, and nothing else can see it", async () => {
    const pub = await app.call("GET", `/suppliers/${supplier.supplierId}`);
    assert.equal(pub.supplier.company, "Crew Automation GmbH");
    assert.equal(pub.supplier.pendingVerification, undefined);
    assert.ok(!JSON.stringify(pub).includes("pendingVerification"));
    const list = await app.call("GET", "/suppliers");
    assert.ok(!JSON.stringify(list).includes("pendingVerification"));
    const other = (await vettedSupplier(app, admin, "other@test.local", "Other GmbH")).token;
    assert.equal((await app.call("GET", "/admin/profile-changes", undefined, other)).status, 403);
    assert.equal((await app.call("GET", "/admin/profile-changes", undefined, customer)).status, 403);
  });

  it("lists the pending change for admins with the current and proposed values", async () => {
    const r = await app.call("GET", "/admin/profile-changes", undefined, admin);
    assert.equal(r.status, 200);
    const change = r.changes.find((c) => c.supplierId === supplier.supplierId);
    assert.ok(change);
    assert.equal(change.current.company, "Crew Automation GmbH");
    assert.equal(change.proposed.company, "Crew Automation & Robotics GmbH");
    assert.equal(change.proposed.companyProfile.legalName, "Different Name GmbH");
    assert.equal(
      (
        await app.call(
          "PATCH",
          `/admin/profile-changes/${supplier.supplierId}`,
          { action: "Approve" },
          customer,
        )
      ).status,
      403,
    );
  });

  it("rejects with a required reason, applying nothing and notifying the supplier", async () => {
    const noReason = await app.call(
      "PATCH",
      `/admin/profile-changes/${supplier.supplierId}`,
      { action: "Reject" },
      admin,
    );
    assert.equal(noReason.status, 400);
    const r = await app.call(
      "PATCH",
      `/admin/profile-changes/${supplier.supplierId}`,
      { action: "Reject", note: "Legal name must match the commercial register" },
      admin,
    );
    assert.equal(r.status, 200, r.error);
    const after = await app.call("GET", "/profile", undefined, supplier.token);
    assert.equal(after.supplier.company, "Crew Automation GmbH", "rejected change never applied");
    assert.equal(after.supplier.pendingVerification, undefined);
    const { notifications } = await app.call("GET", "/notifications", undefined, supplier.token);
    assert.ok(
      notifications.some((n) =>
        n.text.includes("Your profile change for Crew Automation GmbH was not approved. Reason:"),
      ),
    );
    assert.equal(
      (await app.call("GET", "/admin/profile-changes", undefined, admin)).changes.some(
        (c) => c.supplierId === supplier.supplierId,
      ),
      false,
    );
  });

  it("approving applies the change everywhere and notifies the supplier", async () => {
    const resubmit = await app.call(
      "PUT",
      "/profile",
      { company: "Crew Robotics GmbH", companyProfile: { legalName: "Crew Robotics GmbH" } },
      supplier.token,
    );
    assert.ok(resubmit.supplier.pendingVerification);
    const r = await app.call(
      "PATCH",
      `/admin/profile-changes/${supplier.supplierId}`,
      { action: "Approve" },
      admin,
    );
    assert.equal(r.status, 200, r.error);
    const pub = await app.call("GET", `/suppliers/${supplier.supplierId}`);
    assert.equal(pub.supplier.company, "Crew Robotics GmbH");
    const own = await app.call("GET", "/profile", undefined, supplier.token);
    assert.equal(own.companyProfile.legalName, "Crew Robotics GmbH");
    assert.equal(own.supplier.pendingVerification, undefined);
    const { notifications } = await app.call("GET", "/notifications", undefined, supplier.token);
    assert.ok(
      notifications.some(
        (n) => n.text === "Your profile change for Crew Robotics GmbH was approved and is now live",
      ),
    );
  });

  it("404s approving or rejecting a supplier with no pending change", async () => {
    const r = await app.call(
      "PATCH",
      `/admin/profile-changes/${supplier.supplierId}`,
      { action: "Approve" },
      admin,
    );
    assert.equal(r.status, 404);
  });
});
