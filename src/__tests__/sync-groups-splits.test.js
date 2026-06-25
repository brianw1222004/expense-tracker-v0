// Tests for the groups and splits sync lanes introduced with the Split Bills
// feature. All four exported pure functions are tested here:
//   coalesceGroups, coalesceSplits   — queue coalescing reducers
//   applyGroupOps, applySplitOps     — offline-edit re-application reducers
//
// The pattern mirrors sync.test.js and income-sync.test.js exactly:
// Jest auto-injects globals; require the module directly; no Supabase calls.

const {
  coalesceGroups,
  coalesceSplits,
  applyGroupOps,
  applySplitOps,
  applyPendingGroupOps,
  applyPendingSplitOps,
} = require('../sync');

// ---------------------------------------------------------------------------
// Helpers — mirror the enqueue() call pattern used in production
// ---------------------------------------------------------------------------

function buildGroupQueue(initialOps, newOp) {
  const queue = [...initialOps];
  coalesceGroups(queue, newOp);
  queue.push(newOp);
  return queue;
}

function buildSplitQueue(initialOps, newOp) {
  const queue = [...initialOps];
  coalesceSplits(queue, newOp);
  queue.push(newOp);
  return queue;
}

// ---------------------------------------------------------------------------
// coalesceGroups() — upsert deduplication
// ---------------------------------------------------------------------------

describe('coalesceGroups() — upsert deduplication', () => {
  it('two upserts for the same group ID: only the latest remains', () => {
    const first  = { type: 'upsert', group: { id: 'g1', name: 'Trip' } };
    const second = { type: 'upsert', group: { id: 'g1', name: 'Trip v2' } };
    const queue = buildGroupQueue([first], second);
    expect(queue).toHaveLength(1);
    expect(queue[0].group.name).toBe('Trip v2');
  });

  it('three upserts for the same ID: only the last remains', () => {
    let queue = [];
    const ops = [
      { type: 'upsert', group: { id: 'g1', name: 'A' } },
      { type: 'upsert', group: { id: 'g1', name: 'B' } },
      { type: 'upsert', group: { id: 'g1', name: 'C' } },
    ];
    for (const op of ops) { coalesceGroups(queue, op); queue.push(op); }
    expect(queue).toHaveLength(1);
    expect(queue[0].group.name).toBe('C');
  });

  it('upserts for different IDs are both preserved', () => {
    const a = { type: 'upsert', group: { id: 'g1', name: 'A' } };
    const b = { type: 'upsert', group: { id: 'g2', name: 'B' } };
    const queue = buildGroupQueue([a], b);
    expect(queue).toHaveLength(2);
    expect(queue.map((op) => op.group.id)).toContain('g1');
    expect(queue.map((op) => op.group.id)).toContain('g2');
  });
});

// ---------------------------------------------------------------------------
// coalesceGroups() — upsert then delete
// ---------------------------------------------------------------------------

describe('coalesceGroups() — upsert then delete', () => {
  it('delete drops a queued upsert for the same ID', () => {
    const up  = { type: 'upsert', group: { id: 'g1', name: 'Trip' } };
    const del = { type: 'delete', id: 'g1' };
    const queue = buildGroupQueue([up], del);
    expect(queue).toHaveLength(1);
    expect(queue[0].type).toBe('delete');
    expect(queue[0].id).toBe('g1');
  });

  it('delete for a different ID keeps the upsert', () => {
    const up  = { type: 'upsert', group: { id: 'g1', name: 'Trip' } };
    const del = { type: 'delete', id: 'g2' };
    const queue = buildGroupQueue([up], del);
    expect(queue).toHaveLength(2);
    expect(queue.find((op) => op.type === 'upsert').group.id).toBe('g1');
  });

  it('upsert-then-delete coalescing removes the upsert; only delete survives', () => {
    // Simulates: create group offline → delete it offline before flush
    let queue = [];
    const up  = { type: 'upsert', group: { id: 'g1', name: 'Dinner' } };
    const del = { type: 'delete', id: 'g1' };
    coalesceGroups(queue, up);  queue.push(up);
    coalesceGroups(queue, del); queue.push(del);
    expect(queue).toHaveLength(1);
    expect(queue[0].type).toBe('delete');
    expect(queue[0].id).toBe('g1');
  });
});

// ---------------------------------------------------------------------------
// coalesceGroups() — replace op clears all prior ops
// ---------------------------------------------------------------------------

describe('coalesceGroups() — replace op', () => {
  it('replace supersedes all prior group ops', () => {
    const u1 = { type: 'upsert', group: { id: 'g1', name: 'A' } };
    const u2 = { type: 'upsert', group: { id: 'g2', name: 'B' } };
    const d1 = { type: 'delete', id: 'g3' };
    const replace = { type: 'replace', groups: [] };

    let queue = [];
    for (const op of [u1, u2, d1]) { coalesceGroups(queue, op); queue.push(op); }
    coalesceGroups(queue, replace);
    queue.push(replace);

    expect(queue).toHaveLength(1);
    expect(queue[0].type).toBe('replace');
  });

  it('op ordering is preserved: earlier upserts appear before later ones', () => {
    // After a replace, subsequent upserts are enqueued in order
    const replace = { type: 'replace', groups: [] };
    const u1 = { type: 'upsert', group: { id: 'gA', name: 'First' } };
    const u2 = { type: 'upsert', group: { id: 'gB', name: 'Second' } };

    let queue = [];
    coalesceGroups(queue, replace); queue.push(replace);
    coalesceGroups(queue, u1);      queue.push(u1);
    coalesceGroups(queue, u2);      queue.push(u2);

    expect(queue).toHaveLength(3);
    expect(queue[0].type).toBe('replace');
    expect(queue[1].group.id).toBe('gA');
    expect(queue[2].group.id).toBe('gB');
  });
});

// ---------------------------------------------------------------------------
// coalesceGroups() — per-lane isolation
// (groups ops must not touch splits queue, which is a separate array)
// ---------------------------------------------------------------------------

describe('coalesceGroups() — per-lane isolation', () => {
  it('coalesceGroups does not mutate a separate splits queue', () => {
    const splitsQueue = [
      { type: 'upsert', split: { id: 's1', amount: 50 } },
    ];
    const snapshot = JSON.stringify(splitsQueue);

    const groupsQueue = [];
    const op = { type: 'upsert', group: { id: 'g1', name: 'Trip' } };
    coalesceGroups(groupsQueue, op);

    // splits queue is untouched
    expect(JSON.stringify(splitsQueue)).toBe(snapshot);
  });
});

// ---------------------------------------------------------------------------
// coalesceSplits() — upsert deduplication
// ---------------------------------------------------------------------------

describe('coalesceSplits() — upsert deduplication', () => {
  it('two upserts for the same split ID: only the latest remains', () => {
    const first  = { type: 'upsert', split: { id: 's1', amount: 100 } };
    const second = { type: 'upsert', split: { id: 's1', amount: 200 } };
    const queue = buildSplitQueue([first], second);
    expect(queue).toHaveLength(1);
    expect(queue[0].split.amount).toBe(200);
  });

  it('upserts for different IDs are both preserved', () => {
    const a = { type: 'upsert', split: { id: 's1', amount: 100 } };
    const b = { type: 'upsert', split: { id: 's2', amount: 200 } };
    const queue = buildSplitQueue([a], b);
    expect(queue).toHaveLength(2);
  });
});

// ---------------------------------------------------------------------------
// coalesceSplits() — upsert then delete
// ---------------------------------------------------------------------------

describe('coalesceSplits() — upsert then delete', () => {
  it('delete drops a queued upsert for the same ID', () => {
    const up  = { type: 'upsert', split: { id: 's1', amount: 90 } };
    const del = { type: 'delete', id: 's1' };
    const queue = buildSplitQueue([up], del);
    expect(queue).toHaveLength(1);
    expect(queue[0].type).toBe('delete');
    expect(queue[0].id).toBe('s1');
  });

  it('delete for a different ID keeps the upsert', () => {
    const up  = { type: 'upsert', split: { id: 's1', amount: 90 } };
    const del = { type: 'delete', id: 's2' };
    const queue = buildSplitQueue([up], del);
    expect(queue).toHaveLength(2);
  });

  it('upsert-then-delete coalescing: create-then-delete leaves only the delete', () => {
    let queue = [];
    const up  = { type: 'upsert', split: { id: 's1', amount: 90 } };
    const del = { type: 'delete', id: 's1' };
    coalesceSplits(queue, up);  queue.push(up);
    coalesceSplits(queue, del); queue.push(del);
    expect(queue).toHaveLength(1);
    expect(queue[0].type).toBe('delete');
    expect(queue[0].id).toBe('s1');
  });
});

// ---------------------------------------------------------------------------
// coalesceSplits() — replace op clears all prior ops
// ---------------------------------------------------------------------------

describe('coalesceSplits() — replace op', () => {
  it('replace supersedes all prior split ops', () => {
    const u1 = { type: 'upsert', split: { id: 's1', amount: 10 } };
    const u2 = { type: 'upsert', split: { id: 's2', amount: 20 } };
    const d1 = { type: 'delete', id: 's3' };
    const replace = { type: 'replace', splits: [] };

    let queue = [];
    for (const op of [u1, u2, d1]) { coalesceSplits(queue, op); queue.push(op); }
    coalesceSplits(queue, replace);
    queue.push(replace);

    expect(queue).toHaveLength(1);
    expect(queue[0].type).toBe('replace');
  });

  it('op ordering is preserved after replace: new upserts appear in enqueue order', () => {
    const replace = { type: 'replace', splits: [] };
    const u1 = { type: 'upsert', split: { id: 'sA', amount: 11 } };
    const u2 = { type: 'upsert', split: { id: 'sB', amount: 22 } };

    let queue = [];
    coalesceSplits(queue, replace); queue.push(replace);
    coalesceSplits(queue, u1);      queue.push(u1);
    coalesceSplits(queue, u2);      queue.push(u2);

    expect(queue[0].type).toBe('replace');
    expect(queue[1].split.id).toBe('sA');
    expect(queue[2].split.id).toBe('sB');
  });
});

// ---------------------------------------------------------------------------
// coalesceSplits() — per-lane isolation
// (splits ops must not mutate a groups queue)
// ---------------------------------------------------------------------------

describe('coalesceSplits() — per-lane isolation', () => {
  it('coalesceSplits does not mutate a separate groups queue', () => {
    const groupsQueue = [
      { type: 'upsert', group: { id: 'g1', name: 'Trip' } },
    ];
    const snapshot = JSON.stringify(groupsQueue);

    const splitsQueue = [];
    const op = { type: 'upsert', split: { id: 's1', amount: 50 } };
    coalesceSplits(splitsQueue, op);

    expect(JSON.stringify(groupsQueue)).toBe(snapshot);
  });
});

// ---------------------------------------------------------------------------
// applyGroupOps() — pure queue reducer
// ---------------------------------------------------------------------------

describe('applyGroupOps()', () => {
  it('returns the input unchanged for an empty or missing queue', () => {
    const groups = [{ id: 'g1', name: 'Trip' }];
    expect(applyGroupOps([], groups)).toBe(groups);
    expect(applyGroupOps(undefined, groups)).toBe(groups);
  });

  it('upsert prepends a new group (not already present)', () => {
    const groups = [{ id: 'g1', name: 'Trip' }];
    const result = applyGroupOps(
      [{ type: 'upsert', group: { id: 'g2', name: 'Lunch' } }],
      groups
    );
    expect(result.map((g) => g.id)).toEqual(['g2', 'g1']);
  });

  it('upsert replaces an existing group by id and moves it to the front (no duplicate)', () => {
    const groups = [{ id: 'g1', name: 'Trip' }, { id: 'g2', name: 'Lunch' }];
    const result = applyGroupOps(
      [{ type: 'upsert', group: { id: 'g2', name: 'Lunch v2' } }],
      groups
    );
    expect(result.map((g) => g.id)).toEqual(['g2', 'g1']);
    expect(result.find((g) => g.id === 'g2').name).toBe('Lunch v2');
    expect(result).toHaveLength(2);
  });

  it('delete removes the group with the matching id', () => {
    const groups = [{ id: 'g1', name: 'Trip' }, { id: 'g2', name: 'Lunch' }];
    const result = applyGroupOps([{ type: 'delete', id: 'g1' }], groups);
    expect(result.map((g) => g.id)).toEqual(['g2']);
  });

  it('replace overwrites the entire list', () => {
    const groups = [{ id: 'g1', name: 'Trip' }];
    const replacement = [{ id: 'gX', name: 'New' }];
    expect(applyGroupOps([{ type: 'replace', groups: replacement }], groups)).toBe(replacement);
  });

  it('folds a sequence of ops in order so offline edits survive a server pull', () => {
    const server = [{ id: 'g1', name: 'Trip' }, { id: 'g2', name: 'Lunch' }];
    const queue = [
      { type: 'upsert', group: { id: 'g3', name: 'New offline' } },
      { type: 'delete', id: 'g1' },
      { type: 'upsert', group: { id: 'g2', name: 'Lunch renamed' } },
    ];
    const result = applyGroupOps(queue, server);
    expect(result.map((g) => g.id).sort()).toEqual(['g2', 'g3']);
    expect(result.find((g) => g.id === 'g2').name).toBe('Lunch renamed');
  });
});

// ---------------------------------------------------------------------------
// applySplitOps() — pure queue reducer
// ---------------------------------------------------------------------------

describe('applySplitOps()', () => {
  it('returns the input unchanged for an empty or missing queue', () => {
    const splits = [{ id: 's1', amount: 90 }];
    expect(applySplitOps([], splits)).toBe(splits);
    expect(applySplitOps(undefined, splits)).toBe(splits);
  });

  it('upsert prepends a new split (not already present)', () => {
    const splits = [{ id: 's1', amount: 90 }];
    const result = applySplitOps(
      [{ type: 'upsert', split: { id: 's2', amount: 45 } }],
      splits
    );
    expect(result.map((s) => s.id)).toEqual(['s2', 's1']);
  });

  it('upsert replaces an existing split by id and moves it to the front (no duplicate)', () => {
    const splits = [{ id: 's1', amount: 90 }, { id: 's2', amount: 45 }];
    const result = applySplitOps(
      [{ type: 'upsert', split: { id: 's2', amount: 99 } }],
      splits
    );
    expect(result.map((s) => s.id)).toEqual(['s2', 's1']);
    expect(result.find((s) => s.id === 's2').amount).toBe(99);
    expect(result).toHaveLength(2);
  });

  it('delete removes the split with the matching id', () => {
    const splits = [{ id: 's1', amount: 90 }, { id: 's2', amount: 45 }];
    const result = applySplitOps([{ type: 'delete', id: 's1' }], splits);
    expect(result.map((s) => s.id)).toEqual(['s2']);
  });

  it('replace overwrites the entire list', () => {
    const splits = [{ id: 's1', amount: 90 }];
    const replacement = [{ id: 'sZ', amount: 1 }];
    expect(applySplitOps([{ type: 'replace', splits: replacement }], splits)).toBe(replacement);
  });

  it('folds a sequence of ops in order so offline edits survive a server pull', () => {
    const server = [{ id: 's1', amount: 90 }, { id: 's2', amount: 45 }];
    const queue = [
      { type: 'upsert', split: { id: 's3', amount: 30 } },
      { type: 'delete', id: 's1' },
      { type: 'upsert', split: { id: 's2', amount: 50 } },
    ];
    const result = applySplitOps(queue, server);
    expect(result.map((s) => s.id).sort()).toEqual(['s2', 's3']);
    expect(result.find((s) => s.id === 's2').amount).toBe(50);
  });

  it('settlement splits are treated like any other split (no special casing in reducer)', () => {
    // The reducer is data-agnostic: it uses only .id for matching.
    const settlement = { id: 'set1', settlement: true, from: 'm1', to: 'you', amount: 30 };
    const splits = [settlement];
    const updated = { ...settlement, amount: 0 }; // zeroed settlement
    const result = applySplitOps([{ type: 'upsert', split: updated }], splits);
    expect(result).toHaveLength(1);
    expect(result[0].amount).toBe(0);
    expect(result[0].settlement).toBe(true);
  });
});

// ---------------------------------------------------------------------------
// applyPendingGroupOps / applyPendingSplitOps — in-memory queue lookup
// (no queue exists in tests so these pass through unchanged)
// ---------------------------------------------------------------------------

describe('applyPendingGroupOps()', () => {
  it('returns groups unchanged when there are no pending ops for the user', () => {
    const groups = [{ id: 'g1', name: 'Trip' }];
    expect(applyPendingGroupOps('unknown-user-no-queue', groups)).toEqual(groups);
  });

  it('returns empty array unchanged when there are no pending ops', () => {
    expect(applyPendingGroupOps('another-unknown-user', [])).toEqual([]);
  });
});

describe('applyPendingSplitOps()', () => {
  it('returns splits unchanged when there are no pending ops for the user', () => {
    const splits = [{ id: 's1', amount: 90 }];
    expect(applyPendingSplitOps('unknown-user-no-queue', splits)).toEqual(splits);
  });

  it('returns empty array unchanged when there are no pending ops', () => {
    expect(applyPendingSplitOps('another-unknown-user', [])).toEqual([]);
  });
});
