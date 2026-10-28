const storage = require('@react-native-async-storage/async-storage');
const { createFxRateCache, FX_CACHE_MAX_ENTRIES } = require('../fxRateCache');
const { fetchBocHistoricalQuote } = require('../fxProvider');

const request = { baseCurrency: 'USD', quoteCurrency: 'TWD', transactionDate: '2026-10-18' };
async function observation(input = request, date = input.transactionDate) {
  return fetchBocHistoricalQuote(input, {
    datePolicy: 'previous-observation', now: () => '2026-12-31T00:00:00Z',
    fetchImpl: async () => ({
      status: 200, headers: { get: () => null },
      text: async () => JSON.stringify([{
        base: input.baseCurrency, quote: input.quoteCurrency, date, rate: 32.426,
        providers: [{ key: 'BOC', date, rate: 32.426 }],
      }]),
    }),
  });
}
let cache;
beforeEach(async () => {
  await storage.clear(); jest.clearAllMocks(); cache = createFxRateCache();
});
afterEach(() => jest.restoreAllMocks());

it('persists and reloads a historical quote with actual effective date and provenance', async () => {
  const result = await observation(request, '2026-10-16');
  expect(await cache.set('alice', request, result)).toBe(true);
  const reloaded = await createFxRateCache().get('alice', request);
  expect(reloaded).toEqual({ quote: result.quote, provenance: result.provenance });
  expect(reloaded.quote.effectiveDate).toBe('2026-10-16');
  reloaded.quote.rate = 99;
  expect((await cache.get('alice', request)).quote.rate).toBe(32.426);
});

it('keys by exact user scope, direction, requested date, and fixed provider', async () => {
  await cache.set('alice', request, await observation(request));
  expect(storage.setItem.mock.calls[0][0]).toBe('@expense-tracker/fx-rates/v1:"alice"');
  const record = JSON.parse(storage.setItem.mock.calls[0][1]);
  expect(JSON.parse(record.entries[0].key)).toEqual(['frankfurter-v2:BOC', 'USD', 'TWD', '2026-10-18']);
  expect(await cache.get('bob', request)).toBeNull();
  expect(await cache.get('alice', { ...request, baseCurrency: 'TWD', quoteCurrency: 'USD' })).toBeNull();
  expect(await cache.get('alice', { ...request, transactionDate: '2026-10-19' })).toBeNull();
  record.entries[0].quote.provider = 'other-provider';
  await storage.setItem(storage.setItem.mock.calls[0][0], JSON.stringify(record));
  expect(await cache.get('alice', request)).toBeNull();
});

it('never persists unrelated transaction data or result fields', async () => {
  const result = await observation();
  result.amount = 100; result.note = 'private'; result.provenance.note = 'private';
  await cache.set('alice', { ...request, amount: 99, note: 'private' }, result);
  const raw = storage.setItem.mock.calls[0][1];
  expect(raw).not.toContain('amount'); expect(raw).not.toContain('private');
});

it.each(['missing', 'broken-json', 'wrong-version', 'oversized'])('handles %s cache data safely and recovers on save', async (kind) => {
  const key = '@expense-tracker/fx-rates/v1:"alice"';
  if (kind !== 'missing') await storage.setItem(key, kind === 'broken-json' ? '{' : kind === 'oversized' ? ' '.repeat(262145) : '{"version":99,"entries":[]}');
  expect(await cache.get('alice', request)).toBeNull();
  expect(await cache.set('alice', request, await observation())).toBe(true);
  expect(await cache.get('alice', request)).not.toBeNull();
});

it.each(['rate', 'date', 'pair', 'attribution', 'requested-date', 'retrievedAt'])('rejects corrupted cached %s', async (field) => {
  await cache.set('alice', request, await observation());
  const [key, raw] = storage.setItem.mock.calls[0], record = JSON.parse(raw), entry = record.entries[0];
  if (field === 'rate') entry.quote.rate = 0;
  if (field === 'date') entry.quote.effectiveDate = '2026-10-01';
  if (field === 'pair') entry.quote.quoteCurrency = 'JPY';
  if (field === 'attribution') entry.provenance.attribution[0].key = 'CBC';
  if (field === 'requested-date') entry.provenance.requested.transactionDate = '2026-10-19';
  if (field === 'retrievedAt') entry.quote.retrievedAt = 'invalid';
  await storage.setItem(key, JSON.stringify(record));
  expect(await cache.get('alice', request)).toBeNull();
});

it.each([{ status: 'temporary-failure', reason: 'network-failure' }, { status: 'unavailable' }, { status: 'available', quote: { rate: 0 } }])(
  'does not cache failures or invalid quotes %p', async (result) => {
    expect(await cache.set('alice', request, result)).toBe(false);
    expect(storage.setItem).not.toHaveBeenCalled();
  }
);

it('bounds each user record to the newest 100 saved request keys', async () => {
  const first = { ...request, transactionDate: '2026-01-01' };
  for (let day = 0; day <= FX_CACHE_MAX_ENTRIES; day++) {
    const input = { ...request, transactionDate: new Date(Date.UTC(2026, 0, 1 + day)).toISOString().slice(0, 10) };
    expect(await cache.set('alice', input, await observation(input))).toBe(true);
  }
  expect(await cache.get('alice', first)).toBeNull();
  const raw = storage.setItem.mock.calls.at(-1)[1];
  expect(JSON.parse(raw).entries).toHaveLength(FX_CACHE_MAX_ENTRIES);
});

it('serializes concurrent writes and explicit clearing without clearing other users', async () => {
  const result = await observation(), other = { ...request, transactionDate: '2026-10-19' };
  await Promise.all([cache.set('alice', request, result), cache.set('alice', other, await observation(other)), cache.set('bob', request, result)]);
  expect(await cache.get('alice', request)).not.toBeNull();
  expect(await cache.get('alice', other)).not.toBeNull();
  const writing = cache.set('alice', request, result), clearing = cache.clear('alice');
  expect(await writing).toBe(true); expect(await clearing).toBe(true);
  expect(await cache.get('alice', request)).toBeNull();
  expect(await cache.get('bob', request)).not.toBeNull();
});

it('reports storage failures without exposing invalid data', async () => {
  storage.getItem.mockRejectedValueOnce(Error('read'));
  expect(await cache.get('alice', request)).toBeNull();
  storage.setItem.mockRejectedValueOnce(Error('full'));
  expect(await cache.set('alice', request, await observation())).toBe(false);
  storage.removeItem.mockRejectedValueOnce(Error('remove'));
  expect(await cache.clear('alice')).toBe(false);
});

it.each(['', null, undefined, ' alice '])('requires an explicit valid user scope %p', async (scope) => {
  expect(await cache.get(scope, request)).toBeNull();
  expect(await cache.set(scope, request, await observation())).toBe(false);
  expect(await cache.clear(scope)).toBe(false);
  expect(storage.getItem).not.toHaveBeenCalled();
  expect(storage.setItem).not.toHaveBeenCalled();
  expect(storage.removeItem).not.toHaveBeenCalled();
});
