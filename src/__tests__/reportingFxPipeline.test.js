let mockFrame;
function mockMemo(factory, deps) {
  const frame = mockFrame, index = frame.index++, previous = frame.hooks[index];
  if (!previous || deps.some((value, i) => !Object.is(value, previous.deps[i]))) frame.hooks[index] = { deps, value: factory() };
  return frame.hooks[index].value;
}
jest.mock('react', () => ({
  ...jest.requireActual('react'), useMemo: mockMemo, useCallback: (fn, deps) => mockMemo(() => fn, deps),
  useRef(initial) { const f = mockFrame, i = f.index++; return f.hooks[i] ??= { current: initial }; },
  useState(initial) {
    const f = mockFrame, i = f.index++;
    f.hooks[i] ??= { value: typeof initial === 'function' ? initial() : initial };
    return [f.hooks[i].value, (value) => {
      const next = typeof value === 'function' ? value(f.hooks[i].value) : value;
      f.dirty ||= !Object.is(next, f.hooks[i].value); f.hooks[i].value = next;
    }];
  },
  useEffect(effect, deps) {
    const f = mockFrame, i = f.index++, previous = f.hooks[i];
    if (!previous || deps.some((value, index) => !Object.is(value, previous.deps[index]))) f.effects.push(() => {
      previous?.cleanup?.(); f.hooks[i] = { deps, cleanup: effect() };
    });
  },
}));
const useReportingFx = require('../useReportingFx').default;
const { reportingRows, planReportingRequests } = require('../useReportingFx');
const { deriveSharedSpendingActivity, groupBalances } = require('../money');
const { deriveViewData } = require('../derive');
const { spendingForDay } = require('../spendingActivity');
const { dashboardBrowsingMonthView, monthAggregate } = require('../browsingMonth');
const { fxRequestKey } = require('../fxRequestQueue');
const { getHistoricalFxRate, FX_CACHE_FRESH_MS, suspendFxRates, resumeFxRates } = require('../fxRateService');
const { createFxRateCache } = require('../fxRateCache');
const storage = require('@react-native-async-storage/async-storage');
const fs = require('fs');

const time = Date.parse('2026-10-20T12:00:00Z');
const ts = (month = 10, day = 19) => new Date(2026, month - 1, day, 12).getTime();
const expense = (patch = {}) => ({ id: 'personal', amount: 20, currency: 'USD', createdAt: ts(), category: 'food', ...patch });
const quote = (request, patch = {}) => ({ status: 'available',
  quote: { ...request, baseCurrency: request.baseCurrency, quoteCurrency: request.quoteCurrency,
    rate: 32.426, effectiveDate: request.transactionDate, sourceType: 'historical', provider: 'frankfurter-v2:BOC',
    retrievedAt: new Date(time).toISOString(), ...patch },
  provenance: { source: 'BOC' }, cache: { source: 'cache', stale: false },
});
// A quote has only FX-1 fields, never the request's transactionDate.
const observation = (request, patch) => {
  const result = quote(request, patch); delete result.quote.transactionDate; return result;
};
const tick = () => new Promise((resolve) => setImmediate(resolve));
const deferred = () => { let resolve; const promise = new Promise((r) => { resolve = r; }); return { promise, resolve }; };
let drivers;
function driver(patch = {}) {
  const frame = { hooks: [], index: 0, effects: [], dirty: false };
  const props = { userId: 'alice', dataUser: 'alice', accountToken: {}, enabled: true,
    expenses: [expense()], sharedSpending: [], currency: 'TWD', monthKey: '2026-10',
    rateService: jest.fn(async (_, request) => observation(request)), now: () => time, ...patch };
  let snapshot;
  function render(next = {}, effects = true) {
    Object.assign(props, next);
    let rounds = 0;
    do {
      if (++rounds > 25) throw new Error('Hook render loop');
      mockFrame = frame; frame.index = 0; frame.effects = []; frame.dirty = false;
      snapshot = useReportingFx(props);
      if (effects) frame.effects.forEach((effect) => effect());
    } while (effects && frame.dirty);
    return snapshot;
  }
  const api = { props, render, snapshot: () => snapshot,
    unmount: () => frame.hooks.forEach((hook) => hook?.cleanup?.()) };
  drivers.push(api); render(); return api;
}
async function settle(d) { for (let i = 0; i < 3; i++) { await tick(); d.render(); } return d.snapshot(); }
const derive = (d) => deriveViewData(d.props.expenses, d.props.currency, 'en', [], new Date(2026, 9, 20), d.props.sharedSpending, d.snapshot());
beforeEach(async () => { drivers = []; await storage.clear(); });
afterEach(() => drivers.forEach((d) => d.unmount()));

it('projects saved personal records and only your shared spending, with collision-safe identities', () => {
  const bills = [
    { id: 'bill', amount: 100, currency: 'USD', createdAt: ts(), shares: { you: 25, other: 75 } },
    { id: 'settlement', settlement: true, amount: 999, currency: 'USD', createdAt: ts(), shares: { you: 999 } },
    { id: 'other', amount: 50, currency: 'USD', createdAt: ts(), shares: { other: 50 } },
  ];
  const before = JSON.stringify(bills);
  const rows = reportingRows([expense({ id: 'split:bill' })], deriveSharedSpendingActivity(bills));
  expect(rows.map((row) => row.amount)).toEqual([20, 25]);
  expect(new Set(rows.map((row) => row.rowKey)).size).toBe(2);
  expect(rows.map((row) => row.sourceType)).toEqual(['personal', 'shared']);
  expect(JSON.stringify(bills)).toBe(before);
});

it('prioritizes the selected and previous months, then the actual remaining six-month trend window', () => {
  const rows = reportingRows([4, 5, 6, 7, 8, 9, 10, 11].map((month) => expense({ id: month, createdAt: ts(month) })), []);
  const requests = planReportingRequests(rows, 'TWD', '2026-10');
  expect(requests.map((request) => request.transactionDate.slice(0, 7))).toEqual(['2026-10', '2026-09', '2026-08', '2026-07', '2026-06', '2026-05']);
  expect(planReportingRequests([...rows, ...rows], 'TWD', '2026-10')).toHaveLength(6);
});

it.each([{ enabled: false }, { dataUser: null }, { dataUser: 'bob' }, { blocked: true }])('issues zero requests without readiness/enablement: %p', (patch) => {
  const d = driver(patch); d.render(); d.snapshot().refresh(); d.render();
  expect(d.snapshot().active).toBe(false);
  expect(d.props.rateService).not.toHaveBeenCalled();
  expect(d.snapshot().entries).toEqual({});
});

it('uses current amounts with deduplicated quotes and explicit out-of-window estimates', async () => {
  const d = driver({ expenses: [expense(), expense({ id: 'old', createdAt: ts(1) })] });
  expect(d.snapshot().coverage).toMatchObject({ estimated: 2, loading: 1 });
  await settle(d);
  expect(d.props.rateService).toHaveBeenCalledTimes(1);
  expect(d.snapshot().coverage).toMatchObject({ historical: 1, estimated: 1, complete: true });
  d.render({ expenses: [expense({ amount: 100, category: 'transport', note: 'edited' }), expense({ id: 'old', createdAt: ts(1) })] });
  expect(d.snapshot().entries['["personal","personal"]'].amount).toBe(100 * 32.426);
  d.render({ expenses: [...d.props.expenses] }); await settle(d);
  expect(d.props.rateService).toHaveBeenCalledTimes(1);
  expect(derive(d).months.find((month) => month.key === '2026-10').byCategory.transport).toBe(100 * 32.426);
});

it('never publishes a captured old amount when an edit happens during a request', async () => {
  const gate = deferred(), service = jest.fn(() => gate.promise);
  const d = driver({ rateService: service });
  d.render({ expenses: [expense({ amount: 100 })] });
  gate.resolve(observation(service.mock.calls[0][1])); await settle(d);
  expect(d.snapshot().coverage.amount).toBe(100 * 32.426);
  expect(service).toHaveBeenCalledTimes(1);
});

it.each(['account', 'currency', 'lifetime'])('hides prior snapshots before cleanup and rejects late %s responses', async (change) => {
  const requests = [];
  const service = jest.fn((scope, request, options) => { const gate = deferred(); requests.push({ scope, request, options, gate }); return gate.promise; });
  const d = driver({ rateService: service });
  const patch = change === 'account' ? { userId: 'bob', dataUser: 'bob', accountToken: {} }
    : change === 'currency' ? { currency: 'JPY' } : { accountToken: {} };
  const snapshot = d.render(patch, false);
  expect(snapshot.coverage.historical).toBe(0);
  requests[0].gate.resolve(observation(requests[0].request)); await tick();
  d.render(); expect(d.snapshot().coverage.historical).toBe(0);
  expect(requests[0].options.signal.aborted).toBe(true);
  requests.at(-1).gate.resolve(observation(requests.at(-1).request)); await settle(d);
  expect(d.snapshot().coverage.historical).toBe(1);
});

it('rejects the first Alice session after Alice -> Bob -> Alice', async () => {
  const gates = [], service = jest.fn((scope, request) => { const gate = deferred(); gates.push({ gate, request }); return gate.promise; });
  const d = driver({ rateService: service });
  d.render({ userId: 'bob', dataUser: 'bob', accountToken: {} });
  d.render({ userId: 'alice', dataUser: 'alice', accountToken: {} });
  gates[0].gate.resolve(observation(gates[0].request)); await settle(d);
  expect(d.snapshot().coverage.historical).toBe(0);
  gates[2].gate.resolve(observation(gates[2].request)); await settle(d);
  expect(d.snapshot().coverage.historical).toBe(1);
});

it('requests new date/currency keys, removes deletions, and reuses allocation quotes', async () => {
  const bill = { id: 'bill', amount: 100, currency: 'USD', createdAt: ts(), shares: { you: 25, other: 75 } };
  const d = driver({ sharedSpending: deriveSharedSpendingActivity([bill]) }); await settle(d);
  expect(d.props.rateService).toHaveBeenCalledTimes(1);
  d.render({ sharedSpending: deriveSharedSpendingActivity([{ ...bill, shares: { you: 50, other: 50 } }]) });
  expect(d.snapshot().coverage.amount).toBe(70 * 32.426);
  expect(d.props.rateService).toHaveBeenCalledTimes(1);
  d.render({ expenses: [expense({ createdAt: ts(10, 18), currency: 'JPY' })] }); await settle(d);
  expect(d.props.rateService).toHaveBeenCalledTimes(2);
  expect(d.props.rateService.mock.calls[1][1]).toMatchObject({ baseCurrency: 'JPY', transactionDate: '2026-10-18' });
  d.render({ expenses: [], sharedSpending: [] });
  expect(d.snapshot().coverage).toMatchObject({ total: 0, amount: 0, complete: true });
});

it('keeps mixed-status aggregates and filtered coverage consistent without mutating source records', async () => {
  const inputs = [expense(), expense({ id: 'identity', amount: 5, currency: 'TWD' }),
    expense({ id: 'fallback', amount: 2, currency: 'EUR' }), expense({ id: 'invalid', currency: 'ZZZ', category: 'transport' })];
  const before = JSON.stringify(inputs);
  const service = jest.fn(async (_, request) => request.baseCurrency === 'EUR' ? { status: 'unavailable' } : observation(request));
  const d = driver({ expenses: inputs, rateService: service }); await settle(d);
  const view = derive(d), month = view.months[0];
  expect(month.coverage).toMatchObject({ historical: 1, identity: 1, estimated: 1, unavailable: 1, amount: null, complete: false });
  expect(month.total).toBeNull(); expect(month.dailyTotals[18]).toBeNull();
  expect(month.byCategory.transport).toBeNull();
  const filtered = spendingForDay(view.spendingSections, '2026-10-19', 'food');
  expect(filtered.coverage).toMatchObject({ total: 3, historical: 1, estimated: 1, identity: 1, complete: true });
  expect(filtered.filteredTotal).toBe(month.byCategory.food);
  expect(dashboardBrowsingMonthView(view.months, '2026-10').total).toBeNull();
  expect(spendingForDay(view.spendingSections, '2026-10-19').filteredTotal).toBeNull();
  expect(spendingForDay(view.spendingSections, '2026-10-01').coverage).toMatchObject({ total: 0, amount: 0, complete: true });
  expect(JSON.stringify(inputs)).toBe(before);
});

it('preserves fractional values and consistent monthly/daily/category/trend inputs', async () => {
  const d = driver({ expenses: [expense({ amount: 0.01 }), expense({ id: 'two', amount: 0.02 })] }); await settle(d);
  const view = derive(d), month = view.months[0];
  expect(month.total).toBe(0.01 * 32.426 + 0.02 * 32.426);
  expect(month.total).toBe(month.byCategory.food);
  expect(month.total).toBe(month.dailyTotals[18]);
  expect(dashboardBrowsingMonthView(view.months, '2026-10').total).toBe(month.total);
  expect(month.dailyCoverage[0]).toMatchObject({ total: 0, amount: 0, complete: true });
});

it('retains financial accumulation order for filtered totals even when presentation rows sort differently', () => {
  const bill = { id: 'bill', currency: 'USD', amount: 2, shares: { you: 1 }, createdAt: ts() + 100, category: 'food' };
  const d = driver({ currency: 'USD', expenses: [expense({ amount: 1e16 })],
    sharedSpending: deriveSharedSpendingActivity([bill, { ...bill, id: 'bill2', createdAt: ts() + 200 }]) });
  const view = derive(d);
  expect(view.spendingSections[0].data[0].id).toBe('split:bill2');
  expect(view.monthTotal).toBe(1e16);
  expect(spendingForDay(view.spendingSections, '2026-10-19', 'food').filteredTotal).toBe(view.months[0].byCategory.food);
});

it('marks all affected FX aggregates incomplete on numeric overflow', () => {
  const d = driver({ currency: 'USD', expenses: [expense({ amount: Number.MAX_VALUE }), expense({ id: 'two', amount: Number.MAX_VALUE })] });
  const view = derive(d);
  expect(view.monthTotal).toBeNull(); expect(view.months[0].byCategory.food).toBeNull();
  expect(view.dailyTotals[18]).toBeNull();
  expect(view.coverage).toMatchObject({ complete: false, amount: null, reason: 'unrepresentable-total' });
});

it.each(['date', 'currency'])('invalidates an independently edited transaction %s', async (field) => {
  const d = driver(); await settle(d);
  const next = field === 'date' ? { createdAt: ts(10, 18) } : { currency: 'JPY' };
  d.render({ expenses: [expense(next)] });
  expect(d.snapshot().coverage).toMatchObject({ estimated: 1, loading: 1, historical: 0 });
  await settle(d);
  expect(d.props.rateService).toHaveBeenCalledTimes(2);
  expect(d.snapshot().coverage.historical).toBe(1);
});

it('expires inactive-window observations without requesting unrelated history', async () => {
  let clock = time;
  const service = jest.fn(async (_, request) => observation(request, { retrievedAt: new Date(clock).toISOString() }));
  const d = driver({ now: () => clock, rateService: service }); await settle(d);
  d.render({ monthKey: '2027-10' }); await settle(d);
  expect(d.snapshot().coverage.historical).toBe(1);
  clock += FX_CACHE_FRESH_MS;
  d.render(); await settle(d);
  expect(d.snapshot().coverage).toMatchObject({ estimated: 1, historical: 0, loading: 0 });
  expect(service).toHaveBeenCalledTimes(1);
});

it.each(['original amount', 'original currency', 'date', 'target', 'identity'])('rejects a stale valuation with mismatched %s', async (kind) => {
  const d = driver(); await settle(d);
  const entry = d.snapshot().entries['["personal","personal"]'];
  const bad = { ...entry, original: { ...entry.original } };
  if (kind === 'original amount') bad.original.amount++;
  if (kind === 'original currency') bad.original.currency = 'EUR';
  if (kind === 'date') bad.transactionDate = '2026-10-18';
  if (kind === 'target') bad.currency = 'JPY';
  if (kind === 'identity') bad.rowKey = 'wrong';
  const snapshot = { ...d.snapshot(), entries: { ...d.snapshot().entries, [entry.rowKey]: bad } };
  const view = deriveViewData(d.props.expenses, 'TWD', 'en', [], new Date(2026, 9, 20), [], snapshot);
  expect(view.monthTotal).toBeNull();
  expect(view.coverage).toMatchObject({ unavailable: 1, complete: false });
});

it('retries failures only on refresh and refreshes expired historical results without loops', async () => {
  let clock = time;
  const service = jest.fn(async (_, request) => ({ status: 'temporary-failure', reason: 'offline' }));
  const d = driver({ now: () => clock, rateService: service }); await settle(d);
  d.render(); d.render(); expect(service).toHaveBeenCalledTimes(1);
  service.mockImplementation(async (_, request) => observation(request, { retrievedAt: new Date(clock).toISOString() }));
  d.snapshot().refresh(); d.render(); await settle(d);
  expect(service).toHaveBeenCalledTimes(2);
  expect(d.snapshot().coverage.historical).toBe(1);
  clock += FX_CACHE_FRESH_MS;
  d.render(); await settle(d);
  expect(service).toHaveBeenCalledTimes(3);
  expect(d.snapshot().coverage.historical).toBe(1);
});

it('reuses overlapping month outcomes and bounds retained inactive outcomes', async () => {
  const d = driver(); await settle(d);
  d.render({ monthKey: '2026-11' }); await settle(d);
  d.render({ monthKey: '2026-10' }); await settle(d);
  expect(d.props.rateService).toHaveBeenCalledTimes(1);
  for (let year = 2000; year < 2003; year++) {
    const inputs = Array.from({ length: 60 }, (_, index) => expense({ id: `${year}-${index}`, createdAt: new Date(year, index % 6, Math.floor(index / 6) + 1, 12).getTime() }));
    d.render({ expenses: inputs, monthKey: `${year}-06` }); await settle(d);
  }
  const before = d.props.rateService.mock.calls.length;
  d.render({ expenses: [expense({ createdAt: new Date(2000, 5, 1, 12).getTime() })], monthKey: '2000-06' });
  await settle(d);
  expect(d.props.rateService).toHaveBeenCalledTimes(before + 1); // Oldest inactive outcome was evicted.
});

it.each([null, undefined, NaN, 'bad-date'])('never schedules an invalid transaction date %p', (createdAt) => {
  const d = driver({ expenses: [expense({ createdAt })], monthKey: '1970-01' });
  expect(d.props.rateService).not.toHaveBeenCalled();
  expect(d.snapshot().coverage).toMatchObject({ unavailable: 1, loading: 0 });
});

it.each(['bad-clock', '2026-10-21T12:00:00Z', '2026-10-01T12:00:00Z'])('settles a malformed available result without retry loops: %s', async (retrievedAt) => {
  const service = jest.fn(async (_, request) => observation(request, { retrievedAt }));
  const d = driver({ rateService: service }); await settle(d); d.render(); await settle(d);
  expect(service).toHaveBeenCalledTimes(1);
  expect(d.snapshot().coverage).toMatchObject({ estimated: 1, loading: 0 });
});

it('preserves cached stale historical results through real service/cache offline fallback', async () => {
  const cache = createFxRateCache(storage);
  let offline = false;
  const service = (scope, request, options) => getHistoricalFxRate(scope, request, {
    ...options, cache, now: () => time + (offline ? FX_CACHE_FRESH_MS + 1 : 0),
    fetchImpl: async () => {
      if (offline) throw new Error('offline');
      return { status: 200, headers: { get: () => null }, text: async () => JSON.stringify([
        { base: request.baseCurrency, quote: request.quoteCurrency, date: request.transactionDate, rate: 32.426,
          providers: [{ key: 'BOC', date: request.transactionDate, rate: 32.426 }] },
      ]) };
    },
  });
  const d = driver({ rateService: service, now: () => time + (offline ? FX_CACHE_FRESH_MS + 1 : 0) }); await settle(d);
  expect(d.snapshot().coverage.historical).toBe(1);
  d.unmount(); offline = true;
  const reloaded = driver({ rateService: service, now: () => time + FX_CACHE_FRESH_MS + 1 }); await settle(reloaded);
  expect(reloaded.snapshot().coverage).toMatchObject({ historical: 1, stale: 1, estimated: 0 });
});

it('recovers through explicit refresh after actual service suspension, without retrying while stopped', async () => {
  const response = deferred();
  const fetchImpl = jest.fn(() => response.promise);
  const cache = createFxRateCache(storage);
  const service = jest.fn((scope, request, options) => getHistoricalFxRate(scope, request, {
    ...options, cache, fetchImpl, now: () => time,
  }));
  suspendFxRates('alice');
  try {
    const d = driver({ rateService: service }); await settle(d);
    expect(service).toHaveBeenCalledTimes(1);
    expect(fetchImpl).not.toHaveBeenCalled();
    expect(d.snapshot().coverage).toMatchObject({ estimated: 1, historical: 0, loading: 0 });
    d.render(); await settle(d);
    expect(service).toHaveBeenCalledTimes(1);
    d.snapshot().refresh(); d.render(); await settle(d); // Still suspended: one attempt, no loop.
    expect(service).toHaveBeenCalledTimes(2);
    expect(fetchImpl).not.toHaveBeenCalled();
    expect(d.snapshot().coverage.loading).toBe(0);
    resumeFxRates('alice');
    d.snapshot().refresh(); d.render(); await tick();
    expect(service).toHaveBeenCalledTimes(3);
    expect(fetchImpl).toHaveBeenCalledTimes(1);
    expect(d.snapshot().coverage).toMatchObject({ estimated: 1, loading: 1 });
    response.resolve({ status: 200, headers: { get: () => null }, text: async () => JSON.stringify([
      { base: 'USD', quote: 'TWD', date: '2026-10-19', rate: 32.426,
        providers: [{ key: 'BOC', date: '2026-10-19', rate: 32.426 }] },
    ]) });
    await settle(d);
    expect(d.snapshot().coverage).toMatchObject({ historical: 1, estimated: 0, loading: 0, amount: 20 * 32.426 });
    expect(d.snapshot().entries['["personal","personal"]'].provenance.source).toBe('BOC');
  } finally { resumeFxRates('alice'); }
});

it('suppresses a canceled worker late result while its replacement resolves the current context', async () => {
  const gates = [], service = jest.fn((_, request) => { const gate = deferred(); gates.push({ gate, request }); return gate.promise; });
  const d = driver({ expenses: [expense(), expense({ id: 'second', createdAt: ts(10, 18) })], rateService: service });
  gates[0].gate.resolve({ status: 'cancelled', reason: 'request-aborted' }); await settle(d);
  expect(d.snapshot().coverage).toMatchObject({ estimated: 2, loading: 0 });
  d.snapshot().refresh(); d.render();
  expect(service).toHaveBeenCalledTimes(4);
  gates[1].gate.resolve(observation(gates[1].request, { rate: 999 })); await settle(d);
  expect(d.snapshot().coverage).toMatchObject({ historical: 0, estimated: 2, loading: 2 });
  gates.slice(2).forEach(({ gate, request }) => gate.resolve(observation(request)));
  await settle(d);
  expect(d.snapshot().coverage).toMatchObject({ historical: 2, loading: 0, amount: 40 * 32.426 });
});

it('clears a blocked context, suppresses old queued work after resume, and cancels on unmount', async () => {
  const gates = [], service = jest.fn((_, request, options) => { const gate = deferred(); gates.push({ gate, request, options }); return gate.promise; });
  const d = driver({ expenses: [1, 2, 3, 4, 5].map((day) => expense({ id: day, createdAt: ts(10, day) })), rateService: service });
  expect(service).toHaveBeenCalledTimes(3);
  d.render({ blocked: true }); expect(d.snapshot().entries).toEqual({});
  d.render({ blocked: false, expenses: [] });
  gates.forEach(({ gate, request }) => gate.resolve(observation(request))); await settle(d);
  expect(service).toHaveBeenCalledTimes(3);
  expect(d.snapshot().coverage.total).toBe(0);
  d.render({ expenses: [expense()] }); d.unmount();
  expect(gates.at(-1).options.signal.aborted).toBe(true);
});

it('keeps genuine empty FX buckets complete and all legacy output shapes unchanged', () => {
  const d = driver({ expenses: [] }), view = derive(d);
  expect(view.coverage).toMatchObject({ amount: 0, complete: true });
  expect(spendingForDay(view.spendingSections, '2026-10-19', 'all', [], true).coverage.complete).toBe(true);
  expect(monthAggregate(view.months, '2026-10', true).coverage.complete).toBe(true);
  expect(dashboardBrowsingMonthView(view.months, '2026-10', true)).toMatchObject({ total: 0, coverage: { complete: true } });
  const legacy = deriveViewData([expense()], 'TWD', 'en', [], new Date(2026, 9, 20));
  expect(legacy.monthTotal).toBe(650);
  expect(legacy).not.toHaveProperty('coverage');
  expect(legacy.spendingSections[0].data[0]).not.toHaveProperty('fx');
  expect(legacy.months[0]).not.toHaveProperty('coverage');
});

it('activates one App-owned reporting path while budgets and obligations retain their existing calculations', () => {
  const source = fs.readFileSync(require.resolve('../../App.js'), 'utf8');
  expect(source).toMatch(/const REPORTING_FX_ENABLED = true;/);
  expect(source.match(/useReportingFx\(/g)).toHaveLength(1);
  expect(source).toContain('REPORTING_FX_ENABLED ? reportingFx : null');
  expect(source).not.toContain('fxPreviewEnabled');
  for (const path of ['../screens/DashboardScreen.js', '../screens/ExpenseListScreen.js', '../components/ExpenseRow.js']) {
    expect(fs.readFileSync(require.resolve(path), 'utf8')).not.toMatch(/HistoricalMonthPreview|useHistoricalFxPreview|HistoricalFxRow/);
  }
  const group = { id: 'g', currency: 'USD', members: [{ id: 'friend' }] };
  const bills = [{ groupId: 'g', amount: 100, currency: 'USD', paidBy: 'you', shares: { you: 25, friend: 75 } }];
  expect(groupBalances(group, bills)).toEqual({ friend: 75 });
  expect(require('../currency').redenominateBudgets(100, { food: 50 }, 'USD', 'TWD')).toEqual({ monthlyBudget: 3250, categoryBudgets: { food: 1625 } });
});
