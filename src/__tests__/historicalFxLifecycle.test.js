// A small effect harness invokes the real hook without a native renderer.
let mockState, mockEffect, mockPrevious, mockCleanup;
jest.mock('react', () => ({
  useMemo: (fn) => fn(), useState: () => [mockState, (value) => { mockState = value; }],
  useEffect: (effect, deps) => { mockEffect = { effect, deps }; },
}));
jest.mock('../fxRateService', () => ({ getHistoricalFxRate: jest.fn() }));
const { getHistoricalFxRate } = require('../fxRateService');
const usePreview = require('../useHistoricalFxPreview').default;
const tick = () => new Promise((resolve) => setImmediate(resolve));
const base = [{ rowKey: 'a', sourceType: 'personal', amount: 10, currency: 'USD', createdAt: new Date(2026, 9, 18).getTime() }];
function render(rows = base, target = 'TWD', scope = 'alice', enabled = true) {
  const snapshot = usePreview(rows, target, scope, enabled);
  if (!mockPrevious || mockEffect.deps.some((value, i) => value !== mockPrevious[i])) {
    mockCleanup?.(); mockCleanup = mockEffect.effect(); mockPrevious = mockEffect.deps;
  }
  return snapshot;
}
beforeEach(() => { mockState = null; mockPrevious = null; mockCleanup = null; getHistoricalFxRate.mockReset(); });
afterEach(() => mockCleanup?.());

it.each(['account', 'currency', 'month', 'records'])('ignores obsolete work and immediately hides prior results on %s change', async (change) => {
  const requests = [];
  getHistoricalFxRate.mockImplementation((scope, request, { signal }) => new Promise((resolve) => requests.push({ scope, request, signal, resolve })));
  render();
  const args = [base, 'TWD', 'alice'];
  if (change === 'account') args[2] = 'bob';
  if (change === 'currency') args[1] = 'EUR';
  if (change === 'month') args[0] = [{ ...base[0], createdAt: new Date(2026, 10, 1).getTime() }];
  if (change === 'records') args[0] = [{ ...base[0], amount: 20 }];
  const snapshot = render(...args);
  expect(snapshot.status).toBe('loading'); expect(snapshot).not.toHaveProperty('amount');
  expect(requests[0].signal.aborted).toBe(true);
  requests[0].resolve({ status: 'unavailable' }); await tick();
  expect(render(...args).status).toBe('loading');
  requests[1].resolve({ status: 'unavailable' }); await tick();
  expect(render(...args).status).toBe('unavailable');
});

it('does no work when the production guard disables the preview and aborts on unmount', () => {
  getHistoricalFxRate.mockImplementation(() => new Promise(() => {}));
  render(base, 'TWD', 'alice', false); expect(getHistoricalFxRate).not.toHaveBeenCalled();
  render(); const signal = getHistoricalFxRate.mock.calls[0][2].signal;
  mockCleanup(); expect(signal.aborted).toBe(true);
});
