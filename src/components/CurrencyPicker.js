import { useMemo } from 'react';
import { Modal, Pressable, ScrollView, StyleSheet, Text, View } from 'react-native';
import { fonts, popupShadow, radius, spacing, useTheme } from '../theme';
import { useT } from '../i18n';
import { CURRENCIES } from '../currency';
import { HIcon } from '../icons';

// Compact "Choose currency" popup — a small centered widget (not a full-height
// sheet) opened from a CurrencyPill anywhere a currency is decided. Each row
// shows the country flag in a circle badge, the code, and the name; tapping a
// row selects it and closes. With only a handful of currencies the list is short
// enough that no search field is needed. `value` is the currently-selected code.
export default function CurrencyPicker({ visible, value, onSelect, onClose }) {
  const { colors } = useTheme();
  const t = useT();
  const styles = useMemo(() => createStyles(colors), [colors]);

  return (
    <Modal visible={visible} animationType="fade" transparent onRequestClose={onClose}>
      <View style={styles.overlay}>
        <Pressable style={[StyleSheet.absoluteFill, styles.backdrop]} onPress={onClose} />
        <View style={styles.card}>
          <View style={styles.headerRow}>
            <Text style={styles.title}>{t('currency.choose')}</Text>
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

          <ScrollView
            keyboardShouldPersistTaps="handled"
            contentContainerStyle={styles.listContent}
            showsVerticalScrollIndicator={false}
          >
            {CURRENCIES.map((entry) => {
              const selected = entry.code === value;
              return (
                <Pressable
                  key={entry.code}
                  onPress={() => onSelect(entry.code)}
                  accessibilityRole="radio"
                  accessibilityState={{ selected }}
                  accessibilityLabel={`${entry.code} ${entry.name}`}
                  style={({ pressed }) => [
                    styles.row,
                    selected && styles.rowSelected,
                    pressed && styles.rowPressed,
                  ]}
                >
                  <View style={styles.badge}>
                    <Text style={styles.flag} numberOfLines={1}>{entry.flag}</Text>
                  </View>
                  <View style={styles.rowText}>
                    <Text style={[styles.code, selected && styles.codeSelected]}>{entry.code}</Text>
                    <Text style={styles.name} numberOfLines={1}>{entry.name}</Text>
                  </View>
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
      ...popupShadow,
    },
    headerRow: {
      flexDirection: 'row',
      alignItems: 'center',
      justifyContent: 'space-between',
      marginBottom: spacing.sm,
      paddingHorizontal: spacing.xs,
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
      backgroundColor: colors.cardPressed,
      alignItems: 'center',
      justifyContent: 'center',
    },
    closeButtonPressed: {
      opacity: 0.6,
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
    flag: {
      fontSize: 22,
      lineHeight: 28,
    },
    rowText: {
      flex: 1,
    },
    code: {
      color: colors.textPrimary,
      fontFamily: fonts.bold,
      fontSize: 16,
    },
    codeSelected: {
      color: colors.accent,
    },
    name: {
      color: colors.textMuted,
      fontFamily: fonts.regular,
      fontSize: 13,
      marginTop: 1,
    },
  });
