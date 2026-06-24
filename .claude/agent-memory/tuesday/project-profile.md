---
name: project-profile
description: expense-tracker tech stack, dual-target requirement, and current native-build/config state
metadata:
  type: project
---

Expense-tracker: Expo SDK 56 / React Native 0.85 / React 19, plain JS (no TS). Backend optional (Supabase; runs local-only with no .env). Classic `Animated` only (no reanimated). SVG via react-native-svg 15.15.4. Icons are font/SVG-based (`@hugeicons`), NO raster `<Image>` anywhere — image-optimization category is permanently N/A.

**Why:** All state lives in App.js; screens are presentational. Four tab screens stay mounted (absolute-positioned, opacity/translate transitions). Add popup + sheets also kept mounted.

**How to apply:** App MUST work on BOTH Expo Go (native) AND react-native-web. `npx expo export --platform web` is the only build check. No `ios/` or `android/` prebuild dir exists on disk as of 2026-06-24 (CLAUDE.md claims an ios/ prebuild exists — it does not), so App Store config (Info.plist, ATS, privacy strings) can only be reasoned about from app.json, which is currently minimal.
