import { useCallback, useEffect, useMemo, useRef, useState } from 'react';
import {
  AccessibilityInfo,
  Animated,
  AppState,
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
import {
  useFonts,
  Inter_400Regular,
  Inter_500Medium,
  Inter_700Bold,
} from '@expo-google-fonts/inter';

import DashboardScreen from './src/screens/DashboardScreen';
import AddEntryScreen from './src/screens/AddEntryScreen';
import ExpenseListScreen from './src/screens/ExpenseListScreen';
import CategoryBreakdownScreen from './src/screens/CategoryBreakdownScreen';
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
import { getAllCategories, getRegularAll, getExternalAll } from './src/categories';
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
    Inter_400Regular,
    Inter_500Medium,
    Inter_700Bold,
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
  const [overlay, setOverlay] = useState(null); // null | 'budget' | 'account' | 'createGroup' | 'categoryDetail'
  // Split-bills: the open group's id (detail sheet). New bills are added through
  // the shared add popup (addEntryMode='shared'), not a separate sheet.
  const [activeGroupId, setActiveGroupId] = useState(null);
  // Selected month for Home stats + the category breakdown page (shared so
  // navigating in either place keeps the dashboard's month-dependent cards in sync).
  const [homeMonthKey, setHomeMonthKey] = useState(() => dateKey(Date.now()).slice(0, 7));
  // The add popup sits over whichever tab is active. `addEntryMode` toggles its
  // two forms (personal expense vs. shared split bill). `sharedLockedGroupId`,
  // when set, locks the shared form to one group (launched from a group's "Add a
  // bill") and signals to reopen that group's detail sheet when the popup closes.
  const [addOpen, setAddOpen] = useState(false);
  const [addEntryMode, setAddEntryMode] = useState('personal');
  const [sharedLockedGroupId, setSharedLockedGroupId] = useState(null);
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
      // by id — same posture as theme/language/categoryBudgets.
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
      // by id — same posture as theme/language/categoryBudgets.
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

  // Open the shared add popup locked to one group (from GroupDetailScreen's "Add
  // a bill"). Closes the group sheet while the popup is up; closeAdd reopens it.
  const openSharedAddForGroup = useCallback((groupId) => {
    setActiveGroupId(null);
    setSharedLockedGroupId(groupId);
    setAddEntryMode('shared');
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
    setActiveGroupId(group.id);
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
          next.monthlyBudget !== cur.monthlyBudget
        ) {
          // Only the server-synced fields (displayCurrency/monthlyBudget) bump
          // the guard. Device-local-only patches (e.g. categoryOrder from
          // reorderCategories) must NOT bump it, or a concurrent server settings
          // merge from an in-flight sync would be dropped for no reason.
          settingsVersionRef.current += 1;
          enqueueSettingsPush(userId, { displayCurrency: next.displayCurrency, monthlyBudget: next.monthlyBudget });
        }
        return next;
      });
    },
    [userId]
  );

  const reorderCategories = useCallback(
    (ids) => updateSettings({ categoryOrder: ids }),
    [updateSettings]
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
        duration: 300,
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
      return screenTab === tab ? { opacity: 1 } : { opacity: 0, zIndex: 0 };
    }
    const dir = slideDirRef.current;
    if (screenTab === tab) {
      return {
        zIndex: 2,
        opacity: slideAnim.interpolate({ inputRange: [0, 0.15, 1], outputRange: [0.5, 1, 1] }),
        transform: [
          {
            translateX: slideAnim.interpolate({
              inputRange: [0, 1],
              outputRange: [dir * screenWidth, 0],
            }),
          },
        ],
      };
    }
    if (screenTab === prevTab) {
      return {
        zIndex: 1,
        opacity: slideAnim.interpolate({ inputRange: [0, 0.2, 1], outputRange: [1, 0, 0] }),
        transform: [
          {
            translateX: slideAnim.interpolate({
              inputRange: [0, 1],
              outputRange: [0, -dir * screenWidth],
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
    }

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

  const addCustomCategory = (category) => {
    setSettings((prev) => ({
      ...prev,
      customCategories: [...(prev.customCategories || []), category],
    }));
  };

  const deleteCustomCategory = (id) => {
    setSettings((prev) => ({
      ...prev,
      customCategories: (prev.customCategories || []).filter((c) => c.id !== id),
    }));
  };

  const updateCustomCategory = (updated) => {
    setSettings((prev) => ({
      ...prev,
      customCategories: (prev.customCategories || []).map((c) =>
        c.id === updated.id ? updated : c
      ),
    }));
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
    setSettings((prev) => ({
      ...prev,
      customPaymentMethods: [...(prev.customPaymentMethods || []), entry],
    }));
  };

  const removeCustomPaymentMethod = (id) => {
    setSettings((prev) => ({
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

  const {
    sections,
    months,
    totalsByCategory,
    selectedMonthTotal,
    selectedLastMonthTotal,
    selectedDailyTotals,
    hasSpending,
  } =
    useMemo(
      () => deriveViewData(
        expenses,
        displayCurrency,
        language,
        settings.customCategories,
        undefined,
        splitShareItems,
        homeMonthKey
      ),
      // dayStamp is a dep-only trigger: it forces re-derivation at midnight (so
      // month/today stats roll over) but is intentionally NOT passed into
      // deriveViewData (which reads `now` itself). Do not remove it as "unused".
      [expenses, displayCurrency, language, dayStamp, settings.customCategories, splitShareItems, homeMonthKey]
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

  const shiftHomeMonth = useCallback((dir) => {
    setHomeMonthKey((key) => shiftMonthKey(key, dir));
  }, []);

  let content = null;
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
          <Animated.View style={[styles.screen, screenStyle('dashboard')]} pointerEvents={tab === 'dashboard' ? 'auto' : 'none'}>
            <DashboardScreen
              loaded={loaded}
              hasExpenses={hasSpending}
              monthTotal={selectedMonthTotal}
              lastMonthTotal={selectedLastMonthTotal}
              dailyTotals={selectedDailyTotals}
              selectedMonthKey={homeMonthKey}
              userName={settings.firstName}
              displayCurrency={displayCurrency}
              onOpenAccount={() => setOverlay('account')}
              onChangeCurrency={(code) => updateSettings({ displayCurrency: code })}
              onAddPress={() => openAdd()}
              onLoadDemo={loadDemo}
              splitSummary={splitSummary}
              onOpenSplit={() => changeTab('split')}
              categoryMonths={months}
              categoryMonthKey={homeMonthKey}
              currentMonthKey={currentMonthKey}
              allCategories={allCategories}
              onShiftCategoryMonth={shiftHomeMonth}
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
              customPaymentMethods={settings.customPaymentMethods}
              onOpenGroup={setActiveGroupId}
              onCreateGroup={() => setOverlay('createGroup')}
            />
          </Animated.View>
          <Animated.View style={[styles.screen, screenStyle('insight')]} pointerEvents={tab === 'insight' ? 'auto' : 'none'}>
            <InsightScreen
              loaded={loaded}
              hasExpenses={hasSpending}
              displayCurrency={displayCurrency}
              monthlyBudget={settings.monthlyBudget}
              categoryBudgets={settings.categoryBudgets}
              totalsByCategory={totalsByCategory}
              regularCategories={regularCategories}
              externalCategories={externalCategories}
              onEditBudgets={() => setOverlay('budget')}
              onCategoryDetail={() => setOverlay('categoryDetail')}
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
              groups={groups}
              displayCurrency={displayCurrency}
              onAdd={addSplitExpense}
              onCreateGroup={() => { setAddOpen(false); setSharedLockedGroupId(null); setOverlay('createGroup'); }}
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
          onClose={() => setOverlay(null)}
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

        <CategoryBreakdownScreen
          visible={overlay === 'categoryDetail'}
          months={months}
          monthKey={homeMonthKey}
          currentMonthKey={currentMonthKey}
          onShiftMonth={shiftHomeMonth}
          displayCurrency={displayCurrency}
          allCategories={allCategories}
          categoryOrder={settings.categoryOrder}
          onReorderCategories={reorderCategories}
          onAddCategory={addCustomCategory}
          onUpdateCategory={updateCustomCategory}
          onDeleteCategory={deleteCustomCategory}
          onClose={() => setOverlay(null)}
        />

        <RewardCheck trigger={rewardNonce} />
      </>
    );
  }

  return (
    <ThemeProvider themeName={settings.theme}>
      <I18nProvider language={language}>
        <SafeAreaView
          style={[styles.safeArea, { backgroundColor: theme.background }]}
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
