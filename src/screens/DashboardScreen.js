import { useMemo } from 'react';
import { Pressable, ScrollView, StyleSheet, Text, View } from 'react-native';
import { LinearGradient } from 'expo-linear-gradient';
import BudgetGauge from '../components/BudgetGauge';
import SpendingChart from '../components/SpendingChart';
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
        <Text style={styles.monthLabel}>
          {monthLabel(new Date(), language)}
        </Text>
        <Text style={styles.heroTotal} numberOfLines={1} adjustsFontSizeToFit>
          {formatMoney(monthTotal, displayCurrency)}
        </Text>
      </LinearGradient>

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
          style={({ pressed }) => [styles.section, pressed && styles.sectionPressed]}
        >
          <View style={styles.sectionHeader}>
            <Text style={styles.sectionTitle}>{t('budget.title')}</Text>
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

      {hasExpenses && (
        <View style={styles.statsRow}>
          <StatCell
            label={t('dash.today')}
            value={formatMoneyShort(todayTotal, displayCurrency)}
            styles={styles}
          />
          <View style={styles.statDivider} />
          <StatCell
            label={t('dash.expenses')}
            value={String(monthCount)}
            styles={styles}
          />
          <View style={styles.statDivider} />
          <StatCell
            label={t('dash.avgPerDay')}
            value={formatMoneyShort(avgPerDay, displayCurrency)}
            styles={styles}
          />
        </View>
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

function StatCell({ label, value, styles }) {
  return (
    <View style={styles.statCell}>
      <Text style={styles.statLabel}>{label}</Text>
      <Text style={styles.statValue}>{value}</Text>
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
      paddingBottom: spacing.xl,
    },

    gradient: {
      paddingTop: spacing.lg,
      paddingBottom: spacing.xl + spacing.lg,
      alignItems: 'center',
      borderBottomLeftRadius: radius.lg,
      borderBottomRightRadius: radius.lg,
    },
    monthLabel: {
      color: colors.headerTextSecondary,
      fontFamily: fonts.bold,
      fontSize: 14,
      textTransform: 'uppercase',
      letterSpacing: 1.2,
    },
    heroTotal: {
      color: colors.headerText,
      fontFamily: fonts.bold,
      fontSize: 44,
      marginTop: spacing.xs,
      fontVariant: ['tabular-nums'],
    },

    statsRow: {
      flexDirection: 'row',
      backgroundColor: colors.card,
      borderRadius: radius.md,
      marginHorizontal: spacing.md,
      marginTop: spacing.md,
      paddingVertical: spacing.md,
      overflow: 'hidden',
    },
    statCell: {
      flex: 1,
      alignItems: 'center',
    },
    statLabel: {
      color: colors.textSecondary,
      fontFamily: fonts.regular,
      fontSize: 13,
      marginBottom: 4,
    },
    statValue: {
      color: colors.textPrimary,
      fontFamily: fonts.bold,
      fontSize: 16,
      fontVariant: ['tabular-nums'],
    },
    statDivider: {
      width: StyleSheet.hairlineWidth,
      backgroundColor: colors.border,
      alignSelf: 'stretch',
    },
    chartPlaceholder: {
      marginTop: -(spacing.xl),
    },

    section: {
      backgroundColor: colors.card,
      borderRadius: radius.md,
      padding: spacing.md,
      marginHorizontal: spacing.md,
      marginTop: spacing.md,
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
      fontSize: 13,
      textTransform: 'uppercase',
      letterSpacing: 0.8,
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
      fontSize: 16,
    },
    demoLink: {
      color: colors.textMuted,
      fontFamily: fonts.regular,
      fontSize: 14,
      marginTop: spacing.md,
    },
  });
