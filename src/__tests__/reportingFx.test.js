const currency = require('../currency');
const { resolveReportingFx, summarizeReportingFx } = require('../reportingFx');
const { dateKey } = require('../format');
const { groupBalances, overallBalance, deriveSharedSpendingActivity } = require('../money');
const { deriveViewData } = require('../derive');

const DATE = '2026-10-19';
const createdAt = new Date(2026, 9, 19, 12).getTime();
const row = (patch = {}) => ({ rowKey: '["personal","expense"]', amount: 20, currency: 'USD', createdAt, ...patch });
const historical = (quotePatch = {}, resultPatch = {}) => ({
  status: 'available',
  quote: {
    baseCurrency: 'USD', quoteCurrency: 'TWD', rate: 32.426,
    effectiveDate: DATE, sourceType: 'historical', provider: 'frankfurter-v2:BOC',
    retrievedAt: '2026-10-20T12:00:00.000Z', ...quotePatch,
  },
  provenance: {
    service: 'frankfurter-v2', source: 'BOC', observationDate: DATE,
    requested: { baseCurrency: 'USD', quoteCurrency: 'TWD', transactionDate: DATE },
    classification: 'provider-derived',
    attribution: [{ key: 'BOC', date: DATE, rate: 32.426 }],
  },
  cache: { source: 'network', stale: false, stored: true },
  ...resultPatch,
});
const unavailable = (reason) => expect.objectContaining({ status: 'unavailable', amount: null, reason });
const noHistoricalMetadata = (result) => {
  expect(result).toMatchObject({ quote: null, provenance: null, stale: false });
  expect(result).not.toHaveProperty('effectiveDate');
  expect(result).not.toHaveProperty('provider');
};

beforeEach(() => jest.spyOn(globalThis, 'fetch').mockImplementation(() => { throw new Error('Pure valuation must not fetch'); }));
afterEach(() => {
  expect(globalThis.fetch).not.toHaveBeenCalled();
  jest.restoreAllMocks();
});

describe('resolveReportingFx', () => {
  it.each([0, 20, -20, 0.123456789, Number.MAX_VALUE])('returns same-currency identity %p without consulting static rates', (amount) => {
    const rate = jest.spyOn(currency, 'getStaticConversionRate');
    const convert = jest.spyOn(currency, 'convert');
    const result = resolveReportingFx(row({ amount }), 'USD', { status: 'loading' });
    expect(result).toEqual({
      rowKey: '["personal","expense"]', original: { amount, currency: 'USD' },
      currency: 'USD', transactionDate: DATE, amount, status: 'identity', source: 'identity',
      quote: null, provenance: null, loading: false, stale: false, reason: null,
    });
    expect(rate).not.toHaveBeenCalled();
    expect(convert).not.toHaveBeenCalled();
  });

  it('prefers validated historical conversion and retains quote and supplied observation provenance', () => {
    const lookup = historical();
    const convert = jest.spyOn(currency, 'convert');
    const result = resolveReportingFx(row(), 'TWD', lookup);
    expect(result).toEqual({
      rowKey: '["personal","expense"]', original: { amount: 20, currency: 'USD' },
      currency: 'TWD', transactionDate: DATE, amount: 20 * 32.426,
      status: 'historical', source: 'frankfurter-v2:BOC', quote: lookup.quote,
      provenance: lookup.provenance, loading: false, stale: false, reason: null,
    });
    expect(result.quote).not.toBe(lookup.quote);
    expect(convert).not.toHaveBeenCalled();
  });

  it('preserves a preceding observation date separately from the local transaction date', () => {
    const lookup = historical({ effectiveDate: '2026-10-16' }, {
      provenance: { observationDate: '2026-10-16', source: 'BOC' },
    });
    expect(resolveReportingFx(row(), 'TWD', lookup)).toMatchObject({
      status: 'historical', transactionDate: DATE, quote: { effectiveDate: '2026-10-16' },
      provenance: lookup.provenance,
    });
  });

  it('does not invent provider observation provenance when none was supplied', () => {
    const lookup = historical({}, { provenance: undefined });
    expect(resolveReportingFx(row(), 'TWD', lookup)).toMatchObject({ status: 'historical', provenance: null });
  });

  it('temporarily estimates while a historical lookup is loading', () => {
    const result = resolveReportingFx(row(), 'TWD', { status: 'loading' });
    expect(result).toMatchObject({ status: 'estimated', amount: 650, source: 'legacy-static', loading: true });
    noHistoricalMetadata(result);
  });

  it.each([
    null,
    { status: 'unavailable', reason: 'missing-observation' },
    { status: 'temporary-failure', reason: 'network-failure' },
    { status: 'invalid-response', reason: 'invalid-attribution' },
  ])('uses the existing static conversion after lookup result %p', (lookup) => {
    const result = resolveReportingFx(row(), 'TWD', lookup);
    expect(result).toMatchObject({
      status: 'estimated', amount: currency.convert(20, 'USD', 'TWD'),
      source: 'legacy-static', loading: false,
    });
    expect(result.reason).toBe(lookup?.reason ?? 'missing-quote');
    noHistoricalMetadata(result);
  });

  it('retains validated stale historical results supplied by the rate service', () => {
    const lookup = historical({}, {
      cache: { source: 'cache', stale: true, refreshFailure: { status: 'temporary-failure', reason: 'network-failure' } },
    });
    expect(resolveReportingFx(row(), 'TWD', lookup)).toMatchObject({
      status: 'historical', stale: true, loading: false, amount: 20 * 32.426,
      quote: lookup.quote, provenance: lookup.provenance,
    });
  });

  it.each([
    [{ rate: 0 }, 'invalid-rate'],
    [{ rate: -1 }, 'invalid-rate'],
    [{ rate: Infinity }, 'invalid-rate'],
    [{ rate: NaN }, 'invalid-rate'],
    [{ baseCurrency: 'EUR' }, 'pair-mismatch'],
    [{ quoteCurrency: 'JPY' }, 'pair-mismatch'],
    [{ effectiveDate: '2026-10-20' }, 'future-effective-date'],
    [{ effectiveDate: '2026-10-11' }, 'observation-too-old'],
    [{ provider: '' }, 'invalid-provenance'],
    [{ retrievedAt: 'not-a-timestamp' }, 'invalid-retrieval-timestamp'],
  ])('estimates instead of accepting invalid historical quote %p', (patch, reason) => {
    const result = resolveReportingFx(row(), 'TWD', historical(patch));
    expect(result).toMatchObject({ status: 'estimated', amount: 650, reason });
    noHistoricalMetadata(result);
  });

  it('accepts an observation exactly seven calendar days earlier', () => {
    expect(resolveReportingFx(row(), 'TWD', historical({ effectiveDate: '2026-10-12' })).status).toBe('historical');
  });

  it.each(['manual', 'legacy-estimate'])('does not misclassify supplied %s quotes as historical', (sourceType) => {
    const lookup = { status: 'available', quote: {
      baseCurrency: 'USD', quoteCurrency: 'TWD', rate: 999, effectiveDate: DATE,
      sourceType, origin: 'test',
    }, provenance: { source: 'must-not-be-copied' }, cache: { stale: true } };
    const result = resolveReportingFx(row(), 'TWD', lookup);
    expect(result).toMatchObject({ status: 'estimated', amount: 650, reason: 'not-historical-quote' });
    noHistoricalMetadata(result);
  });

  it.each(['ZZZ', 'usd', '', null, undefined, 'toString'])('rejects unsupported source %p without USD substitution', (code) => {
    const convert = jest.spyOn(currency, 'convert');
    const result = resolveReportingFx(row({ currency: code }), 'USD');
    expect(result).toEqual(unavailable('invalid-currency'));
    expect(result.original.currency).toBe(code);
    expect(convert).not.toHaveBeenCalled();
  });

  it.each(['ZZZ', 'usd', '', null, undefined, 'toString'])('rejects unsupported target %p', (code) => {
    const convert = jest.spyOn(currency, 'convert');
    expect(resolveReportingFx(row(), code)).toEqual(unavailable('invalid-target-currency'));
    expect(convert).not.toHaveBeenCalled();
  });

  it('does not accept an identity conversion with an unsupported currency', () => {
    expect(resolveReportingFx(row({ currency: 'ZZZ' }), 'ZZZ')).toEqual(unavailable('invalid-currency'));
  });

  it.each([NaN, Infinity, -Infinity, '20', null, undefined])('rejects invalid amount %p without coercion', (amount) => {
    expect(resolveReportingFx(row({ amount }), 'TWD', historical())).toEqual(unavailable('invalid-amount'));
  });

  it.each([null, undefined, [], 20])('rejects an invalid money record %p', (input) => {
    expect(resolveReportingFx(input, 'TWD')).toEqual(unavailable('invalid-money'));
  });

  it.each([undefined, null, NaN, 'not-a-date'])('does not invent a date for invalid timestamp %p', (timestamp) => {
    expect(resolveReportingFx(row({ createdAt: timestamp }), 'TWD')).toMatchObject({
      status: 'unavailable', amount: null, transactionDate: null, reason: 'invalid-transaction-date',
    });
  });

  it('uses the same device-local calendar key as the existing spending model', () => {
    const timestamp = new Date(2026, 9, 19, 0, 15).getTime();
    const result = resolveReportingFx(row({ createdAt: timestamp }), 'TWD');
    expect(result.transactionDate).toBe(dateKey(timestamp));
    expect(result.transactionDate).toBe(DATE);
  });

  it.each([null, undefined, 0, -1, Infinity, NaN, '32.5'])('rejects missing/invalid static rate %p even when legacy convert could return a number', (rate) => {
    jest.spyOn(currency, 'getStaticConversionRate').mockReturnValue(rate);
    const convert = jest.spyOn(currency, 'convert');
    expect(resolveReportingFx(row(), 'TWD')).toEqual(unavailable('invalid-static-rate'));
    expect(convert).not.toHaveBeenCalled();
  });

  it('remains loading and unavailable if no static fallback exists yet', () => {
    jest.spyOn(currency, 'getStaticConversionRate').mockReturnValue(null);
    expect(resolveReportingFx(row(), 'TWD', { status: 'loading' })).toMatchObject({
      status: 'unavailable', amount: null, loading: true, reason: 'invalid-static-rate',
    });
  });

  it('does not need a static rate when a usable historical quote exists', () => {
    jest.spyOn(currency, 'getStaticConversionRate').mockReturnValue(null);
    expect(resolveReportingFx(row(), 'TWD', historical()).status).toBe('historical');
  });

  it.each([0, -20])('allows finite original amount %p in historical and estimated valuations', (amount) => {
    expect(resolveReportingFx(row({ amount }), 'TWD', historical()).amount).toBe(amount * 32.426);
    expect(resolveReportingFx(row({ amount }), 'TWD').amount).toBe(currency.convert(amount, 'USD', 'TWD'));
  });

  it('does not accept zero with a missing static rate', () => {
    jest.spyOn(currency, 'getStaticConversionRate').mockReturnValue(null);
    expect(resolveReportingFx(row({ amount: 0 }), 'TWD')).toEqual(unavailable('invalid-static-rate'));
  });

  it('reports static conversion overflow without Infinity', () => {
    expect(resolveReportingFx(row({ amount: Number.MAX_VALUE }), 'TWD')).toEqual(unavailable('unrepresentable-result'));
  });

  it('reports historical overflow rather than disguising it with a different static amount', () => {
    const lookup = historical({ quoteCurrency: 'EUR', rate: 2 });
    expect(resolveReportingFx(row({ amount: Number.MAX_VALUE }), 'EUR', lookup)).toEqual(unavailable('unrepresentable-result'));
  });

  it('rejects static underflow rather than counting a nonzero expense as zero', () => {
    expect(resolveReportingFx(row({ amount: Number.MIN_VALUE, currency: 'KRW' }), 'USD')).toEqual(unavailable('unrepresentable-result'));
  });

  it('rejects historical underflow', () => {
    expect(resolveReportingFx(row({ amount: Number.MIN_VALUE }), 'TWD', historical({ rate: 0.01 })))
      .toEqual(unavailable('unrepresentable-result'));
  });

  it.each([NaN, Infinity, -Infinity])('does not publish a non-finite static conversion %p', (amount) => {
    jest.spyOn(currency, 'convert').mockReturnValue(amount);
    expect(resolveReportingFx(row(), 'TWD')).toEqual(unavailable('unrepresentable-result'));
  });

  it('preserves full precision for both historical and static conversions to a zero-decimal currency', () => {
    const input = row({ amount: 0.01 });
    const result = resolveReportingFx(input, 'TWD', historical({ rate: 32.426123456 }));
    expect(result.amount).toBe(0.01 * 32.426123456);
    expect(result.amount).not.toBe(Math.round(result.amount));
    expect(resolveReportingFx(input, 'TWD').amount).toBe(0.325);
  });

  it('does not modify frozen source transactions or quote metadata', () => {
    const input = Object.freeze(row({ note: 'original', category: 'food' }));
    const lookup = historical();
    Object.freeze(lookup.quote);
    Object.freeze(lookup.provenance);
    Object.freeze(lookup.cache);
    Object.freeze(lookup);
    const before = JSON.stringify([input, lookup]);
    const result = resolveReportingFx(input, 'TWD', lookup);
    result.original.amount = 999;
    expect(input.amount).toBe(20);
    expect(JSON.stringify([input, lookup])).toBe(before);
    expect(result).not.toHaveProperty('note');
  });
});

describe('strict static rate lookup compatibility', () => {
  it.each(currency.CURRENCIES.map(({ code }) => code))('matches existing static conversion for supported %s', (code) => {
    const rate = currency.getStaticConversionRate('USD', code);
    expect(rate).toBeGreaterThan(0);
    expect(currency.convert(3.125, 'USD', code)).toBe(3.125 * rate);
  });

  it('detects a supported catalog entry without a static rate instead of using the legacy USD fallback', () => {
    jest.isolateModules(() => {
      const isolated = require('../currency');
      isolated.CURRENCIES.push({ code: 'ZZZ', decimals: 2 });
      expect(isolated.isSupportedCurrency('ZZZ')).toBe(true);
      expect(isolated.getStaticConversionRate('ZZZ', 'USD')).toBeNull();
      expect(isolated.getStaticConversionRate('USD', 'ZZZ')).toBeNull();
      expect(isolated.convert(20, 'ZZZ', 'USD')).toBe(20);
    });
  });

  it.each(['ZZZ', 'toString', undefined])('rejects unsupported code %p without changing legacy conversion behavior', (code) => {
    expect(currency.getStaticConversionRate(code, 'USD')).toBeNull();
    expect(currency.getStaticConversionRate('USD', code)).toBeNull();
  });
});

describe('summarizeReportingFx', () => {
  it('counts mixed coverage by spending row, including repeated pair/date requests', () => {
    const rows = [
      resolveReportingFx(row({ rowKey: 'identity', amount: 5, currency: 'TWD' }), 'TWD'),
      resolveReportingFx(row({ rowKey: 'historical' }), 'TWD', historical()),
      resolveReportingFx(row({ rowKey: 'same-request', amount: 10 }), 'TWD', historical()),
      resolveReportingFx(row({ rowKey: 'pending' }), 'TWD', { status: 'loading' }),
      resolveReportingFx(row({ rowKey: 'fallback' }), 'TWD', { status: 'unavailable' }),
    ];
    expect(summarizeReportingFx(rows)).toEqual({
      total: 5, identity: 1, historical: 2, estimated: 2, unavailable: 0, loading: 1, stale: 0,
      currency: 'TWD', amount: 5 + 20 * 32.426 + 10 * 32.426 + 650 + 650,
      complete: true, reason: null,
    });
  });

  it('counts stale historical rows and pending rows independently', () => {
    const stale = historical({}, { cache: { source: 'cache', stale: true } });
    const rows = [resolveReportingFx(row(), 'TWD', stale), resolveReportingFx(row(), 'TWD', { status: 'loading' })];
    expect(summarizeReportingFx(rows)).toMatchObject({ historical: 1, estimated: 1, stale: 1, loading: 1, complete: true });
  });

  it('returns an incomplete null total when any row is unavailable, without removing it from coverage', () => {
    const rows = [resolveReportingFx(row(), 'TWD', historical()), resolveReportingFx(row({ currency: 'ZZZ' }), 'TWD')];
    expect(summarizeReportingFx(rows)).toEqual({
      total: 2, identity: 0, historical: 1, estimated: 0, unavailable: 1, loading: 0, stale: 0,
      currency: 'TWD', amount: null, complete: false, reason: 'unavailable-row',
    });
  });

  it('keeps pending unavailable rows in both coverage counts', () => {
    jest.spyOn(currency, 'getStaticConversionRate').mockReturnValue(null);
    expect(summarizeReportingFx([resolveReportingFx(row(), 'TWD', { status: 'loading' })]))
      .toMatchObject({ total: 1, unavailable: 1, loading: 1, amount: null, complete: false });
  });

  it('does not sum results in different target currencies', () => {
    const rows = [resolveReportingFx(row(), 'USD'), resolveReportingFx(row(), 'TWD')];
    expect(summarizeReportingFx(rows)).toMatchObject({ amount: null, complete: false, reason: 'mixed-target-currencies' });
  });

  it('rejects aggregate overflow despite individually finite values', () => {
    const value = resolveReportingFx(row({ amount: Number.MAX_VALUE }), 'USD');
    expect(summarizeReportingFx([value, value])).toMatchObject({
      identity: 2, unavailable: 0, amount: null, complete: false, reason: 'unrepresentable-total',
    });
  });

  it.each([null, { status: 'historical', currency: 'TWD', amount: Infinity }, { status: 'unknown', currency: 'TWD', amount: 5 }])(
    'does not silently omit malformed result %p', (value) => {
      expect(summarizeReportingFx([value])).toMatchObject({ total: 1, unavailable: 1, amount: null, complete: false });
    }
  );

  it('preserves unrounded amounts, valid zero, and negative values', () => {
    const rows = [0.01, -0.001, 0].map((amount) => resolveReportingFx(row({ amount }), 'TWD'));
    expect(summarizeReportingFx(rows)).toMatchObject({
      amount: 0.325 + (-0.001 * 32.5), complete: true, estimated: 3, unavailable: 0,
    });
  });

  it('returns a complete zero for an empty history', () => {
    expect(summarizeReportingFx()).toEqual({
      total: 0, identity: 0, historical: 0, estimated: 0, unavailable: 0, loading: 0, stale: 0,
      currency: null, amount: 0, complete: true, reason: null,
    });
  });
});

it('leaves production static reporting, original shared allocations, debts, and settlements unchanged', () => {
  const group = { id: 'group', currency: 'USD', members: [{ id: 'friend' }] };
  const bills = [
    { id: 'bill', groupId: 'group', amount: 100, currency: 'USD', paidBy: 'you', shares: { you: 25, friend: 75 }, createdAt },
    { id: 'settlement', groupId: 'group', amount: 10, currency: 'USD', settlement: true, from: 'friend', to: 'you', createdAt },
  ];
  const personal = [{ id: 'personal', amount: 20, currency: 'USD', createdAt }];
  const shares = deriveSharedSpendingActivity(bills);
  const before = JSON.stringify({ group, bills, personal });
  const balances = groupBalances(group, bills);
  const overall = overallBalance([group], bills, 'TWD');
  const reporting = deriveViewData(personal, 'TWD', 'en', [], new Date(2026, 9, 20), shares);
  const activity = reporting.spendingSections.flatMap((section) => section.data);
  const newValues = activity.map((item) => resolveReportingFx(item, 'TWD', historical()));
  expect(summarizeReportingFx(newValues).amount).toBe(45 * 32.426);
  expect(reporting.monthTotal).toBe(45 * 32.5);
  expect(shares).toHaveLength(1);
  expect(shares[0].amount).toBe(25);
  expect(groupBalances(group, bills)).toEqual(balances);
  expect(overallBalance([group], bills, 'TWD')).toEqual(overall);
  expect(balances).toEqual({ friend: 65 });
  expect(JSON.stringify({ group, bills, personal })).toBe(before);
});
