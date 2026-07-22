import { useMemo, useRef, useState } from 'react';
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
import { fonts, spacing, radius, useTheme } from '../theme';
import { useT } from '../i18n';
import { HIcon } from '../icons';

export default function AuthScreen() {
  const { colors } = useTheme();
  const t = useT();
  const styles = useMemo(() => createStyles(colors), [colors]);
  const [mode, setMode] = useState('signIn'); // 'signIn' | 'signUp' | 'confirm'
  const [email, setEmail] = useState('');
  const [password, setPassword] = useState('');
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState(null);
  const passwordRef = useRef(null);

  const signIn = mode === 'signIn';

  // Map common Supabase auth error messages to translated i18n keys.
  // Falls back to the raw message for any unrecognized error.
  const translateAuthError = (msg) => {
    if (!msg) return msg;
    const lower = msg.toLowerCase();
    if (lower.includes('invalid login credentials') || lower.includes('invalid credentials') || lower.includes('wrong password') || lower.includes('invalid email or password')) {
      return t('auth.errInvalidCredentials');
    }
    if (lower.includes('user already registered') || lower.includes('already been registered') || lower.includes('email already')) {
      return t('auth.errUserExists');
    }
    if (lower.includes('email not confirmed') || lower.includes('email confirmation')) {
      return t('auth.errEmailNotConfirmed');
    }
    if (lower.includes('password should be at least') || lower.includes('weak password') || lower.includes('password is too short')) {
      return t('auth.errWeakPassword');
    }
    return msg;
  };

  const submit = async () => {
    if (busy) return;
    const trimmedEmail = email.trim();
    if (!trimmedEmail || !password) {
      setError(t('auth.missingFields'));
      return;
    }
    // Catch obvious typos before a round-trip (Supabase would reject them with a
    // generic message; this is clearer and instant). Deliberately permissive —
    // just "something@something.something", no attempt to fully RFC-validate.
    if (!/^[^\s@]+@[^\s@]+\.[^\s@]+$/.test(trimmedEmail)) {
      setError(t('auth.invalidEmail'));
      return;
    }
    setBusy(true);
    setError(null);
    try {
      if (signIn) {
        const { error: authError } = await supabase.auth.signInWithPassword({
          email: trimmedEmail,
          password,
        });
        if (authError) setError(translateAuthError(authError.message));
      } else {
        const { data, error: authError } = await supabase.auth.signUp({
          email: trimmedEmail,
          password,
        });
        if (authError) {
          setError(translateAuthError(authError.message));
        } else if (!data.session) {
          setMode('confirm');
        }
      }
    } catch {
      setError(t('auth.network'));
    } finally {
      setBusy(false);
    }
  };

  if (mode === 'confirm') {
    return (
      <ScrollView
        contentContainerStyle={styles.container}
        showsVerticalScrollIndicator={false}
      >
        <View style={{ alignSelf: 'center', marginBottom: spacing.sm }}>
          <HIcon name="receipt-text" size={40} color={colors.icon} />
        </View>
        <Text style={styles.title}>{t('auth.confirmTitle')}</Text>
        <Text style={styles.confirmBody}>
          {t('auth.confirmBody', { email: email.trim() })}
        </Text>

        <Pressable
          onPress={() => { setMode('signIn'); setPassword(''); setError(null); }}
          accessibilityRole="button"
          style={({ pressed }) => [
            styles.submit,
            pressed && styles.submitPressed,
          ]}
        >
          <Text style={styles.submitText}>{t('auth.backToSignIn')}</Text>
        </Pressable>
      </ScrollView>
    );
  }

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
        <View style={{ alignSelf: 'center', marginBottom: spacing.sm }}>
          <HIcon name="receipt-text" size={40} color={colors.icon} />
        </View>
        <Text style={styles.title}>{t('auth.title')}</Text>
        <Text style={styles.subtitle}>
          {signIn ? t('auth.signInSubtitle') : t('auth.signUpSubtitle')}
        </Text>

        <View style={styles.card}>
          <TextInput
            style={styles.input}
            value={email}
            onChangeText={setEmail}
            placeholder={t('auth.email')}
            placeholderTextColor={colors.textMuted}
            keyboardType="email-address"
            autoCapitalize="none"
            autoCorrect={false}
            autoComplete="email"
            textContentType="emailAddress"
            keyboardAppearance={colors.keyboardAppearance}
            returnKeyType="next"
            onSubmitEditing={() => passwordRef.current?.focus()}
          />
          <TextInput
            ref={passwordRef}
            style={[styles.input, styles.inputDivider]}
            value={password}
            onChangeText={setPassword}
            placeholder={signIn ? t('auth.password') : t('auth.passwordNew')}
            placeholderTextColor={colors.textMuted}
            secureTextEntry
            autoCapitalize="none"
            autoComplete={signIn ? 'current-password' : 'new-password'}
            textContentType={signIn ? 'password' : 'newPassword'}
            keyboardAppearance={colors.keyboardAppearance}
            returnKeyType="go"
            onSubmitEditing={submit}
          />
        </View>

        {error && <Text style={styles.error}>{error}</Text>}

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
            <ActivityIndicator color={colors.onAccent} />
          ) : (
            <Text style={styles.submitText}>{signIn ? t('auth.signIn') : t('auth.signUp')}</Text>
          )}
        </Pressable>

        <Pressable onPress={() => { setMode(signIn ? 'signUp' : 'signIn'); setError(null); }} hitSlop={8} accessibilityRole="button">
          <Text style={styles.switchText}>
            {signIn ? t('auth.switchToSignUpPrefix') : t('auth.switchToSignInPrefix')}
            <Text style={styles.switchAction}>
              {signIn ? t('auth.switchToSignUpAction') : t('auth.switchToSignInAction')}
            </Text>
          </Text>
        </Pressable>
      </ScrollView>
    </KeyboardAvoidingView>
  );
}

const createStyles = (colors) =>
  StyleSheet.create({
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
    title: {
      color: colors.textPrimary,
      fontFamily: fonts.bold,
      fontSize: 24,
      textAlign: 'center',
    },
    subtitle: {
      color: colors.textSecondary,
      fontFamily: fonts.regular,
      fontSize: 14,
      lineHeight: 21,
      textAlign: 'center',
      marginTop: spacing.sm,
      marginBottom: spacing.lg,
    },
    confirmBody: {
      color: colors.textSecondary,
      fontFamily: fonts.regular,
      fontSize: 15,
      lineHeight: 24,
      textAlign: 'center',
      marginTop: spacing.md,
      marginBottom: spacing.sm,
    },
    card: {
      backgroundColor: colors.card,
      borderRadius: radius.md,
      overflow: 'hidden',
    },
    input: {
      color: colors.textPrimary,
      fontFamily: fonts.regular,
      fontSize: 15,
      paddingHorizontal: spacing.md,
      paddingVertical: spacing.sm + 6,
    },
    inputDivider: {
      borderTopWidth: StyleSheet.hairlineWidth,
      borderTopColor: colors.border,
    },
    error: {
      color: colors.danger,
      fontFamily: fonts.regular,
      fontSize: 13,
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
      color: colors.onAccent,
      fontFamily: fonts.bold,
      fontSize: 16,
    },
    switchText: {
      color: colors.textSecondary,
      fontFamily: fonts.regular,
      fontSize: 13,
      textAlign: 'center',
      marginTop: spacing.lg,
      paddingVertical: spacing.xs,
    },
    switchAction: {
      color: colors.accent,
      fontFamily: fonts.bold,
    },
  });
