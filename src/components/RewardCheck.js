import { useEffect, useRef, useState } from 'react';
import { Animated, Easing, StyleSheet } from 'react-native';
import Svg, { Circle, Defs, LinearGradient, Path, Stop } from 'react-native-svg';
import { colors } from '../theme';

// strokeDashoffset is an SVG prop, so it can't use the native driver — it gets
// its own Animated.Value on an animated Path (never shared with scale/opacity).
const AnimatedPath = Animated.createAnimatedComponent(Path);

const SIZE = 88;
const STROKE_WIDTH = 5;
const CHECK_D = 'M26 46 L39 59 L62 32';
// Geometric length of CHECK_D; dashoffset animates from this down to 0 to "draw" it.
const CHECK_LENGTH = 54;
const SHOW_MS = 1500; // when the fade-out starts
const FADE_MS = 300;

// The sole confirmation for adding an expense: a full-screen light-green
// backdrop fades in with a gradient check popping in at screen center, then
// everything fades back to the main view. Never intercepts touches.
export default function RewardCheck({ trigger }) {
  const [visible, setVisible] = useState(false);
  const scale = useRef(new Animated.Value(0)).current;
  const opacity = useRef(new Animated.Value(0)).current;
  const draw = useRef(new Animated.Value(CHECK_LENGTH)).current;
  const fadeTimeout = useRef(null);

  useEffect(() => {
    if (trigger === 0) return undefined; // initial mount, nothing to celebrate yet

    setVisible(true);
    scale.setValue(0);
    opacity.setValue(0);
    draw.setValue(CHECK_LENGTH);

    Animated.parallel([
      // Spring overshoots slightly and settles in ~400ms.
      Animated.spring(scale, {
        toValue: 1,
        friction: 6,
        tension: 180,
        useNativeDriver: true,
      }),
      Animated.timing(opacity, {
        toValue: 1,
        duration: 140,
        useNativeDriver: true,
      }),
      Animated.timing(draw, {
        toValue: 0,
        duration: 320,
        delay: 100,
        easing: Easing.out(Easing.cubic),
        useNativeDriver: false,
      }),
    ]).start();

    fadeTimeout.current = setTimeout(() => {
      Animated.timing(opacity, {
        toValue: 0,
        duration: FADE_MS,
        useNativeDriver: true,
      }).start(({ finished }) => {
        // A re-trigger stops this mid-fade (finished=false); stay mounted for the new run.
        if (finished) setVisible(false);
      });
    }, SHOW_MS);

    // Runs before the next trigger and on unmount: kills whichever phase is live.
    return () => {
      clearTimeout(fadeTimeout.current);
      scale.stopAnimation();
      opacity.stopAnimation();
      draw.stopAnimation();
    };
  }, [trigger, scale, opacity, draw]);

  if (!visible) return null;

  return (
    // One opacity drives backdrop and check together so "everything" fades as
    // a unit; the backdrop's green strength comes from its color's alpha.
    <Animated.View pointerEvents="none" style={[StyleSheet.absoluteFill, styles.overlay, { opacity }]}>
      <Animated.View style={{ transform: [{ scale }] }}>
        <Svg width={SIZE} height={SIZE} viewBox={`0 0 ${SIZE} ${SIZE}`}>
          <Defs>
            <LinearGradient id="rewardCheckGradient" x1="0%" y1="0%" x2="100%" y2="100%">
              <Stop offset="0%" stopColor={colors.accent} />
              <Stop offset="100%" stopColor={colors.accentTeal} />
            </LinearGradient>
          </Defs>
          <Circle
            cx={SIZE / 2}
            cy={SIZE / 2}
            r={(SIZE - STROKE_WIDTH) / 2}
            stroke="url(#rewardCheckGradient)"
            strokeWidth={STROKE_WIDTH}
            fill={`${colors.card}E6`}
          />
          <AnimatedPath
            d={CHECK_D}
            stroke="url(#rewardCheckGradient)"
            strokeWidth={STROKE_WIDTH + 1}
            strokeLinecap="round"
            strokeLinejoin="round"
            fill="none"
            strokeDasharray={CHECK_LENGTH}
            strokeDashoffset={draw}
          />
        </Svg>
      </Animated.View>
    </Animated.View>
  );
}

const styles = StyleSheet.create({
  overlay: {
    alignItems: 'center',
    justifyContent: 'center',
    backgroundColor: 'rgba(167, 243, 208, 1)',
  },
});
