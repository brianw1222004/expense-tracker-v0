const { fetchBocHistoricalQuote } = require('../fxProvider');
const { validateFxQuote, valueWithFxQuote } = require('../fx');
const { CURRENCIES } = require('../currency');

const DATE = '2026-10-16';
const RETRIEVED = '2026-10-28T00:40:00.000Z';
const request = { baseCurrency: 'USD', quoteCurrency: 'TWD', transactionDate: DATE };
// Representative served BOC rates from FX-2A. No CAD-leg fixture is required.
const servedRates = {
  'USD/TWD': 32.426, 'TWD/USD': 0.030839, 'JPY/TWD': 0.20527,
  'USD/JPY': 157.97, 'EUR/USD': 1.1239, 'USD/KRW': 1334.02,
  'USD/CAD': 1.4154, 'CAD/USD': 0.70651,
};
// Synthetic served quotes used only to check support for the remaining codes.
const currencyRates = { EUR: 1.59, GBP: 1.88, JPY: 0.00896, TWD: 0.04365,
  CNY: 0.212, KRW: 0.001061, AUD: 0.9824, CHF: 1.7176, HKD: 0.18022, SGD: 1.1053, INR: 0.0149 };
const observation = (rate = 32.426, date = DATE, base = 'USD', quote = 'TWD') => ({
  base, quote, rate, date, providers: [{ key: 'BOC', date, rate }],
});
function response(body, { status = 200, raw, length } = {}) {
  return {
    status, headers: { get: () => length ?? null },
    text: jest.fn(async () => raw === undefined ? JSON.stringify(body) : raw),
  };
}
function fixtureFetch() {
  return jest.fn(async (url) => {
    const params = new URL(url).searchParams;
    const base = params.get('base'), quote = params.get('quotes');
    const rate = servedRates[base + '/' + quote] ?? (quote === 'CAD' ? currencyRates[base] : undefined);
    if (rate === undefined) throw new Error('Unexpected fixture request');
    return response([observation(rate, DATE, base, quote)]);
  });
}
const options = (fetchImpl, extra = {}) => ({ fetchImpl, now: () => RETRIEVED, ...extra });
const noQuote = (result) => {
  expect(result).not.toHaveProperty('quote');
  expect(result).not.toHaveProperty('amount');
};

beforeEach(() => {
  jest.spyOn(globalThis, 'fetch').mockRejectedValue(new Error('Live HTTP forbidden in tests'));
});
afterEach(() => {
  jest.useRealTimers();
  jest.restoreAllMocks();
});

describe('one-request BOC quotes', () => {
  it.each(Object.entries(servedRates))('accepts served %s rate %p with one request', async (pair, rate) => {
    const [baseCurrency, quoteCurrency] = pair.split('/');
    const fetchImpl = fixtureFetch();
    const result = await fetchBocHistoricalQuote({ ...request, baseCurrency, quoteCurrency }, options(fetchImpl));
    expect(result.status).toBe('available');
    expect(result.quote).toEqual({
      baseCurrency, quoteCurrency, rate, effectiveDate: DATE,
      sourceType: 'historical', provider: 'frankfurter-v2:BOC', retrievedAt: RETRIEVED,
    });
    expect(validateFxQuote(result.quote)).toEqual({ valid: true });
    const valued = valueWithFxQuote({ amount: 80, currency: baseCurrency }, quoteCurrency, DATE, result.quote);
    expect(valued.status).toBe('valued');
    expect(valued.amount).toBe(80 * rate);
    expect(result.provenance).toMatchObject({
      service: 'frankfurter-v2', source: 'BOC', requested: { baseCurrency, quoteCurrency, transactionDate: DATE },
      classification: quoteCurrency === 'CAD' ? 'native' : 'provider-derived',
      observationDate: DATE, retrievedAt: RETRIEVED, httpStatus: 200,
      attribution: [{ key: 'BOC', date: DATE, rate }],
    });
    expect(result.provenance).not.toHaveProperty('verification');
    expect(fetchImpl).toHaveBeenCalledTimes(1);
    const [url, init] = fetchImpl.mock.calls[0];
    const parsed = new URL(url);
    expect(parsed.origin + parsed.pathname).toBe('https://api.frankfurter.dev/v2/rates');
    expect(Object.fromEntries(parsed.searchParams)).toEqual({
      base: baseCurrency, quotes: quoteCurrency, date: DATE, providers: 'BOC', expand: 'providers',
    });
    expect(init).toMatchObject({ method: 'GET', credentials: 'omit', redirect: 'error' });
  });

  it.each(CURRENCIES.map(({ code }) => code))('supports %s without currency substitution', async (code) => {
    const input = code === 'CAD' ? { ...request, baseCurrency: 'CAD', quoteCurrency: 'USD' }
      : { ...request, baseCurrency: code, quoteCurrency: 'CAD' };
    const fetchImpl = fixtureFetch();
    expect((await fetchBocHistoricalQuote(input, options(fetchImpl))).status).toBe('available');
    expect(fetchImpl).toHaveBeenCalledTimes(1);
  });

  it.each([0.000000543217, 1, 32.426])('preserves served rate %p without client rounding or derivation', async (rate) => {
    const fetchImpl = jest.fn(async () => response([observation(rate)]));
    const result = await fetchBocHistoricalQuote(request, options(fetchImpl));
    expect(result.status).toBe('available');
    expect(result.quote.rate).toBe(rate);
    expect(result.provenance.classification).toBe('provider-derived');
    expect(fetchImpl).toHaveBeenCalledTimes(1);
  });

  it('copies useful metadata while ignoring additive provider fields', async () => {
    const row = { ...observation(), extra: 'discarded' };
    row.providers[0].excluded = false;
    row.providers[0].extra = 'discarded';
    const result = await fetchBocHistoricalQuote(request, options(jest.fn(async () => response([row]))));
    row.rate = 99; row.providers[0].key = 'CBC';
    expect(result.quote.rate).toBe(32.426);
    expect(result.provenance.attribution).toEqual([{ key: 'BOC', date: DATE, rate: 32.426, excluded: false }]);
    expect(JSON.stringify(result)).not.toContain('discarded');
  });

  it.each(['frozen', 'null-prototype'])('keeps %s caller input unchanged', async (kind) => {
    const input = kind === 'frozen' ? Object.freeze({ ...request }) : Object.assign(Object.create(null), request);
    const before = JSON.stringify(input);
    const result = await fetchBocHistoricalQuote(input, options(fixtureFetch()));
    expect(result.status).toBe('available');
    expect(JSON.stringify(input)).toBe(before);
    expect(result.provenance.requested).not.toBe(input);
  });

  it('snapshots the requested pair/date before asynchronous work', async () => {
    const input = { ...request };
    const fetchImpl = jest.fn(async () => {
      Object.assign(input, { baseCurrency: 'JPY', transactionDate: '2000-01-01' });
      return response([observation()]);
    });
    const result = await fetchBocHistoricalQuote(input, options(fetchImpl));
    expect(result.status).toBe('available');
    expect(result.provenance.requested).toEqual(request);
    expect(result.quote.effectiveDate).toBe(DATE);
  });
});

describe('request, date, and provider validation', () => {
  it.each([null, {}, []].map((input) => [input]))('rejects malformed request %p without HTTP', async (input) => {
    const fetchImpl = fixtureFetch();
    expect((await fetchBocHistoricalQuote(input, options(fetchImpl))).status).toBe('invalid-request');
    expect(fetchImpl).not.toHaveBeenCalled();
  });
  it.each(['usd', 'ZZZ', 'RMB', null])('rejects base or quote %p without USD fallback', async (currency) => {
    const fetchImpl = fixtureFetch();
    for (const field of ['baseCurrency', 'quoteCurrency']) {
      const result = await fetchBocHistoricalQuote({ ...request, [field]: currency }, options(fetchImpl));
      expect(result.reason).toBe('invalid-currency'); noQuote(result);
    }
    expect(fetchImpl).not.toHaveBeenCalled();
  });
  it.each(['2026-02-30', '', null])('requires a valid explicit date: %p', async (transactionDate) => {
    const fetchImpl = fixtureFetch();
    expect((await fetchBocHistoricalQuote({ ...request, transactionDate }, options(fetchImpl))).reason).toBe('invalid-transaction-date');
    expect(fetchImpl).not.toHaveBeenCalled();
  });
  it('leaves same-currency identity to FX-1', async () => {
    const fetchImpl = fixtureFetch();
    const result = await fetchBocHistoricalQuote({ ...request, quoteCurrency: 'USD' }, options(fetchImpl));
    expect(result.reason).toBe('identical-pair'); noQuote(result); expect(fetchImpl).not.toHaveBeenCalled();
  });
  it.each(['baseCurrency', 'quoteCurrency', 'transactionDate'])('does not invoke a required %s getter', async (field) => {
    const input = { ...request }, get = jest.fn(() => { throw Error('Do not invoke'); });
    Object.defineProperty(input, field, { enumerable: true, get });
    expect((await fetchBocHistoricalQuote(input, options(fixtureFetch()))).status).toBe('invalid-request');
    expect(get).not.toHaveBeenCalled();
  });
  it.each(['baseCurrency', 'quoteCurrency', 'transactionDate'])('rejects a non-enumerable %s', async (field) => {
    const input = { ...request };
    Object.defineProperty(input, field, { enumerable: false });
    expect((await fetchBocHistoricalQuote(input, options(fixtureFetch()))).status).toBe('invalid-request');
  });
  it.each([[ '2026-10-18', '2026-10-16' ], [ '2025-12-25', '2025-12-24' ], [ DATE, '2026-09-30' ], [ DATE, '2026-10-17' ]])(
    'preserves requested %s and rejects returned %s', async (transactionDate, observedDate) => {
      const fetchImpl = jest.fn(async () => response([observation(32.426, observedDate)]));
      const result = await fetchBocHistoricalQuote({ ...request, transactionDate }, options(fetchImpl));
      expect(result).toMatchObject({ status: 'unavailable', reason: 'observation-date-mismatch' }); noQuote(result);
      expect(result.provenance.requested.transactionDate).toBe(transactionDate);
      expect(result.provenance.observationDate).toBe(observedDate);
      expect(fetchImpl).toHaveBeenCalledTimes(1);
    }
  );
  it.each([null, {}, 'rate', [observation(), observation()], [null]].map((body) => [body]))('rejects malformed/duplicate response %p', async (body) => {
    const result = await fetchBocHistoricalQuote(request, options(jest.fn(async () => response(body))));
    expect(result.status).toBe('invalid-response'); noQuote(result);
  });
  it('reports an empty 200 as unavailable, not a zero or 1:1 quote', async () => {
    const result = await fetchBocHistoricalQuote(request, options(jest.fn(async () => response([]))));
    expect(result).toMatchObject({ status: 'unavailable', reason: 'missing-observation' }); noQuote(result);
  });
  it.each(['base', 'quote', 'date', 'rate', 'providers'])('requires response field %s', async (field) => {
    const row = observation(); delete row[field];
    const result = await fetchBocHistoricalQuote(request, options(jest.fn(async () => response([row]))));
    expect(result.status).toBe('invalid-response'); noQuote(result);
  });
  it.each([{ base: 'EUR' }, { quote: 'JPY' }, { date: '2026-02-30' }])('rejects a mismatching pair or invalid date %p', async (change) => {
    const result = await fetchBocHistoricalQuote(request, options(jest.fn(async () => response([{ ...observation(), ...change }]))));
    expect(result.status).toBe('invalid-response'); noQuote(result);
  });
  it.each([0, -1, '32.426', null])('requires a positive numeric rate: %p', async (rate) => {
    const result = await fetchBocHistoricalQuote(request, options(jest.fn(async () => response([observation(rate)]))));
    expect(result.reason).toBe('invalid-rate'); noQuote(result);
  });
  const provider = { key: 'BOC', date: DATE, rate: 32.426 };
  it.each([
    [], [null], [provider, provider], [{ ...provider, key: 'CBC' }], [{ ...provider, key: 'ECB' }],
    [{ ...provider, excluded: true }], [{ ...provider, excluded: 'false' }],
    [{ ...provider, rate: 99 }], [{ ...provider, date: '2026-10-15' }],
  ].map((providers) => [providers]))('rejects missing, unselected, excluded, or inconsistent attribution %p', async (providers) => {
    const result = await fetchBocHistoricalQuote(request, options(jest.fn(async () => response([{ ...observation(), providers }]))));
    expect(result.reason).toBe('invalid-attribution'); noQuote(result);
  });
  it.each([null, '2026-10-15T00:00:00Z'])('rejects retrieval clock %p that FX-1 cannot accept', async (value) => {
    const result = await fetchBocHistoricalQuote(request, options(fixtureFetch(), { now: () => value }));
    expect(result.reason).toBe('invalid-retrieval-clock'); noQuote(result);
  });
  it('handles a throwing retrieval clock', async () => {
    const result = await fetchBocHistoricalQuote(request, options(fixtureFetch(), { now: () => { throw Error('clock'); } }));
    expect(result.reason).toBe('invalid-retrieval-clock'); noQuote(result);
  });
});

describe('transport, timeout, and cancellation', () => {
  it.each([[404, 'unavailable'], [422, 'invalid-request'], [429, 'temporary-failure'],
    [500, 'temporary-failure'], [503, 'temporary-failure'], [204, 'invalid-response']])(
    'handles HTTP %p as %s without reading/retrying the error body', async (status, expected) => {
      const reply = response([], { status }), fetchImpl = jest.fn(async () => reply);
      const result = await fetchBocHistoricalQuote(request, options(fetchImpl));
      expect(result.status).toBe(expected); noQuote(result);
      expect(result.provenance.httpStatus).toBe(status);
      expect(fetchImpl).toHaveBeenCalledTimes(1); expect(reply.text).not.toHaveBeenCalled();
    }
  );
  it.each(['', '{', '[NaN]', '[Infinity]'])('rejects malformed/non-finite JSON %p', async (raw) => {
    const result = await fetchBocHistoricalQuote(request, options(jest.fn(async () => response(null, { raw }))));
    expect(result.reason).toBe('malformed-json'); noQuote(result);
  });
  it.each([{ length: '16385' }, { raw: ' '.repeat(16385), length: '1' }])('rejects oversized response %p', async (settings) => {
    const result = await fetchBocHistoricalQuote(request, options(jest.fn(async () => response([], settings))));
    expect(result.reason).toBe('oversized-response'); noQuote(result);
  });
  it.each(['offline', 'network'])('keeps %s failure distinct from unavailable data', async (message) => {
    const fetchImpl = jest.fn(async () => { throw new TypeError(message); });
    const result = await fetchBocHistoricalQuote(request, options(fetchImpl));
    expect(result).toMatchObject({ status: 'temporary-failure', reason: 'network-failure' }); noQuote(result);
    expect(fetchImpl).toHaveBeenCalledTimes(1);
  });
  it.each([null, { timeoutMs: 0 }, { fetchImpl: null }, { signal: {} }])('rejects invalid options %p', async (invalidOptions) => {
    expect((await fetchBocHistoricalQuote(request, invalidOptions)).reason).toBe('invalid-options');
    expect(globalThis.fetch).not.toHaveBeenCalled();
  });
  it.each(['fetch', 'body'])('times out a stalled %s and cleans up its timer', async (phase) => {
    jest.useFakeTimers();
    const reply = response([]); reply.text = () => new Promise(() => {});
    const fetchImpl = jest.fn(() => phase === 'fetch' ? new Promise(() => {}) : Promise.resolve(reply));
    const task = fetchBocHistoricalQuote(request, options(fetchImpl, { timeoutMs: 25 }));
    await jest.advanceTimersByTimeAsync(26);
    const result = await task;
    expect(result).toMatchObject({ status: 'temporary-failure', reason: 'timeout' }); noQuote(result);
    expect(fetchImpl.mock.calls[0][1].signal.aborted).toBe(true);
    expect(jest.getTimerCount()).toBe(0);
  });
  it('skips HTTP for an already cancelled request', async () => {
    const controller = new AbortController(); controller.abort();
    const fetchImpl = fixtureFetch();
    expect((await fetchBocHistoricalQuote(request, options(fetchImpl, { signal: controller.signal }))).status).toBe('cancelled');
    expect(fetchImpl).not.toHaveBeenCalled();
  });
  it.each(['fetch', 'body'])('cancels an in-flight %s even if transport ignores abort', async (phase) => {
    jest.useFakeTimers();
    const controller = new AbortController(), reply = response([]);
    reply.text = () => new Promise(() => {});
    const fetchImpl = jest.fn(() => phase === 'fetch' ? new Promise(() => {}) : Promise.resolve(reply));
    const task = fetchBocHistoricalQuote(request, options(fetchImpl, { signal: controller.signal }));
    await Promise.resolve(); await Promise.resolve();
    controller.abort();
    const result = await task;
    expect(result.status).toBe('cancelled'); noQuote(result);
    expect(fetchImpl.mock.calls[0][1].signal.aborted).toBe(true);
    expect(jest.getTimerCount()).toBe(0);
  });
  it('honors cancellation before the final quote return', async () => {
    const controller = new AbortController();
    const result = await fetchBocHistoricalQuote(request, options(fixtureFetch(), {
      signal: controller.signal, now: () => { controller.abort(); return RETRIEVED; },
    }));
    expect(result.status).toBe('cancelled'); noQuote(result);
  });
  it('does not change timeout provenance when a late fetch resolves', async () => {
    jest.useFakeTimers();
    let finish;
    const task = fetchBocHistoricalQuote(request, options(jest.fn(() => new Promise((resolve) => { finish = resolve; })), { timeoutMs: 25 }));
    await jest.advanceTimersByTimeAsync(26);
    const result = await task, snapshot = JSON.stringify(result);
    finish(response([observation()]));
    await Promise.resolve(); await Promise.resolve();
    expect(JSON.stringify(result)).toBe(snapshot);
  });
});
