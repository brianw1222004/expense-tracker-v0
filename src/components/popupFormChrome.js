import { fonts, radius, spacing } from '../theme';

// Shared card chrome for the two add-popup forms (AddEntryScreen + SharedSplitForm),
// both rendered inside AddExpenseModal. Spread into each form's StyleSheet.create
// so the card/header/close-button shell stays identical and defined once.
// AddEntryScreen overrides the card border color inline (its animated category
// tint); the static colors.border here is its resting value.
export function popupChromeStyles(colors) {
  return {
    card: {
      backgroundColor: colors.background,
      borderRadius: radius.lg,
      borderWidth: 1.5,
      borderColor: colors.border,
      flexShrink: 1,
      overflow: 'hidden',
    },
    scroll: {
      flexGrow: 0,
      flexShrink: 1,
    },
    scrollContent: {
      padding: spacing.lg,
    },
    header: {
      flexDirection: 'row',
      alignItems: 'center',
      marginBottom: spacing.md,
    },
    headerSide: {
      width: 32,
    },
    headerCenter: {
      flex: 1,
      alignItems: 'center',
      justifyContent: 'center',
    },
    title: {
      color: colors.textPrimary,
      fontFamily: fonts.bold,
      fontSize: 18,
    },
    closeButton: {
      width: 32,
      height: 32,
      borderRadius: 16,
      alignItems: 'center',
      justifyContent: 'center',
      backgroundColor: colors.card,
    },
  };
}
