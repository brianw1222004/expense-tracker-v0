import { useMemo } from 'react';
import { Pressable, StyleSheet, Text, View } from 'react-native';
import { fonts, spacing, useTheme } from '../theme';
import { useLanguage, useT } from '../i18n';
import { monthKeyLabel } from '../format';
import { HIcon } from '../icons';

// The centered ‹ month › selector rendered under each tab's page title
// (Dashboard, Expenses, Insight, Split Bills). Every page owns its own month
// state — selections are deliberately independent, so changing the month on
// one tab never affects another. Forward navigation caps at `currentMonthKey`.
export default function MonthSelector({ monthKey, currentMonthKey, onShift, style }) {
  const { colors } = useTheme();
  const t = useT();
  const language = useLanguage();
  const styles = useMemo(() => createStyles(colors), [colors]);
  const canGoNext = monthKey < currentMonthKey;

  return (
    <View style={[styles.row, style]}>
      <Pressable
        onPress={() => onShift(-1)}
        hitSlop={13}
        accessibilityRole="button"
        accessibilityLabel={t('add.prevMonth')}
      >
        <HIcon name="chevron-left" size={18} color={colors.icon} />
      </Pressable>
      <Text style={styles.label} numberOfLines={1}>{monthKeyLabel(monthKey, language)}</Text>
      <Pressable
        onPress={() => onShift(1)}
        disabled={!canGoNext}
        hitSlop={13}
        accessibilityRole="button"
        accessibilityLabel={t('add.nextMonth')}
        style={!canGoNext ? styles.disabled : undefined}
      >
        <HIcon name="chevron-right" size={18} color={colors.icon} />
      </Pressable>
    </View>
  );
}

const createStyles = (colors) =>
  StyleSheet.create({
    row: {
      flexDirection: 'row',
      alignItems: 'center',
      justifyContent: 'center',
      gap: spacing.sm,
    },
    label: {
      color: colors.textPrimary,
      fontFamily: fonts.bold,
      fontSize: 15,
      minWidth: 110,
      textAlign: 'center',
    },
    disabled: {
      opacity: 0.3,
    },
  });
