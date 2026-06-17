export const meta = {
  name: 'review-restructure',
  description: 'Multi-dimension adversarial review of the expense-tracker restructure',
  phases: [
    { title: 'Review', detail: '5 dimensions in parallel' },
    { title: 'Verify', detail: 'adversarial verification per finding' },
  ],
}

const ROOT = 'C:/Users/AshAI Intern/Desktop/Project/expense-tracker'

const CONTEXT = `
The Expo SDK 56 / RN 0.85 (React 19, plain JS) expense-tracker at "${ROOT}" was just heavily restructured (uncommitted working tree — review the CURRENT files, git HEAD is the OLD app):
- New theme system: src/theme.js exports THEMES.cookie (warm light, default) + THEMES.midnight, ThemeProvider/useTheme; components build styles via useMemo(() => createStyles(colors), [colors]). No static colors export anymore.
- Caladea font everywhere via fonts.regular/fonts.bold; fontWeight must NEVER coexist with fontFamily.
- i18n: src/i18n.js (en/zh/es) with useT/translate; date names via getDateNames; format.js date fns take a language arg.
- 4 tabs (dashboard/list/categories/account) + center add button in src/components/TabBar.js; App.js keeps all four mounted with display:none.
- New screens: CategoriesScreen (month-over-month per category, 6-month window), AccountScreen (account/theme/language), BudgetScreen (sheet: display currency + overall budget + per-category budgets). Old SettingsScreen/CompareScreen/BudgetBar/CategoryBreakdown were DELETED.
- New src/components/BudgetGauge.js speedometer on the Dashboard (240° SVG arc + native-driver spring needle).
- RewardCheck timings cut 30% (SHOW_MS 1050, FADE_MS 210), themed.
- settings = {displayCurrency, monthlyBudget, categoryBudgets, theme, language}. CRITICAL INVARIANT: the Supabase settings table only has display_currency + monthly_budget columns; theme/language/categoryBudgets are device-local; sync.js must never push them; App.js merges pulled settings over local (never replaces); a failed push would wedge the whole pending-ops queue. updateSettings re-denominates monthlyBudget AND categoryBudgets on currency change and only enqueues a push when displayCurrency/monthlyBudget changed.
- Web + phone must both work: Alert buttons no-op on web (window.confirm fallback), onBlur not onEndEditing, classic Animated only, useNativeDriver:true only transform/opacity (SVG props need false), StyleSheet.absoluteFill.
Read ${ROOT}/CLAUDE.md (already updated) for the full architecture. The supabase schema is in supabase/schema.sql.
`

const FINDINGS = {
  type: 'object',
  properties: {
    findings: {
      type: 'array',
      items: {
        type: 'object',
        properties: {
          title: { type: 'string' },
          file: { type: 'string' },
          line: { type: 'number' },
          severity: { type: 'string', enum: ['high', 'medium', 'low'] },
          evidence: { type: 'string', description: 'exact code + why it is wrong' },
          fix: { type: 'string' },
        },
        required: ['title', 'file', 'severity', 'evidence', 'fix'],
      },
    },
  },
  required: ['findings'],
}

const VERDICT = {
  type: 'object',
  properties: {
    isReal: { type: 'boolean' },
    confidence: { type: 'string', enum: ['high', 'medium', 'low'] },
    reasoning: { type: 'string' },
  },
  required: ['isReal', 'confidence', 'reasoning'],
}

const DIMENSIONS = [
  {
    key: 'logic',
    prompt: `${CONTEXT}
DIMENSION: correctness / logic bugs in the NEW code. Read App.js, src/components/BudgetGauge.js, src/screens/DashboardScreen.js, src/screens/CategoriesScreen.js, src/screens/BudgetScreen.js, src/screens/AccountScreen.js end to end and hunt REAL bugs: budget math (gauge spent/budget when monthlyBudget unset vs category budgets; over-budget handling; display-precision rounding), the 6-month window date math (year boundaries, missing months), delta-percent edge cases (prev=0, pct rounds to 0), BudgetScreen commit/re-sync flow (currency switch re-denomination propagating into input text state, delete-key-on-zero semantics, stale categoryBudgets caches), SVG/needle geometry (rotation center, percentage overlay alignment), kept-mounted screens with display:none, hooks rules (conditional hooks, missing deps that matter). Report only defects with user-visible or data consequences — not style nits.`,
  },
  {
    key: 'conventions',
    prompt: `${CONTEXT}
DIMENSION: theme/font convention violations. Grep + read EVERY file under src/ and App.js for: (1) any remaining static import of colors from theme.js or hardcoded palette hexes that should be tokens (category colors in categories.js and '#06281C' inside theme.js onAccent are LEGITIMATE); (2) any style with BOTH fontFamily and fontWeight, or any fontWeight at all in text styles, or text styles missing fontFamily entirely (emoji-only styles are exempt); (3) StyleSheet.create capturing theme colors OUTSIDE the useMemo createStyles(colors) pattern (stale styles after theme switch); (4) keyboardAppearance hardcoded; (5) text on accent surfaces not using onAccent; (6) contrast problems in the cookie palette usage (light text on light bg or vice versa) where a component mixes tokens incorrectly (e.g. colors.background used as text on a card). Report concrete violations with file/line.`,
  },
  {
    key: 'platform',
    prompt: `${CONTEXT}
DIMENSION: RN 0.85 + react-native-web compatibility. Read every changed/new file and hunt: Animated driver violations (native driver on non-transform/opacity props, mixed drivers on one Animated.Value, SVG prop animation with useNativeDriver true), use of removed APIs (StyleSheet.absoluteFillObject), Alert.alert with buttons lacking a web fallback, onEndEditing reliance, percentage-position quirks (the BudgetGauge overlays use % left/top/width/height inside an aspectRatio view — verify RN supports each of those % properties on the platforms; % borderRadius is NOT supported in RN for instance), fontVariant with a custom font, Modal usage on web, useFonts blocking render (App returns null pre-load — check hooks aren't called conditionally after), SafeAreaView edges, SectionList/ScrollView in display:none containers. Report only things that would actually break or visibly misrender on phone or web.`,
  },
  {
    key: 'i18n',
    prompt: `${CONTEXT}
DIMENSION: i18n completeness + correctness. (1) Grep all of src/ + App.js for user-visible string literals that bypass t()/translate() — placeholders, accessibilityLabels, Alert text, empty states (single emoji/symbols like ✕ › ✓ are fine). (2) For EVERY t('key')/translate(lang,'key') call site, verify the key exists in src/i18n.js for ALL THREE languages and that the interpolation vars passed match the {placeholders} in all three translations (a zh template missing {pct} would silently drop data). (3) Verify language-dependent derived data re-computes on language change (deriveViewData memo deps include language; month labels in months[] are built with the language). (4) Check DATE_NAMES tables are coherent (12 months, 7 weekdays, sensible templates). List every miss with file/line.`,
  },
  {
    key: 'data',
    prompt: `${CONTEXT}
DIMENSION: data + sync integrity. Read App.js, src/sync.js, src/storage.js, supabase/schema.sql carefully. Verify the critical invariant holds end-to-end: theme/language/categoryBudgets never reach Supabase (check runOp settings push body), pulled settings can never clobber device-local fields (BOTH pull sites in App.js must merge, and the queued-settings branch of syncWithServer — what does it return and does the merge handle it?), updateSettings re-denomination correctness (rounding per currency decimals, categoryBudgets values, the enqueue condition), saveSettings persisting the new shape, loadSettings upgrading stale caches (categoryBudgets missing / non-object), the props contract between App.js and every screen (each prop a screen destructures is actually passed, and vice versa — e.g. CategoriesScreen months/currentMonthKey, DashboardScreen categoryBudgets, BudgetScreen settings), and signOut translate usage. Also: does anything still reference settings.monthlyBudget semantics that changed? Report real defects only.`,
  },
]

phase('Review')
log('Reviewing 5 dimensions in parallel, verifying findings as each completes')

const verified = await pipeline(
  DIMENSIONS,
  (d) => agent(d.prompt, { label: `review:${d.key}`, phase: 'Review', schema: FINDINGS }),
  (review, d) => {
    const found = review?.findings ?? []
    log(`${d.key}: ${found.length} finding(s)`)
    if (found.length === 0) return []
    return parallel(
      found.map((f) => () =>
        agent(
          `${CONTEXT}
You are an adversarial verifier. A reviewer claims the following defect in the CURRENT working tree. Read the actual file(s) involved (and any related code needed to judge) and try to REFUTE it. It is only real if the code on disk demonstrably has this problem AND it has a real user-visible/data consequence on phone or web. If you cannot reproduce the claim from the code, or the claimed behavior is actually correct/intended, refute it. Default to isReal=false when uncertain.

CLAIM [${f.severity}] ${f.title}
File: ${f.file}${f.line ? ` line ~${f.line}` : ''}
Evidence: ${f.evidence}
Proposed fix: ${f.fix}`,
          { label: `verify:${f.title.slice(0, 40)}`, phase: 'Verify', schema: VERDICT }
        ).then((v) => ({ ...f, dimension: d.key, verdict: v }))
      )
    )
  }
)

const all = verified.filter(Boolean).flat().filter(Boolean)
const confirmed = all.filter((f) => f.verdict?.isReal)
const refuted = all.length - confirmed.length
log(`${confirmed.length} confirmed, ${refuted} refuted`)
return { confirmed, refutedCount: refuted, totalRaw: all.length }
