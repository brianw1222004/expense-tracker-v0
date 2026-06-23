import React from 'react';
import { ErrorBoundary } from 'expense-tracker';

function Thrower() {
  throw new Error('Something went wrong in the component');
}

export function ErrorState() {
  return (
    <div style={{ width: 375, height: 300 }}>
      <ErrorBoundary>
        <Thrower />
      </ErrorBoundary>
    </div>
  );
}

export function HealthyState() {
  return (
    <div style={{ width: 375, padding: 24 }}>
      <ErrorBoundary>
        <div style={{ fontFamily: 'system-ui', color: '#1a2a3a', fontSize: 16 }}>
          Content renders normally when no error occurs
        </div>
      </ErrorBoundary>
    </div>
  );
}
