/*
 * PostgreSQL store (T162), used with STORE=postgres. The interface is described in store.js.
 *
 * Tables:
 *   records(collection, key, pos, data)  one row per entry of the lists without a table of their own (001)
 *   kv(name, data)                       the values that are not lists (meta, settings, counters …) and SHAPE
 *   users, sessions, auth_tokens         accounts and sign-ins in real tables with constraints (T164, TABLES)
 *   invoices, payments                   with the legal protections in triggers (T165); payments only grow:
 *                                        a changed payment is a new row (`version`), the newest one counts
 *   projects, phases, tasks              the nested project lists, one row per project, phase and task (T166):
 *                                        changing one task writes one task row
 *
 * - Loading runs db/load.js in a child process, so the server's start-up stays synchronous (T160). It applies
 *   the migrations first.
 * - Saving compares every record with the text it was last saved as and writes only the new, changed and
 *   removed ones, in one transaction. The code that changes `db` stays as it is.
 * - A record's key is its id (tokenHash for sessions, hash for sign-in tokens); a repeated key gets "#2",
 *   "#3" …, and a record without one is keyed by its content.
 * - The list order is kept in `pos`. Records that keep their order keep their position, so adding to the
 *   front of a list (the audit log, notifications) writes one row.
 * - Real tables: a field listed in TABLES goes into its column when it fits the column type exactly; anything
 *   else of the record stays in the `extra` column, so a record always loads back exactly as it was saved.
 * - When the database refuses a change (a constraint or trigger, T164–T166), the other changes are still
 *   saved, the refused record is put back in memory as it was saved (or removed, if it is new), and flush()
 *   rejects with `refused`, which server.js turns into a 409 or 503 reply.
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
  "requests",
  "introductions",
  "servicePackages",
  "siteHistory",
];
const VALUES = ["meta", "settings", "counters", "uploadOwners", "siteContent"];
// Projects hold their phases, and phases their tasks (T166). Each level is a table of its own: `children` is the
// list field that is cut off and stored in the next table, `parent` the column that points back.
const TASKS = {
  collection: "projects.phases.tasks",
  table: "tasks",
  key: ["id", "id"],
  parent: "phase_id",
  columns: [
    ["name", "name", "text"],
    ["status", "status", "text"],
    ["startDate", "start_date", "date"],
    ["dueDate", "due_date", "date"],
    ["assignedSupplierId", "assigned_supplier_id", "text"],
    ["progress", "progress", "numeric"],
    ["orderAmount", "order_amount", "numeric"],
  ],
};
const PHASES = {
  collection: "projects.phases",
  table: "phases",
  key: ["id", "id"],
  parent: "project_id",
  children: { field: "tasks", spec: TASKS },
  columns: [
    ["name", "name", "text"],
    ["status", "status", "text"],
    ["startDate", "start_date", "date"],
    ["dueDate", "due_date", "date"],
    ["supplierId", "supplier_id", "text"],
  ],
};
const PROJECTS = {
  collection: "projects",
  table: "projects",
  key: ["id", "id"],
  children: { field: "phases", spec: PHASES },
  columns: [
    ["customerId", "customer_id", "text"],
    ["name", "name", "text"],
    ["status", "status", "text"],
    ["budget", "budget", "numeric"],
    ["startDate", "start_date", "date"],
    ["dueDate", "due_date", "date"],
    ["createdAt", "created_at", "timestamptz"],
  ],
};
// The lists with a table of their own, in the order they are written (a table before the tables that refer to
// it). Columns are [field, column, type]; the migrations create the same columns.
const TABLES = [
  {
    collection: "users",
    table: "users",
    key: ["id", "id"],
    columns: [
      ["email", "email", "text"],
      ["role", "role", "text"],
      ["status", "status", "text"],
      ["passwordHash", "password_hash", "text"],
      ["salt", "salt", "text"],
      ["createdAt", "created_at", "timestamptz"],
    ],
  },
  {
    collection: "sessions",
    table: "sessions",
    key: ["tokenHash", "token_hash"],
    columns: [
      ["userId", "user_id", "text"],
      ["createdAt", "created_at", "timestamptz"],
      ["lastSeenAt", "last_seen_at", "timestamptz"],
      ["expiresAt", "expires_at", "timestamptz"],
    ],
  },
  {
    collection: "authTokens",
    table: "auth_tokens",
    key: ["hash", "token_hash"],
    columns: [
      ["userId", "user_id", "text"],
      ["type", "type", "text"],
      ["expiresAt", "expires_at", "timestamptz"],
    ],
  },
  {
    collection: "invoices",
    table: "invoices",
    key: ["id", "id"],
    columns: [
      ["number", "number", "text"],
      ["supplierId", "supplier_id", "text"],
      ["customerId", "customer_id", "text"],
      ["projectId", "project_id", "text"],
      ["status", "status", "text"],
      ["amount", "amount", "numeric"],
      ["netAmount", "net_amount", "numeric"],
      ["vatAmount", "vat_amount", "numeric"],
      ["grossAmount", "gross_amount", "numeric"],
      ["vatMode", "vat_mode", "text"],
      ["vatRate", "vat_rate", "numeric"],
      ["serviceDateFrom", "service_date_from", "date"],
      ["serviceDateTo", "service_date_to", "date"],
      ["lineItems", "line_items", "jsonb"],
      ["revisions", "revisions", "jsonb"],
      ["createdAt", "created_at", "timestamptz"],
    ],
  },
  {
    collection: "payments",
    table: "payments",
    key: ["id", "id"],
    // Never updated or deleted: every change is a new row with the next version.
    append: true,
    columns: [
      ["invoiceId", "invoice_id", "text"],
      ["status", "status", "text"],
      ["amount", "amount", "numeric"],
      ["createdAt", "created_at", "timestamptz"],
    ],
  },
  PROJECTS,
  PHASES,
  TASKS,
];
// The kv row with the top-level order and the names of the lists, so empty lists come back as [].
const SHAPE = "$shape";
const ROWS_PER_STATEMENT = 2000;

const isRecord = (r) => r !== null && typeof r === "object" && !Array.isArray(r);
const isList = (v) => Array.isArray(v) && v.every(isRecord);
const tableOf = Object.fromEntries(TABLES.map((t) => [t.collection, t]));
// Where a list's rows live: its own table, or `records` for the others
const specOf = (collection) =>
  tableOf[collection] || { collection, table: "records", key: ["id", "key"], generic: true };
const rowId = (spec, key) => (spec.generic ? spec.collection : spec.table) + "\t" + key;

function recordKey(spec, record, text) {
  const k = record[spec.key[0]];
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

/* ---------- Columns: a value goes into its column only when it comes back exactly the same ---------- */
const ISO = /^[1-9]\d{3}-\d{2}-\d{2}T\d{2}:\d{2}:\d{2}\.\d{3}Z$/;
function fits(type, v) {
  switch (type) {
    case "text":
      return typeof v === "string" && !v.includes("\u0000");
    case "timestamptz":
      return typeof v === "string" && ISO.test(v) && new Date(v).toISOString() === v;
    case "date":
      return (
        typeof v === "string" &&
        /^[1-9]\d{3}-\d{2}-\d{2}$/.test(v) &&
        new Date(v + "T00:00:00Z").toISOString().slice(0, 10) === v
      );
    case "numeric":
      return typeof v === "number" && Math.abs(v) < 1e10 && Math.round(v * 100) / 100 === v;
    case "integer":
      return Number.isInteger(v) && Math.abs(v) < 2 ** 31;
    case "boolean":
      return typeof v === "boolean";
    case "jsonb":
      return v !== null && v !== undefined;
  }
  return false;
}
function fromColumn(type, v) {
  if (type === "timestamptz") return new Date(v).toISOString();
  if (type === "numeric" || type === "integer") return Number(v);
  return v;
}
// The row of a real table for `record`. `synthetic`: the key is not the record's own (repeated or missing id).
function toRow(spec, key, pos, record, synthetic) {
  const [keyField, keyColumn] = spec.key,
    row = { [keyColumn]: key, pos },
    extra = {};
  for (const [field, value] of Object.entries(record)) {
    const col = spec.columns.find((c) => c[0] === field);
    if (field === keyField && !synthetic) continue;
    if (col && fits(col[2], value)) row[col[1]] = value;
    else extra[field] = value;
  }
  if (synthetic) extra.$synthetic = true;
  row.extra = extra;
  return row;
}
// The record of a row of a real table, as it was saved
function fromRow(spec, row) {
  const [keyField, keyColumn] = spec.key,
    { $synthetic, ...extra } = row.extra || {},
    record = $synthetic ? {} : { [keyField]: row[keyColumn] };
  Object.assign(record, extra);
  for (const [field, column, type] of spec.columns)
    if (row[column] !== null && row[column] !== undefined) record[field] = fromColumn(type, row[column]);
  return record;
}

/* ---------- List order ---------- */
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

/* ---------- What to write ---------- */
const warned = new Set();
// A record without its child list, which is stored in the next table; "$<field>": true says it had one.
function withoutChildren(record, field) {
  const { [field]: _, ...rest } = record;
  return { ...rest, ["$" + field]: true };
}

// The rows of one list and of the lists nested in it, with positions that keep the saved ones where the order
// allows. `body` is what the row stores: the record, without its child list.
function listRows(spec, list, savedPos, parent = null, counts = new Map()) {
  const field = spec.children?.field,
    rows = list.map((record) => {
      const nested = field && Array.isArray(record[field]) ? record[field] : null,
        body = nested ? withoutChildren(record, field) : record,
        text = JSON.stringify(body);
      let key = recordKey(spec, record, text);
      const n = (counts.get(spec.table + "\t" + key) || 0) + 1;
      counts.set(spec.table + "\t" + key, n);
      if (n > 1) key += "#" + n;
      return {
        spec,
        collection: spec.collection,
        key,
        text,
        id: rowId(spec, key),
        record,
        body,
        list,
        parent,
        nested,
      };
    });
  const pos = positions(rows.map((r) => savedPos(r.id)));
  rows.forEach((r, i) => (r.pos = pos[i]));
  const all = [...rows];
  for (const r of rows)
    if (r.nested) all.push(...listRows(spec.children.spec, r.nested, savedPos, r.key, counts));
  return all;
}

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
    for (const r of listRows(specOf(name), value, (id) => saved.records.get(id)?.pos)) {
      seen.add(r.id);
      const before = saved.records.get(r.id);
      if (!before || before.text !== r.text || before.pos !== r.pos || before.parent !== r.parent) {
        if (r.spec.append) r.version = (before?.version || 0) + 1;
        upserts.push(r);
      }
    }
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

const empty = (c) => !c.upserts.length && !c.deletes.length && !c.values.length && !c.valueDeletes.length;
const chunks = (list) =>
  Array.from({ length: Math.ceil(list.length / ROWS_PER_STATEMENT) }, (_, i) =>
    list.slice(i * ROWS_PER_STATEMENT, (i + 1) * ROWS_PER_STATEMENT),
  );

async function writeGeneric(client, upserts, deletes) {
  for (const part of chunks(upserts))
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
  for (const part of chunks(deletes))
    await client.query(
      `delete from records r using unnest($1::text[], $2::text[]) as d (collection, key)
       where r.collection = d.collection and r.key = d.key`,
      [part.map((r) => r.collection), part.map((r) => r.key)],
    );
}

// The key is not the record's own text key (a repeated, missing or numeric id): the field stays in `extra`.
const synthetic = (spec, r) => r.record[spec.key[0]] !== r.key;
// The row of a real table for a row of listRows(), with the column that points to its parent
function tableRow(spec, r) {
  const row = toRow(spec, r.key, r.pos, r.body || r.record, synthetic(spec, r));
  if (spec.parent) row[spec.parent] = r.parent;
  return row;
}

async function upsertTable(client, spec, rows) {
  const keyColumn = spec.key[1],
    columns = [
      keyColumn,
      ...(spec.append ? ["version"] : []),
      ...(spec.parent ? [spec.parent] : []),
      "pos",
      ...spec.columns.map((c) => c[1]),
      "extra",
    ],
    list = columns.join(", ");
  if (spec.append) {
    for (const part of chunks(rows))
      await client.query(
        `insert into ${spec.table} (${list}) select ${list} from jsonb_populate_recordset(null::${spec.table}, $1::jsonb)`,
        [jsonbSafe(JSON.stringify(part.map((r) => ({ ...tableRow(spec, r), version: r.version }))))],
      );
    return;
  }
  for (const part of chunks(rows))
    await client.query(
      `insert into ${spec.table} (${list})
       select ${list} from jsonb_populate_recordset(null::${spec.table}, $1::jsonb)
       on conflict (${keyColumn}) do update set
       ${columns
         .slice(1)
         .map((c) => `${c} = excluded.${c}`)
         .join(", ")}, updated_at = now()`,
      [jsonbSafe(JSON.stringify(part.map((r) => tableRow(spec, r))))],
    );
}

async function write(client, c) {
  const of = (list, spec) => list.filter((r) => r.spec.table === spec.table && !r.spec.generic);
  await writeGeneric(
    client,
    c.upserts.filter((r) => r.spec.generic),
    c.deletes.filter((r) => r.spec.generic),
  );
  for (const spec of TABLES) {
    const rows = of(c.upserts, spec);
    if (rows.length) await upsertTable(client, spec, rows);
  }
  for (const spec of [...TABLES].reverse()) {
    const rows = of(c.deletes, spec);
    for (const part of chunks(rows))
      await client.query(`delete from ${spec.table} where ${spec.key[1]} = any($1::text[])`, [
        part.map((r) => r.key),
      ]);
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

// A change the database may refuse on purpose: a constraint (class 23) or a trigger (raise exception).
const refusable = (e) => /^23/.test(e?.code || "") || e?.code === "P0001";

// Writes the changes one row at a time, each behind a savepoint, and returns the ones the database refused.
// Used only after the whole batch failed with a refusal.
async function writeEach(client, c) {
  await client.query("set constraints all immediate");
  const refused = [],
    one = (part) => ({ upserts: [], deletes: [], values: [], valueDeletes: [], ...part }),
    order = (r) => (r.spec.generic ? -1 : TABLES.indexOf(r.spec));
  const steps = [
    ...[...c.upserts].sort((a, b) => order(a) - order(b)).map((r) => [r, one({ upserts: [r] })]),
    ...[...c.deletes].sort((a, b) => order(b) - order(a)).map((r) => [r, one({ deletes: [r] }), true]),
    [null, one({ values: c.values, valueDeletes: c.valueDeletes })],
  ];
  for (const [row, part, removed] of steps) {
    if (empty(part)) continue;
    await client.query("savepoint each_row");
    try {
      await write(client, part);
      await client.query("release savepoint each_row");
    } catch (e) {
      await client.query("rollback to savepoint each_row");
      if (!row || !refusable(e)) throw e;
      refused.push({ row, removed: !!removed, code: e.code, constraint: e.constraint, message: e.message });
    }
  }
  return refused;
}

/* ---------- Reading ---------- */
// Everything in the database as { lists: { name: { keys, pos, rows } }, values: { name: value } }, or null when
// nothing has been saved yet. Used by db/load.js and the tools.
async function readAll(client) {
  const values = Object.fromEntries(
      (await client.query("select name, data from kv")).rows.map((r) => [r.name, r.data]),
    ),
    lists = {},
    add = (collection, key, pos, row, version) => {
      const list = (lists[collection] ||= { keys: [], pos: [], rows: [], versions: [] });
      list.keys.push(key);
      list.pos.push(pos);
      list.rows.push(row);
      list.versions.push(version);
    };
  for (const r of (
    await client.query("select collection, key, pos, data from records order by collection, pos")
  ).rows)
    add(r.collection, r.key, r.pos, r.data);
  const exists = new Set(
    (
      await client.query(
        "select table_name from information_schema.tables where table_schema = current_schema()",
      )
    ).rows.map((r) => r.table_name),
  );
  // The rows of a table as records, with their child lists put back from the tables below it
  const nested = [];
  async function records(spec) {
    if (!exists.has(spec.table)) return [];
    const kids = new Map(),
      field = spec.children?.field;
    if (field)
      for (const k of await records(spec.children.spec)) {
        if (!kids.has(k.parent)) kids.set(k.parent, []);
        kids.get(k.parent).push(k.record);
      }
    const sql = spec.append
      ? `select * from (select distinct on (${spec.key[1]}) * from ${spec.table}
         order by ${spec.key[1]}, version desc) newest order by pos`
      : `select * from ${spec.table} order by ${spec.parent ? spec.parent + ", " : ""}pos`;
    return (await client.query(sql)).rows.map((r) => {
      const key = r[spec.key[1]],
        record = fromRow(spec, r);
      if (field && record["$" + field]) {
        delete record["$" + field];
        record[field] = kids.get(key) || [];
      }
      if (spec.parent) nested.push([spec.table, key, r.pos, r[spec.parent]]);
      return {
        key,
        pos: r.pos,
        version: r.version,
        parent: spec.parent ? r[spec.parent] : undefined,
        record,
      };
    });
  }
  for (const spec of TABLES)
    if (!spec.parent)
      for (const r of await records(spec)) add(spec.collection, r.key, r.pos, r.record, r.version);
  if (!Object.keys(lists).length && !Object.keys(values).length) return null;
  return { lists, values, nested };
}

// The data object from readAll(), in the saved top-level order, and what was saved (for the next comparison).
function assemble(loaded) {
  const saved = { records: new Map(), values: new Map() };
  if (!loaded) return { data: null, saved };
  const { lists, values } = loaded,
    shape = values[SHAPE] || { lists: [], order: [] },
    data = {},
    // The positions and parents of the nested rows (phases, tasks), by row id
    nestedRows = new Map(
      (loaded.nested || []).map(([table, key, pos, parent]) => [
        table + "\t" + key,
        { spec: TABLES.find((t) => t.table === table), key, pos, parent },
      ]),
    );
  for (const name of new Set([...shape.order, ...Object.keys(lists), ...Object.keys(values)])) {
    if (name === SHAPE) continue;
    const list = lists[name];
    if (list) {
      data[name] = list.rows;
      // The keys as this store computes them; a stored key it would not compute is deleted on the next save.
      // Payments also carry the version their newest row has.
      const spec = specOf(name),
        stored = new Map(
          list.keys.map((k, i) => [
            rowId(spec, k),
            { spec, key: k, pos: list.pos[i], version: list.versions?.[i] },
          ]),
        );
      const find = (id) => stored.get(id) || nestedRows.get(id);
      for (const r of listRows(spec, list.rows, (id) => find(id)?.pos)) {
        const s = find(r.id);
        if (s)
          saved.records.set(r.id, { ...r, pos: s.pos, version: s.version, parent: s.parent ?? r.parent });
        stored.delete(r.id);
        nestedRows.delete(r.id);
      }
      for (const [id, s] of stored) saved.records.set(id, { ...s, collection: name, text: null });
    } else if (name in values) {
      data[name] = values[name];
      saved.values.set(name, JSON.stringify(values[name]));
    } else if (shape.lists.includes(name)) data[name] = [];
  }
  // Nested rows that no record holds any more (for example under a lost parent) go with the next save.
  for (const [id, s] of nestedRows)
    saved.records.set(id, { ...s, collection: s.spec.collection, text: null });
  if (values[SHAPE]) saved.values.set(SHAPE, JSON.stringify(values[SHAPE]));
  return { data, saved };
}

/* ---------- Putting refused changes back in memory ---------- */
function restore(data, saved, refusal) {
  const { row, removed } = refusal,
    before = saved.records.get(row.id),
    old = before?.text ? JSON.parse(before.text) : null;
  const field = row.spec.children?.field;
  if (old && field) delete old["$" + field];
  if (removed) {
    // A refused delete: the record comes back, in front of the first record saved after it.
    if (!old || row.parent != null) return;
    const list = Array.isArray(data[row.collection]) ? data[row.collection] : (data[row.collection] = []),
      at = list.findIndex((r) => {
        const s = saved.records.get(rowId(row.spec, recordKey(row.spec, r, JSON.stringify(r))));
        return s && s.pos > before.pos;
      });
    list.splice(at < 0 ? list.length : at, 0, old);
  } else if (old) {
    // A refused change: the same object gets its saved content back, so references to it stay valid.
    for (const k of Object.keys(row.record)) if (k !== field) delete row.record[k];
    Object.assign(row.record, old);
  } else {
    // A refused new record is removed (from the list as it is now, if the code replaced the list meanwhile).
    for (const list of [data[row.collection], row.list]) {
      const i = Array.isArray(list) ? list.indexOf(row.record) : -1;
      if (i >= 0) return void list.splice(i, 1);
    }
  }
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
  const stats = { writes: 0, rowsWritten: 0, rowsDeleted: 0, last: null, refused: 0 };

  // Waiters up to `upTo` are settled: rejected with `error` when given, else resolved.
  function settle(error, upTo = committed) {
    const open = [];
    for (const w of waiters)
      if (w.target <= upTo) error ? w.reject(error) : w.resolve();
      else if (error && !error.refused) w.reject(error);
      else open.push(w);
    waiters = open;
  }

  function remember(c, refused = []) {
    const skip = new Set(refused.map((r) => r.row));
    for (const r of c.upserts) if (!skip.has(r)) saved.records.set(r.id, r);
    for (const r of c.deletes) if (!skip.has(r)) saved.records.delete(r.id);
    for (const [name, text] of c.values) saved.values.set(name, text);
    for (const name of c.valueDeletes) saved.values.delete(name);
    const rows = c.upserts.length + c.values.length - refused.filter((r) => !r.removed).length,
      gone = c.deletes.length + c.valueDeletes.length - refused.filter((r) => r.removed).length;
    if (rows || gone) {
      stats.writes++;
      stats.rowsWritten += rows;
      stats.rowsDeleted += gone;
      stats.last = { upserts: c.upserts.length, deletes: c.deletes.length, values: c.values.length };
    }
  }

  async function run() {
    if (running) return;
    running = true;
    clearTimeout(retry);
    retry = null;
    const { tx } = require("./db/pg");
    try {
      while (committed < requested) {
        const covers = requested,
          c = changes(data, saved);
        let refused = [];
        try {
          if (!empty(c))
            try {
              await tx((client) => write(client, c), getPool());
            } catch (e) {
              if (!refusable(e)) throw e;
              refused = await tx((client) => writeEach(client, c), getPool());
            }
        } catch (e) {
          // The changes stay in memory and are written with the next save, or by the retry below.
          console.error("Could not save to PostgreSQL:", e.code || e.message);
          settle(e);
          retry = setTimeout(() => run(), 5000);
          return;
        }
        for (const r of refused) restore(data, saved, r);
        remember(c, refused);
        committed = covers;
        if (refused.length) {
          stats.refused += refused.length;
          for (const r of refused)
            console.error(
              `PostgreSQL refused a change to ${r.row.collection} (${r.constraint || r.code}); it was undone.`,
            );
          const error = new Error("The database refused a change: " + refused[0].message);
          error.refused = refused.map(({ row, removed, code, constraint, message }) => ({
            collection: row.collection,
            removed,
            code,
            constraint,
            message,
          }));
          settle(error, covers);
        } else settle();
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
  write,
  positions,
  jsonbSafe,
  toRow,
  fromRow,
  fits,
  COLLECTIONS,
  VALUES,
  TABLES,
  SHAPE,
  listRows,
};
