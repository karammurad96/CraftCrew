-- T283b1: disputed invoices remain immutable; monetary history is append-only.
alter table invoices drop constraint invoices_status_check;
alter table invoices add constraint invoices_status_check check
  (status in ('Draft','Submitted','Changes Requested','Approved','Rejected','Paid','Refunded','Disputed'));

create or replace function invoices_guard() returns trigger language plpgsql set search_path from current as $$
begin
  if tg_op = 'DELETE' then
    if current_setting('craftcrew.replace_all', true) = 'on' then return old; end if;
    raise exception 'Invoices are kept for 10 years and cannot be deleted.';
  end if;
  if old.status in ('Approved','Paid','Refunded','Disputed') and (
    invoice_locked(old) is distinct from invoice_locked(new)
    or (coalesce(old.number, old.extra ->> 'number') is not null
      and coalesce(new.number, new.extra ->> 'number') is distinct from coalesce(old.number, old.extra ->> 'number'))
  ) then raise exception 'This invoice is approved and can no longer be changed.'; end if;
  return new;
end $$;

create function stripe_financial_records_guard() returns trigger language plpgsql set search_path from current as $$
begin
  if old.collection <> 'stripeFinancialRecords' then
    if tg_op = 'DELETE' then return old; end if;
    if new.collection = 'stripeFinancialRecords' then raise exception 'Stripe financial history cannot be removed or changed'; end if;
    return new;
  end if;
  if tg_op = 'DELETE' then
    if current_setting('craftcrew.replace_all', true) = 'on' then return old; end if;
    raise exception 'Stripe financial history cannot be removed or changed';
  end if;
  if old.collection is distinct from new.collection or old.key is distinct from new.key or old.data is distinct from new.data then
    raise exception 'Stripe financial history cannot be removed or changed';
  end if;
  return new;
end $$;
create trigger stripe_financial_records_guard before update or delete on records
  for each row execute function stripe_financial_records_guard();
