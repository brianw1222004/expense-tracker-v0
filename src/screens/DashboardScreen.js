import React, { useMemo, useState, useRef, useCallback } from 'react';
import { Animated, LayoutAnimation, Platform, Pressable, ScrollView, StyleSheet, Text, UIManager, View } from 'react-native';

if (Platform.OS === 'android') UIManager.setLayoutAnimationEnabledExperimental?.(true);
import { LinearGradient } from 'expo-linear-gradient';
import BudgetGauge from '../components/BudgetGauge';
import CurrencyDropdown from '../components/CurrencyDropdown';
import EmptyState from '../components/EmptyState';
import SpendingChart from '../components/SpendingChart';
import { TAB_BAR_HEIGHT } from '../components/TabBar';
import { fonts, spacing, radius, useTheme } from '../theme';
import { useT, useLanguage } from '../i18n';
import { formatMoney, formatMoneyShort, monthLabel } from '../format';
import { getCurrency } from '../currency';
import { getCategoryLabel } from '../categories';
import { HIcon } from '../icons';

export default function DashboardScreen({
  loaded,
  hasExpenses,
  monthTotal,
  lastMonthTotal,
  todayTotal,
  monthCount,
  avgPerDay,
  dailyTotals,
  totalsByCategory,
  displayCurrency,
  monthlyBudget,
  categoryBudgets,
  onEditBudgets,
  onChangeCurrency,
  onAddPress,
  onLoadDemo,
  regularCategories,
  externalCategories,
}) {
  const { colors } = useTheme();
  const t = useT();
  const language = useLanguage();
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
      : budgetedCategories.reduce((sum, category) => sum + categoryBudgets[category.id], 0);
  const gaugeSpent =
    monthlyBudget > 0
      ? regularSpent
      : budgetedCategories.reduce(
          (sum, category) => sum + (totalsByCategory[category.id] ?? 0),
          0
        );

  const factor = 10 ** getCurrency(displayCurrency).decimals;

  const delta = monthTotal - (lastMonthTotal ?? 0);
  const hasLastMonth = (lastMonthTotal ?? 0) > 0;
  const spentLess = delta < 0;

  const now = new Date();
  const daysInMonth = new Date(now.getFullYear(), now.getMonth() + 1, 0).getDate();
  const daysLeft = daysInMonth - now.getDate();

  const summaryData = [
    { key: 'today', value: formatMoneyShort(todayTotal, displayCurrency), label: t('dash.today'), color: colors.accent },
    { key: 'expenses', value: String(monthCount), label: t('dash.expenses'), color: colors.success },
    { key: 'avgPerDay', value: formatMoneyShort(avgPerDay, displayCurrency), label: t('dash.avgPerDay'), color: colors.warning },
    { key: 'daysLeft', value: String(daysLeft), label: t('dash.daysLeft'), color: colors.textMuted },
  ];

  const [summaryOpen, setSummaryOpen] = useState(true);
  const [budgetOpen, setBudgetOpen] = useState(true);
  const summaryRotate = useRef(new Animated.Value(0)).current;
  const budgetRotate = useRef(new Animated.Value(0)).current;

  const toggleSection = useCallback((section) => {
    LayoutAnimation.configureNext(LayoutAnimation.Presets.easeInEaseOut);
    if (section === 'summary') {
      setSummaryOpen((prev) => {
        const next = !prev;
        Animated.timing(summaryRotate, { toValue: next ? 0 : 1, duration: 250, useNativeDriver: true }).start();
        return next;
      });
    } else {
      setBudgetOpen((prev) => {
        const next = !prev;
        Animated.timing(budgetRotate, { toValue: next ? 0 : 1, duration: 250, useNativeDriver: true }).start();
        return next;
      });
    }
  }, [summaryRotate, budgetRotate]);

  const summaryChevronRotate = summaryRotate.interpolate({ inputRange: [0, 1], outputRange: ['0deg', '-90deg'] });
  const budgetChevronRotate = budgetRotate.interpolate({ inputRange: [0, 1], outputRange: ['0deg', '-90deg'] });

  return (
    <ScrollView
      style={styles.container}
      contentContainerStyle={styles.content}
      showsVerticalScrollIndicator={false}
    >
      <View style={styles.headerWrapper}>
        <LinearGradient
          colors={[colors.gradientStart, colors.gradientEnd]}
          style={styles.gradient}
        >
          <View style={styles.monthPill}>
            <Text style={styles.monthPillText}>
              {monthLabel(new Date(), language)}
            </Text>
          </View>

          <Text style={styles.balanceLabel}>{t('dash.monthlySpending')}</Text>
          <Text style={styles.heroTotal} numberOfLines={1} adjustsFontSizeToFit>
            {formatMoney(monthTotal, displayCurrency)}
          </Text>

          {hasExpenses && hasLastMonth && (
            <View
              style={[
                styles.compareBadge,
                spentLess ? styles.compareBadgeGood : styles.compareBadgeUp,
              ]}
            >
              <Text style={[styles.compareDelta, spentLess && styles.compareDeltaGood]}>
                {spentLess ? '↓' : '↑'} {formatMoneyShort(Math.abs(delta), displayCurrency)}
              </Text>
              <Text style={styles.compareLabel}>{t('dash.vsLastMonth')}</Text>
            </View>
          )}
        </LinearGradient>
      </View>

      {hasExpenses && (
        <View style={styles.summaryArea}>
          <View style={styles.summaryCardShadow}>
            <View style={styles.summaryCardClip}>
              <Pressable style={styles.summaryHeader} onPress={() => toggleSection('summary')} accessibilityRole="button" accessibilityState={{ expanded: summaryOpen }}>
                <Animated.Text style={[styles.sectionChevron, { transform: [{ rotate: summaryChevronRotate }] }]}>▾</Animated.Text>
                <Text style={styles.summaryTitle}>
                  {monthLabel(new Date(), language)}
                </Text>
              </Pressable>
              {summaryOpen && (
                <View style={styles.summaryGrid}>
                  {summaryData.map((item) => (
                    <View key={item.key} style={styles.summaryCell}>
                      <View style={[styles.cellAccent, { backgroundColor: item.color + '18' }]}>
                        <Text style={[styles.cellValue, { color: item.color }]}>{item.value}</Text>
                      </View>
                      <Text style={styles.cellLabel}>{item.label}</Text>
                    </View>
                  ))}
                </View>
              )}
            </View>
          </View>
        </View>
      )}

      {hasExpenses && dailyTotals && (
        <SpendingChart
          dailyTotals={dailyTotals}
          displayCurrency={displayCurrency}
          title={t('dash.trend')}
        />
      )}

      {!hasExpenses && <View style={styles.chartPlaceholder} />}

      {hasExpenses && (
        <View style={styles.budgetCard}>
          <View style={styles.budgetHeader}>
            <Pressable style={styles.budgetTitleRow} onPress={() => toggleSection('budget')} accessibilityRole="button" accessibilityState={{ expanded: budgetOpen }}>
              <Animated.Text style={[styles.sectionChevron, { transform: [{ rotate: budgetChevronRotate }] }]}>▾</Animated.Text>
              <Text style={styles.summaryTitle} numberOfLines={1}>{t('budget.title')}</Text>
            </Pressable>
            <View style={styles.budgetActions}>
              <CurrencyDropdown
                value={displayCurrency}
                onChange={onChangeCurrency}
                accessibilityLabel={t('budget.currencySection')}
              />
              <Pressable
                onPress={onEditBudgets}
                accessibilityRole="button"
                style={({ pressed }) => [styles.editPill, pressed && styles.editPillPressed]}
              >
                <Text style={styles.editPillText}>{t('budget.edit')}</Text>
              </Pressable>
            </View>
          </View>

          {budgetOpen && (
            <View>
            <BudgetGauge
              spent={gaugeSpent}
              budget={gaugeBudget}
              displayCurrency={displayCurrency}
              empty={!hasBudgets}
            />

            {hasBudgets && budgetedCategories.length > 0 && (
              <>
                <View style={styles.divider} />
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
              </>
            )}
            </View>
          )}
        </View>
      )}

      {loaded && !hasExpenses && (
        <EmptyState onAdd={onAddPress} onLoadDemo={onLoadDemo} colors={colors} t={t} />
      )}
    </ScrollView>
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
                width: `${Math.min(100, (spent / budget) * 100)}%`,
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
      flexGrow: 1,
      paddingBottom: spacing.xl + TAB_BAR_HEIGHT,
    },

    headerWrapper: {
      backgroundColor: colors.gradientEnd,
      borderBottomLeftRadius: radius.lg,
      borderBottomRightRadius: radius.lg,
      paddingBottom: 80,
      shadowColor: colors.gradientEnd,
      shadowOffset: { width: 0, height: 8 },
      shadowOpacity: 0.3,
      shadowRadius: 20,
      elevation: 5,
    },
    gradient: {
      paddingTop: spacing.xl,
      paddingBottom: spacing.xl,
      alignItems: 'center',
      borderBottomLeftRadius: radius.lg,
      borderBottomRightRadius: radius.lg,
      overflow: 'hidden',
    },
    monthPill: {
      backgroundColor: 'rgba(255, 255, 255, 0.18)',
      borderRadius: 20,
      paddingHorizontal: spacing.md + 2,
      paddingVertical: spacing.xs + 3,
      marginBottom: spacing.md + 4,
    },
    monthPillText: {
      color: colors.headerText,
      fontFamily: fonts.medium,
      fontSize: 13,
      letterSpacing: 0.3,
    },
    balanceLabel: {
      color: colors.headerTextSecondary,
      fontFamily: fonts.medium,
      fontSize: 12,
      letterSpacing: 0.8,
      textTransform: 'uppercase',
      marginBottom: spacing.xs,
    },
    heroTotal: {
      color: colors.headerText,
      fontFamily: fonts.numBold,
      fontSize: 40,
      fontVariant: ['tabular-nums'],
      letterSpacing: -0.5,
    },
    compareBadge: {
      flexDirection: 'row',
      alignItems: 'center',
      borderRadius: 16,
      paddingHorizontal: spacing.md,
      paddingVertical: spacing.sm + 2,
      marginTop: spacing.md,
      gap: spacing.sm,
    },
    compareBadgeUp: {
      backgroundColor: 'rgba(255, 255, 255, 0.18)',
    },
    compareBadgeGood: {
      backgroundColor: 'rgba(16, 185, 129, 0.28)',
    },
    compareDelta: {
      color: colors.headerText,
      fontFamily: fonts.numBold,
      fontSize: 14,
      fontVariant: ['tabular-nums'],
    },
    compareDeltaGood: {
      color: '#a7f3d0',
    },
    compareLabel: {
      color: colors.headerTextSecondary,
      fontFamily: fonts.medium,
      fontSize: 12,
    },
    chartPlaceholder: {
      marginTop: -(spacing.md),
    },

    summaryArea: {
      marginTop: -80,
      zIndex: 1,
    },
    summaryCardShadow: {
      marginHorizontal: spacing.md,
      borderRadius: radius.md,
      ...CARD_SHADOW,
    },
    summaryCardClip: {
      backgroundColor: colors.card,
      borderRadius: radius.md,
      overflow: 'hidden',
      borderWidth: colors.widgetBorderWidth,
      borderColor: colors.widgetBorderColor,
    },
    summaryHeader: {
      flexDirection: 'row',
      alignItems: 'center',
      paddingHorizontal: spacing.md,
      paddingTop: spacing.md,
      paddingBottom: spacing.sm,
    },
    sectionChevron: {
      color: colors.accent,
      fontSize: 16,
      marginRight: spacing.xs + 2,
    },
    summaryTitle: {
      color: colors.textPrimary,
      fontFamily: fonts.bold,
      fontSize: 15,
    },
    summaryGrid: {
      flexDirection: 'row',
      paddingHorizontal: spacing.sm + 2,
      paddingBottom: spacing.md,
      gap: spacing.sm,
    },
    summaryCell: {
      flex: 1,
      alignItems: 'center',
      gap: spacing.xs + 2,
    },
    cellAccent: {
      width: '100%',
      alignItems: 'center',
      borderRadius: radius.md,
      paddingVertical: spacing.sm + 4,
    },
    cellLabel: {
      color: colors.textMuted,
      fontFamily: fonts.medium,
      fontSize: 11,
    },
    cellValue: {
      fontFamily: fonts.numBold,
      fontSize: 17,
      fontVariant: ['tabular-nums'],
    },

    budgetCard: {
      backgroundColor: colors.card,
      borderRadius: radius.md,
      padding: spacing.md,
      marginHorizontal: spacing.md,
      marginTop: spacing.md,
      borderWidth: colors.widgetBorderWidth,
      borderColor: colors.widgetBorderColor,
      ...CARD_SHADOW,
    },
    budgetHeader: {
      flexDirection: 'row',
      justifyContent: 'space-between',
      alignItems: 'center',
      marginBottom: spacing.md,
    },
    budgetTitleRow: {
      flexDirection: 'row',
      alignItems: 'center',
      flexShrink: 1,
      marginRight: spacing.sm,
    },
    budgetActions: {
      flexDirection: 'row',
      alignItems: 'center',
      flexShrink: 0,
      gap: spacing.sm,
    },
    sectionTitle: {
      color: colors.textSecondary,
      fontFamily: fonts.bold,
      fontSize: 12,
      textTransform: 'uppercase',
      letterSpacing: 0.8,
    },
    // Mirrors the CurrencyDropdown trigger so the two budget-header pills read as a matched pair.
    editPill: {
      backgroundColor: colors.background,
      borderWidth: StyleSheet.hairlineWidth,
      borderColor: colors.border,
      borderRadius: 12,
      paddingHorizontal: spacing.sm + 2,
      paddingVertical: spacing.xs + 1,
    },
    editPillPressed: {
      backgroundColor: colors.cardPressed,
    },
    editPillText: {
      color: colors.accent,
      fontFamily: fonts.bold,
      fontSize: 12,
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
