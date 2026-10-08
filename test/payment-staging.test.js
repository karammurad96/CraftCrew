const { test } = require("node:test");
const assert = require("node:assert/strict");
const Stripe = require("stripe");
const { startFakeStripe, KEY } = require("./fake-stripe");
const { buildMail, buildTemplateMail, buildNotification } = require("../payment-notifications");
const { captureBinding, prepareRefresh, stageRefresh, runPostCommit } = require("../payout-staging");
const { createStage, validate } = require("../stripe-commit");
const locales = require("../locales");
const clone = (x) => JSON.parse(JSON.stringify(x));
function fixture(language = "en") {
  let counter = 0;
  const data = { suppliers: [{ id: "sup", company: "Supplier", stripeAccount: { id: "acct_fake1", transfers: "pending", createdAt: "old" } }],
    users: [{ id: "member", role: "supplier", supplierId: "sup", orgOwnerId: "owner", email: "member@example.test" },
      { id: "owner", role: "supplier", supplierId: "sup", email: "OWNER@example.test", language, notificationPrefs: { projects: true, invoices: true } }], notifications: [], outbox: [] };
  return { data, options: { id: (prefix) => `${prefix}_${++counter}`, now: () => "2026-10-08T10:00:00.000Z", appUrl: "https://example.test", mailEnabled: true } };
}
const active = (id = "acct_fake1") => ({ id, configuration: { recipient: { capabilities: { stripe_balance: { stripe_transfers: { status: "active" } } } } } });
const prepared = (data, account = active()) => ({ binding: captureBinding(data, "sup"), account });

test("notification builder preserves recipient language, preference, explicit link and distinct IDs without mutation", () => {
  for (const language of ["en", "de"]) {
    const { data, options } = fixture(language), before = clone(data), extra = { projectId: "project", details: { safe: true } };
    const result = buildNotification({ userId: "owner", spec: { key: "payoutsActive" }, link: "/supplier/payouts", extra }, { data, ...options });
    assert.deepEqual(data, before);
    assert.equal(result.notifications[0].text, locales.notifyText({ key: "payoutsActive" }, language));
    assert.equal(result.notifications[0].userId, "owner");
    assert.equal(result.notifications[0].link, "/supplier/payouts");
    assert.equal(result.outbox[0].to, "owner@example.test");
    assert.notEqual(result.notifications[0].id, result.outbox[0].id);
    assert.ok(result.outbox[0].body.includes("https://example.test/#/supplier/payouts"));
    result.notifications[0].details.safe = false;
    assert.equal(extra.details.safe, true);
    data.users[1].notificationPrefs = {};
    assert.equal(buildNotification({ userId: "owner", spec: { key: "payoutsActive" } }, { data, ...options }).outbox.length, 0);
  }
});

test("notification builder keeps legacy fallback links and category routing and creates no mail without recipient/email", () => {
  const { data, options } = fixture();
  const routes = [["A new message", "/supplier/messages", "messages"], ["Invoice payment received", "/supplier/invoices", "invoices"],
    ["A new document", "/supplier/projects", "documents"], ["A new bid", "/supplier/bids", "bids"],
    ["Time entry submitted", "/supplier/time", "time"], ["Project updated", "/supplier/inbox", "projects"]];
  for (const [spec, link, category] of routes) {
    data.users[1].notificationPrefs = { [category]: true };
    const result = buildNotification({ userId: "owner", spec }, { data, ...options });
    assert.equal(result.notifications[0].link, link);
    assert.equal(result.outbox.length, 1);
  }
  assert.deepEqual(buildNotification({ spec: "None" }, { data, ...options }), { notifications: [], outbox: [] });
  assert.equal(buildNotification({ userId: "missing", spec: "None" }, { data, ...options }).outbox.length, 0);
  delete data.users[1].email;
  assert.equal(buildNotification({ userId: "owner", spec: "Project changed" }, { data, ...options }).outbox.length, 0);
  assert.throws(() => buildNotification({ userId: "owner", spec: "None", extra: { userId: "member" } }, { data, ...options }), /identity/);
});

test("mail builders preserve status, size limits, language and English-only configured subject without pruning", () => {
  const { data, options } = fixture();
  data.outbox = Array.from({ length: 2001 }, (_, i) => ({ id: `pending${i}`, status: "Queued" }));
  const before = clone(data);
  const mail = buildMail({ to: "A@EXAMPLE.TEST", template: "notice", subject: "x".repeat(301), body: "y".repeat(4001) }, { ...options, mailEnabled: false });
  assert.equal(mail.subject.length, 300); assert.equal(mail.body.length, 4000);
  assert.equal(mail.status, "Not sent — no mail server configured"); assert.equal(mail.attempts, 0);
  assert.equal(buildMail({ to: "", subject: "None" }, options), null);
  const common = { to: "owner@example.test", name: "verifyEmail", params: { name: "Owner", link: "https://example.test/verify" } };
  const configured = { ...options, settings: { emailTemplates: { verifyEmail: "Approved\r\nsubject" } } };
  assert.equal(buildTemplateMail({ ...common, recipient: "en" }, configured).subject, "Approved subject");
  assert.notEqual(buildTemplateMail({ ...common, recipient: "de" }, configured).subject, "Approved subject");
  assert.deepEqual(data, before);
});

test("provider preparation uses fake Stripe outside staging and binds detached account and actual persisted main owner", async () => {
  const fake = await startFakeStripe();
  try {
    fake.accounts.set("acct_fake1", { id: "acct_fake1", transfers: "active" });
    const { data, options } = fixture(), before = clone(data), url = new URL(fake.base);
    const client = new Stripe(KEY, { host: url.hostname, port: Number(url.port), protocol: "http" });
    const result = await prepareRefresh({ getDb: () => data, supplierId: "sup", client });
    assert.equal(result.binding.ownerId, "owner"); assert.equal(result.account.id, "acct_fake1");
    assert.deepEqual(data, before); assert.equal(fake.calls.length, 1);
    const stage = createStage();
    stageRefresh({ getDb: () => data, prepared: result, stage, ...options });
    assert.equal(fake.calls.length, 1); assert.deepEqual(data, before);
    result.binding.account.transfers = "modified";
    assert.equal(data.suppliers[0].stripeAccount.transfers, "pending");
  } finally { await fake.stop(); }
});

test("provider failure/mismatched identity never stages or mutates local records", async () => {
  for (const retrieve of [async () => { throw new Error("provider unavailable"); }, async () => active("wrong")]) {
    const { data } = fixture(), before = clone(data);
    await assert.rejects(prepareRefresh({ getDb: () => data, supplierId: "sup", client: { v2: { core: { accounts: { retrieve } } } } }));
    assert.deepEqual(data, before);
  }
});

test("staging re-finds latest DB after replacement and uses current recipient preferences", () => {
  const original = fixture(), result = prepared(original.data), data = clone(original.data), stage = createStage();
  data.users[1].language = "de"; data.users[1].email = "new@example.test";
  const transition = stageRefresh({ getDb: () => data, prepared: result, stage, ...original.options });
  assert.equal(stage.patches[0].fields.stripeAccount.transfers, "active");
  assert.equal(stage.patches[0].fields.stripeAccount.createdAt, "old");
  assert.equal(stage.additions.find((x) => x.collection === "outbox").record.to, "new@example.test");
  assert.equal(stage.additions.find((x) => x.collection === "notifications").record.text, locales.notifyText({ key: "payoutsActive" }, "de"));
  transition.supplier.company = "changed";
  assert.equal(data.suppliers[0].company, "Supplier");
  assert.equal(original.data.suppliers[0].stripeAccount.transfers, "pending");
  assert.equal(data.suppliers[0].stripeAccount.transfers, "pending");
  validate(data, stage);
});

test("account, owner and full binding races fail with supplied stage untouched", () => {
  const changes = [
    (d) => { d.suppliers[0].stripeAccount.id = "other"; },
    (d) => { d.suppliers[0].stripeAccount.updatedAt = "other"; },
    (d) => { d.users[1].id = "new-owner"; },
    (d) => { d.users[1].role = "customer"; },
    (d) => { d.users[1].orgOwnerId = "other-owner"; },
    (d) => { d.users.push({ ...d.users[1], id: "duplicate" }); },
    (d) => { d.suppliers.push(clone(d.suppliers[0])); },
    (d) => { d.suppliers = []; },
  ];
  for (const change of changes) {
    const { data, options } = fixture(), result = prepared(data), stage = createStage();
    stage.add("notifications", { id: "prior" }); change(data);
    const before = clone(data), staged = clone(stage);
    assert.throws(() => stageRefresh({ getDb: () => data, prepared: result, stage, ...options }), /binding/);
    assert.deepEqual(data, before); assert.deepEqual(stage.patches, staged.patches); assert.deepEqual(stage.additions, staged.additions);
  }
});

test("late staging and ID collision failures leave provided stage and live records unchanged", () => {
  for (const override of [{ id: () => { throw new Error("ID failed"); } }, { id: () => "collision" }]) {
    const { data, options } = fixture(), stage = createStage(), before = clone(data), result = prepared(data);
    stage.add("notifications", { id: "collision" }); const staged = clone(stage);
    assert.throws(() => stageRefresh({ getDb: () => data, prepared: result, stage, ...options, ...override }));
    assert.deepEqual(data, before); assert.deepEqual(stage.patches, staged.patches); assert.deepEqual(stage.additions, staged.additions);
  }
});

test("unchanged and pending capabilities retain legacy notification semantics", () => {
  for (const [before, after, notices, changed] of [["active", "active", 0, false], ["restricted", "pending", 0, true], ["active", "restricted", 1, true], [undefined, "restricted", 0, true]]) {
    const { data, options } = fixture(); if (before === undefined) delete data.suppliers[0].stripeAccount.transfers; else data.suppliers[0].stripeAccount.transfers = before;
    const account = active(); account.configuration.recipient.capabilities.stripe_balance.stripe_transfers.status = after;
    const stage = createStage(), transition = stageRefresh({ getDb: () => data, prepared: prepared(data, account), stage, ...options });
    assert.equal(stage.additions.filter((x) => x.collection === "notifications").length, notices);
    assert.equal(transition.changed, changed);
  }
});

test("postcommit listeners receive detached copies, failures are isolated, and unchanged transitions skip them", async () => {
  const { data, options } = fixture(), before = clone(data), stage = createStage();
  const transition = stageRefresh({ getDb: () => data, prepared: prepared(data), stage, ...options });
  const called = [], diagnostics = [];
  await runPostCommit(transition, [async (supplier) => { supplier.company = "bad"; called.push(1); throw new Error("secret error never forwarded"); }, async (supplier) => { assert.equal(supplier.company, "Supplier"); called.push(2); }], (code) => diagnostics.push(code));
  assert.deepEqual(called, [1, 2]); assert.deepEqual(diagnostics, ["stripe_payout_listener_failed"]);
  assert.deepEqual(data, before); assert.equal(transition.supplier.company, "Supplier");
  await runPostCommit({ ...transition, changed: false }, [() => assert.fail("not changed")]);
  await runPostCommit(transition, [() => { throw new Error("failure"); }, () => called.push(3)], async () => { throw new Error("report failed"); });
  assert.equal(called.at(-1), 3);
});
