const {
  budgetAmountPercent,
  budgetZoneTone,
  categoryBarState,
  categoryBudgetUpdate,
  clampBudgetRatio,
  clampCategoryBudgetAmount,
  fitAllocatedBudgetsToOverall,
  hasUsableOverallBudget,
  maxBudgetForCategory,
  remainingBudget,
  totalAllocatedBudget,
} = require('../budget');

describe('budget allocation helpers', () => {
  test('detects usable overall budgets', () => {
    expect(hasUsableOverallBudget(1000)).toBe(true);
    expect(hasUsableOverallBudget('250.50')).toBe(true);
    expect(hasUsableOverallBudget(0)).toBe(false);
    expect(hasUsableOverallBudget('')).toBe(false);
    expect(hasUsableOverallBudget(NaN)).toBe(false);
  });

  test('clamps progress-bar ratios into the 0..1 range', () => {
    expect(clampBudgetRatio(-0.5)).toBe(0);
    expect(clampBudgetRatio(0.4)).toBe(0.4);
    expect(clampBudgetRatio(2)).toBe(1);
    expect(clampBudgetRatio('bad')).toBe(0);
  });

  test('keeps displayed percentages unclamped for typed over-budget values', () => {
    expect(budgetAmountPercent(250, 1000)).toBe(25);
    expect(budgetAmountPercent(1250, 1000)).toBe(125);
    expect(budgetAmountPercent(250, 0)).toBeNull();
  });

  test('calculates total allocated budget for normal categories only', () => {
    const budgets = { food: 300, transport: 200, bills: 1200 };
    expect(totalAllocatedBudget(budgets, ['food', 'transport'])).toBe(500);
  });

  test('calculates remaining budget without counting external categories', () => {
    const budgets = { food: 300, transport: 200, bills: 1200 };
    expect(remainingBudget(1000, budgets, ['food', 'transport'], 2)).toBe(500);
    expect(remainingBudget(0, budgets, ['food', 'transport'], 2)).toBeNull();
  });

  test('limits each category to its current amount plus unallocated budget', () => {
    const budgets = { food: 300, transport: 200, shopping: 100 };
    const ids = ['food', 'transport', 'shopping'];
    expect(maxBudgetForCategory('food', 1000, budgets, ids, 2)).toBe(700);
    expect(maxBudgetForCategory('transport', 1000, budgets, ids, 2)).toBe(600);
    expect(maxBudgetForCategory('food', 0, budgets, ids, 2)).toBe(Infinity);
  });

  test('clamps typed category amounts to available allocation', () => {
    const budgets = { food: 300, transport: 200, shopping: 100 };
    const ids = ['food', 'transport', 'shopping'];
    expect(clampCategoryBudgetAmount('food', 900, 1000, budgets, ids, 2)).toBe(700);
    expect(clampCategoryBudgetAmount('food', 650, 1000, budgets, ids, 2)).toBe(650);
    expect(clampCategoryBudgetAmount('food', 900, 0, budgets, ids, 2)).toBe(900);
  });

  test('reuses the edited allocation once, without changing other budgets', () => {
    const budgets = Object.freeze({ food: 200, transport: 300, bills: 1200 });
    const update = categoryBudgetUpdate({
      categoryId: 'food', amount: 900, overallBudget: 1000,
      categoryBudgets: budgets, categoryIds: ['food', 'transport'],
    });
    expect(maxBudgetForCategory('food', 1000, budgets, ['food', 'transport'])).toBe(700);
    expect(update.categoryBudgets).toEqual({ food: 700, transport: 300, bills: 1200 });
    expect(totalAllocatedBudget(update.categoryBudgets, ['food', 'transport'])).toBe(1000);
  });

  test.each([0, '', '0'])('removes %p and releases capacity for another category', (amount) => {
    const update = categoryBudgetUpdate({
      categoryId: 'food', amount, overallBudget: 1000,
      categoryBudgets: { food: 700, transport: 300 }, categoryIds: ['food', 'transport'],
    });
    expect(update.categoryBudgets).toEqual({ transport: 300 });
    expect(maxBudgetForCategory('transport', 1000, update.categoryBudgets, ['food', 'transport'])).toBe(1000);
  });

  test('reduces only the edited share of an already over-allocated budget', () => {
    expect(categoryBudgetUpdate({
      categoryId: 'food', amount: 800, overallBudget: 1000,
      categoryBudgets: { food: 800, transport: 300 }, categoryIds: ['food', 'transport'],
    }).categoryBudgets).toEqual({ food: 700, transport: 300 });
  });

  test('a category newly entering the regular pool cannot reuse its external allocation', () => {
    expect(categoryBudgetUpdate({
      categoryId: 'bills', amount: 1200, overallBudget: 1000,
      categoryBudgets: { food: 800, bills: 1200 }, categoryIds: ['food'],
    }).categoryBudgets).toEqual({ food: 800, bills: 200 });
  });

  test('external budgets stay independent even when regular allocations are full', () => {
    expect(categoryBudgetUpdate({
      categoryId: 'bills', amount: 5000, external: true, overallBudget: 1000,
      categoryBudgets: { food: 1000 }, categoryIds: ['food'],
    }).categoryBudgets).toEqual({ food: 1000, bills: 5000 });
  });

  test.each([undefined, null, '', 0, -1])('no positive overall budget (%p) imposes no ceiling', (overallBudget) => {
    expect(categoryBudgetUpdate({
      categoryId: 'food', amount: 5000, overallBudget,
      categoryBudgets: { transport: 300 }, categoryIds: ['food', 'transport'],
    }).categoryBudgets).toEqual({ food: 5000, transport: 300 });
  });

  test.each([
    [2, 10.01, 3.33, 6.68],
    [0, 1000, 301, 699],
  ])('clamps to currency precision (%i decimals)', (decimals, overallBudget, other, expected) => {
    const update = categoryBudgetUpdate({
      categoryId: 'food', amount: 9999.999, overallBudget, decimals,
      categoryBudgets: { food: 1, transport: other }, categoryIds: ['food', 'transport'],
    });
    expect(update.amount).toBe(expected);
    expect(Number(update.amount.toFixed(decimals))).toBe(update.amount);
  });

  test.each([[2, 12.345, 12.35], [0, 12.6, 13]])('rounds independent budgets (%i decimals)', (decimals, amount, expected) => {
    expect(categoryBudgetUpdate({ categoryId: 'food', amount, decimals }).amount).toBe(expected);
  });

  test('integer-currency proportional fit still removes allocations rounded to zero', () => {
    const next = fitAllocatedBudgetsToOverall({ food: 600, transport: 400, shopping: 1, bills: 1200 },
      ['food', 'transport', 'shopping'], 501, 0);
    expect(next).toEqual({ food: 300, transport: 200, bills: 1200 });
  });

  test('scales over-allocated normal categories down when overall budget shrinks', () => {
    const budgets = { food: 600, transport: 400, bills: 1200 };
    const next = fitAllocatedBudgetsToOverall(budgets, ['food', 'transport'], 500, 2);
    expect(next.food).toBe(300);
    expect(next.transport).toBe(200);
    expect(next.bills).toBe(1200);
    expect(totalAllocatedBudget(next, ['food', 'transport'])).toBeLessThanOrEqual(500);
  });

  test('does not rewrite allocation when overall budget is invalid or already sufficient', () => {
    const budgets = { food: 300, transport: 200, bills: 1200 };
    expect(fitAllocatedBudgetsToOverall(budgets, ['food', 'transport'], 0, 2)).toEqual(budgets);
    expect(fitAllocatedBudgetsToOverall(budgets, ['food', 'transport'], 700, 2)).toEqual(budgets);
  });
});

describe('budgetZoneTone', () => {
  const colors = { success: 'green', warning: 'orange', danger: 'red' };

  test('an unbudgeted category is always green (no limit to breach)', () => {
    expect(budgetZoneTone(0, false, colors)).toBe('green');
    // The ratio is ignored when hasBudget is false — an unbudgeted row plots no
    // bar at all (basis 'none'; see categoryBarState).
    expect(budgetZoneTone(0.95, false, colors)).toBe('green');
    expect(budgetZoneTone(5, false, colors)).toBe('green');
  });

  test('green under 85% of budget', () => {
    expect(budgetZoneTone(0, true, colors)).toBe('green');
    expect(budgetZoneTone(0.5, true, colors)).toBe('green');
    expect(budgetZoneTone(0.8499, true, colors)).toBe('green');
  });

  test('orange from 85% through exactly 100%', () => {
    expect(budgetZoneTone(0.85, true, colors)).toBe('orange');
    expect(budgetZoneTone(0.99, true, colors)).toBe('orange');
    expect(budgetZoneTone(1, true, colors)).toBe('orange');
  });

  test('red once over budget (ratio > 1)', () => {
    expect(budgetZoneTone(1.0001, true, colors)).toBe('red');
    expect(budgetZoneTone(2, true, colors)).toBe('red');
  });
});

describe('categoryBarState', () => {
  const colors = { success: 'green', warning: 'orange', danger: 'red' };

  test('spent-of-budget in the budget zone', () => {
    expect(categoryBarState({ spent: 45, budget: 100, colors })).toEqual({
      basis: 'budget', ratio: 0.45, fillPct: 45, tone: 'green', over: false,
    });
    expect(categoryBarState({ spent: 90, budget: 100, colors })).toMatchObject({
      basis: 'budget', fillPct: 90, tone: 'orange', over: false,
    });
    expect(categoryBarState({ spent: 120, budget: 100, colors })).toMatchObject({
      basis: 'budget', ratio: 1.2, fillPct: 100, tone: 'red', over: true,
    });
  });

  test('no budget leaves the bar empty (no last-month fallback)', () => {
    expect(categoryBarState({ spent: 599, budget: 0, colors })).toMatchObject({
      basis: 'none', fillPct: 0, over: false,
    });
    expect(categoryBarState({ spent: 0, budget: 0, colors })).toMatchObject({
      basis: 'none', fillPct: 0,
    });
  });

  test('defaults treat missing figures as zero', () => {
    expect(categoryBarState({ colors }).basis).toBe('none');
  });
});
