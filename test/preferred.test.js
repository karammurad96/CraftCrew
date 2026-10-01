// T68: customers keep a private list of preferred suppliers with notes and tags, and invite suppliers who
// are not on CraftCrew yet; an approved invitee joins the inviting customer's list.
const { describe, it, before, after } = require("node:test");
const assert = require("node:assert/strict");
const { startApp, vettedSupplier } = require("./helpers");

describe("preferred suppliers", () => {
  let app, admin, mine, other, supplier;
  const NOTE = "Our go-to for PLC retrofits, ask for Jana";
  before(async () => {
    app = await startApp();
    admin = await app.login("admin@test.local", "Admin-Password-2026!");
    mine = (await app.signup("customer", "buyer@test.local")).token;
    other = (await app.signup("customer", "rival@test.local")).token;
    supplier = await vettedSupplier(app, admin, "crew@test.local", "Crew GmbH");
  });
  after(() => app.stop());

  it("keeps notes and tags on the customer's own list", async () => {
    const r = await app.call(
      "PUT",
      `/preferred-suppliers/${supplier.supplierId}`,
      { note: NOTE, tags: ["PLC", " Bavaria ", "PLC"] },
      mine,
    );
    assert.equal(r.status, 200, r.error);
    assert.deepEqual(
      r.suppliers.map((s) => [s.supplierId, s.company, s.note, s.tags]),
      [[supplier.supplierId, "Crew GmbH", NOTE, ["PLC", "Bavaria"]]],
    );
    const edited = await app.call(
      "PUT",
      `/preferred-suppliers/${supplier.supplierId}`,
      { tags: "PLC, Robots" },
      mine,
    );
    assert.deepEqual(edited.suppliers[0].tags, ["PLC", "Robots"]);
    assert.equal(edited.suppliers[0].note, NOTE, "unchanged fields stay");
    assert.equal((await app.call("PUT", "/preferred-suppliers/sup_missing", {}, mine)).status, 404);
  });

  it("never shows the list or notes to anyone else", async () => {
    assert.deepEqual((await app.call("GET", "/preferred-suppliers", undefined, other)).suppliers, []);
    assert.equal((await app.call("GET", "/preferred-suppliers", undefined, supplier.token)).status, 403);
    assert.equal(
      (await app.call("DELETE", `/preferred-suppliers/${supplier.supplierId}`, undefined, other)).status,
      200,
    );
    assert.equal(
      (await app.call("GET", "/preferred-suppliers", undefined, mine)).suppliers.length,
      1,
      "other's delete changed nothing",
    );
    for (const [path, token] of [
      ["/suppliers", undefined],
      [`/suppliers/${supplier.supplierId}`, undefined],
      ["/auth/me", mine],
      ["/admin/users", admin],
      [`/suppliers/${supplier.supplierId}/scorecard`, mine],
    ]) {
      const body = JSON.stringify(await app.call("GET", path, undefined, token));
      assert.ok(!body.includes("go-to for PLC"), `note leaked through ${path}`);
    }
  });

  it("invites a new supplier by email, who joins the list once approved", async () => {
    assert.equal(
      (await app.call("POST", "/preferred-suppliers/invite", { email: "x", company: "X" }, mine)).status,
      400,
    );
    const known = await app.call(
      "POST",
      "/preferred-suppliers/invite",
      { email: "crew@test.local", company: "Crew" },
      mine,
    );
    assert.equal(known.status, 409, "already on CraftCrew");
    const r = await app.call(
      "POST",
      "/preferred-suppliers/invite",
      {
        email: "Hofer@Example.com",
        company: "Hofer Elektro",
        note: "Did our 2024 shutdown",
        tags: ["Electrical"],
      },
      mine,
    );
    assert.equal(r.status, 201, r.error);
    assert.equal(r.invite.status, "Invited");
    assert.equal(r.invite.customerId, undefined);
    assert.equal(
      (
        await app.call(
          "POST",
          "/preferred-suppliers/invite",
          { email: "hofer@example.com", company: "Hofer" },
          mine,
        )
      ).status,
      409,
    );
    const { emails } = await app.call("GET", "/admin/outbox", undefined, admin);
    const mail = emails.find((m) => m.to === "hofer@example.com");
    assert.ok(mail, "an invitation email is queued");
    assert.match(
      mail.text || mail.body || JSON.stringify(mail),
      /#\/signup\?role=supplier&email=hofer%40example\.com/,
    );

    const joined = await vettedSupplier(app, admin, "hofer@example.com", "Hofer Elektro GmbH");
    const list = await app.call("GET", "/preferred-suppliers", undefined, mine);
    const entry = list.suppliers.find((s) => s.supplierId === joined.supplierId);
    assert.ok(entry, "the new supplier is on the inviting customer's list");
    assert.equal(entry.note, "Did our 2024 shutdown");
    assert.equal(list.invites[0].status, "Joined");
    assert.deepEqual((await app.call("GET", "/preferred-suppliers", undefined, other)).suppliers, []);
    const { notifications } = await app.call("GET", "/notifications", undefined, mine);
    assert.ok(
      notifications.some(
        (n) => n.text === "Hofer Elektro GmbH joined CraftCrew and is on your preferred suppliers list",
      ),
    );
  });
});
