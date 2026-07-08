import React, { useCallback, useEffect, useMemo, useRef, useState } from 'react';
import { Animated, PanResponder, Pressable, ScrollView, StyleSheet, Text, View } from 'react-native';
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
// subsection. Tiles reorder by long-press drag (the breakdown page's
// drag-reorder, restored — persisted in device-local settings.categoryOrder).
// The card header's add pill (and tapping a custom tile) opens
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
  categoryOrder,
  onReorderCategories,
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
  // Vertical scrolling pauses while a tile drag is live so the grid owns the gesture.
  const [scrollEnabled, setScrollEnabled] = useState(true);

  const prevMonth = useMemo(() => {
    const prevKey = shiftMonthKey(currentMonthKey, -1);
    return months.find((m) => m.key === prevKey) ?? { key: prevKey, total: 0, byCategory: {} };
  }, [months, currentMonthKey]);

  const spentOf = (category) => totalsByCategory[category.id] ?? 0;
  const hasBudgetFor = (category) => (categoryBudgets?.[category.id] ?? 0) > 0;

  // Manual position (from a drag) wins; anything not yet ordered appends after,
  // highest spend first — so the grid is spend-sorted until the user reorders.
  const orderIndex = (id) => {
    const idx = categoryOrder ? categoryOrder.indexOf(id) : -1;
    return idx === -1 ? Number.MAX_SAFE_INTEGER : idx;
  };

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
      .sort(
        (a, b) =>
          orderIndex(a.category.id) - orderIndex(b.category.id) ||
          b.thisVal - a.thisVal ||
          b.lastVal - a.lastVal
      );

  const regularRows = tileRows(regularCategories);
  const externalRows = tileRows(externalCategories);

  // One order array spans both sections; a drag inside one grid re-sequences
  // that section and keeps the other's current order verbatim.
  const reorderRegular = (ids) =>
    onReorderCategories([...ids, ...externalRows.map((row) => row.category.id)]);
  const reorderExternal = (ids) =>
    onReorderCategories([...regularRows.map((row) => row.category.id), ...ids]);

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
        scrollEnabled={scrollEnabled}
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
                  <DraggableTileGrid
                    rows={regularRows}
                    displayCurrency={displayCurrency}
                    onEditCategory={setModalCategory}
                    onReorder={reorderRegular}
                    onDragStateChange={setScrollEnabled}
                    styles={styles}
                    colors={colors}
                    t={t}
                  />

                  {(externalRows.length > 0 || externalSpent > 0) && (
                    <>
                      <View style={styles.dividerRow}>
                        <Text style={styles.dividerLabel}>{t('budget.externalTotal')}</Text>
                        <Text style={styles.dividerAmount}>
                          {formatMoneyShort(externalSpent, displayCurrency)}
                        </Text>
                      </View>
                      <DraggableTileGrid
                        rows={externalRows}
                        displayCurrency={displayCurrency}
                        onEditCategory={setModalCategory}
                        onReorder={reorderExternal}
                        onDragStateChange={setScrollEnabled}
                        styles={styles}
                        colors={colors}
                        t={t}
                      />
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
        initialBudget={
          modalCategory && modalCategory !== 'new'
            ? categoryBudgets?.[modalCategory.id] ?? 0
            : 0
        }
        displayCurrency={displayCurrency}
        monthlyBudget={monthlyBudget}
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

// Drag-to-reorder grid of category tiles (the retired breakdown page's grid,
// restored). Long-press (200ms) arms a drag; the tile follows the pointer and
// drops onto the nearest cell, and the new id order is persisted via
// onReorder. Only the visual drop position animates — the reorder itself is a
// state change, mirroring the original implementation.
function DraggableTileGrid({ rows, displayCurrency, onEditCategory, onReorder, onDragStateChange, styles, colors, t }) {
  const [dragIndex, setDragIndex] = useState(-1);
  const pan = useRef(new Animated.ValueXY()).current;
  const cellLayouts = useRef({});
  const dragOrigin = useRef({ x: 0, y: 0 });
  const dragIndexRef = useRef(-1);
  const panActiveRef = useRef(false);
  const rowsRef = useRef(rows);
  rowsRef.current = rows;

  useEffect(() => { dragIndexRef.current = dragIndex; }, [dragIndex]);

  // Prune stale layout entries when the grid shrinks (e.g. a category loses its
  // last activity). Without this a drop could land on a phantom cell.
  useEffect(() => {
    Object.keys(cellLayouts.current).forEach((key) => {
      if (Number(key) >= rows.length) delete cellLayouts.current[key];
    });
  }, [rows.length]);

  const endDrag = useCallback(() => {
    panActiveRef.current = false;
    Animated.spring(pan, { toValue: { x: 0, y: 0 }, useNativeDriver: false }).start(() => {
      setDragIndex(-1);
      dragIndexRef.current = -1;
      pan.setValue({ x: 0, y: 0 });
      onDragStateChange(true);
    });
  }, [pan, onDragStateChange]);

  const panResponder = useMemo(() => PanResponder.create({
    onStartShouldSetPanResponder: () => false,
    onMoveShouldSetPanResponder: (_, g) => dragIndexRef.current >= 0 && (Math.abs(g.dx) > 2 || Math.abs(g.dy) > 2),
    // Never yield mid-drag: the tab-swipe responder up the tree claims
    // horizontal moves >30px and would otherwise steal the tile.
    onPanResponderTerminationRequest: () => false,
    onPanResponderGrant: () => { panActiveRef.current = true; },
    onPanResponderMove: Animated.event([null, { dx: pan.x, dy: pan.y }], { useNativeDriver: false }),
    onPanResponderRelease: (_, g) => {
      const di = dragIndexRef.current;
      if (di < 0) return;
      const dropX = dragOrigin.current.x + g.dx;
      const dropY = dragOrigin.current.y + g.dy;
      let targetIdx = di;
      let minDist = Infinity;
      const currentLen = rowsRef.current.length;
      Object.entries(cellLayouts.current).forEach(([idx, layout]) => {
        if (Number(idx) >= currentLen) return;
        const cx = layout.x + layout.width / 2;
        const cy = layout.y + layout.height / 2;
        const dist = Math.sqrt((dropX - cx) ** 2 + (dropY - cy) ** 2);
        if (dist < minDist) { minDist = dist; targetIdx = Number(idx); }
      });
      if (targetIdx !== di) {
        const cur = [...rowsRef.current];
        const [moved] = cur.splice(di, 1);
        cur.splice(targetIdx, 0, moved);
        onReorder(cur.map((row) => row.category.id));
      }
      endDrag();
    },
    onPanResponderTerminate: () => endDrag(),
  }), [pan, onReorder, endDrag]);

  const startDrag = useCallback((index) => {
    const layout = cellLayouts.current[index];
    if (layout) {
      dragOrigin.current = { x: layout.x + layout.width / 2, y: layout.y + layout.height / 2 };
    }
    pan.setValue({ x: 0, y: 0 });
    panActiveRef.current = false;
    dragIndexRef.current = index;
    setDragIndex(index);
    onDragStateChange(false);
  }, [pan, onDragStateChange]);

  // A long-press that never moves (armed, then released in place) gets no
  // responder callbacks, so disarm from the tile's press-out instead. The
  // timeout lets a real drag's grant land first.
  const releaseWithoutDrag = useCallback((index) => {
    setTimeout(() => {
      if (dragIndexRef.current === index && !panActiveRef.current) endDrag();
    }, 120);
  }, [endDrag]);

  return (
    <View style={styles.catGrid} {...panResponder.panHandlers}>
      {rows.map((row, i) => (
        <CategoryTile
          key={row.category.id}
          {...row}
          displayCurrency={displayCurrency}
          onEdit={row.category.custom ? () => onEditCategory(row.category) : undefined}
          onLongPress={() => startDrag(i)}
          onPressOut={() => releaseWithoutDrag(i)}
          onLayout={(e) => { cellLayouts.current[i] = e.nativeEvent.layout; }}
          dragging={dragIndex === i}
          pan={pan}
          styles={styles}
          colors={colors}
          t={t}
        />
      ))}
    </View>
  );
}

// One category widget tile — the visual carried over from the retired breakdown
// page: tinted cell with a color-keyed left edge, circular icon chip, month
// amount (always shown — "$0" is the placeholder when nothing is recorded yet)
// and month-over-month delta (up = red, down = green, "new" when last month was
// empty). Every tile carries a progress bar along its bottom — a dimmed
// category-tinted track that fills against the budget as spending accrues;
// without a budget it stays an empty strip, so tracking reads even at $0 spent
// or before a budget is set. Budgeted categories add "/ budget" to the amount.
// Custom categories open the edit modal on tap; long-press drags any tile to
// reorder.
function CategoryTile({
  category,
  budget,
  thisVal,
  lastVal,
  displayCurrency,
  onEdit,
  onLongPress,
  onPressOut,
  onLayout,
  dragging,
  pan,
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

  const dragStyle = dragging
    ? { transform: pan.getTranslateTransform(), zIndex: 10, elevation: 10, opacity: 0.9 }
    : undefined;

  return (
    <Animated.View
      onLayout={onLayout}
      style={[
        styles.catTile,
        { backgroundColor: `${category.color}0A`, borderLeftColor: `${category.color}33` },
        dragStyle,
      ]}
    >
      <Pressable
        onPress={onEdit}
        onLongPress={onLongPress}
        onPressOut={onPressOut}
        delayLongPress={200}
        accessibilityRole="button"
        style={({ pressed }) => [pressed && !dragging && styles.catTilePressed]}
      >
        <View style={styles.catTileInner}>
          <View style={[styles.catIconBox, { backgroundColor: `${category.color}20` }]}>
            <HIcon name={category.emoji} size={22} color={category.color} />
          </View>
          <View style={styles.catContent}>
            <Text style={styles.catName} numberOfLines={1}>{getCategoryLabel(category, t)}</Text>
            {/* Amount and MoM delta share one row under the title. */}
            <View style={styles.catValueRow}>
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
        </View>
        {/* The track renders on EVERY tile so tracking always reads; without a
            budget there's nothing to fill against, so it stays an empty dimmed
            strip until one is set. */}
        <View style={[styles.catTileTrack, { backgroundColor: `${category.color}1A` }]}>
          <View
            style={[
              styles.catTileFill,
              {
                width: hasBudget ? `${Math.min(100, (spent / budget) * 100)}%` : '0%',
                backgroundColor: over ? colors.danger : category.color,
              },
            ]}
          />
        </View>
      </Pressable>
    </Animated.View>
  );
}

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
      borderRadius: 20,
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
    catValueRow: {
      flexDirection: 'row',
      alignItems: 'baseline',
      justifyContent: 'center',
      gap: spacing.xs + 2,
    },
    catMonthVal: {
      fontFamily: fonts.numBold,
      fontSize: 15,
      color: colors.textPrimary,
      fontVariant: ['tabular-nums'],
      flexShrink: 1,
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
    // Track color is set inline (a dimmed tint of the category color) so the
    // empty bar stays visible on the tile's own tinted background.
    catTileTrack: {
      height: 4,
      borderRadius: 2,
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
