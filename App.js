import { useCallback, useEffect, useMemo, useState } from 'react';
import { AppState, Pressable, SectionList, StyleSheet, Text, View } from 'react-native';
import { SafeAreaProvider, SafeAreaView, useSafeAreaInsets } from 'react-native-safe-area-context';
import { StatusBar } from 'expo-status-bar';
import * as Haptics from 'expo-haptics';

import SummaryHeader from './src/components/SummaryHeader';
import CategoryBreakdown from './src/components/CategoryBreakdown';
import ExpenseRow from './src/components/ExpenseRow';
import AddExpenseSheet from './src/components/AddExpenseSheet';
import { loadExpenses, saveExpenses } from './src/storage';
import { buildDemoExpenses } from './src/demoData';
import { dateKey, dayLabel, formatMoney } from './src/format';
import { colors, spacing, radius } from './src/theme';

export default function App() {
  return (
    <SafeAreaProvider>
      <ExpenseTracker />
    </SafeAreaProvider>
  );
}

function ExpenseTracker() {
  const [expenses, setExpenses] = useState([]);
  const [loaded, setLoaded] = useState(false);
  const [sheetVisible, setSheetVisible] = useState(false);
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
      setLoaded(true);
    });
  }, []);

  useEffect(() => {
    if (loaded) saveExpenses(expenses);
  }, [expenses, loaded]);

  const addExpense = useCallback(({ amount, note, category }) => {
    const expense = {
      id: `${Date.now()}-${Math.random().toString(36).slice(2, 8)}`,
      amount,
      note,
      category,
      createdAt: Date.now(),
    };
    setExpenses((prev) => [expense, ...prev]);
    setSheetVisible(false);
    Haptics.notificationAsync(Haptics.NotificationFeedbackType.Success).catch(() => {});
  }, []);

  const deleteExpense = useCallback((id) => {
    setExpenses((prev) => prev.filter((e) => e.id !== id));
    Haptics.impactAsync(Haptics.ImpactFeedbackStyle.Medium).catch(() => {});
  }, []);

  const loadDemo = useCallback(() => {
    setExpenses(buildDemoExpenses());
    Haptics.notificationAsync(Haptics.NotificationFeedbackType.Success).catch(() => {});
  }, []);

  const { sections, monthTotal, todayTotal, avgPerDay, totalsByCategory, monthCount } = useMemo(
    () => deriveViewData(expenses),
    [expenses, dayStamp]
  );

  return (
    <SafeAreaView style={styles.safeArea} edges={['top', 'left', 'right']}>
      <StatusBar style="light" />
      <SectionList
        sections={sections}
        keyExtractor={(item) => item.id}
        renderItem={({ item }) => <ExpenseRow expense={item} onDelete={deleteExpense} />}
        renderSectionHeader={({ section }) => (
          <View style={styles.sectionHeader}>
            <Text style={styles.sectionTitle}>{section.title}</Text>
            <Text style={styles.sectionTotal}>{formatMoney(section.total)}</Text>
          </View>
        )}
        ListHeaderComponent={
          <>
            <SummaryHeader
              monthTotal={monthTotal}
              todayTotal={todayTotal}
              count={monthCount}
              avgPerDay={avgPerDay}
            />
            <CategoryBreakdown totalsByCategory={totalsByCategory} />
          </>
        }
        ListEmptyComponent={
          loaded ? (
            <View style={styles.emptyState}>
              <Text style={styles.emptyEmoji}>{'\u{1F4B8}'}</Text>
              <Text style={styles.emptyText}>No expenses yet</Text>
              <Text style={styles.emptyHint}>
                Tap + to add your first expense, or load sample data to explore. Tap any
                expense to delete it.
              </Text>
              <Pressable
                onPress={loadDemo}
                style={({ pressed }) => [styles.demoButton, pressed && styles.demoButtonPressed]}
              >
                <Text style={styles.demoButtonText}>Load demo data</Text>
              </Pressable>
            </View>
          ) : null
        }
        contentContainerStyle={{ paddingBottom: insets.bottom + 96 }}
        stickySectionHeadersEnabled={false}
        showsVerticalScrollIndicator={false}
      />

      <Pressable
        onPress={() => setSheetVisible(true)}
        style={({ pressed }) => [
          styles.fab,
          { bottom: insets.bottom + spacing.lg },
          pressed && styles.fabPressed,
        ]}
        accessibilityLabel="Add expense"
      >
        <Text style={styles.fabIcon}>+</Text>
      </Pressable>

      <AddExpenseSheet
        visible={sheetVisible}
        onClose={() => setSheetVisible(false)}
        onSubmit={addExpense}
      />
    </SafeAreaView>
  );
}

function deriveViewData(expenses) {
  const now = new Date();
  const todayKey = dateKey(now.getTime());
  const monthPrefix = todayKey.slice(0, 7); // YYYY-MM

  let monthTotal = 0;
  let todayTotal = 0;
  let monthCount = 0;
  const totalsByCategory = {};
  const byDay = new Map();

  const sorted = [...expenses].sort((a, b) => b.createdAt - a.createdAt);

  for (const expense of sorted) {
    const key = dateKey(expense.createdAt);
    if (key.startsWith(monthPrefix)) {
      monthTotal += expense.amount;
      monthCount += 1;
      totalsByCategory[expense.category] = (totalsByCategory[expense.category] ?? 0) + expense.amount;
    }
    if (key === todayKey) todayTotal += expense.amount;

    if (!byDay.has(key)) {
      byDay.set(key, { title: dayLabel(expense.createdAt), total: 0, data: [] });
    }
    const day = byDay.get(key);
    day.total += expense.amount;
    day.data.push(expense);
  }

  return {
    sections: [...byDay.values()],
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
  sectionHeader: {
    flexDirection: 'row',
    justifyContent: 'space-between',
    alignItems: 'baseline',
    paddingHorizontal: spacing.md + 4,
    paddingTop: spacing.sm,
    paddingBottom: spacing.sm,
  },
  sectionTitle: {
    color: colors.textSecondary,
    fontSize: 14,
    fontWeight: '700',
  },
  sectionTotal: {
    color: colors.textMuted,
    fontSize: 13,
    fontVariant: ['tabular-nums'],
  },
  emptyState: {
    alignItems: 'center',
    paddingHorizontal: spacing.xl,
    paddingTop: spacing.xl,
  },
  emptyEmoji: {
    fontSize: 56,
    marginBottom: spacing.md,
  },
  emptyText: {
    color: colors.textPrimary,
    fontSize: 20,
    fontWeight: '700',
  },
  emptyHint: {
    color: colors.textSecondary,
    fontSize: 15,
    textAlign: 'center',
    marginTop: spacing.sm,
    lineHeight: 21,
  },
  demoButton: {
    marginTop: spacing.lg,
    backgroundColor: colors.card,
    borderRadius: radius.md,
    paddingHorizontal: spacing.lg,
    paddingVertical: spacing.sm + 4,
  },
  demoButtonPressed: {
    backgroundColor: colors.cardPressed,
  },
  demoButtonText: {
    color: colors.accent,
    fontSize: 16,
    fontWeight: '700',
  },
  fab: {
    position: 'absolute',
    right: spacing.lg,
    width: 60,
    height: 60,
    borderRadius: 30,
    backgroundColor: colors.accent,
    alignItems: 'center',
    justifyContent: 'center',
    shadowColor: '#000',
    shadowOpacity: 0.35,
    shadowRadius: 10,
    shadowOffset: { width: 0, height: 4 },
    elevation: 8,
  },
  fabPressed: {
    backgroundColor: colors.accentDark,
  },
  fabIcon: {
    color: '#06281C',
    fontSize: 34,
    fontWeight: '600',
    marginTop: -2,
  },
});
