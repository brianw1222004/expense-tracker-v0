export function clampBudgetRatio(ratio) {
  const n = Number(ratio);
  if (!Number.isFinite(n)) return 0;
  return Math.max(0, Math.min(1, n));
}

export function hasUsableOverallBudget(overallBudget) {
  const n = Number(overallBudget);
  return Number.isFinite(n) && n > 0;
}

export function budgetAmountToRatio(amount, overallBudget) {
  if (!hasUsableOverallBudget(overallBudget)) return 0;
  return clampBudgetRatio((Number(amount) || 0) / Number(overallBudget));
}

// Snap a 0..1 slider ratio to the nearest `step` (default 5%). The slider works
// in proportions of the overall budget, so a 0.05 step === 5% increments. Float
// dust from `n * 0.05` is rounded away so results are clean multiples.
export function snapRatioToStep(ratio, step = 0.05) {
  const r = clampBudgetRatio(ratio);
  const s = Number(step);
  if (!Number.isFinite(s) || s <= 0) return r;
  return clampBudgetRatio(Math.round(Math.round(r / s) * s * 1e6) / 1e6);
}

export function ratioToBudgetAmount(ratio, overallBudget, decimals = 2) {
  if (!hasUsableOverallBudget(overallBudget)) return 0;
  const factor = 10 ** decimals;
  return Math.round(Number(overallBudget) * clampBudgetRatio(ratio) * factor) / factor;
}

export function budgetAmountPercent(amount, overallBudget) {
  if (!hasUsableOverallBudget(overallBudget)) return null;
  return ((Number(amount) || 0) / Number(overallBudget)) * 100;
}

export function totalAllocatedBudget(categoryBudgets = {}, categoryIds = []) {
  return categoryIds.reduce((sum, id) => sum + Math.max(0, Number(categoryBudgets?.[id]) || 0), 0);
}

export function remainingBudget(overallBudget, categoryBudgets = {}, categoryIds = [], decimals = 2) {
  if (!hasUsableOverallBudget(overallBudget)) return null;
  const factor = 10 ** decimals;
  const remaining = Number(overallBudget) - totalAllocatedBudget(categoryBudgets, categoryIds);
  return Math.max(0, Math.round(remaining * factor) / factor);
}

export function maxBudgetForCategory(categoryId, overallBudget, categoryBudgets = {}, categoryIds = [], decimals = 2) {
  if (!hasUsableOverallBudget(overallBudget)) return Infinity;
  const current = Math.max(0, Number(categoryBudgets?.[categoryId]) || 0);
  const remaining = remainingBudget(overallBudget, categoryBudgets, categoryIds, decimals);
  return current + (remaining ?? 0);
}

export function clampCategoryBudgetAmount(categoryId, amount, overallBudget, categoryBudgets = {}, categoryIds = [], decimals = 2) {
  const n = Math.max(0, Number(amount) || 0);
  const factor = 10 ** decimals;
  const rounded = Math.round(n * factor) / factor;
  if (!hasUsableOverallBudget(overallBudget)) return rounded;
  const maxAllowed = maxBudgetForCategory(categoryId, overallBudget, categoryBudgets, categoryIds, decimals);
  return Math.min(rounded, maxAllowed);
}

export function fitAllocatedBudgetsToOverall(categoryBudgets = {}, categoryIds = [], overallBudget, decimals = 2) {
  if (!hasUsableOverallBudget(overallBudget)) return { ...(categoryBudgets || {}) };
  const currentTotal = totalAllocatedBudget(categoryBudgets, categoryIds);
  if (currentTotal <= Number(overallBudget)) return { ...(categoryBudgets || {}) };

  const factor = 10 ** decimals;
  const totalUnits = Math.round(Number(overallBudget) * factor);
  const next = { ...(categoryBudgets || {}) };

  for (const id of categoryIds) {
    const current = Math.max(0, Number(categoryBudgets?.[id]) || 0);
    const units = Math.floor((current / currentTotal) * totalUnits);
    if (units > 0) next[id] = units / factor;
    else delete next[id];
  }

  return next;
}
