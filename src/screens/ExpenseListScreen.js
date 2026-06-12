import { useEffect, useMemo, useState } from 'react';
import { Pressable, ScrollView, SectionList, StyleSheet, Text, View } from 'react-native';
import { colors, spacing, radius } from '../theme';
import { CATEGORIES, getCategory } from '../categories';
import { formatMoney } from '../format';
import ExpenseRow from '../components/ExpenseRow';
import { TAB_BAR_HEIGHT } from '../components/TabBar';

export default function ExpenseListScreen({
  sections,
  loaded,
  hasExpenses,
  displayCurrency,
  onDelete,
  onLoadDemo,
}) {
  const [filter, setFilter] = useState('all'); // 'all' | category id

  // Categories that actually appear in the data, in CATEGORIES order. Stale
  // stored ids are normalized through getCategory so they group under "Other".
  const presentCategories = useMemo(() => {
    const present = new Set();
    for (const section of sections) {
      for (const item of section.data) present.add(getCategory(item.category).id);
    }
    return CATEGORIES.filter((category) => present.has(category.id));
  }, [sections]);

  // The selected category can vanish (its last entry deleted) — fall back to
  // All for the same frame, and actually clear the stale state so the old
  // selection can't spring back to life if the category reappears later.
  const activeFilter =
    filter !== 'all' && !presentCategories.some((c) => c.id === filter) ? 'all' : filter;
  useEffect(() => {
    if (activeFilter !== filter) setFilter('all');
  }, [activeFilter, filter]);

  const filteredSections = useMemo(() => {
    if (activeFilter === 'all') return sections;
    return sections
      .map((section) => {
        const data = section.data.filter(
          (item) => getCategory(item.category).id === activeFilter
        );
        return {
          ...section,
          data,
          total: data.reduce((sum, item) => sum + item.displayAmount, 0),
        };
      })
      .filter((section) => section.data.length > 0);
  }, [sections, activeFilter]);

  if (!loaded) {
    return <View style={styles.container} />;
  }

  if (!hasExpenses) {
    return (
      <View style={[styles.container, styles.emptyState]}>
        <Text style={styles.emptyEmoji}>🧾</Text>
        <Text style={styles.emptyTitle}>No expenses yet</Text>
        <Text style={styles.emptyHint}>
          Tap the + button below to add your first expense, or start with some sample data.
        </Text>
        <Pressable
          onPress={onLoadDemo}
          style={({ pressed }) => [styles.demoButton, pressed && styles.demoButtonPressed]}
        >
          <Text style={styles.demoButtonText}>Load demo data</Text>
        </Pressable>
      </View>
    );
  }

  return (
    <View style={styles.container}>
      <Text style={styles.title}>Expenses</Text>

      <View style={styles.chipsArea}>
        <ScrollView
          horizontal
          showsHorizontalScrollIndicator={false}
          contentContainerStyle={styles.chipRow}
        >
          <FilterChip
            label="All"
            selected={activeFilter === 'all'}
            onPress={() => setFilter('all')}
          />
          {presentCategories.map((category) => (
            <FilterChip
              key={category.id}
              emoji={category.emoji}
              label={category.label}
              color={category.color}
              selected={activeFilter === category.id}
              onPress={() => setFilter(category.id)}
            />
          ))}
        </ScrollView>
      </View>

      {filteredSections.length === 0 ? (
        <View style={styles.noMatch}>
          <Text style={styles.noMatchText}>
            No {getCategory(activeFilter).label.toLowerCase()} expenses yet.
          </Text>
        </View>
      ) : (
        <SectionList
          sections={filteredSections}
          keyExtractor={(item) => item.id}
          renderItem={({ item }) => (
            <ExpenseRow expense={item} displayCurrency={displayCurrency} onDelete={onDelete} />
          )}
          renderSectionHeader={({ section }) => (
            <View style={styles.sectionHeader}>
              <Text style={styles.sectionTitle}>{section.title}</Text>
              <Text style={styles.sectionTotal}>
                {formatMoney(section.total, displayCurrency)}
              </Text>
            </View>
          )}
          stickySectionHeadersEnabled={false}
          contentContainerStyle={styles.listContent}
        />
      )}
    </View>
  );
}

function FilterChip({ emoji, label, color = colors.accent, selected, onPress }) {
  return (
    <Pressable
      onPress={onPress}
      accessibilityState={{ selected }}
      style={({ pressed }) => [
        styles.chip,
        selected && { backgroundColor: `${color}33`, borderColor: color },
        pressed && !selected && styles.chipPressed,
      ]}
    >
      {emoji ? <Text style={styles.chipEmoji}>{emoji}</Text> : null}
      <Text style={[styles.chipLabel, selected && styles.chipLabelSelected]}>{label}</Text>
    </Pressable>
  );
}

const styles = StyleSheet.create({
  container: {
    flex: 1,
  },
  title: {
    color: colors.textPrimary,
    fontSize: 28,
    fontWeight: '800',
    paddingHorizontal: spacing.md,
    paddingTop: spacing.md,
  },
  chipsArea: {
    paddingVertical: spacing.sm + 4,
  },
  chipRow: {
    paddingHorizontal: spacing.md,
    gap: spacing.sm,
  },
  chip: {
    flexDirection: 'row',
    alignItems: 'center',
    backgroundColor: colors.card,
    borderRadius: 20,
    borderWidth: 1,
    borderColor: 'transparent',
    paddingHorizontal: spacing.sm + 4,
    paddingVertical: spacing.sm,
  },
  chipPressed: {
    backgroundColor: colors.cardPressed,
  },
  chipEmoji: {
    fontSize: 16,
    marginRight: 5,
  },
  chipLabel: {
    color: colors.textSecondary,
    fontSize: 14,
    fontWeight: '600',
  },
  chipLabelSelected: {
    color: colors.textPrimary,
  },
  listContent: {
    // The tab bar sits in-flow below the screen, so only the floating + button's
    // ~24px overhang needs clearing — not the bar height itself.
    paddingBottom: spacing.xl,
  },
  sectionHeader: {
    flexDirection: 'row',
    justifyContent: 'space-between',
    alignItems: 'baseline',
    paddingHorizontal: spacing.md,
    paddingTop: spacing.sm,
    paddingBottom: spacing.sm,
  },
  sectionTitle: {
    color: colors.textSecondary,
    fontSize: 13,
    fontWeight: '700',
    textTransform: 'uppercase',
    letterSpacing: 0.8,
  },
  sectionTotal: {
    color: colors.textMuted,
    fontSize: 13,
    fontWeight: '600',
    fontVariant: ['tabular-nums'],
  },
  noMatch: {
    flex: 1,
    alignItems: 'center',
    paddingTop: spacing.xl * 2,
    paddingHorizontal: spacing.lg,
  },
  noMatchText: {
    color: colors.textMuted,
    fontSize: 15,
    textAlign: 'center',
  },
  emptyState: {
    alignItems: 'center',
    justifyContent: 'center',
    paddingHorizontal: spacing.xl,
    paddingBottom: TAB_BAR_HEIGHT,
  },
  emptyEmoji: {
    fontSize: 56,
    marginBottom: spacing.md,
  },
  emptyTitle: {
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
    borderWidth: 1,
    borderColor: colors.border,
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
});
