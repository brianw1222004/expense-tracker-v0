import { Alert, Pressable, StyleSheet, Text, View } from 'react-native';
import { colors, spacing, radius } from '../theme';
import { getCategory } from '../categories';
import { formatMoney } from '../format';

export default function ExpenseRow({ expense, onDelete }) {
  const category = getCategory(expense.category);

  const confirmDelete = () => {
    Alert.alert('Delete expense?', `${expense.note || category.label} — ${formatMoney(expense.amount)}`, [
      { text: 'Cancel', style: 'cancel' },
      { text: 'Delete', style: 'destructive', onPress: () => onDelete(expense.id) },
    ]);
  };

  return (
    <Pressable
      onPress={confirmDelete}
      onLongPress={confirmDelete}
      delayLongPress={350}
      style={({ pressed }) => [styles.row, pressed && styles.rowPressed]}
    >
      <View style={[styles.iconCircle, { backgroundColor: `${category.color}26` }]}>
        <Text style={styles.emoji}>{category.emoji}</Text>
      </View>
      <View style={styles.middle}>
        <Text style={styles.note} numberOfLines={1}>
          {expense.note || category.label}
        </Text>
        <Text style={styles.categoryLabel}>{category.label}</Text>
      </View>
      <Text style={styles.amount}>-{formatMoney(expense.amount)}</Text>
    </Pressable>
  );
}

const styles = StyleSheet.create({
  row: {
    flexDirection: 'row',
    alignItems: 'center',
    backgroundColor: colors.card,
    borderRadius: radius.md,
    padding: spacing.sm + 4,
    marginHorizontal: spacing.md,
    marginBottom: spacing.sm,
  },
  rowPressed: {
    backgroundColor: colors.cardPressed,
  },
  iconCircle: {
    width: 42,
    height: 42,
    borderRadius: 21,
    alignItems: 'center',
    justifyContent: 'center',
  },
  emoji: {
    fontSize: 20,
  },
  middle: {
    flex: 1,
    marginHorizontal: spacing.sm + 4,
  },
  note: {
    color: colors.textPrimary,
    fontSize: 16,
    fontWeight: '600',
  },
  categoryLabel: {
    color: colors.textMuted,
    fontSize: 13,
    marginTop: 1,
  },
  amount: {
    color: colors.textPrimary,
    fontSize: 16,
    fontWeight: '700',
    fontVariant: ['tabular-nums'],
  },
});
