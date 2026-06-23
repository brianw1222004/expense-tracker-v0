---
name: project-architecture-notes
description: Non-obvious structural facts about expense-tracker beyond CLAUDE.md
metadata:
  type: project
---

Structural facts I verified that aren't fully in CLAUDE.md:

- `deriveViewData` lives in `src/derive.js` (NOT in App.js as some CLAUDE.md prose implies). App.js imports it. Pure, `now` injectable for tests.
- Import graph is strictly layered & acyclic: screens/components -> helpers (theme/i18n/currency/format/categories/derive); no helper imports a screen. Verified by grep of internal `from '.'` edges.
- One layering smell: `CategoriesScreen.js` imports `../storage` directly (loadCategoryOrder/saveCategoryOrder) — the only screen that touches persistence rather than receiving data as props from App.js. The category-order feature persists outside the App.js state-owner model.
- App.js `ExpenseTracker` is ~730 lines and is the single state owner: 13 useState + several refs, ~10 effects, all nav/swipe/animation logic, all mutation+enqueue pairs. The no-early-returns / single `let content` if-else chain is real and disciplined.
- Income aggregation asymmetry: expense totals are pre-computed in `deriveViewData` (App.js), but IncomeBalanceScreen RE-derives income-by-month in-screen (lines 48-65). The two halves of the balance come from different layers.
- `firstName`/`lastName` are persisted to local settings and drive the dashboard greeting, but sync.js settings push only sends display_currency + monthly_budget — so the greeting name is device-local and doesn't follow the user. Consistent with "settings sync is partial by design" but firstName isn't named in that doc list.
- `formatMoney` uses Math.abs internally; callers add their own `-` sign (e.g. IncomeBalanceScreen heroText). Not a double-negative bug — deliberate.
- `onboardingDone` is auto-set true on sync when server returns expenses (App.js ~219-223) so existing cloud users skip onboarding. Local-only mode never shows onboarding at all (gate requires isSupabaseConfigured).
- Two screen-level breaks of the "all state in App.js" rule: (1) `CategoriesScreen` imports `../storage` (loadCategoryOrder/saveCategoryOrder, lines 8/229/244) — the drag-to-reorder order persists in its own AsyncStorage key OUTSIDE App.js state and is never synced; (2) `AuthScreen` imports `../supabase` and calls auth directly (sign-in/up). Both are pragmatic but they are the two exceptions to the single-owner model.
- Dead prop wiring: App.js passes `todayTotal`/`monthCount`/`avgPerDay` to DashboardScreen (App.js 649-651) but DashboardScreen never destructures/uses them, and it calls `<SpendingChart>` WITHOUT a `quickStats` prop — so CLAUDE.md's "SpendingChart accepts quickStats / inline quick stats header" is stale and those three derived values are computed-but-unused on the dashboard path.
- ErrorBoundary (class, components/ErrorBoundary.js) has NO reset key tied to `content`/tab/session — once it catches it stays in the fallback until the user taps "Try Again". A sign-out or tab change won't clear it. Low risk (errors are rare) but worth a `key`/`resetKeys` if churn increases.
- Build/test baseline confirmed healthy this pass: package.json RN 0.85.3 / React 19.2.3 / Expo ~56; expo-linear-gradient IS still used (CategoriesScreen + RewardCheck) so not dead.
