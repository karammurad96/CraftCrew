const { describe, it } = require("node:test");
const assert = require("node:assert/strict");
const fs = require("fs");
const os = require("os");
const path = require("path");
const { Readable } = require("node:stream");
const { execFileSync } = require("node:child_process");
const { openStore } = require("../store");
const { importInbox } = require("../stripe-inbox");
const createPayments = require("../payments");
const { startFakeStripe, KEY } = require("./fake-stripe");
let serial = 0;
const request = (event) => Object.assign(Readable.from([Buffer.from(event.payload)]), { headers: { "stripe-signature": event.header } });
const entry = (id, state = "received") => ({ id, type: "test.event", kind: "snapshot", livemode: false, state, attempts: 0, receivedAt: "2026-10-07T10:00:00.000Z" });
async function fixture(kind, test) {
  const dataDir = fs.mkdtempSync(path.join(os.tmpdir(), "craftcrew-inbox-"));
  let admin, url, schema, store, fake;
  try {
    if (kind === "postgres") {
      admin = new (require("pg").Client)({ connectionString: process.env.DATABASE_URL });
      await admin.connect();
      schema = `inbox_${process.pid}_${++serial}`;
      await admin.query(`create schema ${schema}`);
      const parsed = new URL(process.env.DATABASE_URL);
      parsed.searchParams.set("options", `-c search_path=${schema}`);
      url = parsed.toString();
    }
    const open = () => openStore({ kind, dataDir, url });
    store = open();
    let db = store.loadSync() || { meta: {}, stripeEvents: [] };
    fake = await startFakeStripe();
    fake.env.STRIPE_THIN_WEBHOOK_SECRET = "whsec_thin";
    const sent = [];
    const makePayments = () => createPayments({ inbox: store.stripeInbox, commitStage: (job) => store.commitStage(job), commitStripe: (job) => store.commitStripe(job), getDb: () => db,
      save() {}, commit: async () => { store.save(db); await store.flush(); },
      send: (res, status, body) => sent.push({ status, body }), now: () => new Date().toISOString(),
      activity() {}, env: fake.env });
    let payments = makePayments();
    const ctx = {
      kind, dataDir, fake, sent, admin, schema, url,
      get store() { return store; }, get db() { return db; }, get payments() { return payments; },
      async deliver(id, type = "test.event", extra = {}) { await payments.webhook(request(fake.signed({ id, type, ...extra })), {}); return sent.at(-1); },
      async restart() { await store.close?.(); store = open(); db = store.loadSync(); payments = makePayments(); },
    };
    await test(ctx);
  } finally {
    await store?.close?.(); await fake?.stop();
    if (schema) await admin.query(`drop schema ${schema} cascade`);
    await admin?.end(); fs.rmSync(dataDir, { recursive: true, force: true });
  }
}
for (const kind of ["json", "postgres"]) describe(`durable Stripe inbox (${kind})`, { skip: kind === "postgres" && !process.env.DATABASE_URL && "needs DATABASE_URL" }, () => {
  it("initializes and restarts an empty inbox without mistaking it for a missing backup", async () => fixture(kind, async (c) => {
    await c.payments.handle({ method: "GET" }, {}, null, ["api", "admin", "stripe"], { role: "admin" });
    assert.equal(c.sent.at(-1).status, 200);
    assert.equal(c.db.meta.stripe.inboxMigrated, true);
    assert.equal((await c.store.stripeInbox.export()).length, 0);
    await c.restart();
    assert.equal((await c.deliver("evt_after_empty_restart")).status, 200);
  }));
  it("persists verified processing identity before handlers and keeps only sanitized metadata", async () => fixture(kind, async (c) => {
    c.payments.on("test.event", { prepare: async () => {
      const durable = await c.store.stripeInbox.get("evt_before");
      assert.equal(durable.state, "processing"); assert.equal(durable.attempts, 1);
    }, stage() {} });
    const result = await c.deliver("evt_before", "test.event", { data: { object: { secret: KEY, number: "4242424242424242" } } });
    assert.equal(result.status, 200);
    const record = await c.store.stripeInbox.get("evt_before");
    assert.equal(record.state, "handled"); assert.ok(record.handledAt);
    assert.doesNotMatch(JSON.stringify(record), /424242|sk_test|secret|data|payload/);
    await c.restart(); assert.equal((await c.deliver("evt_before")).body.duplicate, true);
  }));
  it("does not rerun an old identity after 2001 later events, restart and display trimming", async () => fixture(kind, async (c) => {
    let calls = 0;
    c.payments.on("test.event", { stage: () => calls++ });
    await c.deliver("evt_old");
    for (let n = 0; n < 2001; n++) assert.equal((await c.deliver(`evt_later_${n}`)).status, 200);
    assert.equal(calls, 2002); assert.equal(c.db.stripeEvents.length, 20);
    await c.restart(); c.payments.on("test.event", { stage: () => calls++ });
    assert.equal((await c.deliver("evt_old")).body.duplicate, true); assert.equal(calls, 2002);
    assert.equal((await c.store.stripeInbox.export()).length, 2002);
  }));
  it("retains failed work and retries with durable attempts and sanitized errors", async () => fixture(kind, async (c) => {
    let calls = 0;
    c.payments.on("test.event", { stage: () => { if (++calls === 1) throw new Error(KEY); } });
    assert.equal((await c.deliver("evt_failed")).status, 500);
    assert.equal((await c.store.stripeInbox.get("evt_failed")).state, "failed");
    await c.restart(); c.payments.on("test.event", { stage: () => calls++ });
    assert.equal((await c.deliver("evt_failed")).status, 200);
    const record = await c.store.stripeInbox.get("evt_failed");
    assert.equal(record.attempts, 2); assert.equal(record.state, "handled"); assert.equal(calls, 2);
    assert.ok(!JSON.stringify(record).includes(KEY));
  }));
  it("refuses wrong signatures and explicit mode mismatches before creating identities", async () => fixture(kind, async (c) => {
    const bad = c.fake.signed({ id: "evt_bad", type: "test.event" }, "whsec_other");
    await c.payments.webhook(request(bad), {}); assert.equal(c.sent.at(-1).status, 400);
    assert.equal((await c.deliver("evt_wrongmode", "test.event", { livemode: true })).status, 400);
    assert.equal((await c.store.stripeInbox.export()).length, 0);
  }));
  it("a real inbox write failure prevents handler execution and success acknowledgement", async () => fixture(kind, async (c) => {
    // Initialize successfully first, then fail the actual identity writer rather than the handler.
    await c.deliver("evt_initialize");
    let calls = 0; c.payments.on("test.event", { stage: () => calls++ });
    if (kind === "json") {
      fs.renameSync(path.join(c.dataDir, "stripe-webhooks"), path.join(c.dataDir, "ledger-kept"));
      fs.writeFileSync(path.join(c.dataDir, "stripe-webhooks"), "blocked");
    } else {
      await c.admin.query(`create function ${c.schema}.fail_inbox() returns trigger language plpgsql as $$ begin raise exception 'inbox unavailable'; end $$`);
      await c.admin.query(`create trigger fail_inbox before insert on ${c.schema}.stripe_webhook_inbox for each row execute function ${c.schema}.fail_inbox()`);
    }
    assert.equal((await c.deliver("evt_storage_failed")).status, 503); assert.equal(calls, 0);
    if (kind === "json") {
      fs.unlinkSync(path.join(c.dataDir, "stripe-webhooks")); fs.renameSync(path.join(c.dataDir, "ledger-kept"), path.join(c.dataDir, "stripe-webhooks"));
    } else await c.admin.query(`drop trigger fail_inbox on ${c.schema}.stripe_webhook_inbox`);
    assert.equal(await c.store.stripeInbox.get("evt_storage_failed"), null);
    assert.equal((await c.deliver("evt_storage_failed")).status, 200); assert.equal(calls, 1);
  }));
  it("completion storage failure never acknowledges success and retains retriable identity", async () => fixture(kind, async (c) => {
    const update = c.store.stripeInbox.update.bind(c.store.stripeInbox);
    c.store.stripeInbox.update = async (record) => {
      if (record.state === "handled") throw new Error("simulated completion write failure");
      return update(record);
    };
    assert.equal((await c.deliver("evt_completion_failed")).status, 503);
    assert.ok(c.db.meta.stripe.appliedReceipts.evt_completion_failed, "business application has a durable receipt even if bookkeeping fails");
    c.store.stripeInbox.update = update;
    assert.equal((await c.deliver("evt_completion_failed")).status, 200);
  }));
  it("rejects legacy and asynchronous handlers before registration", async () => fixture(kind, async (c) => {
    assert.throws(() => c.payments.on("test.event", () => {}), /transaction-aware/);
    assert.throws(() => c.payments.on("test.event", { stage: async () => {} }), /transaction-aware/);
    assert.throws(() => c.payments.on("test.event", { *stage() {} }), /transaction-aware/);
    assert.throws(() => c.payments.on("test.event", { async *stage() {} }), /transaction-aware/);
  }));
  it("all handlers stage together: a later throw publishes no fields, notice, mail or receipt", async () => fixture(kind, async (c) => {
    Object.assign(c.db, { suppliers: [{ id: "sup", stripeAccount: { id: "acct", transfers: "pending" } }], notifications: [], outbox: [] });
    let failing = true, callbacks = 0;
    c.payments.on("test.event", { stage({ stage }) {
      stage.patch("suppliers", "sup", { stripeAccount: { id: "acct", transfers: "active" } });
      stage.add("notifications", { id: "notice" }); stage.add("outbox", { id: "mail", status: "Queued" });
    }, afterCommit() { callbacks++; } });
    c.payments.on("test.event", { stage() { if (failing) throw new Error(KEY); } });
    assert.equal((await c.deliver("evt_atomic_handlers")).status, 500);
    assert.equal(c.db.suppliers[0].stripeAccount.transfers, "pending");
    assert.deepEqual(c.db.notifications, []); assert.deepEqual(c.db.outbox, []);
    assert.equal(c.db.meta.stripe.appliedReceipts?.evt_atomic_handlers, undefined); assert.equal(callbacks, 0);
    failing = false; assert.equal((await c.deliver("evt_atomic_handlers")).status, 200);
    assert.equal(c.db.notifications.length, 1); assert.equal(c.db.outbox.length, 1); assert.equal(callbacks, 1);
    await c.restart(); assert.equal(c.db.suppliers[0].stripeAccount.transfers, "active");
    assert.equal((await c.deliver("evt_atomic_handlers")).body.duplicate, true); assert.equal(callbacks, 1);
  }));
  it("receipt repairs interrupted completion after restart without preparing, staging or notifying again", async () => fixture(kind, async (c) => {
    c.db.notifications = []; let provider = 0, stages = 0, callbacks = 0;
    const handler = { prepare() { provider++; }, stage({ stage }) { stages++; stage.add("notifications", { id: "repaired_notice" }); },
      afterCommit() { callbacks++; throw new Error(KEY); } };
    c.payments.on("test.event", handler);
    const update = c.store.stripeInbox.update.bind(c.store.stripeInbox);
    c.store.stripeInbox.update = (record) => record.state === "handled" ? Promise.reject(new Error("sidecar refused")) : update(record);
    assert.equal((await c.deliver("evt_receipt_repair")).status, 503);
    assert.deepEqual([provider, stages, callbacks], [1, 1, 1]);
    await c.restart(); c.payments.on("test.event", handler);
    assert.equal((await c.deliver("evt_receipt_repair")).body.duplicate, true);
    assert.deepEqual([provider, stages, callbacks], [1, 1, 1]);
    assert.equal(c.db.notifications.length, 1);
    assert.equal((await c.store.stripeInbox.get("evt_receipt_repair")).state, "handled");
  }));
  it("actual strict store failure publishes no staged fields/mail and verified retry applies once", async () => fixture(kind, async (c) => {
    Object.assign(c.db, { notifications: [], outbox: [] });
    await c.deliver("evt_fault_initialize"); let callbacks = 0;
    c.payments.on("test.event", { stage({ stage }) { stage.add("notifications", { id: "fault_notice" }); stage.add("outbox", { id: "fault_mail", status: "Queued" }); },
      afterCommit() { callbacks++; } });
    if (kind === "json") fs.mkdirSync(path.join(c.dataDir, "db.json.tmp"));
    else {
      await c.admin.query(`create function ${c.schema}.refuse_notice() returns trigger language plpgsql as $$ begin if new.collection='notifications' then raise exception 'notice refused'; end if; return new; end $$`);
      await c.admin.query(`create trigger refuse_notice before insert or update on ${c.schema}.records for each row execute function ${c.schema}.refuse_notice()`);
    }
    assert.equal((await c.deliver("evt_store_refused")).status, 503);
    assert.deepEqual(c.db.notifications, []); assert.deepEqual(c.db.outbox, []); assert.equal(callbacks, 0);
    assert.equal(c.db.meta.stripe.appliedReceipts?.evt_store_refused, undefined);
    if (kind === "json") fs.rmdirSync(path.join(c.dataDir, "db.json.tmp"));
    else await c.admin.query(`drop trigger refuse_notice on ${c.schema}.records`);
    assert.equal((await c.deliver("evt_store_refused")).status, 200); assert.equal(callbacks, 1);
    assert.equal(c.db.outbox.length, 1); await c.restart(); assert.equal(c.db.notifications.length, 1);
  }));
  it("thin preparation holds no gate and rejects changed owner or imported account bindings", async () => fixture(kind, async (c) => {
    const account = await c.payments.client.v2.core.accounts.create({ dashboard: "express" });
    for (const change of ["owner", "account"]) {
      Object.assign(c.db, { suppliers: [{ id: "sup", stripeAccount: { id: account.id, transfers: "pending" } }],
        users: [{ id: "owner", role: "supplier", supplierId: "sup", email: "owner@example.test" }], notifications: [], outbox: [] });
      let entered, release;
      const entering = new Promise((resolve) => entered = resolve), waiting = new Promise((resolve) => release = resolve);
      const retrieve = c.payments.client.v2.core.accounts.retrieve.bind(c.payments.client.v2.core.accounts);
      c.payments.client.v2.core.accounts.retrieve = async (...args) => { const result = await retrieve(...args); entered(); await waiting; return result; };
      const type = "v2.core.account.updated", signed = c.fake.signedThin({ id: `evt_binding_${change}`, type,
        related_object: { id: account.id, type: "v2.core.account" } }, c.fake.env.STRIPE_THIN_WEBHOOK_SECRET);
      const pending = c.payments.webhook(request(signed), {}); await entering;
      await c.payments.withOwnerGate(() => {
        if (change === "owner") Object.assign(c.db.users[0], { id: "replacement_owner", email: "replacement@example.test" });
        else c.db.suppliers[0].stripeAccount = { id: "acct_replacement", transfers: "pending" };
      });
      release(); await pending; c.payments.client.v2.core.accounts.retrieve = retrieve;
      assert.equal(c.sent.at(-1).status, 500);
      assert.deepEqual(c.db.notifications, []); assert.deepEqual(c.db.outbox, []);
      assert.equal(c.db.meta.stripe.appliedReceipts?.[`evt_binding_${change}`], undefined);
      assert.equal(c.db.suppliers[0].stripeAccount.transfers, "pending");
    }
  }));
  it("committed callbacks run outside the gate, isolate throws and suppress duplicate callbacks", async () => fixture(kind, async (c) => {
    let callbacks = 0;
    c.payments.on("test.event", { stage() {}, async afterCommit() {
      await c.payments.withOwnerGate(() => { callbacks++; }); throw new Error(KEY);
    } });
    assert.equal((await c.deliver("evt_listener")).status, 200);
    assert.equal((await c.deliver("evt_listener")).body.duplicate, true); assert.equal(callbacks, 1);
  }));
  it("a receipt arriving during preparation suppresses staging and applied:false listeners", async () => fixture(kind, async (c) => {
    const identity = { id: "evt_late_receipt", type: "test.event", kind: "snapshot", livemode: false, handledAt: new Date().toISOString() };
    c.payments.on("test.event", {
      async prepare() { await c.payments.withOwnerGate(() => c.store.commitStripe({ getDb: () => c.db, event: identity, stage: require("../stripe-commit").createStage() })); },
      stage() { assert.fail("an already applied receipt must not stage again"); },
      afterCommit() { assert.fail("applied:false must not notify"); },
    });
    assert.equal((await c.deliver(identity.id)).body.duplicate, true);
    assert.equal((await c.store.stripeInbox.get(identity.id)).state, "handled");
    assert.equal((await c.deliver(identity.id, "different.event")).status, 400);
    assert.equal(c.db.meta.stripe.appliedReceipts[identity.id].type, "test.event");
  }));
  it("uniquely stores identities and merges backups with handled state dominant", async () => fixture(kind, async (c) => {
    const ledger = c.store.stripeInbox;
    await Promise.all([ledger.receive(entry("evt_unique")), ledger.receive(entry("evt_unique"))]);
    assert.equal((await ledger.export()).length, 1);
    await importInbox(ledger, [entry("evt_unique", "handled"), entry("evt_unique", "failed")]);
    await importInbox(ledger, [entry("evt_batch", "failed"), entry("evt_batch", "handled")]);
    await importInbox(ledger, [entry("evt_batch2", "handled"), entry("evt_batch2", "failed")]);
    assert.equal((await ledger.get("evt_batch")).state, "handled");
    assert.equal((await ledger.get("evt_batch2")).state, "handled");
    await assert.rejects(importInbox(ledger, [entry("evt_conflict"), { ...entry("evt_conflict"), kind: "thin" }]), /identity mismatch/);
    await importInbox(ledger, [entry("evt_unique", "failed")]);
    assert.equal((await ledger.get("evt_unique")).state, "handled");
    await ledger.update(entry("evt_unique", "failed"));
    assert.equal((await ledger.get("evt_unique")).state, "handled", "handled is terminal even on a late failed update");
    await assert.rejects(importInbox(ledger, [{ ...entry("evt_unique"), type: "other.type" }]), /identity mismatch/);
    await assert.rejects(ledger.recent(-1), /display limit/);
    if (kind === "postgres") await assert.rejects(c.admin.query(`insert into ${c.schema}.stripe_webhook_inbox(event_id,data) values($1,$2)`, ["evt_unique", JSON.stringify(entry("evt_unique"))]), (e) => e.code === "23505");
  }));
  it("migrates legacy bounded history idempotently and preserves handled records", async () => fixture(kind, async (c) => {
    c.db.stripeEvents = [{ id: "evt_legacy", type: "test.event", handled: true, receivedAt: "2026-10-01T00:00:00Z" }];
    assert.equal((await c.deliver("evt_legacy")).body.duplicate, true);
    await c.restart(); assert.equal((await c.deliver("evt_legacy")).body.duplicate, true);
    assert.equal((await c.store.stripeInbox.export()).length, 1);
  }));
});

it("JSON tar restore and exported db.json hydration preserve the operational ledger", async () => fixture("json", async (c) => {
  await c.deliver("evt_backup");
  const snapshot = await c.store.stripeInbox.export();
  const restored = fs.mkdtempSync(path.join(os.tmpdir(), "craftcrew-inbox-restore-"));
  const archive = path.join(os.tmpdir(), `craftcrew-inbox-${process.pid}.tgz`);
  try {
    execFileSync("tar", ["czf", archive, "-C", c.dataDir, "."]);
    execFileSync("tar", ["xzf", archive, "-C", restored]);
    const store = openStore({ kind: "json", dataDir: restored });
    assert.equal((await store.stripeInbox.get("evt_backup")).state, "handled");
    fs.rmSync(path.join(restored, "stripe-webhooks"), { recursive: true });
    store.save({ ...c.db, stripeWebhookInbox: [...snapshot, { ...snapshot[0], state: "failed" }] });
    assert.equal(store.loadSync().stripeWebhookInbox, undefined);
    assert.equal((await store.stripeInbox.get("evt_backup")).state, "handled");
  } finally { fs.rmSync(restored, { recursive: true, force: true }); fs.rmSync(archive, { force: true }); }
}));

it("corrupt JSON identity fails closed without overwriting it or executing a handler", async () => fixture("json", async (c) => {
  await c.deliver("evt_corrupt");
  const file = path.join(c.dataDir, "stripe-webhooks", require("crypto").createHash("sha256").update("evt_corrupt").digest("hex") + ".json");
  fs.writeFileSync(file, "{damaged");
  let calls = 0; c.payments.on("test.event", { stage: () => calls++ });
  assert.equal((await c.deliver("evt_corrupt")).status, 503);
  assert.equal(calls, 0); assert.equal(fs.readFileSync(file, "utf8"), "{damaged");
}));

it("documented JSON/PostgreSQL tools roundtrip sidecar identities and verify embedded exports", { skip: !process.env.DATABASE_URL && "needs DATABASE_URL" }, async () => fixture("json", async (source) => fixture("postgres", async (target) => {
  source.db.users = [];
  await source.deliver("evt_tool_backup");
  const env = { ...process.env, DATABASE_URL: target.url };
  const input = path.join(source.dataDir, "db.json");
  execFileSync(process.execPath, ["tools/db/import-json.js", input], { env, stdio: "pipe" });
  assert.equal((await target.store.stripeInbox.get("evt_tool_backup")).state, "handled");
  const exported = JSON.parse(execFileSync(process.execPath, ["tools/db/export-json.js"], { env, stdio: ["ignore", "pipe", "pipe"] }));
  assert.equal(exported.stripeWebhookInbox[0].state, "handled");
  const restored = fs.mkdtempSync(path.join(os.tmpdir(), "craftcrew-tool-restore-"));
  try {
    const embedded = path.join(restored, "db.json");
    fs.writeFileSync(embedded, JSON.stringify(exported));
    await target.admin.query(`delete from ${target.schema}.stripe_webhook_inbox`);
    execFileSync(process.execPath, ["tools/db/import-json.js", embedded, "--replace"], { env, stdio: "pipe" });
    assert.equal((await target.store.stripeInbox.get("evt_tool_backup")).state, "handled");
    const json = openStore({ kind: "json", dataDir: restored }); json.loadSync();
    assert.equal((await json.stripeInbox.get("evt_tool_backup")).state, "handled");
    delete exported.stripeWebhookInbox;
    fs.writeFileSync(embedded, JSON.stringify(exported)); fs.rmSync(path.join(restored, "stripe-webhooks"), { recursive: true });
    assert.throws(() => execFileSync(process.execPath, ["tools/db/import-json.js", embedded, "--replace"], { env, stdio: "pipe" }), (e) => /migrated Stripe inbox is missing/.test(String(e.stderr)));
  } finally { fs.rmSync(restored, { recursive: true, force: true }); }
})));

it("portable PostgreSQL export preserves an initialized empty inbox", { skip: !process.env.DATABASE_URL && "needs DATABASE_URL" }, async () => fixture("postgres", async (c) => {
  c.db.users = [];
  await c.payments.handle({ method: "GET" }, {}, null, ["api", "admin", "stripe"], { role: "admin" });
  const exported = JSON.parse(execFileSync(process.execPath, ["tools/db/export-json.js"], { env: { ...process.env, DATABASE_URL: c.url }, stdio: ["ignore", "pipe", "pipe"] }));
  assert.deepEqual(exported.stripeWebhookInbox, []);
  const restored = fs.mkdtempSync(path.join(os.tmpdir(), "craftcrew-empty-inbox-"));
  try {
    fs.writeFileSync(path.join(restored, "db.json"), JSON.stringify(exported));
    const store = openStore({ kind: "json", dataDir: restored });
    assert.equal(store.loadSync().meta.stripe.inboxMigrated, true);
    assert.deepEqual(await store.stripeInbox.export(), []);
    assert.ok(fs.existsSync(path.join(restored, "stripe-webhooks")));
  } finally { fs.rmSync(restored, { recursive: true, force: true }); }
}));

it("historical pre-inbox PostgreSQL exports remain readable, while missing migrated ledgers fail closed", { skip: !process.env.DATABASE_URL && "needs DATABASE_URL" }, async () => fixture("postgres", async (c) => {
  c.db.users = [];
  c.store.save(c.db); await c.store.flush();
  await c.admin.query(`drop table ${c.schema}.stripe_webhook_inbox`);
  const env = { ...process.env, DATABASE_URL: c.url };
  const exported = JSON.parse(execFileSync(process.execPath, ["tools/db/export-json.js"], { env, stdio: ["ignore", "pipe", "pipe"] }));
  assert.equal(exported.stripeWebhookInbox, undefined, "legacy snapshot key shape preserved");
  const checksum = path.join(c.dataDir, "checksums.json");
  execFileSync(process.execPath, ["tools/db/verify.js", "--save", checksum], { env, stdio: "pipe" });
  c.db.meta.stripe = { inboxMigrated: true }; c.store.save(c.db); await c.store.flush();
  for (const args of [["tools/db/export-json.js"], ["tools/db/verify.js", "--save", checksum]])
    assert.throws(() => execFileSync(process.execPath, args, { env, stdio: "pipe" }), (e) => /migrated Stripe inbox is missing/.test(String(e.stderr)));
}));
