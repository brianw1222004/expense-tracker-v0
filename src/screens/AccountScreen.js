import { useEffect, useMemo, useState } from 'react';
import { Pressable, ScrollView, StyleSheet, Text, TextInput, View } from 'react-native';
import { useSafeAreaInsets } from 'react-native-safe-area-context';
import { fonts, radius, spacing, THEMES, useTheme } from '../theme';
import { LANGUAGES, useT } from '../i18n';
import { HIcon } from '../icons';
import Sheet from '../components/Sheet';

// Account view. Presented as a near-full (92%) bottom sheet opened by the
// floating account button — mirrors BudgetScreen's Modal/backdrop/sheet
// mechanism (the RN Modal's animationType="slide" provides the slide-up).
export default function AccountScreen({ visible, settings, onUpdateSettings, accountEmail, onSignOut, onClose }) {
  const { colors } = useTheme();
  const t = useT();
  const insets = useSafeAreaInsets();
  const styles = useMemo(() => createStyles(colors), [colors]);

  const [firstName, setFirstName] = useState(settings.firstName ?? '');
  const [lastName, setLastName] = useState(settings.lastName ?? '');

  // Re-seed the inputs whenever the sheet opens so they reflect the latest
  // saved name (set during onboarding, or on another sign-in).
  useEffect(() => {
    if (visible) {
      setFirstName(settings.firstName ?? '');
      setLastName(settings.lastName ?? '');
    }
  // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [visible]);

  // onBlur (not onEndEditing) so the commit also fires on web.
  const commitName = () => {
    const first = firstName.trim();
    const last = lastName.trim();
    setFirstName(first);
    setLastName(last);
    if (first !== (settings.firstName ?? '') || last !== (settings.lastName ?? '')) {
      onUpdateSettings({ firstName: first, lastName: last });
    }
  };

  return (
    <Sheet
      visible={visible}
      onClose={onClose}
      showHandle
      sheetStyle={styles.sheetOverride}
    >
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
            <Text style={styles.sectionHeader}>{t('acct.name')}</Text>
            <View style={styles.card}>
              <View style={styles.row}>
                <HIcon name="user-circle" size={20} color={colors.icon} />
                <TextInput
                  style={styles.nameInput}
                  value={firstName}
                  onChangeText={setFirstName}
                  onBlur={commitName}
                  placeholder={t('acct.firstName')}
                  placeholderTextColor={colors.textMuted}
                  keyboardAppearance={colors.keyboardAppearance}
                  autoCapitalize="words"
                  autoCorrect={false}
                  maxLength={40}
                  accessibilityLabel={t('acct.firstName')}
                />
              </View>
              <View style={[styles.row, styles.rowDivider]}>
                <View style={styles.nameIconSpacer} />
                <TextInput
                  style={styles.nameInput}
                  value={lastName}
                  onChangeText={setLastName}
                  onBlur={commitName}
                  placeholder={t('acct.lastName')}
                  placeholderTextColor={colors.textMuted}
                  keyboardAppearance={colors.keyboardAppearance}
                  autoCapitalize="words"
                  autoCorrect={false}
                  maxLength={40}
                  accessibilityLabel={t('acct.lastName')}
                />
              </View>
            </View>
            <Text style={styles.sectionNote}>{t('acct.nameNote')}</Text>

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
    </Sheet>
  );
}

const createStyles = (colors) =>
  StyleSheet.create({
    sheetOverride: {
      paddingHorizontal: spacing.lg,
      paddingTop: spacing.sm,
      height: '92%',
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
    nameInput: {
      flex: 1,
      color: colors.textPrimary,
      fontSize: 15,
      fontFamily: fonts.regular,
      paddingVertical: 0,
    },
    nameIconSpacer: {
      width: 20,
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
