const CATEGORIES = [
  { id: 'food', label: 'Food', emoji: 'hamburger-01', color: '#D97706', external: false },
  { id: 'groceries', label: 'Groceries', emoji: 'shopping-cart-01', color: '#34A05F', external: false },
  { id: 'transport', label: 'Transport', emoji: 'taxi', color: '#3193CE', external: false },
  { id: 'shopping', label: 'Shopping', emoji: 'shopping-bag-01', color: '#CC5C9F', external: false },
  { id: 'fun', label: 'Fun', emoji: 'game-controller-01', color: '#8A63D2', external: false },
  { id: 'health', label: 'Health', emoji: 'medicine-01', color: '#D05353', external: false },
  { id: 'bills', label: 'Bills', emoji: 'invoice-01', color: '#C29213', external: true },
  { id: 'other', label: 'Other', emoji: 'sparkles', color: '#8A7A66', external: false },
];

const FALLBACK_CATEGORY = CATEGORIES.find((c) => c.id === 'other');

// customCategories holds user-created categories, but may also carry entries
// whose id matches a built-in: a full category object overrides that preset
// in place (edited preset), and `{ id, deleted: true }` hides it (deleted
// preset). This keeps presets editable/deletable without a second setting —
// the array already persists and syncs as-is.
export function getAllCategories(customCategories = []) {
  const extras = Array.isArray(customCategories) ? customCategories : [];
  const byId = new Map(extras.map((c) => [c.id, c]));
  return [
    ...CATEGORIES.map((c) => byId.get(c.id) ?? c),
    ...extras.filter((c) => !isPresetCategory(c.id)),
  ].filter((c) => !c.deleted);
}

export function isPresetCategory(id) {
  return CATEGORIES.some((c) => c.id === id);
}

export function getRegularAll(customCategories = []) {
  return getAllCategories(customCategories).filter((c) => !c.external);
}

export function getExternalAll(customCategories = []) {
  return getAllCategories(customCategories).filter((c) => c.external);
}

export function getCategory(id, customCategories = []) {
  const all = getAllCategories(customCategories);
  // Fall back to 'other' for unknown/deleted ids; if 'other' itself was
  // deleted, the static preset still labels those orphaned expenses.
  return all.find((c) => c.id === id) ?? all.find((c) => c.id === 'other') ?? FALLBACK_CATEGORY;
}

export function getCategoryLabel(category, t) {
  if (category.custom) return category.label;
  return t('cat.' + category.id);
}

export function generateCategoryId() {
  return `c_${Date.now().toString(36)}_${Math.random().toString(36).slice(2, 6)}`;
}

export const EMOJI_OPTIONS = [
  'home-01', 'car-01', 'airplane-01', 'book-headphones',
  'music-note-01', 'game-controller-01', 'laptop', 'smart-phone-01',
  't-shirt', 'blush-brush-01', 'gift', 'footprints',
  'coffee-01', 'pizza-01', 'bottle-wine', 'dumbbell-01',
  'graduation-cap', 'baby-01', 'briefcase-01', 'wrench-01',
  'building-01', 'tv-01', 'leaf-01', 'star-circle',
];

export const COLOR_OPTIONS = [
  '#D97706', '#34A05F', '#3193CE', '#CC5C9F',
  '#8A63D2', '#D05353', '#C29213', '#8A7A66',
  '#2D9CDB', '#27AE60', '#E74C3C', '#9B59B6',
  '#0D9488', '#4338CA', '#EC4899', '#78716C',
  '#1E3A5F', '#6B8E23',
];
