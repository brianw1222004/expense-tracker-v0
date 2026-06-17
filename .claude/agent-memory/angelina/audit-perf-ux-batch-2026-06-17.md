---
name: audit-perf-ux-batch-2026-06-17
description: Post-fix review of commit b509bd6 (perf+UX audit batch) — getCategory custom categories regression, LayoutAnimation code-style, side-effect in setState
metadata:
  type: project
---

Reviewed commit b509bd6 which applied a large batch of performance and UX fixes.

**Key findings:**
- getCategory() calls in ExpenseListScreen and ExpenseRow still lack customCategories param — custom categories silently fall back to "Other" in those screens.
- enqueueSettingsPush called inside setSettings updater function is a side-effect in a state updater — works but fragile under React 19 StrictMode.
- LayoutAnimation + Animated double-animation on same content in DashboardScreen toggleSection.
- UIManager.setLayoutAnimationEnabledExperimental called between import statements (code-style, not a bug).
- loadDemo on native has no confirmation dialog (web has window.confirm; native silently replaces data).

**Why:** These were introduced as part of the categories.js refactor (removing setCustomCategories module-level mutation) and the collapsible-sections UX work.

**How to apply:** The getCategory regression is the highest priority fix — it breaks custom category display in the Expense List and ExpenseRow. The other items are lower priority but should be addressed.
