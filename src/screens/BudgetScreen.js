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
import { useT } from '../i18n';
import { getCurrency } from '../currency';
import { formatMoney, isValidAmountText } from '../format';
import { getCategoryLabel } from '../categories';
import { HIcon } from '../icons';
import {
  budgetAmountPercent,
  categoryBudgetUpdate,
  fitAllocatedBudgetsToOverall,
  hasUsableOverallBudget,
  remainingBudget,
  totalAllocatedBudget,
} from '../budget';

// Every budget on this sheet is TYPED, not dragged: the proportion sliders that
// used to sit on the category rows are gone — landing on an exact figure with a
// 5%-snapping thumb was fiddly, and the number was the point.

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
    const saved = onCommit(committed);
    setText(budgetToText(typeof saved === 'number' ? saved : committed, decimals));
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

// One category's budget line — tinted icon, name over its share of the overall
// budget, and the typed amount in a recessed field on the right. Both the
// regular and the external section render this; `percentLabel` is omitted for
// external categories, whose budgets sit outside the overall allocation.
function CategoryBudgetRow({ category, value, currency, percentLabel, divider, onCommit, styles, t }) {
  const label = getCategoryLabel(category, t);

  return (
    <View style={[styles.categoryRow, divider && styles.rowDivider]}>
      <View style={[styles.categoryIconWrap, { backgroundColor: `${category.color}1F` }]}>
        <HIcon name={category.emoji} size={18} color={category.color} />
      </View>
      <View style={styles.categoryNameWrap}>
        <Text style={styles.categoryLabel} numberOfLines={1}>
          {label}
        </Text>
        {percentLabel ? <Text style={styles.categoryPercent}>{percentLabel}</Text> : null}
      </View>
      <View style={styles.amountField}>
        <Text style={styles.categorySymbol}>{currency.symbol}</Text>
        <AmountField
          value={value}
          decimals={currency.decimals}
          onCommit={onCommit}
          style={styles.categoryBudgetInput}
          accessibilityLabel={label}
        />
      </View>
    </View>
  );
}

export default function BudgetScreen({ visible, settings, regularCategories, externalCategories, onUpdateSettings, onClose }) {
  const { colors } = useTheme();
  const t = useT();
  const insets = useSafeAreaInsets();
  const styles = useMemo(() => createStyles(colors), [colors]);

  // The display currency is chosen on the Insight page's Budget card header
  // (the sheet no longer has a currency section); it still drives the symbols
  // and decimal precision of every input here.
  const currency = getCurrency(settings.displayCurrency);
  // Stale caches from before the budget feature may lack categoryBudgets.
  const categoryBudgets = settings.categoryBudgets ?? {};
  const overallBudget = settings.monthlyBudget ?? 0;
  const regularCategoryIds = useMemo(() => regularCategories.map((category) => category.id), [regularCategories]);
  const canAllocate = hasUsableOverallBudget(overallBudget);
  const allocated = totalAllocatedBudget(categoryBudgets, regularCategoryIds);
  const remaining = remainingBudget(overallBudget, categoryBudgets, regularCategoryIds, currency.decimals);

  const commitOverall = (committed) => {
    if (committed !== (settings.monthlyBudget ?? 0)) {
      onUpdateSettings({
        monthlyBudget: committed,
        categoryBudgets: fitAllocatedBudgetsToOverall(
          categoryBudgets,
          regularCategoryIds,
          committed,
          currency.decimals
        ),
      });
    }
    return committed;
  };

  const commitCategory = (id, committed, external = false) => {
    const update = categoryBudgetUpdate({
      categoryId: id,
      amount: committed,
      overallBudget,
      categoryBudgets,
      categoryIds: regularCategoryIds,
      decimals: currency.decimals,
      external,
    });
    if (update.categoryBudgets[id] !== categoryBudgets[id]) {
      onUpdateSettings({ categoryBudgets: update.categoryBudgets });
    }
    return update.amount;
  };

  // "n%" under a regular category's name — the share of the overall budget the
  // slider's fill used to show at a glance. Null (so no caption) when there's no
  // overall budget to be a percentage of.
  const percentLabelFor = (value) => {
    const percent = budgetAmountPercent(value, overallBudget);
    return percent == null ? null : `${Math.round(percent)}%`;
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

            <Text style={styles.sectionHeader}>{t('budget.categorySection')}</Text>
            {/* How much of the overall budget the typed category figures use up
                — the ceiling each field is clamped to, now that no slider track
                shows it. */}
            {canAllocate && (
              <View style={styles.allocationSummary}>
                <Text style={styles.allocationText}>
                  {t('budget.allocatedOf', {
                    allocated: formatMoney(allocated, settings.displayCurrency),
                    total: formatMoney(overallBudget, settings.displayCurrency),
                  })}
                </Text>
                <Text style={[styles.allocationText, remaining === 0 && styles.allocationTextEmpty]}>
                  {t('budget.remainingOf', { amount: formatMoney(remaining, settings.displayCurrency) })}
                </Text>
              </View>
            )}
            <View style={styles.card}>
              {regularCategories.map((category, index) => (
                <CategoryBudgetRow
                  key={category.id}
                  category={category}
                  value={categoryBudgets[category.id] ?? 0}
                  currency={currency}
                  percentLabel={percentLabelFor(categoryBudgets[category.id] ?? 0)}
                  divider={index > 0}
                  onCommit={(committed) => commitCategory(category.id, committed)}
                  styles={styles}
                  t={t}
                />
              ))}
            </View>

            <Text style={styles.sectionHeader}>{t('budget.externalSection')}</Text>
            <View style={styles.card}>
              {externalCategories.map((category, index) => (
                <CategoryBudgetRow
                  key={category.id}
                  category={category}
                  value={categoryBudgets[category.id] ?? 0}
                  currency={currency}
                  divider={index > 0}
                  onCommit={(committed) => commitCategory(category.id, committed, true)}
                  styles={styles}
                  t={t}
                />
              ))}
            </View>
            <Text style={styles.sectionNote}>{t('budget.externalNote')}</Text>
          </ScrollView>
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
      letterSpacing: 0.2,
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
    rowDivider: {
      borderTopWidth: StyleSheet.hairlineWidth,
      borderTopColor: colors.border,
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
    allocationSummary: {
      flexDirection: 'row',
      justifyContent: 'space-between',
      alignItems: 'center',
      gap: spacing.sm,
      marginBottom: spacing.sm,
      paddingHorizontal: spacing.xs,
    },
    allocationText: {
      color: colors.textMuted,
      fontFamily: fonts.numMedium,
      fontSize: 12,
      fontVariant: ['tabular-nums'],
      flexShrink: 1,
    },
    allocationTextEmpty: {
      color: colors.warning,
    },
    categoryRow: {
      flexDirection: 'row',
      alignItems: 'center',
      paddingHorizontal: spacing.md,
      paddingVertical: spacing.sm,
      gap: spacing.sm,
    },
    categoryIconWrap: {
      width: 30,
      height: 30,
      borderRadius: 15,
      alignItems: 'center',
      justifyContent: 'center',
    },
    categoryNameWrap: {
      flex: 1,
      minWidth: 0,
    },
    categoryPercent: {
      color: colors.textMuted,
      fontFamily: fonts.numRegular,
      fontSize: 12,
      lineHeight: 14,
      fontVariant: ['tabular-nums'],
    },
    categoryLabel: {
      color: colors.textPrimary,
      fontFamily: fonts.regular,
      fontSize: 15,
    },
    // A recessed, bordered field: with the slider gone this is the row's only
    // control, so it has to read as "type a number here" rather than as a
    // right-aligned readout.
    amountField: {
      flexDirection: 'row',
      alignItems: 'center',
      width: 120,
      gap: 2,
      paddingHorizontal: spacing.sm + 2,
      borderRadius: radius.sm,
      backgroundColor: colors.background,
      borderWidth: StyleSheet.hairlineWidth,
      borderColor: colors.border,
    },
    categorySymbol: {
      color: colors.textMuted,
      fontFamily: fonts.numRegular,
      fontSize: 14,
      fontVariant: ['tabular-nums'],
    },
    categoryBudgetInput: {
      flex: 1,
      minWidth: 0,
      color: colors.textPrimary,
      fontFamily: fonts.numBold,
      fontSize: 15,
      textAlign: 'right',
      paddingVertical: spacing.sm + 2,
      fontVariant: ['tabular-nums'],
    },
  });
