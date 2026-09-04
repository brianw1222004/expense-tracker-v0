import { useMemo, useState } from 'react';
import { StyleSheet, Text, View } from 'react-native';
import Svg, { Path, Circle, Line, Text as SvgText } from 'react-native-svg';
import { fonts, spacing, useTheme } from '../theme';
import { formatMoneyShort } from '../format';

const CHART_HEIGHT = 150;
const PADDING_LEFT = 40;
const PADDING_RIGHT = 12;
// Headroom above the tallest point and — since the container no longer carries
// a top margin (see createStyles) — the WHOLE gap under the hero figure. It used
// to be 24 stacked on a spacing.md margin; those 40px are halved into this 20.
const PADDING_TOP = 20;
const PADDING_BOTTOM = 28;

// Fixed ticks plus the month's actual last day (appended at render). Listing
// 30 AND 31 here made both render one day apart in 31-day months — they
// overlapped into "3031" at the chart's right edge.
const X_TICKS = [1, 5, 10, 15, 20, 25];

// The floating-pill drop shared by the latest-value badge and the scrub
// tooltip (lighter than the theme's popupShadow — these sit on the card).
const pillShadow = {
  shadowColor: '#000',
  shadowOffset: { width: 0, height: 2 },
  shadowOpacity: 0.14,
  shadowRadius: 6,
  elevation: 4,
};

// The previous-month comparison line's opacity: dimmed at rest so the selected
// month owns the card, lifted while the user scrubs (the interaction is what
// asks for the comparison).
const COMPARE_DIM = 0.28;
const COMPARE_ACTIVE = 0.6;

function gridSteps(maxVal) {
  if (maxVal <= 0) return [];
  const rough = maxVal / 4;
  const mag = Math.pow(10, Math.floor(Math.log10(rough)));
  const step = [1, 2, 5, 10].find(n => n * mag >= rough) * mag;
  const lines = [];
  for (let v = step; v < maxVal * 0.95; v += step) {
    lines.push(v);
  }
  return lines;
}

// The hero-card spending line chart: a THIN single-tone accent line with
// angular (unsmoothed) joins, dashed HORIZONTAL gridlines (one per y value
// label), dot markers, and a floating pill badge on the latest point. No area
// fill or baseline. The line is one weight/colour end to end — the old thick
// pale line with the newest segment overdrawn in full accent read as two
// different charts spliced together.
// `dailyTotals` holds one entry per day of the current month; only days up to
// today are plotted, but the x-axis spans the whole month.
// `endDay` caps how many days are plotted (1-based, inclusive). Omitted, it
// defaults to today — the current-month behavior. Pass `dailyTotals.length`
// when rendering a fully elapsed (past) month so the whole month plots.
// `mode` ('daily' | 'monthly') picks the series: the month's per-day values
// (the default), or `monthlyTotals` — [{label, value}], one point per month —
// for the cross-month trend view. Monthly plots every slot with a dot; daily
// keeps dots off the line except the newest point.
// `compareTotals` (daily mode only) is the PREVIOUS month's per-day series,
// drawn as a second line on the same day axis and the same y scale: dimmed at
// rest, lifted while scrubbing, with its value in the tooltip. It plots in
// full (a past month is complete) even though the selected month stops at
// today — that month-to-date vs. whole-month read is the point of it.
export default function SpendingChart({ dailyTotals, displayCurrency, endDay, mode = 'daily', monthlyTotals, compareTotals }) {
  const { colors } = useTheme();
  const styles = useMemo(() => createStyles(colors), [colors]);
  const [chartWidth, setChartWidth] = useState(0);
  const [activeIndex, setActiveIndex] = useState(null);

  const onLayout = (e) => {
    setChartWidth(e.nativeEvent.layout.width);
  };

  const monthly = mode === 'monthly' && monthlyTotals && monthlyTotals.length > 0;

  // All data-derived geometry. Recomputed only when the data, width or mode
  // changes — not on every pointer move (the tooltip reads `activeIndex`
  // separately) or parent re-render (currency change, tab slide).
  const geom = useMemo(() => {
    const daysInMonth = dailyTotals.length;
    // getDate() is the day-of-month (1..31); clamp so it can never index past
    // the array near a month boundary.
    const today = Math.min(endDay ?? new Date().getDate(), daysInMonth);

    // One x slot per day (daily — the axis spans the WHOLE month so it stays
    // put as days accrue) or per month (monthly — every slot is plotted).
    let values;
    let slotCount;
    let labelSlots; // [{ index, label }] — the x-axis tick labels
    if (monthly) {
      slotCount = monthlyTotals.length;
      values = monthlyTotals.map((m) => m.value);
      labelSlots = monthlyTotals.map((m, i) => ({ index: i, label: m.label }));
    } else {
      slotCount = daysInMonth;
      values = dailyTotals.slice(0, today);
      labelSlots = [...X_TICKS.filter((d) => d < daysInMonth), daysInMonth].map((d) => ({
        index: d - 1,
        label: String(d),
      }));
    }

    // The comparison series shares the day axis, so a previous month LONGER
    // than the selected one loses its overhanging days (there's no slot to put
    // them in); a shorter one simply ends early.
    const compareValues = monthly ? [] : (compareTotals ?? []).slice(0, slotCount);

    // One scale for both lines — a comparison drawn to its own max would be a
    // lie about the shape it's being compared to.
    const maxVal = Math.max(...values, ...compareValues, 1);

    const drawWidth = chartWidth - PADDING_LEFT - PADDING_RIGHT;
    const drawHeight = CHART_HEIGHT - PADDING_TOP - PADDING_BOTTOM;
    const baselineY = PADDING_TOP + drawHeight;

    const getX = (i) =>
      slotCount <= 1 ? PADDING_LEFT + drawWidth / 2 : PADDING_LEFT + (i / (slotCount - 1)) * drawWidth;
    const getY = (value) => PADDING_TOP + drawHeight - (value / maxVal) * drawHeight;

    const points = values.map((val, i) => ({ x: getX(i), y: getY(val) }));
    const comparePoints = compareValues.map((val, i) => ({ x: getX(i), y: getY(val) }));

    // Straight segments, round joins — a single spike day now reads as a crisp
    // peak instead of the balloon a Bezier smoothing pass inflated it into.
    const toPath = (pts) => {
      if (pts.length < 2) return '';
      let d = `M${pts[0].x},${pts[0].y}`;
      for (let i = 1; i < pts.length; i++) d += ` L${pts[i].x},${pts[i].y}`;
      return d;
    };
    const linePath = toPath(points);
    const comparePath = toPath(comparePoints);

    const xLabels = labelSlots.map(({ index, label }) => ({ x: getX(index), label }));

    // Dot markers: every point in monthly mode (few, well-spaced slots); in
    // daily mode only the newest point — a dot per gridline day read as noise.
    const dotIndexes = new Set();
    if (monthly) points.forEach((_, i) => dotIndexes.add(i));
    if (points.length > 0) dotIndexes.add(points.length - 1);

    const lastPoint = points.length > 0 ? points[points.length - 1] : null;
    const lastVal = values.length > 0 ? values[values.length - 1] : 0;

    const yLabels = gridSteps(maxVal).map((v) => ({ value: v, y: getY(v) }));

    return {
      values, compareValues, slotCount, drawWidth, baselineY,
      points, comparePoints, linePath, comparePath,
      xLabels, dotIndexes, lastPoint, lastVal, yLabels,
    };
  }, [dailyTotals, chartWidth, endDay, monthly, monthlyTotals, compareTotals]);

  const {
    values, compareValues, slotCount, drawWidth, baselineY,
    points, comparePoints, linePath, comparePath,
    xLabels, dotIndexes, lastPoint, lastVal, yLabels,
  } = geom;

  const handleInteraction = (e) => {
    const localX = e.nativeEvent.locationX ?? e.nativeEvent.offsetX;
    if (localX == null || drawWidth <= 0 || values.length === 0) {
      setActiveIndex(null);
      return;
    }
    const ratio = (localX - PADDING_LEFT) / drawWidth;
    // Snap to the nearest plotted slot, capped at the newest — so the whole
    // chart width is interactive instead of going dead past the last point.
    const idx = Math.max(0, Math.min(Math.round(ratio * (slotCount - 1)), values.length - 1));
    setActiveIndex((cur) => (cur === idx ? cur : idx));
  };

  const clearActive = () => setActiveIndex((cur) => (cur === null ? cur : null));

  const activePoint = activeIndex != null && activeIndex < points.length ? points[activeIndex] : null;
  // The comparison's reading at the scrubbed day (it can run out earlier than
  // the selected month — e.g. the 31st against a 30-day previous month).
  const compareActive =
    activePoint && activeIndex < comparePoints.length ? comparePoints[activeIndex] : null;
  const tooltipLabel =
    activeIndex == null
      ? ''
      : monthly
      ? monthlyTotals[activeIndex]?.label ?? ''
      : String(activeIndex + 1);

  return (
    <View style={styles.container}>
      <View
        style={styles.chartWrap}
        onLayout={onLayout}
        onStartShouldSetResponder={() => true}
        onResponderGrant={handleInteraction}
        onResponderMove={handleInteraction}
        onResponderRelease={clearActive}
        onResponderTerminate={clearActive}
        onMouseMove={handleInteraction}
        onMouseLeave={clearActive}
      >
        {chartWidth > 0 && (
          <Svg width={chartWidth} height={CHART_HEIGHT}>
            {/* Dashed horizontal gridline per y value label (the reference look). */}
            {yLabels.map((g) => (
              <Line
                key={`grid-${g.value}`}
                x1={PADDING_LEFT}
                y1={g.y}
                x2={chartWidth - PADDING_RIGHT}
                y2={g.y}
                stroke={colors.border}
                strokeWidth={1}
                strokeDasharray="3,5"
              />
            ))}

            {yLabels.map((g) => (
              <SvgText
                key={g.value}
                x={PADDING_LEFT - 6}
                y={g.y + 3}
                textAnchor="end"
                fontSize={9}
                fontFamily={fonts.numRegular}
                fill={colors.textMuted}
              >
                {formatMoneyShort(g.value, displayCurrency)}
              </SvgText>
            ))}

            {/* Previous month, UNDER the selected one and dimmed until the
                user scrubs — same hue and weight, so the difference the eye
                picks up is the shape, not the styling. */}
            {comparePath ? (
              <Path
                d={comparePath}
                fill="none"
                stroke={colors.accent}
                strokeWidth={2}
                strokeLinecap="round"
                strokeLinejoin="round"
                opacity={activePoint ? COMPARE_ACTIVE : COMPARE_DIM}
              />
            ) : null}

            {linePath ? (
              <Path
                d={linePath}
                fill="none"
                stroke={colors.accent}
                strokeWidth={2}
                strokeLinecap="round"
                strokeLinejoin="round"
              />
            ) : null}

            {activePoint && (
              <Line
                x1={activePoint.x}
                y1={PADDING_TOP}
                x2={activePoint.x}
                y2={baselineY}
                stroke={colors.accent}
                strokeWidth={1}
                strokeDasharray="4,3"
                opacity={0.4}
              />
            )}

            {/* Dot markers: every point (monthly) + the newest point. The
                newest reads as a solid terminal cap on the thin line; the
                in-between monthly dots stay small and ringed so a dense run of
                them doesn't thicken the line. */}
            {points.map((p, i) => {
              if (!dotIndexes.has(i) || i === activeIndex) return null;
              const isLast = i === points.length - 1;
              return (
                <Circle
                  key={`dot-${i}`}
                  cx={p.x}
                  cy={p.y}
                  r={isLast ? 4 : 2.5}
                  fill={colors.accent}
                  stroke={isLast ? 'none' : colors.card}
                  strokeWidth={isLast ? 0 : 1.5}
                />
              );
            })}

            {compareActive && (
              <Circle
                cx={compareActive.x}
                cy={compareActive.y}
                r={3.5}
                fill={colors.accent}
                stroke={colors.card}
                strokeWidth={1.5}
                opacity={COMPARE_ACTIVE}
              />
            )}

            {activePoint && (
              <Circle
                cx={activePoint.x}
                cy={activePoint.y}
                r={4.5}
                fill={colors.accent}
                stroke={colors.card}
                strokeWidth={2}
              />
            )}

            {xLabels.map((l) => (
              <SvgText
                key={`label-${l.label}`}
                x={l.x}
                y={baselineY + 18}
                textAnchor="middle"
                fontSize={12}
                fontFamily={fonts.numRegular}
                fill={colors.textMuted}
              >
                {l.label}
              </SvgText>
            ))}
          </Svg>
        )}

        {/* Floating badge on the newest point (hidden while scrubbing, and
            when the latest value is 0 — a "$0" pill on the baseline is noise,
            e.g. a past month whose final days had no spending). */}
        {lastPoint && lastVal > 0 && !activePoint && (
          <View
            style={[
              styles.lastBadge,
              {
                left: Math.max(4, Math.min(chartWidth - 76, lastPoint.x - 66)),
                top: lastPoint.y > 44 ? lastPoint.y - 36 : lastPoint.y + 12,
              },
            ]}
            pointerEvents="none"
          >
            <Text style={styles.lastBadgeText}>
              {formatMoneyShort(lastVal, displayCurrency)}
            </Text>
          </View>
        )}

        {activePoint && (
          <View
            style={[
              styles.tooltip,
              {
                left: Math.max(4, Math.min(chartWidth - 76, activePoint.x - 38)),
                // The comparison row makes the pill ~14px taller, so it needs
                // that much more clearance before it can sit above the point.
                top: activePoint.y > (compareActive ? 66 : 52)
                  ? activePoint.y - (compareActive ? 60 : 46)
                  : activePoint.y + 14,
              },
            ]}
            pointerEvents="none"
          >
            <Text style={styles.tooltipDay}>{tooltipLabel}</Text>
            <Text style={styles.tooltipValue}>
              {formatMoneyShort(values[activeIndex], displayCurrency)}
            </Text>
            {/* Same day, previous month. The dimmed dash echoes the dimmed
                line, which is what says WHICH line this figure belongs to. */}
            {compareActive && (
              <View style={styles.tooltipCompareRow}>
                <View style={styles.tooltipCompareSwatch} />
                <Text style={styles.tooltipCompareValue}>
                  {formatMoneyShort(compareValues[activeIndex], displayCurrency)}
                </Text>
              </View>
            )}
          </View>
        )}
      </View>
    </View>
  );
}

const createStyles = (colors) =>
  StyleSheet.create({
    // No margin of its own: PADDING_TOP inside the SVG is the whole gap under
    // the hero figure now (a margin here on top of it stacked into a canyon).
    container: {
      marginTop: 0,
    },
    chartWrap: {
      position: 'relative',
    },
    // Shared floating-pill chrome for the latest-value badge and the tooltip.
    lastBadge: {
      position: 'absolute',
      backgroundColor: colors.card,
      borderRadius: 999,
      paddingHorizontal: spacing.sm + 4,
      paddingVertical: spacing.xs + 1,
      ...pillShadow,
      borderWidth: StyleSheet.hairlineWidth,
      borderColor: colors.border,
    },
    lastBadgeText: {
      color: colors.accent,
      fontFamily: fonts.numBold,
      fontSize: 12,
      fontVariant: ['tabular-nums'],
    },
    tooltip: {
      position: 'absolute',
      alignItems: 'center',
      backgroundColor: colors.card,
      borderRadius: 10,
      paddingHorizontal: spacing.sm + 4,
      paddingVertical: spacing.xs + 2,
      ...pillShadow,
      borderWidth: StyleSheet.hairlineWidth,
      borderColor: colors.border,
    },
    tooltipDay: {
      color: colors.textMuted,
      fontFamily: fonts.numRegular,
      fontSize: 10,
      lineHeight: 13,
    },
    tooltipValue: {
      color: colors.textPrimary,
      fontFamily: fonts.numBold,
      fontSize: 13,
      fontVariant: ['tabular-nums'],
      lineHeight: 17,
    },
    // The previous-month reading, keyed to the dimmed line by a matching dash.
    tooltipCompareRow: {
      flexDirection: 'row',
      alignItems: 'center',
      gap: 5,
    },
    tooltipCompareSwatch: {
      width: 9,
      height: 2,
      borderRadius: 1,
      backgroundColor: colors.accent,
      opacity: COMPARE_ACTIVE,
    },
    tooltipCompareValue: {
      color: colors.textMuted,
      fontFamily: fonts.numRegular,
      fontSize: 11,
      fontVariant: ['tabular-nums'],
      lineHeight: 14,
    },
  });
