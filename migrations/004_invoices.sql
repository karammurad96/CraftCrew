-- T165: invoices and payments in real tables, with the legal protections in the database itself:
-- - invoices are never deleted (rule 6, § 147 AO: kept 10 years);
-- - once an invoice is Approved, Paid or Refunded, its number, amounts, VAT, line items, service dates, supplier
--   and customer cannot change; only the status and the payment fields may (§ 14 UStG);
-- - payments only ever grow: every change of a payment is a new row (a new `version`), nothing is updated or
--   deleted, and the current state is the newest version (`payments_current`);
-- - an invoice number is unique per supplier, and `invoice_counters` keeps the last number per supplier and year.
-- Only a full replacement by tools/db/import-json.js --replace may delete rows (craftcrew.replace_all = on).
-- The functions keep the schema they were made in (search_path from current), whoever calls them.
create table invoices (
  id text primary key,
  pos double precision not null,
  number text,
  supplier_id text,
  customer_id text,
  project_id text,
  status text constraint invoices_status_check
    check (status in ('Draft', 'Submitted', 'Changes Requested', 'Approved', 'Rejected', 'Paid', 'Refunded')),
  amount numeric(12, 2),
  net_amount numeric(12, 2),
  vat_amount numeric(12, 2),
  gross_amount numeric(12, 2),
  vat_mode text,
  vat_rate numeric(12, 2),
  service_date_from date,
  service_date_to date,
  line_items jsonb,
  revisions jsonb,
  created_at timestamptz,
  extra jsonb not null default '{}',
  updated_at timestamptz not null default now(),
  constraint invoices_number_unique unique (supplier_id, number)
);
create index invoices_supplier on invoices (supplier_id);
create index invoices_customer on invoices (customer_id);
create index invoices_project on invoices (project_id);

-- What may not change after approval. A value that did not fit its column is in `extra`, so both count.
create function invoice_locked(i invoices) returns jsonb language sql immutable set search_path from current as $$
  select jsonb_build_object(
    'supplierId', coalesce(to_jsonb(i.supplier_id), i.extra -> 'supplierId'),
    'customerId', coalesce(to_jsonb(i.customer_id), i.extra -> 'customerId'),
    'amount', coalesce(to_jsonb(i.amount), i.extra -> 'amount'),
    'netAmount', coalesce(to_jsonb(i.net_amount), i.extra -> 'netAmount'),
    'vatAmount', coalesce(to_jsonb(i.vat_amount), i.extra -> 'vatAmount'),
    'grossAmount', coalesce(to_jsonb(i.gross_amount), i.extra -> 'grossAmount'),
    'vatMode', coalesce(to_jsonb(i.vat_mode), i.extra -> 'vatMode'),
    'vatRate', coalesce(to_jsonb(i.vat_rate), i.extra -> 'vatRate'),
    'lineItems', coalesce(i.line_items, i.extra -> 'lineItems'),
    'serviceDateFrom', coalesce(to_jsonb(i.service_date_from), i.extra -> 'serviceDateFrom'),
    'serviceDateTo', coalesce(to_jsonb(i.service_date_to), i.extra -> 'serviceDateTo'))
$$;

create function invoices_guard() returns trigger language plpgsql set search_path from current as $$
begin
  if tg_op = 'DELETE' then
    if current_setting('craftcrew.replace_all', true) = 'on' then
      return old;
    end if;
    raise exception 'Invoices are kept for 10 years and cannot be deleted.';
  end if;
  if old.status in ('Approved', 'Paid', 'Refunded') and (
    invoice_locked(old) is distinct from invoice_locked(new)
    or (coalesce(old.number, old.extra ->> 'number') is not null
        and coalesce(new.number, new.extra ->> 'number') is distinct from coalesce(old.number, old.extra ->> 'number'))
  ) then
    raise exception 'This invoice is approved and can no longer be changed.';
  end if;
  return new;
end $$;
create trigger invoices_guard before update or delete on invoices
  for each row execute function invoices_guard();

create table invoice_counters (
  supplier_id text not null,
  year text not null,
  last integer not null,
  primary key (supplier_id, year)
);
create function invoice_counted() returns trigger language plpgsql set search_path from current as $$
begin
  if new.number ~ '^\d{4}-\d{1,9}$' then
    insert into invoice_counters (supplier_id, year, last)
    values (coalesce(new.supplier_id, 'none'), split_part(new.number, '-', 1), split_part(new.number, '-', 2)::integer)
    on conflict (supplier_id, year) do update set last = greatest(invoice_counters.last, excluded.last);
  end if;
  return new;
end $$;
create trigger invoices_counted after insert or update of number on invoices
  for each row execute function invoice_counted();

create table payments (
  id text not null,
  version integer not null,
  pos double precision not null,
  invoice_id text,
  status text,
  amount numeric(12, 2),
  created_at timestamptz,
  extra jsonb not null default '{}',
  recorded_at timestamptz not null default now(),
  primary key (id, version)
);
create index payments_invoice on payments (invoice_id);
create view payments_current as
  select distinct on (id) * from payments order by id, version desc;

create function payments_guard() returns trigger language plpgsql set search_path from current as $$
begin
  if tg_op = 'DELETE' and current_setting('craftcrew.replace_all', true) = 'on' then
    return old;
  end if;
  raise exception 'Payments are never changed or deleted: a correction is a new entry.';
end $$;
create trigger payments_guard before update or delete on payments
  for each row execute function payments_guard();
