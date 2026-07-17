import { useCallback, useEffect, useMemo, useRef, useState } from 'react';
import {
  AccessibilityInfo,
  Animated,
  AppState,
  BackHandler,
  Easing,
  Keyboard,
  PanResponder,
  Platform,
  Pressable,
  StyleSheet,
  useWindowDimensions,
  View,
} from 'react-native';
import { SafeAreaProvider, SafeAreaView } from 'react-native-safe-area-context';
import { StatusBar } from 'expo-status-bar';
import * as HapticsModule from 'expo-haptics';
import { useFonts } from 'expo-font';

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
import TabBar from './src/components/TabBar';
import AddExpenseModal from './src/components/AddExpenseModal';
import ErrorBoundary from './src/components/ErrorBoundary';
import RewardCheck from './src/components/RewardCheck';
import HeaderGlow from './src/components/HeaderGlow';
import {
  loadExpenses,
  saveExpenses,
  loadIncome,
  saveIncome,
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
  applyPendingIncomeOps,
  applyPendingGroupOps,
  applyPendingSplitOps,
  clearQueues,
  enqueueExpenseDelete,
  enqueueExpenseUpsert,
  enqueueExpensesReplace,
  enqueueGroupDelete,
  enqueueGroupUpsert,
  enqueueGroupsReplace,
  enqueueIncomeReplace,
  enqueueSettingsPush,
  enqueueSplitDelete,
  enqueueSplitUpsert,
  enqueueSplitsReplace,
  flush,
  flushIncome,
  flushGroups,
  flushSplits,
  syncWithServer,
} from './src/sync';
import { supabase, isSupabaseConfigured } from './src/supabase';
import { buildDemoExpenses, buildDemoIncome } from './src/demoData';
import { redenominateBudgets, getCurrency } from './src/currency';
import { getAllCategories, getRegularAll, getExternalAll, isPresetCategory } from './src/categories';
import { dateKey, shiftMonthKey } from './src/format';
import { deriveViewData } from './src/derive';
import { overallBalance, yourShareAsExpenses, groupBalances, removeMemberFromBill, YOU } from './src/splits';
import { ThemeProvider, getTheme, spacing, ACCOUNT_FAB_SIZE } from './src/theme';
import { I18nProvider, translate } from './src/i18n';
import { HIcon } from './src/icons';
import { confirmDestructive } from './src/confirm';

const Haptics = Platform.OS === 'web'
  ? { notificationAsync: () => Promise.resolve(), impactAsync: () => Promise.resolve(), NotificationFeedbackType: HapticsModule.NotificationFeedbackType, ImpactFeedbackStyle: HapticsModule.ImpactFeedbackStyle }
  : HapticsModule;

const TAB_INDEX = { dashboard: 0, list: 1, split: 2, insight: 3 };
const TAB_NAMES = ['dashboard', 'list', 'split', 'insight'];

// Tab-switch transition: the page background + HeaderGlow wash sit on a fixed
// backdrop layer that never moves while the screens crossfade over it with a
// small directional glide — since every tab paints the identical background +
// wash, only the widgets appear to change, so a switch reads as one stationary
// page swapping its content (the Copilot-app feel).
// How far the widgets travel during the crossfade.
const COPILOT_GLIDE = 28;

// Entry ids. crypto.randomUUID isn't guaranteed: Hermes (RN) has no global
// crypto and web only exposes it in a secure context, so a bare call can throw
// and abort the whole add before state/sync. The id column is `text`, so a
// non-UUID fallback syncs fine.
const makeId = (prefix) =>
  globalThis.crypto?.randomUUID?.() ??
  `${prefix}_${Date.now().toString(36)}_${Math.random().toString(36).slice(2, 10)}`;

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
  if (!fontsLoaded && !fontsError) return null;

  return (
    <SafeAreaProvider>
      <ExpenseTracker />
    </SafeAreaProvider>
  );
}

function ExpenseTracker() {
  const [expenses, setExpenses] = useState([]);
  const [income, setIncome] = useState([]);
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
  const [tab, setTab] = useState('dashboard');
  const [prevTab, setPrevTab] = useState('dashboard');
  const slideAnim = useRef(new Animated.Value(1)).current;
  const slideDirRef = useRef(1);
  const tabRef = useRef('dashboard');
  const swipingRef = useRef(false);
  const prevTabRef = useRef('dashboard');
  const swipeDirRef = useRef(0);
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
  const settingsVersionRef = useRef(0);
  // Monotonic sync sequence: bumped whenever a new account-switch load OR a
  // foreground re-sync begins. Each sync captures its value before the network
  // await and bails before applying any setState if the ref has since advanced,
  // so the latest-started sync wins across ALL lanes (not just settings).
  const syncSeqRef = useRef(0);
  const { width: screenWidth } = useWindowDimensions();

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

  // Cache-first load: AsyncStorage renders immediately, then the server's
  // state (with any still-pending local ops re-applied) replaces it. Server
  // settings only carry displayCurrency/monthlyBudget, so they MERGE over the
  // local settings — theme, language and category budgets are device-local.
  useEffect(() => {
    let active = true;
    // A new account-switch load supersedes any in-flight sync.
    const seq = (syncSeqRef.current += 1);
    setDataUser(null);
    if (!userId) {
      // Signed out: drop the previous account's data from memory.
      setExpenses([]);
      setIncome([]);
      setGroups([]);
      setSplitExpenses([]);
      setSettings(DEFAULT_SETTINGS);
      return;
    }
    (async () => {
      const [cachedExpenses, cachedIncome, cachedSettings, cachedGroups, cachedSplits] = await Promise.all([
        loadExpenses(userId),
        loadIncome(userId),
        loadSettings(userId),
        loadGroups(userId),
        loadSplitExpenses(userId),
      ]);
      if (!active) return;
      setExpenses(cachedExpenses);
      setIncome(cachedIncome);
      setGroups(cachedGroups);
      setSplitExpenses(cachedSplits);
      setSettings(cachedSettings);
      setDataUser(userId);

      const versionBeforeSync = settingsVersionRef.current;
      const result = await syncWithServer(userId);
      // Bail if a newer load/re-sync started while we were awaiting the network,
      // so a superseded pull can't clobber the latest account's data.
      if (!active || !result || syncSeqRef.current !== seq) return;
      setExpenses(applyPendingOps(userId, result.expenses));
      if (result.income) setIncome(applyPendingIncomeOps(userId, result.income));
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
      if (result.settings && settingsVersionRef.current === versionBeforeSync) {
        setSettings((prev) => {
          const merged = { ...prev, ...result.settings };
          if (!merged.onboardingDone && result.expenses.length > 0) merged.onboardingDone = true;
          return merged;
        });
        // Server row predates the extra settings columns (they pull as unset):
        // seed them from this device's values so budgets/categories reach
        // the server without waiting for the next settings edit.
        if (result.settings.categoryBudgets === undefined) {
          enqueueSettingsPush(userId, { ...settingsRef.current, ...result.settings });
        }
      } else if (!result.settings && result.expenses.length > 0) {
        setSettings((prev) => prev.onboardingDone ? prev : { ...prev, onboardingDone: true });
      }
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
      if (!active || !result || syncSeqRef.current !== seq) return;
      setExpenses(applyPendingOps(userId, result.expenses));
      if (result.income) setIncome(applyPendingIncomeOps(userId, result.income));
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
      if (result.settings && settingsVersionRef.current === versionBeforeSync) {
        setSettings((prev) => ({ ...prev, ...result.settings }));
        // Same migration seeding as the sign-in sync above.
        if (result.settings.categoryBudgets === undefined) {
          enqueueSettingsPush(userId, { ...settingsRef.current, ...result.settings });
        }
      }
    });
    return () => {
      active = false;
      subscription.remove();
    };
  }, [userId]);

  useEffect(() => {
    if (dataUser && dataUser === userId) saveExpenses(dataUser, expenses);
  }, [expenses, dataUser, userId]);

  useEffect(() => {
    if (dataUser && dataUser === userId) saveIncome(dataUser, income);
  }, [income, dataUser, userId]);

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
    // Replaces BOTH expenses and income with sample data — destructive and not
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
    const demoIncome = buildDemoIncome();
    setIncome(demoIncome);
    enqueueIncomeReplace(userId, demoIncome);
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

  const changeTab = useCallback(
    (next) => {
      const cur = tabRef.current;
      if (next === cur) return;
      swipingRef.current = false;
      Keyboard.dismiss();
      slideAnim.stopAnimation();
      slideDirRef.current = TAB_INDEX[next] > TAB_INDEX[cur] ? 1 : -1;
      setPrevTab(cur);
      prevTabRef.current = cur;
      setTab(next);
      tabRef.current = next;
      slideAnim.setValue(0);
      Animated.timing(slideAnim, {
        toValue: 1,
        // The crossfade travels a few px, not a screen width — a slightly
        // shorter run keeps it feeling snappy.
        duration: 260,
        easing: Easing.out(Easing.cubic),
        useNativeDriver: true,
      }).start(() => {
        setPrevTab(next);
      });
    },
    [slideAnim]
  );

  const swipePanResponder = useMemo(() => PanResponder.create({
    onStartShouldSetPanResponder: () => false,
    onMoveShouldSetPanResponder: (_, g) => {
      if (swipingRef.current) return true;
      if (Math.abs(g.dx) > 30 && Math.abs(g.dx) > Math.abs(g.dy) * 2) {
        swipeDirRef.current = g.dx < 0 ? 1 : -1;
        const nextIdx = TAB_INDEX[tabRef.current] + swipeDirRef.current;
        if (nextIdx < 0 || nextIdx > TAB_NAMES.length - 1) return false;
        return true;
      }
      return false;
    },
    onPanResponderGrant: () => {
      const cur = tabRef.current;
      const dir = swipeDirRef.current;
      const nextIdx = TAB_INDEX[cur] + dir;
      if (nextIdx < 0 || nextIdx > TAB_NAMES.length - 1) return;
      swipingRef.current = true;
      Keyboard.dismiss();
      slideDirRef.current = dir;
      prevTabRef.current = cur;
      setPrevTab(cur);
      setTab(TAB_NAMES[nextIdx]);
      tabRef.current = TAB_NAMES[nextIdx];
      slideAnim.setValue(0);
    },
    onPanResponderMove: (_, g) => {
      if (!swipingRef.current) return;
      const progress = Math.min(1, Math.max(0, Math.abs(g.dx) / screenWidth));
      slideAnim.setValue(progress);
    },
    onPanResponderRelease: (_, g) => {
      if (!swipingRef.current) return;
      swipingRef.current = false;
      const progress = Math.abs(g.dx) / screenWidth;
      const velocity = Math.abs(g.vx);
      if (progress > 0.3 || velocity > 0.5) {
        Animated.timing(slideAnim, {
          toValue: 1,
          duration: Math.max(100, 200 * (1 - progress)),
          easing: Easing.out(Easing.cubic),
          useNativeDriver: true,
        }).start(() => {
          setPrevTab(tabRef.current);
        });
      } else {
        const orig = prevTabRef.current;
        Animated.timing(slideAnim, {
          toValue: 0,
          duration: Math.max(100, 200 * progress),
          easing: Easing.out(Easing.cubic),
          useNativeDriver: true,
        }).start(() => {
          setTab(orig);
          tabRef.current = orig;
          setPrevTab(orig);
          slideAnim.setValue(1);
        });
      }
    },
    onPanResponderTerminate: () => {
      if (!swipingRef.current) return;
      swipingRef.current = false;
      const orig = prevTabRef.current;
      setTab(orig);
      tabRef.current = orig;
      setPrevTab(orig);
      slideAnim.setValue(1);
    },
  }), [slideAnim, screenWidth]);

  const screenStyle = (screenTab) => {
    if (prevTab === tab) {
      // The active screen must also win the stacking order, not just be
      // visible: on react-native-web pointerEvents="none" on a hidden screen's
      // container doesn't block its Pressable descendants (they carry an
      // explicit pointer-events:auto), so a later-in-DOM hidden screen (e.g.
      // Insight, mounted last) would swallow taps aimed at the screen below.
      return screenTab === tab ? { opacity: 1, zIndex: 2 } : { opacity: 0, zIndex: 0 };
    }
    const dir = slideDirRef.current;
    // Widgets-only motion: a crossfade plus a small directional glide. The
    // wash is a vertical (row-uniform) gradient, so the glide is invisible
    // on it, and the fixed backdrop behind the screens fills the strip a
    // gliding screen exposes with identical pixels — the background never
    // appears to move, only the widgets swap.
    if (screenTab === tab) {
      return {
        zIndex: 2,
        opacity: slideAnim,
        transform: [
          {
            translateX: slideAnim.interpolate({
              inputRange: [0, 1],
              outputRange: [dir * COPILOT_GLIDE, 0],
            }),
          },
        ],
      };
    }
    if (screenTab === prevTab) {
      return {
        zIndex: 1,
        opacity: slideAnim.interpolate({ inputRange: [0, 1], outputRange: [1, 0] }),
        transform: [
          {
            translateX: slideAnim.interpolate({
              inputRange: [0, 1],
              outputRange: [0, -dir * COPILOT_GLIDE],
            }),
          },
        ],
      };
    }
    return { opacity: 0, zIndex: 0 };
  };

  const signOut = useCallback(async () => {
    const confirmed = await confirmDestructive({
      title: translate(language, 'acct.signOut'),
      body: translate(language, 'acct.signOutBody'),
      confirmLabel: translate(language, 'acct.signOut'),
      cancelLabel: translate(language, 'common.cancel'),
    });
    if (!confirmed) return;
    setOverlay(null);
    // best-effort push of anything still queued on ALL FOUR lanes (each lane
    // has its own queue: expenses, income, groups, splits).
    await Promise.all([
      flush(userId),
      flushIncome(userId),
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
      enqueueIncomeReplace(wipeUser, []);
      enqueueGroupsReplace(wipeUser, []);
      enqueueSplitsReplace(wipeUser, []);
      await Promise.all([
        flush(wipeUser),
        flushIncome(wipeUser),
        flushGroups(wipeUser),
        flushSplits(wipeUser),
      ]).catch(() => {});
      // The settings row isn't covered by the four lanes — delete it directly
      // (RLS scopes it to this user) so budgets/custom categories/payment
      // methods don't survive the wipe and re-pull on a later sign-in.
      await supabase.from('settings').delete().eq('user_id', wipeUser).then(
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
    setIncome([]);
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
        const updated = { ...g, paymentMethod: 'cash' };
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
        <View style={styles.content} {...swipePanResponder.panHandlers}>
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
});
