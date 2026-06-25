---
name: audit-final-verdict-2026-06-25
description: Consolidated team-review verdict (9 reports synthesized) — sign-out flush data loss + foreground-resync race + custom-split rounding are the pre-release blockers
metadata:
  type: project
---

Authoritative synthesis of six area reviews + tuesday(perf/UX) + monday(test-gaps) + saturday(test/build run), 2026-06-25. Verdict: **needs-work, not has-critical-issues.** Build/tests green (527 pass, tsc clean, web export OK).

**Why:** Architecture is sound; the hard mobile concurrency/cache problems are solved well. The pre-release fixes cluster into a few real defects, not pervasive rot.

**How to apply:** When Brian or the team picks up fixes, this is the priority order. The two genuine data-loss/integrity bugs are the gate.

The must-fix shortlist (deduped across reports):
1. **App.js:677-705 signOut** — flushes only expense+income lanes; `flushGroups`/`flushSplits` never called → offline group/split ops lost on sign-out. Both angelina(core) and sync-engine review flagged the same line. Real data loss. Fix: add both flushes (already exported, just not imported).
2. **App.js:266-286 foreground re-sync race** — income/groups/splits state application unguarded by `syncSeq`; can clobber concurrent account-switch load. Gate on a monotonic seq ref like settings already does.
3. **Custom-split rounding** (splits.js:45-49 computeShares + :66-70 customSharesValid; AddSplitScreen.js:54-55) — validates rounded share sum against UNROUNDED amount; bill row shows amount, balances derive from shares → internally inconsistent ledger by up to one minor unit/bill, accumulates. Reconcile last share to amount inside computeShares.

Recurring themes that explain the clusters:
- **Stale "device-local, never synced" comments** in THREE places (App.js:134, storage.js:135, splits.js:1-6) — actively caused reviewers to nearly miss the sign-out gap. Doc/code drift is the connective tissue of the worst bug.
- **Latent NaN/empty-array fragility** in Dashboard/AddEntry/Categories — guarded by current data shape (built-ins guarantee 8 categories, budgets pre-filtered >0) but one prop-shape change from a white-screen. Defensive `?? 0` / `?.` / `> 0` guards missing at a few access sites.
- **Web-vs-native parity** is mostly DONE well (window.confirm fallbacks everywhere) — Sunday's old GroupDetailScreen Alert concern is RESOLVED. Remaining: Android keyboard behavior (AddExpenseModal.js:74 iOS-only), numeric keyboardType drift (OnboardingScreen.js:96).
- **Sync-lane test coverage gap** — coalesceGroups/coalesceSplits/applyGroup|SplitOps/fromSplitRow(settlement branch) have ZERO tests despite the income lane having proven coalesce-variant bugs exist independently.

What's solid (preserve): no-early-return single-content hook structure + ErrorBoundary resetKeys; dataUser===userId save-gate (closes account-switch cache poisoning); coalesce-by-value/splice-by-identity flush discipline; generic flushQueue factory with real per-lane isolation; equal-split leftover-unit distribution; i18n perfect key parity (218x3); RewardCheck animation teardown.

Functional gap (not a bug): GroupDetailScreen.js:127-163 — no UI to edit/remove group members after creation. Splitwise-style product gap.
