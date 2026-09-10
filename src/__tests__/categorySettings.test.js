const { saveCategorySettings } = require('../categorySettings');
const { categoryBudgetUpdate } = require('../budget');
const { getCategory, getRegularAll } = require('../categories');

const category = { id: 'c_new', label: 'New', emoji: 'home-01', color: '#123456', external: false, custom: true };
const settings = {
  monthlyBudget: 1000,
  displayCurrency: 'USD',
  categoryBudgets: { food: 200, transport: 300, bills: 1200 },
  customCategories: [],
};

describe('category add/edit settings path', () => {
  test('editing uses the same ceiling and stored budget map as the Budget editor', () => {
    const before = JSON.parse(JSON.stringify(settings));
    const next = saveCategorySettings(settings, { ...getCategory('food'), label: 'Meals', budget: 900 });
    const editor = categoryBudgetUpdate({
      categoryId: 'food', amount: 900, overallBudget: settings.monthlyBudget,
      categoryBudgets: settings.categoryBudgets,
      categoryIds: getRegularAll().map((c) => c.id),
    });
    expect(next.categoryBudgets).toEqual(editor.categoryBudgets);
    expect(next.categoryBudgets).toEqual({ food: 700, transport: 300, bills: 1200 });
    expect(getCategory('food', next.customCategories).label).toBe('Meals');
    expect(settings).toEqual(before);
  });

  test.each([0, '', '0'])('editing with %p removes only the budget, keeping the category', (budget) => {
    const next = saveCategorySettings(settings, { ...getCategory('food'), budget });
    expect(next.categoryBudgets).toEqual({ transport: 300, bills: 1200 });
    expect(getRegularAll(next.customCategories).map((c) => c.id)).toContain('food');
  });

  test('existing categories can keep positive budgets below the creation minimum', () => {
    const next = saveCategorySettings(settings, { ...getCategory('food'), budget: 1 });
    expect(next.categoryBudgets.food).toBe(1);
  });

  test('new regular categories clamp to unallocated budget without redistributing', () => {
    const next = saveCategorySettings(settings, { ...category, budget: 900 }, true);
    expect(next.categoryBudgets).toEqual({ ...settings.categoryBudgets, c_new: 500 });
    expect(next.customCategories).toEqual([category]);
  });

  test.each([1000, 975])('rejects creation when allocation %i leaves less than the minimum', (food) => {
    const current = { ...settings, categoryBudgets: { food } };
    const next = saveCategorySettings(current, { ...category, budget: 100 }, true);
    expect(next).toBe(current);
  });

  test('creation accepts exactly the minimum remaining allocation', () => {
    const current = { ...settings, categoryBudgets: { food: 950 } };
    expect(saveCategorySettings(current, { ...category, budget: 500 }, true).categoryBudgets)
      .toEqual({ food: 950, c_new: 50 });
  });

  test.each([0, '', 49.99])('preserves the creation minimum for requested value %p', (budget) => {
    expect(saveCategorySettings(settings, { ...category, budget }, true)).toBe(settings);
  });

  test('creation without an overall budget still requires a positive amount', () => {
    const current = { ...settings, monthlyBudget: 0 };
    expect(saveCategorySettings(current, { ...category, budget: 0 }, true)).toBe(current);
    expect(saveCategorySettings(current, { ...category, budget: 9999 }, true).categoryBudgets)
      .toEqual({ ...current.categoryBudgets, c_new: 9999 });
  });

  test('external creation remains independent and retains its existing creation minimum', () => {
    const current = { ...settings, categoryBudgets: { food: 1000 } };
    expect(saveCategorySettings(current, { ...category, external: true, budget: 5000 }, true).categoryBudgets)
      .toEqual({ food: 1000, c_new: 5000 });
    expect(saveCategorySettings(current, { ...category, external: true, budget: 1 }, true)).toBe(current);
  });

  test('changing external to regular observes capacity; changing back releases it', () => {
    const regular = saveCategorySettings(settings, { ...getCategory('bills'), external: false, budget: 1200 });
    expect(regular.categoryBudgets).toEqual({ food: 200, transport: 300, bills: 500 });
    const external = saveCategorySettings(regular, { ...getCategory('bills'), budget: 1200 });
    expect(external.categoryBudgets).toEqual(settings.categoryBudgets);
    expect(saveCategorySettings(external, { ...getCategory('food'), budget: 900 }).categoryBudgets.food).toBe(700);
  });

  test.each(['JPY', 'TWD', 'KRW'])('%s creation minimum rounds up to a whole unit', (displayCurrency) => {
    const current = { ...settings, monthlyBudget: 101, displayCurrency, categoryBudgets: { food: 96 } };
    expect(saveCategorySettings(current, { ...category, budget: 20 }, true)).toBe(current);
    const fits = { ...current, categoryBudgets: { food: 95 } };
    expect(saveCategorySettings(fits, { ...category, budget: 20 }, true).categoryBudgets).toEqual({ food: 95, c_new: 6 });
  });

  test('a decimal-currency minimum does not gain a cent from floating-point noise', () => {
    const current = { ...settings, monthlyBudget: 2.2, categoryBudgets: {} };
    expect(saveCategorySettings(current, { ...category, budget: 0.11 }, true).categoryBudgets).toEqual({ c_new: 0.11 });
  });

  test('editing keeps category ordering, unrelated metadata, and budgets intact', () => {
    const another = { ...category, id: 'c_another', label: 'Another' };
    const current = { ...settings, customCategories: [category, another], categoryBudgets: { ...settings.categoryBudgets, c_new: 100, c_another: 20 } };
    const next = saveCategorySettings(current, { ...category, label: 'Renamed', budget: '', _editing: true });
    expect(next.customCategories).toEqual([{ ...category, label: 'Renamed' }, another]);
    expect(next.categoryBudgets).toEqual({ ...settings.categoryBudgets, c_another: 20 });
    expect(next.monthlyBudget).toBe(current.monthlyBudget);
    expect(next.displayCurrency).toBe(current.displayCurrency);
  });
});
