import { clearUserStorage, LOCAL_USER } from './storage';
import { clearQueues, resumeSync, suspendSync, wipeServerData } from './sync';

// Last-resort bound on the whole cleanup, so the locked Account sheet always
// unlocks. The server wipe and the cache drain carry their own shorter
// deadlines, which stop them before anything destructive starts late.
const CLEANUP_TIMEOUT_MS = 30000;

// Racing a promise only ends the WAIT — the chain behind it keeps running — so
// the deadline also signals `onTimeout`, and every step below checks that
// signal before it removes anything. Without it a step that overran could
// delete moments after the user was told the attempt failed.
function withTimeout(promise, ms, onTimeout) {
  let timer;
  const timeout = new Promise((_, reject) => {
    timer = setTimeout(() => {
      onTimeout?.();
      reject(new Error('Delete all data timed out'));
    }, ms);
  });
  promise.catch(() => {}); // a rejection landing after the timeout isn't unhandled
  return Promise.race([promise, timeout]).finally(() => clearTimeout(timer));
}

// Delete All Data. Local-only mode removes this device's tracker keys and
// pending-op lanes. A signed-in cloud user additionally has every server row
// deleted and verified FIRST — with sync suspended so no queued op can re-create
// one — and is signed out at the end. Nothing is reset unless every step
// verifies; on failure the user is told what state the data is in and can retry.
// The Supabase auth record itself is not removed (that needs a server function),
// and suspension only binds THIS process: another signed-in device holding
// queued ops can still push rows back after the wipe.
// The ref belongs to App, so the guard survives renders and covers confirmation.
export async function deleteAllData({
  cloudConfigured, userId, ready, guard, confirm, inform, t,
  setBusy, resetState, signOut, onSuccess, timeoutMs = CLEANUP_TIMEOUT_MS,
}) {
  if (guard.current) return;
  guard.current = true;
  const cloud = cloudConfigured && Boolean(userId) && userId !== LOCAL_USER;
  let busy = false;
  let suspended = false;
  try {
    // A configured build holding the local sentinel (or no user) is inconsistent.
    if (!ready || cloudConfigured !== cloud || (!cloud && userId !== LOCAL_USER)) return;
    const confirmed = await confirm({
      title: t('acct.deleteData'), body: t(cloud ? 'acct.deleteBodyCloud' : 'acct.deleteBody'),
      confirmLabel: t('acct.deleteConfirm'), cancelLabel: t('common.cancel'),
    });
    if (!confirmed) return;
    busy = true;
    setBusy(true);
    if (cloud) {
      suspendSync(userId);
      suspended = true;
    }
    const cancel = new AbortController();
    // Which failure copy the user gets. Deletion is not transactional — not
    // across the server's tables, not between the server and this device — so
    // "nothing was removed" is only claimed while it is still provably true.
    let started = false;
    try {
      await withTimeout((async () => {
        if (cloud) {
          await wipeServerData(userId, {
            signal: cancel.signal,
            onDeleteStarted: () => { started = true; },
          });
        }
        started = true; // clearQueues empties the in-memory lanes as its first act
        await clearQueues(userId, { strict: true, signal: cancel.signal });
        await clearUserStorage(userId, { strict: true, signal: cancel.signal });
      })(), timeoutMs, () => cancel.abort());
    } catch {
      await inform({
        title: t('acct.deleteFailed'),
        body: t(started ? 'acct.deleteFailedBody' : 'acct.deleteNothingRemovedBody'),
        okLabel: t('common.ok'),
      });
      return;
    }
    resetState();
    // The data is gone, but a sign-out that did not happen is not success: this
    // device would sit in a signed-in, emptied account. supabase-js RESOLVES
    // with { error } instead of rejecting, so both shapes count as a failure.
    if (cloud) {
      const { error } = await withTimeout(Promise.resolve().then(signOut), timeoutMs)
        .then((result) => result ?? {}, (reason) => ({ error: reason ?? new Error('Sign out failed') }));
      if (error) {
        await inform({
          title: t('acct.deleteSignOutFailed'),
          body: t('acct.deleteSignOutFailedBody'),
          okLabel: t('common.ok'),
        });
        return;
      }
    }
    onSuccess();
  } finally {
    // Resumed only after the lanes were emptied (or the wipe failed with its
    // queued ops intact), so there is nothing stale left to push.
    if (suspended) resumeSync(userId);
    if (busy) setBusy(false);
    guard.current = false;
  }
}
