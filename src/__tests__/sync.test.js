// `coalesce` and the pure queue reducer `applyExpenseOps` are imported directly
// from the source — no duplicated copy — so a regression in sync.js fails here.
const {
  coalesce,
  applyExpenseOps,
  applyPendingOps,
  pickSyncedSettings,
  fromSettingsRow,
  clearQueues,
} = require('../sync');
const AsyncStorage = require('@react-native-async-storage/async-storage');

// Helper to build a queue the way enqueue() does: coalesce the incoming op
// against the existing queue, then push it.
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
// applyExpenseOps() — the pure queue reducer that folds pending ops over the
// rows pulled from the server (this is what keeps offline edits after a pull).
// ---------------------------------------------------------------------------
describe('applyExpenseOps()', () => {
  it('returns the input unchanged for an empty or missing queue', () => {
    const rows = [{ id: 'e1', amount: 10 }];
    expect(applyExpenseOps([], rows)).toBe(rows);
    expect(applyExpenseOps(undefined, rows)).toBe(rows);
  });

  it('upsert prepends a new row', () => {
    const rows = [{ id: 'e1', amount: 10 }];
    const result = applyExpenseOps([{ type: 'upsert', expense: { id: 'e2', amount: 20 } }], rows);
    expect(result.map((e) => e.id)).toEqual(['e2', 'e1']);
  });

  it('upsert replaces an existing row by id and moves it to the front (no duplicate)', () => {
    const rows = [{ id: 'e1', amount: 10 }, { id: 'e2', amount: 20 }];
    const result = applyExpenseOps([{ type: 'upsert', expense: { id: 'e2', amount: 99 } }], rows);
    expect(result.map((e) => e.id)).toEqual(['e2', 'e1']);
    expect(result.find((e) => e.id === 'e2').amount).toBe(99);
    expect(result).toHaveLength(2);
  });

  it('delete removes the row with the matching id', () => {
    const rows = [{ id: 'e1', amount: 10 }, { id: 'e2', amount: 20 }];
    expect(applyExpenseOps([{ type: 'delete', id: 'e1' }], rows).map((e) => e.id)).toEqual(['e2']);
  });

  it('replace overwrites the entire list', () => {
    const rows = [{ id: 'e1', amount: 10 }];
    const replacement = [{ id: 'x', amount: 1 }, { id: 'y', amount: 2 }];
    expect(applyExpenseOps([{ type: 'replace', expenses: replacement }], rows)).toBe(replacement);
  });

  it('folds a sequence of ops in order so offline edits survive a server pull', () => {
    const server = [{ id: 'e1', amount: 10 }, { id: 'e2', amount: 20 }];
    const queue = [
      { type: 'upsert', expense: { id: 'e3', amount: 30 } }, // added offline
      { type: 'delete', id: 'e1' },                          // deleted offline
      { type: 'upsert', expense: { id: 'e2', amount: 25 } }, // edited offline
    ];
    const result = applyExpenseOps(queue, server);
    expect(result.map((e) => e.id).sort()).toEqual(['e2', 'e3']);
    expect(result.find((e) => e.id === 'e2').amount).toBe(25);
  });
});

// ---------------------------------------------------------------------------
// applyPendingOps() — looks the lane's queue up by userId in a private map. The
// test env never populates it, so it returns the input unchanged.
// ---------------------------------------------------------------------------
describe('applyPendingOps()', () => {
  it('returns expenses unchanged when there are no pending ops for the user', () => {
    const expenses = [
      { id: 'e1', amount: 100, currency: 'USD' },
      { id: 'e2', amount: 200, currency: 'EUR' },
    ];
    expect(applyPendingOps('unknown-user-no-queue', expenses)).toEqual(expenses);
  });

  it('returns an empty array unchanged when there are no pending ops', () => {
    expect(applyPendingOps('another-unknown-user', [])).toEqual([]);
  });
});

// ---------------------------------------------------------------------------
// clearQueues() — the "delete account" purge
// ---------------------------------------------------------------------------
describe('clearQueues()', () => {
  const QUEUE_PREFIX = '@expense-tracker/pending-ops';

  it('removes every lane\'s durable queue key and empties the in-memory lanes', async () => {
    const userId = 'wipe-user';
    const laneKeys = [userId, `${userId}::income`, `${userId}::groups`, `${userId}::splits`];
    // Seed durable queues the way persistQueue writes them. A stale
    // replace-with-empty is exactly the op that must not survive "delete
    // account": replaying it after the account recreates data on another
    // device would silently wipe that data.
    for (const key of laneKeys) {
      await AsyncStorage.setItem(
        `${QUEUE_PREFIX}:${key}`,
        JSON.stringify([{ type: 'replace', expenses: [] }])
      );
    }

    await clearQueues(userId);

    for (const key of laneKeys) {
      expect(await AsyncStorage.getItem(`${QUEUE_PREFIX}:${key}`)).toBeNull();
    }
    // The in-memory expense lane is empty too, so re-applying pending ops on
    // top of a pull is a no-op instead of a replay of the stale wipe.
    const expenses = [{ id: 'e1', amount: 10 }];
    expect(applyPendingOps(userId, expenses)).toEqual(expenses);
  });

  it('leaves other users\' queues untouched', async () => {
    const otherKey = `${QUEUE_PREFIX}:other-user`;
    await AsyncStorage.setItem(otherKey, JSON.stringify([{ type: 'delete', id: 'e9' }]));

    await clearQueues('wipe-user');

    expect(await AsyncStorage.getItem(otherKey)).not.toBeNull();
  });
});

// ---------------------------------------------------------------------------
// Settings sync mapping — pickSyncedSettings / fromSettingsRow
// ---------------------------------------------------------------------------
describe('settings sync mapping', () => {
  it('pickSyncedSettings keeps device-local preferences off the queue', () => {
    const picked = pickSyncedSettings({
      displayCurrency: 'EUR',
      monthlyBudget: 500,
      categoryBudgets: { food: 100 },
      categoryOrder: ['food', 'other'],
      customCategories: [{ id: 'c1', label: 'Pets' }],
      customPaymentMethods: [{ id: 'p1', label: 'Venmo' }],
      theme: 'sand',
      language: 'zh',
      onboardingDone: true,
    });
    expect(picked).toEqual({
      displayCurrency: 'EUR',
      monthlyBudget: 500,
      categoryBudgets: { food: 100 },
      categoryOrder: ['food', 'other'],
      customCategories: [{ id: 'c1', label: 'Pets' }],
      customPaymentMethods: [{ id: 'p1', label: 'Venmo' }],
    });
  });

  it('fromSettingsRow omits NULL columns so the local value stands after merge', () => {
    // A row from a just-migrated (or pre-migration) database: extra columns
    // NULL / absent. Merging this over local settings must not clobber them.
    const settings = fromSettingsRow({ display_currency: 'USD', monthly_budget: 300 });
    expect(settings).toEqual({ displayCurrency: 'USD', monthlyBudget: 300 });

    const local = { categoryBudgets: { food: 50 }, theme: 'sand' };
    expect({ ...local, ...settings }.categoryBudgets).toEqual({ food: 50 });
  });

  it('fromSettingsRow maps concrete columns, including empty pushed values', () => {
    const settings = fromSettingsRow({
      display_currency: 'EUR',
      monthly_budget: '500',
      category_budgets: {},
      category_order: ['food'],
      custom_categories: [],
      custom_payment_methods: [{ id: 'p1' }],
    });
    expect(settings).toEqual({
      displayCurrency: 'EUR',
      monthlyBudget: 500,
      categoryBudgets: {},
      categoryOrder: ['food'],
      customCategories: [],
      customPaymentMethods: [{ id: 'p1' }],
    });
  });
});
