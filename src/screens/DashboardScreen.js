import { useMemo } from 'react';
import { Pressable, ScrollView, StyleSheet, Text, View } from 'react-native';
import { LinearGradient } from 'expo-linear-gradient';
import BudgetGauge from '../components/BudgetGauge';
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

  return (
    <ScrollView
      style={styles.container}
      contentContainerStyle={styles.content}
      showsVerticalScrollIndicator={false}
    >
      <LinearGradient
        colors={[colors.gradientStart, colors.gradientEnd]}
        style={styles.gradient}
      >
        <View style={styles.wash1} />
        <View style={styles.wash2} />
        <View style={styles.wash3} />
        <View style={styles.wash4} />

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

      {hasExpenses && dailyTotals && (
        <SpendingChart
          dailyTotals={dailyTotals}
          displayCurrency={displayCurrency}
          title={t('dash.trend')}
          quickStats={[
            { value: formatMoneyShort(todayTotal, displayCurrency), label: t('dash.today') },
            { value: String(monthCount), label: t('dash.expenses') },
            { value: formatMoneyShort(avgPerDay, displayCurrency), label: t('dash.avgPerDay') },
          ]}
        />
      )}

      {!hasExpenses && <View style={styles.chartPlaceholder} />}

      {hasExpenses && (
        <Pressable
          onPress={onEditBudgets}
          accessibilityRole="button"
          style={({ pressed }) => [styles.section, pressed && styles.sectionPressed]}
        >
          <View style={styles.sectionHeader}>
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
        <View style={styles.emptyState}>
          <HIcon name="circle-dashed" size={48} color={colors.icon} />
          <Text style={styles.emptyTitle}>{t('empty.title')}</Text>
          <Text style={styles.emptyHint}>{t('empty.hint')}</Text>
          <Pressable
            onPress={onAddPress}
            accessibilityRole="button"
            style={({ pressed }) => [styles.addFirstButton, pressed && styles.addFirstButtonPressed]}
          >
            <Text style={styles.addFirstButtonText}>{t('empty.addFirst')}</Text>
          </Pressable>
          <Pressable onPress={onLoadDemo} accessibilityRole="button" hitSlop={8}>
            <Text style={styles.demoLink}>{t('empty.loadDemo')}</Text>
          </Pressable>
        </View>
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

    gradient: {
      paddingTop: spacing.lg,
      paddingBottom: spacing.xl + spacing.sm,
      alignItems: 'center',
      borderBottomLeftRadius: radius.lg,
      borderBottomRightRadius: radius.lg,
      overflow: 'hidden',
    },
    wash1: {
      position: 'absolute',
      top: -30,
      right: -35,
      width: 180,
      height: 130,
      borderRadius: 65,
      backgroundColor: 'rgba(255, 160, 180, 0.09)',
      transform: [{ rotate: '-15deg' }],
    },
    wash2: {
      position: 'absolute',
      top: 15,
      left: -40,
      width: 140,
      height: 170,
      borderRadius: 70,
      backgroundColor: 'rgba(120, 220, 255, 0.07)',
      transform: [{ rotate: '10deg' }],
    },
    wash3: {
      position: 'absolute',
      bottom: 5,
      right: 30,
      width: 120,
      height: 90,
      borderRadius: 45,
      backgroundColor: 'rgba(255, 210, 120, 0.07)',
      transform: [{ rotate: '20deg' }],
    },
    wash4: {
      position: 'absolute',
      bottom: -20,
      left: 30,
      width: 130,
      height: 100,
      borderRadius: 50,
      backgroundColor: 'rgba(180, 140, 255, 0.06)',
      transform: [{ rotate: '-8deg' }],
    },
    monthPill: {
      backgroundColor: 'rgba(255, 255, 255, 0.15)',
      borderRadius: 20,
      paddingHorizontal: spacing.md,
      paddingVertical: spacing.xs + 2,
      marginBottom: spacing.md,
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
      fontSize: 36,
      fontVariant: ['tabular-nums'],
      letterSpacing: -0.5,
    },
    compareBadge: {
      flexDirection: 'row',
      alignItems: 'center',
      borderRadius: 14,
      paddingHorizontal: spacing.md,
      paddingVertical: spacing.sm,
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

    section: {
      backgroundColor: colors.card,
      borderRadius: radius.md,
      padding: spacing.md,
      marginHorizontal: spacing.md,
      marginTop: spacing.sm + 4,
    },
    sectionPressed: {
      backgroundColor: colors.cardPressed,
    },
    sectionHeader: {
      flexDirection: 'row',
      justifyContent: 'space-between',
      alignItems: 'center',
      marginBottom: spacing.sm + 4,
    },
    sectionTitle: {
      color: colors.textSecondary,
      fontFamily: fonts.bold,
      fontSize: 12,
      textTransform: 'uppercase',
      letterSpacing: 0.8,
    },
    editLabel: {
      color: colors.accent,
      fontFamily: fonts.bold,
      fontSize: 13,
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

    emptyState: {
      flex: 1,
      alignItems: 'center',
      justifyContent: 'center',
      paddingHorizontal: spacing.xl,
      paddingBottom: spacing.xl,
    },
    emptyTitle: {
      color: colors.textPrimary,
      fontFamily: fonts.bold,
      fontSize: 18,
      marginTop: spacing.md,
    },
    emptyHint: {
      color: colors.textSecondary,
      fontFamily: fonts.regular,
      fontSize: 14,
      lineHeight: 22,
      textAlign: 'center',
      marginTop: spacing.sm,
    },
    addFirstButton: {
      backgroundColor: colors.accent,
      borderRadius: radius.md,
      paddingVertical: spacing.sm + 4,
      paddingHorizontal: spacing.lg,
      marginTop: spacing.lg,
      minHeight: 48,
      alignItems: 'center',
      justifyContent: 'center',
    },
    addFirstButtonPressed: {
      backgroundColor: colors.accentDark,
    },
    addFirstButtonText: {
      color: colors.onAccent,
      fontFamily: fonts.bold,
      fontSize: 15,
    },
    demoLink: {
      color: colors.textMuted,
      fontFamily: fonts.regular,
      fontSize: 13,
      marginTop: spacing.md,
    },
  });
