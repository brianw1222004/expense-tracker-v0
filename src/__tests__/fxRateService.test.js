const storage = require('@react-native-async-storage/async-storage');
const { getHistoricalFxRate, FX_CACHE_FRESH_MS } = require('../fxRateService');
const { createFxRateCache } = require('../fxRateCache');
const { valueWithFxQuote } = require('../fx');

const request = { baseCurrency: 'USD', quoteCurrency: 'TWD', transactionDate: '2026-10-18' };
const NOW = Date.parse('2026-10-20T12:00:00Z');
const serve = (date = '2026-10-16', status = 200, rate = 32.426) => jest.fn(async () => ({
  status, headers: { get: () => null }, text: async () => JSON.stringify([{
    base: 'USD', quote: 'TWD', date, rate, providers: [{ key: 'BOC', date, rate }],
  }]),
}));
let cache;
const opts = (fetchImpl, extra = {}) => ({ cache, fetchImpl, now: () => NOW, ...extra });
const offline = () => jest.fn(async () => { throw new TypeError('offline'); });
beforeEach(async () => {
  await storage.clear(); jest.clearAllMocks(); cache = createFxRateCache();
  jest.spyOn(globalThis, 'fetch').mockRejectedValue(Error('Live HTTP forbidden'));
});
afterEach(() => jest.restoreAllMocks());
const seed = (age = 0) => getHistoricalFxRate('alice', request, opts(serve(), { now: () => NOW - age }));

it('fetches, selects the weekend observation, saves, and returns no converted amount', async () => {
  const fetchImpl = serve();
  const result = await getHistoricalFxRate('alice', request, opts(fetchImpl));
  expect(result).toMatchObject({
    status: 'available', cache: { source: 'network', stale: false, stored: true },
    quote: { rate: 32.426, effectiveDate: '2026-10-16', retrievedAt: '2026-10-20T12:00:00.000Z' },
    provenance: { requested: request, observationDate: '2026-10-16', classification: 'provider-derived' },
  });
  expect(fetchImpl).toHaveBeenCalledTimes(1);
  expect(result).not.toHaveProperty('amount');
  expect(result).not.toHaveProperty('original');
  const valued = valueWithFxQuote({ amount: 80, currency: 'USD' }, 'TWD', request.transactionDate, result.quote, { datePolicy: 'previous-observation' });
  expect(valued).toMatchObject({ amount: 80 * 32.426, transactionDate: request.transactionDate });
  expect((await cache.get('alice', request)).quote).toEqual(result.quote);
});

it('serves a fresh persistent cache hit with zero HTTP calls', async () => {
  const seeded = await seed(), fetchImpl = offline();
  const result = await getHistoricalFxRate('alice', request, opts(fetchImpl, { cache: createFxRateCache() }));
  expect(result).toMatchObject({ status: 'available', cache: { source: 'cache', stale: false } });
  expect(result.quote).toEqual(seeded.quote); expect(result.provenance).toEqual(seeded.provenance);
  expect(fetchImpl).not.toHaveBeenCalled();
});

it('refreshes at the 24-hour boundary and replaces only that cache key', async () => {
  await seed(FX_CACHE_FRESH_MS);
  const fetchImpl = serve('2026-10-16', 200, 32.5);
  const result = await getHistoricalFxRate('alice', request, opts(fetchImpl));
  expect(result.cache).toEqual({ source: 'network', stale: false, stored: true });
  expect(result.quote.rate).toBe(32.5); expect(fetchImpl).toHaveBeenCalledTimes(1);
});

it.each(['network', 'timeout', 'server'])('reuses expired valid cache as stale after a %s failure', async (kind) => {
  const seeded = await seed(FX_CACHE_FRESH_MS + 1);
  const fetchImpl = kind === 'server' ? serve('2026-10-16', 503) : jest.fn(async () => {
    const error = new Error(kind); if (kind === 'timeout') error.name = 'TimeoutError'; throw error;
  });
  const writes = storage.setItem.mock.calls.length;
  const result = await getHistoricalFxRate('alice', request, opts(fetchImpl));
  expect(result).toMatchObject({ status: 'available', cache: { source: 'cache', stale: true, refreshFailure: { status: 'temporary-failure' } } });
  expect(result.quote).toEqual(seeded.quote); expect(result.provenance).toEqual(seeded.provenance);
  expect(storage.setItem).toHaveBeenCalledTimes(writes);
  expect(fetchImpl).toHaveBeenCalledTimes(1);
});

it.each([404, 422, 200])('does not hide HTTP %p unavailable/invalid data behind stale cache', async (status) => {
  await seed(FX_CACHE_FRESH_MS + 1);
  const result = await getHistoricalFxRate('alice', request, opts(serve('2026-10-16', status, 0)));
  expect(result.status).not.toBe('available'); expect(result).not.toHaveProperty('quote');
});

it.each(['2026-10-01', '2026-10-19'])('rejects out-of-policy observation %s without saving', async (date) => {
  const result = await getHistoricalFxRate('alice', request, opts(serve(date)));
  expect(result.status).toBe('unavailable'); expect(result).not.toHaveProperty('quote');
  expect(storage.setItem).not.toHaveBeenCalled();
});

it('recovers from corrupt storage by fetching a usable observation', async () => {
  await storage.setItem('@expense-tracker/fx-rates/v1:"alice"', '{');
  const result = await getHistoricalFxRate('alice', request, opts(serve()));
  expect(result.status).toBe('available'); expect(result.cache.stored).toBe(true);
  expect(await cache.get('alice', request)).not.toBeNull();
});

it('returns network failure without cache, never a zero/1:1 quote', async () => {
  const result = await getHistoricalFxRate('alice', request, opts(offline()));
  expect(result).toMatchObject({ status: 'temporary-failure', reason: 'network-failure' });
  expect(result).not.toHaveProperty('quote'); expect(result).not.toHaveProperty('amount');
  expect(storage.setItem).not.toHaveBeenCalled();
});

it('returns unavailable on an empty API result without cache', async () => {
  const result = await getHistoricalFxRate('alice', request, opts(jest.fn(async () => ({ status: 200, text: async () => '[]' }))));
  expect(result).toMatchObject({ status: 'unavailable', reason: 'missing-observation' });
  expect(result).not.toHaveProperty('quote');
});

it('keeps a good network quote usable when storage is full', async () => {
  storage.setItem.mockRejectedValueOnce(Error('full'));
  const result = await getHistoricalFxRate('alice', request, opts(serve()));
  expect(result).toMatchObject({ status: 'available', cache: { source: 'network', stored: false } });
});

it('does not reuse another user scope or a future retrieval timestamp', async () => {
  await seed();
  expect((await getHistoricalFxRate('bob', request, opts(offline()))).status).toBe('temporary-failure');
  expect((await getHistoricalFxRate('alice', request, opts(offline(), { now: () => NOW - 1000 }))).status).toBe('temporary-failure');
});

it('does not return a cached quote after cancellation', async () => {
  await seed();
  const controller = new AbortController(); controller.abort(); const fetchImpl = serve();
  const result = await getHistoricalFxRate('alice', request, opts(fetchImpl, { signal: controller.signal }));
  expect(result).toEqual({ status: 'cancelled', reason: 'request-aborted' });
  expect(fetchImpl).not.toHaveBeenCalled();
});

it('forwards cancellation instead of substituting stale cache', async () => {
  await seed(FX_CACHE_FRESH_MS + 1);
  const controller = new AbortController();
  const fetchImpl = jest.fn(async () => { controller.abort(); const e = new Error('abort'); e.name = 'AbortError'; throw e; });
  const result = await getHistoricalFxRate('alice', request, opts(fetchImpl, { signal: controller.signal, timeoutMs: 50 }));
  expect(result.status).toBe('cancelled'); expect(result).not.toHaveProperty('quote');
  expect(fetchImpl.mock.calls[0][1].signal.aborted).toBe(true);
});

it.each([
  [null, request, 'invalid-user-scope'], ['alice', { ...request, baseCurrency: 'ZZZ' }, 'invalid-currency'],
  ['alice', { ...request, transactionDate: '2026-02-30' }, 'invalid-transaction-date'],
  ['alice', { ...request, quoteCurrency: 'USD' }, 'identical-pair'],
])('rejects invalid service request %p %p', async (scope, input, reason) => {
  const fetchImpl = serve();
  expect(await getHistoricalFxRate(scope, input, opts(fetchImpl))).toEqual({ status: 'invalid-request', reason });
  expect(fetchImpl).not.toHaveBeenCalled(); expect(storage.getItem).not.toHaveBeenCalled();
});
