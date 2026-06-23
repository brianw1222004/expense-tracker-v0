# Code Review Report: Expense-Tracker (Expo / React Native)

> Generated 2026-06-23 by a 13-dimension reviewer + adversarial-verification workflow (36 agents).
> 22 findings raised → **17 confirmed, 5 refuted** as false positives (0 left uncertain).
> Baseline at review time: **242/242 Jest tests pass** and `npx expo export --platform web` exits 0 (clean build).

## 1. Executive Summary

The codebase is fundamentally healthy. The review surfaced exactly **one** functional bug a user can hit through a normal UI path — **F3**, deleting an expense from the edit popup leaves the popup open and lets *Save* resurrect the deleted entry. That single high-severity finding is the only thing that warrants an immediate fix.

The remaining risk is concentrated in the **sync engine**, where the offline-first design has a few sharp edges that are correctly understood and bounded: a concurrent-pull race that can briefly flicker an entry out and back (**F8**), and two failure modes — a settings-query error aborting the whole pull (**F1**) and a failed `replace` op wedging a lane (**F9**) — that violate the lane-isolation principle the architecture otherwise upholds. **None cause permanent data loss**: the server remains the source of truth and the next sync self-heals, which is why they are rated low/medium.

A second cluster is **presentation-only mismatches** in the Income/Balance and Dashboard screens (**F5, F6, F10, F11**) where a displayed number or label can mislead but no stored value is wrong. The largest cluster by count is pure **documentation drift** in `CLAUDE.md` (**F13–F15, F17**) plus a dead i18n key (**F12/F16**).

**The single most important thing to fix:** close the edit popup after a delete (mirror the income path's `setEditingIncome(null)`). It is a one-line change that eliminates the only user-reachable wrong-state bug.

---

## 2. Findings by Severity

### Critical
None confirmed.

### High

**H1 (F3). Deleting an expense from the edit popup leaves the popup open and re-creatable**
`App.js:320-324, 779-789` · `src/screens/AddEntryScreen.js:195-208`
- **Impact:** Open an expense in the edit popup, confirm **Delete** — the popup does **not** close; it stays open showing the now-deleted entry with **Save** still enabled. Pressing Save calls `updateExpense`, which enqueues an upsert with the old id and **resurrects the deleted row** on the server. The deletion itself is honored (state filtered + delete op enqueued), so this is broken-flow behavior, not silent loss — but the lingering popup over a gone entry plus a working Save is a real defect in a common path.
- **Root cause:** `AddEntryScreen.handleDelete` calls `onDelete(editEntry.id)` but never `onClose()`. `deleteExpense` (App.js:320-324) filters state + enqueues the delete but never `setEditingExpense(null)`, and the modal is `visible={editingExpense != null}` (App.js:779). The **income path does not have this bug** — `deleteIncome` (App.js:350-355) calls `setEditingIncome(null)`. The asymmetry is the tell.
- **Fix:** Mirror `deleteIncome`: `onDelete={(id) => { deleteExpense(id); setEditingExpense(null); }}`, or have `AddEntryScreen.handleDelete` call `onClose()` after `onDelete()` in edit mode.

### Medium

**M1 (F8). Concurrent pull can transiently drop a just-added/edited/deleted entry (no version guard)**
`App.js:211-225, 238-246`
- **Impact:** A mutation made during an in-flight `syncWithServer` SELECT can vanish from the UI and the AsyncStorage cache **until the next sync**, then reappear (a flicker, not permanent loss — the row is on the server). Trigger: add/edit/delete while a sync is already running (app launch always syncs at App.js:212; foreground-resume re-syncs at 239). If the background flush commits the new row **and** splices its op out of the in-memory queue before the SELECT response arrives, then `applyPendingOps` re-applies nothing and `setExpenses(result.expenses)` overwrites in-memory state with a server snapshot that predates the insert; the cache-save effect persists the truncated list.
- **Root cause:** Settings result-application is guarded by `settingsVersionRef` (App.js:216, 243); the adjacent **expense/income** `setExpenses`/`setIncome` from sync results have **no equivalent recency guard** — only the `active` account-switch gate.
- **Fix:** Gate expense/income result application the same way settings is gated — bump a `dataVersionRef` inside every expense/income mutation, capture `versionBefore` before `syncWithServer`, and skip `setExpenses(result.expenses)` / `setIncome(result.income)` when the ref advanced during the sync (local state + queued ops are already authoritative). Alternatively, snapshot the queue before the SELECT and merge rather than replace.
- *Confidence medium: the failing interleaving needs a specific HTTP-ordering inversion (upsert returns before the earlier SELECT while the SELECT's snapshot predates the upsert commit). The common ordering survives; the absence of any guard makes the window genuinely reachable.*

### Low

**L1 (F1). A settings-query error aborts the entire sync, discarding successfully-pulled expenses**
`src/sync.js:348-383`
- `syncWithServer` does `if (expensesRes.error || settingsRes.error) return null;` — a settings-specific failure (renamed/missing column, settings table absent on a partially-migrated backend) throws away already-fetched **expense** rows and applies no expense/income state. This couples the expense lane to the settings query, contradicting the lane-isolation the **income** pull deliberately follows (income errors are tolerated, leaving income null). Degraded-sync only; cached state stands and the next sync retries.
- **Fix:** Treat settings like income — `if (expensesRes.error) return null;`, and set `settings` to null when `settingsRes.error` is truthy (fall through to queued/cached settings).

**L2 (F9). A failing expense/income `replace` op permanently wedges its lane**
`src/sync.js:203-223, 264-284`
- A `replace` op (enqueued only by `loadDemo`) that errors server-side (bulk delete/upsert failure, transient RLS/constraint) makes `flushQueue` return `false` at `queue[0]` and never advance. `coalesce()` keeps a head `replace` against any later upsert/delete, so every subsequent mutation queues behind the stuck op and **that lane silently stops persisting to the server** — no retry escape, no surfaced error. Lanes stay isolated and local state stays correct; durability/observability gap only, on an uncommon trigger.
- **Fix:** Bound retries on the head op (drop/quarantine after N consecutive failures), or make `replace` reconstructible from current state rather than a frozen snapshot. At minimum, surface a sync-failure indicator.

**L3 (F2). `enqueueSettingsPush` runs as a side effect inside the `setSettings` updater**
`App.js:390-409`
- The enqueue is performed inside the functional `setSettings` updater, which must be pure (React may re-invoke updaters). Benign **today** — StrictMode is not enabled and `coalesce()` dedups settings ops so a double-invoke yields one op with the latest payload — but a fragile pattern that would leak duplicates if the dedup rule changes or another non-idempotent side effect is added here.
- **Fix:** Derive `next` from `settingsRef.current`, call `setSettings(next)`, then `enqueueSettingsPush` **after** the updater (or in an effect keyed on the relevant fields).

**L4 (F10). Income hero shows all-time balance but the delta beneath it is current-month-vs-last-month**
`src/screens/IncomeBalanceScreen.js:84-100`
- In the default (no-month-selected) view the hero is the all-time balance (`totalIncome − totalExpenses`), but the line directly below it is `netOf(currentMonth) − netOf(prevMonth)` labelled **"vs last month"**. A user reading "$12,340 ↑ $500 vs last month" reasonably reads the $500 as the change in the $12,340 balance, which it is not. Each number is individually correct — labeling ambiguity only.
- **Fix:** When no month is selected, hide or relabel the delta (e.g. "net this month"), or show the balance's actual month-over-month movement.

**L5 (F11). Budgeted-category spend on the dashboard is double-rounded (round-then-sum vs sum-then-round)**
`src/screens/DashboardScreen.js:60-70, 230, 254` · `src/components/BudgetGauge.js:49`
- The budget gauge rounds a single unrounded total once (sum-then-round); each `CategoryBar` receives a per-category pre-rounded value (round-then-sum). The two can differ by a displayed cent for 2-decimal currencies. User-visible as a headline-vs-sum-of-bars contradiction only in the narrow `monthlyBudget === 0` + at-least-one-category-budget configuration. Cosmetic; no stored value wrong.
- **Fix:** Round each category's spend once at the `deriveViewData` boundary and have both the gauge and bars consume those rounded values.

**L6 (F5). 3M income chart omits year disambiguation when the window straddles a year boundary**
`src/screens/IncomeBalanceScreen.js:74-82`
- `monthShort` only appends the year suffix when `monthsToShow === 6`. In 3M mode every January/February the window includes a prior-year month rendered as a bare "Dec"/"Nov", indistinguishable from a same-year month (and the same applies to the focused-month `deltaLabel`). 6M disambiguates the identical case, so the two ranges are inconsistent. Values/bars are correct — label only.
- **Fix:** Drop the `monthsToShow === 6` condition: `return year !== currentMonthKey.split('-')[0] ? \`${base} '${year.slice(2)}\` : base;`

**L7 (F6). Focused income month is not cleared when it scrolls out of range on a midnight month rollover**
`src/screens/IncomeBalanceScreen.js:92-116`
- `selectedMonth` is only re-validated against the visible window inside `selectRange` (the 3M/6M toggle). If a past month is focused and the app stays foregrounded across a month boundary, `currentMonthKey` (from `dayStamp`) advances, the chart window shifts, and the focused month falls outside it: the hero keeps showing the focused month and the "Back to current" link, but **no bar is highlighted** — hero and chart disagree until the next interaction. Cosmetic, self-healing.
- **Fix:** `useEffect(() => { setSelectedMonth(cur => cur && !monthKeysBack(currentMonthKey, monthsToShow).includes(cur) ? null : cur); }, [currentMonthKey, monthsToShow]);`

**L8 (F4). Editing a custom-hue category shows the custom swatch and slider thumb as red instead of the saved color**
`src/screens/CategoriesScreen.js:380, 383-406, 552-554, 590-616`
- Reopening a category whose color was created via the hue slider (non-preset) marks the custom-color cell active but resets `hue` to 0 without reconstructing it from the saved hex, so the custom swatch and thumb render `#e61919` (red). The real color still shows in the icon preview and persists on save — misleading swatch/thumb until the user touches the slider. Cosmetic, narrow path.
- **Fix:** Add a `hexToHue()` helper and seed `setHue(hexToHue(editingCategory.color))` (and `customHexColor = editingCategory.color`) in the `isEdit && !isPreset` branch instead of the unconditional `setHue(0)`.

**L9 (F7). CurrencyDropdown menu has no vertical clamp; can render off-screen below the fold**
`src/components/CurrencyDropdown.js:39-41`
- `menuLeft` is clamped horizontally, but `menuTop = anchor.y + anchor.height + spacing.xs` always opens downward with no vertical clamp or flip-above. Opening the dropdown when the Dashboard budget card is scrolled near the bottom edge can push the lower currency rows off-screen and unreachable (the modal backdrop fills the screen, so the menu can't be scrolled into view). Reachable but cosmetic — never a wrong value. *(Note: only 6 currencies exist, so the menu is ~240px tall, narrowing the overflow window.)*
- **Fix:** Capture window height via `useWindowDimensions()` and flip above when there isn't room below, or clamp: `menuTop = Math.min(below, windowHeight - MENU_MAX_HEIGHT - spacing.md)`.

**L10 (F12 / F16). Dead i18n key `add.title` — defined in all three languages, referenced nowhere**
`src/i18n.js:98, 266, 434`  *(raised independently by two reviewers)*
- `add.title` ("Add expense" / "新增支出" / "Añadir gasto") is the only non-dynamic key with zero references. The add popup renders the `EntryTypeToggle` pill (not a title) when adding; edit mode uses `edit.title`/`income.edit`. No `'add.' +` dynamic construction reaches it. Pure dead weight that drifts the three tables.
- **Fix:** Delete the three `add.title` lines, or wire it into the add branch of the `AddEntryScreen` header if a localized add-mode title is ever wanted.

**L11 (F13). `src/derive.js` is undocumented; CLAUDE.md presents `deriveViewData` as living in App.js**
`CLAUDE.md:46-59`
- `deriveViewData` was extracted to `src/derive.js` (imported at App.js:72, with its own `src/__tests__/derive.test.js`), but the `src/` file list has no `derive.js` bullet and the App.js bullet describes the function as App.js-internal — misleading a maintainer into editing the wrong file.
- **Fix:** Add a `src/derive.js` bullet and reword the App.js bullet to reference it.

**L12 (F14). Signature drift: `deriveViewData` documented with 3 args but takes 5**
`CLAUDE.md:46`
- Real signature is `deriveViewData(expenses, displayCurrency, language, customCategories = [], now = new Date())`. `customCategories` is load-bearing (normalizes stale custom-category ids; a memo dep at App.js:608); `now` is the test-injection point. Both are undocumented.
- **Fix:** Update the documented signature and note `now` is injectable for deterministic tests.

**L13 (F15). CLAUDE.md claims `format.js` exports `monthKey()` — no such function exists**
`CLAUDE.md:57`
- `format.js` exports `monthKeyLabel` but no `monthKey`; the only month-key derivation is inline (`dayStamp.slice(0, 7)` in App.js, `monthKeysBack` in IncomeBalanceScreen). A maintainer trusting the doc would import a non-existent symbol.
- **Fix:** Remove `monthKey()` from the sentence, or add a real `monthKey()` helper to `format.js` and use it at the inline sites.

**L14 (F17). Undocumented components: CurrencyDropdown, EmptyState, ErrorBoundary**
`CLAUDE.md:51`
- The `src/components/` bullet lists 7 of 10 files. Missing: `CurrencyDropdown` (Dashboard header), `EmptyState` (Dashboard/List/Categories), `ErrorBoundary` (wraps `content` in App.js:837). All real and actively used — documentation gap only.
- **Fix:** Add bullets for the three components.

---

## 3. Refuted Findings (false positives, excluded after adversarial verification)

Each was raised by a finder and then **refuted** by an independent skeptic reading the real code:

- **`src/sync.js:103-120`** — "Pending op pushed asynchronously, so a concurrent pull drops a local edit." Refuted: `enqueue` pushes to the in-memory queue **synchronously**; only the flush is async. (The real, narrower race is captured as F8.)
- **`src/screens/CategoriesScreen.js:226-240`** — "Account switch leaves previous user's category order applied." Refuted: order derives from props that re-flow on user change.
- **`src/screens/CategoriesScreen.js:383-406`** — "AddCategoryModal reset effect omits read values from its dep array." Refuted: the omitted values are intentionally read-at-open, not reactive deps.
- **`src/screens/DashboardScreen.js:275-300`** — "Category-budget progress bar divides by zero when a budget key holds 0." Refuted: the zero-budget case is guarded before the division.
- **`src/sync.js:213-218, 247-252`** — "Replace op interpolates raw ids into the PostgREST filter (injection)." Refuted: ids are app-generated, non-user-controlled, and the surface is non-exploitable as written.

---

## 4. Themes

1. **Edit-popup lifecycle (resurrects deleted data) — F3.** The only user-reachable functional defect; one-line fix.
2. **Sync engine robustness — F1, F8, F9, F2.** Sound offline-first design with bounded sharp edges (lane-isolation breaks, a concurrent-pull race, a latent purity violation). None lose data permanently; all weaken the resilience guarantees the architecture claims.
3. **Display/labeling mismatches — F10, F11, F5, F6.** Numbers shown vs. numbers meant; no stored value wrong.
4. **Component edge-case polish — F7, F4.** Off-screen dropdown placement; mis-painted custom-color swatch.
5. **Documentation drift in CLAUDE.md — F13, F14, F15, F17.** Stale signatures, a non-existent export, undocumented module/components.
6. **Dead i18n key — F12/F16.** `add.title`, defined ×3, used nowhere.

## 5. Recommended fix order

1. **F3** (high) — close the edit popup on delete. *One line; eliminates the only wrong-state bug.*
2. **F1, F9** (low, sync resilience) — restore lane isolation: gate the pull on `expensesRes.error` only; bound/quarantine a poison `replace` op.
3. **F8** (medium) — add the expense/income recency guard mirroring settings.
4. **F10, F11, F5, F6, F4, F7** — presentation/polish, batch as convenient.
5. **F12/F16, F13, F14, F15, F17** — delete the dead key and true up `CLAUDE.md` in one docs pass.

---

*Method: 13 independent reviewers (5 correctness file-clusters + 8 cross-cutting dimensions: hooks/rendering, web-native portability, sync integrity, money/date, i18n, theming, security, dead-code/doc-drift). Every raised finding was handed to a separate adversarial verifier that read the actual code and tried to refute it; only `confirmed`/`uncertain` survivors appear above. 36 agents, ~2.0M tokens, 496 tool calls.*
