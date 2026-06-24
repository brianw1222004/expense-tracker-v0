import { useMemo } from 'react';
import { Pressable, StyleSheet, Text, View } from 'react-native';
import { fonts, spacing, useTheme } from '../theme';
import { useT } from '../i18n';

// Segmented pill that switches the add popup between expense and income entry.
// Sits centered in the add card header (only in add mode, not edit). The active
// segment is tinted with the theme `accent` color in both modes so the income
// form mimics the look of the primary expense form.
const SEGMENTS = [
  { key: 'expense', labelKey: 'add.typeExpense', colorKey: 'accent' },
  { key: 'income', labelKey: 'add.typeIncome', colorKey: 'accent' },
];

export default function EntryTypeToggle({ mode, onChange }) {
  const { colors } = useTheme();
  const t = useT();
  const styles = useMemo(() => createStyles(colors), [colors]);

  return (
    <View style={styles.toggle} accessibilityRole="tablist">
      {SEGMENTS.map((segment) => {
        const active = segment.key === mode;
        return (
          <Pressable
            key={segment.key}
            onPress={() => {
              if (segment.key !== mode) onChange(segment.key);
            }}
            accessibilityRole="tab"
            accessibilityState={{ selected: active }}
            style={({ pressed }) => [
              styles.segment,
              active && { backgroundColor: colors[segment.colorKey] },
              pressed && !active && styles.segmentPressed,
            ]}
          >
            <Text style={[styles.segmentText, active && styles.segmentTextActive]}>
              {t(segment.labelKey)}
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
      backgroundColor: colors.card,
      borderRadius: 999,
      padding: 3,
    },
    segment: {
      paddingHorizontal: spacing.md,
      paddingVertical: spacing.xs + 1,
      borderRadius: 999,
    },
    segmentPressed: {
      backgroundColor: colors.cardPressed,
    },
    segmentText: {
      color: colors.textMuted,
      fontFamily: fonts.bold,
      fontSize: 13,
    },
    segmentTextActive: {
      color: colors.onAccent,
    },
  });
