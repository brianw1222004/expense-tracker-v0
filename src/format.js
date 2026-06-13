import { DEFAULT_CURRENCY, getCurrency } from './currency';
import { DEFAULT_LANGUAGE, getDateNames, translate } from './i18n';

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

// Date labels take the app language; names and ordering templates live in
// i18n.js so all language data is in one place.
function fill(template, vars) {
  return template.replace(/\{(\w+)\}/g, (match, name) =>
    vars[name] !== undefined ? String(vars[name]) : match
  );
}

export function dayLabel(timestamp, language = DEFAULT_LANGUAGE) {
  const now = new Date();
  if (dateKey(timestamp) === dateKey(now.getTime())) return translate(language, 'date.today');
  const yesterday = new Date(now);
  yesterday.setDate(now.getDate() - 1);
  if (dateKey(timestamp) === dateKey(yesterday.getTime())) {
    return translate(language, 'date.yesterday');
  }
  const d = new Date(timestamp);
  const names = getDateNames(language);
  return fill(names.dayLabel, {
    weekday: names.weekdays[d.getDay()],
    month: names.months[d.getMonth()],
    day: d.getDate(),
  });
}

export function monthLabel(date = new Date(), language = DEFAULT_LANGUAGE) {
  const names = getDateNames(language);
  return fill(names.monthYear, {
    month: names.months[date.getMonth()],
    year: date.getFullYear(),
  });
}

// 'June 2026' from a 'YYYY-MM' month key.
export function monthKeyLabel(key, language = DEFAULT_LANGUAGE) {
  const [year, month] = key.split('-');
  const names = getDateNames(language);
  return fill(names.monthYear, { month: names.months[Number(month) - 1], year });
}

// Short form for chips / chart axes: 'Jun ’26'
export function monthKeyLabelShort(key, language = DEFAULT_LANGUAGE) {
  const [year, month] = key.split('-');
  const names = getDateNames(language);
  return fill(names.monthShortYear, {
    month: names.monthsShort[Number(month) - 1],
    yy: year.slice(2),
  });
}
