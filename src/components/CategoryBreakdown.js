import { StyleSheet, Text, View } from 'react-native';
import { colors, spacing, radius } from '../theme';
import { getCategory } from '../categories';
import { formatMoney } from '../format';

export default function CategoryBreakdown({ totalsByCategory }) {
  const entries = Object.entries(totalsByCategory).sort((a, b) => b[1] - a[1]);
  if (entries.length === 0) return null;
  const max = entries[0][1];

  return (
    <View style={styles.card}>
      <Text style={styles.title}>This month by category</Text>
      {entries.slice(0, 5).map(([categoryId, total]) => {
        const category = getCategory(categoryId);
        return (
          <View key={categoryId} style={styles.row}>
            <Text style={styles.emoji}>{category.emoji}</Text>
            <View style={styles.barArea}>
              <View style={styles.barLabels}>
                <Text style={styles.categoryLabel}>{category.label}</Text>
                <Text style={styles.amount}>{formatMoney(total)}</Text>
              </View>
              <View style={styles.barTrack}>
                <View
                  style={[
                    styles.barFill,
                    { width: `${Math.max(4, (total / max) * 100)}%`, backgroundColor: category.color },
                  ]}
                />
              </View>
            </View>
          </View>
        );
      })}
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
  title: {
    color: colors.textSecondary,
    fontSize: 13,
    fontWeight: '700',
    textTransform: 'uppercase',
    letterSpacing: 0.8,
    marginBottom: spacing.md,
  },
  row: {
    flexDirection: 'row',
    alignItems: 'center',
    marginBottom: spacing.sm + 4,
  },
  emoji: {
    fontSize: 22,
    width: 34,
  },
  barArea: {
    flex: 1,
  },
  barLabels: {
    flexDirection: 'row',
    justifyContent: 'space-between',
    marginBottom: 4,
  },
  categoryLabel: {
    color: colors.textPrimary,
    fontSize: 14,
    fontWeight: '600',
  },
  amount: {
    color: colors.textSecondary,
    fontSize: 14,
    fontVariant: ['tabular-nums'],
  },
  barTrack: {
    height: 6,
    borderRadius: 3,
    backgroundColor: colors.background,
    overflow: 'hidden',
  },
  barFill: {
    height: '100%',
    borderRadius: 3,
  },
});
