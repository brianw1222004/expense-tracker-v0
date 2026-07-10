import React from 'react';
import { View } from 'react-native';
import Svg, { Defs, LinearGradient, Stop, Rect } from 'react-native-svg';
import { useTheme } from '../theme';

// Copilot-style page wash shared by every tab screen (it started life as the
// Dashboard hero card's corner bloom, promoted to a page background). A
// two-hue vertical fade (`glowStart` → `glowEnd` → transparent, hues from the
// active theme — pink→violet on neutral, blue→teal on slate, peach→gold on
// sand) runs from the top of the screen and dies out ~240px down (around the
// Dashboard hero number; every tab uses the same height so the wash reads
// identically across tabs). It sits FIXED behind each tab's transparent
// ScrollView (content scrolls over it), and App.js paints the status-bar
// strip in `glowWashTop` while the main tab UI is visible so the wash reads
// as starting at the physical top. The 0.34 top opacity must stay in sync
// with `glowWashTop` in theme.js (that token is the pre-blended solid of this
// top row).
//
// `id` must be unique per screen: the four tab screens stay mounted
// simultaneously, and SVG gradient ids are document-global on web.
export default function HeaderGlow({ id }) {
  const { colors } = useTheme();
  return (
    <View style={styles_glow} pointerEvents="none">
      <Svg width="100%" height="100%">
        <Defs>
          <LinearGradient id={id} x1="0%" y1="0%" x2="0%" y2="100%">
            <Stop offset="0" stopColor={colors.glowStart} stopOpacity="0.34" />
            <Stop offset="0.45" stopColor={colors.glowEnd} stopOpacity="0.2" />
            <Stop offset="1" stopColor={colors.glowEnd} stopOpacity="0" />
          </LinearGradient>
        </Defs>
        <Rect x="0" y="0" width="100%" height="100%" fill={`url(#${id})`} />
      </Svg>
    </View>
  );
}

// Static style (no theme colors). Positioning is spelled out because
// StyleSheet.absoluteFillObject was removed in RN 0.85. Height ends the fade
// around the Dashboard hero number's position.
const styles_glow = {
  position: 'absolute',
  top: 0,
  left: 0,
  right: 0,
  height: 240,
};
