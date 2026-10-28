# FX foundation and historical rate selection

Status: development-only preview for review. Production reporting still uses static rates.
The existing static `convert()`, Money Domain functions, financial projections,
production UI, existing storage keys, sync queues, and Supabase schema remain unchanged.
FX-3A adds developer-only historical previews for Expenses and Dashboard.
FX-2C adds a separate opt-in local rate cache, not transaction persistence.

## Financial meaning

| Concept | Meaning | Authority |
| --- | --- | --- |
| Original amount | The source transaction's amount and entry currency | Preserved exactly as supplied; valuation never rewrites it |
| Reporting value | A projection into a requested reporting currency | Describes a valuation, not a new persisted expense |
| Settlement value | The amount authoritative for group obligations | A separate domain policy; FX-1 does not assign or lock it |
| Actual payment | An independently recorded bank/provider charge or transfer | Evidence of what moved, potentially including fees/spread; not a market quote |

A bank charge must not automatically change a shared bill's obligations.
Likewise, a whole-bill bank charge cannot automatically be used as the user's
consumed-share reporting value without a separate allocation policy.
Settlements remain excluded from spending, and shared spending remains only
the user's consumed share. FX-1 changes none of these existing calculations.

## Quote contract

The direction is always:

**1 `baseCurrency` unit = `rate` `quoteCurrency` units.**

```js
// Illustrative values, not a real provider observation.
{
  baseCurrency: 'EUR',
  quoteCurrency: 'USD',
  rate: 1.25,
  effectiveDate: '2026-06-10',
  sourceType: 'historical',
  provider: 'example-provider',
  retrievedAt: '2026-06-11T12:30:00.000Z',
}
```

| Field | Contract |
| --- | --- |
| `baseCurrency`, `quoteCurrency` | Different, supported, uppercase three-letter codes; no aliases or implicit normalization |
| `rate` | Finite JavaScript number greater than zero; no string coercion |
| `effectiveDate` | Explicit Gregorian `YYYY-MM-DD`, years 0001 through 9999 |
| `sourceType` | Exactly `manual`, `historical`, or `legacy-estimate` |
| `provider` | Required nonempty trimmed string only for historical quotes |
| `retrievedAt` | Required only for historical quotes; UTC ISO timestamp with seconds and optional three-digit milliseconds |
| `origin` | Required nonempty trimmed string only for manual/legacy-estimate quotes |

Unknown quote fields and incompatible provenance fields are rejected. Thus a
manual or legacy quote cannot also claim provider/retrieval metadata; a historical
quote cannot also claim a manual origin. This validates structure and basic
chronology, not the truth of a caller's provenance claim. Trusted ingestion and
provider authentication are future concerns.

Money and quote inputs are plain data records (ordinary objects or objects with
no prototype). Custom prototype chains are rejected so inherited amount/rate or
provenance fields cannot validate and then disappear when snapshots are copied.
The money fields `amount` and `currency`, and every present accepted quote field,
must be own enumerable data properties. Accessors (getters/setters) and
non-enumerable fields are rejected without invoking getters, using the existing
`invalid-money` or `invalid-quote` reason respectively for the affected record.
Unrelated money fields such as `id`, `note`, and `createdAt` are ignored, not
copied or evaluated. Ordinary, frozen, and null-prototype data records are
supported; writable/configurable properties are not required.

Accepted field values are captured from property descriptors into local snapshots.
Validation, pair/date checks, multiplication, and returned original/quote metadata
all use those same stable values rather than rereading the input records. For a
successful cross-currency valuation, `amount` is the unrounded Number product of
the returned `original.amount` and `quote.rate`. Returned snapshots are independent
copies; inputs are never mutated. This boundary contract does not change any
financial, date, provenance, or rounding policy below.

`manual` means an explicit user-entered rate applied to its declared date, such
as `origin: 'user-entry'`. It does not mean that a bank charge was recorded.
Manual entry time is a different concept and is outside this quote contract.

`historical` means a provider observation for the declared effective date, with
its provider and retrieval timestamp retained. FX-1 accepts completed-date
observations only: the retrieval timestamp's UTC calendar date must not precede
the effective date. Provisional observations, provider-local publication dates,
and non-UTC timestamp normalization need an explicit future ingestion policy.

`legacy-estimate` means an explicitly declared estimate with an identified
origin, not historical or actual-payment evidence. Its effective date describes
the declared applicability of that estimate, not proof of a market fixing.
The existing static table has no documented observation date; FX-1 does not
wrap it, invent dates for it, or import its rates. Future migration must retain
that uncertainty rather than fabricating historical provenance from a
transaction date or retrieval time.

## Pure API and result contract

`isFxCurrency(code)` checks the exact membership of the existing app's
`CURRENCIES` list. `isFxDate(date)` validates calendar components without device
time-zone conversion, parsing normalization, or a clock read.

`validateFxMoney({ amount, currency })` accepts finite numeric amounts, including
zero, negatives, and fractional derived amounts. This is not a transaction-entry
or minor-unit enforcement function. `validateFxQuote(quote)` validates the
contract above. Each validator returns `{ valid: true }` or
`{ valid: false, reason }`; it does not coerce or mutate values.

```js
valueWithFxQuote(original, targetCurrency, transactionDate, quote, options?)
```

`original` is `{ amount, currency }`. `transactionDate` is an explicit local
calendar date supplied by the caller, not derived from the host clock or from
`retrievedAt`. The future caller must preserve the intended transaction-local
day; formatting an epoch timestamp with UTC `toISOString()` is not an acceptable
substitute for the app's existing local `dateKey` semantics.

Request amount/currency/date validation occurs before identity conversion.
For different currencies, the quote must match the requested pair in the same
direction and, by default, have exactly the transaction date. The explicit
`{ datePolicy: 'previous-observation' }` option accepts historical observations
up to seven calendar days earlier, as described below. No rate is fetched or
selected by this pure function. Manual and legacy-estimate dates remain exact.

| Status | Fields and meaning |
| --- | --- |
| `valued` | `amount`, target `currency`, target `minorUnits`, copied `original`, `transactionDate`, `source`, copied `quote`, `isEstimate` |
| `identity` | Same fields, original amount unchanged, `source: 'identity'`, `quote: null`, `isEstimate: false`; an external quote is neither required nor inspected |
| `missing-rate` | Target `currency`/`minorUnits`, copied `original`, `transactionDate`, and `reason`; **no converted `amount` property** |
| `invalid-input` | `reason`; **no converted `amount` property**; invalid request data is distinct from a missing quote |

An illustrative successful manual result is:

```js
{
  status: 'valued',
  amount: 100,
  currency: 'USD',
  minorUnits: 2,
  original: { amount: 80, currency: 'EUR' },
  transactionDate: '2026-06-10',
  source: 'manual',
  quote: {
    baseCurrency: 'EUR', quoteCurrency: 'USD', rate: 1.25,
    effectiveDate: '2026-06-10', sourceType: 'manual', origin: 'user-entry',
  },
  isEstimate: false,
}
```

`source` preserves the supplied quote's classification. Explicit legacy-estimate
valuation additionally returns `isEstimate: true`; it must not be relabeled as
historical. The ability to value an explicitly supplied estimate is not an
automatic estimate fallback and does not add it to the proposed reporting
precedence below.

Representative missing-rate reasons include `missing-quote`, `invalid-rate`,
`invalid-provenance`, `pair-mismatch`, `future-effective-date`,
`effective-date-mismatch`, and `unrepresentable-result`. Zero cross-currency
amounts still require a usable quote. Overflow to Infinity and nonzero values
that underflow to zero produce no converted amount. Other binary floating-point
loss remains a limitation of Number, not a promise of exact money arithmetic.

## Date, pair, and provider policies

Three separate facts must remain separate: transaction local date, rate
effective date, and retrieval timestamp. A historical observation may be
retrieved much later than its effective date; this does not turn it into a
current-date rate. The API values with the supplied observation, not an
"as known at the original transaction time" knowledge snapshot.

The default pure valuation and provider boundaries retain these policies:

- Exact pair and exact effective date only. A future-dated quote is rejected.
  A prior quote remains unusable without the explicit historical date-policy
  option; neither boundary infers market calendars.
- Weekend, holiday, and other unavailable dates yield missing valuation unless
  an exact-date explicit quote is supplied. No forward fill or backward fill.
- No implicit rate inversion, pair swapping, cross-rate triangulation, or USD
  intermediary. Reverse and cross pairs return `pair-mismatch`. This avoids
  silently choosing precision, path, provider, or date semantics.
- The pure valuation has no cache, staleness calculation, current-rate lookup, same-day revision
  selection, provider priority, or clock dependency. Same-date observations
  with different retrieval times/providers are separate candidate inputs, not
  entries that FX-1 merges or ranks.

FX-2C implements the limited historical selection and offline policy below.
Further provider revision rules, provider preferences, and treatment of
mixed-provider cross rates remain future work. A newer retrieval timestamp
alone does not establish a better or
more historically appropriate rate. Any eventual inversion must retain its
original pair/rate and provenance as derived metadata and test reciprocal
precision; it is not implemented here.

## FX-2B/2C provider and previous-observation policy

The inactive Frankfurter v2 adapter explicitly requests BOC with one GET per
directed pair and requested date, using `providers=BOC&expand=providers`. It
validates the response pair, positive finite rate, date, and BOC attribution.
Non-CAD quote directions (including CAD/foreign inverses) are classified
`provider-derived`; foreign/CAD directions are `native`. This describes source
direction, not independent bank-rate verification. No CAD-leg requests or
client-side numeric derivation are performed.

Both `valueWithFxQuote(..., { datePolicy })` and
`fetchBocHistoricalQuote(request, { datePolicy, ...options })` default to
`datePolicy: 'exact'`. The explicit `previous-observation` option permits only
historical observations on or before the transaction date and no more than
seven calendar days old, inclusive. Calendar-day age is calculated at UTC
midnight, independently of device time zones or daylight-saving transitions.
Manual and legacy-estimate quotes still require an exact effective date.
Unknown policies are rejected with `invalid-date-policy`.

For example, Sunday 2026-10-18 may use Friday 2026-10-16. October 11 is the
oldest accepted date for that Sunday; October 10 is too old. October 19 is
future-dated and rejected. This accepts Frankfurter's carried-forward observation
from the original single request, rather than searching seven dates. No rate or
date is invented, and no future rate is used. Too-old historical observations
report `observation-too-old`; future observations report `future-effective-date`
under the opt-in policy. Existing exact-date failure reasons remain unchanged.

The pure valuation still returns the original transaction date and amount;
the quote retains the actual `effectiveDate`, rate, provider, and `retrievedAt`.
The provider separately retains requested date, actual observation date,
classification, URL, HTTP status, and BOC attribution. FX-1 quote fields and
result statuses are unchanged.

## FX-2C local cache and rate service

`src/fxRateCache.js` uses the already-installed AsyncStorage, with no dependencies
or database changes. `createFxRateCache(storage?)` provides `get(scope, request)`,
`set(scope, request, availableResult)`, and `clear(scope)`. The default shared
instance is `fxRateCache`; importing it performs no storage access. Use one
instance in a runtime so its small write queue serializes read/modify/write and
explicit clear operations. Reads wait for queued writes. `get` returns the
validated quote/provenance or null; `set` and `clear` return success booleans.

Each exact, explicit nonempty user scope has one versioned storage key:
`@expense-tracker/fx-rates/v1:` followed by `JSON.stringify(userScope)`.
Within it, the entry key is
`JSON.stringify(['frankfurter-v2:BOC', baseCurrency, quoteCurrency, transactionDate])`.
No default or shared anonymous scope is inferred. A future local-only caller must
choose an explicit scope. The cache never enumerates or reads another user's key.

Each user record retains at most 100 entries, evicting the earliest saved keys;
overwriting a key moves it to the end. Reads do not change eviction order.
Serialized records are limited to 262,144 characters. Only successful historical
quotes and their selected provenance fields are persisted: no expense amounts,
notes, IDs, or transaction records. Stored data is revalidated against the directed
pair, requested date, seven-day policy, fixed provider, FX-1 quote schema, and
matching BOC attribution. Unknown quote fields or corrupt entries are unusable;
unrelated result/provenance fields are not copied. Corrupt/missing storage yields
a miss; a later successful save replaces a broken record. Network failures and
invalid observations are never cached. Storage errors do not invent quotes.

The orchestration API is:

```js
getHistoricalFxRate(userScope, { baseCurrency, quoteCurrency, transactionDate }, {
  // Optional: cache, fetchImpl, signal, timeoutMs, now (epoch milliseconds).
})
```

This service explicitly selects the seven-day historical policy. A cached
observation is fresh for **24 hours from its original retrieval timestamp**,
regardless of how old the transaction is. At 24 hours it expires and a new single
BOC request is attempted. This simple daily refresh permits historical revisions
without maintaining a revision history; overwriting the cache never updates an
existing transaction or stored reporting/settlement amount. Retrieval timestamps
ahead of the service clock are not reused.

- Fresh hit: `status: 'available'`, original quote/provenance,
  `cache: { source: 'cache', stale: false }`, and zero HTTP calls.
- Successful fetch: the validated observation is saved and returned with
  `cache: { source: 'network', stale: false, stored: true }`. If storage fails,
  `stored` is false; the successful network quote is still usable.
- Expired valid cache plus a temporary failure (offline/network, timeout,
  HTTP 408/429/5xx): return the original cached observation with
  `cache: { source: 'cache', stale: true, refreshFailure: { status, reason } }`.
  Do not change its retrieval timestamp or write a failure into storage.
- No usable cache: return the adapter's missing/failure state, without a quote
  or converted amount. HTTP 404, provider-rejected requests, invalid responses,
  out-of-policy dates, and cancellation do not trigger stale fallback.

Stale refers to **retrieval freshness**, not relaxation of the seven-day
transaction-to-observation age limit. A historically valid expired entry may be
reused offline indefinitely; the stale flag and original retrieval time make
that choice visible. No extra stale-age cutoff is imposed in this milestone.
The cache key includes requested date, so another nearby date is not silently
substituted from cache. The API trusts Frankfurter's served BOC attribution;
hidden leg dates, provider revisions, or economic outliers are not independently
verified. A source response can be valid without an observation for a given date.

Timeout and AbortSignal handling remain in the provider adapter and are forwarded
by the service. Cancelled service calls do not return stale or fresh cached quotes.
Native storage operations themselves are not abortable; the service rechecks
cancellation after them. There is no background refresh, retry loop, provider
fallback, current-date substitution, persistence of converted amounts, or settlement
logic in this service. A future caller must opt into the matching date policy
when passing a selected earlier quote to the pure valuation function.

### Before production activation

AsyncStorage is unencrypted and local; cache data is not a trusted bank audit
record. User scoping prevents accidental account sharing through this API, not
malicious access to device storage. The storage bound is per user, not a global
limit across all historical account scopes.

FX-3A integrates cleanup into Delete All Data because the developer preview can
persist rates. After confirmation, new lookups for that user are suspended and
existing service controllers are aborted. The normal server/queue/tracker cleanup
order remains intact, followed by strict FX cache removal and absence verification
inside the existing overall timeout. State resets only after every step succeeds.
The cache queue drains already-started native writes before removal; aborted
queued writes check their signal again before storage. Late fetch results cannot
write after resume because their controllers remain aborted. A timed-out queued
clear checks the deletion signal before starting removal. Native storage work
already in progress cannot be undone, matching existing partial-failure semantics.
Other users' FX scopes are untouched. Suspension is released in the existing
finally path; new legitimate requests can run after failure/retry or completion.
Multiple runtimes/cache instances are not transactionally coordinated.

## FX-3A developer-only historical spending preview

Explicit `__DEV__` guards enable a read-only preview only on the active Expenses
or Dashboard tab, with loaded data for the current user. Opening overlays or
starting account deletion disables the preview. Production hero totals, charts,
financial projections, static rates, expense records, and settlement rules do not
use these historical values. No reporting or converted expense amount is stored.

Expenses values only the currently selected day's filtered unified spending
rows. The original amount stays visible; cross-currency rows add a Historical FX
label, converted amount, actual observation date, and stale-cache indication.
Loading and unavailable states display no historical amount. Dashboard adds a
separate small card for the selected month, never replacing the hero or charts.
It displays a complete historical total only when every entry has a valid
valuation, including same-currency identities; otherwise it displays readiness
counts and loading/unavailable status without a partial total.

Both previews consume the existing unified spending projection: personal expenses
plus the user's consumed share of shared bills, excluding settlements. They do
not add full bill amounts to the shares. Transaction days use the app's local
`dateKey(createdAt)` convention. Rate requests use the existing user ID or
explicit LOCAL_USER scope, are deduplicated by directed pair and date, and have
at most three concurrent lookups in a visible preview batch. Only the current
day/month is requested; no background history scan or automatic retries are added.
The existing rate service and `valueWithFxQuote` use the explicit
`previous-observation` policy. Original transaction and effective dates remain
distinct. Scope, currency, month/day, filter, record, tab, and unmount changes
cancel the old batch and ignore late results. The hook also hides old results
immediately when its input key changes, before effect cleanup runs.

This is not a production rollout. Real-device behavior, cross-runtime deletion,
provider coverage/licensing, and consumer-facing localization/UX still require
review before enabling historical FX outside development.

## Proposed future reporting precedence (not implemented)

For a requested reporting currency and applicable source transaction:

1. An independently recorded actual payment, only when directly applicable to
   that currency and transaction scope.
2. An explicit manual valuation or user-entered rate.
3. A validated historical observation selected under an explicit date/provider
   policy.
4. A clearly marked missing/pending valuation.

The current helper accepts one explicit quote; it does not implement selection,
actual payments, manual amount overrides, fees, settlement locking, migrations,
or these precedence rules. Missing valuation never means an invented 1:1 rate.
Historical reporting selection must not automatically change settlement
obligations. Original and authoritative settlement values must remain available
independently from future reporting choices.

## Precision strategy

Original amounts and rates are not rewritten. Intermediate valuation is one
unrounded Number multiplication. Returned `minorUnits` is the app's configured
number of decimal places for the target currency, taken directly from the
existing `CURRENCIES` metadata (for example USD has two, JPY/TWD/KRW have zero).
This is the current app display policy, not a new or complete ISO minor-unit
registry; changing existing currency definitions is outside FX-1.

`formatFxAmount(amount, currency)` is a separate, optional display boundary:
it returns a `toFixed` numeric string at that currency's configured precision,
or `null` for an invalid amount/currency. It adds no symbol and never feeds a
rounded value back into valuation or obligations. Its Number formatting retains
the JavaScript runtime's rounding and large-number notation behavior; it is
not a settlement or persistence representation.

JavaScript Number does not guarantee exact decimal money arithmetic. Existing
SQL `numeric` values are also read into Number in sync; FX-1 does not migrate
that path. Integer minor units simplify storage/allocation, but rate products
still need a defined high-precision calculation and rounding boundary. Scaled
integers/BigInt would require explicit serialization and React Native/Hermes
compatibility checks; a decimal library adds dependency/bundle costs but can
make decimal operations and rounding policies explicit. A future precision
decision must cover original entry amounts, rates, maximum magnitudes,
allocation, negative/tie rounding, fees, and group settlement reconciliation
together. No dependency or broad precision migration is introduced here.

## References and scope decisions

These were consulted as design references on 2026-10-27. No source code was copied.

- **Spliit:** reviewed [conversion helpers](https://github.com/spliit-app/spliit/blob/main/src/lib/currency-conversion.ts),
  [unit tests](https://github.com/spliit-app/spliit/blob/main/src/lib/currency-conversion.test.ts),
  [schema](https://github.com/spliit-app/spliit/blob/main/prisma/schema.prisma),
  [multi-currency tests](https://github.com/spliit-app/spliit/blob/main/e2e/multi-currency.spec.ts),
  and [repayment tests](https://github.com/spliit-app/spliit/blob/main/e2e/repayment-currency.spec.ts).
  Relevant: explicit direction, separate original/group figures, repayment
  authority, and conversion-rounding tests. Its persisted converted amounts,
  custom-rate UI, Prisma models, and repayment implementation are not adopted.
- **Firefly III:** reviewed the [exchange-rate explanation](https://github.com/firefly-iii/docs/blob/main/docs/docs/explanation/financial-concepts/exchange-rates.md)
  from its official documentation repository because the supplied rendered URL
  returned 403. Relevant: distinguishing a foreign transaction amount from a
  calculated reporting value. Its documented default rate of 1 when data is
  absent is deliberately not adopted; recalculation jobs and downloads are also
  outside this phase.
- **Beancount:** reviewed its [dated prices documentation](https://beancount.github.io/docs/fetching_prices_in_beancount/)
  and [price map implementation](https://github.com/beancount/beancount/blob/master/beancount/core/prices.py).
  Relevant: explicit dated observations and reproducible offline calculations.
  Its price database, automatic inverse pairs, commodity accounting, and
  acquisition tools exceed this app's current scope.
- **Frankfurter:** reviewed its [official API documentation](https://frankfurter.dev/).
  Relevant: dated pair data and provider attribution. The original FX-1 milestone
  selected no provider; FX-2B/2C now explicitly use BOC in the inactive adapter
  described above. Blended/provider-specific observations are not silently equated.
- **Money pattern:** reviewed [Fowler's Money description](https://martinfowler.com/eaaCatalog/money.html).
  Relevant: bind numeric values to currencies and make rounding boundaries
  explicit. A class hierarchy or a wholesale arithmetic rewrite is unnecessary
  for this isolated plain-JavaScript foundation.
- **ISO 4217:** reviewed the [official currency-code overview](https://www.iso.org/iso-4217-currency-codes.html).
  Relevant: explicit currency identity. Validation is restricted to the app's
  supported subset; merely looking like an ISO code is not enough. A full
  historical currency registry and metadata updates are deferred.

## Open decisions for FX-2/3/4

The later milestone numbering is not assigned here. Before activation, settle:

- Provider coverage/licensing, provenance trust, provider-local effective dates,
  corrections, production stale/offline UX, and device/cross-runtime deletion validation.
- Historical observation selection versus knowledge-as-of reporting, source
  precedence, and auditability when providers revise same-date quotes.
- Explicit inversion/cross-rate paths and metadata, and avoiding mixed dates or
  providers without an approved policy.
- Actual-payment records, fees/refunds, multiple charges, shared-share allocation,
  and how manual amount overrides differ from manual rates.
- Authoritative group-currency settlement values, edits, group-currency changes,
  locking/revaluation policy, and migration of undated legacy estimates.
- Decimal/range/rounding strategy and review of the existing currency precision
  metadata before any storage or arithmetic migration.

FX-1 provides no automatic answer to these questions and does not activate
production FX in App, Money Domain, Unified Spending, or settlement flows.
