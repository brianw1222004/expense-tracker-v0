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

-- One settings row per user.
create table public.settings (
  user_id uuid primary key default auth.uid() references auth.users (id) on delete cascade,
  display_currency text not null,
  monthly_budget numeric not null default 0,
  updated_at timestamptz not null default now()
);

-- Row Level Security: every query runs as the signed-in user and can only
-- touch rows whose user_id matches. The client never sends user_id; the
-- column default (auth.uid()) fills it on insert.
alter table public.expenses enable row level security;
alter table public.income enable row level security;
alter table public.settings enable row level security;

create policy "Users manage their own expenses" on public.expenses
  for all using (auth.uid() = user_id) with check (auth.uid() = user_id);

create policy "Users manage their own income" on public.income
  for all using (auth.uid() = user_id) with check (auth.uid() = user_id);

create policy "Users manage their own settings" on public.settings
  for all using (auth.uid() = user_id) with check (auth.uid() = user_id);

-- Keep updated_at honest on updates (upserts from the app hit this).
create extension if not exists moddatetime schema extensions;

create trigger expenses_updated_at before update on public.expenses
  for each row execute procedure extensions.moddatetime (updated_at);

create trigger income_updated_at before update on public.income
  for each row execute procedure extensions.moddatetime (updated_at);

create trigger settings_updated_at before update on public.settings
  for each row execute procedure extensions.moddatetime (updated_at);
