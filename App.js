import { useCallback, useEffect, useMemo, useState } from 'react';
import { AccessibilityInfo, AppState, Keyboard, StyleSheet, View } from 'react-native';
import { SafeAreaProvider, SafeAreaView, useSafeAreaInsets } from 'react-native-safe-area-context';
import { StatusBar } from 'expo-status-bar';
import * as Haptics from 'expo-haptics';

import DashboardScreen from './src/screens/DashboardScreen';
import AddExpenseScreen from './src/screens/AddExpenseScreen';
import ExpenseListScreen from './src/screens/ExpenseListScreen';
import CompareScreen from './src/screens/CompareScreen';
import SettingsScreen from './src/screens/SettingsScreen';
import TabBar, { TAB_BAR_HEIGHT } from './src/components/TabBar';
import RewardCheck from './src/components/RewardCheck';
import {
  loadExpenses,
  saveExpenses,
  loadSettings,
  saveSettings,
  DEFAULT_SETTINGS,
} from './src/storage';
import { buildDemoExpenses } from './src/demoData';
import { convert, getCurrency } from './src/currency';
import { getCategory } from './src/categories';
import { dateKey, dayLabel, monthKeyLabel } from './src/format';
import { colors, spacing } from './src/theme';

export default function App() {
  return (
    <SafeAreaProvider>
      <ExpenseTracker />
    </SafeAreaProvider>
  );
}

function ExpenseTracker() {
  const [expenses, setExpenses] = useState([]);
  const [expensesLoaded, setExpensesLoaded] = useState(false);
  const [settings, setSettings] = useState(DEFAULT_SETTINGS);
  const [settingsLoaded, setSettingsLoaded] = useState(false);
  const [tab, setTab] = useState('dashboard'); // 'dashboard' | 'add' | 'list'
  const [overlay, setOverlay] = useState(null); // null | 'settings' | 'compare'
  // Increments on every successful add; RewardCheck animates on each change.
  const [rewardNonce, setRewardNonce] = useState(0);
  // Today's date as state so the memoized stats roll over at midnight / on app resume.
  const [dayStamp, setDayStamp] = useState(() => dateKey(Date.now()));
  const insets = useSafeAreaInsets();

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

  useEffect(() => {
    loadExpenses().then((stored) => {
      setExpenses(stored);
      setExpensesLoaded(true);
    });
    loadSettings().then((stored) => {
      setSettings(stored);
      setSettingsLoaded(true);
    });
  }, []);

  useEffect(() => {
    if (expensesLoaded) saveExpenses(expenses);
  }, [expenses, expensesLoaded]);

  useEffect(() => {
    if (settingsLoaded) saveSettings(settings);
  }, [settings, settingsLoaded]);

  const addExpense = useCallback(({ amount, currency, note, category, createdAt }) => {
    const expense = {
      id: `${Date.now()}-${Math.random().toString(36).slice(2, 8)}`,
      amount,
      currency,
      note,
      category,
      createdAt: createdAt ?? Date.now(),
    };
    setExpenses((prev) => [expense, ...prev]);
    setRewardNonce((n) => n + 1);
    Haptics.notificationAsync(Haptics.NotificationFeedbackType.Success).catch(() => {});
    // The reward check is purely visual; this is the screen-reader equivalent
    // (a status announcement, not a toast/modal — the spec ban doesn't apply).
    AccessibilityInfo.announceForAccessibility('Expense added');
  }, []);

  const deleteExpense = useCallback((id) => {
    setExpenses((prev) => prev.filter((e) => e.id !== id));
    Haptics.impactAsync(Haptics.ImpactFeedbackStyle.Medium).catch(() => {});
  }, []);

  const loadDemo = useCallback(() => {
    setExpenses(buildDemoExpenses());
    Haptics.notificationAsync(Haptics.NotificationFeedbackType.Success).catch(() => {});
  }, []);

  const updateSettings = useCallback((patch) => {
    setSettings((prev) => {
      const next = { ...prev, ...patch };
      // Re-denominate the budget when the display currency changes so "≈ the
      // same money" is preserved instead of the raw number silently meaning less.
      if (
        patch.displayCurrency &&
        patch.displayCurrency !== prev.displayCurrency &&
        prev.monthlyBudget > 0 &&
        patch.monthlyBudget === undefined
      ) {
        const converted = convert(prev.monthlyBudget, prev.displayCurrency, patch.displayCurrency);
        next.monthlyBudget = Number(converted.toFixed(getCurrency(patch.displayCurrency).decimals));
      }
      return next;
    });
  }, []);

  const displayCurrency = settings.displayCurrency;

  const { sections, months, monthTotal, todayTotal, avgPerDay, totalsByCategory, monthCount } =
    useMemo(
      () => deriveViewData(expenses, displayCurrency),
      [expenses, displayCurrency, dayStamp]
    );

  const loaded = expensesLoaded && settingsLoaded;
  const hasExpenses = expenses.length > 0;

  return (
    <SafeAreaView style={styles.safeArea} edges={['top', 'left', 'right']}>
      <StatusBar style="light" />

      <View style={styles.content}>
        {/* All three tab screens stay mounted so a half-typed expense or a scroll
            position survives switching tabs; inactive ones are display:none. */}
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
        <View style={[styles.screen, tab !== 'add' && styles.screenHidden]}>
          <AddExpenseScreen displayCurrency={displayCurrency} onSubmit={addExpense} />
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
        onChange={(next) => {
          Keyboard.dismiss();
          setTab(next);
        }}
      />

      <SettingsScreen
        visible={overlay === 'settings'}
        settings={settings}
        onUpdateSettings={updateSettings}
        onClose={() => setOverlay(null)}
      />
      <CompareScreen
        visible={overlay === 'compare'}
        months={months}
        displayCurrency={displayCurrency}
        onClose={() => setOverlay(null)}
      />

      <RewardCheck
        trigger={rewardNonce}
        bottomOffset={insets.bottom + TAB_BAR_HEIGHT + spacing.lg}
      />
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
