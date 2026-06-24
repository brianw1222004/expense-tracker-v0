import React from 'react';
import { EmptyState, THEMES } from 'expense-tracker';

const strings: Record<string, string> = {
  'empty.title': 'No expenses yet',
  'empty.hint': 'Start tracking your spending by recording your first expense.',
  'empty.addFirst': 'Add your first expense',
  'empty.loadDemo': 'or try with sample data',
};
const t = (key: string) => strings[key] ?? key;

export function Default() {
  return <EmptyState colors={THEMES.neutral} t={t} onAdd={() => {}} onLoadDemo={() => {}} />;
}

export function SlateTheme() {
  return <EmptyState colors={THEMES.slate} t={t} onAdd={() => {}} onLoadDemo={() => {}} />;
}

export function SandTheme() {
  return <EmptyState colors={THEMES.sand} t={t} onAdd={() => {}} onLoadDemo={() => {}} />;
}
