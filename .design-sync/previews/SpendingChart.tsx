import React from 'react';
import { SpendingChart } from 'expense-tracker';

const sampleTotals = [
  12, 45, 0, 28, 67, 15, 92, 34, 0, 55,
  78, 22, 41, 63, 8, 120, 47, 33, 0, 91,
  56, 14, 88, 37, 0, 65, 42, 73, 19, 105,
];

const lowSpending = [5, 3, 8, 2, 12, 0, 7, 4, 6, 3, 9, 1, 5, 8, 2];

const highSpending = [
  150, 230, 180, 95, 310, 200, 275, 190, 420, 160,
  280, 350, 210, 190, 300, 175, 260, 380, 145, 290,
];

export function MonthlyOverview() {
  return (
    <div style={{ width: 380 }}>
      <SpendingChart dailyTotals={sampleTotals} displayCurrency="USD" title="Daily Spending" />
    </div>
  );
}

export function LowSpending() {
  return (
    <div style={{ width: 380 }}>
      <SpendingChart dailyTotals={lowSpending} displayCurrency="USD" title="Light Month" />
    </div>
  );
}

export function HighSpending() {
  return (
    <div style={{ width: 380 }}>
      <SpendingChart dailyTotals={highSpending} displayCurrency="EUR" title="Busy Month" />
    </div>
  );
}
