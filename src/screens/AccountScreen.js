import { useMemo } from 'react';
import { Pressable, ScrollView, StyleSheet, Text, View } from 'react-native';
import { fonts, radius, spacing, THEMES, useTheme } from '../theme';
import { LANGUAGES, useT } from '../i18n';
import { HIcon } from '../icons';

export default function AccountScreen({ settings, onUpdateSettings, accountEmail, onSignOut }) {
  const { colors } = useTheme();
  const t = useT();
  const styles = useMemo(() => createStyles(colors), [colors]);

  return (
    <ScrollView
      style={styles.container}
      contentContainerStyle={styles.content}
      showsVerticalScrollIndicator={false}
    >
      <Text style={styles.title}>{t('acct.title')}</Text>

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
  );
}

const createStyles = (colors) =>
  StyleSheet.create({
    container: {
      flex: 1,
    },
    content: {
      paddingHorizontal: spacing.md,
      paddingBottom: spacing.xl,
    },
    title: {
      color: colors.textPrimary,
      fontSize: 28,
      fontFamily: fonts.bold,
      paddingTop: spacing.md,
      textAlign: 'center',
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
      fontSize: 16,
      fontFamily: fonts.regular,
      flex: 1,
    },
    signOutText: {
      color: colors.danger,
      fontSize: 16,
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
      fontSize: 16,
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
