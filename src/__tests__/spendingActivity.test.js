const { deriveViewData } = require('../derive');
const { YOU, deriveSharedSpendingActivity } = require('../money');
const { getAllCategories } = require('../categories');
const { defaultBrowsingDate } = require('../browsingMonth');
const {
  spendingDays, spendingForDay, canDeleteSpendingActivity,
  resolveSpendingEdit, spendingRowInteractions,
} = require('../spendingActivity');
// Load real translations rather than the date-formatting test mock.
const { translate } = require('../i18n.js');

const NOW = new Date(2026, 5, 15, 12);
const createdAt = new Date(2026, 5, 10, 12).getTime();
const group = { id: 'g1', name: 'Trip', currency: 'USD', members: [{ id: 'alex' }] };
const personal = { id: 'p', amount: 20, currency: 'USD', category: 'food', note: 'Lunch', createdAt };
const bill = {
  id: 'b', groupId: 'g1', amount: 100, currency: 'USD', description: 'Dinner',
  category: 'food', paidBy: 'alex', shares: { [YOU]: 40, alex: 60 }, createdAt: createdAt + 100,
};
const project = (expenses = [personal], bills = [bill], categories = []) =>
  deriveViewData(expenses, 'USD', 'en', categories, NOW, deriveSharedSpendingActivity(bills));

describe('Expenses calendar and category filters', () => {
  it('marks personal and shared dates only within the selected browsing month', () => {
    const sections = project([personal], [
      { ...bill, createdAt: new Date(2026, 5, 12, 12).getTime() },
      { ...bill, id: 'may', createdAt: new Date(2026, 4, 20, 12).getTime() },
    ]).spendingSections;
    expect([...spendingDays(sections, '2026-06')].sort((a, b) => a - b)).toEqual([10, 12]);
    expect([...spendingDays(sections, '2026-05')]).toEqual([20]);
    expect([...spendingDays(sections, '2026-04')]).toEqual([]);
  });

  it('returns both sources in newest-first order and the exact selected-day total', () => {
    const view = project();
    const day = spendingForDay(view.spendingSections, '2026-06-10');
    expect(day.filteredExpenses.map(({ id }) => id)).toEqual(['split:b', 'p']);
    expect(day.filteredTotal).toBe(60);
    expect(view.dailyTotals[9]).toBe(60);
  });

  it('filters both sources using normalized category ids and retains their order', () => {
    const sections = project([
      personal,
      { ...personal, id: 'bus', category: 'transport', amount: 7 },
    ], [bill, { ...bill, id: 'taxi', category: 'transport', shares: { [YOU]: 15 } }]).spendingSections;
    const food = spendingForDay(sections, '2026-06-10', 'food');
    expect(food.filteredExpenses.map(({ id }) => id)).toEqual(['split:b', 'p']);
    expect(food.filteredTotal).toBe(60);
    const transport = spendingForDay(sections, '2026-06-10', 'transport');
    expect(transport.filteredExpenses.map(({ id }) => id)).toEqual(['split:taxi', 'bus']);
    expect(transport.filteredTotal).toBe(22);
    expect(spendingForDay(sections, '2026-06-10', 'health')).toEqual({ filteredExpenses: [], filteredTotal: 0 });
  });

  it('filters orphaned categories into Other and retains custom shared categories', () => {
    const custom = [{ id: 'c_trip', label: 'Trip', color: '#123456', custom: true }];
    const sections = project([{ ...personal, category: 'retired' }], [
      { ...bill, category: undefined },
      { ...bill, id: 'custom', category: 'c_trip', shares: { [YOU]: 9 } },
    ], custom).spendingSections;
    expect(spendingForDay(sections, '2026-06-10', 'other', getAllCategories(custom)).filteredTotal).toBe(60);
    expect(spendingForDay(sections, '2026-06-10', 'c_trip', getAllCategories(custom)).filteredTotal).toBe(9);
  });

  it('returns zero on a day without records or from empty sections', () => {
    expect(spendingForDay(project().spendingSections, '2026-06-09')).toEqual({ filteredExpenses: [], filteredTotal: 0 });
    expect(spendingForDay([], '2026-06-10')).toEqual({ filteredExpenses: [], filteredTotal: 0 });
    expect([...spendingDays([{ total: 0, data: [] }], '2026-06')]).toEqual([]);
  });

  it('uses the existing global month default day after switching tabs', () => {
    const day = defaultBrowsingDate('2026-05', '2026-06-15');
    const sections = project([], [{ ...bill, createdAt: new Date(2026, 4, 1, 12).getTime() }]).spendingSections;
    expect(day).toBe('2026-05-01');
    expect(spendingForDay(sections, day).filteredTotal).toBe(40);
    expect([...spendingDays(sections, '2026-05')]).toEqual([1]);
  });

  it('preserves the chart total when sorted rows would have a different floating-point sum', () => {
    const view = project([{ ...personal, amount: 1e16 }], [
      { ...bill, id: 'small1', shares: { [YOU]: 1 } },
      { ...bill, id: 'small2', shares: { [YOU]: 1 } },
    ]);
    expect(spendingForDay(view.spendingSections, '2026-06-10').filteredTotal).toBe(1e16);
    expect(view.dailyTotals[9]).toBe(1e16);
  });
});

describe('source edit routing and delete safety', () => {
  const personalActivity = () => project().spendingSections[0].data.find((item) => item.sourceType === 'personal');
  const sharedActivity = () => project().spendingSections[0].data.find((item) => item.sourceType === 'shared');

  it('resolves a personal row to the persisted personal record, even with a split-prefixed id', () => {
    const original = { ...personal, id: 'split:b' };
    const activity = project([original]).spendingSections[0].data.find((item) => item.sourceType === 'personal');
    const target = resolveSpendingEdit(activity, [original], [bill], [group]);
    expect(target.sourceType).toBe('personal');
    expect(target.record).toBe(original);
    expect(target.record.amount).toBe(20);
  });

  it('resolves shared rows using splitId to the full original bill for SharedSplitForm', () => {
    const target = resolveSpendingEdit(sharedActivity(), [personal], [bill], [group]);
    expect(target.sourceType).toBe('shared');
    expect(target.record).toBe(bill);
    expect(target.record.amount).toBe(100);
    expect(target.record.shares).toEqual({ [YOU]: 40, alex: 60 });
  });

  it('uses the latest bill after an edit rather than stale projected values', () => {
    const edited = { ...bill, description: 'Edited', shares: { [YOU]: 10, alex: 90 } };
    const target = resolveSpendingEdit(sharedActivity(), [personal], [edited], [group]);
    expect(target.record).toBe(edited);
    expect(target.record.shares[YOU]).toBe(10);
  });

  it('safely ignores a shared row whose original bill was deleted', () => {
    expect(resolveSpendingEdit(sharedActivity(), [personal], [], [group])).toBeNull();
  });

  it('safely ignores a shared row whose group was deleted', () => {
    expect(resolveSpendingEdit(sharedActivity(), [personal], [bill], [])).toBeNull();
  });

  it('does not resolve settlements or mismatched groups as shared bill edits', () => {
    expect(resolveSpendingEdit(sharedActivity(), [personal], [{ ...bill, settlement: true }], [group])).toBeNull();
    expect(resolveSpendingEdit({ ...sharedActivity(), groupId: 'wrong' }, [personal], [bill], [group])).toBeNull();
  });

  it('does not infer edit source from an id prefix or fall back from shared to personal', () => {
    const collision = { ...personal, id: 'split:b' };
    expect(resolveSpendingEdit({ id: 'split:b' }, [collision], [bill], [group])).toBeNull();
    expect(resolveSpendingEdit(sharedActivity(), [collision], [], [group])).toBeNull();
    expect(resolveSpendingEdit(personalActivity(), [], [bill], [group])).toBeNull();
    expect(resolveSpendingEdit(null, [], [], [])).toBeNull();
  });

  it('keeps personal tap and long-press actions available', () => {
    const onEdit = jest.fn();
    const onRequestDelete = jest.fn();
    const activity = personalActivity();
    const actions = spendingRowInteractions(activity, { onEdit, onRequestDelete });
    actions.onPress();
    actions.onLongPress();
    expect(onEdit).toHaveBeenCalledWith(activity);
    expect(onRequestDelete).toHaveBeenCalledWith(activity);
    expect(actions.accessibilityHintKey).toBe('list.longPressToDelete');
    expect(canDeleteSpendingActivity(activity)).toBe(true);
  });

  it('allows shared taps but exposes no long-press delete action or delete hint', () => {
    const onEdit = jest.fn();
    const onRequestDelete = jest.fn();
    const activity = sharedActivity();
    const actions = spendingRowInteractions(activity, { onEdit, onRequestDelete });
    actions.onPress();
    expect(onEdit).toHaveBeenCalledWith(activity);
    expect(actions.onLongPress).toBeUndefined();
    expect(onRequestDelete).not.toHaveBeenCalled();
    expect(actions.accessibilityHintKey).toBe('list.editSharedBill');
    expect(canDeleteSpendingActivity(activity)).toBe(false);
    expect(canDeleteSpendingActivity(null)).toBe(false);
    expect(canDeleteSpendingActivity({ id: 'personal-looking' })).toBe(false);
  });

  it('keeps frozen projections and sources intact through calendar, filters, and edit lookup', () => {
    const view = project();
    view.spendingSections.forEach((section) => {
      section.data.forEach(Object.freeze);
      Object.freeze(section.data);
      Object.freeze(section);
    });
    Object.freeze(view.spendingSections);
    const before = JSON.stringify(view);
    spendingDays(view.spendingSections, '2026-06');
    spendingForDay(view.spendingSections, '2026-06-10', 'food');
    resolveSpendingEdit(view.spendingSections[0].data[0], [personal], [bill], [group]);
    expect(JSON.stringify(view)).toBe(before);
  });
});

describe('unified activity empty states', () => {
  it.each([
    ['empty', [], [], false, 0],
    ['personal only', [personal], [], true, 1],
    ['shared only', [], [bill], true, 1],
    ['both', [personal], [bill], true, 2],
    ['settlements only', [], [{ ...bill, settlement: true }], false, 0],
  ])('%s has the expected spending gate and row count', (_, personalRecords, bills, hasSpending, count) => {
    const view = project(personalRecords, bills);
    expect(view.hasSpending).toBe(hasSpending);
    expect(view.spendingSections.flatMap(({ data }) => data)).toHaveLength(count);
  });
});

describe('shared activity localization', () => {
  it.each([
    ['en', 'Shared · Your share', 'Shared · Your share · Trip', 'Edit shared bill'],
    ['zh', '分帳 · 你的份額', '分帳 · 你的份額 · Trip', '編輯分帳帳單'],
    ['es', 'Compartido · Tu parte', 'Compartido · Tu parte · Trip', 'Editar gasto compartido'],
  ])('provides the share, group, and safe edit hint in %s', (language, label, withGroup, hint) => {
    expect(translate(language, 'list.sharedYourShare')).toBe(label);
    expect(translate(language, 'list.sharedWithGroup', { group: 'Trip' })).toBe(withGroup);
    expect(translate(language, 'list.editSharedBill')).toBe(hint);
  });
});
