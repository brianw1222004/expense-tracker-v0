import { isFxCurrency, isFxDate, validateFxQuote } from './fx';

// Inactive provider adapter: one request, no retries, cache, or app integration.
const ENDPOINT = 'https://api.frankfurter.dev/v2/rates';
const MAX_BODY_CHARS = 16384;
const MAX_TIMEOUT_MS = 8000;
const failure = (status, reason) => ({ status, reason });
const positive = (value) => typeof value === 'number' && Number.isFinite(value) && value > 0;

function requestSnapshot(input) {
  if (!input || typeof input !== 'object') return null;
  const prototype = Object.getPrototypeOf(input);
  if (prototype !== Object.prototype && prototype !== null) return null;
  const descriptors = Object.getOwnPropertyDescriptors(input);
  const snapshot = {};
  for (const key of ['baseCurrency', 'quoteCurrency', 'transactionDate']) {
    const descriptor = descriptors[key];
    if (!descriptor || !('value' in descriptor) || !descriptor.enumerable) return null;
    snapshot[key] = descriptor.value;
  }
  return snapshot;
}

async function readResponse(url, fetchImpl, signal) {
  const response = await fetchImpl(url, {
    method: 'GET', headers: { Accept: 'application/json' },
    credentials: 'omit', redirect: 'error', signal,
  });
  const httpStatus = response.status;
  if (httpStatus === 404) return { httpStatus, ...failure('unavailable', 'http-not-found') };
  if (httpStatus === 422) return { httpStatus, ...failure('invalid-request', 'provider-rejected-request') };
  if (httpStatus === 429) return { httpStatus, ...failure('temporary-failure', 'rate-limited') };
  if (httpStatus === 408 || (httpStatus >= 500 && httpStatus <= 599)) {
    return { httpStatus, ...failure('temporary-failure', 'http-server-error') };
  }
  if (httpStatus !== 200) return { httpStatus, ...failure('invalid-response', 'unexpected-http-status') };
  if (Number(response.headers?.get?.('content-length')) > MAX_BODY_CHARS) {
    return { httpStatus, ...failure('invalid-response', 'oversized-response') };
  }
  const text = await response.text();
  if (text.length > MAX_BODY_CHARS) return { httpStatus, ...failure('invalid-response', 'oversized-response') };
  try { return { httpStatus, rows: JSON.parse(text) }; }
  catch { return { httpStatus, ...failure('invalid-response', 'malformed-json') }; }
}

function readObservation(rows, request) {
  if (!Array.isArray(rows)) return failure('invalid-response', 'expected-array');
  if (rows.length === 0) return failure('unavailable', 'missing-observation');
  if (rows.length !== 1) return failure('invalid-response', 'ambiguous-rows');
  const row = rows[0];
  if (!row || typeof row !== 'object' || Array.isArray(row)) return failure('invalid-response', 'invalid-row');
  if (row.base !== request.baseCurrency || row.quote !== request.quoteCurrency) return failure('invalid-response', 'pair-mismatch');
  if (!positive(row.rate)) return failure('invalid-response', 'invalid-rate');
  if (!isFxDate(row.date)) return failure('invalid-response', 'invalid-observation-date');
  if (!Array.isArray(row.providers) || row.providers.length !== 1) return failure('invalid-response', 'invalid-attribution');
  const provider = row.providers[0];
  if (!provider || provider.key !== 'BOC' || provider.date !== row.date || provider.rate !== row.rate
      || (provider.excluded !== undefined && provider.excluded !== false)) {
    return failure('invalid-response', 'invalid-attribution');
  }
  const attribution = { key: provider.key, date: provider.date, rate: provider.rate };
  if (provider.excluded === false) attribution.excluded = false;
  return { observation: { rate: row.rate, effectiveDate: row.date, attribution: [attribution] } };
}

/**
 * Request one explicitly dated BOC quote. Options inject fetchImpl, a synchronous
 * UTC ISO-string clock (now), an optional AbortSignal, and timeoutMs (1..8000).
 * Success: { status: 'available', quote, provenance }; failures have status/reason
 * and no quote/amount. Same-currency identity belongs to FX-1, not this provider.
 * Non-native directions are provider-derived; no independent leg verification.
 */
export async function fetchBocHistoricalQuote(input, options = {}) {
  if (!options || typeof options !== 'object' || Array.isArray(options)) return failure('invalid-request', 'invalid-options');
  const {
    fetchImpl = globalThis.fetch, now = () => new Date().toISOString(),
    signal, timeoutMs = MAX_TIMEOUT_MS,
  } = options;
  let request;
  try { request = requestSnapshot(input); } catch { /* Treat malformed records as invalid requests. */ }
  if (!request) return failure('invalid-request', 'invalid-request-record');
  const { baseCurrency, quoteCurrency, transactionDate } = request;
  if (!isFxCurrency(baseCurrency) || !isFxCurrency(quoteCurrency)) return failure('invalid-request', 'invalid-currency');
  if (baseCurrency === quoteCurrency) return failure('invalid-request', 'identical-pair');
  if (!isFxDate(transactionDate)) return failure('invalid-request', 'invalid-transaction-date');
  if (typeof fetchImpl !== 'function' || typeof now !== 'function'
      || !Number.isInteger(timeoutMs) || timeoutMs < 1 || timeoutMs > MAX_TIMEOUT_MS
      || (signal != null && (typeof signal.aborted !== 'boolean'
        || typeof signal.addEventListener !== 'function' || typeof signal.removeEventListener !== 'function'))) {
    return failure('invalid-request', 'invalid-options');
  }
  const url = ENDPOINT + '?base=' + baseCurrency + '&quotes=' + quoteCurrency
    + '&date=' + transactionDate + '&providers=BOC&expand=providers';
  const provenance = {
    service: 'frankfurter-v2', source: 'BOC', requested: request, url,
    classification: quoteCurrency === 'CAD' ? 'native' : 'provider-derived',
  };
  if (signal?.aborted) return { ...failure('cancelled', 'request-aborted'), provenance };
  const controller = new AbortController();
  let timer;
  let onAbort;
  const interrupted = new Promise((resolve) => {
    onAbort = () => {
      resolve(failure('cancelled', 'request-aborted'));
      controller.abort();
    };
    signal?.addEventListener('abort', onAbort, { once: true });
    if (signal?.aborted) onAbort();
    timer = setTimeout(() => {
      resolve(failure('temporary-failure', 'timeout'));
      controller.abort();
    }, timeoutMs);
  });
  try {
    const result = await Promise.race([interrupted, readResponse(url, fetchImpl, controller.signal)]);
    if (result.httpStatus !== undefined) provenance.httpStatus = result.httpStatus;
    if (result.status) return { ...failure(result.status, result.reason), provenance };
    if (signal?.aborted) return { ...failure('cancelled', 'request-aborted'), provenance };
    const validated = readObservation(result.rows, request);
    if (validated.status) return { ...validated, provenance };
    const observation = validated.observation;
    provenance.observationDate = observation.effectiveDate;
    provenance.attribution = observation.attribution;
    if (observation.effectiveDate !== transactionDate) {
      return { ...failure('unavailable', 'observation-date-mismatch'), provenance };
    }
    let retrievedAt;
    try { retrievedAt = now(); } catch { return { ...failure('invalid-request', 'invalid-retrieval-clock'), provenance }; }
    const quote = {
      baseCurrency, quoteCurrency, rate: observation.rate, effectiveDate: observation.effectiveDate,
      sourceType: 'historical', provider: 'frankfurter-v2:BOC', retrievedAt,
    };
    if (!validateFxQuote(quote).valid) return { ...failure('invalid-request', 'invalid-retrieval-clock'), provenance };
    if (signal?.aborted) return { ...failure('cancelled', 'request-aborted'), provenance };
    provenance.retrievedAt = retrievedAt;
    return { status: 'available', quote, provenance };
  } catch (error) {
    const aborted = signal?.aborted || error?.name === 'AbortError';
    return {
      status: aborted ? 'cancelled' : 'temporary-failure',
      reason: aborted ? 'request-aborted' : error?.name === 'TimeoutError' ? 'timeout' : 'network-failure',
      provenance,
    };
  } finally {
    clearTimeout(timer);
    signal?.removeEventListener('abort', onAbort);
    controller.abort();
  }
}
