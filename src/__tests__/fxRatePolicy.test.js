const { valueWithFxQuote, validateFxQuote } = require('../fx');
const { fetchBocHistoricalQuote } = require('../fxProvider');

const previous = { datePolicy: 'previous-observation' };
const original = { amount: 80, currency: 'USD' };
const quote = (effectiveDate) => ({
  baseCurrency: 'USD', quoteCurrency: 'TWD', rate: 32.426, effectiveDate,
  sourceType: 'historical', provider: 'frankfurter-v2:BOC', retrievedAt: '2027-01-01T00:00:00Z',
});
const request = (transactionDate) => ({ baseCurrency: 'USD', quoteCurrency: 'TWD', transactionDate });
const serve = (date) => jest.fn(async () => ({
  status: 200, headers: { get: () => null },
  text: async () => JSON.stringify([{
    base: 'USD', quote: 'TWD', rate: 32.426, date,
    providers: [{ key: 'BOC', date, rate: 32.426 }],
  }]),
}));

it.each([
  ['2026-10-16', '2026-10-16'], // Same day.
  ['2026-10-18', '2026-10-16'], // Sunday from Friday.
  ['2025-12-25', '2025-12-24'], // Holiday.
  ['2026-10-18', '2026-10-11'], // Inclusive seven-day boundary.
  ['2026-03-09', '2026-03-02'], // DST does not change calendar-day age.
  ['2024-03-01', '2024-02-29'], // Leap day.
  ['2026-01-02', '2025-12-31'], // Year boundary.
])('values transaction %s with observation %s only under the explicit policy', async (transactionDate, effectiveDate) => {
  const observation = Object.freeze(quote(effectiveDate));
  const result = valueWithFxQuote(original, 'TWD', transactionDate, observation, previous);
  expect(result).toMatchObject({ status: 'valued', amount: 80 * 32.426, original, transactionDate, quote: observation });
  expect(validateFxQuote(result.quote)).toEqual({ valid: true });
  expect(observation.effectiveDate).toBe(effectiveDate);
  const fetchImpl = serve(effectiveDate);
  const fetched = await fetchBocHistoricalQuote(request(transactionDate), {
    ...previous, fetchImpl, now: () => '2027-01-01T00:00:00Z',
  });
  expect(fetched.status).toBe('available');
  expect(fetched.quote.effectiveDate).toBe(effectiveDate);
  expect(fetched.provenance.requested.transactionDate).toBe(transactionDate);
  expect(fetched.provenance.observationDate).toBe(effectiveDate);
  expect(fetchImpl).toHaveBeenCalledTimes(1);
  expect(new URL(fetchImpl.mock.calls[0][0]).searchParams.get('date')).toBe(transactionDate);
});

it.each([
  ['2026-10-10', 'observation-too-old'],
  ['2026-10-01', 'observation-too-old'],
  ['2026-10-19', 'future-effective-date'],
])('rejects observation %s with reason %s', async (effectiveDate, reason) => {
  const result = valueWithFxQuote(original, 'TWD', '2026-10-18', quote(effectiveDate), previous);
  expect(result).toMatchObject({ status: 'missing-rate', reason, transactionDate: '2026-10-18' });
  expect(result).not.toHaveProperty('amount');
  const fetched = await fetchBocHistoricalQuote(request('2026-10-18'), {
    ...previous, fetchImpl: serve(effectiveDate), now: () => '2027-01-01T00:00:00Z',
  });
  expect(fetched).toMatchObject({ status: 'unavailable', reason });
  expect(fetched).not.toHaveProperty('quote');
});

it.each(['manual', 'legacy-estimate'])('does not relax %s date validation', (sourceType) => {
  const observation = { ...quote('2026-10-16'), sourceType, origin: 'user-entry' };
  delete observation.provider; delete observation.retrievedAt;
  const result = valueWithFxQuote(original, 'TWD', '2026-10-18', observation, previous);
  expect(result).toMatchObject({ status: 'missing-rate', reason: 'effective-date-mismatch' });
});

it('retains exact-date defaults at both existing boundaries', async () => {
  expect(valueWithFxQuote(original, 'TWD', '2026-10-18', quote('2026-10-16'))).toMatchObject({
    status: 'missing-rate', reason: 'effective-date-mismatch',
  });
  const fetched = await fetchBocHistoricalQuote(request('2026-10-18'), { fetchImpl: serve('2026-10-16') });
  expect(fetched).toMatchObject({ status: 'unavailable', reason: 'observation-date-mismatch' });
});

it('rejects an unknown date policy without HTTP or valuation', async () => {
  const fetchImpl = serve('2026-10-16'), invalid = { datePolicy: 'latest' };
  expect(valueWithFxQuote(original, 'TWD', '2026-10-18', quote('2026-10-16'), invalid)).toEqual({ status: 'invalid-input', reason: 'invalid-date-policy' });
  expect(await fetchBocHistoricalQuote(request('2026-10-18'), { fetchImpl, ...invalid })).toEqual({ status: 'invalid-request', reason: 'invalid-date-policy' });
  expect(fetchImpl).not.toHaveBeenCalled();
});
