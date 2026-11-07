jest.mock('../supabase', () => ({ isSupabaseConfigured: true, supabase: { from: jest.fn() } }));
const { supabase } = require('../supabase');
const storage = require('@react-native-async-storage/async-storage');
const sync = require('../sync');

let activeUser, gate, entered, payloads, rows, offline, legacySettings;
const item = { id: 'late-expense', amount: 100, currency: 'JPY', note: '', category: 'food', createdAt: 1 };
const settings = {
  displayCurrency: 'EUR', monthlyBudget: 500, categoryBudgets: { food: 100 },
  categoryOrder: ['food'], customCategories: [], customPaymentMethods: [],
  lastPersonalExpenseCurrency: 'JPY',
};
const pending = async (userId) => JSON.parse(await storage.getItem(`@expense-tracker/pending-ops:${userId}`) ?? '[]');
beforeEach(async () => {
  await sync.clearQueues('alice'); await sync.clearQueues('bob'); await storage.clear();
  activeUser = 'alice'; gate = null; entered = null; payloads = []; rows = [];
  offline = false; legacySettings = false;
  // Model the existing RLS owner check, including a session changing after the
  // request starts. A missing owner would default to the then-current auth user.
  supabase.from.mockImplementation((table) => ({ upsert: async (payload) => {
    payloads.push(payload); entered?.();
    if (gate) await gate;
    if (offline) return { error: { message: 'offline' } };
    if (table === 'settings' && legacySettings && 'category_budgets' in payload) {
      return { error: { code: 'PGRST204', message: 'Unknown column category_budgets' } };
    }
    const owner = payload.user_id ?? activeUser;
    if (owner !== activeUser) return { error: { code: '42501', message: 'RLS owner mismatch' } };
    rows.push({ table, ...payload, user_id: owner });
    return { error: null };
  } }));
});

it('keeps the original owner and pending operation when auth changes during an upsert', async () => {
  let release;
  gate = new Promise((resolve) => { release = resolve; });
  const started = new Promise((resolve) => { entered = resolve; });
  await sync.enqueueExpenseUpsert('alice', item); await started;
  expect(JSON.parse(await storage.getItem('@expense-tracker/pending-ops:alice'))).toEqual([{ type: 'upsert', expense: item }]);
  expect(await storage.getItem('@expense-tracker/pending-ops:bob')).toBeNull();
  activeUser = 'bob'; release();
  expect(await sync.flush('alice')).toBe(false);
  expect(rows).toEqual([]);
  expect(payloads[0].user_id).toBe('alice');
  expect(sync.applyPendingOps('alice', [])).toEqual([item]);
  expect(sync.applyPendingOps('bob', [])).toEqual([]);
  activeUser = 'alice'; gate = null;
  expect(await sync.flush('alice')).toBe(true);
  expect(rows).toEqual([expect.objectContaining({ id: item.id, user_id: 'alice', currency: 'JPY' })]);
  expect(sync.applyPendingOps('alice', [])).toEqual([]);
});

it('never inserts a late original-account upsert under an already switched session', async () => {
  activeUser = 'bob';
  await sync.enqueueExpenseUpsert('alice', item);
  expect(await sync.flush('alice')).toBe(false);
  expect(rows).toEqual([]);
  expect(payloads.every((payload) => payload.user_id === 'alice')).toBe(true);
  expect(sync.applyPendingOps('alice', [])).toEqual([item]);
  expect(sync.applyPendingOps('bob', [])).toEqual([]);
});

it.each([false, true])('syncs same-account Settings with an explicit owner; legacy schema: %s', async (legacy) => {
  legacySettings = legacy;
  await sync.enqueueSettingsPush('alice', settings);
  expect(await sync.flush('alice')).toBe(true);
  expect(payloads).toHaveLength(legacy ? 2 : 1);
  expect(payloads.every((payload) => payload.user_id === 'alice')).toBe(true);
  expect(payloads[0]).toEqual({
    user_id: 'alice', display_currency: 'EUR', monthly_budget: 500,
    category_budgets: { food: 100 }, category_order: ['food'],
    custom_categories: [], custom_payment_methods: [],
  });
  if (legacy) expect(payloads[1]).toEqual({ user_id: 'alice', display_currency: 'EUR', monthly_budget: 500 });
  expect(rows).toEqual([expect.objectContaining({ table: 'settings', user_id: 'alice', display_currency: 'EUR', monthly_budget: 500 })]);
  expect(await pending('alice')).toEqual([]);
});

it.each([false, true])('retains Settings for retry when auth changes during the request; legacy schema: %s', async (legacy) => {
  legacySettings = legacy;
  let release;
  gate = new Promise((resolve) => { release = resolve; });
  const started = new Promise((resolve) => { entered = resolve; });
  await sync.enqueueSettingsPush('alice', settings); await started;
  const queued = [{ type: 'settings', settings: sync.pickSyncedSettings(settings) }];
  expect(await pending('alice')).toEqual(queued);
  activeUser = 'bob'; release();
  expect(await sync.flush('alice')).toBe(false);
  expect(payloads).toHaveLength(legacy ? 2 : 1);
  expect(payloads.every((payload) => payload.user_id === 'alice')).toBe(true);
  expect(rows).toEqual([]);
  expect(await pending('alice')).toEqual(queued);
  activeUser = 'alice'; gate = null;
  expect(await sync.flush('alice')).toBe(true);
  expect(rows).toEqual([expect.objectContaining({ table: 'settings', user_id: 'alice', display_currency: 'EUR', monthly_budget: 500 })]);
  expect(await pending('alice')).toEqual([]);
});

it.each([
  [false, 'settings'], [true, 'settings'],
  [false, 'expense'], [true, 'expense'],
])('preserves both mixed-queue operations under Bob and retries under Alice; legacy: %s, first: %s', async (legacy, first) => {
  legacySettings = legacy;
  offline = true;
  const enqueueSettings = () => sync.enqueueSettingsPush('alice', settings);
  const enqueueExpense = () => sync.enqueueExpenseUpsert('alice', item);
  await (first === 'settings' ? enqueueSettings() : enqueueExpense());
  expect(await sync.flush('alice')).toBe(false);
  // The late personal save appends to Alice's older queue after switching.
  activeUser = 'bob'; offline = false;
  const bobSettings = { table: 'settings', user_id: 'bob', display_currency: 'USD', monthly_budget: 900 };
  rows.push(bobSettings);
  await (first === 'settings' ? enqueueExpense() : enqueueSettings());
  expect(await sync.flush('alice')).toBe(false);
  const queued = first === 'settings'
    ? [{ type: 'settings', settings: sync.pickSyncedSettings(settings) }, { type: 'upsert', expense: item }]
    : [{ type: 'upsert', expense: item }, { type: 'settings', settings: sync.pickSyncedSettings(settings) }];
  expect(await pending('alice')).toEqual(queued);
  expect(await pending('bob')).toEqual([]);
  expect(rows).toEqual([bobSettings]);
  expect(sync.applyPendingOps('alice', [])).toEqual([item]);
  expect(sync.applyPendingOps('bob', [])).toEqual([]);
  activeUser = 'alice';
  expect(await sync.flush('alice')).toBe(true);
  expect(await pending('alice')).toEqual([]);
  expect(payloads.every((payload) => payload.user_id === 'alice')).toBe(true);
  expect(rows.filter((row) => row.user_id === 'alice')).toEqual(expect.arrayContaining([
    expect.objectContaining({ table: 'expenses', id: item.id, currency: 'JPY' }),
    expect.objectContaining({ table: 'settings', display_currency: 'EUR', monthly_budget: 500 }),
  ]));
  expect(rows).toHaveLength(3);
  expect(rows.filter((row) => row.user_id === 'bob')).toEqual([bobSettings]);
});
