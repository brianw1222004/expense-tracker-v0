jest.mock('../i18n', () => jest.requireActual('../i18n.js'));
const { translate } = require('../i18n');
const {
  isReportingAmount, isCompleteReporting, formatReportingAmount, roundReportingAmount,
  budgetPresentation, reportingStatusKeys, reportingChange, mergeReportingCoverage, categoryReporting,
} = require('../reportingPresentation');
const { summarizeReportingFx } = require('../reportingFx');
const t = (key) => translate('en', key);
const row = (status, amount, patch = {}) => ({ status, amount, currency: 'USD', loading: false, stale: false, ...patch });

it.each([null, undefined, NaN, Infinity, -Infinity, '0', '', false])('never formats invalid amount %p as zero', (amount) => {
  expect(isReportingAmount(amount)).toBe(false);
  expect(formatReportingAmount(amount, 'USD', t)).toBe('Unavailable');
  expect(roundReportingAmount(amount, 'USD')).toBeNull();
  expect(budgetPresentation(amount, 100, 'USD').complete).toBe(false);
});

it.each([0, -5, 1.234567])('preserves valid amount %p until the presentation boundary', (amount) => {
  expect(isReportingAmount(amount)).toBe(true);
  expect(isCompleteReporting(amount)).toBe(true);
  expect(formatReportingAmount(amount, 'USD', t)).not.toBe('Unavailable');
});

it('treats empty complete coverage as a genuine zero', () => {
  const coverage = summarizeReportingFx([]);
  expect(formatReportingAmount(0, 'USD', t, { coverage })).toBe('$0.00');
  expect(reportingStatusKeys({ coverage, summary: true })).toEqual([]);
});

it('refuses unsupported currency and incomplete coverage even with a numeric amount', () => {
  expect(formatReportingAmount(1, 'ZZZ', t)).toBe('Unavailable');
  expect(formatReportingAmount(1, 'USD', t, { coverage: { complete: false } })).toBe('Unavailable');
  expect(formatReportingAmount(null, 'TWD', t, { code: true })).toBe('Unavailable TWD');
});

it.each([
  [row('identity', 2), [], []],
  [row('historical', 2), [], ['fx.historical']],
  [row('estimated', 2), ['fx.estimated'], ['fx.estimated']],
  [row('estimated', 2, { loading: true }), ['fx.estimated', 'fx.updating'], ['fx.estimated', 'fx.updating']],
  [row('historical', 2, { stale: true }), ['fx.cached'], ['fx.cached']],
  [row('unavailable', null), ['fx.unavailable'], ['fx.unavailable']],
])('classifies row status without repetitive historical badges: %p', (value, compact, verbose) => {
  expect(reportingStatusKeys({ value })).toEqual(compact);
  expect(reportingStatusKeys({ value, verbose: true })).toEqual(verbose);
});

it('discloses mixed estimated/loading/stale coverage without relabeling cached history as Estimated', () => {
  const coverage = summarizeReportingFx([row('historical', 1, { stale: true }), row('estimated', 2, { loading: true })]);
  expect(reportingStatusKeys({ coverage, summary: true })).toEqual(['fx.includesEstimates', 'fx.updating', 'fx.cached']);
  expect(reportingStatusKeys({ coverage: summarizeReportingFx([row('historical', 1, { stale: true })]), summary: true })).toEqual(['fx.cached']);
});

it('retains estimate/loading disclosures for visible observations even when another observation is unavailable', () => {
  const coverage = summarizeReportingFx([row('estimated', 20, { loading: true }), row('unavailable', null)]);
  expect(reportingStatusKeys({ coverage, summary: true })).toEqual(['fx.incomplete', 'fx.includesEstimates', 'fx.updating']);
  expect(coverage.amount).toBeNull();
});

it('does not fabricate changes for incomplete totals, zero denominators, or overflow', () => {
  for (const amount of [null, undefined, NaN, Infinity]) {
    expect(reportingChange(amount, 10)).toBeNull();
    expect(reportingChange(10, amount)).toBeNull();
  }
  expect(reportingChange(10, 0)).toBeNull();
  expect(reportingChange(10, 5, { complete: false })).toBeNull();
  expect(reportingChange(Number.MAX_VALUE, Number.MIN_VALUE)).toBeNull();
  expect(reportingChange(10, 20)).toEqual({ pct: 50, dir: 'down' });
});

it('merges actual row counts and invalidates only the included category subset', () => {
  const food = summarizeReportingFx([row('historical', 10), row('estimated', 3)]);
  const invalid = summarizeReportingFx([row('unavailable', null)]);
  const month = { byCategory: { food: 13, transport: null }, categoryCoverage: { food, transport: invalid } };
  const before = JSON.stringify(month);
  expect(mergeReportingCoverage([categoryReporting(month, 'food').coverage])).toMatchObject({ total: 2, historical: 1, estimated: 1, amount: 13, complete: true });
  expect(mergeReportingCoverage([food, invalid])).toMatchObject({ total: 3, amount: null, complete: false });
  expect(categoryReporting(month, 'transport').amount).toBeNull();
  expect(categoryReporting(month, 'absent')).toMatchObject({ amount: 0, coverage: { complete: true, total: 0 } });
  expect(categoryReporting({ byCategory: { food: 10 } }, 'food').amount).toBeNull();
  expect(categoryReporting({ byCategory: { food: null }, categoryCoverage: { food } }, 'food')).toMatchObject({ amount: null, coverage: { complete: false, amount: null } });
  expect(JSON.stringify(month)).toBe(before);
});

it('rejects mixed target currencies and numeric overflow in combined coverage', () => {
  expect(mergeReportingCoverage([summarizeReportingFx([row('identity', 1)]), summarizeReportingFx([row('identity', 1, { currency: 'JPY' })])]).amount).toBeNull();
  const huge = summarizeReportingFx([row('identity', Number.MAX_VALUE)]);
  expect(mergeReportingCoverage([huge, huge]).amount).toBeNull();
});

it.each(['en', 'zh', 'es'])('provides all FX disclosure strings in %s', (language) => {
  for (const key of ['historical', 'estimated', 'includesEstimates', 'updating', 'cached', 'unavailable', 'incomplete', 'original', 'yourShare', 'chartUnavailable', 'chartGaps', 'budgetUnavailable', 'categoriesUnavailable', 'loading', 'comparison', 'trend', 'trendComparison']) {
    expect(translate(language, 'fx.' + key)).not.toBe('fx.' + key);
  }
  expect(formatReportingAmount(null, 'USD', (key) => translate(language, key))).toBe(translate(language, 'fx.unavailable'));
});
