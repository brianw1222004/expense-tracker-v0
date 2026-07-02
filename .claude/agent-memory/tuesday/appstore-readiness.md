---
name: appstore-readiness
description: App Store / Play Store submission blockers and config gaps for expense-tracker
metadata:
  type: project
---

App Store / Play Store readiness — re-verified audit #5 (2026-07-01). app.json is MORE complete now than audit #1 implied — re-read it, don't trust old gaps:

CURRENT app.json state (2026-07-01):
- NOW SET: `ios.buildNumber:"1"`, `android.versionCode:1`, full `android.adaptiveIcon` (fg/bg/monochrome), `ios.supportsTablet`, `icon`, `web.favicon`, `plugins:["expo-font"]`. All referenced asset files exist in assets/ (icon.png, android-icon-*.png, favicon.png, splash-icon.png).
- STILL A GAP: bundle id `com.anonymous.expense-tracker` — the `anonymous` placeholder must change before submit (EAS warns; not an Apple hard-reject but obviously a placeholder). Only real store-config flag left.
- No `ios.infoPlist`/ATS config, but app requests NO native permissions (no camera/location/notifications/photos; expo-haptics needs no string; Supabase is HTTPS so default ATS passes) — so NO UsageDescription required. Conditional: adding any permission API later makes an NSxxxUsageDescription a hard-reject risk.
- `splash-icon.png` exists in assets but NO splash config in app.json + expo-splash-screen NOT installed → default white splash. Cosmetic, not a blocker.
- metro.config.js EXISTS at root (icons.js deep per-icon imports depend on its scoped resolver — build-critical, present).

CRASH SAFETY: ErrorBoundary present (good — uncaught render crash = instant rejection otherwise).

TOUCH TARGETS: Several interactive elements rely on `hitSlop` to reach 44pt rather than intrinsic size. Apple measures the actual tappable area (hitSlop counts), so hitSlop-padded ones are OK; the ones to watch are small Pressables WITHOUT hitSlop and < 44pt (e.g. AddEntryScreen split +/- buttons are 28pt with only hitSlop 4 → ~36pt, borderline; currency chips are short).

**How to apply:** Treat missing permission strings as conditional — only a blocker once a permission API is added. Always flag the `com.anonymous` bundle id and any sub-44pt tap target without adequate hitSlop.
