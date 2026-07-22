const {
  budgetAmountPercent,
  budgetAmountToRatio,
  budgetZoneTone,
  clampBudgetRatio,
  clampCategoryBudgetAmount,
  fitAllocatedBudgetsToOverall,
  hasUsableOverallBudget,
  maxBudgetForCategory,
  remainingBudget,
  ratioToBudgetAmount,
  snapRatioToStep,
  totalAllocatedBudget,
} = require('../budget');

describe('budget slider helpers', () => {
  test('detects usable overall budgets', () => {
    expect(hasUsableOverallBudget(1000)).toBe(true);
    expect(hasUsableOverallBudget('250.50')).toBe(true);
    expect(hasUsableOverallBudget(0)).toBe(false);
    expect(hasUsableOverallBudget('')).toBe(false);
    expect(hasUsableOverallBudget(NaN)).toBe(false);
  });

  test('clamps slider ratios into the 0..1 range', () => {
    expect(clampBudgetRatio(-0.5)).toBe(0);
    expect(clampBudgetRatio(0.4)).toBe(0.4);
    expect(clampBudgetRatio(2)).toBe(1);
    expect(clampBudgetRatio('bad')).toBe(0);
  });

  test('maps category amounts to slider ratios', () => {
    expect(budgetAmountToRatio(250, 1000)).toBe(0.25);
    expect(budgetAmountToRatio(1200, 1000)).toBe(1);
    expect(budgetAmountToRatio(250, 0)).toBe(0);
  });

  test('snaps slider ratios to clean 5% steps', () => {
    expect(snapRatioToStep(0.12, 0.05)).toBe(0.1);
    expect(snapRatioToStep(0.13, 0.05)).toBe(0.15);
    expect(snapRatioToStep(0.155, 0.05)).toBe(0.15); // no float dust from 3 * 0.05
    expect(snapRatioToStep(0.5, 0.05)).toBe(0.5);
    expect(snapRatioToStep(1.4, 0.05)).toBe(1); // clamped into range
    expect(snapRatioToStep(-0.2, 0.05)).toBe(0);
    expect(snapRatioToStep(0.2, 0)).toBe(0.2); // invalid step is a no-op (still clamped)
  });

  test('maps slider ratios back to rounded category amounts', () => {
    expect(ratioToBudgetAmount(0.25, 1000, 2)).toBe(250);
    expect(ratioToBudgetAmount(0.333, 1000, 2)).toBe(333);
    expect(ratioToBudgetAmount(0.333, 1000, 0)).toBe(333);
    expect(ratioToBudgetAmount(1.5, 1000, 2)).toBe(1000);
    expect(ratioToBudgetAmount(0.5, 0, 2)).toBe(0);
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
    // The ratio is ignored when hasBudget is false (it's share-of-total there).
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
