---
name: audit-components-crosscutting-2026-06-25
description: Deep review of src/components/*, theme.js, i18n.js, icons.js — what's verified clean vs the few real drifts (2026-06-25)
metadata:
  type: project
---

Area review of components + cross-cutting (theme/i18n/icons), 2026-06-25.

**Verified clean (don't re-flag):**
- i18n key parity: en/zh/es each have exactly 218 keys, identical sets, no missing, no duplicates (checked programmatically).
- `fontWeight` grep across src/ = 0 occurrences. Font rule respected.
- All themed components use `useMemo(() => createStyles(colors), [colors])`. Exceptions BudgetGauge + RewardCheck + AddExpenseModal + ErrorBoundary use static StyleSheet with colors applied inline — acceptable legacy pattern (only static spacing/fonts in the sheet).
- EntryTypeToggle: both segments use `accent` colorKey by design (income mimics expense). Consistent.

**Real drifts found (mostly doc/dead-code, not bugs):**
- `src/components/CurrencyDropdown.js` is genuinely DEAD — zero source imports (Dashboard uses CurrencyPill). NOTE: CODE_REVIEW.md L14/F17 is STALE — it claims CurrencyDropdown is "Dashboard header… actively used." It is not. Safe to delete.
- `src/icons.js` HIcon DOES forward `style` prop (line 102, 112, 121), but CLAUDE.md:58 says it does NOT. No caller passes style (all wrap in View), so harmless — but doc/code contradict.
- `add.title` key (i18n.js:160/398/636) is dead — already flagged in CODE_REVIEW.md L8/F8.
- BudgetGauge double-rounding vs CategoryBar — already flagged CODE_REVIEW.md L5/F11.

**Theme dark-mode-readiness gaps (no dark theme exists yet, so not active bugs):** TabBar.js blurLayer hardcodes `rgba(255,255,255,0.72)` + `tint="light"`; all 3 palettes have statusBarStyle:'dark'. Future dark theme would need these.

See [[audit-home-screen-2026-06-24]] for the broader app state.
