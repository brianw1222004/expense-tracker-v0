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
    expect(v.lastMonthTotal).toBe(0);
    expect(v.sections).toEqual([]);
    expect(v.months).toEqual([]);
    expect(v.dailyTotals).toHaveLength(30); // June
    expect(v.dailyTotals.every((n) => n === 0)).toBe(true);
    expect(v.hasSpending).toBe(false);
  });

  it('sums the current month in the display currency across mixed currencies', () => {
    const expenses = [
      make('a', 100, 'USD', 'food', ts(2026, 5, 10)),
      make('b', 100, 'EUR', 'food', ts(2026, 5, 12)),
    ];
    const v = deriveViewData(expenses, 'USD', 'en', [], NOW);
    const expected = convert(100, 'USD', 'USD') + convert(100, 'EUR', 'USD');
    expect(v.monthTotal).toBeCloseTo(expected, 6);
    expect(v.totalsByCategory.food).toBeCloseTo(expected, 6);
    expect(v.hasSpending).toBe(true);
  });

  it('buckets each day separately in dailyTotals', () => {
    const expenses = [
      make('today', 50, 'USD', 'food', ts(2026, 5, 15)),
      make('earlier', 20, 'USD', 'food', ts(2026, 5, 3)),
    ];
    const v = deriveViewData(expenses, 'USD', 'en', [], NOW);
    expect(v.dailyTotals[14]).toBe(50); // today = June 15, indexed day-1
    expect(v.dailyTotals[2]).toBe(20); // earlier = June 3
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

  it('each month entry carries dailyTotals sized to that month, indexed day-1', () => {
    const expenses = [
      make('a', 25, 'USD', 'food', ts(2026, 4, 20)), // 20 May (31 days)
      make('b', 40, 'USD', 'food', ts(2026, 5, 3)),  // 3 Jun (30 days)
    ];
    const v = deriveViewData(expenses, 'USD', 'en', [], NOW);
    const may = v.months.find((m) => m.key === '2026-05');
    const jun = v.months.find((m) => m.key === '2026-06');
    expect(may.dailyTotals).toHaveLength(31);
    expect(may.dailyTotals[19]).toBe(25); // day 20 -> index 19
    expect(jun.dailyTotals).toHaveLength(30);
    expect(jun.dailyTotals[2]).toBe(40); // day 3 -> index 2
    // the current month's entry matches the top-level series
    expect(jun.dailyTotals).toEqual(v.dailyTotals);
  });
});

// ---------------------------------------------------------------------------
// extraSpending (6th arg) — split-bill shares that count as spending but must
// NOT appear in the Expenses list sections.
// ---------------------------------------------------------------------------

describe('deriveViewData() extraSpending arg', () => {
  // A synthetic split-share item (what yourShareAsExpenses() produces).
  const splitItem = (id, amount, currency, category, createdAt) => ({
    id: 'split:' + id,
    amount,
    currency,
    category,
    note: '',
    createdAt,
    splitId: id,
    groupId: 'g1',
  });

  it('extraSpending folds into monthTotal', () => {
    const extra = [splitItem('b1', 40, 'USD', 'food', ts(2026, 5, 10))];
    const v = deriveViewData([], 'USD', 'en', [], NOW, extra);
    expect(v.monthTotal).toBeCloseTo(40, 5);
    expect(v.hasSpending).toBe(true);
  });

  it('extraSpending folds into totalsByCategory', () => {
    const extra = [splitItem('b1', 25, 'USD', 'transport', ts(2026, 5, 10))];
    const v = deriveViewData([], 'USD', 'en', [], NOW, extra);
    expect(v.totalsByCategory.transport).toBeCloseTo(25, 5);
  });

  it('extraSpending folds into dailyTotals', () => {
    const extra = [splitItem('b1', 55, 'USD', 'food', ts(2026, 5, 8))];
    const v = deriveViewData([], 'USD', 'en', [], NOW, extra);
    expect(v.dailyTotals[7]).toBeCloseTo(55, 5); // day 8 -> index 7
  });

  it('extraSpending does NOT appear in sections', () => {
    const extra = [splitItem('b1', 40, 'USD', 'food', ts(2026, 5, 10))];
    const v = deriveViewData([], 'USD', 'en', [], NOW, extra);
    // sections should be empty (no direct expenses)
    expect(v.sections).toHaveLength(0);
  });

  it('direct expenses still appear in sections alongside extraSpending', () => {
    const expenses = [make('e1', 30, 'USD', 'food', ts(2026, 5, 10))];
    const extra = [splitItem('b1', 40, 'USD', 'food', ts(2026, 5, 10))];
    const v = deriveViewData(expenses, 'USD', 'en', [], NOW, extra);
    // sections has the direct expense
    expect(v.sections).toHaveLength(1);
    expect(v.sections[0].data[0].id).toBe('e1');
    // But monthTotal includes both
    expect(v.monthTotal).toBeCloseTo(70, 5);
  });

  it('extraSpending outside current month does not affect monthTotal', () => {
    // Item is in May (previous month)
    const extra = [splitItem('b1', 50, 'USD', 'food', ts(2026, 4, 10))];
    const v = deriveViewData([], 'USD', 'en', [], NOW, extra);
    expect(v.monthTotal).toBe(0);
  });

  it('extraSpending outside current month still folds into months array', () => {
    // May split item should create a "2026-05" month entry
    const extra = [splitItem('b1', 50, 'USD', 'food', ts(2026, 4, 10))];
    const v = deriveViewData([], 'USD', 'en', [], NOW, extra);
    const mayMonth = v.months.find((m) => m.key === '2026-05');
    expect(mayMonth).toBeDefined();
    expect(mayMonth.total).toBeCloseTo(50, 5);
  });

  it('extraSpending converts currency to displayCurrency', () => {
    const extra = [splitItem('b1', 100, 'EUR', 'food', ts(2026, 5, 10))];
    const v = deriveViewData([], 'USD', 'en', [], NOW, extra);
    const expected = convert(100, 'EUR', 'USD');
    expect(v.monthTotal).toBeCloseTo(expected, 5);
  });

  it('empty extraSpending (default) gives identical result to no 6th arg', () => {
    const expenses = [make('e1', 30, 'USD', 'food', ts(2026, 5, 10))];
    const v1 = deriveViewData(expenses, 'USD', 'en', [], NOW);
    const v2 = deriveViewData(expenses, 'USD', 'en', [], NOW, []);
    expect(v1.monthTotal).toBeCloseTo(v2.monthTotal, 10);
    expect(v1.sections).toHaveLength(v2.sections.length);
  });

  it('extraSpending for today folds into dailyTotals', () => {
    const extra = [splitItem('b1', 35, 'USD', 'food', ts(2026, 5, 15))]; // today = June 15
    const v = deriveViewData([], 'USD', 'en', [], NOW, extra);
    expect(v.dailyTotals[14]).toBeCloseTo(35, 5); // June 15, indexed day-1
  });
});
