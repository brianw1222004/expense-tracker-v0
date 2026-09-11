jest.mock('../supabase', () => ({
  isSupabaseConfigured: false,
  supabase: { from: jest.fn(), auth: { signOut: jest.fn(async () => ({})) } },
}));

const fs = require('fs');
const path = require('path');
const parser = require('@babel/parser');
const traverse = require('@babel/traverse').default;
const generate = require('@babel/generator').default;
const AsyncStorage = require('@react-native-async-storage/async-storage');
const storage = require('../storage');
const sync = require('../sync');
const cloud = require('../supabase');
const { deleteAllData } = require('../deleteAllData');
// Explicit .js loads the real translations instead of the pure-domain mock.
const { translate } = require('../i18n.js');

// Execute the actual App callbacks with observable dependencies, without
// requiring a native renderer or reproducing the action in the test.
const appAst = parser.parse(fs.readFileSync(path.join(__dirname, '../../App.js'), 'utf8'), {
  sourceType: 'module', plugins: ['jsx'],
});
function appCallback(name, scope) {
  let callback;
  traverse(appAst, {
    VariableDeclarator(p) {
      if (p.node.id.name === name) callback = p.node.init.arguments[0];
    },
  });
  if (!callback) throw new Error(`Missing App callback: ${name}`);
  return Function(...Object.keys(scope), `return (${generate(callback).code});`)(...Object.values(scope));
}

const trackerKeys = ['expenses', 'groups', 'splits', 'settings', 'income', 'category-order']
  .map((name) => `@expense-tracker/${name}`);
const queueKeys = ['local', 'local::groups', 'local::splits', 'local::income']
  .map((lane) => `@expense-tracker/pending-ops:${lane}`);
const deferred = () => {
  let resolve;
  const promise = new Promise((r) => { resolve = r; });
  return { promise, resolve };
};

function fixture(cloudConfigured = false) {
  const state = { expenses: [{ id: 'e1' }], groups: [{ id: 'g1' }], splits: [{ id: 'b1' }], settings: { monthlyBudget: 500 } };
  const scope = {
    deleteAllData,
    isSupabaseConfigured: cloudConfigured,
    userId: cloudConfigured ? 'cloud-user' : storage.LOCAL_USER,
    dataUser: cloudConfigured ? 'cloud-user' : storage.LOCAL_USER,
    deleteDataGuard: { current: false },
    confirmDestructive: jest.fn(async () => true),
    alertInfo: jest.fn(async () => {}),
    translate, language: 'en',
    setDeletingData: jest.fn(),
    setExpenses: jest.fn((v) => { state.expenses = v; }),
    setGroups: jest.fn((v) => { state.groups = v; }),
    setSplitExpenses: jest.fn((v) => { state.splits = v; }),
    setSettings: jest.fn((v) => { state.settings = v; }),
    DEFAULT_SETTINGS: storage.DEFAULT_SETTINGS,
    setOverlay: jest.fn(),
    Haptics: { notificationAsync: jest.fn(async () => {}), NotificationFeedbackType: { Success: 'success' } },
  };
  return { state, scope, run: appCallback('handleDeleteAllData', scope) };
}

beforeEach(async () => {
  jest.restoreAllMocks();
  jest.clearAllMocks();
  cloud.isSupabaseConfigured = false;
  await AsyncStorage.clear();
});

describe('local Delete All Data through the App action', () => {
  test('clears every local tracker/cache/queue key, then resets all four state collections and succeeds', async () => {
    for (const key of [...trackerKeys, ...queueKeys]) await AsyncStorage.setItem(key, JSON.stringify({ old: true }));
    const otherKey = '@expense-tracker/expenses:other-user';
    await AsyncStorage.setItem(otherKey, 'keep');
    const { run, state, scope } = fixture();
    await run();
    expect(state).toEqual({ expenses: [], groups: [], splits: [], settings: storage.DEFAULT_SETTINGS });
    expect(scope.Haptics.notificationAsync.mock.invocationCallOrder[0])
      .toBeGreaterThan(Math.max(...AsyncStorage.getItem.mock.invocationCallOrder));
    for (const key of [...trackerKeys, ...queueKeys]) expect(await AsyncStorage.getItem(key)).toBeNull();
    expect(await AsyncStorage.getItem(otherKey)).toBe('keep');
    expect(scope.Haptics.notificationAsync).toHaveBeenCalledTimes(1);
    expect(scope.alertInfo).not.toHaveBeenCalled();
    expect(scope.setDeletingData.mock.calls).toEqual([[true], [false]]);
    expect(cloud.supabase.auth.signOut).not.toHaveBeenCalled();
    expect(sync.applyPendingOps('local', [])).toEqual([]);
    expect(sync.applyPendingGroupOps('local', [])).toEqual([]);
    expect(sync.applyPendingSplitOps('local', [])).toEqual([]);
  });

  test('blocks concurrent taps during confirmation and cleanup, with success only after verification', async () => {
    const confirmation = deferred();
    const verification = deferred();
    const cleanupStarted = deferred();
    const { run, scope } = fixture();
    scope.confirmDestructive.mockReturnValue(confirmation.promise);
    const clear = jest.spyOn(storage, 'clearUserStorage').mockImplementation(() => {
      cleanupStarted.resolve();
      return verification.promise;
    });
    const first = run();
    await run();
    expect(scope.confirmDestructive).toHaveBeenCalledTimes(1);
    confirmation.resolve(true);
    // Wait for the actual queue removal and its verification to finish.
    await cleanupStarted.promise;
    await run();
    expect(clear).toHaveBeenCalledTimes(1);
    expect(scope.setExpenses).not.toHaveBeenCalled();
    expect(scope.Haptics.notificationAsync).not.toHaveBeenCalled();
    verification.resolve();
    await first;
    expect(scope.setExpenses).toHaveBeenCalledWith([]);
    expect(scope.Haptics.notificationAsync).toHaveBeenCalledTimes(1);
  });

  test('cancellation and not-yet-loaded data do not clean or reset anything', async () => {
    const clear = jest.spyOn(storage, 'clearUserStorage');
    const queues = jest.spyOn(sync, 'clearQueues');
    const { run, scope } = fixture();
    scope.confirmDestructive.mockResolvedValue(false);
    await run();
    await appCallback('handleDeleteAllData', { ...scope, dataUser: null })();
    expect(clear).not.toHaveBeenCalled();
    expect(queues).not.toHaveBeenCalled();
    expect(scope.setExpenses).not.toHaveBeenCalled();
    expect(scope.Haptics.notificationAsync).not.toHaveBeenCalled();
    expect(scope.deleteDataGuard.current).toBe(false);
  });

  test.each(['queue removal', 'tracker removal', 'verification read', 'silent incomplete removal'])(
    '%s failure leaves state intact, reports failure, and allows retry', async (failure) => {
      for (const key of [...trackerKeys, ...queueKeys]) await AsyncStorage.setItem(key, 'old');
      const { run, scope, state } = fixture();
      const before = JSON.parse(JSON.stringify(state));
      const originalRemove = AsyncStorage.multiRemove.getMockImplementation();
      const remove = jest.spyOn(AsyncStorage, 'multiRemove');
      if (failure === 'queue removal') remove.mockRejectedValueOnce(new Error('disk'));
      if (failure === 'tracker removal') remove.mockImplementationOnce(originalRemove).mockRejectedValueOnce(new Error('disk'));
      if (failure === 'verification read') jest.spyOn(AsyncStorage, 'getItem').mockRejectedValueOnce(new Error('read'));
      if (failure === 'silent incomplete removal') remove.mockResolvedValueOnce(undefined);
      await run();
      expect(state).toEqual(before);
      expect(scope.setSettings).not.toHaveBeenCalled();
      expect(scope.Haptics.notificationAsync).not.toHaveBeenCalled();
      expect(scope.alertInfo).toHaveBeenCalledWith(expect.objectContaining({ body: translate('en', 'acct.deleteFailedBody') }));
      expect(scope.deleteDataGuard.current).toBe(false);
      await run();
      expect(scope.setSettings).toHaveBeenCalledWith(storage.DEFAULT_SETTINGS);
      expect(scope.Haptics.notificationAsync).toHaveBeenCalledTimes(1);
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
    const { run, scope } = fixture();
    const deletion = run();
    await new Promise((resolve) => setImmediate(resolve));
    expect(scope.setExpenses).not.toHaveBeenCalled();
    pending.resolve();
    await Promise.all([save, deletion]);
    expect(await AsyncStorage.getItem('@expense-tracker/expenses')).toBeNull();
    expect(scope.Haptics.notificationAsync).toHaveBeenCalledTimes(1);
  });
});

describe('cloud containment', () => {
  test.each([true, false])('cloud user receives explanation without any destructive effects (online=%s)', async (online) => {
    cloud.isSupabaseConfigured = true;
    cloud.supabase.from.mockImplementation(() => { throw new Error(online ? 'Unexpected server call' : 'offline'); });
    const operations = ['enqueueExpensesReplace', 'enqueueGroupsReplace', 'enqueueSplitsReplace', 'flush', 'flushGroups', 'flushSplits', 'clearQueues'];
    const spies = operations.map((name) => jest.spyOn(sync, name));
    const clear = jest.spyOn(storage, 'clearUserStorage');
    const key = '@expense-tracker/pending-ops:cloud-user';
    await AsyncStorage.setItem(key, 'pending user work');
    const { run, scope, state } = fixture(true);
    const before = JSON.parse(JSON.stringify(state));
    await run();
    for (const spy of spies) expect(spy).not.toHaveBeenCalled();
    expect(clear).not.toHaveBeenCalled();
    expect(AsyncStorage.multiRemove).not.toHaveBeenCalled();
    expect(cloud.supabase.from).not.toHaveBeenCalled();
    expect(cloud.supabase.auth.signOut).not.toHaveBeenCalled();
    expect(await AsyncStorage.getItem(key)).toBe('pending user work');
    expect(state).toEqual(before);
    expect(scope.setExpenses).not.toHaveBeenCalled();
    expect(scope.setGroups).not.toHaveBeenCalled();
    expect(scope.setSplitExpenses).not.toHaveBeenCalled();
    expect(scope.setSettings).not.toHaveBeenCalled();
    expect(scope.setOverlay).not.toHaveBeenCalled();
    expect(scope.setDeletingData).not.toHaveBeenCalled();
    expect(scope.confirmDestructive).not.toHaveBeenCalled();
    expect(scope.Haptics.notificationAsync).not.toHaveBeenCalled();
    expect(scope.alertInfo).toHaveBeenCalledWith(expect.objectContaining({ body: translate('en', 'acct.deleteUnavailable') }));
  });

  test('configured mode cannot fall through to local cleanup even with a local sentinel', async () => {
    const { scope } = fixture(true);
    await appCallback('handleDeleteAllData', { ...scope, userId: 'local', dataUser: 'local' })();
    expect(AsyncStorage.multiRemove).not.toHaveBeenCalled();
    expect(scope.setExpenses).not.toHaveBeenCalled();
    expect(scope.alertInfo).toHaveBeenCalledTimes(1);
  });
});

describe('normal sign-out remains separate', () => {
  test.each([true, false])('normal sign-out respects confirmation=%s and flushes all lanes before local sign-out', async (confirmed) => {
    const events = [];
    const scope = {
      userId: 'cloud-user', language: 'en', translate,
      confirmDestructive: jest.fn(async () => confirmed), setOverlay: jest.fn(),
      flush: jest.fn(async () => { events.push('expenses'); return false; }),
      flushGroups: jest.fn(async () => { events.push('groups'); return false; }),
      flushSplits: jest.fn(async () => { events.push('splits'); return false; }),
      supabase: { auth: { signOut: jest.fn(async () => { events.push('signOut'); }) } },
    };
    await appCallback('signOut', scope)();
    expect(events).toEqual(confirmed ? ['expenses', 'groups', 'splits', 'signOut'] : []);
    if (confirmed) expect(scope.supabase.auth.signOut).toHaveBeenCalledWith({ scope: 'local' });
  });
});

describe('honest localized deletion copy', () => {
  test.each([
    ['en', 'Delete all data', 'this device', 'temporarily unavailable'],
    // The app's stored language key for Traditional Chinese is `zh`.
    ['zh', '刪除所有資料', '這台裝置', '暫時無法'],
    ['es', 'Eliminar todos los datos', 'este dispositivo', 'temporalmente'],
  ])('%s describes data deletion and its local/cloud scope', (language, label, device, unavailable) => {
    expect(translate(language, 'acct.deleteData')).toBe(label);
    expect(translate(language, 'acct.deleteConfirm')).toBe(label);
    expect(translate(language, 'acct.deleteBody')).toContain(device);
    expect(translate(language, 'acct.deleteUnavailable')).toContain(unavailable);
    expect(translate(language, 'acct.deleteData')).not.toMatch(/delete account|eliminar cuenta|刪除帳/i);
    expect(translate(language, 'acct.deleteFailedBody')).not.toBe('acct.deleteFailedBody');
  });
});
