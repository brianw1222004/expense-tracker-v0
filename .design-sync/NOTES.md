# Design Sync Notes

## React Native → Web Build

- This is a React Native (Expo SDK 56) app, not a published component library. A custom pre-build step (`node .ds-sync/prebuild.mjs`) transforms RN components into a web-compatible ESM entry using esbuild with:
  - `loader: { '.js': 'jsx' }` — the codebase uses JSX in `.js` files (Expo convention)
  - `react-native` → `react-native-web` aliasing via esbuild plugin
  - Platform extension resolution (`.web.js` preferred over `.js`)
  - React/ReactDOM externalized to window globals
- The pre-built entry at `dist-lib/index.mjs` is then fed to the converter via `--entry`

## Provider Chain

- Components need `SafeAreaProvider` → `ThemeProvider` → `I18nProvider` wrapping
- `SafeAreaProvider` was added because `TabBar` uses `useSafeAreaInsets()` which throws without it
- `ThemeProvider` wraps with `{themeName: "neutral"}` (default theme)
- `I18nProvider` wraps with `{language: "en"}`

## Known Render Warns

- `[CSS_RUNTIME]` — expected; React Native uses StyleSheet.create (CSS-in-JS), not static CSS
- `rootEmpty` false positive on all authored previews — react-native-web injects a `<style id="react-native-stylesheet">` element that the validator's `[id^="r"]` selector picks up as `roots[0]`. Since it's a `<style>` tag with no innerHTML, `rootEmpty` triggers. All components render correctly (verified via screenshots). Use `--no-render-check` to bypass.
- RewardCheck renders only the green overlay — the SVG checkmark uses `Animated.createAnimatedComponent(Path)` with `strokeDashoffset` animation which doesn't render statically in react-native-web
- TabBar's `BlurView` renders as a semi-transparent white div (web fallback for `backdrop-filter`)

## Component Notes

- `EmptyState` receives `colors` and `t` as props (not from ThemeProvider/I18nProvider context)
- `ExpenseRow` uses `getCategory()` from bundled categories module — pass a valid category id in the `expense.category` prop
- No TypeScript in this project — `.d.ts` files are hand-written via `dtsPropsFor` config
- No external font files shipped — Lora and Outfit are loaded at runtime via `@expo-google-fonts` (not available in preview cards; browser fallback fonts are used)

## Re-sync Risks

- `dtsPropsFor` hand-written prop types may drift if component APIs change
- Pre-build aliasing (`react-native` → `react-native-web`) depends on the installed versions being compatible
- The `rootEmpty` false positive means `--no-render-check` must be used — any actual render failures would be missed; visually verify screenshots
- Fonts: Lora (serif) and Outfit (sans-serif) are runtime-loaded via Expo; preview cards use system fallback fonts
