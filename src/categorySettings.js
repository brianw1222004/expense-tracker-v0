import { categoryBudgetUpdate } from './budget';
import { getRegularAll } from './categories';
import { getCurrency } from './currency';

// Apply category metadata and its budget atomically against current settings.
// Keep preset overrides and existing custom-category positions unchanged.
export function saveCategorySettings(settings, category, isNew = false) {
  const { budget, _editing, ...cat } = category;
  const list = settings.customCategories || [];
  const update = categoryBudgetUpdate({
    categoryId: cat.id,
    amount: budget,
    overallBudget: settings.monthlyBudget,
    categoryBudgets: settings.categoryBudgets,
    categoryIds: getRegularAll(list).map((c) => c.id),
    decimals: getCurrency(settings.displayCurrency).decimals,
    external: cat.external,
    isNew,
  });
  if (!update.valid) return settings;
  // Upsert on id regardless of isNew: appending a second entry for an id the
  // list already carries would shadow the first everywhere getCategory looks.
  const exists = list.some((c) => c.id === cat.id);
  return {
    ...settings,
    customCategories: exists
      ? list.map((c) => (c.id === cat.id ? cat : c))
      : [...list, cat],
    categoryBudgets: update.categoryBudgets,
  };
}
