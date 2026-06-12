import { Pressable, StyleSheet, Text, View } from 'react-native';
import { colors, spacing, radius } from '../theme';
import { formatMoney } from '../format';
import { getCurrency } from '../currency';

export default function BudgetBar({ monthTotal, monthlyBudget, displayCurrency, onPressSetBudget }) {
  if (!(monthlyBudget > 0)) {
    return (
      <Pressable
        onPress={onPressSetBudget}
        accessibilityRole="button"
        accessibilityLabel="Set a monthly budget"
        style={({ pressed }) => [styles.card, styles.setCard, pressed && styles.cardPressed]}
      >
        <Text style={styles.setEmoji}>{'\u{1F3AF}'}</Text>
        <View style={styles.setTextArea}>
          <Text style={styles.setTitle}>Set a monthly budget</Text>
          <Text style={styles.setHint}>Track this month against a spending limit</Text>
        </View>
        <Text style={styles.chevron}>{'›'}</Text>
      </Pressable>
    );
  }

  // Compare at display precision: monthTotal is an unrounded float sum of
  // converted amounts, and a sub-unit residue over the budget would flip the
  // bar red with "¥0 over" while both rendered numbers read identical.
  const factor = 10 ** getCurrency(displayCurrency).decimals;
  const spent = Math.round(monthTotal * factor) / factor;
  const over = spent > monthlyBudget;
  const fillPercent = Math.min(100, (spent / monthlyBudget) * 100);

  return (
    <View style={styles.card}>
      <View style={styles.labelRow}>
        <Text style={styles.title}>Monthly budget</Text>
        <Text style={[styles.status, over && styles.statusOver]}>
          {over
            ? `${formatMoney(spent - monthlyBudget, displayCurrency)} over`
            : `${formatMoney(monthlyBudget - spent, displayCurrency)} left`}
        </Text>
      </View>
      <View style={styles.track}>
        <View style={[styles.fill, { width: `${fillPercent}%` }, over && styles.fillOver]} />
      </View>
      <Text style={styles.spent}>
        <Text style={styles.spentStrong}>{formatMoney(spent, displayCurrency)}</Text>
        {' of '}
        {formatMoney(monthlyBudget, displayCurrency)}
      </Text>
    </View>
  );
}

const styles = StyleSheet.create({
  card: {
    backgroundColor: colors.card,
    borderRadius: radius.md,
    padding: spacing.md,
    marginHorizontal: spacing.md,
    marginBottom: spacing.lg,
  },
  cardPressed: {
    backgroundColor: colors.cardPressed,
  },
  setCard: {
    flexDirection: 'row',
    alignItems: 'center',
  },
  setEmoji: {
    fontSize: 22,
    width: 34,
  },
  setTextArea: {
    flex: 1,
  },
  setTitle: {
    color: colors.textPrimary,
    fontSize: 16,
    fontWeight: '600',
  },
  setHint: {
    color: colors.textMuted,
    fontSize: 13,
    marginTop: 2,
  },
  chevron: {
    color: colors.textMuted,
    fontSize: 22,
    fontWeight: '600',
    marginLeft: spacing.sm,
  },
  labelRow: {
    flexDirection: 'row',
    justifyContent: 'space-between',
    alignItems: 'center',
    marginBottom: spacing.sm + 4,
  },
  title: {
    color: colors.textSecondary,
    fontSize: 13,
    fontWeight: '700',
    textTransform: 'uppercase',
    letterSpacing: 0.8,
  },
  status: {
    color: colors.textSecondary,
    fontSize: 14,
    fontWeight: '600',
    fontVariant: ['tabular-nums'],
  },
  statusOver: {
    color: colors.danger,
  },
  track: {
    height: 10,
    borderRadius: 5,
    backgroundColor: colors.background,
    overflow: 'hidden',
  },
  fill: {
    height: '100%',
    borderRadius: 5,
    backgroundColor: colors.accent,
  },
  fillOver: {
    backgroundColor: colors.danger,
  },
  spent: {
    color: colors.textSecondary,
    fontSize: 14,
    marginTop: spacing.sm,
    fontVariant: ['tabular-nums'],
  },
  spentStrong: {
    color: colors.textPrimary,
    fontWeight: '700',
  },
});
