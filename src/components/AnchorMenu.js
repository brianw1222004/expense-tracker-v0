import { useMemo } from 'react';
import { Modal, Pressable, ScrollView, StyleSheet, Text, View, useWindowDimensions } from 'react-native';
import { fonts, radius, spacing, useTheme, panelShadow } from '../theme';
import { HIcon } from '../icons';

// iOS-style compact context menu, anchored to the control that opened it — for
// small option sets (the Shared form's Group / Paid by / Split / Members
// chips), vs the centered OptionPicker card which suits richer lists like
// categories. `anchor` is the trigger's window frame (from measureInWindow):
// the menu opens just under it (above when there's no room), clamped to the
// screen edges, with no title bar and no backdrop dim — tap anywhere outside
// to dismiss (the shadow carries the elevation). Options are { id, label,
// icon? }; icons render trailing and muted, iOS-menu style. Single-select
// marks the current `value` with a trailing tick (the caller closes on
// select); in `multi` mode rows are ✓-ring checkboxes driven by `values` (an
// array of ids) and tapping toggles without closing.

const MENU_WIDTH = 250;
const EDGE_MARGIN = spacing.md;
const ANCHOR_GAP = 6;
const ROW_HEIGHT = 44;
const MAX_HEIGHT = 308;

export default function AnchorMenu({ visible, anchor, options = [], value, values = [], multi = false, onSelect, onClose }) {
  const { colors } = useTheme();
  const styles = useMemo(() => createStyles(colors), [colors]);
  const win = useWindowDimensions();

  const width = Math.min(MENU_WIDTH, win.width - EDGE_MARGIN * 2);
  const estHeight = Math.min(options.length * ROW_HEIGHT, MAX_HEIGHT);
  // Fall back to centered if the trigger couldn't be measured.
  let left = (win.width - width) / 2;
  let top = (win.height - estHeight) / 2;
  if (anchor) {
    left = Math.min(Math.max(anchor.x, EDGE_MARGIN), win.width - width - EDGE_MARGIN);
    const below = anchor.y + anchor.height + ANCHOR_GAP;
    top =
      below + estHeight > win.height - EDGE_MARGIN
        ? Math.max(anchor.y - ANCHOR_GAP - estHeight, EDGE_MARGIN)
        : below;
  }

  return (
    <Modal visible={visible} animationType="fade" transparent statusBarTranslucent onRequestClose={onClose}>
      <Pressable style={[StyleSheet.absoluteFill, styles.backdrop]} onPress={onClose} />
      {/* Shadow on the wrapper, overflow:'hidden' on the inner card so the
          edge-to-edge row highlights + hairlines clip to the rounded corners
          without suppressing the iOS shadow. */}
      <View style={[styles.menuWrap, { width, left, top }]}>
        <View style={styles.menu}>
          <ScrollView style={styles.list} showsVerticalScrollIndicator={false} bounces={false}>
            {options.map((opt, index) => {
              const selected = multi ? values.includes(opt.id) : opt.id === value;
              return (
                <Pressable
                  key={opt.id}
                  onPress={() => onSelect(opt.id)}
                  accessibilityRole={multi ? 'checkbox' : 'button'}
                  accessibilityState={multi ? { checked: selected } : { selected }}
                  accessibilityLabel={opt.label}
                  style={({ pressed }) => [styles.row, index > 0 && styles.rowDivider, pressed && styles.rowPressed]}
                >
                  <Text style={[styles.label, !multi && selected && styles.labelSelected]} numberOfLines={1}>
                    {opt.label}
                  </Text>
                  {multi ? (
                    <View style={[styles.checkRing, selected && styles.checkRingOn]}>
                      {selected ? <HIcon name="tick-01" size={12} color={colors.onAccent} strokeWidth={2.5} /> : null}
                    </View>
                  ) : selected ? (
                    <HIcon name="tick-01" size={16} color={colors.accent} strokeWidth={2.2} />
                  ) : opt.icon ? (
                    <HIcon name={opt.icon} size={16} color={colors.icon} strokeWidth={2} />
                  ) : null}
                </Pressable>
              );
            })}
          </ScrollView>
        </View>
      </View>
    </Modal>
  );
}

const createStyles = (colors) =>
  StyleSheet.create({
    // A whisper of dim so a first-time user reads the rest of the screen as a
    // dismiss target, without the heavy scrim of a full modal.
    backdrop: {
      backgroundColor: 'rgba(0, 0, 0, 0.04)',
    },
    menuWrap: {
      position: 'absolute',
      backgroundColor: colors.background,
      borderRadius: radius.md,
      ...panelShadow,
    },
    menu: {
      borderRadius: radius.md,
      overflow: 'hidden',
    },
    list: {
      maxHeight: MAX_HEIGHT,
    },
    row: {
      flexDirection: 'row',
      alignItems: 'center',
      justifyContent: 'space-between',
      gap: spacing.sm,
      minHeight: ROW_HEIGHT,
      paddingHorizontal: spacing.md,
    },
    rowDivider: {
      borderTopWidth: StyleSheet.hairlineWidth,
      borderTopColor: colors.border,
    },
    rowPressed: {
      backgroundColor: colors.cardPressed,
    },
    label: {
      flex: 1,
      color: colors.textPrimary,
      fontFamily: fonts.regular,
      fontSize: 15,
    },
    labelSelected: {
      fontFamily: fonts.bold,
    },
    checkRing: {
      width: 20,
      height: 20,
      borderRadius: 10,
      borderWidth: 1.5,
      borderColor: colors.border,
      alignItems: 'center',
      justifyContent: 'center',
    },
    checkRingOn: {
      backgroundColor: colors.accent,
      borderColor: colors.accent,
    },
  });
