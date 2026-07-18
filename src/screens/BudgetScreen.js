import { useEffect, useMemo, useRef, useState } from 'react';
import {
  PanResponder,
  Pressable,
  ScrollView,
  StyleSheet,
  Text,
  TextInput,
  View,
} from 'react-native';
import { useSafeAreaInsets } from 'react-native-safe-area-context';
import { fonts, radius, spacing, useTheme, panelShadow } from '../theme';
import Sheet from '../components/Sheet';
import { useT } from '../i18n';
import { getCurrency } from '../currency';
import { formatMoney, isValidAmountText } from '../format';
import { getCategoryLabel } from '../categories';
import { HIcon } from '../icons';
import {
  budgetAmountPercent,
  budgetAmountToRatio,
  clampCategoryBudgetAmount,
  fitAllocatedBudgetsToOverall,
  hasUsableOverallBudget,
  maxBudgetForCategory,
  remainingBudget,
  ratioToBudgetAmount,
  snapRatioToStep,
  totalAllocatedBudget,
} from '../budget';

// The category slider moves in 5% steps of the overall budget — the extra
// precision wasn't useful and made fine mouse control fiddly on web.
const SLIDER_STEP = 0.05;
// Thumb diameter; the thumb's dynamic marginLeft scales with this so it never
// overhangs the track ends (keep in sync with the sliderThumb width/height).
const THUMB_SIZE = 18;

function budgetToText(value, decimals) {
  if (!(value > 0)) return '';
  return Number.isInteger(value) ? String(value) : value.toFixed(decimals);
}

// One budget input. Owns its draft text and re-syncs from the stored value —
// a currency switch re-denominates every budget in App.js, so the prop can
// change under a field that was never touched.
function AmountField({ value, decimals, onCommit, style, accessibilityLabel }) {
  const { colors } = useTheme();
  const [text, setText] = useState(() => budgetToText(value, decimals));

  useEffect(() => {
    setText(budgetToText(value, decimals));
  }, [value, decimals]);

  const commit = () => {
    const normalized = text.trim().replace(/,(\d{3})\b/g, '$1').replace(',', '.');
    const parsed = parseFloat(normalized);
    const isValid = isValidAmountText(normalized, decimals) && parsed > 0;
    const committed = isValid ? Number(parsed.toFixed(decimals)) : 0;
    const saved = onCommit(committed);
    setText(budgetToText(typeof saved === 'number' ? saved : committed, decimals));
  };

  return (
    <TextInput
      style={style}
      value={text}
      onChangeText={setText}
      // onBlur, not onEndEditing: react-native-web never fires the latter,
      // which would silently drop the budget on web.
      onBlur={commit}
      onSubmitEditing={commit}
      placeholder="0"
      placeholderTextColor={colors.textMuted}
      keyboardType={decimals === 0 ? 'number-pad' : 'decimal-pad'}
      keyboardAppearance={colors.keyboardAppearance}
      returnKeyType="done"
      maxLength={9}
      accessibilityLabel={accessibilityLabel}
    />
  );
}

function BudgetSlider({ value, maxValue, color, disabled, onChange, styles, colors, accessibilityLabel }) {
  // Everything the gesture handlers read lives in refs so the PanResponder can be
  // created once (empty deps) — mirroring the hue sliders. Recreating it per render
  // (as before) dropped in-flight mouse drags on web.
  const trackWidthRef = useRef(0);
  const maxValueRef = useRef(maxValue);
  maxValueRef.current = maxValue;
  const disabledRef = useRef(disabled);
  disabledRef.current = disabled;
  const onChangeRef = useRef(onChange);
  onChangeRef.current = onChange;
  const lastEmitRef = useRef(null);

  // Absolute position within the track (like the hue slider), snapped to 5% and
  // clamped to what's still allocatable. Deduped so a mouse drag that stays inside
  // one 5% step doesn't spam commits/re-renders.
  const setFromLocation = (locationX) => {
    if (disabledRef.current || trackWidthRef.current <= 0) return;
    const raw = locationX / trackWidthRef.current;
    const next = Math.max(0, Math.min(maxValueRef.current, snapRatioToStep(raw, SLIDER_STEP)));
    if (next === lastEmitRef.current) return;
    lastEmitRef.current = next;
    onChangeRef.current(next);
  };

  const panResponder = useMemo(
    () =>
      PanResponder.create({
        onStartShouldSetPanResponder: () => !disabledRef.current,
        onMoveShouldSetPanResponder: () => !disabledRef.current,
        onPanResponderGrant: (event) => {
          lastEmitRef.current = null;
          setFromLocation(event.nativeEvent.locationX);
        },
        onPanResponderMove: (event) => setFromLocation(event.nativeEvent.locationX),
      }),
    []
  );

  const clamped = Math.max(0, Math.min(1, value));
  const pct = `${clamped * 100}%`;

  return (
    <View
      accessible
      accessibilityRole="adjustable"
      accessibilityLabel={accessibilityLabel}
      accessibilityState={{ disabled }}
      style={[styles.sliderTrack, disabled && styles.sliderTrackDisabled]}
      onLayout={(event) => { trackWidthRef.current = event.nativeEvent.layout.width; }}
      {...panResponder.panHandlers}
    >
      {/* pointerEvents none keeps the track the only touch target, so locationX
          stays track-relative on native (and it blocks drag text-selection on web). */}
      <View style={styles.sliderBase} pointerEvents="none" />
      <View
        pointerEvents="none"
        style={[
          styles.sliderFill,
          { width: pct, backgroundColor: disabled ? colors.border : color },
        ]}
      />
      {/* marginLeft scales with value so the thumb stays fully inside the track at
          both ends (0% → its left edge at the start) instead of overhanging the gap. */}
      <View
        pointerEvents="none"
        style={[
          styles.sliderThumb,
          { left: pct, marginLeft: -clamped * THUMB_SIZE, borderColor: disabled ? colors.border : color },
        ]}
      />
    </View>
  );
}

function CategoryBudgetRow({
  category,
  value,
  overallBudget,
  currency,
  onCommit,
  maxAmount,
  styles,
  colors,
  t,
}) {
  const label = getCategoryLabel(category, t);
  const sliderEnabled = hasUsableOverallBudget(overallBudget);
  const ratio = budgetAmountToRatio(value, overallBudget);
  const maxRatio = budgetAmountToRatio(maxAmount, overallBudget);
  const percent = budgetAmountPercent(value, overallBudget);
  const percentLabel = percent == null ? '—' : `${Math.round(percent)}%`;

  return (
    <View style={styles.categoryBudgetRow}>
      <View style={styles.categoryLeft}>
        <View style={[styles.categoryIconWrap, { backgroundColor: `${category.color}1F` }]}>
          <HIcon name={category.emoji} size={18} color={category.color} />
        </View>
        <View style={styles.categoryNameWrap}>
          <Text style={styles.categoryLabel} numberOfLines={1}>
            {label}
          </Text>
          <Text style={styles.categoryPercent}>{percentLabel}</Text>
        </View>
      </View>
      <BudgetSlider
        value={ratio}
        maxValue={maxRatio}
        color={category.color}
        disabled={!sliderEnabled}
        onChange={(nextRatio) => onCommit(ratioToBudgetAmount(nextRatio, overallBudget, currency.decimals))}
        styles={styles}
        colors={colors}
        accessibilityLabel={`${label} budget proportion`}
      />
      <View style={styles.categoryAmountWrap}>
        <Text style={styles.categorySymbol}>{currency.symbol}</Text>
        <AmountField
          key={category.id}
          value={value}
          decimals={currency.decimals}
          onCommit={onCommit}
          style={styles.categoryBudgetInput}
          accessibilityLabel={label}
        />
      </View>
    </View>
  );
}

export default function BudgetScreen({ visible, settings, regularCategories, externalCategories, onUpdateSettings, onClose }) {
  const { colors } = useTheme();
  const t = useT();
  const insets = useSafeAreaInsets();
  const styles = useMemo(() => createStyles(colors), [colors]);

  // The display currency is chosen on the Insight page's Budget card header
  // (the sheet no longer has a currency section); it still drives the symbols
  // and decimal precision of every input here.
  const currency = getCurrency(settings.displayCurrency);
  // Stale caches from before the budget feature may lack categoryBudgets.
  const categoryBudgets = settings.categoryBudgets ?? {};
  const overallBudget = settings.monthlyBudget ?? 0;
  const regularCategoryIds = useMemo(() => regularCategories.map((category) => category.id), [regularCategories]);
  const canAllocate = hasUsableOverallBudget(overallBudget);
  const allocated = totalAllocatedBudget(categoryBudgets, regularCategoryIds);
  const remaining = remainingBudget(overallBudget, categoryBudgets, regularCategoryIds, currency.decimals);

  const commitOverall = (committed) => {
    if (committed !== (settings.monthlyBudget ?? 0)) {
      onUpdateSettings({
        monthlyBudget: committed,
        categoryBudgets: fitAllocatedBudgetsToOverall(
          categoryBudgets,
          regularCategoryIds,
          committed,
          currency.decimals
        ),
      });
    }
    return committed;
  };

  const commitCategory = (id, committed) => {
    if (committed === (categoryBudgets[id] ?? 0)) return;
    // 0 means "no limit": remove the key rather than storing zeros forever.
    const next = { ...categoryBudgets };
    if (committed > 0) next[id] = committed;
    else delete next[id];
    onUpdateSettings({ categoryBudgets: next });
    return committed;
  };

  const commitRegularCategory = (id, committed) => {
    const clamped = clampCategoryBudgetAmount(
      id,
      committed,
      overallBudget,
      categoryBudgets,
      regularCategoryIds,
      currency.decimals
    );
    commitCategory(id, clamped);
    return clamped;
  };

  return (
    <Sheet
      visible={visible}
      onClose={onClose}
      avoidKeyboard
      sheetStyle={styles.sheetOverride}
    >
          <View style={styles.titleRow}>
            <Text style={styles.title}>{t('budget.sheetTitle')}</Text>
            <Pressable
              onPress={onClose}
              hitSlop={12}
              accessibilityRole="button"
              accessibilityLabel={t('common.close')}
              style={({ pressed }) => [styles.closeButton, pressed && styles.closeButtonPressed]}
            >
              <HIcon name="cancel-01" size={20} color={colors.icon} />
            </Pressable>
          </View>

          <ScrollView
            keyboardShouldPersistTaps="handled"
            contentContainerStyle={{ paddingBottom: spacing.xl + insets.bottom }}
            showsVerticalScrollIndicator={false}
          >
            <Text style={styles.sectionHeader}>{t('budget.overallSection')}</Text>
            <View style={styles.card}>
              <View style={styles.budgetRow}>
                <Text style={styles.budgetSymbol}>{currency.symbol}</Text>
                <AmountField
                  key="overall"
                  value={settings.monthlyBudget ?? 0}
                  decimals={currency.decimals}
                  onCommit={commitOverall}
                  style={styles.budgetInput}
                  accessibilityLabel={t('budget.overallSection')}
                />
              </View>
            </View>

            <Text style={styles.sectionHeader}>{t('budget.categorySection')}</Text>
            {canAllocate && (
              <View style={styles.allocationSummary}>
                <Text style={styles.allocationText}>
                  Allocated: {formatMoney(allocated, settings.displayCurrency)} / {formatMoney(overallBudget, settings.displayCurrency)}
                </Text>
                <Text style={[styles.allocationText, remaining === 0 && styles.allocationTextEmpty]}>
                  Remaining: {formatMoney(remaining, settings.displayCurrency)}
                </Text>
              </View>
            )}
            <View style={styles.card}>
              {regularCategories.map((category, index) => (
                <View
                  key={category.id}
                  style={[index > 0 && styles.rowDivider]}
                >
                  <CategoryBudgetRow
                    category={category}
                    value={categoryBudgets[category.id] ?? 0}
                    overallBudget={overallBudget}
                    maxAmount={maxBudgetForCategory(
                      category.id,
                      overallBudget,
                      categoryBudgets,
                      regularCategoryIds,
                      currency.decimals
                    )}
                    currency={currency}
                    onCommit={(committed) => commitRegularCategory(category.id, committed)}
                    styles={styles}
                    colors={colors}
                    t={t}
                  />
                </View>
              ))}
            </View>

            <Text style={styles.sectionHeader}>{t('budget.externalSection')}</Text>
            <View style={styles.card}>
              {externalCategories.map((category, index) => (
                <View
                  key={category.id}
                  style={[styles.externalCategoryRow, index > 0 && styles.rowDivider]}
                >
                  <HIcon name={category.emoji} size={18} color={category.color} />
                  <Text style={styles.categoryLabel} numberOfLines={1}>
                    {getCategoryLabel(category, t)}
                  </Text>
                  <Text style={styles.categorySymbol}>{currency.symbol}</Text>
                  <AmountField
                    key={category.id}
                    value={categoryBudgets[category.id] ?? 0}
                    decimals={currency.decimals}
                    onCommit={(committed) => commitCategory(category.id, committed)}
                    style={styles.categoryInput}
                    accessibilityLabel={getCategoryLabel(category, t)}
                  />
                </View>
              ))}
            </View>
            <Text style={styles.sectionNote}>{t('budget.externalNote')}</Text>
          </ScrollView>
    </Sheet>
  );
}

const createStyles = (colors) =>
  StyleSheet.create({
    sheetOverride: {
      paddingHorizontal: spacing.lg,
      paddingTop: spacing.md,
      maxHeight: '88%',
    },
    titleRow: {
      flexDirection: 'row',
      justifyContent: 'space-between',
      alignItems: 'center',
      marginBottom: spacing.sm,
    },
    title: {
      color: colors.textPrimary,
      fontFamily: fonts.bold,
      fontSize: 18,
    },
    closeButton: {
      width: 30,
      height: 30,
      borderRadius: 15,
      backgroundColor: colors.card,
      alignItems: 'center',
      justifyContent: 'center',
    },
    closeButtonPressed: {
      backgroundColor: colors.cardPressed,
    },
    sectionHeader: {
      color: colors.textSecondary,
      fontFamily: fonts.bold,
      fontSize: 13,
      letterSpacing: 0.2,
      marginTop: spacing.md,
      marginBottom: spacing.sm,
    },
    sectionNote: {
      color: colors.textMuted,
      fontFamily: fonts.regular,
      fontSize: 13,
      lineHeight: 18,
      marginTop: spacing.sm,
    },
    card: {
      backgroundColor: colors.card,
      borderRadius: radius.md,
      overflow: 'hidden',
      ...panelShadow,
    },
    rowDivider: {
      borderTopWidth: StyleSheet.hairlineWidth,
      borderTopColor: colors.border,
    },
    budgetRow: {
      flexDirection: 'row',
      alignItems: 'center',
      paddingHorizontal: spacing.md,
    },
    budgetSymbol: {
      color: colors.textSecondary,
      fontFamily: fonts.numBold,
      fontSize: 16,
      marginRight: spacing.sm,
    },
    budgetInput: {
      flex: 1,
      color: colors.textPrimary,
      fontFamily: fonts.numBold,
      fontSize: 16,
      paddingVertical: spacing.sm + 4,
      fontVariant: ['tabular-nums'],
    },
    allocationSummary: {
      flexDirection: 'row',
      justifyContent: 'space-between',
      alignItems: 'center',
      gap: spacing.sm,
      marginBottom: spacing.sm,
      paddingHorizontal: spacing.xs,
    },
    allocationText: {
      color: colors.textMuted,
      fontFamily: fonts.numMedium,
      fontSize: 12,
      fontVariant: ['tabular-nums'],
      flexShrink: 1,
    },
    allocationTextEmpty: {
      color: colors.warning,
    },
    categoryBudgetRow: {
      flexDirection: 'row',
      alignItems: 'center',
      paddingHorizontal: spacing.md,
      paddingVertical: spacing.xs + 2,
      gap: spacing.sm,
    },
    categoryLeft: {
      flexDirection: 'row',
      alignItems: 'center',
      gap: spacing.sm,
      flex: 0.9,
      minWidth: 74,
      maxWidth: 132,
    },
    categoryAmountWrap: {
      flexDirection: 'row',
      alignItems: 'center',
      width: 104,
      justifyContent: 'flex-end',
      minWidth: 0,
    },
    categoryIconWrap: {
      width: 30,
      height: 30,
      borderRadius: 15,
      alignItems: 'center',
      justifyContent: 'center',
    },
    categoryNameWrap: {
      flex: 1,
      minWidth: 0,
    },
    categoryPercent: {
      color: colors.textMuted,
      fontFamily: fonts.numRegular,
      fontSize: 12,
      lineHeight: 14,
      fontVariant: ['tabular-nums'],
    },
    externalCategoryRow: {
      flexDirection: 'row',
      alignItems: 'center',
      paddingHorizontal: spacing.md,
      gap: 8,
    },
    categoryLabel: {
      color: colors.textPrimary,
      fontFamily: fonts.regular,
      fontSize: 15,
      flex: 1,
      marginRight: spacing.sm,
    },
    categorySymbol: {
      color: colors.textMuted,
      fontFamily: fonts.numRegular,
      fontSize: 14,
      marginRight: 2,
      fontVariant: ['tabular-nums'],
    },
    categoryInput: {
      width: 110,
      color: colors.textPrimary,
      fontFamily: fonts.numBold,
      fontSize: 15,
      textAlign: 'right',
      paddingVertical: spacing.sm + 4,
      fontVariant: ['tabular-nums'],
    },
    categoryBudgetInput: {
      width: 80,
      color: colors.textPrimary,
      fontFamily: fonts.numBold,
      fontSize: 15,
      textAlign: 'right',
      paddingVertical: spacing.sm + 2,
      fontVariant: ['tabular-nums'],
    },
    sliderTrack: {
      flex: 1,
      minWidth: 36,
      height: 24,
      justifyContent: 'center',
      // Web affordances (ignored on native): pointer cursor + no accidental
      // text selection while dragging with a mouse.
      cursor: 'pointer',
      userSelect: 'none',
    },
    sliderTrackDisabled: {
      opacity: 0.55,
      cursor: 'default',
    },
    sliderBase: {
      position: 'absolute',
      left: 0,
      right: 0,
      height: 6,
      borderRadius: 3,
      backgroundColor: colors.border,
    },
    sliderFill: {
      position: 'absolute',
      left: 0,
      height: 6,
      borderRadius: 3,
    },
    sliderThumb: {
      position: 'absolute',
      width: THUMB_SIZE,
      height: THUMB_SIZE,
      borderRadius: THUMB_SIZE / 2,
      borderWidth: 3,
      backgroundColor: colors.card,
      ...panelShadow,
    },
  });
