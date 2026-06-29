import { useMemo } from 'react';
import { Pressable, ScrollView, StyleSheet, Text, View } from 'react-native';
import { useSafeAreaInsets } from 'react-native-safe-area-context';
import { fonts, radius, spacing, useTheme } from '../theme';
import { useT } from '../i18n';
import { GROUP_ICONS } from '../splits';
import Sheet from './Sheet';
import { HIcon } from '../icons';

// A dedicated full-page picker for a group's icon avatar. A roomy wrapped grid
// of GROUP_ICONS (minimal hugeicon glyphs); tapping one selects it and closes
// the sheet. Presented over the create/detail sheet so it reads as its own page.
export default function IconPickerSheet({ visible, value, onSelect, onClose }) {
  const { colors } = useTheme();
  const t = useT();
  const insets = useSafeAreaInsets();
  const styles = useMemo(() => createStyles(colors), [colors]);

  return (
    <Sheet visible={visible} onClose={onClose} showHandle sheetStyle={styles.sheetOverride}>
      <View style={styles.titleRow}>
        <Text style={styles.title}>{t('split.chooseIcon')}</Text>
        <Pressable
          onPress={onClose}
          hitSlop={12}
          accessibilityRole="button"
          accessibilityLabel={t('common.close')}
          style={({ pressed }) => [styles.closeButton, pressed && styles.closeButtonPressed]}
        >
          <HIcon name="cancel-01" size={20} color={colors.icon} />
        </Pressable>
      </View>

      <ScrollView
        contentContainerStyle={[styles.grid, { paddingBottom: spacing.xl + insets.bottom }]}
        showsVerticalScrollIndicator={false}
      >
        {GROUP_ICONS.map((name) => {
          const selected = name === value;
          return (
            <Pressable
              key={name}
              onPress={() => {
                onSelect(name);
                onClose();
              }}
              accessibilityRole="button"
              accessibilityLabel={name.replace(/-\d+$/, '').replace(/-/g, ' ')}
              accessibilityState={{ selected }}
              style={({ pressed }) => [
                styles.cell,
                selected && styles.cellSelected,
                pressed && styles.cellPressed,
              ]}
            >
              <HIcon name={name} size={26} color={selected ? colors.accent : colors.icon} />
            </Pressable>
          );
        })}
      </ScrollView>
    </Sheet>
  );
}

const createStyles = (colors) =>
  StyleSheet.create({
    sheetOverride: {
      paddingHorizontal: spacing.lg,
      paddingTop: spacing.sm,
      maxHeight: '70%',
    },
    titleRow: {
      flexDirection: 'row',
      justifyContent: 'space-between',
      alignItems: 'center',
      marginBottom: spacing.md,
    },
    title: {
      color: colors.textPrimary,
      fontFamily: fonts.bold,
      fontSize: 18,
    },
    closeButton: {
      width: 30,
      height: 30,
      borderRadius: 15,
      backgroundColor: colors.card,
      alignItems: 'center',
      justifyContent: 'center',
    },
    closeButtonPressed: {
      backgroundColor: colors.cardPressed,
    },
    grid: {
      flexDirection: 'row',
      flexWrap: 'wrap',
      gap: spacing.sm + 2,
      justifyContent: 'center',
    },
    cell: {
      width: 52,
      height: 52,
      borderRadius: 26,
      backgroundColor: colors.card,
      borderWidth: 2,
      borderColor: 'transparent',
      alignItems: 'center',
      justifyContent: 'center',
    },
    cellSelected: {
      borderColor: colors.accent,
      backgroundColor: `${colors.accent}1A`,
    },
    cellPressed: {
      backgroundColor: colors.cardPressed,
    },
  });
