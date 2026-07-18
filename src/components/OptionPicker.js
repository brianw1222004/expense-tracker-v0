import { useMemo } from 'react';
import { Modal, Pressable, ScrollView, StyleSheet, Text, View } from 'react-native';
import { fonts, radius, spacing, useTheme } from '../theme';
import { useT } from '../i18n';
import { HIcon } from '../icons';

// Generic compact centered picker popup — the same small-widget shape as
// CurrencyPicker (not a full-height sheet). Renders a titled list of options;
// tapping a row selects it and closes. Each option is { id, label, icon?,
// color? } — `color` tints the icon badge (used for categories). Suits richer
// lists than the anchored AnchorMenu: used by the Shared add form's Category
// chip and the group sheet's remove-member choice (which passes `subtitle` for
// a line of context under the title).
export default function OptionPicker({ visible, title, subtitle, options = [], value, onSelect, onClose }) {
  const { colors } = useTheme();
  const t = useT();
  const styles = useMemo(() => createStyles(colors), [colors]);

  return (
    <Modal visible={visible} animationType="fade" transparent onRequestClose={onClose}>
      <View style={styles.overlay}>
        <Pressable style={[StyleSheet.absoluteFill, styles.backdrop]} onPress={onClose} />
        <View style={styles.card}>
          <View style={styles.headerRow}>
            <Text style={styles.title} numberOfLines={1}>{title}</Text>
            <Pressable
              onPress={onClose}
              hitSlop={12}
              accessibilityRole="button"
              accessibilityLabel={t('common.close')}
              style={({ pressed }) => [styles.closeButton, pressed && styles.closeButtonPressed]}
            >
              <HIcon name="cancel-01" size={18} color={colors.icon} />
            </Pressable>
          </View>
          {subtitle ? <Text style={styles.subtitle}>{subtitle}</Text> : null}

          <ScrollView
            keyboardShouldPersistTaps="handled"
            contentContainerStyle={styles.listContent}
            showsVerticalScrollIndicator={false}
          >
            {options.map((opt) => {
              const selected = opt.id === value;
              return (
                <Pressable
                  key={opt.id}
                  onPress={() => onSelect(opt.id)}
                  accessibilityRole="radio"
                  accessibilityState={{ selected }}
                  accessibilityLabel={opt.label}
                  style={({ pressed }) => [
                    styles.row,
                    selected && styles.rowSelected,
                    pressed && styles.rowPressed,
                  ]}
                >
                  {opt.icon ? (
                    <View style={[styles.badge, opt.color ? { backgroundColor: `${opt.color}26` } : null]}>
                      <HIcon name={opt.icon} size={20} color={opt.color ?? colors.icon} />
                    </View>
                  ) : null}
                  <Text style={[styles.label, selected && styles.labelSelected]} numberOfLines={1}>{opt.label}</Text>
                </Pressable>
              );
            })}
          </ScrollView>
        </View>
      </View>
    </Modal>
  );
}

const createStyles = (colors) =>
  StyleSheet.create({
    overlay: {
      flex: 1,
      alignItems: 'center',
      justifyContent: 'center',
      padding: spacing.lg,
    },
    backdrop: {
      backgroundColor: colors.backdrop,
    },
    card: {
      width: '100%',
      maxWidth: 380,
      maxHeight: '72%',
      backgroundColor: colors.background,
      borderRadius: radius.lg,
      paddingHorizontal: spacing.md,
      paddingTop: spacing.md,
      paddingBottom: spacing.sm,
      shadowColor: '#000',
      shadowOffset: { width: 0, height: 4 },
      shadowOpacity: 0.25,
      shadowRadius: 16,
      elevation: 8,
    },
    headerRow: {
      flexDirection: 'row',
      alignItems: 'center',
      justifyContent: 'space-between',
      marginBottom: spacing.sm,
      paddingHorizontal: spacing.xs,
    },
    title: {
      flex: 1,
      color: colors.textPrimary,
      fontFamily: fonts.bold,
      fontSize: 18,
    },
    closeButton: {
      width: 30,
      height: 30,
      borderRadius: 15,
      backgroundColor: colors.cardPressed,
      alignItems: 'center',
      justifyContent: 'center',
    },
    closeButtonPressed: {
      opacity: 0.6,
    },
    subtitle: {
      color: colors.textSecondary,
      fontFamily: fonts.regular,
      fontSize: 14,
      lineHeight: 19,
      paddingHorizontal: spacing.xs,
      marginBottom: spacing.sm,
    },
    listContent: {
      paddingBottom: spacing.xs,
    },
    row: {
      flexDirection: 'row',
      alignItems: 'center',
      gap: spacing.md,
      borderRadius: radius.md,
      paddingHorizontal: spacing.sm,
      paddingVertical: spacing.sm,
      marginBottom: 2,
    },
    rowSelected: {
      backgroundColor: `${colors.accent}1A`,
    },
    rowPressed: {
      backgroundColor: colors.cardPressed,
    },
    badge: {
      width: 40,
      height: 40,
      borderRadius: 20,
      backgroundColor: colors.cardPressed,
      alignItems: 'center',
      justifyContent: 'center',
    },
    label: {
      flex: 1,
      color: colors.textPrimary,
      fontFamily: fonts.bold,
      fontSize: 16,
    },
    labelSelected: {
      color: colors.accent,
    },
  });
