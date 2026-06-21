// Income sync mirrors expense sync but on a SEPARATE queue lane. `coalesceIncome`
// and the pure reducer `applyIncomeOps` are imported directly from the source —
// no duplicated copy — so a regression in sync.js fails here.

const { coalesceIncome, applyIncomeOps, applyPendingIncomeOps } = require('../sync');

function buildQueue(initialOps, newOp) {
  const queue = [...initialOps];
  coalesceIncome(queue, newOp);
  queue.push(newOp);
  return queue;
}

describe('coalesceIncome() — upsert deduplication', () => {
  it('two upserts for the same ID: only the latest remains', () => {
    const first = { type: 'upsert', income: { id: 'i1', amount: 10 } };
    const second = { type: 'upsert', income: { id: 'i1', amount: 20 } };
    const queue = buildQueue([first], second);
    expect(queue).toHaveLength(1);
    expect(queue[0].income.amount).toBe(20);
  });

  it('upserts for different IDs are both preserved', () => {
    const a = { type: 'upsert', income: { id: 'i1', amount: 10 } };
    const b = { type: 'upsert', income: { id: 'i2', amount: 20 } };
    const queue = buildQueue([a], b);
    expect(queue).toHaveLength(2);
  });
});

describe('coalesceIncome() — upsert then delete', () => {
  it('delete drops a queued upsert for the same ID', () => {
    const up = { type: 'upsert', income: { id: 'i1', amount: 10 } };
    const del = { type: 'delete', id: 'i1' };
    const queue = buildQueue([up], del);
    expect(queue).toHaveLength(1);
    expect(queue[0].type).toBe('delete');
  });

  it('delete for a different ID keeps the upsert', () => {
    const up = { type: 'upsert', income: { id: 'i1', amount: 10 } };
    const del = { type: 'delete', id: 'i2' };
    const queue = buildQueue([up], del);
    expect(queue).toHaveLength(2);
  });
});

describe('coalesceIncome() — replace op', () => {
  it('replace supersedes all prior income ops', () => {
    const ops = [
      { type: 'upsert', income: { id: 'i1', amount: 10 } },
      { type: 'delete', id: 'i2' },
    ];
    const replace = { type: 'replace', incomes: [{ id: 'i3', amount: 99 }] };
    let queue = [];
    for (const op of ops) {
      coalesceIncome(queue, op);
      queue.push(op);
    }
    coalesceIncome(queue, replace);
    queue.push(replace);
    expect(queue).toHaveLength(1);
    expect(queue[0].type).toBe('replace');
  });
});

describe('applyIncomeOps() — the pure queue reducer', () => {
  it('returns the input unchanged for an empty or missing queue', () => {
    const rows = [{ id: 'i1', amount: 10 }];
    expect(applyIncomeOps([], rows)).toBe(rows);
    expect(applyIncomeOps(undefined, rows)).toBe(rows);
  });

  it('upsert prepends a new entry and replaces by id (no duplicate)', () => {
    const rows = [{ id: 'i1', amount: 10 }, { id: 'i2', amount: 20 }];
    const result = applyIncomeOps([{ type: 'upsert', income: { id: 'i2', amount: 99 } }], rows);
    expect(result.map((e) => e.id)).toEqual(['i2', 'i1']);
    expect(result.find((e) => e.id === 'i2').amount).toBe(99);
    expect(result).toHaveLength(2);
  });

  it('delete removes the matching id; replace overwrites the list', () => {
    const rows = [{ id: 'i1', amount: 10 }, { id: 'i2', amount: 20 }];
    expect(applyIncomeOps([{ type: 'delete', id: 'i1' }], rows).map((e) => e.id)).toEqual(['i2']);
    const replacement = [{ id: 'z', amount: 5 }];
    expect(applyIncomeOps([{ type: 'replace', incomes: replacement }], rows)).toBe(replacement);
  });

  it('folds a sequence of ops in order so offline edits survive a pull', () => {
    const server = [{ id: 'i1', amount: 10 }, { id: 'i2', amount: 20 }];
    const queue = [
      { type: 'upsert', income: { id: 'i3', amount: 30 } },
      { type: 'delete', id: 'i1' },
      { type: 'upsert', income: { id: 'i2', amount: 25 } },
    ];
    const result = applyIncomeOps(queue, server);
    expect(result.map((e) => e.id).sort()).toEqual(['i2', 'i3']);
    expect(result.find((e) => e.id === 'i2').amount).toBe(25);
  });
});

describe('applyPendingIncomeOps()', () => {
  it('returns the input unchanged when no queue exists for the user', () => {
    const income = [{ id: 'i1', amount: 10 }];
    expect(applyPendingIncomeOps('unknown-user-no-queue', income)).toBe(income);
  });

  it('handles an empty income list with no queue', () => {
    expect(applyPendingIncomeOps('another-unknown-user', [])).toEqual([]);
  });
});
