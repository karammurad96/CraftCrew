/*
 * The data store (T160): one place that loads and saves the in-memory `db` object.
 *
 *   STORE=json      (default) DATA_DIR/db.json, written whole with a temp file, fsync and rename.
 *   STORE=postgres  PostgreSQL at DATABASE_URL (T162), see store-postgres.js.
 *
 * Every store has the same interface:
 *   loadSync()   the saved data, or null when nothing has been saved yet. A file or database that exists but
 *                cannot be read stops the start-up instead of silently starting empty.
 *   save(data)   starts saving `data` at once. The JSON store has written it when save() returns (and throws
 *                if it could not); other stores take a snapshot and write it in the background.
 *   flush()      resolves when every started save is stored, and rejects if one of them failed.
 *   close()      optional: releases connections.
 *   ping()       optional: rejects when the store cannot be reached (/api/health).
 *   waitsForCommit  true when replies to changes must wait for flush() (server.js).
 *   commitStripe({getDb,event,stage}) strict local commit; returns {receipt,applied}. Callers must hold
 *                stripe-commit.gate through stage construction, commit and publication; all affected
 *                field writers/imports share that gate. Unrelated field writes may continue.
 *   commitStage({getDb,stage}) strict ordinary field publication without an event receipt. Uses the same
 *                mutation gate; an uncertain durable outcome blocks writes until reconciled on restart.
 */
const fs = require("fs");
const path = require("path");

function jsonStore(dataDir, platform) {
  const file = path.join(dataDir, "db.json");
  const atomic = require('./stripe-commit');
  const ledger = require('./stripe-inbox').jsonInbox(dataDir, platform);
  const strict = () => ledger.assertDurability();
  function demoOnly(...snapshots) {
    if (platform !== 'win32') return;
    for (const data of snapshots) {
      if (Object.keys(data?.meta?.stripe?.appliedReceipts || {}).length || data?.stripeEvents?.length || data?.stripeWebhookInbox?.length || data?.stripeOperations?.length || data?.stripeFinancialRecords?.length) strict();
    }
    // Never downgrade an existing durable inbox when the incoming snapshot omits it.
    try { if (fs.readdirSync(path.join(dataDir, 'stripe-webhooks')).some((name) => /^[a-f0-9]{64}\.json(?:\.tmp)?$/.test(name))) strict(); }
    catch (e) { if (e.code !== 'ENOENT') throw e; }
  }
  let blocked = false;
  function directorySync() {
    const fd = fs.openSync(dataDir, 'r');
    try { fs.fsyncSync(fd); } finally { fs.closeSync(fd); }
  }
  function write(data) {
    if (blocked) throw new Error('Stripe commit outcome requires reconciliation');
    fs.mkdirSync(dataDir, { recursive: true });
    const temp = file + '.tmp', fd = fs.openSync(temp, 'w', 0o600);
    try { fs.writeFileSync(fd, JSON.stringify(data)); fs.fsyncSync(fd); } finally { fs.closeSync(fd); }
    fs.renameSync(temp, file);
    if (platform === 'win32') return; // File fsync + rename supports demos, not strict payment durability.
    try { directorySync(); } catch (e) {
      // A visible rename is not sufficient durability proof. Retry only the directory boundary.
      try { directorySync(); } catch { blocked = true; throw e; }
    }
  }
  return {
    kind: "json",
    file,
    stripeInbox: ledger,
    loadSync() {
      let text;
      try {
        text = fs.readFileSync(file, "utf8");
      } catch (e) {
        if (e.code === "ENOENT") return null;
        throw e;
      }
      try {
        const data = JSON.parse(text);
        demoOnly(data);
        if (data.meta?.stripe?.inboxMigrated && data.stripeWebhookInbox === undefined && !fs.existsSync(path.join(dataDir, "stripe-webhooks")))
          throw new Error("The migrated Stripe inbox is missing. Restore the complete data-folder backup.");
        if (data.stripeWebhookInbox !== undefined) {
          this.stripeInbox.restoreSync(data.stripeWebhookInbox);
          delete data.stripeWebhookInbox;
        }
        return data;
      } catch (e) {
        // A damaged file must never be replaced by an empty or demo store
        throw new Error(
          `The data file ${file} cannot be read (${e.message}). Restore it from a backup before starting.`,
        );
      }
    },
    save(data) {
      if (blocked) throw new Error('Stripe commit outcome requires reconciliation');
      let previous;
      try { previous = JSON.parse(fs.readFileSync(file, 'utf8')); } catch (e) { if (e.code !== 'ENOENT') throw e; }
      demoOnly(previous, data);
      atomic.retain(previous, data);
      write(data);
    },
    async commitStripe({ getDb, event, stage }) {
      strict();
      if (blocked) throw new Error('Stripe commit outcome requires reconciliation');
      const ledger = await this.stripeInbox.get(event.id);
      const current = this.loadSync(), existing = atomic.applied(current, event);
      if (existing) return { receipt: existing, applied: false };
      if (!ledger) throw new Error('Stripe inbox identity missing');
      atomic.match(ledger, atomic.receipt(event));
      const input = atomic.prepare(getDb(), stage, event);
      atomic.retain(current, input.snapshot);
      write(input.snapshot);
      atomic.publish(getDb(), input.stage, input.receipt);
      return { receipt: input.receipt, applied: true };
    },
    async commitStage({ getDb, stage }) {
      strict();
      if (blocked) throw new Error('Stripe commit outcome requires reconciliation');
      const current = this.loadSync(), input = atomic.prepareStage(getDb(), stage);
      atomic.retain(current, input.snapshot);
      write(input.snapshot);
      atomic.publish(getDb(), input.stage);
      return { applied: true };
    },
    async importBackup({ data, inbox, publish }) {
      demoOnly(data, { stripeWebhookInbox: inbox });
      if (blocked) throw new Error('Stripe commit outcome requires reconciliation');
      const existing = await this.stripeInbox.export();
      const input = atomic.backup(this.loadSync(), data, existing, inbox);
      // The embedded ledger and business data share one durable file. A failed hydration can recover
      // from that file at startup; block ordinary writes so they cannot discard the embedded ledger.
      write({ ...input.data, stripeWebhookInbox: input.records });
      try { this.stripeInbox.restoreSync(input.records); }
      catch (e) { blocked = true; throw e; }
      publish(input.data);
    },
    async flush() { if (blocked) throw new Error('Stripe commit outcome requires reconciliation'); },
  };
}

// The store this process uses: STORE (json or postgres) and DATA_DIR / DATABASE_URL from the environment.
function openStore({ dataDir, kind = process.env.STORE || "json", url = process.env.DATABASE_URL, platform = process.platform } = {}) {
  if (kind === "json") return jsonStore(dataDir, platform);
  if (kind === "postgres") return require("./store-postgres").postgresStore({ url });
  throw new Error(`Unknown STORE "${kind}": use json or postgres.`);
}

module.exports = { openStore };
