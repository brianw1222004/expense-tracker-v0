# Expense Tracker (Expo demo)

A small expense-tracker demo built with Expo / React Native. Dark iOS-style UI with a
monthly summary, category breakdown, day-grouped expense list, add-expense sheet, and
on-device persistence via AsyncStorage.

## Run it on your iPhone

1. Install **Expo Go** from the App Store.
2. Start the dev server:

   ```
   npm start            # same Wi-Fi network (LAN)
   npx expo start --tunnel   # works through firewalls / cellular
   ```

3. Scan the QR code in the terminal with the iPhone **Camera** app and open the link —
   it launches in Expo Go.

## Using the app

- Tap **+** to add an expense (amount, note, category).
- **Tap** an expense row to delete it (confirmation alert).
- On first launch, tap **Load demo data** to fill the app with sample expenses.

## Structure

- `App.js` — root component, state, persistence wiring, expense list
- `src/components/` — summary header, category breakdown, expense row, add-expense sheet
- `src/storage.js` — AsyncStorage load/save
- `src/format.js` — money/date formatting helpers
- `src/demoData.js` — sample data seeding
