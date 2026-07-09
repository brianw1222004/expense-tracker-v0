const {
  equalPercentShares,
  estimatedPercentAmount,
  getPercentTotal,
  normalizePercentShares,
  redistributePercentShares,
} = require('../percentSplit');

describe('percent split UI helpers', () => {
  it('initializes equal percentages that total 100', () => {
    const shares = equalPercentShares(['you', 'riley', 'morgan']);

    expect(getPercentTotal(shares, ['you', 'riley', 'morgan'])).toBe(100);
    expect(Number(shares.you)).toBeCloseTo(33.34, 2);
    expect(Number(shares.riley)).toBeCloseTo(33.33, 2);
    expect(Number(shares.morgan)).toBeCloseTo(33.33, 2);
  });

  it('changing one participant redistributes the remaining percent', () => {
    const next = redistributePercentShares(
      'you',
      50,
      equalPercentShares(['you', 'riley', 'morgan']),
      {},
      ['you', 'riley', 'morgan']
    );

    expect(next).toEqual({ you: '50', riley: '25', morgan: '25' });
  });

  it('locked participants do not change when another participant is edited', () => {
    const next = redistributePercentShares(
      'riley',
      10,
      { you: '50', riley: '25', morgan: '25' },
      { you: true },
      ['you', 'riley', 'morgan']
    );

    expect(next).toEqual({ you: '50', riley: '10', morgan: '40' });
  });

  it('splits remaining percentage across unlocked participants', () => {
    const next = redistributePercentShares(
      'you',
      40,
      { you: '50', riley: '20', morgan: '20', alex: '10' },
      {},
      ['you', 'riley', 'morgan', 'alex']
    );

    expect(next).toEqual({ you: '40', riley: '20', morgan: '20', alex: '20' });
  });

  it('all-but-one locked gives the remaining percentage to the unlocked participant', () => {
    const next = redistributePercentShares(
      'morgan',
      90,
      { you: '50', riley: '10', morgan: '40' },
      { you: true, riley: true },
      ['you', 'riley', 'morgan']
    );

    expect(next).toEqual({ you: '50', riley: '10', morgan: '40' });
  });

  it('clamps changed values between 0 and 100', () => {
    expect(redistributePercentShares(
      'you',
      150,
      { you: '50', riley: '50' },
      {},
      ['you', 'riley']
    )).toEqual({ you: '100', riley: '0' });

    expect(redistributePercentShares(
      'you',
      -10,
      { you: '50', riley: '50' },
      {},
      ['you', 'riley']
    )).toEqual({ you: '0', riley: '100' });
  });

  it('normalizes tiny rounding differences so the total becomes 100', () => {
    const normalized = normalizePercentShares(
      { you: '33.33', riley: '33.33', morgan: '33.33' },
      ['you', 'riley', 'morgan']
    );

    expect(getPercentTotal(normalized, ['you', 'riley', 'morgan'])).toBe(100);
  });

  it('estimates the amount represented by a percentage', () => {
    expect(estimatedPercentAmount(400, 25)).toBeCloseTo(100, 5);
    expect(estimatedPercentAmount(400, 26)).toBeCloseTo(104, 5);
    expect(estimatedPercentAmount(400, 49)).toBeCloseTo(196, 5);
  });

  it('does not crash for empty or invalid total amounts', () => {
    expect(estimatedPercentAmount('', 25)).toBe(0);
    expect(estimatedPercentAmount('not a number', 25)).toBe(0);
    expect(estimatedPercentAmount(0, 25)).toBe(0);
  });
});
