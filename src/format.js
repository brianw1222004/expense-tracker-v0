import { DEFAULT_CURRENCY, getCurrency } from './currency';

function group(whole) {
  return whole.replace(/\B(?=(\d{3})+(?!\d))/g, ',');
}

export function formatMoney(amount, currencyCode = DEFAULT_CURRENCY) {
  const { symbol, decimals } = getCurrency(currencyCode);
  const fixed = Math.abs(amount).toFixed(decimals);
  const [whole, cents] = fixed.split('.');
  return decimals > 0 ? `${symbol}${group(whole)}.${cents}` : `${symbol}${group(whole)}`;
}

// Compact form for stat tiles: $1.2k, $45, $7.50
export function formatMoneyShort(amount, currencyCode = DEFAULT_CURRENCY) {
  const { symbol, decimals } = getCurrency(currencyCode);
  if (amount >= 10000) return `${symbol}${group(String(Math.round(amount / 1000)))}k`;
  if (amount >= 1000) return `${symbol}${(amount / 1000).toFixed(1)}k`;
  if (amount >= 100 || decimals === 0 || Number.isInteger(amount)) {
    return `${symbol}${group(String(Math.round(amount)))}`;
  }
  return `${symbol}${amount.toFixed(2)}`;
}

export function dateKey(timestamp) {
  const d = new Date(timestamp);
  const m = String(d.getMonth() + 1).padStart(2, '0');
  const day = String(d.getDate()).padStart(2, '0');
  return `${d.getFullYear()}-${m}-${day}`;
}

// YYYY-MM, the canonical month identity used for monthly totals and comparisons.
export function monthKey(timestamp) {
  return dateKey(timestamp).slice(0, 7);
}

const WEEKDAYS = ['Sunday', 'Monday', 'Tuesday', 'Wednesday', 'Thursday', 'Friday', 'Saturday'];
const MONTHS = [
  'January', 'February', 'March', 'April', 'May', 'June',
  'July', 'August', 'September', 'October', 'November', 'December',
];

export function dayLabel(timestamp) {
  const now = new Date();
  if (dateKey(timestamp) === dateKey(now.getTime())) return 'Today';
  const yesterday = new Date(now);
  yesterday.setDate(now.getDate() - 1);
  if (dateKey(timestamp) === dateKey(yesterday.getTime())) return 'Yesterday';
  const d = new Date(timestamp);
  return `${WEEKDAYS[d.getDay()]}, ${MONTHS[d.getMonth()]} ${d.getDate()}`;
}

export function monthLabel(date = new Date()) {
  return `${MONTHS[date.getMonth()]} ${date.getFullYear()}`;
}

// 'June 2026' from a 'YYYY-MM' month key.
export function monthKeyLabel(key) {
  const [year, month] = key.split('-');
  return `${MONTHS[Number(month) - 1]} ${year}`;
}

// Short form for chips / chart axes: 'Jun '26'
export function monthKeyLabelShort(key) {
  const [year, month] = key.split('-');
  return `${MONTHS[Number(month) - 1].slice(0, 3)} ’${year.slice(2)}`;
}
