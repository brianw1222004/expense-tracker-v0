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

Audit #5 (2026-07-01) — full-codebase perf/UX/store pass. New durable findings:
- CENTRAL re-render lever: the four kept-mounted tab screens (DashboardScreen/ExpenseListScreen/InsightScreen/SplitBillsScreen) are NOT React.memo-wrapped, so EVERY App.js setState re-renders all four (incl. the 3 hidden ones + their SVG). Pure waste on non-data triggers (opening any sheet/modal, rewardNonce, tab-slide completion). SVG geometry IS memoized (SpendingChart geom, donut arcs) so cost is element/react-native-svg reconciliation, not path math → plausible jank on low-end Android, not guaranteed on flagship. Fix needs memo + prop stabilization (App passes inline arrows + fresh allCategories/regularCategories/externalCategories arrays each render — none memoized).
- Cheap standalone win: allCategories/regularCategories/externalCategories in App.js recompute every render (new array refs) → defeat downstream `categories`-keyed memos (ExpenseList presentCategories/filteredExpenses). Wrap in useMemo([settings.customCategories]).
- Hue-slider PanResponder calls setHue+setColor on EVERY onPanResponderMove → per-frame re-render of the modal during a hue drag. Present in BOTH AddCategoryModal (CategoryBreakdownScreen ~L418) and PaymentMethodModal (~L70). Localized to an infrequent drag; MEDIUM. DnD grid by contrast drives pan via Animated.event (no per-move setState) — sound.
- expo-blur TabBar: `<BlurView intensity={50} tint="light">` renders on ALL platforms, no Platform check / no experimentalBlurMethod. Live blur over scrolling content = Android perf cliff on low-end. Fix: iOS-only BlurView, translucent-solid fallback on Android (blurLayer already carries rgba(255,255,255,0.72)).
- CONTRAST (WCAG): textMuted fails AA (4.5:1) on card/background in ALL 3 palettes — neutral #a3a3a3≈2.4:1, slate #829fae≈2.8:1, sand #a29470≈3.0:1. Used on 12–13px captions/labels/placeholders/chart labels. Best-practice (not Apple-hard). ~4.5:1 needs ≈#757575 on white.
- A11y gap: month-nav chevrons are icon-only Pressables with hitSlop but NO accessibilityLabel in CategorySummaryCard (L76/L80) and CategoryBreakdownScreen monthNav (L116/L120). VoiceOver reads bare "button".
- Lists are now mostly BOUNDED (good, changed from old design): ExpenseList renders one selected DAY's rows (not all history), Dashboard recent-feed gone, CategoryBreakdown per-category (~8-40). Only genuine FlatList candidate = GroupDetailScreen bill list (unbounded per active group).
- ErrorBoundary shows raw error.message to users (up to 6 lines) — unpolished for a finance app, not a reject. Consider generic copy.
- Silent sync failure: syncWithServer swallows errors, no offline/last-synced/error UI anywhere. DESIGN (cache is source of truth) — label "design concern", not bug.

GOOD PRACTICES (preserve — do not "fix"):
- React.memo used on row components (ExpenseRow, IncomeRow, FilterChip, TabItem, DeltaBadge, CategoryBar, ActivityRow).
- useNativeDriver discipline is CORRECT throughout: true for opacity/transform, false for SVG strokeDashoffset (RewardCheck) and color interpolation (AddEntryScreen) and layout maxHeight animations. CLAUDE.md documents this rule explicitly.
- Only one console.* call (console.error in ErrorBoundary, intentional). No stray logging.
- ErrorBoundary exists and wraps content with resetKeys — App Store crash-safety baseline met.
