import { useMemo, useRef, useState } from 'react';
import { Animated, Pressable, StyleSheet, Text, View } from 'react-native';
import Svg, { Circle, Path, Rect } from 'react-native-svg';
import { fonts, radius, spacing, useTheme } from '../theme';
import { getDateNames, useLanguage, useT } from '../i18n';
import { HIcon } from '../icons';
import { buildCalendarWeeks, dayLabel, monthLabel } from '../format';

const MS_PER_DAY = 24 * 60 * 60 * 1000;

// The chosen day at 12:00 local — keeps the entry safely inside the day even
// across DST shifts, while today keeps the real timestamp (set on submit).
export function dateForOffset(offset) {
  const d = new Date();
  d.setDate(d.getDate() + offset);
  d.setHours(12, 0, 0, 0);
  return d;
}

// Days from today to the given calendar day (negative = past). Both ends sit
// at 12:00 local so a DST hour can't skew the division.
export function offsetForDay(year, month, day) {
  const picked = new Date(year, month, day, 12, 0, 0, 0);
  const today = new Date();
  today.setHours(12, 0, 0, 0);
  return Math.round((picked - today) / MS_PER_DAY);
}

// Inline expanding date picker shared by the add forms (personal + shared): a
// date row (calendar toggle + prev/next-day arrows + the day label) over an
// animated month grid. `dayOffset` is days-from-today (0 = today, negative =
// past); future days are disabled. Calls `onChange(offset)` with the new offset.
export default function CalendarField({ dayOffset, onChange }) {
  const { colors } = useTheme();
  const t = useT();
  const language = useLanguage();
  const styles = useMemo(() => createStyles(colors), [colors]);

  const [datePickerOpen, setDatePickerOpen] = useState(false);
  const calAnim = useRef(new Animated.Value(0)).current;
  const [calContentH, setCalContentH] = useState(360);
  const [calMonth, setCalMonth] = useState(() => {
    const d = dateForOffset(dayOffset);
    return { year: d.getFullYear(), month: d.getMonth() };
  });

  const toggleDatePicker = () => {
    const next = !datePickerOpen;
    if (next) {
      const selected = dateForOffset(dayOffset);
      setCalMonth({ year: selected.getFullYear(), month: selected.getMonth() });
    }
    setDatePickerOpen(next);
    Animated.timing(calAnim, { toValue: next ? 1 : 0, duration: 250, useNativeDriver: false }).start();
  };

  const shiftCalMonth = (delta) =>
    setCalMonth(({ year, month }) => {
      const d = new Date(year, month + delta, 1);
      return { year: d.getFullYear(), month: d.getMonth() };
    });

  const pickDay = (day) => {
    onChange(offsetForDay(calMonth.year, calMonth.month, day));
    setDatePickerOpen(false);
    Animated.timing(calAnim, { toValue: 0, duration: 250, useNativeDriver: false }).start();
  };

  const today = new Date();
  const viewingCurrentMonth =
    calMonth.year === today.getFullYear() && calMonth.month === today.getMonth();

  return (
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
          onPress={() => onChange(dayOffset - 1)}
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
          onPress={() => onChange(Math.min(0, dayOffset + 1))}
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
    chipPressed: {
      backgroundColor: colors.cardPressed,
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
  });
