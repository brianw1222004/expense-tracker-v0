export const DEFAULT_CURRENCY = 'USD';

// `flag` is the country/region emoji shown in the currency picker's badge.
// Emoji flags render natively on iOS/Android and macOS browsers; Windows
// browsers fall back to the 2-letter region code, which is still legible.
export const CURRENCIES = [
  { code: 'USD', symbol: '$', name: 'US Dollar', decimals: 2, flag: '🇺🇸' },
  { code: 'EUR', symbol: '€', name: 'Euro', decimals: 2, flag: '🇪🇺' },
  { code: 'GBP', symbol: '£', name: 'British Pound', decimals: 2, flag: '🇬🇧' },
  { code: 'JPY', symbol: '¥', name: 'Japanese Yen', decimals: 0, flag: '🇯🇵' },
  { code: 'TWD', symbol: 'NT$', name: 'New Taiwan Dollar', decimals: 0, flag: '🇹🇼' },
  { code: 'CNY', symbol: 'CN¥', name: 'Chinese Yuan', decimals: 2, flag: '🇨🇳' },
  { code: 'KRW', symbol: '₩', name: 'South Korean Won', decimals: 0, flag: '🇰🇷' },
  { code: 'AUD', symbol: 'A$', name: 'Australian Dollar', decimals: 2, flag: '🇦🇺' },
  { code: 'CAD', symbol: 'C$', name: 'Canadian Dollar', decimals: 2, flag: '🇨🇦' },
  { code: 'CHF', symbol: 'Fr', name: 'Swiss Franc', decimals: 2, flag: '🇨🇭' },
  { code: 'HKD', symbol: 'HK$', name: 'Hong Kong Dollar', decimals: 2, flag: '🇭🇰' },
  { code: 'SGD', symbol: 'S$', name: 'Singapore Dollar', decimals: 2, flag: '🇸🇬' },
  { code: 'INR', symbol: '₹', name: 'Indian Rupee', decimals: 2, flag: '🇮🇳' },
];

// Units of each currency per 1 USD. Static snapshot — swapping in live rates
// (e.g. exchangerate.host) only means replacing this map / the body of convert().
const RATES_TO_USD = {
  USD: 1, EUR: 0.92, GBP: 0.79, JPY: 157.5, TWD: 32.5, CNY: 7.25,
  KRW: 1380, AUD: 1.52, CAD: 1.37, CHF: 0.88, HKD: 7.8, SGD: 1.34, INR: 83.5,
};

// The single conversion helper: every total, chart, and row goes through here,
// so moving to a live-rate API is a one-function change.
export function convert(amount, fromCurrency, toCurrency) {
  if (fromCurrency === toCurrency) return amount;
  const from = RATES_TO_USD[fromCurrency] ?? 1;
  const to = RATES_TO_USD[toCurrency] ?? 1;
  return amount * (to / from);
}

// Unknown codes (stale stored data) fall back to USD so old entries still render.
export function getCurrency(code) {
  return CURRENCIES.find((c) => c.code === code) ?? CURRENCIES.find((c) => c.code === DEFAULT_CURRENCY);
}

// Convert a budget figure and round to the target currency's precision (budgets
// are user-entered round numbers, not stored amounts, so they're re-denominated
// in place when the display currency changes).
export function redenominate(value, from, to) {
  return Number(convert(value, from, to).toFixed(getCurrency(to).decimals));
}

// Re-denominate the overall + per-category budgets together. A budget of 0 (the
// "unset" sentinel) is left untouched; zero/negative category entries are
// dropped. Pure — the caller decides whether to apply the result.
export function redenominateBudgets(monthlyBudget, categoryBudgets, from, to) {
  const nextCategoryBudgets = {};
  for (const [id, value] of Object.entries(categoryBudgets ?? {})) {
    if (value > 0) nextCategoryBudgets[id] = redenominate(value, from, to);
  }
  return {
    monthlyBudget: monthlyBudget > 0 ? redenominate(monthlyBudget, from, to) : monthlyBudget,
    categoryBudgets: nextCategoryBudgets,
  };
}
