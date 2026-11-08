# Development changelog

Milestones on `dev/money-currency`, newest first. This records development work,
not production releases or version numbers.

## UX-5B3 - Frequently Used Currency Ordering

- **Added:** Currency pickers prioritize currencies used in the current account's
  saved personal expenses and raw shared bills, counting each saved record once.
- **Changed:** One ordered list is shared by personal expenses, Account Settings,
  shared bills, and group creation/editing. Ties and empty history keep catalog order.
- **Compatibility:** All 13 currencies remain available. Settlements and derived
  spending rows are excluded; selected values and existing defaults stay unchanged.
  No new persistence, synchronization, or FX behavior is introduced.

## UX-5B2 - Remember Personal Expense Currency

- **Added:** A validated, user-scoped, device-local currency preference updated
  only after a personal expense creation or edit is saved locally.
- **Changed:** New personal drafts snapshot the remembered currency, falling
  back to Display Currency. Reopening Add creates a fresh draft. Personal saves
  await local persistence and retain the form with a localized error on failure.
- **Fixed:** Switching a whole-number personal draft from USD-style decimal
  formatting to JPY/TWD/KRW removes the zero decimal suffix so Save remains
  available. Real fractional amounts still require correction before saving.
- **Fixed:** Personal saves queue their original account's upsert after a local
  write even when accounts change; explicit expense ownership prevents a new
  session from claiming the row. Preference-write failures retain the saved
  expense and explain that the previous default remains active. The currency
  picker is disabled during saving and cleared when the form closes.
- **Fixed:** Settings upserts, including the legacy-schema fallback, retain
  their queue owner's account ID. A mismatched session cannot overwrite another
  account's settings; rejected settings and expense operations remain retryable.
- **Compatibility:** The preference stays outside server settings mappings.
  Display Currency, shared bills, group currencies, budgets, reporting, FX
  previews, balances, and settlements keep their existing behavior.

## UX-5B1 - Display Currency in Account Settings

- **Added:** A localized Display Currency setting in the gear-accessed Account
  sheet, with the selected code, reporting explanation, and existing picker.
- **Changed:** Currency selection moves from Insight to Account; dismissing the
  picker returns to the settings sheet. Loading and account locks disable it.
- **Compatibility:** Keeps the existing settings update, persistence, server
  sync, and budget conversion flow. Transaction data, reporting calculations,
  historical FX previews, split balances, and settlements remain unchanged.

## UX-3 - Expenses Calendar Today Shortcut

- **Added:** A compact Today text button beside the Expenses month controls,
  with a 44-point minimum touch target.
- **Changed:** Tapping Today returns to the device's current local month and
  date, updates the day list, and hides the shortcut while today is selected.
- **Compatibility:** Reuses shared month navigation and existing localization;
  preserves category filters, expense data, calculations, and storage models.

## FX-3A - Developer Historical Spending Previews

- **Added:** Developer-only, read-only historical FX previews for Expenses and
  Dashboard, covering personal spending and consumed shared-bill shares.
  Shows observation dates and stale/unavailable indicators, with complete-month
  total checks, bounded and deduplicated lookups, and scoped cancellation across
  UI changes. Delete All Data now clears the user's FX cache safely. Includes
  22 focused deterministic tests.
- **Compatibility:** Production dashboard totals and charts remain unchanged;
  existing static conversion stays active. No changes to settlement calculations,
  group balances, transaction amount persistence, or Supabase schema. Historical
  FX is not activated in production.

## FX-2C - Historical Rate Selection and Offline Cache

- **Added:** Opt-in historical observations up to seven calendar days before a
  transaction. User-scoped AsyncStorage rate cache with a 100-entry limit,
  24-hour freshness, and offline reuse explicitly marked stale. A historical
  rate service combines cache lookup, provider lookup, and date selection.
  Includes 59 deterministic regression tests.
- **Changed:** Pure FX valuation and the BOC adapter support an optional
  historical date policy; exact-date behavior remains the default.
- **Compatibility:** FX remains inactive in production. Existing expense and
  split calculations are unchanged, with no Supabase or UI changes.
  Account-deletion integration remains required before production activation.

## FX-2B - Historical Exchange Rate Provider

- **Added:** Frankfurter v2 historical exchange-rate adapter with explicit BOC
  provider selection and one API request per currency pair. Validates dates,
  currencies, positive finite rates, and source attribution. Includes timeout,
  cancellation, error handling, and 104 deterministic adapter regression tests.
- **Behavior:** Requires an exact observation date and distinguishes unavailable
  data from network failures. Non-CAD quotes are marked as provider-derived.
- **Compatibility:** FX-2B remains inactive in production. Existing expense and
  split calculations are unchanged; no cache, UI, database, or sync changes.

## FX-1 - Exchange Rate Foundation

- **Added:** Explicit exchange-rate quote validation with manual, historical,
  and legacy-estimate source classifications and provenance metadata. Pure
  valuation returns structured success, identity, missing-rate, or invalid-input
  results. Stable input snapshots keep validated values, calculations, and
  returned metadata consistent. Includes 143 FX tests and documentation of
  precision limits and historical-rate policies.
- **Behavior:** The new API reports missing rates explicitly, without silent
  1:1 or USD fallback. It requires a direct currency pair and an exact effective
  date; it does not fetch rates or select a provider.
- **Compatibility:** FX-1 remains inactive in production. Existing money
  conversion, financial totals, settlement rules, storage, and UI are unchanged.

## Unified Spending

Commit: [`d029b04`](https://github.com/brianw1222004/expense-tracker-v0/commit/d029b04e890c60cc6649e6da9ea0b40f58f337ed)

- **Added:** Personal and shared spending appear together in Expenses and its
  Calendar view. Shared rows open the original bill editor.
- **Behavior:** Shared spending counts only the user's consumed share, excludes
  settlements, and avoids counting bills twice. Personal list deletion and
  shared bill deletion through the bill editor remain separate actions.
- **Compatibility:** Existing financial totals and source records retain their
  meaning; presentation rows do not become new expenses.

## Money Domain Foundation

Commit: [`b50fc11`](https://github.com/brianw1222004/expense-tracker-v0/commit/b50fc1158c2fa9da9410dec886a62934e6050dd0)

- **Added:** Pure money-domain helpers and domain regression tests.
- **Behavior:** Reporting valuation and settlement valuation have explicit,
  separate boundaries.
- **Compatibility:** Existing financial behavior, static conversion, and
  rounding are preserved; no new exchange-rate policy was activated.
