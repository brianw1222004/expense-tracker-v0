// deriveViewData is the central one-pass aggregator (dashboard stats, day
// sections, per-month/category breakdowns, daily totals). It used to live in
// App.js untested; it's now in src/derive.js with an injectable `now` clock.
const { deriveViewData } = require('../derive');
const { convert } = require('../currency');

// Fixed clock: 15 June 2026, midday local. June has 30 days.
const NOW = new Date(2026, 5, 15, 12, 0, 0);
const ts = (y, m, d) => new Date(y, m, d, 12, 0, 0).getTime();
const make = (id, amount, currency, category, createdAt) => ({
  id, amount, currency, note: '', category, createdAt,
});

describe('deriveViewData()', () => {
  it('returns zeroed aggregates for no expenses', () => {
    const v = deriveViewData([], 'USD', 'en', [], NOW);
    expect(v.monthTotal).toBe(0);
    expect(v.todayTotal).toBe(0);
    expect(v.lastMonthTotal).toBe(0);
    expect(v.monthCount).toBe(0);
    expect(v.sections).toEqual([]);
    expect(v.months).toEqual([]);
    expect(v.dailyTotals).toHaveLength(30); // June
    expect(v.dailyTotals.every((n) => n === 0)).toBe(true);
    expect(v.avgPerDay).toBe(0); // 0 / 15
  });

  it('sums the current month in the display currency across mixed currencies', () => {
    const expenses = [
      make('a', 100, 'USD', 'food', ts(2026, 5, 10)),
      make('b', 100, 'EUR', 'food', ts(2026, 5, 12)),
    ];
    const v = deriveViewData(expenses, 'USD', 'en', [], NOW);
    const expected = convert(100, 'USD', 'USD') + convert(100, 'EUR', 'USD');
    expect(v.monthTotal).toBeCloseTo(expected, 6);
    expect(v.monthCount).toBe(2);
    expect(v.totalsByCategory.food).toBeCloseTo(expected, 6);
    expect(v.avgPerDay).toBeCloseTo(expected / 15, 6);
  });

  it('buckets today separately from earlier this month', () => {
    const expenses = [
      make('today', 50, 'USD', 'food', ts(2026, 5, 15)),
      make('earlier', 20, 'USD', 'food', ts(2026, 5, 3)),
    ];
    const v = deriveViewData(expenses, 'USD', 'en', [], NOW);
    expect(v.todayTotal).toBe(50);
    expect(v.monthTotal).toBe(70);
  });

  it('computes the last-month total across a year boundary', () => {
    const jan = new Date(2026, 0, 15, 12, 0, 0); // Jan 2026
    const expenses = [
      make('dec', 80, 'USD', 'food', ts(2025, 11, 20)), // Dec 2025 = previous month
      make('jan', 40, 'USD', 'food', ts(2026, 0, 5)),
    ];
    const v = deriveViewData(expenses, 'USD', 'en', [], jan);
    expect(v.lastMonthTotal).toBe(80);
    expect(v.monthTotal).toBe(40);
  });

  it('dailyTotals has one slot per day of the current month, indexed day-1', () => {
    const v = deriveViewData([make('a', 30, 'USD', 'food', ts(2026, 5, 10))], 'USD', 'en', [], NOW);
    expect(v.dailyTotals).toHaveLength(30);
    expect(v.dailyTotals[9]).toBe(30); // day 10 -> index 9
    expect(v.dailyTotals[0]).toBe(0);
  });

  it('folds stale/unknown category ids into "other"', () => {
    const v = deriveViewData([make('a', 10, 'USD', 'no-such-cat', ts(2026, 5, 9))], 'USD', 'en', [], NOW);
    expect(v.totalsByCategory.other).toBe(10);
    expect(v.totalsByCategory['no-such-cat']).toBeUndefined();
  });

  it('recognizes a custom category id instead of folding it into other', () => {
    const custom = [{ id: 'c_gym', label: 'Gym', emoji: 'dumbbell-01', color: '#fff', custom: true }];
    const v = deriveViewData([make('a', 15, 'USD', 'c_gym', ts(2026, 5, 8))], 'USD', 'en', custom, NOW);
    expect(v.totalsByCategory.c_gym).toBe(15);
    expect(v.totalsByCategory.other).toBeUndefined();
  });

  it('attaches a converted displayAmount to each day-section item', () => {
    const v = deriveViewData([make('a', 100, 'EUR', 'food', ts(2026, 5, 9))], 'USD', 'en', [], NOW);
    expect(v.sections).toHaveLength(1);
    expect(v.sections[0].data[0].displayAmount).toBeCloseTo(convert(100, 'EUR', 'USD'), 6);
  });

  it('sorts months newest-first', () => {
    const expenses = [
      make('a', 10, 'USD', 'food', ts(2026, 3, 5)), // Apr
      make('b', 10, 'USD', 'food', ts(2026, 5, 5)), // Jun
      make('c', 10, 'USD', 'food', ts(2026, 4, 5)), // May
    ];
    const v = deriveViewData(expenses, 'USD', 'en', [], NOW);
    expect(v.months.map((m) => m.key)).toEqual(['2026-06', '2026-05', '2026-04']);
  });
});
