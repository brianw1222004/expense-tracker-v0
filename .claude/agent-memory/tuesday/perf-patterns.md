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
- SpendingChart: FIXED since audit #1 — geom (Bezier path + points) is now wrapped in useMemo([dailyTotals, chartWidth]) and today is clamped via Math.min(getDate(), daysInMonth). Don't re-flag.

Audit #2 (2026-06-25) — whole-app sweep, new observations:
- TabBar BlurView is hardcoded `tint="light"` + `rgba(255,255,255,0.72)` blurLayer. Fine on the 3 current light palettes, but will look wrong if a dark theme is ever added. Not a bug today.
- AddEntryScreen note TextInput sits low in the card; KeyboardAvoidingView in AddExpenseModal only has behavior on iOS (Android undefined). Android relies on system adjustResize. Acceptable but watch if reports of covered note field.
- No images in the app at all — category icons are vector (HIcon/SVG), no Image components anywhere. Image-optimization category is N/A by construction.
- app.json has NO ios.infoPlist permission strings and the app requests no native permissions (no camera/location/photos/notifications) — so no missing-justification rejection risk. expo-haptics needs no usage string.

GOOD PRACTICES (preserve — do not "fix"):
- React.memo used on row components (ExpenseRow, IncomeRow, FilterChip, TabItem, DeltaBadge, CategoryBar, ActivityRow).
- useNativeDriver discipline is CORRECT throughout: true for opacity/transform, false for SVG strokeDashoffset (RewardCheck) and color interpolation (AddEntryScreen) and layout maxHeight animations. CLAUDE.md documents this rule explicitly.
- Only one console.* call (console.error in ErrorBoundary, intentional). No stray logging.
- ErrorBoundary exists and wraps content with resetKeys — App Store crash-safety baseline met.
