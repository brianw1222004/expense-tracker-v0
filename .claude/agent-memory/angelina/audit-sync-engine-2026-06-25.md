---
name: audit-sync-engine-2026-06-25
description: Deep review of sync engine (sync.js/supabase.js/storage.js/schema.sql) — verified findings, what's solid
metadata:
  type: project
---

Deep review of src/sync.js, src/supabase.js, src/storage.js, supabase/schema.sql on 2026-06-25.

Verdict: solid engine; one real HIGH (sign-out drops groups/splits queue), rest are LOW/robustness.

Verified findings:
- HIGH: App.js:702 signOut awaits only `flush` + `flushIncome`, NOT `flushGroups`/`flushSplits`. Offline group/split ops queued then sign-out (scope:'local') are abandoned; sign back in pulls server (without them) and the tolerant merge can lose them. Fix: add flushGroups+flushSplits to the Promise.all. (Sunday flagged this too.)
- LOW/robustness: `replace` op delete filter `not('id','in','(${keepIds})')` builds a PostgREST filter by string-quoting ids. SAFE TODAY because ids are crypto.randomUUID() or `prefix_base36_base36` (App.js:103-109) — no commas/quotes. But it's stringly-built; if id charset ever changes it breaks/injects. Not exploitable now.
- LOW: settingsRes.error aborts the WHOLE pull (sync.js:613 `if (expensesRes.error || settingsRes.error) return null`). A settings-table problem wedges expense/income/group/split pulls. Already CODE_REVIEW L1/F1. Settings push is fire-and-forget upsert with no `user_id`/onConflict specified — relies on PK default auth.uid() (fine).
- coalesceIncome/Groups/Splits drop ALL ops on `replace` (return false) — correct because those lanes have no settings op; only the expense lane preserves settings across replace. Asymmetry is intentional, not a bug.

Solid parts (best-engineered):
- Per-lane single-flight via `flushes` Map keyed by lane; coalesce-by-value + splice-by-identity in flushQueue means an op coalesced away mid-flight is handled (indexOf===-1 guard). Genuinely careful.
- `replace` is atomic-by-effect: upsert new rows first, then delete-not-in; failure leaves old server state. Mirrored across all 4 lanes.
- Tolerant pulls (income/groups/splits null on error → cache stands) + queued-settings-newer-than-server preference (sync.js:617-630).
- RLS: every table user_id default auth.uid(), composite PK (user_id,id), full RLS policies, client never sends user_id. Delete/replace ops add explicit .eq('user_id') (PostgREST requires a filter on delete). Sound.
- AsyncStorage error swallowing is deliberate and documented (in-memory state is source of truth).
