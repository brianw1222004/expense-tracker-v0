---
name: test-workflow-overview
description: Saturday's test workflow — project uses npx expo export --platform web as build check, no Jest suite
metadata:
  type: project
---

**Project Structure**
- Expo SDK 56, React Native 0.85, plain JavaScript (no TypeScript)
- 30 source files in src/ (screens, components, utilities)
- No jest/eslint/tsc configured; build check is the sole verification tool
- `.env` gitignored, app runs local-only when unconfigured (AsyncStorage)

**Test Execution**
1. `npx expo export --platform web` — bundles to dist/, catches syntax/import errors
2. Expected output: Metro bundler success, 5927 modules, dist/ generated
3. No lint or type-check errors expected
4. Font assets included: 8 Lora variants + 9 Outfit variants = 17 ttf files

**Recent Changes to Monitor**
1. Dual font system (Lora body + Outfit numbers) — verify imports and usage
2. New mono theme — verify all 6 themes have widgetBorderWidth/Color
3. Dashboard & SpendingChart collapsible sections — verify Animated.View tags match
4. Split-bill in AddExpenseScreen — verify edge case handling (dividing 0, splitBy=2 minimum)
5. i18n mono theme entries — verify all 3 languages have theme.mono label

**Known Quirks**
- Self-closing Animated.View tags span multiple lines in AddExpenseScreen (line 223-226 correctly closes with />)
- No debug statements in codebase (console.log/debugger absent)
- All color references map to valid theme keys across 6 themes
