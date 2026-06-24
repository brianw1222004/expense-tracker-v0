import { useMemo, useRef, useState } from 'react';
import { Modal, Pressable, ScrollView, StyleSheet, Text, View } from 'react-native';
import { fonts, radius, spacing, useTheme } from '../theme';
import { CURRENCIES, getCurrency } from '../currency';
import { HIcon } from '../icons';

const MENU_WIDTH = 220;
const MENU_MAX_HEIGHT = 300;

// Compact currency selector that opens an anchored popover listing every
// currency. measureInWindow works on both native and react-native-web, so the
// menu drops directly beneath the trigger on either target.
export default function CurrencyDropdown({ value, onChange, accessibilityLabel }) {
  const { colors } = useTheme();
  const styles = useMemo(() => createStyles(colors), [colors]);
  const triggerRef = useRef(null);
  const [open, setOpen] = useState(false);
  const [anchor, setAnchor] = useState({ x: 0, y: 0, width: 0, height: 0 });

  const current = getCurrency(value);

  const openMenu = () => {
    const node = triggerRef.current;
    if (node?.measureInWindow) {
      node.measureInWindow((x, y, width, height) => {
        setAnchor({ x, y, width, height });
        setOpen(true);
      });
    } else {
      setOpen(true);
    }
  };

  const select = (code) => {
    setOpen(false);
    if (code !== value) onChange(code);
  };

  // Right-align the menu to the trigger, clamped so it never runs off-screen.
  const menuLeft = Math.max(spacing.md, anchor.x + anchor.width - MENU_WIDTH);
  const menuTop = anchor.y + anchor.height + spacing.xs;

  return (
    <>
      <Pressable
        ref={triggerRef}
        onPress={openMenu}
        accessibilityRole="button"
        accessibilityLabel={accessibilityLabel}
        accessibilityState={{ expanded: open }}
        style={({ pressed }) => [styles.trigger, pressed && styles.triggerPressed]}
      >
        <Text style={styles.triggerText}>{current.code}</Text>
        <Text style={styles.triggerChevron}>▾</Text>
      </Pressable>

      <Modal visible={open} transparent animationType="fade" onRequestClose={() => setOpen(false)}>
        <View style={StyleSheet.absoluteFill}>
          <Pressable style={StyleSheet.absoluteFill} onPress={() => setOpen(false)} />
          <View style={[styles.menu, { left: menuLeft, top: menuTop }]}>
            <ScrollView
              keyboardShouldPersistTaps="handled"
              showsVerticalScrollIndicator={false}
              bounces={false}
            >
              {CURRENCIES.map((entry, index) => {
                const selected = entry.code === value;
                return (
                  <Pressable
                    key={entry.code}
                    onPress={() => select(entry.code)}
                    accessibilityRole="menuitem"
                    accessibilityState={{ selected }}
                    style={({ pressed }) => [
                      styles.item,
                      index > 0 && styles.itemDivider,
                      pressed && styles.itemPressed,
                    ]}
                  >
                    <Text style={styles.itemSymbol}>{entry.symbol}</Text>
                    <Text style={styles.itemName} numberOfLines={1}>
                      {entry.name}
                    </Text>
                    <Text style={styles.itemCode}>{entry.code}</Text>
                    {selected ? (
                      <HIcon name="tick-01" size={15} color={colors.accent} />
                    ) : (
                      <View style={styles.itemCheckSpacer} />
                    )}
                  </Pressable>
                );
              })}
            </ScrollView>
          </View>
        </View>
      </Modal>
    </>
  );
}

const createStyles = (colors) =>
  StyleSheet.create({
    // Height kept in sync with editPill (PILL_HEIGHT = 24) in DashboardScreen so
    // the two budget-header pills read as a matched pair.
    trigger: {
      flexDirection: 'row',
      alignItems: 'center',
      justifyContent: 'center',
      gap: 4,
      backgroundColor: colors.background,
      borderWidth: StyleSheet.hairlineWidth,
      borderColor: colors.border,
      borderRadius: 10,
      paddingHorizontal: spacing.sm + 2,
      height: 24,
    },
    triggerPressed: {
      backgroundColor: colors.cardPressed,
    },
    triggerText: {
      color: colors.accent,
      fontFamily: fonts.bold,
      fontSize: 12,
      letterSpacing: 0.3,
    },
    triggerChevron: {
      color: colors.accent,
      fontSize: 11,
    },
    menu: {
      position: 'absolute',
      width: MENU_WIDTH,
      maxHeight: MENU_MAX_HEIGHT,
      backgroundColor: colors.card,
      borderRadius: radius.md,
      overflow: 'hidden',
      shadowColor: '#000',
      shadowOffset: { width: 0, height: 4 },
      shadowOpacity: 0.18,
      shadowRadius: 12,
      elevation: 6,
    },
    item: {
      flexDirection: 'row',
      alignItems: 'center',
      paddingHorizontal: spacing.md,
      paddingVertical: spacing.sm + 4,
      gap: spacing.sm,
    },
    itemDivider: {
      borderTopWidth: StyleSheet.hairlineWidth,
      borderTopColor: colors.border,
    },
    itemPressed: {
      backgroundColor: colors.cardPressed,
    },
    itemSymbol: {
      color: colors.textPrimary,
      fontFamily: fonts.numBold,
      fontSize: 14,
      width: 36,
      fontVariant: ['tabular-nums'],
    },
    itemName: {
      color: colors.textPrimary,
      fontFamily: fonts.regular,
      fontSize: 14,
      flex: 1,
    },
    itemCode: {
      color: colors.textMuted,
      fontFamily: fonts.bold,
      fontSize: 12,
    },
    itemCheckSpacer: {
      width: 15,
    },
  });
