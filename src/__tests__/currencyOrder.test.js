const { currenciesByFrequency } = require('../currencyOrder');
const { CURRENCIES } = require('../currency');
const { deriveSharedSpendingActivity, YOU } = require('../money');

const codes = (expenses = [], bills = []) => currenciesByFrequency(expenses, bills).map(({ code }) => code);
const catalog = CURRENCIES.map(({ code }) => code);
const expense = (id, currency) => ({ id, currency, amount: 10, category: 'food', createdAt: 1 });
const bill = (id, currency, patch = {}) => ({
  ...expense(id, currency), groupId: 'trip', paidBy: YOU, shares: { [YOU]: 5, friend: 5 }, ...patch,
});

it('orders currencies by descending saved transaction count, independent of amounts', () => {
  expect(codes([
    expense('a', 'JPY'), expense('b', 'JPY'), expense('c', 'JPY'),
    expense('d', 'USD'), expense('e', 'USD'), { ...expense('f', 'EUR'), amount: 999999 },
  ]).slice(0, 3)).toEqual(['JPY', 'USD', 'EUR']);
});

it('uses original catalog order for ties regardless of transaction order', () => {
  expect(codes([expense('a', 'JPY'), expense('b', 'GBP'), expense('c', 'EUR')]))
    .toEqual(['EUR', 'GBP', 'JPY', ...catalog.filter((code) => !['EUR', 'GBP', 'JPY'].includes(code))]);
});

it('preserves catalog order with empty history', () => {
  expect(codes()).toEqual(catalog);
});

it('always includes every supported currency exactly once', () => {
  const ordered = currenciesByFrequency([expense('a', 'INR')]);
  expect(ordered).toHaveLength(13);
  expect(new Set(ordered.map(({ code }) => code)).size).toBe(13);
  expect(new Set(ordered)).toEqual(new Set(CURRENCIES));
});

it('counts personal and raw shared records once, including bills with no share for you', () => {
  expect(codes([expense('same-id', 'JPY'), expense('usd', 'USD')], [
    bill('same-id', 'JPY', { shares: { friend: 10 } }),
  ])[0]).toBe('JPY');
});

it('does not double count repeated raw records or their derived spending representations', () => {
  const shared = bill('shared', 'JPY');
  const derived = deriveSharedSpendingActivity([shared]);
  expect(codes([expense('usd1', 'USD'), expense('usd2', 'USD'), ...derived], [
    shared, { ...shared }, ...derived,
  ]).slice(0, 2)).toEqual(['USD', 'JPY']);
});

it('excludes settlements, unified activity rows, unsaved drafts, and unsupported codes', () => {
  expect(codes([
    expense('unknown', 'XXX'), expense('lowercase', 'jpy'), { currency: 'JPY' },
    { ...expense('activity', 'JPY'), sourceType: 'personal' },
    { ...expense('summary', 'JPY'), sourceType: 'shared' },
  ], [bill('settlement', 'JPY', { settlement: true })])).toEqual(catalog);
});

it('recomputes ordering after creation, editing, and deletion without counting old versions', () => {
  const a = expense('a', 'USD'), b = expense('b', 'JPY');
  expect(codes([a, b])[0]).toBe('USD');
  const created = [...[a, b], expense('c', 'JPY')];
  expect(codes(created)[0]).toBe('JPY');
  const edited = created.map((item) => item.id === 'b' ? { ...item, currency: 'USD' } : item);
  expect(codes(edited)[0]).toBe('USD');
  expect(codes(edited.filter(({ id }) => id === 'c'))[0]).toBe('JPY');
});

it('never mutates the catalog or saved records', () => {
  const personal = Object.freeze([Object.freeze(expense('a', 'INR'))]);
  const shared = Object.freeze([Object.freeze(bill('b', 'JPY'))]);
  expect(codes(personal, shared).slice(0, 2)).toEqual(['JPY', 'INR']);
  expect(CURRENCIES.map(({ code }) => code)).toEqual(catalog);
  expect(personal[0].currency).toBe('INR');
});
