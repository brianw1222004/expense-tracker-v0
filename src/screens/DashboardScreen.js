import { useMemo } from 'react';
import { Pressable, ScrollView, StyleSheet, Text, View } from 'react-native';
import { LinearGradient } from 'expo-linear-gradient';
import BudgetGauge from '../components/BudgetGauge';
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

  const budgetUsedPercent =
    monthlyBudget > 0
      ? Math.min(999, Math.round((regularSpent / monthlyBudget) * 100))
      : null;

  const summaryData = [
    { key: 'today', value: formatMoneyShort(todayTotal, displayCurrency), label: t('dash.today'), color: colors.accent },
    { key: 'expenses', value: String(monthCount), label: t('dash.expenses'), color: colors.success },
    { key: 'avgPerDay', value: formatMoneyShort(avgPerDay, displayCurrency), label: t('dash.avgPerDay'), color: colors.warning },
    { key: 'daysLeft', value: String(daysLeft), label: t('dash.daysLeft'), color: colors.textMuted },
  ];

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
              <View style={styles.summaryHeader}>
                <Text style={styles.sectionChevron}>▾</Text>
                <Text style={styles.summaryTitle}>
                  {monthLabel(new Date(), language)}
                </Text>
              </View>
              <View style={styles.summaryGrid}>
                {summaryData.map((item, index) => (
                  <View
                    key={item.key}
                    style={[
                      styles.summaryCell,
                      index % 2 === 0 && styles.cellBorderRight,
                      index < 2 && styles.cellBorderBottom,
                    ]}
                  >
                    <View style={styles.cellHeader}>
                      <View style={[styles.cellDot, { backgroundColor: item.color }]} />
                      <Text style={styles.cellLabel}>{item.label}</Text>
                    </View>
                    <Text style={styles.cellValue}>{item.value}</Text>
                  </View>
                ))}
              </View>
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
        <Pressable
          onPress={onEditBudgets}
          accessibilityRole="button"
          style={({ pressed }) => [styles.budgetCard, pressed && styles.budgetCardPressed]}
        >
          <View style={styles.budgetHeader}>
            <View style={styles.budgetTitleRow}>
              <Text style={styles.sectionChevron}>▾</Text>
              <View>
                <Text style={styles.sectionTitle}>{t('budget.title')}</Text>
                <View style={styles.budgetMeta}>
                  {budgetUsedPercent != null && (
                    <>
                      <Text style={styles.budgetMetaVal}>{budgetUsedPercent}%</Text>
                      <Text style={styles.budgetMetaDot}>·</Text>
                    </>
                  )}
                  <Text style={styles.budgetMetaVal}>{daysLeft}</Text>
                  <Text style={styles.budgetMetaLabel}>{t('dash.daysLeft')}</Text>
                </View>
              </View>
            </View>
            <View style={styles.editPill}>
              <Text style={styles.editPillText}>{t('budget.edit')}</Text>
            </View>
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
        </Pressable>
      )}

      {loaded && !hasExpenses && (
        <EmptyState onAdd={onAddPress} onLoadDemo={onLoadDemo} colors={colors} t={t} />
      )}
    </ScrollView>
  );
}

function CategoryBar({ category, budget, spent, displayCurrency, styles, colors, t }) {
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
}

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
      fontFamily: fonts.bold,
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
      fontFamily: fonts.bold,
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
      marginTop: -1,
    },
    summaryTitle: {
      color: colors.textPrimary,
      fontFamily: fonts.bold,
      fontSize: 15,
    },
    summaryGrid: {
      flexDirection: 'row',
      flexWrap: 'wrap',
      borderTopWidth: StyleSheet.hairlineWidth,
      borderTopColor: colors.border,
    },
    summaryCell: {
      width: '50%',
      paddingVertical: spacing.md,
      paddingHorizontal: spacing.md,
    },
    cellBorderRight: {
      borderRightWidth: StyleSheet.hairlineWidth,
      borderRightColor: colors.border,
    },
    cellBorderBottom: {
      borderBottomWidth: StyleSheet.hairlineWidth,
      borderBottomColor: colors.border,
    },
    cellHeader: {
      flexDirection: 'row',
      alignItems: 'center',
      marginBottom: spacing.xs + 2,
    },
    cellDot: {
      width: 7,
      height: 7,
      borderRadius: 3.5,
      marginRight: spacing.sm,
    },
    cellLabel: {
      color: colors.textMuted,
      fontFamily: fonts.medium,
      fontSize: 12,
    },
    cellValue: {
      color: colors.textPrimary,
      fontFamily: fonts.bold,
      fontSize: 18,
      fontVariant: ['tabular-nums'],
      marginLeft: spacing.sm + 7,
    },

    budgetCard: {
      backgroundColor: colors.card,
      borderRadius: radius.md,
      padding: spacing.md,
      marginHorizontal: spacing.md,
      marginTop: spacing.md,
      ...CARD_SHADOW,
    },
    budgetCardPressed: {
      backgroundColor: colors.cardPressed,
    },
    budgetHeader: {
      flexDirection: 'row',
      justifyContent: 'space-between',
      alignItems: 'center',
      marginBottom: spacing.md,
    },
    budgetTitleRow: {
      flexDirection: 'row',
      alignItems: 'flex-start',
    },
    sectionTitle: {
      color: colors.textSecondary,
      fontFamily: fonts.bold,
      fontSize: 12,
      textTransform: 'uppercase',
      letterSpacing: 0.8,
    },
    editPill: {
      backgroundColor: colors.accent + '18',
      borderRadius: 12,
      paddingHorizontal: spacing.sm + 4,
      paddingVertical: spacing.xs + 1,
    },
    editPillText: {
      color: colors.accent,
      fontFamily: fonts.bold,
      fontSize: 12,
    },
    budgetMeta: {
      flexDirection: 'row',
      alignItems: 'center',
      marginTop: 3,
      gap: spacing.xs + 2,
    },
    budgetMetaVal: {
      color: colors.textMuted,
      fontFamily: fonts.bold,
      fontSize: 11,
      fontVariant: ['tabular-nums'],
    },
    budgetMetaLabel: {
      color: colors.textMuted,
      fontFamily: fonts.regular,
      fontSize: 11,
    },
    budgetMetaDot: {
      color: colors.textMuted,
      fontSize: 8,
      opacity: 0.5,
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
      fontFamily: fonts.regular,
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
      fontFamily: fonts.bold,
      fontSize: 13,
      fontVariant: ['tabular-nums'],
    },

  });
