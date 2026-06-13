import { useMemo } from 'react';
import { Pressable, ScrollView, StyleSheet, Text, View } from 'react-native';
import SummaryHeader from '../components/SummaryHeader';
import BudgetGauge from '../components/BudgetGauge';
import { fonts, spacing, radius, useTheme } from '../theme';
import { useT } from '../i18n';
import { formatMoneyShort } from '../format';
import { getCurrency } from '../currency';
import { REGULAR_CATEGORIES, EXTERNAL_CATEGORIES } from '../categories';

export default function DashboardScreen({
  loaded,
  hasExpenses,
  monthTotal,
  todayTotal,
  monthCount,
  avgPerDay,
  totalsByCategory,
  displayCurrency,
  monthlyBudget,
  categoryBudgets,
  onEditBudgets,
  onLoadDemo,
}) {
  const { colors } = useTheme();
  const t = useT();
  const styles = useMemo(() => createStyles(colors), [colors]);

  const budgetedCategories = REGULAR_CATEGORIES.filter(
    (category) => (categoryBudgets?.[category.id] ?? 0) > 0
  );
  const budgetedExternal = EXTERNAL_CATEGORIES.filter(
    (category) => (categoryBudgets?.[category.id] ?? 0) > 0
  );
  const hasBudgets = monthlyBudget > 0 || budgetedCategories.length > 0;

  const regularSpent = REGULAR_CATEGORIES.reduce(
    (sum, category) => sum + (totalsByCategory[category.id] ?? 0),
    0
  );
  const externalSpent = EXTERNAL_CATEGORIES.reduce(
    (sum, category) => sum + (totalsByCategory[category.id] ?? 0),
    0
  );

  const gaugeBudget =
    monthlyBudget > 0
      ? monthlyBudget
      : budgetedCategories.reduce((sum, category) => sum + categoryBudgets[category.id], 0);
  const gaugeSpent =
    monthlyBudget > 0
      ? regularSpent
      : budgetedCategories.reduce(
          (sum, category) => sum + (totalsByCategory[category.id] ?? 0),
          0
        );

  // Compare at display precision so a sub-cent float residue can't flip a row
  // red while both rendered numbers look identical (same rule as BudgetGauge).
  const factor = 10 ** getCurrency(displayCurrency).decimals;

  return (
    <ScrollView
      style={styles.container}
      contentContainerStyle={styles.content}
      showsVerticalScrollIndicator={false}
    >
      <SummaryHeader
        monthTotal={monthTotal}
        todayTotal={todayTotal}
        count={monthCount}
        avgPerDay={avgPerDay}
        displayCurrency={displayCurrency}
      />

      {hasExpenses && (
        <Pressable
          onPress={onEditBudgets}
          accessibilityRole="button"
          style={({ pressed }) => [styles.card, pressed && styles.cardPressed]}
        >
          <View style={styles.cardHeader}>
            <Text style={styles.cardTitle}>{t('budget.title')}</Text>
            <Text style={styles.editLabel}>{t('budget.edit')}</Text>
          </View>

          <BudgetGauge
            spent={gaugeSpent}
            budget={gaugeBudget}
            displayCurrency={displayCurrency}
            empty={!hasBudgets}
          />

          {hasBudgets && budgetedCategories.length > 0 && (
            <>
              <View style={styles.divider} />
              <Text style={styles.cardTitle}>{t('budget.categoryTitle')}</Text>
              {budgetedCategories.map((category) => {
                const budget = categoryBudgets[category.id];
                const spent =
                  Math.round((totalsByCategory[category.id] ?? 0) * factor) / factor;
                const over = spent > budget;
                return (
                  <View key={category.id} style={styles.categoryRow}>
                    <Text style={styles.categoryEmoji}>{category.emoji}</Text>
                    <View style={styles.categoryBarArea}>
                      <View style={styles.categoryLabels}>
                        <Text style={styles.categoryName}>{t('cat.' + category.id)}</Text>
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
                              width: `${Math.min(100, (spent / budget) * 100)}%`,
                              backgroundColor: over ? colors.danger : category.color,
                            },
                          ]}
                        />
                      </View>
                    </View>
                  </View>
                );
              })}
            </>
          )}

          {externalSpent > 0 && (
            <>
              <View style={styles.divider} />
              <View style={styles.externalRow}>
                <Text style={styles.externalLabel}>{t('budget.externalTotal')}</Text>
                <Text style={styles.externalAmount}>
                  {formatMoneyShort(externalSpent, displayCurrency)}
                </Text>
              </View>
              {budgetedExternal.map((category) => {
                const budget = categoryBudgets[category.id];
                const spent =
                  Math.round((totalsByCategory[category.id] ?? 0) * factor) / factor;
                const over = spent > budget;
                return (
                  <View key={category.id} style={styles.categoryRow}>
                    <Text style={styles.categoryEmoji}>{category.emoji}</Text>
                    <View style={styles.categoryBarArea}>
                      <View style={styles.categoryLabels}>
                        <Text style={styles.categoryName}>{t('cat.' + category.id)}</Text>
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
                              width: `${Math.min(100, (spent / budget) * 100)}%`,
                              backgroundColor: over ? colors.danger : category.color,
                            },
                          ]}
                        />
                      </View>
                    </View>
                  </View>
                );
              })}
            </>
          )}
        </Pressable>
      )}

      {loaded && !hasExpenses && (
        <View style={styles.emptyState}>
          <Text style={styles.emptyEmoji}>{'\u{1F4B8}'}</Text>
          <Text style={styles.emptyTitle}>{t('empty.title')}</Text>
          <Text style={styles.emptyHint}>{t('empty.hint')}</Text>
          <Pressable
            onPress={onLoadDemo}
            accessibilityRole="button"
            style={({ pressed }) => [styles.demoButton, pressed && styles.demoButtonPressed]}
          >
            <Text style={styles.demoButtonText}>{t('empty.loadDemo')}</Text>
          </Pressable>
        </View>
      )}
    </ScrollView>
  );
}

const createStyles = (colors) =>
  StyleSheet.create({
    container: {
      flex: 1,
    },
    content: {
      flexGrow: 1,
      // The tab bar is in-flow below the screen; this only clears the floating
      // + button's overhang above the bar.
      paddingBottom: spacing.xl,
    },
    card: {
      backgroundColor: colors.card,
      borderRadius: radius.md,
      padding: spacing.md,
      marginHorizontal: spacing.md,
      marginBottom: spacing.lg,
    },
    cardPressed: {
      backgroundColor: colors.cardPressed,
    },
    cardHeader: {
      flexDirection: 'row',
      justifyContent: 'space-between',
      alignItems: 'center',
      marginBottom: spacing.sm + 4,
    },
    cardTitle: {
      color: colors.textSecondary,
      fontFamily: fonts.bold,
      fontSize: 13,
      textTransform: 'uppercase',
      letterSpacing: 0.8,
    },
    editPressed: {
      opacity: 0.6,
    },
    editLabel: {
      color: colors.accent,
      fontFamily: fonts.bold,
      fontSize: 14,
    },
    divider: {
      height: StyleSheet.hairlineWidth,
      backgroundColor: colors.border,
      marginVertical: spacing.md,
    },
    categoryRow: {
      flexDirection: 'row',
      alignItems: 'center',
      marginTop: spacing.sm + 4,
    },
    categoryEmoji: {
      fontSize: 22,
      width: 34,
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
      fontSize: 14,
      flexShrink: 1,
      marginRight: spacing.sm,
    },
    categoryAmount: {
      color: colors.textSecondary,
      fontFamily: fonts.regular,
      fontSize: 13,
      fontVariant: ['tabular-nums'],
    },
    categoryTrack: {
      height: 8,
      borderRadius: 4,
      backgroundColor: colors.background,
      overflow: 'hidden',
    },
    categoryFill: {
      height: '100%',
      borderRadius: 4,
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
      fontSize: 13,
      textTransform: 'uppercase',
      letterSpacing: 0.8,
    },
    externalAmount: {
      color: colors.textSecondary,
      fontFamily: fonts.bold,
      fontSize: 14,
      fontVariant: ['tabular-nums'],
    },
    emptyState: {
      flex: 1,
      alignItems: 'center',
      justifyContent: 'center',
      paddingHorizontal: spacing.xl,
      paddingBottom: spacing.xl,
    },
    emptyEmoji: {
      fontSize: 56,
    },
    emptyTitle: {
      color: colors.textPrimary,
      fontFamily: fonts.bold,
      fontSize: 20,
      marginTop: spacing.md,
    },
    emptyHint: {
      color: colors.textSecondary,
      fontFamily: fonts.regular,
      fontSize: 15,
      lineHeight: 22,
      textAlign: 'center',
      marginTop: spacing.sm,
    },
    demoButton: {
      backgroundColor: colors.card,
      borderRadius: radius.md,
      paddingVertical: spacing.sm + 4,
      paddingHorizontal: spacing.lg,
      marginTop: spacing.lg,
    },
    demoButtonPressed: {
      backgroundColor: colors.cardPressed,
    },
    demoButtonText: {
      color: colors.accent,
      fontFamily: fonts.bold,
      fontSize: 16,
    },
  });
