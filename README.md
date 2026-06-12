# Expense Tracker (Expo demo)

A small expense-tracker built with Expo / React Native. Dark iOS-style UI with a
bottom tab bar, multi-currency support, a monthly budget bar, month-over-month
comparison, and on-device persistence via AsyncStorage.

## Run it on your iPhone

1. Install **Expo Go**.
2. Start the dev server:

   ```
   npm start            # same Wi-Fi network (LAN)
   npx expo start --tunnel   # works through firewalls / cellular
   ```

3. Scan the QR code in the terminal with the iPhone **Camera** app and open the link —
   it launches in Expo Go.

Or run it in the browser with `npm run web`.

## Using the app

- **Dashboard** — monthly total, budget bar, category breakdown; the gear opens
  Settings, "Compare months" opens the month-over-month view.
- **+ (Add)** — amount with a per-entry currency selector, category grid, note,
  and date. Saving pops the gradient checkmark — that's the whole confirmation;
  you stay on the form, ready for the next entry.
- **Expenses** — day-grouped log, filterable by category. Rows whose entry
  currency differs from the display currency show the original amount in small
  text. Tap a row to delete it (confirmation).
- **Settings** — display currency (all totals, charts, and the budget convert to
  it; entries keep their original amount) and the monthly budget.
- On first launch, tap **Load demo data** to explore with three months of
  sample expenses in mixed currencies.

Exchange rates are a static snapshot in `src/currency.js`; `convert()` is the
single helper to swap for a live API later.

## Structure

- `App.js` — root component: all state, persistence wiring, currency conversion
  (one derive pass), hand-rolled tab/overlay navigation
- `src/screens/` — Dashboard, Add Expense, Expense List, Monthly Compare, Settings
- `src/components/` — tab bar, reward checkmark, budget bar, summary header,
  category breakdown, expense row
- `src/currency.js` — currency list, static rates, the `convert()` helper
- `src/storage.js` — AsyncStorage load/save (expenses + settings)
- `src/format.js` — currency-aware money formatting, date/month helpers
- `src/demoData.js` — multi-month, multi-currency sample data
