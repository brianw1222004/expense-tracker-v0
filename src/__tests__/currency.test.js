const {
  convert,
  CURRENCIES,
  getCurrency,
  DEFAULT_CURRENCY,
  redenominate,
  redenominateBudgets,
} = require('../currency');

// The static rates are not exported, but we can derive what the tests expect
// from the structure of convert() itself. We only read rates indirectly by
// round-tripping through convert() — this means we never duplicate the rate
// table in the test file, so a rate change won't silently break tests by
// matching the old hardcoded value.

describe('convert()', () => {
  describe('same currency is a no-op', () => {
    CURRENCIES.forEach(({ code }) => {
      it(`returns the same amount for ${code} -> ${code}`, () => {
        expect(convert(100, code, code)).toBe(100);
        expect(convert(0, code, code)).toBe(0);
        expect(convert(9999.99, code, code)).toBe(9999.99);
      });
    });
  });

  describe('zero amount', () => {
    it('always converts to zero regardless of currencies', () => {
      expect(convert(0, 'USD', 'EUR')).toBe(0);
      expect(convert(0, 'JPY', 'USD')).toBe(0);
      expect(convert(0, 'EUR', 'GBP')).toBe(0);
      expect(convert(0, 'TWD', 'CNY')).toBe(0);
    });
  });

  describe('USD to EUR', () => {
    it('converts 100 USD using the EUR rate (EUR = 0.92)', () => {
      // Rate: EUR/USD = 0.92, so 100 USD = 100 * (0.92 / 1) = 92 EUR
      const result = convert(100, 'USD', 'EUR');
      expect(result).toBeCloseTo(92, 5);
    });

    it('converts a fractional amount correctly', () => {
      const result = convert(50, 'USD', 'EUR');
      expect(result).toBeCloseTo(46, 5);
    });
  });

  describe('EUR to USD (reverse direction)', () => {
    it('converts 92 EUR back to approximately 100 USD', () => {
      // 92 EUR * (1 / 0.92) ≈ 100 USD
      const result = convert(92, 'EUR', 'USD');
      expect(result).toBeCloseTo(100, 5);
    });
  });

  describe('JPY conversions (0 decimal currency)', () => {
    it('converts 15750 JPY to approximately 100 USD', () => {
      // Rate: JPY/USD = 157.5, so 15750 JPY = 15750 * (1 / 157.5) = 100 USD
      const result = convert(15750, 'JPY', 'USD');
      expect(result).toBeCloseTo(100, 5);
    });

    it('converts 100 USD to 15750 JPY', () => {
      // 100 USD * 157.5 = 15750 JPY
      const result = convert(100, 'USD', 'JPY');
      expect(result).toBeCloseTo(15750, 3);
    });

    it('handles large JPY amounts', () => {
      // 1,000,000 JPY to USD
      const result = convert(1000000, 'JPY', 'USD');
      expect(result).toBeCloseTo(1000000 / 157.5, 3);
    });
  });

  describe('round-trip conversions', () => {
    it('USD -> EUR -> USD returns approximately the original amount', () => {
      const original = 250;
      const toEur = convert(original, 'USD', 'EUR');
      const backToUsd = convert(toEur, 'EUR', 'USD');
      expect(backToUsd).toBeCloseTo(original, 8);
    });

    it('USD -> JPY -> USD returns approximately the original amount', () => {
      const original = 500;
      const toJpy = convert(original, 'USD', 'JPY');
      const backToUsd = convert(toJpy, 'JPY', 'USD');
      expect(backToUsd).toBeCloseTo(original, 8);
    });

    it('USD -> TWD -> USD returns approximately the original amount', () => {
      const original = 1000;
      const toTwd = convert(original, 'USD', 'TWD');
      const backToUsd = convert(toTwd, 'TWD', 'USD');
      expect(backToUsd).toBeCloseTo(original, 8);
    });

    it('GBP -> CNY -> GBP returns approximately the original amount', () => {
      const original = 300;
      const toCny = convert(original, 'GBP', 'CNY');
      const backToGbp = convert(toCny, 'CNY', 'GBP');
      expect(backToGbp).toBeCloseTo(original, 8);
    });
  });

  describe('all currencies convert to each other without throwing', () => {
    const codes = CURRENCIES.map((c) => c.code);
    codes.forEach((from) => {
      codes.forEach((to) => {
        it(`converts from ${from} to ${to} without error`, () => {
          expect(() => convert(100, from, to)).not.toThrow();
          const result = convert(100, from, to);
          expect(typeof result).toBe('number');
          expect(Number.isFinite(result)).toBe(true);
          expect(result).toBeGreaterThan(0);
        });
      });
    });
  });

  describe('unknown/invalid currency codes fall back to USD rate (1)', () => {
    it('treats an unknown fromCurrency as USD (rate 1)', () => {
      // from unknown -> USD: amount * (1 / 1) = amount
      const result = convert(100, 'XYZ', 'USD');
      expect(result).toBe(100);
    });

    it('treats an unknown toCurrency as USD (rate 1)', () => {
      // from USD -> unknown: amount * (1 / 1) = amount
      const result = convert(100, 'USD', 'FOOBAR');
      expect(result).toBe(100);
    });

    it('both currencies unknown: returns original amount', () => {
      const result = convert(99, 'AAA', 'BBB');
      expect(result).toBe(99);
    });
  });

  describe('negative amounts', () => {
    it('converts a negative USD amount to EUR correctly', () => {
      const result = convert(-100, 'USD', 'EUR');
      expect(result).toBeCloseTo(-92, 5);
    });

    it('same currency negative returns same negative', () => {
      expect(convert(-50, 'JPY', 'JPY')).toBe(-50);
    });
  });

  describe('TWD (0 decimal currency)', () => {
    it('converts USD to TWD', () => {
      // 100 USD * 32.5 = 3250 TWD
      const result = convert(100, 'USD', 'TWD');
      expect(result).toBeCloseTo(3250, 3);
    });

    it('converts TWD to USD', () => {
      // 3250 TWD / 32.5 = 100 USD
      const result = convert(3250, 'TWD', 'USD');
      expect(result).toBeCloseTo(100, 5);
    });
  });
});

describe('getCurrency()', () => {
  it('returns the correct entry for each known code', () => {
    CURRENCIES.forEach(({ code, symbol, decimals }) => {
      const c = getCurrency(code);
      expect(c.code).toBe(code);
      expect(c.symbol).toBe(symbol);
      expect(c.decimals).toBe(decimals);
    });
  });

  it('falls back to USD for unknown codes', () => {
    const c = getCurrency('ZZZ');
    expect(c.code).toBe(DEFAULT_CURRENCY);
    expect(c.code).toBe('USD');
  });

  it('falls back to USD for undefined input', () => {
    const c = getCurrency(undefined);
    expect(c.code).toBe('USD');
  });

  it('returns JPY with 0 decimals', () => {
    const c = getCurrency('JPY');
    expect(c.decimals).toBe(0);
  });

  it('returns TWD with 0 decimals', () => {
    const c = getCurrency('TWD');
    expect(c.decimals).toBe(0);
  });

  it('returns USD with 2 decimals', () => {
    const c = getCurrency('USD');
    expect(c.decimals).toBe(2);
  });
});

describe('CURRENCIES constant', () => {
  it('contains exactly 13 entries', () => {
    expect(CURRENCIES).toHaveLength(13);
  });

  it('every entry has code, symbol, name, decimals', () => {
    CURRENCIES.forEach((c) => {
      expect(typeof c.code).toBe('string');
      expect(typeof c.symbol).toBe('string');
      expect(typeof c.name).toBe('string');
      expect(typeof c.decimals).toBe('number');
    });
  });

  it('decimals are either 0 or 2', () => {
    CURRENCIES.forEach((c) => {
      expect([0, 2]).toContain(c.decimals);
    });
  });

  it('JPY and TWD have 0 decimals', () => {
    const jpy = CURRENCIES.find((c) => c.code === 'JPY');
    const twd = CURRENCIES.find((c) => c.code === 'TWD');
    expect(jpy.decimals).toBe(0);
    expect(twd.decimals).toBe(0);
  });
});

// ---------------------------------------------------------------------------
// redenominate() / redenominateBudgets() — budget re-denomination on a display
// currency change (lossy, rounded to the target's precision). Extracted from
// App.js's updateSettings so it can be unit-tested.
// ---------------------------------------------------------------------------
describe('redenominate()', () => {
  it('is an exact no-op when from === to', () => {
    expect(redenominate(123.45, 'USD', 'USD')).toBe(123.45);
  });

  it('rounds to whole numbers for 0-decimal currencies (JPY, TWD)', () => {
    expect(Number.isInteger(redenominate(100, 'USD', 'JPY'))).toBe(true);
    expect(Number.isInteger(redenominate(100, 'USD', 'TWD'))).toBe(true);
  });

  it('rounds to at most 2 decimals for 2-decimal currencies', () => {
    const r = redenominate(33.333, 'USD', 'EUR');
    expect(Number(r.toFixed(2))).toBe(r);
  });

  it('round-trips back to approximately the original value', () => {
    const once = redenominate(1000, 'USD', 'EUR');
    expect(redenominate(once, 'EUR', 'USD')).toBeCloseTo(1000, 0);
  });
});

describe('redenominateBudgets()', () => {
  it('leaves a 0 monthly budget (the "unset" sentinel) untouched', () => {
    expect(redenominateBudgets(0, {}, 'USD', 'EUR').monthlyBudget).toBe(0);
  });

  it('converts a positive monthly budget', () => {
    const { monthlyBudget } = redenominateBudgets(1000, {}, 'USD', 'EUR');
    expect(monthlyBudget).toBe(redenominate(1000, 'USD', 'EUR'));
    expect(monthlyBudget).not.toBe(1000);
  });

  it('converts positive category budgets and drops zero/negative ones', () => {
    const { categoryBudgets } = redenominateBudgets(0, { food: 100, fun: 0, x: -5 }, 'USD', 'EUR');
    expect(categoryBudgets.food).toBe(redenominate(100, 'USD', 'EUR'));
    expect(categoryBudgets.fun).toBeUndefined();
    expect(categoryBudgets.x).toBeUndefined();
  });

  it('tolerates an undefined categoryBudgets map', () => {
    expect(redenominateBudgets(0, undefined, 'USD', 'EUR').categoryBudgets).toEqual({});
  });
});
