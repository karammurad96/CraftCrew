// T271: supplier payout accounts. The platform creates the supplier's connected account with Accounts v2 (never
// `type`), makes Account Sessions for the embedded components and Express login links, keeps the stripe_transfers
// status on the supplier from the account's thin events, and refuses a transfer unless Stripe says it is active.
const { describe, it, before, after } = require("node:test");
const assert = require("node:assert/strict");
const { startApp, vettedSupplier } = require("./helpers");
const { startFakeStripe } = require("./fake-stripe");
const createPayments = require("../payments");

const THIN_SECRET = "whsec_thin";

describe("payouts: off without Stripe (API)", () => {
  let app, supplier;
  before(async () => {
    app = await startApp();
    const admin = await app.login("admin@test.local", "Admin-Password-2026!");
    supplier = (await vettedSupplier(app, admin, "po.off@test.local", "Off Payout GmbH")).token;
  });
  after(async () => app?.stop());

  it("shows payouts off and creates nothing", async () => {
    const r = await app.call("GET", "/payouts", undefined, supplier);
    assert.equal(r.status, 200, r.error);
    assert.equal(r.enabled, false);
    assert.equal(r.account, null);
    assert.equal((await app.call("POST", "/payouts/account", { country: "DE" }, supplier)).code, "stOff");
  });
});

describe("payouts: connected accounts with a fake Stripe (API)", () => {
  let app, fake, admin, supplier, supplierId, customer, member, accountId;
  const post = (event) => fetch(app.base + "/api/stripe/webhook", { method: "POST", headers: { "Content-Type": "application/json", "Stripe-Signature": event.header }, body: event.payload });
  const thin = (id, type, account, secret = THIN_SECRET) => fake.signedThin({ id, type, related_object: { id: account, type: "v2.core.account", url: "/v2/core/accounts/" + account } }, secret);
  before(async () => {
    fake = await startFakeStripe();
    app = await startApp({ env: { ...fake.env, STRIPE_THIN_WEBHOOK_SECRET: THIN_SECRET } });
    admin = await app.login("admin@test.local", "Admin-Password-2026!");
    const s = await vettedSupplier(app, admin, "po.supplier@test.local", "Payout Crew GmbH");
    supplier = s.token;
    supplierId = s.supplierId;
    await app.signup("customer", "po.customer@test.local");
    customer = await app.login("po.customer@test.local", "Test-Password-2026");
    const m = await app.call("POST", "/team", { name: "Pia Member", email: "po.member@test.local", permissions: { settings: "full" } }, supplier);
    const temp = await app.login("po.member@test.local", m.temporaryPassword);
    await app.call("POST", "/account/password", { currentPassword: m.temporaryPassword, newPassword: "Member-Pass-2026" }, temp);
    member = await app.login("po.member@test.local", "Member-Pass-2026");
  });
  after(async () => {
    await app?.stop();
    await fake?.stop();
  });

  it("is for suppliers, and only the main account sets it up", async () => {
    assert.equal((await app.call("GET", "/payouts", undefined, customer)).code, "poOnlySuppliers");
    const r = await app.call("GET", "/payouts", undefined, supplier);
    assert.equal(r.enabled, true);
    assert.equal(r.publishableKey, "pk_test_fake");
    assert.equal(r.account, null);
    assert.equal(r.canManage, true);
    assert.equal((await app.call("POST", "/payouts/session", {}, supplier)).code, "poFirst");
    const m = await app.call("GET", "/payouts", undefined, member);
    assert.equal(m.status, 200, m.error);
    assert.equal(m.canManage, false);
    assert.equal((await app.call("POST", "/payouts/account", {}, member)).code, "poMainOnly");
    assert.ok(!fake.calls.some((c) => c.path === "/v2/core/accounts"), "nothing was created");
  });

  it("requires a real explicit registration country without defaulting to Germany", async () => {
    for (const country of [undefined, "", "ZZ", "EU", "Germany", 123]) {
      const r = await app.call("POST", "/payouts/account", { country }, supplier);
      assert.equal(r.status, 400);
      assert.equal(r.code, "poCountry");
    }
    assert.ok(!fake.calls.some((c) => c.path === "/v2/core/accounts"));
  });

  it("uses an international supplier's explicit registration country", async () => {
    const international = await vettedSupplier(app, admin, "po.poland@test.local", "Polish Supplier");
    const r = await app.call("POST", "/payouts/account", { country: "PL" }, international.token);
    assert.equal(r.status, 201, r.error);
    assert.equal(fake.calls.findLast((c) => c.path === "/v2/core/accounts").body.identity.country, "pl");
  });

  it("creates the account with the Accounts v2 fields, never `type`, and only once", async () => {
    const r = await app.call("POST", "/payouts/account", { country: "DE" }, supplier);
    assert.equal(r.status, 201, r.error);
    accountId = r.account.id;
    assert.equal(r.account.transfers, "pending");
    assert.equal(r.account.requirements, "currently_due");
    const creates = fake.calls.filter((c) => c.method === "POST" && c.path === "/v2/core/accounts" && c.body.metadata.supplierId === supplierId);
    assert.equal(creates.length, 1);
    const b = creates[0].body;
    assert.equal(b.type, undefined, "never the old account type");
    assert.equal(b.dashboard, "express");
    assert.deepEqual(b.defaults, { currency: "eur", responsibilities: { fees_collector: "application", losses_collector: "application" } });
    assert.deepEqual(b.identity, { country: "de", entity_type: "company", business_details: { registered_name: "Payout Crew GmbH" } });
    assert.deepEqual(b.configuration, { recipient: { capabilities: { stripe_balance: { stripe_transfers: { requested: true } } } } });
    assert.deepEqual(b.include, ["configuration.recipient", "requirements"]);
    assert.equal(b.contact_email, "po.supplier@test.local");
    assert.equal(b.metadata.supplierId, supplierId);
    assert.ok(creates[0].headers["idempotency-key"], "a retry cannot open a second account");
    assert.ok(!("merchant" in b.configuration), "no card payments on the supplier's account");
    // A second click returns the same account
    const again = await app.call("POST", "/payouts/account", { country: "DE" }, supplier);
    assert.equal(again.status, 200);
    assert.equal(again.account.id, accountId);
    assert.equal(fake.calls.filter((c) => c.method === "POST" && c.path === "/v2/core/accounts" && c.body.metadata.supplierId === supplierId).length, 1);
  });

  it("makes an Account Session for the embedded components and an Express login link", async () => {
    const s = await app.call("POST", "/payouts/session", {}, supplier);
    assert.equal(s.status, 200, s.error);
    assert.equal(s.clientSecret, "accs_fake_" + accountId);
    const call = fake.calls.findLast((c) => c.path === "/v1/account_sessions");
    assert.equal(call.body.account, accountId);
    for (const c of ["account_onboarding", "notification_banner", "account_management"]) assert.equal(call.body[`components[${c}][enabled]`], "true");
    const l = await app.call("POST", "/payouts/login-link", {}, supplier);
    assert.equal(l.url, "https://connect.stripe.com/express/fake/" + accountId);
    assert.equal((await app.call("POST", "/payouts/session", {}, member)).code, "poMainOnly");
  });

  it("keeps the status private: the admin sees it, the directory does not", async () => {
    const { suppliers } = await app.call("GET", "/admin/suppliers", undefined, admin);
    assert.equal(suppliers.find((s) => s.id === supplierId).stripeAccount.transfers, "pending");
    const pub = await app.call("GET", "/suppliers/" + supplierId, undefined, customer);
    assert.equal(pub.status, 200, pub.error);
    assert.ok(!JSON.stringify(pub).includes(accountId), "the account id never leaves for other users");
  });

  it("updates the supplier from the account's thin events, once per event", async () => {
    fake.setTransfers(accountId, "active");
    const type = "v2.core.account[configuration.recipient].capability_status_updated";
    assert.equal((await post(thin("evt_cap1", type, accountId, "whsec_other"))).status, 400, "wrong secret");
    assert.equal((await post(thin("evt_cross", type, accountId, fake.env.STRIPE_WEBHOOK_SECRET))).status, 400, "snapshot secret cannot authenticate a thin event");
    assert.equal((await post(fake.signed({ id: "evt_cross_snapshot", type: "test.snapshot" }, THIN_SECRET))).status, 400, "thin secret cannot authenticate a snapshot");
    assert.equal((await post(thin("evt_cap1", type, accountId))).status, 200);
    let r = await app.call("GET", "/payouts", undefined, supplier);
    assert.equal(r.account.transfers, "active");
    assert.equal(r.account.requirements, null);
    const retrieve = fake.calls.findLast((c) => c.method === "GET" && c.path === "/v2/core/accounts/" + accountId);
    assert.deepEqual(Object.values(retrieve.query), ["configuration.recipient", "requirements"]);
    const notes = (await app.call("GET", "/notifications", undefined, supplier)).notifications;
    assert.ok(notes.some((n) => /payout account is active/.test(n.text)));
    // The same event again is not handled again
    const reads = fake.calls.filter((c) => c.path === "/v2/core/accounts/" + accountId).length;
    assert.deepEqual(await (await post(thin("evt_cap1", type, accountId))).json(), { received: true, duplicate: true });
    assert.equal(fake.calls.filter((c) => c.path === "/v2/core/accounts/" + accountId).length, reads);
    // Stripe restricts the account: the supplier is told
    fake.setTransfers(accountId, "restricted");
    assert.equal((await post(thin("evt_req1", "v2.core.account[requirements].updated", accountId))).status, 200);
    r = await app.call("GET", "/payouts", undefined, supplier);
    assert.equal(r.account.transfers, "restricted");
    assert.ok((await app.call("GET", "/notifications", undefined, supplier)).notifications.some((n) => /needs more information/.test(n.text)));
    // An event about an account that is not a supplier's is ignored
    assert.equal((await post(thin("evt_other", "v2.core.account.updated", "acct_unknown"))).status, 200);
    // The supplier can ask for the status again
    fake.setTransfers(accountId, "active");
    assert.equal((await app.call("POST", "/payouts/refresh", {}, supplier)).account.transfers, "active");
  });
});

describe("payouts: a transfer checks the account with Stripe first (unit)", () => {
  let fake;
  before(async () => (fake = await startFakeStripe()));
  after(() => fake.stop());

  it("refuses a transfer to a restricted or pending account and sends it to an active one", async () => {
    const db = { suppliers: [{ id: "sup1", company: "Unit GmbH" }], users: [{ id: "u1", role: "supplier", supplierId: "sup1", email: "u@test.local" }], notifications: [], outbox: [], activities: [] },
      notes = [];
    const p = createPayments({ ...require("./stripe-inbox-helper")(), getDb: () => db, save() {}, send() {}, now: () => "2026-10-06T10:00:00.000Z", activity() {}, notify: (id, spec) => notes.push(spec.key), env: fake.env });
    const created = await p.client.v2.core.accounts.create({ dashboard: "express" });
    db.suppliers[0].stripeAccount = { id: created.id, transfers: "active" };
    fake.setTransfers(created.id, "restricted");
    // The stored copy says active, but Stripe says restricted: refused
    await assert.rejects(p.payouts.transfer("sup1", { amount: 1000, currency: "eur" }), (e) => e.reason === "restricted");
    assert.equal(db.suppliers[0].stripeAccount.transfers, "restricted");
    assert.equal(p.payouts.ready("sup1"), false);
    fake.setTransfers(created.id, "pending");
    await assert.rejects(p.payouts.transfer("sup1", { amount: 1000, currency: "eur" }), (e) => e.reason === "pending");
    await assert.rejects(p.payouts.transfer("nobody", { amount: 1000, currency: "eur" }), (e) => e.reason === "noAccount");
    assert.ok(!fake.calls.some((c) => c.path === "/v1/transfers"), "no transfer was sent");
    fake.setTransfers(created.id, "active");
    const tr = await p.payouts.transfer("sup1", { amount: 1000, currency: "eur" });
    assert.equal(tr.destination, created.id);
    assert.equal(fake.calls.filter((c) => c.path === "/v1/transfers").length, 1);
    assert.equal(p.payouts.ready("sup1"), true);
    assert.deepEqual(db.notifications.map((notice) => notice.text), [require("../locales").notifyText({ key: "payoutsActive" }, "en"), require("../locales").notifyText({ key: "payoutsRestricted" }, "en")]);
    assert.deepEqual(notes, [], "legacy live notify callback is never called");
  });

  it("maps every capability status to active, pending or restricted", () => {
    const { transfersOf } = require("../payouts");
    const acc = (status, closed) => ({ closed, configuration: { recipient: { capabilities: { stripe_balance: { stripe_transfers: { status } } } } } });
    assert.equal(transfersOf(acc("active")), "active");
    assert.equal(transfersOf(acc("pending")), "pending");
    for (const s of ["restricted", "rejected", "unsupported", undefined]) assert.equal(transfersOf(acc(s)), "restricted");
    assert.equal(transfersOf(acc("active", true)), "restricted", "a closed account");
  });
});

describe("payouts: thin-only webhook configuration", () => {
  it("accepts thin events without the snapshot signing secret", async () => {
    const fake = await startFakeStripe();
    const app = await startApp({ env: { ...fake.env, STRIPE_WEBHOOK_SECRET: "", STRIPE_THIN_WEBHOOK_SECRET: THIN_SECRET } });
    try {
      const delivery = fake.signedThin({ id: "evt_thin_only", type: "v2.core.account.updated", related_object: { id: "acct_unknown", type: "v2.core.account" } }, THIN_SECRET);
      const r = await fetch(app.base + "/api/stripe/webhook", { method: "POST", headers: { "Stripe-Signature": delivery.header }, body: delivery.payload });
      assert.equal(r.status, 200);
    } finally {
      await app.stop();
      await fake.stop();
    }
  });
});

describe("payouts: delayed request bodies cannot create two accounts", () => {
  it("rechecks the creation lock after reading each body", async () => {
    const supplier = { id: "sup_concurrent", company: "Concurrent Supplier" };
    const user = { id: "owner", role: "supplier", supplierId: supplier.id, email: "owner@test.local" };
    const reads = [], answers = [], creates = [];
    let releaseCreate;
    const db = { suppliers: [supplier], users: [user], activities: [], notifications: [], outbox: [] };
    const payouts = require("../payouts")({
      ...require("./stripe-inbox-helper")(), getDb: () => db, save() {}, now: () => "now", notify() {}, activity() {}, on() {}, enabled: true,
      body: () => new Promise((resolve) => reads.push(resolve)),
      send: (res, status, data) => answers.push({ res, status, data }),
      client: { v2: { core: { accounts: { create: (params) => { creates.push(params); return new Promise((resolve) => { releaseCreate = () => resolve({ id: "acct_concurrent" }); }); } } } } },
    });
    const first = payouts.handle({ method: "POST" }, "first", null, ["api", "payouts", "account"], user);
    const second = payouts.handle({ method: "POST" }, "second", null, ["api", "payouts", "account"], user);
    await new Promise((resolve) => setImmediate(resolve));
    reads[0]({ country: "PL" });
    await new Promise((resolve) => setImmediate(resolve));
    reads[1]({ country: "DE" });
    await second;
    assert.equal(creates.length, 1);
    assert.equal(creates[0].identity.country, "pl");
    assert.equal(answers.find((a) => a.res === "second").status, 409);
    releaseCreate();
    await first;
    assert.equal(supplier.stripeAccount.id, "acct_concurrent");
  });
});
