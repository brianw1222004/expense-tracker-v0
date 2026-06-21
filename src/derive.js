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
export function deriveViewData(expenses, displayCurrency, language, customCategories = [], now = new Date()) {
  const todayKey = dateKey(now.getTime());
  const monthPrefix = todayKey.slice(0, 7); // YYYY-MM

  let monthTotal = 0;
  let todayTotal = 0;
  let monthCount = 0;
  const totalsByCategory = {};
  const byDay = new Map();
  const byMonth = new Map();

  const sorted = [...expenses].sort((a, b) => b.createdAt - a.createdAt);

  for (const expense of sorted) {
    const displayAmount = convert(expense.amount, expense.currency, displayCurrency);
    // Normalize stale stored category ids to their fallback ("Other") here so
    // the breakdown/compare aggregates group them the same way the list does.
    const catId = getCategory(expense.category, customCategories).id;
    const key = dateKey(expense.createdAt);
    const mKey = key.slice(0, 7);

    if (mKey === monthPrefix) {
      monthTotal += displayAmount;
      monthCount += 1;
      totalsByCategory[catId] = (totalsByCategory[catId] ?? 0) + displayAmount;
    }
    if (key === todayKey) todayTotal += displayAmount;

    if (!byDay.has(key)) {
      byDay.set(key, { total: 0, data: [] });
    }
    const day = byDay.get(key);
    day.total += displayAmount;
    day.data.push({ ...expense, displayAmount });

    if (!byMonth.has(mKey)) {
      byMonth.set(mKey, {
        key: mKey,
        total: 0,
        byCategory: {},
      });
    }
    const month = byMonth.get(mKey);
    month.total += displayAmount;
    month.byCategory[catId] = (month.byCategory[catId] ?? 0) + displayAmount;
  }

  const daysInMonth = new Date(now.getFullYear(), now.getMonth() + 1, 0).getDate();
  const dailyTotals = [];
  for (let d = 1; d <= daysInMonth; d++) {
    const dk = `${monthPrefix}-${String(d).padStart(2, '0')}`;
    dailyTotals.push(byDay.has(dk) ? byDay.get(dk).total : 0);
  }

  const prevMonth = new Date(now.getFullYear(), now.getMonth() - 1, 1);
  const prevMonthKey = `${prevMonth.getFullYear()}-${String(prevMonth.getMonth() + 1).padStart(2, '0')}`;
  const lastMonthTotal = byMonth.has(prevMonthKey) ? byMonth.get(prevMonthKey).total : 0;

  return {
    sections: [...byDay.values()],
    months: [...byMonth.values()].sort((a, b) => (a.key < b.key ? 1 : -1)),
    monthTotal,
    lastMonthTotal,
    todayTotal,
    avgPerDay: monthTotal / now.getDate(),
    totalsByCategory,
    monthCount,
    dailyTotals,
  };
}
