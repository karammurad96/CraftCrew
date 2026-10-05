// T227: the non-circumvention clause. A shipped draft (version 0), new versions only when the text changes,
// acceptances that keep their version and hash, a protection period of at most 24 months, admin-only changes.
const { describe, it, before, after } = require("node:test");
const assert = require("node:assert/strict");
const crypto = require("node:crypto");
const { startApp } = require("./helpers");

describe("non-circumvention clause", () => {
  let app, admin, customer;
  const sha = (text) => crypto.createHash("sha256").update(text, "utf8").digest("hex");
  before(async () => {
    app = await startApp({ env: { PLATFORM_MODE: "brokered" } });
    admin = await app.login("admin@test.local", "Admin-Password-2026!");
    await app.signup("customer", "clause.customer@test.local");
    customer = await app.login("clause.customer@test.local", "Test-Password-2026");
  });
  after(() => app?.stop());

  it("ships a draft that is shown to signed-in users and in the public config", async () => {
    const { clause } = await app.call("GET", "/clause", undefined, customer);
    assert.equal(clause.version, 0);
    assert.equal(clause.draft, true);
    assert.equal(clause.months, 12);
    assert.match(clause.text, /^Umgehungsschutz\./);
    assert.equal(clause.hash, sha(clause.text));
    assert.equal((await app.call("GET", "/platform-config")).clause.hash, clause.hash);
    assert.equal((await app.call("GET", "/clause")).status, 401);
  });

  it("checks and versions an admin's change, and only an admin's", async () => {
    const put = (body, token = admin) => app.call("PUT", "/admin/clause", body, token);
    const text = "Umgehungsschutz (geprüft). " + "Kunde und Auftragnehmer vereinbaren ".repeat(3);
    assert.equal((await put({ text, months: 12 }, customer)).status, 403);
    assert.equal((await put({ text: "kurz", months: 12 })).code, "enterTheClauseText50");
    assert.equal((await put({ text, months: 36 })).code, "theProtectionPeriodMustBe");
    assert.equal((await put({ text, months: 12, penaltyCap: -1 })).code, "enterThePenaltyCapIn");
    const first = await put({ text, months: 18, penaltyCap: 5000 });
    assert.equal(first.status, 200);
    assert.equal(first.clause.version, 1);
    assert.equal(first.clause.draft, false);
    assert.equal(first.clause.hash, sha(text.trim()));
    // The same text again changes only the settings, not the version
    const same = await put({ text, months: 24 });
    assert.equal(same.clause.version, 1);
    assert.equal(same.clause.months, 24);
    assert.equal((await put({ text: text + " Ergänzt.", months: 24 })).clause.version, 2);
    assert.equal((await app.call("GET", "/admin/clause", undefined, admin)).versions.length, 2);
  });

  it("records the accepted version at sign-up; earlier acceptances keep theirs", async () => {
    await app.signup("supplier", "clause.supplier@test.local");
    // The account's data export shows the stored acceptance
    const exported = await (
      await fetch(app.base + "/api/account/export", { headers: { Authorization: "Bearer " + customer } })
    ).json();
    const early = exported.account.clauseAcceptances;
    assert.equal(early.length, 1);
    assert.equal(early[0].version, 0, "the customer signed up under the draft");
    assert.equal(early[0].context, "signup");
    const supplier = await app.login("clause.supplier@test.local", "Test-Password-2026");
    const late = (
      await (
        await fetch(app.base + "/api/account/export", { headers: { Authorization: "Bearer " + supplier } })
      ).json()
    ).account.clauseAcceptances;
    assert.equal(late[0].version, 2);
  });

  it("lists introductions for admins only", async () => {
    assert.equal((await app.call("GET", "/admin/introductions", undefined, customer)).status, 403);
    assert.deepEqual((await app.call("GET", "/admin/introductions", undefined, admin)).introductions, []);
  });
});
