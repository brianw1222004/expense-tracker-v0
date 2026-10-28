jest.mock('../sync', () => ({ clearQueues: jest.fn(async () => {}), suspendSync: jest.fn(), resumeSync: jest.fn(), wipeServerData: jest.fn() }));
const storage = require('@react-native-async-storage/async-storage');
const { deleteAllData } = require('../deleteAllData');
const { getHistoricalFxRate, suspendFxRates, resumeFxRates } = require('../fxRateService');
const { fxRateCache } = require('../fxRateCache');
const request = { baseCurrency: 'USD', quoteCurrency: 'TWD', transactionDate: '2026-10-18' };
const response = () => ({ status: 200, headers: { get: () => null }, text: async () => JSON.stringify([
  { base: 'USD', quote: 'TWD', date: '2026-10-16', rate: 32.426, providers: [{ key: 'BOC', date: '2026-10-16', rate: 32.426 }] },
]) });
const options = { fetchImpl: async () => response(), now: () => Date.parse('2026-10-28T12:00:00Z') };
const tick = () => new Promise((resolve) => setImmediate(resolve));
const deferred = () => { let resolve; const promise = new Promise((r) => { resolve = r; }); return { promise, resolve }; };
const fixture = () => ({ cloudConfigured: false, userId: 'local', ready: true, guard: { current: false },
  confirm: jest.fn(async () => true), inform: jest.fn(async () => {}), t: (key) => key,
  setBusy: jest.fn(), resetState: jest.fn(), signOut: jest.fn(), onSuccess: jest.fn() });
beforeEach(async () => { jest.restoreAllMocks(); jest.clearAllMocks(); await storage.clear(); resumeFxRates('local'); });
afterEach(() => { jest.restoreAllMocks(); resumeFxRates('local'); });

it('clears and verifies only the deleting user FX cache before reporting success', async () => {
  await getHistoricalFxRate('local', request, options); await getHistoricalFxRate('other', request, options);
  const f = fixture(); await deleteAllData(f);
  expect(await fxRateCache.get('local', request)).toBeNull();
  expect(await fxRateCache.get('other', request)).not.toBeNull();
  expect(f.onSuccess).toHaveBeenCalledTimes(1); expect(f.inform).not.toHaveBeenCalled();
});

it('cancels active network work and ignores a late response after deletion and resume', async () => {
  const started = deferred(), late = deferred();
  const pending = getHistoricalFxRate('local', request, { ...options, fetchImpl: async () => { started.resolve(); return late.promise; } });
  await started.promise;
  const f = fixture(); await deleteAllData(f);
  expect((await pending).status).toBe('cancelled');
  late.resolve(response()); await tick();
  expect(await fxRateCache.get('local', request)).toBeNull();
  expect(f.onSuccess).toHaveBeenCalledTimes(1);
});

it('blocks new requests while suspended and permits new requests after resume', async () => {
  suspendFxRates('local'); const fetchImpl = jest.fn(options.fetchImpl);
  expect((await getHistoricalFxRate('local', request, { ...options, fetchImpl })).status).toBe('cancelled');
  expect(fetchImpl).not.toHaveBeenCalled();
  resumeFxRates('local'); expect((await getHistoricalFxRate('local', request, { ...options, fetchImpl })).status).toBe('available');
});

it('drains an already-started FX storage write before clearing, so it cannot restore deleted data', async () => {
  const started = deferred(), gate = deferred(), original = storage.setItem.getMockImplementation();
  jest.spyOn(storage, 'setItem').mockImplementationOnce(async (...args) => { started.resolve(); await gate.promise; await original(...args); });
  const pending = getHistoricalFxRate('local', request, options); await started.promise;
  const f = fixture(), deleting = deleteAllData(f); await tick();
  expect(f.onSuccess).not.toHaveBeenCalled();
  gate.resolve(); await deleting; expect((await pending).status).toBe('cancelled');
  expect(await fxRateCache.get('local', request)).toBeNull();
  expect(f.onSuccess).toHaveBeenCalledTimes(1);
});

it('reports a silent FX removal failure and preserves existing deletion failure semantics', async () => {
  await getHistoricalFxRate('local', request, options);
  jest.spyOn(storage, 'removeItem').mockResolvedValueOnce(undefined);
  const f = fixture(); await deleteAllData(f);
  expect(f.inform).toHaveBeenCalledWith(expect.objectContaining({ body: 'acct.deleteFailedBody' }));
  expect(f.onSuccess).not.toHaveBeenCalled(); expect(f.resetState).not.toHaveBeenCalled();
  expect(f.setBusy.mock.calls).toEqual([[true], [false]]); expect(f.guard.current).toBe(false);
});

it('does not start late FX removal after the deletion deadline while waiting for a write', async () => {
  const started = deferred(), gate = deferred(), original = storage.setItem.getMockImplementation();
  jest.spyOn(storage, 'setItem').mockImplementationOnce(async (...args) => { started.resolve(); await gate.promise; await original(...args); });
  const pending = getHistoricalFxRate('local', request, options); await started.promise;
  const remove = jest.spyOn(storage, 'removeItem'), f = fixture();
  await deleteAllData({ ...f, timeoutMs: 20 });
  expect(f.inform).toHaveBeenCalledTimes(1); expect(f.onSuccess).not.toHaveBeenCalled();
  gate.resolve(); await pending; await tick();
  expect(remove).not.toHaveBeenCalled();
});
