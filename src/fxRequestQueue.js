import { getHistoricalFxRate } from './fxRateService';

export const fxRequestKey = (request) => JSON.stringify([
  request.baseCurrency, request.quoteCurrency, request.transactionDate,
]);

// One account-owned, three-worker queue. Updates replace queued priorities;
// already-running lookups may finish, but cancellation is permanent.
export function createFxRequestQueue(scope, onResult, { rateService = getHistoricalFxRate, onCancel } = {}) {
  const controller = new AbortController();
  const active = new Set();
  let wanted = new Set();
  let completed = new Set();
  let pending = [];
  let waiters = [];
  function settle() {
    if (active.size || pending.length) return;
    const ready = waiters;
    waiters = [];
    ready.forEach((resolve) => resolve());
  }
  function cancel() {
    if (controller.signal.aborted) return;
    controller.abort();
    pending = [];
    // Public completion means this queue can no longer publish or start work.
    // Do not depend on an underlying service honoring abort or ever settling.
    active.clear();
    wanted.clear();
    completed.clear();
    settle();
    onCancel?.();
  }
  function pump() {
    while (!controller.signal.aborted && active.size < 3 && pending.length) {
      const request = pending.shift();
      const key = fxRequestKey(request);
      active.add(key);
      (async () => {
        let result;
        try { result = await rateService(scope, request, { signal: controller.signal }); }
        catch { result = { status: 'temporary-failure', reason: 'network-failure' }; }
        try {
          if (result.status === 'cancelled') cancel();
          if (!controller.signal.aborted) {
            if (wanted.has(key)) completed.add(key);
            onResult(request, result);
          }
        } finally {
          active.delete(key);
          pump();
          settle();
        }
      })();
    }
    settle();
  }
  return {
    get cancelled() { return controller.signal.aborted; },
    update(requests, { retryKeys = [] } = {}) {
      if (controller.signal.aborted) return;
      retryKeys.forEach((key) => completed.delete(key));
      const unique = new Map(requests.map((request) => [fxRequestKey(request), { ...request }]));
      wanted = new Set(unique.keys());
      completed = new Set([...completed].filter((key) => wanted.has(key)));
      pending = [...unique].filter(([key]) => !active.has(key) && !completed.has(key)).map(([, request]) => request);
      pump();
    },
    cancel,
    done() {
      return active.size || pending.length ? new Promise((resolve) => waiters.push(resolve)) : Promise.resolve();
    },
  };
}
