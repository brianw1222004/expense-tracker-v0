import { useMemo } from 'react';
import { Pressable, StyleSheet, Text, View } from 'react-native';
import { TAB_BAR_HEIGHT } from './TabBar';
import { fonts, radius, spacing } from '../theme';
import { HIcon } from '../icons';

export default function EmptyState({ onAdd, onLoadDemo, colors, t, hintKey = 'empty.hint' }) {
  const styles = useMemo(() => createStyles(colors), [colors]);
  return (
    <View style={[styles.container, styles.emptyState]}>
      <HIcon name="circle-dashed" size={48} color={colors.icon} />
      <Text style={styles.emptyTitle}>{t('empty.title')}</Text>
      <Text style={styles.emptyHint}>{t(hintKey)}</Text>
      <Pressable
        onPress={onAdd}
        accessibilityRole="button"
        style={({ pressed }) => [styles.addFirstButton, pressed && styles.addFirstButtonPressed]}
      >
        <Text style={styles.addFirstButtonText}>{t('empty.addFirst')}</Text>
      </Pressable>
      <Pressable onPress={onLoadDemo} accessibilityRole="button" hitSlop={8}>
        <Text style={styles.demoLink}>{t('empty.loadDemo')}</Text>
      </Pressable>
    </View>
  );
}

const createStyles = (colors) =>
  StyleSheet.create({
    container: {
      flex: 1,
    },
    emptyState: {
      alignItems: 'center',
      justifyContent: 'center',
      paddingHorizontal: spacing.xl,
      paddingBottom: TAB_BAR_HEIGHT,
    },
    emptyTitle: {
      color: colors.textPrimary,
      fontFamily: fonts.bold,
      fontSize: 18,
      marginTop: 12,
    },
    emptyHint: {
      color: colors.textSecondary,
      fontFamily: fonts.regular,
      fontSize: 14,
      textAlign: 'center',
      marginTop: spacing.sm,
      lineHeight: 21,
    },
    addFirstButton: {
      backgroundColor: colors.accent,
      borderRadius: radius.md,
      paddingHorizontal: spacing.lg,
      paddingVertical: spacing.sm + 4,
      marginTop: spacing.lg,
      minHeight: 48,
      alignItems: 'center',
      justifyContent: 'center',
    },
    addFirstButtonPressed: {
      backgroundColor: colors.accentDark,
    },
    addFirstButtonText: {
      color: colors.onAccent,
      fontFamily: fonts.bold,
      fontSize: 15,
    },
    demoLink: {
      color: colors.textMuted,
      fontFamily: fonts.regular,
      fontSize: 13,
      marginTop: spacing.md,
    },
  });
