---
name: audit-restructure-2026-06-26
description: Audit of the Personal/Shared add-popup feature + account deletion (2026-06-26) — prior blockers now FIXED; new findings are efficiency/restructure, not correctness
metadata:
  type: project
---

Read-only audit 2026-06-26 of the new add-popup (Personal/Shared toggle), SharedSplitForm, CalendarField, EntryModeToggle, percentage+tax splits, account deletion. Baseline: 612/612 jest green, i18n parity exact (223 keys x3).

**Prior blockers from [[audit-final-verdict-2026-06-25]] are now RESOLVED — do not re-flag:**
- signOut now awaits all four flushes (App.js:707-712 flush/flushIncome/flushGroups/flushSplits). Sign-out data-loss FIXED.
- Foreground re-sync now gated by syncSeqRef across ALL lanes (App.js:287-298). Resync race FIXED. deleteAccount also uses the seq pattern implicitly via the load effect.
- Custom-split rounding now reconciles to rounded bill inside computeShares (splits.js:98-115) and customSharesValid validates ROUNDED vs ROUNDED (splits.js:133-140). Ledger-consistency FIXED. Percentage/tax use distributeUnits round-robin reconcile (splits.js:40-65) — well done.

**Top restructure-for-efficiency findings (the user's explicit priority):**
- App.js is a 1122-line god component (was ~730). 22 useState/ref + ~11 effects + all mutations. Highest-value extraction: a `useSyncedCollection` custom hook factory — the 4 cache-load-save-enqueue lanes (expenses/income/groups/splits) are near-identical (App.js:240-263, 306-320, mutation pairs). Could collapse ~250 lines. Next: extract `useAddPopup` (addOpen/addEntryMode/sharedLockedGroupId/addNonce + openAdd/closeAdd/openSharedAddForGroup, App.js:170-176,327-352) and `useAuthSession` (App.js:148-149,196-207).
- 23 StyleSheet keys duplicated near-verbatim between AddEntryScreen and SharedSplitForm (card/scroll/header/headerSide/headerCenter/title/closeButton/amountRow/amountInput/currencySymbol/currency*/noteRow/noteInput/saveButton*). Extract a shared `createPopupFormStyles(colors)` or an `<AddPopupCard>` wrapper. ~120 lines.
- numericText sanitize `text.replace(/[^0-9.,]/g,'')` duplicated (AddEntryScreen.js:227 inline, SharedSplitForm.js:187). Move to format.js next to isValidAmountText.

**New correctness/consistency notes (LOW-MEDIUM, none blocking):**
- App.js mutation handlers (addExpense/updateExpense/deleteExpense/updateIncome/deleteIncome/createGroup/etc., ~App.js:354-481) are plain functions re-created every render and passed to kept-mounted screens — defeats memo on those screens. openAdd/closeAdd/changeTab/updateSettings ARE useCallback'd. Inconsistent; wrap the rest or accept (screens aren't memoized anyway).
- CLAUDE.md is STALE re: the "+" button. It says "+ is a floating button (addFab) NOT in the tab bar"; reality: TabBar.js:53-62 renders the "+" in the center, App.js has no addFab (only accountFab). The Architecture + Screen-budget sections both contradict the code. Doc drift, same family as the comment-drift that hid last round's bug.
- SharedSplitForm: from a group's "Add a bill", lockedGroupId hides the toggle (showToggle=!lockedGroupId, line 69) so you cannot switch to Personal — intended, but the only exit is close. Fine.
- AddExpenseModal.js:74 KeyboardAvoidingView behavior 'height' on Android (iOS 'padding') — pre-existing, still acceptable.

**Consolidated team-audit additions (verified by re-opening files, 2026-06-26 lead pass):**
- Shadow-constant dup is bigger than one file: `CARD_SHADOW` (offset{0,1}/op.06/r8/elev1) + a "sheet shadow" (offset{0,±2}/op.3/r8/elev3) repeat across 14 files (81 shadow-prop occurrences). Export `cardShadow`/`sheetShadow` from theme.js. ~50 LOC.
- confirm()/Alert-or-window.confirm reimplemented inline 5×: App.js:496 (loadDemo), :685 (signOut), :725 (deleteAccount), GroupDetailScreen.js:127, AddEntryScreen.js:158. Extract `confirmDestructive()`. ~40 LOC.
- DEAD i18n keys confirmed: `add.title` (truly dead — add-popup always passes onChangeEntryMode so toggle renders not title; edit paths use edit.title/income.edit) and `dash.vsLastMonth` (referenced nowhere). Both 3 langs.
- Income-edit popup unreachable confirmed: setEditingIncome only ever called with null (App.js:392,399 + onClose); `<AddExpenseModal visible={editingIncome != null}>` App.js:997 never opens → AddEntryScreen income mode + incomeSources.js dead (~120-150 LOC). Deeper income data/sync layer is RISKY (tests + queue keys lean on it) — product call, not a quick delete.
- Real file sizes (larger than team drafts said): SharedSplitForm.js=1019 (not 972), CategoryBreakdownScreen=946 (not 893).

**FALSE POSITIVE — do not re-raise:** tuesday's "taxResult runs unconditionally even when mode!=='tax'" is WRONG. SharedSplitForm.js:134-137 IS guarded by `mode === 'tax'`. Real H1 perf win = useMemo the 3 normMap builds + equal/percent previews (rebuild every keystroke), not a non-existent unconditional tax compute.

**Test gaps to close BEFORE refactoring (monday, verified 0 coverage in src/__tests__):**
- `clearUserStorage` (account-deletion wipe, most destructive path) — 0 tests. Blocks any storage key-scoping refactor.
- `loadGroups`/`saveGroups`/`loadSplitExpenses`/`saveSplitExpenses` — 0 tests.
- `categoryOrder` migration in loadSettings + `loadCategoryOrder` — 0 tests.
- `dateForOffset`/`offsetForDay` in CalendarField.js — 0 tests (need these before moving them to format.js).

See [[audit-final-verdict-2026-06-25]] for what was solid and preserved.
