---
name: insight-screen-audit
description: Audit #3 findings — InsightScreen extraction from Dashboard (budget block moved to new 5th tab)
metadata:
  type: project
---

Audit of the InsightScreen refactor (budget block moved off Dashboard into a new 5th "Insight" tab), 2026-06-25. Changes were uncommitted in the working tree at audit time (HEAD was the Split Bills commit). `IncomeBalanceScreen.js` deleted; `InsightScreen.js` added.

**Why:** The old Income/Balance 5th tab was replaced. The budget gauge + per-category bars + external breakdown that lived on the Dashboard moved to `InsightScreen`, laid out as separate cards.

**How to apply:** The budget MATH in InsightScreen is a verbatim port of the old Dashboard block (gaugeBudget/gaugeSpent/hasBudgets/factor/rounding all identical) — math edge cases (no budget, external-only, over-budget) are preserved. The real deltas are LAYOUT/GATING, not math:

- Loading-window gating regression: old Dashboard gated the whole budget block on `{hasExpenses && ...}`, so nothing rendered while data loaded. InsightScreen uses `loaded && !hasExpenses ? <EmptyState/> : <cards>` — during the load window (`!loaded`) the ELSE branch renders, so an empty BudgetGauge flashes before data arrives. See [[platform-parity]] loading-state notes.
- InsightScreen correctly added `+ insets.bottom` to paddingBottom (Dashboard still uses only `spacing.xl + TAB_BAR_HEIGHT`). Good — but note the inconsistency across the two screens.
- CategoryBar memoization is defeated: `styles`, `colors`, `t` are passed as props and are fresh objects each render, and `category`/`budget`/`spent` are also recomputed — React.memo gives near-zero benefit here (same as old Dashboard, carried over). Low severity at current list sizes.
