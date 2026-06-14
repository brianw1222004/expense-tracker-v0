import { useMemo } from 'react';
import { Pressable, StyleSheet, Text, View } from 'react-native';
import { useSafeAreaInsets } from 'react-native-safe-area-context';
import { fonts, spacing, useTheme } from '../theme';
import { useT } from '../i18n';
import { HIcon } from '../icons';

// Content height of the bar; the rendered bar additionally pads the safe-area
// bottom inset. Screens use this constant to keep content clear of the bar.
export const TAB_BAR_HEIGHT = 64;

const TABS_LEFT = [
  { id: 'dashboard', icon: 'home-01', labelKey: 'tabs.dashboard' },
  { id: 'list', icon: 'receipt-text', labelKey: 'tabs.expenses' },
];
const TABS_RIGHT = [
  { id: 'categories', icon: 'grid-view', labelKey: 'tabs.categories' },
  { id: 'account', icon: 'user-circle', labelKey: 'tabs.account' },
];

export default function TabBar({ tab, onChange, onAddPress, addActive }) {
  const insets = useSafeAreaInsets();
  const { colors } = useTheme();
  const t = useT();
  const styles = useMemo(() => createStyles(colors), [colors]);

  return (
    <View
      style={[
        styles.bar,
        { height: TAB_BAR_HEIGHT + insets.bottom, paddingBottom: insets.bottom },
      ]}
    >
      {TABS_LEFT.map((item) => (
        <TabItem
          key={item.id}
          styles={styles}
          label={t(item.labelKey)}
          icon={item.icon}
          selected={tab === item.id}
          onPress={() => onChange(item.id)}
        />
      ))}

      <View style={styles.addSlot}>
        <Pressable
          onPress={onAddPress}
          accessibilityRole="button"
          accessibilityLabel={t('tabs.add')}
          accessibilityState={{ expanded: addActive }}
          style={({ pressed }) => [styles.addButton, pressed && styles.addButtonPressed]}
        >
          <View style={styles.plusIcon}>
            <View style={styles.plusBarH} />
            <View style={styles.plusBarV} />
          </View>
        </Pressable>
      </View>

      {TABS_RIGHT.map((item) => (
        <TabItem
          key={item.id}
          styles={styles}
          label={t(item.labelKey)}
          icon={item.icon}
          selected={tab === item.id}
          onPress={() => onChange(item.id)}
        />
      ))}
    </View>
  );
}

function TabItem({ styles, label, icon, selected, onPress }) {
  const { colors } = useTheme();
  return (
    <Pressable
      onPress={onPress}
      accessibilityRole="tab"
      accessibilityState={{ selected }}
      style={({ pressed }) => [styles.item, pressed && styles.itemPressed]}
    >
      <HIcon
        name={icon}
        size={24}
        color={selected ? colors.accent : colors.textMuted}
        strokeWidth={selected ? 2 : 1.5}
      />
      <Text style={[styles.itemLabel, selected && styles.itemLabelSelected]} numberOfLines={1}>
        {label}
      </Text>
    </Pressable>
  );
}

const createStyles = (colors) =>
  StyleSheet.create({
    bar: {
      flexDirection: 'row',
      backgroundColor: colors.background,
      borderTopWidth: StyleSheet.hairlineWidth,
      borderTopColor: colors.border,
    },
    item: {
      flex: 1,
      alignItems: 'center',
      justifyContent: 'center',
      gap: 2,
    },
    itemPressed: {
      opacity: 0.7,
    },
    itemLabel: {
      // textSecondary, not textMuted: small nav labels need ≥4.5:1 contrast (AA).
      color: colors.textSecondary,
      fontFamily: fonts.bold,
      // 10px so the longest label ('Categorías') fits a 5-way split on narrow phones.
      fontSize: 10,
    },
    itemLabelSelected: {
      color: colors.accent,
    },
    addSlot: {
      flex: 1,
      alignItems: 'center',
    },
    addButton: {
      width: 56,
      height: 56,
      borderRadius: 28,
      // Negative top margin floats the button above the bar like the old FAB.
      marginTop: -spacing.lg,
      backgroundColor: colors.accent,
      alignItems: 'center',
      justifyContent: 'center',
      shadowColor: '#000',
      shadowOpacity: 0.35,
      shadowRadius: 8,
      shadowOffset: { width: 0, height: 4 },
      elevation: 6,
    },
    addButtonPressed: {
      backgroundColor: colors.accentDark,
    },
    plusIcon: {
      width: 22,
      height: 22,
    },
    plusBarH: {
      position: 'absolute',
      left: 0,
      right: 0,
      top: 9.5,
      height: 3,
      borderRadius: 1.5,
      backgroundColor: colors.onAccent,
    },
    plusBarV: {
      position: 'absolute',
      top: 0,
      bottom: 0,
      left: 9.5,
      width: 3,
      borderRadius: 1.5,
      backgroundColor: colors.onAccent,
    },
  });
