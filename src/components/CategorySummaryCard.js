import { useMemo } from 'react';
import { Pressable, StyleSheet, Text, View } from 'react-native';
import Svg, { Circle } from 'react-native-svg';
import { fonts, spacing, radius, useTheme, cardShadow } from '../theme';
import { useT, useLanguage } from '../i18n';
import { formatMoneyShort, monthKeyLabel } from '../format';
import { getCategoryLabel } from '../categories';
import { HIcon } from '../icons';

const DONUT_SIZE = 132;
const DONUT_STROKE = 20;
const DONUT_R = (DONUT_SIZE - DONUT_STROKE) / 2;
const DONUT_CX = DONUT_SIZE / 2;
const DONUT_CY = DONUT_SIZE / 2;
const DONUT_CIRC = 2 * Math.PI * DONUT_R;

// Minimum gap (in SVG units along the circumference) reserved between segments
// so a 100%-one-category month never renders a seam from a zero-width gap.
const MIN_GAP = 0.5;

function buildArcs(segments, total) {
  if (total <= 0 || segments.length === 0) return [];
  const totalGap = segments.length * MIN_GAP;
  const available = Math.max(0, DONUT_CIRC - totalGap);
  let cursor = 0;
  return segments.map((seg) => {
    const dash = (seg.value / total) * available;
    const offset = DONUT_CIRC * 0.25 - cursor;
    cursor += dash + MIN_GAP;
    return {
      key: seg.category.id,
      color: seg.category.color,
      dash: Math.max(dash, 0),
      offset,
    };
  });
}

function formatPct(pct) {
  if (pct < 10) return `${pct.toFixed(1)}%`;
  // Never round a sub-100% share up to "100%" — beside a non-zero "least" card
  // that reads as a contradiction (the two visibly don't sum).
  const rounded = Math.round(pct);
  return `${rounded >= 100 && pct < 100 ? 99 : rounded}%`;
}

// The category-spending summary card shown on the Dashboard (moved off the old
// Categories tab): a month nav, a rounded-segment donut of the month's spending
// by category with the total in the center, and the single most- / least-spent
// category beside it. A "more detail" pill (top-right) opens the full
// per-category breakdown page (CategoryBreakdownScreen).
export default function CategorySummaryCard({
  months,
  monthKey,
  currentMonthKey,
  displayCurrency,
  allCategories,
  onShiftMonth,
  onMoreDetail,
}) {
  const { colors } = useTheme();
  const t = useT();
  const language = useLanguage();
  const styles = useMemo(() => createStyles(colors), [colors]);

  const viewMonth = useMemo(
    () => months.find((m) => m.key === monthKey) ?? { key: monthKey, total: 0, byCategory: {} },
    [months, monthKey]
  );
  const canGoNext = monthKey < currentMonthKey;

  return (
    <View style={styles.card}>
      <View style={styles.topRow}>
        <View style={styles.monthNav}>
          <Pressable onPress={() => onShiftMonth(-1)} hitSlop={12} accessibilityRole="button">
            <HIcon name="chevron-left" size={20} color={colors.icon} />
          </Pressable>
          <Text style={styles.monthLabel}>{monthKeyLabel(monthKey, language)}</Text>
          <Pressable
            onPress={() => onShiftMonth(1)}
            disabled={!canGoNext}
            hitSlop={12}
            accessibilityRole="button"
            style={!canGoNext ? styles.navDisabled : undefined}
          >
            <HIcon name="chevron-right" size={20} color={colors.icon} />
          </Pressable>
        </View>
        <Pressable
          onPress={onMoreDetail}
          accessibilityRole="button"
          hitSlop={8}
          style={({ pressed }) => [styles.moreDetailPill, pressed && styles.moreDetailPillPressed]}
        >
          <Text style={styles.moreDetailText}>{t('cats.moreDetail')}</Text>
          <Text style={styles.moreDetailChevron}>›</Text>
        </Pressable>
      </View>

      <CategoryDonut
        byCategory={viewMonth.byCategory}
        total={viewMonth.total}
        displayCurrency={displayCurrency}
        allCategories={allCategories}
        colors={colors}
        styles={styles}
        t={t}
      />
    </View>
  );
}

// Rounded-segment donut of one month's spending by category. The ring carries
// the breakdown of ALL categories; beside it we surface only the extremes — the
// single most- and least-spent categories — sharing the same `total` denominator
// so their percentages match the arcs.
function CategoryDonut({ byCategory, total, displayCurrency, allCategories, colors, styles, t }) {
  const segments = useMemo(() => {
    if (total <= 0) return [];
    return (allCategories ?? [])
      .map((cat) => ({ category: cat, value: byCategory[cat.id] ?? 0 }))
      .filter((s) => s.value > 0)
      .sort((a, b) => b.value - a.value);
  }, [byCategory, total, allCategories]);

  const arcs = useMemo(() => buildArcs(segments, total), [segments, total]);

  const mostSeg = segments[0] ?? null;
  const leastSeg = segments.length > 1 ? segments[segments.length - 1] : null;

  return (
    <View style={styles.donutBody}>
      <View style={styles.donut}>
        <Svg width="100%" height="100%" viewBox={`0 0 ${DONUT_SIZE} ${DONUT_SIZE}`}>
          <Circle
            cx={DONUT_CX}
            cy={DONUT_CY}
            r={DONUT_R}
            stroke={colors.cardPressed}
            strokeWidth={DONUT_STROKE}
            fill="none"
          />
          {arcs.map((arc) => (
            <Circle
              key={arc.key}
              cx={DONUT_CX}
              cy={DONUT_CY}
              r={DONUT_R}
              stroke={arc.color}
              strokeWidth={DONUT_STROKE}
              fill="none"
              strokeDasharray={`${arc.dash} ${DONUT_CIRC - arc.dash}`}
              strokeDashoffset={arc.offset}
            />
          ))}
        </Svg>
        <View style={[StyleSheet.absoluteFill, styles.donutCenter]}>
          <Text
            style={[styles.donutTotal, { color: colors.textPrimary }]}
            numberOfLines={1}
            adjustsFontSizeToFit
          >
            {formatMoneyShort(total, displayCurrency)}
          </Text>
          <Text style={styles.donutCaption}>{t('cats.totalCaption')}</Text>
        </View>
      </View>

      <View style={styles.statCol}>
        {mostSeg && (
          <ExtremeStat
            label={t('cats.mostSpending')}
            seg={mostSeg}
            total={total}
            displayCurrency={displayCurrency}
            colors={colors}
            styles={styles}
            t={t}
          />
        )}
        {leastSeg && (
          <ExtremeStat
            label={t('cats.leastSpending')}
            seg={leastSeg}
            total={total}
            displayCurrency={displayCurrency}
            colors={colors}
            styles={styles}
            t={t}
          />
        )}
        {!mostSeg && (
          <Text style={styles.emptyMonth}>{t('cats.emptyMonth')}</Text>
        )}
      </View>
    </View>
  );
}

// One "most/least spending" card beside the donut: a tinted pill with the
// category's color, its name + share, and the amount in the display currency.
function ExtremeStat({ label, seg, total, displayCurrency, colors, styles, t }) {
  const pct = (seg.value / total) * 100;
  return (
    <View style={[styles.statCard, { backgroundColor: `${seg.category.color}14` }]}>
      <Text style={styles.statLabel}>{label}</Text>
      <View style={styles.statRow}>
        <View style={[styles.statDot, { backgroundColor: seg.category.color }]} />
        <Text style={styles.statName} numberOfLines={1}>
          {getCategoryLabel(seg.category, t)}
        </Text>
        <Text style={[styles.statPct, { color: seg.category.color }]}>{formatPct(pct)}</Text>
      </View>
      <Text style={styles.statAmount} numberOfLines={1}>
        {formatMoneyShort(seg.value, displayCurrency)}
      </Text>
    </View>
  );
}

const createStyles = (colors) =>
  StyleSheet.create({
    card: {
      backgroundColor: colors.card,
      borderRadius: radius.md,
      padding: spacing.md,
      marginHorizontal: spacing.md,
      marginTop: spacing.md,
      ...cardShadow,
    },
    topRow: {
      flexDirection: 'row',
      alignItems: 'center',
      marginBottom: spacing.sm,
      minHeight: 24,
    },
    monthNav: {
      // flex:1 so the pill (a flexShrink:0 sibling) can never overlap the nav's
      // tap zone — the centered label sits in the space left of the pill.
      flex: 1,
      flexDirection: 'row',
      alignItems: 'center',
      justifyContent: 'center',
      gap: spacing.md,
    },
    navDisabled: { opacity: 0.3 },
    monthLabel: {
      color: colors.textPrimary,
      fontFamily: fonts.bold,
      fontSize: 15,
      minWidth: 100,
      textAlign: 'center',
    },
    // A flex sibling to the right of the month nav (not absolute — that overlapped
    // the nav's right-chevron tap zone on narrow screens / long locales).
    moreDetailPill: {
      flexShrink: 0,
      marginLeft: spacing.sm,
      flexDirection: 'row',
      alignItems: 'center',
      gap: 2,
      backgroundColor: colors.background,
      borderWidth: StyleSheet.hairlineWidth,
      borderColor: colors.border,
      borderRadius: 12,
      paddingHorizontal: spacing.sm,
      paddingVertical: 3,
    },
    moreDetailPillPressed: { backgroundColor: colors.cardPressed },
    moreDetailText: {
      color: colors.accent,
      fontFamily: fonts.bold,
      fontSize: 12,
    },
    moreDetailChevron: {
      color: colors.accent,
      fontFamily: fonts.bold,
      fontSize: 14,
      lineHeight: 16,
    },
    donutBody: {
      flexDirection: 'row',
      alignItems: 'center',
    },
    donut: { width: DONUT_SIZE, height: DONUT_SIZE },
    donutCenter: {
      alignItems: 'center',
      justifyContent: 'center',
      paddingHorizontal: DONUT_STROKE + 4,
    },
    donutTotal: {
      fontFamily: fonts.numBold,
      fontSize: 18,
      fontVariant: ['tabular-nums'],
    },
    donutCaption: {
      color: colors.textMuted,
      fontFamily: fonts.medium,
      fontSize: 10,
      letterSpacing: 0.6,
      textTransform: 'uppercase',
      marginTop: 1,
    },
    statCol: {
      flex: 1,
      marginLeft: spacing.md,
      gap: spacing.sm,
    },
    statCard: {
      borderRadius: radius.sm,
      paddingHorizontal: spacing.sm + 2,
      paddingVertical: spacing.sm,
      gap: 3,
    },
    statLabel: {
      color: colors.textMuted,
      fontFamily: fonts.medium,
      fontSize: 10,
      letterSpacing: 0.6,
      textTransform: 'uppercase',
    },
    statRow: {
      flexDirection: 'row',
      alignItems: 'center',
      gap: spacing.xs + 2,
    },
    statDot: {
      width: 9,
      height: 9,
      borderRadius: 5,
    },
    statName: {
      flex: 1,
      color: colors.textPrimary,
      fontFamily: fonts.bold,
      fontSize: 13,
    },
    statPct: {
      fontFamily: fonts.numBold,
      fontSize: 13,
      fontVariant: ['tabular-nums'],
    },
    statAmount: {
      color: colors.textSecondary,
      fontFamily: fonts.numRegular,
      fontSize: 12,
      fontVariant: ['tabular-nums'],
    },
    emptyMonth: {
      color: colors.textMuted,
      fontFamily: fonts.regular,
      fontSize: 13,
      textAlign: 'center',
    },
  });
