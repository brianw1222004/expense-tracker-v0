---
name: test-coverage-baseline
description: Current test coverage snapshot as of 2026-06-24 — 297 tests across 7 suites, no screens/components tested
metadata:
  type: project
---

## Test Suite Overview (2026-06-24)

**All Tests Passing:**
- 297 tests across 7 test suites
- All 7 suites pass (100% pass rate)
- Execution time: ~2.1-4.6s (varies slightly)
- No snapshots
- No skipped tests

## Per-Suite Breakdown

| File | Tests | Description |
|------|-------|-------------|
| categories.test.js | 44 | Category system: built-in/custom categories, getters, emoji/color options |
| currency.test.js | 38 | Currency conversion (6 currencies), rates, decimals, round-trip conversion |
| format.test.js | 75 | Money formatting (multiple currencies & precisions), date formatting |
| derive.test.js | 9 | Data derivation: expenses to dashboard stats, daily totals, category bucketing |
| sync.test.js | 18 | Sync queue coalescing, offline-first operations, expense merging |
| income-sync.test.js | 11 | Parallel income queue, coalescing, operation application |
| storage.test.js | ? | Settings/expenses/income persistence, cache merging, legacy normalization |

## Coverage Gaps Observed

**Utility Files WITH Tests:**
- ✓ categories.js
- ✓ currency.js
- ✓ derive.js
- ✓ format.js
- ✓ storage.js
- ✓ sync.js

**Utility Files WITHOUT Tests:**
- ✗ demoData.js (sample data generator)
- ✗ i18n.js (i18n system)
- ✗ icons.js (icon registry wrapper)
- ✗ incomeSources.js (income source config)
- ✗ supabase.js (Supabase client init)
- ✗ theme.js (theme system/useTheme hook)

**NO Screen/Component Tests:**
All 9 screens untested:
- AuthScreen, OnboardingScreen, DashboardScreen
- AddEntryScreen, ExpenseListScreen, CategoriesScreen
- IncomeBalanceScreen, BudgetScreen, AccountScreen

All 11 components untested:
- AddExpenseModal, TabBar, RewardCheck, SpendingChart
- BudgetGauge, CurrencyDropdown, EmptyState, EntryTypeToggle
- ErrorBoundary, ExpenseRow, Sheet

## Build Status

- `npx expo export --platform web` completes successfully
- Exports 12 font assets (Lora: 8, Tinos: 4)
- Generates valid web bundles with no syntax/import errors
- Output: `dist/` directory with proper structure

## Notes for Future Runs

- Jest runs in Node environment with babel-jest transform
- Mocks in place for: react, react-native, async-storage, supabase-js, i18n
- No linter configured (no eslint)
- TypeScript config present but empty (just extends expo base) — project is plain JS
- No test coverage reporting configured
