-- T166: projects, their phases and their tasks in real tables, one row per project, phase and task, so changing
-- one task writes one row. A phase points to its project, a task to its phase; deleting a project deletes its
-- phases and tasks. Fields without a column (deliverables, assignment history, defects …) stay in `extra`.
-- A project or phase that has a child list carries "$phases": true or "$tasks": true in `extra`.
create table projects (
  id text primary key,
  pos double precision not null,
  customer_id text,
  name text,
  status text,
  budget numeric(12, 2),
  start_date date,
  due_date date,
  created_at timestamptz,
  extra jsonb not null default '{}',
  updated_at timestamptz not null default now()
);
create index projects_customer on projects (customer_id);

create table phases (
  id text primary key,
  project_id text not null references projects (id) on delete cascade deferrable initially deferred,
  pos double precision not null,
  name text,
  status text,
  start_date date,
  due_date date,
  supplier_id text,
  extra jsonb not null default '{}',
  updated_at timestamptz not null default now()
);
create index phases_project on phases (project_id, pos);

create table tasks (
  id text primary key,
  phase_id text not null references phases (id) on delete cascade deferrable initially deferred,
  pos double precision not null,
  name text,
  status text,
  start_date date,
  due_date date,
  assigned_supplier_id text,
  progress numeric(12, 2),
  order_amount numeric(12, 2),
  extra jsonb not null default '{}',
  updated_at timestamptz not null default now()
);
create index tasks_phase on tasks (phase_id, pos);
create index tasks_supplier on tasks (assigned_supplier_id);
create index tasks_due on tasks (due_date);
