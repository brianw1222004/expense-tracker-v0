import React, { useMemo, useState, useRef, useCallback } from 'react';
import { Animated, LayoutAnimation, Platform, Pressable, ScrollView, StyleSheet, Text, UIManager, View } from 'react-native';
import Svg, { Defs, RadialGradient, Stop, Rect } from 'react-native-svg';

if (Platform.OS === 'android') UIManager.setLayoutAnimationEnabledExperimental?.(true);
import BudgetGauge from '../components/BudgetGauge';
import CurrencyDropdown from '../components/CurrencyDropdown';
import EmptyState from '../components/EmptyState';
import SpendingChart from '../components/SpendingChart';
import { TAB_BAR_HEIGHT } from '../components/TabBar';
import { fonts, spacing, radius, useTheme, ACCOUNT_FAB_SIZE } from '../theme';
import { useT, useLanguage } from '../i18n';
import { formatMoney, formatMoneyShort, monthLabel, dayLabel } from '../format';
import { getCurrency } from '../currency';
import { getCategory, getCategoryLabel } from '../categories';
import { HIcon } from '../icons';

// Soft iridescent bloom for the hero card's upper-right corner. Two warm-to-cool
// hues fade to transparent so the wash reads luminous on the white card without
// tying to a single theme accent. Tune intensity/position here.
const GLOW_PINK = '#F8B6D2';
const GLOW_VIOLET = '#BCA9F5';

// Absolutely-fills its parent and paints a radial bloom anchored at the
// top-right. Rendered as the parent card's first child (so content paints over
// it) and wrapped in a rounded, clipped layer so the bloom follows the card's
// corners without clipping the card's drop shadow.
function CardGlow() {
  return (
    <View style={styles_cardGlowClip} pointerEvents="none">
      <Svg width="100%" height="100%">
        <Defs>
          <RadialGradient id="spendCardGlow" cx="92%" cy="3%" r="95%" fx="92%" fy="3%">
            <Stop offset="0" stopColor={GLOW_PINK} stopOpacity="0.5" />
            <Stop offset="0.45" stopColor={GLOW_VIOLET} stopOpacity="0.22" />
            <Stop offset="1" stopColor={GLOW_VIOLET} stopOpacity="0" />
          </RadialGradient>
        </Defs>
        <Rect x="0" y="0" width="100%" height="100%" fill="url(#spendCardGlow)" />
      </Svg>
    </View>
  );
}

// Static style for the glow clip layer (outside createStyles — it needs no theme
// colors, only the card's corner radius). Positioning is spelled out because
// StyleSheet.absoluteFillObject was removed in RN 0.85.
const styles_cardGlowClip = {
  position: 'absolute',
  top: 0,
  left: 0,
  right: 0,
  bottom: 0,
  borderRadius: radius.md,
  overflow: 'hidden',
  // Sit behind the card content but above the card's own background fill — on
  // web an absolute child would otherwise paint over the static text.
  zIndex: -1,
};

export default function DashboardScreen({
  loaded,
  hasExpenses,
  userName,
  monthTotal,
  lastMonthTotal,
  dailyTotals,
  totalsByCategory,
  recentExpenses,
  categories,
  displayCurrency,
  monthlyBudget,
  categoryBudgets,
  onEditBudgets,
  onOpenAccount,
  onChangeCurrency,
  onAddPress,
  onEditExpense,
  onSeeAll,
  onLoadDemo,
  regularCategories,
  externalCategories,
}) {
  const { colors } = useTheme();
  const t = useT();
  const language = useLanguage();
  const styles = useMemo(() => createStyles(colors), [colors]);
  const greetingName = (userName ?? '').trim();

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
  // Spending down = good (green ↓), up = bad (red ↑), flat = neutral — mirrors
  // the three-way convention in CategoriesScreen so an exact tie isn't shown red.
  const heroDir = delta < 0 ? 'down' : delta > 0 ? 'up' : 'flat';
  const deltaPct = hasLastMonth ? (Math.abs(delta) / lastMonthTotal) * 100 : 0;

  const [budgetOpen, setBudgetOpen] = useState(true);
  const budgetRotate = useRef(new Animated.Value(0)).current;

  const toggleBudget = useCallback(() => {
    LayoutAnimation.configureNext(LayoutAnimation.Presets.easeInEaseOut);
    setBudgetOpen((prev) => {
      const next = !prev;
      Animated.timing(budgetRotate, { toValue: next ? 0 : 1, duration: 250, useNativeDriver: true }).start();
      return next;
    });
  }, [budgetRotate]);

  const budgetChevronRotate = budgetRotate.interpolate({ inputRange: [0, 1], outputRange: ['0deg', '-90deg'] });

  return (
    <ScrollView
      style={styles.container}
      contentContainerStyle={styles.content}
      showsVerticalScrollIndicator={false}
    >
      <View style={styles.greetingRow}>
        {greetingName ? (
          <Text style={styles.greeting} numberOfLines={1}>
            {t('dash.greeting', { name: greetingName })}
          </Text>
        ) : (
          <Pressable onPress={onOpenAccount} accessibilityRole="button">
            <Text style={styles.greeting} numberOfLines={1}>
              {t('dash.greetingNoName')}
            </Text>
          </Pressable>
        )}
      </View>

      {/* Monthly Spending — total, month-over-month delta, currency picker, trend chart */}
      <View style={styles.spendCard}>
        <CardGlow />
        <View style={styles.spendTopRow}>
          <Text style={styles.balanceLabel}>{t('dash.monthlySpending')}</Text>
          <CurrencyDropdown
            value={displayCurrency}
            onChange={onChangeCurrency}
            accessibilityLabel={t('budget.currencySection')}
          />
        </View>

        <View style={styles.heroNumberRow}>
          <Text style={styles.heroTotal} numberOfLines={1} adjustsFontSizeToFit>
            {formatMoney(monthTotal, displayCurrency)}
          </Text>
          {hasExpenses && hasLastMonth && (
            <DeltaBadge value={deltaPct.toFixed(1)} dir={heroDir} colors={colors} styles={styles} />
          )}
        </View>

        <View style={styles.heroSubRow}>
          <View style={styles.monthPill}>
            <Text style={styles.monthPillText}>{monthLabel(new Date(), language)}</Text>
          </View>
          {hasExpenses && hasLastMonth && (
            <Text style={styles.vsText}>{t('dash.vsLastMonth')}</Text>
          )}
        </View>

        {hasExpenses && dailyTotals && (
          <SpendingChart
            dailyTotals={dailyTotals}
            displayCurrency={displayCurrency}
          />
        )}
      </View>

      {hasExpenses && (
        <View style={styles.budgetCard}>
          <View style={styles.budgetHeader}>
            <Pressable style={styles.budgetTitleRow} onPress={toggleBudget} accessibilityRole="button" accessibilityState={{ expanded: budgetOpen }}>
              <Animated.Text style={[styles.sectionChevron, { transform: [{ rotate: budgetChevronRotate }] }]}>▾</Animated.Text>
              <Text style={styles.summaryTitle} numberOfLines={1}>{t('budget.title')}</Text>
            </Pressable>
            <Pressable
              onPress={onEditBudgets}
              accessibilityRole="button"
              style={({ pressed }) => [styles.editPill, pressed && styles.editPillPressed]}
            >
              <Text style={styles.editPillText}>{t('budget.edit')}</Text>
            </Pressable>
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

      {hasExpenses && recentExpenses && recentExpenses.length > 0 && (
        <View style={styles.recentSection}>
          <View style={styles.recentHeader}>
            <Text style={styles.recentTitle}>{t('dash.recentActivity')}</Text>
            <Pressable
              onPress={onSeeAll}
              accessibilityRole="button"
              hitSlop={8}
              style={({ pressed }) => pressed && styles.viewAllPressed}
            >
              <Text style={styles.viewAll}>{t('dash.viewAll')}</Text>
            </Pressable>
          </View>
          {recentExpenses.map((expense) => (
            <ActivityRow
              key={expense.id}
              expense={expense}
              displayCurrency={displayCurrency}
              categories={categories}
              onEdit={onEditExpense}
              language={language}
              styles={styles}
              t={t}
            />
          ))}
        </View>
      )}

      {loaded && !hasExpenses && (
        <EmptyState onAdd={onAddPress} onLoadDemo={onLoadDemo} colors={colors} t={t} />
      )}
    </ScrollView>
  );
}

// Pill showing a percentage change. `dir`: 'down' = spending fell (green ↓),
// 'up' = rose (red ↑), 'flat' = unchanged (muted, no arrow). The circle/arrow
// is omitted when flat so an exact tie never reads as an increase.
const DeltaBadge = React.memo(function DeltaBadge({ value, dir, colors, styles }) {
  const tone = dir === 'down' ? colors.success : dir === 'up' ? colors.danger : colors.textMuted;
  const flat = dir === 'flat';
  return (
    <View style={[styles.deltaBadge, flat && styles.deltaBadgeFlat, { backgroundColor: `${tone}1A` }]}>
      {!flat && (
        <View style={[styles.deltaCircle, { backgroundColor: tone }]}>
          <Text style={[styles.deltaArrow, { color: colors.onAccent }]}>{dir === 'down' ? '↓' : '↑'}</Text>
        </View>
      )}
      <Text style={[styles.deltaPct, { color: tone }]}>{value}%</Text>
    </View>
  );
});

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

// A recent-activity row. Mirrors ExpenseRow's chrome (circle icon, category
// left-border tint, card surface) so the dashboard feed blends with the
// Expenses tab; tap opens the edit popup (deletion lives on the Expenses tab).
const ActivityRow = React.memo(function ActivityRow({ expense, displayCurrency, categories, onEdit, language, styles, t }) {
  const category = getCategory(expense.category, categories);
  const converted = expense.currency !== displayCurrency;
  const hasNote = !!(expense.note && expense.note.trim());
  const title = hasNote ? expense.note : getCategoryLabel(category, t);
  const day = dayLabel(expense.createdAt, language);

  const tintStyle = useMemo(
    () => ({
      backgroundColor: `${category.color}0A`,
      borderLeftWidth: 3,
      borderLeftColor: `${category.color}33`,
    }),
    [category.color]
  );

  const handlePress = useCallback(() => onEdit(expense), [onEdit, expense]);

  return (
    <Pressable
      onPress={handlePress}
      accessibilityRole="button"
      accessibilityLabel={`${title}, ${day}, ${formatMoney(expense.displayAmount, displayCurrency)}`}
      accessibilityHint={t('dash.tapToEdit')}
      style={({ pressed }) => [styles.activityRow, tintStyle, pressed && styles.activityRowPressed]}
    >
      <View style={[styles.activityIconCircle, { backgroundColor: `${category.color}26` }]}>
        <HIcon name={category.emoji} size={20} color={category.color} />
      </View>
      <View style={styles.activityMiddle}>
        <Text style={styles.activityTitle} numberOfLines={1}>{title}</Text>
        <Text style={styles.activitySubtitle} numberOfLines={1}>{day}</Text>
      </View>
      <View style={styles.activityAmounts}>
        <Text style={styles.activityAmount}>-{formatMoney(expense.displayAmount, displayCurrency)}</Text>
        {converted && (
          <Text style={styles.activityOriginal} numberOfLines={1}>
            {formatMoney(expense.amount, expense.currency)} {expense.currency}
          </Text>
        )}
      </View>
    </Pressable>
  );
});

const CARD_SHADOW = {
  shadowColor: '#000',
  shadowOffset: { width: 0, height: 1 },
  shadowOpacity: 0.06,
  shadowRadius: 8,
  elevation: 1,
};

// Shared height for the budget-header pills and the matching line-box of the
// section title/chevron, so the title centers on the pills' vertical midpoint.
const PILL_HEIGHT = 24;

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

    greetingRow: {
      minHeight: ACCOUNT_FAB_SIZE,
      justifyContent: 'center',
      marginTop: spacing.sm,
      marginBottom: spacing.md,
      marginHorizontal: spacing.md,
      // Clear the floating account button pinned at the screen's top-left.
      paddingLeft: ACCOUNT_FAB_SIZE + spacing.sm,
    },
    greeting: {
      color: colors.textPrimary,
      fontFamily: fonts.bold,
      fontSize: 22,
    },
    spendCard: {
      backgroundColor: colors.card,
      borderRadius: radius.md,
      marginHorizontal: spacing.md,
      padding: spacing.lg,
      ...CARD_SHADOW,
    },
    spendTopRow: {
      flexDirection: 'row',
      justifyContent: 'space-between',
      alignItems: 'center',
      marginBottom: spacing.sm,
    },
    monthPill: {
      backgroundColor: colors.accent + '18',
      borderRadius: 20,
      paddingHorizontal: spacing.sm + 4,
      paddingVertical: spacing.xs + 1,
    },
    monthPillText: {
      color: colors.textSecondary,
      fontFamily: fonts.medium,
      fontSize: 12,
      letterSpacing: 0.3,
    },
    balanceLabel: {
      color: colors.textMuted,
      fontFamily: fonts.medium,
      fontSize: 12,
      letterSpacing: 0.8,
      textTransform: 'uppercase',
    },
    heroNumberRow: {
      flexDirection: 'row',
      alignItems: 'flex-end',
      gap: spacing.sm,
    },
    heroTotal: {
      color: colors.textPrimary,
      fontFamily: fonts.numBold,
      fontSize: 40,
      fontVariant: ['tabular-nums'],
      letterSpacing: -0.5,
      flexShrink: 1,
    },
    heroSubRow: {
      flexDirection: 'row',
      alignItems: 'center',
      gap: spacing.sm,
      marginTop: spacing.md,
    },
    vsText: {
      color: colors.textMuted,
      fontFamily: fonts.medium,
      fontSize: 12,
    },

    // Percentage-change pill (filled circle + arrow + percent).
    deltaBadge: {
      flexDirection: 'row',
      alignItems: 'center',
      alignSelf: 'flex-end',
      borderRadius: 14,
      paddingLeft: 3,
      paddingRight: spacing.sm,
      paddingVertical: 3,
      gap: spacing.xs + 1,
      marginBottom: 6,
    },
    deltaBadgeFlat: {
      paddingLeft: spacing.sm,
    },
    deltaCircle: {
      width: 18,
      height: 18,
      borderRadius: 9,
      alignItems: 'center',
      justifyContent: 'center',
    },
    deltaArrow: {
      fontFamily: fonts.numBold,
      fontSize: 11,
      lineHeight: 13,
    },
    deltaPct: {
      fontFamily: fonts.numBold,
      fontSize: 13,
      fontVariant: ['tabular-nums'],
    },

    sectionChevron: {
      color: colors.accent,
      fontSize: 16,
      marginRight: spacing.xs + 2,
      lineHeight: PILL_HEIGHT,
    },
    summaryTitle: {
      color: colors.textPrimary,
      fontFamily: fonts.bold,
      fontSize: 15,
      lineHeight: PILL_HEIGHT,
    },
    budgetCard: {
      backgroundColor: colors.card,
      borderRadius: radius.md,
      padding: spacing.md,
      marginHorizontal: spacing.md,
      marginTop: spacing.md,
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
    sectionTitle: {
      color: colors.textSecondary,
      fontFamily: fonts.bold,
      fontSize: 12,
      textTransform: 'uppercase',
      letterSpacing: 0.8,
    },
    // Mirrors the CurrencyDropdown trigger so the budget-header pill matches the hero picker.
    editPill: {
      backgroundColor: colors.background,
      borderWidth: StyleSheet.hairlineWidth,
      borderColor: colors.border,
      borderRadius: 10,
      paddingHorizontal: spacing.sm + 2,
      height: PILL_HEIGHT,
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

    recentSection: {
      marginTop: spacing.md,
    },
    recentHeader: {
      flexDirection: 'row',
      justifyContent: 'space-between',
      alignItems: 'center',
      marginHorizontal: spacing.md,
      marginBottom: spacing.sm,
    },
    recentTitle: {
      color: colors.textPrimary,
      fontFamily: fonts.bold,
      fontSize: 15,
    },
    viewAll: {
      color: colors.accent,
      fontFamily: fonts.bold,
      fontSize: 13,
    },
    viewAllPressed: {
      opacity: 0.6,
    },
    // Mirrors ExpenseRow so the feed reads as the same surface as the list.
    activityRow: {
      flexDirection: 'row',
      alignItems: 'center',
      backgroundColor: colors.card,
      borderRadius: radius.md,
      padding: spacing.sm + 4,
      marginHorizontal: spacing.md,
      marginBottom: spacing.sm,
    },
    activityRowPressed: {
      backgroundColor: colors.cardPressed,
    },
    activityIconCircle: {
      width: 42,
      height: 42,
      borderRadius: 21,
      alignItems: 'center',
      justifyContent: 'center',
    },
    activityMiddle: {
      flex: 1,
      marginHorizontal: spacing.sm + 4,
    },
    activityTitle: {
      color: colors.textPrimary,
      fontSize: 15,
      fontFamily: fonts.bold,
    },
    activitySubtitle: {
      color: colors.textMuted,
      fontSize: 13,
      fontFamily: fonts.regular,
      marginTop: 1,
    },
    activityAmounts: {
      alignItems: 'flex-end',
    },
    activityAmount: {
      color: colors.textPrimary,
      fontSize: 15,
      fontFamily: fonts.numBold,
      fontVariant: ['tabular-nums'],
    },
    activityOriginal: {
      color: colors.textMuted,
      fontSize: 12,
      fontFamily: fonts.numRegular,
      marginTop: 1,
      fontVariant: ['tabular-nums'],
    },

  });
