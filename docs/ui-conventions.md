# UI conventions

The visual spec behind the app's screens. `CLAUDE.md` owns architecture and
invariants and points here for "how it looks"; keep it that way — when a rule is
about pixels, tone or motion, it belongs in this file.

## Shared chrome

- **Card-header pills.** One look everywhere, with the SplitBills "New group"
  pill as the reference: soft accent-tinted fill (`` `${colors.accent}15` ``),
  `borderRadius: 14`, bold accent text, pressed state `opacity: 0.6` — no border,
  no shadow. `CurrencyPill` and the Insight header pills follow it.
- **`HeaderGlow`.** The top-of-page wash all four tab screens render: an SVG
  `LinearGradient`, `glowStart` → `glowEnd` → transparent, 240px tall, absolutely
  positioned *fixed* behind each tab's transparent ScrollView so content scrolls
  over it. Its 0.34 top-stop opacity must stay in sync with the palette's
  `glowWashTop`, which App.js paints on the status-bar strip.
- **Elevation.** Spread the `cardShadow` / `panelShadow` / `popupShadow` tokens
  into a style object rather than re-declaring shadow props per file. Cards that
  set `overflow: 'hidden'` need a `cardShadowWrap` around them, or iOS drops the
  shadow.
- **Category rows** (Dashboard top-3 and the Insight Categories card share this
  format): a small category-tinted icon circle centered on a two-line block —
  name (tinted in the category's own color, matching its icon) over the spent
  amount — then a progress bar starting at the name's left edge with its
  reference figure at the right. The bar fills spent-of-budget in a zone tone:
  green under budget, orange within 15%, red over. Going over also reddens the
  amount text. A category with no budget gets an empty track and a "No budget"
  label (`cats.noBudget`) in the figure slot. The rule itself is
  `categoryBarState` in `budget.js` — never re-derive it per screen.

## Dashboard

- Centered page title, `MonthSelector` under it, then three cards sharing the
  `sectionHeading` title-case style.
- **Hero** — "Monthly Spending Summary": selected-month total, a plain
  "↓ 82.6%" month-over-month delta, and the embedded `SpendingChart`. Empty
  months show $0 honestly rather than hiding.
- **`CategorySummaryCard`** — a "Categorical Overview" heading (`cats.sectionTitle`)
  with a bare "›" chevron at its right, the same affordance, size and tone as the
  split-balances card's, jumping to the Insight tab. A donut with the top-3
  categories beside it, in the shared category-row format above.
- **Split balances** — "Split Balances & Debt", below the category card. Each
  side shows a label, a toned amount, a person-count / no-debts caption from
  `overallBalance`'s `owedCount` / `oweCount`, and a toned icon.

## `SpendingChart`

An SVG line chart, deliberately plain: a thin (2px) single-tone full-accent line
with straight segments and round joins — no Bezier smoothing, no pale-tint or
two-tone last segment. Dashed *horizontal* gridlines, one per y-axis value label.
Dot markers: the newest point is a solid accent cap; in-between monthly dots stay
small and card-ringed. A floating pill badge sits on the latest point, plus a
scrub tooltip. No area fill, no baseline.

- The component carries **no top margin** — its `PADDING_TOP` (20px, doubling as
  headroom over the tallest point) is the entire gap under the Dashboard's hero
  figure. Tune the spacing there and nowhere else.
- Daily mode plots the previous month (`compareTotals`) beneath the selected
  month on the same day axis and a shared y max: same hue and weight, dimmed to
  `COMPARE_DIM` at rest, lifted to `COMPARE_ACTIVE` while scrubbing, with its
  reading in the tooltip under a matching dimmed dash. It plots in full while the
  selected month stops at today, and a previous month longer than the selected
  one loses its overhanging days.

## Add popup

- Card chrome comes from the shared `popupChromeStyles` (`popupFormChrome.js`).
- **Personal** (`AddEntryScreen`): a paginated category selector — a horizontal
  `ScrollView` with `pagingEnabled`, 8 categories per page in a 4×2 grid with dot
  indicators. The card's border and background tint animate to the selected
  category color. Edit mode swaps the Personal/Shared toggle for `edit.title`
  plus a red Delete button.
- **Shared** (`SharedSplitForm`): two compact selector-chip rows — **Group /
  Category**, then **Paid by / Split method / Members**. The category chip shows
  the category icon in its color and goes full-width when the group is locked.
  Group / Paid by / Split / Members open an `AnchorMenu` anchored to the tapped
  chip; Category opens the centered `OptionPicker` for its longer icon-badged
  list. Equal mode renders no per-person UI beyond a centered "≈ {amount} each"
  caption (`split.eachShare`); custom, percentage and tax keep one slim avatar row
  per included person carrying that person's inline input, with the tax% and tip%
  fields as inline-label pills.
- **`RewardCheck`** — the full-screen success overlay, a centered animated
  gradient checkmark. Total on-screen time is `SHOW_MS + FADE_MS`, tuned to
  ~0.88s after two successive 30% reductions. **Don't lengthen it without asking.**

## Insight

- **Budget card**: a compact horizontal bar gauge (`BudgetBar`, local to the
  screen) — remaining/over figure with % used, a slim zone-colored green/yellow/red
  bar, and the spent-of-budget line. Its header carries the display-currency
  `CurrencyPill` and the "Edit budgets" pill.
- **Categories card**: a single-column list of the shared category rows, with an
  "External" subsection below a divider carrying its own total. The header's
  "+ Add Category" pill (and tapping a custom row) opens `AddCategoryModal`.

## Budget editor

Rows are shared `CategoryBudgetRow`s: tinted icon, name over an "n% of the
overall" caption (regular rows only), and the amount typed into a recessed field
on the right. Budgets are entered as numbers — the drag-to-set proportion sliders
were removed, so the "Allocated / Remaining" line above the regular section is
the only readout of the ceiling each field clamps to.

## Account sheet

Iconized uppercase section headers (`SectionHeader`) over cards of `SelectRow`s.
The picked option renders as a rounded accent-tinted **capsule** floating inside
the card (a light 8% wash) with a bold `accentDark` label and a trailing solid
accent tick badge — a white `tick-02` ✓ on an accent disc. The badge, not the
fill, is what carries the selected state. Hairline dividers are drawn only
between two *unselected* rows, so none butts against the capsule. The account
card leads the sheet with no section header of its own.

Sheet height follows content (`maxHeight: '92%'`, like every sheet) rather than
being pinned, so short settings lists don't leave dead space.

## Split screens

- **`SplitBillsScreen`** — groups render as a stack of full-width widget cards
  mirroring the group sheet's hero: a header row (method-tinted icon, name,
  "members · method", overlapping avatar stack) over a two-column body. The
  group's all-time total spent and toned net line (both in the display currency)
  sit on the left; beside them, taking the wider 6:4 share, icon-badged
  recent-bill preview rows with toned you-lent / you-borrowed captions on a
  nested solid surface. That half-card width is why the preview rows run on
  compacted type and `shortDayLabel`. Each card is washed in its payment-method
  color with a deeper colored left edge — the expense-row treatment.
- **`GroupDetailScreen`** — a method-tinted hero card leads the sheet: all-time
  total spent in the group currency, a toned net-position line, and an
  overlapping avatar stack (you in the theme accent, members in their stable
  `memberColor` palette colors). Then the combined members+balances card, then
  the bill list, each row leading with a category-tinted icon badge and carrying
  a toned you-lent / you-borrowed caption under the amount. The payment method is
  a compact widget pill in the title row beside the currency pill — method label
  plus flip chevron on the animated method-color tint — expanding into a
  payment-method-themed chip panel under the header (animated border/wash tint to
  the method's color, mirroring the add-expense category tint; a height- and
  opacity-animated accordion) that collapses after a pick. The group avatar is a
  tappable emoji.

## Tab transition

A Copilot-style widgets-swap: a fixed backdrop layer in App.js — the same
background and `HeaderGlow` wash every tab paints — stays put while the screens
crossfade over it with a small directional glide (`COPILOT_GLIDE`), so only the
widgets appear to change. The content container uses `overflow: 'hidden'` to clip
off-screen screens mid-transition.
