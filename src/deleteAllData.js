import { clearUserStorage, LOCAL_USER } from './storage';
import { clearQueues, resumeSync, suspendSync, wipeServerData } from './sync';

// Last-resort bound on the whole cleanup, so the locked Account sheet always
// unlocks. The server wipe and the cache drain carry their own shorter
// deadlines, which stop them before anything destructive starts late.
const CLEANUP_TIMEOUT_MS = 30000;

function withTimeout(promise, ms) {
  let timer;
  const timeout = new Promise((_, reject) => {
    timer = setTimeout(() => reject(new Error('Delete all data timed out')), ms);
  });
  promise.catch(() => {}); // a rejection landing after the timeout isn't unhandled
  return Promise.race([promise, timeout]).finally(() => clearTimeout(timer));
}

// Delete All Data. Local-only mode removes this device's tracker keys and
// pending-op lanes. A signed-in cloud user additionally has every server row
// deleted and verified FIRST — with sync suspended so no queued op can re-create
// one — and is signed out at the end. Nothing is reset unless every step
// verifies; on failure the user is told and can retry. The Supabase auth record
// itself is not removed (that needs a server function).
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
    try {
      await withTimeout((async () => {
        if (cloud) await wipeServerData(userId);
        await clearQueues(userId, { strict: true });
        await clearUserStorage(userId, { strict: true });
      })(), timeoutMs);
    } catch {
      await inform({ title: t('acct.deleteFailed'), body: t('acct.deleteFailedBody'), okLabel: t('common.ok') });
      return;
    }
    resetState();
    if (cloud) await withTimeout(Promise.resolve().then(signOut), timeoutMs).catch(() => {});
    onSuccess();
  } finally {
    // Resumed only after the lanes were emptied (or the wipe failed with its
    // queued ops intact), so there is nothing stale left to push.
    if (suspended) resumeSync(userId);
    if (busy) setBusy(false);
    guard.current = false;
  }
}
