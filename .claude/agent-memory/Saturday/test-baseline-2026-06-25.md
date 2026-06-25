---
name: test-baseline-june-2026
description: Full test suite passes (578 tests across 10 suites), Split Bills feature complete and verified
metadata:
  type: project
---

**Test Suite Status: ALL GREEN**
Date: 2026-06-25 (15:00 UTC)

## Summary
- **Build:** PASS (npx expo export --platform web, 6903ms, 518 modules, 26 font assets)
- **Tests:** PASS (578 passing, 0 failures, 0 skipped)
- **Suites:** 10 total
- **Execution time:** ~5.2s

## Test Breakdown by Suite
| Suite | Status |
|-------|--------|
| categories.test.js | PASS |
| currency.test.js | PASS |
| derive.test.js | PASS |
| format.test.js | PASS |
| income-sync.test.js | PASS |
| splits.test.js | PASS |
| splits-regression.test.js | PASS |
| storage.test.js | PASS |
| sync.test.js | PASS |
| sync-groups-splits.test.js | PASS |

**Total: 578 tests, 100% pass rate (10 suites, 0 failures, 0 skipped)**

## Build Output
```
Web Bundled 6903ms index.js (518 modules)
Assets: 26 (18x Inter fonts + 8x Lora fonts)
Output files: index.html, favicon.ico, metadata.json, _expo/ (JS bundle)
Exported: dist/
```

## Split Bills Feature Status
- Two new test suites added: `splits-regression.test.js` and `sync-groups-splits.test.js`
- Core domain layer and sync integration fully tested
- All app integration points verified
- Web export includes all necessary assets

## Key Observations
- Test suite expanded from 386 to 578 tests (192 new tests added for regression + sync coverage)
- Build time stable at ~7s, bundle size consistent
- All critical paths covered: expense/income sync, split bills sync, currency conversion, category derivation
- No warnings or deprecation notices
- No linting configured (project has no .eslintrc)
- Plain JavaScript project (no TypeScript compilation)
