/*
 * PostgreSQL store (T162), used with STORE=postgres. The interface is described in store.js.
 *
 * Tables (migrations/001_records.sql):
 *   records(collection, key, pos, data)  one row per entry of the lists (users, projects, invoices …)
 *   kv(name, data)                       the values that are not lists (meta, settings, counters …) and SHAPE
 *
 * - Loading runs db/load.js in a child process, so the server's start-up stays synchronous (T160). It applies
 *   the migrations first.
 * - Saving compares every record with the text it was last saved as and writes only the new, changed and
 *   removed ones, in one transaction. The code that changes `db` stays as it is.
 * - A record's key is its id (tokenHash for sessions and sign-in tokens); a repeated key gets "#2", "#3" …,
 *   and a record without one is keyed by its content.
 * - The list order is kept in `pos`. Records that keep their order keep their position, so adding to the
 *   front of a list (the audit log, notifications) writes one row.
 */
const crypto = require("crypto");
const path = require("path");
const { execFileSync } = require("child_process");

// The lists and values of the data. A new one must be added here on purpose (test/store.test.js checks it).
const COLLECTIONS = [
  "users",
  "suppliers",
  "projects",
  "invoices",
  "applications",
  "messages",
  "notifications",
  "activities",
  "payments",
  "disputes",
  "sessions",
  "rfqs",
  "bids",
  "documents",
  "timeEntries",
  "sites",
  "workers",
  "complianceDocs",
  "briefingAcks",
  "siteVisits",
  "chats",
  "contracts",
  "outbox",
  "auditLog",
  "authTokens",
  "planEntries",
  "profileDocs",
  "siteReports",
  "acceptances",
  "supplierInvites",
];
const VALUES = ["meta", "settings", "counters", "uploadOwners"];
const KEY_FIELD = { sessions: "tokenHash", authTokens: "tokenHash" };
// The kv row with the top-level order and the names of the lists, so empty lists come back as [].
const SHAPE = "$shape";
const ROWS_PER_STATEMENT = 2000;

const isRecord = (r) => r !== null && typeof r === "object" && !Array.isArray(r);
const isList = (v) => Array.isArray(v) && v.every(isRecord);
const rowId = (collection, key) => collection + "\t" + key;

function recordKey(collection, record, text) {
  const k = record[KEY_FIELD[collection] || "id"];
  if ((typeof k === "string" && k) || typeof k === "number") return String(k);
  return "@" + crypto.createHash("sha256").update(text).digest("hex").slice(0, 24);
}

// jsonb cannot hold \u0000 or a lone UTF-16 surrogate, which JSON.stringify writes as \u0000 and \udxxx.
// They only come from broken input; drop or replace them instead of failing every save from then on.
const UNSAFE = /(?<!\\)((?:\\\\)*)\\u(0000|d[89a-f][0-9a-f]{2})/gi;
function jsonbSafe(text) {
  return text.includes("\\u")
    ? text.replace(UNSAFE, (m, slashes, code) => slashes + (code === "0000" ? "" : "\\ufffd"))
    : text;
}

// The positions of the longest run of rows whose saved positions are already in order (they stay as they are).
function keptInOrder(saved) {
  const tails = [],
    tailIndex = [],
    previous = new Array(saved.length);
  saved.forEach((p, i) => {
    if (p === undefined) return;
    let lo = 0,
      hi = tails.length;
    while (lo < hi) {
      const mid = (lo + hi) >> 1;
      if (tails[mid] < p) lo = mid + 1;
      else hi = mid;
    }
    tails[lo] = p;
    tailIndex[lo] = i;
    previous[i] = lo ? tailIndex[lo - 1] : -1;
  });
  const kept = new Set();
  for (let i = tails.length ? tailIndex[tails.length - 1] : -1; i >= 0; i = previous[i]) kept.add(i);
  return kept;
}

// New positions for a list, given each row's saved position (undefined for a new row). Rows in the kept run
// keep theirs; the others get positions between their neighbours.
function positions(saved) {
  const kept = keptInOrder(saved),
    pos = new Array(saved.length);
  for (let i = 0; i < saved.length; ) {
    if (kept.has(i)) {
      pos[i] = saved[i];
      i++;
      continue;
    }
    let j = i;
    while (j < saved.length && !kept.has(j)) j++;
    const lo = i > 0 ? pos[i - 1] : undefined,
      hi = j < saved.length ? saved[j] : undefined,
      count = j - i;
    for (let n = 0; n < count; n++)
      pos[i + n] =
        lo === undefined && hi === undefined
          ? n
          : lo === undefined
            ? hi - (count - n)
            : hi === undefined
              ? lo + n + 1
              : lo + ((hi - lo) * (n + 1)) / (count + 1);
    i = j;
  }
  // Out of room between two neighbours (many inserts at one place): number the whole list again.
  for (let n = 1; n < pos.length; n++) if (!(pos[n] > pos[n - 1])) return pos.map((_, i) => i);
  return pos;
}

const warned = new Set();
// The rows `data` should have now, compared with `saved`: what to write and what to delete.
function changes(data, saved) {
  const upserts = [],
    seen = new Set(),
    values = [],
    lists = [];
  for (const [name, value] of Object.entries(data)) {
    if (value === undefined) continue;
    if (!COLLECTIONS.includes(name) && !VALUES.includes(name) && !warned.has(name)) {
      warned.add(name);
      console.warn(`store-postgres.js: "${name}" is not in COLLECTIONS or VALUES; add it there.`);
    }
    if (!isList(value)) {
      values.push([name, JSON.stringify(value)]);
      continue;
    }
    lists.push(name);
    const counts = new Map(),
      rows = value.map((record) => {
        const text = JSON.stringify(record);
        let key = recordKey(name, record, text);
        const n = (counts.get(key) || 0) + 1;
        counts.set(key, n);
        if (n > 1) key += "#" + n;
        return { collection: name, key, text, id: rowId(name, key) };
      });
    const pos = positions(rows.map((r) => saved.records.get(r.id)?.pos));
    rows.forEach((r, i) => {
      r.pos = pos[i];
      seen.add(r.id);
      const before = saved.records.get(r.id);
      if (!before || before.text !== r.text || before.pos !== r.pos) upserts.push(r);
    });
  }
  values.push([
    SHAPE,
    JSON.stringify({ lists, order: Object.keys(data).filter((k) => data[k] !== undefined) }),
  ]);
  const deletes = [...saved.records.entries()].filter(([id]) => !seen.has(id)).map(([, r]) => r),
    valueNames = new Set(values.map(([name]) => name));
  return {
    upserts,
    deletes,
    values: values.filter(([name, text]) => saved.values.get(name) !== text),
    valueDeletes: [...saved.values.keys()].filter((name) => !valueNames.has(name)),
  };
}

async function write(client, c) {
  for (let i = 0; i < c.upserts.length; i += ROWS_PER_STATEMENT) {
    const part = c.upserts.slice(i, i + ROWS_PER_STATEMENT);
    await client.query(
      `insert into records (collection, key, pos, data)
       select * from unnest($1::text[], $2::text[], $3::float8[], $4::jsonb[])
       on conflict (collection, key) do update set pos = excluded.pos, data = excluded.data, updated_at = now()`,
      [
        part.map((r) => r.collection),
        part.map((r) => r.key),
        part.map((r) => r.pos),
        part.map((r) => jsonbSafe(r.text)),
      ],
    );
  }
  for (let i = 0; i < c.deletes.length; i += ROWS_PER_STATEMENT) {
    const part = c.deletes.slice(i, i + ROWS_PER_STATEMENT);
    await client.query(
      `delete from records r using unnest($1::text[], $2::text[]) as d (collection, key)
       where r.collection = d.collection and r.key = d.key`,
      [part.map((r) => r.collection), part.map((r) => r.key)],
    );
  }
  if (c.values.length)
    await client.query(
      `insert into kv (name, data) select * from unnest($1::text[], $2::jsonb[])
       on conflict (name) do update set data = excluded.data, updated_at = now()`,
      [c.values.map(([name]) => name), c.values.map(([, text]) => jsonbSafe(text))],
    );
  if (c.valueDeletes.length)
    await client.query("delete from kv where name = any($1::text[])", [c.valueDeletes]);
}

// Everything in the database as { lists: { name: { keys, pos, rows } }, values: { name: value } }, or null when
// nothing has been saved yet. Used by db/load.js (and the export tool).
async function readAll(client) {
  const values = Object.fromEntries(
      (await client.query("select name, data from kv")).rows.map((r) => [r.name, r.data]),
    ),
    records = (await client.query("select collection, key, pos, data from records order by collection, pos"))
      .rows;
  if (!records.length && !Object.keys(values).length) return null;
  const lists = {};
  for (const r of records) {
    const list = (lists[r.collection] ||= { keys: [], pos: [], rows: [] });
    list.keys.push(r.key);
    list.pos.push(r.pos);
    list.rows.push(r.data);
  }
  return { lists, values };
}

// The data object from readAll(), in the saved top-level order, and what was saved (for the next comparison).
function assemble(loaded) {
  const saved = { records: new Map(), values: new Map() };
  if (!loaded) return { data: null, saved };
  const { lists, values } = loaded,
    shape = values[SHAPE] || { lists: [], order: [] },
    data = {};
  for (const name of new Set([...shape.order, ...Object.keys(lists), ...Object.keys(values)])) {
    if (name === SHAPE) continue;
    const list = lists[name];
    if (list) {
      data[name] = list.rows;
      list.rows.forEach((row, i) =>
        saved.records.set(rowId(name, list.keys[i]), {
          collection: name,
          key: list.keys[i],
          text: JSON.stringify(row),
          pos: list.pos[i],
        }),
      );
    } else if (name in values) {
      data[name] = values[name];
      saved.values.set(name, JSON.stringify(values[name]));
    } else if (shape.lists.includes(name)) data[name] = [];
  }
  if (values[SHAPE]) saved.values.set(SHAPE, JSON.stringify(values[SHAPE]));
  return { data, saved };
}

function postgresStore({ url = process.env.DATABASE_URL } = {}) {
  if (!url)
    throw new Error(
      "STORE=postgres needs DATABASE_URL, for example postgres://user:password@host:5432/craftcrew.",
    );
  let pool = null,
    saved = { records: new Map(), values: new Map() },
    data = null,
    requested = 0,
    committed = 0,
    running = false,
    retry = null,
    waiters = [];
  const getPool = () => (pool ||= require("./db/pg").createPool(url));
  const stats = { writes: 0, rowsWritten: 0, rowsDeleted: 0, last: null };

  function settle(error) {
    const open = [];
    for (const w of waiters)
      if (committed >= w.target) w.resolve();
      else if (error) w.reject(error);
      else open.push(w);
    waiters = open;
  }

  async function run() {
    if (running) return;
    running = true;
    clearTimeout(retry);
    retry = null;
    try {
      while (committed < requested) {
        const covers = requested,
          c = changes(data, saved);
        try {
          if (c.upserts.length || c.deletes.length || c.values.length || c.valueDeletes.length)
            await require("./db/pg").tx((client) => write(client, c), getPool());
        } catch (e) {
          // The changes stay in memory and are written with the next save, or by the retry below.
          console.error("Could not save to PostgreSQL:", e.code || e.message);
          settle(e);
          retry = setTimeout(() => run(), 5000);
          return;
        }
        for (const r of c.upserts) saved.records.set(r.id, r);
        for (const r of c.deletes) saved.records.delete(r.id);
        for (const [name, text] of c.values) saved.values.set(name, text);
        for (const name of c.valueDeletes) saved.values.delete(name);
        const rows = c.upserts.length + c.values.length,
          gone = c.deletes.length + c.valueDeletes.length;
        if (rows || gone) {
          stats.writes++;
          stats.rowsWritten += rows;
          stats.rowsDeleted += gone;
          stats.last = { upserts: c.upserts.length, deletes: c.deletes.length, values: c.values.length };
        }
        committed = covers;
        settle();
      }
    } finally {
      running = false;
    }
  }

  return {
    kind: "postgres",
    // Replies to changes wait for flush() (server.js), so a change is committed before the user sees it saved.
    waitsForCommit: true,
    stats,
    loadSync() {
      let out;
      try {
        out = execFileSync(process.execPath, [path.join(__dirname, "db", "load.js")], {
          env: { ...process.env, DATABASE_URL: url },
          encoding: "utf8",
          maxBuffer: 1024 * 1024 * 1024,
          stdio: ["ignore", "pipe", "pipe"],
        });
      } catch (e) {
        const reason = String(e.stderr || e.message)
          .trim()
          .split("\n")
          .pop();
        throw new Error(
          `The data could not be loaded from PostgreSQL (${reason}). Check DATABASE_URL and the database.`,
        );
      }
      const result = assemble(JSON.parse(out));
      saved = result.saved;
      return result.data;
    },
    save(next) {
      data = next;
      requested++;
      run();
    },
    flush() {
      if (committed >= requested) return Promise.resolve();
      const target = requested;
      const done = new Promise((resolve, reject) => waiters.push({ target, resolve, reject }));
      run();
      return done;
    },
    async ping() {
      await getPool().query("select 1");
    },
    async close() {
      clearTimeout(retry);
      if (pool) await pool.end();
      pool = null;
    },
  };
}

module.exports = {
  postgresStore,
  readAll,
  assemble,
  changes,
  positions,
  jsonbSafe,
  COLLECTIONS,
  VALUES,
  SHAPE,
};
