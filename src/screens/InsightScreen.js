import { useCallback, useEffect, useMemo, useRef, useState } from 'react';
import { Animated, PanResponder, Pressable, ScrollView, StyleSheet, Text, View } from 'react-native';
import { useSafeAreaInsets } from 'react-native-safe-area-context';
import AddCategoryModal from '../components/AddCategoryModal';
import CurrencyPicker from '../components/CurrencyPicker';
import CurrencyPill from '../components/CurrencyPill';
import EmptyState from '../components/EmptyState';
import HeaderGlow from '../components/HeaderGlow';
import MonthSelector from '../components/MonthSelector';
import { TAB_BAR_HEIGHT } from '../components/TabBar';
import { fonts, spacing, radius, useTheme, cardShadow } from '../theme';
import { useT } from '../i18n';
import { formatMoney, formatMoneyShort, shiftMonthKey } from '../format';
import { getCurrency } from '../currency';
import { getCategoryLabel } from '../categories';
import { budgetZoneTone } from '../budget';
import { HIcon } from '../icons';

// The Insight tab: the budget view compressed into two cards. A "Budget" card
// with a compact horizontal bar gauge (the old BudgetGauge donut was retired)
// plus the display-currency pill and "Edit budgets" on its header; below it a
// merged "Categories" card — a single-column list of clean category rows (name
// + month amount over an indented budget progress bar, led by a tinted icon
// circle; the old packed two-column tiles and their MoM delta were retired)
// with an "External" subsection. Rows reorder by long-press drag (the
// breakdown page's drag-reorder — persisted in device-local
// settings.categoryOrder). The card header's add pill (and tapping any row)
// opens AddCategoryModal, so category management — including editing/deleting
// presets — lives here.
export default function InsightScreen({
  loaded,
  hasExpenses,
  displayCurrency,
  monthlyBudget,
  categoryBudgets,
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
  // This page's month selection (the ‹ month › selector under the title) —
  // scopes the budget gauge and every category tile. Owned locally: each tab's
  // month is independent of the others'.
  const [monthKey, setMonthKey] = useState(currentMonthKey);
  const shiftMonth = (dir) => setMonthKey((key) => shiftMonthKey(key, dir));

  // The selected month's per-category totals (byMonth folds split shares in,
  // matching derive's current-month totals); {} for a month with no data so
  // every tile honestly shows 0.
  const totalsByCategory = useMemo(
    () => months.find((m) => m.key === monthKey)?.byCategory ?? {},
    [months, monthKey]
  );
  // Month-over-month deltas compare the selected month to the one before it.
  const prevMonth = useMemo(() => {
    const prevKey = shiftMonthKey(monthKey, -1);
    return months.find((m) => m.key === prevKey) ?? { key: prevKey, total: 0, byCategory: {} };
  }, [months, monthKey]);

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
      <HeaderGlow id="insightHeaderGlow" />
      <ScrollView
        contentContainerStyle={[styles.content, { paddingBottom: spacing.xl + TAB_BAR_HEIGHT + insets.bottom }]}
        showsVerticalScrollIndicator={false}
        scrollEnabled={scrollEnabled}
      >
        <Text style={styles.title}>{t('insight.title')}</Text>

        <MonthSelector
          monthKey={monthKey}
          currentMonthKey={currentMonthKey}
          onShift={shiftMonth}
          style={styles.monthSelector}
        />

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

// The Budget card body, in the Split summary card's design language: a
// centered remaining (or over-by) hero figure, a two-segment spent/remaining
// proportion bar, then two tinted stat tiles (Spent in the budget-zone tone
// with % used, Budget in the accent tone) with toned icon chips.
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
      {/* Toned like the Split page's net-balance figure: the hero number takes
          the budget-zone color, the caption stays muted. */}
      <Text
        style={[styles.gaugeAmount, { color: zoneColor }]}
        numberOfLines={1}
        adjustsFontSizeToFit
      >
        {over ? `-${formatMoney(remaining, displayCurrency)}` : formatMoney(remaining, displayCurrency)}
      </Text>
      <Text style={styles.gaugeCaption}>
        {t(over ? 'budget.overBy' : 'budget.remaining')}
      </Text>
      <View style={styles.gaugeBar}>
        {rounded > 0 && (
          <View
            style={[
              styles.gaugeBarSeg,
              { flex: over ? 1 : Math.min(rounded, budget), backgroundColor: zoneColor },
            ]}
          />
        )}
        {!over && remaining > 0 && (
          <View style={[styles.gaugeBarSeg, { flex: remaining, backgroundColor: colors.background }]} />
        )}
      </View>
      <View style={styles.gaugeTileRow}>
        <GaugeTile
          tone={zoneColor}
          icon="money-send-square"
          value={formatMoneyShort(rounded, displayCurrency)}
          label={t('budget.spentLabel')}
          caption={t('budget.pctUsed', { pct: pctLabel })}
          styles={styles}
        />
        <GaugeTile
          tone={colors.accent}
          icon="wallet-01"
          value={formatMoneyShort(budget, displayCurrency)}
          label={t('budget.title')}
          caption={t('budget.perMonth')}
          styles={styles}
        />
      </View>
    </View>
  );
}

// One tinted half of the Budget card (the Split summary-tile treatment): toned
// amount over its label and caption, with a toned icon chip on the right.
function GaugeTile({ tone, icon, value, label, caption, styles }) {
  return (
    <View style={[styles.gaugeTile, { backgroundColor: `${tone}12` }]}>
      <View style={styles.gaugeTileText}>
        <Text style={[styles.gaugeTileValue, { color: tone }]} numberOfLines={1}>{value}</Text>
        <Text style={styles.gaugeTileLabel} numberOfLines={1}>{label}</Text>
        <Text style={styles.gaugeTileCaption} numberOfLines={1}>{caption}</Text>
      </View>
      <View style={[styles.gaugeTileChip, { backgroundColor: `${tone}1F` }]}>
        <HIcon name={icon} size={18} color={tone} strokeWidth={1.8} />
      </View>
    </View>
  );
}

// Drag-to-reorder list of category rows (the retired breakdown page's grid
// mechanics, unchanged — the nearest-cell drop math doesn't care that cells
// are now full-width rows). Long-press (200ms) arms a drag; the row follows
// the pointer and drops onto the nearest cell, and the new id order is
// persisted via onReorder. Only the visual drop position animates — the
// reorder itself is a state change, mirroring the original implementation.
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
    <View style={styles.catList} {...panResponder.panHandlers}>
      {rows.map((row, i) => (
        <CategoryRow
          key={row.category.id}
          {...row}
          displayCurrency={displayCurrency}
          divider={i > 0}
          onEdit={() => onEditCategory(row.category)}
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

// One category row — the clean list style that replaced the packed widget
// tiles: a small category-tinted icon circle leads a two-line block and
// centers on its full height (the midpoint between the title line and the
// bar), so the name and the progress bar share the same left edge — the bar
// starts at the name, not under the icon. Line 1 is name + month amount
// ("$0" is the placeholder when nothing is recorded yet; danger-toned when
// over budget); line 2 is the budget progress bar with the budget figure at
// its right. The track renders on EVERY row so tracking always reads; without
// a budget it stays an empty strip (and shows no figure) until one is set.
// The MoM delta was dropped in this decluttering. Tapping a row opens the
// edit modal (presets included — edits/deletes are stored as
// overrides/tombstones in customCategories); long-press drags to reorder.
function CategoryRow({
  category,
  budget,
  thisVal,
  displayCurrency,
  divider,
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
  const ratio = hasBudget ? spent / budget : 0;
  const over = hasBudget && spent > budget;
  // Shared zone tone (green/orange/red) — see budgetZoneTone. `over` is kept
  // separately because it also tones the amount text above the bar.
  const zone = budgetZoneTone(ratio, hasBudget, colors);

  const dragStyle = dragging
    ? { transform: pan.getTranslateTransform(), zIndex: 10, elevation: 10, opacity: 0.9 }
    : undefined;

  return (
    <Animated.View onLayout={onLayout} style={[divider && styles.catRowDivider, dragStyle]}>
      <Pressable
        onPress={onEdit}
        onLongPress={onLongPress}
        onPressOut={onPressOut}
        delayLongPress={200}
        accessibilityRole="button"
        style={({ pressed }) => [styles.catRow, pressed && !dragging && styles.catRowPressed]}
      >
        <View style={[styles.catIconBox, { backgroundColor: `${category.color}1A` }]}>
          <HIcon name={category.emoji} size={18} color={category.color} strokeWidth={1.8} />
        </View>
        <View style={styles.catRowBody}>
          <View style={styles.catRowTop}>
            <Text style={styles.catName} numberOfLines={1}>{getCategoryLabel(category, t)}</Text>
            <Text style={[styles.catMonthVal, over && { color: colors.danger }]} numberOfLines={1}>
              {formatMoneyShort(spent, displayCurrency)}
            </Text>
          </View>
          <View style={styles.catRowBottom}>
            <View style={styles.catTrack}>
              <View
                style={[
                  styles.catFill,
                  {
                    width: hasBudget ? `${Math.min(100, ratio * 100)}%` : '0%',
                    backgroundColor: zone,
                  },
                ]}
              />
            </View>
            {hasBudget && (
              <Text style={styles.catBudgetVal} numberOfLines={1}>
                {formatMoneyShort(budget, displayCurrency)}
              </Text>
            )}
          </View>
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
    },
    monthSelector: {
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
    // The Budget card body (the BudgetBar component, Split summary design).
    gaugeAmount: {
      fontFamily: fonts.numBold,
      fontSize: 30,
      fontVariant: ['tabular-nums'],
      letterSpacing: -0.5,
      marginTop: spacing.xs,
      textAlign: 'center',
    },
    gaugeCaption: {
      color: colors.textMuted,
      fontFamily: fonts.regular,
      fontSize: 12,
      marginTop: 1,
      textAlign: 'center',
    },
    // Neutral strip shown under the empty "No budget set" state.
    gaugeTrack: {
      height: 10,
      borderRadius: 5,
      backgroundColor: colors.background,
      overflow: 'hidden',
      marginTop: spacing.sm + 2,
    },
    // Spent-vs-remaining proportion bar: two pill segments whose flex weights
    // are the raw amounts; minWidth keeps a tiny spent sliver visible as a dot.
    gaugeBar: {
      flexDirection: 'row',
      height: 6,
      marginTop: spacing.md,
      gap: 3,
    },
    gaugeBarSeg: {
      borderRadius: 3,
      minWidth: 6,
    },
    gaugeTileRow: {
      flexDirection: 'row',
      gap: spacing.sm,
      marginTop: spacing.md,
    },
    gaugeTile: {
      flex: 1,
      flexDirection: 'row',
      alignItems: 'flex-start',
      justifyContent: 'space-between',
      gap: spacing.xs,
      borderRadius: radius.sm + 2,
      padding: spacing.sm + 4,
    },
    gaugeTileText: {
      flex: 1,
    },
    gaugeTileValue: {
      fontFamily: fonts.numBold,
      fontSize: 17,
      fontVariant: ['tabular-nums'],
    },
    gaugeTileLabel: {
      color: colors.textPrimary,
      fontFamily: fonts.regular,
      fontSize: 12,
      marginTop: 2,
    },
    gaugeTileCaption: {
      color: colors.textMuted,
      fontFamily: fonts.regular,
      fontSize: 11,
      marginTop: 1,
    },
    gaugeTileChip: {
      width: 30,
      height: 30,
      borderRadius: 9,
      alignItems: 'center',
      justifyContent: 'center',
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
      letterSpacing: 0.2,
    },
    dividerAmount: {
      color: colors.textSecondary,
      fontFamily: fonts.numBold,
      fontSize: 12,
      fontVariant: ['tabular-nums'],
    },
    // Single-column category row list (replaced the two-column widget grid).
    catList: {
      marginTop: spacing.xs,
    },
    catRowDivider: {
      borderTopWidth: StyleSheet.hairlineWidth,
      borderTopColor: colors.border,
    },
    catRow: {
      flexDirection: 'row',
      // Centers the icon circle on the two-line block beside it.
      alignItems: 'center',
      gap: spacing.sm + 2,
      paddingVertical: spacing.sm + 2,
    },
    catRowPressed: {
      opacity: 0.7,
    },
    catIconBox: {
      width: 34,
      height: 34,
      borderRadius: 17,
      alignItems: 'center',
      justifyContent: 'center',
    },
    catRowBody: {
      flex: 1,
      gap: spacing.xs + 1,
    },
    catRowTop: {
      flexDirection: 'row',
      alignItems: 'baseline',
      justifyContent: 'space-between',
      gap: spacing.sm,
    },
    catName: {
      color: colors.textPrimary,
      fontFamily: fonts.bold,
      fontSize: 14,
      flexShrink: 1,
    },
    catMonthVal: {
      fontFamily: fonts.numBold,
      fontSize: 14,
      color: colors.textPrimary,
      fontVariant: ['tabular-nums'],
    },
    catRowBottom: {
      flexDirection: 'row',
      alignItems: 'center',
      gap: spacing.sm,
    },
    // Neutral track (matching the Budget card's gauge) with a budget-zone
    // toned fill, instead of the old per-tile tinted track.
    catTrack: {
      flex: 1,
      height: 6,
      borderRadius: 3,
      backgroundColor: colors.background,
      overflow: 'hidden',
    },
    catFill: {
      height: '100%',
      borderRadius: 3,
    },
    catBudgetVal: {
      color: colors.textMuted,
      fontFamily: fonts.numRegular,
      fontSize: 12,
      fontVariant: ['tabular-nums'],
    },
    emptyHint: {
      color: colors.textMuted,
      fontFamily: fonts.regular,
      fontSize: 13,
      textAlign: 'center',
      paddingVertical: spacing.lg,
    },
  });
