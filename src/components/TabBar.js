import { Pressable, StyleSheet, Text, View } from 'react-native';
import { useSafeAreaInsets } from 'react-native-safe-area-context';
import { colors, spacing } from '../theme';

// Content height of the bar; the rendered bar additionally pads the safe-area
// bottom inset. Screens use this constant to keep content clear of the bar.
export const TAB_BAR_HEIGHT = 64;

export default function TabBar({ tab, onChange, onAddPress, addActive }) {
  const insets = useSafeAreaInsets();

  return (
    <View
      style={[
        styles.bar,
        { height: TAB_BAR_HEIGHT + insets.bottom, paddingBottom: insets.bottom },
      ]}
    >
      <TabItem
        label="Dashboard"
        emoji={'\u{1F4CA}'}
        selected={tab === 'dashboard'}
        onPress={() => onChange('dashboard')}
      />

      <View style={styles.addSlot}>
        <Pressable
          onPress={onAddPress}
          accessibilityRole="button"
          accessibilityLabel="Add expense"
          accessibilityState={{ expanded: addActive }}
          style={({ pressed }) => [styles.addButton, pressed && styles.addButtonPressed]}
        >
          {/* Drawn with two bars instead of a '+' glyph: font metrics sat the
              text off-center; geometry centers exactly on every platform. */}
          <View style={styles.plusIcon}>
            <View style={styles.plusBarH} />
            <View style={styles.plusBarV} />
          </View>
        </Pressable>
      </View>

      <TabItem
        label="Expenses"
        emoji={'\u{1F9FE}'}
        selected={tab === 'list'}
        onPress={() => onChange('list')}
      />
    </View>
  );
}

function TabItem({ label, emoji, selected, onPress }) {
  return (
    <Pressable
      onPress={onPress}
      accessibilityRole="tab"
      accessibilityState={{ selected }}
      style={({ pressed }) => [styles.item, pressed && styles.itemPressed]}
    >
      <Text style={[styles.itemEmoji, !selected && styles.itemEmojiInactive]}>{emoji}</Text>
      <Text style={[styles.itemLabel, selected && styles.itemLabelSelected]}>{label}</Text>
    </Pressable>
  );
}

const styles = StyleSheet.create({
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
  itemEmoji: {
    fontSize: 22,
  },
  itemEmojiInactive: {
    opacity: 0.5,
  },
  itemLabel: {
    // textSecondary, not textMuted: 11px nav labels need ≥4.5:1 contrast (AA).
    color: colors.textSecondary,
    fontSize: 11,
    fontWeight: '600',
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
    backgroundColor: '#06281C',
  },
  plusBarV: {
    position: 'absolute',
    top: 0,
    bottom: 0,
    left: 9.5,
    width: 3,
    borderRadius: 1.5,
    backgroundColor: '#06281C',
  },
});
