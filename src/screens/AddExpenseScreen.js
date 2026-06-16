import { useCallback, useMemo, useRef, useState } from 'react';
import {
  Animated,
  Keyboard,
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
import { HIcon } from '../icons';
import { CURRENCIES, getCurrency } from '../currency';
import { buildCalendarWeeks, dateKey, dayLabel, monthLabel } from '../format';

const MS_PER_DAY = 24 * 60 * 60 * 1000;
const NOTE_MAX_LENGTH = 20;
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

// Rendered inside AddExpenseModal as the popup card. The card's border and
// background tint follow the selected category's color (animated).
export default function AddExpenseScreen({ displayCurrency, onSubmit, onClose, editExpense, categories }) {
  const { colors } = useTheme();
  const t = useT();
  const language = useLanguage();
  const styles = useMemo(() => createStyles(colors), [colors]);

  const { width: screenWidth } = useWindowDimensions();
  const catPageWidth = screenWidth - spacing.lg * 4;
  const catItemWidth = catPageWidth / 4;

  const categoryPages = useMemo(() => {
    const pages = [];
    for (let i = 0; i < categories.length; i += CATS_PER_PAGE) {
      pages.push(categories.slice(i, i + CATS_PER_PAGE));
    }
    return pages;
  }, [categories]);

  const [catPage, setCatPage] = useState(0);
  const onCatScroll = useCallback((e) => {
    const page = Math.round(e.nativeEvent.contentOffset.x / catPageWidth);
    setCatPage(page);
  }, [catPageWidth]);

  const isEdit = editExpense != null;

  const [amountText, setAmountText] = useState(() =>
    isEdit ? String(editExpense.amount) : ''
  );
  const [note, setNote] = useState(isEdit ? (editExpense.note || '') : '');
  const [categoryId, setCategoryId] = useState(
    isEdit ? editExpense.category : categories[0].id
  );
  const [manualCurrency, setManualCurrency] = useState(
    isEdit ? editExpense.currency : null
  );
  const [dayOffset, setDayOffset] = useState(() => {
    if (!isEdit) return 0;
    const d = new Date(editExpense.createdAt);
    return offsetForDay(d.getFullYear(), d.getMonth(), d.getDate());
  });
  const [datePickerOpen, setDatePickerOpen] = useState(false);
  const [calMonth, setCalMonth] = useState(() => {
    const d = isEdit ? new Date(editExpense.createdAt) : new Date();
    return { year: d.getFullYear(), month: d.getMonth() };
  });

  // Color transitions interpolate from the previously shown category color to
  // the newly picked one; colors can't animate on the native driver.
  const initColor = isEdit ? getCategory(editExpense.category).color : categories[0].color;
  const colorAnim = useRef(new Animated.Value(1)).current;
  const colorFrom = useRef(initColor);
  const colorTo = useRef(initColor);

  const currencyCode = manualCurrency ?? displayCurrency;
  const currency = getCurrency(currencyCode);

  // Strict shape check before parseFloat: bare parseFloat accepts '1.2.3' as 1.2
  // and would silently save a different amount than the user sees.
  // 0-decimal currencies (JPY, TWD) only accept whole numbers.
  const normalized = amountText.replace(',', '.');
  const amount = parseFloat(normalized);
  const pattern = currency.decimals === 0
    ? /^\d+$/
    : new RegExp(`^(\\d+(\\.\\d{0,${currency.decimals}})?|\\.\\d{1,${currency.decimals}})$`);
  const isValid = pattern.test(normalized) && amount > 0;

  const reset = () => {
    setAmountText('');
    setNote('');
    setCategoryId(categories[0].id);
    setManualCurrency(null);
    setDayOffset(0);
    setDatePickerOpen(false);
    colorFrom.current = categories[0].color;
    colorTo.current = categories[0].color;
    colorAnim.setValue(1);
  };

  const handleSubmit = () => {
    if (!isValid) return;
    const factor = 10 ** currency.decimals;
    let createdAt;
    if (isEdit) {
      const newDay = dateKey(dateForOffset(dayOffset).getTime());
      const originalDay = dateKey(editExpense.createdAt);
      createdAt = newDay === originalDay ? editExpense.createdAt : dateForOffset(dayOffset).getTime();
    } else {
      createdAt = dayOffset === 0 ? Date.now() : dateForOffset(dayOffset).getTime();
    }
    const data = {
      amount: Math.round(amount * factor) / factor,
      currency: currencyCode,
      note: note.trim(),
      category: categoryId,
      createdAt,
    };
    if (isEdit) data.id = editExpense.id;
    onSubmit(data);
    if (!isEdit) reset();
    Keyboard.dismiss();
  };

  const pickCategory = (id) => {
    if (id === categoryId) return;
    colorFrom.current = colorTo.current;
    colorTo.current = getCategory(id).color;
    setCategoryId(id);
    colorAnim.setValue(0);
    Animated.timing(colorAnim, {
      toValue: 1,
      duration: COLOR_MS,
      useNativeDriver: false,
    }).start();
  };

  const toggleDatePicker = () => {
    if (!datePickerOpen) {
      const selected = dateForOffset(dayOffset);
      setCalMonth({ year: selected.getFullYear(), month: selected.getMonth() });
    }
    setDatePickerOpen((open) => !open);
  };

  const shiftCalMonth = (delta) =>
    setCalMonth(({ year, month }) => {
      const d = new Date(year, month + delta, 1);
      return { year: d.getFullYear(), month: d.getMonth() };
    });

  const pickDay = (day) => {
    setDayOffset(offsetForDay(calMonth.year, calMonth.month, day));
    setDatePickerOpen(false);
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
          <Text style={styles.title}>{t(isEdit ? 'edit.title' : 'add.title')}</Text>
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

          {datePickerOpen && (
            <View style={styles.calendar}>
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
          )}
        </View>

        <View style={styles.amountRow}>
          <Text style={styles.currencySymbol}>{currency.symbol}</Text>
          <TextInput
            style={styles.amountInput}
            value={amountText}
            onChangeText={(text) => setAmountText(text.replace(/[^0-9.,]/g, ''))}
            placeholder={currency.decimals === 0 ? '0' : '0.00'}
            placeholderTextColor={colors.textMuted}
            keyboardType={currency.decimals === 0 ? 'number-pad' : 'decimal-pad'}
            keyboardAppearance={colors.keyboardAppearance}
            maxLength={9}
          />
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
                  styles.currencyChipInline,
                  selected && styles.currencyChipInlineSelected,
                  pressed && !selected && styles.chipPressed,
                ]}
              >
                <Text
                  style={[
                    styles.currencyChipInlineText,
                    selected && styles.currencyChipInlineTextSelected,
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
            placeholder={t('add.notePlaceholder')}
            placeholderTextColor={colors.textMuted}
            maxLength={NOTE_MAX_LENGTH}
            keyboardAppearance={colors.keyboardAppearance}
            returnKeyType="done"
            onSubmitEditing={handleSubmit}
          />
          <Text style={styles.noteCounter}>{note.length}/{NOTE_MAX_LENGTH}</Text>
        </View>

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
                      const selected = category.id === categoryId;
                      return (
                        <Pressable
                          key={category.id}
                          onPress={() => pickCategory(category.id)}
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
                            {getCategoryLabel(category, t)}
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

        <Pressable
          onPress={handleSubmit}
          disabled={!isValid}
          style={({ pressed }) => [
            styles.saveButton,
            !isValid && styles.saveButtonDisabled,
            pressed && isValid && styles.saveButtonPressed,
          ]}
        >
          <Text style={styles.saveButtonText}>{t(isEdit ? 'edit.save' : 'add.save')}</Text>
        </Pressable>
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
      justifyContent: 'space-between',
      marginBottom: spacing.md,
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
    amountRow: {
      flexDirection: 'row',
      alignItems: 'center',
      justifyContent: 'center',
      marginBottom: spacing.sm,
    },
    currencySymbol: {
      color: colors.textSecondary,
      fontFamily: fonts.bold,
      fontSize: 30,
      marginRight: spacing.xs,
    },
    amountInput: {
      color: colors.textPrimary,
      fontFamily: fonts.bold,
      fontSize: 40,
      minWidth: 130,
      textAlign: 'center',
      fontVariant: ['tabular-nums'],
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
    currencyChipInline: {
      backgroundColor: colors.card,
      borderRadius: 16,
      borderWidth: 1,
      borderColor: 'transparent',
      paddingHorizontal: spacing.sm,
      paddingVertical: spacing.xs,
    },
    currencyChipInlineSelected: {
      backgroundColor: `${colors.accent}33`,
      borderColor: colors.accent,
    },
    currencyChipInlineText: {
      color: colors.textSecondary,
      fontFamily: fonts.bold,
      fontSize: 13,
    },
    currencyChipInlineTextSelected: {
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
      backgroundColor: colors.accent,
      borderRadius: radius.md,
      paddingVertical: spacing.md,
      alignItems: 'center',
    },
    saveButtonPressed: {
      backgroundColor: colors.accentDark,
    },
    saveButtonDisabled: {
      opacity: 0.4,
    },
    saveButtonText: {
      color: colors.onAccent,
      fontFamily: fonts.bold,
      fontSize: 16,
    },
  });
