import { useCallback, useMemo, useRef, useState } from 'react';
import {
  Alert,
  Animated,
  Keyboard,
  Platform,
  Pressable,
  ScrollView,
  StyleSheet,
  Text,
  TextInput,
  useWindowDimensions,
  View,
} from 'react-native';
import Svg, { Circle, Path, Rect } from 'react-native-svg';
import { fonts, spacing, radius, useTheme } from '../theme';
import { getDateNames, useLanguage, useT } from '../i18n';
import { getCategory, getCategoryLabel } from '../categories';
import { INCOME_SOURCES, getIncomeSource, getIncomeSourceLabel } from '../incomeSources';
import { HIcon } from '../icons';
import EntryTypeToggle from '../components/EntryTypeToggle';
import { CURRENCIES, getCurrency } from '../currency';
import { buildCalendarWeeks, dateKey, dayLabel, isValidAmountText, monthLabel } from '../format';

const MS_PER_DAY = 24 * 60 * 60 * 1000;
const NOTE_MAX_LENGTH = 80;
const AMOUNT_MAX_LENGTH = 12;
const COLOR_MS = 350;
const CATS_PER_PAGE = 8;

// The chosen day at 12:00 local — keeps the entry safely inside the day even
// across DST shifts, while today keeps the real timestamp (set on submit).
function dateForOffset(offset) {
  const d = new Date();
  d.setDate(d.getDate() + offset);
  d.setHours(12, 0, 0, 0);
  return d;
}

// Days from today to the given calendar day (negative = past). Both ends sit
// at 12:00 local so a DST hour can't skew the division.
function offsetForDay(year, month, day) {
  const picked = new Date(year, month, day, 12, 0, 0, 0);
  const today = new Date();
  today.setHours(12, 0, 0, 0);
  return Math.round((picked - today) / MS_PER_DAY);
}

// Shared add/edit form for both expenses and income. Rendered inside
// AddExpenseModal (the shared popup presenter). The two modes are IDENTICAL in
// layout, styling and behavior; the ONLY differences are the selector area
// (a paginated category grid for `expense` vs. a fixed source picker for
// `income`), the expense-only ÷ split tool, and the accent color of the save
// button (blue for expense, green for income). The card's border + background
// tint animate to the selected category/source color in both modes.
export default function AddEntryScreen({
  mode,
  displayCurrency,
  categories,
  editEntry,
  onSubmit,
  onDelete,
  onClose,
  onChangeType,
}) {
  const { colors } = useTheme();
  const t = useT();
  const language = useLanguage();
  const styles = useMemo(() => createStyles(colors), [colors]);

  const isExpense = mode === 'expense';
  const isEdit = editEntry != null;
  const accent = isExpense ? colors.accent : colors.success;

  // The selected category (expense) or source (income).
  const selectorItems = isExpense ? (categories ?? []) : INCOME_SOURCES;
  const firstId = selectorItems[0].id;
  const colorOf = useCallback(
    (id) => (isExpense ? getCategory(id, categories).color : getIncomeSource(id).color),
    [isExpense, categories]
  );
  const labelOf = (item) => (isExpense ? getCategoryLabel(item, t) : getIncomeSourceLabel(item, t));
  const initSelected = isEdit ? (isExpense ? editEntry.category : editEntry.source) : firstId;

  const { width: screenWidth } = useWindowDimensions();
  const catPageWidth = screenWidth - spacing.lg * 4;
  const catItemWidth = catPageWidth / 4;

  const categoryPages = useMemo(() => {
    if (!isExpense) return [];
    const pages = [];
    for (let i = 0; i < selectorItems.length; i += CATS_PER_PAGE) {
      pages.push(selectorItems.slice(i, i + CATS_PER_PAGE));
    }
    return pages;
  }, [isExpense, selectorItems]);

  const [catPage, setCatPage] = useState(0);
  const onCatScroll = useCallback((e) => {
    setCatPage(Math.round(e.nativeEvent.contentOffset.x / catPageWidth));
  }, [catPageWidth]);

  const [amountText, setAmountText] = useState(() => (isEdit ? String(editEntry.amount) : ''));
  const [note, setNote] = useState(isEdit ? (editEntry.note || '') : '');
  const [selectedId, setSelectedId] = useState(initSelected);
  const [manualCurrency, setManualCurrency] = useState(isEdit ? editEntry.currency : null);
  const [dayOffset, setDayOffset] = useState(() => {
    if (!isEdit) return 0;
    const d = new Date(editEntry.createdAt);
    return offsetForDay(d.getFullYear(), d.getMonth(), d.getDate());
  });
  const [splitOpen, setSplitOpen] = useState(false);
  const [splitBy, setSplitBy] = useState(2);
  const [datePickerOpen, setDatePickerOpen] = useState(false);
  const calAnim = useRef(new Animated.Value(0)).current;
  const splitAnim = useRef(new Animated.Value(0)).current;
  const [calContentH, setCalContentH] = useState(360);
  const [splitContentH, setSplitContentH] = useState(72);
  const [calMonth, setCalMonth] = useState(() => {
    const d = isEdit ? new Date(editEntry.createdAt) : new Date();
    return { year: d.getFullYear(), month: d.getMonth() };
  });

  // Color transitions interpolate from the previously shown color to the newly
  // picked one; colors can't animate on the native driver.
  const colorAnim = useRef(new Animated.Value(1)).current;
  const colorFrom = useRef(colorOf(initSelected));
  const colorTo = useRef(colorOf(initSelected));

  const currencyCode = manualCurrency ?? displayCurrency;
  const currency = getCurrency(currencyCode);

  // Strict shape check before parseFloat: bare parseFloat accepts '1.2.3' as 1.2
  // and would silently save a different amount than the user sees.
  // 0-decimal currencies (JPY, TWD) only accept whole numbers.
  const normalized = amountText.replace(',', '.');
  const amount = parseFloat(normalized);
  const isValid = isValidAmountText(normalized, currency.decimals) && amount > 0;

  const splitRaw = amount > 0 && splitBy > 1
    ? Math.round((amount / splitBy) * (10 ** currency.decimals)) / (10 ** currency.decimals)
    : 0;
  const splitResult = splitRaw > 0 ? splitRaw : null;

  const applySplit = () => {
    if (splitResult != null) {
      setAmountText(String(splitResult));
      setSplitOpen(false);
      setSplitBy(2);
      Animated.timing(splitAnim, { toValue: 0, duration: 250, useNativeDriver: false }).start();
    }
  };

  const reset = () => {
    setAmountText('');
    setNote('');
    setSelectedId(firstId);
    setManualCurrency(null);
    setDayOffset(0);
    setDatePickerOpen(false);
    setSplitOpen(false);
    setSplitBy(2);
    colorFrom.current = colorOf(firstId);
    colorTo.current = colorOf(firstId);
    colorAnim.setValue(1);
    calAnim.setValue(0);
    splitAnim.setValue(0);
  };

  const handleSubmit = () => {
    if (!isValid) return;
    const factor = 10 ** currency.decimals;
    let createdAt;
    if (isEdit) {
      const newDay = dateKey(dateForOffset(dayOffset).getTime());
      const originalDay = dateKey(editEntry.createdAt);
      createdAt = newDay === originalDay ? editEntry.createdAt : dateForOffset(dayOffset).getTime();
    } else {
      createdAt = dayOffset === 0 ? Date.now() : dateForOffset(dayOffset).getTime();
    }
    const data = {
      amount: Math.round(amount * factor) / factor,
      currency: currencyCode,
      note: note.trim(),
      createdAt,
    };
    if (isExpense) data.category = selectedId;
    else data.source = selectedId;
    if (isEdit) data.id = editEntry.id;
    onSubmit(data);
    if (!isEdit) reset();
    Keyboard.dismiss();
  };

  const handleDelete = () => {
    if (!isEdit) return;
    const run = () => onDelete(editEntry.id);
    const title = isExpense ? t('edit.delete') : t('income.delete');
    const message = isExpense ? t('edit.deleteConfirm') : t('income.deleteConfirm');
    if (Platform.OS === 'web') {
      if (window.confirm(message)) run();
      return;
    }
    Alert.alert(title, message, [
      { text: t('common.cancel'), style: 'cancel' },
      { text: t('common.delete'), style: 'destructive', onPress: run },
    ]);
  };

  const pickSelector = (id) => {
    if (id === selectedId) return;
    colorFrom.current = colorTo.current;
    colorTo.current = colorOf(id);
    setSelectedId(id);
    colorAnim.setValue(0);
    Animated.timing(colorAnim, { toValue: 1, duration: COLOR_MS, useNativeDriver: false }).start();
  };

  const toggleDatePicker = () => {
    const next = !datePickerOpen;
    if (next) {
      const selected = dateForOffset(dayOffset);
      setCalMonth({ year: selected.getFullYear(), month: selected.getMonth() });
    }
    setDatePickerOpen(next);
    Animated.timing(calAnim, { toValue: next ? 1 : 0, duration: 250, useNativeDriver: false }).start();
  };

  const toggleSplit = () => {
    const next = !splitOpen;
    setSplitOpen(next);
    Animated.timing(splitAnim, { toValue: next ? 1 : 0, duration: 250, useNativeDriver: false }).start();
  };

  const shiftCalMonth = (delta) =>
    setCalMonth(({ year, month }) => {
      const d = new Date(year, month + delta, 1);
      return { year: d.getFullYear(), month: d.getMonth() };
    });

  const pickDay = (day) => {
    setDayOffset(offsetForDay(calMonth.year, calMonth.month, day));
    setDatePickerOpen(false);
    Animated.timing(calAnim, { toValue: 0, duration: 250, useNativeDriver: false }).start();
  };

  const today = new Date();
  const viewingCurrentMonth =
    calMonth.year === today.getFullYear() && calMonth.month === today.getMonth();

  const cardBorderColor = colorAnim.interpolate({
    inputRange: [0, 1],
    outputRange: [colorFrom.current, colorTo.current],
  });
  const cardTintColor = colorAnim.interpolate({
    inputRange: [0, 1],
    outputRange: [`${colorFrom.current}1F`, `${colorTo.current}1F`],
  });

  return (
    <Animated.View style={[styles.card, { borderColor: cardBorderColor }]}>
      <Animated.View
        pointerEvents="none"
        style={[StyleSheet.absoluteFill, { backgroundColor: cardTintColor }]}
      />
      <ScrollView
        style={styles.scroll}
        contentContainerStyle={styles.scrollContent}
        keyboardShouldPersistTaps="handled"
      >
        <View style={styles.header}>
          <View style={styles.headerSide} />
          <View style={styles.headerCenter}>
            {isEdit ? (
              <Text style={styles.title}>{t(isExpense ? 'edit.title' : 'income.edit')}</Text>
            ) : (
              <EntryTypeToggle mode={mode} onChange={onChangeType} />
            )}
          </View>
          <Pressable
            onPress={onClose}
            hitSlop={8}
            accessibilityRole="button"
            accessibilityLabel={t('common.close')}
            style={({ pressed }) => [styles.closeButton, pressed && styles.chipPressed]}
          >
            <HIcon name="cancel-01" size={20} color={colors.icon} />
          </Pressable>
        </View>

        <View style={styles.dateSection}>
          <View style={styles.dateRow}>
            <Pressable
              onPress={toggleDatePicker}
              hitSlop={8}
              accessibilityRole="button"
              accessibilityLabel={t('add.chooseDate')}
              accessibilityState={{ expanded: datePickerOpen }}
              style={({ pressed }) => [styles.dateArrow, pressed && styles.chipPressed]}
            >
              <CalendarIcon color={colors.textSecondary} />
            </Pressable>
            <Pressable
              onPress={() => setDayOffset((offset) => offset - 1)}
              hitSlop={8}
              accessibilityLabel={t('add.prevDay')}
              style={({ pressed }) => [styles.dateArrow, pressed && styles.chipPressed]}
            >
              <HIcon name="chevron-left" size={16} color={colors.icon} />
            </Pressable>
            <Text style={styles.dateLabel}>
              {dayLabel(dateForOffset(dayOffset).getTime(), language)}
            </Text>
            <Pressable
              onPress={() => setDayOffset((offset) => Math.min(0, offset + 1))}
              disabled={dayOffset === 0}
              hitSlop={8}
              accessibilityLabel={t('add.nextDay')}
              style={({ pressed }) => [
                styles.dateArrow,
                dayOffset === 0 && styles.dateArrowDisabled,
                pressed && dayOffset !== 0 && styles.chipPressed,
              ]}
            >
              <HIcon name="chevron-right" size={16} color={colors.icon} />
            </Pressable>
          </View>

          <Animated.View style={{ maxHeight: calAnim.interpolate({ inputRange: [0, 1], outputRange: [0, calContentH] }), opacity: calAnim, overflow: 'hidden' }}>
            <View style={styles.calendar} onLayout={(e) => { setCalContentH(e.nativeEvent.layout.height + spacing.sm); }}>
              <View style={styles.calendarHeader}>
                <Pressable
                  onPress={() => shiftCalMonth(-1)}
                  hitSlop={8}
                  accessibilityLabel={t('add.prevMonth')}
                  style={({ pressed }) => [styles.dateArrow, pressed && styles.chipPressed]}
                >
                  <HIcon name="chevron-left" size={16} color={colors.icon} />
                </Pressable>
                <Text style={styles.calendarMonthLabel}>
                  {monthLabel(new Date(calMonth.year, calMonth.month, 1), language)}
                </Text>
                <Pressable
                  onPress={() => shiftCalMonth(1)}
                  disabled={viewingCurrentMonth}
                  hitSlop={8}
                  accessibilityLabel={t('add.nextMonth')}
                  style={({ pressed }) => [
                    styles.dateArrow,
                    viewingCurrentMonth && styles.dateArrowDisabled,
                    pressed && !viewingCurrentMonth && styles.chipPressed,
                  ]}
                >
                  <HIcon name="chevron-right" size={16} color={colors.icon} />
                </Pressable>
              </View>
              <View style={styles.calendarWeekRow}>
                {getDateNames(language).weekdayLetters.map((letter, i) => (
                  <Text key={i} style={styles.calendarWeekday}>
                    {letter}
                  </Text>
                ))}
              </View>
              {buildCalendarWeeks(calMonth.year, calMonth.month).map((week, wi) => (
                <View key={wi} style={styles.calendarWeekRow}>
                  {week.map((day, di) => {
                    if (day === null) return <View key={di} style={styles.calendarCell} />;
                    const offset = offsetForDay(calMonth.year, calMonth.month, day);
                    const selected = offset === dayOffset;
                    const disabled = offset > 0;
                    return (
                      <Pressable
                        key={di}
                        onPress={() => pickDay(day)}
                        disabled={disabled}
                        accessibilityRole="button"
                        accessibilityState={{ selected, disabled }}
                        style={({ pressed }) => [
                          styles.calendarCell,
                          selected && styles.calendarCellSelected,
                          pressed && !selected && styles.chipPressed,
                        ]}
                      >
                        <Text
                          style={[
                            styles.calendarCellText,
                            disabled && styles.calendarCellTextDisabled,
                            selected && styles.calendarCellTextSelected,
                          ]}
                        >
                          {day}
                        </Text>
                      </Pressable>
                    );
                  })}
                </View>
              ))}
            </View>
          </Animated.View>
        </View>

        <View style={styles.amountArea}>
          <View style={styles.amountRow}>
            <Text style={styles.currencySymbol} numberOfLines={1}>{currency.symbol}</Text>
            <TextInput
              style={styles.amountInput}
              value={amountText}
              onChangeText={(text) => setAmountText(text.replace(/[^0-9.,]/g, ''))}
              placeholder={currency.decimals === 0 ? '0' : '0.00'}
              placeholderTextColor={colors.textMuted}
              keyboardType={currency.decimals === 0 ? 'number-pad' : 'decimal-pad'}
              keyboardAppearance={colors.keyboardAppearance}
              maxLength={AMOUNT_MAX_LENGTH}
              accessibilityLabel={t(isExpense ? 'add.amountLabel' : 'income.amount')}
            />
            {/* Always reserve the 72px right spacer so the amount stays centered
                identically in both modes; the ÷ split toggle is expense-only. */}
            <View style={styles.splitToggleWrap}>
              {isExpense && (
                <Pressable
                  onPress={toggleSplit}
                  hitSlop={6}
                  style={({ pressed }) => [
                    styles.splitToggle,
                    splitOpen && styles.splitToggleActive,
                    pressed && styles.chipPressed,
                  ]}
                >
                  <Text style={[styles.splitToggleText, splitOpen && styles.splitToggleTextActive]}>÷</Text>
                </Pressable>
              )}
            </View>
          </View>

          {isExpense && (
            <Animated.View style={{ maxHeight: splitAnim.interpolate({ inputRange: [0, 1], outputRange: [0, splitContentH] }), opacity: splitAnim, overflow: 'hidden' }}>
              <View style={styles.splitRow} onLayout={(e) => { setSplitContentH(e.nativeEvent.layout.height + spacing.sm); }}>
                <Pressable
                  onPress={() => setSplitBy((v) => Math.max(2, v - 1))}
                  hitSlop={4}
                  style={({ pressed }) => [styles.splitBtn, pressed && styles.chipPressed]}
                >
                  <Text style={styles.splitBtnText}>−</Text>
                </Pressable>
                <Text style={styles.splitByText}>{splitBy}</Text>
                <Pressable
                  onPress={() => setSplitBy((v) => Math.min(99, v + 1))}
                  hitSlop={4}
                  style={({ pressed }) => [styles.splitBtn, pressed && styles.chipPressed]}
                >
                  <Text style={styles.splitBtnText}>+</Text>
                </Pressable>
                {splitResult != null && (
                  <>
                    <Text style={styles.splitEquals}>=</Text>
                    <Text style={styles.splitResultText}>
                      {currency.symbol}{splitResult}
                    </Text>
                    <Pressable
                      onPress={applySplit}
                      style={({ pressed }) => [styles.splitApply, pressed && { opacity: 0.7 }]}
                    >
                      <Text style={styles.splitApplyText}>✓</Text>
                    </Pressable>
                  </>
                )}
              </View>
            </Animated.View>
          )}
        </View>

        <ScrollView
          horizontal
          showsHorizontalScrollIndicator={false}
          style={styles.currencyScroll}
          contentContainerStyle={styles.currencyRow}
          keyboardShouldPersistTaps="handled"
        >
          {CURRENCIES.map((option) => {
            const selected = option.code === currencyCode;
            return (
              <Pressable
                key={option.code}
                onPress={() => setManualCurrency(option.code)}
                accessibilityRole="button"
                accessibilityState={{ selected }}
                style={({ pressed }) => [
                  styles.currencyChip,
                  selected && styles.currencyChipSelected,
                  pressed && !selected && styles.chipPressed,
                ]}
              >
                <Text
                  style={[
                    styles.currencyChipText,
                    selected && styles.currencyChipTextSelected,
                  ]}
                >
                  {option.symbol} {option.code}
                </Text>
              </Pressable>
            );
          })}
        </ScrollView>

        <View style={styles.noteRow}>
          <TextInput
            style={styles.noteInput}
            value={note}
            onChangeText={setNote}
            placeholder={t(isExpense ? 'add.notePlaceholder' : 'income.descriptionPlaceholder')}
            placeholderTextColor={colors.textMuted}
            maxLength={NOTE_MAX_LENGTH}
            keyboardAppearance={colors.keyboardAppearance}
            returnKeyType="done"
            onSubmitEditing={handleSubmit}
          />
          <Text style={styles.noteCounter}>{note.length}/{NOTE_MAX_LENGTH}</Text>
        </View>

        {/* The ONLY structural difference between the two modes. */}
        {isExpense ? (
          <View style={styles.categoryScroll}>
            <ScrollView
              horizontal
              pagingEnabled
              showsHorizontalScrollIndicator={false}
              keyboardShouldPersistTaps="handled"
              onScroll={onCatScroll}
              scrollEventThrottle={16}
              decelerationRate="fast"
            >
              {categoryPages.map((pageCats, pi) => (
                <View key={pi} style={{ width: catPageWidth }}>
                  {[pageCats.slice(0, Math.ceil(pageCats.length / 2)),
                    pageCats.slice(Math.ceil(pageCats.length / 2))].map((row, ri) => (
                    <View key={ri} style={styles.categoryRow}>
                      {row.map((category) => {
                        const selected = category.id === selectedId;
                        return (
                          <Pressable
                            key={category.id}
                            onPress={() => pickSelector(category.id)}
                            accessibilityRole="button"
                            accessibilityState={{ selected }}
                            style={[styles.categoryItem, { width: catItemWidth }]}
                          >
                            <View
                              style={[
                                styles.categoryCircle,
                                { backgroundColor: `${category.color}1A` },
                                selected && {
                                  backgroundColor: `${category.color}33`,
                                  borderColor: category.color,
                                },
                              ]}
                            >
                              <HIcon name={category.emoji} size={22} color={category.color} />
                            </View>
                            <Text
                              style={[
                                styles.categoryLabel,
                                selected && styles.categoryLabelSelected,
                              ]}
                              numberOfLines={1}
                            >
                              {labelOf(category)}
                            </Text>
                          </Pressable>
                        );
                      })}
                    </View>
                  ))}
                </View>
              ))}
            </ScrollView>
            {categoryPages.length > 1 && (
              <View style={styles.pageDots}>
                {categoryPages.map((_, i) => (
                  <View
                    key={i}
                    style={[
                      styles.pageDot,
                      i === catPage && { backgroundColor: colors.textPrimary },
                    ]}
                  />
                ))}
              </View>
            )}
          </View>
        ) : (
          <View style={styles.sourceWrap}>
            {selectorItems.map((source) => {
              const selected = source.id === selectedId;
              return (
                <Pressable
                  key={source.id}
                  onPress={() => pickSelector(source.id)}
                  accessibilityRole="button"
                  accessibilityState={{ selected }}
                  style={({ pressed }) => [
                    styles.sourcePill,
                    selected && { backgroundColor: `${source.color}26`, borderColor: source.color },
                    pressed && !selected && styles.chipPressed,
                  ]}
                >
                  <View style={[styles.sourceDot, { backgroundColor: source.color }]} />
                  <Text style={[styles.sourcePillText, selected && styles.sourcePillTextSelected]}>
                    {labelOf(source)}
                  </Text>
                </Pressable>
              );
            })}
          </View>
        )}

        <Pressable
          onPress={handleSubmit}
          disabled={!isValid}
          accessibilityRole="button"
          accessibilityState={{ disabled: !isValid }}
          style={({ pressed }) => [
            styles.saveButton,
            { backgroundColor: accent },
            !isValid && styles.saveButtonDisabled,
            pressed && isValid && styles.saveButtonPressed,
          ]}
        >
          <Text style={styles.saveButtonText}>
            {t(isEdit ? 'edit.save' : (isExpense ? 'add.save' : 'income.add'))}
          </Text>
        </Pressable>

        {isEdit && (
          <Pressable
            onPress={handleDelete}
            accessibilityRole="button"
            style={({ pressed }) => [styles.deleteButton, pressed && styles.chipPressed]}
          >
            <Text style={styles.deleteButtonText}>
              {t(isExpense ? 'edit.delete' : 'income.delete')}
            </Text>
          </Pressable>
        )}
      </ScrollView>
    </Animated.View>
  );
}

function CalendarIcon({ color, size = 18 }) {
  return (
    <Svg width={size} height={size} viewBox="0 0 512 512" fill="none">
      <Rect x="48" y="80" width="370" height="380" rx="56" stroke={color} strokeWidth="48" fill="none" />
      <Rect x="128" y="16" width="48" height="112" rx="24" fill={color} />
      <Rect x="288" y="16" width="48" height="112" rx="24" fill={color} />
      <Circle cx="144" cy="240" r="24" fill={color} />
      <Circle cx="240" cy="240" r="24" fill={color} />
      <Circle cx="336" cy="240" r="24" fill={color} />
      <Circle cx="144" cy="336" r="24" fill={color} />
      <Circle cx="240" cy="336" r="24" fill={color} />
      <Circle cx="400" cy="400" r="96" fill="none" stroke={color} strokeWidth="44" />
      <Path d="M400 352 L400 400 L432 420" stroke={color} strokeWidth="36" strokeLinecap="round" strokeLinejoin="round" fill="none" />
    </Svg>
  );
}

const createStyles = (colors) =>
  StyleSheet.create({
    card: {
      backgroundColor: colors.background,
      borderRadius: radius.lg,
      borderWidth: 1.5,
      flexShrink: 1,
      overflow: 'hidden',
    },
    scroll: {
      flexGrow: 0,
      flexShrink: 1,
    },
    scrollContent: {
      padding: spacing.lg,
    },
    header: {
      flexDirection: 'row',
      alignItems: 'center',
      marginBottom: spacing.md,
    },
    headerSide: {
      width: 32,
    },
    headerCenter: {
      flex: 1,
      alignItems: 'center',
      justifyContent: 'center',
    },
    title: {
      color: colors.textPrimary,
      fontFamily: fonts.bold,
      fontSize: 18,
    },
    closeButton: {
      width: 32,
      height: 32,
      borderRadius: 16,
      alignItems: 'center',
      justifyContent: 'center',
      backgroundColor: colors.card,
    },
    amountArea: {
      marginBottom: spacing.sm,
    },
    amountRow: {
      flexDirection: 'row',
      alignItems: 'center',
    },
    currencySymbol: {
      color: colors.textSecondary,
      fontFamily: fonts.numBold,
      fontSize: 30,
      width: 72,
      flexShrink: 0,
      textAlign: 'left',
    },
    amountInput: {
      flex: 1,
      minWidth: 0,
      color: colors.textPrimary,
      fontFamily: fonts.numBold,
      fontSize: 40,
      textAlign: 'center',
      fontVariant: ['tabular-nums'],
    },
    splitToggleWrap: {
      width: 72,
      flexShrink: 0,
      alignItems: 'flex-end',
      justifyContent: 'center',
    },
    chipPressed: {
      backgroundColor: colors.cardPressed,
    },
    currencyScroll: {
      marginBottom: spacing.md,
      flexGrow: 0,
    },
    currencyRow: {
      flexDirection: 'row',
      justifyContent: 'center',
      gap: spacing.xs,
      flexGrow: 1,
    },
    currencyChip: {
      backgroundColor: colors.card,
      borderRadius: 16,
      borderWidth: 1,
      borderColor: 'transparent',
      paddingHorizontal: spacing.sm,
      paddingVertical: spacing.xs,
    },
    currencyChipSelected: {
      backgroundColor: `${colors.accent}33`,
      borderColor: colors.accent,
    },
    currencyChipText: {
      color: colors.textSecondary,
      fontFamily: fonts.bold,
      fontSize: 13,
    },
    currencyChipTextSelected: {
      color: colors.textPrimary,
    },
    noteRow: {
      flexDirection: 'row',
      alignItems: 'center',
      backgroundColor: colors.card,
      borderRadius: radius.sm,
      paddingHorizontal: spacing.md,
      marginBottom: spacing.md,
    },
    noteInput: {
      flex: 1,
      color: colors.textPrimary,
      paddingVertical: spacing.sm + 4,
      fontFamily: fonts.regular,
      fontSize: 15,
    },
    noteCounter: {
      color: colors.textMuted,
      fontFamily: fonts.regular,
      fontSize: 12,
      marginLeft: spacing.sm,
    },
    categoryScroll: {
      marginBottom: spacing.md,
    },
    pageDots: {
      flexDirection: 'row',
      justifyContent: 'center',
      gap: 6,
      paddingTop: spacing.xs,
    },
    pageDot: {
      width: 6,
      height: 6,
      borderRadius: 3,
      backgroundColor: colors.border,
    },
    categoryRow: {
      flexDirection: 'row',
    },
    categoryItem: {
      alignItems: 'center',
      paddingVertical: spacing.sm,
    },
    categoryCircle: {
      width: 52,
      height: 52,
      borderRadius: 26,
      alignItems: 'center',
      justifyContent: 'center',
      borderWidth: 2.5,
      borderColor: 'transparent',
    },
    categoryLabel: {
      color: colors.textSecondary,
      fontFamily: fonts.bold,
      fontSize: 12,
      marginTop: spacing.xs,
      textAlign: 'center',
    },
    categoryLabelSelected: {
      color: colors.textPrimary,
    },
    sourceWrap: {
      flexDirection: 'row',
      flexWrap: 'wrap',
      justifyContent: 'center',
      gap: spacing.sm,
      marginBottom: spacing.md,
    },
    sourcePill: {
      flexDirection: 'row',
      alignItems: 'center',
      gap: spacing.xs + 2,
      backgroundColor: colors.card,
      borderRadius: 18,
      borderWidth: 1,
      borderColor: 'transparent',
      paddingHorizontal: spacing.sm + 2,
      paddingVertical: spacing.xs + 2,
    },
    sourceDot: {
      width: 10,
      height: 10,
      borderRadius: 5,
    },
    sourcePillText: {
      color: colors.textSecondary,
      fontFamily: fonts.bold,
      fontSize: 13,
    },
    sourcePillTextSelected: {
      color: colors.textPrimary,
    },
    dateSection: {
      marginBottom: spacing.md,
    },
    dateRow: {
      flexDirection: 'row',
      alignItems: 'center',
      backgroundColor: colors.card,
      borderRadius: radius.sm,
      paddingHorizontal: spacing.sm,
      paddingVertical: spacing.sm,
    },
    dateArrow: {
      width: 36,
      height: 36,
      borderRadius: 18,
      alignItems: 'center',
      justifyContent: 'center',
    },
    dateArrowDisabled: {
      opacity: 0.3,
    },
    dateLabel: {
      flex: 1,
      color: colors.textPrimary,
      fontFamily: fonts.bold,
      fontSize: 15,
      textAlign: 'center',
    },
    calendar: {
      backgroundColor: colors.card,
      borderRadius: radius.sm,
      borderWidth: 1,
      borderColor: colors.border,
      padding: spacing.sm,
      paddingBottom: spacing.sm + 4,
      marginTop: spacing.sm,
    },
    calendarHeader: {
      flexDirection: 'row',
      alignItems: 'center',
      marginBottom: spacing.xs,
    },
    calendarMonthLabel: {
      flex: 1,
      textAlign: 'center',
      color: colors.textPrimary,
      fontFamily: fonts.bold,
      fontSize: 14,
    },
    calendarWeekRow: {
      flexDirection: 'row',
    },
    calendarWeekday: {
      flex: 1,
      textAlign: 'center',
      color: colors.textMuted,
      fontFamily: fonts.bold,
      fontSize: 11,
      paddingVertical: spacing.xs,
    },
    calendarCell: {
      flex: 1,
      height: 34,
      alignItems: 'center',
      justifyContent: 'center',
      borderRadius: 17,
    },
    calendarCellSelected: {
      backgroundColor: colors.accent,
    },
    calendarCellText: {
      color: colors.textPrimary,
      fontFamily: fonts.bold,
      fontSize: 13,
      fontVariant: ['tabular-nums'],
    },
    calendarCellTextDisabled: {
      color: colors.textMuted,
      opacity: 0.5,
    },
    calendarCellTextSelected: {
      color: colors.onAccent,
    },
    saveButton: {
      borderRadius: radius.md,
      paddingVertical: spacing.md,
      alignItems: 'center',
    },
    saveButtonPressed: {
      opacity: 0.85,
    },
    saveButtonDisabled: {
      opacity: 0.4,
    },
    saveButtonText: {
      color: colors.onAccent,
      fontFamily: fonts.bold,
      fontSize: 16,
    },
    deleteButton: {
      alignItems: 'center',
      paddingVertical: spacing.sm + 4,
      marginTop: spacing.sm,
      borderRadius: radius.md,
    },
    deleteButtonText: {
      color: colors.danger,
      fontFamily: fonts.bold,
      fontSize: 15,
    },
    splitToggle: {
      width: 28,
      height: 28,
      borderRadius: 14,
      flexShrink: 0,
      alignItems: 'center',
      justifyContent: 'center',
      backgroundColor: colors.card,
    },
    splitToggleActive: {
      backgroundColor: colors.accent,
    },
    splitToggleText: {
      color: colors.textMuted,
      fontFamily: fonts.numBold,
      fontSize: 16,
    },
    splitToggleTextActive: {
      color: colors.onAccent,
    },
    splitRow: {
      flexDirection: 'row',
      alignItems: 'center',
      justifyContent: 'center',
      gap: spacing.sm,
      marginTop: spacing.sm,
      backgroundColor: colors.card,
      borderRadius: radius.sm,
      paddingVertical: spacing.sm,
      paddingHorizontal: spacing.md,
    },
    splitBtn: {
      width: 28,
      height: 28,
      borderRadius: 14,
      alignItems: 'center',
      justifyContent: 'center',
      backgroundColor: colors.background,
    },
    splitBtnText: {
      color: colors.textPrimary,
      fontFamily: fonts.numBold,
      fontSize: 16,
      lineHeight: 18,
    },
    splitByText: {
      color: colors.textPrimary,
      fontFamily: fonts.numBold,
      fontSize: 18,
      minWidth: 24,
      textAlign: 'center',
      fontVariant: ['tabular-nums'],
    },
    splitEquals: {
      color: colors.textMuted,
      fontFamily: fonts.numRegular,
      fontSize: 16,
    },
    splitResultText: {
      color: colors.accent,
      fontFamily: fonts.numBold,
      fontSize: 16,
      fontVariant: ['tabular-nums'],
    },
    splitApply: {
      width: 28,
      height: 28,
      borderRadius: 14,
      alignItems: 'center',
      justifyContent: 'center',
      backgroundColor: colors.accent,
    },
    splitApplyText: {
      color: colors.onAccent,
      fontSize: 14,
    },
  });
