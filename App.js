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
  Tinos_400Regular,
  Tinos_700Bold,
} from '@expo-google-fonts/tinos';

import DashboardScreen from './src/screens/DashboardScreen';
import AddEntryScreen from './src/screens/AddEntryScreen';
import ExpenseListScreen from './src/screens/ExpenseListScreen';
import CategoriesScreen from './src/screens/CategoriesScreen';
import AccountScreen from './src/screens/AccountScreen';
import IncomeBalanceScreen from './src/screens/IncomeBalanceScreen';
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
  DEFAULT_SETTINGS,
  LOCAL_USER,
} from './src/storage';
import {
  applyPendingOps,
  applyPendingIncomeOps,
  enqueueExpenseDelete,
  enqueueExpenseUpsert,
  enqueueExpensesReplace,
  enqueueIncomeDelete,
  enqueueIncomeUpsert,
  enqueueIncomeReplace,
  enqueueSettingsPush,
  flush,
  flushIncome,
  syncWithServer,
} from './src/sync';
import { supabase, isSupabaseConfigured } from './src/supabase';
import { buildDemoExpenses, buildDemoIncome } from './src/demoData';
import { redenominateBudgets } from './src/currency';
import { getAllCategories, getRegularAll, getExternalAll } from './src/categories';
import { dateKey } from './src/format';
import { deriveViewData } from './src/derive';
import { ThemeProvider, getTheme, spacing, ACCOUNT_FAB_SIZE } from './src/theme';
import { I18nProvider, translate } from './src/i18n';
import { HIcon } from './src/icons';

const Haptics = Platform.OS === 'web'
  ? { notificationAsync: () => Promise.resolve(), impactAsync: () => Promise.resolve(), NotificationFeedbackType: HapticsModule.NotificationFeedbackType, ImpactFeedbackStyle: HapticsModule.ImpactFeedbackStyle }
  : HapticsModule;

const TAB_INDEX = { dashboard: 0, list: 1, categories: 2, balance: 3 };
const TAB_NAMES = ['dashboard', 'list', 'categories', 'balance'];

// How far the incoming add/income form slides in when toggling entry type.
const ADD_MODE_SLIDE = 36;

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
    Tinos_400Regular,
    Tinos_700Bold,
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
  // The budget editor and account sheets sit over whichever tab is active.
  const [overlay, setOverlay] = useState(null); // null | 'budget' | 'account'
  // The add popup sits over whichever tab is active. A header pill toggles it
  // between adding an expense and adding income; both share this one popup.
  const [addOpen, setAddOpen] = useState(false);
  const [addMode, setAddMode] = useState('expense'); // 'expense' | 'income'
  // Drives the form-swap transition: the incoming form fades + slides into place
  // (expense from the left, income from the right, matching the toggle layout).
  // Reset to 0 synchronously in changeAddMode so the new form's first frame is
  // already off-screen — then the effect below animates it to 1.
  const addModeAnim = useRef(new Animated.Value(1)).current;
  const addModeFirst = useRef(true);
  const [editingExpense, setEditingExpense] = useState(null);
  // The edit-income popup (add income now lives in the shared add popup above).
  const [editingIncome, setEditingIncome] = useState(null);
  // Increments on every successful add; RewardCheck animates on each change.
  const [rewardNonce, setRewardNonce] = useState(0);
  // Today's date as state so the memoized stats roll over at midnight / on app resume.
  const [dayStamp, setDayStamp] = useState(() => dateKey(Date.now()));
  const settingsVersionRef = useRef(0);
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
    setDataUser(null);
    if (!userId) {
      // Signed out: drop the previous account's data from memory.
      setExpenses([]);
      setIncome([]);
      setSettings(DEFAULT_SETTINGS);
      return;
    }
    (async () => {
      const [cachedExpenses, cachedIncome, cachedSettings] = await Promise.all([
        loadExpenses(userId),
        loadIncome(userId),
        loadSettings(userId),
      ]);
      if (!active) return;
      setExpenses(cachedExpenses);
      setIncome(cachedIncome);
      setSettings(cachedSettings);
      setDataUser(userId);

      const versionBeforeSync = settingsVersionRef.current;
      const result = await syncWithServer(userId);
      if (!active || !result) return;
      setExpenses(applyPendingOps(userId, result.expenses));
      if (result.income) setIncome(applyPendingIncomeOps(userId, result.income));
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
      const versionBeforeSync = settingsVersionRef.current;
      const result = await syncWithServer(userId);
      if (!active || !result) return;
      setExpenses(applyPendingOps(userId, result.expenses));
      if (result.income) setIncome(applyPendingIncomeOps(userId, result.income));
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
    if (dataUser && dataUser === userId) saveSettings(dataUser, settings);
  }, [settings, dataUser, userId]);

  // Open the shared add popup in the given mode. Always sets the mode so the
  // popup never reopens on the type the user last switched to mid-session.
  const openAdd = useCallback((mode = 'expense') => {
    addModeAnim.setValue(1); // open fully visible; the modal's own anim plays
    setAddMode(mode);
    setAddOpen(true);
  }, [addModeAnim]);

  // Toggle entry type from the in-popup pill. Snap the entrance value to 0 first
  // so the newly-shown form renders off-screen, then the effect animates it in.
  const changeAddMode = useCallback((next) => {
    addModeAnim.setValue(0);
    setAddMode(next);
  }, [addModeAnim]);

  useEffect(() => {
    if (addModeFirst.current) {
      addModeFirst.current = false;
      return;
    }
    const anim = Animated.timing(addModeAnim, {
      toValue: 1,
      duration: 240,
      easing: Easing.out(Easing.cubic),
      useNativeDriver: true,
    });
    anim.start();
    return () => anim.stop();
  }, [addMode, addModeAnim]);

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

  const addIncome = ({ amount, currency, source, note, createdAt }) => {
    const entry = {
      id: makeId('i'),
      amount,
      currency,
      source,
      note,
      createdAt: createdAt ?? Date.now(),
    };
    setIncome((prev) => [entry, ...prev]);
    enqueueIncomeUpsert(userId, entry);
    setAddOpen(false);
    Haptics.notificationAsync(Haptics.NotificationFeedbackType.Success).catch(() => {});
    AccessibilityInfo.announceForAccessibility(translate(language, 'income.added'));
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
      settingsVersionRef.current += 1;
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
    // best-effort push of anything still queued on BOTH lanes (income is separate)
    await Promise.all([flush(userId), flushIncome(userId)]);
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

  const { sections, months, monthTotal, lastMonthTotal, totalsByCategory, dailyTotals } =
    useMemo(
      () => deriveViewData(expenses, displayCurrency, language, settings.customCategories),
      [expenses, displayCurrency, language, dayStamp, settings.customCategories]
    );

  // Per-month and all-time expense totals (display currency) for the Income
  // screen's balance + chart. Derived from the same `months` aggregate.
  const { expenseByMonth, totalExpenses } = useMemo(() => {
    const map = {};
    let total = 0;
    for (const m of months) {
      map[m.key] = m.total;
      total += m.total;
    }
    return { expenseByMonth: map, totalExpenses: total };
  }, [months]);

  // Most-recent expenses (globally newest-first) for the dashboard activity
  // feed. `sections` is already day-grouped newest-first with newest-first
  // entries inside each day, so a flat slice preserves chronological order.
  const recentExpenses = useMemo(
    () => sections.flatMap((section) => section.data).slice(0, 5),
    [sections]
  );

  const loaded = dataUser != null && dataUser === userId;
  const hasExpenses = expenses.length > 0;
  const currentMonthKey = dayStamp.slice(0, 7);

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
              totalsByCategory={totalsByCategory}
              recentExpenses={recentExpenses}
              categories={allCategories}
              userName={settings.firstName}
              displayCurrency={displayCurrency}
              monthlyBudget={settings.monthlyBudget}
              categoryBudgets={settings.categoryBudgets}
              regularCategories={regularCategories}
              externalCategories={externalCategories}
              onEditBudgets={() => setOverlay('budget')}
              onOpenAccount={() => setOverlay('account')}
              onChangeCurrency={(code) => updateSettings({ displayCurrency: code })}
              onAddPress={() => openAdd('expense')}
              onEditExpense={setEditingExpense}
              onSeeAll={() => changeTab('list')}
              onLoadDemo={loadDemo}
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
              onAddPress={() => openAdd('expense')}
              onLoadDemo={loadDemo}
              onEditPress={setEditingExpense}
            />
          </Animated.View>
          <Animated.View style={[styles.screen, screenStyle('categories')]} pointerEvents={tab === 'categories' ? 'auto' : 'none'}>
            <CategoriesScreen
              months={months}
              currentMonthKey={currentMonthKey}
              loaded={loaded}
              hasExpenses={hasExpenses}
              displayCurrency={displayCurrency}
              allCategories={allCategories}
              categoryOrder={settings.categoryOrder}
              onReorderCategories={reorderCategories}
              onAddPress={() => openAdd('expense')}
              onLoadDemo={loadDemo}
              onAddCategory={addCustomCategory}
              onUpdateCategory={updateCustomCategory}
              onDeleteCategory={deleteCustomCategory}
            />
          </Animated.View>
          <Animated.View style={[styles.screen, screenStyle('balance')]} pointerEvents={tab === 'balance' ? 'auto' : 'none'}>
            <IncomeBalanceScreen
              income={income}
              displayCurrency={displayCurrency}
              expenseByMonth={expenseByMonth}
              totalExpenses={totalExpenses}
              currentMonthKey={currentMonthKey}
              onAddIncome={() => openAdd('income')}
              onEditIncome={setEditingIncome}
              onDeleteIncome={deleteIncome}
            />
          </Animated.View>
        </View>

        {overlay == null && !addOpen && editingExpense == null && editingIncome == null && (
          <Pressable
            onPress={() => setOverlay('account')}
            hitSlop={12}
            accessibilityRole="button"
            accessibilityLabel={translate(language, 'acct.title')}
            style={({ pressed }) => [
              styles.accountFab,
              {
                backgroundColor: theme.card,
                borderColor: theme.widgetBorderColor,
                borderWidth: theme.widgetBorderWidth,
              },
              pressed && styles.accountFabPressed,
            ]}
          >
            <HIcon name="settings-01" size={22} color={theme.icon} />
          </Pressable>
        )}

        <TabBar
          tab={tab}
          addActive={addOpen}
          onChange={changeTab}
          onAddPress={() => openAdd('expense')}
        />

        {/* Shared add popup. Both forms stay mounted (the hidden one is
            display:none) so a half-typed entry survives toggling type or
            dismissing the popup; the header pill switches addMode with a
            fade + directional slide (changeAddMode + addModeAnim). */}
        <AddExpenseModal visible={addOpen} onClose={() => setAddOpen(false)}>
          <Animated.View
            style={[
              styles.addMode,
              addMode !== 'expense' && styles.addModeHidden,
              {
                opacity: addModeAnim,
                transform: [{ translateX: addModeAnim.interpolate({ inputRange: [0, 1], outputRange: [-ADD_MODE_SLIDE, 0] }) }],
              },
            ]}
          >
            <AddEntryScreen
              mode="expense"
              displayCurrency={displayCurrency}
              categories={allCategories}
              onSubmit={addExpense}
              onClose={() => setAddOpen(false)}
              onChangeType={changeAddMode}
            />
          </Animated.View>
          <Animated.View
            style={[
              styles.addMode,
              addMode !== 'income' && styles.addModeHidden,
              {
                opacity: addModeAnim,
                transform: [{ translateX: addModeAnim.interpolate({ inputRange: [0, 1], outputRange: [ADD_MODE_SLIDE, 0] }) }],
              },
            ]}
          >
            <AddEntryScreen
              mode="income"
              displayCurrency={displayCurrency}
              onSubmit={addIncome}
              onClose={() => setAddOpen(false)}
              onChangeType={changeAddMode}
            />
          </Animated.View>
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
  // Wrappers for the two forms inside the shared add popup. The inactive one is
  // collapsed with display:none; flexShrink lets the active card respect the
  // modal's maxHeight so its inner ScrollView can scroll.
  addMode: {
    flexShrink: 1,
  },
  addModeHidden: {
    display: 'none',
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
