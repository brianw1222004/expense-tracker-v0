import React from 'react';
import { BudgetGauge } from 'expense-tracker';

export function UnderBudget() {
  return <BudgetGauge spent={420} budget={1000} displayCurrency="USD" />;
}

export function NearLimit() {
  return <BudgetGauge spent={820} budget={1000} displayCurrency="USD" />;
}

export function OverBudget() {
  return <BudgetGauge spent={1250} budget={1000} displayCurrency="USD" />;
}

export function NoBudgetSet() {
  return <BudgetGauge empty />;
}
