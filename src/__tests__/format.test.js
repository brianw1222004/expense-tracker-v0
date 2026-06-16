const { formatMoney, formatMoneyShort, dateKey, buildCalendarWeeks } = require('../format');

// format.js imports from currency.js (pure) and i18n.js (which uses React's
// createContext — stubbed via __mocks__/react.js so it remains node-safe).

// ---------------------------------------------------------------------------
// formatMoney
// ---------------------------------------------------------------------------
describe('formatMoney()', () => {
  describe('USD (2 decimals, $ symbol)', () => {
    it('formats a typical amount with cents', () => {
      expect(formatMoney(1234.56, 'USD')).toBe('$1,234.56');
    });

    it('formats a whole number with .00', () => {
      expect(formatMoney(100, 'USD')).toBe('$100.00');
    });

    it('formats zero', () => {
      expect(formatMoney(0, 'USD')).toBe('$0.00');
    });

    it('formats a negative amount using the absolute value (no minus sign in output)', () => {
      // formatMoney uses Math.abs — negative sign is not in the output
      expect(formatMoney(-50.5, 'USD')).toBe('$50.50');
    });

    it('formats a large number with thousands separator', () => {
      expect(formatMoney(1000000.99, 'USD')).toBe('$1,000,000.99');
    });

    it('defaults to USD when no currency code is provided', () => {
      expect(formatMoney(10)).toBe('$10.00');
    });

    it('formats a small fractional amount', () => {
      expect(formatMoney(0.01, 'USD')).toBe('$0.01');
    });
  });

  describe('EUR (2 decimals, € symbol)', () => {
    it('formats a typical EUR amount', () => {
      expect(formatMoney(100, 'EUR')).toBe('€100.00');
    });

    it('formats zero EUR', () => {
      expect(formatMoney(0, 'EUR')).toBe('€0.00');
    });

    it('formats a large EUR amount with thousands separator', () => {
      expect(formatMoney(9999.99, 'EUR')).toBe('€9,999.99');
    });
  });

  describe('GBP (2 decimals, £ symbol)', () => {
    it('formats a GBP amount', () => {
      expect(formatMoney(55.5, 'GBP')).toBe('£55.50');
    });
  });

  describe('JPY (0 decimals, ¥ symbol)', () => {
    it('formats JPY without decimal places', () => {
      expect(formatMoney(1235, 'JPY')).toBe('¥1,235');
    });

    it('rounds fractional JPY amount to 0 decimals', () => {
      // toFixed(0) rounds: 1234.7 -> '1235'
      expect(formatMoney(1234.7, 'JPY')).toBe('¥1,235');
    });

    it('formats zero JPY', () => {
      expect(formatMoney(0, 'JPY')).toBe('¥0');
    });

    it('formats large JPY with thousands separator', () => {
      expect(formatMoney(150000, 'JPY')).toBe('¥150,000');
    });

    it('does not include a decimal point', () => {
      expect(formatMoney(500, 'JPY')).not.toContain('.');
    });
  });

  describe('TWD (0 decimals, NT$ symbol)', () => {
    it('formats TWD without decimal places', () => {
      expect(formatMoney(3250, 'TWD')).toBe('NT$3,250');
    });

    it('does not include a decimal point for TWD', () => {
      expect(formatMoney(100, 'TWD')).not.toContain('.');
    });
  });

  describe('CNY (2 decimals, CN¥ symbol)', () => {
    it('formats CNY with 2 decimal places', () => {
      expect(formatMoney(725, 'CNY')).toBe('CN¥725.00');
    });
  });

  describe('unknown currency code falls back to USD', () => {
    it('uses USD formatting for unknown codes', () => {
      expect(formatMoney(100, 'XYZ')).toBe('$100.00');
    });
  });

  describe('boundary values', () => {
    it('formats a very large number', () => {
      const result = formatMoney(99999999.99, 'USD');
      expect(result).toBe('$99,999,999.99');
    });

    it('formats a sub-cent amount (rounds via toFixed)', () => {
      // toFixed(2) rounds: 1.005 -> browser-dependent but should not throw
      expect(() => formatMoney(1.005, 'USD')).not.toThrow();
    });
  });
});

// ---------------------------------------------------------------------------
// formatMoneyShort
// ---------------------------------------------------------------------------
describe('formatMoneyShort()', () => {
  describe('amounts under 100 USD (shows exact cents)', () => {
    it('formats $7.50', () => {
      expect(formatMoneyShort(7.5, 'USD')).toBe('$7.50');
    });

    it('formats $0.99', () => {
      expect(formatMoneyShort(0.99, 'USD')).toBe('$0.99');
    });

    it('formats zero', () => {
      // 0 is an integer, so the integer branch fires
      expect(formatMoneyShort(0, 'USD')).toBe('$0');
    });

    it('formats a whole-number under 100 without decimals', () => {
      // Number.isInteger(50) === true -> rounds to integer
      expect(formatMoneyShort(50, 'USD')).toBe('$50');
    });
  });

  describe('amounts 100-999 USD (no decimals, no k)', () => {
    it('formats $500 as $500', () => {
      expect(formatMoneyShort(500, 'USD')).toBe('$500');
    });

    it('formats $999 as $999', () => {
      expect(formatMoneyShort(999, 'USD')).toBe('$999');
    });

    it('formats $100 as $100', () => {
      expect(formatMoneyShort(100, 'USD')).toBe('$100');
    });
  });

  describe('amounts 1,000-9,999 USD (one decimal k)', () => {
    it('formats 1200 as $1.2k', () => {
      expect(formatMoneyShort(1200, 'USD')).toBe('$1.2k');
    });

    it('formats 1000 as $1.0k', () => {
      expect(formatMoneyShort(1000, 'USD')).toBe('$1.0k');
    });

    it('formats 9999 as $10.0k (rounds up into the 10k tier)', () => {
      // 9999 >= 1000 but < 10000; (9999/1000).toFixed(1) = '10.0'
      expect(formatMoneyShort(9999, 'USD')).toBe('$10.0k');
    });
  });

  describe('amounts 10,000+ USD (rounded integer k)', () => {
    it('formats 12000 as $12k', () => {
      expect(formatMoneyShort(12000, 'USD')).toBe('$12k');
    });

    it('formats 100000 as $100k', () => {
      expect(formatMoneyShort(100000, 'USD')).toBe('$100k');
    });

    it('formats 10000 as $10k', () => {
      expect(formatMoneyShort(10000, 'USD')).toBe('$10k');
    });

    it('formats 1200000 as $1,200k (no M tier — code uses k only)', () => {
      // The source has no M branch; large numbers get k with thousands separator
      expect(formatMoneyShort(1200000, 'USD')).toBe('$1,200k');
    });
  });

  describe('negative amounts', () => {
    it('formats a negative 10k amount with minus sign', () => {
      expect(formatMoneyShort(-12000, 'USD')).toBe('-$12k');
    });

    it('formats a small negative amount', () => {
      expect(formatMoneyShort(-7.5, 'USD')).toBe('-$7.50');
    });
  });

  describe('JPY (0 decimals) — always rounds to integer, no .00', () => {
    it('formats 500 JPY as ¥500 (not ¥500.00)', () => {
      expect(formatMoneyShort(500, 'JPY')).toBe('¥500');
    });

    it('formats 50 JPY as ¥50 (decimals===0 branch fires for all abs)', () => {
      // abs=50, decimals===0, so integer branch fires
      expect(formatMoneyShort(50, 'JPY')).toBe('¥50');
    });

    it('formats 15000 JPY as ¥15k', () => {
      expect(formatMoneyShort(15000, 'JPY')).toBe('¥15k');
    });
  });

  describe('EUR formatting', () => {
    it('formats €100 as €100', () => {
      expect(formatMoneyShort(100, 'EUR')).toBe('€100');
    });

    it('formats €1500 as €1.5k', () => {
      expect(formatMoneyShort(1500, 'EUR')).toBe('€1.5k');
    });
  });

  describe('defaults to USD', () => {
    it('uses USD symbol when no currency code provided', () => {
      expect(formatMoneyShort(500)).toBe('$500');
    });
  });
});

// ---------------------------------------------------------------------------
// dateKey
// ---------------------------------------------------------------------------
describe('dateKey()', () => {
  it('returns a YYYY-MM-DD string', () => {
    // Use a known UTC timestamp: 2024-03-15T12:00:00Z
    // Local time depends on environment. We verify format, not exact date.
    const result = dateKey(Date.now());
    expect(result).toMatch(/^\d{4}-\d{2}-\d{2}$/);
  });

  it('zero-pads month and day', () => {
    // Jan 5 in local time — use a Date constructor with explicit local values
    const d = new Date(2024, 0, 5, 10, 0, 0); // Jan 5, 2024, local time
    expect(dateKey(d.getTime())).toBe('2024-01-05');
  });

  it('handles December 31', () => {
    const d = new Date(2023, 11, 31, 12, 0, 0); // Dec 31, 2023, local time
    expect(dateKey(d.getTime())).toBe('2023-12-31');
  });

  it('handles January 1', () => {
    const d = new Date(2025, 0, 1, 6, 0, 0); // Jan 1, 2025, local time
    expect(dateKey(d.getTime())).toBe('2025-01-01');
  });

  it('returns the same key for two timestamps on the same local day', () => {
    const morning = new Date(2024, 5, 15, 8, 0, 0).getTime();
    const evening = new Date(2024, 5, 15, 23, 59, 59).getTime();
    expect(dateKey(morning)).toBe(dateKey(evening));
  });

  it('returns different keys for timestamps on consecutive days', () => {
    const day1 = new Date(2024, 5, 15, 23, 59, 59).getTime();
    const day2 = new Date(2024, 5, 16, 0, 0, 0).getTime();
    expect(dateKey(day1)).not.toBe(dateKey(day2));
  });

  it('handles a Date object passed as timestamp (via getTime equivalence)', () => {
    const d = new Date(2024, 2, 8, 12, 0, 0); // Mar 8, 2024
    expect(dateKey(d.getTime())).toBe('2024-03-08');
  });
});

// ---------------------------------------------------------------------------
// buildCalendarWeeks
// ---------------------------------------------------------------------------
describe('buildCalendarWeeks()', () => {
  it('returns an array of arrays (weeks)', () => {
    const weeks = buildCalendarWeeks(2024, 0); // January 2024
    expect(Array.isArray(weeks)).toBe(true);
    weeks.forEach((week) => {
      expect(Array.isArray(week)).toBe(true);
    });
  });

  it('every week has exactly 7 cells', () => {
    const weeks = buildCalendarWeeks(2024, 0);
    weeks.forEach((week) => {
      expect(week).toHaveLength(7);
    });
  });

  describe('January 2024 (starts on Monday = index 1)', () => {
    const weeks = buildCalendarWeeks(2024, 0);

    it('first cell is null (Sunday is empty for a Monday start)', () => {
      expect(weeks[0][0]).toBeNull();
    });

    it('first day (1) appears in the correct position', () => {
      // Jan 1, 2024 is Monday -> index 1 in the first week
      expect(weeks[0][1]).toBe(1);
    });

    it('contains 31 non-null days', () => {
      const days = weeks.flat().filter((d) => d !== null);
      expect(days).toHaveLength(31);
    });

    it('last day is 31', () => {
      const days = weeks.flat().filter((d) => d !== null);
      expect(days[days.length - 1]).toBe(31);
    });
  });

  describe('February 2024 (leap year — 29 days, starts on Thursday = index 4)', () => {
    const weeks = buildCalendarWeeks(2024, 1);

    it('contains 29 non-null days', () => {
      const days = weeks.flat().filter((d) => d !== null);
      expect(days).toHaveLength(29);
    });

    it('first day (1) is at index 4 of first week (Thursday)', () => {
      expect(weeks[0][4]).toBe(1);
    });

    it('last day is 29', () => {
      const days = weeks.flat().filter((d) => d !== null);
      expect(days[days.length - 1]).toBe(29);
    });
  });

  describe('February 2023 (non-leap year — 28 days, starts on Wednesday = index 3)', () => {
    const weeks = buildCalendarWeeks(2023, 1);

    it('contains exactly 28 non-null days', () => {
      const days = weeks.flat().filter((d) => d !== null);
      expect(days).toHaveLength(28);
    });

    it('last day is 28', () => {
      const days = weeks.flat().filter((d) => d !== null);
      expect(days[days.length - 1]).toBe(28);
    });
  });

  describe('April 2024 (30-day month, starts on Monday = index 1)', () => {
    const weeks = buildCalendarWeeks(2024, 3);

    it('contains exactly 30 non-null days', () => {
      const days = weeks.flat().filter((d) => d !== null);
      expect(days).toHaveLength(30);
    });

    it('last day is 30', () => {
      const days = weeks.flat().filter((d) => d !== null);
      expect(days[days.length - 1]).toBe(30);
    });
  });

  describe('March 2026 (31-day month, starts on Sunday = index 0)', () => {
    const weeks = buildCalendarWeeks(2026, 2);

    it('first cell is 1 (no null padding when month starts on Sunday)', () => {
      expect(weeks[0][0]).toBe(1);
    });

    it('contains exactly 31 non-null days', () => {
      const days = weeks.flat().filter((d) => d !== null);
      expect(days).toHaveLength(31);
    });
  });

  describe('null padding properties', () => {
    it('all non-null values are sequential integers from 1 to daysInMonth', () => {
      const weeks = buildCalendarWeeks(2025, 5); // June 2025
      const days = weeks.flat().filter((d) => d !== null);
      days.forEach((day, index) => {
        expect(day).toBe(index + 1);
      });
    });

    it('null cells only appear before the first day or after the last day', () => {
      const weeks = buildCalendarWeeks(2024, 0); // Jan 2024
      const flat = weeks.flat();
      // Find the first and last non-null indices
      const firstReal = flat.findIndex((d) => d !== null);
      const lastReal = flat.length - 1 - [...flat].reverse().findIndex((d) => d !== null);
      // Nulls before firstReal
      flat.slice(0, firstReal).forEach((d) => expect(d).toBeNull());
      // Nulls after lastReal
      flat.slice(lastReal + 1).forEach((d) => expect(d).toBeNull());
    });

    it('total cell count is always a multiple of 7', () => {
      [2024, 2025, 2026].forEach((year) => {
        for (let month = 0; month < 12; month++) {
          const weeks = buildCalendarWeeks(year, month);
          const totalCells = weeks.flat().length;
          expect(totalCells % 7).toBe(0);
        }
      });
    });
  });
});
