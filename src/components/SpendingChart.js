import { useMemo, useState } from 'react';
import { StyleSheet, Text, View } from 'react-native';
import Svg, { Path, Circle, G, Line, Text as SvgText } from 'react-native-svg';
import { fonts, spacing, radius, useTheme } from '../theme';
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

export default function SpendingChart({ dailyTotals, displayCurrency, title, quickStats }) {
  const { colors } = useTheme();
  const styles = useMemo(() => createStyles(colors), [colors]);
  const [chartWidth, setChartWidth] = useState(0);

  const onLayout = (e) => {
    setChartWidth(e.nativeEvent.layout.width);
  };

  const today = new Date().getDate();
  const daysInMonth = dailyTotals.length;
  const totalsUpToToday = dailyTotals.slice(0, today);

  const maxVal = Math.max(...totalsUpToToday, 1);

  const drawWidth = chartWidth - PADDING_LEFT - PADDING_RIGHT;
  const drawHeight = CHART_HEIGHT - PADDING_TOP - PADDING_BOTTOM;

  const getX = (dayIndex) =>
    daysInMonth <= 1 ? PADDING_LEFT + drawWidth / 2 : PADDING_LEFT + (dayIndex / (daysInMonth - 1)) * drawWidth;
  const getY = (value) =>
    PADDING_TOP + drawHeight - (value / maxVal) * drawHeight;

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
    ? `${linePath} L${points[points.length - 1].x},${PADDING_TOP + drawHeight} L${points[0].x},${PADDING_TOP + drawHeight} Z`
    : '';

  const xLabels = X_TICKS.filter((d) => d <= daysInMonth).map((d) => ({
    day: d,
    x: getX(d - 1),
  }));

  const lastPoint = points.length > 0 ? points[points.length - 1] : null;
  const peakIndex = totalsUpToToday.reduce(
    (best, val, i) => (val > totalsUpToToday[best] ? i : best),
    0
  );
  const peakPoint = points.length > 0 ? points[peakIndex] : null;
  const peakVal = totalsUpToToday[peakIndex] ?? 0;

  const yGridLines = gridSteps(maxVal);

  return (
    <View style={styles.card}>
      <Text style={styles.title}>{title}</Text>
      {quickStats && (
        <Text style={styles.statsLine}>
          <Text style={styles.statsLineBold}>{quickStats[0].value}</Text>
          {' '}{quickStats[0].label}{'  · '}
          <Text style={styles.statsLineBold}>{quickStats[1].value}</Text>
          {' '}{quickStats[1].label}{'  · '}
          <Text style={styles.statsLineBold}>{quickStats[2].value}</Text>
          {' '}{quickStats[2].label}
        </Text>
      )}
      <View style={styles.chartWrap} onLayout={onLayout}>
        {chartWidth > 0 && (
          <Svg width={chartWidth} height={CHART_HEIGHT}>
            {yGridLines.map((v) => (
              <G key={v}>
                <Line
                  x1={PADDING_LEFT}
                  y1={getY(v)}
                  x2={PADDING_LEFT + drawWidth}
                  y2={getY(v)}
                  stroke={colors.border}
                  strokeWidth={StyleSheet.hairlineWidth}
                  strokeDasharray="4,4"
                />
                <SvgText
                  x={PADDING_LEFT - 6}
                  y={getY(v) + 3}
                  textAnchor="end"
                  fontSize={9}
                  fontFamily={fonts.regular}
                  fill={colors.textMuted}
                >
                  {formatMoneyShort(v, displayCurrency)}
                </SvgText>
              </G>
            ))}

            <Line
              x1={PADDING_LEFT}
              y1={PADDING_TOP + drawHeight}
              x2={PADDING_LEFT + drawWidth}
              y2={PADDING_TOP + drawHeight}
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

            {peakPoint && peakVal > 0 && (
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
                  fontFamily={fonts.bold}
                  fill={colors.danger}
                >
                  {formatMoneyShort(peakVal, displayCurrency)}
                </SvgText>
              </>
            )}

            {lastPoint && (
              <Circle
                cx={lastPoint.x}
                cy={lastPoint.y}
                r={3.5}
                fill={colors.accent}
              />
            )}

            {xLabels.map((l) => (
              <SvgText
                key={l.day}
                x={l.x}
                y={PADDING_TOP + drawHeight + 18}
                textAnchor="middle"
                fontSize={12}
                fontFamily={fonts.regular}
                fill={colors.textMuted}
              >
                {l.day}
              </SvgText>
            ))}
          </Svg>
        )}
      </View>
    </View>
  );
}

const createStyles = (colors) =>
  StyleSheet.create({
    card: {
      backgroundColor: colors.card,
      borderRadius: radius.md,
      marginHorizontal: spacing.md,
      marginTop: spacing.sm + 4,
      padding: spacing.md,
      paddingBottom: spacing.sm,
    },
    title: {
      color: colors.textSecondary,
      fontFamily: fonts.bold,
      fontSize: 13,
      textTransform: 'uppercase',
      letterSpacing: 0.8,
    },
    statsLine: {
      color: colors.textMuted,
      fontFamily: fonts.regular,
      fontSize: 12,
      marginTop: 3,
      marginBottom: spacing.xs,
    },
    statsLineBold: {
      fontFamily: fonts.bold,
      color: colors.textPrimary,
    },
    chartWrap: {
      overflow: 'hidden',
    },
  });
