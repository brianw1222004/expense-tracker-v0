import { useMemo, useState } from 'react';
import { StyleSheet, Text, View } from 'react-native';
import Svg, { Path, Circle, G, Line, Text as SvgText } from 'react-native-svg';
import { fonts, spacing, useTheme } from '../theme';
import { formatMoneyShort } from '../format';

const CHART_HEIGHT = 150;
const PADDING_LEFT = 40;
const PADDING_RIGHT = 12;
const PADDING_TOP = 24;
const PADDING_BOTTOM = 28;

const X_TICKS = [1, 5, 10, 15, 20, 25, 30, 31];

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

// A bare daily-spending line chart, rendered inside the dashboard hero card.
// `dailyTotals` holds one entry per day of the current month; only days up to
// today are plotted, but the x-axis spans the whole month.
export default function SpendingChart({ dailyTotals, displayCurrency }) {
  const { colors } = useTheme();
  const styles = useMemo(() => createStyles(colors), [colors]);
  const [chartWidth, setChartWidth] = useState(0);
  const [activeIndex, setActiveIndex] = useState(null);

  const onLayout = (e) => {
    setChartWidth(e.nativeEvent.layout.width);
  };

  // All data-derived geometry. Recomputed only when the data or width changes —
  // not on every pointer move (the tooltip reads `activeIndex` separately) or
  // parent re-render (currency change, budget toggle, tab slide).
  const geom = useMemo(() => {
    const daysInMonth = dailyTotals.length;
    // getDate() is the day-of-month (1..31); clamp so it can never index past
    // the array near a month boundary.
    const today = Math.min(new Date().getDate(), daysInMonth);
    const totalsUpToToday = dailyTotals.slice(0, today);
    const maxVal = Math.max(...totalsUpToToday, 1);

    const drawWidth = chartWidth - PADDING_LEFT - PADDING_RIGHT;
    const drawHeight = CHART_HEIGHT - PADDING_TOP - PADDING_BOTTOM;
    const baselineY = PADDING_TOP + drawHeight;

    const getX = (dayIndex) =>
      daysInMonth <= 1 ? PADDING_LEFT + drawWidth / 2 : PADDING_LEFT + (dayIndex / (daysInMonth - 1)) * drawWidth;
    const getY = (value) => PADDING_TOP + drawHeight - (value / maxVal) * drawHeight;

    const points = totalsUpToToday.map((val, i) => ({ x: getX(i), y: getY(val) }));

    let linePath = '';
    if (points.length > 1) {
      linePath = `M${points[0].x},${points[0].y}`;
      for (let i = 1; i < points.length; i++) {
        const prev = points[i - 1];
        const curr = points[i];
        const cpx1 = prev.x + (curr.x - prev.x) * 0.4;
        const cpx2 = curr.x - (curr.x - prev.x) * 0.4;
        linePath += ` C${cpx1},${prev.y} ${cpx2},${curr.y} ${curr.x},${curr.y}`;
      }
    } else if (points.length === 1) {
      linePath = `M${points[0].x},${points[0].y} L${points[0].x},${points[0].y}`;
    }

    const areaPath = linePath
      ? `${linePath} L${points[points.length - 1].x},${baselineY} L${points[0].x},${baselineY} Z`
      : '';

    const xLabels = X_TICKS.filter((d) => d <= daysInMonth).map((d) => ({ day: d, x: getX(d - 1) }));

    const peakIndex = totalsUpToToday.reduce(
      (best, val, i) => (val > totalsUpToToday[best] ? i : best),
      0
    );
    const peakPoint = points.length > 0 ? points[peakIndex] : null;
    const peakVal = totalsUpToToday[peakIndex] ?? 0;
    const lastPoint = points.length > 0 ? points[points.length - 1] : null;

    const gridLines = gridSteps(maxVal).map((v) => ({ value: v, y: getY(v) }));

    return {
      daysInMonth, totalsUpToToday, drawWidth, baselineY,
      points, linePath, areaPath, xLabels, peakIndex, peakPoint, peakVal, lastPoint, gridLines,
    };
  }, [dailyTotals, chartWidth]);

  const {
    daysInMonth, totalsUpToToday, drawWidth, baselineY,
    points, linePath, areaPath, xLabels, peakIndex, peakPoint, peakVal, lastPoint, gridLines,
  } = geom;

  const handleInteraction = (e) => {
    const localX = e.nativeEvent.locationX ?? e.nativeEvent.offsetX;
    if (localX == null || drawWidth <= 0 || totalsUpToToday.length === 0) {
      setActiveIndex(null);
      return;
    }
    const ratio = (localX - PADDING_LEFT) / drawWidth;
    // Snap to the nearest plotted day, capped at today — so the whole chart
    // width is interactive instead of going dead past the last point.
    const idx = Math.max(0, Math.min(Math.round(ratio * (daysInMonth - 1)), totalsUpToToday.length - 1));
    setActiveIndex((cur) => (cur === idx ? cur : idx));
  };

  const clearActive = () => setActiveIndex((cur) => (cur === null ? cur : null));

  const activePoint = activeIndex != null && activeIndex < points.length ? points[activeIndex] : null;

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
            {gridLines.map((g) => (
              <G key={g.value}>
                <Line
                  x1={PADDING_LEFT}
                  y1={g.y}
                  x2={PADDING_LEFT + drawWidth}
                  y2={g.y}
                  stroke={colors.border}
                  strokeWidth={StyleSheet.hairlineWidth}
                  strokeDasharray="4,4"
                />
                <SvgText
                  x={PADDING_LEFT - 6}
                  y={g.y + 3}
                  textAnchor="end"
                  fontSize={9}
                  fontFamily={fonts.numRegular}
                  fill={colors.textMuted}
                >
                  {formatMoneyShort(g.value, displayCurrency)}
                </SvgText>
              </G>
            ))}

            <Line
              x1={PADDING_LEFT}
              y1={baselineY}
              x2={PADDING_LEFT + drawWidth}
              y2={baselineY}
              stroke={colors.border}
              strokeWidth={StyleSheet.hairlineWidth * 2}
            />

            {areaPath ? (
              <Path d={areaPath} fill={`${colors.accent}15`} />
            ) : null}
            {linePath ? (
              <Path
                d={linePath}
                fill="none"
                stroke={colors.accent}
                strokeWidth={2.5}
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

            {peakPoint && peakVal > 0 && activeIndex !== peakIndex && (
              <>
                <Circle
                  cx={peakPoint.x}
                  cy={peakPoint.y}
                  r={3.5}
                  fill={colors.danger}
                />
                <SvgText
                  x={peakPoint.x}
                  y={peakPoint.y - 8}
                  textAnchor="middle"
                  fontSize={11}
                  fontFamily={fonts.numBold}
                  fill={colors.danger}
                >
                  {formatMoneyShort(peakVal, displayCurrency)}
                </SvgText>
              </>
            )}

            {lastPoint && activeIndex !== points.length - 1 && (
              <Circle
                cx={lastPoint.x}
                cy={lastPoint.y}
                r={3.5}
                fill={colors.accent}
              />
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
                key={l.day}
                x={l.x}
                y={baselineY + 18}
                textAnchor="middle"
                fontSize={12}
                fontFamily={fonts.numRegular}
                fill={colors.textMuted}
              >
                {l.day}
              </SvgText>
            ))}
          </Svg>
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
            <Text style={styles.tooltipDay}>{activeIndex + 1}</Text>
            <Text style={styles.tooltipValue}>
              {formatMoneyShort(totalsUpToToday[activeIndex], displayCurrency)}
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
    tooltip: {
      position: 'absolute',
      alignItems: 'center',
      backgroundColor: colors.card,
      borderRadius: 10,
      paddingHorizontal: spacing.sm + 4,
      paddingVertical: spacing.xs + 2,
      shadowColor: '#000',
      shadowOffset: { width: 0, height: 2 },
      shadowOpacity: 0.14,
      shadowRadius: 6,
      elevation: 4,
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
