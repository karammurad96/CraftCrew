-- T283c3: preserve known monetary operation identities and monotonic outcomes.
create function stripe_operation_rank(value text) returns integer language sql immutable as $$
  select case value when 'pending' then 0 when 'failed' then 1 when 'unknown' then 2 when 'succeeded' then 3 else -1 end
$$;
create function stripe_operations_guard() returns trigger language plpgsql set search_path from current as $$
declare field text;
begin
  if old.collection <> 'stripeOperations' then
    if tg_op = 'DELETE' then return old; end if;
    if new.collection = 'stripeOperations' then raise exception 'Stripe operation identities and outcomes cannot be removed or regressed'; end if;
    return new;
  end if;
  if tg_op = 'DELETE' then
    if current_setting('craftcrew.replace_all', true) = 'on' then return old; end if;
    raise exception 'Stripe operation identities and outcomes cannot be removed or regressed';
  end if;
  if old.collection is distinct from new.collection or old.key is distinct from new.key then
    raise exception 'Stripe operation identities and outcomes cannot be removed or regressed';
  end if;
  foreach field in array array['id','logicalKeyHash','idempotencyKey','kind','ownerId','amountMinor','currency','metadata','createdAt'] loop
    if old.data -> field is distinct from new.data -> field then raise exception 'Stripe operation identities and outcomes cannot be removed or regressed'; end if;
  end loop;
  if (old.data ->> 'providerRef' is not null and old.data -> 'providerRef' is distinct from new.data -> 'providerRef')
    or (old.data ->> 'providerType' is not null and old.data -> 'providerType' is distinct from new.data -> 'providerType')
    or stripe_operation_rank(new.data ->> 'status') < 0
    or stripe_operation_rank(new.data ->> 'status') < stripe_operation_rank(old.data ->> 'status')
    or coalesce((new.data ->> 'attempts')::numeric, 0) < coalesce((old.data ->> 'attempts')::numeric, 0)
    or (new.data ? 'attempts' and jsonb_typeof(new.data -> 'attempts') <> 'number')
    or coalesce((new.data ->> 'attempts')::numeric, 0) > 9007199254740991
    or coalesce((new.data ->> 'attempts')::numeric, 0) < 0
    or coalesce((new.data ->> 'attempts')::numeric, 0) <> trunc(coalesce((new.data ->> 'attempts')::numeric, 0)) then
    raise exception 'Stripe operation identities and outcomes cannot be removed or regressed';
  end if;
  return new;
end $$;
create trigger stripe_operations_guard before update or delete on records
  for each row execute function stripe_operations_guard();
