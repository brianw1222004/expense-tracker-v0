# Supabase setup

One-time setup to turn on accounts + cloud sync. Until this is done the app
keeps running in local-only mode (no sign-in screen, data stays on-device),
so nothing breaks in the meantime.

## 1. Create the project

1. Go to [supabase.com](https://supabase.com) → **New project** (the free tier is fine).
2. Pick any name/region and a database password (you won't need the password in the app).

## 2. Create the tables

1. In the dashboard, open **SQL Editor → New query**.
2. Paste the contents of [`supabase/schema.sql`](supabase/schema.sql) and **Run**.

This creates the `expenses`, `income`, and `settings` tables with Row Level
Security, so each signed-in user can only ever read/write their own rows.

> Already have an older database? Re-run `schema.sql` (or just the `income`
> table + policy + trigger block) to add the new `income` table. Until it
> exists, income simply won't sync — expense sync is unaffected (income uses a
> separate, tolerant sync lane).

## 3. Configure auth

The app uses email + password (works in Expo Go on phone *and* web with no
deep-link setup).

- **Authentication → Sign In / Providers**: Email is enabled by default — nothing to do.
- Optional, recommended while developing: turn **off** "Confirm email"
  (Authentication → Sign In / Providers → Email) so new accounts work
  immediately. With it on, users must click the link in their inbox before
  the first sign-in — the app handles that flow too, it's just slower to test.

## 4. Wire up the app

1. In the dashboard: **Settings → API**. Copy the **Project URL** and the
   **anon / publishable key**.
2. In `expense-tracker/`: copy `.env.example` to `.env` and fill both values:

   ```
   EXPO_PUBLIC_SUPABASE_URL=https://xxxx.supabase.co
   EXPO_PUBLIC_SUPABASE_ANON_KEY=eyJ...
   ```

3. Restart the dev server (`npm start`) and do a full reload in the app —
   env values are inlined at build time, not read at runtime.

The anon key is safe to ship in the client bundle: it only grants what Row
Level Security allows. `.env` is gitignored anyway.

## How sync works (short version)

- The UI always renders from the AsyncStorage cache first — opening the app is
  instant even with no network.
- Every add/delete/settings change applies locally, then lands in a durable
  pending-ops queue (`src/sync.js`) that pushes to Supabase immediately when
  online, or on the next launch/foreground when not.
- On launch and on each return to the foreground, the app pulls the server's
  rows and re-applies any still-pending local ops on top, so offline edits
  survive and other devices' changes appear.
- Conflict policy between devices: last write to the server wins, per expense.

## Trying it

1. Sign up in the app (twice if email confirmation is on — confirm, then sign in).
2. Add an expense → it appears in **Table Editor → expenses** within a second or two.
3. Airplane mode → add a few expenses → they show instantly in the app; back
   online (or reopen the app) → they appear in the table.
4. Sign in with the same account in the web build (`npm run web`) → same data.
