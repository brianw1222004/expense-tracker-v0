import { isSupportedCurrency } from './currency';
import { formatFxAmount } from './fx';
import { formatMoney, formatMoneyShort } from './format';
import { summarizeReportingFx } from './reportingFx';

export const isReportingAmount = (value) => typeof value === 'number' && Number.isFinite(value);
export const isCompleteReporting = (amount, coverage) => isReportingAmount(amount)
  && (!coverage || (coverage.complete === true && coverage.unavailable === 0));

// Reporting-only boundary. Global money/obligation formatting stays unchanged.
export function formatReportingAmount(amount, currency, t, { compact = false, code = false, coverage } = {}) {
  if (!isSupportedCurrency(currency)) return t('fx.unavailable');
  if (!isCompleteReporting(amount, coverage)) return code ? `${t('fx.unavailable')} ${currency}` : t('fx.unavailable');
  const text = compact ? formatMoneyShort(amount, currency)
    : `${amount < 0 ? '-' : ''}${formatMoney(amount, currency)}`;
  return code ? `${text} ${currency}` : text;
}

export function roundReportingAmount(amount, currency) {
  const text = formatFxAmount(amount, currency);
  return text === null ? null : Number(text);
}

export function budgetPresentation(spent, budget, currency, coverage) {
  const roundedSpent = roundReportingAmount(spent, currency);
  const roundedBudget = roundReportingAmount(budget, currency);
  const complete = isCompleteReporting(spent, coverage) && roundedSpent !== null
    && roundedBudget !== null && roundedBudget >= 0;
  const unknown = { complete: false, spent: null, budget: roundedBudget, ratio: null, over: null, remaining: null };
  if (!complete) return unknown;
  const over = roundedBudget > 0 && roundedSpent > roundedBudget;
  const remaining = over ? roundedSpent - roundedBudget : roundedBudget - roundedSpent;
  if (!isReportingAmount(remaining)) return unknown;
  return { complete: true, spent: roundedSpent, budget: roundedBudget, over, remaining,
    ratio: roundedBudget > 0 ? Math.max(-Number.MAX_VALUE, Math.min(Number.MAX_VALUE, roundedSpent / roundedBudget)) : 0 };
}

export function reportingStatusKeys({ value, coverage, summary = false, verbose = false } = {}) {
  if (!value && !coverage) return [];
  const unavailable = value ? value.status === 'unavailable' || !isReportingAmount(value.amount)
    : !isCompleteReporting(coverage.amount, coverage);
  if (unavailable && (value || !summary)) return [summary ? 'fx.incomplete' : 'fx.unavailable'];
  const estimated = value ? value.status === 'estimated' : coverage.estimated > 0;
  const loading = value ? value.loading : coverage.loading > 0;
  const stale = value ? value.stale : coverage.stale > 0;
  const historical = value ? value.status === 'historical' : coverage.historical > 0;
  const keys = unavailable ? ['fx.incomplete'] : [];
  if (estimated) keys.push(summary ? 'fx.includesEstimates' : 'fx.estimated');
  if (loading) keys.push('fx.updating');
  if (stale) keys.push('fx.cached');
  else if (!unavailable && historical && !estimated && (summary || verbose)) keys.push('fx.historical');
  return keys;
}

export function reportingChange(current, previous, coverage, previousCoverage) {
  if (!isCompleteReporting(current, coverage) || !isCompleteReporting(previous, previousCoverage) || previous <= 0) return null;
  const delta = current - previous;
  const pct = Math.abs(delta) / previous * 100;
  return isReportingAmount(pct) ? { pct, dir: delta < 0 ? 'down' : delta > 0 ? 'up' : 'flat' } : null;
}

// Merge existing row counts, not one fabricated FX row per category.
export function mergeReportingCoverage(coverages) {
  const result = summarizeReportingFx([]);
  for (const coverage of coverages) {
    for (const key of ['total', 'identity', 'historical', 'estimated', 'unavailable', 'loading', 'stale']) result[key] += coverage[key];
    if (coverage.currency && result.currency && coverage.currency !== result.currency) result.complete = false;
    result.currency ??= coverage.currency;
    if (!isCompleteReporting(coverage.amount, coverage)) result.complete = false;
    if (result.complete) result.amount += coverage.amount;
  }
  if (!isReportingAmount(result.amount)) result.complete = false;
  if (!result.complete) { result.amount = null; result.reason = 'incomplete-subset'; }
  return result;
}

export function categoryReporting(month, id) {
  const present = Object.prototype.hasOwnProperty.call(month.byCategory, id);
  const coverage = month.categoryCoverage?.[id] ?? (present
    ? { ...summarizeReportingFx([]), amount: null, complete: false, reason: 'missing-coverage' }
    : summarizeReportingFx([]));
  const amount = present ? month.byCategory[id] : coverage.total > 0 ? null : 0;
  return isCompleteReporting(amount, coverage) ? { amount, coverage }
    : { amount: null, coverage: { ...coverage, amount: null, complete: false } };
}
