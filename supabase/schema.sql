-- Expense-tracker schema. Run once in the Supabase dashboard:
-- SQL Editor -> New query -> paste this file -> Run.

-- Expenses keep the app's client-generated string ids and epoch-ms timestamps,
-- so a row maps 1:1 onto the in-app expense object. The primary key includes
-- user_id so ids only have to be unique per user, and upserts can never
-- collide with another user's row.
create table public.expenses (
  id text not null,
  user_id uuid not null default auth.uid() references auth.users (id) on delete cascade,
  amount numeric not null,
  currency text not null,
  note text not null default '',
  category text not null default 'other',
  created_at bigint not null, -- epoch milliseconds, same as the app's createdAt
  updated_at timestamptz not null default now(),
  primary key (user_id, id)
);

-- The app's pull is "all of my expenses, newest first".
create index expenses_user_created_idx on public.expenses (user_id, created_at desc);

-- Income entries mirror the expenses table 1:1 (client string ids, epoch-ms
-- created_at). `source` is the income category (salary/freelance/...), `note`
-- is the optional description. Balance is always derived (SUM(income) -
-- SUM(expenses)) — never stored.
create table public.income (
  id text not null,
  user_id uuid not null default auth.uid() references auth.users (id) on delete cascade,
  amount numeric not null,
  currency text not null,
  source text not null default 'other',
  note text not null default '',
  created_at bigint not null, -- epoch milliseconds, same as the app's createdAt
  updated_at timestamptz not null default now(),
  primary key (user_id, id)
);

-- The app's pull is "all of my income, newest first"; also covers the
-- (user_id, date) lookup pattern from the spec since created_at IS the entry date.
create index income_user_created_idx on public.income (user_id, created_at desc);

-- Split-bills groups — each user's groups are independent (personal ledger, not
-- shared-access). Members are stored as a jsonb array of {id, name} objects
-- because they're typed names, not Supabase users.
create table public.groups (
  id text not null,
  user_id uuid not null default auth.uid() references auth.users (id) on delete cascade,
  name text not null,
  currency text not null,
  payment_method text not null default 'cash',
  members jsonb not null default '[]'::jsonb,
  created_at bigint not null,
  updated_at timestamptz not null default now(),
  primary key (user_id, id)
);

create index groups_user_created_idx on public.groups (user_id, created_at desc);

-- Split expenses (bills + settlement records). Both live in the same table;
-- settlements are distinguished by `settlement = true` and use from_member/to_member
-- instead of paid_by/mode/shares. shares is a jsonb object {memberId: amount}.
create table public.split_expenses (
  id text not null,
  user_id uuid not null default auth.uid() references auth.users (id) on delete cascade,
  group_id text not null,
  description text not null default '',
  amount numeric not null,
  currency text not null,
  category text not null default 'other',
  paid_by text not null default '',
  mode text not null default 'equal',
  shares jsonb not null default '{}'::jsonb,
  settlement boolean not null default false,
  from_member text not null default '',
  to_member text not null default '',
  created_at bigint not null,
  updated_at timestamptz not null default now(),
  primary key (user_id, id)
);

create index split_expenses_user_created_idx on public.split_expenses (user_id, created_at desc);

-- One settings row per user. The extra preference columns are nullable ON
-- PURPOSE: NULL means "no device has pushed this field yet", so the app keeps
-- its local value instead of clobbering it with an empty default (this is what
-- makes adding these columns to a live database safe). Only per-device
-- preferences (theme, language, onboarding flag) stay off the server.
-- Existing database? Run supabase/migrate-settings-sync.sql instead.
create table public.settings (
  user_id uuid primary key default auth.uid() references auth.users (id) on delete cascade,
  display_currency text not null,
  monthly_budget numeric not null default 0,
  category_budgets jsonb,        -- {categoryId: amount}, in the display currency
  category_order jsonb,          -- Insight grid tile order; null = spend-sorted
  custom_categories jsonb,       -- user-created categories
  custom_payment_methods jsonb,  -- user-created split-bill payment methods
  first_name text,
  last_name text,
  updated_at timestamptz not null default now()
);

-- Row Level Security: every query runs as the signed-in user and can only
-- touch rows whose user_id matches. The client never sends user_id; the
-- column default (auth.uid()) fills it on insert.
alter table public.expenses enable row level security;
alter table public.income enable row level security;
alter table public.groups enable row level security;
alter table public.split_expenses enable row level security;
alter table public.settings enable row level security;

create policy "Users manage their own expenses" on public.expenses
  for all using (auth.uid() = user_id) with check (auth.uid() = user_id);

create policy "Users manage their own income" on public.income
  for all using (auth.uid() = user_id) with check (auth.uid() = user_id);

create policy "Users manage their own groups" on public.groups
  for all using (auth.uid() = user_id) with check (auth.uid() = user_id);

create policy "Users manage their own split expenses" on public.split_expenses
  for all using (auth.uid() = user_id) with check (auth.uid() = user_id);

create policy "Users manage their own settings" on public.settings
  for all using (auth.uid() = user_id) with check (auth.uid() = user_id);

-- Keep updated_at honest on updates (upserts from the app hit this).
create extension if not exists moddatetime schema extensions;

create trigger expenses_updated_at before update on public.expenses
  for each row execute procedure extensions.moddatetime (updated_at);

create trigger income_updated_at before update on public.income
  for each row execute procedure extensions.moddatetime (updated_at);

create trigger groups_updated_at before update on public.groups
  for each row execute procedure extensions.moddatetime (updated_at);

create trigger split_expenses_updated_at before update on public.split_expenses
  for each row execute procedure extensions.moddatetime (updated_at);

create trigger settings_updated_at before update on public.settings
  for each row execute procedure extensions.moddatetime (updated_at);
