---
name: full-team-review-2026-07
description: Verdicts from the 2026-07-02 full-team review (bugs/arch/perf/hardcode/lean/safety, all adversarially verified) — what was ruled KEEP vs FIX vs DELETE
metadata:
  type: project
---

Full-team review delivered to Brian 2026-07-02 (tree at commit dbdacaf). All findings below survived adversarial verification.

**Why:** establishes the ruled baseline — future reviews should not re-litigate the KEEP verdicts or re-report the known bugs unless code changed.

**How to apply:** check `git log` since dbdacaf before citing any of this; re-verify line numbers.

Confirmed bugs (unfixed as of review): H1 GroupDetailScreen commitMembers blur-deletes bill-referenced members; H2 mutation racing a sync pull gets clobbered (fix direction: mutation-epoch ref mirroring settingsVersionRef); M1 CalendarField relative dayOffset shifts entries across midnight; M2 remote group delete strands activeGroupId (hides account FAB); safety-M deleteAccount never deletes the settings row and an offline delete + uninstall strands all server data (proper fix: service-role deleteUser Edge Function, FK cascades cover everything).

Ruled KEEP (do not re-flag): App.js single-owner size (dedupe the two pull-merge blocks only), prop drilling (max depth 2, no context), hand-rolled nav (only gap: no Android BackHandler for the add popup), 4-lane sync duplication (only the 4x replace-op bodies worth deduping into replaceRows), settings god-object, string-built not-in filter (id charset invariant verified), plaintext AsyncStorage, gesture/animation magic numbers, white literals on swatches/TabBar blur.

Ruled DELETE: inert income layer (~540 lines incl. tests/i18n; sole live dependency is deleteAccount's legacy wipe — replace with one direct delete), .claude/screen-contracts.md (all premises stale), CODE_REVIEW.md (misleads), .design-sync/ + typescript/@types/react/tsconfig + @jest/globals, i18n dead keys, derive.js todayTotal/avgPerDay/monthCount, settingsRef (App.js:549), fonts.numMedium + Inter_500Medium boot load, theme gradient/header tokens, BudgetScreen orphan styles, icons calendar-01/search-01.

Rejected recommendations (do not resurrect): react-navigation, contexts, splitting settings, generic sync-lane consolidation (wire-format migration risk), local-storage encryption, schema CHECK constraints, multi-user prep, per-collection sync hooks, new colorUtils.js file (hslToHex goes in theme.js instead).
