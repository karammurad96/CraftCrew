-- T162: the PostgreSQL store keeps the same data as db.json, one row per record.
-- `records` holds the lists (users, projects, invoices …): one row per list entry, `pos` keeps the list order.
-- `kv` holds the values that are not lists (meta, settings, counters, uploadOwners) and the shape of the data.
create table records (
  collection text not null,
  key text not null,
  -- The order inside the list. A double, so that a record added at the front or between two others gets a
  -- position without renumbering the rest.
  pos double precision not null,
  data jsonb not null,
  updated_at timestamptz not null default now(),
  primary key (collection, key)
);
create index records_order on records (collection, pos);

create table kv (
  name text primary key,
  data jsonb not null,
  updated_at timestamptz not null default now()
);
