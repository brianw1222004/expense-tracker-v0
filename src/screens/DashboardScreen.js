import React, { useMemo } from 'react';
import { Pressable, ScrollView, StyleSheet, Text, View } from 'react-native';
import Svg, { Defs, RadialGradient, Stop, Rect } from 'react-native-svg';

import CategorySummaryCard from '../components/CategorySummaryCard';
import EmptyState from '../components/EmptyState';
import SpendingChart from '../components/SpendingChart';
import { HIcon } from '../icons';
import { TAB_BAR_HEIGHT } from '../components/TabBar';
import { fonts, spacing, radius, useTheme, ACCOUNT_FAB_SIZE, cardShadow } from '../theme';
import { useT, useLanguage } from '../i18n';
import { formatMoney, formatMoneyShort, monthKeyLabel } from '../format';

// Soft iridescent bloom for the hero card's upper-right corner. The two hues
// (`glowStart` → `glowEnd`) come from the active theme so the wash harmonises
// with the palette — pink→violet on neutral (an intentional pop against the
// grayscale), cool blue→teal on slate, warm peach→gold on sand. Tune
// intensity/position via the stop opacities and gradient center below.
function CardGlow({ colors }) {
  return (
    <View style={styles_cardGlowClip} pointerEvents="none">
      <Svg width="100%" height="100%">
        <Defs>
          <RadialGradient id="spendCardGlow" cx="92%" cy="3%" r="95%" fx="92%" fy="3%">
            <Stop offset="0" stopColor={colors.glowStart} stopOpacity="0.5" />
            <Stop offset="0.45" stopColor={colors.glowEnd} stopOpacity="0.22" />
            <Stop offset="1" stopColor={colors.glowEnd} stopOpacity="0" />
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
  heroMonthKey,
  onShiftHeroMonth,
  displayCurrency,
  onOpenAccount,
  onAddPress,
  onLoadDemo,
  splitSummary,
  onOpenSplit,
  categoryMonths,
  categoryMonthKey,
  currentMonthKey,
  allCategories,
  onShiftCategoryMonth,
  onCategoryDetail,
}) {
  const { colors } = useTheme();
  const t = useT();
  const language = useLanguage();
  const styles = useMemo(() => createStyles(colors), [colors]);
  const greetingName = (userName ?? '').trim();
  const isCurrentMonth = heroMonthKey === currentMonthKey;
  const canGoNext = heroMonthKey < currentMonthKey;

  const delta = monthTotal - (lastMonthTotal ?? 0);
  const hasLastMonth = (lastMonthTotal ?? 0) > 0;
  // Spending down = good (green ↓), up = bad (red ↑), flat = neutral — mirrors
  // the three-way convention in the category breakdown so an exact tie isn't shown red.
  const heroDir = delta < 0 ? 'down' : delta > 0 ? 'up' : 'flat';
  const deltaPct = hasLastMonth ? (Math.abs(delta) / lastMonthTotal) * 100 : 0;

  return (
    <>
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
        {/* The month heading doubles as the hero card's month selector — the
            chevrons step the Monthly Spending total/delta/chart through past
            months (capped at the current month, like the category card nav). */}
        <View style={styles.monthNav}>
          <Pressable onPress={() => onShiftHeroMonth(-1)} hitSlop={10} accessibilityRole="button">
            <HIcon name="chevron-left" size={20} color={colors.icon} />
          </Pressable>
          <Text style={styles.monthHeading} numberOfLines={1}>
            {monthKeyLabel(heroMonthKey, language)}
          </Text>
          <Pressable
            onPress={() => onShiftHeroMonth(1)}
            disabled={!canGoNext}
            hitSlop={10}
            accessibilityRole="button"
            style={!canGoNext ? styles.navDisabled : undefined}
          >
            <HIcon name="chevron-right" size={20} color={colors.icon} />
          </Pressable>
        </View>
      </View>

      {/* Monthly Spending — total, month-over-month delta, trend chart. The
          display-currency pill moved to the Insight page's Budget card. */}
      <View style={styles.spendCard}>
        <CardGlow colors={colors} />
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
          monthKey={categoryMonthKey}
          currentMonthKey={currentMonthKey}
          displayCurrency={displayCurrency}
          allCategories={allCategories}
          onShiftMonth={onShiftCategoryMonth}
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
    </>
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
    container: {
      flex: 1,
      backgroundColor: colors.background,
    },
    content: {
      flexGrow: 1,
      paddingBottom: spacing.xl + TAB_BAR_HEIGHT,
    },

    greetingRow: {
      flexDirection: 'row',
      alignItems: 'center',
      justifyContent: 'space-between',
      minHeight: ACCOUNT_FAB_SIZE,
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
      flexShrink: 1,
    },
    greetingPressable: {
      flexShrink: 1,
    },
    // Month selector, top-right of the greeting row — label mirrors the
    // greeting; the chevrons drive the hero card's month.
    monthNav: {
      flexDirection: 'row',
      alignItems: 'center',
      gap: spacing.xs,
      marginLeft: spacing.sm,
      flexShrink: 0,
    },
    monthHeading: {
      color: colors.textPrimary,
      fontFamily: fonts.bold,
      fontSize: 22,
    },
    navDisabled: {
      opacity: 0.3,
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
