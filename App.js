import { useCallback, useEffect, useMemo, useRef, useState } from 'react';
import {
  AccessibilityInfo,
  Alert,
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
  Lora_400Regular,
  Lora_500Medium,
  Lora_700Bold,
} from '@expo-google-fonts/lora';
import {
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
import AddSplitScreen from './src/screens/AddSplitScreen';
import BudgetScreen from './src/screens/BudgetScreen';
import AuthScreen from './src/screens/AuthScreen';
import OnboardingScreen from './src/screens/OnboardingScreen';
import TabBar, { TAB_BAR_HEIGHT } from './src/components/TabBar';
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
  enqueueIncomeDelete,
  enqueueIncomeUpsert,
  enqueueIncomeReplace,
  enqueueSettingsPush,
  enqueueSplitDelete,
  enqueueSplitUpsert,
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
import { dateKey } from './src/format';
import { deriveViewData } from './src/derive';
import { overallBalance, yourShareAsExpenses, groupBalances, YOU } from './src/splits';
import { ThemeProvider, getTheme, spacing, ACCOUNT_FAB_SIZE } from './src/theme';
import { I18nProvider, translate } from './src/i18n';
import { HIcon } from './src/icons';

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
    Lora_400Regular,
    Lora_500Medium,
    Lora_700Bold,
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
  // Split-bills sheets: the open group's id (detail), and the group a new bill
  // is being added to. Both null = closed.
  const [activeGroupId, setActiveGroupId] = useState(null);
  const [addSplitFor, setAddSplitFor] = useState(null);
  // Selected month for the Dashboard category card + its breakdown page (shared
  // so navigating in either place stays in sync).
  const [catMonthKey, setCatMonthKey] = useState(() => dateKey(Date.now()).slice(0, 7));
  // The add popup sits over whichever tab is active (expenses only).
  const [addOpen, setAddOpen] = useState(false);
  const [editingExpense, setEditingExpense] = useState(null);
  // The edit-income popup (add income now lives in the shared add popup above).
  const [editingIncome, setEditingIncome] = useState(null);
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
      if (result.groups) setGroups(applyPendingGroupOps(userId, result.groups));
      if (result.splits) setSplitExpenses(applyPendingSplitOps(userId, result.splits));
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
      if (result.groups) setGroups(applyPendingGroupOps(userId, result.groups));
      if (result.splits) setSplitExpenses(applyPendingSplitOps(userId, result.splits));
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

  // Open the shared add popup (expenses only).
  const openAdd = useCallback(() => {
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
    // Mirror deleteIncome: close the edit popup if the delete came from it
    // (no-op when deleting from the list, where editingExpense is already null).
    setEditingExpense(null);
    Haptics.impactAsync(Haptics.ImpactFeedbackStyle.Medium).catch(() => {});
  };

  const updateIncome = ({ id, amount, currency, source, note, createdAt }) => {
    const updated = { id, amount, currency, source, note, createdAt };
    setIncome((prev) => prev.map((e) => (e.id === id ? updated : e)));
    enqueueIncomeUpsert(userId, updated);
    setEditingIncome(null);
    Haptics.notificationAsync(Haptics.NotificationFeedbackType.Success).catch(() => {});
  };

  const deleteIncome = (id) => {
    setIncome((prev) => prev.filter((e) => e.id !== id));
    enqueueIncomeDelete(userId, id);
    setEditingIncome(null);
    Haptics.impactAsync(Haptics.ImpactFeedbackStyle.Medium).catch(() => {});
  };

  // --- Split bills (synced to Supabase via groups + splits lanes) ------------
  const createGroup = ({ name, currency, members, paymentMethod }) => {
    const group = {
      id: makeId('g'),
      name,
      currency,
      paymentMethod,
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

  const deleteGroup = (id) => {
    splitExpenses.filter((b) => b.groupId === id).forEach((b) => enqueueSplitDelete(userId, b.id));
    enqueueGroupDelete(userId, id);
    setGroups((prev) => prev.filter((g) => g.id !== id));
    setSplitExpenses((prev) => prev.filter((b) => b.groupId !== id));
    setActiveGroupId(null);
    Haptics.impactAsync(Haptics.ImpactFeedbackStyle.Medium).catch(() => {});
  };

  const addSplitExpense = ({ groupId, description, amount, currency, category, paidBy, mode, shares }) => {
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
      createdAt: Date.now(),
    };
    setSplitExpenses((prev) => [bill, ...prev]);
    enqueueSplitUpsert(userId, bill);
    setAddSplitFor(null);
    Haptics.notificationAsync(Haptics.NotificationFeedbackType.Success).catch(() => {});
  };

  const deleteSplitExpense = (id) => {
    setSplitExpenses((prev) => prev.filter((b) => b.id !== id));
    enqueueSplitDelete(userId, id);
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

  const loadDemo = () => {
    // Replaces BOTH expenses and income with sample data — destructive and
    // not undoable. Confirm on every target (Alert with buttons is a no-op on
    // web, so web uses window.confirm).
    const apply = () => {
      const demo = buildDemoExpenses();
      setExpenses(demo);
      enqueueExpensesReplace(userId, demo);
      const demoIncome = buildDemoIncome();
      setIncome(demoIncome);
      enqueueIncomeReplace(userId, demoIncome);
      Haptics.notificationAsync(Haptics.NotificationFeedbackType.Success).catch(() => {});
    };
    if (Platform.OS === 'web') {
      if (window.confirm(translate(language, 'empty.confirmDemo'))) apply();
      return;
    }
    Alert.alert(
      translate(language, 'empty.confirmDemoTitle'),
      translate(language, 'empty.confirmDemo'),
      [
        { text: translate(language, 'common.cancel'), style: 'cancel' },
        { text: translate(language, 'empty.confirmDemoConfirm'), style: 'destructive', onPress: apply },
      ]
    );
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
    // Alert with buttons is a no-op on web; window.confirm is the fallback.
    const title = translate(language, 'acct.signOut');
    const body = translate(language, 'acct.signOutBody');
    const confirmed =
      Platform.OS === 'web'
        ? window.confirm(`${title}?\n${body}`)
        : await new Promise((resolve) =>
            Alert.alert(
              title,
              body,
              [
                {
                  text: translate(language, 'common.cancel'),
                  style: 'cancel',
                  onPress: () => resolve(false),
                },
                { text: title, style: 'destructive', onPress: () => resolve(true) },
              ],
              { cancelable: true, onDismiss: () => resolve(false) }
            )
          );
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

  // Your share of every split bill, as synthetic spending items. These fold into
  // the dashboard/category/budget aggregates (the user chose "your share counts
  // as spending") but never enter the Expenses list — see deriveViewData.
  const splitShareItems = useMemo(() => yourShareAsExpenses(splitExpenses), [splitExpenses]);

  const { sections, months, monthTotal, lastMonthTotal, totalsByCategory, dailyTotals } =
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
  const addSplitGroup = groups.find((g) => g.id === addSplitFor) ?? null;

  const loaded = dataUser != null && dataUser === userId;
  const hasExpenses = expenses.length > 0;
  const currentMonthKey = dayStamp.slice(0, 7);

  // Resolve the category card/breakdown month, falling back to the current month
  // when the selected month has no spending data (mirrors the old Categories tab).
  const catEffectiveKey = months.some((m) => m.key === catMonthKey) ? catMonthKey : currentMonthKey;
  const shiftCatMonth = useCallback((dir) => {
    setCatMonthKey((key) => {
      const [y, m] = key.split('-').map(Number);
      const d = new Date(y, m - 1 + dir, 1);
      return `${d.getFullYear()}-${String(d.getMonth() + 1).padStart(2, '0')}`;
    });
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
      editingIncome == null &&
      activeGroupId == null &&
      addSplitFor == null;
    content = (
      <>
        <View style={styles.content} {...swipePanResponder.panHandlers}>
          <Animated.View style={[styles.screen, screenStyle('dashboard')]} pointerEvents={tab === 'dashboard' ? 'auto' : 'none'}>
            <DashboardScreen
              loaded={loaded}
              hasExpenses={hasExpenses}
              monthTotal={monthTotal}
              lastMonthTotal={lastMonthTotal}
              dailyTotals={dailyTotals}
              userName={settings.firstName}
              displayCurrency={displayCurrency}
              onOpenAccount={() => setOverlay('account')}
              onChangeCurrency={(code) => updateSettings({ displayCurrency: code })}
              onAddPress={() => openAdd()}
              onLoadDemo={loadDemo}
              splitSummary={splitSummary}
              onOpenSplit={() => changeTab('split')}
              categoryMonths={months}
              categoryMonthKey={catEffectiveKey}
              currentMonthKey={currentMonthKey}
              allCategories={allCategories}
              onShiftCategoryMonth={shiftCatMonth}
              onCategoryDetail={() => setOverlay('categoryDetail')}
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
              onOpenGroup={setActiveGroupId}
              onCreateGroup={() => setOverlay('createGroup')}
            />
          </Animated.View>
          <Animated.View style={[styles.screen, screenStyle('insight')]} pointerEvents={tab === 'insight' ? 'auto' : 'none'}>
            <InsightScreen
              loaded={loaded}
              hasExpenses={hasExpenses}
              displayCurrency={displayCurrency}
              monthlyBudget={settings.monthlyBudget}
              categoryBudgets={settings.categoryBudgets}
              totalsByCategory={totalsByCategory}
              regularCategories={regularCategories}
              externalCategories={externalCategories}
              onEditBudgets={() => setOverlay('budget')}
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

        {chromeVisible && (
          <Pressable
            onPress={() => openAdd()}
            hitSlop={12}
            accessibilityRole="button"
            accessibilityLabel={translate(language, 'tabs.add')}
            accessibilityState={{ expanded: addOpen }}
            style={({ pressed }) => [
              styles.addFab,
              { backgroundColor: theme.accent },
              pressed && styles.addFabPressed,
            ]}
          >
            <HIcon name="plus-sign" size={26} color={theme.onAccent} />
          </Pressable>
        )}

        <TabBar tab={tab} onChange={changeTab} />

        {/* Shared add popup (expenses only). The form stays mounted while the
            popup is closed (AddExpenseModal hides it with display:none) so a
            half-typed entry survives dismissing the popup. */}
        <AddExpenseModal visible={addOpen} onClose={() => setAddOpen(false)}>
          <AddEntryScreen
            mode="expense"
            displayCurrency={displayCurrency}
            categories={allCategories}
            onSubmit={addExpense}
            onClose={() => setAddOpen(false)}
          />
        </AddExpenseModal>

        <AddExpenseModal visible={editingExpense != null} onClose={() => setEditingExpense(null)}>
          {editingExpense && (
            <AddEntryScreen
              mode="expense"
              displayCurrency={displayCurrency}
              categories={allCategories}
              editEntry={editingExpense}
              onSubmit={updateExpense}
              onDelete={deleteExpense}
              onClose={() => setEditingExpense(null)}
            />
          )}
        </AddExpenseModal>

        <AddExpenseModal visible={editingIncome != null} onClose={() => setEditingIncome(null)}>
          {editingIncome && (
            <AddEntryScreen
              mode="income"
              displayCurrency={displayCurrency}
              editEntry={editingIncome}
              onSubmit={updateIncome}
              onDelete={deleteIncome}
              onClose={() => setEditingIncome(null)}
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
          onClose={() => setOverlay(null)}
        />

        <CreateGroupScreen
          visible={overlay === 'createGroup'}
          defaultCurrency={displayCurrency}
          onCreate={createGroup}
          onClose={() => setOverlay(null)}
        />

        <GroupDetailScreen
          visible={activeGroupId != null && addSplitFor == null}
          group={activeGroup}
          splitExpenses={splitExpenses}
          onAddBill={(groupId) => setAddSplitFor(groupId)}
          onDeleteBill={deleteSplitExpense}
          onSettle={settleUp}
          onUpdateGroup={updateGroup}
          onDeleteGroup={deleteGroup}
          onClose={() => setActiveGroupId(null)}
        />

        <AddSplitScreen
          visible={addSplitFor != null}
          group={addSplitGroup}
          allCategories={allCategories}
          onAdd={addSplitExpense}
          onClose={() => setAddSplitFor(null)}
        />

        <CategoryBreakdownScreen
          visible={overlay === 'categoryDetail'}
          months={months}
          monthKey={catEffectiveKey}
          currentMonthKey={currentMonthKey}
          onShiftMonth={shiftCatMonth}
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
  // Floating add button — bottom-right, just above the tab bar (the "+" moved
  // here from the tab bar's center slot). Sits clear of the tab capsule.
  addFab: {
    position: 'absolute',
    right: spacing.lg,
    bottom: TAB_BAR_HEIGHT + spacing.sm,
    width: 56,
    height: 56,
    borderRadius: 28,
    alignItems: 'center',
    justifyContent: 'center',
    zIndex: 10,
    shadowColor: '#000',
    shadowOpacity: 0.25,
    shadowRadius: 8,
    shadowOffset: { width: 0, height: 3 },
    elevation: 8,
  },
  addFabPressed: {
    opacity: 0.85,
  },
});
