---
name: audit-structure-2026-07-01
description: Architecture-dimension verdicts for the 2026-07-01 full review — App.js keep + merge-block dedup, income layer delete-now, screen-contracts DROP, nav/props/sync keep
metadata:
  type: project
---

Structure audit 2026-07-01 (App.js now 1182 lines; sync.js 653). Verdicts delivered to the review workflow:

1. **App.js: KEEP** — no hooks/reducer extraction. One move: dedupe the twin pull-merge blocks (App.js:258-280 vs 309-331, verbatim except settings/onboarding tail) into one `applySyncResult` helper. Designated first slice IF growth resumes: nav machinery (changeTab/swipePanResponder/screenStyle, App.js:588-718, ~145 lines, zero domain coupling) → `useTabSlide`. **Walked back my 2026-06-26 `useSyncedCollection` idea** — per-collection hooks would fragment the deliberately-coordinated boot (single Promise.all, one dataUser gate, one seq guard). Don't re-propose it.
2. **Prop drilling: KEEP** — max depth 2 (App → Dashboard → CategorySummaryCard, 7 pass-through props at DashboardScreen.js:145-153); everything else depth 1. No new context.
3. **Hand-rolled nav: KEEP** — ~145 lines vs 4+ deps. Real gap found: no BackHandler anywhere; AddExpenseModal is a plain View (not RN Modal), so Android hardware back doesn't close the add popup/editors (Sheet.js IS a real Modal with onRequestClose — sheets fine). Lean fix = one BackHandler effect, not react-navigation.
4. **Income layer: DELETE NOW** (design concern — CLAUDE.md documents retention as deliberate). Footprint ~430 LOC: sync.js income lane ~110, storage.js:63-88, App.js ~15 lines, demoData buildDemoIncome, incomeSources.js (24 lines, ZERO importers incl. tests), 36 i18n key-lines, income-sync.test.js (111). Keep one direct `supabase.from('income').delete().eq('user_id',…)` in deleteAccount for legacy rows. Every sync currently round-trips a useless income SELECT (sync.js:605-608).
5. **sync.js: KEEP** — generic core already shared; genericizing lanes fights the persisted queue wire format (op.expense/op.group field names in AsyncStorage) + the expense lane's settings special-case. Optional: one `replaceRows(table, rows, userId)` for the 4 verbatim replace blocks (sync.js:353-372/392-407/418-433/444-459); injection invariant commented only at 357-361.
6. **screen-contracts.md: DROP** — all six referenced files nonexistent (AddExpenseSheet/SummaryHeader/CategoryBreakdown/BudgetBar/CompareScreen/SettingsScreen), tokens nonexistent (no accentTeal, no static colors export), 3-tab/6-currency/emoji-icon premises all stale. Delete file + CLAUDE.md:63-65 pointer.
7. **Future features: NO PREP justified** for FX/recurring/CSV/notifications. Real multi-user shared groups = re-architecture (per-user RLS, YOU sentinel, replace-op delete-not-in would nuke other members' rows) — don't half-prep.

Status updates vs [[audit-restructure-2026-06-26]]: CLAUDE.md "+"-in-tab-bar drift is FIXED (CLAUDE.md:44 correct now); my confirm.js and cardShadow/panelShadow extraction recommendations were IMPLEMENTED (src/confirm.js exists, theme.js exports tokens). Still-stale doc bits: CLAUDE.md:46 lists enqueueIncomeUpsert/Delete as live (only enqueueIncomeReplace imported, App.js:73), CLAUDE.md:50 calls Insight "5th slot" (4th tab), CLAUDE.md:19 test list omits 3 suites. derive.js still returns unused todayTotal/avgPerDay/monthCount (derive.js:89-92 vs App.js:856).
