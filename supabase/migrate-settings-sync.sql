-- Migration for databases created from a schema.sql that predates the extra
-- settings columns (category budgets, category order, custom categories,
-- custom payment methods, profile name). Run once in the Supabase dashboard:
-- SQL Editor -> New query -> paste this file -> Run. Safe to re-run.
--
-- The columns are nullable on purpose: NULL means "no device has pushed this
-- field yet", so existing devices keep their local values until they sync
-- (the app seeds them on its first pull after this migration). Until this is
-- run, the app falls back to pushing only display_currency/monthly_budget,
-- so nothing breaks in the meantime.

alter table public.settings
  add column if not exists category_budgets jsonb,
  add column if not exists category_order jsonb,
  add column if not exists custom_categories jsonb,
  add column if not exists custom_payment_methods jsonb,
  add column if not exists first_name text,
  add column if not exists last_name text;
