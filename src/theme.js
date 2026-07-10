import { createContext, useContext, useMemo } from 'react';

export const THEMES = {
  slate: {
    name: 'slate',
    statusBarStyle: 'dark',
    keyboardAppearance: 'light',
    background: '#f6f8f9',
    card: '#ffffff',
    cardPressed: '#eceff2',
    border: '#d4dde3',
    textPrimary: '#212a30',
    textSecondary: '#405664',
    textMuted: '#829fae',
    accent: '#4e6a7b',
    accentDark: '#384954',
    onAccent: '#f6f8f9',
    success: '#5b8a6a',
    successAlt: '#7da88a',
    successOverlay: '#e8f0ea',
    warning: '#b8963e',
    danger: '#b85c5c',
    backdrop: 'rgba(33, 42, 48, 0.5)',
    // Dashboard top-of-page wash — a cool blue→teal fade that echoes this
    // palette. glowWashTop is glowStart at the wash's top opacity (0.34)
    // pre-blended over `background`: App.js paints the status-bar strip with
    // it so the wash reads as starting at the physical top of the screen.
    glowStart: '#A9CBE8',
    glowEnd: '#9FD3C8',
    glowWashTop: '#dce9f3',
    headerText: '#f6f8f9',
    headerTextSecondary: 'rgba(246, 248, 249, 0.65)',
    icon: '#638394',
  },
  sand: {
    name: 'sand',
    statusBarStyle: 'dark',
    keyboardAppearance: 'light',
    background: '#f5f3ee',
    card: '#ffffff',
    cardPressed: '#e7e4db',
    border: '#d2ccb9',
    textPrimary: '#28211b',
    textSecondary: '#605240',
    textMuted: '#a29470',
    accent: '#79694e',
    accentDark: '#605240',
    onAccent: '#f5f3ee',
    success: '#6b8a5b',
    successAlt: '#8aa87d',
    successOverlay: '#edf0e8',
    warning: '#b8963e',
    danger: '#b85c5c',
    backdrop: 'rgba(40, 33, 27, 0.5)',
    // Dashboard top-of-page wash — a warm peach→gold fade that echoes this
    // palette; glowWashTop = glowStart @ 0.34 over `background` (see slate).
    glowStart: '#F3C6A4',
    glowEnd: '#E6CF9A',
    glowWashTop: '#f4e4d5',
    headerText: '#f5f3ee',
    headerTextSecondary: 'rgba(245, 243, 238, 0.65)',
    icon: '#948461',
  },
  neutral: {
    name: 'neutral',
    statusBarStyle: 'dark',
    keyboardAppearance: 'light',
    background: '#fafafa',
    card: '#ffffff',
    cardPressed: '#f5f5f5',
    border: '#dedede',
    textPrimary: '#0b0b0b',
    textSecondary: '#404040',
    textMuted: '#a3a3a3',
    accent: '#535353',
    accentDark: '#404040',
    onAccent: '#fafafa',
    success: '#5b8a6a',
    successAlt: '#7da88a',
    successOverlay: '#e8f0ea',
    warning: '#b8963e',
    danger: '#b85c5c',
    backdrop: 'rgba(11, 11, 11, 0.5)',
    // Dashboard top-of-page wash — the original pink→violet iridescence, an
    // intentional pop of color against this grayscale palette;
    // glowWashTop = glowStart @ 0.34 over `background` (see slate).
    glowStart: '#F8B6D2',
    glowEnd: '#BCA9F5',
    glowWashTop: '#f9e3ec',
    headerText: '#fafafa',
    headerTextSecondary: 'rgba(250, 250, 250, 0.65)',
    icon: '#727272',
  },
};

export function getTheme(name) {
  return THEMES[name] ?? THEMES.neutral;
}

// Unified type: Liberation Sans (bundled in assets/fonts, loaded in App.js)
// drives BOTH text and numbers, so word labels align with the money/stat
// figures next to them. The num* slots stay separate (numeric styles also add
// fontVariant tabular-nums) but resolve to the same faces. All non-bold text
// is slightly bolded: the regular slots use Arimo Medium (Arimo = the
// Google-Fonts continuation of Liberation Sans, metric-identical, with the
// 500 weight the Liberation family lacks). Styles must set fontFamily
// WITHOUT fontWeight — Android mis-resolves when both are present.
export const fonts = {
  regular: 'Arimo-Medium',
  medium: 'LiberationSans-Bold',
  bold: 'LiberationSans-Bold',
  numRegular: 'Arimo-Medium',
  numMedium: 'LiberationSans-Bold',
  numBold: 'LiberationSans-Bold',
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

export const ACCOUNT_FAB_SIZE = 40;

// Shared elevation tokens (spread into a style object). `cardShadow` is the soft
// lift used by dashboard/list cards; `panelShadow` is the heavier lift used by
// raised cards and modal surfaces. Bottom sheets keep their own upward shadow.
export const cardShadow = {
  shadowColor: '#000',
  shadowOffset: { width: 0, height: 1 },
  shadowOpacity: 0.06,
  shadowRadius: 8,
  elevation: 1,
};

export const panelShadow = {
  shadowColor: '#000',
  shadowOffset: { width: 0, height: 2 },
  shadowOpacity: 0.3,
  shadowRadius: 8,
  elevation: 3,
};

const ThemeContext = createContext({ themeName: 'neutral', colors: THEMES.neutral });

export function ThemeProvider({ themeName, children }) {
  const value = useMemo(() => {
    const colors = getTheme(themeName);
    return { themeName: colors.name, colors };
  }, [themeName]);
  return (
    <ThemeContext.Provider value={value}>
      {children}
    </ThemeContext.Provider>
  );
}

export function useTheme() {
  return useContext(ThemeContext);
}
