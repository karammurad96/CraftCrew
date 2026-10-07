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
  const accounts = new Map(),
    transfers = new Map(),
    counts = { customers: 0, sessions: 0, refunds: 0, reversals: 0 };
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
    "POST /v2/core/accounts": (b) => {
      const a = { ...b, id: "acct_fake" + (accounts.size + 1), transfers: "pending", created: new Date().toISOString() };
      accounts.set(a.id, a);
      return v2Account(a);
    },
    "GET /v2/core/accounts/:id": (b, p) => (accounts.has(last(p)) ? v2Account(accounts.get(last(p))) : notFound("account")),
    "POST /v1/account_sessions": (b) => ({ object: "account_session", account: b.account, client_secret: "accs_fake_" + b.account, expires_at: Math.floor(Date.now() / 1000) + 1800, livemode: false, components: {} }),
    "POST /v1/accounts/:id/login_links": (b, p) => ({ object: "login_link", created: Math.floor(Date.now() / 1000), url: "https://connect.stripe.com/express/fake/" + p.split("/")[3] }),
    // T272: customers, Checkout Sessions and the PaymentIntent behind a paid session
    "POST /v1/customers": (b) => ({ id: "cus_fake" + ++counts.customers, object: "customer", name: b.name, email: b.email, metadata: {} }),
    "POST /v1/checkout/sessions": (b) => {
      const id = "cs_test_fake" + ++counts.sessions;
      return { id, object: "checkout.session", mode: b.mode, status: "open", payment_status: "unpaid", customer: b.customer, client_reference_id: b.client_reference_id || null, amount_total: Number(b["line_items[0][price_data][unit_amount]"] || 0), currency: "eur", payment_intent: null, url: "https://checkout.stripe.com/c/pay/" + id, metadata: {} };
    },
    "POST /v1/checkout/sessions/:id/expire": (b, p) => ({ id: p.split("/")[4], object: "checkout.session", status: "expired" }),
    "GET /v1/payment_intents/:id": (b, p) => ({ id: last(p), object: "payment_intent", status: "succeeded", latest_charge: "ch_fake_" + last(p) }),
    "POST /v1/transfers": (b) => {
      const tr = { id: "tr_fake" + (transfers.size + 1), object: "transfer", amount: Number(b.amount), currency: b.currency, destination: b.destination, transfer_group: b.transfer_group || null, source_transaction: b.source_transaction || null, metadata: {}, reversed: false, amount_reversed: 0 };
      transfers.set(tr.id, tr);
      return tr;
    },
    // T273: refunds and transfer reversals
    "POST /v1/refunds": (b) => ({ id: "re_fake" + ++counts.refunds, object: "refund", payment_intent: b.payment_intent || null, charge: b.charge || null, status: "succeeded", metadata: {} }),
    "POST /v1/transfers/:id/reversals": (b, p) => {
      const tr = transfers.get(p.split("/")[3]);
      if (!tr) return notFound("transfer");
      tr.reversed = true;
      tr.amount_reversed = tr.amount;
      return { id: "trr_fake" + ++counts.reversals, object: "transfer_reversal", amount: tr.amount, transfer: tr.id };
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
      const call = { method: req.method, path: p, query, body, headers: req.headers };
      calls.push(call);
      const fn = all[`${req.method} ${p}`] || Object.entries(all).find(([k]) => k.includes(":") && new RegExp("^" + k.replace(/:[a-z]+/g, "[^/]+") + "$").test(`${req.method} ${p}`))?.[1];
      const out = fn ? fn(body, p, req) : { status: 404, error: { type: "invalid_request_error", message: "No such route in the fake Stripe: " + p } };
      call.response = out;
      const status = out?.error ? out.status || 400 : 200;
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
