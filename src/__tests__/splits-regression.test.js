// Regression tests for splits.js
//
// C2 regression — computeShares in custom mode ALWAYS yields shares that sum
// EXACTLY to the rounded bill amount (including 0-decimal currencies and the
// sub-unit residual-to-last-participant fix). customSharesValid must agree with
// what computeShares persists so the save gate and the domain layer can never
// disagree.
//
// fromSplitRow settlement branch — fromSplitRow is a private (non-exported)
// function in sync.js and therefore NOT directly testable here. Its settlement
// branch is exercised indirectly in the groupBalances() tests in splits.test.js
// (a settlement row built by hand is passed to groupBalances, which is the only
// consumer). We note this gap rather than forcing a test through unexported
// internals. See splits.test.js describe('settlements') for that coverage.

const {
  computeShares,
  customSharesValid,
  YOU,
} = require('../splits');

const { getCurrency } = require('../currency');

// ---------------------------------------------------------------------------
// Helper: integer-unit sum of shares object
// ---------------------------------------------------------------------------
function sharesInUnits(shares, currency) {
  const factor = 10 ** getCurrency(currency).decimals;
  return Object.values(shares).reduce((s, v) => s + Math.round(v * factor), 0);
}

function billInUnits(amount, currency) {
  const factor = 10 ** getCurrency(currency).decimals;
  return Math.round(amount * factor);
}

// ---------------------------------------------------------------------------
// C2 regression — custom mode: shares ALWAYS sum exactly to rounded bill
// ---------------------------------------------------------------------------

describe('computeShares() custom mode — C2 regression: shares sum exactly to rounded bill', () => {
  // The fix: when rounded per-share amounts have a sub-unit residual vs the
  // rounded bill, that residual (≤ 1 smallest unit) is folded into the LAST
  // participant. This test suite proves it holds for USD (2 dp) and JPY/TWD (0 dp).

  it('three participants with sub-cent rounding: shares sum exactly to $100 (USD)', () => {
    // 100 / 3 custom: each enters $33.33 → sum $99.99 → residual 1 cent to last
    const custom = { a: 33.33, b: 33.33, c: 33.33 };
    const shares = computeShares(100, 'custom', ['a', 'b', 'c'], custom, 'USD');
    const sumUnits = sharesInUnits(shares, 'USD');
    const billUnits = billInUnits(100, 'USD');
    expect(sumUnits).toBe(billUnits);
  });

  it('residual goes to the LAST participant only (USD)', () => {
    const custom = { a: 33.33, b: 33.33, c: 33.33 };
    const shares = computeShares(100, 'custom', ['a', 'b', 'c'], custom, 'USD');
    // a and b get exactly 33.33; c absorbs the residual cent → 33.34
    expect(shares['a']).toBeCloseTo(33.33, 2);
    expect(shares['b']).toBeCloseTo(33.33, 2);
    expect(shares['c']).toBeCloseTo(33.34, 2);
  });

  it('custom shares that already sum exactly: no residual adjustment (USD)', () => {
    const custom = { a: 50, b: 50 };
    const shares = computeShares(100, 'custom', ['a', 'b'], custom, 'USD');
    expect(shares['a']).toBeCloseTo(50, 2);
    expect(shares['b']).toBeCloseTo(50, 2);
    const sumUnits = sharesInUnits(shares, 'USD');
    expect(sumUnits).toBe(billInUnits(100, 'USD'));
  });

  it('JPY (0 decimals): three-way 1000 JPY custom with 333+333+333 → residual 1 yen to last', () => {
    const custom = { a: 333, b: 333, c: 333 };
    const shares = computeShares(1000, 'custom', ['a', 'b', 'c'], custom, 'JPY');
    const sumUnits = sharesInUnits(shares, 'JPY');
    expect(sumUnits).toBe(billInUnits(1000, 'JPY'));
    // Residual ¥1 goes to 'c' (last)
    expect(shares['a']).toBe(333);
    expect(shares['b']).toBe(333);
    expect(shares['c']).toBe(334);
  });

  it('JPY: custom shares already sum exactly — no adjustment', () => {
    const custom = { a: 500, b: 500 };
    const shares = computeShares(1000, 'custom', ['a', 'b'], custom, 'JPY');
    expect(shares['a']).toBe(500);
    expect(shares['b']).toBe(500);
    expect(sharesInUnits(shares, 'JPY')).toBe(1000);
  });

  it('TWD (0 decimals): two-way 101 TWD custom 50+50 → residual 1 unit to last', () => {
    const custom = { a: 50, b: 50 };
    const shares = computeShares(101, 'custom', ['a', 'b'], custom, 'TWD');
    const sumUnits = sharesInUnits(shares, 'TWD');
    expect(sumUnits).toBe(billInUnits(101, 'TWD'));
    // Residual NT$1 goes to 'b' (last)
    expect(shares['a']).toBe(50);
    expect(shares['b']).toBe(51);
  });

  it('large share that is "off" by more than one smallest unit passes through unchanged (invalid split)', () => {
    // A genuinely wrong custom split (sum off by 5 USD) must NOT be silently patched.
    const custom = { a: 40, b: 40 }; // sum 80, bill 100 → diff = 20 units → > 1
    const shares = computeShares(100, 'custom', ['a', 'b'], custom, 'USD');
    // Both shares stay as entered; the total will be wrong (rejected by save gate)
    expect(shares['a']).toBeCloseTo(40, 2);
    expect(shares['b']).toBeCloseTo(40, 2);
    expect(sharesInUnits(shares, 'USD')).not.toBe(billInUnits(100, 'USD'));
  });

  it('single participant custom mode: their share equals the bill (USD)', () => {
    const custom = { [YOU]: 75.5 };
    const shares = computeShares(75.5, 'custom', [YOU], custom, 'USD');
    expect(sharesInUnits(shares, 'USD')).toBe(billInUnits(75.5, 'USD'));
  });

  it('single participant JPY: share is the full bill with 0 decimals', () => {
    const custom = { [YOU]: 1000 };
    const shares = computeShares(1000, 'custom', [YOU], custom, 'JPY');
    expect(shares[YOU]).toBe(1000);
    expect(sharesInUnits(shares, 'JPY')).toBe(1000);
  });
});

// ---------------------------------------------------------------------------
// C2 regression — customSharesValid agrees with what computeShares persists
// ---------------------------------------------------------------------------

describe('customSharesValid() consistency with computeShares() — C2 regression', () => {
  // After computeShares() reconciles the shares, customSharesValid() applied to
  // those persisted shares MUST return true. If it returned false, the app would
  // show a "split doesn't balance" error immediately after saving.

  it('USD 3-way 33.33+33.33+33.33 → computeShares fixes it → customSharesValid is true', () => {
    const raw = { a: 33.33, b: 33.33, c: 33.33 };
    const persisted = computeShares(100, 'custom', ['a', 'b', 'c'], raw, 'USD');
    expect(customSharesValid(100, persisted, ['a', 'b', 'c'], 'USD')).toBe(true);
  });

  it('JPY 3-way 333+333+333 → computeShares fixes it → customSharesValid is true', () => {
    const raw = { a: 333, b: 333, c: 333 };
    const persisted = computeShares(1000, 'custom', ['a', 'b', 'c'], raw, 'JPY');
    expect(customSharesValid(1000, persisted, ['a', 'b', 'c'], 'JPY')).toBe(true);
  });

  it('TWD 2-way 50+50 on 101 → computeShares fixes it → customSharesValid is true', () => {
    const raw = { a: 50, b: 50 };
    const persisted = computeShares(101, 'custom', ['a', 'b'], raw, 'TWD');
    expect(customSharesValid(101, persisted, ['a', 'b'], 'TWD')).toBe(true);
  });

  it('valid USD 2-way exact split → customSharesValid is true both before and after computeShares', () => {
    const raw = { a: 50, b: 50 };
    const persisted = computeShares(100, 'custom', ['a', 'b'], raw, 'USD');
    expect(customSharesValid(100, raw, ['a', 'b'], 'USD')).toBe(true);
    expect(customSharesValid(100, persisted, ['a', 'b'], 'USD')).toBe(true);
  });

  it('genuinely invalid split (sum off by many units) remains invalid after computeShares', () => {
    // The fix only patches residuals ≤ 1 smallest unit; a real mis-split is untouched.
    const raw = { a: 40, b: 40 }; // sum 80, bill 100
    const persisted = computeShares(100, 'custom', ['a', 'b'], raw, 'USD');
    expect(customSharesValid(100, persisted, ['a', 'b'], 'USD')).toBe(false);
  });

  it('equal mode output also satisfies customSharesValid (cross-mode sanity)', () => {
    // computeShares equal path produces the same precision guarantees
    const shares = computeShares(10, 'equal', ['a', 'b', 'c'], {}, 'USD');
    expect(customSharesValid(10, shares, ['a', 'b', 'c'], 'USD')).toBe(true);
  });

  it('JPY equal mode output satisfies customSharesValid', () => {
    const shares = computeShares(1000, 'equal', ['a', 'b', 'c'], {}, 'JPY');
    expect(customSharesValid(1000, shares, ['a', 'b', 'c'], 'JPY')).toBe(true);
  });

  it('single participant: computeShares output satisfies customSharesValid (USD)', () => {
    const shares = computeShares(99.99, 'custom', [YOU], { [YOU]: 99.99 }, 'USD');
    expect(customSharesValid(99.99, shares, [YOU], 'USD')).toBe(true);
  });
});

// ---------------------------------------------------------------------------
// fromSplitRow settlement branch — NOT directly testable
// ---------------------------------------------------------------------------
//
// fromSplitRow is a private (non-exported) function in src/sync.js. There is
// no way to invoke it without either exporting it or testing through a live
// syncWithServer() call (which requires a mocked Supabase chainable query
// builder — heavy plumbing out of scope here). The settlement branch is
// already covered behaviourally in splits.test.js (the groupBalances
// 'settlements' describe block receives hand-built settlement objects that
// match exactly what fromSplitRow would return: {settlement:true, from, to,
// id, groupId, amount, currency, createdAt}). A dedicated round-trip test
// would be a direct copy of splits.test.js logic; adding it here would not
// catch a new class of bug.
//
// If fromSplitRow is ever exported (e.g. for storage.js use), add a test that
// feeds a DB row with settlement:true and asserts the returned object shape.
