import { createContext, useContext } from 'react';

export const THEMES = {
  vivid: {
    name: 'vivid',
    statusBarStyle: 'dark',
    keyboardAppearance: 'light',
    background: '#f0f7ff',
    card: '#ffffff',
    cardPressed: '#e8f4fd',
    border: '#d6e6f2',
    textPrimary: '#1a2a3a',
    textSecondary: '#456680',
    textMuted: '#94b3c8',
    accent: '#38bdf8',
    accentDark: '#0ea5e9',
    onAccent: '#ffffff',
    success: '#10b981',
    successAlt: '#6ee7b7',
    successOverlay: '#ecfdf5',
    warning: '#f59e0b',
    danger: '#ef4444',
    backdrop: 'rgba(26, 42, 58, 0.5)',
    gradientStart: '#0284c7',
    gradientEnd: '#38bdf8',
    headerText: '#ffffff',
    headerTextSecondary: 'rgba(255, 255, 255, 0.75)',
    icon: '#38bdf8',
  },
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
    headerText: '#fafafa',
    headerTextSecondary: 'rgba(250, 250, 250, 0.65)',
    icon: '#727272',
  },
  plum: {
    name: 'plum',
    statusBarStyle: 'dark',
    keyboardAppearance: 'light',
    background: '#faf7fb',
    card: '#ffffff',
    cardPressed: '#f6eff8',
    border: '#ecddf1',
    textPrimary: '#361939',
    textSecondary: '#58345b',
    textMuted: '#cc9fd5',
    accent: '#9757a2',
    accentDark: '#7d4685',
    onAccent: '#faf7fb',
    success: '#5b8a6a',
    successAlt: '#7da88a',
    successOverlay: '#e8f0ea',
    warning: '#b8963e',
    danger: '#b85c5c',
    backdrop: 'rgba(54, 25, 57, 0.5)',
    gradientStart: '#58345b',
    gradientEnd: '#9757a2',
    headerText: '#faf7fb',
    headerTextSecondary: 'rgba(250, 247, 251, 0.65)',
    icon: '#b376bf',
  },
};

export function getTheme(name) {
  return THEMES[name] ?? THEMES.vivid;
}

export const fonts = {
  regular: 'Inter_400Regular',
  medium: 'Inter_500Medium',
  bold: 'Inter_700Bold',
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

const ThemeContext = createContext({ themeName: 'vivid', colors: THEMES.vivid });

export function ThemeProvider({ themeName, children }) {
  const colors = getTheme(themeName);
  return (
    <ThemeContext.Provider value={{ themeName: colors.name, colors }}>
      {children}
    </ThemeContext.Provider>
  );
}

export function useTheme() {
  return useContext(ThemeContext);
}
