/* T282b1a: local stages never mutate the live database. Callers share the mutation gate. */
const { metadata } = require('./stripe-inbox');
const { isDeepStrictEqual: equal } = require('node:util');
const clone = (value) => JSON.parse(JSON.stringify(value));
function createGate() {
  let tail = Promise.resolve();
  return { run(work) { const result = tail.then(work); tail = result.catch(() => {}); return result; } };
}
function receipt(event) {
  if (!event || !['snapshot', 'thin'].includes(event.kind) || typeof event.livemode !== 'boolean')
    throw new Error('Invalid Stripe applied receipt identity');
  const m = metadata(event);
  if (m.kind !== event.kind) throw new Error('Invalid Stripe applied receipt identity');
  return { id: m.id, type: m.type, kind: m.kind, livemode: m.livemode, handledAt: m.handledAt || new Date().toISOString() };
}
function match(existing, incoming) {
  if (existing && ['id', 'type', 'kind', 'livemode'].some((key) => existing[key] !== incoming[key]))
    throw new Error('Stripe applied receipt identity mismatch');
  return existing;
}
function applied(data, event) {
  const r = receipt(event), records = data?.meta?.stripe?.appliedReceipts;
  return match(records && Object.hasOwn(records, r.id) ? records[r.id] : null, r);
}
function retain(previous, next) {
  for (const old of Object.values(previous?.meta?.stripe?.appliedReceipts || {})) {
    const kept = applied(next, old);
    if (!kept || !equal(receipt(kept), receipt(old))) throw new Error('Stripe applied receipts cannot be removed or changed');
  }
}
function backup(previous, incoming, existing, imported = []) {
  retain(previous, incoming);
  const data = clone(incoming), records = require('./stripe-inbox').fold([...existing, ...imported]);
  delete data.stripeWebhookInbox;
  const byId = new Map(records.map((record) => [record.id, record]));
  for (const [id, applied] of Object.entries(data.meta?.stripe?.appliedReceipts || {})) {
    if (typeof applied.handledAt !== 'string' || !Number.isFinite(Date.parse(applied.handledAt)))
      throw new Error('Invalid Stripe backup receipt timestamp');
    const identity = receipt(applied), ledger = byId.get(id);
    if (id !== identity.id || !ledger) throw new Error('Stripe backup receipt has no identity');
    match(ledger, identity);
    // JSON can commit the receipt before its sidecar display is completed; the receipt proves application.
    if (ledger.state !== 'handled') Object.assign(ledger, { state: 'handled', handledAt: identity.handledAt });
  }
  return { data, records };
}
function createStage() {
  return { patches: [], additions: [],
    patch(collection, id, fields, expected = {}) { this.patches.push({ collection, id, fields: clone(fields), expected: clone(expected) }); },
    add(collection, record) { this.additions.push({ collection, record: clone(record) }); },
  };
}
function validate(data, stage) {
  for (const p of stage.patches) {
    const rows = data[p.collection], matches = Array.isArray(rows) ? rows.filter((r) => r.id === p.id) : [];
    if (matches.length !== 1 || Object.entries(p.expected).some(([key, value]) => !equal(matches[0][key], value)))
      throw new Error('Stripe staged record conflict');
    if (Object.hasOwn(p.fields, 'id') || Object.keys(p.fields).some((k) => ['__proto__', 'constructor', 'prototype'].includes(k)))
      throw new Error('Invalid Stripe staged fields');
  }
  const ids = new Set();
  for (const { collection, record } of stage.additions) {
    const key = collection + '\t' + record.id;
    if (!Array.isArray(data[collection]) || typeof record.id !== 'string' || !record.id || ids.has(key) || data[collection].some((r) => r.id === record.id))
      throw new Error('Duplicate Stripe staged record identity');
    ids.add(key);
  }
}
function publish(data, stage, committed) {
  for (const p of stage.patches) Object.assign(data[p.collection].find((r) => r.id === p.id), clone(p.fields));
  for (const a of stage.additions) data[a.collection].unshift(clone(a.record));
  data.meta ||= {}; data.meta.stripe ||= {};
  data.meta.stripe.appliedReceipts = { ...data.meta.stripe.appliedReceipts, [committed.id]: committed };
}
function prepare(data, stage, event) {
  validate(data, stage);
  const prepared = createStage();
  for (const p of stage.patches) {
    const current = data[p.collection].find((r) => r.id === p.id);
    prepared.patch(p.collection, p.id, p.fields, p.expected);
    // Also protect the fields that the stage will replace while the writer awaits I/O.
    prepared.patches.at(-1).expected = { ...p.expected };
    for (const key of Object.keys(p.fields)) prepared.patches.at(-1).expected[key] = current[key] === undefined ? undefined : clone(current[key]);
  }
  prepared.additions = clone(stage.additions);
  const committed = receipt(event), snapshot = clone(data);
  publish(snapshot, prepared, committed);
  return { stage: prepared, snapshot, receipt: committed };
}
module.exports = { createGate, gate: createGate(), createStage, receipt, match, applied, retain, backup, prepare, validate, publish };
