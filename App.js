import { useCallback, useEffect, useMemo, useState } from 'react';
import {
  AccessibilityInfo,
  Alert,
  AppState,
  Keyboard,
  Platform,
  StyleSheet,
  View,
} from 'react-native';
import { SafeAreaProvider, SafeAreaView } from 'react-native-safe-area-context';
import { StatusBar } from 'expo-status-bar';
import * as Haptics from 'expo-haptics';

import DashboardScreen from './src/screens/DashboardScreen';
import AddExpenseScreen from './src/screens/AddExpenseScreen';
import ExpenseListScreen from './src/screens/ExpenseListScreen';
import CompareScreen from './src/screens/CompareScreen';
import SettingsScreen from './src/screens/SettingsScreen';
import AuthScreen from './src/screens/AuthScreen';
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
import { getCategory } from './src/categories';
import { dateKey, dayLabel, monthKeyLabel } from './src/format';
import { colors } from './src/theme';

export default function App() {
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
  const [tab, setTab] = useState('dashboard'); // 'dashboard' | 'list'
  const [overlay, setOverlay] = useState(null); // null | 'settings' | 'compare'
  // The add-expense popup sits over whichever tab is active.
  const [addOpen, setAddOpen] = useState(false);
  // Increments on every successful add; RewardCheck animates on each change.
  const [rewardNonce, setRewardNonce] = useState(0);
  // Today's date as state so the memoized stats roll over at midnight / on app resume.
  const [dayStamp, setDayStamp] = useState(() => dateKey(Date.now()));

  const userId = isSupabaseConfigured ? session?.user?.id ?? null : LOCAL_USER;

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
  // state (with any still-pending local ops re-applied) replaces it.
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

      const result = await syncWithServer(userId);
      if (!active || !result) return;
      setExpenses(applyPendingOps(userId, result.expenses));
      if (result.settings) setSettings(result.settings);
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
      const result = await syncWithServer(userId);
      if (!active || !result) return;
      setExpenses(applyPendingOps(userId, result.expenses));
      if (result.settings) setSettings(result.settings);
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
      AccessibilityInfo.announceForAccessibility('Expense added');
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
      const next = { ...settings, ...patch };
      // Re-denominate the budget when the display currency changes so "≈ the
      // same money" is preserved instead of the raw number silently meaning less.
      if (
        patch.displayCurrency &&
        patch.displayCurrency !== settings.displayCurrency &&
        settings.monthlyBudget > 0 &&
        patch.monthlyBudget === undefined
      ) {
        const converted = convert(settings.monthlyBudget, settings.displayCurrency, patch.displayCurrency);
        next.monthlyBudget = Number(converted.toFixed(getCurrency(patch.displayCurrency).decimals));
      }
      setSettings(next);
      enqueueSettingsPush(userId, next);
    },
    [settings, userId]
  );

  const signOut = useCallback(async () => {
    // Alert with buttons is a no-op on web; window.confirm is the fallback.
    const confirmed =
      Platform.OS === 'web'
        ? window.confirm('Sign out of this account?')
        : await new Promise((resolve) =>
            Alert.alert(
              'Sign out',
              'Your expenses stay synced to your account.',
              [
                { text: 'Cancel', style: 'cancel', onPress: () => resolve(false) },
                { text: 'Sign out', style: 'destructive', onPress: () => resolve(true) },
              ],
              { cancelable: true, onDismiss: () => resolve(false) }
            )
          );
    if (!confirmed) return;
    setOverlay(null);
    await flush(userId); // best-effort push of anything still queued
    // Local scope: clears this device's session even when offline.
    await supabase.auth.signOut({ scope: 'local' }).catch(() => {});
  }, [userId]);

  const displayCurrency = settings.displayCurrency;

  const { sections, months, monthTotal, todayTotal, avgPerDay, totalsByCategory, monthCount } =
    useMemo(
      () => deriveViewData(expenses, displayCurrency),
      [expenses, displayCurrency, dayStamp]
    );

  const loaded = dataUser != null && dataUser === userId;
  const hasExpenses = expenses.length > 0;

  // Signed out (or session still restoring): the auth screen is the app.
  if (isSupabaseConfigured && !session) {
    return (
      <SafeAreaView style={styles.safeArea} edges={['top', 'left', 'right']}>
        <StatusBar style="light" />
        {sessionLoaded && <AuthScreen />}
      </SafeAreaView>
    );
  }

  return (
    <SafeAreaView style={styles.safeArea} edges={['top', 'left', 'right']}>
      <StatusBar style="light" />

      <View style={styles.content}>
        {/* Both tab screens stay mounted so scroll position survives switching
            tabs; the inactive one is display:none. */}
        <View style={[styles.screen, tab !== 'dashboard' && styles.screenHidden]}>
          <DashboardScreen
            loaded={loaded}
            hasExpenses={hasExpenses}
            monthTotal={monthTotal}
            todayTotal={todayTotal}
            monthCount={monthCount}
            avgPerDay={avgPerDay}
            totalsByCategory={totalsByCategory}
            displayCurrency={displayCurrency}
            monthlyBudget={settings.monthlyBudget}
            onOpenSettings={() => setOverlay('settings')}
            onOpenCompare={() => setOverlay('compare')}
            onLoadDemo={loadDemo}
          />
        </View>
        <View style={[styles.screen, tab !== 'list' && styles.screenHidden]}>
          <ExpenseListScreen
            sections={sections}
            loaded={loaded}
            hasExpenses={hasExpenses}
            displayCurrency={displayCurrency}
            onDelete={deleteExpense}
            onLoadDemo={loadDemo}
          />
        </View>
      </View>

      {/* Hidden tabs keep mounted TextInputs focused — drop the keyboard so it
          can't linger over the next screen. */}
      <TabBar
        tab={tab}
        addActive={addOpen}
        onChange={(next) => {
          Keyboard.dismiss();
          setTab(next);
        }}
        onAddPress={() => setAddOpen(true)}
      />

      {/* Rendered after the TabBar so the backdrop covers it too. */}
      <AddExpenseModal visible={addOpen} onClose={() => setAddOpen(false)}>
        <AddExpenseScreen
          displayCurrency={displayCurrency}
          onSubmit={addExpense}
          onClose={() => setAddOpen(false)}
        />
      </AddExpenseModal>

      <SettingsScreen
        visible={overlay === 'settings'}
        settings={settings}
        onUpdateSettings={updateSettings}
        onClose={() => setOverlay(null)}
        accountEmail={session?.user?.email}
        onSignOut={signOut}
      />
      <CompareScreen
        visible={overlay === 'compare'}
        months={months}
        displayCurrency={displayCurrency}
        onClose={() => setOverlay(null)}
      />

      <RewardCheck trigger={rewardNonce} />
    </SafeAreaView>
  );
}

// One pass over expenses computes everything the UI shows, all converted to the
// display currency: day sections for the list, current-month stats for the
// dashboard, and per-month aggregates for the compare screen.
function deriveViewData(expenses, displayCurrency) {
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
      byDay.set(key, { title: dayLabel(expense.createdAt), total: 0, data: [] });
    }
    const day = byDay.get(key);
    day.total += displayAmount;
    day.data.push({ ...expense, displayAmount });

    if (!byMonth.has(mKey)) {
      byMonth.set(mKey, { key: mKey, label: monthKeyLabel(mKey), total: 0, count: 0, byCategory: {} });
    }
    const month = byMonth.get(mKey);
    month.total += displayAmount;
    month.count += 1;
    month.byCategory[catId] = (month.byCategory[catId] ?? 0) + displayAmount;
  }

  return {
    sections: [...byDay.values()],
    months: [...byMonth.values()].sort((a, b) => (a.key < b.key ? 1 : -1)),
    monthTotal,
    todayTotal,
    avgPerDay: monthTotal / now.getDate(),
    totalsByCategory,
    monthCount,
  };
}

const styles = StyleSheet.create({
  safeArea: {
    flex: 1,
    backgroundColor: colors.background,
  },
  content: {
    flex: 1,
  },
  screen: {
    flex: 1,
  },
  screenHidden: {
    display: 'none',
  },
});
