// deriveViewData is the central one-pass aggregator (dashboard stats, day
// sections, per-month/category breakdowns, daily totals). It used to live in
// App.js untested; it's now in src/derive.js with an injectable `now` clock.
const { deriveViewData } = require('../derive');
const { convert } = require('../currency');
const { YOU, deriveSharedSpendingActivity } = require('../money');

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

describe('Money Domain spending integration', () => {
  const sharedBill = (overrides = {}) => ({
    id: 'shared', groupId: 'g1', amount: 184, currency: 'EUR',
    category: 'food', description: 'Shared dinner', paidBy: YOU,
    shares: { [YOU]: 92, alex: 92 }, createdAt: ts(2026, 5, 10),
    ...overrides,
  });

  it('combines personal spending and your consumed share while sections keep only personal rows', () => {
    const personal = [
      make('older', 20, 'USD', 'food', ts(2026, 5, 9)),
      make('newer', 92, 'EUR', 'transport', ts(2026, 5, 10)),
    ];
    const activity = deriveSharedSpendingActivity([sharedBill()]);
    const view = deriveViewData(personal, 'USD', 'en', [], NOW, activity);
    expect(view.monthTotal).toBe(220);
    expect(view.totalsByCategory).toEqual({ food: 120, transport: 100 });
    expect(view.dailyTotals[8]).toBe(20);
    expect(view.dailyTotals[9]).toBe(200);
    expect(view.months[0]).toMatchObject({
      key: '2026-06', total: 220, byCategory: { food: 120, transport: 100 },
    });
    expect(view.months[0].dailyTotals).toEqual(view.dailyTotals);
    expect(view.sections.map(({ total, data }) => ({ total, ids: data.map(({ id }) => id) }))).toEqual([
      { total: 100, ids: ['newer'] }, { total: 20, ids: ['older'] },
    ]);
    expect(view.sections[0].data[0].displayAmount).toBe(100);
  });

  it('keeps fractional static reporting values without rounding to reporting-currency precision', () => {
    const personal = [make('personal', 1, 'USD', 'food', ts(2026, 5, 10))];
    const activity = deriveSharedSpendingActivity([
      sharedBill({ currency: 'USD', shares: { [YOU]: 1, alex: 1 } }),
    ]);
    const view = deriveViewData(personal, 'JPY', 'en', [], NOW, activity);
    expect(view.sections[0].total).toBe(157.5);
    expect(view.sections[0].data[0].displayAmount).toBe(157.5);
    expect(view.monthTotal).toBe(315);
    expect(view.totalsByCategory.food).toBe(315);
    expect(view.dailyTotals[9]).toBe(315);
  });

  it('keeps settlement payments out of spending across months and payer directions', () => {
    const personal = [make('personal', 25, 'USD', 'food', ts(2026, 5, 10))];
    const records = [
      sharedBill(),
      sharedBill({ id: 'may', paidBy: 'alex', createdAt: ts(2026, 4, 20) }),
      { id: 'received', groupId: 'g1', settlement: true, from: 'alex', to: YOU,
        amount: 500, currency: 'USD', shares: { [YOU]: 500 }, createdAt: ts(2026, 5, 10) },
      { id: 'paid', groupId: 'g1', settlement: true, from: YOU, to: 'alex',
        amount: 300, currency: 'USD', createdAt: ts(2026, 4, 20) },
    ];
    const view = deriveViewData(personal, 'USD', 'en', [], NOW, deriveSharedSpendingActivity(records));
    expect(view.monthTotal).toBe(125);
    expect(view.lastMonthTotal).toBe(100);
    expect(view.totalsByCategory).toEqual({ food: 125 });
    expect(view.months.map(({ key, total }) => ({ key, total }))).toEqual([
      { key: '2026-06', total: 125 }, { key: '2026-05', total: 100 },
    ]);
    expect(view.dailyTotals[9]).toBe(125);
    expect(view.months[1].dailyTotals[19]).toBe(100);
    expect(view.sections).toHaveLength(1);
    expect(view.sections[0].data.map(({ id }) => id)).toEqual(['personal']);
    expect(view.sections[0].total).toBe(25);
  });

  it('normalizes missing and unknown shared categories to other only during reporting', () => {
    const activity = deriveSharedSpendingActivity([
      sharedBill({ id: 'missing', category: undefined }),
      sharedBill({ id: 'unknown', category: 'retired-category' }),
    ]);
    expect(activity.map(({ category }) => category)).toEqual(['other', 'retired-category']);
    const view = deriveViewData([], 'USD', 'en', [], NOW, activity);
    expect(view.totalsByCategory).toEqual({ other: 200 });
    expect(view.monthTotal).toBe(200);
    expect(view.sections).toEqual([]);
    expect(view.hasSpending).toBe(true);
  });
});

describe('unified spendingSections', () => {
  const shared = (overrides = {}) => ({
    id: 'bill', groupId: 'g1', description: 'Dinner', category: 'food',
    amount: 80, currency: 'USD', paidBy: YOU, shares: { [YOU]: 30, alex: 50 },
    createdAt: ts(2026, 5, 10), ...overrides,
  });
  const project = (personal = [], bills = [], currency = 'USD', categories = []) =>
    deriveViewData(personal, currency, 'en', categories, NOW, deriveSharedSpendingActivity(bills));

  it('adds explicit personal source metadata without changing direct-only sections', () => {
    const expense = make('personal', 25, 'USD', 'food', ts(2026, 5, 10));
    const view = project([expense]);
    expect(view.sections).toEqual([{ total: 25, data: [{ ...expense, displayAmount: 25 }] }]);
    expect(view.spendingSections).toEqual([{
      total: 25, data: [{ ...expense, displayAmount: 25, sourceType: 'personal', rowKey: '["personal","personal"]' }],
    }]);
    expect(view.hasSpending).toBe(true);
    expect(view.monthTotal).toBe(25);
  });

  it.each([YOU, 'alex'])('shows shared-only spending when %s paid without adding a personal expense', (paidBy) => {
    const view = project([], [shared({ paidBy })]);
    expect(view.sections).toEqual([]);
    expect(view.spendingSections).toEqual([{
      total: 30,
      data: [{ id: 'split:bill', splitId: 'bill', groupId: 'g1', amount: 30, currency: 'USD',
        category: 'food', note: 'Dinner', createdAt: ts(2026, 5, 10), displayAmount: 30,
        sourceType: 'shared', rowKey: '["shared","split:bill"]' }],
    }]);
    expect(view.hasSpending).toBe(true);
    expect(view.monthTotal).toBe(30);
    expect(view.dailyTotals[9]).toBe(30);
  });

  it('sorts a mixed day newest-first while valuing every personal amount and share exactly once', () => {
    const morning = ts(2026, 5, 10);
    const personal = [
      make('early', 10, 'USD', 'transport', morning),
      make('middle', 20, 'USD', 'food', morning + 100),
    ];
    const view = project(personal, [shared({ createdAt: morning + 200 })]);
    expect(view.spendingSections[0].data.map(({ id }) => id)).toEqual(['split:bill', 'middle', 'early']);
    expect(view.spendingSections[0].total).toBe(60);
    expect(view.sections[0].total).toBe(30);
    expect(view.monthTotal).toBe(60);
    expect(view.totalsByCategory).toEqual({ food: 50, transport: 10 });
    expect(view.dailyTotals[9]).toBe(60);
    expect(view.months[0].total).toBe(60);
    expect(view.months[0].byCategory).toEqual({ food: 50, transport: 10 });
  });

  it('keeps mixed-source days and months newest-first with matching monthly daily series', () => {
    const view = project([
      make('may-personal', 20, 'USD', 'food', ts(2026, 4, 20)),
      make('june-personal', 40, 'USD', 'food', ts(2026, 5, 9)),
    ], [
      shared({ id: 'may', createdAt: ts(2026, 4, 20) }),
      shared({ id: 'june', createdAt: ts(2026, 5, 10) }),
    ]);
    expect(view.spendingSections.map(({ total, data }) => ({ total, ids: data.map(({ id }) => id) }))).toEqual([
      { total: 30, ids: ['split:june'] }, { total: 40, ids: ['june-personal'] },
      { total: 50, ids: ['may-personal', 'split:may'] },
    ]);
    expect(view.monthTotal).toBe(70);
    expect(view.lastMonthTotal).toBe(50);
    expect(view.dailyTotals[8]).toBe(40);
    expect(view.dailyTotals[9]).toBe(30);
    expect(view.months[1].dailyTotals[19]).toBe(50);
  });

  it('keeps a deterministic source order for equal timestamps', () => {
    const view = project([
      make('p-first', 1, 'USD', 'food', ts(2026, 5, 10)),
      make('p-second', 2, 'USD', 'food', ts(2026, 5, 10)),
    ], [shared({ id: 's-first' }), shared({ id: 's-second' })]);
    expect(view.spendingSections[0].data.map(({ id }) => id)).toEqual([
      'p-first', 'p-second', 'split:s-first', 'split:s-second',
    ]);
  });

  it('uses separate stable keys when a personal id collides with a synthetic id', () => {
    const personal = [make('split:bill', 5, 'USD', 'food', ts(2026, 5, 10))];
    const view = project(personal, [shared()]);
    const keys = view.spendingSections[0].data.map(({ rowKey }) => rowKey);
    expect(keys).toEqual(['["personal","split:bill"]', '["shared","split:bill"]']);
    expect(new Set(keys).size).toBe(2);
    expect(project(personal, [shared()]).spendingSections[0].data.map(({ rowKey }) => rowKey)).toEqual(keys);
  });

  it('normalizes stale/missing categories for activity rows while preserving legacy sections', () => {
    const custom = [{ id: 'c_trip', label: 'Trip', color: '#123456', custom: true }];
    const personal = [make('personal', 10, 'USD', 'retired', ts(2026, 5, 10))];
    const view = project(personal, [
      shared({ id: 'missing', category: undefined }),
      shared({ id: 'custom', category: 'c_trip' }),
    ], 'USD', custom);
    expect(view.spendingSections[0].data.map(({ category }) => category)).toEqual(['other', 'other', 'c_trip']);
    expect(view.totalsByCategory).toEqual({ other: 40, c_trip: 30 });
    expect(view.sections[0].data[0].category).toBe('retired');
    expect(personal[0].category).toBe('retired');
  });

  it('preserves fractional reporting amounts even for zero-decimal display currencies', () => {
    const view = project([make('personal', 1, 'USD', 'food', ts(2026, 5, 10))], [
      shared({ shares: { [YOU]: 1, alex: 1 } }),
    ], 'JPY');
    expect(view.spendingSections[0].data.map(({ displayAmount }) => displayAmount)).toEqual([157.5, 157.5]);
    expect(view.spendingSections[0].total).toBe(315);
    expect(view.monthTotal).toBe(315);
  });

  it('reuses the financial accumulation order even when display sorting changes floating-point sums', () => {
    const morning = ts(2026, 5, 10);
    const view = project([make('large', 1e16, 'USD', 'food', morning)], [
      shared({ id: 'credit', shares: { [YOU]: 1 }, createdAt: morning + 200 }),
      shared({ id: 'small', shares: { [YOU]: 1 }, createdAt: morning + 100 }),
    ]);
    expect(view.spendingSections[0].data.map(({ id }) => id)).toEqual(['split:credit', 'split:small', 'large']);
    // Full-precision financial accrual remains personal first, then source shares.
    expect(view.spendingSections[0].total).toBe(1e16);
    expect(view.dailyTotals[9]).toBe(1e16);
    expect(view.monthTotal).toBe(1e16);
  });

  it('excludes settlements, absent/zero shares, and other-member-only bills from all spending views', () => {
    const view = project([], [
      shared({ id: 'settlement', settlement: true, from: 'alex', to: YOU }),
      shared({ id: 'zero', shares: { [YOU]: 0, alex: 80 } }),
      shared({ id: 'others', paidBy: 'alex', shares: { alex: 40, brian: 40 } }),
      shared({ id: 'missing', shares: undefined }),
    ]);
    expect(view.spendingSections).toEqual([]);
    expect(view.sections).toEqual([]);
    expect(view.monthTotal).toBe(0);
    expect(view.months).toEqual([]);
    expect(view.hasSpending).toBe(false);
    expect(view.dailyTotals.every((total) => total === 0)).toBe(true);
  });

  it('updates activity amounts and descriptions after a source bill edit without duplicating it', () => {
    const original = shared();
    const before = project([], [original]);
    const edited = project([], [{ ...original, description: 'Revised dinner', shares: { [YOU]: 12, alex: 68 } }]);
    expect(before.monthTotal).toBe(30);
    expect(edited.monthTotal).toBe(12);
    expect(edited.spendingSections[0].data).toHaveLength(1);
    expect(edited.spendingSections[0].data[0]).toMatchObject({
      id: 'split:bill', splitId: 'bill', amount: 12, displayAmount: 12, note: 'Revised dinner',
    });
    expect(edited.spendingSections[0].data[0].rowKey).toBe(before.spendingSections[0].data[0].rowKey);
  });

  it('removes deleted shared activity and leaves personal rows and amounts intact', () => {
    const personal = [make('personal', 7, 'USD', 'food', ts(2026, 5, 10))];
    expect(project(personal, [shared()]).monthTotal).toBe(37);
    const after = project(personal, []);
    expect(after.spendingSections[0].data.map(({ id }) => id)).toEqual(['personal']);
    expect(after.monthTotal).toBe(7);
    expect(after.spendingSections[0].total).toBe(7);
  });

  it('keeps source identifiers and per-share valuation across groups and currencies', () => {
    const view = project([], [
      shared({ id: 'euro', groupId: 'g-eur', currency: 'EUR', shares: { [YOU]: 92, alex: 92 } }),
      shared({ id: 'yen', groupId: 'g-jpy', currency: 'JPY', shares: { [YOU]: 1575, brian: 1575 } }),
    ]);
    expect(view.spendingSections[0].data.map(({ splitId, groupId, displayAmount }) => ({ splitId, groupId, displayAmount }))).toEqual([
      { splitId: 'euro', groupId: 'g-eur', displayAmount: 100 },
      { splitId: 'yen', groupId: 'g-jpy', displayAmount: 10 },
    ]);
    expect(view.spendingSections[0].total).toBe(110);
    expect(view.monthTotal).toBe(110);
    expect(view.dailyTotals[9]).toBe(110);
  });

  it('does not mutate frozen sources or attach presentation metadata to persisted records', () => {
    const personal = Object.freeze([Object.freeze(make('p', 10, 'USD', 'food', ts(2026, 5, 10)))]);
    const record = Object.freeze(shared({ shares: Object.freeze({ [YOU]: 30, alex: 50 }) }));
    const records = Object.freeze([record]);
    const activity = Object.freeze(deriveSharedSpendingActivity(records).map(Object.freeze));
    const before = JSON.stringify({ personal, records, activity });
    const view = deriveViewData(personal, 'USD', 'en', [], NOW, activity);
    view.spendingSections[0].data[0].amount = 999;
    expect(JSON.stringify({ personal, records, activity })).toBe(before);
    expect(view.sections[0].data[0].amount).toBe(10);
    expect(view.monthTotal).toBe(40);
  });
});
