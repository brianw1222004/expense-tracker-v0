# CLAUDE.md

This file provides guidance to Claude Code (claude.ai/code) when working with code in this repository.

Visual spec — how screens look, tone, motion — lives in `docs/ui-conventions.md`. This file owns architecture and invariants.

## Project

Expense-tracker demo built with Expo SDK 56 / React Native 0.85 (React 19). Plain JavaScript, no TypeScript. No linter configured. `npx expo export --platform web` is the build check (catches syntax/import errors). `dist/` is the output of that export — generated, not source, and gitignored.

Backend is Supabase (auth + Postgres), configured via `EXPO_PUBLIC_SUPABASE_URL` / `EXPO_PUBLIC_SUPABASE_ANON_KEY` in `.env` (gitignored; template in `.env.example`, schema in `supabase/schema.sql`, one-time setup steps in `SUPABASE_SETUP.md`). **With no `.env` the app runs in local-only mode** — no sign-in screen, AsyncStorage only — so it always boots even without a backend; don't write code that assumes `supabase` is non-null (it's null when unconfigured).

`AGENTS.md` carries the "read the versioned Expo docs" rule for other agents. It is deliberately tiny; this file is the single source for everything else.

## Commands

```
npm start                  # Expo dev server (LAN — phone must be on same Wi-Fi)
npx expo start --tunnel    # dev server through ngrok tunnel (works across networks)
npm run web                # run in the browser via react-native-web
npm run ios                # build & run the native iOS dev client (expo run:ios; an ios/ prebuild exists)
npm run android            # build & run the native Android dev client (expo run:android; generates android/ on first run)
npm test                   # run Jest test suite (10 suites / 647 tests in src/__tests__/)
npm test -- --testPathPatterns=categories   # one test FILE (note: plural --testPathPatterns)
npm test -- -t "converts between currencies"  # one test CASE by name
npx expo export --platform web      # build check (catches syntax/import errors); regenerates dist/
node scripts/make-qr.js [exp-url]   # write a scannable QR PNG for a tunnel URL to ../expense-tracker-qr.png
```

Tests live in `src/__tests__/`, mocks in `__mocks__/`. `jest.config.js` runs them in a Node environment with a babel-jest transform, and its `moduleNameMapper` swaps `react`, `react-native`, `@react-native-async-storage/async-storage`, `@supabase/supabase-js` and any `*/i18n` import for the local mocks — which is why a test never imports a mock itself. When adding a test, follow the existing pattern: use Jest's auto-injected globals (`describe`, `test`, `expect`) without importing them, and require the module under test directly.

The app runs on a phone via Expo Go (scan the QR from the terminal) or in a browser with `npm run web`. Code must work on BOTH targets — e.g. `Alert.alert` with buttons is a no-op on web (use a custom Modal or the `window.confirm` fallback in `confirm.js`), and `onEndEditing` never fires on web (use `onBlur`).

## RN 0.85 gotchas (verified against the v56 docs)

- **Read the exact versioned docs at https://docs.expo.dev/versions/v56.0.0/ before writing any code.** Expo APIs change between SDK versions; don't rely on memory or unversioned examples.
- `StyleSheet.absoluteFillObject` was removed; use `StyleSheet.absoluteFill` as a style entry.
- Classic `Animated` is the supported animation API here (no reanimated). `useNativeDriver: true` only for `transform`/`opacity`; animating SVG props (`strokeDashoffset` on `Animated.createAnimatedComponent(Path)`) requires `useNativeDriver: false`. Never mix drivers on one `Animated.Value`.

## Theme, font, language — cross-cutting conventions

**Theme.** `src/theme.js` exports 3 palettes (`slate`, `sand`, `neutral`) plus `ThemeProvider`/`useTheme()`. `getTheme` falls back to `neutral` for unknown names; `neutral` (grayscale) is the default.

- Components get colors from `const { colors } = useTheme()` and build styles per theme: `const styles = useMemo(() => createStyles(colors), [colors])`, with `createStyles = (colors) => StyleSheet.create({...})` at the bottom of the file. There is no static `colors` export — never import a palette directly.
- `spacing`/`radius`/`fonts` are static imports, as are the `cardShadow`/`panelShadow`/`popupShadow` elevation tokens and `ACCOUNT_FAB_SIZE`.
- The palette also carries `statusBarStyle`, `keyboardAppearance` (use on every TextInput), `onAccent` (text on accent-filled surfaces), semantic `success`/`warning`/`danger`, `backdrop`, and `glowStart`/`glowEnd`/`glowWashTop` (the top-of-page wash — see `docs/ui-conventions.md`).
- Category emojis and colors are multi-colored (defined in `categories.js`); all other UI icons are monochrome, styled with `colors.icon`.

**Unified font system.** The Liberation Sans family, bundled as TTFs in `assets/fonts/` with their OFL licenses and loaded with `useFonts` from `expo-font` in `App.js` before first render. One design drives BOTH text and numbers, so word labels align with the money figures beside them.

- All non-bold text is slightly bolded by design: `fonts.regular`/`numRegular` resolve to `Arimo-Medium` (Arimo is the Google-Fonts continuation of Liberation Sans — metric-identical — supplying the 500 weight the Liberation family lacks), while `fonts.medium`/`bold`/`numMedium`/`numBold` all resolve to `LiberationSans-Bold`. The `num*` styles additionally set `fontVariant: ['tabular-nums']`.
- Styles must NOT set `fontWeight` alongside `fontFamily` — Android mis-resolves when both are present.
- All monetary amounts, stats, chart labels, budget inputs and percentages use the `num*` variants.

**All UI strings go through i18n** (`src/i18n.js`): language codes `en` / `zh` (Traditional Chinese, label 繁體中文) / `es` — the key is `zh`, not `zh-Hant`. Components use `const t = useT()`; non-component code uses `translate(language, key, vars)`. Missing keys fall back to English, then to the key itself. Category display names are `t('cat.' + id)` — `CATEGORIES[].label` is only the English fallback. Date labels in `src/format.js` take a `language` arg and read name tables from `i18n.js` (`getDateNames`); language-dependent derived data must re-compute when `settings.language` changes (it's a dep of the `deriveViewData` memo).

Keep the three language blocks in key parity — every key present in all three. Adding a key means adding it three times.

## Architecture

All state lives in `App.js`; everything under `src/` is presentational or a pure helper.

### Navigation

Hand-rolled, no react-navigation. A `tab` state (`dashboard | list | split | insight`) drives four kept-mounted tab screens, absolutely positioned and hidden via animated opacity.

- `src/useTabSlide.js` owns the whole transition (`tab`/`prevTab`/`slideAnim`/`slideDirRef` plus the swipe `PanResponder`) and returns `{ tab, changeTab, screenStyle, swipeHandlers }` to App.js. `changeTab` drives a tap switch; `swipeHandlers` (spread on the content View) drives swipe-to-switch. Dismiss the keyboard on tab change.
- Keep `TAB_INDEX`/`TAB_NAMES` (`src/useTabSlide.js`) and the `TABS` array (TabBar) **in the same order**.
- The add "+" is the tab bar's center button (`TabBar` takes an `onAdd` prop), not a tab — it stays out of `TAB_INDEX`/`TAB_NAMES`.
- Account is not a tab either: it opens from a floating account button (`accountFab` in App.js) pinned top-left, the only floating FAB.

### Overlays and popups

- `openAdd()` opens the add popup (`AddExpenseModal`), kept mounted via `display: 'none'` so a half-typed entry survives dismissal. Because it's a plain View and not an RN Modal, App.js installs an Android `BackHandler` to close the add/edit popups on hardware back; the Sheet-based overlays are real Modals and handle back themselves.
- The add popup has a **Personal/Shared** header toggle (`EntryModeToggle`, driven by `addEntryMode`): Personal renders `AddEntryScreen` (an expense), Shared renders `SharedSplitForm` (a split bill). An `addNonce` state keys the Shared form so it remounts fresh on each open.
- An `overlay` state (`budget | account | createGroup | null`) drives the budget-editor, account and create-group Modal sheets; `activeGroupId` drives the group-detail sheet.
- A group's "Add a bill" reuses the Shared add popup **locked** to that group (`sharedLockedGroupId`, set by `openSharedAddForGroup`; `closeAdd` reopens the group sheet afterward). A separate `sharedInitialGroupId` **seeds** the group without locking the picker, and the form's "create a group" CTA hands off to the create-group sheet with `returnToSharedAddAfterCreateGroup` set — so `createGroup` reopens the add popup on the new group instead of opening its detail sheet.
- A single `chromeVisible` flag hides the account FAB and the sync pill whenever any popup or sheet is open: `overlay`, `addOpen`, `editingExpense`, `editingSplit`, `activeGroupId`. **Extend it if you add another popup or sheet.**

### Month selection

Every tab shows a centered ‹ month › selector (`MonthSelector`) under its page title, and each tab's month is **independent** — changing the month on one page never affects another.

- Dashboard's lives in App.js (`dashMonthKey`/`shiftDashMonth`, because `heroView` derives there) and scopes the hero card plus the category summary card.
- Expenses, Insight and Split own theirs as local screen state (kept-mounted tabs preserve it).
- Split's is deliberately **display-only** — balances are outstanding debts and stay all-time. Product decision; don't wire it into balance math without asking.
- Forward navigation is capped at the current month.

### Render structure

There are **no early returns** inside the main component: every hook runs unconditionally, then a single `let content` is assigned by an if/else chain — `AuthScreen` when Supabase is configured and there's no session, `null` while data loads, `OnboardingScreen` until onboarding is done, else the main UI — and one `return` at the end wraps `content` in `ThemeProvider` + `I18nProvider` (fed from `settings.theme`/`settings.language`). Keep new conditional logic in the `content` assignment, and put new top-level chrome (FABs, sheets) inside the main-UI branch so it never renders over Auth/Onboarding. The only early `return` is the font-loading guard in the outer `App()` wrapper.

### State and data flow

- **`App.js`** owns `expenses` (`{id, amount, currency, note, category, createdAt}`, amount in the ENTRY currency), `settings` (`{displayCurrency, monthlyBudget, categoryBudgets, customCategories, theme, language, onboardingDone}`), `session` (Supabase auth), nav state, and `rewardNonce` (increments per added expense to trigger `RewardCheck`).
- **Cache-first.** On sign-in or launch the per-user AsyncStorage cache renders immediately, then `syncWithServer()` reconciles with Supabase in the background and on each return to foreground. A `dataUser` state records which user the in-memory data belongs to, and the save-to-cache effects are gated on `dataUser === userId` so an account switch can't write one user's data under another's cache key.
- **Every mutation updates state AND enqueues a sync op** (`enqueueExpenseUpsert`/`enqueueExpenseDelete`/`enqueueExpensesReplace`, `enqueueSettingsPush`). If you add a mutation, do both or devices drift.
- **`dayStamp`** (today's date key, refreshed every minute and on app-resume via AppState) is a dependency of the derive memo so stats roll over at midnight even though `expenses` hasn't changed. Date-sensitive derived data must depend on it (`currentMonthKey` derives from it).
- When the display currency changes, `updateSettings` re-denominates the stored overall budget AND every category budget via `convert()`.

### Settings sync

The Supabase `settings` row carries `displayCurrency`, `monthlyBudget`, `categoryBudgets`, `categoryOrder`, `customCategories`, `customPaymentMethods` (see `pickSyncedSettings`/`toSettingsRow`/`fromSettingsRow` in `sync.js`). Only per-device preferences (`theme`, `language`, `onboardingDone`) stay device-local.

- The extra columns are **nullable** — NULL means "no device pushed this yet" and `fromSettingsRow` omits it, so the merge over local (`setSettings(prev => ({...prev, ...result.settings}))` — never replaced) can't clobber a local value with an empty default.
- `updateSettings` only enqueues a push (of the whole synced subset) when a synced field actually changed; device-local-only patches must not bump `settingsVersionRef`.
- The push falls back to the legacy two-column payload on an unknown-column error, so an unmigrated database can never wedge the expense lane. App.js seeds the new columns from local values on the first pull that finds them unset.
- Because `categoryBudgets` sync with the currency, a currency change on another device arrives already re-denominated.
- `supabase/` holds the base `schema.sql` plus two migrations for databases created earlier: `migrate-settings-sync.sql` (adds the extra settings columns) and `migrate-drop-income-and-names.sql` (drops the retired income table and name columns).

### Sync-failure pill

Sync and storage errors are swallowed everywhere else by design (in-memory state is the source of truth), so the ONE visible failure signal is a `syncError` flag in App.js: a warning-toned pill above the tab bar — tap the body to `retrySync()`, the × to dismiss (`sync.failed`/`sync.retry`/`sync.dismiss`). It only ever sets when Supabase is configured and the user is not `LOCAL_USER`, and it's gated by `chromeVisible`. Any new sync path must set it on failure and clear it on success, or the pill goes stale.

### Module map

- **`src/currency.js`** — `CURRENCIES` (13 entries: code/symbol/name/decimals/`flag`), static `RATES_TO_USD` (KRW/AUD/CAD/CHF/HKD/SGD/INR included), and `convert(amount, from, to)`. **Conversion happens ONLY here** — a single helper by design, so swapping in a live-rate API is a one-function change. Amounts are stored in their entry currency forever; conversion is a display-time concern.
- **`src/derive.js`** — `deriveViewData(expenses, displayCurrency, language, customCategories, now, extraSpending)`, a single-pass derivation of everything the UI shows, all converted to the display currency: day-grouped `sections` (items gain `displayAmount`), month stats (`monthTotal`, `lastMonthTotal`), per-month aggregates (`months[].byCategory` and `months[].dailyTotals`), and `dailyTotals` for the current month. Category keys are normalized through `getCategory()` so stale ids group under "Other" everywhere. `extraSpending` (from `yourShareAsExpenses`) folds split shares into the aggregates without adding them to `sections`. `now` is injectable for deterministic tests. Called as a memo in App.js.
- **`src/storage.js`** — AsyncStorage load/save, the local cache layer; all swallow errors by design. Keys are scoped per user id; `LOCAL_USER` (`'local'`) is the unconfigured-mode sentinel and keeps the original un-suffixed keys so pre-auth installs retain their data. `loadExpenses` normalizes legacy entries (missing `currency` → USD); `loadSettings` merges `DEFAULT_SETTINGS` and guarantees a fresh `categoryBudgets` object so old caches upgrade in place. `clearUserStorage` also wipes legacy keys from retired features.
- **`src/supabase.js`** — the client (null when env vars are unset) plus `isSupabaseConfigured`. Auth sessions persist in AsyncStorage, NOT the expo-sqlite localStorage shim from the Expo guide, because AsyncStorage also works on react-native-web. Pauses token auto-refresh while backgrounded on native.
- **`src/sync.js`** — the offline-first sync engine. Mutations enqueue durable ops (a per-lane pending-ops queue in AsyncStorage, coalesced); `flush()`/`flushGroups()`/`flushSplits()` push them in order, stopping at the first failure. `syncWithServer()` flushes all lanes then pulls all rows, with `applyPendingOps()`/`applyPendingGroupOps()`/`applyPendingSplitOps()` re-applying anything still queued on top so offline edits survive a pull. **Expenses/settings, groups and splits use SEPARATE queues** (keys `userId`, `${userId}::groups`, `${userId}::splits`) sharing the same generic helpers (`flushQueue`), so one lane can't wedge the others; the groups/splits pulls are tolerant (a missing table or any error returns null for that field and the cache stands). Cross-device conflicts: last write to the server wins per row. The client never sends `user_id` — the column default (`auth.uid()`) and RLS policies scope every query to the signed-in user.
- **`src/categories.js`** — 8 built-in categories (`CATEGORIES`) plus user-created ones in `settings.customCategories`. An `external` flag separates bills-like categories from budget tracking. Every function takes `customCategories` as a parameter, not module state: `getAllCategories` / `getRegularAll` / `getExternalAll` return merged lists, `getCategory(id, customCategories)` searches both and falls back to "Other", `getCategoryLabel(category, t)` resolves display names (i18n for built-in, raw label for custom), `generateCategoryId()` mints ids. `EMOJI_OPTIONS` (24 icons, paginated 14 per page) and `COLOR_OPTIONS` (18 presets) are the add-category palettes. Screens receive merged lists as props from App.js; built-in categories cannot be deleted.
- **`src/format.js`** — money and date formatting. `formatMoney`/`formatMoneyShort` take a currency code (JPY/TWD render with 0 decimals). `dateKey()` (local-time `YYYY-MM-DD`) is the canonical day identity; `monthKeyLabel()` formats a `YYYY-MM` key. `buildCalendarWeeks(year, month)` returns 7-cell rows for calendar UIs (shared by `CalendarField` and `ExpenseListScreen`). `cleanAmountInput(text)` strips everything but digits and decimal separators. `dayLabel()` is the full form ("Wednesday, July 29") and `shortDayLabel()` the compact sibling ("Jul 29"); both prefer Today/Yesterday. Date-label functions take a `language` arg.
- **`src/budget.js`** — pure budget math. Allocation: `budgetAmountPercent`, `totalAllocatedBudget`/`remainingBudget` (the "Allocated / Remaining" readout), `hasUsableOverallBudget`, `clampBudgetRatio`, and clamping so category budgets never exceed the overall (`clampCategoryBudgetAmount`/`maxBudgetForCategory`, with `fitAllocatedBudgetsToOverall` proportionally shrinking allocations when the overall drops). Progress bars: `budgetZoneTone` (green / orange ≥85% / red over) and `categoryBarState({spent, budget, colors})` → `{basis: 'budget'|'none', ratio, fillPct, tone, over}` — always spent-of-budget, with `basis: 'none'` when no budget is set so callers label the slot "No budget". Both the Dashboard and Insight rows share this rule; don't re-derive it.
- **`src/confirm.js`** — `confirmDestructive({ title, body, confirmLabel, cancelLabel })`, the one web/native confirm helper (native `Alert.alert`, `window.confirm` on web), returning `Promise<boolean>`. Every destructive action uses it instead of re-implementing the fallback inline. `alertInfo` is its message-only sibling.
- **`src/icons.js`** — a registry wrapper around `@hugeicons/react-native` mapping string keys (e.g. `'hamburger-01'`) to imported components. `HIcon` is the single render entry point and forwards `style` straight through to `HugeiconsIcon` on both the matched and fallback branches. Never import icon components directly.
- **`src/demoData.js`** — `buildDemoExpenses` for the empty-state "Load demo data" button; spans three calendar months and mixes currencies so trends and conversion always have something to show.

### Screens (`src/screens/`)

One file per screen. Visual detail for each is in `docs/ui-conventions.md`.

- **`DashboardScreen`** — page title, this tab's `MonthSelector` (drives `dashMonthKey`/`shiftDashMonth`; past months plot in full via `SpendingChart`'s `endDay` prop), `HeaderGlow`, a Monthly Spending Summary hero card with the embedded chart, a `CategorySummaryCard` whose "›" chevron jumps to the Insight tab, a split-balances widget, and the empty state.
- **`AddEntryScreen`** — the Personal side of the add popup: add/edit an EXPENSE only. Category grid, `CalendarField` date picker, numeric amount (sanitized via `cleanAmountInput`) with a `CurrencyPill` on its left, and a note with counter. On add it resets and the popup closes — the `RewardCheck` overlay is the only confirmation. Edit mode wires Delete to `deleteExpense` through `confirmDestructive`.
- **`SharedSplitForm`** — the Shared side: create or edit a split bill. Split methods are equal / custom amounts / percentage / **tax** (itemized: per-person subtotals plus a tax% and optional tip% distributed proportionally to subtotals). The Members chip is the ONLY inclusion control — a stay-open multi-select checklist summarizing as "All" or "n/m". On save it computes shares via `splits.js` and calls `addSplitExpense`. Reused from the "+" popup (group picker shown), from a group's "Add a bill" (locked, picker hidden), and in `editBill` mode from a bill row.
- **`ExpenseListScreen`** — its `MonthSelector` is the SOLE month control; stepping it moves the calendar month and selects today in the current month or the 1st otherwise. Inline calendar for day selection, category filter chips, expense rows for the selected day, and a custom delete-confirmation Modal.
- **`InsightScreen`** — the budget view in two cards: a Budget card (the local `BudgetBar` gauge, display-currency `CurrencyPill`, "Edit budgets" (`onEditBudgets`) → the Budget sheet) and a merged Categories card listing every category with spending this month, a budget, or `custom: true`, plus an External subsection. Rows order by `settings.categoryOrder` via `DraggableTileGrid` (long-press drag-to-reorder; one order array spans both sections, unordered ids append spend-sorted, and it denies pan termination so the tab-swipe responder can't steal a drag). The header's "+ Add Category" pill and tapping a custom row open `AddCategoryModal`, so custom-category management lives here. Receives `monthlyBudget`/`categoryBudgets`/`regularCategories`/`externalCategories`/`months`/`currentMonthKey`/`categoryOrder` from App.js and owns its month selection locally, deriving that month's `totalsByCategory` from `months[].byCategory`.
- **`AccountScreen`** — the bottom Modal sheet behind the floating account button: account info and sign-out, a "Delete all data" danger action, and the language + theme switchers. The danger action runs `deleteAllData` (`src/deleteAllData.js`, wired as `handleDeleteAllData` in App.js) and is **local-only by design**: in configured/cloud mode it does nothing destructive at all — no queue ops, no flushes, no Supabase deletes, no sign-out — and only explains that deleting synced data is temporarily unavailable (`acct.deleteUnavailable`, shown both as a standing note under the button and in the alert). In local-only mode it drains pending cache writes, then removes AND verifies the tracker keys (`clearUserStorage(userId, { strict: true })`) and the pending-op lanes (`clearQueues(userId, { strict: true })`) before resetting in-memory state; on failure nothing is reset and `acct.deleteFailedBody` invites a retry. `deleteDataGuard` (a ref) blocks re-entry; `accountLocked` (state) is that same window made visible and is what disables the ×, the settings rows and the delete row. Removing the Supabase auth record — and any server-side reset for cloud users — is still unimplemented.
- **`BudgetScreen`** — the budget editor sheet: overall monthly budget, then regular and external category budgets in two sections of shared `CategoryBudgetRow`s, each clamped by `clampCategoryBudgetAmount`. The display currency is chosen on the Insight Budget card header, not here.
- **`AuthScreen`** — email/password sign-in/sign-up, full-screen when signed out. Errors render inline because `Alert` is a no-op on web.
- **`OnboardingScreen`** — first-run setup (monthly budget + language), shown only when Supabase is configured and `onboardingDone` is false.
- `SplitBillsScreen`, `GroupDetailScreen` and `CreateGroupScreen` also live here — see **Split Bills** below.

### Components (`src/components/`)

- **`TabBar`** — exports `TAB_BAR_HEIGHT`; absolutely positioned at the bottom with frosted-glass blur via `expo-blur`. Four tab icons plus the center add "+". Screens must add `paddingBottom: TAB_BAR_HEIGHT` to their ScrollView `contentContainerStyle` so content isn't hidden behind it.
- **`AddExpenseModal`** — the popup presenter (backdrop fade, card scale/fade), keeps children mounted while closed.
- **`Sheet`** — the shared bottom-sheet Modal presenter used by `AccountScreen`, `BudgetScreen` and `GroupDetailScreen`; `showHandle`/`avoidKeyboard`/`sheetStyle` props.
- **`HeaderGlow`** — the top-of-page wash all four tab screens render. Takes a per-screen-unique gradient `id` prop, because the kept-mounted tabs coexist and SVG ids are document-global on web. App.js paints the status-bar strip in `glowWashTop` while the tabbed UI is visible, so **every tab screen must paint its own background.**
- **`SpendingChart`** — the SVG line chart. A `mode` prop (`'daily' | 'monthly'`) switches between the selected month's per-day values and the `monthlyTotals` prop's cross-month totals; the Dashboard hero header's Daily/Monthly `EntryModeToggle` drives it. In daily mode a `compareTotals` series plots the previous month behind the selected one (`heroView.prevDailyTotals` in App.js, undefined when that month has no data so no flat baseline is drawn).
- **`CategorySummaryCard`** — the Dashboard donut card; `CategoryDonut`/`TopCategoryRow`/`buildArcs`/`formatPct` live here, plus the "›" chevron that jumps to Insight via `onMoreDetail`.
- **`AddCategoryModal`** — add/edit a custom category: name, **required** monthly budget (min 5% of the overall budget, any positive amount when none is set), paginated icon grid, preset colors plus a hue slider, and an external switch. App.js's `addCustomCategory`/`updateCustomCategory` save the budget into `settings.categoryBudgets` and strip the `budget` field off the returned object.
- **`MonthSelector`** — the centered ‹ month › selector under every tab title; `monthKey`/`currentMonthKey`/`onShift`, forward nav capped at the current month. Each tab feeds it its OWN month state.
- **`AnchorMenu`** — the iOS-style menu anchored to the control that opened it, measured via `measureInWindow`, opening below or above with screen-edge clamping, no title or backdrop dim. Single-select marks the value with a tick; `multi`/`values` mode backs the Members checklist. Small option sets only — richer lists use `OptionPicker`.
- **`OptionPicker`** — the shared compact centered picker popup, mirroring `CurrencyPicker`; options take optional `icon`+`color` for tinted badges and an optional `subtitle`.
- **`CurrencyPicker` / `CurrencyPill`** — currency picking is unified: anywhere a currency is decided (the Insight Budget card header for the display currency, Create/Edit group, and both add forms on the left of the amount) renders a `CurrencyPill` that opens `CurrencyPicker` — a small centered "Choose currency" popup, NOT a full-height sheet: a compact fade `Modal` over a centered card with a short scrollable list of `CURRENCIES` and no search field, each row badging the country's `flag` emoji in a circle (flags render natively on iOS/Android/macOS; Windows browsers fall back to the 2-letter region code). Tapping a row selects and closes. The legacy `CurrencyDropdown` is retired.
- **`CalendarField`** — the shared expanding date picker used by both add forms; exports `dateForOffset`/`offsetForDay`.
- **`EntryModeToggle`** — the shared segmented toggle, defaulting to the Personal/Shared pair; `options` (`[{id, labelKey}]`) and `compact` props back other uses like the chart's Daily/Monthly toggle.
- **`ToggleSwitch`** — the shared pill switch (accent track, sliding white thumb), used instead of the platform `Switch`.
- **`EmptyState`** — the shared no-data view (icon, hint, "add first" button, "load demo" link) used by Dashboard, Expense List and Insight.
- **`ErrorBoundary`** — the class-component crash fallback wrapping the whole app in App.js with `resetKeys={[userId]}`, so a sign-out or account switch clears it.
- **`RewardCheck`**, **`popupFormChrome`** (`popupChromeStyles`), **`PaymentMethodModal`**, **`IconPickerSheet`**, **`ExpenseRow`** — see `docs/ui-conventions.md` and **Split Bills**.

## Split Bills

A Splitwise-style ledger synced to Supabase via two lanes (`groups` and `split_expenses` tables, queue keys `${userId}::groups` and `${userId}::splits`). Pulls are tolerant — if the tables don't exist yet, the local cache stands.

### Domain layer (`src/splits.js`, pure)

- The `YOU` owner sentinel; `nameFor`, `billsForGroup`.
- **Shares:** `computeShares` (equal/custom/percentage, currency-decimal aware, always reconciled to sum to the bill), `customSharesValid`/`percentageSharesValid`, and `computeTaxShares` + `taxInputValid` for the itemized tax split.
- **Balances:** `groupBalances`/`groupNet`/`overallBalance` — a personal ledger holding only debts involving YOU, positive meaning a member owes you. `yourBillPosition`/`billPositionCaption` produce the you-lent/you-borrowed captions shared by the tab and the sheet.
- **Member removal:** `removeMemberFromBill` + `billUndistributed`.
- **Payment methods** (`PAYMENT_METHODS`, `getAllPaymentMethods`) **are category-like:** each built-in AND custom method carries a `color` plus a hugeicon `icon`, rendered as an icon+color chip and used to theme a group's surface. Built-ins are fixed (cash/card/bank/mobile/other); users add custom ones via `PaymentMethodModal` (name + icon + color/hue picker, mirroring the custom-category editor), stored in `settings.customPaymentMethods`. `getPaymentMethod`/`getPaymentMethodColor` fall back to "cash" for unknown ids, and `getPaymentMethodLabel` falls back to the cash label — never echo a raw id.
- `GROUP_ICONS`/`DEFAULT_GROUP_ICON`/`getGroupIcon` (emoji avatars), `PAYMENT_ICON_OPTIONS`, and `MEMBER_COLORS`/`memberColor(id)` for stable per-member avatar colors.

### Data shape

Groups hold members (typed names, no accounts), a `currency`, a `paymentMethod` and an `icon` (emoji avatar, picked via `IconPickerSheet`). There is NO group "type/category". `splitExpenses` hold shared bills (`{id, groupId, description, amount, currency, category, paidBy, mode, shares, createdAt}`, plus an optional `meta` holding the raw percentage/tax inputs so an edit reconstructs them losslessly) and settlement records (`{settlement: true, from, to, ...}`).

**`group.icon` and bill `meta` are device-local** — not in the Supabase column mappings. App.js's sync pull-merge preserves them by id across reconciles, the same posture as theme/language.

Local cache is `loadGroups`/`saveGroups`/`loadSplitExpenses`/`saveSplitExpenses` in `storage.js`; sync is `enqueueGroupUpsert`/`enqueueGroupDelete`/`enqueueSplitUpsert`/`enqueueSplitDelete` in `sync.js`. App.js owns `createGroup`, `updateGroup` (currency/payment method/icon/members in place), `removeGroupMember`, `deleteGroup`, `addSplitExpense`, `updateSplitExpense`, `deleteSplitExpense`, `settleUp`, `addCustomPaymentMethod`, and `removeCustomPaymentMethod` (which reassigns affected groups to cash).

### Member removal is bill-aware

The × in `GroupDetailScreen`:

- An unreferenced member is removed outright.
- A member who **paid** a bill can't be removed — edit or delete those bills first (`alertInfo` explains).
- A share-holder gets a choice popup (`OptionPicker` with a `subtitle`): **redistribute** (their share is re-split among the remaining participants via `removeMemberFromBill` — equal bills stay equal, weighted bills scale proportionally) or **reassign manually** (`'unassign'`: the share key is dropped, the bill becomes a `'custom'` split with an undistributed residual shown on the row via `billUndistributed`; with exactly one affected bill the editor opens on it immediately).
- Their settlements are deleted with them. Committing a member-name blur never removes anyone — an emptied name reverts.

### Your share counts as spending

`yourShareAsExpenses(splitExpenses)` synthesizes expense-like items for your share of each bill and is passed to `deriveViewData` as its 6th `extraSpending` arg. These fold into every spending aggregate (month total, category totals, daily chart, per-month breakdown, budgets) but are deliberately kept OUT of the Expenses list `sections`, so that list stays direct-expenses-only. Balances display in each group's own currency; the overall summary converts to the display currency.

## Screen budget

The original product spec capped the app at 10 distinct views; Split Bills deliberately expanded that. Current views: Dashboard (also hosting the category summary card), Add (popup — Personal expense or Shared bill), Expense List, Split Bills (tab), Insight (tab — budget overview, category rows, custom-category management), Group detail (sheet), Create group (sheet), Account (sheet), Budget editor (sheet), Auth, and Onboarding (first-run only).

## Removed — don't re-add

These were deliberately deleted. Re-introducing them is a product decision, not a cleanup:

- **Income** — deleted end-to-end (UI first, then the data/sync layer in 2026-07). Only legacy wipes remain in `clearQueues`/`clearUserStorage`, for old installs. No `income.*` i18n keys.
- **The Categories tab and the Category-breakdown page** — the summary card moved to the Dashboard, the row list into the Insight Categories card.
- **`AddSplitScreen`** — bills are added through the Shared add popup.
- **`BudgetGauge`** (the donut) — replaced by `BudgetBar` on the Insight card.
- **Budget proportion sliders** — budgets are typed as numbers; the "Allocated / Remaining" line is the only allocation readout.
- **The no-budget "vs last month" fallback bar** — both cards measure against the budget only (`categoryBarState` returns `basis: 'none'`). `trendZoneTone` went with it.
- **The full-page horizontal-slide tab transition** — replaced by the widgets-swap crossfade.
- **`CurrencyDropdown`** — replaced by `CurrencyPill` + `CurrencyPicker`.
- **Inter and Lora fonts** — nothing imports `@expo-google-fonts/*` any more.
- **`.design-sync/`** — the Claude Design sync scaffolding, removed in 2026-09 after it drifted (it still mapped the deleted `BudgetGauge`, the old tab names, and the retired fonts) and its `.ds-sync/prebuild.mjs` build step no longer existed.

## Claude Code setup

The Expo Claude Code plugin is enabled (`.claude/settings.json`). `.claude/agents/` defines a team of persona agents (angelina, friday, monday, tuesday, saturday, sunday) for structured task delegation — see `.claude/agents/_team.md` for roles. `.claude/workflows/` holds multi-agent Workflow scripts (e.g. `expense-tracker-full-review.js`); agents keep per-persona notes in `.claude/agent-memory/`.
