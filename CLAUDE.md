# CLAUDE.md

This file provides guidance to Claude Code (claude.ai/code) when working with code in this repository.

@AGENTS.md

## Project

Expense-tracker demo built with Expo SDK 56 / React Native 0.85 (React 19). Plain JavaScript, no TypeScript. There is no test suite or linter; `npx expo export --platform web` is the closest thing to a build check (it catches syntax/import errors).

## Commands

```
npm start                  # Expo dev server (LAN — phone must be on same Wi-Fi)
npx expo start --tunnel    # dev server through ngrok tunnel (works across networks)
npm run web                # run in the browser via react-native-web
node scripts/make-qr.js [exp-url]   # write a scannable QR PNG for a tunnel URL to ../expense-tracker-qr.png
```

The app is run on a phone via Expo Go (scan the QR from the terminal), or in a browser with `npm run web`. Code must work on BOTH targets — e.g. `Alert.alert` with buttons is a no-op on web (use a `window.confirm` fallback), and `onEndEditing` never fires on web (use `onBlur`).

## RN 0.85 gotchas (verified against the v56 docs)

- `StyleSheet.absoluteFillObject` was removed; use `StyleSheet.absoluteFill` as a style entry.
- Classic `Animated` is the supported animation API here (no reanimated). `useNativeDriver: true` only for `transform`/`opacity`; animating SVG props (`strokeDashoffset` on `Animated.createAnimatedComponent(Path)`) requires `useNativeDriver: false`. Never mix drivers on one `Animated.Value`.

## Architecture

All state lives in `App.js`; everything under `src/` is presentational or a pure helper. Navigation is hand-rolled (no react-navigation): a `tab` state (`dashboard | add | list`) drives three kept-mounted tab screens (inactive ones are `display: 'none'` so form/scroll state survives switching — dismiss the keyboard on tab change), and an `overlay` state (`settings | compare | null`) drives two Modal screens.

- `App.js` — root component. Owns `expenses` (`{id, amount, currency, note, category, createdAt}`, amount in the ENTRY currency), `settings` (`{displayCurrency, monthlyBudget}`), nav state, and `rewardNonce` (increments per added expense to trigger RewardCheck). Expenses and settings persist to AsyncStorage independently, each behind its own `loaded` flag (prevents clobbering storage with initial state). `deriveViewData(expenses, displayCurrency)` computes everything the UI shows in one pass, all converted to the display currency: day-grouped sections (items gain `displayAmount`), current-month stats, and per-month aggregates for Compare. Category keys are normalized through `getCategory()` so stale ids group under "Other" everywhere. When the display currency changes, `updateSettings` re-denominates the stored budget via `convert()`.
- A `dayStamp` state value (today's date key, refreshed every minute and on app-resume via AppState) is a dependency of that memo so stats roll over at midnight even though `expenses` hasn't changed. Date-sensitive derived data must depend on it.
- `src/currency.js` — `CURRENCIES` (code/symbol/name/decimals), static `RATES_TO_USD`, and `convert(amount, from, to)`. **Conversion happens ONLY here** (single helper by design — swapping in a live-rate API is a one-function change). Amounts are stored in their entry currency forever; conversion is a display-time concern.
- `src/screens/` — one file per screen: `DashboardScreen` (summary, budget bar, category breakdown, gear → settings, entry to compare, empty state), `AddExpenseScreen` (amount + currency chip, category grid, note, day-stepper date; on submit it resets and stays put — the RewardCheck overlay is the only confirmation), `ExpenseListScreen` (filter chips + day-grouped SectionList), `CompareScreen` and `SettingsScreen` (both Modals).
- `src/components/` — `TabBar` (exports `TAB_BAR_HEIGHT`; sits in-flow below the content, so screens only pad for the floating + button's overhang, not the bar height), `RewardCheck` (animated gradient checkmark; see driver rules above), `BudgetBar`, plus the presentational pieces (`SummaryHeader`, `CategoryBreakdown`, `ExpenseRow`). The old `AddExpenseSheet.js` was replaced by `AddExpenseScreen` and removed; it lives in the baseline commit if ever needed.
- `src/storage.js` — AsyncStorage load/save for expenses and settings; both swallow errors by design (persistence is best-effort, in-memory state is the source of truth). `loadExpenses` normalizes legacy entries (missing `currency` → USD) so the rest of the app can assume the field exists.
- `src/categories.js` — the fixed category list (id/label/emoji/color). `getCategory(id)` falls back to "Other" for unknown ids, so stored data with stale category ids still renders.
- `src/theme.js` — `colors` / `spacing` / `radius` tokens used by all StyleSheets; use these rather than hardcoding values.
- `src/format.js` — money and date formatting. `formatMoney`/`formatMoneyShort` take a currency code (symbol + decimals per currency; JPY/TWD render with 0 decimals). `dateKey()` (local-time `YYYY-MM-DD`) is the canonical day identity; `monthKey()`/`monthKeyLabel()` the month identity used by Compare.
- `src/demoData.js` — sample expenses for the empty-state "Load demo data" button; spans three calendar months and mixes currencies so Compare and conversion always have something to show.

## Screen budget

The product spec caps the app at 7 distinct views. Five are used (Dashboard, Add Expense, Expense List, Monthly Compare, Settings); two slots are reserved for future features. Settings lists "Export CSV" and "Theme" as disabled coming-soon rows.
