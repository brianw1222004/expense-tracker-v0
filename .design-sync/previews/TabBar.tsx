import React from 'react';
import { TabBar } from 'expense-tracker';

export function DashboardSelected() {
  return (
    <div style={{ position: 'relative', height: 100, width: 390, background: '#f0f7ff', overflow: 'visible' }}>
      <TabBar tab="dashboard" onChange={() => {}} onAddPress={() => {}} addActive={false} />
    </div>
  );
}

export function CategoriesSelected() {
  return (
    <div style={{ position: 'relative', height: 100, width: 390, background: '#f0f7ff', overflow: 'visible' }}>
      <TabBar tab="categories" onChange={() => {}} onAddPress={() => {}} addActive={false} />
    </div>
  );
}
