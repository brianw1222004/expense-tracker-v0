jest.mock('../supabase', () => ({
  isSupabaseConfigured: false,
  supabase: { from: jest.fn() },
}));

const AsyncStorage = require('@react-native-async-storage/async-storage');
const storage = require('../storage');
const sync = require('../sync');
const cloud = require('../supabase');
const { deleteAllData } = require('../deleteAllData');
// Explicit .js loads the real translations instead of the pure-domain mock.
const { translate } = require('../i18n.js');

const CLOUD_USER = 'cloud-user';
const TRACKER = ['expenses', 'groups', 'splits', 'settings', 'income', 'category-order'];
const trackerKeys = (userId) =>
  TRACKER.map((name) => `@expense-tracker/${name}${userId === storage.LOCAL_USER ? '' : `:${userId}`}`);
const queueKeys = (userId) =>
  [userId, `${userId}::groups`, `${userId}::splits`, `${userId}::income`].map((lane) => `@expense-tracker/pending-ops:${lane}`);
// `income` is the retired feature's table: still wiped, deliberately never verified.
const TRACKER_TABLES = ['expenses', 'groups', 'split_expenses', 'settings'];
const TABLES = [...TRACKER_TABLES, 'income'];

const deferred = () => {
  let resolve;
  const promise = new Promise((r) => { resolve = r; });
  return { promise, resolve };
};
const tick = () => new Promise((resolve) => setImmediate(resolve));

// A tiny in-memory PostgREST: the query-builder calls sync.js makes (delete /
// select head-count / upsert, eq filters, abortSignal) against per-table rows.
function fakeServer() {
  const server = {
    rows: Object.fromEntries(TABLES.map((table) => [table, []])),
    calls: [],
    missing: new Set(),
    failDelete: new Set(),
    refuseDelete: new Set(), // RLS-style: no error, nothing deleted
    nullCount: new Set(), // a count query that comes back without a count
    hang: false,
    upsertGate: null,
  };
  const respond = async (q) => {
    server.calls.push(q);
    if (server.hang) {
      return new Promise((resolve) => q.signal?.addEventListener('abort', () => resolve({ error: { message: 'aborted' } })));
    }
    if (server.missing.has(q.table)) return { error: { code: 'PGRST205', message: 'missing table' } };
    const user = q.filters.find(([column]) => column === 'user_id')?.[1];
    if (q.op === 'upsert') {
      if (server.upsertGate) await server.upsertGate;
      server.rows[q.table].push({ ...q.payload, user_id: CLOUD_USER });
      return { error: null };
    }
    if (q.op === 'delete') {
      if (server.failDelete.has(q.table)) return { error: { message: 'offline' } };
      if (!server.refuseDelete.has(q.table)) server.rows[q.table] = server.rows[q.table].filter((row) => row.user_id !== user);
      return { error: null };
    }
    if (server.nullCount.has(q.table)) return { count: null, error: null };
    return { count: server.rows[q.table].filter((row) => row.user_id === user).length, error: null };
  };
  cloud.supabase.from.mockImplementation((table) => {
    const q = { table, op: null, filters: [], signal: null };
    const chain = {
      delete() { q.op = 'delete'; return chain; },
      select() { q.op = 'count'; return chain; },
      upsert(payload) { q.op = 'upsert'; q.payload = payload; return chain; },
      eq(column, value) { q.filters.push([column, value]); return chain; },
      abortSignal(signal) { q.signal = signal; return chain; },
      then(resolve, reject) { return respond(q).then(resolve, reject); },
    };
    return chain;
  });
  return server;
}

function fixture({ cloudMode = false, ...overrides } = {}) {
  const state = { expenses: [{ id: 'e1' }], groups: [{ id: 'g1' }], splits: [{ id: 'b1' }], settings: { monthlyBudget: 500 } };
  const events = [];
  const opts = {
    cloudConfigured: cloudMode,
    userId: cloudMode ? CLOUD_USER : storage.LOCAL_USER,
    ready: true,
    guard: { current: false },
    confirm: jest.fn(async () => true),
    inform: jest.fn(async () => {}),
    t: (key) => translate('en', key),
    setBusy: jest.fn(),
    resetState: jest.fn(() => {
      events.push('reset');
      Object.assign(state, { expenses: [], groups: [], splits: [], settings: {} });
    }),
    signOut: jest.fn(async () => { events.push('signOut'); }),
    onSuccess: jest.fn(() => { events.push('success'); }),
    ...overrides,
  };
  return { state, events, opts, run: (extra) => deleteAllData({ ...opts, ...extra }) };
}

async function seed(keys, value = 'old') {
  for (const key of keys) await AsyncStorage.setItem(key, value);
}

beforeEach(async () => {
  jest.restoreAllMocks();
  jest.clearAllMocks();
  cloud.isSupabaseConfigured = false;
  await AsyncStorage.clear();
});

describe('local Delete All Data', () => {
  test('clears every local tracker and queue key, then resets and succeeds', async () => {
    await seed([...trackerKeys('local'), ...queueKeys('local')]);
    await AsyncStorage.setItem('@expense-tracker/expenses:other-user', 'keep');
    const { run, opts, events } = fixture();
    await run();
    for (const key of [...trackerKeys('local'), ...queueKeys('local')]) expect(await AsyncStorage.getItem(key)).toBeNull();
    expect(await AsyncStorage.getItem('@expense-tracker/expenses:other-user')).toBe('keep');
    expect(events).toEqual(['reset', 'success']);
    expect(opts.confirm).toHaveBeenCalledWith(expect.objectContaining({ body: translate('en', 'acct.deleteBody') }));
    expect(opts.inform).not.toHaveBeenCalled();
    expect(opts.setBusy.mock.calls).toEqual([[true], [false]]);
    expect(opts.signOut).not.toHaveBeenCalled();
    expect(cloud.supabase.from).not.toHaveBeenCalled();
    expect(opts.guard.current).toBe(false);
  });

  test('blocks concurrent taps during confirmation and cleanup, with success only after verification', async () => {
    const confirmation = deferred();
    const verification = deferred();
    const cleanupStarted = deferred();
    const { run, opts } = fixture();
    opts.confirm.mockReturnValue(confirmation.promise);
    const clear = jest.spyOn(storage, 'clearUserStorage').mockImplementation(() => {
      cleanupStarted.resolve();
      return verification.promise;
    });
    const first = run();
    await run();
    expect(opts.confirm).toHaveBeenCalledTimes(1);
    confirmation.resolve(true);
    await cleanupStarted.promise;
    await run();
    expect(clear).toHaveBeenCalledTimes(1);
    expect(opts.resetState).not.toHaveBeenCalled();
    verification.resolve();
    await first;
    expect(opts.resetState).toHaveBeenCalledTimes(1);
    expect(opts.onSuccess).toHaveBeenCalledTimes(1);
  });

  test('cancellation and not-yet-loaded data do not clean, lock or reset anything', async () => {
    const clear = jest.spyOn(storage, 'clearUserStorage');
    const queues = jest.spyOn(sync, 'clearQueues');
    const { run, opts } = fixture();
    opts.confirm.mockResolvedValue(false);
    await run();
    await run({ ready: false });
    expect(opts.confirm).toHaveBeenCalledTimes(1);
    expect(clear).not.toHaveBeenCalled();
    expect(queues).not.toHaveBeenCalled();
    expect(opts.setBusy).not.toHaveBeenCalled();
    expect(opts.resetState).not.toHaveBeenCalled();
    expect(opts.guard.current).toBe(false);
  });

  test.each(['queue removal', 'tracker removal', 'verification read', 'silent incomplete removal'])(
    '%s failure leaves state intact, reports failure, and allows retry', async (failure) => {
      await seed([...trackerKeys('local'), ...queueKeys('local')]);
      const { run, opts } = fixture();
      const originalRemove = AsyncStorage.multiRemove.getMockImplementation();
      const remove = jest.spyOn(AsyncStorage, 'multiRemove');
      if (failure === 'queue removal') remove.mockRejectedValueOnce(new Error('disk'));
      if (failure === 'tracker removal') remove.mockImplementationOnce(originalRemove).mockRejectedValueOnce(new Error('disk'));
      if (failure === 'verification read') jest.spyOn(AsyncStorage, 'getItem').mockRejectedValueOnce(new Error('read'));
      if (failure === 'silent incomplete removal') remove.mockResolvedValueOnce(undefined);
      await run();
      expect(opts.resetState).not.toHaveBeenCalled();
      expect(opts.onSuccess).not.toHaveBeenCalled();
      expect(opts.inform).toHaveBeenCalledWith(expect.objectContaining({ body: translate('en', 'acct.deleteFailedBody') }));
      expect(opts.setBusy.mock.calls).toEqual([[true], [false]]);
      expect(opts.guard.current).toBe(false);
      await run();
      expect(opts.resetState).toHaveBeenCalledTimes(1);
      expect(opts.onSuccess).toHaveBeenCalledTimes(1);
    }
  );

  test('drains an earlier cache save before removal so it cannot restore deleted data', async () => {
    const pending = deferred();
    const originalSet = AsyncStorage.setItem.getMockImplementation();
    jest.spyOn(AsyncStorage, 'setItem').mockImplementationOnce(async (...args) => {
      await pending.promise;
      await originalSet(...args);
    });
    const save = storage.saveExpenses('local', [{ id: 'late-write' }]);
    const { run, opts } = fixture();
    const deletion = run();
    await tick();
    expect(opts.resetState).not.toHaveBeenCalled();
    pending.resolve();
    await Promise.all([save, deletion]);
    expect(await AsyncStorage.getItem('@expense-tracker/expenses')).toBeNull();
    expect(opts.onSuccess).toHaveBeenCalledTimes(1);
  });
});

describe('a wedged step cannot lock the app', () => {
  test('a cache write that never settles fails the drain before anything is removed', async () => {
    await seed(trackerKeys('local'));
    const stuck = deferred();
    const originalSet = AsyncStorage.setItem.getMockImplementation();
    jest.spyOn(AsyncStorage, 'setItem').mockImplementationOnce(async (...args) => {
      await stuck.promise;
      await originalSet(...args);
    });
    const save = storage.saveExpenses('local', [{ id: 'wedged' }]);
    await expect(storage.clearUserStorage('local', { strict: true, drainTimeoutMs: 20 })).rejects.toThrow('did not settle');
    expect(AsyncStorage.multiRemove).not.toHaveBeenCalled();
    for (const key of trackerKeys('local')) expect(await AsyncStorage.getItem(key)).not.toBeNull();
    stuck.resolve();
    await save;
  });

  test('a step that outlives the deadline cannot delete anything afterwards', async () => {
    await seed([...trackerKeys('local'), ...queueKeys('local')]);
    const stuck = deferred();
    jest.spyOn(sync, 'clearQueues').mockReturnValue(stuck.promise);
    const { run, opts } = fixture();
    await run({ timeoutMs: 20 });
    expect(opts.inform).toHaveBeenCalledTimes(1);
    // The chain is still live behind the race: it must not pick up where it
    // left off now that the user has been told the delete failed.
    stuck.resolve();
    await tick();
    await tick();
    expect(AsyncStorage.multiRemove).not.toHaveBeenCalled();
    for (const key of [...trackerKeys('local'), ...queueKeys('local')]) expect(await AsyncStorage.getItem(key)).toBe('old');
    expect(opts.resetState).not.toHaveBeenCalled();
  });

  test('an already-cancelled cleanup removes nothing in either helper', async () => {
    await seed([...trackerKeys('local'), ...queueKeys('local')]);
    const cancelled = new AbortController();
    cancelled.abort();
    await expect(sync.clearQueues('local', { strict: true, signal: cancelled.signal })).rejects.toThrow('cancelled');
    await expect(storage.clearUserStorage('local', { strict: true, signal: cancelled.signal })).rejects.toThrow('cancelled');
    expect(AsyncStorage.multiRemove).not.toHaveBeenCalled();
    for (const key of [...trackerKeys('local'), ...queueKeys('local')]) expect(await AsyncStorage.getItem(key)).toBe('old');
  });

  test('a cleanup step that hangs reports failure and unlocks at the overall deadline', async () => {
    const hang = deferred();
    jest.spyOn(storage, 'clearUserStorage').mockReturnValue(hang.promise);
    const { run, opts } = fixture();
    await run({ timeoutMs: 20 });
    expect(opts.inform).toHaveBeenCalledWith(expect.objectContaining({ body: translate('en', 'acct.deleteFailedBody') }));
    expect(opts.resetState).not.toHaveBeenCalled();
    expect(opts.setBusy.mock.calls).toEqual([[true], [false]]);
    expect(opts.guard.current).toBe(false);
    hang.resolve();
  });
});

describe('cloud Delete All Data', () => {
  function seedServer(server) {
    for (const table of TABLES) {
      server.rows[table] = [{ id: `${table}-mine`, user_id: CLOUD_USER }, { id: `${table}-theirs`, user_id: 'other-user' }];
    }
  }

  test('deletes and verifies every server row for the user, clears the device, resets, then signs out', async () => {
    cloud.isSupabaseConfigured = true;
    const server = fakeServer();
    seedServer(server);
    await seed([...trackerKeys(CLOUD_USER), ...queueKeys(CLOUD_USER)]);
    const { run, opts, events } = fixture({ cloudMode: true });
    await run();
    for (const table of TABLES) expect(server.rows[table]).toEqual([{ id: `${table}-theirs`, user_id: 'other-user' }]);
    for (const call of server.calls) expect(call.filters).toContainEqual(['user_id', CLOUD_USER]);
    expect(server.calls.filter((c) => c.op === 'count').map((c) => c.table).sort()).toEqual([...TRACKER_TABLES].sort());
    for (const key of [...trackerKeys(CLOUD_USER), ...queueKeys(CLOUD_USER)]) expect(await AsyncStorage.getItem(key)).toBeNull();
    expect(events).toEqual(['reset', 'signOut', 'success']);
    expect(opts.confirm).toHaveBeenCalledWith(expect.objectContaining({ body: translate('en', 'acct.deleteBodyCloud') }));
    expect(opts.inform).not.toHaveBeenCalled();
    expect(opts.setBusy.mock.calls).toEqual([[true], [false]]);
  });

  test('tables that do not exist yet (or any more) count as already empty', async () => {
    cloud.isSupabaseConfigured = true;
    const server = fakeServer();
    seedServer(server);
    for (const table of ['groups', 'split_expenses', 'income']) server.missing.add(table);
    const { run, opts } = fixture({ cloudMode: true });
    await run();
    expect(server.rows.expenses).toEqual([{ id: 'expenses-theirs', user_id: 'other-user' }]);
    expect(opts.onSuccess).toHaveBeenCalledTimes(1);
  });

  test.each([
    ['a delete errors (offline)', (server) => server.failDelete.add('groups')],
    ['RLS silently refuses the delete', (server) => TABLES.forEach((table) => server.refuseDelete.add(table))],
  ])('%s: failure is reported and the device keeps its data and queue', async (_label, breakServer) => {
    cloud.isSupabaseConfigured = true;
    const server = fakeServer();
    seedServer(server);
    breakServer(server);
    await seed([...trackerKeys(CLOUD_USER), ...queueKeys(CLOUD_USER)]);
    const resume = jest.spyOn(sync, 'resumeSync');
    const { run, opts } = fixture({ cloudMode: true });
    await run();
    expect(opts.inform).toHaveBeenCalledWith(expect.objectContaining({ body: translate('en', 'acct.deleteFailedBody') }));
    for (const key of [...trackerKeys(CLOUD_USER), ...queueKeys(CLOUD_USER)]) expect(await AsyncStorage.getItem(key)).toBe('old');
    expect(opts.resetState).not.toHaveBeenCalled();
    expect(opts.signOut).not.toHaveBeenCalled();
    expect(resume).toHaveBeenCalledWith(CLOUD_USER);
    expect(opts.guard.current).toBe(false);
  });

  test('a server that never answers is aborted at the wipe deadline', async () => {
    cloud.isSupabaseConfigured = true;
    const server = fakeServer();
    server.hang = true;
    sync.suspendSync(CLOUD_USER);
    try {
      await expect(sync.wipeServerData(CLOUD_USER, { timeoutMs: 20 })).rejects.toThrow('timed out');
      expect(server.calls[0].signal.aborted).toBe(true);
    } finally {
      sync.resumeSync(CLOUD_USER);
    }
  });

  test('the wipe refuses to run while sync is live', async () => {
    cloud.isSupabaseConfigured = true;
    fakeServer();
    await expect(sync.wipeServerData(CLOUD_USER)).rejects.toThrow('Suspend sync');
    await expect(sync.clearQueues(CLOUD_USER, { strict: true })).rejects.toThrow('suspended');
    expect(cloud.supabase.from).not.toHaveBeenCalled();
  });

  test('an op already on the wire lands before the delete, and suspended lanes push nothing new', async () => {
    cloud.isSupabaseConfigured = true;
    const server = fakeServer();
    const gate = deferred();
    server.upsertGate = gate.promise;
    const enqueued = sync.enqueueExpenseUpsert(CLOUD_USER, { id: 'in-flight', amount: 1, currency: 'USD', createdAt: 1 });
    await enqueued;
    await tick();
    expect(server.calls.map((c) => c.op)).toEqual(['upsert']);
    const { run, opts } = fixture({ cloudMode: true });
    const deletion = run();
    await tick();
    expect(server.calls.map((c) => c.op)).toEqual(['upsert']);
    gate.resolve();
    await deletion;
    expect(server.rows.expenses).toEqual([]);
    expect(server.calls.findIndex((c) => c.op === 'delete')).toBeGreaterThan(0);
    expect(opts.onSuccess).toHaveBeenCalledTimes(1);

    // Suspension alone stops a flush before its next op.
    server.upsertGate = null;
    sync.suspendSync(CLOUD_USER);
    try {
      const before = server.calls.length;
      await sync.enqueueExpenseUpsert(CLOUD_USER, { id: 'later', amount: 1, currency: 'USD', createdAt: 2 });
      expect(await sync.flush(CLOUD_USER)).toBe(false);
      expect(server.calls.length).toBe(before);
    } finally {
      sync.resumeSync(CLOUD_USER);
      await sync.clearQueues(CLOUD_USER);
    }
  });

  test.each([
    ['errors', (server) => server.failDelete.add('income')],
    ['silently keeps its rows', (server) => server.refuseDelete.add('income')],
  ])('the retired income table never fails the delete when it %s', async (_label, breakIncome) => {
    cloud.isSupabaseConfigured = true;
    const server = fakeServer();
    seedServer(server);
    breakIncome(server);
    const { run, opts } = fixture({ cloudMode: true });
    await run();
    for (const table of TRACKER_TABLES) expect(server.rows[table]).toEqual([{ id: `${table}-theirs`, user_id: 'other-user' }]);
    expect(server.calls.some((c) => c.op === 'delete' && c.table === 'income')).toBe(true);
    expect(server.calls.some((c) => c.op === 'count' && c.table === 'income')).toBe(false);
    expect(opts.inform).not.toHaveBeenCalled();
    expect(opts.onSuccess).toHaveBeenCalledTimes(1);
  });

  test('a tracker table whose count never arrives is unverified, not empty', async () => {
    cloud.isSupabaseConfigured = true;
    const server = fakeServer();
    seedServer(server);
    server.nullCount.add('settings');
    const { run, opts } = fixture({ cloudMode: true });
    await run();
    expect(opts.inform).toHaveBeenCalledWith(expect.objectContaining({ body: translate('en', 'acct.deleteFailedBody') }));
    expect(opts.resetState).not.toHaveBeenCalled();
    expect(opts.onSuccess).not.toHaveBeenCalled();
  });

  test('giving up before the first delete says nothing was removed, and nothing is', async () => {
    cloud.isSupabaseConfigured = true;
    const server = fakeServer();
    seedServer(server);
    const gate = deferred();
    server.upsertGate = gate.promise;
    await sync.enqueueExpenseUpsert(CLOUD_USER, { id: 'in-flight', amount: 1, currency: 'USD', createdAt: 1 });
    await tick();
    await seed(trackerKeys(CLOUD_USER));
    const { run, opts } = fixture({ cloudMode: true });
    // The deadline lands while the wipe is still waiting for that op to settle.
    await run({ timeoutMs: 20 });
    expect(opts.inform).toHaveBeenCalledWith(
      expect.objectContaining({ body: translate('en', 'acct.deleteNothingRemovedBody') })
    );
    gate.resolve();
    await tick();
    await tick();
    expect(server.calls.some((c) => c.op === 'delete')).toBe(false);
    for (const table of TABLES) {
      expect(server.rows[table]).toContainEqual({ id: `${table}-mine`, user_id: CLOUD_USER });
    }
    for (const key of trackerKeys(CLOUD_USER)) expect(await AsyncStorage.getItem(key)).toBe('old');
    expect(opts.resetState).not.toHaveBeenCalled();
    await sync.clearQueues(CLOUD_USER);
  });

  test.each([
    ['rejects', async () => { throw new Error('no session'); }],
    ['resolves with an error', async () => ({ error: { message: 'no session' } })],
  ])('a sign-out that %s is not reported as success', async (_label, signOut) => {
    cloud.isSupabaseConfigured = true;
    const server = fakeServer();
    seedServer(server);
    const { run, opts, events } = fixture({ cloudMode: true, signOut: jest.fn(signOut) });
    await run();
    // The data really is gone — only the session on this device is not.
    for (const table of TRACKER_TABLES) expect(server.rows[table]).toEqual([{ id: `${table}-theirs`, user_id: 'other-user' }]);
    expect(events).toEqual(['reset']);
    expect(opts.onSuccess).not.toHaveBeenCalled();
    expect(opts.inform).toHaveBeenCalledWith(
      expect.objectContaining({
        title: translate('en', 'acct.deleteSignOutFailed'),
        body: translate('en', 'acct.deleteSignOutFailedBody'),
      })
    );
    expect(opts.setBusy.mock.calls).toEqual([[true], [false]]);
    expect(opts.guard.current).toBe(false);
  });

  test('an inconsistent configured build with the local sentinel does nothing', async () => {
    cloud.isSupabaseConfigured = true;
    fakeServer();
    const { run, opts } = fixture({ cloudMode: true });
    await run({ userId: storage.LOCAL_USER });
    await run({ userId: null });
    expect(opts.confirm).not.toHaveBeenCalled();
    expect(AsyncStorage.multiRemove).not.toHaveBeenCalled();
    expect(cloud.supabase.from).not.toHaveBeenCalled();
    expect(opts.guard.current).toBe(false);
  });
});

describe('localized deletion copy', () => {
  test.each([
    ['en', 'Delete all data', 'this device', 'synced account'],
    // The app's stored language key for Traditional Chinese is `zh`.
    ['zh', '刪除所有資料', '這台裝置', '同步帳戶'],
    ['es', 'Eliminar todos los datos', 'este dispositivo', 'cuenta sincronizada'],
  ])('%s names the scope of each deletion', (language, label, device, account) => {
    expect(translate(language, 'acct.deleteData')).toBe(label);
    expect(translate(language, 'acct.deleteConfirm')).toBe(label);
    expect(translate(language, 'acct.deleteBody')).toContain(device);
    expect(translate(language, 'acct.deleteBodyCloud')).toContain(device);
    expect(translate(language, 'acct.deleteBodyCloud')).toContain(account);
    for (const key of ['acct.deleteFailedBody', 'acct.deleteNothingRemovedBody', 'acct.deleteSignOutFailed', 'acct.deleteSignOutFailedBody']) {
      expect(translate(language, key)).not.toBe(key);
    }
    expect(translate(language, 'acct.deleteUnavailable')).toBe('acct.deleteUnavailable');
  });
});
