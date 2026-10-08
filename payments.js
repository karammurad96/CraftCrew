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
const detached = (value) => value === undefined ? undefined : JSON.parse(JSON.stringify(value));
const KEY_RE = /^(sk|rk)_(test|live)_/;

module.exports = function createPayments(ctx) {
  const { getDb, save, send, now, activity, inbox, commit, commitStripe } = ctx;
  const atomic = require("./stripe-commit");
  const env = ctx.env || process.env;
  const key = String(env.STRIPE_SECRET_KEY || "").trim();
  const enabled = KEY_RE.test(key);
  const live = /^(sk|rk)_live_/.test(key);
  if (key && !enabled) throw new Error("STRIPE_SECRET_KEY is not a Stripe secret or restricted key.");
  if (live && env.PAYMENTS_LIVE !== "1")
    throw new Error("A live Stripe key needs PAYMENTS_LIVE=1, set only after the go-live checklist (T280).");
  let client = null;
  if (enabled) {
    inbox?.assertDurability?.(); // Refuse unsupported JSON durability before SDK/provider activity.
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
  if (enabled && (!inbox || typeof commit !== "function" || typeof commitStripe !== "function")) throw new Error("Stripe requires a durable inbox and commit boundary.");
  const gate = ctx.gate || require("./stripe-commit").gate;
  const ownerGate = require("./payment-owner-gate")({ gate, body: ctx.body, commit, send, actor: ctx.ownerActor, refusal: ctx.ownerRefusal });
  const handlers = new Map(), active = new Map();
  const events = () => (getDb().stripeEvents ||= []);
  const state = () => (getDb().meta ||= {}, (getDb().meta.stripe ||= {}));

  let initialization = null;
  function initialize() {
    if (!initialization) initialization = gate.run(async () => {
      if (!state().inboxMigrated) {
        await require("./stripe-inbox").importInbox(inbox, events());
        state().inboxMigrated = true;
      }
      getDb().stripeEvents = (await inbox.recent(20)).map(display);
      await commit();
    }).catch((error) => { initialization = null; throw error; });
    return initialization;
  }
  const display = (record) => ({ ...record, handled: record.state === "handled" });
  function remember(record) {
    getDb().stripeEvents = [display(record), ...events().filter((e) => e.id !== record.id)].slice(0, 20);
  }
  // Provider preparation is outside the gate; stage() is synchronous and changes only its explicit stage.
  function on(type, handler) {
    if (typeof type !== "string" || !type || !handler || typeof handler !== "object" ||
        typeof handler.stage !== "function" || ["AsyncFunction", "GeneratorFunction", "AsyncGeneratorFunction"].includes(handler.stage.constructor?.name) || (handler.prepare !== undefined && typeof handler.prepare !== "function") ||
        (handler.afterCommit !== undefined && typeof handler.afterCommit !== "function"))
      throw new Error("Stripe handlers require transaction-aware staging");
    if (!handlers.has(type)) handlers.set(type, []);
    handlers.get(type).push(Object.freeze({ ...handler }));
  }
  async function repair(record, receipt) {
    const result = await inbox.update({ ...record, state: "handled", handledAt: receipt.handledAt });
    remember(result);
    return result;
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
    const identity = { id: event.id, type: event.type, kind: thin ? "thin" : "snapshot", livemode: !!event.livemode };
    // Claim before the first await: signed identical deliveries share the entire durable outcome.
    const pending = active.get(identity.id);
    if (pending) {
      try { atomic.match(pending.identity, identity); }
      catch { return send(res, 400, { error: "Invalid signature" }); }
      const result = await pending.result;
      return send(res, result.status, { ...result.body, ...(result.status === 200 ? { duplicate: true } : {}) });
    }
    const result = Promise.resolve().then(() => processEvent(event, identity, thin))
      .catch(() => ({ status: 503, body: { error: "Could not save. Please try again." } }));
    active.set(identity.id, { identity, result });
    try {
      const outcome = await result;
      return send(res, outcome.status, outcome.body);
    } finally { active.delete(identity.id); }
  }
  async function processEvent(event, identity, thin) {
    let record;
    try {
      await initialize();
      const duplicate = await gate.run(async () => {
        ownerGate.healthy();
        record = await inbox.receive({ ...identity, receivedAt: now(), state: "received", attempts: 0 });
        try { atomic.match(record, identity); }
        catch { const error = new Error("Stripe event identity mismatch"); error.identity = true; throw error; }
        const receipt = atomic.applied(getDb(), identity);
        if (receipt) { await repair(record, receipt); return true; }
        if (record.state === "handled") return true; // Historical completed events predate receipts.
        // No active owner exists for this verified redelivery. Metadata alone cannot replay the event;
        // use its fresh signed payload and retain prior fixed diagnosis when resuming interrupted work.
        const interrupted = record.state === "processing"
          ? { errorCode: record.errorCode || "interrupted", failedAt: record.failedAt || now() } : {};
        if (record.attempts >= Number.MAX_SAFE_INTEGER) throw new Error("Stripe attempts exhausted");
        record = await inbox.update({ ...record, ...interrupted, state: "processing", processingAt: now(), attempts: record.attempts + 1 });
        remember(record);
        Object.assign(state(), { lastEventAt: now(), lastEventType: event.type });
        return false;
      });
      if (duplicate) return { status: 200, body: { received: true, duplicate: true } };
    } catch (error) { return { status: error?.identity ? 400 : 503,
      body: { error: error?.identity ? "Invalid signature" : "Could not save. Please try again." } }; }
    const registered = [...(handlers.get(event.type) || [])], prepared = [], transitions = [];
    let committed = null, errorCode = "handler_failed";
    try {
      for (const handler of registered) prepared.push(handler.prepare
        ? await handler.prepare(detached(thin ? event.related_object : event.data?.object), detached(event)) : undefined);
      committed = await gate.run(async () => {
        ownerGate.healthy();
        const stage = atomic.createStage(), existing = atomic.applied(getDb(), identity);
        if (!existing) for (let index = 0; index < registered.length; index++) {
          const transition = registered[index].stage({ stage, prepared: prepared[index],
            object: detached(thin ? event.related_object : event.data?.object), event: detached(event) });
          if (transition && typeof transition.then === "function") {
            Promise.resolve(transition).catch(() => {});
            throw new Error("Stripe staging must be synchronous");
          }
          if (transition && typeof transition.next === "function") throw new Error("Stripe staging must execute synchronously");
          transitions.push(transition);
        }
        errorCode = "storage_failed";
        return commitStripe({ getDb, event: { ...identity, handledAt: now() }, stage });
      });
    } catch {
      try {
        await gate.run(async () => {
          // An uncertain storage failure never permits a business retry without durable receipt proof.
          record = await inbox.update({ ...record, state: "failed", failedAt: now(), errorCode });
          remember(record);
          state().lastError = { at: now(), message: errorCode === "handler_failed" ? "Webhook handler failed" : "Webhook storage failed" };
        });
      } catch {}
      return { status: errorCode === "handler_failed" ? 500 : 503,
        body: { error: errorCode === "handler_failed" ? "Handler failed" : "Could not save. Please try again." } };
    }
    // Durable listeners run after releasing the gate; they cannot cause retries of committed effects.
    if (committed.applied) for (let index = 0; index < registered.length; index++) {
      try { await registered[index].afterCommit?.(transitions[index]); }
      catch { console.error("Stripe committed listener failed"); }
    }
    try { await gate.run(() => repair(record, committed.receipt)); }
    catch { return { status: 503, body: { error: "Could not save. Please try again." } }; }
    return { status: 200, body: { received: true, ...(!committed.applied ? { duplicate: true } : {}) } };
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
