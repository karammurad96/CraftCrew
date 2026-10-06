// A fake Stripe API for the payment tests (Wave 18): the environment cannot reach api.stripe.com, and tests must
// never use real keys. The server under test points at it with STRIPE_API_BASE. Each route returns what the SDK
// expects; `calls` records every request (method, path, form body) for the assertions.
const http = require("node:http");
const Stripe = require("stripe");

// Fake credentials: too short to look like real keys to tools/secret-scan.js
const KEY = "sk_test_fake",
  WEBHOOK_SECRET = "whsec_fake";

async function startFakeStripe(routes = {}) {
  const calls = [];
  const all = {
    "GET /v1/account": () => ({ id: "acct_platform", object: "account", country: "DE", settings: { dashboard: { display_name: "CraftCrew Test" } } }),
    ...routes,
  };
  const server = http.createServer((req, res) => {
    let raw = "";
    req.on("data", (c) => (raw += c));
    req.on("end", () => {
      const p = req.url.split("?")[0],
        body = req.headers["content-type"]?.includes("json") ? JSON.parse(raw || "{}") : Object.fromEntries(new URLSearchParams(raw));
      calls.push({ method: req.method, path: p, body, headers: req.headers });
      const fn = all[`${req.method} ${p}`] || Object.entries(all).find(([k]) => k.includes(":") && new RegExp("^" + k.replace(/:[a-z]+/g, "[^/]+") + "$").test(`${req.method} ${p}`))?.[1];
      const out = fn ? fn(body, p, req) : { status: 404, error: { type: "invalid_request_error", message: "No such route in the fake Stripe: " + p } };
      const status = out?.status || 200;
      res.writeHead(status, { "Content-Type": "application/json", "Request-Id": "req_fake" });
      res.end(JSON.stringify(out?.error ? { error: out.error } : out));
    });
  });
  await new Promise((r) => server.listen(0, "127.0.0.1", r));
  const base = `http://127.0.0.1:${server.address().port}`;
  const sdk = new Stripe(KEY);
  return {
    base,
    calls,
    env: { STRIPE_SECRET_KEY: KEY, STRIPE_PUBLISHABLE_KEY: "pk_test_fake", STRIPE_WEBHOOK_SECRET: WEBHOOK_SECRET, STRIPE_API_BASE: base },
    // A signed webhook delivery, as Stripe sends it
    signed(event, secret = WEBHOOK_SECRET) {
      const payload = JSON.stringify({ object: "event", api_version: Stripe.API_VERSION, livemode: false, created: Math.floor(Date.now() / 1000), data: { object: {} }, ...event });
      return { payload, header: sdk.webhooks.generateTestHeaderString({ payload, secret }) };
    },
    stop: () => new Promise((r) => server.close(r)),
  };
}
module.exports = { startFakeStripe, KEY, WEBHOOK_SECRET };
