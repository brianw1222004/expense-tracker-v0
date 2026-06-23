import React from 'react';
import { AddExpenseModal } from 'expense-tracker';

export function Visible() {
  return (
    <div style={{ position: 'relative', width: 375, height: 400, background: '#f0f7ff' }}>
      <AddExpenseModal visible={true} onClose={() => {}}>
        <div style={{
          background: '#fff',
          borderRadius: 16,
          padding: 24,
          boxShadow: '0 2px 8px rgba(0,0,0,0.15)',
        }}>
          <div style={{ fontFamily: 'system-ui', fontWeight: 700, fontSize: 18, marginBottom: 16 }}>
            Add expense
          </div>
          <div style={{ fontFamily: 'system-ui', color: '#666', fontSize: 14 }}>
            Form content goes here
          </div>
        </div>
      </AddExpenseModal>
    </div>
  );
}

export function Hidden() {
  return (
    <div style={{ position: 'relative', width: 375, height: 200, background: '#f0f7ff' }}>
      <AddExpenseModal visible={false} onClose={() => {}}>
        <div style={{ background: '#fff', padding: 24 }}>Hidden content</div>
      </AddExpenseModal>
      <div style={{ padding: 24, fontFamily: 'system-ui', color: '#666' }}>
        Modal is closed — content behind it
      </div>
    </div>
  );
}
