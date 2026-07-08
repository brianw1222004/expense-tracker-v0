import React, { useMemo, useState } from 'react';
import { Pressable, ScrollView, StyleSheet, Text, View } from 'react-native';
import { useSafeAreaInsets } from 'react-native-safe-area-context';
import AddCategoryModal from '../components/AddCategoryModal';
import CurrencyPicker from '../components/CurrencyPicker';
import CurrencyPill from '../components/CurrencyPill';
import EmptyState from '../components/EmptyState';
import { TAB_BAR_HEIGHT } from '../components/TabBar';
import { fonts, spacing, radius, useTheme, cardShadow } from '../theme';
import { useT } from '../i18n';
import { formatMoney, formatMoneyShort, shiftMonthKey } from '../format';
import { getCurrency } from '../currency';
import { getCategoryLabel } from '../categories';
import { HIcon } from '../icons';

// The Insight tab: the budget view compressed into two cards. A "Budget" card
// with a compact horizontal bar gauge (the old BudgetGauge donut was retired)
// plus the display-currency pill and "Edit budgets" on its header; below it a
// merged "Categories" card — a two-column grid of category tiles (month amount,
// month-over-month delta, and a budget progress bar when one is set — the
// widget style of the retired CategoryBreakdownScreen) with an "External"
// subsection. The card header's add pill (and tapping a custom tile) opens
// AddCategoryModal, so custom-category management lives here now.
export default function InsightScreen({
  loaded,
  hasExpenses,
  displayCurrency,
  monthlyBudget,
  categoryBudgets,
  totalsByCategory,
  regularCategories,
  externalCategories,
  months,
  currentMonthKey,
  onEditBudgets,
  onChangeCurrency,
  onAddCategory,
  onUpdateCategory,
  onDeleteCategory,
  onAddPress,
  onLoadDemo,
}) {
  const { colors } = useTheme();
  const t = useT();
  const insets = useSafeAreaInsets();
  const styles = useMemo(() => createStyles(colors), [colors]);
  const [currencyOpen, setCurrencyOpen] = useState(false);
  const [modalCategory, setModalCategory] = useState(null); // null | 'new' | category

  const prevMonth = useMemo(() => {
    const prevKey = shiftMonthKey(currentMonthKey, -1);
    return months.find((m) => m.key === prevKey) ?? { key: prevKey, total: 0, byCategory: {} };
  }, [months, currentMonthKey]);

  const spentOf = (category) => totalsByCategory[category.id] ?? 0;
  const hasBudgetFor = (category) => (categoryBudgets?.[category.id] ?? 0) > 0;

  // One tile per category that has activity (this or last month), a budget, or
  // is user-created (so custom categories stay reachable for editing).
  const tileRows = (categories) =>
    categories
      .map((category) => ({
        category,
        budget: categoryBudgets?.[category.id] ?? 0,
        thisVal: spentOf(category),
        lastVal: prevMonth.byCategory[category.id] ?? 0,
      }))
      .filter((row) => row.thisVal > 0 || row.lastVal > 0 || row.budget > 0 || row.category.custom)
      .sort((a, b) => b.thisVal - a.thisVal || b.lastVal - a.lastVal);

  const regularRows = tileRows(regularCategories);
  const externalRows = tileRows(externalCategories);

  const budgetedCategories = regularCategories.filter(hasBudgetFor);
  const hasBudgets = monthlyBudget > 0 || budgetedCategories.length > 0;

  const regularSpent = regularCategories.reduce((sum, category) => sum + spentOf(category), 0);
  const externalSpent = externalCategories.reduce((sum, category) => sum + spentOf(category), 0);

  const gaugeBudget =
    monthlyBudget > 0
      ? monthlyBudget
      : budgetedCategories.reduce((sum, category) => sum + (categoryBudgets[category.id] ?? 0), 0);
  const gaugeSpent =
    monthlyBudget > 0
      ? regularSpent
      : budgetedCategories.reduce((sum, category) => sum + spentOf(category), 0);

  const handleSaveCategory = (cat) => {
    if (cat._editing) {
      const { _editing, ...cleaned } = cat;
      onUpdateCategory(cleaned);
    } else {
      onAddCategory(cat);
    }
    setModalCategory(null);
  };

  const handleDeleteFromModal = () => {
    if (modalCategory && modalCategory !== 'new') {
      onDeleteCategory(modalCategory.id);
      setModalCategory(null);
    }
  };

  return (
    <View style={styles.container}>
      <ScrollView
        contentContainerStyle={[styles.content, { paddingBottom: spacing.xl + TAB_BAR_HEIGHT + insets.bottom }]}
        showsVerticalScrollIndicator={false}
      >
        <Text style={styles.title}>{t('insight.title')}</Text>

        {/* Hold the budget cards until data has loaded so a cold launch never
            flashes an empty "No budget set" bar before the cache resolves. */}
        {!loaded ? null : !hasExpenses ? (
          <EmptyState onAdd={onAddPress} onLoadDemo={onLoadDemo} colors={colors} t={t} />
        ) : (
          <>
            {/* Budget overview — compact bar gauge of spent vs. budget */}
            <View style={styles.card}>
              <View style={styles.cardHeader}>
                <Text style={styles.cardTitle} numberOfLines={1}>{t('budget.title')}</Text>
                <View style={styles.headerActions}>
                  <CurrencyPill
                    value={displayCurrency}
                    onPress={() => setCurrencyOpen(true)}
                    accessibilityLabel={t('currency.choose')}
                  />
                  <Pressable
                    onPress={onEditBudgets}
                    accessibilityRole="button"
                    hitSlop={10}
                    style={({ pressed }) => [styles.pill, pressed && styles.pillPressed]}
                  >
                    <Text style={styles.pillText}>{t('budget.edit')}</Text>
                  </Pressable>
                </View>
              </View>
              <BudgetBar
                spent={gaugeSpent}
                budget={gaugeBudget}
                displayCurrency={displayCurrency}
                empty={!hasBudgets}
                styles={styles}
                colors={colors}
                t={t}
              />
            </View>

            {/* Categories — spending + budget tiles, external folded in */}
            <View style={styles.card}>
              <View style={styles.cardHeader}>
                <Text style={styles.cardTitle} numberOfLines={1}>{t('cats.title')}</Text>
                <Pressable
                  onPress={() => setModalCategory('new')}
                  accessibilityRole="button"
                  accessibilityLabel={t('cats.addCategory')}
                  hitSlop={10}
                  style={({ pressed }) => [styles.pill, pressed && styles.pillPressed]}
                >
                  <HIcon name="plus-sign" size={13} color={colors.accent} />
                  <Text style={styles.pillText}>{t('cats.addCategory')}</Text>
                </Pressable>
              </View>

              {regularRows.length === 0 && externalRows.length === 0 ? (
                <Text style={styles.emptyHint}>{t('cats.emptyHint')}</Text>
              ) : (
                <>
                  <View style={styles.catGrid}>
                    {regularRows.map((row) => (
                      <CategoryTile
                        key={row.category.id}
                        {...row}
                        displayCurrency={displayCurrency}
                        onEdit={row.category.custom ? () => setModalCategory(row.category) : undefined}
                        styles={styles}
                        colors={colors}
                        t={t}
                      />
                    ))}
                  </View>

                  {(externalRows.length > 0 || externalSpent > 0) && (
                    <>
                      <View style={styles.dividerRow}>
                        <Text style={styles.dividerLabel}>{t('budget.externalTotal')}</Text>
                        <Text style={styles.dividerAmount}>
                          {formatMoneyShort(externalSpent, displayCurrency)}
                        </Text>
                      </View>
                      <View style={styles.catGrid}>
                        {externalRows.map((row) => (
                          <CategoryTile
                            key={row.category.id}
                            {...row}
                            displayCurrency={displayCurrency}
                            onEdit={row.category.custom ? () => setModalCategory(row.category) : undefined}
                            styles={styles}
                            colors={colors}
                            t={t}
                          />
                        ))}
                      </View>
                    </>
                  )}
                </>
              )}
            </View>
          </>
        )}
      </ScrollView>

      <CurrencyPicker
        visible={currencyOpen}
        value={displayCurrency}
        onSelect={(code) => {
          onChangeCurrency(code);
          setCurrencyOpen(false);
        }}
        onClose={() => setCurrencyOpen(false)}
      />

      <AddCategoryModal
        visible={modalCategory != null}
        editingCategory={modalCategory !== 'new' ? modalCategory : null}
        onClose={() => setModalCategory(null)}
        onSave={handleSaveCategory}
        onDelete={handleDeleteFromModal}
        colors={colors}
        t={t}
      />
    </View>
  );
}

// Compact horizontal replacement for the old BudgetGauge donut: remaining (or
// over-by) figure with % used beside it, a slim zone-colored progress bar and
// the spent-of-budget line — same semantics at a third of the height.
function BudgetBar({ spent, budget, displayCurrency, empty, styles, colors, t }) {
  if (empty) {
    return (
      <View>
        <View style={styles.gaugeEmptyRow}>
          <HIcon name="circle-dashed" size={18} color={colors.icon} />
          <Text style={styles.gaugeEmptyText}>{t('budget.noBudget')}</Text>
        </View>
        <View style={styles.gaugeTrack} />
      </View>
    );
  }

  const factor = 10 ** getCurrency(displayCurrency).decimals;
  const rounded = Math.round(spent * factor) / factor;
  const ratio = budget > 0 ? rounded / budget : 0;
  const over = rounded > budget;
  const zoneColor = over ? colors.danger : ratio >= 0.75 ? colors.warning : colors.success;
  const remaining = over ? rounded - budget : budget - rounded;
  const pctLabel = ratio > 9.99 ? '>999%' : `${Math.round(ratio * 100)}%`;

  return (
    <View>
      <View style={styles.gaugeTopRow}>
        <Text
          style={[styles.gaugeAmount, { color: over ? colors.danger : colors.textPrimary }]}
          numberOfLines={1}
          adjustsFontSizeToFit
        >
          {over ? `-${formatMoney(remaining, displayCurrency)}` : formatMoney(remaining, displayCurrency)}
        </Text>
        <Text style={[styles.gaugePct, { color: zoneColor }]}>{pctLabel}</Text>
      </View>
      <Text style={[styles.gaugeCaption, { color: over ? colors.danger : colors.textMuted }]}>
        {t(over ? 'budget.overBy' : 'budget.remaining')}
      </Text>
      <View style={styles.gaugeTrack}>
        <View
          style={[
            styles.gaugeFill,
            { width: `${Math.min(100, ratio * 100)}%`, backgroundColor: zoneColor },
          ]}
        />
      </View>
      <Text style={styles.gaugeSpentLine}>
        {t('budget.spentOf', {
          spent: formatMoney(rounded, displayCurrency),
          budget: formatMoney(budget, displayCurrency),
        })}
      </Text>
    </View>
  );
}

// One category widget tile — the visual carried over from the retired breakdown
// page: tinted cell with a color-keyed left edge, icon box, month amount and
// month-over-month delta (up = red, down = green, "new" when last month was
// empty). Budgeted categories add "/ budget" to the amount and a progress bar
// along the tile's bottom. Custom categories open the edit modal on tap.
const CategoryTile = React.memo(function CategoryTile({
  category,
  budget,
  thisVal,
  lastVal,
  displayCurrency,
  onEdit,
  styles,
  colors,
  t,
}) {
  const factor = 10 ** getCurrency(displayCurrency).decimals;
  const spent = Math.round(thisVal * factor) / factor;
  const hasBudget = budget > 0;
  const over = hasBudget && spent > budget;
  const hasActivity = thisVal > 0 || lastVal > 0;
  const delta = lastVal > 0 ? ((thisVal - lastVal) / lastVal) * 100 : null;

  return (
    <Pressable
      onPress={onEdit}
      disabled={!onEdit}
      accessibilityRole={onEdit ? 'button' : undefined}
      style={({ pressed }) => [
        styles.catTile,
        { backgroundColor: `${category.color}0A`, borderLeftColor: `${category.color}33` },
        pressed && onEdit && styles.catTilePressed,
      ]}
    >
      <View style={styles.catTileInner}>
        <View style={[styles.catIconBox, { backgroundColor: `${category.color}20` }]}>
          <HIcon name={category.emoji} size={22} color={category.color} />
        </View>
        <View style={styles.catContent}>
          <Text style={styles.catName} numberOfLines={1}>{getCategoryLabel(category, t)}</Text>
          {(hasActivity || hasBudget) && (
            <Text
              style={[styles.catMonthVal, over && { color: colors.danger }]}
              numberOfLines={1}
            >
              {formatMoneyShort(spent, displayCurrency)}
              {hasBudget && (
                <Text style={styles.catBudgetVal}>
                  {' / '}{formatMoneyShort(budget, displayCurrency)}
                </Text>
              )}
            </Text>
          )}
          {hasActivity &&
            (delta !== null ? (
              <Text
                style={[
                  styles.catDelta,
                  { color: delta > 0 ? colors.danger : delta < 0 ? colors.success : colors.textMuted },
                ]}
              >
                {delta > 0 ? '+' : ''}{Math.round(delta)}%
              </Text>
            ) : thisVal > 0 ? (
              <Text style={[styles.catDelta, { color: colors.textMuted }]}>{t('cats.newCat')}</Text>
            ) : null)}
        </View>
      </View>
      {hasBudget && (
        <View style={styles.catTileTrack}>
          <View
            style={[
              styles.catTileFill,
              {
                width: `${Math.min(100, (spent / budget) * 100)}%`,
                backgroundColor: over ? colors.danger : category.color,
              },
            ]}
          />
        </View>
      )}
    </Pressable>
  );
});

const createStyles = (colors) =>
  StyleSheet.create({
    container: {
      flex: 1,
      backgroundColor: colors.background,
    },
    content: {
      // flexGrow lets the empty state (flex:1) fill and center below the title
      // when there are no expenses yet.
      flexGrow: 1,
      paddingHorizontal: spacing.md,
      // Centered title keeps content clear of the floating account button at the
      // top-left; paddingBottom is applied inline (adds the safe-area inset).
      paddingTop: spacing.md,
    },
    title: {
      color: colors.textPrimary,
      fontSize: 26,
      fontFamily: fonts.bold,
      textAlign: 'center',
      marginBottom: spacing.md,
    },
    card: {
      backgroundColor: colors.card,
      borderRadius: radius.md,
      padding: spacing.md,
      marginBottom: spacing.md,
      ...cardShadow,
    },
    cardHeader: {
      flexDirection: 'row',
      justifyContent: 'space-between',
      alignItems: 'center',
      marginBottom: spacing.sm,
    },
    headerActions: {
      flexDirection: 'row',
      alignItems: 'center',
      gap: spacing.xs,
      // Never let the action pills shrink; the title ellipsizes instead so a
      // long translation (e.g. Spanish) can't clip a pill off the card.
      flexShrink: 0,
    },
    cardTitle: {
      color: colors.textPrimary,
      fontFamily: fonts.bold,
      fontSize: 15,
      flexShrink: 1,
      marginRight: spacing.sm,
    },
    // Soft accent-tinted pill — the "New group" pill family shared across the
    // app's card headers.
    pill: {
      flexDirection: 'row',
      alignItems: 'center',
      gap: spacing.xs,
      backgroundColor: `${colors.accent}15`,
      borderRadius: 14,
      paddingHorizontal: spacing.sm + 2,
      paddingVertical: spacing.xs + 1,
      flexShrink: 0,
    },
    pillPressed: {
      opacity: 0.6,
    },
    pillText: {
      color: colors.accent,
      fontFamily: fonts.bold,
      fontSize: 13,
    },
    // Compact overall budget bar (the BudgetBar component).
    gaugeTopRow: {
      flexDirection: 'row',
      alignItems: 'flex-end',
      justifyContent: 'space-between',
      marginTop: spacing.xs,
    },
    gaugeAmount: {
      fontFamily: fonts.numBold,
      fontSize: 26,
      fontVariant: ['tabular-nums'],
      flexShrink: 1,
      marginRight: spacing.sm,
    },
    gaugePct: {
      fontFamily: fonts.numBold,
      fontSize: 15,
      fontVariant: ['tabular-nums'],
      marginBottom: 3,
    },
    gaugeCaption: {
      fontFamily: fonts.regular,
      fontSize: 12,
      marginTop: 1,
    },
    gaugeTrack: {
      height: 10,
      borderRadius: 5,
      backgroundColor: colors.background,
      overflow: 'hidden',
      marginTop: spacing.sm + 2,
    },
    gaugeFill: {
      height: '100%',
      borderRadius: 5,
    },
    gaugeSpentLine: {
      color: colors.textSecondary,
      fontFamily: fonts.numRegular,
      fontSize: 12.5,
      fontVariant: ['tabular-nums'],
      marginTop: spacing.sm,
    },
    gaugeEmptyRow: {
      flexDirection: 'row',
      alignItems: 'center',
      gap: spacing.sm,
      marginTop: spacing.xs,
    },
    gaugeEmptyText: {
      color: colors.textMuted,
      fontFamily: fonts.regular,
      fontSize: 13,
    },
    // Subsection divider inside the Categories card (External).
    dividerRow: {
      flexDirection: 'row',
      justifyContent: 'space-between',
      alignItems: 'center',
      marginTop: spacing.md,
      marginBottom: spacing.xs,
      paddingTop: spacing.sm + 2,
      borderTopWidth: StyleSheet.hairlineWidth,
      borderTopColor: colors.border,
    },
    dividerLabel: {
      color: colors.textSecondary,
      fontFamily: fonts.bold,
      fontSize: 11,
      textTransform: 'uppercase',
      letterSpacing: 0.8,
    },
    dividerAmount: {
      color: colors.textSecondary,
      fontFamily: fonts.numBold,
      fontSize: 12,
      fontVariant: ['tabular-nums'],
    },
    // Two-column category widget grid (style carried over from the retired
    // CategoryBreakdownScreen).
    catGrid: {
      flexDirection: 'row',
      flexWrap: 'wrap',
      gap: spacing.sm,
      marginTop: spacing.xs,
    },
    catTile: {
      width: '48.5%',
      borderRadius: radius.sm,
      borderLeftWidth: 3,
    },
    catTilePressed: {
      opacity: 0.8,
    },
    catTileInner: {
      flexDirection: 'row',
      alignItems: 'center',
      padding: spacing.sm,
      gap: spacing.sm,
    },
    catIconBox: {
      width: 40,
      height: 40,
      borderRadius: radius.sm,
      alignItems: 'center',
      justifyContent: 'center',
    },
    catContent: {
      flex: 1,
      alignItems: 'center',
      gap: 3,
    },
    catName: {
      color: colors.textPrimary,
      fontFamily: fonts.bold,
      fontSize: 13,
    },
    catMonthVal: {
      fontFamily: fonts.numBold,
      fontSize: 15,
      color: colors.textPrimary,
      fontVariant: ['tabular-nums'],
    },
    catBudgetVal: {
      fontFamily: fonts.numRegular,
      fontSize: 12,
      color: colors.textMuted,
      fontVariant: ['tabular-nums'],
    },
    catDelta: {
      fontFamily: fonts.numBold,
      fontSize: 12,
      fontVariant: ['tabular-nums'],
    },
    catTileTrack: {
      height: 4,
      borderRadius: 2,
      backgroundColor: colors.background,
      overflow: 'hidden',
      marginHorizontal: spacing.sm,
      marginBottom: spacing.sm,
    },
    catTileFill: {
      height: '100%',
      borderRadius: 2,
    },
    emptyHint: {
      color: colors.textMuted,
      fontFamily: fonts.regular,
      fontSize: 13,
      textAlign: 'center',
      paddingVertical: spacing.lg,
    },
  });
