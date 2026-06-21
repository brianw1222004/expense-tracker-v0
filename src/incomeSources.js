// Income sources — a FIXED set (no user-created sources, per spec). Each carries
// a muted color that reads on the app's light palettes. Display names come from
// i18n (t('source.' + id)); `label` is only the English fallback for non-i18n
// contexts. Mirrors the categories.js getCategory/getCategoryLabel shape.
export const INCOME_SOURCES = [
  { id: 'salary', color: '#4f9d8f', label: 'Salary' },
  { id: 'freelance', color: '#6b8cce', label: 'Freelance' },
  { id: 'side_income', color: '#c0935e', label: 'Side Income' },
  { id: 'reimbursement', color: '#9b7fc0', label: 'Reimbursement' },
  { id: 'gift', color: '#cf7a9e', label: 'Gift' },
  { id: 'other', color: '#8a9aa8', label: 'Other' },
];

// Stale/unknown source ids fall back to "Other" so old rows still render.
const FALLBACK = INCOME_SOURCES[INCOME_SOURCES.length - 1];

export function getIncomeSource(id) {
  return INCOME_SOURCES.find((s) => s.id === id) ?? FALLBACK;
}

export function getIncomeSourceLabel(source, t) {
  // t() already falls back English -> key, so a built-in source always resolves.
  return t('source.' + source.id);
}
