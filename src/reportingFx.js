import { convert, getStaticConversionRate } from './currency';
import { isFxCurrency, isFxDate, validateFxMoney, valueWithFxQuote } from './fx';
import { dateKey } from './format';

/**
 * Pure, opt-in reporting valuation; no lookup, storage, clock, or UI activation.
 * row is a saved spending projection ({ rowKey, amount, currency, createdAt }).
 * lookup is a rate-service result, null, or { status: 'loading' }. The service
 * owns provenance/cache validation; only an accepted historical quote is used.
 * All amounts remain unrounded. Treat returned quote/provenance as read-only.
 */
export function resolveReportingFx(row, currency, lookup = null) {
  let transactionDate = null;
  if (row?.createdAt != null) {
    try {
      const localDate = dateKey(row.createdAt);
      if (isFxDate(localDate)) transactionDate = localDate;
    } catch { /* Invalid timestamps cannot acquire a fabricated reporting date. */ }
  }
  const result = {
    rowKey: row?.rowKey ?? null,
    original: { amount: row?.amount, currency: row?.currency },
    currency,
    transactionDate,
    amount: null,
    status: 'unavailable',
    source: null,
    quote: null,
    provenance: null,
    loading: false,
    stale: false,
    reason: null,
  };
  const validation = validateFxMoney(row);
  if (!validation.valid) return { ...result, reason: validation.reason };
  if (!isFxCurrency(currency)) return { ...result, reason: 'invalid-target-currency' };
  if (!transactionDate) return { ...result, reason: 'invalid-transaction-date' };

  const quote = lookup?.status === 'available' && lookup.quote?.sourceType === 'historical'
    ? lookup.quote : null;
  const value = valueWithFxQuote(row, currency, transactionDate, quote,
    { datePolicy: 'previous-observation' });
  if (value.status === 'identity') {
    return { ...result, amount: value.amount, status: 'identity', source: 'identity' };
  }
  if (value.status === 'valued' && value.source === 'historical') {
    return {
      ...result, amount: value.amount, status: 'historical', source: value.quote.provider,
      quote: value.quote, provenance: lookup.provenance ?? null,
      stale: lookup.cache?.stale === true,
    };
  }
  // An accepted rate whose multiplication over/underflows is not a usable
  // historical value. Do not disguise that numeric error with another amount.
  if (value.reason === 'unrepresentable-result') return { ...result, reason: value.reason };

  const loading = lookup?.status === 'loading';
  const rate = getStaticConversionRate(row.currency, currency);
  if (!Number.isFinite(rate) || rate <= 0) return { ...result, loading, reason: 'invalid-static-rate' };
  const amount = convert(row.amount, row.currency, currency);
  if (!Number.isFinite(amount) || (row.amount !== 0 && amount === 0)) {
    return { ...result, loading, reason: 'unrepresentable-result' };
  }
  const reason = lookup?.status === 'available' && lookup.quote && !quote
    ? 'not-historical-quote' : lookup?.reason ?? value.reason;
  return { ...result, amount, status: 'estimated', source: 'legacy-static', loading, reason };
}

/**
 * Count spending rows, not distinct rate requests. Sum in input order at full
 * precision, only for a single target currency. An incomplete total has amount
 * null (never a partial sum); an empty history is a complete zero with no target.
 */
export function summarizeReportingFx(rows = []) {
  const counts = { total: rows.length, identity: 0, historical: 0, estimated: 0, unavailable: 0, loading: 0, stale: 0 };
  const currency = rows[0]?.currency ?? null;
  let amount = 0;
  let reason = null;
  for (const row of rows) {
    const valued = ['identity', 'historical', 'estimated'].includes(row?.status)
      && Number.isFinite(row.amount) && isFxCurrency(row.currency);
    if (valued) {
      counts[row.status] += 1;
      amount += row.amount;
    } else {
      counts.unavailable += 1;
      reason ??= 'unavailable-row';
    }
    if (row?.loading === true) counts.loading += 1;
    if (valued && row.status === 'historical' && row.stale === true) counts.stale += 1;
    if (row?.currency !== currency) reason ??= 'mixed-target-currencies';
  }
  if (!Number.isFinite(amount)) reason ??= 'unrepresentable-total';
  return { ...counts, currency, amount: reason ? null : amount, complete: reason === null, reason };
}
