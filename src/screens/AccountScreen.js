import { useMemo } from 'react';
import { Modal, Pressable, ScrollView, StyleSheet, Text, View } from 'react-native';
import { useSafeAreaInsets } from 'react-native-safe-area-context';
import { fonts, radius, spacing, THEMES, useTheme } from '../theme';
import { LANGUAGES, useT } from '../i18n';
import { HIcon } from '../icons';

// Account view. Presented as a near-full (92%) bottom sheet opened by the
// floating account button — mirrors BudgetScreen's Modal/backdrop/sheet
// mechanism (the RN Modal's animationType="slide" provides the slide-up).
export default function AccountScreen({ visible, settings, onUpdateSettings, accountEmail, onSignOut, onClose }) {
  const { colors } = useTheme();
  const t = useT();
  const insets = useSafeAreaInsets();
  const styles = useMemo(() => createStyles(colors), [colors]);

  return (
    <Modal visible={visible} animationType="slide" transparent onRequestClose={onClose}>
      <View style={styles.overlay}>
        <Pressable style={[StyleSheet.absoluteFill, styles.backdrop]} onPress={onClose} />
        <View style={styles.sheet}>
          <View style={styles.handle} />
          <View style={styles.titleRow}>
            <Text style={styles.title}>{t('acct.title')}</Text>
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
            contentContainerStyle={{ paddingBottom: spacing.xl + insets.bottom }}
            showsVerticalScrollIndicator={false}
          >
            <Text style={styles.sectionHeader}>{t('acct.section')}</Text>
            {accountEmail ? (
              <>
                <View style={styles.card}>
                  <View style={styles.row}>
                    <HIcon name="user-circle" size={20} color={colors.icon} />
                    <Text style={styles.rowLabel} numberOfLines={1}>
                      {accountEmail}
                    </Text>
                  </View>
                  <Pressable
                    onPress={onSignOut}
                    accessibilityRole="button"
                    accessibilityLabel={t('acct.signOut')}
                    style={({ pressed }) => [styles.row, styles.rowDivider, pressed && styles.rowPressed]}
                  >
                    <Text style={styles.signOutText}>{t('acct.signOut')}</Text>
                  </Pressable>
                </View>
                <Text style={styles.sectionNote}>{t('acct.syncedNote')}</Text>
              </>
            ) : (
              <>
                <View style={styles.card}>
                  <View style={styles.row}>
                    <HIcon name="user-circle" size={20} color={colors.icon} />
                    <Text style={styles.rowLabel}>{t('acct.localTitle')}</Text>
                  </View>
                </View>
                <Text style={styles.sectionNote}>{t('acct.localNote')}</Text>
              </>
            )}

            <Text style={styles.sectionHeader}>{t('acct.language')}</Text>
            <View style={styles.card}>
              {LANGUAGES.map((entry, index) => {
                const selected = settings.language === entry.code;
                return (
                  <Pressable
                    key={entry.code}
                    onPress={() => onUpdateSettings({ language: entry.code })}
                    accessibilityRole="radio"
                    accessibilityState={{ selected }}
                    // Each language shows its OWN name (never translated), so a user
                    // stuck in the wrong language can still find their way back.
                    accessibilityLabel={entry.label}
                    style={({ pressed }) => [
                      styles.row,
                      index > 0 && styles.rowDivider,
                      pressed && styles.rowPressed,
                    ]}
                  >
                    <Text style={styles.rowLabel}>{entry.label}</Text>
                    {selected && <HIcon name="tick-01" size={16} color={colors.accent} />}
                  </Pressable>
                );
              })}
            </View>

            <Text style={styles.sectionHeader}>{t('acct.theme')}</Text>
            <View style={styles.card}>
              {Object.values(THEMES).map((theme, index) => {
                const selected = settings.theme === theme.name;
                return (
                  <Pressable
                    key={theme.name}
                    onPress={() => onUpdateSettings({ theme: theme.name })}
                    accessibilityRole="radio"
                    accessibilityState={{ selected }}
                    style={({ pressed }) => [
                      styles.row,
                      index > 0 && styles.rowDivider,
                      pressed && styles.rowPressed,
                    ]}
                  >
                    <View style={[styles.themeDot, { backgroundColor: theme.accent }]} />
                    <Text style={styles.rowLabel}>{t('theme.' + theme.name)}</Text>
                    {selected && <HIcon name="tick-01" size={16} color={colors.accent} />}
                  </Pressable>
                );
              })}
            </View>

            <Text style={styles.sectionHeader}>{t('acct.comingSoon')}</Text>
            <View style={styles.card}>
              <View style={styles.row}>
                <HIcon name="user-circle" size={20} color={colors.icon} />
                <Text style={styles.comingSoonLabel}>{t('acct.exportCsv')}</Text>
                <Text style={styles.comingSoonTag}>{t('acct.soon')}</Text>
              </View>
            </View>
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
      justifyContent: 'flex-end',
    },
    backdrop: {
      backgroundColor: colors.backdrop,
    },
    sheet: {
      backgroundColor: colors.background,
      borderTopLeftRadius: radius.lg,
      borderTopRightRadius: radius.lg,
      paddingHorizontal: spacing.lg,
      paddingTop: spacing.sm,
      height: '92%',
      borderWidth: colors.widgetBorderWidth,
      borderColor: colors.widgetBorderColor,
      shadowColor: '#000',
      shadowOffset: { width: 0, height: -2 },
      shadowOpacity: 0.3,
      shadowRadius: 8,
      elevation: 3,
    },
    handle: {
      alignSelf: 'center',
      width: 36,
      height: 4,
      borderRadius: 2,
      backgroundColor: colors.border,
      marginBottom: spacing.sm,
    },
    titleRow: {
      flexDirection: 'row',
      justifyContent: 'space-between',
      alignItems: 'center',
      marginBottom: spacing.sm,
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
    sectionHeader: {
      color: colors.textSecondary,
      fontSize: 13,
      fontFamily: fonts.bold,
      textTransform: 'uppercase',
      letterSpacing: 1.2,
      marginTop: spacing.lg,
      marginBottom: spacing.sm,
    },
    sectionNote: {
      color: colors.textMuted,
      fontSize: 13,
      fontFamily: fonts.regular,
      lineHeight: 18,
      marginTop: spacing.sm,
    },
    card: {
      backgroundColor: colors.card,
      borderRadius: radius.md,
      overflow: 'hidden',
      borderWidth: colors.widgetBorderWidth,
      borderColor: colors.widgetBorderColor,
    },
    row: {
      flexDirection: 'row',
      alignItems: 'center',
      paddingHorizontal: spacing.md,
      paddingVertical: spacing.sm + 4,
      gap: 8,
    },
    rowDivider: {
      borderTopWidth: StyleSheet.hairlineWidth,
      borderTopColor: colors.border,
    },
    rowPressed: {
      backgroundColor: colors.cardPressed,
    },
    rowLabel: {
      color: colors.textPrimary,
      fontSize: 15,
      fontFamily: fonts.regular,
      flex: 1,
    },
    signOutText: {
      color: colors.danger,
      fontSize: 15,
      fontFamily: fonts.bold,
    },
    themeDot: {
      width: 20,
      height: 20,
      borderRadius: 10,
      marginRight: spacing.sm + 4,
    },
    comingSoonLabel: {
      color: colors.textMuted,
      fontSize: 15,
      fontFamily: fonts.regular,
      flex: 1,
    },
    comingSoonTag: {
      color: colors.textMuted,
      fontSize: 12,
      fontFamily: fonts.bold,
      textTransform: 'uppercase',
      letterSpacing: 0.8,
      backgroundColor: colors.background,
      borderRadius: radius.sm,
      paddingHorizontal: spacing.sm,
      paddingVertical: 3,
    },
  });
