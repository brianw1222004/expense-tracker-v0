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

function formatPct(pct) {
  if (pct < 10) return `${pct.toFixed(1)}%`;
  // Never round a sub-100% share up to "100%" — beside a non-zero "least" card
  // that reads as a contradiction (the two visibly don't sum).
  const rounded = Math.round(pct);
  return `${rounded >= 100 && pct < 100 ? 99 : rounded}%`;
}

// How many categories get their own row beside the donut; the ring still
// carries every category, the rows surface only the biggest spenders.
const TOP_ROWS = 3;

// The category-spending summary card shown on the Dashboard (moved off the old
// Categories tab): a "CATEGORICAL SPENDING OVERVIEW" section heading (the same
// uppercase heading style as the Dashboard's other cards), a rounded-segment
// donut of the month's spending by category with the total in the center, and
// the top-spending categories beside it (icon + name + share). The month comes
// from the app-wide selection on the Monthly Spending card (no month nav of
// its own). A centered "More detail ⌄" link below jumps to the Insight tab,
// which hosts the full per-category tile grid on its Categories card.
export default function CategorySummaryCard({
  months,
  monthKey,
  displayCurrency,
  allCategories,
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
      <Text style={styles.cardTitle}>{t('cats.sectionTitle')}</Text>

      <CategoryDonut
        byCategory={viewMonth.byCategory}
        total={viewMonth.total}
        displayCurrency={displayCurrency}
        allCategories={allCategories}
        colors={colors}
        styles={styles}
        t={t}
      />

      <Pressable
        onPress={onMoreDetail}
        accessibilityRole="button"
        hitSlop={8}
        style={({ pressed }) => [styles.moreDetailLink, pressed && styles.moreDetailLinkPressed]}
      >
        <Text style={styles.moreDetailText}>{t('cats.moreDetail')}</Text>
        <HIcon name="chevron-down" size={14} color={colors.textSecondary} strokeWidth={2} />
      </Pressable>
    </View>
  );
}

// Rounded-segment donut of one month's spending by category. The ring carries
// the breakdown of ALL categories; beside it we list the top spenders, sharing
// the same `total` denominator so their percentages match the arcs.
function CategoryDonut({ byCategory, total, displayCurrency, allCategories, colors, styles, t }) {
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
            <TopCategoryRow seg={seg} total={total} styles={styles} t={t} />
          </View>
        ))}
        {topSegs.length === 0 && (
          <Text style={styles.emptyMonth}>{t('cats.emptyMonth')}</Text>
        )}
      </View>
    </View>
  );
}

// One top-spending row beside the donut: the category's icon in its color,
// its name, and its share of the month right-aligned in the same color.
function TopCategoryRow({ seg, total, styles, t }) {
  const pct = (seg.value / total) * 100;
  return (
    <View style={styles.statRow}>
      <HIcon name={seg.category.emoji} size={24} color={seg.category.color} strokeWidth={1.8} />
      <Text style={styles.statName} numberOfLines={1}>
        {getCategoryLabel(seg.category, t)}
      </Text>
      <Text style={[styles.statPct, { color: seg.category.color }]}>{formatPct(pct)}</Text>
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
    // Uppercase card heading — the same style as the Dashboard's other cards.
    cardTitle: {
      color: colors.textPrimary,
      fontFamily: fonts.bold,
      fontSize: 14,
      letterSpacing: 0.6,
      textTransform: 'uppercase',
      marginBottom: spacing.md,
    },
    // Centered quiet "More detail ⌄" link under the donut body.
    moreDetailLink: {
      flexDirection: 'row',
      alignItems: 'center',
      justifyContent: 'center',
      alignSelf: 'center',
      gap: spacing.xs,
      paddingVertical: spacing.xs,
      paddingHorizontal: spacing.sm,
      marginTop: spacing.sm,
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
      letterSpacing: 0.6,
      textTransform: 'uppercase',
      marginTop: 1,
    },
    statCol: {
      flex: 1,
      marginLeft: spacing.lg,
      gap: spacing.md,
    },
    // Dimmed hairline between the top-category rows beside the donut.
    statDivider: {
      height: StyleSheet.hairlineWidth,
      backgroundColor: colors.border,
      marginBottom: spacing.md,
    },
    statRow: {
      flexDirection: 'row',
      alignItems: 'center',
      gap: spacing.sm,
    },
    statName: {
      flex: 1,
      color: colors.textPrimary,
      fontFamily: fonts.bold,
      fontSize: 18,
    },
    statPct: {
      fontFamily: fonts.numBold,
      fontSize: 17,
      fontVariant: ['tabular-nums'],
    },
    emptyMonth: {
      color: colors.textMuted,
      fontFamily: fonts.regular,
      fontSize: 13,
      textAlign: 'center',
    },
  });
