import React, { useMemo } from 'react';
import { Pressable, ScrollView, StyleSheet, Text, View } from 'react-native';

import CategorySummaryCard from '../components/CategorySummaryCard';
import EmptyState from '../components/EmptyState';
import HeaderGlow from '../components/HeaderGlow';
import MonthSelector from '../components/MonthSelector';
import SpendingChart from '../components/SpendingChart';
import { HIcon } from '../icons';
import { TAB_BAR_HEIGHT } from '../components/TabBar';
import { fonts, spacing, radius, useTheme, ACCOUNT_FAB_SIZE, cardShadow } from '../theme';
import { useT } from '../i18n';
import { formatMoney, formatMoneyShort } from '../format';

export default function DashboardScreen({
  loaded,
  hasExpenses,
  userName,
  monthTotal,
  lastMonthTotal,
  dailyTotals,
  monthKey,
  onShiftMonth,
  displayCurrency,
  onOpenAccount,
  onAddPress,
  onLoadDemo,
  splitSummary,
  onOpenSplit,
  categoryMonths,
  currentMonthKey,
  allCategories,
  onCategoryDetail,
}) {
  const { colors } = useTheme();
  const t = useT();
  const styles = useMemo(() => createStyles(colors), [colors]);
  const greetingName = (userName ?? '').trim();
  const isCurrentMonth = monthKey === currentMonthKey;

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
      contentContainerStyle={styles.content}
      showsVerticalScrollIndicator={false}
    >
      <View style={styles.greetingRow}>
        {greetingName ? (
          <Text style={styles.greeting} numberOfLines={1}>
            {t('dash.greeting', { name: greetingName })}
          </Text>
        ) : (
          <Pressable onPress={onOpenAccount} accessibilityRole="button" style={styles.greetingPressable}>
            <Text style={styles.greeting} numberOfLines={1}>
              {t('dash.greetingNoName')}
            </Text>
          </Pressable>
        )}
      </View>

      {/* This page's ‹ month › selection, under the title — scopes the hero
          card and the category summary card. Independent of the other tabs'
          month selectors. */}
      <MonthSelector
        monthKey={monthKey}
        currentMonthKey={currentMonthKey}
        onShift={onShiftMonth}
        style={styles.monthSelector}
      />

      {/* Monthly Spending — total, month-over-month delta, trend chart. */}
      <View style={styles.spendCard}>
        <View style={styles.spendTopRow}>
          <Text style={styles.balanceLabel}>{t('dash.monthlySpending')}</Text>
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
            <Text style={styles.summaryTitle}>{t('split.dashTitle')}</Text>
            <HIcon name="chevron-right" size={18} color={colors.textMuted} strokeWidth={2} />
          </View>
          <View style={styles.splitRow}>
            <View style={styles.splitCol}>
              <Text style={styles.splitColLabel}>{t('split.owedToYou')}</Text>
              <Text style={[styles.splitColValue, { color: colors.success }]} numberOfLines={1}>
                {formatMoneyShort(splitSummary.owed, displayCurrency)}
              </Text>
            </View>
            <View style={styles.splitColDivider} />
            <View style={styles.splitCol}>
              <Text style={styles.splitColLabel}>{t('split.youOwe')}</Text>
              <Text style={[styles.splitColValue, { color: colors.danger }]} numberOfLines={1}>
                {formatMoneyShort(splitSummary.owe, displayCurrency)}
              </Text>
            </View>
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
      flexGrow: 1,
      paddingBottom: spacing.xl + TAB_BAR_HEIGHT,
    },

    greetingRow: {
      flexDirection: 'row',
      alignItems: 'center',
      justifyContent: 'center',
      minHeight: ACCOUNT_FAB_SIZE,
      marginTop: spacing.sm,
      marginBottom: spacing.xs,
      marginHorizontal: spacing.md,
      // Symmetric clearance for the floating account button pinned top-left so
      // the greeting centers on the SCREEN, not in the leftover space.
      paddingHorizontal: ACCOUNT_FAB_SIZE + spacing.sm,
    },
    greeting: {
      color: colors.textPrimary,
      fontFamily: fonts.bold,
      fontSize: 22,
      flexShrink: 1,
      textAlign: 'center',
    },
    greetingPressable: {
      flexShrink: 1,
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
    spendTopRow: {
      flexDirection: 'row',
      justifyContent: 'space-between',
      alignItems: 'center',
      marginBottom: spacing.sm,
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
    chartWrap: {
      marginTop: spacing.md,
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

    summaryTitle: {
      color: colors.textPrimary,
      fontFamily: fonts.bold,
      fontSize: 15,
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
    },
    splitColLabel: {
      color: colors.textMuted,
      fontFamily: fonts.regular,
      fontSize: 12,
    },
    splitColValue: {
      fontFamily: fonts.numBold,
      fontSize: 18,
      fontVariant: ['tabular-nums'],
      marginTop: 2,
    },
    splitColDivider: {
      width: StyleSheet.hairlineWidth,
      alignSelf: 'stretch',
      backgroundColor: colors.border,
      marginHorizontal: spacing.md,
    },

  });
