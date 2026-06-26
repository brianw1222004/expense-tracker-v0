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
    gradientStart: '#323f48',
    gradientEnd: '#4e6a7b',
    // Hero-card corner bloom — a cool blue→teal wash that echoes this palette.
    glowStart: '#A9CBE8',
    glowEnd: '#9FD3C8',
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
    gradientStart: '#483e34',
    gradientEnd: '#79694e',
    // Hero-card corner bloom — a warm peach→gold wash that echoes this palette.
    glowStart: '#F3C6A4',
    glowEnd: '#E6CF9A',
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
    gradientStart: '#1a1a1a',
    gradientEnd: '#535353',
    // Hero-card corner bloom — the original pink→violet iridescence, an
    // intentional pop of color against this grayscale palette.
    glowStart: '#F8B6D2',
    glowEnd: '#BCA9F5',
    headerText: '#fafafa',
    headerTextSecondary: 'rgba(250, 250, 250, 0.65)',
    icon: '#727272',
  },
};

export function getTheme(name) {
  return THEMES[name] ?? THEMES.neutral;
}

export const fonts = {
  regular: 'Lora_400Regular',
  medium: 'Lora_500Medium',
  bold: 'Lora_700Bold',
  // Numbers/money use Inter — a neutral grotesque sans with strong tabular
  // figures, so columns of money stay aligned (paired with the all-text styles
  // set in fonts.medium for the medium slot).
  numRegular: 'Inter_400Regular',
  numMedium: 'Inter_500Medium',
  numBold: 'Inter_700Bold',
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
