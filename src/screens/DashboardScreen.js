import React, { useMemo, useState } from 'react';
import { Pressable, ScrollView, StyleSheet, Text, View } from 'react-native';
import { useSafeAreaInsets } from 'react-native-safe-area-context';

import CategorySummaryCard from '../components/CategorySummaryCard';
import EmptyState from '../components/EmptyState';
import EntryModeToggle from '../components/EntryModeToggle';
import HeaderGlow from '../components/HeaderGlow';
import MonthSelector from '../components/MonthSelector';
import SpendingChart from '../components/SpendingChart';
import { HIcon } from '../icons';
import { TAB_BAR_HEIGHT } from '../components/TabBar';
import { fonts, spacing, radius, useTheme, cardShadow } from '../theme';
import { useT, useLanguage, getDateNames } from '../i18n';
import { formatMoney, formatMoneyShort, shiftMonthKey } from '../format';

// The hero chart's granularity toggle: the selected month's per-day line
// (default) vs. the cross-month trend of the last six months' totals.
const CHART_MODES = [
  { id: 'daily', labelKey: 'dash.chartDaily' },
  { id: 'monthly', labelKey: 'dash.chartMonthly' },
];

export default function DashboardScreen({
  loaded,
  hasExpenses,
  monthTotal,
  lastMonthTotal,
  dailyTotals,
  monthKey,
  onShiftMonth,
  displayCurrency,
  onAddPress,
  onLoadDemo,
  splitSummary,
  onOpenSplit,
  categoryMonths,
  currentMonthKey,
  allCategories,
  categoryBudgets,
  onCategoryDetail,
}) {
  const { colors } = useTheme();
  const t = useT();
  const insets = useSafeAreaInsets();
  const styles = useMemo(() => createStyles(colors), [colors]);
  const isCurrentMonth = monthKey === currentMonthKey;
  const [chartMode, setChartMode] = useState('daily');
  const language = useLanguage();

  // The chart's Monthly series: the last six months ending at the selected
  // month, zero-filled where there's no data. Labels are the language's month
  // names, truncated to 3 chars for the latin scripts (CJK are already short).
  const monthlyTotals = useMemo(() => {
    const totalByKey = new Map((categoryMonths ?? []).map((m) => [m.key, m.total]));
    const names = getDateNames(language).months;
    const out = [];
    let key = monthKey;
    for (let i = 0; i < 6; i++) {
      const name = names[Number(key.slice(5, 7)) - 1];
      out.unshift({ label: name.length > 4 ? name.slice(0, 3) : name, value: totalByKey.get(key) ?? 0 });
      key = shiftMonthKey(key, -1);
    }
    return out;
  }, [categoryMonths, monthKey, language]);

  const delta = monthTotal - (lastMonthTotal ?? 0);
  const hasLastMonth = (lastMonthTotal ?? 0) > 0;
  // Spending down = good (green ↓), up = bad (red ↑), flat = neutral — mirrors
  // the three-way convention in the category breakdown so an exact tie isn't shown red.
  const heroDir = delta < 0 ? 'down' : delta > 0 ? 'up' : 'flat';
  const deltaPct = hasLastMonth ? (Math.abs(delta) / lastMonthTotal) * 100 : 0;

  return (
    <View style={styles.root}>
      <HeaderGlow id="dashHeaderGlow" />
    <ScrollView
      style={styles.container}
      contentContainerStyle={[styles.content, { paddingBottom: spacing.xl + TAB_BAR_HEIGHT + insets.bottom }]}
      showsVerticalScrollIndicator={false}
    >
      <Text style={styles.title}>{t('dash.title')}</Text>

      {/* This page's ‹ month › selection, under the title — scopes the hero
          card and the category summary card. Independent of the other tabs'
          month selectors. */}
      <MonthSelector
        monthKey={monthKey}
        currentMonthKey={currentMonthKey}
        onShift={onShiftMonth}
        style={styles.monthSelector}
      />

      {/* Monthly Spending — total, month-over-month delta, trend chart with a
          Daily/Monthly granularity toggle in the heading row. */}
      <View style={styles.spendCard}>
        <View style={styles.spendHeader}>
          <Text style={styles.sectionHeading} numberOfLines={1}>{t('dash.monthlySpending')}</Text>
          {hasExpenses && dailyTotals && (
            <EntryModeToggle
              compact
              options={CHART_MODES}
              value={chartMode}
              onChange={setChartMode}
            />
          )}
        </View>

        <View style={styles.heroNumberRow}>
          <Text style={styles.heroTotal} numberOfLines={1} adjustsFontSizeToFit>
            {formatMoney(monthTotal, displayCurrency)}
          </Text>
          {hasExpenses && hasLastMonth && (
            <DeltaBadge value={deltaPct > 999 ? '999+' : deltaPct.toFixed(1)} dir={heroDir} colors={colors} styles={styles} />
          )}
        </View>

        {hasExpenses && dailyTotals && (
          <View style={styles.chartWrap}>
            <SpendingChart
              dailyTotals={dailyTotals}
              displayCurrency={displayCurrency}
              endDay={isCurrentMonth ? undefined : dailyTotals.length}
              mode={chartMode}
              monthlyTotals={monthlyTotals}
            />
          </View>
        )}
      </View>

      {hasExpenses && (
        <CategorySummaryCard
          months={categoryMonths}
          monthKey={monthKey}
          displayCurrency={displayCurrency}
          allCategories={allCategories}
          categoryBudgets={categoryBudgets}
          onMoreDetail={onCategoryDetail}
        />
      )}

      {splitSummary && (splitSummary.owed > 0.005 || splitSummary.owe > 0.005) && (
        <Pressable
          onPress={onOpenSplit}
          accessibilityRole="button"
          accessibilityLabel={t('split.title')}
          style={({ pressed }) => [styles.splitCard, pressed && styles.splitCardPressed]}
        >
          <View style={styles.splitHeader}>
            <Text style={styles.sectionHeading}>{t('split.dashTitle')}</Text>
            <HIcon name="chevron-right" size={18} color={colors.textMuted} strokeWidth={2} />
          </View>
          <View style={styles.splitRow}>
            <SplitStat
              label={t('split.owedToYou')}
              amount={splitSummary.owed}
              count={splitSummary.owedCount}
              tone={colors.success}
              icon="money-receive-square"
              displayCurrency={displayCurrency}
              styles={styles}
              t={t}
            />
            <View style={styles.splitColDivider} />
            <SplitStat
              label={t('split.youOwe')}
              amount={splitSummary.owe}
              count={splitSummary.oweCount}
              tone={colors.danger}
              icon="money-send-square"
              displayCurrency={displayCurrency}
              styles={styles}
              t={t}
            />
          </View>
        </Pressable>
      )}

      {loaded && !hasExpenses && (
        <EmptyState onAdd={onAddPress} onLoadDemo={onLoadDemo} colors={colors} t={t} />
      )}
    </ScrollView>
    </View>
  );
}

// Month-over-month change beside the hero total: a plain "↓ 82.6%" in the
// semantic tone. `dir`: 'down' = spending fell (green ↓), 'up' = rose (red ↑),
// 'flat' = unchanged (muted, no arrow — an exact tie never reads as an increase).
const DeltaBadge = React.memo(function DeltaBadge({ value, dir, colors, styles }) {
  const tone = dir === 'down' ? colors.success : dir === 'up' ? colors.danger : colors.textMuted;
  const arrow = dir === 'down' ? '↓ ' : dir === 'up' ? '↑ ' : '';
  return (
    <Text style={[styles.deltaText, { color: tone }]} numberOfLines={1}>
      {arrow}
      {value}%
    </Text>
  );
});

// One side of the split-balances widget: label, toned amount, a person/debt
// count caption, and a toned icon on the right.
function SplitStat({ label, amount, count, tone, icon, displayCurrency, styles, t }) {
  const caption =
    count <= 0 ? t('split.noDebts') : count === 1 ? t('split.personOne') : t('split.personCount', { n: count });
  return (
    <View style={styles.splitCol}>
      <View style={styles.splitColText}>
        <Text style={styles.splitColLabel}>{label}</Text>
        <Text style={[styles.splitColValue, { color: tone }]} numberOfLines={1}>
          {formatMoneyShort(amount, displayCurrency)}
        </Text>
        <Text style={styles.splitColCaption} numberOfLines={1}>
          {caption}
        </Text>
      </View>
      <HIcon name={icon} size={30} color={tone} strokeWidth={1.8} />
    </View>
  );
}

const createStyles = (colors) =>
  StyleSheet.create({
    root: {
      flex: 1,
      backgroundColor: colors.background,
    },
    // Transparent so the fixed HeaderGlow wash behind it shows through; the
    // page background lives on `root`.
    container: {
      flex: 1,
    },
    content: {
      // paddingBottom is set inline (needs the safe-area inset).
      flexGrow: 1,
    },

    title: {
      color: colors.textPrimary,
      fontSize: 26,
      fontFamily: fonts.bold,
      paddingHorizontal: spacing.md,
      paddingTop: spacing.md,
      textAlign: 'center',
    },
    monthSelector: {
      marginBottom: spacing.md,
    },
    spendCard: {
      backgroundColor: colors.card,
      borderRadius: radius.md,
      marginHorizontal: spacing.md,
      padding: spacing.lg,
      ...cardShadow,
    },
    // The title-case card heading every Dashboard card leads with ("Monthly
    // Spending Summary" / "Split Balances & Debt" — CategorySummaryCard mirrors it).
    sectionHeading: {
      color: colors.textPrimary,
      fontFamily: fonts.bold,
      fontSize: 14,
      letterSpacing: 0.2,
      flexShrink: 1,
    },
    spendHeader: {
      flexDirection: 'row',
      alignItems: 'center',
      justifyContent: 'space-between',
      gap: spacing.sm,
      marginBottom: spacing.sm,
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
    chartWrap: {
      marginTop: spacing.md,
    },

    // Plain "↓ 82.6%" change beside the hero total.
    deltaText: {
      fontFamily: fonts.numBold,
      fontSize: 15,
      fontVariant: ['tabular-nums'],
      alignSelf: 'flex-end',
      marginBottom: 8,
    },

    // Split-balances widget — mirrors the budget card surface.
    splitCard: {
      backgroundColor: colors.card,
      borderRadius: radius.md,
      padding: spacing.md,
      marginHorizontal: spacing.md,
      marginTop: spacing.md,
      ...cardShadow,
    },
    splitCardPressed: {
      backgroundColor: colors.cardPressed,
    },
    splitHeader: {
      flexDirection: 'row',
      justifyContent: 'space-between',
      alignItems: 'center',
      marginBottom: spacing.sm,
    },
    splitRow: {
      flexDirection: 'row',
      alignItems: 'center',
    },
    splitCol: {
      flex: 1,
      flexDirection: 'row',
      alignItems: 'center',
      justifyContent: 'space-between',
      gap: spacing.sm,
    },
    splitColText: {
      flexShrink: 1,
    },
    splitColLabel: {
      color: colors.textSecondary,
      fontFamily: fonts.regular,
      fontSize: 13,
    },
    splitColValue: {
      fontFamily: fonts.numBold,
      fontSize: 22,
      fontVariant: ['tabular-nums'],
      marginTop: 1,
    },
    splitColCaption: {
      color: colors.textMuted,
      fontFamily: fonts.regular,
      fontSize: 12,
      marginTop: 1,
    },
    splitColDivider: {
      width: StyleSheet.hairlineWidth,
      alignSelf: 'stretch',
      backgroundColor: colors.border,
      marginHorizontal: spacing.md,
    },

  });
