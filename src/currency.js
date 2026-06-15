export const DEFAULT_CURRENCY = 'USD';

export const CURRENCIES = [
  { code: 'USD', symbol: '$', name: 'US Dollar', decimals: 2 },
  { code: 'EUR', symbol: '€', name: 'Euro', decimals: 2 },
  { code: 'GBP', symbol: '£', name: 'British Pound', decimals: 2 },
  { code: 'JPY', symbol: '¥', name: 'Japanese Yen', decimals: 0 },
  { code: 'TWD', symbol: 'NT$', name: 'New Taiwan Dollar', decimals: 0 },
  { code: 'CNY', symbol: 'CN¥', name: 'Chinese Yuan', decimals: 2 },
];

// Units of each currency per 1 USD. Static snapshot — swapping in live rates
// (e.g. exchangerate.host) only means replacing this map / the body of convert().
const RATES_TO_USD = { USD: 1, EUR: 0.92, GBP: 0.79, JPY: 157.5, TWD: 32.5, CNY: 7.25 };

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
