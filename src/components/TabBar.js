import { useMemo } from 'react';
import { Pressable, StyleSheet, Text, View } from 'react-native';
import { useSafeAreaInsets } from 'react-native-safe-area-context';
import { fonts, spacing, useTheme } from '../theme';
import { useT } from '../i18n';
import { HIcon } from '../icons';

export const TAB_BAR_HEIGHT = 72;

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
    <View style={[styles.outer, { paddingBottom: insets.bottom }]}>
      <View style={styles.capsule}>
        {TABS_LEFT.map((item) => (
          <TabItem
            key={item.id}
            styles={styles}
            colors={colors}
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
            colors={colors}
            icon={item.icon}
            selected={tab === item.id}
            onPress={() => onChange(item.id)}
          />
        ))}
      </View>
    </View>
  );
}

function TabItem({ styles, colors, icon, selected, onPress }) {
  return (
    <Pressable
      onPress={onPress}
      accessibilityRole="tab"
      accessibilityState={{ selected }}
      style={({ pressed }) => [
        styles.item,
        selected && styles.itemSelected,
        pressed && !selected && styles.itemPressed,
      ]}
    >
      <HIcon
        name={icon}
        size={22}
        color={selected ? colors.accent : colors.textMuted}
        strokeWidth={selected ? 2 : 1.5}
      />
    </Pressable>
  );
}

const createStyles = (colors) =>
  StyleSheet.create({
    outer: {
      paddingHorizontal: spacing.md,
      paddingTop: spacing.xs,
    },
    capsule: {
      flexDirection: 'row',
      alignItems: 'center',
      backgroundColor: colors.card,
      borderRadius: 32,
      height: 58,
      paddingHorizontal: spacing.xs,
      shadowColor: '#000',
      shadowOpacity: 0.1,
      shadowRadius: 12,
      shadowOffset: { width: 0, height: 4 },
      elevation: 8,
    },
    item: {
      flex: 1,
      flexDirection: 'row',
      alignItems: 'center',
      justifyContent: 'center',
      height: 44,
      borderRadius: 22,
      gap: spacing.xs,
    },
    itemSelected: {
      backgroundColor: `${colors.accent}15`,
    },
    itemPressed: {
      opacity: 0.6,
    },
    addSlot: {
      alignItems: 'center',
      justifyContent: 'center',
      marginHorizontal: spacing.xs,
    },
    addButton: {
      width: 46,
      height: 46,
      borderRadius: 23,
      backgroundColor: colors.accent,
      alignItems: 'center',
      justifyContent: 'center',
      shadowColor: '#000',
      shadowOpacity: 0.25,
      shadowRadius: 6,
      shadowOffset: { width: 0, height: 3 },
      elevation: 5,
    },
    addButtonPressed: {
      backgroundColor: colors.accentDark,
    },
    plusIcon: {
      width: 20,
      height: 20,
    },
    plusBarH: {
      position: 'absolute',
      left: 0,
      right: 0,
      top: 8.5,
      height: 3,
      borderRadius: 1.5,
      backgroundColor: colors.onAccent,
    },
    plusBarV: {
      position: 'absolute',
      top: 0,
      bottom: 0,
      left: 8.5,
      width: 3,
      borderRadius: 1.5,
      backgroundColor: colors.onAccent,
    },
  });
