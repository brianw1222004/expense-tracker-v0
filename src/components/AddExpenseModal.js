import { useEffect, useRef, useState } from 'react';
import {
  Animated,
  Easing,
  Keyboard,
  KeyboardAvoidingView,
  Platform,
  Pressable,
  StyleSheet,
  View,
} from 'react-native';
import { spacing, useTheme } from '../theme';
import { useT } from '../i18n';

const OPEN_MS = 220;
const CLOSE_MS = 160;

// Popup presenter for the add-expense form: dimmed backdrop fades in while the
// card scales up from 85%. Children stay mounted while closed (display:none)
// so a half-typed expense survives dismissing the popup.
export default function AddExpenseModal({ visible, onClose, children }) {
  // Only the backdrop color is theme-dependent; the rest of the styles stay static.
  const { colors } = useTheme();
  const t = useT();
  const progress = useRef(new Animated.Value(0)).current;
  // Stays true until the close animation finishes, then flips to display:none.
  const [hidden, setHidden] = useState(!visible);

  useEffect(() => {
    if (visible) {
      setHidden(false);
      Animated.timing(progress, {
        toValue: 1,
        duration: OPEN_MS,
        easing: Easing.out(Easing.cubic),
        useNativeDriver: true,
      }).start();
    } else {
      Keyboard.dismiss();
      Animated.timing(progress, {
        toValue: 0,
        duration: CLOSE_MS,
        easing: Easing.in(Easing.cubic),
        useNativeDriver: true,
      }).start(({ finished }) => {
        // A reopen interrupts this mid-close (finished=false); stay shown.
        if (finished) setHidden(true);
      });
    }
    return () => progress.stopAnimation();
  }, [visible, progress]);

  const scale = progress.interpolate({ inputRange: [0, 1], outputRange: [0.85, 1] });

  return (
    <View
      style={[StyleSheet.absoluteFill, hidden && styles.hidden]}
      pointerEvents={visible ? 'auto' : 'none'}
    >
      <Animated.View
        style={[
          StyleSheet.absoluteFill,
          { backgroundColor: colors.backdrop, opacity: progress },
        ]}
      >
        <Pressable
          style={StyleSheet.absoluteFill}
          onPress={onClose}
          accessibilityRole="button"
          accessibilityLabel={t('common.close')}
        />
      </Animated.View>
      <KeyboardAvoidingView
        behavior={Platform.OS === 'ios' ? 'padding' : undefined}
        style={styles.center}
        pointerEvents="box-none"
      >
        <Animated.View style={[styles.card, { opacity: progress, transform: [{ scale }] }]}>
          {children}
        </Animated.View>
      </KeyboardAvoidingView>
    </View>
  );
}

const styles = StyleSheet.create({
  hidden: {
    display: 'none',
  },
  center: {
    flex: 1,
    justifyContent: 'center',
    padding: spacing.lg,
  },
  card: {
    alignSelf: 'stretch',
    maxHeight: '92%',
    flexShrink: 1,
    shadowColor: '#000',
    shadowOffset: { width: 0, height: 2 },
    shadowOpacity: 0.3,
    shadowRadius: 8,
    elevation: 3,
  },
});
