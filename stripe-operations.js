/* T283a: durable metadata-only identities for one logical Stripe operation. */
const crypto = require("node:crypto");
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
  function stageOutcome(stage, operation, result = {}) {
    const status = String(result.status || "");
    if (!statuses.has(status)) throw new Error("Invalid Stripe operation outcome");
    const fields = { status, updatedAt: now(), attempts: Number(operation.attempts || 0) + 1 };
    if (result.providerRef !== undefined) fields.providerRef = result.providerRef == null ? null : String(result.providerRef).slice(0, 200);
    if (result.providerType !== undefined) fields.providerType = String(result.providerType).slice(0, 80);
    if (result.errorCode !== undefined) fields.errorCode = String(result.errorCode).slice(0, 120);
    const addition = stage.additions.find((item) => item.collection === "stripeOperations" && item.record.id === operation.id);
    if (addition) Object.assign(addition.record, fields);
    else if (ensure().some((row) => row.id === operation.id)) stage.patch("stripeOperations", operation.id, fields, { status: operation.status, idempotencyKey: operation.idempotencyKey });
    else { const next = { ...operation, ...fields }; stage.add("stripeOperations", next); }
  }
  async function outcome(operation, result = {}) {
    const status = String(result.status || "");
    if (!statuses.has(status)) throw new Error("Invalid Stripe operation outcome");
    return sharedGate.run(async () => {
      const rows = ensure(), current = rows.find((row) => row.id === operation.id);
      if (!current) throw new Error("Stripe operation identity missing");
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
  return { ensure, get, record, stageAdd, stageOutcome, reserve, outcome, call, unknownError, operationId, idempotencyKey };
};

module.exports.operationId = operationId;
module.exports.idempotencyKey = idempotencyKey;
