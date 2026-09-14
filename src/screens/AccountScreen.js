import { useMemo } from 'react';
import { Pressable, ScrollView, StyleSheet, Text, View } from 'react-native';
import { useSafeAreaInsets } from 'react-native-safe-area-context';
import { fonts, radius, spacing, THEMES, useTheme } from '../theme';
import { LANGUAGES, useT } from '../i18n';
import { HIcon } from '../icons';
import Sheet from '../components/Sheet';

// Account view. A bottom sheet opened by the floating account button — mirrors
// BudgetScreen's Modal/backdrop/sheet mechanism (the RN Modal's
// animationType="slide" provides the slide-up). Its height follows the content
// and is only capped at 92% (see sheetOverride), so the sheet grows and shrinks
// with the settings list instead of always filling the screen.
// The account card leads the sheet with no section header of its own (the page
// title already says "Account"); Language and Theme get iconized uppercase
// headers over cards of `SelectRow`s.
export default function AccountScreen({ visible, settings, onUpdateSettings, accountEmail, onSignOut, onDeleteAllData, deletingData = false, interactionLocked = false, deleteDisabled = false, onClose }) {
  const { colors } = useTheme();
  const t = useT();
  const insets = useSafeAreaInsets();
  const styles = useMemo(() => createStyles(colors), [colors]);
  // App blocks close/settings taps for the whole deletion window (confirmation
  // and any failure alert included), so the chrome must look inert for that
  // window, not only while cleanup runs.
  const locked = deletingData || interactionLocked;

  // The selected index drives the divider rule as well as the pill: a hairline
  // is drawn only BETWEEN two unselected rows, so nothing crowds the capsule.
  const themes = Object.values(THEMES);
  const languageIndex = LANGUAGES.findIndex((entry) => entry.code === settings.language);
  const themeIndex = themes.findIndex((theme) => theme.name === settings.theme);

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
              disabled={locked}
              hitSlop={12}
              accessibilityRole="button"
              accessibilityLabel={t('common.close')}
              style={({ pressed }) => [styles.closeButton, pressed && styles.closeButtonPressed]}
            >
              <HIcon name="cancel-01" size={20} color={colors.icon} />
            </Pressable>
          </View>

          <ScrollView
            pointerEvents={locked ? 'none' : 'auto'}
            contentContainerStyle={{ paddingBottom: spacing.xl + insets.bottom }}
            showsVerticalScrollIndicator={false}
          >
            {accountEmail ? (
              <>
                {/* No "Account" header: the sheet title already says it, and
                    the card sits tight under the title. */}
                <View style={[styles.card, styles.firstCard]}>
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
                <View style={[styles.card, styles.firstCard]}>
                  <View style={styles.row}>
                    <HIcon name="user-circle" size={20} color={colors.icon} />
                    <Text style={styles.rowLabel}>{t('acct.localTitle')}</Text>
                  </View>
                </View>
                <Text style={styles.sectionNote}>{t('acct.localNote')}</Text>
              </>
            )}

            <SectionHeader icon="global" label={t('acct.language')} styles={styles} colors={colors} />
            <View style={styles.card}>
              {LANGUAGES.map((entry, index) => (
                <SelectRow
                  key={entry.code}
                  // Each language shows its OWN name (never translated), so a user
                  // stuck in the wrong language can still find their way back.
                  label={entry.label}
                  selected={index === languageIndex}
                  divider={index > 0 && index !== languageIndex && index - 1 !== languageIndex}
                  onPress={() => onUpdateSettings({ language: entry.code })}
                  styles={styles}
                  colors={colors}
                />
              ))}
            </View>

            <SectionHeader icon="paint-board" label={t('acct.theme')} styles={styles} colors={colors} />
            <View style={styles.card}>
              {themes.map((theme, index) => (
                <SelectRow
                  key={theme.name}
                  label={t('theme.' + theme.name)}
                  selected={index === themeIndex}
                  divider={index > 0 && index !== themeIndex && index - 1 !== themeIndex}
                  onPress={() => onUpdateSettings({ theme: theme.name })}
                  leading={<View style={[styles.themeDot, { backgroundColor: theme.accent }]} />}
                  styles={styles}
                  colors={colors}
                />
              ))}
            </View>

            {/* The scope warning (device only vs. device + synced account)
                lives in the confirmation popup, not under the button. */}
            <View style={[styles.card, styles.deleteCard]}>
              <Pressable
                onPress={onDeleteAllData}
                disabled={locked || deleteDisabled}
                accessibilityRole="button"
                accessibilityLabel={t('acct.deleteData')}
                accessibilityState={{ disabled: locked || deleteDisabled, busy: deletingData }}
                style={({ pressed }) => [styles.row, pressed && styles.rowPressed, (locked || deleteDisabled) && { opacity: 0.5 }]}
              >
                <Text style={styles.deleteDataText}>{t(deletingData ? 'acct.deletingData' : 'acct.deleteData')}</Text>
              </Pressable>
            </View>
          </ScrollView>
    </Sheet>
  );
}

// A settings section header: a small muted icon beside an uppercase,
// letter-spaced label sitting above the section's card.
function SectionHeader({ icon, label, styles, colors }) {
  return (
    <View style={styles.sectionHeaderRow}>
      <HIcon name={icon} size={14} color={colors.textSecondary} strokeWidth={2} />
      <Text style={styles.sectionHeader}>{label}</Text>
    </View>
  );
}

// One option in a settings card (language, theme). The picked option reads as a
// rounded accent-tinted CAPSULE floating inside the card — bold label plus a
// SOLID accent tick badge — rather than the old full-bleed tinted band; unpicked
// options stay plain. The badge (white ✓ on accent) is what makes the state read
// as chosen: a bare hairline tick on a pale tint looked washed out. `leading`
// takes an optional glyph (the theme swatch), and `divider` is decided by the
// caller so no hairline ever butts against the capsule.
function SelectRow({ label, selected, divider, onPress, leading, styles, colors }) {
  return (
    <Pressable
      onPress={onPress}
      accessibilityRole="radio"
      accessibilityState={{ selected }}
      accessibilityLabel={label}
      style={({ pressed }) => [
        styles.row,
        divider && styles.rowDivider,
        selected && styles.rowSelected,
        pressed && (selected ? styles.rowSelectedPressed : styles.rowPressed),
      ]}
    >
      {leading}
      <Text style={[styles.rowLabel, selected && styles.rowLabelSelected]} numberOfLines={1}>
        {label}
      </Text>
      {selected && (
        <View style={styles.tickBadge}>
          <HIcon name="tick-02" size={15} color={colors.onAccent} strokeWidth={3} />
        </View>
      )}
    </Pressable>
  );
}

// The selected capsule is inset from the card edge by this much; its horizontal
// padding drops by the same amount so labels stay aligned with unselected rows.
const SELECT_INSET = 6;

const createStyles = (colors) =>
  StyleSheet.create({
    // maxHeight, not height: the sheet hugs whatever the settings list actually
    // measures (today that's roughly two thirds of the screen) and only starts
    // scrolling once it would pass 92% — so adding or removing sections here
    // never leaves a slab of empty sheet under the last card.
    sheetOverride: {
      paddingHorizontal: spacing.lg,
      paddingTop: spacing.sm,
      maxHeight: '92%',
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
    sectionHeaderRow: {
      flexDirection: 'row',
      alignItems: 'center',
      gap: spacing.xs + 2,
      marginTop: spacing.lg,
      marginBottom: spacing.sm,
      paddingHorizontal: spacing.xs,
    },
    sectionHeader: {
      color: colors.textSecondary,
      fontSize: 12,
      fontFamily: fonts.bold,
      letterSpacing: 1,
      textTransform: 'uppercase',
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
    // The account card leads the sheet, so it sits just under the title (the
    // "Account" section header it used to hang below was redundant with it).
    firstCard: {
      marginTop: spacing.xs,
    },
    deleteCard: {
      marginTop: spacing.lg,
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
    // The selected option (language/theme) is a rounded accent-tinted capsule
    // FLOATING inside the card — a softer tint and a rounder, better-inset shape
    // than the old near-full-bleed 12% wash, which read as a smudge behind the
    // label. Contrast now comes from the solid tick badge, not the fill.
    rowSelected: {
      backgroundColor: `${colors.accent}14`,
      borderRadius: radius.sm + 4,
      marginHorizontal: SELECT_INSET,
      marginVertical: SELECT_INSET - 2,
      paddingHorizontal: spacing.md - SELECT_INSET,
      // margin + padding == an unselected row's padding, so the card's height
      // doesn't jump as the selection moves between rows.
      paddingVertical: spacing.sm,
    },
    rowSelectedPressed: {
      backgroundColor: `${colors.accent}29`,
    },
    // Solid accent disc with a white ✓ — the anchor the selected row reads from.
    tickBadge: {
      width: 22,
      height: 22,
      borderRadius: 11,
      backgroundColor: colors.accent,
      alignItems: 'center',
      justifyContent: 'center',
    },
    rowLabel: {
      color: colors.textPrimary,
      fontSize: 15,
      fontFamily: fonts.regular,
      flex: 1,
    },
    rowLabelSelected: {
      color: colors.accentDark,
      fontFamily: fonts.bold,
    },
    signOutText: {
      color: colors.danger,
      fontSize: 15,
      fontFamily: fonts.bold,
    },
    deleteDataText: {
      color: colors.danger,
      fontSize: 15,
      fontFamily: fonts.bold,
    },
    themeDot: {
      width: 24,
      height: 24,
      borderRadius: 12,
      marginRight: spacing.sm,
    },
  });
