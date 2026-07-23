import { dateKey } from './format';
import { convert } from './currency';
import { getCategory } from './categories';

// One pass over expenses computes everything the UI shows, all converted to the
// display currency: day sections for the list, current-month stats for the
// dashboard, and per-month aggregates for the categories screen. Labels are
// rendered in the app language, so callers must re-run this when it changes
// (`language` is a cache-key dependency, not used directly here). `now` is
// injectable so the date-sensitive math (today/this-month/last-month) is
// deterministic in tests; it defaults to the real clock in the app.
export function deriveViewData(expenses, displayCurrency, language, customCategories = [], now = new Date(), extraSpending = []) {
  const todayKey = dateKey(now.getTime());
  const monthPrefix = todayKey.slice(0, 7); // YYYY-MM

  let monthTotal = 0;
  const totalsByCategory = {};
  const byDay = new Map();      // expenses only → the Expenses list `sections`
  const spendByDay = new Map(); // expenses + extra → the dashboard daily chart
  const byMonth = new Map();    // expenses + extra → the Categories screen

  // Folds one spending item into every aggregate EXCEPT the day-grouped
  // `sections` (which stay direct-expenses-only). `extraSpending` (your share of
  // split bills) flows through here so it counts toward stats/budgets/breakdowns
  // without ever appearing as an editable row in the Expenses list.
  function accrue(item) {
    const displayAmount = convert(item.amount, item.currency, displayCurrency);
    // Normalize stale stored category ids to their fallback ("Other") here so
    // the breakdown/compare aggregates group them the same way the list does.
    const catId = getCategory(item.category, customCategories).id;
    const key = dateKey(item.createdAt);
    const mKey = key.slice(0, 7);

    if (mKey === monthPrefix) {
      monthTotal += displayAmount;
      totalsByCategory[catId] = (totalsByCategory[catId] ?? 0) + displayAmount;
    }
    spendByDay.set(key, (spendByDay.get(key) ?? 0) + displayAmount);

    if (!byMonth.has(mKey)) {
      byMonth.set(mKey, { key: mKey, total: 0, byCategory: {} });
    }
    const month = byMonth.get(mKey);
    month.total += displayAmount;
    month.byCategory[catId] = (month.byCategory[catId] ?? 0) + displayAmount;

    return displayAmount;
  }

  const sorted = [...expenses].sort((a, b) => b.createdAt - a.createdAt);

  for (const expense of sorted) {
    const displayAmount = accrue(expense);
    const key = dateKey(expense.createdAt);

    if (!byDay.has(key)) {
      byDay.set(key, { total: 0, data: [] });
    }
    const day = byDay.get(key);
    day.total += displayAmount;
    day.data.push({ ...expense, displayAmount });
  }

  // Your share of split bills counts as spending in every aggregate above, but
  // is not a direct expense, so it never enters `byDay`/`sections`.
  for (const item of extraSpending) accrue(item);

  const daysInMonth = new Date(now.getFullYear(), now.getMonth() + 1, 0).getDate();
  const dailyTotals = [];
  for (let d = 1; d <= daysInMonth; d++) {
    const dk = `${monthPrefix}-${String(d).padStart(2, '0')}`;
    dailyTotals.push(spendByDay.get(dk) ?? 0);
  }

  // Each month entry also carries its own per-day array (indexed day-1, one
  // slot per day of THAT month) so the dashboard chart can render any selected
  // month, not just the current one. spendByDay already spans all months.
  for (const month of byMonth.values()) {
    const [y, m] = month.key.split('-').map(Number);
    const days = new Date(y, m, 0).getDate();
    const daily = [];
    for (let d = 1; d <= days; d++) {
      daily.push(spendByDay.get(`${month.key}-${String(d).padStart(2, '0')}`) ?? 0);
    }
    month.dailyTotals = daily;
  }

  const prevMonth = new Date(now.getFullYear(), now.getMonth() - 1, 1);
  const prevMonthKey = `${prevMonth.getFullYear()}-${String(prevMonth.getMonth() + 1).padStart(2, '0')}`;
  const lastMonthTotal = byMonth.has(prevMonthKey) ? byMonth.get(prevMonthKey).total : 0;

  return {
    sections: [...byDay.values()],
    months: [...byMonth.values()].sort((a, b) => (a.key < b.key ? 1 : -1)),
    monthTotal,
    lastMonthTotal,
    totalsByCategory,
    dailyTotals,
    hasSpending: byMonth.size > 0,
  };
}
