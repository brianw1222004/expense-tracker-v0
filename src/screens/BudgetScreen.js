import { useEffect, useMemo, useState } from 'react';
import {
  Pressable,
  ScrollView,
  StyleSheet,
  Text,
  TextInput,
  View,
} from 'react-native';
import { useSafeAreaInsets } from 'react-native-safe-area-context';
import { fonts, radius, spacing, useTheme, panelShadow } from '../theme';
import Sheet from '../components/Sheet';
import CurrencyPill from '../components/CurrencyPill';
import CurrencyPicker from '../components/CurrencyPicker';
import { useT } from '../i18n';
import { getCurrency } from '../currency';
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
  const [currencyOpen, setCurrencyOpen] = useState(false);

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
    <Sheet
      visible={visible}
      onClose={onClose}
      avoidKeyboard
      sheetStyle={styles.sheetOverride}
    >
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
              <View style={styles.currencyPickRow}>
                <Text style={styles.currencyPickSymbol}>{currency.symbol}</Text>
                <Text style={styles.currencyPickName} numberOfLines={1}>{currency.name}</Text>
                <CurrencyPill
                  value={settings.displayCurrency}
                  onPress={() => setCurrencyOpen(true)}
                  accessibilityLabel={t('currency.choose')}
                />
              </View>
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

          <CurrencyPicker
            visible={currencyOpen}
            value={settings.displayCurrency}
            onSelect={(code) => {
              onUpdateSettings({ displayCurrency: code });
              setCurrencyOpen(false);
            }}
            onClose={() => setCurrencyOpen(false)}
          />
    </Sheet>
  );
}

const createStyles = (colors) =>
  StyleSheet.create({
    sheetOverride: {
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
      ...panelShadow,
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
      fontFamily: fonts.numBold,
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
    currencyPickRow: {
      flexDirection: 'row',
      alignItems: 'center',
      gap: spacing.sm,
      paddingHorizontal: spacing.md,
      paddingVertical: spacing.sm + 4,
    },
    currencyPickSymbol: {
      color: colors.textPrimary,
      fontFamily: fonts.numBold,
      fontSize: 15,
      width: 44,
      fontVariant: ['tabular-nums'],
    },
    currencyPickName: {
      color: colors.textPrimary,
      fontFamily: fonts.regular,
      fontSize: 15,
      flex: 1,
    },
    budgetRow: {
      flexDirection: 'row',
      alignItems: 'center',
      paddingHorizontal: spacing.md,
    },
    budgetSymbol: {
      color: colors.textSecondary,
      fontFamily: fonts.numBold,
      fontSize: 16,
      marginRight: spacing.sm,
    },
    budgetInput: {
      flex: 1,
      color: colors.textPrimary,
      fontFamily: fonts.numBold,
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
      fontFamily: fonts.numRegular,
      fontSize: 14,
      marginRight: spacing.xs,
      fontVariant: ['tabular-nums'],
    },
    categoryInput: {
      width: 110,
      color: colors.textPrimary,
      fontFamily: fonts.numBold,
      fontSize: 15,
      textAlign: 'right',
      paddingVertical: spacing.sm + 4,
      fontVariant: ['tabular-nums'],
    },
  });
