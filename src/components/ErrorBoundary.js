import { Component } from 'react';
import { Pressable, StyleSheet, Text, View } from 'react-native';
import { fonts, spacing, radius, useTheme } from '../theme';
import { useT } from '../i18n';

function ThemedErrorFallback({ error, onReset }) {
  const { colors } = useTheme();
  const t = useT();
  return (
    <View style={[styles.container, { backgroundColor: colors.background }]}>
      <Text style={[styles.title, { color: colors.textPrimary }]}>{t('error.title')}</Text>
      <Text style={[styles.message, { color: colors.textSecondary }]} numberOfLines={6}>
        {error?.message ?? 'An unexpected error occurred.'}
      </Text>
      <Pressable
        onPress={onReset}
        accessibilityRole="button"
        style={({ pressed }) => [
          styles.button,
          { backgroundColor: colors.accent },
          pressed && { backgroundColor: colors.accentDark },
        ]}
      >
        <Text style={[styles.buttonText, { color: colors.onAccent }]}>{t('error.tryAgain')}</Text>
      </Pressable>
    </View>
  );
}

export default class ErrorBoundary extends Component {
  constructor(props) {
    super(props);
    this.state = { hasError: false, error: null };
  }

  static getDerivedStateFromError(error) {
    return { hasError: true, error };
  }

  componentDidCatch(error, info) {
    // Error is already captured in state; surface it for debugging (a logging
    // service can hook in here later).
    console.error('ErrorBoundary caught an error:', error, info?.componentStack);
  }

  componentDidUpdate(prevProps) {
    // If the caller passes resetKeys (e.g. [userId]) and they change while a
    // fallback is showing, clear it so a sign-out / account switch recovers.
    if (!this.state.hasError) return;
    const prev = prevProps.resetKeys || [];
    const next = this.props.resetKeys || [];
    if (prev.length !== next.length || prev.some((v, i) => v !== next[i])) {
      this.reset();
    }
  }

  reset = () => {
    this.setState({ hasError: false, error: null });
  };

  render() {
    if (this.state.hasError) {
      return <ThemedErrorFallback error={this.state.error} onReset={this.reset} />;
    }

    return this.props.children;
  }
}

const styles = StyleSheet.create({
  container: {
    flex: 1,
    alignItems: 'center',
    justifyContent: 'center',
    paddingHorizontal: spacing.xl,
  },
  title: {
    fontFamily: fonts.bold,
    fontSize: 18,
    marginBottom: spacing.sm,
  },
  message: {
    fontFamily: fonts.regular,
    fontSize: 13,
    textAlign: 'center',
    lineHeight: 20,
    marginBottom: spacing.lg,
  },
  button: {
    borderRadius: radius.md,
    paddingVertical: spacing.sm + 4,
    paddingHorizontal: spacing.lg,
    minHeight: 48,
    alignItems: 'center',
    justifyContent: 'center',
  },
  buttonText: {
    fontFamily: fonts.bold,
    fontSize: 15,
  },
});
