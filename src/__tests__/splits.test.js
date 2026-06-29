// Unit tests for src/splits.js — the pure domain layer for the Split Bills
// feature (synced to Supabase via the groups/splits lanes). All functions are
// pure; no mocks needed beyond what jest.config.js already provides.

const {
  YOU,
  PAYMENT_METHODS,
  PAYMENT_ICON_OPTIONS,
  GROUP_ICONS,
  DEFAULT_GROUP_ICON,
  getGroupIcon,
  getPaymentMethod,
  getPaymentMethodLabel,
  getPaymentMethodColor,
  getAllPaymentMethods,
  computeShares,
  customSharesValid,
  percentageSharesValid,
  computeTaxShares,
  taxInputValid,
  billsForGroup,
  groupBalances,
  groupNet,
  overallBalance,
  yourShareAsExpenses,
} = require('../splits');

const { convert } = require('../currency');

// ---------------------------------------------------------------------------
// Fixtures
// ---------------------------------------------------------------------------

// A simple two-member group where YOU are the implicit owner.
const GROUP_A = {
  id: 'g1',
  currency: 'USD',
  members: [{ id: 'm1' }, { id: 'm2' }],
};

// A JPY group for 0-decimal tests.
const GROUP_JPY = {
  id: 'g2',
  currency: 'JPY',
  members: [{ id: 'm1' }],
};

function makeBill(overrides) {
  return {
    id: 'b1',
    groupId: 'g1',
    description: 'Dinner',
    amount: 90,
    currency: 'USD',
    category: 'food',
    paidBy: YOU,
    mode: 'equal',
    shares: {},
    createdAt: new Date(2026, 5, 10, 12, 0, 0).getTime(),
    ...overrides,
  };
}

// ---------------------------------------------------------------------------
// YOU sentinel
// ---------------------------------------------------------------------------

describe('YOU sentinel', () => {
  it('is the string "you"', () => {
    expect(YOU).toBe('you');
  });
});

// ---------------------------------------------------------------------------
// PAYMENT_METHODS / getPaymentMethod / getPaymentMethodLabel
// ---------------------------------------------------------------------------

describe('PAYMENT_METHODS', () => {
  it('is an array of 5 entries', () => {
    expect(Array.isArray(PAYMENT_METHODS)).toBe(true);
    expect(PAYMENT_METHODS).toHaveLength(5);
  });

  it('each entry has an id and a label', () => {
    PAYMENT_METHODS.forEach((m) => {
      expect(typeof m.id).toBe('string');
      expect(typeof m.label).toBe('string');
    });
  });

  it('contains cash, card, bank, mobile, other', () => {
    const ids = PAYMENT_METHODS.map((m) => m.id);
    expect(ids).toContain('cash');
    expect(ids).toContain('card');
    expect(ids).toContain('bank');
    expect(ids).toContain('mobile');
    expect(ids).toContain('other');
  });
});

describe('getPaymentMethod()', () => {
  it('returns the correct entry for each known id', () => {
    PAYMENT_METHODS.forEach(({ id }) => {
      expect(getPaymentMethod(id).id).toBe(id);
    });
  });

  it('returns the "cash" fallback for an unknown id', () => {
    expect(getPaymentMethod('nonexistent').id).toBe('cash');
  });

  it('returns the "cash" fallback for undefined', () => {
    expect(getPaymentMethod(undefined).id).toBe('cash');
  });

  it('every built-in method carries a color and a registered icon', () => {
    PAYMENT_METHODS.forEach((m) => {
      expect(typeof m.color).toBe('string');
      expect(typeof m.icon).toBe('string');
    });
  });

  it('guarantees color/icon even for a legacy custom method that lacks them', () => {
    const customs = [{ id: 'venmo', label: 'Venmo' }];
    const m = getPaymentMethod('venmo', customs);
    expect(m.id).toBe('venmo');
    expect(typeof m.color).toBe('string');
    expect(typeof m.icon).toBe('string');
  });

  it('uses a custom method\'s own color/icon when provided', () => {
    const customs = [{ id: 'venmo', label: 'Venmo', color: '#123456', icon: 'qr-code' }];
    const m = getPaymentMethod('venmo', customs);
    expect(m.color).toBe('#123456');
    expect(m.icon).toBe('qr-code');
  });
});

describe('getPaymentMethodColor()', () => {
  it('returns the built-in color for a known id', () => {
    expect(getPaymentMethodColor('cash')).toBe(getPaymentMethod('cash').color);
  });

  it('falls back to the cash color for an unknown id', () => {
    expect(getPaymentMethodColor('nonexistent')).toBe(getPaymentMethod('cash').color);
  });

  it('returns a custom method color', () => {
    const customs = [{ id: 'venmo', label: 'Venmo', color: '#abcdef', icon: 'qr-code' }];
    expect(getPaymentMethodColor('venmo', customs)).toBe('#abcdef');
  });
});

describe('getAllPaymentMethods()', () => {
  it('merges built-ins with customs', () => {
    const customs = [{ id: 'venmo', label: 'Venmo' }];
    const all = getAllPaymentMethods(customs);
    expect(all.length).toBe(PAYMENT_METHODS.length + 1);
    expect(all[all.length - 1].id).toBe('venmo');
  });

  it('tolerates a non-array customs argument', () => {
    expect(getAllPaymentMethods(undefined).length).toBe(PAYMENT_METHODS.length);
    expect(getAllPaymentMethods(null).length).toBe(PAYMENT_METHODS.length);
  });
});

describe('icon option lists', () => {
  it('exposes a non-empty group-icon set with the default included', () => {
    expect(Array.isArray(GROUP_ICONS)).toBe(true);
    expect(GROUP_ICONS.length).toBeGreaterThan(0);
    expect(GROUP_ICONS).toContain(DEFAULT_GROUP_ICON);
  });

  it('exposes a non-empty payment-icon set', () => {
    expect(Array.isArray(PAYMENT_ICON_OPTIONS)).toBe(true);
    expect(PAYMENT_ICON_OPTIONS.length).toBeGreaterThan(0);
  });
});

describe('getGroupIcon()', () => {
  it('passes through a known icon key', () => {
    expect(getGroupIcon(GROUP_ICONS[1])).toBe(GROUP_ICONS[1]);
  });

  it('falls back to the default for unknown / legacy-emoji / missing values', () => {
    expect(getGroupIcon('👥')).toBe(DEFAULT_GROUP_ICON);
    expect(getGroupIcon('not-a-real-icon')).toBe(DEFAULT_GROUP_ICON);
    expect(getGroupIcon(undefined)).toBe(DEFAULT_GROUP_ICON);
    expect(getGroupIcon(null)).toBe(DEFAULT_GROUP_ICON);
  });
});

describe('getPaymentMethodLabel()', () => {
  it('calls t with the correct key', () => {
    const captured = [];
    const t = (key) => { captured.push(key); return key; };
    getPaymentMethodLabel('card', t);
    expect(captured).toContain('pay.card');
  });

  it('falls back to the cash label for an unknown/deleted method', () => {
    const t = (key) => key;
    expect(getPaymentMethodLabel('nonexistent', t)).toBe('pay.cash');
  });

  it('resolves a custom payment method label', () => {
    const t = (key) => key;
    const customs = [{ id: 'venmo', label: 'Venmo' }];
    expect(getPaymentMethodLabel('venmo', t, customs)).toBe('Venmo');
  });
});

// ---------------------------------------------------------------------------
// computeShares() — equal mode
// ---------------------------------------------------------------------------

describe('computeShares() equal mode', () => {
  it('splits equally among two participants', () => {
    const shares = computeShares(100, 'equal', [YOU, 'm1']);
    expect(shares[YOU]).toBeCloseTo(50, 5);
    expect(shares['m1']).toBeCloseTo(50, 5);
  });

  it('total of all shares equals the original amount', () => {
    const shares = computeShares(100, 'equal', [YOU, 'm1', 'm2']);
    const total = Object.values(shares).reduce((s, v) => s + v, 0);
    expect(total).toBeCloseTo(100, 5);
  });

  it('distributes remainder to the first ids deterministically (3-way $10)', () => {
    // $10 / 3 = $3.33 + $3.33 + $3.34 (first gets remainder cent)
    const shares = computeShares(10, 'equal', ['a', 'b', 'c']);
    const total = ['a', 'b', 'c'].reduce((s, id) => s + shares[id], 0);
    expect(total).toBeCloseTo(10, 10);
    // Remainder unit (1 cent) goes to 'a' first
    expect(shares['a']).toBeCloseTo(3.34, 5);
    expect(shares['b']).toBeCloseTo(3.33, 5);
    expect(shares['c']).toBeCloseTo(3.33, 5);
  });

  it('handles a single participant (full amount)', () => {
    const shares = computeShares(50, 'equal', [YOU]);
    expect(shares[YOU]).toBeCloseTo(50, 5);
  });

  it('returns an empty object for empty participant list', () => {
    expect(computeShares(100, 'equal', [])).toEqual({});
  });

  it('filters out falsy participant ids', () => {
    const shares = computeShares(100, 'equal', [YOU, null, undefined, '']);
    expect(Object.keys(shares)).toHaveLength(1);
    expect(shares[YOU]).toBeCloseTo(100, 5);
  });

  // JPY — 0 decimal places
  it('splits JPY with 0 decimals — no fractional yen', () => {
    // 1000 JPY / 3 people = 334 + 333 + 333 (remainder ¥1 to first)
    const shares = computeShares(1000, 'equal', ['a', 'b', 'c'], {}, 'JPY');
    expect(shares['a']).toBe(334);
    expect(shares['b']).toBe(333);
    expect(shares['c']).toBe(333);
    expect(shares['a'] + shares['b'] + shares['c']).toBe(1000);
  });

  it('splits JPY evenly when divisible', () => {
    const shares = computeShares(600, 'equal', ['a', 'b', 'c'], {}, 'JPY');
    expect(shares['a']).toBe(200);
    expect(shares['b']).toBe(200);
    expect(shares['c']).toBe(200);
  });

  // TWD — 0 decimal places
  it('splits TWD with 0 decimals — no fractional dollar', () => {
    const shares = computeShares(100, 'equal', ['a', 'b', 'c'], {}, 'TWD');
    const total = shares['a'] + shares['b'] + shares['c'];
    expect(total).toBe(100);
    // All shares must be whole numbers
    Object.values(shares).forEach((v) => {
      expect(Number.isInteger(v)).toBe(true);
    });
  });

  it('distributes remainder exactly once for JPY (7 / 2)', () => {
    // 7 JPY / 2 = 4 + 3 (not 3.5 + 3.5)
    const shares = computeShares(7, 'equal', ['a', 'b'], {}, 'JPY');
    expect(shares['a']).toBe(4);
    expect(shares['b']).toBe(3);
    expect(shares['a'] + shares['b']).toBe(7);
  });

  it('zero amount splits to zero for all', () => {
    const shares = computeShares(0, 'equal', [YOU, 'm1']);
    expect(shares[YOU]).toBe(0);
    expect(shares['m1']).toBe(0);
  });
});

// ---------------------------------------------------------------------------
// computeShares() — custom mode
// ---------------------------------------------------------------------------

describe('computeShares() custom mode', () => {
  it('uses provided custom amounts', () => {
    const custom = { [YOU]: 60, 'm1': 40 };
    const shares = computeShares(100, 'custom', [YOU, 'm1'], custom);
    expect(shares[YOU]).toBeCloseTo(60, 5);
    expect(shares['m1']).toBeCloseTo(40, 5);
  });

  it('missing custom entry becomes 0', () => {
    const shares = computeShares(100, 'custom', [YOU, 'm1'], { [YOU]: 100 });
    expect(shares['m1']).toBe(0);
  });

  it('treats blank string as 0', () => {
    const shares = computeShares(100, 'custom', ['a'], { a: '' });
    expect(shares['a']).toBe(0);
  });

  it('rounds custom amounts to currency precision (JPY)', () => {
    // 333.7 JPY should round to 334 for a 0-decimal currency
    const shares = computeShares(1000, 'custom', ['a'], { a: 333.7 }, 'JPY');
    expect(shares['a']).toBe(334);
  });

  it('rounds custom amounts to 2 decimal places for USD', () => {
    const shares = computeShares(100, 'custom', ['a'], { a: 33.333 });
    expect(shares['a']).toBeCloseTo(33.33, 2);
  });

  it('normalizes comma decimal strings in custom amounts', () => {
    const shares = computeShares(10, 'custom', ['a', 'b'], { a: '5,25', b: '4,75' });
    expect(shares['a']).toBeCloseTo(5.25, 2);
    expect(shares['b']).toBeCloseTo(4.75, 2);
  });

  it('returns empty object for empty participant list', () => {
    expect(computeShares(100, 'custom', [], { x: 50 })).toEqual({});
  });
});

// ---------------------------------------------------------------------------
// customSharesValid()
// ---------------------------------------------------------------------------

describe('customSharesValid()', () => {
  it('returns true when custom shares sum exactly to total', () => {
    expect(customSharesValid(100, { [YOU]: 60, m1: 40 }, [YOU, 'm1'])).toBe(true);
  });

  it('returns true for sum within one smallest-unit tolerance (USD)', () => {
    // 33.33 + 33.33 + 33.34 = 100.00 — valid
    expect(customSharesValid(100, { a: 33.33, b: 33.33, c: 33.34 }, ['a', 'b', 'c'])).toBe(true);
  });

  it('returns false when shares sum is significantly off', () => {
    expect(customSharesValid(100, { [YOU]: 60, m1: 30 }, [YOU, 'm1'])).toBe(false);
  });

  it('returns false when shares exceed total', () => {
    expect(customSharesValid(100, { [YOU]: 70, m1: 40 }, [YOU, 'm1'])).toBe(false);
  });

  it('works for JPY (tolerance = 1 yen)', () => {
    // 334 + 333 + 333 = 1000 — valid
    expect(customSharesValid(1000, { a: 334, b: 333, c: 333 }, ['a', 'b', 'c'], 'JPY')).toBe(true);
  });

  it('returns false when JPY shares are more than 1 yen off', () => {
    expect(customSharesValid(1000, { a: 333, b: 333, c: 333 }, ['a', 'b', 'c'], 'JPY')).toBe(false);
  });

  it('returns true for a single participant whose share equals total', () => {
    expect(customSharesValid(50, { [YOU]: 50 }, [YOU])).toBe(true);
  });

  it('returns true when comma decimal custom shares sum to total', () => {
    expect(customSharesValid(10, { a: '5,25', b: '4,75' }, ['a', 'b'])).toBe(true);
  });

  it('treats missing custom entries as 0', () => {
    // Only YOU provided, m1 missing → treated as 0 → sum = 60 ≠ 100
    expect(customSharesValid(100, { [YOU]: 60 }, [YOU, 'm1'])).toBe(false);
  });

  it('returns true for zero amount with zero shares', () => {
    expect(customSharesValid(0, { a: 0, b: 0 }, ['a', 'b'])).toBe(true);
  });
});

// ---------------------------------------------------------------------------
// computeShares() — percentage mode
// ---------------------------------------------------------------------------

describe('computeShares() percentage mode', () => {
  it('splits by the given percentages', () => {
    const shares = computeShares(100, 'percentage', [YOU, 'm1'], { [YOU]: 25, m1: 75 });
    expect(shares[YOU]).toBeCloseTo(25, 5);
    expect(shares['m1']).toBeCloseTo(75, 5);
  });

  it('total of all shares equals the original amount', () => {
    const shares = computeShares(100, 'percentage', ['a', 'b', 'c'], { a: 33.33, b: 33.33, c: 33.33 });
    const total = ['a', 'b', 'c'].reduce((s, id) => s + shares[id], 0);
    expect(total).toBeCloseTo(100, 10);
  });

  it('hands leftover smallest-units round-robin from the first id', () => {
    // 33.33% × 3 of $100 → 33.33 each = 99.99; the leftover cent goes to 'a'.
    const shares = computeShares(100, 'percentage', ['a', 'b', 'c'], { a: 33.33, b: 33.33, c: 33.33 });
    expect(shares['a']).toBeCloseTo(33.34, 5);
    expect(shares['b']).toBeCloseTo(33.33, 5);
    expect(shares['c']).toBeCloseTo(33.33, 5);
  });

  it('handles a single participant at 100%', () => {
    const shares = computeShares(80, 'percentage', [YOU], { [YOU]: 100 });
    expect(shares[YOU]).toBeCloseTo(80, 5);
  });

  it('respects 0-decimal currencies (JPY)', () => {
    const shares = computeShares(1000, 'percentage', ['a', 'b'], { a: 50, b: 50 }, 'JPY');
    expect(shares['a']).toBe(500);
    expect(shares['b']).toBe(500);
    expect(Number.isInteger(shares['a'])).toBe(true);
  });

  it('missing percentage entry becomes 0', () => {
    const shares = computeShares(100, 'percentage', [YOU, 'm1'], { [YOU]: 100 });
    expect(shares['m1']).toBe(0);
    expect(shares[YOU]).toBeCloseTo(100, 5);
  });

  it('returns an empty object for empty participant list', () => {
    expect(computeShares(100, 'percentage', [], { x: 100 })).toEqual({});
  });

  it('does not overshoot when percentages sum slightly over 100 (USD)', () => {
    // 50.3 + 50.1 = 100.4 — within percentageSharesValid's tolerance, so the
    // floored units overshoot; shares must still sum EXACTLY to the amount.
    const shares = computeShares(1000, 'percentage', ['a', 'b'], { a: 50.3, b: 50.1 });
    expect(shares['a'] + shares['b']).toBeCloseTo(1000, 10);
  });

  it('trims overshoot for 0-decimal currencies too (JPY)', () => {
    const shares = computeShares(1000, 'percentage', ['a', 'b'], { a: 50.4, b: 50 }, 'JPY');
    expect(shares['a'] + shares['b']).toBe(1000);
    Object.values(shares).forEach((v) => expect(Number.isInteger(v)).toBe(true));
  });
});

// ---------------------------------------------------------------------------
// percentageSharesValid()
// ---------------------------------------------------------------------------

describe('percentageSharesValid()', () => {
  it('returns true when percentages sum to exactly 100', () => {
    expect(percentageSharesValid({ a: 50, b: 50 }, ['a', 'b'])).toBe(true);
  });

  it('accepts thirds within the half-percent tolerance', () => {
    expect(percentageSharesValid({ a: 33.33, b: 33.33, c: 33.33 }, ['a', 'b', 'c'])).toBe(true);
  });

  it('returns false when percentages are well under 100', () => {
    expect(percentageSharesValid({ a: 50, b: 40 }, ['a', 'b'])).toBe(false);
  });

  it('returns false when percentages exceed 100', () => {
    expect(percentageSharesValid({ a: 60, b: 60 }, ['a', 'b'])).toBe(false);
  });

  it('ignores ids not in the participant list', () => {
    expect(percentageSharesValid({ a: 50, b: 50, c: 999 }, ['a', 'b'])).toBe(true);
  });

  it('returns false for an empty participant list', () => {
    expect(percentageSharesValid({}, [])).toBe(false);
  });
});

// ---------------------------------------------------------------------------
// computeTaxShares()
// ---------------------------------------------------------------------------

describe('computeTaxShares()', () => {
  it('adds tax proportionally to each subtotal', () => {
    const { total, shares } = computeTaxShares({ [YOU]: 30, m1: 20, m2: 30 }, [YOU, 'm1', 'm2'], 15, 0, 'USD');
    expect(total).toBeCloseTo(92, 5); // 80 × 1.15
    expect(shares[YOU]).toBeCloseTo(34.5, 5);
    expect(shares['m1']).toBeCloseTo(23, 5);
    expect(shares['m2']).toBeCloseTo(34.5, 5);
  });

  it('shares always sum exactly to the total', () => {
    const { total, shares } = computeTaxShares({ a: 10, b: 10, c: 10 }, ['a', 'b', 'c'], 8.33, 0, 'USD');
    const sum = ['a', 'b', 'c'].reduce((s, id) => s + shares[id], 0);
    expect(sum).toBeCloseTo(total, 10);
  });

  it('hands the rounding leftover round-robin from the first id', () => {
    // 30 × 1.0833 = 32.499 → total 32.50; floored shares 10.83 each sum 32.49,
    // the leftover cent goes to 'a'.
    const { total, shares } = computeTaxShares({ a: 10, b: 10, c: 10 }, ['a', 'b', 'c'], 8.33, 0, 'USD');
    expect(total).toBeCloseTo(32.5, 5);
    expect(shares['a']).toBeCloseTo(10.84, 5);
    expect(shares['b']).toBeCloseTo(10.83, 5);
    expect(shares['c']).toBeCloseTo(10.83, 5);
  });

  it('includes tip on top of tax', () => {
    const { total, shares } = computeTaxShares({ a: 100 }, ['a'], 10, 5, 'USD');
    expect(total).toBeCloseTo(115, 5); // 100 × 1.15
    expect(shares['a']).toBeCloseTo(115, 5);
  });

  it('keeps 0-decimal currencies whole (JPY)', () => {
    const { total, shares } = computeTaxShares({ a: 1000, b: 2000 }, ['a', 'b'], 10, 0, 'JPY');
    expect(total).toBe(3300);
    expect(shares['a']).toBe(1100);
    expect(shares['b']).toBe(2200);
    Object.values(shares).forEach((v) => expect(Number.isInteger(v)).toBe(true));
  });

  it('no tax/tip just splits by subtotal', () => {
    const { total, shares } = computeTaxShares({ a: 40, b: 60 }, ['a', 'b'], 0, 0, 'USD');
    expect(total).toBeCloseTo(100, 5);
    expect(shares['a']).toBeCloseTo(40, 5);
    expect(shares['b']).toBeCloseTo(60, 5);
  });

  it('returns zero total / empty shares for empty participants', () => {
    expect(computeTaxShares({ a: 30 }, [], 10, 0, 'USD')).toEqual({ total: 0, shares: {} });
  });

  it('a participant with no subtotal gets a zero share', () => {
    const { shares } = computeTaxShares({ a: 50, b: 0 }, ['a', 'b'], 10, 0, 'USD');
    expect(shares['b']).toBe(0);
  });
});

// ---------------------------------------------------------------------------
// taxInputValid()
// ---------------------------------------------------------------------------

describe('taxInputValid()', () => {
  it('returns true when at least one subtotal is positive', () => {
    expect(taxInputValid({ a: 30, b: 0 }, ['a', 'b'])).toBe(true);
  });

  it('returns false when all subtotals are zero/blank', () => {
    expect(taxInputValid({ a: 0, b: '' }, ['a', 'b'])).toBe(false);
  });

  it('returns false for an empty participant list', () => {
    expect(taxInputValid({ a: 30 }, [])).toBe(false);
  });
});

// ---------------------------------------------------------------------------
// billsForGroup()
// ---------------------------------------------------------------------------

describe('billsForGroup()', () => {
  const bills = [
    makeBill({ id: 'b1', groupId: 'g1' }),
    makeBill({ id: 'b2', groupId: 'g2' }),
    makeBill({ id: 'b3', groupId: 'g1' }),
  ];

  it('returns only bills for the given group', () => {
    expect(billsForGroup('g1', bills)).toHaveLength(2);
    expect(billsForGroup('g2', bills)).toHaveLength(1);
  });

  it('returns empty array when no bills match', () => {
    expect(billsForGroup('g999', bills)).toEqual([]);
  });

  it('returns empty array for empty expense list', () => {
    expect(billsForGroup('g1', [])).toEqual([]);
  });
});

// ---------------------------------------------------------------------------
// groupBalances()
// ---------------------------------------------------------------------------

describe('groupBalances()', () => {
  describe('you paid', () => {
    it('members owe you their share when you paid', () => {
      const shares = { [YOU]: 30, m1: 30, m2: 30 };
      const bill = makeBill({ shares, paidBy: YOU, amount: 90 });
      const balances = groupBalances(GROUP_A, [bill]);
      // m1 and m2 each owe you 30 USD (positive = owes you)
      expect(balances['m1']).toBeCloseTo(30, 5);
      expect(balances['m2']).toBeCloseTo(30, 5);
    });

    it('your own share does not affect balances when you paid', () => {
      const shares = { [YOU]: 45, m1: 45 };
      const bill = makeBill({ shares, paidBy: YOU, amount: 90, groupId: 'g1' });
      const balances = groupBalances(GROUP_A, [bill]);
      expect(balances['m1']).toBeCloseTo(45, 5);
      // m2 is not in shares → stays at 0
      expect(balances['m2']).toBeCloseTo(0, 5);
    });
  });

  describe('member paid', () => {
    it('you owe the paying member your share when they paid', () => {
      const shares = { [YOU]: 30, m1: 30, m2: 30 };
      const bill = makeBill({ shares, paidBy: 'm1', amount: 90 });
      const balances = groupBalances(GROUP_A, [bill]);
      // m1 fronted it; you owe m1 your share → m1's balance goes negative
      expect(balances['m1']).toBeCloseTo(-30, 5);
      // m2's debt to m1 is not tracked (personal ledger only tracks YOU)
      expect(balances['m2']).toBeCloseTo(0, 5);
    });

    it('member-to-member debts not involving you are ignored', () => {
      // YOU is not in shares; m2 paid
      const shares = { m1: 50, m2: 50 };
      const bill = makeBill({ shares, paidBy: 'm2', amount: 100 });
      const balances = groupBalances(GROUP_A, [bill]);
      expect(balances['m1']).toBeCloseTo(0, 5);
      expect(balances['m2']).toBeCloseTo(0, 5);
    });
  });

  describe('multi-currency bills', () => {
    it('converts bill amounts from bill currency to group currency', () => {
      // Group is in USD; bill is in EUR; m1 share = 100 EUR
      const eurBill = makeBill({
        currency: 'EUR',
        amount: 200,
        shares: { [YOU]: 100, m1: 100 },
        paidBy: YOU,
      });
      const balances = groupBalances(GROUP_A, [eurBill]);
      // m1 owes you 100 EUR converted to USD, rounded to the group currency (USD → 2 dp)
      const expected = Math.round(convert(100, 'EUR', 'USD') * 100) / 100;
      expect(balances['m1']).toBeCloseTo(expected, 5);
    });

    it('converts member share in JPY group correctly', () => {
      // Group in JPY; bill in USD; YOU paid, m1 share = 500 USD
      const bill = {
        id: 'b1',
        groupId: 'g2',
        description: 'Hotel',
        amount: 1000,
        currency: 'USD',
        category: 'other',
        paidBy: YOU,
        shares: { [YOU]: 500, m1: 500 },
        createdAt: Date.now(),
      };
      const balances = groupBalances(GROUP_JPY, [bill]);
      // m1 owes you 500 USD converted to JPY, rounded to the group currency (JPY → 0 dp)
      const expected = Math.round(convert(500, 'USD', 'JPY'));
      expect(balances['m1']).toBeCloseTo(expected, 3);
    });
  });

  describe('settlements', () => {
    // Settlement semantics (matches settleUp in App.js):
    //   bal > 0 (member owes you) → {from: member, to: YOU} → balances[member] -= amt
    //   bal < 0 (you owe member) → {from: YOU, to: member}  → balances[member] += amt

    it('member paying you (from: member, to: YOU) reduces what they owe', () => {
      // m1 owes you 30; they pay you back 30
      const bill = makeBill({ shares: { [YOU]: 30, m1: 30 }, paidBy: YOU });
      const settlement = {
        id: 's1',
        groupId: 'g1',
        settlement: true,
        from: 'm1',
        to: YOU,
        amount: 30,
        currency: 'USD',
        createdAt: Date.now(),
      };
      const balances = groupBalances(GROUP_A, [bill, settlement]);
      // m1 owed 30, paid back 30 → balance is 0
      expect(balances['m1']).toBeCloseTo(0, 5);
    });

    it('you paying member (from: YOU, to: member) reduces what you owe them', () => {
      // m1 paid bill; you owe m1 30 (balance = -30); you pay them
      const bill = makeBill({ shares: { [YOU]: 30, m1: 60 }, paidBy: 'm1' });
      const settlement = {
        id: 's1',
        groupId: 'g1',
        settlement: true,
        from: YOU,
        to: 'm1',
        amount: 30,
        currency: 'USD',
        createdAt: Date.now(),
      };
      const balances = groupBalances(GROUP_A, [bill, settlement]);
      // You owed m1 30 (balance -30), settlement +30 → 0
      expect(balances['m1']).toBeCloseTo(0, 5);
    });

    it('settlement between two members not involving YOU has no effect', () => {
      const bill = makeBill({ shares: { [YOU]: 30, m1: 30, m2: 30 }, paidBy: YOU });
      const settlement = {
        id: 's1',
        groupId: 'g1',
        settlement: true,
        from: 'm1',
        to: 'm2', // neither is YOU
        amount: 30,
        currency: 'USD',
        createdAt: Date.now(),
      };
      const balances = groupBalances(GROUP_A, [bill, settlement]);
      // Unaffected: m1 and m2 still owe you 30 each
      expect(balances['m1']).toBeCloseTo(30, 5);
      expect(balances['m2']).toBeCloseTo(30, 5);
    });

    it('settlement converts amount from bill currency to group currency', () => {
      // Group in USD; m1 owes you 30 USD; they pay you 30 EUR (worth more)
      const bill = makeBill({ shares: { [YOU]: 30, m1: 30 }, paidBy: YOU });
      const settlement = {
        id: 's1',
        groupId: 'g1',
        settlement: true,
        from: 'm1',
        to: YOU,
        amount: 30,
        currency: 'EUR',
        createdAt: Date.now(),
      };
      const balances = groupBalances(GROUP_A, [bill, settlement]);
      // 30 EUR > 30 USD, so m1 overpaid → balance goes negative
      // (rounded to the group currency, USD → 2 dp)
      const settledUSD = convert(30, 'EUR', 'USD');
      expect(balances['m1']).toBeCloseTo(Math.round((30 - settledUSD) * 100) / 100, 5);
    });

    it('partial settlement leaves a residual balance', () => {
      // m1 owes you 50; they pay back 20
      const bill = makeBill({ shares: { [YOU]: 25, m1: 50 }, paidBy: YOU });
      const settlement = {
        id: 's1',
        groupId: 'g1',
        settlement: true,
        from: 'm1',
        to: YOU,
        amount: 20,
        currency: 'USD',
        createdAt: Date.now(),
      };
      const balances = groupBalances(GROUP_A, [bill, settlement]);
      expect(balances['m1']).toBeCloseTo(30, 5); // 50 - 20
    });
  });

  describe('multiple bills accumulate', () => {
    it('balances accumulate across multiple bills', () => {
      const bill1 = makeBill({ id: 'b1', shares: { [YOU]: 30, m1: 30, m2: 30 }, paidBy: YOU });
      const bill2 = makeBill({ id: 'b2', shares: { [YOU]: 20, m1: 20 }, paidBy: YOU });
      const balances = groupBalances(GROUP_A, [bill1, bill2]);
      expect(balances['m1']).toBeCloseTo(50, 5); // 30 + 20
      expect(balances['m2']).toBeCloseTo(30, 5);
    });
  });

  describe('bills from other groups are ignored', () => {
    it('ignores bills that belong to a different group', () => {
      const foreignBill = makeBill({ groupId: 'other-group', shares: { [YOU]: 50, m1: 50 }, paidBy: YOU });
      const balances = groupBalances(GROUP_A, [foreignBill]);
      expect(balances['m1']).toBeCloseTo(0, 5);
    });
  });

  describe('empty states', () => {
    it('returns all-zero balances when no bills', () => {
      const balances = groupBalances(GROUP_A, []);
      expect(balances['m1']).toBe(0);
      expect(balances['m2']).toBe(0);
    });

    it('includes all group members even with zero balance', () => {
      const balances = groupBalances(GROUP_A, []);
      expect(Object.keys(balances)).toContain('m1');
      expect(Object.keys(balances)).toContain('m2');
    });
  });
});

// ---------------------------------------------------------------------------
// groupNet()
// ---------------------------------------------------------------------------

describe('groupNet()', () => {
  it('returns 0 with no bills', () => {
    expect(groupNet(GROUP_A, [])).toBe(0);
  });

  it('returns positive net when members owe you', () => {
    const bill = makeBill({ shares: { [YOU]: 30, m1: 30, m2: 30 }, paidBy: YOU });
    const net = groupNet(GROUP_A, [bill]);
    expect(net).toBeCloseTo(60, 5); // m1=30 + m2=30
  });

  it('returns negative net when you owe members', () => {
    const bill = makeBill({ shares: { [YOU]: 50, m1: 50 }, paidBy: 'm1' });
    const net = groupNet(GROUP_A, [bill]);
    expect(net).toBeCloseTo(-50, 5);
  });

  it('net equals sum of all member balances', () => {
    const bill = makeBill({ shares: { [YOU]: 30, m1: 50, m2: 10 }, paidBy: YOU });
    const balances = groupBalances(GROUP_A, [bill]);
    const sumOfBalances = Object.values(balances).reduce((s, v) => s + v, 0);
    const net = groupNet(GROUP_A, [bill]);
    expect(net).toBeCloseTo(sumOfBalances, 10);
  });
});

// ---------------------------------------------------------------------------
// overallBalance()
// ---------------------------------------------------------------------------

describe('overallBalance()', () => {
  it('returns {owed:0, owe:0, net:0} with no groups', () => {
    const result = overallBalance([], [], 'USD');
    expect(result.owed).toBe(0);
    expect(result.owe).toBe(0);
    expect(result.net).toBe(0);
  });

  it('returns {owed:0, owe:0, net:0} with groups but no bills', () => {
    const result = overallBalance([GROUP_A], [], 'USD');
    expect(result.owed).toBe(0);
    expect(result.owe).toBe(0);
    expect(result.net).toBe(0);
  });

  it('owed reflects total others owe you across groups', () => {
    const bill = makeBill({ shares: { [YOU]: 30, m1: 30, m2: 30 }, paidBy: YOU });
    const result = overallBalance([GROUP_A], [bill], 'USD');
    expect(result.owed).toBeCloseTo(60, 5); // m1=30 + m2=30
    expect(result.owe).toBeCloseTo(0, 5);
    expect(result.net).toBeCloseTo(60, 5);
  });

  it('owe reflects total you owe others across groups', () => {
    const bill = makeBill({ shares: { [YOU]: 50, m1: 50 }, paidBy: 'm1' });
    const result = overallBalance([GROUP_A], [bill], 'USD');
    expect(result.owe).toBeCloseTo(50, 5);
    expect(result.owed).toBeCloseTo(0, 5);
    expect(result.net).toBeCloseTo(-50, 5);
  });

  it('net = owed - owe', () => {
    // Two bills: you owe m1 $50, m2 owes you $30 → net = 30 - 50 = -20
    const bill1 = makeBill({ id: 'b1', shares: { [YOU]: 50, m1: 50 }, paidBy: 'm1' });
    const bill2 = makeBill({ id: 'b2', shares: { [YOU]: 30, m2: 30 }, paidBy: YOU });
    const result = overallBalance([GROUP_A], [bill1, bill2], 'USD');
    expect(result.net).toBeCloseTo(result.owed - result.owe, 10);
  });

  it('converts group currency to display currency', () => {
    // JPY group: m1 owes you 1000 JPY → convert to USD for overallBalance
    const bill = {
      id: 'b1',
      groupId: 'g2',
      description: 'Taxi',
      amount: 2000,
      currency: 'JPY',
      category: 'transport',
      paidBy: YOU,
      shares: { [YOU]: 1000, m1: 1000 },
      createdAt: Date.now(),
    };
    const result = overallBalance([GROUP_JPY], [bill], 'USD');
    const expected = convert(1000, 'JPY', 'USD');
    expect(result.owed).toBeCloseTo(expected, 5);
  });

  it('aggregates across multiple groups', () => {
    // Group A (USD): m2 owes you $30
    const billA = makeBill({ id: 'b1', shares: { [YOU]: 30, m2: 30 }, paidBy: YOU });
    // Group JPY: m1 owes you 1000 JPY
    const billB = {
      id: 'b2',
      groupId: 'g2',
      description: 'Taxi',
      amount: 2000,
      currency: 'JPY',
      category: 'transport',
      paidBy: YOU,
      shares: { [YOU]: 1000, m1: 1000 },
      createdAt: Date.now(),
    };
    const result = overallBalance([GROUP_A, GROUP_JPY], [billA, billB], 'USD');
    const jpyInUsd = convert(1000, 'JPY', 'USD');
    expect(result.owed).toBeCloseTo(30 + jpyInUsd, 5);
  });

  it('owed and owe are always non-negative', () => {
    const bill1 = makeBill({ id: 'b1', shares: { [YOU]: 50, m1: 50 }, paidBy: 'm1' });
    const bill2 = makeBill({ id: 'b2', shares: { [YOU]: 30, m2: 30 }, paidBy: YOU });
    const result = overallBalance([GROUP_A], [bill1, bill2], 'USD');
    expect(result.owed).toBeGreaterThanOrEqual(0);
    expect(result.owe).toBeGreaterThanOrEqual(0);
  });
});

// ---------------------------------------------------------------------------
// yourShareAsExpenses()
// ---------------------------------------------------------------------------

describe('yourShareAsExpenses()', () => {
  it('returns an empty array for no bills', () => {
    expect(yourShareAsExpenses([])).toEqual([]);
  });

  it('returns items only for bills where YOU have a share > 0', () => {
    const bill1 = makeBill({ id: 'b1', shares: { [YOU]: 30, m1: 30 } });
    const bill2 = makeBill({ id: 'b2', shares: { m1: 50 } }); // no YOU share
    const items = yourShareAsExpenses([bill1, bill2]);
    expect(items).toHaveLength(1);
    expect(items[0].id).toBe('split:b1');
  });

  it('namespaces the id as "split:<billId>"', () => {
    const bill = makeBill({ id: 'my-bill', shares: { [YOU]: 45, m1: 45 } });
    const items = yourShareAsExpenses([bill]);
    expect(items[0].id).toBe('split:my-bill');
  });

  it('uses your share amount (not the full bill amount)', () => {
    const bill = makeBill({ amount: 90, shares: { [YOU]: 30, m1: 60 } });
    const items = yourShareAsExpenses([bill]);
    expect(items[0].amount).toBe(30);
  });

  it('preserves the bill currency on the synthetic item', () => {
    const bill = makeBill({ currency: 'JPY', shares: { [YOU]: 1000, m1: 1000 } });
    const items = yourShareAsExpenses([bill]);
    expect(items[0].currency).toBe('JPY');
  });

  it('carries through the category from the bill', () => {
    const bill = makeBill({ category: 'food', shares: { [YOU]: 30 } });
    const items = yourShareAsExpenses([bill]);
    expect(items[0].category).toBe('food');
  });

  it('defaults category to "other" when bill has no category', () => {
    const bill = makeBill({ shares: { [YOU]: 30 } });
    delete bill.category;
    const items = yourShareAsExpenses([bill]);
    expect(items[0].category).toBe('other');
  });

  it('uses bill description as note', () => {
    const bill = makeBill({ description: 'Team lunch', shares: { [YOU]: 20 } });
    const items = yourShareAsExpenses([bill]);
    expect(items[0].note).toBe('Team lunch');
  });

  it('preserves createdAt timestamp', () => {
    const ts = new Date(2026, 5, 1, 10, 0, 0).getTime();
    const bill = makeBill({ createdAt: ts, shares: { [YOU]: 20 } });
    const items = yourShareAsExpenses([bill]);
    expect(items[0].createdAt).toBe(ts);
  });

  it('excludes settlement records entirely', () => {
    const settlement = {
      id: 's1',
      groupId: 'g1',
      settlement: true,
      from: YOU,
      to: 'm1',
      amount: 30,
      currency: 'USD',
      createdAt: Date.now(),
    };
    expect(yourShareAsExpenses([settlement])).toEqual([]);
  });

  it('skips bills where your share is 0', () => {
    const bill = makeBill({ id: 'b1', shares: { [YOU]: 0, m1: 100 } });
    expect(yourShareAsExpenses([bill])).toEqual([]);
  });

  it('skips bills where YOU is absent from shares', () => {
    const bill = makeBill({ id: 'b2', shares: { m1: 100 } });
    expect(yourShareAsExpenses([bill])).toEqual([]);
  });

  it('includes groupId and splitId on synthetic items', () => {
    const bill = makeBill({ id: 'b99', groupId: 'g1', shares: { [YOU]: 50 } });
    const items = yourShareAsExpenses([bill]);
    expect(items[0].splitId).toBe('b99');
    expect(items[0].groupId).toBe('g1');
  });

  it('returns multiple items for multiple bills with your share', () => {
    const bill1 = makeBill({ id: 'b1', shares: { [YOU]: 20, m1: 20 } });
    const bill2 = makeBill({ id: 'b2', shares: { [YOU]: 15, m1: 15 } });
    const items = yourShareAsExpenses([bill1, bill2]);
    expect(items).toHaveLength(2);
    expect(items.map((i) => i.id)).toContain('split:b1');
    expect(items.map((i) => i.id)).toContain('split:b2');
  });
});
