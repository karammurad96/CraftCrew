#!/usr/bin/env node
/* T272a: test-mode provisioning only. No filesystem writes or provider error dumps. */
const crypto = require("node:crypto");
const net = require("node:net");
const SNAPSHOT_EVENTS = ["checkout.session.completed", "checkout.session.async_payment_succeeded",
  "checkout.session.async_payment_failed", "charge.dispute.created", "charge.dispute.closed"];
const THIN_EVENTS = ["v2.core.account.updated", "v2.core.account.closed",
  "v2.core.account[configuration.recipient].updated",
  "v2.core.account[configuration.recipient].capability_status_updated", "v2.core.account[requirements].updated"];
const METHODS = ["sepa_debit", "customer_balance"];

function publicEndpoint(value) {
  let url;
  try { url = new URL(value); } catch { throw new Error("Enter a public HTTPS URL."); }
  const hostname = url.hostname.toLowerCase();
  if (url.protocol !== "https:" || url.username || url.password || url.search || url.hash ||
      url.port || net.isIP(hostname.replace(/^\[|\]$/g, "")) || !hostname.includes(".") || hostname.endsWith(".") ||
      hostname.endsWith(".localhost") || hostname.endsWith(".local") || hostname.endsWith(".internal") ||
      !["/", "/api/stripe/webhook"].includes(url.pathname))
    throw new Error("Enter a public HTTPS URL without credentials, query, fragment or custom port.");
  url.pathname = "/api/stripe/webhook";
  return url.href;
}

function testKey(env) {
  const key = String(env.STRIPE_SECRET_KEY || "").trim();
  if (!/^(sk|rk)_test_[A-Za-z0-9]+$/.test(key))
    throw new Error("Set a Stripe test secret or restricted key in the environment. Live keys are refused.");
  return key;
}

async function collect(list) {
  const result = [];
  for await (const item of list) result.push(item);
  return result;
}
const equalSet = (a, b) => Array.isArray(a) && a.length === b.length && b.every((value) => a.includes(value));
const safeId = (id, prefix) => typeof id === "string" && new RegExp("^" + prefix + "[A-Za-z0-9]+$").test(id);

async function setup({ client, publicUrl, printSecrets = false, apiVersion }) {
  const endpoint = publicEndpoint(publicUrl);
  if (typeof apiVersion !== "string" || !/^\d{4}-\d{2}-\d{2}\.[a-z]+$/.test(apiVersion))
    throw new Error("A pinned Stripe SDK API version is required.");
  const identity = crypto.createHash("sha256").update(endpoint).digest("hex");
  const metadata = (kind) => ({ craftcrew_setup: "T272a", craftcrew_endpoint: identity, craftcrew_payload: kind });
  const configurations = await collect(client.paymentMethodConfigurations.list({ active: true, limit: 100 }));
  const defaults = configurations.filter((configuration) => configuration.is_default && !configuration.application && !configuration.parent);
  if (defaults.length !== 1 || defaults[0].livemode !== false || !safeId(defaults[0].id, "pmc_"))
    throw new Error("A unique test-mode platform default Payment Method Configuration is required.");
  let configuration = defaults[0];
  if (METHODS.some((method) => !configuration[method]))
    throw new Error("SEPA or bank transfer is unsupported. Check payment method eligibility in Stripe.");

  // Preflight ownership before changing anything. Never adopt or rewrite unrelated destinations.
  const destinations = await collect(client.v2.core.eventDestinations.list({ limit: 100, include: ["webhook_endpoint.url"] }));
  const existing = {};
  for (const kind of ["snapshot", "thin"]) {
    const matches = destinations.filter((destination) => destination.metadata?.craftcrew_setup === "T272a" &&
      destination.metadata?.craftcrew_endpoint === identity && destination.metadata?.craftcrew_payload === kind);
    if (matches.length > 1) throw new Error("Duplicate managed destinations require operator reconciliation.");
    const destination = matches[0];
    const scope = kind === "snapshot" ? "@self" : "@accounts";
    if (destination && (destination.livemode !== false || destination.type !== "webhook_endpoint" ||
        destination.event_payload !== kind || !equalSet(destination.events_from, [scope]) ||
        destination.webhook_endpoint?.url !== endpoint || !safeId(destination.id, "ed_test_") ||
        (kind === "snapshot" && destination.snapshot_api_version !== apiVersion)))
      throw new Error("A managed destination has conflicting delivery settings. Reconcile it in Stripe.");
    existing[kind] = destination;
  }

  const changes = Object.fromEntries(METHODS.filter((method) => configuration[method].display_preference?.value !== "on")
    .map((method) => [method, { display_preference: { preference: "on" } }]));
  if (Object.keys(changes).length) configuration = await client.paymentMethodConfigurations.update(configuration.id, changes);
  // Re-read effective eligibility even if the preference already appeared enabled.
  configuration = await client.paymentMethodConfigurations.retrieve(configuration.id);
  if (configuration.livemode !== false || !configuration.active || METHODS.some((method) =>
      configuration[method]?.display_preference?.value !== "on" || configuration[method]?.available !== true))
    throw new Error("Payment method preferences were requested, but SEPA/bank transfer is not available. Check Stripe eligibility.");

  const result = { mode: "test", paymentMethodConfiguration: configuration.id, endpoint, destinations: {} };
  for (const kind of ["snapshot", "thin"]) {
    const events = kind === "snapshot" ? SNAPSHOT_EVENTS : THIN_EVENTS;
    let destination = existing[kind], created = false;
    if (!destination) {
      destination = await client.v2.core.eventDestinations.create({
        name: "CraftCrew " + kind + " " + identity.slice(0, 12), type: "webhook_endpoint",
        event_payload: kind, events_from: [kind === "snapshot" ? "@self" : "@accounts"], enabled_events: events,
        webhook_endpoint: { url: endpoint }, metadata: metadata(kind),
        ...(kind === "snapshot" ? { snapshot_api_version: apiVersion } : {}),
        include: ["webhook_endpoint.url", ...(printSecrets ? ["webhook_endpoint.signing_secret"] : [])],
      }, { idempotencyKey: "craftcrew-destination-" + kind + "-" + identity });
      created = true;
    } else {
      const missing = events.filter((event) => !destination.enabled_events?.includes(event));
      if (missing.length) destination = await client.v2.core.eventDestinations.update(destination.id,
        { enabled_events: [...new Set([...(destination.enabled_events || []), ...events])] });
      if (destination.status === "disabled") destination = await client.v2.core.eventDestinations.enable(destination.id);
    }
    if (!safeId(destination.id, "ed_test_") || destination.livemode !== false || destination.status !== "enabled")
      throw new Error("Stripe did not confirm an enabled test destination. Reconcile setup in Stripe.");
    const output = { id: destination.id, created, secretEnvironment: kind === "snapshot" ? "STRIPE_WEBHOOK_SECRET" : "STRIPE_THIN_WEBHOOK_SECRET" };
    if (printSecrets && created && /^whsec_[A-Za-z0-9]+$/.test(destination.webhook_endpoint?.signing_secret || ""))
      output.signingSecret = destination.webhook_endpoint.signing_secret;
    else output.secretSource = "Stripe Dashboard; signing secrets are not retrieved or persisted by this tool";
    result.destinations[kind] = output;
  }
  return result;
}

async function main(args = process.argv.slice(2), env = process.env, output = process.stdout, errors = process.stderr) {
  if (args.includes("--help")) {
    output.write("Usage: node tools/stripe-setup.js --url https://your-public-host [--print-secrets]\nTest mode only. Secrets are never written to files. Existing signing secrets are available in Stripe Dashboard.\n");
    return 0;
  }
  try {
    const urlIndex = args.indexOf("--url");
    if (urlIndex < 0 || !args[urlIndex + 1] || args.filter((argument) => argument === "--url").length !== 1 ||
        args.filter((argument, index) => index !== urlIndex + 1).some((argument) => !["--url", "--print-secrets"].includes(argument)))
      throw new Error("Invalid arguments");
    publicEndpoint(args[urlIndex + 1]);
    const key = testKey(env), Stripe = require("stripe");
    const base = env.STRIPE_API_BASE ? new URL(env.STRIPE_API_BASE) : null;
    // API override is only the local fake server; never send a key to an arbitrary host.
    if (base && (base.protocol !== "http:" || base.hostname !== "127.0.0.1" || base.username || base.password || base.pathname !== "/" || base.search || base.hash))
      throw new Error("Invalid test API override");
    const client = new Stripe(key, { maxNetworkRetries: 2, timeout: 20000,
      ...(base ? { host: base.hostname, port: Number(base.port), protocol: "http" } : {}) });
    const result = await setup({ client, publicUrl: args[urlIndex + 1], printSecrets: args.includes("--print-secrets"), apiVersion: Stripe.API_VERSION });
    output.write(JSON.stringify(result, null, 2) + "\n");
    return 0;
  } catch {
    // Stripe errors may echo keys, webhook secrets or request data. Only fixed text crosses this boundary.
    errors.write("Stripe test setup failed. Check URL, test key permissions, method eligibility and destination ownership in Stripe Dashboard. No provider error or secret was printed.\n");
    return 1;
  }
}
if (require.main === module) main().then((code) => { process.exitCode = code; });
module.exports = { main, setup, publicEndpoint, testKey, SNAPSHOT_EVENTS, THIN_EVENTS };
