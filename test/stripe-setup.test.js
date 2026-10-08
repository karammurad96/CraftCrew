const { test } = require("node:test");
const assert = require("node:assert/strict");
const Stripe = require("stripe");
const { startFakeStripe, KEY } = require("./fake-stripe");
const { setup, main, publicEndpoint, testKey, SNAPSHOT_EVENTS, THIN_EVENTS } = require("../tools/stripe-setup");
const clone = (value) => structuredClone(value);
const page = (data, next = null) => ({ object: "list", data, has_more: false, next_page_url: next });
const url = "https://payments.example.com";
function fixture(options = {}) {
  const configuration = { id: "pmc_fake", object: "payment_method_configuration", active: true, is_default: true, livemode: false,
    sepa_debit: { display_preference: { value: "off" }, available: false },
    customer_balance: { display_preference: { value: "off" }, available: false } };
  const destinations = [], keys = new Map();
  const routes = {
    "GET /v1/payment_method_configurations": () => page([configuration]),
    "GET /v1/payment_method_configurations/:id": () => clone(configuration),
    "POST /v1/payment_method_configurations/:id": (body) => {
      for (const method of ["sepa_debit", "customer_balance"]) if (body[method + "[display_preference][preference]"] === "on")
        configuration[method] = { display_preference: { value: "on" }, available: !options.unavailable };
      return clone(configuration);
    },
    "GET /v2/core/event_destinations": () => page(clone(destinations)),
    "POST /v2/core/event_destinations": (body, path, req) => {
      const key = req.headers["idempotency-key"];
      if (keys.has(key)) return clone(keys.get(key));
      const destination = { ...body, id: "ed_test_fake" + (destinations.length + 1), object: "v2.core.event_destination", status: "enabled", livemode: false,
        webhook_endpoint: { url: body.webhook_endpoint.url, signing_secret: "whsec_fake" } };
      destinations.push(destination); keys.set(key, destination);
      return clone(destination);
    },
    "POST /v2/core/event_destinations/:id": (body, path) => {
      const destination = destinations.find((item) => path.endsWith("/" + item.id));
      Object.assign(destination, body);
      return clone(destination);
    },
    "POST /v2/core/event_destinations/:id/enable": (body, path) => {
      const destination = destinations.find((item) => path.endsWith("/" + item.id + "/enable"));
      destination.status = "enabled"; return clone(destination);
    },
  };
  return { configuration, destinations, routes };
}
async function withFake(t, options = {}) {
  const state = fixture(options), fake = await startFakeStripe(state.routes);
  t.after(() => fake.stop());
  const endpoint = new URL(fake.base), client = new Stripe(KEY, { host: endpoint.hostname, port: Number(endpoint.port), protocol: "http", maxNetworkRetries: 0 });
  return { ...state, fake, client, run: (more = {}) => setup({ client, publicUrl: url, apiVersion: Stripe.API_VERSION, ...more }) };
}

test("Stripe setup uses the real SDK against fake API and is idempotent without leaking secrets", async (t) => {
  const state = await withFake(t);
  state.destinations.push({ id: "ed_test_unowned", name: "Other integration", webhook_endpoint: { url: "https://other.example.com" } });
  const unowned = clone(state.destinations[0]);
  const first = await state.run(), second = await state.run();
  assert.equal(first.endpoint, url + "/api/stripe/webhook");
  assert.equal(first.mode, "test");
  assert.equal(first.destinations.snapshot.created, true);
  assert.equal(second.destinations.snapshot.created, false);
  assert.equal(first.destinations.snapshot.id, second.destinations.snapshot.id);
  assert.equal(state.destinations.length, 3);
  assert.deepEqual(state.destinations[0], unowned);
  assert.ok(!JSON.stringify([first, second]).includes("whsec_"));
  const creates = state.fake.calls.filter((call) => call.method === "POST" && call.path === "/v2/core/event_destinations");
  assert.equal(creates.length, 2);
  assert.deepEqual(creates[0].body.events_from, ["@self"]);
  assert.deepEqual(creates[1].body.events_from, ["@accounts"]);
  assert.deepEqual(creates[0].body.enabled_events, SNAPSHOT_EVENTS);
  assert.deepEqual(creates[1].body.enabled_events, THIN_EVENTS);
  assert.equal(creates[0].body.snapshot_api_version, Stripe.API_VERSION);
  assert.equal(creates[1].body.snapshot_api_version, undefined);
  assert.ok(creates.every((call) => !call.body.include.includes("webhook_endpoint.signing_secret")));
  assert.ok(creates.every((call) => call.headers["idempotency-key"]));
  assert.equal(state.fake.calls.filter((call) => call.method === "POST" && call.path.startsWith("/v1/payment_method_configurations/")).length, 1);
});

test("explicit secret printing includes only newly created destination secrets", async (t) => {
  const state = await withFake(t);
  const first = await state.run({ printSecrets: true }), second = await state.run({ printSecrets: true });
  assert.equal(first.destinations.snapshot.signingSecret, "whsec_fake");
  assert.equal(first.destinations.thin.signingSecret, "whsec_fake");
  assert.equal(first.destinations.thin.secretEnvironment, "STRIPE_THIN_WEBHOOK_SECRET");
  assert.ok(!JSON.stringify(second).includes("whsec_"));
  assert.match(second.destinations.snapshot.secretSource, /Dashboard/);
});

test("method preferences alone do not imply availability or create destinations", async (t) => {
  const state = await withFake(t, { unavailable: true });
  await assert.rejects(state.run(), /not available/);
  assert.equal(state.destinations.length, 0);
});

test("existing managed destinations preserve extra events and regain missing subscriptions/enabled status", async (t) => {
  const state = await withFake(t);
  await state.run();
  state.destinations[0].enabled_events = ["charge.refunded"];
  state.destinations[0].status = "disabled";
  await state.run();
  assert.ok(state.destinations[0].enabled_events.includes("charge.refunded"));
  assert.ok(SNAPSHOT_EVENTS.every((event) => state.destinations[0].enabled_events.includes(event)));
  assert.equal(state.destinations[0].status, "enabled");
  assert.equal(state.destinations.length, 2);
});

test("scope/identity conflicts and duplicate owned destinations fail before any mutation", async (t) => {
  const state = await withFake(t);
  await state.run();
  state.destinations[0].events_from = ["@accounts"];
  let before = state.fake.calls.length;
  await assert.rejects(state.run(), /conflicting delivery settings/);
  assert.ok(state.fake.calls.slice(before).every((call) => call.method === "GET"));
  state.destinations[0].events_from = ["@self"];
  state.destinations.push(clone(state.destinations[0]));
  before = state.fake.calls.length;
  await assert.rejects(state.run(), /Duplicate managed/);
  assert.ok(state.fake.calls.slice(before).every((call) => call.method === "GET"));
});

test("discovery paginates both API generations without choosing a connected-account default", async (t) => {
  const state = fixture(), connected = { ...clone(state.configuration), id: "pmc_connected", application: "ca_other" };
  let fake;
  state.routes["GET /v1/payment_method_configurations"] = (body, path, req) => {
    const query = new URL(req.url, "https://example.com").searchParams;
    return query.has("starting_after") ? page([state.configuration]) : { ...page([connected]), has_more: true };
  };
  state.routes["GET /v2/core/event_destinations"] = () => page([], "/v2/core/event_destinations/page2");
  state.routes["GET /v2/core/event_destinations/page2"] = () => page([]);
  fake = await startFakeStripe(state.routes); t.after(() => fake.stop());
  const endpoint = new URL(fake.base), client = new Stripe(KEY, { host: endpoint.hostname, port: Number(endpoint.port), protocol: "http", maxNetworkRetries: 0 });
  const result = await setup({ client, publicUrl: url, apiVersion: Stripe.API_VERSION });
  assert.equal(result.paymentMethodConfiguration, "pmc_fake");
  assert.ok(fake.calls.some((call) => call.query.starting_after === "pmc_connected"));
  assert.ok(fake.calls.some((call) => call.path.endsWith("/page2")));
});

test("public URL and test keys reject credential leaks, private endpoints and live mode", () => {
  for (const value of ["http://example.com", "https://user:password@example.com", "https://localhost", "https://localhost.", "https://a.localhost.", "https://host.local.", "https://host.internal.", "https://127.0.0.1", "https://[::1]", "https://host.local", "https://host.internal", "https://example.com?secret=x", "https://example.com#x", "https://example.com:3000", "https://example.com/wrong"])
    assert.throws(() => publicEndpoint(value));
  assert.equal(publicEndpoint(url + "/api/stripe/webhook"), url + "/api/stripe/webhook");
  assert.equal(testKey({ STRIPE_SECRET_KEY: KEY }), KEY);
  for (const key of ["sk_live_fake", "rk_live_fake", "pk_test_fake", "", "sk_test_fake\nsecret"])
    assert.throws(() => testKey({ STRIPE_SECRET_KEY: key, PAYMENTS_LIVE: "1" }));
});

test("CLI refuses live keys before networking and sanitizes provider errors even with print-secrets", async (t) => {
  let out = "", err = "";
  const output = { write: (text) => { out += text; } }, errors = { write: (text) => { err += text; } };
  assert.equal(await main(["--url", url], { STRIPE_SECRET_KEY: "sk_live_fake", PAYMENTS_LIVE: "1" }, output, errors), 1);
  const fake = await startFakeStripe({ "GET /v1/payment_method_configurations": () => ({ status: 400, error: { message: "secret sk_test_fake whsec_fake", type: "invalid_request_error" } }) });
  t.after(() => fake.stop());
  assert.equal(await main(["--url", url, "--print-secrets"], fake.env, output, errors), 1);
  assert.equal(out, "");
  assert.ok(!err.includes("sk_test_") && !err.includes("whsec_") && !err.includes("sk_live_"));
  assert.match(err, /No provider error or secret was printed/);
});

test("CLI success suppresses signing secrets by default and opt-in works on initial creation", async (t) => {
  for (const flag of [false, true]) {
    const state = await withFake(t); let out = "", err = "";
    assert.equal(await main(["--url", url, ...(flag ? ["--print-secrets"] : [])], state.fake.env,
      { write: (value) => { out += value; } }, { write: (value) => { err += value; } }), 0);
    assert.equal(err, "");
    assert.equal(out.includes("whsec_fake"), flag);
    assert.ok(!out.includes(KEY));
  }
});
