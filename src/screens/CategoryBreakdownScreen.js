import { useCallback, useEffect, useMemo, useRef, useState } from 'react';
import { Animated, Modal, PanResponder, Pressable, ScrollView, StyleSheet, Switch, Text, TextInput, View } from 'react-native';
import Svg, { Circle, Defs, LinearGradient as SvgLinearGradient, Stop, Rect } from 'react-native-svg';
import { useSafeAreaInsets } from 'react-native-safe-area-context';
import { fonts, spacing, radius, useTheme } from '../theme';
import { useT, useLanguage } from '../i18n';
import { formatMoneyShort, monthKeyLabel, shiftMonthKey } from '../format';
import { getCategoryLabel, EMOJI_OPTIONS, COLOR_OPTIONS, generateCategoryId } from '../categories';
import Sheet from '../components/Sheet';
import { HIcon } from '../icons';

function hslToHex(h, s, l) {
  s /= 100; l /= 100;
  const a = s * Math.min(l, 1 - l);
  const f = n => { const k = (n + h / 30) % 12; return l - a * Math.max(-1, Math.min(k - 3, 9 - k, 1)); };
  return '#' + [f(0), f(8), f(4)].map(x => Math.round(x * 255).toString(16).padStart(2, '0')).join('');
}

const HUE_STOPS = [
  { offset: '0%', color: '#ff0000' },
  { offset: '16.67%', color: '#ffff00' },
  { offset: '33.33%', color: '#00ff00' },
  { offset: '50%', color: '#00ffff' },
  { offset: '66.67%', color: '#0000ff' },
  { offset: '83.33%', color: '#ff00ff' },
  { offset: '100%', color: '#ff0000' },
];

// The per-category spending breakdown — a full-height page (Sheet) opened from
// the Insight page's "More detail" pill. Holds the
// draggable per-category grid (each category's month amount + month-over-month
// delta) and the add/edit-category modal. Month selection is shared with the
// summary card (driven by App.js), so navigating here or there stays in sync.
export default function CategoryBreakdownScreen({
  visible,
  onClose,
  months,
  monthKey,
  currentMonthKey,
  onShiftMonth,
  displayCurrency,
  allCategories,
  categoryOrder,
  onReorderCategories,
  onAddCategory,
  onUpdateCategory,
  onDeleteCategory,
}) {
  const { colors } = useTheme();
  const t = useT();
  const language = useLanguage();
  const insets = useSafeAreaInsets();
  const styles = useMemo(() => createStyles(colors), [colors]);
  const [modalCategory, setModalCategory] = useState(null);
  const [scrollEnabled, setScrollEnabled] = useState(true);

  const viewMonth = useMemo(
    () => months.find((m) => m.key === monthKey) ?? { key: monthKey, total: 0, byCategory: {} },
    [months, monthKey]
  );

  const prevMonthKey = useMemo(() => shiftMonthKey(monthKey, -1), [monthKey]);

  const prevMonth = useMemo(
    () => months.find((m) => m.key === prevMonthKey) ?? { key: prevMonthKey, total: 0, byCategory: {} },
    [months, prevMonthKey]
  );

  const canGoNext = monthKey < currentMonthKey;

  const categoryRows = useMemo(() => {
    const cats = allCategories ?? [];
    return cats
      .map((category) => ({
        category,
        thisVal: viewMonth.byCategory[category.id] ?? 0,
        lastVal: prevMonth.byCategory[category.id] ?? 0,
      }))
      .filter((row) => row.thisVal > 0 || row.lastVal > 0)
      .sort((a, b) => b.thisVal - a.thisVal || b.lastVal - a.lastVal);
  }, [allCategories, viewMonth, prevMonth]);

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
    <Sheet visible={visible} onClose={onClose} showHandle sheetStyle={styles.sheet}>
      <View style={styles.header}>
        <Text style={styles.title}>{t('cats.title')}</Text>
        <Pressable
          onPress={onClose}
          hitSlop={8}
          accessibilityRole="button"
          accessibilityLabel={t('common.close')}
          style={({ pressed }) => [styles.closeBtn, pressed && styles.closeBtnPressed]}
        >
          <HIcon name="cancel-01" size={18} color={colors.icon} />
        </Pressable>
      </View>

      <View style={styles.monthNav}>
        <Pressable onPress={() => onShiftMonth(-1)} hitSlop={12} accessibilityRole="button">
          <HIcon name="chevron-left" size={20} color={colors.icon} />
        </Pressable>
        <Text style={styles.monthLabel}>{monthKeyLabel(monthKey, language)}</Text>
        <Pressable
          onPress={() => onShiftMonth(1)}
          disabled={!canGoNext}
          hitSlop={12}
          accessibilityRole="button"
          style={!canGoNext ? styles.navDisabled : undefined}
        >
          <HIcon name="chevron-right" size={20} color={colors.icon} />
        </Pressable>
      </View>

      <Pressable
        onPress={() => setModalCategory('new')}
        accessibilityRole="button"
        style={({ pressed }) => [styles.addCatButton, pressed && styles.addCatButtonPressed]}
      >
        <Text style={styles.addCatPlus}>+</Text>
        <Text style={styles.addCatText}>{t('cats.addCategory')}</Text>
      </Pressable>

      <ScrollView
        style={styles.scroll}
        showsVerticalScrollIndicator={false}
        contentContainerStyle={[styles.scrollContent, { paddingBottom: spacing.xl + insets.bottom }]}
        scrollEnabled={scrollEnabled}
      >
        <DraggableCatGrid
          categoryRows={categoryRows}
          allCategories={allCategories}
          displayCurrency={displayCurrency}
          order={categoryOrder}
          onReorder={onReorderCategories}
          colors={colors}
          styles={styles}
          t={t}
          onEditCategory={setModalCategory}
          onDragStateChange={setScrollEnabled}
        />

        {categoryRows.length === 0 && !(allCategories ?? []).some((c) => c.custom) && (
          <Text style={styles.noCats}>{t('cats.emptyHint')}</Text>
        )}
      </ScrollView>

      {/* Rendered LAST inside the Sheet so this nested Modal's backdrop paints
          above the parent sheet on react-native-web (DOM render order). */}
      <AddCategoryModal
        visible={modalCategory != null}
        editingCategory={modalCategory !== 'new' ? modalCategory : null}
        onClose={() => setModalCategory(null)}
        onSave={handleSaveCategory}
        onDelete={handleDeleteFromModal}
        colors={colors}
        t={t}
      />
    </Sheet>
  );
}

function DraggableCatGrid({ categoryRows, allCategories, displayCurrency, order, onReorder, colors, styles, t, onEditCategory, onDragStateChange }) {
  const customWithout = useMemo(
    () => (allCategories ?? []).filter((c) => c.custom && !categoryRows.some((r) => r.category.id === c.id)),
    [allCategories, categoryRows]
  );

  const defaultItems = useMemo(() => {
    const spending = categoryRows.map(({ category, thisVal, lastVal }) => ({
      id: category.id, category, thisVal, lastVal,
    }));
    const custom = customWithout.map((cat) => ({
      id: cat.id, category: cat, thisVal: 0, lastVal: 0,
    }));
    return [...spending, ...custom];
  }, [categoryRows, customWithout]);

  const items = useMemo(() => {
    if (!order) return defaultItems;
    const byId = new Map(defaultItems.map((it) => [it.id, it]));
    const ordered = order.filter((id) => byId.has(id)).map((id) => byId.get(id));
    const remaining = defaultItems.filter((it) => !order.includes(it.id));
    return [...ordered, ...remaining];
  }, [defaultItems, order]);

  const saveOrder = useCallback((ids) => {
    onReorder(ids);
  }, [onReorder]);

  const [dragIndex, setDragIndex] = useState(-1);
  const pan = useRef(new Animated.ValueXY()).current;
  const cellLayouts = useRef({});
  const dragOrigin = useRef({ x: 0, y: 0 });
  const dragIndexRef = useRef(-1);
  const itemsRef = useRef(items);
  itemsRef.current = items;

  useEffect(() => { dragIndexRef.current = dragIndex; }, [dragIndex]);

  // Prune stale cell layout entries when the list shrinks (e.g. switching months
  // removes categories that had no spending). Without this, a drop can land on a
  // phantom cell whose index no longer exists in `items`.
  useEffect(() => {
    Object.keys(cellLayouts.current).forEach((key) => {
      if (Number(key) >= items.length) {
        delete cellLayouts.current[key];
      }
    });
  }, [items.length]);

  const endDrag = useCallback(() => {
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
    onPanResponderMove: Animated.event([null, { dx: pan.x, dy: pan.y }], { useNativeDriver: false }),
    onPanResponderRelease: (_, g) => {
      const di = dragIndexRef.current;
      if (di < 0) return;
      const dropX = dragOrigin.current.x + g.dx;
      const dropY = dragOrigin.current.y + g.dy;
      let targetIdx = di;
      let minDist = Infinity;
      const currentLen = itemsRef.current.length;
      Object.entries(cellLayouts.current).forEach(([idx, layout]) => {
        if (Number(idx) >= currentLen) return;
        const cx = layout.x + layout.width / 2;
        const cy = layout.y + layout.height / 2;
        const dist = Math.sqrt((dropX - cx) ** 2 + (dropY - cy) ** 2);
        if (dist < minDist) { minDist = dist; targetIdx = Number(idx); }
      });
      if (targetIdx !== di) {
        const cur = [...itemsRef.current];
        const [moved] = cur.splice(di, 1);
        cur.splice(targetIdx, 0, moved);
        saveOrder(cur.map((it) => it.id));
      }
      endDrag();
    },
    onPanResponderTerminate: () => endDrag(),
  }), [pan, saveOrder, endDrag]);

  const startDrag = useCallback((index) => {
    const layout = cellLayouts.current[index];
    if (layout) {
      dragOrigin.current = { x: layout.x + layout.width / 2, y: layout.y + layout.height / 2 };
    }
    pan.setValue({ x: 0, y: 0 });
    dragIndexRef.current = index;
    setDragIndex(index);
    onDragStateChange(false);
  }, [pan, onDragStateChange]);

  return (
    <View
      style={styles.catGrid}
      {...panResponder.panHandlers}
    >
      {items.map((item, i) => {
        const { category, thisVal, lastVal } = item;
        const isCustom = category.custom;
        const delta = lastVal > 0 ? ((thisVal - lastVal) / lastVal) * 100 : null;
        const isDragging = dragIndex === i;

        const content = (
          <View style={styles.catRowInner}>
            <View style={[styles.catIconBox, { backgroundColor: `${category.color}20` }]}>
              <HIcon name={category.emoji} size={22} color={category.color} />
            </View>
            <View style={styles.catContent}>
              <Text style={styles.catName} numberOfLines={1}>
                {thisVal > 0 || lastVal > 0 ? getCategoryLabel(category, t) : category.label}
              </Text>
              {(thisVal > 0 || lastVal > 0) && (
                <>
                  <Text style={styles.catMonthVal}>{formatMoneyShort(thisVal, displayCurrency)}</Text>
                  {delta !== null ? (
                    <Text style={[styles.catDelta, { color: delta > 0 ? colors.danger : delta < 0 ? colors.success : colors.textMuted }]}>
                      {delta > 0 ? '+' : ''}{Math.round(delta)}%
                    </Text>
                  ) : thisVal > 0 ? (
                    <Text style={[styles.catDelta, { color: colors.textMuted }]}>{t('cats.newCat')}</Text>
                  ) : null}
                </>
              )}
            </View>
          </View>
        );

        const animStyle = isDragging
          ? { transform: pan.getTranslateTransform(), zIndex: 10, elevation: 10, opacity: 0.9 }
          : undefined;

        return (
          <Animated.View
            key={item.id}
            style={[styles.catRow, { backgroundColor: `${category.color}0A`, borderLeftWidth: 3, borderLeftColor: `${category.color}33` }, animStyle]}
            onLayout={(e) => { cellLayouts.current[i] = e.nativeEvent.layout; }}
          >
            {/* Long-press arms drag-to-reorder. NOTE: onLongPress is emulated
                unreliably on react-native-web, so reordering is a native-first
                affordance; tap-to-edit (custom categories) works everywhere. */}
            <Pressable
              onLongPress={() => startDrag(i)}
              onPress={isCustom ? () => onEditCategory(category) : undefined}
              delayLongPress={200}
              accessibilityRole="button"
              style={({ pressed }) => [pressed && !isDragging && styles.catRowPressed]}
            >
              {content}
            </Pressable>
          </Animated.View>
        );
      })}
    </View>
  );
}

function AddCategoryModal({ visible, editingCategory, onClose, onSave, onDelete, colors, t }) {
  const styles = useMemo(() => createModalStyles(colors), [colors]);
  const isEdit = editingCategory != null;
  const [name, setName] = useState('');
  const [emoji, setEmoji] = useState(EMOJI_OPTIONS[0]);
  const [color, setColor] = useState(COLOR_OPTIONS[0]);
  const [external, setExternal] = useState(false);
  const [initialized, setInitialized] = useState(false);
  const [iconPage, setIconPage] = useState(0);
  const [iconGridWidth, setIconGridWidth] = useState(0);
  const [customColorActive, setCustomColorActive] = useState(false);
  const [hue, setHue] = useState(0);
  const sliderWidth = useRef(0);
  const customHexColor = useMemo(() => hslToHex(hue, 80, 50), [hue]);

  // Reset the form each time the modal opens. The `initialized` latch keys off
  // `visible`, which always cycles between opens (the parent Sheet unmounts this
  // tree when closed), so reading `initialized`/`isEdit`/`editingCategory` here
  // without listing them as deps is safe — every reopen re-runs the init branch.
  useEffect(() => {
    if (visible && !initialized) {
      if (isEdit) {
        setName(editingCategory.label);
        setEmoji(editingCategory.emoji);
        setColor(editingCategory.color);
        setExternal(editingCategory.external);
        const isPreset = COLOR_OPTIONS.includes(editingCategory.color);
        setCustomColorActive(!isPreset);
      } else {
        setName('');
        setEmoji(EMOJI_OPTIONS[0]);
        setColor(COLOR_OPTIONS[0]);
        setExternal(false);
        setCustomColorActive(false);
      }
      setHue(0);
      setIconPage(0);
      setInitialized(true);
    }
    if (!visible && initialized) {
      setInitialized(false);
    }
  }, [visible, editingCategory]);

  const ICONS_PER_PAGE = 14;
  const iconPages = useMemo(() => {
    const pages = [];
    for (let i = 0; i < EMOJI_OPTIONS.length; i += ICONS_PER_PAGE) {
      pages.push(EMOJI_OPTIONS.slice(i, i + ICONS_PER_PAGE));
    }
    return pages;
  }, []);

  const onIconScroll = useCallback((e) => {
    const x = e.nativeEvent.contentOffset.x;
    const w = e.nativeEvent.layoutMeasurement.width;
    if (w > 0) setIconPage(Math.round(x / w));
  }, []);

  const onIconGridLayout = useCallback((e) => {
    setIconGridWidth(e.nativeEvent.layout.width);
  }, []);

  const huePanResponder = useMemo(() => PanResponder.create({
    onStartShouldSetPanResponder: () => true,
    onMoveShouldSetPanResponder: () => true,
    onPanResponderGrant: (e) => {
      const x = e.nativeEvent.locationX;
      const w = sliderWidth.current;
      if (w > 0) {
        const newHue = Math.max(0, Math.min(360, (x / w) * 360));
        setHue(newHue);
        setColor(hslToHex(newHue, 80, 50));
      }
    },
    onPanResponderMove: (e) => {
      const x = e.nativeEvent.locationX;
      const w = sliderWidth.current;
      if (w > 0) {
        const newHue = Math.max(0, Math.min(360, (x / w) * 360));
        setHue(newHue);
        setColor(hslToHex(newHue, 80, 50));
      }
    },
  }), []);

  const canSave = name.trim().length > 0;

  const handleSave = () => {
    if (!canSave) return;
    const cat = {
      id: isEdit ? editingCategory.id : generateCategoryId(),
      label: name.trim(),
      emoji,
      color,
      external,
      custom: true,
    };
    if (isEdit) cat._editing = true;
    onSave(cat);
  };

  return (
    <Modal visible={visible} transparent animationType="fade" onRequestClose={onClose}>
      <Pressable style={[StyleSheet.absoluteFill, styles.backdrop]} onPress={onClose} />
      <View style={styles.center} pointerEvents="box-none">
        <View style={styles.card}>
          <View style={styles.header}>
            <Text style={styles.headerTitle}>
              {t(isEdit ? 'cats.editCategory' : 'cats.addCategory')}
            </Text>
            <Pressable
              onPress={onClose}
              hitSlop={8}
              accessibilityRole="button"
              style={({ pressed }) => [styles.closeBtn, pressed && styles.closeBtnPressed]}
            >
              <HIcon name="cancel-01" size={18} color={colors.icon} />
            </Pressable>
          </View>

          <ScrollView keyboardShouldPersistTaps="handled" showsVerticalScrollIndicator={false}>
            <Text style={styles.label}>{t('cats.categoryName')}</Text>
            <TextInput
              style={styles.nameInput}
              value={name}
              onChangeText={setName}
              placeholder={t('cats.categoryName')}
              placeholderTextColor={colors.textMuted}
              maxLength={20}
              keyboardAppearance={colors.keyboardAppearance}
              autoFocus={!isEdit}
            />

            <Text style={styles.label}>{t('cats.pickIcon')}</Text>
            <View onLayout={onIconGridLayout} style={styles.iconGridWrapper}>
              {iconGridWidth > 0 && (
                <ScrollView
                  horizontal
                  pagingEnabled
                  showsHorizontalScrollIndicator={false}
                  onScroll={onIconScroll}
                  scrollEventThrottle={16}
                >
                  {iconPages.map((page, pi) => (
                    <View key={pi} style={[styles.grid, { width: iconGridWidth }]}>
                      {page.map((e) => (
                        <Pressable
                          key={e}
                          onPress={() => setEmoji(e)}
                          style={[styles.gridCell, emoji === e && { backgroundColor: `${color}33`, borderColor: color }]}
                        >
                          <HIcon name={e} size={22} color={emoji === e ? color : colors.icon} />
                        </Pressable>
                      ))}
                    </View>
                  ))}
                </ScrollView>
              )}
            </View>
            {iconPages.length > 1 && (
              <View style={styles.iconPageDots}>
                {iconPages.map((_, i) => (
                  <View
                    key={i}
                    style={[
                      styles.iconPageDot,
                      { backgroundColor: i === iconPage ? colors.accent : colors.border },
                    ]}
                  />
                ))}
              </View>
            )}

            <Text style={styles.label}>{t('cats.pickColor')}</Text>
            <View style={styles.grid}>
              {/* Custom color picker cell */}
              <Pressable
                onPress={() => {
                  setCustomColorActive((prev) => {
                    if (!prev) {
                      setColor(customHexColor);
                    }
                    return !prev;
                  });
                }}
                style={[
                  styles.colorCell,
                  customColorActive
                    ? [{ backgroundColor: customHexColor }, styles.colorCellSelected]
                    : styles.customColorCellRainbow,
                ]}
              >
                {!customColorActive && (
                  <Svg width={28} height={28} viewBox="0 0 28 28">
                    <Defs>
                      <SvgLinearGradient id="rainbowGrad" x1="0" y1="0" x2="1" y2="1">
                        {HUE_STOPS.map((s, i) => (
                          <Stop key={i} offset={s.offset} stopColor={s.color} />
                        ))}
                      </SvgLinearGradient>
                    </Defs>
                    <Circle cx="14" cy="14" r="12" fill="url(#rainbowGrad)" />
                  </Svg>
                )}
              </Pressable>

              {/* Preset color cells */}
              {COLOR_OPTIONS.map((c) => (
                <Pressable
                  key={c}
                  onPress={() => {
                    setCustomColorActive(false);
                    setColor(c);
                  }}
                  style={[styles.colorCell, { backgroundColor: c }, !customColorActive && color === c && styles.colorCellSelected]}
                />
              ))}
            </View>

            {/* Hue slider (visible when custom color is active) */}
            {customColorActive && (
              <View style={styles.hueSliderContainer}>
                <View
                  style={styles.hueSliderTrack}
                  onLayout={(e) => { sliderWidth.current = e.nativeEvent.layout.width; }}
                  {...huePanResponder.panHandlers}
                >
                  <Svg width="100%" height={24} style={styles.hueSliderSvg}>
                    <Defs>
                      <SvgLinearGradient id="hueBarGrad" x1="0" y1="0" x2="1" y2="0">
                        {HUE_STOPS.map((s, i) => (
                          <Stop key={i} offset={s.offset} stopColor={s.color} />
                        ))}
                      </SvgLinearGradient>
                    </Defs>
                    <Rect x="0" y="0" width="100%" height="24" rx="12" fill="url(#hueBarGrad)" />
                  </Svg>
                  <View
                    style={[
                      styles.hueThumb,
                      {
                        left: `${(hue / 360) * 100}%`,
                        backgroundColor: customHexColor,
                      },
                    ]}
                  />
                </View>
              </View>
            )}

            <View style={styles.switchRow}>
              <View style={styles.switchLabel}>
                <Text style={styles.switchText}>{t('cats.external')}</Text>
                <Text style={styles.switchHint}>{t('cats.externalHint')}</Text>
              </View>
              <Switch
                value={external}
                onValueChange={setExternal}
                trackColor={{ false: colors.border, true: colors.accent }}
                thumbColor={colors.onAccent}
              />
            </View>

            <Pressable
              onPress={handleSave}
              disabled={!canSave}
              style={({ pressed }) => [
                styles.saveBtn,
                !canSave && styles.saveBtnDisabled,
                pressed && canSave && styles.saveBtnPressed,
              ]}
            >
              <Text style={styles.saveBtnText}>{t('cats.save')}</Text>
            </Pressable>

            {isEdit && (
              <Pressable
                onPress={onDelete}
                accessibilityRole="button"
                style={({ pressed }) => [styles.deleteBtn, pressed && styles.deleteBtnPressed]}
              >
                <Text style={styles.deleteBtnText}>{t('common.delete')}</Text>
              </Pressable>
            )}
          </ScrollView>
        </View>
      </View>
    </Modal>
  );
}

const createStyles = (colors) =>
  StyleSheet.create({
    sheet: {
      height: '90%',
      paddingHorizontal: spacing.md,
      paddingTop: spacing.sm,
    },
    header: {
      flexDirection: 'row',
      justifyContent: 'space-between',
      alignItems: 'center',
      marginBottom: spacing.sm,
    },
    title: {
      color: colors.textPrimary,
      fontFamily: fonts.bold,
      fontSize: 20,
    },
    closeBtn: {
      width: 30,
      height: 30,
      borderRadius: 15,
      backgroundColor: colors.card,
      alignItems: 'center',
      justifyContent: 'center',
    },
    closeBtnPressed: { backgroundColor: colors.cardPressed },

    monthNav: {
      flexDirection: 'row',
      alignItems: 'center',
      justifyContent: 'center',
      gap: spacing.md,
      marginBottom: spacing.sm,
    },
    navDisabled: { opacity: 0.3 },
    monthLabel: {
      color: colors.textPrimary,
      fontFamily: fonts.bold,
      fontSize: 15,
      minWidth: 100,
      textAlign: 'center',
    },

    addCatButton: {
      flexDirection: 'row',
      alignItems: 'center',
      backgroundColor: colors.card,
      borderRadius: radius.sm,
      paddingHorizontal: spacing.md,
      paddingVertical: spacing.sm + 2,
      borderWidth: 1,
      borderColor: colors.border,
      borderStyle: 'dashed',
      marginBottom: spacing.sm,
    },
    addCatButtonPressed: { backgroundColor: colors.cardPressed },
    addCatPlus: {
      color: colors.accent,
      fontFamily: fonts.bold,
      fontSize: 18,
      marginRight: spacing.sm,
    },
    addCatText: {
      color: colors.accent,
      fontFamily: fonts.bold,
      fontSize: 13,
    },

    scroll: { flex: 1 },
    scrollContent: {
      gap: spacing.xs,
    },

    catGrid: {
      flexDirection: 'row',
      flexWrap: 'wrap',
      gap: spacing.sm,
    },
    catRow: {
      backgroundColor: colors.cardPressed,
      borderRadius: radius.sm,
      width: '48.5%',
    },
    catRowPressed: {
      opacity: 0.9,
    },
    catRowInner: {
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
      gap: spacing.xs,
    },
    catMonthVal: {
      fontFamily: fonts.numBold,
      fontSize: 16,
      color: colors.textPrimary,
      fontVariant: ['tabular-nums'],
    },
    catDelta: {
      fontFamily: fonts.numBold,
      fontSize: 12,
      fontVariant: ['tabular-nums'],
    },
    catName: {
      color: colors.textPrimary,
      fontFamily: fonts.bold,
      fontSize: 13,
    },
    noCats: {
      color: colors.textMuted,
      fontFamily: fonts.regular,
      fontSize: 13,
      textAlign: 'center',
      paddingVertical: spacing.lg,
    },
  });

const createModalStyles = (colors) =>
  StyleSheet.create({
    backdrop: { backgroundColor: colors.backdrop },
    center: {
      flex: 1,
      justifyContent: 'center',
      alignItems: 'center',
      paddingHorizontal: spacing.md,
    },
    card: {
      backgroundColor: colors.background,
      borderRadius: radius.lg,
      padding: spacing.lg,
      width: '100%',
      maxWidth: 380,
      maxHeight: '85%',
    },
    header: {
      flexDirection: 'row',
      justifyContent: 'space-between',
      alignItems: 'center',
      marginBottom: spacing.md,
    },
    headerTitle: {
      color: colors.textPrimary,
      fontFamily: fonts.bold,
      fontSize: 18,
    },
    closeBtn: {
      width: 30,
      height: 30,
      borderRadius: 15,
      backgroundColor: colors.card,
      alignItems: 'center',
      justifyContent: 'center',
    },
    closeBtnPressed: { backgroundColor: colors.cardPressed },
    label: {
      color: colors.textSecondary,
      fontFamily: fonts.bold,
      fontSize: 12,
      textTransform: 'uppercase',
      letterSpacing: 0.8,
      marginBottom: spacing.sm,
      marginTop: spacing.sm,
    },
    nameInput: {
      backgroundColor: colors.card,
      color: colors.textPrimary,
      borderRadius: radius.sm,
      paddingHorizontal: spacing.md,
      paddingVertical: spacing.sm + 4,
      fontFamily: fonts.regular,
      fontSize: 15,
      marginBottom: spacing.xs,
    },
    iconGridWrapper: {
      marginBottom: spacing.xs,
    },
    grid: {
      flexDirection: 'row',
      flexWrap: 'wrap',
      gap: spacing.xs + 2,
      marginBottom: spacing.xs,
    },
    iconPageDots: {
      flexDirection: 'row',
      justifyContent: 'center',
      gap: spacing.xs + 2,
      marginBottom: spacing.xs,
    },
    iconPageDot: {
      width: 6,
      height: 6,
      borderRadius: 3,
    },
    gridCell: {
      width: 40,
      height: 40,
      borderRadius: 10,
      alignItems: 'center',
      justifyContent: 'center',
      backgroundColor: colors.card,
      borderWidth: 1.5,
      borderColor: 'transparent',
    },
    colorCell: {
      width: 32,
      height: 32,
      borderRadius: 16,
      alignItems: 'center',
      justifyContent: 'center',
      borderWidth: 2,
      borderColor: 'transparent',
    },
    colorCellSelected: {
      // Floating accent ring with a small gap (no checkmark) — the modern
      // selection cue. outline adds no layout space so the grid never reflows.
      outlineColor: colors.accent,
      outlineStyle: 'solid',
      outlineWidth: 2,
      outlineOffset: 2,
    },
    customColorCellRainbow: {
      backgroundColor: colors.card,
      borderWidth: 2,
      borderColor: colors.border,
      overflow: 'hidden',
    },
    hueSliderContainer: {
      marginBottom: spacing.sm,
      paddingHorizontal: spacing.xs,
    },
    hueSliderTrack: {
      height: 24,
      borderRadius: 12,
      overflow: 'visible',
      position: 'relative',
    },
    hueSliderSvg: {
      borderRadius: 12,
    },
    hueThumb: {
      position: 'absolute',
      top: -2,
      width: 28,
      height: 28,
      borderRadius: 14,
      marginLeft: -14,
      borderWidth: 3,
      borderColor: '#ffffff',
      elevation: 4,
      shadowColor: '#000',
      shadowOffset: { width: 0, height: 2 },
      shadowOpacity: 0.25,
      shadowRadius: 4,
    },
    switchRow: {
      flexDirection: 'row',
      alignItems: 'center',
      justifyContent: 'space-between',
      marginVertical: spacing.md,
      backgroundColor: colors.card,
      borderRadius: radius.sm,
      padding: spacing.md,
    },
    switchLabel: { flex: 1, marginRight: spacing.md },
    switchText: {
      color: colors.textPrimary,
      fontFamily: fonts.bold,
      fontSize: 14,
    },
    switchHint: {
      color: colors.textMuted,
      fontFamily: fonts.regular,
      fontSize: 12,
      marginTop: 2,
    },
    saveBtn: {
      backgroundColor: colors.accent,
      borderRadius: radius.md,
      paddingVertical: spacing.md,
      alignItems: 'center',
    },
    saveBtnPressed: { backgroundColor: colors.accentDark },
    saveBtnDisabled: { opacity: 0.4 },
    saveBtnText: {
      color: colors.onAccent,
      fontFamily: fonts.bold,
      fontSize: 16,
    },
    deleteBtn: {
      alignItems: 'center',
      paddingVertical: spacing.sm + 4,
      marginTop: spacing.sm,
    },
    deleteBtnPressed: { opacity: 0.6 },
    deleteBtnText: {
      color: colors.danger,
      fontFamily: fonts.bold,
      fontSize: 14,
    },
  });
