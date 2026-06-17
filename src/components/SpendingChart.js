import { useMemo, useState, useRef, useCallback } from 'react';
import { Animated, LayoutAnimation, Platform, Pressable, StyleSheet, Text, UIManager, View } from 'react-native';

if (Platform.OS === 'android') UIManager.setLayoutAnimationEnabledExperimental?.(true);
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

export default function SpendingChart({ dailyTotals, displayCurrency, title }) {
  const { colors } = useTheme();
  const styles = useMemo(() => createStyles(colors), [colors]);
  const [chartWidth, setChartWidth] = useState(0);
  const [activeIndex, setActiveIndex] = useState(null);
  const [open, setOpen] = useState(true);
  const rotateAnim = useRef(new Animated.Value(0)).current;

  const toggleOpen = useCallback(() => {
    LayoutAnimation.configureNext(LayoutAnimation.Presets.easeInEaseOut);
    setOpen((prev) => {
      const next = !prev;
      Animated.timing(rotateAnim, { toValue: next ? 0 : 1, duration: 250, useNativeDriver: true }).start();
      return next;
    });
  }, [rotateAnim]);

  const chevronRotate = rotateAnim.interpolate({ inputRange: [0, 1], outputRange: ['0deg', '-90deg'] });

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

  const handleInteraction = (e) => {
    const localX = e.nativeEvent.locationX ?? e.nativeEvent.offsetX;
    if (localX == null || drawWidth <= 0 || totalsUpToToday.length === 0) {
      setActiveIndex(null);
      return;
    }
    const ratio = (localX - PADDING_LEFT) / drawWidth;
    const idx = Math.round(ratio * (daysInMonth - 1));
    if (idx >= 0 && idx < totalsUpToToday.length) {
      setActiveIndex(idx);
    } else {
      setActiveIndex(null);
    }
  };

  const clearActive = () => setActiveIndex(null);

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

  const activePoint = activeIndex != null ? points[activeIndex] : null;

  return (
    <View style={styles.card}>
      <Pressable style={styles.titleRow} onPress={toggleOpen}>
        <Animated.Text style={[styles.chevron, { transform: [{ rotate: chevronRotate }] }]}>▾</Animated.Text>
        <Text style={styles.title}>{title}</Text>
      </Pressable>
      {open && (
      <View>
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
                  fontFamily={fonts.numRegular}
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

            {activePoint && (
              <Line
                x1={activePoint.x}
                y1={PADDING_TOP}
                x2={activePoint.x}
                y2={PADDING_TOP + drawHeight}
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
                y={PADDING_TOP + drawHeight + 18}
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
      )}
    </View>
  );
}

const createStyles = (colors) =>
  StyleSheet.create({
    card: {
      backgroundColor: colors.card,
      borderRadius: radius.md,
      marginHorizontal: spacing.md,
      marginTop: spacing.md,
      padding: spacing.md,
      paddingBottom: spacing.sm,
      borderWidth: colors.widgetBorderWidth,
      borderColor: colors.widgetBorderColor,
      shadowColor: '#000',
      shadowOffset: { width: 0, height: 1 },
      shadowOpacity: 0.06,
      shadowRadius: 8,
      elevation: 1,
    },
    titleRow: {
      flexDirection: 'row',
      alignItems: 'center',
    },
    chevron: {
      color: colors.accent,
      fontSize: 16,
      marginRight: spacing.xs + 2,
      marginTop: -1,
    },
    title: {
      color: colors.textPrimary,
      fontFamily: fonts.bold,
      fontSize: 15,
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
