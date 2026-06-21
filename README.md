# Expense Tracker (Expo demo)

A polished expense **and income** tracker built with Expo / React Native (SDK 56). Multi-currency
entries, monthly & per-category budgets, spending trends, month-over-month category comparison,
income vs. expenses with a running balance, six themes, and three languages — with offline-first
on-device storage and optional cloud sync.

## Run it

Install **Expo Go** on your phone, then start the dev server and scan the QR code from the terminal:

```
npm start                 # LAN (phone on the same Wi-Fi)
npx expo start --tunnel   # through firewalls / cellular
```

Or run it in a browser with `npm run web`. (For a native dev build instead of Expo Go:
`npm run ios` / `npm run android`.)

## Backend (optional)

By default the app runs **local-only** — no sign-in, all data in AsyncStorage. To enable accounts
and cross-device sync, add a Supabase project's URL / anon key to `.env` (template in `.env.example`)
and run `supabase/schema.sql`. See **SUPABASE_SETUP.md** for the one-time steps.

## Using the app

Four tabs plus a center **+**, and a floating **gear** (top-left) for account & settings:

- **Dashboard** — this month's spending, a trend chart, and a budget gauge with per-category bars.
  The currency pill and **Edit budgets** open the budget editor (display currency, overall and
  per-category budgets).
- **+ (Add expense)** — amount with a per-entry currency, category grid, note, and date. Saving
  pops a gradient checkmark and keeps you on the form, ready for the next entry.
- **Expenses** — day-grouped log with a calendar day picker and category filters. Tap a row to
  edit, long-press to delete. Rows whose entry currency differs from the display currency show the
  original amount in small text.
- **Categories** — current vs. last month as side-by-side donut charts with per-category deltas;
  create your own categories with custom icons and colors.
- **Balance** — total income − expenses with a month-over-month delta, an income/expense bar chart
  (toggle 3 or 6 months, tap a month to focus it), and your income entries grouped by month. The
  bottom-right **+** adds income.
- **Gear (top-left) → Account** — email / sign-out (when signed in), language, and theme.

On first launch, tap **Load demo data** for three months of sample expenses and income in mixed
currencies.

Exchange rates are a static snapshot in `src/currency.js`; `convert()` is the single helper to swap
for a live API later. Amounts are stored in their entry currency and converted at display time.

## Structure

All state lives in `App.js` (data, persistence/sync wiring, currency conversion in one derive pass,
and hand-rolled tab + overlay navigation); everything under `src/` is presentational or a pure
helper — `screens/`, `components/`, plus `currency.js`, `storage.js`, `sync.js`, `categories.js`,
`incomeSources.js`, `format.js`, `i18n.js`, `theme.js`, and `icons.js`. See **CLAUDE.md** for the
full architecture and conventions.
```
