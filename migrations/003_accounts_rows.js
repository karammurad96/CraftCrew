// T164: moves the users, sessions and sign-in tokens saved so far in `records` into their new tables, with the
// same rules the store uses (a field goes into its column only when it fits it exactly). The columns are
// written out here, because this migration must keep doing the same even when the store's tables change later.
const { toRow } = require("../store-postgres");

const MOVES = [
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
];

module.exports = async (client) => {
  const { rows: twins } = await client.query(
    `select lower(data->>'email') as email from records
     where collection = 'users' and jsonb_typeof(data->'email') = 'string'
     group by 1 having count(*) > 1 limit 1`,
  );
  if (twins.length)
    throw new Error(
      `Two accounts share the email address ${twins[0].email}. Give one of them another address, then start again.`,
    );
  for (const spec of MOVES) {
    const { rows } = await client.query(
      "select key, pos, data from records where collection = $1 order by pos",
      [spec.collection],
    );
    // Sessions and tokens of accounts that no longer exist cannot be moved; they are of no use anyway.
    const users =
      spec.table === "users"
        ? null
        : new Set((await client.query("select id from users")).rows.map((r) => r.id));
    const moved = rows
      .filter((r) => !users || users.has(r.data.userId))
      .map((r) => toRow(spec, r.key, r.pos, r.data, r.data[spec.key[0]] !== r.key));
    if (moved.length)
      await client.query(
        `insert into ${spec.table} select * from jsonb_populate_recordset(null::${spec.table}, $1::jsonb)`,
        [JSON.stringify(moved.map((r) => ({ ...r, updated_at: new Date().toISOString() })))],
      );
    await client.query("delete from records where collection = $1", [spec.collection]);
  }
};
