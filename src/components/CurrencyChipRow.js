import { useMemo } from 'react';
import { Pressable, ScrollView, StyleSheet, Text } from 'react-native';
import { fonts, spacing, useTheme } from '../theme';
import { CURRENCIES } from '../currency';

// Horizontal, always-visible row of currency chips (the supported CURRENCIES).
// Shared by the Personal (AddEntryScreen) and Shared (SharedSplitForm) add forms.
// `value` is the selected code; `onSelect` receives the tapped code.
export default function CurrencyChipRow({ value, onSelect }) {
  const { colors } = useTheme();
  const styles = useMemo(() => createStyles(colors), [colors]);
  return (
    <ScrollView
      horizontal
      showsHorizontalScrollIndicator={false}
      style={styles.scroll}
      contentContainerStyle={styles.row}
      keyboardShouldPersistTaps="handled"
    >
      {CURRENCIES.map((option) => {
        const selected = option.code === value;
        return (
          <Pressable
            key={option.code}
            onPress={() => onSelect(option.code)}
            accessibilityRole="button"
            accessibilityState={{ selected }}
            style={({ pressed }) => [
              styles.chip,
              selected && styles.chipSelected,
              pressed && !selected && styles.chipPressed,
            ]}
          >
            <Text style={[styles.chipText, selected && styles.chipTextSelected]}>
              {option.symbol} {option.code}
            </Text>
          </Pressable>
        );
      })}
    </ScrollView>
  );
}

const createStyles = (colors) =>
  StyleSheet.create({
    scroll: {
      marginBottom: spacing.md,
      flexGrow: 0,
    },
    row: {
      flexDirection: 'row',
      justifyContent: 'center',
      gap: spacing.xs,
      flexGrow: 1,
    },
    chip: {
      backgroundColor: colors.card,
      borderRadius: 16,
      borderWidth: 1,
      borderColor: 'transparent',
      paddingHorizontal: spacing.sm,
      paddingVertical: spacing.xs,
    },
    chipSelected: {
      backgroundColor: `${colors.accent}33`,
      borderColor: colors.accent,
    },
    chipPressed: {
      backgroundColor: colors.cardPressed,
    },
    chipText: {
      color: colors.textSecondary,
      fontFamily: fonts.bold,
      fontSize: 13,
    },
    chipTextSelected: {
      color: colors.textPrimary,
    },
  });
