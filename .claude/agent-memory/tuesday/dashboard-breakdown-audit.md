---
name: dashboard-breakdown-audit
description: Audit #4 — new Dashboard layout (CategorySummaryCard) + CategoryBreakdownScreen (nested-modal DnD sheet)
metadata:
  type: project
---

Audit #4 (2026-06-25) — Change 3 of the restructure: Categories tab split into CategorySummaryCard (Dashboard, under split card, gated `hasExpenses`) + CategoryBreakdownScreen (full-height Sheet/Modal opened via "more detail" pill, overlay==='categoryDetail').

**Why:** the old Categories tab was deleted; donut/grid/AddCategoryModal moved into the two new files. App.js owns catMonthKey/catEffectiveKey/shiftCatMonth shared by both.

**How to apply — findings that persist:**
- **"More detail" pill overlap (CategorySummaryCard topRow):** pill is `position:absolute,right:0`; monthNav is centered in the same row. On ~320pt the centered month label (minWidth 100) + chevron hitSlop 12 can sit under the absolutely-positioned pill. The row has NO reserved right-padding for the pill, so centering math ignores the pill width. Right chevron's right hitSlop (12px) overlaps the pill's tap area → ambiguous touch. HIGH. Fix: give topRow paddingHorizontal = pill width, or make pill a flex sibling.
- **Nested RN Modal (AddCategoryModal inside Sheet's Modal):** sound on iOS/Android (RN stacks native modals). On react-native-web both render as absolutely-positioned divs; the inner backdrop is `absoluteFill` inside `.center` and paints above the sheet — works, but stacking relies on DOM order not zIndex. Acceptable; flagged as watch-item.
- **DnD-in-ScrollView:** grid PanResponder uses `onStartShouldSetPanResponder:false` + onMoveShouldSet gated on `dragIndexRef>=0` (only claims gesture after a long-press starts a drag), and toggles parent `scrollEnabled` via onDragStateChange. Sound pattern. BUT long-press drag relies on `onLongPress` (200ms) — on web, RN-web Pressable longpress is unreliable/absent → drag may never start on web. MEDIUM (web DnD degraded, not broken; reorder is non-essential).
- **endDrag spring uses useNativeDriver:false** — correct, because it animates `pan` (ValueXY) bound to layout translate AND the same value is read via getTranslateTransform; mixing would break. Consistent with CLAUDE.md driver rule.
- **Loading/empty:** card only renders when `hasExpenses` (good, no flash unlike InsightScreen — see [[insight-screen-audit]]). Navigated empty month shows `cats.emptyMonth` via the `!mostSeg` branch. Breakdown page empty shows `cats.emptyHint` only when no rows AND no custom cats.
- **monthLabel vs monthKeyLabel:** Dashboard hero uses `monthLabel(new Date())` (always current month), card/breakdown use `monthKeyLabel(monthKey)` (selected). Intentional — hero is always current-month spend.
