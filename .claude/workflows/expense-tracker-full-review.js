export const meta = {
  name: 'expense-tracker-full-review',
  description: 'Full team review: bugs, structure, perf/UX, hardcode, bloat, safety — verified and synthesized',
  phases: [
    { title: 'Recon', detail: 'sunday maps the codebase; saturday runs tests + build check' },
    { title: 'Deep Review', detail: 'six specialist audits in parallel' },
    { title: 'Verify', detail: 'adversarial fact-check of every report' },
    { title: 'Gap Check', detail: 'completeness critic hunts for what the team missed' },
    { title: 'Synthesis', detail: 'angelina delivers the final verdict' },
  ],
}

const ROOT = 'C:/Users/AshAI Intern/Desktop/Project/expense-tracker'

const BRIEF = `CONTEXT: You are part of a full codebase review of the expense-tracker app: React Native (Expo SDK 56, RN 0.85, React 19) + Supabase, plain JavaScript, ~13k lines of source. App.js (1182 lines) owns all state; src/ is presentational components and pure helpers; an offline-first multi-lane sync engine lives in src/sync.js; the split-bills domain in src/splits.js.
Project root: ${ROOT} (a git repo; its parent folder is just a workspace wrapper). Windows machine; the path contains a space — quote it in shell commands.
MANDATORY FIRST STEP: read ${ROOT}/CLAUDE.md in full. It documents the architecture AND deliberate design decisions (storage errors swallowed by design; settings sync partial by design; the income data layer retained but deliberately UI-less/inert; .claude/screen-contracts.md is an UNIMPLEMENTED future plan — never flag current code for not matching it). Do not report a documented design decision as a bug; if you believe a documented decision is itself risky, report it separately labeled "design concern".
RULES: REVIEW ONLY — do not create, modify, or delete any file anywhere (no fixes, no test files, no notes written to disk). Every finding must cite file:line and a concrete failure scenario or consequence. The user optimizes for clean, efficient, stable, safe — and hates puffy, overcomplicated code: prefer recommendations that delete or simplify over ones that add layers, abstractions, or dependencies. Your final message IS your report — plain markdown text, complete and self-contained, no JSON.`

const DIMS = [
  {
    key: 'bugs',
    title: 'Correctness bugs',
    agentType: null,
    prompt: `You are the correctness-bug hunter. Find real bugs — code that produces wrong results, loses data, or crashes.
Priority targets:
- App.js (1182 lines): state transitions, effect dependency lists, stale closures, the changeTab/slideAnim flow, chromeVisible gating, dataUser cache gating on account switch, editingExpense/editingSplit round-trips, catMonthKey month nav, dayStamp midnight rollover, updateSettings budget re-denomination.
- src/sync.js (653 lines): queue coalescing correctness, flush stop-on-first-failure semantics, pull-then-applyPendingOps merge, a foreground-resume sync racing an in-flight mutation, lane isolation (expenses / income / groups / splits), device-local field preservation (group.icon, bill meta) across pulls, last-write-wins hazards.
- src/splits.js: computeShares rounding/reconciliation across currency decimals (JPY has 0 decimals), percentage validation, computeTaxShares tax/tip proportional distribution edges (zero subtotals, huge tax%), settlement records in groupBalances/overallBalance math, yourShareAsExpenses.
- src/derive.js + src/format.js: month boundaries, local-time dateKey vs stored createdAt, aggregation with unknown/deleted category ids, division-by-zero (avgPerDay), empty-month values.
- src/storage.js: legacy normalization, corrupted-cache JSON handling, per-user key scoping.
- Edit/delete flows: expenses, bills, groups, settlements; removeCustomPaymentMethod group reassignment; group deleted while its bills exist.
Boundary values to push: amount 0 / empty string / lone decimal point, unknown currency code, single-member group, empty groups list, month with no expenses, sign-out mid-flush, rapid tab switching mid-animation.
Rank findings CRITICAL (data loss / wrong money math) / HIGH (visible wrong behavior) / MEDIUM / LOW. Cite file:line for every claim.`,
  },
  {
    key: 'architecture',
    title: 'Architecture and structure',
    agentType: 'angelina',
    prompt: `You are auditing structure. For EACH area below deliver a decisive verdict — RESTRUCTURE (with the minimal concrete move) or KEEP AS IS — plus one grounded paragraph of justification:
1. App.js at 1182 lines owning every piece of state, every mutation, and sync orchestration. Still coherent, or past the point where extraction (custom hooks, a reducer, a mutations module) pays for itself? If restructure: name exactly which slice to extract first and why that one.
2. Prop drilling from App.js into screens/components — trace the worst chains; would a context (beyond Theme/I18n) reduce or increase complexity here?
3. Hand-rolled navigation (tab state + kept-mounted absolutely-positioned screens + slide animation) vs react-navigation, at the current screen count (see the Screen budget section of CLAUDE.md).
4. The inert income layer (data + sync retained, UI removed): keep as dormant capability, or delete now and re-add from git history if ever needed? Weigh carrying cost vs revival likelihood.
5. src/sync.js generic multi-lane queue: is the generality earning its keep across the 4 lanes, or over-engineered? Any structural simplification that preserves behavior?
6. The .claude/screen-contracts.md planned refactor: do / partially do / drop, given today's shape.
7. Future features Brian may plausibly want (live FX rates, real multi-user shared groups, recurring expenses, CSV export, notifications): which would strain the current shape, and what MINIMAL prep (if any) is justified TODAY? Default to "none" unless the prep is nearly free.
Prior audit notes may exist in .claude/agent-memory/angelina/ — orientation only; RE-VERIFY against current code (it changed since late June). Bias hard against restructuring that doesn't clearly pay for itself; Brian hates churn and puffiness.`,
  },
  {
    key: 'perf-ux',
    title: 'Performance, UX, store-readiness',
    agentType: 'tuesday',
    prompt: `Audit React Native performance, UX, and store-readiness. Priority targets:
- Re-render blast radius: all state lives in App.js — trace which state changes re-render all four kept-mounted tab screens plus kept-mounted modals, and whether React.memo/useMemo/useCallback actually contain it. Walk the worst interaction concretely (e.g. typing in the add-form amount field: does every keystroke re-render the world?).
- The four kept-mounted tab screens (absolutely positioned, opacity-hidden) plus the kept-mounted AddExpenseModal: do hidden screens keep doing work (SVG charts, list rendering) while invisible?
- deriveViewData memo: dependency list over-invalidation (dayStamp refreshes every minute; language changes), referential stability of its outputs for child memoization.
- SVG hot spots: SpendingChart bezier + gradient fill, two donuts (CategorySummaryCard, BudgetGauge), CardGlow radial bloom, PanResponder hue sliders — per-render path recomputation, missing memo, Animated driver mixing, JS-driven SVG props.
- Lists: ExpenseListScreen (587 lines) and group/bill lists — ScrollView vs FlatList at realistic sizes (a year of daily use, 400+ rows), day-section rebuild cost.
- expo-blur TabBar on Android (known perf cliff), shadow overdraw, the font-loading gate before first paint.
- UX: keyboard handling on both platforms (the code must not rely on onEndEditing for web — verify), touch target sizes, empty states, silent failure surfacing (sync errors invisible?), loading states, accessibility basics (labels on icon-only buttons, contrast across all 3 palettes).
- Store blockers: app.json completeness (icons, splash, bundle ids, permission strings), privacy manifest needs, startup crash risks.
Prior notes in .claude/agent-memory/tuesday/ are orientation only — RE-VERIFY, the code changed since late June. You are read-only: never modify code. Severity-rank; separate "measurable jank" from "theoretical".`,
  },
  {
    key: 'hardcode',
    title: 'Hardcoded values and flexibility',
    agentType: 'friday',
    prompt: `Scan the whole codebase for hardcoded values and inflexibility. For each finding give a verdict — FIX (worth changing, name the minimal change) or KEEP (acceptable/documented) — with one line of why. Targets:
- Magic numbers: animation timings, layout sizes, pagination sizes (8-per-page categories, 14-per-page icons), the ~92% sheet height, chart geometry constants, RewardCheck SHOW_MS/FADE_MS (documented as deliberately tuned — KEEP unless misused), any polling/refresh intervals.
- Literals bypassing the token system: colors not from the theme palettes, spacing/radius/font sizes inlined instead of tokens, shadow objects re-declared instead of cardShadow/panelShadow, TAB_BAR_HEIGHT padding handled inconsistently per screen.
- Multi-site maintenance hazards: TAB_INDEX/TAB_NAMES (App.js) vs TABS (TabBar.js) ordering; i18n key completeness across en/zh/es in src/i18n.js — do an actual key diff (missing keys per language, orphaned keys); category/payment-method ids referenced as raw string literals around the app.
- Strings bypassing i18n: user-visible literals in screens/components not going through t()/translate — placeholders, accessibility labels, Alert/confirm titles, error messages.
- src/currency.js static RATES_TO_USD: verify EVERY conversion routes through convert() (grep for arithmetic on amounts outside it) — the documented single-swap-point design only holds if nothing bypasses it. Also check formatMoney decimal handling covers all 13 currencies.
- supabase/schema.sql vs src/sync.js column mappings vs storage.js shapes: any drift, and what breaks when a column is added?
- DEFAULT_SETTINGS completeness vs every settings key the app reads anywhere.
Report scan results systematically with file:line. REPORT ONLY — no edits.`,
  },
  {
    key: 'lean',
    title: 'Bloat and dead code',
    agentType: null,
    prompt: `Audit for bloat, dead code, and overcomplication — the user wants this codebase LEAN. Verify every suspicion by reading the code and grepping imports/usages before reporting:
- The inert income layer: enumerate exactly what income code remains (storage functions, the sync lane, incomeSources.js, demoData income, i18n keys, tests, App.js state/effects) with line counts per piece. What does keeping it cost? Deletion is angelina's call — you provide the precise inventory.
- Retired-but-maybe-present code: CurrencyDropdown (retired — confirm file gone AND zero references), AddSplitScreen (retired), any screen/component with zero importers, exported helpers with zero callers, createStyles entries unused within their own file (spot-check the 5 biggest files), unused i18n keys (sample ~20), unused theme tokens.
- package.json: is every dependency actually imported? Specifically check expo-haptics, @jest/globals (CLAUDE.md says tests use auto-injected globals without importing), typescript + @types/react + tsconfig.json in a no-TypeScript project (real build-tooling need or leftover?), @expo/ngrok.
- __mocks__/: hand-rolled react/react-native/supabase mocks — size, brittleness, drift risk vs the real APIs.
- .design-sync/previews/*.tsx: TSX previews of JS components — stale relative to the real components? What maintains them?
- Docs staleness: CODE_REVIEW.md, AGENTS.md, SUPABASE_SETUP.md, README.md vs current code; dist/ hygiene (committed? gitignored?).
- Over-abstraction: helpers/components with exactly one caller adding indirection without value; and the inverse — duplicated logic that ESCAPED the shared helpers (verify confirmDestructive, buildCalendarWeeks, popupChromeStyles, CurrencyPill/CurrencyPicker are used everywhere their pattern appears rather than re-implemented).
Deliverable: a deletion/simplification list with estimated line savings per item, plus a "leave alone" list. NEVER recommend adding anything. Report only — no edits.`,
  },
  {
    key: 'safety',
    title: 'Data safety and security',
    agentType: null,
    prompt: `Audit data safety and security posture — real risks only, zero security theater. Targets:
- supabase/schema.sql: verify EVERY table (expenses, income, settings, groups, split_expenses) has RLS enabled with correct per-user policies for select/insert/update/delete scoped to auth.uid(), user_id column defaults, and that the client never sends user_id (verify in sync.js).
- Auth: session persistence in AsyncStorage, token auto-refresh pause on background, sign-out cache handling; deleteAccount — CLAUDE.md admits the Supabase auth record survives (needs a server function): assess the actual residual-data risk, what remains where. Account switching: the dataUser gating in App.js — actively try to construct a sequence where user A's data writes under user B's cache key or renders in user B's session.
- Local data: financial data plaintext in AsyncStorage — state the actual exposure honestly (device-local, OS-sandboxed) and whether anything more is warranted (if not, say so plainly).
- Input handling: cleanAmountInput and every parseFloat/Number on user input — can NaN/Infinity/negative reach stored amounts or shares? Member/group names: length limits, rendering as untrusted strings (any web injection surface via react-native-web?). Are rows pulled from the server trusted blindly (shape validation)?
- sync.js failure modes that corrupt data: partial flush, JSON.parse on a corrupted queue/cache, an op that permanently poisons a lane (stop-at-first-failure — can one bad op wedge a lane forever, and what clears it?), last-write-wins hazards across devices.
- Secrets: .env posture (EXPO_PUBLIC_ anon key is public by design — confirm nothing beyond URL + anon key ships; check app.json; confirm .env is gitignored and never committed in history via git log).
- Run npm audit --omit=dev and summarize real findings only.
Rate each finding by real-world exploitability and impact for a consumer expense app. Report only — no edits.`,
  },
]

phase('Recon')
log('saturday: test suite + web build check · sunday: codebase map')

const saturdayPromise = agent(`${BRIEF}

YOUR TASK (saturday): health check — facts only, no fixes, and write NOTHING to disk (no logs, no report files; your returned text IS the report).
From "${ROOT}" run, in order:
1. npm test — full Jest suite. Capture per-suite pass/fail; paste any failing output verbatim (trimmed of noise).
2. npx expo export --platform web — the build check (catches syntax/import errors). Report success/failure and any warnings that look real (skip progress spam).
Then report: overall verdict up top, per-suite results, failures verbatim, build result, notable warnings, coverage gaps (compare src/__tests__/ against the src/ inventory — which core modules have NO tests?), rough timings. Defer all judgment to angelina — report facts.`, { label: 'saturday:health', phase: 'Recon', agentType: 'saturday' }).catch(() => null)

const map = await agent(`${BRIEF}

YOUR TASK (sunday): produce the orientation map that briefs six specialist reviewers. Read App.js fully; skim every file under src/ (screens, components, helpers) and the root configs. Deliver organized plain text (~800-1400 words):
1. Module inventory — one line each: purpose + anything smelly noticed in passing.
2. State ownership map: every piece of state App.js owns and which screens/components consume it (the prop-drilling picture).
3. Data flow: mutation → enqueue → flush → pull → merge; the four sync lanes; cache-first boot; which device-local fields are preserved across pulls.
4. Doc-vs-code drift: anything CLAUDE.md claims that the code contradicts — look actively, this is gold.
5. Hot spots: files/functions that look overgrown, duplicated patterns, suspicious constructs — where you'd send reviewers first.
6. Test coverage shape: what src/__tests__/ covers vs doesn't.
Facts and pointers only — the specialists do the judging.`, { label: 'sunday:map', phase: 'Recon', agentType: 'sunday' })

const mapText = map || '(sunday map unavailable — orient yourself from CLAUDE.md and the file tree)'

phase('Deep Review')
log('fan-out: bugs · architecture (angelina) · perf/UX (tuesday) · hardcode (friday) · lean · safety')

const results = (await pipeline(
  DIMS,
  (d) => {
    const opts = { label: 'review:' + d.key, phase: 'Deep Review' }
    if (d.agentType) opts.agentType = d.agentType
    return agent(BRIEF + '\n\nCODEBASE MAP from sunday (orientation only — verify everything yourself):\n' + mapText + '\n\nYOUR DIMENSION: ' + d.title + '\n' + d.prompt, opts)
  },
  (report, d) => {
    if (!report) return null
    return agent(BRIEF + '\n\nYou are an adversarial verifier with fresh eyes on the "' + d.title + '" report below. For EVERY distinct finding in it: open the cited code yourself and rule CONFIRMED (state the evidence you personally saw, file:line), REFUTED (cite the code that disproves it), or UNCERTAIN (say exactly what would settle it). Reviewers often misread guard clauses, miss null checks upstream, or flag documented design — check CLAUDE.md before confirming anything it might cover. Also mark findings that are technically true but not worth acting on as CONFIRMED-BUT-MINOR (severity-inflation check). Do NOT add new findings. Return the verdict list as plain text, one verdict per finding, in the report\'s order.\n\n=== REPORT UNDER REVIEW (' + d.key + ') ===\n' + report, { label: 'verify:' + d.key, phase: 'Verify' })
      .then((verdicts) => ({ key: d.key, title: d.title, report: report, verdicts: verdicts || '(verification unavailable — treat findings as unverified)' }))
  }
)).filter(Boolean)

log(results.length + '/6 dimensions reviewed and verified')

phase('Gap Check')
const reviewDigest = results.map((r) => '### ' + r.title + ' (' + r.key + ')\n' + r.report).join('\n\n')
const critic = await agent(BRIEF + '\n\nYou are the completeness critic. Six specialist reports are below. Your job is ONLY what they collectively MISSED:\n1. Run git ls-files in the project root; list every source file no report meaningfully covers, and spot-check the biggest of those yourself.\n2. Probe failure classes nobody covered: first-run experience, cache upgrade paths from older versions, multi-device scenarios, web-vs-native parity, i18n completeness in practice, dist/ staleness, anything in App.js the reports skipped.\n3. Investigate and report NEW findings only, same citation rules (file:line + consequence).\nIf coverage is genuinely complete, say "no material gaps" and stop — do not pad.\n\n=== CODEBASE MAP ===\n' + mapText + '\n\n=== THE SIX REPORTS ===\n' + reviewDigest, { label: 'critic:gaps', phase: 'Gap Check' })

phase('Synthesis')
const health = (await saturdayPromise) || '(saturday health report unavailable)'
log('angelina writing the final verdict')

const verifiedDigest = results.map((r) => '## DIMENSION: ' + r.title + ' (' + r.key + ')\n### Original report\n' + r.report + '\n\n### Adversarial verification verdicts\n' + r.verdicts).join('\n\n---\n\n')

const finalReport = await agent(BRIEF + `

YOU ARE angelina, delivering the FINAL REVIEW REPORT to Brian — the single document he reads. Inputs below: saturday's health report, six specialist reports each with adversarial verification verdicts, and the completeness critic's gap findings.
Synthesis rules:
- Include only findings that survived verification (CONFIRMED). Drop REFUTED findings entirely. Include an UNCERTAIN finding only if stakes are high, explicitly marked "unverified".
- Where a verdict and a report conflict on something that matters, spot-check the code yourself before ruling.
- Kill any recommendation that adds complexity, dependencies, or files without clear payoff — Brian optimizes for clean, efficient, stable, safe and hates puffiness. Deletions and simplifications outrank additions.
- Be decisive: verdicts, not "consider possibly maybe". You may consult .claude/agent-memory/angelina/ for continuity, but current code wins. Do not modify any files.
Structure (markdown, target 1400-2200 words):
1. Executive verdict — overall health in 3-5 sentences; test-suite + build status stated up front (any failure leads the report).
2. Confirmed bugs — severity-ranked: file:line, failure scenario, minimal fix direction.
3. Performance and UX — only items worth doing, each with the expected payoff.
4. Structure — RESTRUCTURE vs KEEP verdict per area (App.js size, prop drilling, hand-rolled navigation, income layer, sync engine, screen-contracts plan), one short paragraph each.
5. Hardcode and flexibility — FIX list vs KEEP list.
6. Bloat to delete — concrete deletions with estimated line savings.
7. Safety — real risks with severity; state plainly what is already fine.
8. Explicitly KEEP AS IS — things a future reviewer might poke at that are deliberate and correct.
9. Action plan — DO NOW (small, high-value, ordered) / DO LATER / REJECTED (recommendations from the reports you are explicitly overruling, one line why each).

=== SATURDAY HEALTH REPORT ===
` + health + `

=== SPECIALIST REPORTS + VERIFICATION ===
` + verifiedDigest + `

=== COMPLETENESS CRITIC (gap findings) ===
` + (critic || '(critic unavailable)'), { label: 'angelina:final', phase: 'Synthesis', agentType: 'angelina' })

return { report: finalReport, health: health }