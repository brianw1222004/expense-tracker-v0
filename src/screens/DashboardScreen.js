import { Pressable, ScrollView, StyleSheet, Text, View } from 'react-native';
import SummaryHeader from '../components/SummaryHeader';
import BudgetBar from '../components/BudgetBar';
import CategoryBreakdown from '../components/CategoryBreakdown';
import { colors, spacing, radius } from '../theme';

export default function DashboardScreen({
  loaded,
  hasExpenses,
  monthTotal,
  todayTotal,
  monthCount,
  avgPerDay,
  totalsByCategory,
  displayCurrency,
  monthlyBudget,
  onOpenSettings,
  onOpenCompare,
  onLoadDemo,
}) {
  return (
    <ScrollView
      style={styles.container}
      contentContainerStyle={styles.content}
      showsVerticalScrollIndicator={false}
    >
      <View style={styles.topRow}>
        <Pressable
          onPress={onOpenSettings}
          hitSlop={8}
          accessibilityRole="button"
          accessibilityLabel="Settings"
          style={({ pressed }) => [styles.gearButton, pressed && styles.gearButtonPressed]}
        >
          <Text style={styles.gearIcon}>{'\u{2699}\u{FE0F}'}</Text>
        </Pressable>
      </View>

      <SummaryHeader
        monthTotal={monthTotal}
        todayTotal={todayTotal}
        count={monthCount}
        avgPerDay={avgPerDay}
        displayCurrency={displayCurrency}
      />

      {/* Cards stay hidden until storage has loaded so an empty first frame
          doesn't flash a zeroed budget bar before stored expenses arrive. */}
      {hasExpenses && (
        <>
          <BudgetBar
            monthTotal={monthTotal}
            monthlyBudget={monthlyBudget}
            displayCurrency={displayCurrency}
            onPressSetBudget={onOpenSettings}
          />
          <CategoryBreakdown
            totalsByCategory={totalsByCategory}
            displayCurrency={displayCurrency}
          />
          <Pressable
            onPress={onOpenCompare}
            accessibilityRole="button"
            style={({ pressed }) => [styles.compareCard, pressed && styles.compareCardPressed]}
          >
            <Text style={styles.compareEmoji}>{'\u{1F4CA}'}</Text>
            <View style={styles.compareTextArea}>
              <Text style={styles.compareTitle}>Compare months</Text>
              <Text style={styles.compareHint}>See how this month stacks up</Text>
            </View>
            <Text style={styles.chevron}>{'›'}</Text>
          </Pressable>
        </>
      )}

      {loaded && !hasExpenses && (
        <View style={styles.emptyState}>
          <Text style={styles.emptyEmoji}>{'\u{1F4B8}'}</Text>
          <Text style={styles.emptyTitle}>No expenses yet</Text>
          <Text style={styles.emptyHint}>
            Tap the + button below to add your first expense, or start with some sample data.
          </Text>
          <Pressable
            onPress={onLoadDemo}
            accessibilityRole="button"
            style={({ pressed }) => [styles.demoButton, pressed && styles.demoButtonPressed]}
          >
            <Text style={styles.demoButtonText}>Load demo data</Text>
          </Pressable>
        </View>
      )}
    </ScrollView>
  );
}

const styles = StyleSheet.create({
  container: {
    flex: 1,
  },
  content: {
    flexGrow: 1,
    // The tab bar is in-flow below the screen; this only clears the floating
    // + button's overhang above the bar.
    paddingBottom: spacing.xl,
  },
  topRow: {
    flexDirection: 'row',
    justifyContent: 'flex-end',
    paddingHorizontal: spacing.md,
    paddingTop: spacing.sm,
  },
  gearButton: {
    width: 36,
    height: 36,
    borderRadius: 18,
    backgroundColor: colors.card,
    alignItems: 'center',
    justifyContent: 'center',
  },
  gearButtonPressed: {
    backgroundColor: colors.cardPressed,
  },
  gearIcon: {
    fontSize: 18,
  },
  compareCard: {
    flexDirection: 'row',
    alignItems: 'center',
    backgroundColor: colors.card,
    borderRadius: radius.md,
    padding: spacing.md,
    marginHorizontal: spacing.md,
  },
  compareCardPressed: {
    backgroundColor: colors.cardPressed,
  },
  compareEmoji: {
    fontSize: 22,
    width: 34,
  },
  compareTextArea: {
    flex: 1,
  },
  compareTitle: {
    color: colors.textPrimary,
    fontSize: 16,
    fontWeight: '600',
  },
  compareHint: {
    color: colors.textMuted,
    fontSize: 13,
    marginTop: 2,
  },
  chevron: {
    color: colors.textMuted,
    fontSize: 22,
    fontWeight: '600',
    marginLeft: spacing.sm,
  },
  emptyState: {
    flex: 1,
    alignItems: 'center',
    justifyContent: 'center',
    paddingHorizontal: spacing.xl,
    paddingBottom: spacing.xl,
  },
  emptyEmoji: {
    fontSize: 56,
  },
  emptyTitle: {
    color: colors.textPrimary,
    fontSize: 20,
    fontWeight: '700',
    marginTop: spacing.md,
  },
  emptyHint: {
    color: colors.textSecondary,
    fontSize: 15,
    lineHeight: 22,
    textAlign: 'center',
    marginTop: spacing.sm,
  },
  demoButton: {
    backgroundColor: colors.card,
    borderRadius: radius.md,
    paddingVertical: spacing.sm + 4,
    paddingHorizontal: spacing.lg,
    marginTop: spacing.lg,
  },
  demoButtonPressed: {
    backgroundColor: colors.cardPressed,
  },
  demoButtonText: {
    color: colors.accent,
    fontSize: 16,
    fontWeight: '700',
  },
});
