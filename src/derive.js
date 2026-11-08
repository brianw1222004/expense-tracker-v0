import { dateKey } from './format';
import { valueSpendingForReporting } from './money';
import { getCategory } from './categories';
import { resolveReportingFx, summarizeReportingFx } from './reportingFx';
import { spendingRowKey } from './spendingActivity';

// One pass over expenses computes everything the UI shows, all converted to the
// display currency: day sections for the list, current-month stats for the
// dashboard, and per-month aggregates for the categories screen. Labels are
// rendered in the app language, so callers must re-run this when it changes
// (`language` is a cache-key dependency, not used directly here). `now` is
// injectable so the date-sensitive math (today/this-month/last-month) is
// deterministic in tests; it defaults to the real clock in the app.
export function deriveViewData(expenses, displayCurrency, language, customCategories = [], now = new Date(), extraSpending = [], fx = null) {
  const todayKey = dateKey(now.getTime());
  const monthPrefix = todayKey.slice(0, 7); // YYYY-MM

  let monthTotal = 0;
  const totalsByCategory = {};
  const byDay = new Map();      // expenses only → legacy `sections`
  const spendByDay = new Map(); // expenses + extra → the dashboard daily chart
  const spendingByDay = new Map(); // presentation rows, valued in the same pass
  const byMonth = new Map();    // expenses + extra → the Categories screen

  // Folds one spending item into every aggregate EXCEPT the day-grouped
  // `sections` (which stay direct-expenses-only). `extraSpending` (your share of
  // split bills) flows through here once, contributing to the aggregates and
  // the unified activity rows without becoming a persisted personal expense.
  const fxDays = new Map();
  const fxMonths = new Map();
  let fxOrder = 0;
  const collect = (buckets, key, value) => {
    if (!buckets.has(key)) buckets.set(key, []);
    buckets.get(key).push(value);
  };
  const add = (a, b) => fx && (a === null || b === null || !Number.isFinite(a + b)) ? null : a + b;
  const prior = (values, key) => fx && Object.prototype.hasOwnProperty.call(values, key) ? values[key] : values[key] ?? 0;

  function accrue(item, sourceType) {
    const rowKey = spendingRowKey(sourceType, item.id);
    let valuation = null;
    if (fx) {
      const expected = resolveReportingFx({ ...item, rowKey }, displayCurrency);
      const supplied = fx.entries?.[rowKey];
      const matches = fx.currency === displayCurrency && supplied?.rowKey === rowKey
        && Object.is(supplied.original?.amount, item.amount) && supplied.original?.currency === item.currency
        && supplied.currency === displayCurrency && supplied.transactionDate === expected.transactionDate
        && ['identity', 'historical', 'estimated', 'unavailable'].includes(supplied.status)
        && (supplied.status === 'unavailable' ? supplied.amount === null : Number.isFinite(supplied.amount));
      valuation = matches ? supplied : { ...expected, amount: null, status: 'unavailable',
        source: null, quote: null, provenance: null, loading: false, stale: false,
        reason: supplied ? 'inconsistent-valuation' : 'missing-valuation' };
    }
    const displayAmount = fx ? valuation.amount : valueSpendingForReporting(item, displayCurrency);
    // Normalize stale stored category ids to their fallback ("Other") here so
    // the breakdown/compare aggregates group them the same way the list does.
    const catId = getCategory(item.category, customCategories).id;
    const key = dateKey(item.createdAt);
    const mKey = key.slice(0, 7);

    if (mKey === monthPrefix) {
      monthTotal = add(monthTotal, displayAmount);
      totalsByCategory[catId] = add(prior(totalsByCategory, catId), displayAmount);
    }
    spendByDay.set(key, add(spendByDay.has(key) ? spendByDay.get(key) : 0, displayAmount));
    if (fx) {
      collect(fxDays, key, valuation);
      collect(fxMonths, mKey, { category: catId, valuation });
    }
    if (!spendingByDay.has(key)) spendingByDay.set(key, []);
    spendingByDay.get(key).push({
      ...item,
      category: catId,
      displayAmount,
      sourceType,
      rowKey,
      ...(fx ? { fx: valuation, fxOrder: fxOrder++ } : {}),
    });

    if (!byMonth.has(mKey)) {
      byMonth.set(mKey, { key: mKey, total: 0, byCategory: {} });
    }
    const month = byMonth.get(mKey);
    month.total = add(month.total, displayAmount);
    month.byCategory[catId] = add(prior(month.byCategory, catId), displayAmount);

    return displayAmount;
  }

  const sorted = [...expenses].sort((a, b) => b.createdAt - a.createdAt);

  for (const expense of sorted) {
    const displayAmount = accrue(expense, 'personal');
    const key = dateKey(expense.createdAt);

    if (!byDay.has(key)) {
      byDay.set(key, { total: 0, data: [] });
    }
    const day = byDay.get(key);
    day.total = add(day.total, displayAmount);
    day.data.push({ ...expense, displayAmount, ...(fx ? { fx: spendingByDay.get(key).at(-1).fx } : {}) });
  }

  // Your share of split bills counts as spending in every aggregate above, but
  // is not a direct expense, so it never enters `byDay`/`sections`.
  for (const item of extraSpending) accrue(item, 'shared');

  const daysInMonth = new Date(now.getFullYear(), now.getMonth() + 1, 0).getDate();
  const dailyTotals = [];
  for (let d = 1; d <= daysInMonth; d++) {
    const dk = `${monthPrefix}-${String(d).padStart(2, '0')}`;
    dailyTotals.push(spendByDay.has(dk) ? spendByDay.get(dk) : 0);
  }

  // Each month entry also carries its own per-day array (indexed day-1, one
  // slot per day of THAT month) so the dashboard chart can render any selected
  // month, not just the current one. spendByDay already spans all months.
  for (const month of byMonth.values()) {
    const [y, m] = month.key.split('-').map(Number);
    const days = new Date(y, m, 0).getDate();
    const daily = [];
    for (let d = 1; d <= days; d++) {
      const dk = `${month.key}-${String(d).padStart(2, '0')}`;
      daily.push(spendByDay.has(dk) ? spendByDay.get(dk) : 0);
    }
    month.dailyTotals = daily;
    if (fx) {
      const rows = fxMonths.get(month.key);
      month.coverage = summarizeReportingFx(rows.map((row) => row.valuation));
      month.categoryCoverage = {};
      for (const catId of Object.keys(month.byCategory)) {
        month.categoryCoverage[catId] = summarizeReportingFx(rows.filter((row) => row.category === catId).map((row) => row.valuation));
      }
      month.dailyCoverage = daily.map((_, index) => summarizeReportingFx(fxDays.get(`${month.key}-${String(index + 1).padStart(2, '0')}`) ?? []));
    }
  }

  if (fx) for (const day of byDay.values()) day.coverage = summarizeReportingFx(day.data.map((item) => item.fx));

  const prevMonth = new Date(now.getFullYear(), now.getMonth() - 1, 1);
  const prevMonthKey = `${prevMonth.getFullYear()}-${String(prevMonth.getMonth() + 1).padStart(2, '0')}`;
  const lastMonthTotal = byMonth.has(prevMonthKey) ? byMonth.get(prevMonthKey).total : 0;

  return {
    sections: [...byDay.values()],
    // Sort only presentation rows: the financial accumulation order above
    // stays unchanged, and totals reuse the existing daily chart valuation.
    spendingSections: [...spendingByDay.entries()]
      .sort(([a], [b]) => (a < b ? 1 : a > b ? -1 : 0))
      .map(([key, data]) => ({
        total: spendByDay.get(key),
        data: data.sort((a, b) => b.createdAt - a.createdAt),
        ...(fx ? { coverage: summarizeReportingFx(fxDays.get(key)) } : {}),
      })),
    months: [...byMonth.values()].sort((a, b) => (a.key < b.key ? 1 : -1)),
    monthTotal,
    lastMonthTotal,
    totalsByCategory,
    dailyTotals,
    hasSpending: byMonth.size > 0,
    ...(fx ? {
      coverage: byMonth.get(monthPrefix)?.coverage ?? summarizeReportingFx([]),
      categoryCoverage: byMonth.get(monthPrefix)?.categoryCoverage ?? {},
      dailyCoverage: dailyTotals.map((_, index) => summarizeReportingFx(fxDays.get(`${monthPrefix}-${String(index + 1).padStart(2, '0')}`) ?? [])),
    } : {}),
  };
}
