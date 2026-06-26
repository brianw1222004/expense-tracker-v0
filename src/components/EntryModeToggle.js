import { useMemo } from 'react';
import { Pressable, StyleSheet, Text, View } from 'react-native';
import { fonts, spacing, useTheme } from '../theme';
import { useT } from '../i18n';

// Personal / Shared segmented toggle shown in the add popup header (mirrors the
// retired Expense/Income toggle). `value` is 'personal' | 'shared'; switching
// swaps which form the popup renders (personal expense vs. shared split bill).
const OPTIONS = [
  { id: 'personal', labelKey: 'add.personal' },
  { id: 'shared', labelKey: 'add.shared' },
];

export default function EntryModeToggle({ value, onChange }) {
  const { colors } = useTheme();
  const t = useT();
  const styles = useMemo(() => createStyles(colors), [colors]);

  return (
    <View style={styles.toggle}>
      {OPTIONS.map((opt) => {
        const selected = value === opt.id;
        return (
          <Pressable
            key={opt.id}
            onPress={() => onChange(opt.id)}
            accessibilityRole="button"
            accessibilityState={{ selected }}
            style={[styles.segment, selected && styles.segmentSelected]}
          >
            <Text style={[styles.label, selected && styles.labelSelected]}>
              {t(opt.labelKey)}
            </Text>
          </Pressable>
        );
      })}
    </View>
  );
}

const createStyles = (colors) =>
  StyleSheet.create({
    toggle: {
      flexDirection: 'row',
      backgroundColor: colors.cardPressed,
      borderRadius: 12,
      padding: 3,
    },
    segment: {
      paddingHorizontal: spacing.md,
      paddingVertical: spacing.xs + 2,
      borderRadius: 9,
    },
    segmentSelected: {
      backgroundColor: colors.accent,
    },
    label: {
      color: colors.textSecondary,
      fontFamily: fonts.bold,
      fontSize: 14,
    },
    labelSelected: {
      color: colors.onAccent,
    },
  });
