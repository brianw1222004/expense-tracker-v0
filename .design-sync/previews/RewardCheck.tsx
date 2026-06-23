import React from 'react';
import { RewardCheck } from 'expense-tracker';

export function Triggered() {
  return (
    <div style={{ position: 'relative', width: 300, height: 300, background: '#ecfdf5' }}>
      <RewardCheck trigger={1} />
    </div>
  );
}
