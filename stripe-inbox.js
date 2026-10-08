/* T282a: durable, metadata-only Stripe identities. Single app server; no event payloads. */
const fs = require("fs");
const path = require("path");
const crypto = require("crypto");
const STATES = new Set(["received", "processing", "handled", "failed"]);
const ERROR_CODES = new Set(["handler_failed", "storage_failed", "interrupted"]);
function metadata(input) {
  if (!input || typeof input.id !== "string" || !input.id || input.id.length > 255 ||
      typeof input.type !== "string" || !input.type || input.type.length > 255)
    throw new Error("Invalid Stripe event identity");
  const record = {
    id: input.id, type: input.type,
    kind: input.kind === "thin" || input.type.startsWith("v2.core.") ? "thin" : "snapshot",
    livemode: input.livemode === true,
    state: STATES.has(input.state) ? input.state : input.handled === true ? "handled" : "failed",
    attempts: Number.isSafeInteger(input.attempts) && input.attempts >= 0 ? input.attempts : 0,
  };
  for (const field of ["receivedAt", "processingAt", "handledAt", "failedAt"])
    if (typeof input[field] === "string" && input[field].length <= 40 && Number.isFinite(Date.parse(input[field]))) record[field] = new Date(input[field]).toISOString();
  if (ERROR_CODES.has(input.errorCode)) record.errorCode = input.errorCode;
  return record;
}
function merge(existing, incoming) {
  if (!existing) return incoming;
  if (existing.type !== incoming.type || existing.kind !== incoming.kind || existing.livemode !== incoming.livemode)
    throw new Error("Stripe event backup identity mismatch");
  return existing.state === "handled" || incoming.state !== "handled" ? existing : incoming;
}
function fold(records) {
  if (!Array.isArray(records)) throw new Error("Invalid Stripe inbox backup");
  const identities = new Map();
  for (const record of records.map(metadata)) identities.set(record.id, merge(identities.get(record.id), record));
  return [...identities.values()];
}
function recentLimit(limit) {
  if (!Number.isInteger(limit) || limit < 1 || limit > 100) throw new Error("Invalid Stripe inbox display limit");
  return limit;
}
const ordered = (a, b) => String(b.receivedAt || "").localeCompare(String(a.receivedAt || "")) || a.id.localeCompare(b.id);
function jsonInbox(dataDir) {
  const directory = path.join(dataDir, "stripe-webhooks");
  const filename = (id) => path.join(directory, crypto.createHash("sha256").update(id).digest("hex") + ".json");
  function get(id) {
    try {
      const record = metadata(JSON.parse(fs.readFileSync(filename(id), "utf8")));
      if (record.id !== id) throw new Error("Stripe event identity mismatch");
      return record;
    } catch (e) { if (e.code === "ENOENT") return null; throw e; }
  }
  function prepare() {
    fs.mkdirSync(directory, { recursive: true, mode: 0o700 });
    const parent = fs.openSync(dataDir, "r");
    try { fs.fsyncSync(parent); } finally { fs.closeSync(parent); }
  }
  function write(input) {
    const record = metadata(input);
    prepare();
    const file = filename(record.id), temp = file + ".tmp", fd = fs.openSync(temp, "w", 0o600);
    try { fs.writeSync(fd, JSON.stringify(record)); fs.fsyncSync(fd); } finally { fs.closeSync(fd); }
    fs.renameSync(temp, file);
    const dir = fs.openSync(directory, "r");
    try { fs.fsyncSync(dir); } finally { fs.closeSync(dir); }
    return record;
  }
  function scan(limit) {
    let files;
    try { files = fs.readdirSync(directory); } catch (e) { if (e.code === "ENOENT") return []; throw e; }
    const records = [];
    for (const file of files) {
      if (!/^[a-f0-9]{64}\.json$/.test(file)) continue;
      const record = metadata(JSON.parse(fs.readFileSync(path.join(directory, file), "utf8")));
      if (filename(record.id) !== path.join(directory, file)) throw new Error("Stripe event identity mismatch");
      records.push(record);
      if (limit && records.length > limit) { records.sort(ordered); records.length = limit; }
    }
    return records.sort(ordered);
  }
  return {
    async prepare() { prepare(); },
    async get(id) { return get(id); },
    async receive(input) { const record = metadata(input); return get(record.id) || write(record); },
    async update(input) {
      const record = metadata(input), existing = get(record.id);
      if (!existing) throw new Error("Stripe event identity missing");
      merge(existing, record);
      return existing.state === "handled" ? existing : write(record);
    },
    async recent(limit = 20) { return scan(recentLimit(limit)); },
    restoreSync(records) {
      if (!Array.isArray(records)) throw new Error("Invalid Stripe inbox backup");
      const planned = fold(records).map((record) => merge(get(record.id), record));
      prepare();
      for (const record of planned) write(record);
    },
    async export() { return scan(); },
  };
}
function postgresInbox(getPool) {
  return {
    async get(id) {
      const result = await getPool().query("select data from stripe_webhook_inbox where event_id=$1", [id]);
      return result.rows[0] ? metadata(result.rows[0].data) : null;
    },
    async receive(input) {
      const record = metadata(input);
      await getPool().query("insert into stripe_webhook_inbox(event_id,data) values($1,$2::jsonb) on conflict(event_id) do nothing", [record.id, JSON.stringify(record)]);
      return this.get(record.id);
    },
    async update(input) {
      const record = metadata(input);
      const existing = await this.get(record.id);
      if (!existing) throw new Error("Stripe event identity missing");
      merge(existing, record);
      const result = await getPool().query("update stripe_webhook_inbox set data=$2::jsonb where event_id=$1 and data->>'state' <> 'handled' returning data", [record.id, JSON.stringify(record)]);
      if (!result.rows.length) return this.get(record.id);
      return metadata(result.rows[0].data);
    },
    async recent(limit = 20) {
      const result = await getPool().query("select data from stripe_webhook_inbox order by data->>'receivedAt' desc nulls last, event_id limit $1", [recentLimit(limit)]);
      return result.rows.map((row) => metadata(row.data));
    },
    async export() {
      const result = await getPool().query("select data from stripe_webhook_inbox order by data->>'receivedAt' desc nulls last, event_id");
      return result.rows.map((row) => metadata(row.data));
    },
  };
}
// Restore/export tools read historical snapshots before startup applies newer migrations.
async function exportPostgresInbox(client, data) {
  const result = await client.query("select to_regclass('stripe_webhook_inbox') is not null as present");
  if (!result.rows[0].present) {
    if (data?.meta?.stripe?.inboxMigrated) throw new Error("The migrated Stripe inbox is missing. Restore a complete backup.");
    return [];
  }
  return postgresInbox(() => client).export();
}
async function importInbox(inbox, records = []) {
  if (!Array.isArray(records)) throw new Error("Invalid Stripe inbox backup");
  // Validate the complete input before making changes; merge, never drop operational identities.
  const planned = [];
  for (const record of fold(records)) planned.push({ existing: await inbox.get(record.id), incoming: record });
  for (const item of planned) item.merged = merge(item.existing, item.incoming);
  await inbox.prepare?.();
  for (const { existing, incoming, merged } of planned) {
    if (!existing) await inbox.receive(incoming);
    else if (merged !== existing) await inbox.update(merged);
  }
}
module.exports = { jsonInbox, postgresInbox, metadata, importInbox, fold, merge, ordered, exportPostgresInbox };
