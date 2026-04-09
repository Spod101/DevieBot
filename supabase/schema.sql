-- ============================================================
-- DEVIE DASHBOARD - Supabase Schema
-- Run this in your Supabase SQL editor
-- ============================================================

-- Enable UUID extension
create extension if not exists "uuid-ossp";

-- ============================================================
-- ENUMS
-- ============================================================
create type task_priority as enum ('low', 'medium', 'high', 'urgent');
create type task_status as enum ('todo', 'in_progress', 'in_review', 'blocked', 'done');
create type camp_status as enum ('active', 'completed', 'archived', 'paused');

-- ============================================================
-- TAGS
-- ============================================================
create table tags (
  id uuid primary key default uuid_generate_v4(),
  name text not null unique,
  color text not null default '#6366f1',
  created_at timestamptz default now()
);

-- ============================================================
-- CODE CAMPS
-- ============================================================
create table code_camps (
  id uuid primary key default uuid_generate_v4(),
  name text not null,
  description text,
  status camp_status not null default 'active',
  progress integer not null default 0 check (progress >= 0 and progress <= 100),
  start_date date,
  end_date date,
  resources jsonb default '[]'::jsonb, -- [{title, url}]
  created_at timestamptz default now(),
  updated_at timestamptz default now()
);

-- ============================================================
-- TASKS
-- ============================================================
create table tasks (
  id uuid primary key default uuid_generate_v4(),
  title text not null,
  description text,
  priority task_priority not null default 'medium',
  status task_status not null default 'todo',
  due_date date,
  order_index integer not null default 0,
  camp_id uuid references code_camps(id) on delete cascade,
  -- null camp_id = general board task
  created_at timestamptz default now(),
  updated_at timestamptz default now()
);

-- ============================================================
-- TASK TAGS (junction)
-- ============================================================
create table task_tags (
  task_id uuid references tasks(id) on delete cascade,
  tag_id uuid references tags(id) on delete cascade,
  primary key (task_id, tag_id)
);

-- ============================================================
-- TASK COMMENTS
-- ============================================================
create table task_comments (
  id uuid primary key default uuid_generate_v4(),
  task_id uuid references tasks(id) on delete cascade not null,
  content text not null,
  created_at timestamptz default now(),
  updated_at timestamptz default now()
);

-- ============================================================
-- MEMBERS (team members for task assignment)
-- ============================================================
create table members (
  id uuid primary key default uuid_generate_v4(),
  name text not null,
  color text not null default '#6366f1', -- for avatar fallback background
  avatar_url text,
  created_at timestamptz default now()
);

-- ============================================================
-- TASK ASSIGNMENTS (junction)
-- ============================================================
create table task_assignments (
  task_id uuid references tasks(id) on delete cascade,
  member_id uuid references members(id) on delete cascade,
  primary key (task_id, member_id)
);

-- ============================================================
-- TELEGRAM CONFIG
-- ============================================================
create table telegram_config (
  id uuid primary key default uuid_generate_v4(),
  chat_id text,
  bot_token text,
  standup_time text default '09:00', -- HH:MM
  standup_enabled boolean default true,
  standup_message_template text,
  updated_at timestamptz default now()
);

-- Insert a default row
insert into telegram_config (id) values (uuid_generate_v4());

-- ============================================================
-- UPDATED_AT TRIGGER FUNCTION
-- ============================================================
create or replace function update_updated_at()
returns trigger as $$
begin
  new.updated_at = now();
  return new;
end;
$$ language plpgsql;

create trigger tasks_updated_at before update on tasks
  for each row execute function update_updated_at();

create trigger code_camps_updated_at before update on code_camps
  for each row execute function update_updated_at();

create trigger task_comments_updated_at before update on task_comments
  for each row execute function update_updated_at();

-- ============================================================
-- ROW LEVEL SECURITY
-- ============================================================
alter table tasks enable row level security;
alter table code_camps enable row level security;
alter table tags enable row level security;
alter table task_tags enable row level security;
alter table task_comments enable row level security;
alter table members enable row level security;
alter table task_assignments enable row level security;
alter table telegram_config enable row level security;

-- Allow authenticated users (admin) full access to everything
create policy "Authenticated full access" on tasks
  for all to authenticated using (true) with check (true);

create policy "Authenticated full access" on code_camps
  for all to authenticated using (true) with check (true);

create policy "Authenticated full access" on tags
  for all to authenticated using (true) with check (true);

create policy "Authenticated full access" on task_tags
  for all to authenticated using (true) with check (true);

create policy "Authenticated full access" on task_comments
  for all to authenticated using (true) with check (true);

create policy "Authenticated full access" on members
  for all to authenticated using (true) with check (true);

create policy "Authenticated full access" on task_assignments
  for all to authenticated using (true) with check (true);

create policy "Authenticated full access" on telegram_config
  for all to authenticated using (true) with check (true);

-- Service role can access everything (for API routes/bot)
create policy "Service role full access" on tasks
  for all to service_role using (true) with check (true);

create policy "Service role full access" on code_camps
  for all to service_role using (true) with check (true);

create policy "Service role full access" on tags
  for all to service_role using (true) with check (true);

create policy "Service role full access" on task_tags
  for all to service_role using (true) with check (true);

create policy "Service role full access" on task_comments
  for all to service_role using (true) with check (true);

create policy "Service role full access" on members
  for all to service_role using (true) with check (true);

create policy "Service role full access" on task_assignments
  for all to service_role using (true) with check (true);

create policy "Service role full access" on telegram_config
  for all to service_role using (true) with check (true);

-- ============================================================
-- SEED DATA (optional starter tags)
-- ============================================================
insert into tags (name, color) values
  ('bug', '#ef4444'),
  ('feature', '#6366f1'),
  ('documentation', '#f59e0b'),
  ('design', '#ec4899'),
  ('backend', '#10b981'),
  ('frontend', '#3b82f6'),
  ('devops', '#8b5cf6'),
  ('urgent', '#f97316');
