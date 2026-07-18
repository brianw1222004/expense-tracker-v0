import { useMemo } from 'react';
import { Pressable, StyleSheet, Text, View } from 'react-native';
import Svg, { Circle } from 'react-native-svg';
import { fonts, spacing, radius, useTheme, cardShadow } from '../theme';
import { useT } from '../i18n';
import { formatMoneyShort } from '../format';
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

// How many categories get their own row beside the donut; the ring still
// carries every category, the rows surface only the biggest spenders.
const TOP_ROWS = 3;

// The category-spending summary card shown on the Dashboard (moved off the old
// Categories tab): a "Categorical Spending Overview" section heading (the same
// title-case heading style as the Dashboard's other cards), a rounded-segment
// donut of the month's spending by category with the total in the center, and
// the top-spending categories beside it — icon + name + spent amount, over a
// progress bar that fills against the category's budget in a zone tone (green
// under, orange within 15%, red over; budget on the right, share-of-total
// fill when no budget is set). The month comes from the app-wide selection on the Monthly
// Spending card (no month nav of its own). A "More detail ›" link in the
// header jumps to the Insight tab, which hosts the full per-category tile
// grid on its Categories card.
export default function CategorySummaryCard({
  months,
  monthKey,
  displayCurrency,
  allCategories,
  categoryBudgets,
  onMoreDetail,
}) {
  const { colors } = useTheme();
  const t = useT();
  const styles = useMemo(() => createStyles(colors), [colors]);

  const viewMonth = useMemo(
    () => months.find((m) => m.key === monthKey) ?? { key: monthKey, total: 0, byCategory: {} },
    [months, monthKey]
  );

  return (
    <View style={styles.card}>
      <View style={styles.cardHeader}>
        <Text style={styles.cardTitle}>{t('cats.sectionTitle')}</Text>
        <Pressable
          onPress={onMoreDetail}
          accessibilityRole="button"
          hitSlop={8}
          style={({ pressed }) => [styles.moreDetailLink, pressed && styles.moreDetailLinkPressed]}
        >
          <Text style={styles.moreDetailText}>{t('cats.moreDetail')}</Text>
          <HIcon name="chevron-right" size={14} color={colors.textSecondary} strokeWidth={2} />
        </Pressable>
      </View>

      <CategoryDonut
        byCategory={viewMonth.byCategory}
        total={viewMonth.total}
        displayCurrency={displayCurrency}
        allCategories={allCategories}
        categoryBudgets={categoryBudgets}
        colors={colors}
        styles={styles}
        t={t}
      />
    </View>
  );
}

// Rounded-segment donut of one month's spending by category. The ring carries
// the breakdown of ALL categories; beside it we list the top spenders, sharing
// the same `total` denominator so their percentages match the arcs.
function CategoryDonut({ byCategory, total, displayCurrency, allCategories, categoryBudgets, colors, styles, t }) {
  const segments = useMemo(() => {
    if (total <= 0) return [];
    return (allCategories ?? [])
      .map((cat) => ({ category: cat, value: byCategory[cat.id] ?? 0 }))
      .filter((s) => s.value > 0)
      .sort((a, b) => b.value - a.value);
  }, [byCategory, total, allCategories]);

  const arcs = useMemo(() => buildArcs(segments, total), [segments, total]);

  const topSegs = segments.slice(0, TOP_ROWS);

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
        {topSegs.map((seg, i) => (
          <View key={seg.category.id}>
            {i > 0 && <View style={styles.statDivider} />}
            <TopCategoryRow
              seg={seg}
              total={total}
              budget={categoryBudgets?.[seg.category.id] ?? 0}
              displayCurrency={displayCurrency}
              colors={colors}
              styles={styles}
              t={t}
            />
          </View>
        ))}
        {topSegs.length === 0 && (
          <Text style={styles.emptyMonth}>{t('cats.emptyMonth')}</Text>
        )}
      </View>
    </View>
  );
}

// One top-spending row beside the donut, in the shared category-row format
// (matching the Insight Categories list): a small category-tinted icon circle
// leads a two-line block and centers on its full height, so the name and the
// progress bar share the same left edge. Line 1 is name + this month's spend;
// line 2 is the bar with the budget beside it. The bar fills spent-of-budget
// in a budget-zone tone — green under budget, orange within 15% of it, red
// over — mirroring the Insight budget gauge; with no budget set it falls back
// to the category's share of the month total (green, no zone to breach) and
// the budget label is omitted.
function TopCategoryRow({ seg, total, budget, displayCurrency, colors, styles, t }) {
  const hasBudget = budget > 0;
  const ratio = hasBudget ? seg.value / budget : seg.value / total;
  const fillPct = Math.min(ratio * 100, 100);
  const tone =
    hasBudget && ratio > 1 ? colors.danger : hasBudget && ratio >= 0.85 ? colors.warning : colors.success;
  return (
    <View style={styles.statRow}>
      <View style={[styles.statIconBox, { backgroundColor: `${seg.category.color}1A` }]}>
        <HIcon name={seg.category.emoji} size={16} color={seg.category.color} strokeWidth={1.8} />
      </View>
      <View style={styles.statBody}>
        <View style={styles.statHead}>
          <Text style={styles.statName} numberOfLines={1}>
            {getCategoryLabel(seg.category, t)}
          </Text>
          <Text style={styles.statSpent} numberOfLines={1}>
            {formatMoneyShort(seg.value, displayCurrency)}
          </Text>
        </View>
        <View style={styles.statBarRow}>
          <View style={styles.statBarTrack}>
            <View style={[styles.statBarFill, { width: `${fillPct}%`, backgroundColor: tone }]} />
          </View>
          {hasBudget && (
            <Text style={styles.statBudget} numberOfLines={1}>
              {formatMoneyShort(budget, displayCurrency)}
            </Text>
          )}
        </View>
      </View>
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
    // Heading row: title on the left, the "More detail ›" link on the right.
    cardHeader: {
      flexDirection: 'row',
      alignItems: 'center',
      justifyContent: 'space-between',
      marginBottom: spacing.md,
    },
    // Title-case card heading — the same style as the Dashboard's other cards.
    cardTitle: {
      color: colors.textPrimary,
      fontFamily: fonts.bold,
      fontSize: 14,
      letterSpacing: 0.2,
      flexShrink: 1,
    },
    // Quiet "More detail ›" link in the header.
    moreDetailLink: {
      flexDirection: 'row',
      alignItems: 'center',
      gap: spacing.xs,
    },
    moreDetailLinkPressed: { opacity: 0.6 },
    moreDetailText: {
      color: colors.textSecondary,
      fontFamily: fonts.medium,
      fontSize: 14,
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
      letterSpacing: 0.2,
      marginTop: 1,
    },
    statCol: {
      flex: 1,
      marginLeft: spacing.lg,
      gap: spacing.sm,
    },
    // Dimmed hairline between the top-category rows beside the donut.
    statDivider: {
      height: StyleSheet.hairlineWidth,
      backgroundColor: colors.border,
      marginBottom: spacing.sm,
    },
    // A top-category row: tinted icon circle centered on the two-line block
    // beside it (the shared category-row format from the Insight list, sized
    // down for the narrow column beside the donut).
    statRow: {
      flexDirection: 'row',
      alignItems: 'center',
      gap: spacing.sm,
    },
    statIconBox: {
      width: 30,
      height: 30,
      borderRadius: 15,
      alignItems: 'center',
      justifyContent: 'center',
    },
    statBody: {
      flex: 1,
      gap: 4,
    },
    // Name + spend line of a top-category row.
    statHead: {
      flexDirection: 'row',
      alignItems: 'baseline',
      justifyContent: 'space-between',
      gap: spacing.sm,
    },
    statName: {
      flexShrink: 1,
      color: colors.textPrimary,
      fontFamily: fonts.bold,
      fontSize: 15,
    },
    // This month's spend, right-aligned on the name line.
    statSpent: {
      color: colors.textPrimary,
      fontFamily: fonts.numBold,
      fontSize: 14,
      fontVariant: ['tabular-nums'],
    },
    // Comparison bar with the budget beside it (label omitted when unbudgeted).
    statBarRow: {
      flexDirection: 'row',
      alignItems: 'center',
      gap: spacing.sm,
    },
    statBudget: {
      color: colors.textMuted,
      fontFamily: fonts.numRegular,
      fontSize: 12,
      fontVariant: ['tabular-nums'],
    },
    // Spent-of-budget fill in the zone tone (green/orange/red); neutral track
    // matching the Insight list's bars.
    statBarTrack: {
      flex: 1,
      height: 6,
      borderRadius: 3,
      backgroundColor: colors.background,
      overflow: 'hidden',
    },
    statBarFill: {
      height: '100%',
      borderRadius: 3,
    },
    emptyMonth: {
      color: colors.textMuted,
      fontFamily: fonts.regular,
      fontSize: 13,
      textAlign: 'center',
    },
  });
