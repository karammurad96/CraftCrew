-- T282a: operational identities live independently of bounded display history.
create table stripe_webhook_inbox (
  event_id text primary key,
  data jsonb not null,
  constraint stripe_webhook_inbox_identity check (data->>'id' = event_id),
  constraint stripe_webhook_inbox_state check (data->>'state' in ('received','processing','handled','failed'))
);
create index stripe_webhook_inbox_recent on stripe_webhook_inbox ((data->>'receivedAt'));
