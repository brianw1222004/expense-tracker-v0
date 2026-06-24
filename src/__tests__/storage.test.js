// Tests for src/storage.js — load/save functions, DEFAULT_SETTINGS, withDefaults
// normalization rules, per-user key scoping, and legacy-entry normalization.
//
// Convention: Jest globals (describe/test/expect/beforeEach) are auto-injected.
// Modules are required() directly. The async-storage mock in __mocks__/ exposes a
// real in-memory store with a clear() method; we call it in beforeEach so cases
// don't bleed.

const AsyncStorage = require('@react-native-async-storage/async-storage');

const {
  DEFAULT_SETTINGS,
  LOCAL_USER,
  loadSettings,
  saveSettings,
  loadExpenses,
  saveExpenses,
  loadIncome,
  saveIncome,
} = require('../storage');

// ---------------------------------------------------------------------------
// Reset the mock store before every test so cases are fully independent.
// ---------------------------------------------------------------------------
beforeEach(async () => {
  await AsyncStorage.clear();
  // Also clear mock call history so call-count assertions start from zero.
  AsyncStorage.setItem.mockClear();
  AsyncStorage.getItem.mockClear();
});

// ---------------------------------------------------------------------------
// DEFAULT_SETTINGS shape
// ---------------------------------------------------------------------------
describe('DEFAULT_SETTINGS', () => {
  test('contains firstName and lastName as empty strings', () => {
    expect(DEFAULT_SETTINGS.firstName).toBe('');
    expect(DEFAULT_SETTINGS.lastName).toBe('');
  });

  test('onboardingDone defaults to false', () => {
    expect(DEFAULT_SETTINGS.onboardingDone).toBe(false);
  });

  test('categoryBudgets defaults to an empty object', () => {
    expect(DEFAULT_SETTINGS.categoryBudgets).toEqual({});
  });

  test('customCategories defaults to an empty array', () => {
    expect(Array.isArray(DEFAULT_SETTINGS.customCategories)).toBe(true);
    expect(DEFAULT_SETTINGS.customCategories).toHaveLength(0);
  });

  test('theme defaults to neutral', () => {
    expect(DEFAULT_SETTINGS.theme).toBe('neutral');
  });

  test('language defaults to en', () => {
    expect(DEFAULT_SETTINGS.language).toBe('en');
  });

  test('monthlyBudget defaults to 0', () => {
    expect(DEFAULT_SETTINGS.monthlyBudget).toBe(0);
  });
});

// ---------------------------------------------------------------------------
// loadSettings — fresh install (nothing in cache)
// ---------------------------------------------------------------------------
describe('loadSettings() — fresh install', () => {
  test('returns all DEFAULT_SETTINGS fields when cache is empty', async () => {
    const settings = await loadSettings(LOCAL_USER);
    expect(settings.displayCurrency).toBe(DEFAULT_SETTINGS.displayCurrency);
    expect(settings.monthlyBudget).toBe(DEFAULT_SETTINGS.monthlyBudget);
    expect(settings.theme).toBe(DEFAULT_SETTINGS.theme);
    expect(settings.language).toBe(DEFAULT_SETTINGS.language);
  });

  test('returns firstName and lastName as empty strings on fresh install', async () => {
    const settings = await loadSettings(LOCAL_USER);
    expect(settings.firstName).toBe('');
    expect(settings.lastName).toBe('');
  });

  test('returns onboardingDone as false on fresh install', async () => {
    const settings = await loadSettings(LOCAL_USER);
    expect(settings.onboardingDone).toBe(false);
  });

  test('returns categoryBudgets as an object', async () => {
    const settings = await loadSettings(LOCAL_USER);
    expect(settings.categoryBudgets).toEqual({});
    expect(typeof settings.categoryBudgets).toBe('object');
  });

  test('returns customCategories as an array', async () => {
    const settings = await loadSettings(LOCAL_USER);
    expect(Array.isArray(settings.customCategories)).toBe(true);
  });
});

// ---------------------------------------------------------------------------
// loadSettings — merging DEFAULT_SETTINGS over a partial cached object
// ---------------------------------------------------------------------------
describe('loadSettings() — partial cache merging', () => {
  test('missing keys are filled from DEFAULT_SETTINGS', async () => {
    // Cache only has displayCurrency and monthlyBudget; everything else is absent.
    const partial = { displayCurrency: 'EUR', monthlyBudget: 500 };
    await saveSettings(LOCAL_USER, partial);

    const settings = await loadSettings(LOCAL_USER);

    // Keys that were in the cache
    expect(settings.displayCurrency).toBe('EUR');
    expect(settings.monthlyBudget).toBe(500);

    // Keys filled from defaults
    expect(settings.theme).toBe(DEFAULT_SETTINGS.theme);
    expect(settings.language).toBe(DEFAULT_SETTINGS.language);
    expect(Array.isArray(settings.customCategories)).toBe(true);
  });

  test('present keys in cache are preserved and not overwritten by defaults', async () => {
    const cached = {
      ...DEFAULT_SETTINGS,
      theme: 'slate',
      language: 'zh',
      monthlyBudget: 1200,
      onboardingDone: true,
    };
    await saveSettings(LOCAL_USER, cached);

    const settings = await loadSettings(LOCAL_USER);

    expect(settings.theme).toBe('slate');
    expect(settings.language).toBe('zh');
    expect(settings.monthlyBudget).toBe(1200);
    expect(settings.onboardingDone).toBe(true);
  });

  test('firstName and lastName survive a save→load round-trip', async () => {
    const full = { ...DEFAULT_SETTINGS, firstName: 'Ada', lastName: 'Lovelace', onboardingDone: true };
    await saveSettings(LOCAL_USER, full);

    const settings = await loadSettings(LOCAL_USER);

    expect(settings.firstName).toBe('Ada');
    expect(settings.lastName).toBe('Lovelace');
  });
});

// ---------------------------------------------------------------------------
// loadSettings — onboardingDone backfill rule
// ---------------------------------------------------------------------------
describe('loadSettings() — onboardingDone backfill', () => {
  test('a cached object that LACKS onboardingDone is treated as already-onboarded (true)', async () => {
    // Simulate an older cache written before the onboardingDone field existed.
    // We write directly to AsyncStorage so the key is absent in the stored JSON.
    const legacySettings = { displayCurrency: 'USD', monthlyBudget: 0, theme: 'neutral', language: 'en' };
    // Note: legacySettings deliberately has no onboardingDone field.
    await AsyncStorage.setItem('@expense-tracker/settings', JSON.stringify(legacySettings));

    const settings = await loadSettings(LOCAL_USER);

    // The backfill rule: if parsed object exists and lacks onboardingDone, set it to true.
    expect(settings.onboardingDone).toBe(true);
  });

  test('a truly empty/fresh cache keeps onboardingDone as false (default)', async () => {
    // Nothing in storage — withDefaults(null) path, not the backfill branch.
    const settings = await loadSettings(LOCAL_USER);
    expect(settings.onboardingDone).toBe(false);
  });

  test('an explicit onboardingDone: false in the cache is preserved as false', async () => {
    const cached = { ...DEFAULT_SETTINGS, onboardingDone: false };
    await saveSettings(LOCAL_USER, cached);

    const settings = await loadSettings(LOCAL_USER);

    // onboardingDone is explicitly present (=== false), so the backfill must NOT fire.
    expect(settings.onboardingDone).toBe(false);
  });

  test('an explicit onboardingDone: true in the cache is preserved as true', async () => {
    const cached = { ...DEFAULT_SETTINGS, onboardingDone: true };
    await saveSettings(LOCAL_USER, cached);

    const settings = await loadSettings(LOCAL_USER);

    expect(settings.onboardingDone).toBe(true);
  });
});

// ---------------------------------------------------------------------------
// loadSettings — categoryBudgets isolation (mutation must not pollute DEFAULT_SETTINGS)
// ---------------------------------------------------------------------------
describe('loadSettings() — categoryBudgets isolation', () => {
  test('mutating the loaded categoryBudgets does not mutate DEFAULT_SETTINGS', async () => {
    const settings = await loadSettings(LOCAL_USER);
    settings.categoryBudgets['food'] = 300;

    // A second load should still return a fresh empty object, not the mutated one.
    const settings2 = await loadSettings(LOCAL_USER);
    expect(settings2.categoryBudgets['food']).toBeUndefined();

    // DEFAULT_SETTINGS itself must also be untouched.
    expect(DEFAULT_SETTINGS.categoryBudgets['food']).toBeUndefined();
  });

  test('two successive loads each return independent categoryBudgets objects', async () => {
    const s1 = await loadSettings(LOCAL_USER);
    const s2 = await loadSettings(LOCAL_USER);
    expect(s1.categoryBudgets).not.toBe(s2.categoryBudgets);
  });

  test('a cached non-object categoryBudgets is coerced to an empty object', async () => {
    // Write a cache where categoryBudgets is a string (corrupt/legacy data).
    const corrupt = { ...DEFAULT_SETTINGS, categoryBudgets: 'bad-value' };
    await saveSettings(LOCAL_USER, corrupt);

    const settings = await loadSettings(LOCAL_USER);

    expect(typeof settings.categoryBudgets).toBe('object');
    expect(settings.categoryBudgets).not.toBeNull();
    expect(Array.isArray(settings.categoryBudgets)).toBe(false);
  });
});

// ---------------------------------------------------------------------------
// loadSettings — customCategories coercion
// ---------------------------------------------------------------------------
describe('loadSettings() — customCategories coercion', () => {
  test('a cached non-array customCategories is coerced to an empty array', async () => {
    const corrupt = { ...DEFAULT_SETTINGS, customCategories: 'not-an-array' };
    await saveSettings(LOCAL_USER, corrupt);

    const settings = await loadSettings(LOCAL_USER);

    expect(Array.isArray(settings.customCategories)).toBe(true);
    expect(settings.customCategories).toHaveLength(0);
  });

  test('a cached null customCategories is coerced to an empty array', async () => {
    const corrupt = { ...DEFAULT_SETTINGS, customCategories: null };
    await saveSettings(LOCAL_USER, corrupt);

    const settings = await loadSettings(LOCAL_USER);

    expect(Array.isArray(settings.customCategories)).toBe(true);
  });

  test('a valid array of custom categories is preserved through round-trip', async () => {
    const custom = [{ id: 'c_test', label: 'Test', emoji: 'star', color: '#FF0000', external: false, custom: true }];
    const cached = { ...DEFAULT_SETTINGS, customCategories: custom, onboardingDone: true };
    await saveSettings(LOCAL_USER, cached);

    const settings = await loadSettings(LOCAL_USER);

    expect(Array.isArray(settings.customCategories)).toBe(true);
    expect(settings.customCategories).toHaveLength(1);
    expect(settings.customCategories[0].id).toBe('c_test');
  });
});

// ---------------------------------------------------------------------------
// Per-user key scoping
// ---------------------------------------------------------------------------
describe('per-user key scoping', () => {
  test('LOCAL_USER uses the un-suffixed key (@expense-tracker/expenses)', async () => {
    await saveExpenses(LOCAL_USER, [{ id: 'e1', amount: 10, currency: 'USD' }]);

    // The mock should have been called with the base key (no suffix).
    const calls = AsyncStorage.setItem.mock.calls;
    expect(calls[0][0]).toBe('@expense-tracker/expenses');
  });

  test('a real userId uses a suffixed key (@expense-tracker/expenses:userId)', async () => {
    await saveExpenses('user-abc-123', [{ id: 'e2', amount: 20, currency: 'EUR' }]);

    const calls = AsyncStorage.setItem.mock.calls;
    expect(calls[0][0]).toBe('@expense-tracker/expenses:user-abc-123');
  });

  test('two different userIds have independent expense storage (no bleed)', async () => {
    const expensesUser1 = [{ id: 'e1', amount: 100, currency: 'USD', note: 'u1', category: 'food', createdAt: 1 }];
    const expensesUser2 = [{ id: 'e2', amount: 200, currency: 'EUR', note: 'u2', category: 'fun', createdAt: 2 }];

    await saveExpenses('user-1', expensesUser1);
    await saveExpenses('user-2', expensesUser2);

    const loaded1 = await loadExpenses('user-1');
    const loaded2 = await loadExpenses('user-2');

    expect(loaded1).toHaveLength(1);
    expect(loaded1[0].id).toBe('e1');
    expect(loaded2).toHaveLength(1);
    expect(loaded2[0].id).toBe('e2');
  });

  test('LOCAL_USER settings do not bleed into a real userId', async () => {
    await saveSettings(LOCAL_USER, { ...DEFAULT_SETTINGS, theme: 'slate', onboardingDone: true });
    await saveSettings('user-xyz', { ...DEFAULT_SETTINGS, theme: 'sand', onboardingDone: true });

    const localSettings = await loadSettings(LOCAL_USER);
    const userSettings = await loadSettings('user-xyz');

    expect(localSettings.theme).toBe('slate');
    expect(userSettings.theme).toBe('sand');
  });

  test('LOCAL_USER income key is un-suffixed (@expense-tracker/income)', async () => {
    await saveIncome(LOCAL_USER, [{ id: 'i1', amount: 500, currency: 'USD', source: 'salary', note: '', createdAt: 1 }]);

    const calls = AsyncStorage.setItem.mock.calls;
    expect(calls[0][0]).toBe('@expense-tracker/income');
  });

  test('a real userId income uses a suffixed key', async () => {
    await saveIncome('user-def', []);

    const calls = AsyncStorage.setItem.mock.calls;
    expect(calls[0][0]).toBe('@expense-tracker/income:user-def');
  });
});

// ---------------------------------------------------------------------------
// loadExpenses — legacy normalization (missing currency → USD)
// ---------------------------------------------------------------------------
describe('loadExpenses() — legacy normalization', () => {
  test('returns empty array when nothing is cached', async () => {
    const result = await loadExpenses(LOCAL_USER);
    expect(result).toEqual([]);
  });

  test('entries missing currency are normalized to USD', async () => {
    // Write legacy-format entries (no currency field) directly to AsyncStorage.
    const legacy = [{ id: 'e1', amount: 50, note: 'old', category: 'food', createdAt: 1000 }];
    await AsyncStorage.setItem('@expense-tracker/expenses', JSON.stringify(legacy));

    const result = await loadExpenses(LOCAL_USER);

    expect(result).toHaveLength(1);
    expect(result[0].currency).toBe('USD');
    expect(result[0].id).toBe('e1');
  });

  test('entries that already have a currency are left unchanged', async () => {
    const modern = [
      { id: 'e2', amount: 200, currency: 'JPY', note: '', category: 'food', createdAt: 2000 },
      { id: 'e3', amount: 30, currency: 'EUR', note: '', category: 'fun', createdAt: 3000 },
    ];
    await AsyncStorage.setItem('@expense-tracker/expenses', JSON.stringify(modern));

    const result = await loadExpenses(LOCAL_USER);

    expect(result[0].currency).toBe('JPY');
    expect(result[1].currency).toBe('EUR');
  });

  test('mixed legacy and modern entries are normalized correctly', async () => {
    const mixed = [
      { id: 'e1', amount: 10, note: 'no currency' },          // legacy
      { id: 'e2', amount: 20, currency: 'GBP', note: 'has currency' }, // modern
    ];
    await AsyncStorage.setItem('@expense-tracker/expenses', JSON.stringify(mixed));

    const result = await loadExpenses(LOCAL_USER);

    expect(result[0].currency).toBe('USD');
    expect(result[1].currency).toBe('GBP');
  });

  test('returns empty array when cached value is not an array (corrupt data)', async () => {
    await AsyncStorage.setItem('@expense-tracker/expenses', JSON.stringify({ bad: 'data' }));
    const result = await loadExpenses(LOCAL_USER);
    expect(result).toEqual([]);
  });

  test('returns empty array on malformed JSON', async () => {
    await AsyncStorage.setItem('@expense-tracker/expenses', 'not-valid-json!!!');
    const result = await loadExpenses(LOCAL_USER);
    expect(result).toEqual([]);
  });
});

// ---------------------------------------------------------------------------
// saveExpenses / loadExpenses — round-trip
// ---------------------------------------------------------------------------
describe('saveExpenses() + loadExpenses() round-trip', () => {
  test('saved expenses are loaded back accurately', async () => {
    const expenses = [
      { id: 'e1', amount: 12.5, currency: 'USD', note: 'lunch', category: 'food', createdAt: 111 },
      { id: 'e2', amount: 5000, currency: 'JPY', note: '', category: 'fun', createdAt: 222 },
    ];
    await saveExpenses(LOCAL_USER, expenses);
    const result = await loadExpenses(LOCAL_USER);

    expect(result).toHaveLength(2);
    expect(result[0].id).toBe('e1');
    expect(result[0].amount).toBe(12.5);
    expect(result[0].currency).toBe('USD');
    expect(result[1].currency).toBe('JPY');
  });

  test('saving an empty array is loaded back as an empty array', async () => {
    await saveExpenses(LOCAL_USER, []);
    const result = await loadExpenses(LOCAL_USER);
    expect(result).toEqual([]);
  });
});

// ---------------------------------------------------------------------------
// loadIncome — legacy normalization
// ---------------------------------------------------------------------------
describe('loadIncome() — legacy normalization', () => {
  test('returns empty array when nothing is cached', async () => {
    const result = await loadIncome(LOCAL_USER);
    expect(result).toEqual([]);
  });

  test('entries missing currency are defaulted to USD', async () => {
    const legacy = [{ id: 'i1', amount: 3000, source: 'salary', note: 'paycheck', createdAt: 1 }];
    await AsyncStorage.setItem('@expense-tracker/income', JSON.stringify(legacy));

    const result = await loadIncome(LOCAL_USER);

    expect(result[0].currency).toBe('USD');
  });

  test('entries missing source are defaulted to "other"', async () => {
    const legacy = [{ id: 'i1', amount: 100, currency: 'USD', createdAt: 1 }];
    await AsyncStorage.setItem('@expense-tracker/income', JSON.stringify(legacy));

    const result = await loadIncome(LOCAL_USER);

    expect(result[0].source).toBe('other');
  });

  test('entries missing note are defaulted to empty string', async () => {
    const legacy = [{ id: 'i1', amount: 100, currency: 'USD', source: 'salary', createdAt: 1 }];
    await AsyncStorage.setItem('@expense-tracker/income', JSON.stringify(legacy));

    const result = await loadIncome(LOCAL_USER);

    expect(result[0].note).toBe('');
  });

  test('entries with an explicit null note are defaulted to empty string', async () => {
    // note: null — the ?? '' operator converts null to ''.
    const data = [{ id: 'i1', amount: 200, currency: 'EUR', source: 'freelance', note: null, createdAt: 2 }];
    await AsyncStorage.setItem('@expense-tracker/income', JSON.stringify(data));

    const result = await loadIncome(LOCAL_USER);

    expect(result[0].note).toBe('');
  });

  test('entries with an explicit empty-string note preserve the empty string', async () => {
    const data = [{ id: 'i1', amount: 200, currency: 'EUR', source: 'freelance', note: '', createdAt: 2 }];
    await AsyncStorage.setItem('@expense-tracker/income', JSON.stringify(data));

    const result = await loadIncome(LOCAL_USER);

    expect(result[0].note).toBe('');
  });

  test('fully-populated income entries are passed through unchanged', async () => {
    const full = [{ id: 'i1', amount: 999, currency: 'GBP', source: 'side_income', note: 'gig', createdAt: 3 }];
    await AsyncStorage.setItem('@expense-tracker/income', JSON.stringify(full));

    const result = await loadIncome(LOCAL_USER);

    expect(result[0].currency).toBe('GBP');
    expect(result[0].source).toBe('side_income');
    expect(result[0].note).toBe('gig');
  });

  test('returns empty array when cached value is not an array', async () => {
    await AsyncStorage.setItem('@expense-tracker/income', JSON.stringify('bad'));
    const result = await loadIncome(LOCAL_USER);
    expect(result).toEqual([]);
  });

  test('returns empty array on malformed JSON', async () => {
    await AsyncStorage.setItem('@expense-tracker/income', '{bad json');
    const result = await loadIncome(LOCAL_USER);
    expect(result).toEqual([]);
  });
});

// ---------------------------------------------------------------------------
// saveIncome / loadIncome — round-trip
// ---------------------------------------------------------------------------
describe('saveIncome() + loadIncome() round-trip', () => {
  test('saved income entries are loaded back accurately', async () => {
    const income = [
      { id: 'i1', amount: 5000, currency: 'USD', source: 'salary', note: 'june', createdAt: 1 },
      { id: 'i2', amount: 200, currency: 'EUR', source: 'freelance', note: '', createdAt: 2 },
    ];
    await saveIncome(LOCAL_USER, income);
    const result = await loadIncome(LOCAL_USER);

    expect(result).toHaveLength(2);
    expect(result[0].id).toBe('i1');
    expect(result[0].source).toBe('salary');
    expect(result[1].currency).toBe('EUR');
    expect(result[1].note).toBe('');
  });

  test('saving an empty income array is loaded back as empty', async () => {
    await saveIncome(LOCAL_USER, []);
    const result = await loadIncome(LOCAL_USER);
    expect(result).toEqual([]);
  });
});

// ---------------------------------------------------------------------------
// Boundary values
// ---------------------------------------------------------------------------
describe('boundary values', () => {
  test('expenses with amount zero are stored and loaded correctly', async () => {
    const expenses = [{ id: 'e0', amount: 0, currency: 'USD', note: '', category: 'other', createdAt: 1 }];
    await saveExpenses(LOCAL_USER, expenses);
    const result = await loadExpenses(LOCAL_USER);
    expect(result[0].amount).toBe(0);
  });

  test('income with very large amount survives round-trip without precision loss', async () => {
    // Use a value safely representable as a JS float.
    const income = [{ id: 'i1', amount: 9999999, currency: 'JPY', source: 'salary', note: '', createdAt: 1 }];
    await saveIncome(LOCAL_USER, income);
    const result = await loadIncome(LOCAL_USER);
    expect(result[0].amount).toBe(9999999);
  });

  test('settings with empty-string firstName and lastName are preserved', async () => {
    const s = { ...DEFAULT_SETTINGS, firstName: '', lastName: '', onboardingDone: true };
    await saveSettings(LOCAL_USER, s);
    const result = await loadSettings(LOCAL_USER);
    expect(result.firstName).toBe('');
    expect(result.lastName).toBe('');
  });

  test('settings with single-character firstName are preserved', async () => {
    const s = { ...DEFAULT_SETTINGS, firstName: 'X', onboardingDone: true };
    await saveSettings(LOCAL_USER, s);
    const result = await loadSettings(LOCAL_USER);
    expect(result.firstName).toBe('X');
  });

  test('settings with monthlyBudget of 0 (no budget set) are preserved', async () => {
    const s = { ...DEFAULT_SETTINGS, monthlyBudget: 0, onboardingDone: true };
    await saveSettings(LOCAL_USER, s);
    const result = await loadSettings(LOCAL_USER);
    expect(result.monthlyBudget).toBe(0);
  });
});
