/* T283a: durable metadata-only identities for one logical Stripe operation. */
const crypto = require("node:crypto");
const { isDeepStrictEqual: equal } = require("node:util");
const atomic = require("./stripe-commit");

const clone = (value) => (value === undefined ? undefined : structuredClone(value));
const safe = (value, depth = 0) => {
  if (depth > 2) return undefined;
  if (value === null || ["number", "boolean"].includes(typeof value)) return value;
  if (typeof value === "string") return value.slice(0, 500);
  if (Array.isArray(value)) return value.slice(0, 20).map((item) => safe(item, depth + 1));
  if (typeof value === "object") return Object.fromEntries(Object.entries(value).slice(0, 30).filter(([key]) => !/(secret|token|password|payload|raw|private|idempotency)/i.test(key)).map(([key, item]) => [String(key).slice(0, 80), safe(item, depth + 1)]));
  return undefined;
};
const keyFor = (logicalKey) => crypto.createHash("sha256").update(String(logicalKey)).digest("hex");
const operationId = (logicalKey) => `stripe-op-${keyFor(logicalKey).slice(0, 40)}`;
const idempotencyKey = (logicalKey) => `craftcrew-op-${keyFor(logicalKey)}`;
const statuses = new Set(["pending", "succeeded", "failed", "unknown"]);

module.exports = function createOperations(ctx) {
  const { getDb, commitStage, gate, now = () => new Date().toISOString() } = ctx;
  const sharedGate = gate || atomic.gate;
  const ensure = () => {
    const db = getDb();
    db.stripeOperations ||= [];
    return db.stripeOperations;
  };
  const get = (logicalKey) => clone(ensure().find((row) => row.id === operationId(logicalKey)));
  async function reserve(input) {
    const logicalKey = String(input.logicalKey || "");
    if (!logicalKey || logicalKey.length > 300) throw new Error("Invalid Stripe operation identity");
    return sharedGate.run(async () => {
      const rows = ensure(), id = operationId(logicalKey), existing = rows.find((row) => row.id === id);
      const binding = { kind: String(input.kind || "").slice(0, 80), ownerId: String(input.ownerId || "").slice(0, 120), amountMinor: input.amountMinor, currency: input.currency || "eur" };
      if (existing) {
        for (const field of ["kind", "ownerId", "amountMinor", "currency"])
          if (existing[field] !== binding[field]) throw new Error("Stripe operation identity conflict");
        return clone(existing);
      }
      const at = now(), record = { id, logicalKeyHash: keyFor(logicalKey), ...binding, idempotencyKey: idempotencyKey(logicalKey), status: "pending", providerRef: null, providerType: null, metadata: safe(input.metadata || {}), createdAt: at, updatedAt: at, attempts: 0 };
      const stage = atomic.createStage(); stage.add("stripeOperations", record);
      await commitStage({ getDb, stage });
      return clone(record);
    });
  }
  function record(input) {
    const logicalKey = String(input.logicalKey || "");
    if (!logicalKey || logicalKey.length > 300) throw new Error("Invalid Stripe operation identity");
    const rows = ensure(), id = operationId(logicalKey), existing = rows.find((row) => row.id === id);
    if (existing) {
      const binding = { kind: String(input.kind || "").slice(0, 80), ownerId: String(input.ownerId || "").slice(0, 120), amountMinor: input.amountMinor, currency: input.currency || "eur" };
      for (const field of Object.keys(binding)) if (existing[field] !== binding[field]) throw new Error("Stripe operation identity conflict");
      return clone(existing);
    }
    const at = now();
    return { id, logicalKeyHash: keyFor(logicalKey), kind: String(input.kind || "").slice(0, 80), ownerId: String(input.ownerId || "").slice(0, 120), amountMinor: input.amountMinor, currency: input.currency || "eur", idempotencyKey: idempotencyKey(logicalKey), status: "pending", providerRef: null, providerType: null, metadata: safe(input.metadata || {}), createdAt: at, updatedAt: at, attempts: 0 };
  }
  function stageAdd(stage, recordValue) {
    if (!ensure().some((row) => row.id === recordValue.id)) stage.add("stripeOperations", recordValue);
  }
  function referenceBinding(current, result) {
    if (result.providerRef === undefined) return;
    const ref = result.providerRef;
    if ((current.providerRef && current.providerRef !== ref) || (current.providerType && result.providerType && current.providerType !== result.providerType) ||
        (ref && ensure().some((row) => row.id !== current.id && row.providerRef === ref)) ||
        (ref && (getDb().stripeFinancialRecords || []).some((row) => row.operationId !== current.id && row.providerRef === ref)))
      throw new Error("Checkout needs reconciliation before a new payment attempt. Contact an administrator.");
  }
  function stageOutcome(stage, operation, result = {}) {
    referenceBinding(ensure().find((row) => row.id === operation.id) || operation, result);
    const status = String(result.status || "");
    if (!statuses.has(status)) throw new Error("Invalid Stripe operation outcome");
    const fields = { status, updatedAt: now(), attempts: Number(operation.attempts || 0) + 1 };
    if (result.providerRef !== undefined) fields.providerRef = result.providerRef == null ? null : String(result.providerRef).slice(0, 200);
    if (result.providerType !== undefined) fields.providerType = String(result.providerType).slice(0, 80);
    if (result.errorCode !== undefined) fields.errorCode = String(result.errorCode).slice(0, 120);
    const addition = stage.additions.find((item) => item.collection === "stripeOperations" && item.record.id === operation.id);
    if (addition) Object.assign(addition.record, fields);
    else if (ensure().some((row) => row.id === operation.id)) stage.patch("stripeOperations", operation.id, fields, { status: operation.status, idempotencyKey: operation.idempotencyKey, providerRef: operation.providerRef, providerType: operation.providerType });
    else { const next = { ...operation, ...fields }; stage.add("stripeOperations", next); }
  }
  async function outcome(operation, result = {}) {
    const status = String(result.status || "");
    if (!statuses.has(status)) throw new Error("Invalid Stripe operation outcome");
    return sharedGate.run(async () => {
      const rows = ensure(), current = rows.find((row) => row.id === operation.id);
      if (!current) throw new Error("Stripe operation identity missing");
      referenceBinding(current, result);
      const rank = { pending: 0, failed: 1, unknown: 2, succeeded: 3 };
      if (rank[status] < rank[current.status] || current.status === "succeeded") return clone(current);
      const stage = atomic.createStage(), fields = { status, updatedAt: now(), attempts: Number(current.attempts || 0) + 1 };
      if (result.providerRef !== undefined) fields.providerRef = result.providerRef == null ? null : String(result.providerRef).slice(0, 200);
      if (result.providerType !== undefined) fields.providerType = String(result.providerType).slice(0, 80);
      if (result.errorCode !== undefined) fields.errorCode = String(result.errorCode).slice(0, 120);
      stage.patch("stripeOperations", current.id, fields, { status: current.status, idempotencyKey: current.idempotencyKey });
      await commitStage({ getDb, stage });
      return clone(rows.find((row) => row.id === operation.id));
    });
  }
  const unknownError = (error) => !!error && (["ETIMEDOUT", "ECONNRESET", "ECONNREFUSED", "ENOTFOUND", "EAI_AGAIN", "StripeConnectionError", "StripeAPIError"].includes(error.code) || ["StripeConnectionError", "StripeAPIError"].includes(error.type) || Number(error.statusCode) >= 500 || /timeout|timed out|socket hang up|connection reset/i.test(String(error.message || "")));
  async function call(operation, work, providerType, options = {}) {
    let result;
    try {
      result = await work(operation.idempotencyKey);
    } catch (error) {
      try { await outcome(operation, { status: unknownError(error) ? "unknown" : "failed", errorCode: unknownError(error) ? "provider_timeout" : "provider_rejected" }); } catch {}
      throw error;
    }
    // An accepted provider request is not rejected because local persistence failed.
    // Monetary callers publish success only with the linked financial stage.
    const persisted = await outcome(operation, { status: options.deferSuccess ? "unknown" : "succeeded", providerRef: result?.id, providerType });
    Object.assign(operation, persisted);
    return result;
  }
  // Stripe can prune v1 keys after 24h. Keep a conservative one-hour margin.
  async function resolve(operation, adapter) {
    const refuse = () => { throw new Error("Checkout needs reconciliation before a new payment attempt. Contact an administrator."); };
    const check = async (value) => {
      if (!value?.id || !(await adapter.match(value)) || ensure().some((row) => row.id !== operation.id && row.providerRef === value.id) || (getDb().stripeFinancialRecords || []).some((row) => row.operationId !== operation.id && row.providerRef === value.id)) refuse();
      return value;
    };
    let result;
    if (operation.providerRef) { result = await check(await adapter.retrieve(operation.providerRef)); if (result.id !== operation.providerRef) refuse(); }
    else {
      const dates = [operation.createdAt, ...(adapter.startedAt !== undefined ? [adapter.startedAt] : [])].map(Date.parse);
      if (dates.some((date) => !Number.isFinite(date) || date > Date.parse(now()))) refuse();
      const age = Date.parse(now()) - Math.min(...dates);
      if (!Number.isFinite(age) || age < 0) refuse();
      if (age < 23 * 3600000) return check(await call(operation, adapter.create, adapter.type, { deferSuccess: true }));
      if (!adapter.list || ensure().some((row) => row.id !== operation.id && !row.providerRef && row.kind === operation.kind && row.ownerId === operation.ownerId && row.amountMinor === operation.amountMinor && row.currency === operation.currency && equal(row.metadata, operation.metadata))) refuse();
      let cursor, complete = false; const seen = new Set(), matches = new Map();
      for (let page = 0; page < 10; page++) {
        const response = await adapter.list({ limit: 100, ...(cursor ? { starting_after: cursor } : {}) });
        if (!response || !Array.isArray(response.data) || typeof response.has_more !== "boolean" || response.data.length > 100) refuse();
        for (const item of response.data) {
          if (!item?.id || seen.has(item.id)) refuse();
          seen.add(item.id);
          if (await adapter.match(item)) matches.set(item.id, item);
        }
        if (!response.has_more) { complete = true; break; }
        const next = response.data.at(-1)?.id;
        if (!next || next === cursor) refuse();
        cursor = next;
      }
      if (!complete || matches.size !== 1) refuse();
      const ref = [...matches.keys()][0];
      result = await check(await adapter.retrieve(ref));
      if (result.id !== ref) refuse();
    }
    const persisted = await outcome(operation, { status: "unknown", providerRef: result.id, providerType: adapter.type });
    Object.assign(operation, persisted);
    return result;
  }
  return { ensure, get, record, stageAdd, stageOutcome, reserve, outcome, call, resolve, unknownError, operationId, idempotencyKey };
};

module.exports.operationId = operationId;
module.exports.idempotencyKey = idempotencyKey;
