// Public supplier applications store only known fields and cannot take over other accounts.
const { describe, it, before, after } = require("node:test");
const assert = require("node:assert/strict");
const { startApp } = require("./helpers");

const CHECKS = {
  registration: "Passed",
  vat: "Passed",
  insurance: "Passed",
  certifications: "Passed",
  references: "Passed",
  sanctions: "Passed",
};
const form = (email, extra = {}) => ({
  company: "Apply GmbH",
  email,
  phone: "1",
  yearsInBusiness: 5,
  portfolio: "Robot cells",
  referenceName: "Ref",
  referenceEmail: "ref@test.local",
  services: ["Commissioning"],
  ...extra,
});

describe("supplier applications", () => {
  let app, admin;
  // Each application comes from its own address so the per-network rate limit does not interfere.
  let ip = 0;
  const apply = async (body, token) => {
    const r = await fetch(app.base + "/api/applications", {
      method: "POST",
      headers: {
        "Content-Type": "application/json",
        "X-Forwarded-For": `10.0.0.${++ip}`,
        ...(token ? { Authorization: "Bearer " + token } : {}),
      },
      body: JSON.stringify(body),
    });
    return { ...(await r.json()), status: r.status };
  };
  const stored = async (id) =>
    (await app.call("GET", "/admin/applications", undefined, admin)).applications.find((x) => x.id === id);
  before(async () => {
    app = await startApp({ env: { TRUST_PROXY: "1" } });
    admin = await app.login("admin@test.local", "Admin-Password-2026!");
  });
  after(() => app.stop());

  it("ignores client-chosen id, badge and status and replies with id and status only", async () => {
    const r = await apply(
      form("new@test.local", { id: "app_x", badge: "Gold", status: "Approved", role: "admin" }),
    );
    assert.equal(r.status, 201, r.error);
    assert.notEqual(r.application.id, "app_x");
    assert.deepEqual(Object.keys(r.application).sort(), ["id", "status"]);
    const a = await stored(r.application.id);
    assert.equal(a.status, "New");
    assert.equal(a.badge, undefined);
    assert.equal(a.badgeDecision, undefined);
    assert.equal(a.role, undefined);
  });

  it("links an application to a supplier account only for that signed-in supplier", async () => {
    const s = await app.signup("supplier", "owner@test.local", { company: "Owner GmbH" });
    const anon = await apply(form("owner@test.local"));
    assert.equal(anon.status, 201, anon.error);
    assert.equal((await stored(anon.application.id)).supplierId, null);
    const signedIn = await apply(form("Owner@Test.local"), s.token);
    assert.equal(signedIn.status, 201, signedIn.error);
    const a = await stored(signedIn.application.id);
    assert.equal(a.email, "owner@test.local");
    assert.equal(a.supplierId, s.user.supplierId);
  });

  it("refuses to approve an application that uses a customer's email", async () => {
    const c = await app.signup("customer", "buyer@test.local");
    const r = await apply(form("buyer@test.local"));
    assert.equal(r.status, 201, r.error);
    const approve = await app.call(
      "PATCH",
      `/admin/applications/${r.application.id}`,
      { status: "Approved", badge: "Gold", verification: { checks: CHECKS, riskLevel: "Low" } },
      admin,
    );
    assert.equal(approve.status, 409);
    assert.match(approve.error, /customer or admin account/);
    assert.equal((await stored(r.application.id)).status, "New");
    assert.equal((await app.call("GET", "/profile", undefined, c.token)).user.role, "customer");
  });

  it("approves with the admin's badge decision and keeps the supplier's account", async () => {
    const s = await app.signup("supplier", "crew@test.local", { company: "Crew GmbH" });
    const r = await apply(form("crew@test.local"), s.token);
    const approve = await app.call(
      "PATCH",
      `/admin/applications/${r.application.id}`,
      { status: "Approved", badge: "Silver", verification: { checks: CHECKS, riskLevel: "Low" } },
      admin,
    );
    assert.equal(approve.status, 200, approve.error);
    const { supplier } = await app.call("GET", "/profile", undefined, s.token);
    assert.equal(supplier.id, s.user.supplierId);
    assert.equal(supplier.badge, "Silver");
    assert.equal(supplier.live, true);
  });

  it("rejects invalid emails and bad values", async () => {
    assert.equal((await apply(form("not-an-email"))).status, 400);
    assert.equal((await apply(form("ok@test.local", { referenceEmail: "nope" }))).status, 400);
    assert.equal((await apply(form("ok@test.local", { yearsInBusiness: -3 }))).status, 400);
  });
});
