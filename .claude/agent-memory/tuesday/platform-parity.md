---
name: platform-parity
description: Web vs native divergences the expense-tracker team handles, and where gaps remain
metadata:
  type: project
---

Web (react-native-web) vs native (Expo Go) parity — the team is already disciplined here:
- `Alert.alert` with buttons is a no-op on web → every destructive action uses a `Platform.OS === 'web' ? window.confirm : Alert.alert` fork (loadDemo, signOut, deleteIncome, AddEntryScreen.handleDelete). Consistent.
- `onEndEditing` never fires on web → budget/name inputs use `onBlur` instead (BudgetScreen AmountField, AccountScreen commitName). Documented in code comments.
- SpendingChart tooltip uses BOTH responder events (native) and onMouseMove/onMouseLeave (web) — good dual-input handling.
- Haptics shimmed to no-op on web in App.js.
- KeyboardAvoidingView uses `behavior=padding` on iOS, undefined/height elsewhere.

**How to apply:** Parity is a strength here, not a weak spot. When auditing new code, check the destructive-action fork and onBlur-vs-onEndEditing are present; those are the two most likely to be forgotten.
