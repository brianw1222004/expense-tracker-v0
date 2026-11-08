import { useCallback, useEffect, useMemo, useRef, useState } from 'react';
import { dateKey, shiftMonthKey } from './format';
import { isFxCurrency, isFxDate, validateFxMoney } from './fx';
import { resolveReportingFx, summarizeReportingFx } from './reportingFx';
import { createFxRequestQueue, fxRequestKey } from './fxRequestQueue';
import { getHistoricalFxRate, FX_CACHE_FRESH_MS } from './fxRateService';
import { FX_CACHE_MAX_ENTRIES } from './fxRateCache';
import { spendingRowKey } from './spendingActivity';

// Source projections only: never consume FX-derived sections/amounts here.
// sharedSpending is deriveSharedSpendingActivity(), not raw full bills.
export function reportingRows(expenses, sharedSpending) {
  return [
    ...[...expenses].sort((a, b) => b.createdAt - a.createdAt).map((item) => ({ ...item, sourceType: 'personal', rowKey: spendingRowKey('personal', item.id) })),
    ...sharedSpending.map((item) => ({ ...item, sourceType: 'shared', rowKey: spendingRowKey('shared', item.id) })),
  ].filter((item) => !item.settlement);
}

export function reportingRequest(row, currency) {
  if (!validateFxMoney(row).valid || !isFxCurrency(currency) || row.currency === currency) return null;
  if (row.createdAt == null) return null;
  let transactionDate;
  try { transactionDate = dateKey(row.createdAt); } catch { return null; }
  return isFxDate(transactionDate) ? { baseCurrency: row.currency, quoteCurrency: currency, transactionDate } : null;
}

export function planReportingRequests(rows, currency, monthKey) {
  if (!/^\d{4}-(0[1-9]|1[0-2])$/.test(monthKey)) return [];
  const months = Array.from({ length: 6 }, (_, index) => shiftMonthKey(monthKey, -index));
  const unique = new Map();
  for (const row of rows) {
    const request = reportingRequest(row, currency);
    if (request && months.includes(request.transactionDate.slice(0, 7))) unique.set(fxRequestKey(request), request);
  }
  return [...unique.values()].sort((a, b) => months.indexOf(a.transactionDate.slice(0, 7)) - months.indexOf(b.transactionDate.slice(0, 7))
    || a.transactionDate.localeCompare(b.transactionDate) || fxRequestKey(a).localeCompare(fxRequestKey(b)));
}

function usable(record, now) {
  return record && now >= record.checkedAt && now < record.checkAfter
    && (record.result.status !== 'available' || Date.parse(record.result.quote?.retrievedAt) <= now);
}

function prune(context) {
  const inactive = [...context.outcomes.keys()].filter((key) => !context.wanted.has(key));
  inactive.slice(0, Math.max(0, inactive.length - FX_CACHE_MAX_ENTRIES)).forEach((key) => context.outcomes.delete(key));
}

/** One App-owned lookup lifecycle. Disabled by default; no persisted valuations.
 * accountToken must identify the current loaded account lifetime (including A-B-A).
 * Injectable service/clock support deterministic tests, not alternate FX policy.
 */
export default function useReportingFx({
  userId, dataUser, accountToken, expenses, sharedSpending, currency, monthKey,
  enabled = false, blocked = false, refreshKey = 0,
  rateService = getHistoricalFxRate, now = Date.now,
}) {
  const active = Boolean(enabled && userId && dataUser === userId && !blocked);
  const current = useRef(null);
  const [revision, setRevision] = useState(0);
  const [refreshNonce, setRefreshNonce] = useState(0);
  const publish = () => setRevision((value) => value + 1);
  if (!current.current || current.current.userId !== userId || current.current.currency !== currency
      || current.current.accountToken !== accountToken || current.current.active !== active
      || current.current.rateService !== rateService) {
    current.current = { userId, currency, accountToken, active, rateService, key: {},
      outcomes: new Map(), wanted: new Set(), queue: null, closed: false, refreshKey, refreshNonce };
  }
  const context = current.current;
  const rows = useMemo(() => active ? reportingRows(expenses, sharedSpending) : [],
    [active, expenses, sharedSpending, refreshKey, refreshNonce]);
  const plan = planReportingRequests(rows, currency, monthKey);
  const planKey = JSON.stringify(plan);
  const time = now();
  const expired = [...context.outcomes].filter(([, record]) => !usable(record, time)).map(([key]) => key);
  const expiredKey = JSON.stringify(expired);
  const refreshing = context.refreshKey !== refreshKey || context.refreshNonce !== refreshNonce;
  const refresh = useCallback(() => { if (current.current?.active) setRefreshNonce((value) => value + 1); }, []);

  useEffect(() => {
    context.closed = false;
    return () => {
      context.closed = true;
      context.queue?.cancel();
      context.queue = null;
      context.outcomes.clear();
    };
  }, [context]);

  useEffect(() => {
    if (!active || context.closed) return;
    context.wanted = new Set(plan.map(fxRequestKey));
    const retryKeys = [...expired];
    if (refreshing) {
      for (const [key, record] of context.outcomes) {
        if (record.result.status !== 'available' || record.result.cache?.stale || !usable(record, now())) retryKeys.push(key);
      }
    }
    context.refreshKey = refreshKey;
    context.refreshNonce = refreshNonce;
    retryKeys.forEach((key) => context.outcomes.delete(key));
    prune(context);
    // A suspended service permanently cancels its worker. Only an explicit
    // refresh may replace it in this context; publication/rerenders never retry.
    if (context.queue?.cancelled) {
      if (!refreshing) return;
      context.queue = null;
    }
    if (!context.queue) {
      const queue = createFxRequestQueue(userId, (request, result) => {
        if (current.current !== context || context.closed || context.queue !== queue) return;
        const checkedAt = now();
        const retrievedAt = Date.parse(result.quote?.retrievedAt);
        // A broken injected/service result must settle as a failure, not create an
        // immediately-expired entry that retries forever on each publication.
        const invalidClock = result.status === 'available' && (!Number.isFinite(retrievedAt) || retrievedAt > checkedAt
          || (!result.cache?.stale && checkedAt - retrievedAt >= FX_CACHE_FRESH_MS));
        const outcome = invalidClock ? { status: 'invalid-response', reason: 'invalid-retrieval-timestamp' } : result;
        const freshUntil = outcome.status === 'available' && !outcome.cache?.stale
          ? retrievedAt + FX_CACHE_FRESH_MS : checkedAt + FX_CACHE_FRESH_MS;
        context.outcomes.set(fxRequestKey(request), { result: outcome, checkedAt, checkAfter: freshUntil });
        prune(context);
        publish();
      }, { rateService, onCancel: () => {
        if (current.current === context && !context.closed && context.queue === queue) publish();
      } });
      context.queue = queue;
    }
    context.queue.update(plan.filter((request) => !usable(context.outcomes.get(fxRequestKey(request)), now())), { retryKeys });
    if (retryKeys.length) publish();
  }, [context, planKey, expiredKey, refreshKey, refreshNonce]);

  return useMemo(() => {
    const wanted = new Set(plan.map(fxRequestKey));
    const entries = {};
    for (const row of rows) {
      const request = reportingRequest(row, currency);
      const key = request && fxRequestKey(request);
      const record = key && context.outcomes.get(key);
      const retrying = refreshing && (record?.result.status !== 'available' || record?.result.cache?.stale);
      const pending = wanted.has(key) && (!context.queue?.cancelled || refreshing);
      const lookup = usable(record, time) && !retrying ? record.result : pending ? { status: 'loading' } : null;
      entries[row.rowKey] = resolveReportingFx(row, currency, lookup);
    }
    return { active, userId, currency, accountToken, contextKey: context.key, entries,
      coverage: summarizeReportingFx(Object.values(entries)), refresh };
  }, [context, rows, currency, planKey, expiredKey, revision, refreshKey, refreshNonce]);
}
