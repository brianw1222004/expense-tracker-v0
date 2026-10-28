import React, { useMemo } from 'react';
import { StyleSheet, Text, View } from 'react-native';
import { fonts, radius, spacing, useTheme } from '../theme';
import { formatMoney } from '../format';
import useHistoricalFxPreview from '../useHistoricalFxPreview';

function signedMoney(amount, currency) {
  return `${amount < 0 ? '-' : ''}${formatMoney(amount, currency)} ${currency}`;
}

export function HistoricalFxRow({ value, currency }) {
  const { colors } = useTheme();
  if (!__DEV__ || !value) return null;
  return (
    <View style={{ marginTop: spacing.xs }} accessible>
      <Text style={{ fontFamily: fonts.regular, fontSize: 12, color: colors.accent }}>
        Historical FX · {value.status === 'available' ? signedMoney(value.amount, currency)
          : value.status === 'loading' ? 'Loading…' : 'Unavailable'}
      </Text>
      {value.status === 'available' && (
        <Text style={{ fontFamily: fonts.regular, fontSize: 11, color: colors.textMuted }}>
          BOC · observed {value.effectiveDate}{value.stale ? ' · Stale cache' : ''}
        </Text>
      )}
    </View>
  );
}

export function HistoricalMonthPreview({ rows, currency, userScope, monthKey }) {
  const { colors } = useTheme();
  const preview = useHistoricalFxPreview(rows, currency, userScope, __DEV__);
  const styles = useMemo(() => StyleSheet.create({
    card: { marginHorizontal: spacing.md, marginVertical: spacing.md, padding: spacing.md,
      borderRadius: radius.md, backgroundColor: colors.card, borderWidth: 1, borderColor: colors.accent + '33' },
    label: { fontFamily: fonts.bold, fontSize: 13, color: colors.accent },
    value: { fontFamily: fonts.numBold, fontSize: 22, color: colors.textPrimary, marginVertical: spacing.xs },
    hint: { fontFamily: fonts.regular, fontSize: 12, color: colors.textMuted, lineHeight: 18 },
  }), [colors]);
  if (!__DEV__) return null;
  const dates = [...new Set(Object.values(preview.entries).map((row) => row.effectiveDate).filter(Boolean))].sort();
  return (
    <View style={styles.card} accessible accessibilityLiveRegion="polite">
      <Text style={styles.label}>Historical spending preview · DEV</Text>
      <Text style={styles.hint}>{monthKey} · personal + your shared spending</Text>
      {preview.status === 'complete'
        ? <Text style={styles.value}>{signedMoney(preview.amount, currency)}</Text>
        : <Text style={styles.value}>{preview.loading ? 'Loading historical rates…' : 'Historical total unavailable'}</Text>}
      <Text style={styles.hint}>
        {preview.ready}/{preview.total} ready{preview.unavailable ? ` · ${preview.unavailable} unavailable` : ''}
        {preview.stale ? ' · Includes stale cached rates' : ''}
      </Text>
      {dates.length > 0 && <Text style={styles.hint}>BOC observations: {dates[0]}{dates.length > 1 ? ` – ${dates.at(-1)}` : ''}</Text>}
      <Text style={styles.hint}>Read-only preview · current totals unchanged</Text>
    </View>
  );
}
