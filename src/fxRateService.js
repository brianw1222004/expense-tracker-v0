import { isFxCurrency, isFxDate } from './fx';
import { fetchBocHistoricalQuote, snapshotFxRequest } from './fxProvider';
import { fxRateCache } from './fxRateCache';

export const FX_CACHE_FRESH_MS = 24 * 60 * 60 * 1000;
const failure = (status, reason) => ({ status, reason });

/** Inactive reporting-rate selection only: no amounts or transaction writes.
 * now returns epoch milliseconds. Cache defaults to the isolated AsyncStorage
 * cache; transport/signal/timeout options are forwarded to the BOC adapter.
 */
export async function getHistoricalFxRate(userScope, input, options = {}) {
  if (!options || typeof options !== 'object' || Array.isArray(options)) return failure('invalid-request', 'invalid-options');
  const { cache = fxRateCache, now = Date.now, fetchImpl, signal, timeoutMs } = options;
  if (typeof userScope !== 'string' || !userScope || userScope.trim() !== userScope) return failure('invalid-request', 'invalid-user-scope');
  let request;
  try { request = snapshotFxRequest(input); } catch { /* Invalid input record. */ }
  if (!request) return failure('invalid-request', 'invalid-request-record');
  if (!isFxCurrency(request.baseCurrency) || !isFxCurrency(request.quoteCurrency)) return failure('invalid-request', 'invalid-currency');
  if (!isFxDate(request.transactionDate)) return failure('invalid-request', 'invalid-transaction-date');
  if (request.baseCurrency === request.quoteCurrency) return failure('invalid-request', 'identical-pair');
  if (typeof now !== 'function' || typeof cache?.get !== 'function' || typeof cache?.set !== 'function') return failure('invalid-request', 'invalid-options');
  const cancelled = () => signal?.aborted;
  if (cancelled()) return failure('cancelled', 'request-aborted');
  let nowMs;
  try { nowMs = now(); } catch { return failure('invalid-request', 'invalid-retrieval-clock'); }
  if (!Number.isFinite(nowMs) || !Number.isFinite(new Date(nowMs).getTime())) return failure('invalid-request', 'invalid-retrieval-clock');
  const stored = await cache.get(userScope, request);
  if (cancelled()) return failure('cancelled', 'request-aborted');
  // Future retrieval timestamps are not reusable, including after clock rollback.
  const cached = stored && Date.parse(stored.quote.retrievedAt) <= nowMs ? stored : null;
  if (cached && nowMs - Date.parse(cached.quote.retrievedAt) < FX_CACHE_FRESH_MS) {
    return { status: 'available', ...cached, cache: { source: 'cache', stale: false } };
  }
  const result = await fetchBocHistoricalQuote(request, {
    fetchImpl, signal, timeoutMs, now: () => new Date(now()).toISOString(), datePolicy: 'previous-observation',
  });
  if (cancelled()) return failure('cancelled', 'request-aborted');
  if (result.status === 'available') {
    const saved = await cache.set(userScope, request, result);
    if (cancelled()) return failure('cancelled', 'request-aborted');
    return { ...result, cache: { source: 'network', stale: false, stored: saved } };
  }
  if (cached && result.status === 'temporary-failure') {
    return {
      status: 'available', ...cached,
      cache: { source: 'cache', stale: true, refreshFailure: { status: result.status, reason: result.reason } },
    };
  }
  return result;
}
