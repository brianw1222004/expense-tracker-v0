import { useMemo, useState } from 'react';
import {
  KeyboardAvoidingView,
  Platform,
  Pressable,
  ScrollView,
  StyleSheet,
  Text,
  TextInput,
  View,
} from 'react-native';
import { fonts, radius, spacing, useTheme } from '../theme';
import { LANGUAGES, useT } from '../i18n';
import { getCurrency } from '../currency';

export default function OnboardingScreen({ settings, onUpdateSettings }) {
  const { colors } = useTheme();
  const t = useT();
  const styles = useMemo(() => createStyles(colors), [colors]);
  const [budgetText, setBudgetText] = useState('');

  const currencySymbol = getCurrency(settings.displayCurrency).symbol;

  const handleComplete = () => {
    const amount = parseFloat(budgetText);
    const patch = { onboardingDone: true };
    if (!isNaN(amount) && amount > 0) {
      patch.monthlyBudget = amount;
    }
    onUpdateSettings(patch);
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
        <Text style={[styles.wave, { color: colors.icon }]}>{'●'}</Text>
        <Text style={styles.title}>{t('onboard.welcome')}</Text>
        <Text style={styles.subtitle}>{t('onboard.subtitle')}</Text>

        <View style={styles.widget}>
          <Text style={styles.widgetTitle}>{t('onboard.budget')}</Text>
          <View style={styles.budgetInputRow}>
            <Text style={styles.currencySymbol}>{currencySymbol}</Text>
            <TextInput
              style={styles.budgetInput}
              value={budgetText}
              onChangeText={setBudgetText}
              placeholder={t('onboard.budgetPlaceholder')}
              placeholderTextColor={colors.textMuted}
              keyboardType="numeric"
              keyboardAppearance={colors.keyboardAppearance}
              returnKeyType="done"
            />
          </View>
          <Text style={styles.widgetHint}>{t('onboard.budgetHint')}</Text>
        </View>

        <View style={styles.widget}>
          <Text style={styles.widgetTitle}>{t('onboard.language')}</Text>
          {LANGUAGES.map((entry, index) => {
            const selected = settings.language === entry.code;
            return (
              <Pressable
                key={entry.code}
                onPress={() => onUpdateSettings({ language: entry.code })}
                accessibilityRole="radio"
                accessibilityState={{ selected }}
                accessibilityLabel={entry.label}
                style={[
                  styles.langRow,
                  selected && styles.langSelected,
                ]}
              >
                <Text style={[styles.langLabel, selected && styles.langLabelSelected]}>
                  {entry.label}
                </Text>
                {selected && <Text style={styles.checkmark}>{'✓'}</Text>}
              </Pressable>
            );
          })}
        </View>

        <Pressable
          onPress={handleComplete}
          accessibilityRole="button"
          style={({ pressed }) => [
            styles.button,
            pressed && styles.buttonPressed,
          ]}
        >
          <Text style={styles.buttonText}>{t('onboard.getStarted')}</Text>
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
      paddingHorizontal: spacing.md,
      paddingVertical: spacing.xl,
      maxWidth: 440,
      width: '100%',
      alignSelf: 'center',
    },
    wave: {
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
    widget: {
      backgroundColor: colors.card,
      borderRadius: radius.md,
      padding: spacing.md,
      marginBottom: spacing.md,
    },
    widgetTitle: {
      color: colors.textPrimary,
      fontFamily: fonts.bold,
      fontSize: 16,
      marginBottom: spacing.sm,
    },
    widgetHint: {
      color: colors.textMuted,
      fontFamily: fonts.regular,
      fontSize: 13,
      lineHeight: 18,
      marginTop: spacing.sm,
    },
    budgetInputRow: {
      flexDirection: 'row',
      alignItems: 'center',
      backgroundColor: colors.background,
      borderRadius: radius.sm,
      paddingHorizontal: spacing.md,
    },
    currencySymbol: {
      color: colors.textSecondary,
      fontFamily: fonts.bold,
      fontSize: 20,
      marginRight: spacing.sm,
    },
    budgetInput: {
      flex: 1,
      color: colors.textPrimary,
      fontFamily: fonts.regular,
      fontSize: 20,
      paddingVertical: spacing.sm + 4,
    },
    langRow: {
      flexDirection: 'row',
      alignItems: 'center',
      paddingVertical: spacing.sm + 2,
      paddingHorizontal: spacing.sm,
      borderRadius: radius.sm,
      marginTop: spacing.xs,
    },
    langSelected: {
      backgroundColor: colors.background,
    },
    langLabel: {
      color: colors.textPrimary,
      fontFamily: fonts.regular,
      fontSize: 16,
      flex: 1,
    },
    langLabelSelected: {
      fontFamily: fonts.bold,
    },
    checkmark: {
      color: colors.accent,
      fontSize: 17,
      fontFamily: fonts.bold,
    },
    button: {
      backgroundColor: colors.accent,
      borderRadius: radius.md,
      alignItems: 'center',
      justifyContent: 'center',
      paddingVertical: spacing.md,
      marginTop: spacing.sm,
      minHeight: 52,
    },
    buttonPressed: {
      backgroundColor: colors.accentDark,
    },
    buttonText: {
      color: colors.onAccent,
      fontFamily: fonts.bold,
      fontSize: 17,
    },
  });
