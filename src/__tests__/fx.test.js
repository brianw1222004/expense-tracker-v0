const {
  isFxCurrency, isFxDate, validateFxMoney, validateFxQuote,
  valueWithFxQuote, formatFxAmount,
} = require('../fx');

const DATE = '2026-06-10';
const original = { amount: 80, currency: 'EUR' };
const manual = (patch = {}) => ({
  baseCurrency: 'EUR', quoteCurrency: 'USD', rate: 1.25,
  effectiveDate: DATE, sourceType: 'manual', origin: 'user-entry', ...patch,
});
const historical = (patch = {}) => ({
  baseCurrency: 'EUR', quoteCurrency: 'USD', rate: 1.25,
  effectiveDate: DATE, sourceType: 'historical', provider: 'example-provider',
  retrievedAt: '2026-06-11T12:30:00.000Z', ...patch,
});

describe('FX input validation', () => {
  it.each(['USD', 'EUR', 'JPY', 'TWD', 'KRW', 'CHF'])('accepts supported code %s without normalization', (currency) => {
    expect(isFxCurrency(currency)).toBe(true);
  });

  it.each(['usd', ' EUR', 'USD ', 'US', 'USDD', '12A', 'BRL', 'ZZZ', 'RMB', '', null, undefined])(
    'rejects malformed or unsupported currency %p', (currency) => {
      expect(isFxCurrency(currency)).toBe(false);
      expect(validateFxQuote(manual({ baseCurrency: currency }))).toEqual({ valid: false, reason: 'invalid-currency' });
      expect(validateFxQuote(manual({ quoteCurrency: currency }))).toEqual({ valid: false, reason: 'invalid-currency' });
    }
  );

  it.each(['2024-02-29', '2000-02-29', '2026-06-10', '0001-01-01', '9999-12-31'])('accepts calendar date %s', (date) => {
    expect(isFxDate(date)).toBe(true);
  });

  it.each([
    '2026-02-29', '1900-02-29', '2026-04-31', '2026-00-10', '2026-13-10',
    '2026-06-00', '2026-06-32', '0000-01-01', '2026-6-10', '26-06-10',
    '2026-06-10T00:00:00Z', '2026-06-10\n', '', null, 20260610,
  ])('rejects malformed or impossible calendar date %p', (date) => {
    expect(isFxDate(date)).toBe(false);
    expect(validateFxQuote(manual({ effectiveDate: date }))).toEqual({ valid: false, reason: 'invalid-effective-date' });
  });

  it.each([0, -1, NaN, Infinity, -Infinity, '1.25', '', null, undefined, true, new Number(1)])(
    'rejects non-positive or non-numeric rate %p', (rate) => {
      expect(validateFxQuote(manual({ rate }))).toEqual({ valid: false, reason: 'invalid-rate' });
      const result = valueWithFxQuote(original, 'USD', DATE, manual({ rate }));
      expect(result.status).toBe('missing-rate');
      expect(result.reason).toBe('invalid-rate');
      expect(result).not.toHaveProperty('amount');
    }
  );

  it.each([null, undefined, [], 1, '1.25'])('rejects a non-object quote %p', (quote) => {
    expect(validateFxQuote(quote)).toEqual({ valid: false, reason: 'invalid-quote' });
  });

  it('rejects identical quoted currencies and unknown quote metadata', () => {
    expect(validateFxQuote(manual({ quoteCurrency: 'EUR' }))).toEqual({ valid: false, reason: 'identical-quote-pair' });
    expect(validateFxQuote(manual({ actualPayment: 100 }))).toEqual({ valid: false, reason: 'unknown-quote-field' });
  });

  it('rejects inherited quote or monetary fields that would be lost from provenance snapshots', () => {
    const inheritedQuote = Object.create(manual());
    expect(validateFxQuote(inheritedQuote)).toEqual({ valid: false, reason: 'invalid-quote' });
    expect(valueWithFxQuote(original, 'USD', DATE, inheritedQuote)).toMatchObject({
      status: 'missing-rate', reason: 'invalid-quote',
    });
    expect(validateFxMoney(Object.create(original))).toEqual({ valid: false, reason: 'invalid-money' });
  });

  it('accepts data records without a prototype when all quote fields are their own', () => {
    const quote = Object.assign(Object.create(null), manual());
    expect(validateFxQuote(quote)).toEqual({ valid: true });
    const result = valueWithFxQuote(original, 'USD', DATE, quote);
    expect(result.amount).toBe(100);
    expect(result.quote).toEqual(manual());
  });

  it.each([NaN, Infinity, -Infinity, '80', null, undefined, true, 80n])('rejects invalid original amount %p without coercion', (amount) => {
    expect(validateFxMoney({ amount, currency: 'EUR' })).toEqual({ valid: false, reason: 'invalid-amount' });
    const result = valueWithFxQuote({ amount, currency: 'EUR' }, 'USD', DATE, manual());
    expect(result).toEqual({ status: 'invalid-input', reason: 'invalid-amount' });
    expect(result).not.toHaveProperty('amount');
  });

  it('rejects invalid request objects, dates, and currencies before any identity shortcut', () => {
    expect(valueWithFxQuote(null, 'USD', DATE)).toEqual({ status: 'invalid-input', reason: 'invalid-money' });
    expect(valueWithFxQuote({ amount: 2, currency: 'ZZZ' }, 'ZZZ', DATE)).toEqual({ status: 'invalid-input', reason: 'invalid-currency' });
    expect(valueWithFxQuote(original, 'BRL', DATE)).toEqual({ status: 'invalid-input', reason: 'invalid-target-currency' });
    expect(valueWithFxQuote(original, 'EUR', '2026-02-30')).toEqual({ status: 'invalid-input', reason: 'invalid-transaction-date' });
  });
});

describe('quote provenance contracts', () => {
  it('accepts separate manual, historical, and legacy-estimate source contracts', () => {
    expect(validateFxQuote(manual())).toEqual({ valid: true });
    expect(validateFxQuote(historical())).toEqual({ valid: true });
    expect(validateFxQuote(manual({ sourceType: 'legacy-estimate', origin: 'documented-static-estimate' }))).toEqual({ valid: true });
  });

  it.each([
    { sourceType: 'actual-payment' }, { sourceType: 'provider' }, { sourceType: undefined },
  ])('rejects unrecognized source type %p', (patch) => {
    expect(validateFxQuote(manual(patch))).toEqual({ valid: false, reason: 'invalid-source-type' });
  });

  it.each([
    { origin: '' }, { origin: ' ' }, { origin: ' user-entry' }, { origin: undefined },
    { provider: 'example-provider' }, { retrievedAt: '2026-06-11T00:00:00Z' },
  ])('rejects inconsistent manual metadata %p', (patch) => {
    expect(validateFxQuote(manual(patch))).toEqual({ valid: false, reason: 'invalid-provenance' });
  });

  it('rejects legacy estimates with provider metadata or missing origin', () => {
    expect(validateFxQuote(manual({ sourceType: 'legacy-estimate', provider: 'ecb' }))).toEqual({ valid: false, reason: 'invalid-provenance' });
    expect(validateFxQuote(manual({ sourceType: 'legacy-estimate', origin: '' }))).toEqual({ valid: false, reason: 'invalid-provenance' });
  });

  it.each([{ provider: undefined }, { provider: '' }, { provider: ' provider ' }, { origin: 'user-entry' }])(
    'rejects inconsistent historical provenance %p', (patch) => {
      expect(validateFxQuote(historical(patch))).toEqual({ valid: false, reason: 'invalid-provenance' });
    }
  );

  it.each([
    undefined, null, DATE, '2026-06-11T12:30:00', '2026-06-11T12:30:00+00:00',
    '2026-06-11T24:00:00Z', '2026-06-11T12:60:00Z', '2026-06-11T12:30:60Z',
    '2026-02-30T12:30:00Z', '2026-06-11T12:30:00Z\n',
  ])('rejects invalid retrieval timestamp %p', (retrievedAt) => {
    expect(validateFxQuote(historical({ retrievedAt }))).toEqual({ valid: false, reason: 'invalid-retrieval-timestamp' });
  });

  it('accepts UTC retrieval timestamps with or without milliseconds', () => {
    expect(validateFxQuote(historical({ retrievedAt: '2026-06-11T12:30:00Z' }))).toEqual({ valid: true });
    expect(validateFxQuote(historical({ retrievedAt: '2026-06-11T12:30:00.123Z' }))).toEqual({ valid: true });
  });

  it('rejects a completed-date observation retrieved before its effective date', () => {
    expect(validateFxQuote(historical({ retrievedAt: '2026-06-09T23:59:59Z' }))).toEqual({
      valid: false, reason: 'retrieval-before-effective-date',
    });
  });
});

describe('explicit FX valuation results', () => {
  it('returns the full direct valuation contract with original amount and provenance', () => {
    expect(valueWithFxQuote(original, 'USD', DATE, manual())).toEqual({
      status: 'valued', amount: 100, currency: 'USD', minorUnits: 2,
      original: { amount: 80, currency: 'EUR' }, transactionDate: DATE,
      source: 'manual', quote: manual(), isEstimate: false,
    });
  });

  it('returns identity without requiring or inspecting an unrelated quote', () => {
    expect(valueWithFxQuote({ amount: -10, currency: 'JPY' }, 'JPY', DATE)).toEqual({
      status: 'identity', amount: -10, currency: 'JPY', minorUnits: 0,
      original: { amount: -10, currency: 'JPY' }, transactionDate: DATE,
      source: 'identity', quote: null, isEstimate: false,
    });
    expect(valueWithFxQuote(original, 'EUR', DATE, { rate: 0 }).status).toBe('identity');
  });

  it('keeps a missing-rate result distinct from identity with no invented amount', () => {
    expect(valueWithFxQuote(original, 'USD', DATE)).toEqual({
      status: 'missing-rate', reason: 'missing-quote', currency: 'USD', minorUnits: 2,
      original: { amount: 80, currency: 'EUR' }, transactionDate: DATE,
    });
  });

  it('does not invert reversed quotes or triangulate unrelated currency pairs', () => {
    const reversed = valueWithFxQuote({ amount: 100, currency: 'USD' }, 'EUR', DATE, manual());
    expect(reversed).toMatchObject({ status: 'missing-rate', reason: 'pair-mismatch' });
    expect(reversed).not.toHaveProperty('amount');
    const cross = valueWithFxQuote(original, 'JPY', DATE, manual());
    expect(cross).toMatchObject({ status: 'missing-rate', reason: 'pair-mismatch' });
    expect(cross).not.toHaveProperty('amount');
  });

  it('rejects a quote effective after the requested transaction date', () => {
    const result = valueWithFxQuote(original, 'USD', DATE, historical({ effectiveDate: '2026-06-11' }));
    expect(result).toMatchObject({ status: 'missing-rate', reason: 'future-effective-date' });
    expect(result).not.toHaveProperty('amount');
  });

  it('does not silently carry a prior quote forward over an unavailable date or weekend', () => {
    const result = valueWithFxQuote(original, 'USD', '2026-06-14', manual({ effectiveDate: '2026-06-12' }));
    expect(result).toMatchObject({ status: 'missing-rate', reason: 'effective-date-mismatch' });
    expect(result).not.toHaveProperty('amount');
  });

  it('keeps historical effective date separate from a later retrieval timestamp', () => {
    const quote = historical({ retrievedAt: '2027-01-01T01:00:00Z' });
    const result = valueWithFxQuote(original, 'USD', DATE, quote);
    expect(result).toMatchObject({ status: 'valued', amount: 100, source: 'historical', transactionDate: DATE });
    expect(result.quote.effectiveDate).toBe(DATE);
    expect(result.quote.retrievedAt).toBe('2027-01-01T01:00:00Z');
    expect(result.quote.provider).toBe('example-provider');
  });

  it('labels an explicitly supplied legacy estimate without claiming historical or actual-payment authority', () => {
    const result = valueWithFxQuote(original, 'USD', DATE, manual({ sourceType: 'legacy-estimate', origin: 'documented-estimate' }));
    expect(result).toMatchObject({ status: 'valued', amount: 100, source: 'legacy-estimate', isEstimate: true });
    expect(result.quote.origin).toBe('documented-estimate');
    expect(result.quote).not.toHaveProperty('provider');
    expect(result.quote).not.toHaveProperty('retrievedAt');
  });

  it.each([[-80, -100], [0, 0]])('values an original amount of %s as %s', (amount, expected) => {
    expect(valueWithFxQuote({ amount, currency: 'EUR' }, 'USD', DATE, manual()).amount).toBe(expected);
  });

  it('still requires a quote for zero-valued cross-currency money', () => {
    expect(valueWithFxQuote({ amount: 0, currency: 'EUR' }, 'USD', DATE).status).toBe('missing-rate');
  });

  it('does not fall back to legacy static rates or 1:1 for unsupported or missing data', () => {
    expect(valueWithFxQuote(original, 'USD', DATE).status).toBe('missing-rate');
    expect(valueWithFxQuote({ amount: 80, currency: 'BRL' }, 'USD', DATE, manual()).status).toBe('invalid-input');
    expect(valueWithFxQuote(original, 'USD', DATE, manual({ rate: undefined }))).not.toHaveProperty('amount');
  });

  it.each([[Number.MAX_VALUE, 2], [Number.MIN_VALUE, 0.1]])('rejects unrepresentable arithmetic for amount %p and rate %p', (amount, rate) => {
    const result = valueWithFxQuote({ amount, currency: 'EUR' }, 'USD', DATE, manual({ rate }));
    expect(result).toMatchObject({ status: 'missing-rate', reason: 'unrepresentable-result' });
    expect(result).not.toHaveProperty('amount');
  });

  it('keeps frozen inputs unchanged and returns independent result snapshots', () => {
    const money = Object.freeze({ ...original });
    const quote = Object.freeze(historical());
    const first = valueWithFxQuote(money, 'USD', DATE, quote);
    const second = valueWithFxQuote(money, 'USD', DATE, quote);
    expect(first).toEqual(second);
    first.original.amount = 999;
    first.quote.rate = 999;
    expect(money.amount).toBe(80);
    expect(quote.rate).toBe(1.25);
    expect(second.amount).toBe(100);
    expect(second.quote.rate).toBe(1.25);
  });

  it('does not consult the host clock when validating or repeatedly valuing a historical date', () => {
    const clock = jest.spyOn(Date, 'now').mockImplementation(() => { throw new Error('Unexpected clock read'); });
    try {
      expect(valueWithFxQuote(original, 'USD', DATE, historical()).amount).toBe(100);
      expect(valueWithFxQuote(original, 'USD', DATE, historical()).amount).toBe(100);
    } finally {
      clock.mockRestore();
    }
  });
});

describe('valuation precision versus display precision', () => {
  it('does not round intermediate or original amounts to two-decimal target precision', () => {
    const money = { amount: 1.2345, currency: 'EUR' };
    const result = valueWithFxQuote(money, 'USD', DATE, manual({ rate: 1.234567 }));
    expect(result.amount).toBe(1.5240729615);
    expect(result.original.amount).toBe(1.2345);
    expect(result.minorUnits).toBe(2);
    expect(formatFxAmount(result.amount, result.currency)).toBe('1.52');
    expect(result.amount).toBe(1.5240729615);
  });

  it('rounds only at the explicit display boundary for zero-decimal currencies', () => {
    const result = valueWithFxQuote({ amount: 1, currency: 'USD' }, 'JPY', DATE,
      manual({ baseCurrency: 'USD', quoteCurrency: 'JPY', rate: 157.5 }));
    expect(result.amount).toBe(157.5);
    expect(result.minorUnits).toBe(0);
    expect(formatFxAmount(result.amount, 'JPY')).toBe('158');
    expect(formatFxAmount(result.amount, 'TWD')).toBe('158');
  });

  it('formats two-decimal amounts without inventing currency symbols or changing signs', () => {
    expect(formatFxAmount(12, 'USD')).toBe('12.00');
    expect(formatFxAmount(-12.345, 'EUR')).toBe('-12.35');
    expect(formatFxAmount(0, 'USD')).toBe('0.00');
  });

  it('rejects invalid display inputs rather than applying USD fallback', () => {
    expect(formatFxAmount(12, 'ZZZ')).toBeNull();
    expect(formatFxAmount(NaN, 'USD')).toBeNull();
    expect(formatFxAmount('12', 'USD')).toBeNull();
  });
});

describe('stable FX input snapshots', () => {
  it('rejects a stateful rate getter instead of validating 1.25, calculating at 2.50, and returning 3.75', () => {
    let reads = 0;
    const quote = manual();
    Object.defineProperty(quote, 'rate', {
      enumerable: true,
      get() {
        reads += 1;
        return reads <= 3 ? 1.25 : reads === 4 ? 2.5 : 3.75;
      },
    });
    const result = valueWithFxQuote(original, 'USD', DATE, quote);
    expect({ status: result.status, amount: result.amount, rate: result.quote?.rate, reads }).toEqual({
      status: 'missing-rate', amount: undefined, rate: undefined, reads: 0,
    });
    expect(result.reason).toBe('invalid-quote');
  });

  it.each([
    [manual, 'origin'], [historical, 'provider'], [historical, 'retrievedAt'],
    [manual, 'baseCurrency'], [manual, 'quoteCurrency'], [manual, 'effectiveDate'], [manual, 'sourceType'],
  ])('rejects accessor field %p %s without invoking its getter', (makeQuote, field) => {
    const quote = makeQuote();
    const get = jest.fn(() => { throw new Error('Getter must not run'); });
    Object.defineProperty(quote, field, { enumerable: true, get });
    expect(validateFxQuote(quote)).toEqual({ valid: false, reason: 'invalid-quote' });
    const result = valueWithFxQuote(original, 'USD', DATE, quote);
    expect(result).toMatchObject({ status: 'missing-rate', reason: 'invalid-quote' });
    expect(result).not.toHaveProperty('amount');
    expect(get).not.toHaveBeenCalled();
  });

  it.each([
    [manual, 'baseCurrency'], [manual, 'quoteCurrency'], [manual, 'rate'],
    [manual, 'effectiveDate'], [manual, 'sourceType'], [manual, 'origin'],
    [historical, 'provider'], [historical, 'retrievedAt'],
  ])('rejects non-enumerable quote field %p %s that would disappear from provenance', (makeQuote, field) => {
    const quote = makeQuote();
    Object.defineProperty(quote, field, { value: quote[field], enumerable: false });
    expect(validateFxQuote(quote)).toEqual({ valid: false, reason: 'invalid-quote' });
    const result = valueWithFxQuote(original, 'USD', DATE, quote);
    expect(result).toMatchObject({ status: 'missing-rate', reason: 'invalid-quote' });
    expect(result).not.toHaveProperty('amount');
  });

  it.each(['amount', 'currency'])('rejects an original-money %s getter without invoking it', (field) => {
    const money = { ...original };
    const get = jest.fn(() => { throw new Error('Money getter must not run'); });
    Object.defineProperty(money, field, { enumerable: true, get });
    expect(validateFxMoney(money)).toEqual({ valid: false, reason: 'invalid-money' });
    expect(valueWithFxQuote(money, 'USD', DATE, manual())).toEqual({ status: 'invalid-input', reason: 'invalid-money' });
    expect(get).not.toHaveBeenCalled();
  });

  it.each(['amount', 'currency'])('rejects a non-enumerable original-money %s', (field) => {
    const money = { ...original };
    Object.defineProperty(money, field, { value: money[field], enumerable: false });
    expect(validateFxMoney(money)).toEqual({ valid: false, reason: 'invalid-money' });
    expect(valueWithFxQuote(money, 'USD', DATE, manual())).toEqual({ status: 'invalid-input', reason: 'invalid-money' });
  });

  it.each(['ordinary', 'frozen', 'null-prototype'])('keeps %s money/quotes and extra money fields usable', (kind) => {
    const moneyData = { ...original, id: 'expense-id', note: 'Dinner', createdAt: 1781049600000 };
    const money = kind === 'frozen' ? Object.freeze(moneyData)
      : kind === 'null-prototype' ? Object.assign(Object.create(null), moneyData) : moneyData;
    const quoteData = historical();
    const quote = kind === 'frozen' ? Object.freeze(quoteData)
      : kind === 'null-prototype' ? Object.assign(Object.create(null), quoteData) : quoteData;
    expect(validateFxMoney(money)).toEqual({ valid: true });
    expect(validateFxQuote(quote)).toEqual({ valid: true });
    const result = valueWithFxQuote(money, 'USD', DATE, quote);
    expect(result).toMatchObject({ status: 'valued', amount: 100, original, quote: historical() });
    expect(result.quote).not.toBe(quote);
    expect(result.original).not.toBe(money);
    expect(money.id).toBe('expense-id');
    expect(money.note).toBe('Dinner');
  });

  it.each([
    [80, 1.25, 100], [-80, 1.25, -100], [0, 1.25, 0],
    [1, 0.123456789, 0.123456789], [0.125, 1.234567, 0.154320875],
  ])('keeps amount %p times rate %p consistent with its returned snapshots', (amount, rate, expected) => {
    const result = valueWithFxQuote({ amount, currency: 'EUR' }, 'USD', DATE, manual({ rate }));
    expect(result.status).toBe('valued');
    expect(result.amount).toBeCloseTo(expected, 12);
    expect(result.amount).toBeCloseTo(result.original.amount * result.quote.rate, 12);
    expect(result.original.amount).toBe(amount);
    expect(result.quote.rate).toBe(rate);
  });

  it('ignores unrelated money getters instead of reading or rejecting extra application fields', () => {
    const money = { ...original, id: 'expense-id' };
    const get = jest.fn(() => { throw new Error('Unrelated getter must not run'); });
    Object.defineProperty(money, 'note', { enumerable: true, get });
    expect(validateFxMoney(money)).toEqual({ valid: true });
    expect(valueWithFxQuote(money, 'USD', DATE, manual()).amount).toBe(100);
    expect(get).not.toHaveBeenCalled();
  });

  it('preserves identity behavior without inspecting an unused quote getter', () => {
    const quote = manual();
    const get = jest.fn(() => { throw new Error('Unused quote must not be inspected'); });
    Object.defineProperty(quote, 'rate', { enumerable: true, get });
    expect(valueWithFxQuote(original, 'EUR', DATE, quote)).toMatchObject({
      status: 'identity', amount: 80, original, quote: null,
    });
    expect(get).not.toHaveBeenCalled();
  });
});
