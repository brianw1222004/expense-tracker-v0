import { useMemo, useState } from 'react';
import { StyleSheet, Text, View } from 'react-native';
import Svg, { Path, Circle, Line, Text as SvgText } from 'react-native-svg';
import { fonts, spacing, useTheme } from '../theme';
import { formatMoneyShort } from '../format';

const CHART_HEIGHT = 150;
const PADDING_LEFT = 40;
const PADDING_RIGHT = 12;
const PADDING_TOP = 24;
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

// The hero-card spending line chart: a thick smoothed line in a light accent
// tint with the newest segment overdrawn in full accent, dashed HORIZONTAL
// gridlines (one per y value label), dot markers, and a floating pill badge
// on the latest point. No area fill or baseline.
// `dailyTotals` holds one entry per day of the current month; only days up to
// today are plotted, but the x-axis spans the whole month.
// `endDay` caps how many days are plotted (1-based, inclusive). Omitted, it
// defaults to today — the current-month behavior. Pass `dailyTotals.length`
// when rendering a fully elapsed (past) month so the whole month plots.
// `mode` ('daily' | 'monthly') picks the series: the month's per-day values
// (the default), or `monthlyTotals` — [{label, value}], one point per month —
// for the cross-month trend view. Monthly plots every slot with a dot; daily
// keeps dots off the line except the newest point.
export default function SpendingChart({ dailyTotals, displayCurrency, endDay, mode = 'daily', monthlyTotals }) {
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

    const maxVal = Math.max(...values, 1);

    const drawWidth = chartWidth - PADDING_LEFT - PADDING_RIGHT;
    const drawHeight = CHART_HEIGHT - PADDING_TOP - PADDING_BOTTOM;
    const baselineY = PADDING_TOP + drawHeight;

    const getX = (i) =>
      slotCount <= 1 ? PADDING_LEFT + drawWidth / 2 : PADDING_LEFT + (i / (slotCount - 1)) * drawWidth;
    const getY = (value) => PADDING_TOP + drawHeight - (value / maxVal) * drawHeight;

    const points = values.map((val, i) => ({ x: getX(i), y: getY(val) }));

    const cps = (prev, curr) => {
      const cpx1 = prev.x + (curr.x - prev.x) * 0.4;
      const cpx2 = curr.x - (curr.x - prev.x) * 0.4;
      return `C${cpx1},${prev.y} ${cpx2},${curr.y} ${curr.x},${curr.y}`;
    };

    let linePath = '';
    if (points.length > 1) {
      linePath = `M${points[0].x},${points[0].y}`;
      for (let i = 1; i < points.length; i++) {
        linePath += ` ${cps(points[i - 1], points[i])}`;
      }
    }

    // The newest segment, overdrawn in full accent on top of the tinted line
    // (the reference design's emphasized "current" stretch).
    const lastSegPath =
      points.length > 1
        ? `M${points[points.length - 2].x},${points[points.length - 2].y} ${cps(points[points.length - 2], points[points.length - 1])}`
        : '';

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
      values, slotCount, drawWidth, baselineY,
      points, linePath, lastSegPath, xLabels, dotIndexes, lastPoint, lastVal, yLabels,
    };
  }, [dailyTotals, chartWidth, endDay, monthly, monthlyTotals]);

  const {
    values, slotCount, drawWidth, baselineY,
    points, linePath, lastSegPath, xLabels, dotIndexes, lastPoint, lastVal, yLabels,
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

            {linePath ? (
              <Path
                d={linePath}
                fill="none"
                stroke={`${colors.accent}4D`}
                strokeWidth={3.5}
                strokeLinecap="round"
                strokeLinejoin="round"
              />
            ) : null}
            {lastSegPath ? (
              <Path
                d={lastSegPath}
                fill="none"
                stroke={colors.accent}
                strokeWidth={3.5}
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

            {/* Ringed dot markers: every point (monthly) + the newest point. */}
            {points.map((p, i) =>
              dotIndexes.has(i) && i !== activeIndex ? (
                <Circle
                  key={`dot-${i}`}
                  cx={p.x}
                  cy={p.y}
                  r={3.5}
                  fill={colors.accent}
                  stroke={colors.card}
                  strokeWidth={2}
                />
              ) : null
            )}

            {activePoint && (
              <Circle
                cx={activePoint.x}
                cy={activePoint.y}
                r={5}
                fill={colors.accent}
                stroke={colors.card}
                strokeWidth={2.5}
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
                top: activePoint.y > 52
                  ? activePoint.y - 46
                  : activePoint.y + 14,
              },
            ]}
            pointerEvents="none"
          >
            <Text style={styles.tooltipDay}>{tooltipLabel}</Text>
            <Text style={styles.tooltipValue}>
              {formatMoneyShort(values[activeIndex], displayCurrency)}
            </Text>
          </View>
        )}
      </View>
    </View>
  );
}

const createStyles = (colors) =>
  StyleSheet.create({
    // Spacing above the plotted chart when embedded inside the hero card.
    container: {
      marginTop: spacing.md,
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
  });
