const { createFxRequestQueue, fxRequestKey } = require('../fxRequestQueue');
const request = (day) => ({ baseCurrency: 'USD', quoteCurrency: 'TWD', transactionDate: `2026-10-${String(day).padStart(2, '0')}` });
const deferred = () => { let resolve; const promise = new Promise((r) => { resolve = r; }); return { promise, resolve }; };
const tick = () => new Promise((resolve) => setImmediate(resolve));

it('deduplicates, captures the original owner, and bounds active lookups to three', async () => {
  const gates = [], received = [];
  let active = 0, peak = 0;
  const service = jest.fn((scope, input) => {
    active++; peak = Math.max(peak, active);
    const gate = deferred(); gates.push(gate);
    return gate.promise.then(() => { active--; return { status: 'unavailable' }; });
  });
  const queue = createFxRequestQueue('alice', (input) => received.push(input), { rateService: service });
  queue.update([request(1), request(1), request(2), request(3), request(4)]);
  expect(service).toHaveBeenCalledTimes(3);
  gates.slice().forEach((gate) => gate.resolve()); await tick();
  expect(service).toHaveBeenCalledTimes(4);
  gates[3].resolve(); await queue.done();
  expect(peak).toBe(3);
  expect(received).toHaveLength(4);
  expect(service.mock.calls.every(([scope]) => scope === 'alice')).toBe(true);
  queue.update([request(1), request(2), request(3), request(4)]);
  expect(service).toHaveBeenCalledTimes(4);
});

it('replaces queued priorities without restarting identical in-flight requests', async () => {
  const gates = [];
  const service = jest.fn(() => { const gate = deferred(); gates.push(gate); return gate.promise; });
  const queue = createFxRequestQueue('alice', jest.fn(), { rateService: service });
  queue.update([1, 2, 3, 4, 5].map(request));
  queue.update([9, 5, 1, 2, 3].map(request));
  expect(service).toHaveBeenCalledTimes(3);
  gates[0].resolve({ status: 'unavailable' }); await tick();
  expect(service.mock.calls[3][1]).toEqual(request(9));
  gates[1].resolve({ status: 'unavailable' }); await tick();
  expect(service.mock.calls[4][1]).toEqual(request(5));
  queue.cancel(); gates.forEach((gate) => gate.resolve({ status: 'unavailable' })); await queue.done();
  expect(service.mock.calls.some(([, input]) => input.transactionDate.endsWith('-04'))).toBe(false);
});

it('permanently cancels queued work and suppresses late completions', async () => {
  const gate = deferred(), received = jest.fn();
  const service = jest.fn(() => gate.promise);
  const queue = createFxRequestQueue('alice', received, { rateService: service });
  queue.update([1, 2, 3, 4, 5].map(request));
  queue.cancel(); queue.update([request(9)]);
  expect(service.mock.calls.every(([, , options]) => options.signal.aborted)).toBe(true);
  gate.resolve({ status: 'available' }); await queue.done();
  expect(received).not.toHaveBeenCalled();
  expect(service).toHaveBeenCalledTimes(3);
});

it('stops the complete queue when the service suspends its scope', async () => {
  const service = jest.fn(async () => ({ status: 'cancelled' }));
  const received = jest.fn(), queue = createFxRequestQueue('alice', received, { rateService: service });
  queue.update([1, 2, 3, 4, 5].map(request)); await queue.done();
  expect(service).toHaveBeenCalledTimes(3);
  expect(received).not.toHaveBeenCalled();
});

it('settles thrown failures once and retries only when explicitly requested', async () => {
  const received = jest.fn(), service = jest.fn(async () => { throw new Error('offline'); });
  const queue = createFxRequestQueue('alice', received, { rateService: service });
  queue.update([request(1)]); await queue.done();
  expect(received).toHaveBeenLastCalledWith(request(1), { status: 'temporary-failure', reason: 'network-failure' });
  queue.update([request(1)]); await queue.done(); expect(service).toHaveBeenCalledTimes(1);
  queue.update([request(1)], { retryKeys: [fxRequestKey(request(1))] }); await queue.done();
  expect(service).toHaveBeenCalledTimes(2);
});

it.each(['resolve', 'reject'])('settles cancellation independently of an abort-ignoring request and suppresses late %s', async (completion) => {
  let resolve, reject;
  const pending = new Promise((yes, no) => { resolve = yes; reject = no; });
  const received = jest.fn(), onCancel = jest.fn(), service = jest.fn(() => pending);
  const queue = createFxRequestQueue('alice', received, { rateService: service, onCancel });
  queue.update([request(1), request(2), request(3), request(4)]);
  let beforeSettled = false, afterSettled = false;
  queue.done().then(() => { beforeSettled = true; });
  expect(queue.cancelled).toBe(false);
  queue.cancel(); queue.cancel();
  queue.done().then(() => { afterSettled = true; });
  await Promise.resolve();
  expect(beforeSettled).toBe(true);
  expect(afterSettled).toBe(true);
  expect(queue.cancelled).toBe(true);
  expect(onCancel).toHaveBeenCalledTimes(1);
  expect(received).not.toHaveBeenCalled();
  if (completion === 'resolve') resolve({ status: 'available' });
  else reject(new Error('Late abort-ignoring failure'));
  await tick(); // Jest also fails if the late rejection becomes unhandled.
  queue.update([request(9)]);
  expect(received).not.toHaveBeenCalled();
  expect(service).toHaveBeenCalledTimes(3);
  await queue.done();
});

it('keeps normal completion pending until the remaining active and queued work finishes', async () => {
  const gates = [], service = jest.fn(() => { const gate = deferred(); gates.push(gate); return gate.promise; });
  const queue = createFxRequestQueue('alice', jest.fn(), { rateService: service });
  queue.update([1, 2, 3, 4].map(request));
  let complete = false;
  queue.done().then(() => { complete = true; });
  gates[0].resolve({ status: 'unavailable' }); await tick();
  expect(complete).toBe(false);
  expect(service).toHaveBeenCalledTimes(4);
  gates.slice(1).forEach((gate) => gate.resolve({ status: 'unavailable' }));
  await queue.done();
  expect(complete).toBe(true);
  expect(queue.cancelled).toBe(false);
});
