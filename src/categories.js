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

let _custom = [];

export function setCustomCategories(list) {
  _custom = Array.isArray(list) ? list : [];
}

export function getAllCategories() {
  return [...CATEGORIES, ..._custom];
}

export function getRegularAll() {
  return getAllCategories().filter((c) => !c.external);
}

export function getExternalAll() {
  return getAllCategories().filter((c) => c.external);
}

export function getCategory(id) {
  return getAllCategories().find((c) => c.id === id) ?? FALLBACK_CATEGORY;
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
];
