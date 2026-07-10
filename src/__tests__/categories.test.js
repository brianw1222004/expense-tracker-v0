// NOTE: The actual categories.js API passes customCategories as a parameter
// to each function rather than using module-level state. This matches the
// real source file on disk (the CLAUDE.md architecture section described an
// older design with setCustomCategories/module-level _custom state that was
// never implemented in the current codebase).

const {
  getCategory,
  getAllCategories,
  getRegularAll,
  getExternalAll,
  generateCategoryId,
  isPresetCategory,
  EMOJI_OPTIONS,
  COLOR_OPTIONS,
} = require('../categories');

// ---------------------------------------------------------------------------
// Built-in category IDs
// ---------------------------------------------------------------------------
const BUILTIN_IDS = ['food', 'groceries', 'transport', 'shopping', 'fun', 'health', 'bills', 'other'];
const REGULAR_IDS = ['food', 'groceries', 'transport', 'shopping', 'fun', 'health', 'other'];
const EXTERNAL_IDS = ['bills'];

// Custom category fixtures
const CUSTOM_REG = { id: 'c_gym', label: 'Gym', emoji: 'dumbbell-01', color: '#FF0000', external: false, custom: true };
const CUSTOM_EXT = { id: 'c_rent', label: 'Rent', emoji: 'building-01', color: '#0000FF', external: true, custom: true };

// ---------------------------------------------------------------------------
// getAllCategories()
// ---------------------------------------------------------------------------
describe('getAllCategories()', () => {
  it('returns exactly 8 built-in categories with no custom list', () => {
    expect(getAllCategories()).toHaveLength(8);
    expect(getAllCategories([])).toHaveLength(8);
  });

  it('returns all 8 expected built-in IDs', () => {
    const ids = getAllCategories().map((c) => c.id);
    BUILTIN_IDS.forEach((id) => expect(ids).toContain(id));
  });

  it('each category has id, label, emoji, color, and external fields', () => {
    getAllCategories().forEach((c) => {
      expect(typeof c.id).toBe('string');
      expect(typeof c.label).toBe('string');
      expect(typeof c.emoji).toBe('string');
      expect(typeof c.color).toBe('string');
      expect(typeof c.external).toBe('boolean');
    });
  });

  it('includes custom categories when passed', () => {
    const all = getAllCategories([CUSTOM_REG]);
    expect(all).toHaveLength(9);
    expect(all.map((c) => c.id)).toContain('c_gym');
  });

  it('built-in categories appear before custom categories', () => {
    const all = getAllCategories([CUSTOM_REG]);
    expect(all[8].id).toBe('c_gym');
    expect(BUILTIN_IDS).toContain(all[0].id);
  });

  it('ignores non-array custom list (falls back to empty)', () => {
    expect(getAllCategories(null)).toHaveLength(8);
    expect(getAllCategories(undefined)).toHaveLength(8);
    expect(getAllCategories('invalid')).toHaveLength(8);
  });

  it('includes multiple custom categories', () => {
    const custom = [CUSTOM_REG, CUSTOM_EXT];
    expect(getAllCategories(custom)).toHaveLength(10);
  });
});

// ---------------------------------------------------------------------------
// getRegularAll()
// ---------------------------------------------------------------------------
describe('getRegularAll()', () => {
  it('excludes external categories from built-ins', () => {
    const regular = getRegularAll();
    EXTERNAL_IDS.forEach((id) => {
      expect(regular.map((c) => c.id)).not.toContain(id);
    });
  });

  it('includes all 7 regular built-in categories', () => {
    const regular = getRegularAll();
    expect(regular).toHaveLength(7);
    REGULAR_IDS.forEach((id) => expect(regular.map((c) => c.id)).toContain(id));
  });

  it('includes regular custom categories', () => {
    const regular = getRegularAll([CUSTOM_REG]);
    expect(regular.map((c) => c.id)).toContain('c_gym');
  });

  it('excludes external custom categories', () => {
    const regular = getRegularAll([CUSTOM_EXT]);
    expect(regular.map((c) => c.id)).not.toContain('c_rent');
  });

  it('every returned category has external === false', () => {
    getRegularAll([CUSTOM_REG, CUSTOM_EXT]).forEach((c) => expect(c.external).toBe(false));
  });

  it('includes both regular built-ins and regular custom together', () => {
    const regular = getRegularAll([CUSTOM_REG, CUSTOM_EXT]);
    // 7 regular built-ins + 1 regular custom = 8
    expect(regular).toHaveLength(8);
  });
});

// ---------------------------------------------------------------------------
// getExternalAll()
// ---------------------------------------------------------------------------
describe('getExternalAll()', () => {
  it('returns only the bills built-in category by default', () => {
    const external = getExternalAll();
    expect(external).toHaveLength(1);
    expect(external[0].id).toBe('bills');
  });

  it('every returned category has external === true', () => {
    getExternalAll([CUSTOM_REG, CUSTOM_EXT]).forEach((c) => expect(c.external).toBe(true));
  });

  it('includes external custom categories', () => {
    const external = getExternalAll([CUSTOM_EXT]);
    expect(external).toHaveLength(2);
    expect(external.map((c) => c.id)).toContain('c_rent');
  });

  it('excludes regular custom categories', () => {
    const external = getExternalAll([CUSTOM_REG]);
    expect(external.map((c) => c.id)).not.toContain('c_gym');
  });

  it('handles an empty custom list', () => {
    expect(getExternalAll([])).toHaveLength(1); // just bills
  });
});

// ---------------------------------------------------------------------------
// getCategory()
// ---------------------------------------------------------------------------
describe('getCategory()', () => {
  describe('known built-in IDs', () => {
    BUILTIN_IDS.forEach((id) => {
      it(`returns the correct category for '${id}'`, () => {
        const cat = getCategory(id);
        expect(cat.id).toBe(id);
      });
    });
  });

  it("returns the 'other' category for unknown IDs", () => {
    const cat = getCategory('unknown-id-xyz');
    expect(cat.id).toBe('other');
  });

  it("returns 'other' for undefined input", () => {
    const cat = getCategory(undefined);
    expect(cat.id).toBe('other');
  });

  it("returns 'other' for null input", () => {
    const cat = getCategory(null);
    expect(cat.id).toBe('other');
  });

  it("returns 'other' for empty string", () => {
    const cat = getCategory('');
    expect(cat.id).toBe('other');
  });

  it('returns a custom category when passed in the custom list', () => {
    const cat = getCategory('c_gym', [CUSTOM_REG]);
    expect(cat.id).toBe('c_gym');
    expect(cat.label).toBe('Gym');
  });

  it('falls back to other when custom id not in the provided list', () => {
    const cat = getCategory('c_gym', []);
    expect(cat.id).toBe('other');
  });

  it('food category has the correct color', () => {
    const cat = getCategory('food');
    expect(cat.color).toBe('#D97706');
  });

  it('bills category is external', () => {
    const cat = getCategory('bills');
    expect(cat.external).toBe(true);
  });

  it('food category is not external', () => {
    const cat = getCategory('food');
    expect(cat.external).toBe(false);
  });

  it('bills label is Bills', () => {
    const cat = getCategory('bills');
    expect(cat.label).toBe('Bills');
  });

  it('transport emoji is taxi', () => {
    const cat = getCategory('transport');
    expect(cat.emoji).toBe('taxi');
  });

  it('other emoji is sparkles', () => {
    const cat = getCategory('other');
    expect(cat.emoji).toBe('sparkles');
  });
});

// ---------------------------------------------------------------------------
// Preset overrides & tombstones (edit/delete built-ins via customCategories)
// ---------------------------------------------------------------------------
describe('preset overrides and tombstones', () => {
  const OVERRIDE = { id: 'food', label: 'Meals', emoji: 'pizza-01', color: '#111111', external: false, custom: true };
  const TOMBSTONE = { id: 'transport', deleted: true };

  it('an entry with a built-in id overrides that preset in place', () => {
    const all = getAllCategories([OVERRIDE]);
    expect(all).toHaveLength(8);
    expect(all[0].id).toBe('food'); // keeps preset position
    expect(all[0].label).toBe('Meals');
  });

  it('a { id, deleted } tombstone hides the preset from all lists', () => {
    const all = getAllCategories([TOMBSTONE]);
    expect(all).toHaveLength(7);
    expect(all.map((c) => c.id)).not.toContain('transport');
    expect(getRegularAll([TOMBSTONE]).map((c) => c.id)).not.toContain('transport');
  });

  it('getCategory resolves overrides and sends deleted ids to other', () => {
    expect(getCategory('food', [OVERRIDE]).label).toBe('Meals');
    expect(getCategory('transport', [TOMBSTONE]).id).toBe('other');
  });

  it("still labels orphans as other even when 'other' itself is deleted", () => {
    expect(getCategory('nope', [{ id: 'other', deleted: true }]).id).toBe('other');
  });

  it('isPresetCategory distinguishes built-in ids from custom ones', () => {
    expect(isPresetCategory('food')).toBe(true);
    expect(isPresetCategory('c_gym')).toBe(false);
  });
});

// ---------------------------------------------------------------------------
// generateCategoryId()
// ---------------------------------------------------------------------------
describe('generateCategoryId()', () => {
  it('returns a string', () => {
    expect(typeof generateCategoryId()).toBe('string');
  });

  it('starts with "c_"', () => {
    expect(generateCategoryId()).toMatch(/^c_/);
  });

  it('returns unique IDs on consecutive calls', () => {
    const ids = new Set();
    for (let i = 0; i < 20; i++) {
      ids.add(generateCategoryId());
    }
    // All 20 generated IDs should be unique
    expect(ids.size).toBe(20);
  });

  it('generated ID does not collide with any built-in ID', () => {
    for (let i = 0; i < 10; i++) {
      const id = generateCategoryId();
      expect(BUILTIN_IDS).not.toContain(id);
    }
  });

  it('has more than just "c_" prefix (contains timestamp/random part)', () => {
    const id = generateCategoryId();
    expect(id.length).toBeGreaterThan(5);
  });
});

// ---------------------------------------------------------------------------
// EMOJI_OPTIONS
// ---------------------------------------------------------------------------
describe('EMOJI_OPTIONS', () => {
  it('is an array', () => {
    expect(Array.isArray(EMOJI_OPTIONS)).toBe(true);
  });

  it('has 24 entries', () => {
    expect(EMOJI_OPTIONS).toHaveLength(24);
  });

  it('all entries are non-empty strings', () => {
    EMOJI_OPTIONS.forEach((e) => {
      expect(typeof e).toBe('string');
      expect(e.length).toBeGreaterThan(0);
    });
  });

  it('contains expected built-in icon keys', () => {
    expect(EMOJI_OPTIONS).toContain('home-01');
    expect(EMOJI_OPTIONS).toContain('dumbbell-01');
    expect(EMOJI_OPTIONS).toContain('star-circle');
  });
});

// ---------------------------------------------------------------------------
// COLOR_OPTIONS
// ---------------------------------------------------------------------------
describe('COLOR_OPTIONS', () => {
  it('is an array', () => {
    expect(Array.isArray(COLOR_OPTIONS)).toBe(true);
  });

  it('has 18 entries', () => {
    expect(COLOR_OPTIONS).toHaveLength(18);
  });

  it('all entries are 7-character hex color strings', () => {
    COLOR_OPTIONS.forEach((c) => {
      expect(c).toMatch(/^#[0-9A-Fa-f]{6}$/);
    });
  });

  it('all colors are unique', () => {
    const unique = new Set(COLOR_OPTIONS);
    expect(unique.size).toBe(COLOR_OPTIONS.length);
  });
});
