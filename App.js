import { useCallback, useEffect, useMemo, useRef, useState } from 'react';
import {
  AccessibilityInfo,
  Animated,
  AppState,
  BackHandler,
  Platform,
  Pressable,
  StyleSheet,
  View,
} from 'react-native';
import { SafeAreaProvider, SafeAreaView, useSafeAreaInsets } from 'react-native-safe-area-context';
import { StatusBar } from 'expo-status-bar';
import * as HapticsModule from 'expo-haptics';
import { useFonts } from 'expo-font';
import * as SplashScreen from 'expo-splash-screen';

import DashboardScreen from './src/screens/DashboardScreen';
import AddEntryScreen from './src/screens/AddEntryScreen';
import ExpenseListScreen from './src/screens/ExpenseListScreen';
import AccountScreen from './src/screens/AccountScreen';
import InsightScreen from './src/screens/InsightScreen';
import SplitBillsScreen from './src/screens/SplitBillsScreen';
import GroupDetailScreen from './src/screens/GroupDetailScreen';
import CreateGroupScreen from './src/screens/CreateGroupScreen';
import SharedSplitForm from './src/screens/SharedSplitForm';
import BudgetScreen from './src/screens/BudgetScreen';
import AuthScreen from './src/screens/AuthScreen';
import OnboardingScreen from './src/screens/OnboardingScreen';
import TabBar, { TAB_BAR_HEIGHT } from './src/components/TabBar';
import AddExpenseModal from './src/components/AddExpenseModal';
import ErrorBoundary from './src/components/ErrorBoundary';
import RewardCheck from './src/components/RewardCheck';
import HeaderGlow from './src/components/HeaderGlow';
import useTabSlide from './src/useTabSlide';
import {
  loadExpenses,
  saveExpenses,
  loadSettings,
  saveSettings,
  loadGroups,
  saveGroups,
  loadSplitExpenses,
  saveSplitExpenses,
  clearUserStorage,
  DEFAULT_SETTINGS,
  LOCAL_USER,
} from './src/storage';
import {
  applyPendingOps,
  applyPendingGroupOps,
  applyPendingSplitOps,
  clearQueues,
  enqueueExpenseDelete,
  enqueueExpenseUpsert,
  enqueueExpensesReplace,
  enqueueGroupDelete,
  enqueueGroupUpsert,
  enqueueGroupsReplace,
  enqueueSettingsPush,
  enqueueSplitDelete,
  enqueueSplitUpsert,
  enqueueSplitsReplace,
  flush,
  flushGroups,
  flushSplits,
  syncWithServer,
} from './src/sync';
import { supabase, isSupabaseConfigured } from './src/supabase';
import { buildDemoExpenses } from './src/demoData';
import { redenominateBudgets, getCurrency } from './src/currency';
import { getAllCategories, getRegularAll, getExternalAll, isPresetCategory } from './src/categories';
import { dateKey, shiftMonthKey } from './src/format';
import { deriveViewData } from './src/derive';
import { overallBalance, yourShareAsExpenses, groupBalances, removeMemberFromBill, YOU, DEFAULT_PAYMENT_METHOD_ID } from './src/splits';
import { ThemeProvider, getTheme, spacing, fonts, panelShadow, ACCOUNT_FAB_SIZE } from './src/theme';
import { I18nProvider, translate } from './src/i18n';
import { HIcon } from './src/icons';
import { confirmDestructive } from './src/confirm';

const Haptics = Platform.OS === 'web'
  ? { notificationAsync: () => Promise.resolve(), impactAsync: () => Promise.resolve(), NotificationFeedbackType: HapticsModule.NotificationFeedbackType, ImpactFeedbackStyle: HapticsModule.ImpactFeedbackStyle }
  : HapticsModule;

// Entry ids. crypto.randomUUID isn't guaranteed: Hermes (RN) has no global
// crypto and web only exposes it in a secure context, so a bare call can throw
// and abort the whole add before state/sync. The id column is `text`, so a
// non-UUID fallback syncs fine.
const makeId = (prefix) =>
  globalThis.crypto?.randomUUID?.() ??
  `${prefix}_${Date.now().toString(36)}_${Math.random().toString(36).slice(2, 10)}`;

// Hold the native splash from auto-hiding at the first JS pass so it stays up
// through the bundled-font load — without this the app shows a bare frame
// between the splash disappearing and first paint (a white flash on slower
// hardware). We hide it once fonts resolve. Called at module scope so the hold
// is in place before React mounts; a late call (splash already gone) just
// rejects harmlessly.
SplashScreen.preventAutoHideAsync().catch(() => {});

export default function App() {
  // Block first paint until loaded so no screen ever renders with the fallback
  // face; on a load error render anyway rather than hanging on a blank screen.
  const [fontsLoaded, fontsError] = useFonts({
    // Arimo is the Google-Fonts continuation of Liberation Sans (same design,
    // metric-identical); its 500 instance supplies the medium weight the
    // Liberation family lacks — all non-bold text renders with it.
    'Arimo-Medium': require('./assets/fonts/Arimo-Medium.ttf'),
    'LiberationSans-Bold': require('./assets/fonts/LiberationSans-Bold.ttf'),
  });
  // Reveal the UI (drop the splash) only once fonts are ready — or errored, so a
  // font failure can't strand the user on the splash forever.
  useEffect(() => {
    if (fontsLoaded || fontsError) SplashScreen.hideAsync().catch(() => {});
  }, [fontsLoaded, fontsError]);
  if (!fontsLoaded && !fontsError) return null;

  return (
    <SafeAreaProvider>
      <ExpenseTracker />
    </SafeAreaProvider>
  );
}

function ExpenseTracker() {
  const [expenses, setExpenses] = useState([]);
  // Split-bills state — synced to Supabase via the separate groups/splits
  // lanes (tolerant pulls; see sync.js). `groups` hold members (typed names);
  // `splitExpenses` hold shared bills + settlement records.
  const [groups, setGroups] = useState([]);
  const [splitExpenses, setSplitExpenses] = useState([]);
  const [settings, setSettings] = useState(DEFAULT_SETTINGS);
  // Which user the in-memory data belongs to; null while (re)loading. Saving
  // is gated on dataUser === userId so a sign-in/out can never write one
  // account's data under another account's cache key.
  const [dataUser, setDataUser] = useState(null);
  // Supabase session. With Supabase unconfigured the app runs local-only and
  // skips auth entirely (sessionLoaded starts true, userId is LOCAL_USER).
  const [session, setSession] = useState(null);
  const [sessionLoaded, setSessionLoaded] = useState(!isSupabaseConfigured);
  // Tab navigation + the Copilot-style crossfade/swipe transition (see useTabSlide).
  const { tab, changeTab, screenStyle, swipeHandlers } = useTabSlide();
  // The budget editor, account, and create-group sheets sit over the active tab.
  const [overlay, setOverlay] = useState(null); // null | 'budget' | 'account' | 'createGroup'
  // Split-bills: the open group's id (detail sheet). New bills are added through
  // the shared add popup (addEntryMode='shared'), not a separate sheet.
  const [activeGroupId, setActiveGroupId] = useState(null);
  // The Dashboard's selected month (the ‹ month › selector under the title),
  // scoping the hero card + category summary card. Every tab owns its own
  // independent month selection (Expenses/Insight/Split keep theirs as local
  // screen state since their data needs no App-level derivation) — changing the
  // month on one page never affects another.
  const [dashMonthKey, setDashMonthKey] = useState(() => dateKey(Date.now()).slice(0, 7));
  // The add popup sits over whichever tab is active. `addEntryMode` toggles its
  // two forms (personal expense vs. shared split bill). `sharedLockedGroupId`,
  // when set, locks the shared form to one group (launched from a group's "Add a
  // bill") and signals to reopen that group's detail sheet when the popup closes.
  const [addOpen, setAddOpen] = useState(false);
  const [addEntryMode, setAddEntryMode] = useState('personal');
  const [sharedLockedGroupId, setSharedLockedGroupId] = useState(null);
  const [sharedInitialGroupId, setSharedInitialGroupId] = useState(null);
  const [returnToSharedAddAfterCreateGroup, setReturnToSharedAddAfterCreateGroup] = useState(false);
  // Bumped on every popup open so the shared form remounts fresh each time (it's
  // kept mounted while closed, so without this a reopen would show stale state /
  // the previously locked group).
  const [addNonce, setAddNonce] = useState(0);
  const [editingExpense, setEditingExpense] = useState(null);
  // The split bill currently open in the editor (re-decide paid-by / split), or null.
  const [editingSplit, setEditingSplit] = useState(null);
  // Increments on every successful add; RewardCheck animates on each change.
  const [rewardNonce, setRewardNonce] = useState(0);
  // Today's date as state so the memoized stats roll over at midnight / on app resume.
  const [dayStamp, setDayStamp] = useState(() => dateKey(Date.now()));
  // True when the last full sync attempt (initial load or foreground resume)
  // couldn't reach the server. Drives a dismissable retry pill; cleared on the
  // next successful sync. Never set in local-only mode — there's no server.
  const [syncError, setSyncError] = useState(false);
  const settingsVersionRef = useRef(0);
  // Monotonic sync sequence: bumped whenever a new account-switch load OR a
  // foreground re-sync begins. Each sync captures its value before the network
  // await and bails before applying any setState if the ref has since advanced,
  // so the latest-started sync wins across ALL lanes (not just settings).
  const syncSeqRef = useRef(0);
  const insets = useSafeAreaInsets();

  const userId = isSupabaseConfigured ? session?.user?.id ?? null : LOCAL_USER;
  const language = settings.language;
  const theme = getTheme(settings.theme);

  useEffect(() => {
    if (!isSupabaseConfigured) return;
    supabase.auth.getSession().then(({ data }) => {
      setSession(data.session);
      setSessionLoaded(true);
    });
    const { data: subscription } = supabase.auth.onAuthStateChange((_event, next) => {
      setSession(next);
      setSessionLoaded(true);
    });
    return () => subscription.subscription.unsubscribe();
  }, []);

  useEffect(() => {
    const refresh = () => setDayStamp(dateKey(Date.now()));
    const subscription = AppState.addEventListener('change', (state) => {
      if (state === 'active') refresh();
    });
    const interval = setInterval(refresh, 60 * 1000);
    return () => {
      subscription.remove();
      clearInterval(interval);
    };
  }, []);

  // Reconcile a server pull into state — shared by the initial sign-in load and
  // every foreground re-sync (they differ only in onboarding backfill). Callers
  // MUST already have checked the supersession guard (syncSeqRef) before calling.
  // `versionBeforeSync` is the settings-version captured before the network
  // await: if a local settings edit bumped it meanwhile, the settings merge is
  // skipped so the newer local value stands. `backfillOnboarding` (sign-in only)
  // marks an already-established account (it has a server settings row OR
  // expenses) as onboarded, so a fresh device/reinstall doesn't re-run setup.
  const applySyncResult = useCallback(
    (result, versionBeforeSync, { backfillOnboarding }) => {
      setExpenses(applyPendingOps(userId, result.expenses));
      // group.icon and bill.meta are DEVICE-LOCAL (not in the Supabase mapping),
      // so a server reconcile would drop them. Preserve them from in-memory state
      // by id — same posture as theme/language.
      if (result.groups) {
        const pulled = applyPendingGroupOps(userId, result.groups);
        setGroups((prev) => {
          const byId = new Map(prev.map((g) => [g.id, g]));
          return pulled.map((g) =>
            g.icon == null && byId.get(g.id)?.icon != null ? { ...g, icon: byId.get(g.id).icon } : g
          );
        });
      }
      if (result.splits) {
        const pulled = applyPendingSplitOps(userId, result.splits);
        setSplitExpenses((prev) => {
          const byId = new Map(prev.map((b) => [b.id, b]));
          return pulled.map((b) =>
            b.meta == null && byId.get(b.id)?.meta != null ? { ...b, meta: byId.get(b.id).meta } : b
          );
        });
      }
      // An account with a server settings row OR any expenses has been set up
      // before — key the backfill on that, not on expenses alone, so a user who
      // onboarded but hasn't logged an expense yet isn't re-onboarded elsewhere.
      const isEstablished = Boolean(result.settings) || result.expenses.length > 0;
      if (result.settings && settingsVersionRef.current === versionBeforeSync) {
        setSettings((prev) => {
          const merged = { ...prev, ...result.settings };
          if (backfillOnboarding && !merged.onboardingDone && isEstablished) merged.onboardingDone = true;
          return merged;
        });
        // Server row predates the extra settings columns (they pull as unset):
        // seed them from this device's values so budgets/categories reach
        // the server without waiting for the next settings edit.
        if (result.settings.categoryBudgets === undefined) {
          enqueueSettingsPush(userId, { ...settingsRef.current, ...result.settings });
        }
      } else if (backfillOnboarding && !result.settings && isEstablished) {
        setSettings((prev) => (prev.onboardingDone ? prev : { ...prev, onboardingDone: true }));
      }
    },
    [userId]
  );

  // Cache-first load: AsyncStorage renders immediately, then the server's
  // state (with any still-pending local ops re-applied) replaces it. Server
  // settings only carry displayCurrency/monthlyBudget, so they MERGE over the
  // local settings — theme, language and category budgets are device-local.
  useEffect(() => {
    let active = true;
    // A new account-switch load supersedes any in-flight sync.
    const seq = (syncSeqRef.current += 1);
    setDataUser(null);
    // Clear any prior account's sync-error pill so it can't flash over the next
    // account's data before its first sync resolves.
    setSyncError(false);
    if (!userId) {
      // Signed out: drop the previous account's data from memory.
      setExpenses([]);
      setGroups([]);
      setSplitExpenses([]);
      setSettings(DEFAULT_SETTINGS);
      return;
    }
    (async () => {
      const [cachedExpenses, cachedSettings, cachedGroups, cachedSplits] = await Promise.all([
        loadExpenses(userId),
        loadSettings(userId),
        loadGroups(userId),
        loadSplitExpenses(userId),
      ]);
      if (!active) return;
      setExpenses(cachedExpenses);
      setGroups(cachedGroups);
      setSplitExpenses(cachedSplits);
      setSettings(cachedSettings);
      setDataUser(userId);

      const versionBeforeSync = settingsVersionRef.current;
      const result = await syncWithServer(userId);
      // Bail if a newer load/re-sync started while we were awaiting the network,
      // so a superseded pull can't clobber the latest account's data.
      if (!active || syncSeqRef.current !== seq) return;
      if (!result) {
        // Offline or a failed pull — surface it, unless we're local-only (there
        // is no server to reach, so "not synced" would be meaningless).
        if (isSupabaseConfigured && userId !== LOCAL_USER) setSyncError(true);
        return;
      }
      setSyncError(false);
      applySyncResult(result, versionBeforeSync, { backfillOnboarding: true });
    })();
    return () => {
      active = false;
    };
  }, [userId]);

  // Re-sync whenever the app comes back to the foreground: flushes anything
  // queued while offline and picks up changes made on other devices.
  useEffect(() => {
    if (!userId || userId === LOCAL_USER) return;
    let active = true;
    const subscription = AppState.addEventListener('change', async (state) => {
      if (state !== 'active') return;
      // A foreground re-sync supersedes any in-flight sync (load or prior resume).
      const seq = (syncSeqRef.current += 1);
      const versionBeforeSync = settingsVersionRef.current;
      const result = await syncWithServer(userId);
      // Bail if a newer load/re-sync started while we were awaiting the network.
      if (!active || syncSeqRef.current !== seq) return;
      if (!result) {
        setSyncError(true);
        return;
      }
      setSyncError(false);
      // No onboarding backfill on resume: it was already resolved on the load.
      applySyncResult(result, versionBeforeSync, { backfillOnboarding: false });
    });
    return () => {
      active = false;
      subscription.remove();
    };
  }, [userId]);

  // Manual re-sync from the sync-failure pill — mirrors the foreground resume.
  const retrySync = useCallback(async () => {
    if (!isSupabaseConfigured || !userId || userId === LOCAL_USER) return;
    const seq = (syncSeqRef.current += 1);
    const versionBeforeSync = settingsVersionRef.current;
    const result = await syncWithServer(userId);
    if (syncSeqRef.current !== seq) return;
    if (!result) {
      setSyncError(true);
      return;
    }
    setSyncError(false);
    applySyncResult(result, versionBeforeSync, { backfillOnboarding: false });
  }, [userId, applySyncResult]);

  useEffect(() => {
    if (dataUser && dataUser === userId) saveExpenses(dataUser, expenses);
  }, [expenses, dataUser, userId]);

  useEffect(() => {
    if (dataUser && dataUser === userId) saveGroups(dataUser, groups);
  }, [groups, dataUser, userId]);

  useEffect(() => {
    if (dataUser && dataUser === userId) saveSplitExpenses(dataUser, splitExpenses);
  }, [splitExpenses, dataUser, userId]);

  useEffect(() => {
    if (dataUser && dataUser === userId) saveSettings(dataUser, settings);
  }, [settings, dataUser, userId]);

  // Open the add popup on the Personal side (from the tab-bar "+").
  const openAdd = useCallback(() => {
    setAddEntryMode('personal');
    setSharedLockedGroupId(null);
    setSharedInitialGroupId(null);
    setAddNonce((n) => n + 1);
    setAddOpen(true);
  }, []);

  // Close the add popup; if it was launched from a group's "Add a bill" (locked
  // to that group), reopen that group's detail sheet so the user lands back there.
  const closeAdd = useCallback(() => {
    setAddOpen(false);
    if (sharedLockedGroupId) {
      setActiveGroupId(sharedLockedGroupId);
      setSharedLockedGroupId(null);
    }
  }, [sharedLockedGroupId]);

  // Android hardware/gesture back closes the add/edit popups. AddExpenseModal
  // is a plain View (not an RN Modal), so nothing installs onRequestClose for
  // these — without this handler, back would background/exit the whole app
  // with a popup open. The Sheet-based overlays are real Modals and already
  // handle back themselves.
  useEffect(() => {
    if (Platform.OS !== 'android') return undefined;
    if (!addOpen && !editingExpense && !editingSplit) return undefined;
    const sub = BackHandler.addEventListener('hardwareBackPress', () => {
      if (editingSplit) {
        // Mirror the editor's onClose round-trip back to the group sheet.
        const g = editingSplit.groupId;
        setEditingSplit(null);
        if (g) setActiveGroupId(g);
      } else if (editingExpense) {
        setEditingExpense(null);
      } else {
        closeAdd();
      }
      return true;
    });
    return () => sub.remove();
  }, [addOpen, editingExpense, editingSplit, closeAdd]);

  // Open the shared add popup locked to one group (from GroupDetailScreen's "Add
  // a bill"). Closes the group sheet while the popup is up; closeAdd reopens it.
  const openSharedAddForGroup = useCallback((groupId) => {
    setActiveGroupId(null);
    setSharedLockedGroupId(groupId);
    setSharedInitialGroupId(null);
    setAddEntryMode('shared');
    setAddNonce((n) => n + 1);
    setAddOpen(true);
  }, []);

  const openCreateGroupFromSharedAdd = useCallback(() => {
    setReturnToSharedAddAfterCreateGroup(true);
    setAddOpen(false);
    setSharedLockedGroupId(null);
    setSharedInitialGroupId(null);
    setActiveGroupId(null);
    setOverlay('createGroup');
  }, []);

  const reopenSharedAdd = useCallback((initialGroupId = null) => {
    setReturnToSharedAddAfterCreateGroup(false);
    setAddEntryMode('shared');
    setSharedLockedGroupId(null);
    setSharedInitialGroupId(initialGroupId);
    setAddNonce((n) => n + 1);
    setAddOpen(true);
  }, []);

  const addExpense = ({ amount, currency, note, category, createdAt }) => {
    const expense = {
      id: makeId('e'),
      amount,
      currency,
      note,
      category,
      createdAt: createdAt ?? Date.now(),
    };
    setExpenses((prev) => [expense, ...prev]);
    enqueueExpenseUpsert(userId, expense);
    setAddOpen(false);
    setRewardNonce((n) => n + 1);
    Haptics.notificationAsync(Haptics.NotificationFeedbackType.Success).catch(() => {});
    AccessibilityInfo.announceForAccessibility(translate(language, 'add.added'));
  };

  const updateExpense = ({ id, amount, currency, note, category, createdAt }) => {
    const updated = { id, amount, currency, note, category, createdAt };
    setExpenses((prev) => prev.map((e) => (e.id === id ? updated : e)));
    enqueueExpenseUpsert(userId, updated);
    setEditingExpense(null);
    Haptics.notificationAsync(Haptics.NotificationFeedbackType.Success).catch(() => {});
  };

  const deleteExpense = (id) => {
    setExpenses((prev) => prev.filter((e) => e.id !== id));
    enqueueExpenseDelete(userId, id);
    // Close the edit popup if the delete came from it (no-op when deleting from
    // the list, where editingExpense is already null).
    setEditingExpense(null);
    Haptics.impactAsync(Haptics.ImpactFeedbackStyle.Medium).catch(() => {});
  };

  // --- Split bills (synced to Supabase via groups + splits lanes) ------------
  const createGroup = ({ name, currency, members, paymentMethod, icon }) => {
    const group = {
      id: makeId('g'),
      name,
      currency,
      paymentMethod,
      icon: icon || undefined,
      members: members.map((m) => ({ id: makeId('m'), name: m })),
      createdAt: Date.now(),
    };
    setGroups((prev) => [group, ...prev]);
    enqueueGroupUpsert(userId, group);
    setOverlay(null);
    if (returnToSharedAddAfterCreateGroup) {
      setActiveGroupId(null);
      reopenSharedAdd(group.id);
    } else {
      setActiveGroupId(group.id);
    }
    Haptics.notificationAsync(Haptics.NotificationFeedbackType.Success).catch(() => {});
  };

  const updateGroup = (id, patch) => {
    setGroups((prev) => {
      const updated = prev.map((g) => (g.id === id ? { ...g, ...patch } : g));
      const group = updated.find((g) => g.id === id);
      if (group) enqueueGroupUpsert(userId, group);
      return updated;
    });
  };

  // Remove a member from a group, resolving their bill shares per `strategy`
  // ('redistribute' | 'unassign' — see removeMemberFromBill in splits.js).
  // Settlements involving the member are deleted (inert rows once the id is
  // gone). With 'unassign' and exactly one affected bill, the bill editor opens
  // on it so the residual can be reassigned immediately; otherwise the group
  // sheet stays up, where affected rows show their undistributed amount. The
  // sheet blocks removal of a member who PAID a bill; guarded here too.
  const removeGroupMember = (groupId, memberId, strategy) => {
    const group = groups.find((g) => g.id === groupId);
    if (!group) return;
    if (splitExpenses.some((b) => b.groupId === groupId && !b.settlement && b.paidBy === memberId)) return;

    const rewritten = [];
    const nextSplits = [];
    for (const b of splitExpenses) {
      if (b.groupId !== groupId) {
        nextSplits.push(b);
        continue;
      }
      if (b.settlement && (b.from === memberId || b.to === memberId)) {
        enqueueSplitDelete(userId, b.id);
        continue;
      }
      const nb = removeMemberFromBill(b, memberId, strategy);
      if (nb !== b) rewritten.push(nb);
      nextSplits.push(nb);
    }
    setSplitExpenses(nextSplits);
    rewritten.forEach((b) => enqueueSplitUpsert(userId, b));
    const nextGroup = { ...group, members: group.members.filter((m) => m.id !== memberId) };
    setGroups((prev) => prev.map((g) => (g.id === groupId ? nextGroup : g)));
    enqueueGroupUpsert(userId, nextGroup);
    if (strategy === 'unassign' && rewritten.length === 1) openEditSplit(rewritten[0]);
    Haptics.impactAsync(Haptics.ImpactFeedbackStyle.Medium).catch(() => {});
  };

  const deleteGroup = (id) => {
    splitExpenses.filter((b) => b.groupId === id).forEach((b) => enqueueSplitDelete(userId, b.id));
    enqueueGroupDelete(userId, id);
    setGroups((prev) => prev.filter((g) => g.id !== id));
    setSplitExpenses((prev) => prev.filter((b) => b.groupId !== id));
    setActiveGroupId(null);
    Haptics.impactAsync(Haptics.ImpactFeedbackStyle.Medium).catch(() => {});
  };

  const addSplitExpense = ({ groupId, description, amount, currency, category, paidBy, mode, shares, createdAt, meta }) => {
    const bill = {
      id: makeId('s'),
      groupId,
      description,
      amount,
      currency,
      category,
      paidBy,
      mode,
      shares,
      createdAt: createdAt ?? Date.now(),
      ...(meta && { meta }),
    };
    setSplitExpenses((prev) => [bill, ...prev]);
    enqueueSplitUpsert(userId, bill);
    closeAdd();
    Haptics.notificationAsync(Haptics.NotificationFeedbackType.Success).catch(() => {});
  };

  // Open the split-bill editor (from a group sheet's bill row). Closes the group
  // sheet while the editor is up; the editor reopens it on save/delete/close.
  const openEditSplit = useCallback((bill) => {
    setActiveGroupId(null);
    setEditingSplit(bill);
  }, []);

  const updateSplitExpense = ({ id, groupId, description, amount, currency, category, paidBy, mode, shares, createdAt, meta }) => {
    const updated = { id, groupId, description, amount, currency, category, paidBy, mode, shares, createdAt, ...(meta ? { meta } : {}) };
    setSplitExpenses((prev) => prev.map((b) => (b.id === id ? updated : b)));
    enqueueSplitUpsert(userId, updated);
    setEditingSplit(null);
    setActiveGroupId(groupId);
    Haptics.notificationAsync(Haptics.NotificationFeedbackType.Success).catch(() => {});
  };

  const deleteSplitExpense = (id) => {
    setSplitExpenses((prev) => prev.filter((b) => b.id !== id));
    enqueueSplitDelete(userId, id);
    // If deleted from the editor, dismiss it and return to the group sheet.
    setEditingSplit((cur) => {
      if (cur && cur.id === id) {
        setActiveGroupId(cur.groupId);
        return null;
      }
      return cur;
    });
    Haptics.impactAsync(Haptics.ImpactFeedbackStyle.Medium).catch(() => {});
  };

  const settleUp = (groupId, memberId) => {
    const group = groups.find((g) => g.id === groupId);
    if (!group) return;
    const bal = groupBalances(group, splitExpenses)[memberId] ?? 0;
    if (Math.abs(bal) < 1e-6) return;
    const settlement = {
      id: makeId('st'),
      groupId,
      settlement: true,
      amount: Number(Math.abs(bal).toFixed(getCurrency(group.currency).decimals)),
      currency: group.currency,
      from: bal > 0 ? memberId : YOU,
      to: bal > 0 ? YOU : memberId,
      createdAt: Date.now(),
    };
    setSplitExpenses((prev) => [settlement, ...prev]);
    enqueueSplitUpsert(userId, settlement);
    Haptics.notificationAsync(Haptics.NotificationFeedbackType.Success).catch(() => {});
  };

  const loadDemo = async () => {
    // Replaces the expense list with sample data — destructive and not
    // undoable, so confirm first.
    const ok = await confirmDestructive({
      title: translate(language, 'empty.confirmDemoTitle'),
      body: translate(language, 'empty.confirmDemo'),
      confirmLabel: translate(language, 'empty.confirmDemoConfirm'),
      cancelLabel: translate(language, 'common.cancel'),
    });
    if (!ok) return;
    const demo = buildDemoExpenses();
    setExpenses(demo);
    enqueueExpensesReplace(userId, demo);
    Haptics.notificationAsync(Haptics.NotificationFeedbackType.Success).catch(() => {});
  };

  const settingsRef = useRef(settings);
  settingsRef.current = settings;

  const updateSettings = useCallback(
    (patch) => {
      setSettings((cur) => {
        const next = { ...cur, ...patch };
        if (patch.displayCurrency && patch.displayCurrency !== cur.displayCurrency) {
          const redenominated = redenominateBudgets(
            cur.monthlyBudget,
            cur.categoryBudgets,
            cur.displayCurrency,
            patch.displayCurrency
          );
          if (patch.monthlyBudget === undefined) next.monthlyBudget = redenominated.monthlyBudget;
          if (patch.categoryBudgets === undefined) next.categoryBudgets = redenominated.categoryBudgets;
        }
        if (
          next.displayCurrency !== cur.displayCurrency ||
          next.monthlyBudget !== cur.monthlyBudget ||
          next.categoryBudgets !== cur.categoryBudgets ||
          next.categoryOrder !== cur.categoryOrder ||
          next.customCategories !== cur.customCategories ||
          next.customPaymentMethods !== cur.customPaymentMethods
        ) {
          // Only server-synced field changes bump the guard. Device-local
          // patches (theme/language/onboardingDone) must NOT bump it, or a
          // concurrent server settings merge from an in-flight sync would be
          // dropped for no reason. Object fields compare by reference — a patch
          // carrying one always brings a fresh object, so at worst an
          // equal-value patch enqueues a redundant (coalesced) push.
          settingsVersionRef.current += 1;
          enqueueSettingsPush(userId, next); // sync.js picks the synced subset
        }
        return next;
      });
    },
    [userId]
  );

  const signOut = useCallback(async () => {
    const confirmed = await confirmDestructive({
      title: translate(language, 'acct.signOut'),
      body: translate(language, 'acct.signOutBody'),
      confirmLabel: translate(language, 'acct.signOut'),
      cancelLabel: translate(language, 'common.cancel'),
    });
    if (!confirmed) return;
    setOverlay(null);
    // best-effort push of anything still queued on ALL THREE lanes (each lane
    // has its own queue: expenses/settings, groups, splits).
    await Promise.all([
      flush(userId),
      flushGroups(userId),
      flushSplits(userId),
    ]);
    // Local scope: clears this device's session even when offline.
    await supabase.auth.signOut({ scope: 'local' }).catch(() => {});
  }, [userId, language]);

  // Permanently erase the account's data: wipe all server rows (synced mode),
  // clear this device's caches, reset in-memory state, and sign out. NOTE: the
  // Supabase auth login record itself can't be removed with the anon key — that
  // needs a server-side (service-role) function; this is the client-side data
  // wipe + sign-out. In local-only mode it just clears everything on the device.
  const deleteAccount = useCallback(async () => {
    const confirmed = await confirmDestructive({
      title: translate(language, 'acct.deleteAccount'),
      body: translate(language, 'acct.deleteBody'),
      confirmLabel: translate(language, 'acct.deleteConfirm'),
      cancelLabel: translate(language, 'common.cancel'),
    });
    if (!confirmed) return;
    setOverlay(null);

    const wipeUser = userId;
    if (isSupabaseConfigured && wipeUser && wipeUser !== LOCAL_USER) {
      // replace-with-empty deletes every row on each lane, scoped to this user
      // via RLS. Best-effort: if offline the ops stay queued and wipe on resync.
      enqueueExpensesReplace(wipeUser, []);
      enqueueGroupsReplace(wipeUser, []);
      enqueueSplitsReplace(wipeUser, []);
      await Promise.all([
        flush(wipeUser),
        flushGroups(wipeUser),
        flushSplits(wipeUser),
      ]).catch(() => {});
      // The settings row isn't covered by the three lanes — delete it directly
      // (RLS scopes it to this user) so budgets/custom categories/payment
      // methods don't survive the wipe and re-pull on a later sign-in.
      await supabase.from('settings').delete().eq('user_id', wipeUser).then(
        () => {},
        () => {}
      );
      // Legacy: the income feature was removed client-side, but accounts from
      // older builds may still hold server income rows — wipe them the same way.
      await supabase.from('income').delete().eq('user_id', wipeUser).then(
        () => {},
        () => {}
      );
    }

    // Purge the pending-op queues (durable + in-memory). If a wipe op above
    // couldn't flush (offline), letting it linger is worse than dropping it:
    // a stale replace-with-empty replaying later would silently delete data
    // this account recreated on another device.
    await clearQueues(wipeUser);
    await clearUserStorage(wipeUser);

    // Reset in-memory state so nothing stale lingers behind the sign-out.
    setExpenses([]);
    setGroups([]);
    setSplitExpenses([]);
    setSettings(DEFAULT_SETTINGS);

    if (isSupabaseConfigured) {
      await supabase.auth.signOut({ scope: 'local' }).catch(() => {});
    }
    Haptics.notificationAsync(Haptics.NotificationFeedbackType.Success).catch(() => {});
  }, [userId, language]);

  const displayCurrency = settings.displayCurrency;

  const allCategories = getAllCategories(settings.customCategories);
  const regularCategories = getRegularAll(settings.customCategories);
  const externalCategories = getExternalAll(settings.customCategories);

  // Every custom-category/payment-method mutator below changes server-synced
  // fields (customCategories / categoryBudgets / customPaymentMethods), so
  // they all go through this helper, which applies updateSettings' discipline:
  // bump the version guard (so an in-flight pull can't clobber the change) and
  // enqueue a push. Pushes coalesce in sync.js, so always enqueuing is free.
  const patchSyncedSettings = useCallback(
    (fn) => {
      setSettings((prev) => {
        const next = fn(prev);
        settingsVersionRef.current += 1;
        enqueueSettingsPush(userId, next); // sync.js picks the synced subset
        return next;
      });
    },
    [userId]
  );

  // The add/edit-category modal returns the category plus its required monthly
  // `budget`; the budget lives in settings.categoryBudgets (not on the category
  // object), so split it off before storing either.
  const addCustomCategory = (category) => {
    const { budget, ...cat } = category;
    patchSyncedSettings((prev) => ({
      ...prev,
      customCategories: [...(prev.customCategories || []), cat],
      ...(budget > 0 ? { categoryBudgets: { ...prev.categoryBudgets, [cat.id]: budget } } : {}),
    }));
  };

  // Presets delete as a `{ id, deleted: true }` tombstone (getAllCategories
  // hides them); user-created categories are simply removed. Either way the
  // category's budget goes with it.
  const deleteCustomCategory = (id) => {
    patchSyncedSettings((prev) => {
      const kept = (prev.customCategories || []).filter((c) => c.id !== id);
      const { [id]: _, ...categoryBudgets } = prev.categoryBudgets || {};
      return {
        ...prev,
        customCategories: isPresetCategory(id) ? [...kept, { id, deleted: true }] : kept,
        categoryBudgets,
      };
    });
  };

  // Upsert: an edited preset has no entry in customCategories yet — its first
  // save appends an override carrying the preset's id.
  const updateCustomCategory = (updated) => {
    const { budget, ...cat } = updated;
    patchSyncedSettings((prev) => {
      const list = prev.customCategories || [];
      const exists = list.some((c) => c.id === cat.id);
      return {
        ...prev,
        customCategories: exists ? list.map((c) => (c.id === cat.id ? cat : c)) : [...list, cat],
        ...(budget > 0 ? { categoryBudgets: { ...prev.categoryBudgets, [cat.id]: budget } } : {}),
      };
    });
  };

  // A custom payment method carries the same {id,label,color,icon} shape as the
  // built-ins (so it renders an icon+color chip and themes a group). Accepts a
  // bare string for back-compat.
  const addCustomPaymentMethod = (method) => {
    const id = `pm_${Date.now().toString(36)}_${Math.random().toString(36).slice(2, 6)}`;
    const entry =
      typeof method === 'string'
        ? { id, label: method }
        : { id, label: method.label, color: method.color, icon: method.icon };
    patchSyncedSettings((prev) => ({
      ...prev,
      customPaymentMethods: [...(prev.customPaymentMethods || []), entry],
    }));
  };

  const removeCustomPaymentMethod = (id) => {
    patchSyncedSettings((prev) => ({
      ...prev,
      customPaymentMethods: (prev.customPaymentMethods || []).filter((pm) => pm.id !== id),
    }));
    // Reassign any group using the removed method back to cash so no dangling
    // reference lingers in stored/synced group rows (matches the delete dialog).
    setGroups((prev) => {
      let changed = false;
      const next = prev.map((g) => {
        if (g.paymentMethod !== id) return g;
        changed = true;
        const updated = { ...g, paymentMethod: DEFAULT_PAYMENT_METHOD_ID };
        enqueueGroupUpsert(userId, updated);
        return updated;
      });
      return changed ? next : prev;
    });
  };

  // Your share of every split bill, as synthetic spending items. These fold into
  // the dashboard/category/budget aggregates (the user chose "your share counts
  // as spending") but never enter the Expenses list — see deriveViewData.
  const splitShareItems = useMemo(() => yourShareAsExpenses(splitExpenses), [splitExpenses]);

  const { sections, months, hasSpending } =
    useMemo(
      () => deriveViewData(expenses, displayCurrency, language, settings.customCategories, undefined, splitShareItems),
      // dayStamp is a dep-only trigger: it forces re-derivation at midnight (so
      // month/today stats roll over) but is intentionally NOT passed into
      // deriveViewData (which reads `now` itself). Do not remove it as "unused".
      [expenses, displayCurrency, language, dayStamp, settings.customCategories, splitShareItems]
    );

  // Overall owed/owe across groups (display currency) for the Split tab + the
  // dashboard widget. The open group / add-bill target are looked up by id.
  const splitSummary = useMemo(
    () => overallBalance(groups, splitExpenses, displayCurrency),
    [groups, splitExpenses, displayCurrency]
  );
  const activeGroup = groups.find((g) => g.id === activeGroupId) ?? null;

  const loaded = dataUser != null && dataUser === userId;
  const hasExpenses = expenses.length > 0;
  const currentMonthKey = dayStamp.slice(0, 7);

  const shiftDashMonth = useCallback((dir) => {
    setDashMonthKey((key) => shiftMonthKey(key, dir));
  }, []);
  // The hero card's view of the selected month: total, previous-month total
  // (for the delta badge) and the per-day chart series. Months with no data
  // render honestly as $0 with a flat chart (no fallback to the current month).
  const heroView = useMemo(() => {
    const selected = months.find((m) => m.key === dashMonthKey);
    const prev = months.find((m) => m.key === shiftMonthKey(dashMonthKey, -1));
    const [y, mo] = dashMonthKey.split('-').map(Number);
    const daysInMonth = new Date(y, mo, 0).getDate();
    return {
      total: selected?.total ?? 0,
      prevTotal: prev?.total ?? 0,
      dailyTotals: selected?.dailyTotals ?? new Array(daysInMonth).fill(0),
    };
  }, [months, dashMonthKey]);

  let content = null;
  // True only on the main-UI branch below — gates chrome that must never render
  // over Auth/Onboarding (here: the Dashboard's wash-tinted status-bar strip).
  let mainUIVisible = false;
  if (isSupabaseConfigured && !session) {
    content = sessionLoaded ? <AuthScreen /> : null;
  } else if (isSupabaseConfigured && session && !loaded) {
    content = null;
  } else if (isSupabaseConfigured && loaded && !settings.onboardingDone) {
    content = (
      <OnboardingScreen
        settings={settings}
        onUpdateSettings={updateSettings}
      />
    );
  } else {
    mainUIVisible = true;
    // Global chrome (account FAB top-left, add FAB bottom-right) hides whenever
    // any popup or sheet is open so it never floats over a modal surface.
    const chromeVisible =
      overlay == null &&
      !addOpen &&
      editingExpense == null &&
      editingSplit == null &&
      activeGroupId == null;
    content = (
      <>
        <View style={styles.content} {...swipeHandlers}>
          {/* The stationary page: the same background + wash every screen
              paints, kept fixed behind the crossfading screens so tab
              switches read as widgets swapping on one unmoving page. Idle
              screens are opaque, so this layer only shows mid-transition. */}
          <View
            style={[styles.screen, { backgroundColor: theme.background }]}
            pointerEvents="none"
          >
            <HeaderGlow id="tabBackdropGlow" />
          </View>
          <Animated.View style={[styles.screen, screenStyle('dashboard')]} pointerEvents={tab === 'dashboard' ? 'auto' : 'none'}>
            <DashboardScreen
              loaded={loaded}
              hasExpenses={hasSpending}
              monthTotal={heroView.total}
              lastMonthTotal={heroView.prevTotal}
              dailyTotals={heroView.dailyTotals}
              monthKey={dashMonthKey}
              onShiftMonth={shiftDashMonth}
              displayCurrency={displayCurrency}
              onAddPress={() => openAdd()}
              onLoadDemo={loadDemo}
              splitSummary={splitSummary}
              onOpenSplit={() => changeTab('split')}
              categoryMonths={months}
              currentMonthKey={currentMonthKey}
              allCategories={allCategories}
              categoryBudgets={settings.categoryBudgets}
              onCategoryDetail={() => changeTab('insight')}
            />
          </Animated.View>
          <Animated.View style={[styles.screen, screenStyle('list')]} pointerEvents={tab === 'list' ? 'auto' : 'none'}>
            <ExpenseListScreen
              sections={sections}
              loaded={loaded}
              hasExpenses={hasExpenses}
              displayCurrency={displayCurrency}
              categories={allCategories}
              onDelete={deleteExpense}
              onAddPress={() => openAdd()}
              onLoadDemo={loadDemo}
              onEditPress={setEditingExpense}
            />
          </Animated.View>
          <Animated.View style={[styles.screen, screenStyle('split')]} pointerEvents={tab === 'split' ? 'auto' : 'none'}>
            <SplitBillsScreen
              groups={groups}
              splitExpenses={splitExpenses}
              displayCurrency={displayCurrency}
              summary={splitSummary}
              currentMonthKey={currentMonthKey}
              customCategories={settings.customCategories}
              customPaymentMethods={settings.customPaymentMethods}
              onOpenGroup={setActiveGroupId}
              onCreateGroup={() => {
                setReturnToSharedAddAfterCreateGroup(false);
                setOverlay('createGroup');
              }}
            />
          </Animated.View>
          <Animated.View style={[styles.screen, screenStyle('insight')]} pointerEvents={tab === 'insight' ? 'auto' : 'none'}>
            <InsightScreen
              loaded={loaded}
              hasExpenses={hasSpending}
              displayCurrency={displayCurrency}
              monthlyBudget={settings.monthlyBudget}
              categoryBudgets={settings.categoryBudgets}
              regularCategories={regularCategories}
              externalCategories={externalCategories}
              months={months}
              currentMonthKey={currentMonthKey}
              categoryOrder={settings.categoryOrder}
              onReorderCategories={(ids) => updateSettings({ categoryOrder: ids })}
              onEditBudgets={() => setOverlay('budget')}
              onChangeCurrency={(code) => updateSettings({ displayCurrency: code })}
              onAddCategory={addCustomCategory}
              onUpdateCategory={updateCustomCategory}
              onDeleteCategory={deleteCustomCategory}
              onAddPress={() => openAdd()}
              onLoadDemo={loadDemo}
            />
          </Animated.View>
        </View>

        {chromeVisible && (
          <Pressable
            onPress={() => setOverlay('account')}
            hitSlop={12}
            accessibilityRole="button"
            accessibilityLabel={translate(language, 'acct.title')}
            style={({ pressed }) => [
              styles.accountFab,
              {
                backgroundColor: theme.card,
                borderColor: theme.border,
                borderWidth: StyleSheet.hairlineWidth,
              },
              pressed && styles.accountFabPressed,
            ]}
          >
            <HIcon name="settings-01" size={22} color={theme.icon} />
          </Pressable>
        )}

        {/* Sync-failure pill: the one visible signal that a background sync
            couldn't reach the server (all sync/storage errors are otherwise
            swallowed by design). Sits above the tab bar; tap the body to retry,
            the × to dismiss. Gated by chromeVisible so it never floats over a
            popup/sheet. */}
        {chromeVisible && syncError && (
          <View
            style={[styles.syncBannerWrap, { bottom: TAB_BAR_HEIGHT + insets.bottom + spacing.sm }]}
            pointerEvents="box-none"
          >
            <View style={[styles.syncBanner, { backgroundColor: theme.warning }]}>
              <Pressable
                onPress={retrySync}
                accessibilityRole="button"
                accessibilityLabel={translate(language, 'sync.retry')}
                style={({ pressed }) => [styles.syncBannerMain, pressed && styles.syncBannerPressed]}
              >
                <Text style={[styles.syncBannerText, { color: theme.onAccent }]} numberOfLines={1}>
                  {translate(language, 'sync.failed')}
                </Text>
              </Pressable>
              <Pressable
                onPress={() => setSyncError(false)}
                hitSlop={12}
                accessibilityRole="button"
                accessibilityLabel={translate(language, 'sync.dismiss')}
                style={({ pressed }) => pressed && styles.syncBannerPressed}
              >
                <HIcon name="cancel-01" size={15} color={theme.onAccent} />
              </Pressable>
            </View>
          </View>
        )}

        <TabBar tab={tab} onChange={changeTab} onAdd={() => openAdd()} />

        {/* Add popup with a Personal/Shared toggle: Personal adds an expense
            (AddEntryScreen), Shared adds a split bill (SharedSplitForm). The
            active form stays mounted while the popup is closed (AddExpenseModal
            hides it with display:none) so a half-typed entry survives dismissal. */}
        <AddExpenseModal visible={addOpen} onClose={closeAdd}>
          {addEntryMode === 'shared' ? (
            <SharedSplitForm
              key={addNonce}
              entryMode={addEntryMode}
              onChangeEntryMode={setAddEntryMode}
              lockedGroupId={sharedLockedGroupId}
              initialGroupId={sharedInitialGroupId}
              groups={groups}
              categories={allCategories}
              displayCurrency={displayCurrency}
              onAdd={addSplitExpense}
              onCreateGroup={openCreateGroupFromSharedAdd}
              onClose={closeAdd}
            />
          ) : (
            <AddEntryScreen
              entryMode={addEntryMode}
              onChangeEntryMode={setAddEntryMode}
              displayCurrency={displayCurrency}
              categories={allCategories}
              onSubmit={addExpense}
              onClose={closeAdd}
            />
          )}
        </AddExpenseModal>

        <AddExpenseModal visible={editingExpense != null} onClose={() => setEditingExpense(null)}>
          {editingExpense && (
            <AddEntryScreen
              displayCurrency={displayCurrency}
              categories={allCategories}
              editEntry={editingExpense}
              onSubmit={updateExpense}
              onDelete={deleteExpense}
              onClose={() => setEditingExpense(null)}
            />
          )}
        </AddExpenseModal>

        {/* Split-bill editor — re-decide paid-by / split method / shares. Closing
            returns to the group sheet (mirrors the add-a-bill round-trip). */}
        <AddExpenseModal
          visible={editingSplit != null}
          onClose={() => {
            const g = editingSplit?.groupId;
            setEditingSplit(null);
            if (g) setActiveGroupId(g);
          }}
        >
          {editingSplit && (
            <SharedSplitForm
              key={editingSplit.id}
              editBill={editingSplit}
              lockedGroupId={editingSplit.groupId}
              groups={groups}
              categories={allCategories}
              displayCurrency={displayCurrency}
              onSave={updateSplitExpense}
              onDelete={deleteSplitExpense}
              onClose={() => {
                const g = editingSplit.groupId;
                setEditingSplit(null);
                if (g) setActiveGroupId(g);
              }}
            />
          )}
        </AddExpenseModal>

        <BudgetScreen
          visible={overlay === 'budget'}
          settings={settings}
          regularCategories={regularCategories}
          externalCategories={externalCategories}
          onUpdateSettings={updateSettings}
          onClose={() => setOverlay(null)}
        />

        <AccountScreen
          visible={overlay === 'account'}
          settings={settings}
          onUpdateSettings={updateSettings}
          accountEmail={session?.user?.email}
          onSignOut={signOut}
          onDeleteAccount={deleteAccount}
          onClose={() => setOverlay(null)}
        />

        <CreateGroupScreen
          visible={overlay === 'createGroup'}
          defaultCurrency={displayCurrency}
          customPaymentMethods={settings.customPaymentMethods}
          onAddPaymentMethod={addCustomPaymentMethod}
          onCreate={createGroup}
          onClose={() => {
            setOverlay(null);
            if (returnToSharedAddAfterCreateGroup) reopenSharedAdd();
          }}
        />

        <GroupDetailScreen
          visible={activeGroupId != null}
          group={activeGroup}
          splitExpenses={splitExpenses}
          customCategories={settings.customCategories}
          customPaymentMethods={settings.customPaymentMethods}
          onAddPaymentMethod={addCustomPaymentMethod}
          onRemovePaymentMethod={removeCustomPaymentMethod}
          onAddBill={openSharedAddForGroup}
          onEditBill={openEditSplit}
          onDeleteBill={deleteSplitExpense}
          onSettle={settleUp}
          onUpdateGroup={updateGroup}
          onRemoveMember={removeGroupMember}
          onDeleteGroup={deleteGroup}
          onClose={() => setActiveGroupId(null)}
        />

        <RewardCheck trigger={rewardNonce} />
      </>
    );
  }

  return (
    <ThemeProvider themeName={settings.theme}>
      <I18nProvider language={language}>
        {/* While the tabbed UI is up the top inset (status-bar strip) is
            painted in glowWashTop — the solid equivalent of the HeaderGlow
            wash's top row (every tab renders the wash) — so the page gradient
            reads as starting at the physical screen top. */}
        <SafeAreaView
          style={[
            styles.safeArea,
            { backgroundColor: mainUIVisible ? theme.glowWashTop : theme.background },
          ]}
          edges={['top', 'left', 'right']}
        >
          <StatusBar style={theme.statusBarStyle} />
          <ErrorBoundary resetKeys={[userId]}>{content}</ErrorBoundary>
        </SafeAreaView>
      </I18nProvider>
    </ThemeProvider>
  );
}

const styles = StyleSheet.create({
  safeArea: {
    flex: 1,
  },
  content: {
    flex: 1,
    overflow: 'hidden',
  },
  screen: {
    position: 'absolute',
    top: 0,
    left: 0,
    right: 0,
    bottom: 0,
  },
  // Floating account button — pinned top-left, follows across all tab screens.
  // SafeAreaView already pads the top inset, so a small gap sits it below the
  // status bar. Themed colors are applied inline (this static sheet has no
  // access to the palette).
  accountFab: {
    position: 'absolute',
    top: spacing.sm,
    left: spacing.md,
    width: ACCOUNT_FAB_SIZE,
    height: ACCOUNT_FAB_SIZE,
    borderRadius: ACCOUNT_FAB_SIZE / 2,
    alignItems: 'center',
    justifyContent: 'center',
    zIndex: 10,
    shadowColor: '#000',
    shadowOpacity: 0.18,
    shadowRadius: 6,
    shadowOffset: { width: 0, height: 2 },
    elevation: 6,
  },
  accountFabPressed: {
    opacity: 0.7,
  },
  // Sync-failure pill — a centered snackbar just above the tab bar (its `bottom`
  // is set inline from the tab-bar height + safe-area inset). The wrap is
  // box-none so only the pill itself is tappable, not the strip around it.
  syncBannerWrap: {
    position: 'absolute',
    left: 0,
    right: 0,
    alignItems: 'center',
    zIndex: 11,
  },
  syncBanner: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: spacing.sm,
    maxWidth: '90%',
    paddingVertical: spacing.xs + 3,
    paddingLeft: spacing.md,
    paddingRight: spacing.sm + 2,
    borderRadius: 999,
    ...panelShadow,
  },
  syncBannerMain: {
    flexShrink: 1,
  },
  syncBannerText: {
    fontFamily: fonts.medium,
    fontSize: 13,
  },
  syncBannerPressed: {
    opacity: 0.6,
  },
});
