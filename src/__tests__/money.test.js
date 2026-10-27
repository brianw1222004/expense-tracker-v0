const {
  YOU,
  deriveSharedSpendingActivity,
  groupBalances,
  groupNet,
  overallBalance,
  valueSpendingForReporting,
  valueObligationForSettlement,
  valueObligationForDisplay,
} = require('../money');

const GROUP = { id: 'g1', currency: 'USD', members: [{ id: 'alex' }, { id: 'brian' }] };
const CREATED_AT = new Date(2026, 5, 10, 12).getTime();
const bill = (overrides = {}) => ({
  id: 'dinner', groupId: 'g1', amount: 90, currency: 'USD',
  category: 'food', description: 'Dinner', createdAt: CREATED_AT,
  paidBy: YOU, shares: { [YOU]: 30, alex: 40, brian: 20 },
  ...overrides,
});
const settlement = (overrides = {}) => ({
  id: 'payment', groupId: 'g1', settlement: true,
  from: 'alex', to: YOU, amount: 15, currency: 'USD',
  createdAt: CREATED_AT, ...overrides,
});

describe('shared spending and personal obligations', () => {
  it('counts only your consumed share as spending when you paid, with receivables from members', () => {
    const records = [bill()];
    expect(deriveSharedSpendingActivity(records)).toEqual([{
      id: 'split:dinner', amount: 30, currency: 'USD', category: 'food',
      note: 'Dinner', createdAt: CREATED_AT, splitId: 'dinner', groupId: 'g1',
    }]);
    expect(groupBalances(GROUP, records)).toEqual({ alex: 40, brian: 20 });
    expect(groupNet(GROUP, records)).toBe(60);
  });

  it('counts your consumed share when a member paid, owing only that payer', () => {
    const records = [bill({ paidBy: 'alex' })];
    expect(deriveSharedSpendingActivity(records)[0].amount).toBe(30);
    expect(groupBalances(GROUP, records)).toEqual({ alex: -30, brian: 0 });
    expect(groupNet(GROUP, records)).toBe(-30);
  });

  it('keeps receivables but creates no spending when you paid with zero personal share', () => {
    const records = [bill({ shares: { [YOU]: 0, alex: 60, brian: 30 } })];
    expect(deriveSharedSpendingActivity(records)).toEqual([]);
    expect(groupBalances(GROUP, records)).toEqual({ alex: 60, brian: 30 });
  });

  it('creates no personal ledger between two other members', () => {
    const records = [bill({ paidBy: 'alex', shares: { alex: 60, brian: 30 } })];
    expect(deriveSharedSpendingActivity(records)).toEqual([]);
    expect(groupBalances(GROUP, records)).toEqual({ alex: 0, brian: 0 });
  });

  it('settlements reduce member receivables without creating spending, even with legacy shares', () => {
    const payment = settlement({ shares: { [YOU]: 15 } });
    expect(deriveSharedSpendingActivity([payment])).toEqual([]);
    expect(groupBalances(GROUP, [bill(), payment])).toEqual({ alex: 25, brian: 20 });
  });

  it('your payment reduces your obligation to the member without creating spending', () => {
    const payment = settlement({ from: YOU, to: 'alex', amount: 30 });
    expect(deriveSharedSpendingActivity([payment])).toEqual([]);
    expect(groupBalances(GROUP, [bill({ paidBy: 'alex' }), payment])).toEqual({ alex: 0, brian: 0 });
  });

  it('recomputes spending and obligations after editing the source bill', () => {
    const original = bill();
    const edited = { ...original, amount: 60, description: 'Edited dinner', shares: { [YOU]: 10, alex: 50 } };
    expect(deriveSharedSpendingActivity([original])[0].amount).toBe(30);
    expect(groupBalances(GROUP, [original])).toEqual({ alex: 40, brian: 20 });
    expect(deriveSharedSpendingActivity([edited])[0]).toMatchObject({
      id: 'split:dinner', amount: 10, note: 'Edited dinner',
    });
    expect(groupBalances(GROUP, [edited])).toEqual({ alex: 50, brian: 0 });
  });

  it('removes both projections when the source bill is deleted', () => {
    const records = [bill()];
    expect(deriveSharedSpendingActivity(records)).toHaveLength(1);
    expect(groupNet(GROUP, records)).toBe(60);
    const remaining = records.filter((record) => record.id !== 'dinner');
    expect(deriveSharedSpendingActivity(remaining)).toEqual([]);
    expect(groupBalances(GROUP, remaining)).toEqual({ alex: 0, brian: 0 });
  });

  it('preserves input order and positive share types without coercing the synthetic amount', () => {
    const records = [
      bill({ id: 'earlier', createdAt: CREATED_AT, shares: { [YOU]: 3.125 } }),
      bill({ id: 'later', createdAt: CREATED_AT + 100, shares: { [YOU]: '12.50' } }),
    ];
    expect(deriveSharedSpendingActivity(records).map(({ id, amount }) => ({ id, amount }))).toEqual([
      { id: 'split:earlier', amount: 3.125 }, { id: 'split:later', amount: '12.50' },
    ]);
  });

  it.each([0, -5, undefined, null, NaN])('excludes a non-positive or absent user share (%s)', (share) => {
    expect(deriveSharedSpendingActivity([bill({ shares: { [YOU]: share } })])).toEqual([]);
  });

  it('accepts missing shares without producing personal activity or obligations', () => {
    const records = [bill({ shares: undefined })];
    expect(deriveSharedSpendingActivity(records)).toEqual([]);
    expect(groupBalances(GROUP, records)).toEqual({ alex: 0, brian: 0 });
  });

  it('defaults missing category and description but preserves an unknown category for reporting to normalize', () => {
    const items = deriveSharedSpendingActivity([
      bill({ id: 'missing', category: undefined, description: undefined }),
      bill({ id: 'unknown', category: 'retired-category', description: '' }),
    ]);
    expect(items[0]).toMatchObject({ category: 'other', note: '' });
    expect(items[1]).toMatchObject({ category: 'retired-category', note: '' });
  });

  it('ignores other groups, missing members, and settlements unrelated to you', () => {
    const records = [
      bill({ shares: { [YOU]: 30, alex: 40, removed: 20 } }),
      bill({ id: 'other-group', groupId: 'g2' }),
      bill({ id: 'removed-payer', paidBy: 'removed' }),
      settlement({ from: 'alex', to: 'brian' }),
      settlement({ from: 'removed', to: YOU }),
    ];
    expect(groupBalances(GROUP, records)).toEqual({ alex: 40, brian: 0 });
  });

  it('keeps inputs immutable across spending, balance, and valuation projections', () => {
    const freeze = (value) => {
      if (value && typeof value === 'object') {
        Object.values(value).forEach(freeze);
        Object.freeze(value);
      }
      return value;
    };
    const group = freeze({ ...GROUP, members: [{ id: 'alex' }, { id: 'brian' }] });
    const records = freeze([bill(), settlement()]);
    const before = JSON.stringify({ group, records });
    const activity = deriveSharedSpendingActivity(records);
    expect(valueSpendingForReporting(activity[0], 'EUR')).toBeCloseTo(27.6, 12);
    expect(groupBalances(group, records)).toEqual({ alex: 25, brian: 20 });
    expect(groupNet(group, records)).toBe(45);
    expect(overallBalance([group], records, 'USD')).toEqual({
      owed: 45, owe: 0, net: 45, owedCount: 2, oweCount: 0,
    });
    activity[0].amount = 999;
    expect(JSON.stringify({ group, records })).toBe(before);
  });
});

describe('static valuation and rounding boundaries', () => {
  it('values personal or shared spending in reporting currency without rounding', () => {
    expect(valueSpendingForReporting({ amount: 92, currency: 'EUR' }, 'USD')).toBe(100);
    expect(valueSpendingForReporting({ amount: 1, currency: 'USD' }, 'JPY')).toBe(157.5);
    expect(valueSpendingForReporting({ amount: 1, currency: 'EUR' }, 'USD')).toBe(1.0869565217391304);
  });

  it('values obligations in settlement currency at full precision', () => {
    expect(valueObligationForSettlement(92, 'EUR', 'USD')).toBe(100);
    expect(valueObligationForSettlement(0.004, 'USD', 'JPY')).toBe(0.63);
    expect(valueObligationForSettlement(1, 'EUR', 'USD')).toBe(1.0869565217391304);
  });

  it('values group balances for display without adding another rounding boundary', () => {
    expect(valueObligationForDisplay(1575, 'JPY', 'USD')).toBe(10);
    expect(valueObligationForDisplay(1, 'USD', 'JPY')).toBe(157.5);
    expect(valueObligationForDisplay(-92, 'EUR', 'USD')).toBe(-100);
  });

  it.each([
    ['unknown', 'EUR', 9.2],
    [undefined, 'EUR', 9.2],
    ['EUR', 'unknown', 10.869565217391305],
    ['EUR', undefined, 10.869565217391305],
  ])('retains currency fallback from %s to %s', (source, target, expected) => {
    expect(valueSpendingForReporting({ amount: 10, currency: source }, target)).toBeCloseTo(expected, 12);
    expect(valueObligationForSettlement(10, source, target)).toBeCloseTo(expected, 12);
    expect(valueObligationForDisplay(10, source, target)).toBeCloseTo(expected, 12);
  });

  it('preserves the same-currency fast path including legacy amount types', () => {
    expect(valueSpendingForReporting({ amount: '12.50', currency: 'USD' }, 'USD')).toBe('12.50');
    expect(valueObligationForSettlement('12.50', 'USD', 'USD')).toBe('12.50');
    expect(valueObligationForDisplay('12.50', 'USD', 'USD')).toBe('12.50');
  });

  it.each([['USD', 0.004, 0.01], ['JPY', 0.4, 1]])(
    'rounds %s balances once after all shares and settlements accumulate', (currency, amount, expected) => {
      const group = { ...GROUP, currency };
      const records = [
        bill({ id: 'first', currency, shares: { alex: amount } }),
        bill({ id: 'second', currency, shares: { alex: amount } }),
        bill({ id: 'third', currency, shares: { alex: amount } }),
        settlement({ currency, amount }),
      ];
      expect(groupBalances(group, records)).toEqual({ alex: expected, brian: 0 });
    }
  );

  it('converts bills and settlements before rounding in the group currency', () => {
    const group = { ...GROUP, currency: 'JPY' };
    const records = [
      bill({ currency: 'USD', shares: { alex: 1 } }),
      settlement({ currency: 'USD', amount: 0.5 }),
    ];
    expect(groupBalances(group, records)).toEqual({ alex: 79, brian: 0 });
  });

  it('aggregates distinct group-currency debts and counts members per group', () => {
    const yenGroup = { id: 'g2', currency: 'JPY', members: [{ id: 'alex' }] };
    const records = [
      bill({ shares: { [YOU]: 10, alex: 40 } }),
      bill({ id: 'borrowed', paidBy: 'brian', shares: { [YOU]: 25, brian: 25 } }),
      bill({ id: 'yen', groupId: 'g2', currency: 'JPY', shares: { [YOU]: 1575, alex: 1575 } }),
    ];
    expect(groupBalances(GROUP, records)).toEqual({ alex: 40, brian: -25 });
    expect(groupBalances(yenGroup, records)).toEqual({ alex: 1575 });
    expect(overallBalance([GROUP, yenGroup], records, 'USD')).toEqual({
      owed: 50, owe: 25, net: 25, owedCount: 2, oweCount: 1,
    });
  });

  it('returns the complete zero summary for an empty ledger', () => {
    expect(overallBalance([], [], 'USD')).toEqual({
      owed: 0, owe: 0, net: 0, owedCount: 0, oweCount: 0,
    });
  });
});

describe('splits.js compatibility exports', () => {
  it('keeps the owner sentinel and original signatures available to existing callers', () => {
    const splits = require('../splits');
    expect(splits.YOU).toBe('you');
    expect(splits.yourShareAsExpenses([bill()])[0]).toMatchObject({ id: 'split:dinner', amount: 30 });
    expect(splits.groupBalances(GROUP, [bill()])).toEqual({ alex: 40, brian: 20 });
    expect(splits.groupNet(GROUP, [bill()])).toBe(60);
    expect(splits.overallBalance([GROUP], [bill()], 'USD')).toEqual({
      owed: 60, owe: 0, net: 60, owedCount: 2, oweCount: 0,
    });
  });
});
