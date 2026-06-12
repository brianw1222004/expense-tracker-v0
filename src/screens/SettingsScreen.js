import { useEffect, useState } from 'react';
import {
  KeyboardAvoidingView,
  Modal,
  Platform,
  Pressable,
  ScrollView,
  StyleSheet,
  Text,
  TextInput,
  View,
} from 'react-native';
import { useSafeAreaInsets } from 'react-native-safe-area-context';
import { colors, spacing, radius } from '../theme';
import { CURRENCIES, getCurrency } from '../currency';

// Strict shape check before parseFloat (same approach as the amount field):
// bare parseFloat accepts '1.2.3' as 1.2 and would silently save a different
// budget than the user sees. Zero-decimal currencies only accept whole numbers.
function isValidBudgetText(text, decimals) {
  if (decimals === 0) return /^\d+$/.test(text);
  return new RegExp(`^(\\d+(\\.\\d{0,${decimals}})?|\\.\\d{1,${decimals}})$`).test(text);
}

function budgetToText(value, decimals) {
  if (!(value > 0)) return '';
  return Number.isInteger(value) ? String(value) : value.toFixed(decimals);
}

export default function SettingsScreen({
  visible,
  settings,
  onUpdateSettings,
  onClose,
  accountEmail,
  onSignOut,
}) {
  const insets = useSafeAreaInsets();
  const currency = getCurrency(settings.displayCurrency);
  const [budgetText, setBudgetText] = useState(() =>
    budgetToText(settings.monthlyBudget, currency.decimals)
  );

  // Re-sync when the stored budget changes from outside this input — e.g. a
  // currency switch re-denominates it in App.js.
  useEffect(() => {
    setBudgetText(budgetToText(settings.monthlyBudget, currency.decimals));
  }, [settings.monthlyBudget, currency.decimals]);

  const commitBudget = () => {
    const normalized = budgetText.trim().replace(',', '.');
    const parsed = parseFloat(normalized);
    const isValid = isValidBudgetText(normalized, currency.decimals) && parsed > 0;
    const committed = isValid ? Number(parsed.toFixed(currency.decimals)) : 0;
    setBudgetText(budgetToText(committed, currency.decimals));
    if (committed !== settings.monthlyBudget) {
      onUpdateSettings({ monthlyBudget: committed });
    }
  };

  return (
    <Modal visible={visible} animationType="slide" transparent onRequestClose={onClose}>
      <KeyboardAvoidingView
        behavior={Platform.OS === 'ios' ? 'padding' : undefined}
        style={styles.overlay}
      >
        <Pressable style={[StyleSheet.absoluteFill, styles.backdrop]} onPress={onClose} />
        <View style={styles.sheet}>
          <View style={styles.titleRow}>
            <Text style={styles.title}>Settings</Text>
            <Pressable
              onPress={onClose}
              hitSlop={12}
              accessibilityRole="button"
              accessibilityLabel="Close"
              style={({ pressed }) => [styles.closeButton, pressed && styles.closeButtonPressed]}
            >
              <Text style={styles.closeButtonText}>{'✕'}</Text>
            </Pressable>
          </View>

          <ScrollView
            keyboardShouldPersistTaps="handled"
            contentContainerStyle={{ paddingBottom: spacing.xl + insets.bottom }}
            showsVerticalScrollIndicator={false}
          >
            <Text style={styles.sectionHeader}>Display currency</Text>
            <View style={styles.card}>
              {CURRENCIES.map((entry, index) => {
                const selected = entry.code === settings.displayCurrency;
                return (
                  <Pressable
                    key={entry.code}
                    onPress={() => onUpdateSettings({ displayCurrency: entry.code })}
                    accessibilityRole="radio"
                    accessibilityState={{ selected }}
                    style={({ pressed }) => [
                      styles.row,
                      index > 0 && styles.rowDivider,
                      pressed && styles.rowPressed,
                    ]}
                  >
                    <Text style={styles.currencySymbol}>{entry.symbol}</Text>
                    <Text style={styles.currencyName}>{entry.name}</Text>
                    <Text style={styles.currencyCode}>{entry.code}</Text>
                    {selected && <Text style={styles.checkmark}>{'✓'}</Text>}
                  </Pressable>
                );
              })}
            </View>
            <Text style={styles.sectionNote}>
              All totals, charts and the budget use this currency. Entries keep their original
              amount.
            </Text>

            <Text style={styles.sectionHeader}>Monthly budget</Text>
            <View style={styles.card}>
              <View style={styles.budgetRow}>
                <Text style={styles.budgetSymbol}>{currency.symbol}</Text>
                <TextInput
                  style={styles.budgetInput}
                  value={budgetText}
                  onChangeText={setBudgetText}
                  // onBlur, not onEndEditing: react-native-web never fires the
                  // latter, which would silently drop the budget on web.
                  onBlur={commitBudget}
                  onSubmitEditing={commitBudget}
                  placeholder="0"
                  placeholderTextColor={colors.textMuted}
                  keyboardType={currency.decimals === 0 ? 'number-pad' : 'decimal-pad'}
                  keyboardAppearance="dark"
                  returnKeyType="done"
                  maxLength={9}
                />
              </View>
            </View>
            <Text style={styles.sectionNote}>Leave empty for no budget.</Text>

            {/* Only rendered when signed in — local-only mode has no account. */}
            {accountEmail && (
              <>
                <Text style={styles.sectionHeader}>Account</Text>
                <View style={styles.card}>
                  <View style={styles.row}>
                    <Text style={styles.comingSoonEmoji}>{'👤'}</Text>
                    <Text style={styles.accountEmail} numberOfLines={1}>
                      {accountEmail}
                    </Text>
                  </View>
                  <Pressable
                    onPress={onSignOut}
                    accessibilityRole="button"
                    accessibilityLabel="Sign out"
                    style={({ pressed }) => [
                      styles.row,
                      styles.rowDivider,
                      pressed && styles.rowPressed,
                    ]}
                  >
                    <Text style={styles.signOutText}>Sign out</Text>
                  </Pressable>
                </View>
                <Text style={styles.sectionNote}>
                  Your expenses are synced to this account and available on any device.
                </Text>
              </>
            )}

            <Text style={styles.sectionHeader}>Coming soon</Text>
            <View style={styles.card}>
              <View style={styles.row}>
                <Text style={styles.comingSoonEmoji}>{'📄'}</Text>
                <Text style={styles.comingSoonLabel}>Export CSV</Text>
                <Text style={styles.comingSoonTag}>Soon</Text>
              </View>
              <View style={[styles.row, styles.rowDivider]}>
                <Text style={styles.comingSoonEmoji}>{'🎨'}</Text>
                <Text style={styles.comingSoonLabel}>Theme</Text>
                <Text style={styles.comingSoonTag}>Soon</Text>
              </View>
            </View>
          </ScrollView>
        </View>
      </KeyboardAvoidingView>
    </Modal>
  );
}

const styles = StyleSheet.create({
  overlay: {
    flex: 1,
    justifyContent: 'flex-end',
  },
  backdrop: {
    backgroundColor: 'rgba(0, 0, 0, 0.55)',
  },
  sheet: {
    backgroundColor: colors.background,
    borderTopLeftRadius: radius.lg,
    borderTopRightRadius: radius.lg,
    paddingHorizontal: spacing.lg,
    paddingTop: spacing.md,
    maxHeight: '88%',
  },
  titleRow: {
    flexDirection: 'row',
    justifyContent: 'space-between',
    alignItems: 'center',
    marginBottom: spacing.sm,
  },
  title: {
    color: colors.textPrimary,
    fontSize: 20,
    fontWeight: '700',
  },
  closeButton: {
    width: 30,
    height: 30,
    borderRadius: 15,
    backgroundColor: colors.card,
    alignItems: 'center',
    justifyContent: 'center',
  },
  closeButtonPressed: {
    backgroundColor: colors.cardPressed,
  },
  closeButtonText: {
    color: colors.textSecondary,
    fontSize: 14,
    fontWeight: '700',
  },
  sectionHeader: {
    color: colors.textSecondary,
    fontSize: 13,
    fontWeight: '600',
    textTransform: 'uppercase',
    letterSpacing: 1.2,
    marginTop: spacing.md,
    marginBottom: spacing.sm,
  },
  sectionNote: {
    color: colors.textMuted,
    fontSize: 13,
    lineHeight: 18,
    marginTop: spacing.sm,
  },
  card: {
    backgroundColor: colors.card,
    borderRadius: radius.md,
    overflow: 'hidden',
  },
  row: {
    flexDirection: 'row',
    alignItems: 'center',
    paddingHorizontal: spacing.md,
    paddingVertical: spacing.sm + 4,
  },
  rowDivider: {
    borderTopWidth: StyleSheet.hairlineWidth,
    borderTopColor: colors.border,
  },
  rowPressed: {
    backgroundColor: colors.cardPressed,
  },
  currencySymbol: {
    color: colors.textPrimary,
    fontSize: 16,
    fontWeight: '700',
    width: 48,
    fontVariant: ['tabular-nums'],
  },
  currencyName: {
    color: colors.textPrimary,
    fontSize: 16,
    flex: 1,
  },
  currencyCode: {
    color: colors.textMuted,
    fontSize: 14,
    fontWeight: '600',
    marginRight: spacing.sm,
  },
  checkmark: {
    color: colors.accent,
    fontSize: 17,
    fontWeight: '800',
  },
  budgetRow: {
    flexDirection: 'row',
    alignItems: 'center',
    paddingHorizontal: spacing.md,
  },
  budgetSymbol: {
    color: colors.textSecondary,
    fontSize: 18,
    fontWeight: '600',
    marginRight: spacing.sm,
  },
  budgetInput: {
    flex: 1,
    color: colors.textPrimary,
    fontSize: 18,
    fontWeight: '700',
    paddingVertical: spacing.sm + 4,
    fontVariant: ['tabular-nums'],
  },
  accountEmail: {
    color: colors.textPrimary,
    fontSize: 16,
    flex: 1,
  },
  signOutText: {
    color: colors.danger,
    fontSize: 16,
    fontWeight: '600',
  },
  comingSoonEmoji: {
    fontSize: 16,
    width: 48,
    opacity: 0.5,
  },
  comingSoonLabel: {
    color: colors.textMuted,
    fontSize: 16,
    flex: 1,
  },
  comingSoonTag: {
    color: colors.textMuted,
    fontSize: 12,
    fontWeight: '700',
    textTransform: 'uppercase',
    letterSpacing: 0.8,
    backgroundColor: colors.background,
    borderRadius: radius.sm,
    paddingHorizontal: spacing.sm,
    paddingVertical: 3,
  },
});
