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
  StyleSheet,
  useWindowDimensions,
  View,
} from 'react-native';
import { SafeAreaProvider, SafeAreaView } from 'react-native-safe-area-context';
import { StatusBar } from 'expo-status-bar';
import * as Haptics from 'expo-haptics';
import {
  useFonts,
  Caladea_400Regular,
  Caladea_700Bold,
} from '@expo-google-fonts/caladea';

import DashboardScreen from './src/screens/DashboardScreen';
import AddExpenseScreen from './src/screens/AddExpenseScreen';
import ExpenseListScreen from './src/screens/ExpenseListScreen';
import CategoriesScreen from './src/screens/CategoriesScreen';
import AccountScreen from './src/screens/AccountScreen';
import BudgetScreen from './src/screens/BudgetScreen';
import AuthScreen from './src/screens/AuthScreen';
import OnboardingScreen from './src/screens/OnboardingScreen';
import TabBar from './src/components/TabBar';
import AddExpenseModal from './src/components/AddExpenseModal';
import RewardCheck from './src/components/RewardCheck';
import {
  loadExpenses,
  saveExpenses,
  loadSettings,
  saveSettings,
  DEFAULT_SETTINGS,
  LOCAL_USER,
} from './src/storage';
import {
  applyPendingOps,
  enqueueExpenseDelete,
  enqueueExpenseUpsert,
  enqueueExpensesReplace,
  enqueueSettingsPush,
  flush,
  syncWithServer,
} from './src/sync';
import { supabase, isSupabaseConfigured } from './src/supabase';
import { buildDemoExpenses } from './src/demoData';
import { convert, getCurrency } from './src/currency';
import { getCategory, setCustomCategories, getAllCategories, getRegularAll, getExternalAll } from './src/categories';
import { dateKey, dayLabel, monthKeyLabel } from './src/format';
import { ThemeProvider, getTheme } from './src/theme';
import { I18nProvider, translate } from './src/i18n';

const TAB_INDEX = { dashboard: 0, list: 1, categories: 2, account: 3 };
const TAB_NAMES = ['dashboard', 'list', 'categories', 'account'];

export default function App() {
  // Caladea is the open, metric-compatible stand-in for Cambria (the requested
  // font is commercial and can't be bundled). Block first paint until loaded so
  // no screen ever renders with the fallback face; on a load error render
  // anyway rather than hanging on a blank screen.
  const [fontsLoaded, fontsError] = useFonts({
    Caladea_400Regular,
    Caladea_700Bold,
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
  // The budget editor sheet sits over whichever tab is active.
  const [overlay, setOverlay] = useState(null); // null | 'budget'
  // The add-expense popup sits over whichever tab is active.
  const [addOpen, setAddOpen] = useState(false);
  const [editingExpense, setEditingExpense] = useState(null);
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
      setSettings(DEFAULT_SETTINGS);
      return;
    }
    (async () => {
      const [cachedExpenses, cachedSettings] = await Promise.all([
        loadExpenses(userId),
        loadSettings(userId),
      ]);
      if (!active) return;
      setExpenses(cachedExpenses);
      setSettings(cachedSettings);
      setDataUser(userId);

      const versionBeforeSync = settingsVersionRef.current;
      const result = await syncWithServer(userId);
      if (!active || !result) return;
      setExpenses(applyPendingOps(userId, result.expenses));
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
    if (dataUser && dataUser === userId) saveSettings(dataUser, settings);
  }, [settings, dataUser, userId]);

  const addExpense = useCallback(
    ({ amount, currency, note, category, createdAt }) => {
      const expense = {
        id: `${Date.now()}-${Math.random().toString(36).slice(2, 8)}`,
        amount,
        currency,
        note,
        category,
        createdAt: createdAt ?? Date.now(),
      };
      setExpenses((prev) => [expense, ...prev]);
      enqueueExpenseUpsert(userId, expense);
      // Close the popup so the success overlay fades back to the main view.
      setAddOpen(false);
      setRewardNonce((n) => n + 1);
      Haptics.notificationAsync(Haptics.NotificationFeedbackType.Success).catch(() => {});
      // The reward check is purely visual; this is the screen-reader equivalent
      // (a status announcement, not a toast/modal — the spec ban doesn't apply).
      AccessibilityInfo.announceForAccessibility(translate(language, 'add.added'));
    },
    [userId, language]
  );

  const updateExpense = useCallback(
    ({ id, amount, currency, note, category, createdAt }) => {
      const updated = { id, amount, currency, note, category, createdAt };
      setExpenses((prev) => prev.map((e) => (e.id === id ? updated : e)));
      enqueueExpenseUpsert(userId, updated);
      setEditingExpense(null);
      Haptics.notificationAsync(Haptics.NotificationFeedbackType.Success).catch(() => {});
    },
    [userId]
  );

  const deleteExpense = useCallback(
    (id) => {
      setExpenses((prev) => prev.filter((e) => e.id !== id));
      enqueueExpenseDelete(userId, id);
      Haptics.impactAsync(Haptics.ImpactFeedbackStyle.Medium).catch(() => {});
    },
    [userId]
  );

  const loadDemo = useCallback(() => {
    const demo = buildDemoExpenses();
    setExpenses(demo);
    enqueueExpensesReplace(userId, demo);
    Haptics.notificationAsync(Haptics.NotificationFeedbackType.Success).catch(() => {});
  }, [userId]);

  const updateSettings = useCallback(
    (patch) => {
      settingsVersionRef.current += 1;
      let pushNext = null;
      setSettings((prev) => {
        const next = { ...prev, ...patch };
        if (patch.displayCurrency && patch.displayCurrency !== prev.displayCurrency) {
          const decimals = getCurrency(patch.displayCurrency).decimals;
          const redenominate = (value) =>
            Number(convert(value, prev.displayCurrency, patch.displayCurrency).toFixed(decimals));
          if (prev.monthlyBudget > 0 && patch.monthlyBudget === undefined) {
            next.monthlyBudget = redenominate(prev.monthlyBudget);
          }
          if (patch.categoryBudgets === undefined) {
            const converted = {};
            for (const [id, value] of Object.entries(prev.categoryBudgets ?? {})) {
              if (value > 0) converted[id] = redenominate(value);
            }
            next.categoryBudgets = converted;
          }
        }
        if (
          next.displayCurrency !== prev.displayCurrency ||
          next.monthlyBudget !== prev.monthlyBudget
        ) {
          pushNext = { displayCurrency: next.displayCurrency, monthlyBudget: next.monthlyBudget };
        }
        return next;
      });
      if (pushNext) enqueueSettingsPush(userId, pushNext);
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
        if (nextIdx < 0 || nextIdx > 3) return false;
        return true;
      }
      return false;
    },
    onPanResponderGrant: () => {
      const cur = tabRef.current;
      const dir = swipeDirRef.current;
      const nextIdx = TAB_INDEX[cur] + dir;
      if (nextIdx < 0 || nextIdx > 3) return;
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
        }).start();
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
      return screenTab === tab ? { opacity: 1 } : { opacity: 0 };
    }
    const dir = slideDirRef.current;
    if (screenTab === tab) {
      return {
        zIndex: 2,
        opacity: slideAnim.interpolate({ inputRange: [0, 0.25, 1], outputRange: [0.3, 1, 1] }),
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
        opacity: slideAnim.interpolate({ inputRange: [0, 0.3, 1], outputRange: [1, 0, 0] }),
        transform: [
          {
            translateX: slideAnim.interpolate({
              inputRange: [0, 1],
              outputRange: [0, -dir * screenWidth * 0.5],
            }),
          },
        ],
      };
    }
    return { opacity: 0 };
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
    await flush(userId); // best-effort push of anything still queued
    // Local scope: clears this device's session even when offline.
    await supabase.auth.signOut({ scope: 'local' }).catch(() => {});
  }, [userId, language]);

  const displayCurrency = settings.displayCurrency;

  // Synchronous — must run before useMemo reads the merged lists, so NOT in useEffect
  setCustomCategories(settings.customCategories);

  const allCategories = useMemo(() => getAllCategories(), [settings.customCategories]);
  const regularCategories = useMemo(() => getRegularAll(), [settings.customCategories]);
  const externalCategories = useMemo(() => getExternalAll(), [settings.customCategories]);

  const modifyCustomCategories = useCallback((fn) => {
    setSettings((prev) => ({
      ...prev,
      customCategories: fn(prev.customCategories || []),
    }));
  }, []);

  const addCustomCategory = useCallback(
    (category) => modifyCustomCategories((cats) => [...cats, category]),
    [modifyCustomCategories]
  );

  const deleteCustomCategory = useCallback(
    (id) => modifyCustomCategories((cats) => cats.filter((c) => c.id !== id)),
    [modifyCustomCategories]
  );

  const updateCustomCategory = useCallback(
    (updated) => modifyCustomCategories((cats) => cats.map((c) => c.id === updated.id ? updated : c)),
    [modifyCustomCategories]
  );

  const { sections, months, monthTotal, todayTotal, avgPerDay, totalsByCategory, monthCount, dailyTotals } =
    useMemo(
      () => deriveViewData(expenses, displayCurrency, language),
      [expenses, displayCurrency, language, dayStamp]
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
              todayTotal={todayTotal}
              monthCount={monthCount}
              avgPerDay={avgPerDay}
              dailyTotals={dailyTotals}
              totalsByCategory={totalsByCategory}
              displayCurrency={displayCurrency}
              monthlyBudget={settings.monthlyBudget}
              categoryBudgets={settings.categoryBudgets}
              regularCategories={regularCategories}
              externalCategories={externalCategories}
              onEditBudgets={() => setOverlay('budget')}
              onAddPress={() => setAddOpen(true)}
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
              onAddPress={() => setAddOpen(true)}
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
              userId={userId}
              onAddPress={() => setAddOpen(true)}
              onLoadDemo={loadDemo}
              onAddCategory={addCustomCategory}
              onUpdateCategory={updateCustomCategory}
              onDeleteCategory={deleteCustomCategory}
            />
          </Animated.View>
          <Animated.View style={[styles.screen, screenStyle('account')]} pointerEvents={tab === 'account' ? 'auto' : 'none'}>
            <AccountScreen
              settings={settings}
              onUpdateSettings={updateSettings}
              accountEmail={session?.user?.email}
              onSignOut={signOut}
            />
          </Animated.View>
        </View>

        <TabBar
          tab={tab}
          addActive={addOpen}
          onChange={changeTab}
          onAddPress={() => setAddOpen(true)}
        />

        <AddExpenseModal visible={addOpen} onClose={() => setAddOpen(false)}>
          <AddExpenseScreen
            displayCurrency={displayCurrency}
            categories={allCategories}
            onSubmit={addExpense}
            onClose={() => setAddOpen(false)}
          />
        </AddExpenseModal>

        <AddExpenseModal visible={editingExpense != null} onClose={() => setEditingExpense(null)}>
          {editingExpense && (
            <AddExpenseScreen
              displayCurrency={displayCurrency}
              categories={allCategories}
              editExpense={editingExpense}
              onSubmit={updateExpense}
              onClose={() => setEditingExpense(null)}
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
          {content}
        </SafeAreaView>
      </I18nProvider>
    </ThemeProvider>
  );
}

// One pass over expenses computes everything the UI shows, all converted to the
// display currency: day sections for the list, current-month stats for the
// dashboard, and per-month aggregates for the categories screen. Labels are
// rendered in the app language, so the memo must re-run when it changes.
function deriveViewData(expenses, displayCurrency, language) {
  const now = new Date();
  const todayKey = dateKey(now.getTime());
  const monthPrefix = todayKey.slice(0, 7); // YYYY-MM

  let monthTotal = 0;
  let todayTotal = 0;
  let monthCount = 0;
  const totalsByCategory = {};
  const byDay = new Map();
  const byMonth = new Map();

  const sorted = [...expenses].sort((a, b) => b.createdAt - a.createdAt);

  for (const expense of sorted) {
    const displayAmount = convert(expense.amount, expense.currency, displayCurrency);
    // Normalize stale stored category ids to their fallback ("Other") here so
    // the breakdown/compare aggregates group them the same way the list does.
    const catId = getCategory(expense.category).id;
    const key = dateKey(expense.createdAt);
    const mKey = key.slice(0, 7);

    if (mKey === monthPrefix) {
      monthTotal += displayAmount;
      monthCount += 1;
      totalsByCategory[catId] = (totalsByCategory[catId] ?? 0) + displayAmount;
    }
    if (key === todayKey) todayTotal += displayAmount;

    if (!byDay.has(key)) {
      byDay.set(key, { title: dayLabel(expense.createdAt, language), total: 0, data: [] });
    }
    const day = byDay.get(key);
    day.total += displayAmount;
    day.data.push({ ...expense, displayAmount });

    if (!byMonth.has(mKey)) {
      byMonth.set(mKey, {
        key: mKey,
        label: monthKeyLabel(mKey, language),
        total: 0,
        count: 0,
        byCategory: {},
      });
    }
    const month = byMonth.get(mKey);
    month.total += displayAmount;
    month.count += 1;
    month.byCategory[catId] = (month.byCategory[catId] ?? 0) + displayAmount;
  }

  const daysInMonth = new Date(now.getFullYear(), now.getMonth() + 1, 0).getDate();
  const dailyTotals = [];
  for (let d = 1; d <= daysInMonth; d++) {
    const dk = `${monthPrefix}-${String(d).padStart(2, '0')}`;
    dailyTotals.push(byDay.has(dk) ? byDay.get(dk).total : 0);
  }

  return {
    sections: [...byDay.values()],
    months: [...byMonth.values()].sort((a, b) => (a.key < b.key ? 1 : -1)),
    monthTotal,
    todayTotal,
    avgPerDay: monthTotal / now.getDate(),
    totalsByCategory,
    monthCount,
    dailyTotals,
  };
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
});
