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

  const submit = async () => {
    if (busy) return;
    const trimmedEmail = email.trim();
    if (!trimmedEmail || !password) {
      setError(t('auth.missingFields'));
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
        if (authError) setError(authError.message);
      } else {
        const { data, error: authError } = await supabase.auth.signUp({
          email: trimmedEmail,
          password,
        });
        if (authError) {
          setError(authError.message);
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

  const switchMode = () => {
    setMode(signIn ? 'signUp' : 'signIn');
    setError(null);
  };

  const backToSignIn = () => {
    setMode('signIn');
    setPassword('');
    setError(null);
  };

  if (mode === 'confirm') {
    return (
      <ScrollView
        contentContainerStyle={styles.container}
        showsVerticalScrollIndicator={false}
      >
        <Text style={[styles.logo, { color: colors.icon }]}>{'●'}</Text>
        <Text style={styles.title}>{t('auth.confirmTitle')}</Text>
        <Text style={styles.confirmBody}>
          {t('auth.confirmBody', { email: email.trim() })}
        </Text>

        <Pressable
          onPress={backToSignIn}
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
        <Text style={[styles.logo, { color: colors.icon }]}>{'●'}</Text>
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

        <Pressable onPress={switchMode} hitSlop={8} accessibilityRole="button">
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
    logo: {
      fontSize: 44,
      textAlign: 'center',
      marginBottom: spacing.sm,
    },
    title: {
      color: colors.textPrimary,
      fontFamily: fonts.bold,
      fontSize: 26,
      textAlign: 'center',
    },
    subtitle: {
      color: colors.textSecondary,
      fontFamily: fonts.regular,
      fontSize: 15,
      lineHeight: 21,
      textAlign: 'center',
      marginTop: spacing.sm,
      marginBottom: spacing.lg,
    },
    confirmBody: {
      color: colors.textSecondary,
      fontFamily: fonts.regular,
      fontSize: 16,
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
      fontFamily: fonts.regular,
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
      color: colors.onAccent,
      fontFamily: fonts.bold,
      fontSize: 17,
    },
    switchText: {
      color: colors.textSecondary,
      fontFamily: fonts.regular,
      fontSize: 14,
      textAlign: 'center',
      marginTop: spacing.lg,
      paddingVertical: spacing.xs,
    },
    switchAction: {
      color: colors.accent,
      fontFamily: fonts.bold,
    },
  });
