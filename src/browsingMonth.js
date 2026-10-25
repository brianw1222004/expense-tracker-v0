import { dateKey, shiftMonthKey } from './format';

// The main tabs share one session-only month key. Keeping the initialization
// here makes the single source of truth deterministic in tests without
// persisting a navigation preference alongside financial settings.
export function initialBrowsingMonthKey(now = Date.now()) {
  return dateKey(now).slice(0, 7);
}

export function shiftBrowsingMonthKey(monthKey, direction) {
  return shiftMonthKey(monthKey, direction);
}

// Expenses has a day-level browsing filter within the shared month. When the
// month changes, select today for the current month and day one for history.
// This does not affect any transaction-entry or bill-entry date field.
export function defaultBrowsingDate(monthKey, todayKey) {
  return monthKey === todayKey.slice(0, 7) ? todayKey : `${monthKey}-01`;
}

export function monthAggregate(months, monthKey) {
  return months.find((month) => month.key === monthKey) ?? {
    key: monthKey,
    total: 0,
    byCategory: {},
  };
}

// Dashboard needs the selected aggregate plus the immediately preceding
// month. Missing months are represented honestly by zero-filled daily data.
export function dashboardBrowsingMonthView(months, monthKey) {
  const selected = monthAggregate(months, monthKey);
  const previous = months.find((month) => month.key === shiftMonthKey(monthKey, -1));
  const [year, month] = monthKey.split('-').map(Number);
  const daysInMonth = new Date(year, month, 0).getDate();

  return {
    total: selected.total ?? 0,
    prevTotal: previous?.total ?? 0,
    dailyTotals: selected.dailyTotals ?? new Array(daysInMonth).fill(0),
    prevDailyTotals: previous?.dailyTotals,
  };
}
