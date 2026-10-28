import React, { useMemo } from 'react';
import { Pressable, StyleSheet, Text, View } from 'react-native';
import { fonts, radius, spacing, useTheme } from '../theme';
import { useT } from '../i18n';
import { getCategory, getCategoryLabel } from '../categories';
import { formatMoney } from '../format';
import { HIcon } from '../icons';
import { spendingRowInteractions } from '../spendingActivity';
import { HistoricalFxRow } from './HistoricalFxPreview';

export default React.memo(function ExpenseRow({ expense, displayCurrency, categories, groupName, onRequestDelete, onEdit, fxPreview }) {
  const { colors } = useTheme();
  const t = useT();
  const styles = useMemo(() => createStyles(colors), [colors]);
  const category = getCategory(expense.category, categories);
  const converted = expense.currency !== displayCurrency;

  const tintStyle = useMemo(() => ({
    backgroundColor: `${category.color}0A`,
    borderLeftWidth: 3,
    borderLeftColor: `${category.color}33`,
  }), [category.color]);

  const { onPress, onLongPress, accessibilityHintKey } = useMemo(
    () => spendingRowInteractions(expense, { onEdit, onRequestDelete }),
    [expense, onEdit, onRequestDelete]
  );

  const label = expense.note || getCategoryLabel(category, t);
  const sharedLabel = expense.sourceType === 'shared'
    ? groupName ? t('list.sharedWithGroup', { group: groupName }) : t('list.sharedYourShare')
    : null;

  return (
    <Pressable
      onPress={onPress}
      onLongPress={onLongPress}
      delayLongPress={350}
      accessibilityRole="button"
      accessibilityLabel={`${label}${sharedLabel ? ', ' + sharedLabel : ''}, ${formatMoney(expense.displayAmount, displayCurrency)}`}
      accessibilityHint={accessibilityHintKey ? t(accessibilityHintKey) : undefined}
      style={({ pressed }) => [
        styles.row,
        tintStyle,
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
        {sharedLabel && <Text style={styles.sharedLabel} numberOfLines={1}>{sharedLabel}</Text>}
        {__DEV__ && converted && fxPreview && <HistoricalFxRow value={fxPreview} currency={displayCurrency} />}
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
});

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
      fontSize: 15,
      fontFamily: fonts.bold,
    },
    categoryLabel: {
      color: colors.textMuted,
      fontSize: 13,
      fontFamily: fonts.regular,
      marginTop: 1,
    },
    sharedLabel: {
      color: colors.accent,
      fontSize: 12,
      fontFamily: fonts.regular,
      marginTop: 2,
    },
    amounts: {
      alignItems: 'flex-end',
    },
    amount: {
      color: colors.textPrimary,
      fontSize: 15,
      fontFamily: fonts.numBold,
      fontVariant: ['tabular-nums'],
    },
    originalAmount: {
      color: colors.textMuted,
      fontSize: 12,
      fontFamily: fonts.numRegular,
      marginTop: 1,
      fontVariant: ['tabular-nums'],
    },
  });
