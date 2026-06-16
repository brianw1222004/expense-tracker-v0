import { useEffect, useMemo, useState } from 'react';
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
import { fonts, radius, spacing, useTheme } from '../theme';
import { useT } from '../i18n';
import { CURRENCIES, getCurrency } from '../currency';
import { isValidAmountText } from '../format';
import { getCategoryLabel } from '../categories';
import { HIcon } from '../icons';


function budgetToText(value, decimals) {
  if (!(value > 0)) return '';
  return Number.isInteger(value) ? String(value) : value.toFixed(decimals);
}

// One budget input. Owns its draft text and re-syncs from the stored value —
// a currency switch re-denominates every budget in App.js, so the prop can
// change under a field that was never touched.
function AmountField({ value, decimals, onCommit, style, accessibilityLabel }) {
  const { colors } = useTheme();
  const [text, setText] = useState(() => budgetToText(value, decimals));

  useEffect(() => {
    setText(budgetToText(value, decimals));
  }, [value, decimals]);

  const commit = () => {
    const normalized = text.trim().replace(/,(\d{3})\b/g, '$1').replace(',', '.');
    const parsed = parseFloat(normalized);
    const isValid = isValidAmountText(normalized, decimals) && parsed > 0;
    const committed = isValid ? Number(parsed.toFixed(decimals)) : 0;
    setText(budgetToText(committed, decimals));
    onCommit(committed);
  };

  return (
    <TextInput
      style={style}
      value={text}
      onChangeText={setText}
      // onBlur, not onEndEditing: react-native-web never fires the latter,
      // which would silently drop the budget on web.
      onBlur={commit}
      onSubmitEditing={commit}
      placeholder="0"
      placeholderTextColor={colors.textMuted}
      keyboardType={decimals === 0 ? 'number-pad' : 'decimal-pad'}
      keyboardAppearance={colors.keyboardAppearance}
      returnKeyType="done"
      maxLength={9}
      accessibilityLabel={accessibilityLabel}
    />
  );
}

export default function BudgetScreen({ visible, settings, regularCategories, externalCategories, onUpdateSettings, onClose }) {
  const { colors } = useTheme();
  const t = useT();
  const insets = useSafeAreaInsets();
  const styles = useMemo(() => createStyles(colors), [colors]);

  const currency = getCurrency(settings.displayCurrency);
  // Stale caches from before the budget feature may lack categoryBudgets.
  const categoryBudgets = settings.categoryBudgets ?? {};

  const commitOverall = (committed) => {
    if (committed !== (settings.monthlyBudget ?? 0)) {
      onUpdateSettings({ monthlyBudget: committed });
    }
  };

  const commitCategory = (id, committed) => {
    if (committed === (categoryBudgets[id] ?? 0)) return;
    // 0 means "no limit": remove the key rather than storing zeros forever.
    const next = { ...categoryBudgets };
    if (committed > 0) next[id] = committed;
    else delete next[id];
    onUpdateSettings({ categoryBudgets: next });
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
            <Text style={styles.title}>{t('budget.sheetTitle')}</Text>
            <Pressable
              onPress={onClose}
              hitSlop={12}
              accessibilityRole="button"
              accessibilityLabel={t('common.close')}
              style={({ pressed }) => [styles.closeButton, pressed && styles.closeButtonPressed]}
            >
              <HIcon name="cancel-01" size={20} color={colors.icon} />
            </Pressable>
          </View>

          <ScrollView
            keyboardShouldPersistTaps="handled"
            contentContainerStyle={{ paddingBottom: spacing.xl + insets.bottom }}
            showsVerticalScrollIndicator={false}
          >
            <Text style={styles.sectionHeader}>{t('budget.currencySection')}</Text>
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
                    {selected && <HIcon name="tick-01" size={16} color={colors.accent} />}
                  </Pressable>
                );
              })}
            </View>
            <Text style={styles.sectionNote}>{t('budget.currencyNote')}</Text>

            <Text style={styles.sectionHeader}>{t('budget.overallSection')}</Text>
            <View style={styles.card}>
              <View style={styles.budgetRow}>
                <Text style={styles.budgetSymbol}>{currency.symbol}</Text>
                <AmountField
                  key="overall"
                  value={settings.monthlyBudget ?? 0}
                  decimals={currency.decimals}
                  onCommit={commitOverall}
                  style={styles.budgetInput}
                  accessibilityLabel={t('budget.overallSection')}
                />
              </View>
            </View>
            <Text style={styles.sectionNote}>{t('budget.overallNote')}</Text>

            <Text style={styles.sectionHeader}>{t('budget.categorySection')}</Text>
            <View style={styles.card}>
              {regularCategories.map((category, index) => (
                <View
                  key={category.id}
                  style={[styles.categoryRow, index > 0 && styles.rowDivider]}
                >
                  <HIcon name={category.emoji} size={18} color={category.color} />
                  <Text style={styles.categoryLabel} numberOfLines={1}>
                    {getCategoryLabel(category, t)}
                  </Text>
                  <Text style={styles.categorySymbol}>{currency.symbol}</Text>
                  <AmountField
                    key={category.id}
                    value={categoryBudgets[category.id] ?? 0}
                    decimals={currency.decimals}
                    onCommit={(committed) => commitCategory(category.id, committed)}
                    style={styles.categoryInput}
                    accessibilityLabel={getCategoryLabel(category, t)}
                  />
                </View>
              ))}
            </View>
            <Text style={styles.sectionNote}>{t('budget.categoryNote')}</Text>

            <Text style={styles.sectionHeader}>{t('budget.externalSection')}</Text>
            <View style={styles.card}>
              {externalCategories.map((category, index) => (
                <View
                  key={category.id}
                  style={[styles.categoryRow, index > 0 && styles.rowDivider]}
                >
                  <HIcon name={category.emoji} size={18} color={category.color} />
                  <Text style={styles.categoryLabel} numberOfLines={1}>
                    {getCategoryLabel(category, t)}
                  </Text>
                  <Text style={styles.categorySymbol}>{currency.symbol}</Text>
                  <AmountField
                    key={category.id}
                    value={categoryBudgets[category.id] ?? 0}
                    decimals={currency.decimals}
                    onCommit={(committed) => commitCategory(category.id, committed)}
                    style={styles.categoryInput}
                    accessibilityLabel={getCategoryLabel(category, t)}
                  />
                </View>
              ))}
            </View>
            <Text style={styles.sectionNote}>{t('budget.externalNote')}</Text>
          </ScrollView>
        </View>
      </KeyboardAvoidingView>
    </Modal>
  );
}

const createStyles = (colors) =>
  StyleSheet.create({
    overlay: {
      flex: 1,
      justifyContent: 'flex-end',
    },
    backdrop: {
      backgroundColor: colors.backdrop,
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
      fontFamily: fonts.bold,
      fontSize: 18,
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
    sectionHeader: {
      color: colors.textSecondary,
      fontFamily: fonts.bold,
      fontSize: 13,
      textTransform: 'uppercase',
      letterSpacing: 1.2,
      marginTop: spacing.md,
      marginBottom: spacing.sm,
    },
    sectionNote: {
      color: colors.textMuted,
      fontFamily: fonts.regular,
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
      fontFamily: fonts.bold,
      fontSize: 15,
      width: 48,
      fontVariant: ['tabular-nums'],
    },
    currencyName: {
      color: colors.textPrimary,
      fontFamily: fonts.regular,
      fontSize: 15,
      flex: 1,
    },
    currencyCode: {
      color: colors.textMuted,
      fontFamily: fonts.bold,
      fontSize: 13,
      marginRight: spacing.sm,
    },
    budgetRow: {
      flexDirection: 'row',
      alignItems: 'center',
      paddingHorizontal: spacing.md,
    },
    budgetSymbol: {
      color: colors.textSecondary,
      fontFamily: fonts.bold,
      fontSize: 16,
      marginRight: spacing.sm,
    },
    budgetInput: {
      flex: 1,
      color: colors.textPrimary,
      fontFamily: fonts.bold,
      fontSize: 16,
      paddingVertical: spacing.sm + 4,
      fontVariant: ['tabular-nums'],
    },
    // Vertical padding lives on the input so the whole row height is tappable.
    categoryRow: {
      flexDirection: 'row',
      alignItems: 'center',
      paddingHorizontal: spacing.md,
      gap: 8,
    },
    categoryLabel: {
      color: colors.textPrimary,
      fontFamily: fonts.regular,
      fontSize: 15,
      flex: 1,
      marginRight: spacing.sm,
    },
    categorySymbol: {
      color: colors.textMuted,
      fontFamily: fonts.regular,
      fontSize: 14,
      marginRight: spacing.xs,
      fontVariant: ['tabular-nums'],
    },
    categoryInput: {
      width: 110,
      color: colors.textPrimary,
      fontFamily: fonts.bold,
      fontSize: 15,
      textAlign: 'right',
      paddingVertical: spacing.sm + 4,
      fontVariant: ['tabular-nums'],
    },
  });
