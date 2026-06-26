import React, { useMemo } from 'react';
import { Pressable, ScrollView, StyleSheet, Text, View } from 'react-native';
import { useSafeAreaInsets } from 'react-native-safe-area-context';
import BudgetGauge from '../components/BudgetGauge';
import EmptyState from '../components/EmptyState';
import { TAB_BAR_HEIGHT } from '../components/TabBar';
import { fonts, spacing, radius, useTheme } from '../theme';
import { useT } from '../i18n';
import { formatMoneyShort } from '../format';
import { getCurrency } from '../currency';
import { getCategoryLabel } from '../categories';
import { HIcon } from '../icons';

// The Insight tab. Holds the budget overview (gauge), per-category budget bars
// and the external-categories breakdown — the budget block that used to live on
// the Dashboard, now broken out into its own page sections (not one widget).
export default function InsightScreen({
  loaded,
  hasExpenses,
  displayCurrency,
  monthlyBudget,
  categoryBudgets,
  totalsByCategory,
  regularCategories,
  externalCategories,
  onEditBudgets,
  onAddPress,
  onLoadDemo,
}) {
  const { colors } = useTheme();
  const t = useT();
  const insets = useSafeAreaInsets();
  const styles = useMemo(() => createStyles(colors), [colors]);

  const budgetedCategories = regularCategories.filter(
    (category) => (categoryBudgets?.[category.id] ?? 0) > 0
  );
  const budgetedExternal = externalCategories.filter(
    (category) => (categoryBudgets?.[category.id] ?? 0) > 0
  );
  const hasBudgets = monthlyBudget > 0 || budgetedCategories.length > 0;

  const regularSpent = regularCategories.reduce(
    (sum, category) => sum + (totalsByCategory[category.id] ?? 0),
    0
  );
  const externalSpent = externalCategories.reduce(
    (sum, category) => sum + (totalsByCategory[category.id] ?? 0),
    0
  );

  const gaugeBudget =
    monthlyBudget > 0
      ? monthlyBudget
      : budgetedCategories.reduce((sum, category) => sum + (categoryBudgets[category.id] ?? 0), 0);
  const gaugeSpent =
    monthlyBudget > 0
      ? regularSpent
      : budgetedCategories.reduce(
          (sum, category) => sum + (totalsByCategory[category.id] ?? 0),
          0
        );

  const factor = 10 ** getCurrency(displayCurrency).decimals;

  return (
    <View style={styles.container}>
      <ScrollView
        contentContainerStyle={[styles.content, { paddingBottom: spacing.xl + TAB_BAR_HEIGHT + insets.bottom }]}
        showsVerticalScrollIndicator={false}
      >
        <Text style={styles.title}>{t('insight.title')}</Text>

        {/* Hold the budget cards until data has loaded so a cold launch never
            flashes an empty "No budget set" gauge before the cache resolves. */}
        {!loaded ? null : !hasExpenses ? (
          <EmptyState onAdd={onAddPress} onLoadDemo={onLoadDemo} colors={colors} t={t} />
        ) : (
          <>
            {/* Budget overview — the gauge of spent vs. budget */}
            <View style={styles.card}>
              <View style={styles.cardHeader}>
                <Text style={styles.cardTitle}>{t('budget.title')}</Text>
                <Pressable
                  onPress={onEditBudgets}
                  accessibilityRole="button"
                  hitSlop={10}
                  style={({ pressed }) => [styles.editPill, pressed && styles.editPillPressed]}
                >
                  <Text style={styles.editPillText}>{t('budget.edit')}</Text>
                </Pressable>
              </View>
              <BudgetGauge
                spent={gaugeSpent}
                budget={gaugeBudget}
                displayCurrency={displayCurrency}
                empty={!hasBudgets}
              />
            </View>

            {/* Per-category budgets */}
            {hasBudgets && budgetedCategories.length > 0 && (
              <View style={styles.card}>
                <Text style={styles.sectionTitle}>{t('budget.categoryTitle')}</Text>
                {budgetedCategories.map((category) => (
                  <CategoryBar
                    key={category.id}
                    category={category}
                    budget={categoryBudgets[category.id]}
                    spent={Math.round((totalsByCategory[category.id] ?? 0) * factor) / factor}
                    displayCurrency={displayCurrency}
                    styles={styles}
                    colors={colors}
                    t={t}
                  />
                ))}
              </View>
            )}

            {/* External categories (tracked separately from the overall budget) */}
            {externalSpent > 0 && (
              <View style={styles.card}>
                <View style={styles.externalRow}>
                  <Text style={styles.externalLabel}>{t('budget.externalTotal')}</Text>
                  <Text style={styles.externalAmount}>
                    {formatMoneyShort(externalSpent, displayCurrency)}
                  </Text>
                </View>
                {budgetedExternal.map((category) => (
                  <CategoryBar
                    key={category.id}
                    category={category}
                    budget={categoryBudgets[category.id]}
                    spent={Math.round((totalsByCategory[category.id] ?? 0) * factor) / factor}
                    displayCurrency={displayCurrency}
                    styles={styles}
                    colors={colors}
                    t={t}
                  />
                ))}
              </View>
            )}
          </>
        )}
      </ScrollView>
    </View>
  );
}

const CategoryBar = React.memo(function CategoryBar({ category, budget, spent, displayCurrency, styles, colors, t }) {
  const over = spent > budget;
  return (
    <View style={styles.categoryRow}>
      <HIcon name={category.emoji} size={18} color={category.color} />
      <View style={styles.categoryBarArea}>
        <View style={styles.categoryLabels}>
          <Text style={styles.categoryName}>{getCategoryLabel(category, t)}</Text>
          <Text style={styles.categoryAmount}>
            {t('budget.spentOf', {
              spent: formatMoneyShort(spent, displayCurrency),
              budget: formatMoneyShort(budget, displayCurrency),
            })}
          </Text>
        </View>
        <View style={styles.categoryTrack}>
          <View
            style={[
              styles.categoryFill,
              {
                width: `${budget > 0 ? Math.min(100, (spent / budget) * 100) : 0}%`,
                backgroundColor: over ? colors.danger : category.color,
              },
            ]}
          />
        </View>
      </View>
    </View>
  );
});

const CARD_SHADOW = {
  shadowColor: '#000',
  shadowOffset: { width: 0, height: 1 },
  shadowOpacity: 0.06,
  shadowRadius: 8,
  elevation: 1,
};

const createStyles = (colors) =>
  StyleSheet.create({
    container: {
      flex: 1,
      backgroundColor: colors.background,
    },
    content: {
      // flexGrow lets the empty state (flex:1) fill and center below the title
      // when there are no expenses yet.
      flexGrow: 1,
      paddingHorizontal: spacing.md,
      // Centered title keeps content clear of the floating account button at the
      // top-left; paddingBottom is applied inline (adds the safe-area inset).
      paddingTop: spacing.md,
    },
    title: {
      color: colors.textPrimary,
      fontSize: 26,
      fontFamily: fonts.bold,
      textAlign: 'center',
      marginBottom: spacing.md,
    },
    card: {
      backgroundColor: colors.card,
      borderRadius: radius.md,
      padding: spacing.md,
      marginBottom: spacing.md,
      ...CARD_SHADOW,
    },
    cardHeader: {
      flexDirection: 'row',
      justifyContent: 'space-between',
      alignItems: 'center',
      marginBottom: spacing.md,
    },
    cardTitle: {
      color: colors.textPrimary,
      fontFamily: fonts.bold,
      fontSize: 15,
    },
    sectionTitle: {
      color: colors.textSecondary,
      fontFamily: fonts.bold,
      fontSize: 12,
      textTransform: 'uppercase',
      letterSpacing: 0.8,
      marginBottom: spacing.xs,
    },
    // A bordered pill for the "Edit budgets" action.
    editPill: {
      backgroundColor: colors.background,
      borderWidth: StyleSheet.hairlineWidth,
      borderColor: colors.border,
      borderRadius: 10,
      paddingHorizontal: spacing.sm + 2,
      height: 24,
      alignItems: 'center',
      justifyContent: 'center',
    },
    editPillPressed: {
      backgroundColor: colors.cardPressed,
    },
    editPillText: {
      color: colors.accent,
      fontFamily: fonts.bold,
      fontSize: 12,
    },
    categoryRow: {
      flexDirection: 'row',
      alignItems: 'center',
      marginTop: spacing.sm + 4,
      gap: spacing.sm,
    },
    categoryBarArea: {
      flex: 1,
    },
    categoryLabels: {
      flexDirection: 'row',
      justifyContent: 'space-between',
      alignItems: 'baseline',
      marginBottom: 4,
    },
    categoryName: {
      color: colors.textPrimary,
      fontFamily: fonts.bold,
      fontSize: 13,
      flexShrink: 1,
      marginRight: spacing.sm,
    },
    categoryAmount: {
      color: colors.textSecondary,
      fontFamily: fonts.numRegular,
      fontSize: 12,
      fontVariant: ['tabular-nums'],
    },
    categoryTrack: {
      height: 6,
      borderRadius: 3,
      backgroundColor: colors.background,
      overflow: 'hidden',
    },
    categoryFill: {
      height: '100%',
      borderRadius: 3,
    },
    externalRow: {
      flexDirection: 'row',
      justifyContent: 'space-between',
      alignItems: 'center',
      marginBottom: spacing.xs,
    },
    externalLabel: {
      color: colors.textSecondary,
      fontFamily: fonts.bold,
      fontSize: 12,
      textTransform: 'uppercase',
      letterSpacing: 0.8,
    },
    externalAmount: {
      color: colors.textSecondary,
      fontFamily: fonts.numBold,
      fontSize: 13,
      fontVariant: ['tabular-nums'],
    },
  });
