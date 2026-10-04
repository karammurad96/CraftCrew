// T165: moves the invoices and payments saved so far in `records` into their new tables, with the store's
// rules (a field goes into its column only when it fits it exactly). The columns are written out here, so this
// migration keeps doing the same even when the store's tables change later. Payments start at version 1.
const { toRow } = require("../store-postgres");

const MOVES = [
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
    version: 1,
    columns: [
      ["invoiceId", "invoice_id", "text"],
      ["status", "status", "text"],
      ["amount", "amount", "numeric"],
      ["createdAt", "created_at", "timestamptz"],
    ],
  },
];

module.exports = async (client) => {
  const { rows: twice } = await client.query(
    `select data->>'supplierId' as supplier, data->>'number' as number from records
     where collection = 'invoices' and jsonb_typeof(data->'number') = 'string'
     group by 1, 2 having count(*) > 1 limit 1`,
  );
  if (twice.length)
    throw new Error(
      `Two invoices of supplier ${twice[0].supplier} have the number ${twice[0].number}. Correct one of them, then start again.`,
    );
  for (const spec of MOVES) {
    const { rows } = await client.query(
      "select key, pos, data from records where collection = $1 order by pos",
      [spec.collection],
    );
    const moved = rows.map((r) => ({
      ...toRow(spec, r.key, r.pos, r.data, r.data[spec.key[0]] !== r.key),
      ...(spec.version ? { version: spec.version } : {}),
    }));
    if (moved.length)
      await client.query(
        `insert into ${spec.table} select * from jsonb_populate_recordset(null::${spec.table}, $1::jsonb)`,
        [
          JSON.stringify(
            moved.map((r) => ({
              ...r,
              updated_at: new Date().toISOString(),
              recorded_at: new Date().toISOString(),
            })),
          ),
        ],
      );
    // Moving is not deleting: the rows now live in their own table.
    await client.query("delete from records where collection = $1", [spec.collection]);
  }
};
