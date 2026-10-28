const { startHistoricalFxPreview, historicalPreviewRows, previewInputKey } = require('../historicalFxPreview');
const { getHistoricalFxRate } = require('../fxRateService');
const { createFxRateCache } = require('../fxRateCache');
const { deriveViewData } = require('../derive');
const { yourShareAsExpenses } = require('../splits');
const { dateKey } = require('../format');
const storage = require('@react-native-async-storage/async-storage');

const row = (id, patch = {}) => ({ rowKey: id, id, sourceType: 'personal', amount: 10,
  currency: 'USD', createdAt: new Date(2026, 9, 18, 12).getTime(), ...patch });
const observation = (request, stale = false) => ({ status: 'available',
  quote: { baseCurrency: request.baseCurrency, quoteCurrency: request.quoteCurrency, rate: 32.426,
    effectiveDate: request.transactionDate === '2026-10-18' ? '2026-10-16' : request.transactionDate,
    sourceType: 'historical', provider: 'frankfurter-v2:BOC', retrievedAt: '2026-10-28T12:00:00Z' },
  cache: { stale },
});
const run = async (rows, service = jest.fn(async (_scope, request) => observation(request))) => {
  const updates = []; const batch = startHistoricalFxPreview(rows, 'TWD', 'local', (s) => updates.push(s), { rateService: service });
  await batch.done; return { result: updates.at(-1), updates, service };
};
const tick = () => new Promise((resolve) => setImmediate(resolve));
beforeEach(async () => { await storage.clear(); jest.clearAllMocks(); });

it.each([16, 18])('values a normal/weekend USD transaction on October %p through the actual provider/service', async (day) => {
  const fetchImpl = jest.fn(async () => ({ status: 200, headers: { get: () => null }, text: async () => JSON.stringify([
    { base: 'USD', quote: 'TWD', rate: 32.426, date: '2026-10-16', providers: [{ key: 'BOC', rate: 32.426, date: '2026-10-16' }] },
  ]) }));
  const service = (scope, request, options) => getHistoricalFxRate(scope, request, {
    ...options, fetchImpl, cache: createFxRateCache(), now: () => Date.parse('2026-10-28T12:00:00Z'),
  });
  const { result } = await run([row('a', { createdAt: new Date(2026, 9, day, 23, 30).getTime() })], service);
  expect(result).toMatchObject({ status: 'complete', amount: 324.26,
    entries: { a: { status: 'available', transactionDate: `2026-10-${day}`, effectiveDate: '2026-10-16', stale: false } } });
  expect(fetchImpl).toHaveBeenCalledTimes(1);
  expect(new URL(fetchImpl.mock.calls[0][0]).searchParams.get('date')).toBe(`2026-10-${day}`);
});

it('uses same-currency identity without HTTP', async () => {
  const { result, service } = await run([row('a', { currency: 'TWD', amount: 70 })]);
  expect(result).toMatchObject({ status: 'complete', amount: 70, entries: { a: { identity: true } } });
  expect(service).not.toHaveBeenCalled();
});

it('uses only personal spending plus the consumed share, excluding settlements and other months', async () => {
  const personal = row('personal');
  const bills = [
    { id: 'bill', groupId: 'g', amount: 100, currency: 'USD', shares: { you: 25, friend: 75 }, createdAt: personal.createdAt },
    { id: 'settlement', settlement: true, amount: 999, currency: 'USD', createdAt: personal.createdAt },
  ];
  const derived = deriveViewData([personal, row('old', { createdAt: new Date(2026, 8, 1).getTime() })], 'TWD', 'en', [], new Date(2026, 9, 28), yourShareAsExpenses(bills));
  const before = JSON.stringify(derived);
  const rows = historicalPreviewRows(derived.spendingSections, '2026-10');
  expect(rows.map((r) => r.amount)).toEqual([10, 25]);
  const { result, service } = await run(rows);
  expect(result.amount).toBeCloseTo(35 * 32.426);
  expect(service).toHaveBeenCalledTimes(1); // Same pair/date shared by both rows.
  expect(JSON.stringify(derived)).toBe(before); // Static totals/records untouched.
});

it('deduplicates pair/date requests but keeps separate row amounts', async () => {
  const { result, service } = await run([row('a'), row('b', { amount: 20 })]);
  expect(service).toHaveBeenCalledTimes(1); expect(result.amount).toBeCloseTo(30 * 32.426);
});

it('never publishes a partial monthly total while a rate is loading or unavailable', async () => {
  let finish;
  const service = jest.fn((_scope, request) => request.baseCurrency === 'EUR'
    ? new Promise((resolve) => { finish = resolve; }) : Promise.resolve(observation(request)));
  const updates = [], batch = startHistoricalFxPreview([row('a'), row('b', { currency: 'EUR' })], 'TWD', 'local', (s) => updates.push(s), { rateService: service });
  await tick();
  expect(updates.at(-1)).toMatchObject({ status: 'loading', ready: 1, loading: 1 });
  expect(updates.at(-1)).not.toHaveProperty('amount');
  finish({ status: 'unavailable', reason: 'missing-observation' }); await batch.done;
  expect(updates.at(-1)).toMatchObject({ status: 'unavailable', ready: 1, unavailable: 1 });
  expect(updates.at(-1)).not.toHaveProperty('amount');
});

it('marks offline stale rows and a complete stale month visibly', async () => {
  const { result } = await run([row('a')], async (_scope, request) => observation(request, true));
  expect(result).toMatchObject({ status: 'complete', stale: true, entries: { a: { stale: true, effectiveDate: '2026-10-16' } } });
});

it('does not fabricate an amount on network failure or invalid quote', async () => {
  for (const response of [{ status: 'temporary-failure', reason: 'network-failure' }, { ...observation({ baseCurrency: 'USD', quoteCurrency: 'TWD', transactionDate: '2026-10-18' }), quote: null }]) {
    const { result } = await run([row('a')], async () => response);
    expect(result.status).toBe('unavailable'); expect(result).not.toHaveProperty('amount');
    expect(result.entries.a).not.toHaveProperty('amount');
  }
});

it('limits active lookups to three and cancels queued and late work', async () => {
  const finish = [], signals = [], updates = [];
  const service = jest.fn((_scope, _request, { signal }) => { signals.push(signal); return new Promise((resolve) => finish.push(resolve)); });
  const rows = Array.from({ length: 8 }, (_, i) => row(String(i), { createdAt: new Date(2026, 9, 1 + i).getTime() }));
  const batch = startHistoricalFxPreview(rows, 'TWD', 'alice', (s) => updates.push(s), { rateService: service });
  expect(service).toHaveBeenCalledTimes(3);
  batch.cancel(); expect(signals.every((s) => s.aborted)).toBe(true);
  const count = updates.length;
  finish.forEach((resolve) => resolve({ status: 'unavailable' })); await batch.done;
  expect(service).toHaveBeenCalledTimes(3); expect(updates).toHaveLength(count);
});

it('stops the entire old batch when deletion suspends its scope', async () => {
  const service = jest.fn(async () => ({ status: 'cancelled' }));
  const rows = Array.from({ length: 8 }, (_, i) => row(String(i), { createdAt: new Date(2026, 9, 1 + i).getTime() }));
  await run(rows, service);
  expect(service).toHaveBeenCalledTimes(3);
});

it('keys every account, currency, month/date, and record change independently', () => {
  const rows = [row('a')], key = previewInputKey(rows, 'TWD', 'alice');
  expect(previewInputKey(rows, 'USD', 'alice')).not.toBe(key);
  expect(previewInputKey(rows, 'TWD', 'bob')).not.toBe(key);
  expect(previewInputKey([row('a', { createdAt: new Date(2026, 10, 1).getTime() })], 'TWD', 'alice')).not.toBe(key);
  expect(previewInputKey([row('a', { amount: 20 })], 'TWD', 'alice')).not.toBe(key);
  expect(dateKey(rows[0].createdAt)).toBe('2026-10-18');
});
