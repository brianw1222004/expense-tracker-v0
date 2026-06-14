import { createContext, useContext } from 'react';

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
    headerText: '#f6f8f9',
    headerTextSecondary: 'rgba(246, 248, 249, 0.65)',
    icon: '#638394',
  },
};

export function getTheme(name) {
  return THEMES[name] ?? THEMES.slate;
}

export const fonts = {
  regular: 'Caladea_400Regular',
  bold: 'Caladea_700Bold',
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

const ThemeContext = createContext({ themeName: 'slate', colors: THEMES.slate });

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
