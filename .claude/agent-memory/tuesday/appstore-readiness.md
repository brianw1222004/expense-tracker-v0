---
name: appstore-readiness
description: App Store / Play Store submission blockers and config gaps for expense-tracker
metadata:
  type: project
---

App Store / Play Store readiness as of audit #1 (2026-06-24):

CONFIG GAPS (app.json is minimal):
- No `ios.infoPlist` / ATS config. Supabase is HTTPS so default ATS is fine, BUT app.json has no privacy/permission strings. App currently requests NO native permissions (no camera/location/notifications/photos) — so no UsageDescription strings are required. If any permission is added later, a NSxxxUsageDescription becomes a hard rejection risk.
- No `ios.buildNumber` / `android.versionCode` set (only version "1.0.0"). Needed before a real submit but not a code-level blocker.
- No splash screen config (expo-splash-screen not installed). Cosmetic, not a blocker.
- Bundle id is `com.anonymous.expense-tracker` — the `anonymous` placeholder should be changed before submission.

CRASH SAFETY: ErrorBoundary present (good — uncaught render crash = instant rejection otherwise).

TOUCH TARGETS: Several interactive elements rely on `hitSlop` to reach 44pt rather than intrinsic size. Apple measures the actual tappable area (hitSlop counts), so hitSlop-padded ones are OK; the ones to watch are small Pressables WITHOUT hitSlop and < 44pt (e.g. AddEntryScreen split +/- buttons are 28pt with only hitSlop 4 → ~36pt, borderline; currency chips are short).

**How to apply:** Treat missing permission strings as conditional — only a blocker once a permission API is added. Always flag the `com.anonymous` bundle id and any sub-44pt tap target without adequate hitSlop.
