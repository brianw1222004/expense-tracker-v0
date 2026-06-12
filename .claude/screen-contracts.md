# Screen contracts — multi-screen restructure (June 2026)

Shared contract for the screens/components being added. `App.js` (already written) owns all
state and passes exactly these props. Do not change `App.js` or any file you don't own.

## Project conventions (follow these exactly)

- Expo SDK 56 / React Native 0.85 / React 19, **plain JavaScript**, function components only.
- Dark iOS-style UI. Import design tokens from `src/theme.js` (`colors`, `spacing`, `radius`)
  — never hardcode colors/sizes that have a token. New token available: `colors.accentTeal` (#2DD4BF).
- `StyleSheet.create` at the bottom of each file; `Pressable` with `({ pressed }) => [...]` pressed styles;
  emoji used as icons; `fontVariant: ['tabular-nums']` on money text.
- Read 2–3 existing files first (e.g. `src/components/AddExpenseSheet.js`, `src/components/SummaryHeader.js`,
  `App.js`) and match their voice: sparse comments only for non-obvious constraints.
- Must also run on react-native-web (`npm run web`): guard anything web-hostile
  (`Alert.alert` with buttons is a no-op on web — use `Platform.OS === 'web' ? window.confirm(...) : Alert.alert(...)`
  where a confirm matters).

## Verified RN 0.85 / SDK 56 gotchas (from the versioned docs — do not ignore)

- `StyleSheet.absoluteFillObject` was **removed** in RN 0.85. Use `StyleSheet.absoluteFill` as a style entry
  (e.g. `style={[StyleSheet.absoluteFill, styles.backdrop]}`). Do NOT copy the `...StyleSheet.absoluteFillObject`
  spread from the old `AddExpenseSheet.js`.
- Classic `Animated` API is the supported way to animate (no reanimated in this project).
  `useNativeDriver: true` is fine ONLY for `transform`/`opacity` on regular RN components.
  Animating SVG props (`strokeDashoffset` etc. via `Animated.createAnimatedComponent(Circle/Path)`)
  requires `useNativeDriver: false`. Never mix both drivers on the same `Animated.Value`.
- `react-native-svg@15.15.4` is installed (`Svg, Circle, Path, Defs, LinearGradient, Stop` etc.).
  Gradient stroke = `<Defs><LinearGradient id="g">…</LinearGradient></Defs>` + `stroke="url(#g)"`.

## Data shapes

```js
expense = { id, amount, currency, note, category, createdAt }
// amount is in `currency` units (entry currency); createdAt is a ms timestamp.

// List section item = expense PLUS displayAmount (already converted to display currency):
sectionItem = { ...expense, displayAmount }
sections = [{ title: 'Today', total: 123.4, data: [sectionItem, …] }, …]  // totals in display currency

// Months for Compare (sorted newest first, totals in display currency):
month = { key: 'YYYY-MM', label: 'June 2026', total, count, byCategory: { [categoryId]: amount } }
```

Helpers already available:
- `src/currency.js`: `CURRENCIES` (code/symbol/name/decimals for USD EUR GBP JPY TWD CNY),
  `convert(amount, from, to)`, `getCurrency(code)`, `DEFAULT_CURRENCY`
- `src/format.js`: `formatMoney(amount, currencyCode)`, `formatMoneyShort(amount, currencyCode)`,
  `dateKey(ts)`, `dayLabel(ts)`, `monthLabel(date)`, `monthKey(ts)`, `monthKeyLabel('YYYY-MM')`, `monthKeyLabelShort('YYYY-MM')`
- `src/categories.js`: `CATEGORIES` (id/label/emoji/color), `getCategory(id)`

## File ownership and props

### 1. `src/components/TabBar.js`
- `export const TAB_BAR_HEIGHT = 64;` (content height; component additionally pads `useSafeAreaInsets().bottom`).
- Default export `TabBar({ tab, onChange })`; `tab` ∈ `'dashboard' | 'add' | 'list'`.
- Opaque bar, top hairline border (`colors.border`), three targets: Dashboard, a raised round accent
  Add button (like the old FAB: + glyph on `colors.accent`, dark `#06281C` icon), Expenses.
  Active item tinted `colors.accent`, inactive `colors.textMuted`. `accessibilityState={{ selected }}`.

### 2. `src/components/RewardCheck.js`
The ONLY confirmation UI for adding an expense (spec: no toast, no modal, no redirect).
- Default export `RewardCheck({ trigger, bottomOffset })`. `trigger` is a counter; animate every time it
  changes to a value > 0 (ignore mount with 0). `bottomOffset` = px from screen bottom for the badge center area.
- Absolutely positioned, horizontally centered, `pointerEvents="none"` so it never blocks touches; render
  nothing when idle.
- Badge ≈ 88px: SVG circle + checkmark path, both stroked with a green→teal `LinearGradient`
  (`colors.accent` → `colors.accentTeal`), round line caps, subtle dark fill (e.g. `colors.card` at ~90%)
  so it reads over any screen.
- Timeline: spring scale 0→1 with slight overshoot, ~400ms feel (`Animated.spring`, native driver, on the
  wrapper `Animated.View`) + quick opacity-in; optional but encouraged: draw the check with a
  `strokeDashoffset` animation (separate `Animated.Value`, `useNativeDriver: false`, on
  `Animated.createAnimatedComponent(Path)`). At ~1.2s start a ~250ms opacity fade-out, then unmount/reset.
- Re-trigger mid-animation must restart cleanly (stop animations, clear timeouts — also on unmount).

### 3. `src/screens/DashboardScreen.js` (+ owns edits to `src/components/SummaryHeader.js`,
`src/components/CategoryBreakdown.js`, and new `src/components/BudgetBar.js`)
- Props: `{ loaded, hasExpenses, monthTotal, todayTotal, monthCount, avgPerDay, totalsByCategory,
  displayCurrency, monthlyBudget, onOpenSettings, onOpenCompare, onLoadDemo }`. All amounts already display-currency.
- ScrollView: top row (gear `Pressable` ⚙️ right-aligned, `accessibilityLabel="Settings"` → `onOpenSettings`),
  `SummaryHeader`, `BudgetBar`, `CategoryBreakdown`, then a card-style button "Compare months" → `onOpenCompare`.
- Empty state (when `loaded && !hasExpenses`): move the old App.js empty state here (emoji, hint,
  "Load demo data" button → `onLoadDemo`). Hide BudgetBar/CategoryBreakdown/Compare in that case.
- `SummaryHeader` / `CategoryBreakdown`: add a `displayCurrency` prop, pass through to
  `formatMoney`/`formatMoneyShort`. No other behavior changes.
- `BudgetBar` props `{ monthTotal, monthlyBudget, displayCurrency, onPressSetBudget }`:
  budget ≤ 0 → subtle card "Set a monthly budget" (tappable → `onPressSetBudget`, wire to `onOpenSettings`);
  else progress track (fill = min(100%, monthTotal/budget), `colors.accent`, switch to `colors.danger` when over)
  with "spent of budget" + remaining/over labels.

### 4. `src/screens/AddExpenseScreen.js`
A full tab screen (NOT a Modal) — adapt the form from `src/components/AddExpenseSheet.js` (leave that file
untouched; it is now legacy). Props: `{ displayCurrency, onSubmit }`.
- Fields: amount (same validation regex/normalization as the sheet, but allow decimals per selected
  currency — JPY/TWD have 0 decimals: validate `^\d+$` for those, round accordingly), **currency selector
  next to the amount input** (small chip showing the code, e.g. "EUR ▾" — tap expands a row of all
  `CURRENCIES` chips; defaults to `displayCurrency` and follows it until the user manually picks one),
  note, category grid, **date selector**, save button.
- Date selector: defaults to Today; `◀ Today ▶` day-stepper (label via `dayLabel`), right arrow disabled at
  today; no future dates. `createdAt` = `Date.now()` when today, else the chosen day at 12:00 local.
- Submit: `onSubmit({ amount, currency, note, category, createdAt })`, then reset the form (amount/note
  cleared, category back to first, date back to today, currency back to `displayCurrency`). **Stay on the
  screen, render no confirmation** — App.js triggers the RewardCheck animation. Keyboard: wrap in
  `KeyboardAvoidingView` (iOS padding) inside a ScrollView so the grid is reachable on small screens.

### 5. `src/screens/ExpenseListScreen.js` (+ owns edit to `src/components/ExpenseRow.js`)
- Props: `{ sections, loaded, hasExpenses, displayCurrency, onDelete, onLoadDemo }`.
- Horizontal filter chips above the list: "All" + every category that appears in `sections`
  (emoji + label, selected style like the sheet's category chips). Filtering recomputes section `data`,
  drops empty sections, and recomputes each section total as the sum of `displayAmount`.
- SectionList rendering moves over from old App.js (day header: title + `formatMoney(total, displayCurrency)`),
  bottom content padding so the last row clears the tab bar. Empty state for no expenses (hint + demo
  button) and a lighter "no matches" state when a filter empties the list.
- `ExpenseRow`: new props `{ expense, displayCurrency, onDelete }` where `expense.displayAmount` exists.
  Main amount = `-formatMoney(displayAmount, displayCurrency)`. When `expense.currency !== displayCurrency`,
  show the original below it in small muted text: `formatMoney(amount, currency)` + the code (e.g. "¥1,800 JPY").
  Keep tap/long-press delete confirm (use the display amount in the message; add the web confirm fallback).

### 6. `src/screens/CompareScreen.js`
- Props: `{ visible, months, displayCurrency, onClose }`. RN `Modal` (slide, transparent backdrop like the
  old sheet — remember `StyleSheet.absoluteFill`), header "Compare months" + ✕ close.
- Two pickers (rows of month chips, horizontal ScrollView, labeled A and B): A defaults to `months[0]`,
  B to `months[1]`. Selecting same month for both is allowed but pointless — fine.
- Body: the two months side by side — total (`formatMoney(…, displayCurrency)`), count, a delta line
  ("+12% vs Month B" style, `colors.danger` when A spent more… actually tint increase red / decrease accent);
  then per-category comparison: union of both months' `byCategory`, sorted by combined size, each row =
  category emoji/label + two horizontal bars (A over B, B slightly muted or distinct hue) scaled to the
  max single value across both months, with amounts.
- Edge cases: `months.length === 0` → friendly empty state; `=== 1` → show single month + hint that another
  month of data is needed to compare.

### 7. `src/screens/SettingsScreen.js`
- Props: `{ visible, settings, onUpdateSettings, onClose }`; `settings = { displayCurrency, monthlyBudget }`.
- RN `Modal` (slide), header "Settings" + ✕.
- "Display currency" section: one row per `CURRENCIES` entry (symbol, name, code, ✓ on the selected one) →
  `onUpdateSettings({ displayCurrency: code })`. Note under the section: all totals, charts and budget use
  this currency; entries keep their original amount.
- "Monthly budget" section: decimal `TextInput` prefixed with the display currency symbol, committed on
  end-editing/submit via `onUpdateSettings({ monthlyBudget: number })` (invalid/empty → 0 = no budget;
  same numeric validation approach as the amount field). The input must re-sync from
  `settings.monthlyBudget` when it changes from outside (currency switch re-denominates the stored budget).
- "Coming soon" section: disabled rows "Export CSV" and "Theme" (muted, non-interactive) — reserved slots.

## Hard rules

- Touch ONLY the files listed for your task. Do not run npm/expo/git commands.
- No new dependencies. No TypeScript. No react-navigation.
- Every money value rendered goes through `formatMoney`/`formatMoneyShort` with an explicit currency code.
- Currency conversion happens ONLY in App.js / `convert()` — screens never re-convert except where the
  contract says (ExpenseRow shows the stored original, no conversion needed).
