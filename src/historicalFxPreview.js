import { dateKey } from './format';
import { valueWithFxQuote } from './fx';
import { getHistoricalFxRate } from './fxRateService';

// Accept only the existing unified spending projection, never full shared bills.
export function historicalPreviewRows(sections, monthKey) {
  return sections.flatMap((section) => section.data).filter((row) =>
    !row.settlement && (row.sourceType === 'personal' || row.sourceType === 'shared')
    && dateKey(row.createdAt).slice(0, 7) === monthKey);
}

export function previewInputKey(rows, currency, scope) {
  return JSON.stringify([scope, currency, rows.map((row) =>
    [row.rowKey, row.amount, row.currency, dateKey(row.createdAt), row.sourceType, !!row.settlement])]);
}

export function initialHistoricalPreview(rows, currency) {
  const entries = {};
  for (const row of rows) {
    const transactionDate = dateKey(row.createdAt);
    const value = valueWithFxQuote(row, currency, transactionDate);
    entries[row.rowKey] = value.status === 'identity'
      ? { status: 'available', amount: value.amount, identity: true, stale: false, transactionDate }
      : { status: value.status === 'invalid-input' ? 'unavailable' : 'loading', transactionDate };
  }
  return summarize(entries);
}

function summarize(entries) {
  const values = Object.values(entries);
  const ready = values.filter((row) => row.status === 'available');
  const loading = values.filter((row) => row.status === 'loading').length;
  const unavailable = values.length - ready.length - loading;
  const sum = ready.reduce((total, row) => total + row.amount, 0);
  const complete = ready.length === values.length && Number.isFinite(sum);
  return {
    entries: { ...entries }, total: values.length, ready: ready.length, loading, unavailable,
    stale: ready.some((row) => row.stale),
    status: complete ? 'complete' : loading ? 'loading' : 'unavailable',
    ...(complete ? { amount: sum } : {}),
  };
}

// One short-lived batch for the selected day/month. No persistent amount cache.
// Deduplicate pair/date lookups, with at most three active requests per batch.
export function startHistoricalFxPreview(rows, currency, scope, onChange, { rateService = getHistoricalFxRate } = {}) {
  const controller = new AbortController();
  const input = rows.filter((row) => !row.settlement && ['personal', 'shared'].includes(row.sourceType))
    .map((row) => ({ rowKey: row.rowKey, amount: row.amount, currency: row.currency, createdAt: row.createdAt }));
  const entries = initialHistoricalPreview(input, currency).entries;
  const jobs = new Map();
  for (const row of input) {
    if (entries[row.rowKey].status !== 'loading') continue;
    const request = { baseCurrency: row.currency, quoteCurrency: currency, transactionDate: dateKey(row.createdAt) };
    const key = JSON.stringify(request);
    if (!jobs.has(key)) jobs.set(key, { request, rows: [] });
    jobs.get(key).rows.push(row);
  }
  onChange(summarize(entries));
  const queue = [...jobs.values()];
  let next = 0;
  async function worker() {
    while (!controller.signal.aborted && next < queue.length) {
      const job = queue[next++];
      let result;
      try { result = await rateService(scope, job.request, { signal: controller.signal }); }
      catch { result = { status: 'temporary-failure', reason: 'network-failure' }; }
      // A scope suspension invalidates the entire old batch, including queued jobs.
      if (result.status === 'cancelled') controller.abort();
      if (controller.signal.aborted) return;
      for (const row of job.rows) {
        const value = result.status === 'available'
          ? valueWithFxQuote(row, currency, job.request.transactionDate, result.quote, { datePolicy: 'previous-observation' })
          : null;
        entries[row.rowKey] = value?.status === 'valued'
          ? { status: 'available', amount: value.amount, transactionDate: value.transactionDate,
            effectiveDate: value.quote.effectiveDate, provider: value.quote.provider,
            retrievedAt: value.quote.retrievedAt, stale: result.cache?.stale === true }
          : { status: 'unavailable', reason: value?.reason ?? result.reason, transactionDate: job.request.transactionDate };
      }
      onChange(summarize(entries));
    }
  }
  const done = Promise.all(Array.from({ length: Math.min(3, queue.length) }, worker));
  return { cancel: () => controller.abort(), done };
}
