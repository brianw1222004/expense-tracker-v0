export function formatMoney(amount) {
  const fixed = Math.abs(amount).toFixed(2);
  const [whole, cents] = fixed.split('.');
  const grouped = whole.replace(/\B(?=(\d{3})+(?!\d))/g, ',');
  return `$${grouped}.${cents}`;
}

// Compact form for stat tiles: $1.2k, $45, $7.50
export function formatMoneyShort(amount) {
  if (amount >= 10000) return `$${Math.round(amount / 1000)}k`;
  if (amount >= 1000) return `$${(amount / 1000).toFixed(1)}k`;
  if (amount >= 100 || Number.isInteger(amount)) return `$${Math.round(amount)}`;
  return `$${amount.toFixed(2)}`;
}

export function dateKey(timestamp) {
  const d = new Date(timestamp);
  const m = String(d.getMonth() + 1).padStart(2, '0');
  const day = String(d.getDate()).padStart(2, '0');
  return `${d.getFullYear()}-${m}-${day}`;
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
