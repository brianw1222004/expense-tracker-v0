import { useCallback, useMemo, useState } from 'react';
import { Modal, Pressable, ScrollView, StyleSheet, Switch, Text, TextInput, View } from 'react-native';
import Svg, { Circle } from 'react-native-svg';
import { fonts, spacing, radius, useTheme } from '../theme';
import { useT, useLanguage, getDateNames } from '../i18n';
import { formatMoney, formatMoneyShort, monthKeyLabel } from '../format';
import { getCategory, getCategoryLabel, EMOJI_OPTIONS, COLOR_OPTIONS, generateCategoryId } from '../categories';
import { getCurrency } from '../currency';
import { TAB_BAR_HEIGHT } from '../components/TabBar';
import { HIcon } from '../icons';

const DONUT_SIZE = 160;
const DONUT_STROKE = 16;
const DONUT_R = (DONUT_SIZE - DONUT_STROKE) / 2;
const DONUT_CX = DONUT_SIZE / 2;
const DONUT_CY = DONUT_SIZE / 2;
const DONUT_CIRC = 2 * Math.PI * DONUT_R;

export default function CategoriesScreen({
  months,
  currentMonthKey,
  loaded,
  hasExpenses,
  displayCurrency,
  allCategories,
  onAddPress,
  onLoadDemo,
  onAddCategory,
  onUpdateCategory,
  onDeleteCategory,
}) {
  const { colors } = useTheme();
  const t = useT();
  const language = useLanguage();
  const styles = useMemo(() => createStyles(colors), [colors]);
  const [modalCategory, setModalCategory] = useState(null); // null = closed, 'new' = add, object = edit

  const sortedMonthKeys = useMemo(
    () => months.map((m) => m.key).sort(),
    [months]
  );

  const [viewMonthKey, setViewMonthKey] = useState(currentMonthKey);
  const effectiveKey = sortedMonthKeys.includes(viewMonthKey) ? viewMonthKey : currentMonthKey;

  const monthsByKey = useMemo(() => new Map(months.map((m) => [m.key, m])), [months]);

  const viewMonth = useMemo(
    () => monthsByKey.get(effectiveKey) ?? { key: effectiveKey, total: 0, byCategory: {} },
    [monthsByKey, effectiveKey]
  );

  const prevMonthKey = useMemo(() => {
    const [y, m] = effectiveKey.split('-').map(Number);
    const d = new Date(y, m - 2, 1);
    return `${d.getFullYear()}-${String(d.getMonth() + 1).padStart(2, '0')}`;
  }, [effectiveKey]);

  const prevMonth = useMemo(
    () => monthsByKey.get(prevMonthKey) ?? { key: prevMonthKey, total: 0, byCategory: {} },
    [monthsByKey, prevMonthKey]
  );

  const shiftMonth = useCallback((dir) => {
    setViewMonthKey((key) => {
      const [y, m] = key.split('-').map(Number);
      const d = new Date(y, m - 1 + dir, 1);
      return `${d.getFullYear()}-${String(d.getMonth() + 1).padStart(2, '0')}`;
    });
  }, []);

  const canGoNext = effectiveKey < currentMonthKey;

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

  const eps = 0.5 / 10 ** getCurrency(displayCurrency).decimals;

  const monthLabelText = useMemo(
    () => monthKeyLabel(effectiveKey, language),
    [effectiveKey, language]
  );

  const handleSaveCategory = useCallback((cat) => {
    if (cat._editing) {
      const { _editing, ...cleaned } = cat;
      onUpdateCategory(cleaned);
    } else {
      onAddCategory(cat);
    }
    setModalCategory(null);
  }, [onAddCategory, onUpdateCategory]);

  const handleDeleteFromModal = useCallback(() => {
    if (modalCategory && modalCategory !== 'new') {
      onDeleteCategory(modalCategory.id);
      setModalCategory(null);
    }
  }, [modalCategory, onDeleteCategory]);

  if (!loaded) return <View style={styles.container} />;

  if (!hasExpenses) {
    return (
      <View style={[styles.container, styles.emptyState]}>
        <HIcon name="circle-dashed" size={48} color={colors.icon} />
        <Text style={styles.emptyTitle}>{t('empty.title')}</Text>
        <Text style={styles.emptyHint}>{t('cats.emptyHint')}</Text>
        <Pressable
          onPress={onAddPress}
          accessibilityRole="button"
          style={({ pressed }) => [styles.addFirstButton, pressed && styles.addFirstButtonPressed]}
        >
          <Text style={styles.addFirstButtonText}>{t('empty.addFirst')}</Text>
        </Pressable>
        <Pressable onPress={onLoadDemo} accessibilityRole="button" hitSlop={8}>
          <Text style={styles.demoLink}>{t('empty.loadDemo')}</Text>
        </Pressable>
      </View>
    );
  }

  return (
    <ScrollView
      style={styles.container}
      showsVerticalScrollIndicator={false}
      contentContainerStyle={styles.content}
    >
      <Text style={styles.title}>{t('cats.title')}</Text>

      {/* Add Category at top */}
      <Pressable
        onPress={() => setModalCategory('new')}
        accessibilityRole="button"
        style={({ pressed }) => [styles.addCatButton, pressed && styles.addCatButtonPressed]}
      >
        <Text style={styles.addCatPlus}>+</Text>
        <Text style={styles.addCatText}>{t('cats.addCategory')}</Text>
      </Pressable>

      {/* Month nav + donut + stat widgets */}
      <View style={styles.donutCard}>
        <View style={styles.monthNav}>
          <Pressable onPress={() => shiftMonth(-1)} hitSlop={12} accessibilityRole="button">
            <HIcon name="chevron-left" size={20} color={colors.icon} />
          </Pressable>
          <Text style={styles.monthLabel}>{monthLabelText}</Text>
          <Pressable
            onPress={() => shiftMonth(1)}
            disabled={!canGoNext}
            hitSlop={12}
            accessibilityRole="button"
            style={!canGoNext ? styles.navDisabled : undefined}
          >
            <HIcon name="chevron-right" size={20} color={colors.icon} />
          </Pressable>
        </View>
        <View style={styles.donutRow}>
          <CategoryDonut
            byCategory={viewMonth.byCategory}
            total={viewMonth.total}
            displayCurrency={displayCurrency}
            allCategories={allCategories}
            colors={colors}
            styles={styles}
          />

          <View style={styles.bigExpenseColumn}>
            {viewMonth.largestExpense ? (() => {
              const ts = viewMonth.largestExpense.createdAt;
              const d = ts ? new Date(ts) : null;
              const dayNum = d ? d.getDate() : '';
              const monthAbbr = d ? getDateNames(language).monthsShort[d.getMonth()] : '';
              return (
                <>
                  <Text style={styles.topCategoryTitle} numberOfLines={1}>
                    {t('cats.topExpense')} {getCategoryLabel(getCategory(viewMonth.largestExpense.category), t)}
                  </Text>
                  <View style={styles.bigExpenseCard}>
                    {d && <Text style={styles.bigExpenseDate}>{monthAbbr} {dayNum}</Text>}
                    <Text style={styles.bigExpenseName} numberOfLines={1}>
                      {viewMonth.largestExpense.note || getCategoryLabel(getCategory(viewMonth.largestExpense.category), t)}
                    </Text>
                    <Text style={styles.bigExpenseAmount}>
                      {formatMoneyShort(viewMonth.largestExpense.displayAmount, displayCurrency)}
                    </Text>
                  </View>
                </>
              );
            })() : (
              <Text style={styles.topCategoryEmpty}>{t('cats.topExpenseEmpty')}</Text>
            )}
          </View>
        </View>
      </View>

      {/* Category spending rows — custom ones are tappable */}
      {categoryRows.map(({ category, thisVal, lastVal }) => {
        const pct = viewMonth.total > 0 ? (thisVal / viewMonth.total) * 100 : 0;
        const delta = lastVal > 0 ? ((thisVal - lastVal) / lastVal) * 100 : null;
        const isCustom = category.custom;

        const row = (
          <View style={styles.catRowInner}>
            <View style={[styles.catDot, { backgroundColor: category.color }]} />
            <View style={styles.catIcon}>
              <HIcon name={category.emoji} size={18} color={category.color} />
            </View>
            <Text style={styles.catName} numberOfLines={1}>
              {getCategoryLabel(category, t)}
            </Text>
            <View style={styles.catRight}>
              <Text style={styles.catAmount}>
                {formatMoneyShort(thisVal, displayCurrency)}
              </Text>
              {delta !== null && Math.abs(thisVal - lastVal) >= eps ? (
                <Text style={[styles.catDelta, { color: delta > 0 ? colors.danger : colors.success }]}>
                  {delta > 0 ? '+' : ''}{Math.round(delta)}%
                </Text>
              ) : delta === null && thisVal > 0 ? (
                <Text style={[styles.catDelta, { color: colors.textMuted }]}>new</Text>
              ) : (
                <Text style={[styles.catDelta, { color: colors.textMuted }]}>
                  {Math.round(pct)}%
                </Text>
              )}
            </View>
          </View>
        );

        const tint = { backgroundColor: `${category.color}0A`, borderLeftWidth: 3, borderLeftColor: `${category.color}33` };

        if (isCustom) {
          return (
            <Pressable
              key={category.id}
              onPress={() => setModalCategory(category)}
              accessibilityRole="button"
              style={({ pressed }) => [styles.catRow, tint, pressed && styles.catRowPressed]}
            >
              {row}
            </Pressable>
          );
        }
        return <View key={category.id} style={[styles.catRow, tint]}>{row}</View>;
      })}

      {/* Custom categories without spending still need to be editable */}
      {(allCategories ?? [])
        .filter((c) => c.custom && !categoryRows.some((r) => r.category.id === c.id))
        .map((cat) => (
          <Pressable
            key={cat.id}
            onPress={() => setModalCategory(cat)}
            accessibilityRole="button"
            style={({ pressed }) => [
              styles.catRow,
              { backgroundColor: `${cat.color}0A`, borderLeftWidth: 3, borderLeftColor: `${cat.color}33` },
              pressed && styles.catRowPressed,
            ]}
          >
            <View style={styles.catRowInner}>
              <View style={[styles.catDot, { backgroundColor: cat.color }]} />
              <View style={styles.catIcon}>
                <HIcon name={cat.emoji} size={18} color={cat.color} />
              </View>
              <Text style={styles.catName} numberOfLines={1}>{cat.label}</Text>
              <Text style={[styles.catDelta, { color: colors.textMuted }]}>—</Text>
            </View>
          </Pressable>
        ))}

      {categoryRows.length === 0 && !(allCategories ?? []).some((c) => c.custom) && (
        <Text style={styles.noCats}>{t('cats.emptyHint')}</Text>
      )}

      {/* Add/Edit category modal */}
      <AddCategoryModal
        visible={modalCategory != null}
        editingCategory={modalCategory !== 'new' ? modalCategory : null}
        onClose={() => setModalCategory(null)}
        onSave={handleSaveCategory}
        onDelete={handleDeleteFromModal}
        colors={colors}
        t={t}
      />

    </ScrollView>
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

  // Reset form when modal opens/closes or editing target changes
  if (visible && !initialized) {
    if (isEdit) {
      setName(editingCategory.label);
      setEmoji(editingCategory.emoji);
      setColor(editingCategory.color);
      setExternal(editingCategory.external);
    } else {
      setName('');
      setEmoji(EMOJI_OPTIONS[0]);
      setColor(COLOR_OPTIONS[0]);
      setExternal(false);
    }
    setInitialized(true);
  }
  if (!visible && initialized) {
    setInitialized(false);
  }

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
      <View style={styles.center}>
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
            <View style={styles.grid}>
              {EMOJI_OPTIONS.map((e) => (
                <Pressable
                  key={e}
                  onPress={() => setEmoji(e)}
                  style={[styles.gridCell, emoji === e && { backgroundColor: `${color}33`, borderColor: color }]}
                >
                  <HIcon name={e} size={22} color={emoji === e ? color : colors.icon} />
                </Pressable>
              ))}
            </View>

            <Text style={styles.label}>{t('cats.pickColor')}</Text>
            <View style={styles.grid}>
              {COLOR_OPTIONS.map((c) => (
                <Pressable
                  key={c}
                  onPress={() => setColor(c)}
                  style={[styles.colorCell, { backgroundColor: c }, color === c && styles.colorCellSelected]}
                >
                  {color === c && <HIcon name="tick-01" size={16} color="#fff" />}
                </Pressable>
              ))}
            </View>

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

            {/* Preview */}
            <View style={styles.preview}>
              <View style={[styles.previewDot, { backgroundColor: color }]} />
              <HIcon name={emoji} size={24} color={color} />
              <Text style={styles.previewName}>{name || t('cats.categoryName')}</Text>
              {external && <Text style={styles.previewBadge}>{t('cats.external')}</Text>}
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

function CategoryDonut({ byCategory, total, displayCurrency, allCategories, colors, styles }) {
  const segments = useMemo(() => {
    if (total <= 0) return [];
    return (allCategories ?? [])
      .map((cat) => ({ color: cat.color, value: byCategory[cat.id] ?? 0 }))
      .filter((s) => s.value > 0);
  }, [byCategory, total, allCategories]);

  return (
    <View style={styles.donut}>
      <Svg width="100%" height="100%" viewBox={`0 0 ${DONUT_SIZE} ${DONUT_SIZE}`}>
        <Circle
          cx={DONUT_CX}
          cy={DONUT_CY}
          r={DONUT_R}
          stroke={colors.cardPressed}
          strokeWidth={DONUT_STROKE}
          fill="none"
        />
        {segments.map((seg, i) => {
          const len = (seg.value / total) * DONUT_CIRC;
          const offset =
            DONUT_CIRC * 0.25 -
            segments.slice(0, i).reduce((s, p) => s + (p.value / total) * DONUT_CIRC, 0);
          return (
            <Circle
              key={i}
              cx={DONUT_CX}
              cy={DONUT_CY}
              r={DONUT_R}
              stroke={seg.color}
              strokeWidth={DONUT_STROKE}
              fill="none"
              strokeDasharray={`${len} ${DONUT_CIRC - len}`}
              strokeDashoffset={offset}
            />
          );
        })}
      </Svg>
      <View style={[StyleSheet.absoluteFill, styles.donutCenter]}>
        <Text
          style={[styles.donutTotal, { color: colors.textPrimary }]}
          numberOfLines={1}
          adjustsFontSizeToFit
        >
          {formatMoney(total, displayCurrency)}
        </Text>
      </View>
    </View>
  );
}

const createStyles = (colors) =>
  StyleSheet.create({
    container: { flex: 1 },
    content: {
      paddingHorizontal: spacing.md,
      paddingBottom: spacing.xl,
      gap: spacing.xs,
    },
    title: {
      color: colors.textPrimary,
      fontFamily: fonts.bold,
      fontSize: 28,
      paddingTop: spacing.md,
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
    },
    addCatButtonPressed: { backgroundColor: colors.cardPressed },
    addCatPlus: {
      color: colors.accent,
      fontFamily: fonts.bold,
      fontSize: 20,
      marginRight: spacing.sm,
    },
    addCatText: {
      color: colors.accent,
      fontFamily: fonts.bold,
      fontSize: 14,
    },

    donutCard: {
      backgroundColor: colors.card,
      borderRadius: radius.md,
      padding: spacing.md,
    },
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
      fontSize: 16,
      minWidth: 100,
      textAlign: 'center',
    },
    donutRow: {
      flexDirection: 'row',
      alignItems: 'center',
      gap: spacing.lg,
    },
    bigExpenseColumn: {
      flex: 1,
      gap: spacing.sm,
      alignItems: 'center',
    },
    topCategoryTitle: {
      fontFamily: fonts.bold,
      fontSize: 15,
      color: colors.textPrimary,
    },
    topCategoryEmpty: {
      fontFamily: fonts.regular,
      fontSize: 13,
      color: colors.textMuted,
    },
    bigExpenseCard: {
      flexDirection: 'row',
      alignItems: 'center',
      alignSelf: 'stretch',
      backgroundColor: colors.background,
      borderRadius: radius.sm,
      paddingVertical: spacing.sm,
      paddingHorizontal: spacing.sm,
      gap: spacing.sm,
    },
    bigExpenseDate: {
      fontFamily: fonts.regular,
      fontSize: 13,
      color: colors.textMuted,
    },
    bigExpenseName: {
      flex: 1,
      fontFamily: fonts.regular,
      fontSize: 14,
      color: colors.textPrimary,
    },
    bigExpenseAmount: {
      fontFamily: fonts.bold,
      fontSize: 15,
      color: colors.textPrimary,
      fontVariant: ['tabular-nums'],
    },
    donut: { width: DONUT_SIZE, height: DONUT_SIZE },
    donutCenter: {
      alignItems: 'center',
      justifyContent: 'center',
      paddingHorizontal: DONUT_STROKE + 8,
    },
    donutTotal: {
      fontFamily: fonts.bold,
      fontSize: 15,
      fontVariant: ['tabular-nums'],
    },

    catRow: {
      backgroundColor: colors.card,
      borderRadius: radius.sm,
      marginBottom: spacing.sm,
    },
    catRowPressed: {
      backgroundColor: colors.cardPressed,
    },
    catRowInner: {
      flexDirection: 'row',
      alignItems: 'center',
      paddingHorizontal: spacing.sm + 2,
      paddingVertical: spacing.sm,
    },
    catDot: {
      width: 8,
      height: 8,
      borderRadius: 4,
      marginRight: spacing.sm,
    },
    catIcon: { marginRight: spacing.sm },
    catName: {
      flex: 1,
      color: colors.textPrimary,
      fontFamily: fonts.bold,
      fontSize: 14,
      marginRight: spacing.sm,
    },
    catRight: { alignItems: 'flex-end' },
    catAmount: {
      color: colors.textPrimary,
      fontFamily: fonts.bold,
      fontSize: 14,
      fontVariant: ['tabular-nums'],
    },
    catDelta: {
      fontFamily: fonts.regular,
      fontSize: 11,
      fontVariant: ['tabular-nums'],
      marginTop: 1,
    },
    noCats: {
      color: colors.textMuted,
      fontFamily: fonts.regular,
      fontSize: 14,
      textAlign: 'center',
      paddingVertical: spacing.lg,
    },

    backdrop: { backgroundColor: colors.backdrop },

    emptyState: {
      alignItems: 'center',
      justifyContent: 'center',
      paddingHorizontal: spacing.xl,
      paddingBottom: TAB_BAR_HEIGHT,
    },
    emptyTitle: {
      color: colors.textPrimary,
      fontFamily: fonts.bold,
      fontSize: 20,
    },
    emptyHint: {
      color: colors.textSecondary,
      fontFamily: fonts.regular,
      fontSize: 15,
      textAlign: 'center',
      marginTop: spacing.sm,
      lineHeight: 21,
    },
    addFirstButton: {
      backgroundColor: colors.accent,
      borderRadius: radius.md,
      paddingHorizontal: spacing.lg,
      paddingVertical: spacing.sm + 4,
      marginTop: spacing.lg,
      minHeight: 48,
      alignItems: 'center',
      justifyContent: 'center',
    },
    addFirstButtonPressed: { backgroundColor: colors.accentDark },
    addFirstButtonText: {
      color: colors.onAccent,
      fontFamily: fonts.bold,
      fontSize: 16,
    },
    demoLink: {
      color: colors.textMuted,
      fontFamily: fonts.regular,
      fontSize: 14,
      marginTop: spacing.md,
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
      fontSize: 16,
      marginBottom: spacing.xs,
    },
    grid: {
      flexDirection: 'row',
      flexWrap: 'wrap',
      gap: spacing.xs + 2,
      marginBottom: spacing.xs,
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
      borderColor: colors.textPrimary,
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
      fontSize: 15,
    },
    switchHint: {
      color: colors.textMuted,
      fontFamily: fonts.regular,
      fontSize: 12,
      marginTop: 2,
    },
    preview: {
      flexDirection: 'row',
      alignItems: 'center',
      backgroundColor: colors.card,
      borderRadius: radius.sm,
      padding: spacing.sm + 2,
      marginBottom: spacing.md,
    },
    previewDot: {
      width: 8,
      height: 8,
      borderRadius: 4,
      marginRight: spacing.sm,
    },
    previewName: {
      flex: 1,
      color: colors.textPrimary,
      fontFamily: fonts.bold,
      fontSize: 14,
    },
    previewBadge: {
      color: colors.textMuted,
      fontFamily: fonts.regular,
      fontSize: 11,
      backgroundColor: colors.background,
      borderRadius: 6,
      paddingHorizontal: spacing.xs + 2,
      paddingVertical: 2,
      overflow: 'hidden',
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
      fontSize: 17,
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
      fontSize: 15,
    },
  });
