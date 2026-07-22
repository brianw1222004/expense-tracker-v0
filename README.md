# Expense Tracker (Expo demo)

A polished expense tracker built with Expo / React Native (SDK 56). Multi-currency entries, monthly
& per-category budgets, spending trends, Splitwise-style shared bills, three themes, and three
languages — with offline-first on-device storage and optional cloud sync.

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

Four tabs with a center **+**, plus a floating account button (top-left) for account & settings:

- **Dashboard** — a selected-month spending summary with a trend chart (Daily/Monthly toggle), a
  category-spending donut with the top categories, and a split-balances widget. Step the ‹ month ›
  selector under the title to review past months.
- **+ (Add)** — a popup with a **Personal / Shared** toggle: Personal adds an expense (amount with a
  per-entry currency, category grid, note, and date); Shared adds a split bill to a group. Saving an
  expense pops a gradient checkmark and closes the popup.
- **Expenses** — day-grouped log with a calendar day picker and category filters. Tap a row to edit,
  long-press to delete. Rows whose entry currency differs from the display currency show the
  original amount in small text.
- **Split** — Splitwise-style groups: each group card shows its total spent, your net position, and
  recent bills. Open a group to add/edit bills (equal, custom, percentage, or itemized tax splits),
  settle balances, and manage members. Your share of every bill counts toward your spending totals.
- **Insight** — a budget bar (remaining/over, % used) plus a per-category list with budget progress
  bars; set the display currency, edit overall and per-category budgets, and create your own
  categories with custom icons and colors.
- **Account** (floating button, top-left) — email / sign-out (when signed in), language, and theme.

On first launch, tap **Load demo data** for three months of sample expenses in mixed currencies.

Exchange rates are a static snapshot in `src/currency.js`; `convert()` is the single helper to swap
for a live API later. Amounts are stored in their entry currency and converted at display time.

## Structure

All state lives in `App.js` (data, persistence/sync wiring, currency conversion in one derive pass,
and hand-rolled tab + overlay navigation); everything under `src/` is presentational or a pure
helper — `screens/`, `components/`, plus `currency.js`, `storage.js`, `sync.js`, `categories.js`,
`splits.js`, `derive.js`, `format.js`, `i18n.js`, `theme.js`, and `icons.js`. See **CLAUDE.md** for
the full architecture and conventions.
