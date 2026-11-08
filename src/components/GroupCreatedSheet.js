import { useMemo } from 'react';
import { Pressable, ScrollView, StyleSheet, Text, View } from 'react-native';
import { useSafeAreaInsets } from 'react-native-safe-area-context';
import { fonts, radius, spacing, useTheme } from '../theme';
import { useT } from '../i18n';
import { HIcon } from '../icons';
import Sheet from './Sheet';

export default function GroupCreatedSheet({ visible, group, onAddFirstBill, onViewGroup, onClose, onDismiss }) {
  const { colors } = useTheme();
  const t = useT();
  const insets = useSafeAreaInsets();
  const styles = useMemo(() => createStyles(colors), [colors]);
  return (
    <Sheet visible={visible} onClose={onClose} onDismiss={onDismiss} showHandle sheetStyle={styles.sheet}>
      <ScrollView contentContainerStyle={[styles.content, { paddingBottom: spacing.lg + insets.bottom }]}>
        <View style={styles.header}>
          <View style={styles.successBadge} accessible={false} importantForAccessibility="no-hide-descendants">
            <HIcon name="tick-02" size={20} color={colors.success} />
          </View>
          <Text accessibilityRole="header" style={styles.title}>{t('split.groupCreated')}</Text>
          <Pressable onPress={onClose} accessibilityRole="button" accessibilityLabel={t('common.close')} style={styles.close}>
            <HIcon name="cancel-01" size={20} color={colors.icon} />
          </Pressable>
        </View>
        <Text style={styles.subtitle}>{t('split.groupCreatedSubtitle')}</Text>
        {group && <View style={styles.summary}>
          <Text style={styles.name}>{group.name}</Text>
          <Text style={styles.meta}>
            {group.currency} · {group.members.length === 1 ? t('split.memberOne') : t('split.memberCount', { count: group.members.length })}
          </Text>
        </View>}
        <Pressable onPress={onAddFirstBill} accessibilityRole="button" style={({ pressed }) => [styles.action, styles.primary, pressed && styles.pressed]}>
          <Text style={styles.primaryText}>{t('split.addFirstBill')}</Text>
        </Pressable>
        <Pressable onPress={onViewGroup} accessibilityRole="button" style={({ pressed }) => [styles.action, styles.secondary, pressed && styles.pressed]}>
          <Text style={styles.secondaryText}>{t('split.viewGroup')}</Text>
        </Pressable>
      </ScrollView>
    </Sheet>
  );
}

const createStyles = (colors) => StyleSheet.create({
  sheet: { maxHeight: '70%', paddingTop: spacing.sm },
  content: { paddingHorizontal: spacing.lg },
  header: { flexDirection: 'row', alignItems: 'center', justifyContent: 'space-between', gap: spacing.sm },
  successBadge: { width: 36, height: 36, borderRadius: 18, backgroundColor: `${colors.success}14`, alignItems: 'center', justifyContent: 'center' },
  title: { flex: 1, fontFamily: fonts.bold, fontSize: 20, color: colors.textPrimary },
  close: { width: 44, height: 44, alignItems: 'center', justifyContent: 'center' },
  subtitle: { fontFamily: fonts.regular, fontSize: 14, lineHeight: 20, color: colors.textMuted, marginTop: spacing.xs },
  summary: { backgroundColor: colors.cardPressed, borderRadius: radius.md, padding: spacing.md, marginTop: spacing.md, marginBottom: spacing.sm },
  name: { fontFamily: fonts.bold, fontSize: 18, color: colors.textPrimary },
  meta: { fontFamily: fonts.regular, fontSize: 14, color: colors.textMuted, marginTop: spacing.xs },
  action: { minHeight: 48, paddingVertical: spacing.sm, paddingHorizontal: spacing.md, borderRadius: radius.md, alignItems: 'center', justifyContent: 'center', marginTop: spacing.sm },
  primary: { backgroundColor: colors.accent },
  primaryText: { fontFamily: fonts.bold, fontSize: 16, color: colors.onAccent, textAlign: 'center' },
  secondary: { backgroundColor: colors.cardPressed },
  secondaryText: { fontFamily: fonts.bold, fontSize: 16, color: colors.textPrimary, textAlign: 'center' },
  pressed: { opacity: 0.7 },
});
