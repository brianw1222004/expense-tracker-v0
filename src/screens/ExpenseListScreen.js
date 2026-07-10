import React, { useEffect, useMemo, useRef, useState } from 'react';
import { Modal, Pressable, ScrollView, StyleSheet, Text, View } from 'react-native';
import { fonts, radius, spacing, useTheme, cardShadow } from '../theme';
import { getDateNames, useLanguage, useT } from '../i18n';
import { getCategory, getCategoryLabel } from '../categories';
import { buildCalendarWeeks, dateKey, dayLabel, formatMoney, shiftMonthKey } from '../format';
import EmptyState from '../components/EmptyState';
import ExpenseRow from '../components/ExpenseRow';
import HeaderGlow from '../components/HeaderGlow';
import MonthSelector from '../components/MonthSelector';
import { TAB_BAR_HEIGHT } from '../components/TabBar';
import { HIcon } from '../icons';

function pad2(n) {
  return String(n).padStart(2, '0');
}

export default function ExpenseListScreen({
  sections,
  loaded,
  hasExpenses,
  categories,
  displayCurrency,
  onDelete,
  onAddPress,
  onLoadDemo,
  onEditPress,
}) {
  const { colors } = useTheme();
  const t = useT();
  const language = useLanguage();
  const styles = useMemo(() => createStyles(colors), [colors]);

  const today = dateKey(Date.now());
  const [selectedDate, setSelectedDate] = useState(today);
  const [calPeriod, setCalPeriod] = useState(() => ({
    year: new Date().getFullYear(),
    month: new Date().getMonth(),
  }));
  const calYear = calPeriod.year;
  const calMonth = calPeriod.month;
  const [filter, setFilter] = useState('all');
  const [pendingDelete, setPendingDelete] = useState(null);
  const prevTodayRef = useRef(today);
  useEffect(() => {
    if (prevTodayRef.current !== today) {
      prevTodayRef.current = today;
      setSelectedDate(today);
    }
  }, [today]);

  const dateNames = getDateNames(language);
  const grid = useMemo(() => buildCalendarWeeks(calYear, calMonth), [calYear, calMonth]);

  const expenseDays = useMemo(() => {
    const days = new Set();
    const prefix = `${calYear}-${pad2(calMonth + 1)}`;
    for (const section of sections) {
      if (section.data.length === 0) continue;
      const key = dateKey(section.data[0].createdAt);
      if (key.startsWith(prefix)) days.add(parseInt(key.slice(8), 10));
    }
    return days;
  }, [sections, calYear, calMonth]);

  const selectedSection = useMemo(() => {
    for (const section of sections) {
      if (section.data.length === 0) continue;
      if (dateKey(section.data[0].createdAt) === selectedDate) return section;
    }
    return null;
  }, [sections, selectedDate]);

  const presentCategories = useMemo(() => {
    const present = new Set();
    for (const section of sections) {
      for (const item of section.data) present.add(getCategory(item.category, categories).id);
    }
    return (categories ?? []).filter((c) => present.has(c.id));
  }, [sections, categories]);

  const activeFilter =
    filter !== 'all' && !presentCategories.some((c) => c.id === filter) ? 'all' : filter;

  const { filteredExpenses, filteredTotal } = useMemo(() => {
    const expenses = !selectedSection
      ? []
      : activeFilter === 'all'
      ? selectedSection.data
      : selectedSection.data.filter(
          (item) => getCategory(item.category, categories).id === activeFilter
        );
    const total = expenses.reduce((sum, e) => sum + e.displayAmount, 0);
    return { filteredExpenses: expenses, filteredTotal: total };
  }, [selectedSection, activeFilter, categories]);

  const selectDay = (day) => {
    if (!day) return;
    setSelectedDate(`${calYear}-${pad2(calMonth + 1)}-${pad2(day)}`);
  };

  // This page's month selection (the ‹ month › selector under the title — the
  // calendar card no longer has its own month nav). Stepping months also moves
  // the selected day (today in the current month, the 1st otherwise) so the
  // rows below always show the displayed month. Independent of the other tabs.
  const calMonthKey = `${calYear}-${pad2(calMonth + 1)}`;
  const shiftCalMonth = (dir) => {
    const next = shiftMonthKey(calMonthKey, dir);
    const [y, m] = next.split('-').map(Number);
    setCalPeriod({ year: y, month: m - 1 });
    setSelectedDate(next === today.slice(0, 7) ? today : `${next}-01`);
  };

  const [sy, sm, sd] = selectedDate.split('-').map(Number);
  const selectedDayText = dayLabel(new Date(sy, sm - 1, sd).getTime(), language);
  const selectedInMonth = selectedDate.startsWith(`${calYear}-${pad2(calMonth + 1)}`);
  const selectedDayNum = selectedInMonth ? sd : null;

  // Every branch keeps the fixed HeaderGlow wash so the page always matches
  // the glowWashTop status-bar strip App.js paints while the tab UI is up.
  if (!loaded) {
    return (
      <View style={styles.container}>
        <HeaderGlow id="listHeaderGlow" />
      </View>
    );
  }

  if (!hasExpenses) {
    return (
      <View style={styles.container}>
        <HeaderGlow id="listHeaderGlow" />
        <EmptyState onAdd={onAddPress} onLoadDemo={onLoadDemo} colors={colors} t={t} />
      </View>
    );
  }

  const deleteCategory = pendingDelete ? getCategory(pendingDelete.category, categories) : null;

  return (
    <View style={styles.container}>
      <HeaderGlow id="listHeaderGlow" />
      <ScrollView
        contentContainerStyle={styles.scrollContent}
        showsVerticalScrollIndicator={false}
      >
        <Text style={styles.title}>{t('list.title')}</Text>

        <MonthSelector
          monthKey={calMonthKey}
          currentMonthKey={today.slice(0, 7)}
          onShift={shiftCalMonth}
          style={styles.monthSelector}
        />

        <View style={styles.calendarCard}>
          <View style={styles.calWeekRow}>
            {dateNames.weekdayLetters.map((letter, i) => (
              <View key={i} style={styles.calWeekCell}>
                <Text style={styles.calWeekday}>{letter}</Text>
              </View>
            ))}
          </View>

          {grid.map((row, rowIndex) => (
            <View key={rowIndex} style={styles.calWeekRow}>
              {row.map((day, colIndex) => {
                if (!day) return <View key={colIndex} style={styles.calCell} />;
                const dayKey = `${calYear}-${pad2(calMonth + 1)}-${pad2(day)}`;
                const isToday = dayKey === today;
                const isSelected = day === selectedDayNum;
                const hasExpense = expenseDays.has(day);
                return (
                  <Pressable
                    key={colIndex}
                    style={styles.calCell}
                    onPress={() => selectDay(day)}
                    accessibilityRole="button"
                    accessibilityState={{ selected: isSelected }}
                  >
                    <View
                      style={[
                        styles.calDayCircle,
                        isSelected && { backgroundColor: colors.accent },
                        isToday && !isSelected && styles.calTodayCircle,
                      ]}
                    >
                      <Text
                        style={[
                          styles.calDayText,
                          isSelected && { color: colors.onAccent },
                          isToday && !isSelected && { color: colors.accent },
                        ]}
                      >
                        {day}
                      </Text>
                    </View>
                    {hasExpense && !isSelected ? (
                      <View style={[styles.calDot, { backgroundColor: colors.accent }]} />
                    ) : (
                      <View style={styles.calDotSpacer} />
                    )}
                  </Pressable>
                );
              })}
            </View>
          ))}
        </View>

        <View style={styles.dayHeader}>
          <Text style={styles.dayHeaderLabel}>{selectedDayText}</Text>
          {filteredTotal > 0 && (
            <Text style={styles.dayHeaderTotal}>
              {formatMoney(filteredTotal, displayCurrency)}
            </Text>
          )}
        </View>

        <View style={styles.chipsArea}>
          <ScrollView
            horizontal
            showsHorizontalScrollIndicator={false}
            contentContainerStyle={styles.chipRow}
          >
            <FilterChip
              label={t('list.all')}
              selected={activeFilter === 'all'}
              onPress={() => setFilter('all')}
              styles={styles}
            />
            {presentCategories.map((category) => (
              <FilterChip
                key={category.id}
                icon={category.emoji}
                label={getCategoryLabel(category, t)}
                color={category.color}
                selected={activeFilter === category.id}
                onPress={() => setFilter(category.id)}
                styles={styles}
              />
            ))}
          </ScrollView>
        </View>

        {filteredExpenses.length === 0 ? (
          <View style={styles.noMatch}>
            <Text style={styles.noMatchText}>
              {activeFilter !== 'all'
                ? t('list.noMatch', { category: getCategoryLabel(getCategory(activeFilter, categories), t) })
                : t('list.noneOnDay')}
            </Text>
          </View>
        ) : (
          filteredExpenses.map((expense) => (
            <ExpenseRow
              key={expense.id}
              expense={expense}
              displayCurrency={displayCurrency}
              categories={categories}
              onRequestDelete={setPendingDelete}
              onEdit={onEditPress}
            />
          ))
        )}
      </ScrollView>

      <Modal
        visible={pendingDelete != null}
        transparent
        animationType="fade"
        onRequestClose={() => setPendingDelete(null)}
      >
        <Pressable
          style={[StyleSheet.absoluteFill, styles.backdrop]}
          onPress={() => setPendingDelete(null)}
        />
        <View style={styles.modalCenter} pointerEvents="box-none">
          <View style={styles.modalCard}>
            <Text style={styles.modalTitle}>{t('list.deleteTitle')}</Text>
            {pendingDelete && (
              <View style={styles.modalExpense}>
                <View style={[styles.modalIcon, { backgroundColor: `${deleteCategory.color}26` }]}>
                  <HIcon name={deleteCategory.emoji} size={20} color={deleteCategory.color} />
                </View>
                <View style={styles.modalInfo}>
                  <Text style={styles.modalNote} numberOfLines={1}>
                    {pendingDelete.note || getCategoryLabel(deleteCategory, t)}
                  </Text>
                  <Text style={styles.modalCategory}>{getCategoryLabel(deleteCategory, t)}</Text>
                </View>
                <Text style={styles.modalAmount}>
                  {formatMoney(pendingDelete.displayAmount, displayCurrency)}
                </Text>
              </View>
            )}
            <View style={styles.modalButtons}>
              <Pressable
                onPress={() => setPendingDelete(null)}
                accessibilityRole="button"
                style={({ pressed }) => [
                  styles.modalBtn,
                  styles.modalBtnCancel,
                  pressed && styles.modalBtnPressed,
                ]}
              >
                <Text style={styles.modalBtnCancelText}>{t('common.cancel')}</Text>
              </Pressable>
              <Pressable
                onPress={() => { onDelete(pendingDelete.id); setPendingDelete(null); }}
                accessibilityRole="button"
                style={({ pressed }) => [
                  styles.modalBtn,
                  styles.modalBtnDelete,
                  pressed && styles.modalBtnDeletePressed,
                ]}
              >
                <Text style={styles.modalBtnDeleteText}>{t('common.delete')}</Text>
              </Pressable>
            </View>
          </View>
        </View>
      </Modal>
    </View>
  );
}

const FilterChip = React.memo(function FilterChip({ icon, label, color, selected, onPress, styles }) {
  const { colors } = useTheme();
  const chipColor = color ?? colors.accent;
  return (
    <Pressable
      onPress={onPress}
      accessibilityRole="button"
      accessibilityState={{ selected }}
      style={({ pressed }) => [
        styles.chip,
        selected && { backgroundColor: `${chipColor}33`, borderColor: chipColor },
        pressed && !selected && styles.chipPressed,
      ]}
    >
      {icon ? <HIcon name={icon} size={16} color={chipColor} /> : null}
      <Text style={[styles.chipLabel, selected && styles.chipLabelSelected]}>{label}</Text>
    </Pressable>
  );
});

const createStyles = (colors) =>
  StyleSheet.create({
    // Explicit background: the SafeAreaView behind the tabs is wash-tinted
    // while the Dashboard tab is active, so screens must paint their own.
    container: {
      flex: 1,
      backgroundColor: colors.background,
    },
    scrollContent: {
      paddingBottom: spacing.xl + TAB_BAR_HEIGHT,
    },
    title: {
      color: colors.textPrimary,
      fontSize: 26,
      fontFamily: fonts.bold,
      paddingHorizontal: spacing.md,
      paddingTop: spacing.md,
      textAlign: 'center',
    },

    monthSelector: {
      marginTop: spacing.sm,
    },
    calendarCard: {
      backgroundColor: colors.card,
      borderRadius: radius.md,
      marginHorizontal: spacing.md,
      marginTop: spacing.md,
      paddingTop: spacing.sm,
      paddingBottom: spacing.xs,
      paddingHorizontal: spacing.xs,
      ...cardShadow,
    },
    calWeekRow: {
      flexDirection: 'row',
    },
    calWeekCell: {
      flex: 1,
      alignItems: 'center',
      paddingBottom: spacing.xs,
    },
    calWeekday: {
      color: colors.textMuted,
      fontSize: 12,
      fontFamily: fonts.bold,
    },
    calCell: {
      flex: 1,
      alignItems: 'center',
      height: 44,
      justifyContent: 'flex-start',
      paddingTop: 2,
    },
    calDayCircle: {
      width: 32,
      height: 32,
      borderRadius: 16,
      alignItems: 'center',
      justifyContent: 'center',
    },
    calTodayCircle: {
      borderWidth: 1.5,
      borderColor: colors.accent,
    },
    calDayText: {
      color: colors.textPrimary,
      fontSize: 13,
      fontFamily: fonts.regular,
    },
    calDot: {
      width: 5,
      height: 5,
      borderRadius: 3,
      marginTop: 1,
    },
    calDotSpacer: {
      height: 5,
      marginTop: 1,
    },

    dayHeader: {
      flexDirection: 'row',
      justifyContent: 'space-between',
      alignItems: 'baseline',
      paddingHorizontal: spacing.md,
      paddingTop: spacing.md,
      paddingBottom: spacing.xs,
    },
    dayHeaderLabel: {
      color: colors.textSecondary,
      fontSize: 13,
      fontFamily: fonts.bold,
      textTransform: 'uppercase',
      letterSpacing: 0.8,
    },
    dayHeaderTotal: {
      color: colors.textMuted,
      fontSize: 13,
      fontFamily: fonts.numBold,
      fontVariant: ['tabular-nums'],
    },

    chipsArea: {
      paddingTop: spacing.xs + 2,
      paddingBottom: spacing.md,
    },
    chipRow: {
      paddingHorizontal: spacing.md,
      gap: spacing.sm,
    },
    chip: {
      flexDirection: 'row',
      alignItems: 'center',
      backgroundColor: colors.card,
      borderRadius: 20,
      borderWidth: 1,
      borderColor: 'transparent',
      paddingHorizontal: spacing.sm + 4,
      paddingVertical: spacing.sm,
      gap: 6,
    },
    chipPressed: {
      backgroundColor: colors.cardPressed,
    },
    chipLabel: {
      color: colors.textSecondary,
      fontSize: 13,
      fontFamily: fonts.bold,
    },
    chipLabelSelected: {
      color: colors.textPrimary,
    },

    noMatch: {
      alignItems: 'center',
      paddingTop: spacing.xl,
      paddingHorizontal: spacing.lg,
    },
    noMatchText: {
      color: colors.textMuted,
      fontSize: 14,
      fontFamily: fonts.regular,
      textAlign: 'center',
    },

    backdrop: {
      backgroundColor: colors.backdrop,
    },
    modalCenter: {
      flex: 1,
      justifyContent: 'center',
      alignItems: 'center',
      paddingHorizontal: spacing.lg,
    },
    modalCard: {
      backgroundColor: colors.card,
      borderRadius: radius.lg,
      padding: spacing.lg,
      width: '100%',
      maxWidth: 340,
      ...cardShadow,
    },
    modalTitle: {
      color: colors.textPrimary,
      fontFamily: fonts.bold,
      fontSize: 16,
      marginBottom: spacing.md,
    },
    modalExpense: {
      flexDirection: 'row',
      alignItems: 'center',
      backgroundColor: colors.background,
      borderRadius: radius.md,
      padding: spacing.sm + 4,
      marginBottom: spacing.lg,
    },
    modalIcon: {
      width: 40,
      height: 40,
      borderRadius: 20,
      alignItems: 'center',
      justifyContent: 'center',
    },
    modalInfo: {
      flex: 1,
      marginHorizontal: spacing.sm + 2,
    },
    modalNote: {
      color: colors.textPrimary,
      fontFamily: fonts.bold,
      fontSize: 14,
    },
    modalCategory: {
      color: colors.textMuted,
      fontFamily: fonts.regular,
      fontSize: 12,
      marginTop: 1,
    },
    modalAmount: {
      color: colors.textPrimary,
      fontFamily: fonts.numBold,
      fontSize: 14,
      fontVariant: ['tabular-nums'],
    },
    modalButtons: {
      flexDirection: 'row',
      gap: spacing.sm,
    },
    modalBtn: {
      flex: 1,
      alignItems: 'center',
      paddingVertical: spacing.sm + 4,
      borderRadius: radius.sm,
    },
    modalBtnCancel: {
      backgroundColor: colors.background,
    },
    modalBtnPressed: {
      opacity: 0.7,
    },
    modalBtnCancelText: {
      color: colors.textSecondary,
      fontFamily: fonts.bold,
      fontSize: 14,
    },
    modalBtnDelete: {
      backgroundColor: colors.danger,
    },
    modalBtnDeletePressed: {
      opacity: 0.8,
    },
    modalBtnDeleteText: {
      color: colors.onAccent,
      fontFamily: fonts.bold,
      fontSize: 14,
    },
  });
