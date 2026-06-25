import React, { useCallback, useMemo } from 'react';
import { Pressable, StyleSheet, View } from 'react-native';
import { BlurView } from 'expo-blur';
import { useSafeAreaInsets } from 'react-native-safe-area-context';
import { spacing, useTheme } from '../theme';
import { useT } from '../i18n';
import { HIcon } from '../icons';

export const TAB_BAR_HEIGHT = 72;

// Five tabs since the add "+" moved to a floating button (App.js). `split` sits
// between Categories and Balance — keep this order in sync with TAB_INDEX/
// TAB_NAMES in App.js so the slide-transition direction stays correct.
const TABS = [
  { id: 'dashboard', icon: 'home-01', labelKey: 'tabs.dashboard' },
  { id: 'list', icon: 'receipt-text', labelKey: 'tabs.list' },
  { id: 'categories', icon: 'grid-view', labelKey: 'tabs.categories' },
  { id: 'split', icon: 'user-group', labelKey: 'tabs.split' },
  { id: 'balance', icon: 'wallet-01', labelKey: 'tabs.balance' },
];

export default function TabBar({ tab, onChange }) {
  const insets = useSafeAreaInsets();
  const { colors } = useTheme();
  const t = useT();
  const styles = useMemo(() => createStyles(colors), [colors]);

  return (
    <View style={[styles.outer, { paddingBottom: insets.bottom }]}>
      <View style={styles.capsule}>
        <BlurView intensity={50} tint="light" style={styles.blurLayer} />

        {TABS.map((item) => (
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
        ))}
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
      height: 44,
    },
    iconPill: {
      width: 52,
      height: 34,
      borderRadius: 17,
      alignItems: 'center',
      justifyContent: 'center',
    },
    iconPillSelected: {
      backgroundColor: `${colors.accent}15`,
    },
    itemPressed: {
      opacity: 0.6,
    },
  });
