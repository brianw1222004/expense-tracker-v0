import { useMemo } from 'react';
import { KeyboardAvoidingView, Modal, Platform, Pressable, StyleSheet, View } from 'react-native';
import { radius, spacing, useTheme } from '../theme';

// Reusable bottom-sheet presenter. Wraps the shared Modal/overlay/backdrop/sheet
// shell used by AccountScreen and BudgetScreen.
//
// Props:
//   visible       — passed through to <Modal visible>
//   onClose       — called on backdrop press and hardware-back
//   children      — the sheet's inner content (title row + scroll view)
//   showHandle    — render the grab-handle nub at the top of the sheet (AccountScreen)
//   sheetStyle    — override/extend the sheet container style (used for height vs maxHeight)
//   avoidKeyboard — wrap the overlay in KeyboardAvoidingView instead of a plain View (BudgetScreen)
export default function Sheet({ visible, onClose, children, showHandle = false, sheetStyle, avoidKeyboard = false }) {
  const { colors } = useTheme();
  const styles = useMemo(() => createStyles(colors), [colors]);

  const overlayContent = (
    <>
      <Pressable style={[StyleSheet.absoluteFill, styles.backdrop]} onPress={onClose} />
      <View style={[styles.sheet, sheetStyle]}>
        {showHandle && <View style={styles.handle} />}
        {children}
      </View>
    </>
  );

  return (
    <Modal visible={visible} animationType="slide" transparent onRequestClose={onClose}>
      {avoidKeyboard ? (
        <KeyboardAvoidingView
          behavior={Platform.OS === 'ios' ? 'padding' : 'height'}
          style={styles.overlay}
        >
          {overlayContent}
        </KeyboardAvoidingView>
      ) : (
        <View style={styles.overlay}>
          {overlayContent}
        </View>
      )}
    </Modal>
  );
}

const createStyles = (colors) =>
  StyleSheet.create({
    overlay: {
      flex: 1,
      justifyContent: 'flex-end',
    },
    backdrop: {
      backgroundColor: colors.backdrop,
    },
    sheet: {
      backgroundColor: colors.background,
      borderTopLeftRadius: radius.lg,
      borderTopRightRadius: radius.lg,
      shadowColor: '#000',
      shadowOffset: { width: 0, height: -2 },
      shadowOpacity: 0.3,
      shadowRadius: 8,
      elevation: 3,
    },
    handle: {
      alignSelf: 'center',
      width: 36,
      height: 4,
      borderRadius: 2,
      backgroundColor: colors.border,
      marginBottom: spacing.sm,
    },
  });
