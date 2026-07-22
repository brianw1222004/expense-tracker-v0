import { useCallback, useMemo, useRef, useState } from 'react';
import { Animated, Easing, Keyboard, PanResponder, useWindowDimensions } from 'react-native';

// Tab order — keep in sync with the TABS array in components/TabBar.js so the
// slide-transition direction stays correct.
export const TAB_INDEX = { dashboard: 0, list: 1, split: 2, insight: 3 };
export const TAB_NAMES = ['dashboard', 'list', 'split', 'insight'];

// Tab-switch transition: the page background + HeaderGlow wash sit on a fixed
// backdrop layer that never moves while the screens crossfade over it with a
// small directional glide — since every tab paints the identical background +
// wash, only the widgets appear to change, so a switch reads as one stationary
// page swapping its content (the Copilot-app feel).
// How far the widgets travel during the crossfade.
const COPILOT_GLIDE = 28;

// The tab-transition + swipe-gesture engine, extracted from App.js as a pure
// relocation (no behavior change). Owns the active/previous tab, the shared
// slideAnim, and the gesture bookkeeping. Returns:
//   tab          — the active tab id (drives which screen is interactive)
//   changeTab    — tap handler: animate to another tab
//   screenStyle  — the animated style for one kept-mounted screen
//   swipeHandlers — spread onto the content View to enable swipe-to-switch
export default function useTabSlide() {
  const { width: screenWidth } = useWindowDimensions();
  const [tab, setTab] = useState('dashboard');
  const [prevTab, setPrevTab] = useState('dashboard');
  const slideAnim = useRef(new Animated.Value(1)).current;
  const slideDirRef = useRef(1);
  const tabRef = useRef('dashboard');
  const swipingRef = useRef(false);
  const prevTabRef = useRef('dashboard');
  const swipeDirRef = useRef(0);

  const changeTab = useCallback(
    (next) => {
      const cur = tabRef.current;
      if (next === cur) return;
      swipingRef.current = false;
      Keyboard.dismiss();
      slideAnim.stopAnimation();
      slideDirRef.current = TAB_INDEX[next] > TAB_INDEX[cur] ? 1 : -1;
      setPrevTab(cur);
      prevTabRef.current = cur;
      setTab(next);
      tabRef.current = next;
      slideAnim.setValue(0);
      Animated.timing(slideAnim, {
        toValue: 1,
        // The crossfade travels a few px, not a screen width — a slightly
        // shorter run keeps it feeling snappy.
        duration: 260,
        easing: Easing.out(Easing.cubic),
        useNativeDriver: true,
      }).start(() => {
        setPrevTab(next);
      });
    },
    [slideAnim]
  );

  const swipePanResponder = useMemo(() => PanResponder.create({
    onStartShouldSetPanResponder: () => false,
    onMoveShouldSetPanResponder: (_, g) => {
      if (swipingRef.current) return true;
      if (Math.abs(g.dx) > 30 && Math.abs(g.dx) > Math.abs(g.dy) * 2) {
        swipeDirRef.current = g.dx < 0 ? 1 : -1;
        const nextIdx = TAB_INDEX[tabRef.current] + swipeDirRef.current;
        if (nextIdx < 0 || nextIdx > TAB_NAMES.length - 1) return false;
        return true;
      }
      return false;
    },
    onPanResponderGrant: () => {
      const cur = tabRef.current;
      const dir = swipeDirRef.current;
      const nextIdx = TAB_INDEX[cur] + dir;
      if (nextIdx < 0 || nextIdx > TAB_NAMES.length - 1) return;
      swipingRef.current = true;
      Keyboard.dismiss();
      slideDirRef.current = dir;
      prevTabRef.current = cur;
      setPrevTab(cur);
      setTab(TAB_NAMES[nextIdx]);
      tabRef.current = TAB_NAMES[nextIdx];
      slideAnim.setValue(0);
    },
    onPanResponderMove: (_, g) => {
      if (!swipingRef.current) return;
      const progress = Math.min(1, Math.max(0, Math.abs(g.dx) / screenWidth));
      slideAnim.setValue(progress);
    },
    onPanResponderRelease: (_, g) => {
      if (!swipingRef.current) return;
      swipingRef.current = false;
      const progress = Math.abs(g.dx) / screenWidth;
      const velocity = Math.abs(g.vx);
      if (progress > 0.3 || velocity > 0.5) {
        Animated.timing(slideAnim, {
          toValue: 1,
          duration: Math.max(100, 200 * (1 - progress)),
          easing: Easing.out(Easing.cubic),
          useNativeDriver: true,
        }).start(() => {
          setPrevTab(tabRef.current);
        });
      } else {
        const orig = prevTabRef.current;
        Animated.timing(slideAnim, {
          toValue: 0,
          duration: Math.max(100, 200 * progress),
          easing: Easing.out(Easing.cubic),
          useNativeDriver: true,
        }).start(() => {
          setTab(orig);
          tabRef.current = orig;
          setPrevTab(orig);
          slideAnim.setValue(1);
        });
      }
    },
    onPanResponderTerminate: () => {
      if (!swipingRef.current) return;
      swipingRef.current = false;
      const orig = prevTabRef.current;
      setTab(orig);
      tabRef.current = orig;
      setPrevTab(orig);
      slideAnim.setValue(1);
    },
  }), [slideAnim, screenWidth]);

  const screenStyle = (screenTab) => {
    if (prevTab === tab) {
      // The active screen must also win the stacking order, not just be
      // visible: on react-native-web pointerEvents="none" on a hidden screen's
      // container doesn't block its Pressable descendants (they carry an
      // explicit pointer-events:auto), so a later-in-DOM hidden screen (e.g.
      // Insight, mounted last) would swallow taps aimed at the screen below.
      return screenTab === tab ? { opacity: 1, zIndex: 2 } : { opacity: 0, zIndex: 0 };
    }
    const dir = slideDirRef.current;
    // Widgets-only motion: a crossfade plus a small directional glide. The
    // wash is a vertical (row-uniform) gradient, so the glide is invisible
    // on it, and the fixed backdrop behind the screens fills the strip a
    // gliding screen exposes with identical pixels — the background never
    // appears to move, only the widgets swap.
    if (screenTab === tab) {
      return {
        zIndex: 2,
        opacity: slideAnim,
        transform: [
          {
            translateX: slideAnim.interpolate({
              inputRange: [0, 1],
              outputRange: [dir * COPILOT_GLIDE, 0],
            }),
          },
        ],
      };
    }
    if (screenTab === prevTab) {
      return {
        zIndex: 1,
        opacity: slideAnim.interpolate({ inputRange: [0, 1], outputRange: [1, 0] }),
        transform: [
          {
            translateX: slideAnim.interpolate({
              inputRange: [0, 1],
              outputRange: [0, -dir * COPILOT_GLIDE],
            }),
          },
        ],
      };
    }
    return { opacity: 0, zIndex: 0 };
  };

  return { tab, changeTab, screenStyle, swipeHandlers: swipePanResponder.panHandlers };
}
