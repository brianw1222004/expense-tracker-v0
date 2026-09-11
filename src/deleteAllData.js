import { clearUserStorage, LOCAL_USER } from './storage';
import { clearQueues } from './sync';

// Containment only: configured/cloud mode never reaches any cleanup operation.
// The ref belongs to App, so the guard survives renders and covers confirmation.
export async function deleteAllData({
  cloudConfigured, userId, ready, guard, confirm, inform, t,
  setBusy, resetState, onSuccess,
}) {
  if (guard.current) return;
  guard.current = true;
  try {
    if (cloudConfigured || userId !== LOCAL_USER) {
      await inform({ title: t('acct.deleteData'), body: t('acct.deleteUnavailable'), okLabel: t('common.ok') });
      return;
    }
    if (!ready) return;
    setBusy(true);
    const confirmed = await confirm({
      title: t('acct.deleteData'), body: t('acct.deleteBody'),
      confirmLabel: t('acct.deleteConfirm'), cancelLabel: t('common.cancel'),
    });
    if (!confirmed) return;
    try {
      await clearQueues(LOCAL_USER, { strict: true });
      await clearUserStorage(LOCAL_USER, { strict: true });
    } catch {
      await inform({ title: t('acct.deleteFailed'), body: t('acct.deleteFailedBody'), okLabel: t('common.ok') });
      return;
    }
    resetState();
    onSuccess();
  } finally {
    guard.current = false;
    // Cloud mode does not change local UI/data state as fake deletion progress.
    if (!cloudConfigured && userId === LOCAL_USER && ready) setBusy(false);
  }
}
