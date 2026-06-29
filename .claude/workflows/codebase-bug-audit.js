
export const meta = {
  name: 'codebase-bug-audit',
  description: 'Audit the entire expense-tracker codebase for bugs across multiple dimensions',
  phases: [
    { title: 'Read', detail: 'Read all source files in parallel' },
    { title: 'Audit', detail: 'Independent bug hunts across dimensions' },
    { title: 'Verify', detail: 'Adversarially verify each finding' },
  ],
}

const SRC_FILES = [
  'App.js',
  'src/screens/OnboardingScreen.js',
  'src/screens/ExpenseListScreen.js',
  'src/screens/DashboardScreen.js',
  'src/screens/AddExpenseScreen.js',
  'src/screens/CategoriesScreen.js',
  'src/screens/AccountScreen.js',
  'src/screens/BudgetScreen.js',
  'src/screens/AuthScreen.js',
  'src/components/TabBar.js',
  'src/components/AddExpenseModal.js',
  'src/components/RewardCheck.js',
  'src/components/BudgetGauge.js',
  'src/components/SummaryHeader.js',
  'src/components/ExpenseRow.js',
  'src/storage.js',
  'src/sync.js',
  'src/supabase.js',
  'src/currency.js',
  'src/categories.js',
  'src/format.js',
  'src/i18n.js',
  'src/theme.js',
  'src/demoData.js',
]

const ROOT = '/Users/brian/Desktop/Expense-Tracker/expense-tracker-v0'

phase('Read')
const fileContents = await parallel(
  SRC_FILES.map(f => () => agent(
    `Read the file at ${ROOT}/${f} and return its COMPLETE contents verbatim. Do not summarize or truncate.`,
    { label: `read:${f}`, phase: 'Read' }
  ))
)

const codeBundle = SRC_FILES.map((f, i) => `=== ${f} ===\n${fileContents[i]}`).join('\n\n')

const CLAUDE_MD = `Read the file at ${ROOT}/CLAUDE.md and ${ROOT}/expense-tracker-v0/CLAUDE.md and return both verbatim.`
const claudeMd = await agent(CLAUDE_MD, { label: 'read:CLAUDE.md', phase: 'Read' })

const context = `PROJECT CONVENTIONS (CLAUDE.md):\n${claudeMd}\n\nFULL SOURCE:\n${codeBundle}`

phase('Audit')

const DIMENSIONS = [
  {
    key: 'state-sync',
    prompt: `You are auditing a React Native / Expo expense-tracker app for STATE MANAGEMENT and DATA SYNC bugs.

${context}

Focus ONLY on:
1. Stale closures in useCallback/useMemo/useEffect — especially updateSettings which captures settings in its closure
2. Race conditions between sync operations and local state mutations (the settingsVersionRef fix, the onboarding flow)
3. AsyncStorage read/write ordering — could a save effect fire before data is fully loaded?
4. State that should reset but doesn't (e.g. filter state surviving across account switches, selectedDate surviving tab changes)
5. The onboardingDone flag — does withDefaults handle all upgrade paths correctly? What about a user who signed out and back in?
6. Settings merge from server (setSettings(prev => ({...prev, ...result.settings}))) — any fields that should NOT be overwritten?

For each bug found, report:
- file and line (approximate)
- exact code snippet
- why it's wrong
- severity (crash / data-loss / visual-glitch / minor)
- suggested fix (one-liner if possible)

If something looks suspicious but you're not sure, still report it as "uncertain". Do NOT report style nits, missing features, or things that are working correctly.`
  },
  {
    key: 'cross-platform',
    prompt: `You are auditing a React Native / Expo expense-tracker app for CROSS-PLATFORM and RN 0.85 COMPATIBILITY bugs.

${context}

Focus ONLY on:
1. APIs removed or changed in RN 0.85 (StyleSheet.absoluteFillObject removed — use absoluteFill; Animated gotchas)
2. Web vs native divergences: Alert.alert is a no-op on web; onEndEditing never fires on web (use onBlur); window.confirm fallback needed
3. Font usage: fontWeight must NEVER be set alongside a custom fontFamily (Android breaks). Check every StyleSheet for fontWeight.
4. keyboardAppearance must be set on every TextInput
5. useNativeDriver: true only valid for transform/opacity — any SVG prop animation must use false
6. gap property in flexbox — supported since RN 0.71 but verify usage is correct
7. Modal behavior differences between web and native
8. Any use of Platform.OS that might be incomplete or wrong
9. ScrollView/FlatList/SectionList nesting issues on web
10. Calendar grid: does buildCalendarGrid work correctly for all months? Edge cases: Feb in leap year, months starting on Sunday, months starting on Saturday

For each bug found, report file, line, snippet, why it's wrong, severity, and fix.`
  },
  {
    key: 'i18n-data',
    prompt: `You are auditing a React Native / Expo expense-tracker app for I18N, DATA INTEGRITY, and FORMATTING bugs.

${context}

Focus ONLY on:
1. Missing i18n keys — every key used in code (t('xxx') or translate(lang, 'xxx')) must exist in ALL three language tables (en, zh, es). Check exhaustively.
2. Interpolation mismatches — {var} placeholders in templates must match the vars object passed to t()/translate()
3. Date formatting: dateKey(), dayLabel(), monthLabel() — timezone issues? Does dateKey(Date.now()) always produce local-time dates? Could midnight rollover cause off-by-one?
4. Money formatting: formatMoney/formatMoneyShort — edge cases with 0, negative, very large numbers, JPY/TWD (0 decimals)
5. Currency conversion: convert() — division by zero? Unknown currency codes? Does getCurrency fallback work?
6. Category normalization: getCategory() fallback to "Other" — are there places where raw category ids are used without normalization?
7. The calendar's expenseDays computation — does dateKey(section.data[0].createdAt) always match the section's actual day? Could sorting/grouping create mismatches?
8. Demo data: does buildDemoExpenses() produce valid data that works with all the display logic?

For each bug found, report file, line, snippet, why it's wrong, severity, and fix.`
  },
  {
    key: 'navigation-lifecycle',
    prompt: `You are auditing a React Native / Expo expense-tracker app for NAVIGATION, LIFECYCLE, and UI LOGIC bugs.

${context}

Focus ONLY on:
1. The hand-rolled tab navigation: slideAnim/slideDirRef/prevTab — any animation bugs? Does the transition work correctly when rapidly switching tabs?
2. The onboarding early return — does it sit after ALL hook calls? Adding an early return before a hook would crash. Verify hook ordering.
3. AddExpenseModal kept-mounted behavior — could stale data leak between opens? Does the half-typed expense survive dismissal as intended?
4. RewardCheck trigger via rewardNonce — any edge cases?
5. The calendar screen: selectedDate state — what happens when a new expense is added for today? Does the calendar dot update? Does the expense list update?
6. Tab change keyboard dismiss — does Keyboard.dismiss() work on web?
7. BudgetScreen Modal: could settings changes from the budget editor conflict with the onboarding flow?
8. Auth flow: what happens if Supabase returns a session but the user hasn't completed email confirmation? Does the app handle partial auth states?
9. AppState listener cleanup — are all subscriptions properly removed?
10. The loaded gate (dataUser === userId) — what happens during the brief window when loaded is false after sign-in? Could the user interact with stale UI?

For each bug found, report file, line, snippet, why it's wrong, severity, and fix.`
  },
]

const BUG_SCHEMA = {
  type: 'object',
  properties: {
    bugs: {
      type: 'array',
      items: {
        type: 'object',
        properties: {
          file: { type: 'string' },
          line: { type: 'string' },
          snippet: { type: 'string' },
          description: { type: 'string' },
          severity: { type: 'string', enum: ['crash', 'data-loss', 'visual-glitch', 'minor'] },
          fix: { type: 'string' },
          confidence: { type: 'string', enum: ['certain', 'likely', 'uncertain'] },
        },
        required: ['file', 'description', 'severity', 'confidence'],
      },
    },
  },
  required: ['bugs'],
}

const auditResults = await parallel(
  DIMENSIONS.map(d => () => agent(d.prompt, {
    label: `audit:${d.key}`,
    phase: 'Audit',
    schema: BUG_SCHEMA,
  }))
)

const allBugs = auditResults
  .filter(Boolean)
  .flatMap((r, i) => (r.bugs || []).map(b => ({ ...b, dimension: DIMENSIONS[i].key })))
  .filter(b => b.confidence !== 'uncertain' || b.severity === 'crash' || b.severity === 'data-loss')

log(`Found ${allBugs.length} bugs to verify`)

if (allBugs.length === 0) {
  return { verified: [], summary: 'No bugs found across all dimensions.' }
}

phase('Verify')

const VERDICT_SCHEMA = {
  type: 'object',
  properties: {
    isReal: { type: 'boolean' },
    reasoning: { type: 'string' },
    revisedSeverity: { type: 'string', enum: ['crash', 'data-loss', 'visual-glitch', 'minor', 'not-a-bug'] },
    revisedFix: { type: 'string' },
  },
  required: ['isReal', 'reasoning', 'revisedSeverity'],
}

const verified = await pipeline(
  allBugs,
  (bug) => agent(
    `You are an adversarial code reviewer. Another reviewer claims there is a bug in this React Native app. Your job is to determine if the bug is REAL or a FALSE POSITIVE. Default to skepticism — if the code is actually correct, say so.

CLAIMED BUG:
- File: ${bug.file}
- Line: ${bug.line || 'unknown'}
- Snippet: ${bug.snippet || 'not provided'}
- Description: ${bug.description}
- Severity: ${bug.severity}
- Suggested fix: ${bug.fix || 'not provided'}
- Dimension: ${bug.dimension}

FULL SOURCE CODE AND CONVENTIONS:
${context}

Instructions:
1. Find the exact code in question
2. Trace through the logic carefully — does the claimed bug actually trigger?
3. Check if the codebase already handles the case (guard clauses, defaults, etc.)
4. Consider if the "fix" could introduce new bugs
5. Be precise: "this could theoretically happen" is not the same as "this will happen in practice"

Set isReal to true ONLY if you are confident the bug exists and affects users. Set revisedSeverity to "not-a-bug" for false positives.`,
    { label: `verify:${bug.file}`, phase: 'Verify', schema: VERDICT_SCHEMA }
  )
)

const confirmedBugs = allBugs
  .map((bug, i) => ({ ...bug, verdict: verified[i] }))
  .filter(b => b.verdict && b.verdict.isReal && b.verdict.revisedSeverity !== 'not-a-bug')

return {
  totalFound: allBugs.length,
  confirmed: confirmedBugs.length,
  bugs: confirmedBugs.map(b => ({
    file: b.file,
    line: b.line,
    description: b.description,
    severity: b.verdict.revisedSeverity,
    fix: b.verdict.revisedFix || b.fix,
    reasoning: b.verdict.reasoning,
    dimension: b.dimension,
  })),
}
