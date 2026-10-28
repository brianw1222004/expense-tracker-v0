import { useEffect, useMemo, useState } from 'react';
import { initialHistoricalPreview, previewInputKey, startHistoricalFxPreview } from './historicalFxPreview';

export default function useHistoricalFxPreview(rows, currency, scope, enabled) {
  const key = previewInputKey(enabled ? rows : [], currency, scope);
  const initial = useMemo(() => initialHistoricalPreview(enabled ? rows : [], currency), [key, enabled]);
  const [result, setResult] = useState(null);
  useEffect(() => {
    if (!enabled || !scope) return undefined;
    let active = true;
    const batch = startHistoricalFxPreview(rows, currency, scope, (snapshot) => {
      if (active) setResult({ key, snapshot });
    });
    return () => { active = false; batch.cancel(); };
  }, [key, enabled]);
  // Never paint another account/currency/record selection's previous result.
  return enabled && result?.key === key ? result.snapshot : initial;
}
