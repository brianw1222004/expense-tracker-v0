# Development changelog

Milestones on `dev/money-currency`, newest first. This records development work,
not production releases or version numbers.

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
