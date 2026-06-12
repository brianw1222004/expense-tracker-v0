export const CATEGORIES = [
  { id: 'food', label: 'Food', emoji: '\u{1F354}', color: '#F59E0B' },
  { id: 'groceries', label: 'Groceries', emoji: '\u{1F6D2}', color: '#34D399' },
  { id: 'transport', label: 'Transport', emoji: '\u{1F695}', color: '#38BDF8' },
  { id: 'shopping', label: 'Shopping', emoji: '\u{1F6CD}\u{FE0F}', color: '#F472B6' },
  { id: 'fun', label: 'Fun', emoji: '\u{1F3AC}', color: '#A78BFA' },
  { id: 'health', label: 'Health', emoji: '\u{1F48A}', color: '#FB7185' },
  { id: 'bills', label: 'Bills', emoji: '\u{1F9FE}', color: '#FBBF24' },
  { id: 'other', label: 'Other', emoji: '\u{2728}', color: '#94A3B8' },
];

export function getCategory(id) {
  return CATEGORIES.find((c) => c.id === id) ?? CATEGORIES[CATEGORIES.length - 1];
}
