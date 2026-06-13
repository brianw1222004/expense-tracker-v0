import { useMemo } from 'react';
import { Alert, Platform, Pressable, StyleSheet, Text, View } from 'react-native';
import { fonts, radius, spacing, useTheme } from '../theme';
import { useT } from '../i18n';
import { getCategory } from '../categories';
import { formatMoney } from '../format';

export default function ExpenseRow({ expense, displayCurrency, onDelete }) {
  const { colors } = useTheme();
  const t = useT();
  const styles = useMemo(() => createStyles(colors), [colors]);
  const category = getCategory(expense.category);
  const converted = expense.currency !== displayCurrency;

  const confirmDelete = () => {
    const summary = `${expense.note || t('cat.' + category.id)} — ${formatMoney(
      expense.displayAmount,
      displayCurrency
    )}`;
    // Alert.alert with buttons is a no-op on react-native-web.
    if (Platform.OS === 'web') {
      if (window.confirm(t('list.deleteTitle') + '\n' + summary)) onDelete(expense.id);
      return;
    }
    Alert.alert(t('list.deleteTitle'), summary, [
      { text: t('common.cancel'), style: 'cancel' },
      { text: t('common.delete'), style: 'destructive', onPress: () => onDelete(expense.id) },
    ]);
  };

  return (
    <Pressable
      onPress={confirmDelete}
      onLongPress={confirmDelete}
      delayLongPress={350}
      accessibilityRole="button"
      style={({ pressed }) => [styles.row, pressed && styles.rowPressed]}
    >
      <View style={[styles.iconCircle, { backgroundColor: `${category.color}26` }]}>
        <Text style={styles.emoji}>{category.emoji}</Text>
      </View>
      <View style={styles.middle}>
        <Text style={styles.note} numberOfLines={1}>
          {expense.note || t('cat.' + category.id)}
        </Text>
        <Text style={styles.categoryLabel}>{t('cat.' + category.id)}</Text>
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
