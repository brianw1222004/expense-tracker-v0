import React, { useCallback, useMemo } from 'react';
import { Pressable, StyleSheet, Text, View } from 'react-native';
import { BlurView } from 'expo-blur';
import { useSafeAreaInsets } from 'react-native-safe-area-context';
import { fonts, spacing, useTheme } from '../theme';
import { useT } from '../i18n';
import { HIcon } from '../icons';

export const TAB_BAR_HEIGHT = 72;

// Four tabs plus a center "+" add button (rendered between `list` and `split`).
// The "+" is NOT a tab — it opens the add popup and doesn't change `tab`, so it
// stays out of TABS/TAB_INDEX/TAB_NAMES. The Categories tab was retired (its
// summary card moved to the Dashboard, its breakdown to a page opened from
// there). Keep this order in sync with TAB_INDEX/TAB_NAMES in App.js so the
// slide-transition direction stays correct.
const TABS = [
  { id: 'dashboard', icon: 'home-01', labelKey: 'tabs.dashboard' },
  { id: 'list', icon: 'receipt-text', labelKey: 'tabs.list' },
  { id: 'split', icon: 'user-group', labelKey: 'tabs.split' },
  { id: 'insight', icon: 'analytics-01', labelKey: 'tabs.insight' },
];

export default function TabBar({ tab, onChange, onAdd }) {
  const insets = useSafeAreaInsets();
  const { colors } = useTheme();
  const t = useT();
  const styles = useMemo(() => createStyles(colors), [colors]);

  // The "+" sits in the dead center of the bar: two tabs, the add button, two tabs.
  const half = Math.ceil(TABS.length / 2);

  const renderTab = (item) => (
    <TabItem
      key={item.id}
      styles={styles}
      colors={colors}
      icon={item.icon}
      selected={tab === item.id}
      id={item.id}
      onChange={onChange}
      label={t(item.labelKey)}
    />
  );

  return (
    <View style={[styles.outer, { paddingBottom: insets.bottom }]}>
      <View style={styles.capsule}>
        <BlurView intensity={50} tint="light" style={styles.blurLayer} />

        {TABS.slice(0, half).map(renderTab)}

        <Pressable
          onPress={onAdd}
          accessibilityRole="button"
          accessibilityLabel={t('tabs.add')}
          style={({ pressed }) => [styles.addItem, pressed && styles.addItemPressed]}
        >
          <View style={styles.addCircle}>
            <HIcon name="plus-sign" size={24} color={colors.onAccent} />
          </View>
        </Pressable>

        {TABS.slice(half).map(renderTab)}
      </View>
    </View>
  );
}

const TabItem = React.memo(function TabItem({ styles, colors, icon, selected, id, onChange, label }) {
  const handlePress = useCallback(() => onChange(id), [onChange, id]);
  return (
    <Pressable
      onPress={handlePress}
      accessibilityRole="tab"
      accessibilityState={{ selected }}
      accessibilityLabel={label}
      style={({ pressed }) => [
        styles.item,
        pressed && !selected && styles.itemPressed,
      ]}
    >
      <View style={[styles.iconPill, selected && styles.iconPillSelected]}>
        <HIcon
          name={icon}
          size={22}
          color={selected ? colors.accent : colors.textMuted}
          strokeWidth={selected ? 2 : 1.5}
        />
      </View>
      <Text style={[styles.label, selected && styles.labelSelected]} numberOfLines={1}>
        {label}
      </Text>
    </Pressable>
  );
});

const createStyles = (colors) =>
  StyleSheet.create({
    outer: {
      position: 'absolute',
      bottom: 0,
      left: 0,
      right: 0,
      paddingHorizontal: spacing.md,
      paddingTop: spacing.xs,
    },
    capsule: {
      flexDirection: 'row',
      alignItems: 'center',
      borderRadius: 32,
      height: 58,
      paddingHorizontal: spacing.sm,
      shadowColor: '#000',
      shadowOpacity: 0.2,
      shadowRadius: 16,
      shadowOffset: { width: 0, height: 4 },
      elevation: 12,
    },
    blurLayer: {
      position: 'absolute',
      top: 0,
      left: 0,
      right: 0,
      bottom: 0,
      borderRadius: 32,
      overflow: 'hidden',
      backgroundColor: 'rgba(255, 255, 255, 0.72)',
    },
    item: {
      flex: 1,
      alignItems: 'center',
      justifyContent: 'center',
      height: 48,
    },
    iconPill: {
      width: 48,
      height: 28,
      borderRadius: 14,
      alignItems: 'center',
      justifyContent: 'center',
    },
    iconPillSelected: {
      backgroundColor: `${colors.accent}15`,
    },
    label: {
      fontFamily: fonts.regular,
      fontSize: 10,
      lineHeight: 13,
      marginTop: 2,
      color: colors.textMuted,
    },
    labelSelected: {
      fontFamily: fonts.medium,
      color: colors.accent,
    },
    itemPressed: {
      opacity: 0.6,
    },
    // Center add button — a filled accent circle occupying the middle slot.
    addItem: {
      flex: 1,
      alignItems: 'center',
      justifyContent: 'center',
      height: 44,
    },
    addItemPressed: {
      opacity: 0.85,
    },
    addCircle: {
      width: 46,
      height: 46,
      borderRadius: 23,
      backgroundColor: colors.accent,
      alignItems: 'center',
      justifyContent: 'center',
      shadowColor: '#000',
      shadowOpacity: 0.2,
      shadowRadius: 6,
      shadowOffset: { width: 0, height: 2 },
      elevation: 6,
    },
  });
