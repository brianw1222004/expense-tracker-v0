---
name: split-bills-audit
description: Perf/UX/App Store findings specific to the Split Bills screens (audit #2, 2026-06-25)
metadata:
  type: project
---

Split Bills screens audited 2026-06-25 (SplitBillsScreen, GroupDetailScreen, CreateGroupScreen, AddSplitScreen, Dashboard split widget). See [[perf-patterns]] and [[platform-parity]] for the codebase-wide baseline.

KEY ISSUES FOUND (verify still present before re-flagging):
- **Stacked sheets / dead chrome assumption:** opening Add Bill from Group Detail sets `addSplitFor` WITHOUT clearing `activeGroupId` (App.js onAddBill line ~991). Both are `<Modal>`. So GroupDetail Modal stays mounted UNDER the AddSplit Modal. On native iOS two stacked RN Modals is supported but the lower one's slide-out on close can flicker; on web react-native-web Modals both render — backdrop stacking is fragile. Closing AddSplit returns to GroupDetail (intended) but it's an implicit stack, not documented in chromeVisible logic.
- **settleUp has NO confirmation** (GroupDetailScreen settle pill → onSettle fires immediately, App.js settleUp records a settlement). It's reversible only by deleting the settlement bill, which is invisible in the bills list (bills list filters `!b.settlement`). So a mis-tap silently zeroes a balance with no undo and no visible record. Category 14 destructive-action gap.
- **GroupCard recomputes groupNet (which calls groupBalances → full O(bills) scan + convert) on every render** for every group, inside `.map`. React.memo helps across parent re-renders but `splitExpenses`/`displayCurrency` props change on any bill edit → all cards recompute. Fine at small N; not memoized per-group.
- **SplitBillsScreen groups rendered via `.map` in a ScrollView** (not FlatList) — unbounded list, same pattern as Expenses/Income lists. onPress arrow `() => onOpenGroup(group.id)` is created inline per row (defeats GroupCard's React.memo — new fn identity every parent render).
- **AddSplit person rows: inline arrow closures** in `.map` for setIncluded/setCustom/setPaidBy/setCategory — new fns each render, but rows aren't memoized components so no extra harm; equalPreview recomputes computeShares every render (cheap).
- **AddSplit custom-amount TextInputs deep in a long scroll inside a maxHeight 90% Sheet with avoidKeyboard** — KeyboardAvoidingView on a bottom sheet + inner ScrollView can leave a focused custom-amount field (bottom of a long member list) under the keyboard on smaller devices. keyboardShouldPersistTaps is set (good).
- **CreateGroupScreen member inputs keyed by array index** (`key={index}`) — removing a middle member can mis-associate input state/focus. Use a stable id.
- **Dashboard split widget + SplitBillsScreen summary use a 0.005 / 0 threshold** to decide owed/owe display — fine, but the widget hides entirely when both < 0.005, which is correct empty-handling.

GOOD (preserve):
- i18n 3-way parity (en/zh/es) for split.* and group.type.* is COMPLETE (57 keys each, verified).
- GroupDetailScreen confirm() correctly forks window.confirm (web) vs Alert.alert (native) for deleteBill/deleteGroup — matches the codebase pattern.
- GroupCard IS wrapped in React.memo. Empty states exist on SplitBillsScreen (with CTA) and GroupDetailScreen bills.
- All FABs gated by chromeVisible including activeGroupId/addSplitFor — FABs correctly hidden behind sheets.
- TextInputs set keyboardAppearance; numeric inputs use number-pad/decimal-pad by currency decimals.
- ScrollView contentContainerStyle paddingBottom includes TAB_BAR_HEIGHT (SplitBillsScreen) so content clears the tab bar; addFab sits at TAB_BAR_HEIGHT + spacing.sm bottom-right.
