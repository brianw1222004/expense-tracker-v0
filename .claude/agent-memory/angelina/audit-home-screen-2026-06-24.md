---
name: audit-home-screen-2026-06-24
description: Full review 2026-06-24 focused on rewritten home screen (Dashboard/Categories/SpendingChart embedded mode); resolved-vs-open status
metadata:
  type: project
---

Full codebase review 2026-06-24. Baseline: 297/297 Jest tests pass (was 242). RN 0.85.3 / React 19.2.3 / Expo ~56. Fonts now lora + tinos only (no inter/space-grotesk/outfit — those dead deps are GONE from package.json; my older audit notes on that are stale).

**Home screen was substantially rewritten since prior notes:**
- DashboardScreen no longer has the gradient watercolor header; it's a flat `spendCard`. The dead props (`todayTotal`/`monthCount`/`avgPerDay`) are no longer passed by App.js (line 613/660-682 destructure/pass only what's used). SpendingChart is now rendered with `embedded` prop inside the spend card.
- getCategory now receives `categories` (allCategories) in Dashboard ActivityRow, ExpenseRow, ExpenseListScreen — the prior custom-category "falls back to Other" regression is FULLY FIXED everywhere.
- categoryOrder moved INTO settings (settings.categoryOrder, device-local, not pushed). CategoriesScreen no longer imports ../storage (my architecture-notes claim about that is now stale). storage.loadCategoryOrder still exists only as a one-time legacy migration read in loadSettings.

**Resolved since older audits:** mono-palette success=danger=accent collapse (neutral now has distinct semantic colors); RewardCheck driver-mixing (now AnimatedPath draw on its own non-native value, scale/opacity native — clean); dead font deps; getCategory custom-cat regression.

**Still open (this review):**
- SpendingChart: when `embedded` (the ONLY mode the app uses), the entire collapsible apparatus is dead — `open`/`toggleOpen`/`rotateAnim`/`chevronRotate`/`title` prop/`Pressable`/`LayoutAnimation`/`UIManager` line + `card`/`titleRow`/`chevron`/`title` styles. Embedded returns before any of it. Dead code, low risk.
- derive.js still computes todayTotal/monthCount/avgPerDay; nothing consumes them now. Orphaned i18n keys `dash.today` + `dash.avgPerDay` (present all 3 langs, referenced by no component).
- sync.js replace-op delete filter builds `.not('id','in','("a","b")')` by string-quoting ids. makeId ids are safe, but an id containing `"` or `,` (imported/legacy) could break the filter. Low.
- SpendingChart handleInteraction uses `daysInMonth - 1` for the ratio→index map but clamps to totalsUpToToday.length; on a partial month the right edge maps past the data and clears the tooltip (minor UX).
- AddExpenseModal/AddEntryScreen: split state (splitOpen/splitBy) resets only on submit/reset, persists across dismiss-without-submit (modal stays mounted) — same family as the kept-mounted design, acceptable.

**Strengths worth keeping:** RLS schema is textbook (per-user policies + composite PK + client never sends user_id); separate per-lane sync queues with single-flight flush + coalesce + pure reducers (well tested); i18n is in exact 3-way parity (160 keys, no placeholder drift, every reference resolves); deriveViewData single pass is clean and injectable-clock tested; cross-platform Alert/window.confirm fallbacks present everywhere (loadDemo, signOut, delete).

**Why:** Records what the home-screen rewrite changed so the next review doesn't re-flag fixed items or trust stale architecture notes.
**How to apply:** Treat audit-expense-tracker-2026-06-16 and project-architecture-notes as partly superseded by this file for: fonts, dashboard props/gradient, categoryOrder location, CategoriesScreen storage import.
