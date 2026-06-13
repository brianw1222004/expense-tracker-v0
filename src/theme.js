import { createContext, useContext } from 'react';

// Two switchable palettes sharing one token shape. 'cookie' (warm cream /
// caramel) is the default; 'midnight' is the original dark-blue look. Every
// component resolves colors through useTheme() so switching re-renders live —
// never import a palette directly from a screen.
export const THEMES = {
  cookie: {
    name: 'cookie',
    // StatusBar / keyboardAppearance need the bar style, not a color.
    statusBarStyle: 'dark',
    keyboardAppearance: 'light',
    background: '#F6EDDD',
    card: '#FFF9EF',
    cardPressed: '#F0E2CB',
    border: '#E3D2B6',
    textPrimary: '#43301F',
    textSecondary: '#6E5638',
    textMuted: '#9A8163',
    accent: '#B96A21',
    accentDark: '#96521D',
    // Text/icons drawn on top of an accent-filled surface.
    onAccent: '#FFF7E8',
    success: '#3E8E4E',
    successAlt: '#67A95B',
    // Full-screen RewardCheck backdrop ("green screen"): solid by design, the
    // overlay's opacity is animated as a whole.
    successOverlay: '#DDEFD2',
    warning: '#C9881B',
    danger: '#BA4632',
    // Backdrop behind popup/sheet modals.
    backdrop: 'rgba(62, 42, 20, 0.45)',
  },
  midnight: {
    name: 'midnight',
    statusBarStyle: 'light',
    keyboardAppearance: 'dark',
    background: '#0F172A',
    card: '#1E293B',
    cardPressed: '#27374D',
    border: '#2C3E57',
    textPrimary: '#F1F5F9',
    textSecondary: '#94A3B8',
    textMuted: '#64748B',
    accent: '#34D399',
    accentDark: '#059669',
    onAccent: '#06281C',
    success: '#34D399',
    successAlt: '#2DD4BF',
    successOverlay: '#A7F3D0',
    warning: '#FBBF24',
    danger: '#FB7185',
    backdrop: 'rgba(2, 6, 17, 0.7)',
  },
};

export function getTheme(name) {
  return THEMES[name] ?? THEMES.cookie;
}

// Caladea is metric-compatible with Cambria (its open-licensed equivalent —
// Cambria itself is a commercial Microsoft font that can't be bundled).
// Custom fonts ship one file per weight, so styles set the weight by PICKING A
// FAMILY and must NOT also set fontWeight (Android would re-resolve and can
// drop to a fake bold or the default face).
export const fonts = {
  regular: 'Caladea_400Regular',
  bold: 'Caladea_700Bold',
  italic: 'Caladea_400Regular_Italic',
};

export const spacing = {
  xs: 4,
  sm: 8,
  md: 16,
  lg: 24,
  xl: 32,
};

export const radius = {
  sm: 10,
  md: 16,
  lg: 24,
};

const ThemeContext = createContext({ themeName: 'cookie', colors: THEMES.cookie });

export function ThemeProvider({ themeName, children }) {
  const colors = getTheme(themeName);
  return (
    <ThemeContext.Provider value={{ themeName: colors.name, colors }}>
      {children}
    </ThemeContext.Provider>
  );
}

// Returns { themeName, colors }. Components build their StyleSheet inside a
// useMemo keyed on colors so a theme switch restyles everything live.
export function useTheme() {
  return useContext(ThemeContext);
}
