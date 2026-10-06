// T270: the Stripe foundation. Payments are off without a key; keys come only from the environment and never
// show in answers; a live key is refused unless PAYMENTS_LIVE=1; webhooks need a valid signature and each event is
// handled once; the admin sees the status and can check the connection; the page allows Stripe.js only when on.
const { describe, it, before, after } = require("node:test");
const assert = require("node:assert/strict");
const { Readable } = require("node:stream");
const { startApp } = require("./helpers");
const { startFakeStripe, KEY } = require("./fake-stripe");
const createPayments = require("../payments");

const unit = (env, db = {}) => {
  const sent = [];
  const p = createPayments({ getDb: () => db, save() {}, send: (res, status, body) => sent.push({ status, body }), now: () => "2026-10-06T10:00:00.000Z", activity() {}, env });
  return { p, sent, db };
};
const delivery = ({ payload, header }) => Object.assign(Readable.from([Buffer.from(payload)]), { headers: { "stripe-signature": header } });

describe("payments: keys and mode", () => {
  it("is off without a key and refuses a malformed key", () => {
    assert.equal(unit({}).p.enabled, false);
    assert.equal(unit({}).p.status().mode, "off");
    assert.equal(unit({}).p.cspSources(), null);
    assert.throws(() => unit({ STRIPE_SECRET_KEY: "pk_test_fake" }), /not a Stripe secret or restricted key/);
  });

  it("refuses a live key unless PAYMENTS_LIVE=1", () => {
    assert.throws(() => unit({ STRIPE_SECRET_KEY: "rk_live_fake" }), /PAYMENTS_LIVE=1/);
    const { p } = unit({ STRIPE_SECRET_KEY: "rk_live_fake", PAYMENTS_LIVE: "1" });
    assert.equal(p.status().mode, "live");
    assert.equal(p.status().keyType, "restricted");
  });

  it("finds no Stripe key or webhook secret in the repository", () => {
    const { scan, PATTERNS } = require("../tools/secret-scan");
    assert.deepEqual(scan(), []);
    assert.ok(PATTERNS[0][1].test("sk_test_" + "a1B2c3D4e5F6g7"), "the scan sees a real-looking key");
    assert.ok(!PATTERNS[0][1].test(KEY), "the test key is too short to look real");
  });
});

describe("payments: webhooks (unit)", () => {
  let fake;
  before(async () => (fake = await startFakeStripe()));
  after(() => fake.stop());

  it("handles a failed handler again when Stripe retries", async () => {
    const { p, sent, db } = unit(fake.env);
    let calls = 0;
    p.on("test.event", () => {
      if (++calls === 1) throw new Error("boom");
    });
    const event = fake.signed({ id: "evt_retry", type: "test.event" });
    await p.webhook(delivery(event), {});
    assert.equal(sent.at(-1).status, 500);
    assert.equal(db.stripeEvents.length, 0, "not recorded, so the retry is handled");
    assert.equal(db.meta.stripe.lastError.message, "boom");
    await p.webhook(delivery(fake.signed({ id: "evt_retry", type: "test.event" })), {});
    assert.equal(sent.at(-1).status, 200);
    assert.equal(calls, 2);
    assert.equal(db.stripeEvents[0].handled, true);
  });
});

describe("payments: off by default (API)", () => {
  let app, admin;
  before(async () => {
    app = await startApp();
    admin = await app.login("admin@test.local", "Admin-Password-2026!");
  });
  after(async () => app?.stop());

  it("shows the mode off, answers no webhook and keeps Stripe out of the page's CSP", async () => {
    const r = await app.call("GET", "/admin/stripe", undefined, admin);
    assert.equal(r.stripe.mode, "off");
    assert.equal((await app.call("POST", "/admin/stripe/check", {}, admin)).status, 409);
    assert.equal((await fetch(app.base + "/api/stripe/webhook", { method: "POST", body: "{}" })).status, 404);
    const csp = (await fetch(app.base + "/")).headers.get("content-security-policy");
    assert.doesNotMatch(csp, /stripe/);
  });
});

describe("payments: test mode with a fake Stripe (API)", () => {
  let app, admin, customer, fake;
  before(async () => {
    fake = await startFakeStripe();
    app = await startApp({ env: fake.env });
    admin = await app.login("admin@test.local", "Admin-Password-2026!");
    await app.signup("customer", "pay.customer@test.local");
    customer = await app.login("pay.customer@test.local", "Test-Password-2026");
  });
  after(async () => {
    await app?.stop();
    await fake?.stop();
  });
  const post = (event) => fetch(app.base + "/api/stripe/webhook", { method: "POST", headers: { "Content-Type": "application/json", "Stripe-Signature": event.header }, body: event.payload });

  it("shows the admin the status without the secret key, and checks the connection", async () => {
    assert.equal((await app.call("GET", "/admin/stripe", undefined, customer)).status, 403);
    const r = await app.call("GET", "/admin/stripe", undefined, admin);
    assert.equal(r.stripe.mode, "test");
    assert.equal(r.stripe.keyType, "secret");
    assert.equal(r.stripe.webhook.configured, true);
    assert.ok(!JSON.stringify(r).includes(KEY), "the secret key never leaves the server");
    const c = await app.call("POST", "/admin/stripe/check", {}, admin);
    assert.equal(c.status, 200, c.error);
    assert.equal(c.stripe.account.id, "acct_platform");
    assert.equal(c.stripe.account.name, "CraftCrew Test");
    const call = fake.calls.find((x) => x.path === "/v1/account");
    assert.equal(call.headers.authorization, "Bearer " + KEY);
    assert.equal(call.headers["stripe-version"], require("stripe").API_VERSION, "the pinned API version");
  });

  it("allows Stripe.js and the Connect components in the page's CSP", async () => {
    const csp = (await fetch(app.base + "/")).headers.get("content-security-policy");
    assert.match(csp, /script-src 'self' https:\/\/js\.stripe\.com https:\/\/connect-js\.stripe\.com/);
    assert.match(csp, /frame-src 'self' blob: https:\/\/\*\.stripe\.com/);
    assert.match(csp, /connect-src 'self' https:\/\/api\.stripe\.com/);
  });

  it("refuses a webhook with a bad signature, and handles each event once", async () => {
    assert.equal((await post(fake.signed({ id: "evt_bad", type: "test.event" }, "whsec_other"))).status, 400);
    assert.equal((await fetch(app.base + "/api/stripe/webhook", { method: "POST", body: "{}" })).status, 400, "no signature");
    const event = fake.signed({ id: "evt_one", type: "account.updated" });
    const first = await post(event);
    assert.equal(first.status, 200);
    assert.deepEqual(await first.json(), { received: true });
    const again = await post(fake.signed({ id: "evt_one", type: "account.updated" }));
    assert.deepEqual(await again.json(), { received: true, duplicate: true });
    const { stripe } = await app.call("GET", "/admin/stripe", undefined, admin);
    assert.equal(stripe.events.filter((e) => e.id === "evt_one").length, 1);
    assert.equal(stripe.webhook.lastEventType, "account.updated");
    assert.equal(stripe.webhook.lastError.message, "Signature check failed");
  });
});
