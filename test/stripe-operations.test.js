const test = require("node:test");
const assert = require("node:assert/strict");
const atomic = require("../stripe-commit");
const createOperations = require("../stripe-operations");

function fixture() {
  const db = { stripeOperations: [] }, gate = atomic.createGate();
  const commitStage = async ({ stage }) => { atomic.validate(db, stage); atomic.publish(db, stage); };
  return { db, operations: createOperations({ getDb: () => db, commitStage, gate, now: () => "2026-10-09T00:00:00.000Z" }) };
}

test("T283a reserves one stable operation identity under concurrent attempts", async () => {
  const f = fixture();
  const [one, two] = await Promise.all([
    f.operations.reserve({ kind: "refund", logicalKey: "refund:payment:100", ownerId: "customer", amountMinor: 100, metadata: { invoiceId: "inv", payload: "must-not-persist" } }),
    f.operations.reserve({ kind: "refund", logicalKey: "refund:payment:100", ownerId: "customer", amountMinor: 100 }),
  ]);
  assert.equal(one.id, two.id); assert.equal(one.idempotencyKey, two.idempotencyKey); assert.equal(f.db.stripeOperations.length, 1);
  assert.equal(f.db.stripeOperations[0].metadata.payload, undefined);
  assert.equal(f.db.stripeOperations[0].status, "pending");
});

test("T283a keeps provider reference and monotonic outcome across retry", async () => {
  const f = fixture(), op = await f.operations.reserve({ kind: "checkout_session", logicalKey: "checkout:payment", ownerId: "customer", amountMinor: 1200 });
  await f.operations.outcome(op, { status: "unknown", errorCode: "provider_timeout" });
  await f.operations.outcome(op, { status: "succeeded", providerRef: "cs_test_1", providerType: "checkout_session" });
  await f.operations.outcome(op, { status: "failed", errorCode: "late_failure" });
  assert.deepEqual(f.db.stripeOperations[0], { ...f.db.stripeOperations[0], status: "succeeded", providerRef: "cs_test_1", providerType: "checkout_session", errorCode: "provider_timeout", attempts: 2 });
});

test("T283a identifies connection timeouts as unknown, not failed", () => {
  const f = fixture();
  assert.equal(f.operations.unknownError(Object.assign(new Error("socket hang up"), { code: "ECONNRESET" })), true);
  assert.equal(f.operations.unknownError(new Error("invalid amount")), false);
});

test("T283a staged identities reject changed amounts and strip deeply nested secrets", async () => {
  const f = fixture();
  await f.operations.reserve({ kind: "refund", logicalKey: "refund:one", ownerId: "buyer", amountMinor: 100,
    metadata: { nested: { nested: { secret: "must-not-persist" } } } });
  assert.throws(() => f.operations.record({ kind: "refund", logicalKey: "refund:one", ownerId: "buyer", amountMinor: 200 }), /conflict/);
  assert.equal(JSON.stringify(f.db.stripeOperations).includes("must-not-persist"), false);
});

test("T283a timeout after provider acceptance preserves the operation key across restart", async () => {
  const f = fixture();
  const input = { kind: "refund", logicalKey: "refund:payment:100", ownerId: "buyer", amountMinor: 100 };
  const operation = await f.operations.reserve(input), keys = [];
  await assert.rejects(f.operations.call(operation, async (key) => {
    keys.push(key);
    throw Object.assign(new Error("timed out after acceptance"), { type: "StripeConnectionError" });
  }, "refund"));
  assert.equal(f.db.stripeOperations[0].status, "unknown");
  const restored = structuredClone(f.db);
  const restarted = createOperations({ getDb: () => restored, gate: atomic.createGate(), commitStage: async ({ stage }) => {
    atomic.validate(restored, stage); atomic.publish(restored, stage);
  } });
  const retry = await restarted.reserve(input);
  await restarted.call(retry, async (key) => { keys.push(key); return { id: "re_accepted" }; }, "refund");
  assert.equal(keys[0], keys[1]);
  assert.equal(restored.stripeOperations.length, 1);
  assert.equal(restored.stripeOperations[0].providerRef, "re_accepted");
});

test("T283b1 accepted provider result remains unknown until the linked commit and local failure is not rejection", async () => {
  const f = fixture(), op = await f.operations.reserve({ kind: "refund", logicalKey: "refund:deferred", ownerId: "buyer", amountMinor: 100 });
  await f.operations.call(op, async () => ({ id: "re_known" }), "refund", { deferSuccess: true });
  assert.equal(op.status, "unknown"); assert.equal(op.providerRef, "re_known");
  let commits = 0;
  const failing = createOperations({ getDb: () => f.db, gate: atomic.createGate(), commitStage: async () => { commits++; throw new Error("local I/O refusal"); } });
  await assert.rejects(failing.call(op, async () => ({ id: "re_known" }), "refund", { deferSuccess: true }), /local I\/O/);
  assert.equal(commits, 1); assert.equal(f.db.stripeOperations[0].status, "unknown");
});

test("T283b1 first reference publication failure retains pending intent and retries its original key", async () => {
  const f = fixture(), op = await f.operations.reserve({ kind: "refund", logicalKey: "refund:first-local-failure", ownerId: "buyer", amountMinor: 100 });
  const original = structuredClone(op), keys = []; let commits = 0;
  const failing = createOperations({ getDb: () => f.db, gate: atomic.createGate(), commitStage: async () => { commits++; throw new Error("local I/O refusal"); } });
  await assert.rejects(failing.call(op, async (key) => { keys.push(key); return { id: "re_accepted" }; }, "refund", { deferSuccess: true }), /local I\/O/);
  assert.equal(commits, 1); assert.deepEqual(f.db.stripeOperations[0], original);
  const retry = await f.operations.reserve({ kind: "refund", logicalKey: "refund:first-local-failure", ownerId: "buyer", amountMinor: 100 });
  await f.operations.call(retry, async (key) => { keys.push(key); return { id: "re_accepted" }; }, "refund", { deferSuccess: true });
  assert.deepEqual(keys, [original.idempotencyKey, original.idempotencyKey]);
  assert.equal(f.db.stripeOperations[0].status, "unknown"); assert.equal(f.db.stripeOperations[0].providerRef, "re_accepted");
});

test('T283c2 staged outcomes cannot regress succeeded or unknown operations', async () => {
  for (const [before, after] of [['succeeded', 'unknown'], ['succeeded', 'failed'], ['unknown', 'failed']]) {
    const f = fixture(), op = await f.operations.reserve({ kind: 'refund', logicalKey: `monotonic:${before}:${after}`, ownerId: 'buyer', amountMinor: 100 });
    await f.operations.outcome(op, { status: before, providerRef: 're_original', providerType: 'refund' });
    const current = f.operations.get(`monotonic:${before}:${after}`), stage = atomic.createStage();
    f.operations.stageOutcome(stage, current, { status: after, providerRef: 're_original', providerType: 'refund' });
    atomic.validate(f.db, stage); atomic.publish(f.db, stage); assert.equal(f.db.stripeOperations[0].status, before); assert.equal(f.db.stripeOperations[0].providerRef, 're_original');
  }
  const existing = fixture(), reserved = await existing.operations.reserve({ kind: 'refund', logicalKey: 'existing-staged', ownerId: 'buyer', amountMinor: 100 }), updates = atomic.createStage();
  existing.operations.stageOutcome(updates, reserved, { status: 'succeeded', providerRef: 're_existing' }); existing.operations.stageOutcome(updates, reserved, { status: 'unknown', providerRef: 're_existing' });
  atomic.validate(existing.db, updates); atomic.publish(existing.db, updates); assert.equal(existing.db.stripeOperations[0].status, 'succeeded');
  const f = fixture(), stage = atomic.createStage(), op = f.operations.record({ kind: 'refund', logicalKey: 'staged-new', ownerId: 'buyer', amountMinor: 100 });
  f.operations.stageAdd(stage, op); f.operations.stageOutcome(stage, op, { status: 'succeeded', providerRef: 're_staged' }); f.operations.stageOutcome(stage, op, { status: 'failed' });
  atomic.validate(f.db, stage); atomic.publish(f.db, stage); assert.equal(f.db.stripeOperations[0].status, 'succeeded');
});
