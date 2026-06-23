# Expense Tracker Design Conventions

## Wrapping and Setup

Every screen must be wrapped in `<SafeAreaProvider>` → `<ThemeProvider themeName="vivid">` → `<I18nProvider language="en">`. Without ThemeProvider, every component's `useTheme()` call returns the vivid palette by default but won't respond to theme switches. Without I18nProvider, `useT()` falls back to English.

## Styling Idiom: React Native StyleSheet (No CSS Classes)

This is a React Native app rendered via react-native-web. **There are no CSS classes.** All styling is done through React Native's `StyleSheet.create()` and inline style objects. The design language is expressed through:

- **Theme colors** via `useTheme()`: `colors.background`, `colors.card`, `colors.accent`, `colors.textPrimary`, `colors.textSecondary`, `colors.textMuted`, `colors.success`, `colors.danger`, `colors.warning`, `colors.border`, `colors.onAccent` (text on accent surfaces), `colors.icon`
- **Static tokens** imported from the theme module: `spacing.xs` (4), `spacing.sm` (8), `spacing.md` (16), `spacing.lg` (24), `spacing.xl` (32); `radius.sm` (10), `radius.md` (16), `radius.lg` (24)
- **Dual font system**: `fonts.regular`/`fonts.medium`/`fonts.bold` (Lora serif — all text labels); `fonts.numRegular`/`fonts.numMedium`/`fonts.numBold` (Outfit sans-serif — all monetary amounts, stats, percentages). Never set `fontWeight` alongside `fontFamily`.

When building new screens, use `View`, `Text`, `Pressable` from react-native with `StyleSheet.create()`. Apply colors from `useTheme()` and spacing/radius from static imports.

## 6 Theme Palettes

`vivid` (default, sky blue), `slate` (cool gray), `sand` (warm earth), `neutral` (B&W), `plum` (purple), `mono` (off-white with sharp 0.85px borders via `widgetBorderWidth`/`widgetBorderColor`).

## Where the Truth Lives

- **Theme tokens & provider**: `src/theme.js` — all color palettes, spacing, radius, fonts, ThemeProvider, useTheme
- **Per-component source**: `src/components/*.js` — 8 components, each using `const { colors } = useTheme()` + `useMemo(() => createStyles(colors), [colors])`
- **Icons**: `src/icons.js` — `HIcon` component wrapping `@hugeicons/react-native`; render via `<HIcon name="icon-name" size={24} color={colors.icon} />`
- **i18n**: `src/i18n.js` — `useT()` hook returns `t(key, vars)` translator; all UI strings go through i18n

## Example: Composing a Card

```jsx
import { Pressable, StyleSheet, Text, View } from 'react-native';
import { fonts, radius, spacing, useTheme } from '../theme';

function InfoCard({ title, value }) {
  const { colors } = useTheme();
  return (
    <View style={[styles.card, {
      backgroundColor: colors.card,
      borderWidth: colors.widgetBorderWidth,
      borderColor: colors.widgetBorderColor,
    }]}>
      <Text style={[styles.title, { color: colors.textPrimary }]}>{title}</Text>
      <Text style={[styles.value, { color: colors.accent }]}>{value}</Text>
    </View>
  );
}

const styles = StyleSheet.create({
  card: {
    borderRadius: radius.md,
    padding: spacing.md,
    shadowColor: '#000',
    shadowOffset: { width: 0, height: 1 },
    shadowOpacity: 0.06,
    shadowRadius: 8,
  },
  title: { fontFamily: fonts.regular, fontSize: 13 },
  value: { fontFamily: fonts.numBold, fontSize: 22, fontVariant: ['tabular-nums'] },
});
```
