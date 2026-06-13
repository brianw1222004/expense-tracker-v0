import { useMemo, useRef, useState } from 'react';
import {
  Animated,
  Keyboard,
  Pressable,
  ScrollView,
  StyleSheet,
  Text,
  TextInput,
  View,
} from 'react-native';
import { fonts, spacing, radius, useTheme } from '../theme';
import { getDateNames, useLanguage, useT } from '../i18n';
import { CATEGORIES, getCategory } from '../categories';
import { CURRENCIES, getCurrency } from '../currency';
import { dayLabel, monthLabel } from '../format';

const MS_PER_DAY = 24 * 60 * 60 * 1000;
const COLOR_MS = 350;

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

// Rows of 7 cells (Sunday-first); null pads days outside the month.
function buildCalendarWeeks(year, month) {
  const startWeekday = new Date(year, month, 1).getDay();
  const daysInMonth = new Date(year, month + 1, 0).getDate();
  const cells = Array(startWeekday).fill(null);
  for (let day = 1; day <= daysInMonth; day++) cells.push(day);
  while (cells.length % 7 !== 0) cells.push(null);
  const weeks = [];
  for (let i = 0; i < cells.length; i += 7) weeks.push(cells.slice(i, i + 7));
  return weeks;
}

// Rendered inside AddExpenseModal as the popup card. The card's border and
// background tint follow the selected category's color (animated).
export default function AddExpenseScreen({ displayCurrency, onSubmit, onClose }) {
  const { colors } = useTheme();
  const t = useT();
  const language = useLanguage();
  const styles = useMemo(() => createStyles(colors), [colors]);

  const [amountText, setAmountText] = useState('');
  const [note, setNote] = useState('');
  const [categoryId, setCategoryId] = useState(CATEGORIES[0].id);
  // null = follow displayCurrency; set once the user picks a chip themselves.
  const [manualCurrency, setManualCurrency] = useState(null);
  const [currencyPickerOpen, setCurrencyPickerOpen] = useState(false);
  // Days back from today; 0 = today, never positive (no future expenses).
  const [dayOffset, setDayOffset] = useState(0);
  const [datePickerOpen, setDatePickerOpen] = useState(false);
  // Month shown in the calendar dropdown.
  const [calMonth, setCalMonth] = useState(() => {
    const d = new Date();
    return { year: d.getFullYear(), month: d.getMonth() };
  });

  // Color transitions interpolate from the previously shown category color to
  // the newly picked one; colors can't animate on the native driver.
  const colorAnim = useRef(new Animated.Value(1)).current;
  const colorFrom = useRef(CATEGORIES[0].color);
  const colorTo = useRef(CATEGORIES[0].color);

  const currencyCode = manualCurrency ?? displayCurrency;
  const currency = getCurrency(currencyCode);

  // Strict shape check before parseFloat: bare parseFloat accepts '1.2.3' as 1.2
  // and would silently save a different amount than the user sees.
  // 0-decimal currencies (JPY, TWD) only accept whole numbers.
  const normalized = amountText.replace(',', '.');
  const amount = parseFloat(normalized);
  const pattern = currency.decimals === 0 ? /^\d+$/ : /^(\d+(\.\d{0,2})?|\.\d{1,2})$/;
  const isValid = pattern.test(normalized) && amount > 0;

  const reset = () => {
    setAmountText('');
    setNote('');
    setCategoryId(CATEGORIES[0].id);
    setManualCurrency(null);
    setCurrencyPickerOpen(false);
    setDayOffset(0);
    setDatePickerOpen(false);
    colorFrom.current = CATEGORIES[0].color;
    colorTo.current = CATEGORIES[0].color;
    colorAnim.setValue(1);
  };

  const handleSubmit = () => {
    if (!isValid) return;
    const factor = 10 ** currency.decimals;
    onSubmit({
      amount: Math.round(amount * factor) / factor,
      currency: currencyCode,
      note: note.trim(),
      category: categoryId,
      createdAt: dayOffset === 0 ? Date.now() : dateForOffset(dayOffset).getTime(),
    });
    reset();
    Keyboard.dismiss();
  };

  const pickCurrency = (code) => {
    setManualCurrency(code);
    setCurrencyPickerOpen(false);
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
          <Text style={styles.title}>{t('add.title')}</Text>
          <Pressable
            onPress={onClose}
            hitSlop={8}
            accessibilityRole="button"
            accessibilityLabel={t('common.close')}
            style={({ pressed }) => [styles.closeButton, pressed && styles.chipPressed]}
          >
            <Text style={styles.closeGlyph}>{'✕'}</Text>
          </Pressable>
        </View>

        <View style={styles.amountRow}>
          <Text style={styles.currencySymbol}>{currency.symbol}</Text>
          <TextInput
            style={styles.amountInput}
            value={amountText}
            onChangeText={setAmountText}
            placeholder={currency.decimals === 0 ? '0' : '0.00'}
            placeholderTextColor={colors.textMuted}
            keyboardType={currency.decimals === 0 ? 'number-pad' : 'decimal-pad'}
            keyboardAppearance={colors.keyboardAppearance}
            maxLength={9}
          />
          <Pressable
            onPress={() => setCurrencyPickerOpen((open) => !open)}
            hitSlop={8}
            accessibilityRole="button"
            accessibilityLabel={t('add.currency', { code: currencyCode })}
            accessibilityState={{ expanded: currencyPickerOpen }}
            style={({ pressed }) => [styles.currencyChip, pressed && styles.chipPressed]}
          >
            <Text style={styles.currencyChipText}>
              {currencyCode} {currencyPickerOpen ? '▴' : '▾'}
            </Text>
          </Pressable>
        </View>

        {currencyPickerOpen && (
          <View style={styles.currencyOptions}>
            {CURRENCIES.map((option) => {
              const selected = option.code === currencyCode;
              return (
                <Pressable
                  key={option.code}
                  onPress={() => pickCurrency(option.code)}
                  accessibilityRole="button"
                  accessibilityState={{ selected }}
                  style={({ pressed }) => [
                    styles.currencyOption,
                    selected && styles.currencyOptionSelected,
                    pressed && !selected && styles.chipPressed,
                  ]}
                >
                  <Text
                    style={[
                      styles.currencyOptionText,
                      selected && styles.currencyOptionTextSelected,
                    ]}
                  >
                    {option.code}
                  </Text>
                </Pressable>
              );
            })}
          </View>
        )}

        <TextInput
          style={styles.noteInput}
          value={note}
          onChangeText={setNote}
          placeholder={t('add.notePlaceholder')}
          placeholderTextColor={colors.textMuted}
          maxLength={60}
          keyboardAppearance={colors.keyboardAppearance}
          returnKeyType="done"
          onSubmitEditing={handleSubmit}
        />

        <View style={styles.categoryGrid}>
          {CATEGORIES.map((category) => {
            const selected = category.id === categoryId;
            return (
              <Pressable
                key={category.id}
                onPress={() => pickCategory(category.id)}
                accessibilityRole="button"
                accessibilityState={{ selected }}
                style={({ pressed }) => [
                  styles.categoryChip,
                  selected && { backgroundColor: `${category.color}33`, borderColor: category.color },
                  pressed && !selected && styles.chipPressed,
                ]}
              >
                <Text style={styles.categoryEmoji}>{category.emoji}</Text>
                <Text style={[styles.categoryLabel, selected && { color: colors.textPrimary }]}>
                  {t('cat.' + category.id)}
                </Text>
              </Pressable>
            );
          })}
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
              <Text style={styles.calendarIcon}>{'\u{1F4C5}'}</Text>
            </Pressable>
            <Pressable
              onPress={() => setDayOffset((offset) => offset - 1)}
              hitSlop={8}
              accessibilityLabel={t('add.prevDay')}
              style={({ pressed }) => [styles.dateArrow, pressed && styles.chipPressed]}
            >
              <Text style={styles.dateArrowText}>{'◀'}</Text>
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
              <Text style={styles.dateArrowText}>{'▶'}</Text>
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
                  <Text style={styles.dateArrowText}>{'◀'}</Text>
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
                  <Text style={styles.dateArrowText}>{'▶'}</Text>
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
                    const disabled = offset > 0; // no future expenses
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

        <Pressable
          onPress={handleSubmit}
          disabled={!isValid}
          style={({ pressed }) => [
            styles.saveButton,
            !isValid && styles.saveButtonDisabled,
            pressed && isValid && styles.saveButtonPressed,
          ]}
        >
          <Text style={styles.saveButtonText}>{t('add.save')}</Text>
        </Pressable>
      </ScrollView>
    </Animated.View>
  );
}

const createStyles = (colors) =>
  StyleSheet.create({
    // flexShrink (not a % maxHeight, which doesn't resolve against an
    // auto-height parent) lets the modal's maxHeight bound squeeze the card so
    // the ScrollView scrolls instead of overflowing.
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
      fontSize: 20,
    },
    closeButton: {
      width: 32,
      height: 32,
      borderRadius: 16,
      alignItems: 'center',
      justifyContent: 'center',
      backgroundColor: colors.card,
    },
    closeGlyph: {
      color: colors.textSecondary,
      fontFamily: fonts.bold,
      fontSize: 15,
    },
    amountRow: {
      flexDirection: 'row',
      alignItems: 'center',
      justifyContent: 'center',
      marginBottom: spacing.md,
    },
    currencySymbol: {
      color: colors.textSecondary,
      fontFamily: fonts.bold,
      fontSize: 34,
      marginRight: spacing.xs,
    },
    amountInput: {
      color: colors.textPrimary,
      fontFamily: fonts.bold,
      fontSize: 44,
      minWidth: 130,
      textAlign: 'center',
      fontVariant: ['tabular-nums'],
    },
    currencyChip: {
      backgroundColor: colors.card,
      borderRadius: 20,
      borderWidth: 1,
      borderColor: colors.border,
      paddingHorizontal: spacing.sm + 4,
      paddingVertical: spacing.xs + 2,
      marginLeft: spacing.sm,
    },
    currencyChipText: {
      color: colors.textSecondary,
      fontFamily: fonts.bold,
      fontSize: 14,
    },
    chipPressed: {
      backgroundColor: colors.cardPressed,
    },
    currencyOptions: {
      flexDirection: 'row',
      flexWrap: 'wrap',
      justifyContent: 'center',
      gap: spacing.sm,
      marginBottom: spacing.md,
    },
    currencyOption: {
      backgroundColor: colors.card,
      borderRadius: 20,
      borderWidth: 1,
      borderColor: 'transparent',
      paddingHorizontal: spacing.sm + 4,
      paddingVertical: spacing.sm,
    },
    currencyOptionSelected: {
      backgroundColor: `${colors.accent}33`,
      borderColor: colors.accent,
    },
    currencyOptionText: {
      color: colors.textSecondary,
      fontFamily: fonts.bold,
      fontSize: 14,
    },
    currencyOptionTextSelected: {
      color: colors.textPrimary,
    },
    noteInput: {
      backgroundColor: colors.card,
      color: colors.textPrimary,
      borderRadius: radius.sm,
      paddingHorizontal: spacing.md,
      paddingVertical: spacing.sm + 4,
      fontFamily: fonts.regular,
      fontSize: 16,
      marginBottom: spacing.md,
    },
    categoryGrid: {
      flexDirection: 'row',
      flexWrap: 'wrap',
      gap: spacing.sm,
      marginBottom: spacing.md,
    },
    categoryChip: {
      flexDirection: 'row',
      alignItems: 'center',
      backgroundColor: colors.card,
      borderRadius: 20,
      borderWidth: 1,
      borderColor: 'transparent',
      paddingHorizontal: spacing.sm + 4,
      paddingVertical: spacing.sm,
    },
    categoryEmoji: {
      fontSize: 16,
      marginRight: 5,
    },
    categoryLabel: {
      color: colors.textSecondary,
      fontFamily: fonts.bold,
      fontSize: 14,
    },
    dateSection: {
      marginBottom: spacing.lg,
    },
    dateRow: {
      flexDirection: 'row',
      alignItems: 'center',
      backgroundColor: colors.card,
      borderRadius: radius.sm,
      paddingHorizontal: spacing.sm,
      paddingVertical: spacing.sm,
    },
    calendarIcon: {
      fontSize: 16,
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
    dateArrowText: {
      color: colors.textSecondary,
      fontFamily: fonts.regular,
      fontSize: 14,
    },
    dateLabel: {
      flex: 1,
      color: colors.textPrimary,
      fontFamily: fonts.bold,
      fontSize: 16,
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
      fontSize: 15,
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
      fontSize: 14,
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
      fontSize: 17,
    },
  });
