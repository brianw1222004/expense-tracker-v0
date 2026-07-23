-- Migration for EXISTING databases: drop the retired income feature's table and
-- the vestigial first_name / last_name settings columns.
--
-- Safe to run once on a live database created from an older schema.sql. Fresh
-- setups don't need it — schema.sql no longer creates these. Idempotent (uses
-- IF EXISTS), so re-running is harmless.
--
-- The client already stopped reading/writing all of this (the income sync lane
-- and the name sync fields were removed), and "delete account" wipes any
-- lingering income rows per-user. This reclaims the now-dead server storage.
--
-- Run in the Supabase dashboard: SQL Editor -> New query -> paste -> Run.

-- The income table (its RLS policy, index, and trigger drop with it via CASCADE).
drop table if exists public.income cascade;

-- Dead settings columns — the app no longer syncs a name.
alter table public.settings
  drop column if exists first_name,
  drop column if exists last_name;
