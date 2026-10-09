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
  // T271: connected accounts (Accounts v2); `transfers` is the stripe_transfers capability's status
  const accountKeys = new Map(), accounts = new Map(),
    transfers = new Map(), customers = new Map(), checkoutSessions = new Map(), customerKeys = new Map(), checkoutKeys = new Map();
  const metadata = (body) => Object.fromEntries(Object.entries(body).filter(([key]) => key.startsWith("metadata[")).map(([key, value]) => [key.slice(9, -1), value]));
  const notFound = (what) => ({ status: 404, error: { type: "invalid_request_error", message: "No such " + what } });
  const last = (p) => decodeURIComponent(p.split("/").filter(Boolean).at(-1));
  const v2Account = (a) => ({
    id: a.id,
    object: "v2.core.account",
    applied_configurations: ["recipient"],
    closed: !!a.closed,
    created: a.created,
    dashboard: a.dashboard,
    display_name: a.display_name,
    contact_email: a.contact_email,
    livemode: false,
    metadata: a.metadata || {},
    configuration: { recipient: { applied: true, capabilities: { stripe_balance: { stripe_transfers: { requested: true, status: a.transfers, status_details: [] } } } } },
    requirements: { entries: [], summary: a.transfers === "active" ? {} : { minimum_deadline: { status: "currently_due" } } },
  });
  const all = {
    "GET /v1/account": () => ({ id: "acct_platform", object: "account", country: "DE", settings: { dashboard: { display_name: "CraftCrew Test" } } }),
    "POST /v1/customers": (b, p, req) => {
      const key = req.headers['idempotency-key'];
      if (key && customerKeys.has(key)) return customers.get(customerKeys.get(key));
      const customer = { id: 'cus_fake' + (customers.size + 1), object: 'customer', name: b.name, email: b.email, metadata: metadata(b), livemode: false };
      customers.set(customer.id, customer); if (key) customerKeys.set(key, customer.id); return customer;
    },
    "GET /v1/customers/:id": (b, p) => customers.get(last(p)) || notFound('customer'),
    "POST /v1/checkout/sessions": (b, p, req) => {
      const key = req.headers['idempotency-key'];
      if (key && checkoutKeys.has(key)) return checkoutSessions.get(checkoutKeys.get(key));
      const session = { id: 'cs_test_fake' + (checkoutSessions.size + 1), object: 'checkout.session', mode: b.mode, customer: b.customer,
        client_reference_id: b.client_reference_id, integration_identifier: b.integration_identifier, currency: b['line_items[0][price_data][currency]'],
        amount_total: Number(b['line_items[0][price_data][unit_amount]']), metadata: metadata(b), payment_intent: null, livemode: false,
        status: 'open', payment_status: 'unpaid', url: 'https://checkout.stripe.com/c/pay/fake' + (checkoutSessions.size + 1) };
      checkoutSessions.set(session.id, session); if (key) checkoutKeys.set(key, session.id); return session;
    },
    "GET /v1/checkout/sessions/:id": (b, p) => checkoutSessions.get(last(p)) || notFound('session'),
    "POST /v2/core/accounts": (b, p, req) => {
      const key = req.headers['idempotency-key'], previous = key && accountKeys.get(key);
      if (previous) {
        if (previous.body !== JSON.stringify(b)) return { status: 400, error: { type: 'invalid_request_error', message: 'Idempotency parameters changed' } };
        return v2Account(accounts.get(previous.id));
      }
      const a = { ...b, id: "acct_fake" + (accounts.size + 1), transfers: "pending", created: new Date().toISOString() };
      accounts.set(a.id, a);
      if (key) accountKeys.set(key, { id: a.id, body: JSON.stringify(b) });
      return v2Account(a);
    },
    "GET /v2/core/accounts/:id": (b, p) => (accounts.has(last(p)) ? v2Account(accounts.get(last(p))) : notFound("account")),
    "POST /v1/account_sessions": (b) => ({ object: "account_session", account: b.account, client_secret: "accs_fake_" + b.account, expires_at: Math.floor(Date.now() / 1000) + 1800, livemode: false, components: {} }),
    "POST /v1/accounts/:id/login_links": (b, p) => ({ object: "login_link", created: Math.floor(Date.now() / 1000), url: "https://connect.stripe.com/express/fake/" + p.split("/")[3] }),
    "POST /v1/transfers": (b) => {
      const tr = { id: "tr_fake" + (transfers.size + 1), object: "transfer", amount: Number(b.amount), currency: b.currency, destination: b.destination, transfer_group: b.transfer_group || null, source_transaction: b.source_transaction || null, metadata: {}, reversed: false, amount_reversed: 0 };
      transfers.set(tr.id, tr);
      return tr;
    },
    ...routes,
  };
  const server = http.createServer((req, res) => {
    let raw = "";
    req.on("data", (c) => (raw += c));
    req.on("end", () => {
      const p = req.url.split("?")[0],
        query = Object.fromEntries(new URLSearchParams(req.url.split("?")[1] || "")),
        body = req.headers["content-type"]?.includes("json") ? JSON.parse(raw || "{}") : Object.fromEntries(new URLSearchParams(raw));
      calls.push({ method: req.method, path: p, query, body, headers: req.headers });
      const fn = all[`${req.method} ${p}`] || Object.entries(all).find(([k]) => k.includes(":") && new RegExp("^" + k.replace(/:[a-z]+/g, "[^/]+") + "$").test(`${req.method} ${p}`))?.[1];
      const out = fn ? fn(body, p, req) : { status: 404, error: { type: "invalid_request_error", message: "No such route in the fake Stripe: " + p } };
      const status = typeof out?.status === "number" ? out.status : 200;
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
    accounts,
    transfers,
    customers,
    checkoutSessions,
    // T271: Stripe changes a connected account's stripe_transfers capability
    setTransfers(id, status) {
      accounts.get(id).transfers = status;
    },
    env: { STRIPE_SECRET_KEY: KEY, STRIPE_PUBLISHABLE_KEY: "pk_test_fake", STRIPE_WEBHOOK_SECRET: WEBHOOK_SECRET, STRIPE_API_BASE: base },
    // A signed webhook delivery, as Stripe sends it
    signed(event, secret = WEBHOOK_SECRET) {
      const payload = JSON.stringify({ object: "event", api_version: Stripe.API_VERSION, livemode: false, created: Math.floor(Date.now() / 1000), data: { object: {} }, ...event });
      return { payload, header: sdk.webhooks.generateTestHeaderString({ payload, secret }) };
    },
    // A thin event (Accounts v2): only the related object's id, signed like a snapshot event
    signedThin(event, secret = WEBHOOK_SECRET) {
      const payload = JSON.stringify({ object: "v2.core.event", created: new Date().toISOString(), livemode: false, ...event });
      return { payload, header: sdk.webhooks.generateTestHeaderString({ payload, secret }) };
    },
    stop: () => new Promise((r) => server.close(r)),
  };
}
module.exports = { startFakeStripe, KEY, WEBHOOK_SECRET };
