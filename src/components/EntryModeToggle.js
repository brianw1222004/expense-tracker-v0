import { useMemo } from 'react';
import { Pressable, StyleSheet, Text, View } from 'react-native';
import { fonts, spacing, useTheme } from '../theme';
import { useT } from '../i18n';

// The shared segmented toggle: an accent-filled pill slides between options.
// Defaults to the add popup's Personal/Shared pair; pass `options`
// ([{id, labelKey}]) for other pairs (e.g. the Dashboard chart's
// Daily/Monthly), and `compact` for the smaller card-header sizing.
const OPTIONS = [
  { id: 'personal', labelKey: 'add.personal' },
  { id: 'shared', labelKey: 'add.shared' },
];

export default function EntryModeToggle({ value, onChange, options = OPTIONS, compact }) {
  const { colors } = useTheme();
  const t = useT();
  const styles = useMemo(() => createStyles(colors), [colors]);

  return (
    <View style={styles.toggle}>
      {options.map((opt) => {
        const selected = value === opt.id;
        return (
          <Pressable
            key={opt.id}
            onPress={() => onChange(opt.id)}
            // The compact variant renders ~22pt tall — extend the tap area to
            // ~40pt without growing the visual pill.
            hitSlop={compact ? { top: 9, bottom: 9 } : undefined}
            accessibilityRole="button"
            accessibilityState={{ selected }}
            style={[styles.segment, compact && styles.segmentCompact, selected && styles.segmentSelected]}
          >
            <Text style={[styles.label, compact && styles.labelCompact, selected && styles.labelSelected]}>
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
    segmentCompact: {
      paddingHorizontal: spacing.sm + 2,
      paddingVertical: 3,
    },
    segmentSelected: {
      backgroundColor: colors.accent,
    },
    label: {
      color: colors.textSecondary,
      fontFamily: fonts.bold,
      fontSize: 14,
    },
    labelCompact: {
      fontSize: 12,
    },
    labelSelected: {
      color: colors.onAccent,
    },
  });
