// T166: moves the projects saved so far in `records` into the projects, phases and tasks tables, with the store's
// rules. The tables are written out here, so this migration keeps doing the same when the store changes later.
const { listRows, toRow } = require("../store-postgres");

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

module.exports = async (client) => {
  const projects = (
    await client.query("select data from records where collection = 'projects' order by pos")
  ).rows.map((r) => r.data);
  const rows = listRows(PROJECTS, projects, () => undefined);
  for (const spec of [PROJECTS, PHASES, TASKS]) {
    const mine = rows
      .filter((r) => r.spec === spec)
      .map((r) => {
        const row = toRow(spec, r.key, r.pos, r.body, r.record[spec.key[0]] !== r.key);
        if (spec.parent) row[spec.parent] = r.parent;
        return { ...row, updated_at: new Date().toISOString() };
      });
    if (mine.length)
      await client.query(
        `insert into ${spec.table} select * from jsonb_populate_recordset(null::${spec.table}, $1::jsonb)`,
        [JSON.stringify(mine)],
      );
  }
  await client.query("delete from records where collection = 'projects'");
};
