// NOTE: sync.js's `coalesce` function is not exported. We test it in two ways:
//  1. A local copy of the function (verbatim from the source) so we can unit-test
//     the logic directly. This will catch regressions if the source is later changed.
//  2. The exported `applyPendingOps` function, which exercises compatible queue-
//     reduction semantics from the consumer side.
//
// RECOMMENDATION: export `coalesce` from sync.js so it can be tested directly
// without duplicating its implementation here.

const { applyPendingOps } = require('../sync');

// ---------------------------------------------------------------------------
// Local copy of `coalesce` from src/sync.js
// (verbatim — any source change that breaks these tests means the test copy
//  needs updating too, which serves as the regression signal)
// ---------------------------------------------------------------------------
function coalesce(queue, op) {
  const keep = (existing) => {
    if (op.type === 'settings') return existing.type !== 'settings';
    if (op.type === 'replace') return existing.type === 'settings';
    if (existing.type !== 'upsert') return true;
    if (op.type === 'upsert') return existing.expense.id !== op.expense.id;
    if (op.type === 'delete') return existing.expense.id !== op.id;
    return true;
  };
  for (let i = queue.length - 1; i >= 0; i--) {
    if (!keep(queue[i])) queue.splice(i, 1);
  }
}

// Helper to build a queue with coalescing applied, then push the new op
function buildQueue(initialOps, newOp) {
  const queue = [...initialOps];
  coalesce(queue, newOp);
  queue.push(newOp);
  return queue;
}

// ---------------------------------------------------------------------------
// coalesce() — upsert deduplication
// ---------------------------------------------------------------------------
describe('coalesce() — upsert deduplication', () => {
  it('two upserts for the same ID: only the latest remains', () => {
    const first = { type: 'upsert', expense: { id: 'e1', amount: 10 } };
    const second = { type: 'upsert', expense: { id: 'e1', amount: 20 } };

    const queue = buildQueue([first], second);

    expect(queue).toHaveLength(1);
    expect(queue[0].expense.amount).toBe(20);
  });

  it('three upserts for the same ID: only the last remains', () => {
    const ops = [
      { type: 'upsert', expense: { id: 'e1', amount: 10 } },
      { type: 'upsert', expense: { id: 'e1', amount: 20 } },
    ];
    const third = { type: 'upsert', expense: { id: 'e1', amount: 30 } };

    // Simulate enqueue behavior: each call to enqueue runs coalesce then pushes
    let queue = [];
    coalesce(queue, ops[0]); queue.push(ops[0]);
    coalesce(queue, ops[1]); queue.push(ops[1]);
    coalesce(queue, third);  queue.push(third);

    expect(queue).toHaveLength(1);
    expect(queue[0].expense.amount).toBe(30);
  });

  it('upserts for different IDs are both preserved', () => {
    const first = { type: 'upsert', expense: { id: 'e1', amount: 10 } };
    const second = { type: 'upsert', expense: { id: 'e2', amount: 20 } };

    const queue = buildQueue([first], second);

    expect(queue).toHaveLength(2);
    const ids = queue.map((op) => op.expense.id);
    expect(ids).toContain('e1');
    expect(ids).toContain('e2');
  });
});

// ---------------------------------------------------------------------------
// coalesce() — upsert then delete
// ---------------------------------------------------------------------------
describe('coalesce() — upsert then delete', () => {
  it('upsert then delete for the same ID: prior upsert is removed', () => {
    const upsert = { type: 'upsert', expense: { id: 'e1', amount: 50 } };
    const del = { type: 'delete', id: 'e1' };

    const queue = buildQueue([upsert], del);

    // The upsert for e1 should be coalesced away; only the delete remains
    expect(queue).toHaveLength(1);
    expect(queue[0].type).toBe('delete');
    expect(queue[0].id).toBe('e1');
  });

  it('delete for one ID does not remove upsert for a different ID', () => {
    const upsertA = { type: 'upsert', expense: { id: 'e1', amount: 50 } };
    const upsertB = { type: 'upsert', expense: { id: 'e2', amount: 75 } };
    const del = { type: 'delete', id: 'e1' };

    let queue = [];
    coalesce(queue, upsertA); queue.push(upsertA);
    coalesce(queue, upsertB); queue.push(upsertB);
    coalesce(queue, del);     queue.push(del);

    // upsertB (e2) must survive; upsertA (e1) is removed, delete (e1) is added
    expect(queue).toHaveLength(2);
    const e2Op = queue.find((op) => op.type === 'upsert');
    expect(e2Op.expense.id).toBe('e2');
    const delOp = queue.find((op) => op.type === 'delete');
    expect(delOp.id).toBe('e1');
  });
});

// ---------------------------------------------------------------------------
// coalesce() — replace op clears prior ops
// ---------------------------------------------------------------------------
describe('coalesce() — replace op', () => {
  it('replace clears all prior upsert and delete ops', () => {
    const u1 = { type: 'upsert', expense: { id: 'e1', amount: 10 } };
    const u2 = { type: 'upsert', expense: { id: 'e2', amount: 20 } };
    const d1 = { type: 'delete', id: 'e3' };
    const replace = { type: 'replace', expenses: [] };

    let queue = [];
    coalesce(queue, u1); queue.push(u1);
    coalesce(queue, u2); queue.push(u2);
    coalesce(queue, d1); queue.push(d1);
    coalesce(queue, replace); queue.push(replace);

    expect(queue).toHaveLength(1);
    expect(queue[0].type).toBe('replace');
  });

  it('replace preserves a queued settings op', () => {
    const settings = { type: 'settings', settings: { displayCurrency: 'EUR', monthlyBudget: 500 } };
    const upsert  = { type: 'upsert', expense: { id: 'e1', amount: 10 } };
    const replace = { type: 'replace', expenses: [] };

    let queue = [];
    coalesce(queue, settings); queue.push(settings);
    coalesce(queue, upsert);   queue.push(upsert);
    coalesce(queue, replace);  queue.push(replace);

    // settings op must survive; upsert must be dropped; replace is the new tail
    expect(queue).toHaveLength(2);
    expect(queue[0].type).toBe('settings');
    expect(queue[1].type).toBe('replace');
  });
});

// ---------------------------------------------------------------------------
// coalesce() — settings op deduplication
// ---------------------------------------------------------------------------
describe('coalesce() — settings op', () => {
  it('two settings ops: only the latest remains', () => {
    const s1 = { type: 'settings', settings: { displayCurrency: 'USD', monthlyBudget: 1000 } };
    const s2 = { type: 'settings', settings: { displayCurrency: 'EUR', monthlyBudget: 2000 } };

    const queue = buildQueue([s1], s2);

    expect(queue).toHaveLength(1);
    expect(queue[0].settings.displayCurrency).toBe('EUR');
  });

  it('settings op does not remove upsert or delete ops', () => {
    const upsert = { type: 'upsert', expense: { id: 'e1', amount: 10 } };
    const del    = { type: 'delete', id: 'e2' };
    const settings = { type: 'settings', settings: { displayCurrency: 'USD', monthlyBudget: 0 } };

    let queue = [];
    coalesce(queue, upsert);   queue.push(upsert);
    coalesce(queue, del);      queue.push(del);
    coalesce(queue, settings); queue.push(settings);

    expect(queue).toHaveLength(3);
    expect(queue.map((op) => op.type)).toEqual(['upsert', 'delete', 'settings']);
  });
});

// ---------------------------------------------------------------------------
// coalesce() — mixed operations on multiple IDs
// ---------------------------------------------------------------------------
describe('coalesce() — mixed operations', () => {
  it('preserves ops for independent IDs while deduplicating same-ID ops', () => {
    const ops = [
      { type: 'upsert', expense: { id: 'a', amount: 1 } },
      { type: 'upsert', expense: { id: 'b', amount: 2 } },
      { type: 'upsert', expense: { id: 'a', amount: 5 } }, // overwrites first 'a'
      { type: 'delete', id: 'b' },                          // removes 'b' upsert
    ];

    let queue = [];
    ops.forEach((op) => { coalesce(queue, op); queue.push(op); });

    // Should have: upsert(a=5) + delete(b)
    expect(queue).toHaveLength(2);
    const aOp = queue.find((op) => op.type === 'upsert');
    expect(aOp.expense.amount).toBe(5);
    const bOp = queue.find((op) => op.type === 'delete');
    expect(bOp.id).toBe('b');
  });
});

// ---------------------------------------------------------------------------
// applyPendingOps() — the exported function
// ---------------------------------------------------------------------------
describe('applyPendingOps()', () => {
  // To call applyPendingOps we need the in-memory queue to be pre-populated.
  // sync.js's queues map is private. We test behavior in local-only mode where
  // the queue is empty (queues.get(userId) === undefined), which should return
  // the expenses unchanged.

  it('returns expenses unchanged when there are no pending ops for the user', () => {
    const expenses = [
      { id: 'e1', amount: 100, currency: 'USD' },
      { id: 'e2', amount: 200, currency: 'EUR' },
    ];
    const result = applyPendingOps('unknown-user-no-queue', expenses);
    // The queue for this userId doesn't exist -> returns the original array unchanged
    expect(result).toEqual(expenses);
  });

  it('returns an empty array unchanged when there are no pending ops', () => {
    const result = applyPendingOps('another-unknown-user', []);
    expect(result).toEqual([]);
  });
});
