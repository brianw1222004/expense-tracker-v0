import React from 'react';
import { ExpenseRow } from 'expense-tracker';

const foodExpense = {
  id: '1',
  amount: 24.50,
  currency: 'USD',
  note: 'Lunch at Chipotle',
  category: 'food',
  createdAt: Date.now(),
  displayAmount: 24.50,
};

const convertedExpense = {
  id: '2',
  amount: 3500,
  currency: 'JPY',
  note: 'Convenience store snacks',
  category: 'groceries',
  createdAt: Date.now(),
  displayAmount: 23.33,
};

const shoppingExpense = {
  id: '3',
  amount: 89.99,
  currency: 'USD',
  note: 'New running shoes',
  category: 'shopping',
  createdAt: Date.now(),
  displayAmount: 89.99,
};

export function FoodItem() {
  return (
    <div style={{ width: 375 }}>
      <ExpenseRow expense={foodExpense} displayCurrency="USD" onRequestDelete={() => {}} onEdit={() => {}} />
    </div>
  );
}

export function ConvertedCurrency() {
  return (
    <div style={{ width: 375 }}>
      <ExpenseRow expense={convertedExpense} displayCurrency="USD" onRequestDelete={() => {}} onEdit={() => {}} />
    </div>
  );
}

export function ShoppingItem() {
  return (
    <div style={{ width: 375 }}>
      <ExpenseRow expense={shoppingExpense} displayCurrency="USD" onRequestDelete={() => {}} onEdit={() => {}} />
    </div>
  );
}
