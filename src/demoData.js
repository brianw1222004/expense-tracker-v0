// Seed expenses spread over the last ~10 days so every part of the UI has data.
const SEED = [
  { daysAgo: 0, hour: 9, amount: 5.4, note: 'Latte', category: 'food' },
  { daysAgo: 0, hour: 12, amount: 14.25, note: 'Lunch burrito', category: 'food' },
  { daysAgo: 0, hour: 17, amount: 22.0, note: 'Uber home', category: 'transport' },
  { daysAgo: 1, hour: 8, amount: 3.75, note: 'Coffee', category: 'food' },
  { daysAgo: 1, hour: 13, amount: 64.3, note: 'Weekly groceries', category: 'groceries' },
  { daysAgo: 1, hour: 20, amount: 17.99, note: 'Movie night', category: 'fun' },
  { daysAgo: 2, hour: 11, amount: 32.5, note: 'Pharmacy', category: 'health' },
  { daysAgo: 3, hour: 10, amount: 89.99, note: 'Running shoes', category: 'shopping' },
  { daysAgo: 3, hour: 19, amount: 28.4, note: 'Dinner with Sam', category: 'food' },
  { daysAgo: 4, hour: 9, amount: 45.0, note: 'Gas', category: 'transport' },
  { daysAgo: 5, hour: 14, amount: 120.0, note: 'Electric bill', category: 'bills' },
  { daysAgo: 6, hour: 12, amount: 11.5, note: 'Poke bowl', category: 'food' },
  { daysAgo: 7, hour: 16, amount: 39.99, note: 'Birthday gift', category: 'shopping' },
  { daysAgo: 8, hour: 13, amount: 52.75, note: 'Groceries', category: 'groceries' },
  { daysAgo: 9, hour: 21, amount: 15.0, note: 'Concert parking', category: 'transport' },
];

export function buildDemoExpenses() {
  const now = new Date();
  return SEED.map((item, index) => {
    const d = new Date(now);
    d.setDate(now.getDate() - item.daysAgo);
    d.setHours(item.hour, (index * 17) % 60, 0, 0);
    return {
      id: `demo-${index}`,
      amount: item.amount,
      note: item.note,
      category: item.category,
      createdAt: d.getTime(),
    };
  });
}
