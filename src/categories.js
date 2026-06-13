// Colors are mid-tone so chips, bars and icon tints read on BOTH themes (the
// cream 'cookie' background and the navy 'midnight' one) — neither neon-bright
// nor muddy. Labels here are the English fallback; screens render the
// translated name via t(`cat.${id}`).
export const CATEGORIES = [
  { id: 'food', label: 'Food', emoji: '\u{1F354}', color: '#D97706' },
  { id: 'groceries', label: 'Groceries', emoji: '\u{1F6D2}', color: '#34A05F' },
  { id: 'transport', label: 'Transport', emoji: '\u{1F695}', color: '#3193CE' },
  { id: 'shopping', label: 'Shopping', emoji: '\u{1F6CD}\u{FE0F}', color: '#CC5C9F' },
  { id: 'fun', label: 'Fun', emoji: '\u{1F3AC}', color: '#8A63D2' },
  { id: 'health', label: 'Health', emoji: '\u{1F48A}', color: '#D05353' },
  { id: 'bills', label: 'Bills', emoji: '\u{1F9FE}', color: '#C29213' },
  { id: 'other', label: 'Other', emoji: '\u{2728}', color: '#8A7A66' },
];

export function getCategory(id) {
  return CATEGORIES.find((c) => c.id === id) ?? CATEGORIES[CATEGORIES.length - 1];
}
