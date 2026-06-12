import { StyleSheet, Text, View } from 'react-native';
import { colors, spacing } from '../theme';
import { formatMoney, formatMoneyShort, monthLabel } from '../format';

export default function SummaryHeader({ monthTotal, todayTotal, count, avgPerDay }) {
  return (
    <View style={styles.container}>
      <Text style={styles.monthLabel}>{monthLabel()}</Text>
      <Text style={styles.total} numberOfLines={1} adjustsFontSizeToFit>
        {formatMoney(monthTotal)}
      </Text>
      <View style={styles.statsRow}>
        <Stat value={formatMoneyShort(todayTotal)} label="Today" />
        <Stat value={String(count)} label="Expenses" />
        <Stat value={formatMoneyShort(avgPerDay)} label="Avg / day" />
      </View>
    </View>
  );
}

function Stat({ value, label }) {
  return (
    <View style={styles.stat}>
      <Text style={styles.statValue}>{value}</Text>
      <Text style={styles.statLabel}>{label}</Text>
    </View>
  );
}

const styles = StyleSheet.create({
  container: {
    paddingHorizontal: spacing.lg,
    paddingTop: spacing.md,
    paddingBottom: spacing.lg,
    alignItems: 'center',
  },
  monthLabel: {
    color: colors.textSecondary,
    fontSize: 15,
    fontWeight: '600',
    textTransform: 'uppercase',
    letterSpacing: 1.2,
  },
  total: {
    color: colors.textPrimary,
    fontSize: 48,
    fontWeight: '800',
    marginTop: spacing.xs,
    fontVariant: ['tabular-nums'],
  },
  statsRow: {
    flexDirection: 'row',
    marginTop: spacing.md,
    backgroundColor: colors.card,
    borderRadius: 16,
    paddingVertical: spacing.sm + 4,
    alignSelf: 'stretch',
  },
  stat: {
    flex: 1,
    alignItems: 'center',
  },
  statValue: {
    color: colors.textPrimary,
    fontSize: 17,
    fontWeight: '700',
    fontVariant: ['tabular-nums'],
  },
  statLabel: {
    color: colors.textMuted,
    fontSize: 12,
    marginTop: 2,
  },
});
