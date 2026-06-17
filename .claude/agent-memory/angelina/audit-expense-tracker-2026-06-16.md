---
name: audit-expense-tracker-2026-06-16
description: Full codebase audit of expense-tracker React Native app — architecture, security, performance, data integrity, and dependency findings
metadata:
  type: project
---

Comprehensive audit performed 2026-06-16, updated 2026-06-17 after reviewing recent changes (dual font system, Mono theme, collapsible sections, split-bill, animated dropdowns, shadow additions).

**Resolved from prior audit:** Module-level mutable _custom state in categories.js was replaced with function parameters (customCategories flows through props). ErrorBoundary was added. Note limit raised to 50 chars.

**Critical (new):** RewardCheck mixes useNativeDriver:true (scale, opacity) and useNativeDriver:false (draw) on parallel animations sharing the same component subtree. Mono theme has success=warning=danger=accent all `#0a0a0a`, breaking visual semantics (BudgetGauge zone colors, spending delta indicators). `@expo-google-fonts/inter` and `@expo-google-fonts/space-grotesk` are dead dependencies still in package.json (fonts switched to Lora/Outfit but packages not removed). CLAUDE.md documents "Font is Inter" but code uses Lora/Outfit.

**High (new):** Dashboard/SpendingChart collapsible maxHeight hardcoded to magic numbers (200, 400, 600) that may clip or leave whitespace. All collapse animations use useNativeDriver:false for maxHeight+opacity -- rotation chevrons could use native driver but are bundled with the non-native animations. Split-bill does not persist splitOpen/splitBy across modal dismissals (modal stays mounted but split state resets on submit). pushNextRef.current read outside of setSettings callback creates a race (App.js line 292).

**Medium (persistent):** App.js monolith (now 721 LOC). Static exchange rates. No pagination on expense list or Supabase pulls. No CI/linter.

**Why:** Tracks technical debt and risk profile for prioritizing future work.
**How to apply:** Use these findings when planning refactors. The Mono theme semantic color issue and dead dependency cleanup are quick wins. The animation driver mixing and hardcoded maxHeight are the most impactful correctness risks from the recent changes.
