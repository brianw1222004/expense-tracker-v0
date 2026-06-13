import { useEffect, useMemo, useRef } from 'react';
import { Animated, StyleSheet, Text, View } from 'react-native';
import Svg, { Line, Path } from 'react-native-svg';
import { fonts, spacing, useTheme } from '../theme';
import { useT } from '../i18n';
import { formatMoney } from '../format';
import { getCurrency } from '../currency';

// Speedometer-style dial: a 240° arc that fills with spent/budget, a sprung
// needle, and the remaining amount in the dial face. All geometry is computed
// in a fixed 280-wide coordinate space and scales with the parent width.
const W = 280;
const STROKE = 14;
const CX = W / 2;
const R = CX - STROKE; // 126
const CY = R + STROKE; // top of the arc kisses y = STROKE
const H = Math.ceil(CY + R * 0.5 + STROKE / 2 + 4); // arc bottom at ±30° plus stroke
// Standard math angles (0° = 3 o'clock, counterclockwise positive); the dial
// sweeps clockwise from 210° (lower left) through 90° (top) to −30°.
const START_DEG = 210;
const SWEEP_DEG = 240;
const NEEDLE_LEN = R - STROKE - 16;
const NEEDLE_W = 5;

function polar(angleDeg, r = R) {
  const rad = (angleDeg * Math.PI) / 180;
  return { x: CX + r * Math.cos(rad), y: CY - r * Math.sin(rad) };
}

// Clockwise arc (screen coords) from one dial angle to another.
function arcPath(fromDeg, toDeg, r = R) {
  const start = polar(fromDeg, r);
  const end = polar(toDeg, r);
  const largeArc = fromDeg - toDeg > 180 ? 1 : 0;
  return `M ${start.x} ${start.y} A ${r} ${r} 0 ${largeArc} 1 ${end.x} ${end.y}`;
}

export default function BudgetGauge({ spent, budget, displayCurrency }) {
  const { colors } = useTheme();
  const t = useT();

  // Compare at display precision so a sub-cent float residue can't read as
  // "over" while both rendered numbers look identical (same rule as the old bar).
  const factor = 10 ** getCurrency(displayCurrency).decimals;
  const rounded = Math.round(spent * factor) / factor;
  const ratio = budget > 0 ? rounded / budget : 0;
  const capped = Math.min(1, Math.max(0, ratio));
  const over = rounded > budget;

  // Needle springs to the new position; rotation is a transform, so the native
  // driver is fine (rule: never mix drivers on one value — this one is only
  // ever driven by springs here).
  const needle = useRef(new Animated.Value(capped)).current;
  useEffect(() => {
    Animated.spring(needle, {
      toValue: capped,
      friction: 8,
      tension: 40,
      useNativeDriver: true,
    }).start();
    return () => needle.stopAnimation();
  }, [capped, needle]);

  const rotate = needle.interpolate({
    inputRange: [0, 1],
    outputRange: ['-120deg', '120deg'],
  });

  const zoneColor = over ? colors.danger : ratio >= 0.75 ? colors.warning : colors.success;
  const fillTo = START_DEG - SWEEP_DEG * capped;

  // Tick marks every 30°, drawn just inside the track.
  const ticks = useMemo(() => {
    const marks = [];
    for (let deg = START_DEG; deg >= START_DEG - SWEEP_DEG; deg -= 30) {
      const outer = polar(deg, R - STROKE / 2 - 5);
      const inner = polar(deg, R - STROKE / 2 - 13);
      marks.push({ deg, outer, inner });
    }
    return marks;
  }, []);

  const remaining = over ? rounded - budget : budget - rounded;

  return (
    <View
      style={styles.container}
      accessibilityRole="image"
      accessibilityLabel={`${t(over ? 'budget.overBy' : 'budget.remaining')}: ${formatMoney(
        remaining,
        displayCurrency
      )}. ${t('budget.spentOf', {
        spent: formatMoney(rounded, displayCurrency),
        budget: formatMoney(budget, displayCurrency),
      })}`}
    >
      <View style={styles.dial}>
        <Svg width="100%" height="100%" viewBox={`0 0 ${W} ${H}`}>
          <Path
            d={arcPath(START_DEG, START_DEG - SWEEP_DEG)}
            stroke={colors.cardPressed}
            strokeWidth={STROKE}
            strokeLinecap="round"
            fill="none"
          />
          {capped > 0 && (
            <Path
              d={arcPath(START_DEG, fillTo)}
              stroke={zoneColor}
              strokeWidth={STROKE}
              strokeLinecap="round"
              fill="none"
            />
          )}
          {ticks.map(({ deg, outer, inner }) => (
            <Line
              key={deg}
              x1={outer.x}
              y1={outer.y}
              x2={inner.x}
              y2={inner.y}
              stroke={colors.border}
              strokeWidth={2}
              strokeLinecap="round"
            />
          ))}
        </Svg>

        {/* Needle: a full-height pivot view rotated around its center (the dial
            center); only the top half is drawn, so it sweeps like a hand. */}
        <Animated.View pointerEvents="none" style={[styles.needlePivot, { transform: [{ rotate }] }]}>
          <View style={[styles.needleArm, { backgroundColor: colors.textPrimary }]} />
        </Animated.View>
        <View pointerEvents="none" style={[styles.hub, { backgroundColor: colors.textPrimary }]}>
          <View style={[styles.hubDot, { backgroundColor: zoneColor }]} />
        </View>

        {/* Dial face: remaining (or overshoot) inside the arc, under the hub. */}
        <View pointerEvents="none" style={styles.face}>
          <Text
            style={[styles.faceValue, { color: over ? colors.danger : colors.textPrimary }]}
            numberOfLines={1}
            adjustsFontSizeToFit
          >
            {formatMoney(remaining, displayCurrency)}
          </Text>
          <Text style={[styles.faceLabel, { color: over ? colors.danger : colors.textMuted }]}>
            {t(over ? 'budget.overBy' : 'budget.remaining')}
          </Text>
        </View>
      </View>

      <Text style={[styles.spentLine, { color: colors.textSecondary }]}>
        {t('budget.spentOf', {
          spent: formatMoney(rounded, displayCurrency),
          budget: formatMoney(budget, displayCurrency),
        })}
      </Text>
    </View>
  );
}

// Percent-based positions keep the overlay aligned with the scaled SVG: the
// dial View has the same aspect ratio as the viewBox, so % of width/height in
// the View equals % in viewBox coordinates.
const pct = (value, total) => `${(value / total) * 100}%`;

const styles = StyleSheet.create({
  container: {
    alignItems: 'center',
  },
  dial: {
    width: '100%',
    maxWidth: 320,
    aspectRatio: W / H,
  },
  needlePivot: {
    position: 'absolute',
    left: pct(CX - NEEDLE_W / 2, W),
    top: pct(CY - NEEDLE_LEN, H),
    width: pct(NEEDLE_W, W),
    height: pct(NEEDLE_LEN * 2, H),
  },
  needleArm: {
    width: '100%',
    height: '50%',
    borderRadius: NEEDLE_W / 2,
  },
  hub: {
    position: 'absolute',
    left: pct(CX - 11, W),
    top: pct(CY - 11, H),
    width: pct(22, W),
    height: pct(22, H),
    borderRadius: 999,
    alignItems: 'center',
    justifyContent: 'center',
  },
  hubDot: {
    width: '36%',
    height: '36%',
    borderRadius: 999,
  },
  face: {
    position: 'absolute',
    left: 0,
    right: 0,
    top: pct(CY + 16, H),
    alignItems: 'center',
  },
  faceValue: {
    fontFamily: fonts.bold,
    fontSize: 26,
    fontVariant: ['tabular-nums'],
    maxWidth: '52%',
  },
  faceLabel: {
    fontFamily: fonts.regular,
    fontSize: 12,
    marginTop: 1,
  },
  spentLine: {
    fontFamily: fonts.regular,
    fontSize: 14,
    marginTop: spacing.xs,
    fontVariant: ['tabular-nums'],
  },
});
