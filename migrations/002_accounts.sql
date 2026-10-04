-- T164: accounts, sessions and sign-in tokens in real tables. The database itself now guarantees one account
-- per email address and only known roles, and a user's sessions and tokens go when the user goes.
-- Fields without a column stay in `extra` (see TABLES in store-postgres.js); `pos` keeps the list order.
create table users (
  id text primary key,
  pos double precision not null,
  email text,
  role text constraint users_role_check check (role in ('customer', 'supplier', 'admin')),
  status text,
  password_hash text,
  salt text,
  created_at timestamptz,
  extra jsonb not null default '{}',
  updated_at timestamptz not null default now()
);
create unique index users_email_unique on users (lower(email));

create table sessions (
  token_hash text primary key,
  pos double precision not null,
  user_id text references users (id) on delete cascade deferrable initially deferred,
  created_at timestamptz,
  last_seen_at timestamptz,
  expires_at timestamptz,
  extra jsonb not null default '{}',
  updated_at timestamptz not null default now()
);
create index sessions_user on sessions (user_id);

create table auth_tokens (
  token_hash text primary key,
  pos double precision not null,
  user_id text references users (id) on delete cascade deferrable initially deferred,
  type text,
  expires_at timestamptz,
  extra jsonb not null default '{}',
  updated_at timestamptz not null default now()
);
create index auth_tokens_user on auth_tokens (user_id);
