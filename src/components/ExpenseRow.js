import { useMemo } from 'react';
import { Pressable, StyleSheet, Text, View } from 'react-native';
import { fonts, radius, spacing, useTheme } from '../theme';
import { useT } from '../i18n';
import { getCategory, getCategoryLabel } from '../categories';
import { formatMoney } from '../format';
import { HIcon } from '../icons';

export default function ExpenseRow({ expense, displayCurrency, onRequestDelete, onEdit }) {
  const { colors } = useTheme();
  const t = useT();
  const styles = useMemo(() => createStyles(colors), [colors]);
  const category = getCategory(expense.category);
  const converted = expense.currency !== displayCurrency;

  return (
    <Pressable
      onPress={() => onEdit(expense)}
      onLongPress={() => onRequestDelete(expense)}
      delayLongPress={350}
      accessibilityRole="button"
      style={({ pressed }) => [
        styles.row,
        { backgroundColor: `${category.color}0A`, borderLeftWidth: 3, borderLeftColor: `${category.color}33` },
        pressed && styles.rowPressed,
      ]}
    >
      <View style={[styles.iconCircle, { backgroundColor: `${category.color}26` }]}>
        <HIcon name={category.emoji} size={20} color={category.color} />
      </View>
      <View style={styles.middle}>
        <Text style={styles.note} numberOfLines={1}>
          {expense.note || getCategoryLabel(category, t)}
        </Text>
        <Text style={styles.categoryLabel}>{getCategoryLabel(category, t)}</Text>
      </View>
      <View style={styles.amounts}>
        <Text style={styles.amount}>-{formatMoney(expense.displayAmount, displayCurrency)}</Text>
        {converted && (
          <Text style={styles.originalAmount}>
            {formatMoney(expense.amount, expense.currency)} {expense.currency}
          </Text>
        )}
      </View>
    </Pressable>
  );
}

const createStyles = (colors) =>
  StyleSheet.create({
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
    middle: {
      flex: 1,
      marginHorizontal: spacing.sm + 4,
    },
    note: {
      color: colors.textPrimary,
      fontSize: 16,
      fontFamily: fonts.bold,
    },
    categoryLabel: {
      color: colors.textMuted,
      fontSize: 13,
      fontFamily: fonts.regular,
      marginTop: 1,
    },
    amounts: {
      alignItems: 'flex-end',
    },
    amount: {
      color: colors.textPrimary,
      fontSize: 16,
      fontFamily: fonts.bold,
      fontVariant: ['tabular-nums'],
    },
    originalAmount: {
      color: colors.textMuted,
      fontSize: 12,
      fontFamily: fonts.regular,
      marginTop: 1,
      fontVariant: ['tabular-nums'],
    },
  });
