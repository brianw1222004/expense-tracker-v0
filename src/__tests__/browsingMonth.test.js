const {
  dashboardBrowsingMonthView,
  defaultBrowsingDate,
  initialBrowsingMonthKey,
  monthAggregate,
  shiftBrowsingMonthKey,
} = require('../browsingMonth');

describe('shared browsing month helpers', () => {
  const july = {
    key: '2026-07',
    total: 70,
    byCategory: { food: 40, transport: 30 },
    dailyTotals: [10, 60],
  };
  const august = {
    key: '2026-08',
    total: 125,
    byCategory: { food: 25, shopping: 100 },
    dailyTotals: [25, 0, 100],
  };
  const months = [august, july];

  it('initializes once from the current local calendar month', () => {
    expect(initialBrowsingMonthKey(new Date(2026, 8, 9, 12).getTime())).toBe('2026-09');
  });

  it('shifts the same month key across month and year boundaries', () => {
    expect(shiftBrowsingMonthKey('2026-08', -1)).toBe('2026-07');
    expect(shiftBrowsingMonthKey('2026-01', -1)).toBe('2025-12');
    expect(shiftBrowsingMonthKey('2025-12', 1)).toBe('2026-01');
  });

  it('keeps the Expenses day filter inside the shared browsing month', () => {
    expect(defaultBrowsingDate('2026-09', '2026-09-09')).toBe('2026-09-09');
    expect(defaultBrowsingDate('2026-08', '2026-09-09')).toBe('2026-08-01');
  });

  it('returns the selected aggregate used by Insight category calculations', () => {
    expect(monthAggregate(months, '2026-07')).toBe(july);
    expect(monthAggregate(months, '2026-08')).toBe(august);
    expect(monthAggregate(months, '2026-06')).toEqual({
      key: '2026-06',
      total: 0,
      byCategory: {},
    });
  });

  it('recalculates every Dashboard value when the shared month changes', () => {
    expect(dashboardBrowsingMonthView(months, '2026-07')).toEqual({
      total: 70,
      prevTotal: 0,
      dailyTotals: [10, 60],
      prevDailyTotals: undefined,
    });
    expect(dashboardBrowsingMonthView(months, '2026-08')).toEqual({
      total: 125,
      prevTotal: 70,
      dailyTotals: [25, 0, 100],
      prevDailyTotals: [10, 60],
    });
  });

  it('zero-fills a missing selected month with its correct number of days', () => {
    const view = dashboardBrowsingMonthView(months, '2024-02');
    expect(view.total).toBe(0);
    expect(view.dailyTotals).toHaveLength(29);
    expect(view.dailyTotals.every((value) => value === 0)).toBe(true);
  });
});
