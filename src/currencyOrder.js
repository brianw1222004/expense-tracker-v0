import { CURRENCIES } from './currency';

// Only raw saved collections belong here, never the unified spending rows.
export function currenciesByFrequency(expenses = [], splitExpenses = []) {
  const counts = new Map(CURRENCIES.map(({ code }) => [code, 0]));
  for (const records of [expenses, splitExpenses]) {
    // IDs are unique within each collection, but may overlap between them.
    const seen = new Set();
    for (const record of records) {
      if (!record || record.id == null || record.settlement || record.splitId != null ||
          record.sourceType != null || !counts.has(record.currency) || seen.has(record.id)) continue;
      seen.add(record.id);
      counts.set(record.currency, counts.get(record.currency) + 1);
    }
  }
  return CURRENCIES.map((currency, index) => ({ currency, index }))
    .sort((a, b) => counts.get(b.currency.code) - counts.get(a.currency.code) || a.index - b.index)
    .map(({ currency }) => currency);
}
