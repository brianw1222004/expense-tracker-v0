import { useRef, useState } from 'react';
import {
  ActivityIndicator,
  KeyboardAvoidingView,
  Platform,
  Pressable,
  ScrollView,
  StyleSheet,
  Text,
  TextInput,
  View,
} from 'react-native';
import { supabase } from '../supabase';
import { colors, spacing, radius } from '../theme';

// Email + password only: both work inside Expo Go on phone and web with zero
// deep-link configuration. Magic links / OAuth need a redirect scheme, so
// they're a later addition. Errors render inline (Alert is a no-op on web).
export default function AuthScreen() {
  const [mode, setMode] = useState('signIn'); // 'signIn' | 'signUp'
  const [email, setEmail] = useState('');
  const [password, setPassword] = useState('');
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState(null);
  const [notice, setNotice] = useState(null);
  const passwordRef = useRef(null);

  const signIn = mode === 'signIn';

  const submit = async () => {
    if (busy) return;
    const trimmedEmail = email.trim();
    if (!trimmedEmail || !password) {
      setError('Enter your email and a password.');
      return;
    }
    setBusy(true);
    setError(null);
    setNotice(null);
    try {
      if (signIn) {
        const { error: authError } = await supabase.auth.signInWithPassword({
          email: trimmedEmail,
          password,
        });
        // On success onAuthStateChange in App.js swaps this screen out.
        if (authError) setError(authError.message);
      } else {
        const { data, error: authError } = await supabase.auth.signUp({
          email: trimmedEmail,
          password,
        });
        if (authError) {
          setError(authError.message);
        } else if (!data.session) {
          // Email confirmation is on in the Supabase project: no session yet.
          setNotice('Almost there — confirm the link we emailed you, then sign in.');
          setMode('signIn');
        }
      }
    } catch {
      setError("Couldn't reach the server. Check your connection and try again.");
    } finally {
      setBusy(false);
    }
  };

  const switchMode = () => {
    setMode(signIn ? 'signUp' : 'signIn');
    setError(null);
    setNotice(null);
  };

  return (
    <KeyboardAvoidingView
      behavior={Platform.OS === 'ios' ? 'padding' : undefined}
      style={styles.flex}
    >
      <ScrollView
        contentContainerStyle={styles.container}
        keyboardShouldPersistTaps="handled"
        showsVerticalScrollIndicator={false}
      >
        <Text style={styles.logo}>{'💸'}</Text>
        <Text style={styles.title}>Expense Tracker</Text>
        <Text style={styles.subtitle}>
          {signIn
            ? 'Sign in to see your expenses on any device.'
            : 'Create an account to keep your expenses backed up.'}
        </Text>

        <View style={styles.card}>
          <TextInput
            style={styles.input}
            value={email}
            onChangeText={setEmail}
            placeholder="Email"
            placeholderTextColor={colors.textMuted}
            keyboardType="email-address"
            autoCapitalize="none"
            autoCorrect={false}
            autoComplete="email"
            textContentType="emailAddress"
            keyboardAppearance="dark"
            returnKeyType="next"
            onSubmitEditing={() => passwordRef.current?.focus()}
          />
          <TextInput
            ref={passwordRef}
            style={[styles.input, styles.inputDivider]}
            value={password}
            onChangeText={setPassword}
            placeholder={signIn ? 'Password' : 'Password (min. 6 characters)'}
            placeholderTextColor={colors.textMuted}
            secureTextEntry
            autoCapitalize="none"
            autoComplete={signIn ? 'current-password' : 'new-password'}
            textContentType={signIn ? 'password' : 'newPassword'}
            keyboardAppearance="dark"
            returnKeyType="go"
            onSubmitEditing={submit}
          />
        </View>

        {error && <Text style={styles.error}>{error}</Text>}
        {notice && <Text style={styles.notice}>{notice}</Text>}

        <Pressable
          onPress={submit}
          disabled={busy}
          accessibilityRole="button"
          style={({ pressed }) => [
            styles.submit,
            pressed && styles.submitPressed,
            busy && styles.submitBusy,
          ]}
        >
          {busy ? (
            <ActivityIndicator color={colors.background} />
          ) : (
            <Text style={styles.submitText}>{signIn ? 'Sign in' : 'Create account'}</Text>
          )}
        </Pressable>

        <Pressable onPress={switchMode} hitSlop={8} accessibilityRole="button">
          <Text style={styles.switchText}>
            {signIn ? 'New here? ' : 'Already have an account? '}
            <Text style={styles.switchAction}>{signIn ? 'Create an account' : 'Sign in'}</Text>
          </Text>
        </Pressable>
      </ScrollView>
    </KeyboardAvoidingView>
  );
}

const styles = StyleSheet.create({
  flex: {
    flex: 1,
  },
  container: {
    flexGrow: 1,
    justifyContent: 'center',
    paddingHorizontal: spacing.lg,
    paddingVertical: spacing.xl,
    maxWidth: 440,
    width: '100%',
    alignSelf: 'center',
  },
  logo: {
    fontSize: 44,
    textAlign: 'center',
    marginBottom: spacing.sm,
  },
  title: {
    color: colors.textPrimary,
    fontSize: 26,
    fontWeight: '800',
    textAlign: 'center',
  },
  subtitle: {
    color: colors.textSecondary,
    fontSize: 15,
    lineHeight: 21,
    textAlign: 'center',
    marginTop: spacing.sm,
    marginBottom: spacing.lg,
  },
  card: {
    backgroundColor: colors.card,
    borderRadius: radius.md,
    overflow: 'hidden',
  },
  input: {
    color: colors.textPrimary,
    fontSize: 16,
    paddingHorizontal: spacing.md,
    paddingVertical: spacing.sm + 6,
  },
  inputDivider: {
    borderTopWidth: StyleSheet.hairlineWidth,
    borderTopColor: colors.border,
  },
  error: {
    color: colors.danger,
    fontSize: 14,
    lineHeight: 19,
    marginTop: spacing.md,
    textAlign: 'center',
  },
  notice: {
    color: colors.accent,
    fontSize: 14,
    lineHeight: 19,
    marginTop: spacing.md,
    textAlign: 'center',
  },
  submit: {
    backgroundColor: colors.accent,
    borderRadius: radius.md,
    alignItems: 'center',
    justifyContent: 'center',
    paddingVertical: spacing.md,
    marginTop: spacing.lg,
    minHeight: 52,
  },
  submitPressed: {
    backgroundColor: colors.accentDark,
  },
  submitBusy: {
    opacity: 0.7,
  },
  submitText: {
    color: colors.background,
    fontSize: 17,
    fontWeight: '800',
  },
  switchText: {
    color: colors.textSecondary,
    fontSize: 14,
    textAlign: 'center',
    marginTop: spacing.lg,
    paddingVertical: spacing.xs,
  },
  switchAction: {
    color: colors.accent,
    fontWeight: '700',
  },
});
