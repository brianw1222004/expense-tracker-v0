export function clampBudgetRatio(ratio) {
  const n = Number(ratio);
  if (!Number.isFinite(n)) return 0;
  return Math.max(0, Math.min(1, n));
}

// The zone tone for a category's spent-of-budget bar, shared by the Dashboard's
// top-category rows and the Insight category rows so the thresholds can't drift
// apart: green under budget, orange within 15% of it (>=85%), red over. An
// unbudgeted category is always green (there's no limit to breach). `colors` is
// injected to keep this module palette-free. (The overall budget gauge
// deliberately uses its own, earlier 75% warning and does NOT go through here.)
export function budgetZoneTone(ratio, hasBudget, colors) {
  if (!hasBudget) return colors.success;
  if (ratio > 1) return colors.danger;
  if (ratio >= 0.85) return colors.warning;
  return colors.success;
}

// Everything a category progress bar needs, in one place so the Dashboard's
// top-category rows and the Insight category rows can't drift apart. The bar
// always measures spent-of-BUDGET:
//   basis 'budget' — a budget is set: fill spent-of-budget in the budget zone.
//   basis 'none'   — no budget, so there's nothing to measure against: an empty
//                    track (callers label the slot "No budget" instead of a
//                    figure). The old no-budget fallback — this month vs. the
//                    same category LAST month — was removed; both cards compare
//                    against the budget only.
// `fillPct` is always clamped to 0..100; `ratio` is left uncapped so callers
// can label the real overshoot.
export function categoryBarState({ spent = 0, budget = 0, colors }) {
  if (budget > 0) {
    const ratio = spent / budget;
    return {
      basis: 'budget',
      ratio,
      fillPct: clampBudgetRatio(ratio) * 100,
      tone: budgetZoneTone(ratio, true, colors),
      over: spent > budget,
    };
  }
  return { basis: 'none', ratio: 0, fillPct: 0, tone: colors.success, over: false };
}

export function hasUsableOverallBudget(overallBudget) {
  const n = Number(overallBudget);
  return Number.isFinite(n) && n > 0;
}

// (The ratio↔amount and 5%-snapping helpers that fed the budget editor's
// proportion sliders went with them — budgets are typed as amounts now.)

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
