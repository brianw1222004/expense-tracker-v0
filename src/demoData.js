// Seed expenses: recent days for the list/dashboard, plus two earlier months
// so the Categories month-over-month trends have real data. A few entries are
// non-USD to show conversion.
const RECENT_SEED = [
  { daysAgo: 0, hour: 9, amount: 5.4, currency: 'USD', note: 'Latte', category: 'food' },
  { daysAgo: 0, hour: 12, amount: 14.25, currency: 'USD', note: 'Lunch burrito', category: 'food' },
  { daysAgo: 0, hour: 17, amount: 22.0, currency: 'USD', note: 'Uber home', category: 'transport' },
  { daysAgo: 1, hour: 8, amount: 3.75, currency: 'USD', note: 'Coffee', category: 'food' },
  { daysAgo: 1, hour: 13, amount: 64.3, currency: 'USD', note: 'Weekly groceries', category: 'groceries' },
  { daysAgo: 1, hour: 20, amount: 17.99, currency: 'USD', note: 'Movie night', category: 'fun' },
  { daysAgo: 2, hour: 11, amount: 32.5, currency: 'USD', note: 'Pharmacy', category: 'health' },
  { daysAgo: 3, hour: 10, amount: 82.0, currency: 'EUR', note: 'Running shoes', category: 'shopping' },
  { daysAgo: 3, hour: 19, amount: 28.4, currency: 'USD', note: 'Dinner with Sam', category: 'food' },
  { daysAgo: 4, hour: 9, amount: 45.0, currency: 'USD', note: 'Gas', category: 'transport' },
  { daysAgo: 5, hour: 14, amount: 120.0, currency: 'USD', note: 'Electric bill', category: 'bills' },
  { daysAgo: 6, hour: 12, amount: 1800, currency: 'JPY', note: 'Ramen lunch', category: 'food' },
  { daysAgo: 7, hour: 16, amount: 31.5, currency: 'GBP', note: 'Birthday gift', category: 'shopping' },
  { daysAgo: 8, hour: 13, amount: 52.75, currency: 'USD', note: 'Groceries', category: 'groceries' },
  { daysAgo: 9, hour: 21, amount: 480, currency: 'TWD', note: 'Concert parking', category: 'transport' },
];

// Older entries pinned by calendar month so the trends always have at least
// three months regardless of today's date.
const PAST_SEED = [
  { monthsAgo: 1, day: 3, hour: 9, amount: 4.8, currency: 'USD', note: 'Coffee', category: 'food' },
  { monthsAgo: 1, day: 5, hour: 13, amount: 71.2, currency: 'USD', note: 'Groceries', category: 'groceries' },
  { monthsAgo: 1, day: 8, hour: 18, amount: 36.0, currency: 'USD', note: 'Date night', category: 'food' },
  { monthsAgo: 1, day: 11, hour: 10, amount: 120.0, currency: 'USD', note: 'Electric bill', category: 'bills' },
  { monthsAgo: 1, day: 14, hour: 15, amount: 65.0, currency: 'EUR', note: 'Train tickets', category: 'transport' },
  { monthsAgo: 1, day: 17, hour: 20, amount: 24.99, currency: 'USD', note: 'Streaming bundle', category: 'fun' },
  { monthsAgo: 1, day: 21, hour: 12, amount: 18.4, currency: 'USD', note: 'Lunch', category: 'food' },
  { monthsAgo: 1, day: 24, hour: 16, amount: 140.0, currency: 'USD', note: 'New headphones', category: 'shopping' },
  { monthsAgo: 1, day: 26, hour: 11, amount: 27.0, currency: 'USD', note: 'Pharmacy', category: 'health' },
  { monthsAgo: 2, day: 4, hour: 9, amount: 5.1, currency: 'USD', note: 'Coffee', category: 'food' },
  { monthsAgo: 2, day: 7, hour: 14, amount: 58.6, currency: 'USD', note: 'Groceries', category: 'groceries' },
  { monthsAgo: 2, day: 12, hour: 19, amount: 42.0, currency: 'USD', note: 'Birthday dinner', category: 'food' },
  { monthsAgo: 2, day: 15, hour: 10, amount: 118.0, currency: 'USD', note: 'Electric bill', category: 'bills' },
  { monthsAgo: 2, day: 19, hour: 17, amount: 12.5, currency: 'GBP', note: 'Museum tickets', category: 'fun' },
  { monthsAgo: 2, day: 23, hour: 13, amount: 33.0, currency: 'USD', note: 'Gas', category: 'transport' },
];

// Income across the same three months so the Balance screen's chart, balance,
// and month-over-month delta always have something to show.
const INCOME_RECENT_SEED = [
  { daysAgo: 1, hour: 9, amount: 4200, currency: 'USD', source: 'salary', note: 'Monthly salary' },
  { daysAgo: 4, hour: 15, amount: 650, currency: 'USD', source: 'freelance', note: 'Logo design' },
  { daysAgo: 9, hour: 12, amount: 120, currency: 'USD', source: 'reimbursement', note: 'Travel reimbursement' },
];
const INCOME_PAST_SEED = [
  { monthsAgo: 1, day: 1, hour: 9, amount: 4200, currency: 'USD', source: 'salary', note: 'Monthly salary' },
  { monthsAgo: 1, day: 12, hour: 14, amount: 300, currency: 'EUR', source: 'side_income', note: 'Course sales' },
  { monthsAgo: 2, day: 1, hour: 9, amount: 4000, currency: 'USD', source: 'salary', note: 'Monthly salary' },
  { monthsAgo: 2, day: 18, hour: 18, amount: 100, currency: 'USD', source: 'gift', note: 'Birthday gift' },
];

export function buildDemoExpenses() {
  const now = new Date();
  const expenses = [];

  RECENT_SEED.forEach((item, index) => {
    const d = new Date(now);
    d.setDate(now.getDate() - item.daysAgo);
    d.setHours(item.hour, (index * 17) % 60, 0, 0);
    expenses.push(toExpense(item, `demo-${index}`, d));
  });

  PAST_SEED.forEach((item, index) => {
    // Day-first construction so e.g. "day 26" never rolls over in a short month.
    const d = new Date(now.getFullYear(), now.getMonth() - item.monthsAgo, item.day, item.hour, (index * 23) % 60, 0, 0);
    expenses.push(toExpense(item, `demo-past-${index}`, d));
  });

  return expenses;
}

function toExpense(item, id, date) {
  return {
    id,
    amount: item.amount,
    currency: item.currency,
    note: item.note,
    category: item.category,
    createdAt: date.getTime(),
  };
}

export function buildDemoIncome() {
  const now = new Date();
  const income = [];

  INCOME_RECENT_SEED.forEach((item, index) => {
    const d = new Date(now);
    d.setDate(now.getDate() - item.daysAgo);
    d.setHours(item.hour, (index * 13) % 60, 0, 0);
    income.push(toIncome(item, `demo-income-${index}`, d));
  });

  INCOME_PAST_SEED.forEach((item, index) => {
    const d = new Date(now.getFullYear(), now.getMonth() - item.monthsAgo, item.day, item.hour, (index * 19) % 60, 0, 0);
    income.push(toIncome(item, `demo-income-past-${index}`, d));
  });

  return income;
}

function toIncome(item, id, date) {
  return {
    id,
    amount: item.amount,
    currency: item.currency,
    source: item.source,
    note: item.note,
    createdAt: date.getTime(),
  };
}
