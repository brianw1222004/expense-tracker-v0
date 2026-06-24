---
name: perf-patterns
description: Recurring RN performance anti-patterns and good practices observed in expense-tracker
metadata:
  type: project
---

Audit #1 (2026-06-24) findings — recurring patterns:

ANTI-PATTERNS (verify still present before re-flagging):
- Lists rendered with `.map()` inside ScrollView instead of FlatList: ExpenseListScreen day rows, IncomeBalanceScreen income rows, DashboardScreen recent feed (capped at 5, fine), CategoriesScreen cat grid. Expense/income lists are unbounded → main candidates for virtualization.
- `useMemo` for per-theme styles is consistently `[colors]`-keyed (good), but several screens build derived arrays/objects inline in render without memo (e.g. DashboardScreen budgetedCategories/regularSpent/gaugeBudget every render).
- Color-string concatenation in render (`${color}1A`) is cheap but ubiquitous; not worth flagging individually.
- SpendingChart recomputes the full Bezier path + points on every render (no memo); it also has a non-render-time bug: `today` uses `getDate()` but slices dailyTotals by it, and X_TICKS includes 31 — off-by-one risk on short months.

GOOD PRACTICES (preserve — do not "fix"):
- React.memo used on row components (ExpenseRow, IncomeRow, FilterChip, TabItem, DeltaBadge, CategoryBar, ActivityRow).
- useNativeDriver discipline is CORRECT throughout: true for opacity/transform, false for SVG strokeDashoffset (RewardCheck) and color interpolation (AddEntryScreen) and layout maxHeight animations. CLAUDE.md documents this rule explicitly.
- Only one console.* call (console.error in ErrorBoundary, intentional). No stray logging.
- ErrorBoundary exists and wraps content with resetKeys — App Store crash-safety baseline met.
