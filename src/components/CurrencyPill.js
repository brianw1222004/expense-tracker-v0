import { useMemo } from 'react';
import { Pressable, StyleSheet, Text } from 'react-native';
import { fonts, spacing, useTheme } from '../theme';
import { getCurrency } from '../currency';

// Compact currency trigger — a rounded pill showing the current currency code in
// the accent color. Tapping opens the shared CurrencyPicker popup. Used anywhere
// a currency is decided. `style` tweaks the pill container; `textStyle` lets a
// caller scale the code text (e.g. a larger header variant).
export default function CurrencyPill({ value, onPress, accessibilityLabel, style, textStyle }) {
  const { colors } = useTheme();
  const styles = useMemo(() => createStyles(colors), [colors]);
  const code = getCurrency(value).code;

  return (
    <Pressable
      onPress={onPress}
      accessibilityRole="button"
      accessibilityLabel={accessibilityLabel}
      style={({ pressed }) => [styles.pill, pressed && styles.pillPressed, style]}
    >
      <Text style={[styles.code, textStyle]}>{code}</Text>
    </Pressable>
  );
}

const createStyles = (colors) =>
  StyleSheet.create({
    // Soft accent-tinted fill, fully rounded, no shadow — the "New group" pill
    // family shared by every card-header pill across the app.
    pill: {
      alignSelf: 'flex-start',
      backgroundColor: `${colors.accent}15`,
      borderRadius: 14,
      paddingHorizontal: spacing.sm + 2,
      paddingVertical: spacing.xs + 1,
    },
    pillPressed: {
      opacity: 0.6,
    },
    code: {
      color: colors.accent,
      fontFamily: fonts.bold,
      fontSize: 11.5,
      letterSpacing: 0.4,
    },
  });
