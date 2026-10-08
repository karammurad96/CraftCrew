/*
 * Payments with Stripe (Wave 18). T270: the foundation.
 *
 * - Off unless STRIPE_SECRET_KEY is set. Keys come only from the environment (or the host's secret store), never
 *   from the code, the repository or the database. A restricted key (rk_…) is preferred over a secret key (sk_…).
 * - Test mode only: a live key (sk_live_ / rk_live_) is refused unless PAYMENTS_LIVE=1 (set by Karam after T280).
 * - One StripeClient instance with the SDK's pinned API version. STRIPE_API_BASE points it at a fake Stripe in tests.
 * - Webhooks: POST /api/stripe/webhook, raw body, signature checked with STRIPE_WEBHOOK_SECRET; every event is
 *   persisted in the store inbox before processing. db.stripeEvents holds bounded display metadata only.
 * - Keys never appear in logs, errors or API answers.
 *
 * T271: suppliers' connected accounts (payouts.js). Accounts v2 sends thin events (`v2.core.event`, only the
 * related object's id) to an event destination with its own signing secret, STRIPE_THIN_WEBHOOK_SECRET; both
 * kinds arrive at the same endpoint.
 */
const KEY_RE = /^(sk|rk)_(test|live)_/;

module.exports = function createPayments(ctx) {
  const { getDb, save, send, now, activity, inbox, commit } = ctx;
  const env = ctx.env || process.env;
  const key = String(env.STRIPE_SECRET_KEY || "").trim();
  const enabled = KEY_RE.test(key);
  const live = /^(sk|rk)_live_/.test(key);
  if (key && !enabled) throw new Error("STRIPE_SECRET_KEY is not a Stripe secret or restricted key.");
  if (live && env.PAYMENTS_LIVE !== "1")
    throw new Error("A live Stripe key needs PAYMENTS_LIVE=1, set only after the go-live checklist (T280).");
  let client = null;
  if (enabled) {
    const Stripe = require("stripe"),
      base = env.STRIPE_API_BASE ? new URL(env.STRIPE_API_BASE) : null;
    client = new Stripe(key, {
      maxNetworkRetries: 2,
      timeout: 20000,
      appInfo: { name: "CraftCrew", url: "https://github.com/karammurad96/CraftCrew" },
      ...(base ? { host: base.hostname, port: Number(base.port) || (base.protocol === "https:" ? 443 : 80), protocol: base.protocol.replace(":", "") } : {}),
    });
  }
  const webhookSecret = String(env.STRIPE_WEBHOOK_SECRET || "").trim(),
    thinSecret = String(env.STRIPE_THIN_WEBHOOK_SECRET || "").trim(),
    publishableKey = enabled ? String(env.STRIPE_PUBLISHABLE_KEY || "").trim() : "";
  if (enabled && (!inbox || typeof commit !== "function")) throw new Error("Stripe requires a durable inbox and commit boundary.");
  const gate = ctx.gate || require("./stripe-commit").gate;
  const ownerGate = require("./payment-owner-gate")({ gate, body: ctx.body, commit, send, actor: ctx.ownerActor, refusal: ctx.ownerRefusal });
  const handlers = new Map();
  const events = () => (getDb().stripeEvents ||= []);
  const state = () => (getDb().meta ||= {}, (getDb().meta.stripe ||= {}));

  let initialization = null;
  function initialize() {
    if (!initialization) initialization = (async () => {
      if (!state().inboxMigrated) {
        await require("./stripe-inbox").importInbox(inbox, events());
        state().inboxMigrated = true;
      }
      getDb().stripeEvents = (await inbox.recent(20)).map(display);
      await commit();
    })().catch((error) => { initialization = null; throw error; });
    return initialization;
  }
  const display = (record) => ({ ...record, handled: record.state === "handled" });
  function remember(record) {
    getDb().stripeEvents = [display(record), ...events().filter((e) => e.id !== record.id)].slice(0, 20);
  }
  // Later tasks register what an event does: on("checkout.session.completed", async (object, event) => …)
  function on(type, fn) {
    if (!handlers.has(type)) handlers.set(type, []);
    handlers.get(type).push(fn);
  }
  function readRaw(req) {
    return new Promise((resolve, reject) => {
      const chunks = [];
      let size = 0;
      req.on("data", (c) => {
        size += c.length;
        if (size > 1e6) req.destroy();
        else chunks.push(c);
      });
      req.on("end", () => resolve(Buffer.concat(chunks)));
      req.on("error", reject);
    });
  }
  async function webhook(req, res) {
    if (!enabled || (!webhookSecret && !thinSecret)) return send(res, 404, { error: "Not found" });
    const raw = await readRaw(req),
      header = req.headers["stripe-signature"] || "";
    // A thin event (Accounts v2) carries only the related object's id; a snapshot event carries the object
    let thin = false;
    try {
      thin = JSON.parse(raw.toString("utf8"))?.object === "v2.core.event";
    } catch {}
    let event = null;
    const secret = thin ? thinSecret : webhookSecret;
    if (secret) try {
      event = thin ? client.parseEventNotification(raw, header, secret) : client.webhooks.constructEvent(raw, header, secret);
    } catch {}
    if (!event) {
      state().lastError = { at: now(), message: "Signature check failed" };
      return send(res, 400, { error: "Invalid signature" });
    }
    // Unknown legacy livemode remains compatible; an explicit opposite mode cannot mutate this environment.
    if (typeof event.livemode === "boolean" && event.livemode !== live)
      return send(res, 400, { error: "Invalid signature" });
    let record;
    try {
      await initialize();
      record = await inbox.receive({ id: event.id, type: event.type, kind: thin ? "thin" : "snapshot",
        livemode: !!event.livemode, receivedAt: now(), state: "received", attempts: 0 });
      if (record.type !== event.type || record.kind !== (thin ? "thin" : "snapshot") || record.livemode !== !!event.livemode)
        return send(res, 400, { error: "Invalid signature" });
      if (record.state === "handled") return send(res, 200, { received: true, duplicate: true });
      // Child b adds identical-delivery serialization and atomic local-handler publication.
      if (record.state === "processing") return send(res, 503, { error: "Could not save. Please try again." });
      record = await inbox.update({ ...record, state: "processing", processingAt: now(), attempts: record.attempts + 1 });
      remember(record);
      Object.assign(state(), { lastEventAt: now(), lastEventType: event.type });
    } catch {
      return send(res, 503, { error: "Could not save. Please try again." });
    }
    try {
      for (const fn of handlers.get(event.type) || []) await fn(thin ? event.related_object : event.data?.object, event);
    } catch {
      state().lastError = { at: now(), message: "Webhook handler failed" };
      try {
        record = await inbox.update({ ...record, state: "failed", failedAt: now(), errorCode: "handler_failed" });
        remember(record);
        await commit();
      } catch { return send(res, 503, { error: "Could not save. Please try again." }); }
      console.error("Stripe webhook handler failed:", event.type);
      return send(res, 500, { error: "Handler failed" });
    }
    try {
      // Commit local updates before the durable handled marker. Child b makes these one atomic boundary.
      await commit();
      record = await inbox.update({ ...record, state: "handled", handledAt: now() });
      remember(record);
      save();
    } catch {
      try {
        record = await inbox.update({ ...record, state: "failed", failedAt: now(), errorCode: "storage_failed" });
        remember(record);
      } catch {}
      return send(res, 503, { error: "Could not save. Please try again." });
    }
    return send(res, 200, { received: true });
  }
  // What the admin sees: never the key itself
  function status() {
    const s = state();
    return {
      enabled,
      mode: !enabled ? "off" : live ? "live" : "test",
      keyType: !enabled ? null : key.startsWith("rk_") ? "restricted" : "secret",
      publishableKey,
      webhook: { configured: !!webhookSecret, thinConfigured: !!thinSecret, lastEventAt: s.lastEventAt || null, lastEventType: s.lastEventType || null, lastError: s.lastError || null },
      account: s.account || null,
      events: events().slice(0, 20),
    };
  }
  // T271: the suppliers' connected accounts
  const payouts = require("./payouts")({ ...ctx, gate, ownerHealthy: ownerGate.healthy, client, enabled, publishableKey, on });
  async function handle(req, res, url, parts, user) {
    if (await payouts.handle(req, res, url, parts, user)) return true;
    if (parts[1] !== "admin" || parts[2] !== "stripe") return false;
    if (user.role !== "admin") return (send(res, 403, { error: "Admin only" }), true);
    if (enabled) try { await initialize(); } catch { return (send(res, 503, { error: "Could not save. Please try again." }), true); }
    // Check the connection: the platform's own Stripe account
    if (parts[3] === "check" && req.method === "POST") {
      if (!enabled) return (send(res, 409, { error: "Payments are off: no Stripe key is set." }), true);
      try {
        const a = await client.accounts.retrieve();
        state().account = { id: a.id, country: a.country, name: a.settings?.dashboard?.display_name || a.business_profile?.name || "", checkedAt: now() };
        activity(user, "Stripe connection checked");
        save();
      } catch (e) {
        state().lastError = { at: now(), message: "Connection check failed: " + String(e.message || e).slice(0, 200) };
        save();
        return (send(res, 502, { error: "Stripe could not be reached. Check the key and the network." }), true);
      }
    }
    return (send(res, 200, { stripe: status() }), true);
  }
  // The page needs Stripe.js / Connect.js only when payments are on (T270, CSP)
  const cspSources = () =>
    enabled
      ? { script: "https://js.stripe.com https://connect-js.stripe.com", frame: "https://*.stripe.com", connect: "https://api.stripe.com https://*.stripe.com", img: "https://*.stripe.com" }
      : null;

  return { enabled, live, client, on, webhook, handle, status, cspSources, payouts, withOwnerMutation: ownerGate.mutation, withOwnerGate: ownerGate.run };
};
module.exports.KEY_RE = KEY_RE;
