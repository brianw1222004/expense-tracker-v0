export const CATEGORIES = [
  { id: 'food', label: 'Food', emoji: '\u{1F354}', color: '#D97706', external: false },
  { id: 'groceries', label: 'Groceries', emoji: '\u{1F6D2}', color: '#34A05F', external: false },
  { id: 'transport', label: 'Transport', emoji: '\u{1F695}', color: '#3193CE', external: false },
  { id: 'shopping', label: 'Shopping', emoji: '\u{1F6CD}\u{FE0F}', color: '#CC5C9F', external: false },
  { id: 'fun', label: 'Fun', emoji: '\u{1F3AC}', color: '#8A63D2', external: false },
  { id: 'health', label: 'Health', emoji: '\u{1F48A}', color: '#D05353', external: false },
  { id: 'bills', label: 'Bills', emoji: '\u{1F9FE}', color: '#C29213', external: true },
  { id: 'other', label: 'Other', emoji: '\u{2728}', color: '#8A7A66', external: false },
];

export const REGULAR_CATEGORIES = CATEGORIES.filter((c) => !c.external);
export const EXTERNAL_CATEGORIES = CATEGORIES.filter((c) => c.external);

export function getCategory(id) {
  return CATEGORIES.find((c) => c.id === id) ?? CATEGORIES[CATEGORIES.length - 1];
}
