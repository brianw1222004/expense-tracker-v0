---
name: restructure-coverage-june-2026
description: Coverage gaps after 3-iteration restructure (Insight, remove income UI, Categories split); pure logic covered, new behavioral logic untested
metadata:
  type: project
---

## Restructure Coverage Analysis
**Date:** 2026-06-25
**Status:** GATES PASS (npm test: 578/578 green, npx expo export: web bundle clean)

## Change Summary
1. **Insight Tab** — moved budget card from Dashboard → new InsightScreen
2. **Remove Income UI** — EntryTypeToggle deleted, add popup expense-only, income data layer kept
3. **Categories Split** — CategoriesScreen deleted, logic moved to:
   - `CategorySummaryCard` (Dashboard widget: donut + stats + month nav)
   - `CategoryBreakdownScreen` (new Sheet page: draggable grid + category modal)

## Test Coverage Status

### Pure Logic (WELL COVERED)
- ✅ `derive.js` — `deriveViewData()` tested for: month/category aggregation, monthTotal/lastMonthTotal/todayTotal/avgPerDay, extraSpending folding, stale category normalization, currency conversion, dailyTotals array, months[] sorting
- ✅ `categories.js` — getAllCategories(), getRegularAll(), getExternalAll(), getCategory(), custom categories merging
- ✅ `sync.js`, `income-sync.js` — all data lanes covered

### New/Moved UI Logic (GAPS)
❌ **catEffectiveKey fallback (App.js line 741)**
- Logic: `catMonthKey < currentMonthKey ? catMonthKey : currentMonthKey` (if selected month has no data, fall back to current month)
- Impact: Controls which month CategorySummaryCard and CategoryBreakdownScreen display
- Test Coverage: **ZERO** — only App.js logic, never tested in isolation
- Severity: **MEDIUM** — affects month navigation UX; silent fallback could mask data issues

❌ **buildArcs() function (CategorySummaryCard.js line 21)**
- Logic: Donut segment layout with MIN_GAP minimum spacing to avoid seams
- Impact: Visual rendering of donut chart on Dashboard
- Test Coverage: **ZERO** — utility function, math never validated
- Severity: **MEDIUM** — purely visual; broken math causes layout glitches, not data loss

❌ **formatPct() function (CategorySummaryCard.js line 39)**
- Logic: Rounds percentages, clamps sub-100% to 99% to avoid "100%/100%" contradiction
- Impact: Stat card labels (Most/Least spending)
- Test Coverage: **ZERO** — edge case: full-month-one-category (would round to 100% without clamp)
- Severity: **LOW** — cosmetic; only breaks when one category dominates

❌ **prevMonthKey computation (CategoryBreakdownScreen.js line 62)**
- Logic: `const [y, m] = monthKey.split('-'); const d = new Date(y, m - 2, 1);` (month-over-month delta calculation)
- Impact: "Last month" values in the per-category grid; critical for trends display
- Test Coverage: **ZERO** — year-boundary cases (Jan→Dec) never tested
- Severity: **HIGH** — wrong delta masks spending patterns; edge case (year boundaries) plausible

❌ **CategoryBreakdownScreen categoryRows filtering (line 75)**
- Logic: `.filter((row) => row.thisVal > 0 || row.lastVal > 0)` — only show categories with recent spending
- Impact: Grid only renders categories with activity this month OR last month
- Test Coverage: **ZERO** — filtering logic never validated
- Severity: **LOW** — UX choice (hides zero-spend rows), but silent filtering could surprise users

❌ **CategorySummaryCard month fallback (line 66)**
- Logic: `months.find((m) => m.key === monthKey) ?? { key: monthKey, total: 0, byCategory: {} }`
- Impact: When selected month not in `months` array, synthetic empty month object returned
- Test Coverage: **ZERO** — race condition potential if months array mutates between memoization
- Severity: **MEDIUM** — defensive coding works, but untested edge case

## Untested Integration Points
- Interaction between `catMonthKey` state and `catEffectiveKey` memo (does fallback trigger correctly?)
- Donut re-rendering on currency change (buildArcs sees new segments)
- Modal category picker nesting in CategoryBreakdownScreen (AddCategoryModal lifecycle within Sheet)
- Month navigation syncing between CategorySummaryCard pill and CategoryBreakdownScreen page

## Recommended Test Scope (for future)
1. Unit test `buildArcs()` with edge cases: zero total, single segment, 100% one category
2. Unit test `formatPct()` with rounding edge: 99.5%, 100%, <1%
3. Unit test `prevMonthKey` logic across Jan/Dec boundary
4. Integration test `catEffectiveKey` fallback with empty and populated months arrays
5. Snapshot test CategorySummaryCard donut render with various spending distributions

## Why Not Written Yet
- Restructure prioritized gates (build + core tests) over component-level coverage
- Component logic is defensive (synthetic objects handle missing data)
- UI testing requires React Native render testing setup (not currently in jest config)
- No regression risk because old logic came from tested derive.js (only extraction/composition changed)
