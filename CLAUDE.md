# CLAUDE.md

This file provides guidance to Claude Code (claude.ai/code) when working with code in this repository.

@AGENTS.md

## Project

Expense-tracker demo built with Expo SDK 56 / React Native 0.85 (React 19). Plain JavaScript, no TypeScript. There is no test suite, linter, or build step.

## Commands

```
npm start                  # Expo dev server (LAN — phone must be on same Wi-Fi)
npx expo start --tunnel    # dev server through ngrok tunnel (works across networks)
node scripts/make-qr.js [exp-url]   # write a scannable QR PNG for a tunnel URL to ../expense-tracker-qr.png
```

The app is run on a phone via Expo Go (scan the QR from the terminal), or in a browser with `npm run web`.

## Architecture

All state lives in `App.js`; everything under `src/` is presentational or a pure helper.

- `App.js` — root component. Owns the `expenses` array (flat list of `{id, amount, note, category, createdAt}`), add/delete handlers, and persistence wiring: expenses load from AsyncStorage once on mount, then every change is auto-saved via an effect gated on the `loaded` flag (prevents clobbering storage with the initial empty array). `deriveViewData()` computes everything the UI shows — day-grouped SectionList sections, month/today totals, per-category totals — in one memoized pass.
- A `dayStamp` state value (today's date key, refreshed every minute and on app-resume via AppState) is a dependency of that memo so "Today"/month stats roll over at midnight even though `expenses` hasn't changed. Date-sensitive derived data must depend on it.
- `src/components/` — presentational components receiving data + callbacks as props (`SummaryHeader`, `CategoryBreakdown`, `ExpenseRow`, `AddExpenseSheet`). `AddExpenseSheet` owns its own form state.
- `src/storage.js` — AsyncStorage load/save under one key; both swallow errors by design (persistence is best-effort, in-memory state is the source of truth).
- `src/categories.js` — the fixed category list (id/label/emoji/color). `getCategory(id)` falls back to "Other" for unknown ids, so stored data with stale category ids still renders.
- `src/theme.js` — `colors` / `spacing` / `radius` tokens used by all StyleSheets; use these rather than hardcoding values.
- `src/format.js` — money and date formatting. `dateKey()` (local-time `YYYY-MM-DD`) is the canonical day identity used for grouping and today/month checks.
- `src/demoData.js` — sample expenses for the empty-state "Load demo data" button.
