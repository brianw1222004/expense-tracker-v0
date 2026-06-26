import { Alert, Platform } from 'react-native';

// Confirm a destructive action, resolving true only if the user proceeds.
// Alert.alert with buttons is a no-op on react-native-web, so fall back to
// window.confirm there. Callers pass already-translated strings.
export function confirmDestructive({ title, body, confirmLabel, cancelLabel }) {
  if (Platform.OS === 'web') {
    return Promise.resolve(window.confirm(body ? `${title}\n\n${body}` : title));
  }
  return new Promise((resolve) => {
    Alert.alert(
      title,
      body,
      [
        { text: cancelLabel, style: 'cancel', onPress: () => resolve(false) },
        { text: confirmLabel, style: 'destructive', onPress: () => resolve(true) },
      ],
      { cancelable: true, onDismiss: () => resolve(false) }
    );
  });
}
