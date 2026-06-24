import React, { useMemo, useState } from 'react';
import { Alert, Platform, Pressable, ScrollView, StyleSheet, Text, View } from 'react-native';
import { useSafeAreaInsets } from 'react-native-safe-area-context';
import { fonts, radius, spacing, useTheme } from '../theme';
import { getDateNames, useLanguage, useT } from '../i18n';
import { TAB_BAR_HEIGHT } from '../components/TabBar';
import { convert, getCurrency } from '../currency';
import { dateKey, formatMoney, formatMoneyShort, monthKeyLabel } from '../format';
import { getIncomeSource, getIncomeSourceLabel } from '../incomeSources';
import { HIcon } from '../icons';

const CHART_HEIGHT = 110;

// 'YYYY-MM' keys for the last n months ending at currentKey (oldest -> newest).
function monthKeysBack(currentKey, n) {
  const [y, m] = currentKey.split('-').map(Number);
  const keys = [];
  for (let i = n - 1; i >= 0; i--) {
    const d = new Date(y, m - 1 - i, 1);
    keys.push(`${d.getFullYear()}-${String(d.getMonth() + 1).padStart(2, '0')}`);
  }
  return keys;
}

function prevMonthKey(key) {
  return monthKeysBack(key, 2)[0];
}

export default function IncomeBalanceScreen({
  income,
  displayCurrency,
  expenseByMonth,
  totalExpenses,
  currentMonthKey,
  onAddIncome,
  onEditIncome,
  onDeleteIncome,
}) {
  const { colors } = useTheme();
  const t = useT();
  const language = useLanguage();
  const insets = useSafeAreaInsets();
  const styles = useMemo(() => createStyles(colors), [colors]);

  const [selectedMonth, setSelectedMonth] = useState(null);
  const [monthsToShow, setMonthsToShow] = useState(3);

  const { totalIncome, incomeByMonth, months } = useMemo(() => {
    const byMonth = new Map();
    let total = 0;
    for (const entry of income) {
      const displayAmount = convert(entry.amount, entry.currency, displayCurrency);
      total += displayAmount;
      const key = dateKey(entry.createdAt).slice(0, 7);
      if (!byMonth.has(key)) byMonth.set(key, { key, total: 0, entries: [] });
      const month = byMonth.get(key);
      month.total += displayAmount;
      month.entries.push({ ...entry, displayAmount });
    }
    const sorted = [...byMonth.values()].sort((a, b) => (a.key < b.key ? 1 : -1));
    for (const month of sorted) month.entries.sort((a, b) => b.createdAt - a.createdAt);
    const map = {};
    for (const month of sorted) map[month.key] = month.total;
    return { totalIncome: total, incomeByMonth: map, months: sorted };
  }, [income, displayCurrency]);

  const netOf = (key) => (incomeByMonth[key] ?? 0) - (expenseByMonth[key] ?? 0);

  // Half the smallest displayed unit — values below this round to zero on screen,
  // so the sign/color test uses it (not a fixed epsilon) to avoid a "-$0.00" in
  // danger red, and it tracks 0-decimal currencies (JPY/TWD) too.
  const eps = 0.5 * 10 ** -getCurrency(displayCurrency).decimals;

  const monthShort = (key) => {
    const [year, month] = key.split('-');
    const base = getDateNames(language).months[Number(month) - 1].slice(0, 3);
    // The 6-month range can straddle a year boundary; disambiguate any month not
    // in the current year with a 2-digit year.
    return monthsToShow === 6 && year !== currentMonthKey.split('-')[0]
      ? `${base} '${year.slice(2)}`
      : base;
  };

  const allTimeBalance = totalIncome - totalExpenses;
  const heroValue = selectedMonth ? netOf(selectedMonth) : allTimeBalance;
  const heroNegative = heroValue < -eps;
  const heroNeutral = Math.abs(heroValue) < eps;
  const heroColor = heroNeutral ? colors.textSecondary : heroNegative ? colors.danger : colors.success;
  const heroText = `${heroNegative ? '-' : ''}${formatMoney(heroValue, displayCurrency)}`;
  const heroLabel = selectedMonth ? monthKeyLabel(selectedMonth, language) : t('income.balance');

  const focusMonth = selectedMonth ?? currentMonthKey;
  const delta = netOf(focusMonth) - netOf(prevMonthKey(focusMonth));
  const deltaUp = delta >= 0;
  const hasDelta = Math.abs(delta) >= eps;
  // "vs last month" only reads right for the current month; a focused past month
  // compares against ITS previous month, so name that month instead.
  const deltaLabel = selectedMonth
    ? t('income.vsMonth', { month: monthShort(prevMonthKey(focusMonth)) })
    : t('income.vsLastMonth');

  const chartKeys = monthKeysBack(currentMonthKey, monthsToShow);
  const chartData = chartKeys.map((key) => ({
    key,
    income: incomeByMonth[key] ?? 0,
    expense: expenseByMonth[key] ?? 0,
  }));
  const chartMax = Math.max(1, ...chartData.flatMap((d) => [d.income, d.expense]));

  const selectRange = (n) => {
    setMonthsToShow(n);
    // Drop a selection that scrolls out of the new range so hero & chart agree.
    setSelectedMonth((cur) => (cur && !monthKeysBack(currentMonthKey, n).includes(cur) ? null : cur));
  };

  const toggleMonth = (key) => setSelectedMonth((cur) => (cur === key ? null : key));

  const confirmDelete = (entry) => {
    const run = () => onDeleteIncome(entry.id);
    if (Platform.OS === 'web') {
      if (window.confirm(t('income.deleteConfirm'))) run();
      return;
    }
    Alert.alert(t('income.delete'), t('income.deleteConfirm'), [
      { text: t('common.cancel'), style: 'cancel' },
      { text: t('common.delete'), style: 'destructive', onPress: () => run() },
    ]);
  };

  const hasIncome = income.length > 0;

  return (
    <View style={styles.container}>
      <ScrollView
        contentContainerStyle={[styles.content, { paddingBottom: spacing.xl + TAB_BAR_HEIGHT + insets.bottom }]}
        showsVerticalScrollIndicator={false}
      >
        <Text style={styles.title}>{t('income.title')}</Text>

        {/* Balance hero */}
        <View style={styles.heroCard}>
          <View style={styles.heroLabelRow}>
            <Text style={styles.heroLabel}>{heroLabel}</Text>
            {selectedMonth && (
              <Pressable onPress={() => setSelectedMonth(null)} hitSlop={8} accessibilityRole="button">
                <Text style={styles.backToCurrent}>{t('income.backToCurrent')}</Text>
              </Pressable>
            )}
          </View>
          <Text style={[styles.heroAmount, { color: heroColor }]} numberOfLines={1} adjustsFontSizeToFit>
            {heroText}
          </Text>
          {hasDelta && (
            <Text style={[styles.heroDelta, { color: deltaUp ? colors.success : colors.danger }]}>
              {deltaUp ? '↑' : '↓'} {formatMoneyShort(Math.abs(delta), displayCurrency)} {deltaLabel}
            </Text>
          )}
        </View>

        {/* Income vs Expenses chart */}
        <View style={styles.sectionRow}>
          <Text style={styles.sectionHeader}>{t('income.trend')}</Text>
          <View style={styles.rangeToggle}>
            {[3, 6].map((n) => {
              const active = monthsToShow === n;
              return (
                <Pressable
                  key={n}
                  onPress={() => selectRange(n)}
                  accessibilityRole="button"
                  accessibilityState={{ selected: active }}
                  style={[styles.rangePill, active && styles.rangePillActive]}
                >
                  <Text style={[styles.rangePillText, active && styles.rangePillTextActive]}>
                    {t(n === 3 ? 'income.months3' : 'income.months6')}
                  </Text>
                </Pressable>
              );
            })}
          </View>
        </View>

        <View style={styles.chartCard}>
          <View style={styles.legendRow}>
            <View style={styles.legendItem}>
              <View style={[styles.legendDot, { backgroundColor: colors.success }]} />
              <Text style={styles.legendText}>{t('income.income')}</Text>
            </View>
            <View style={styles.legendItem}>
              <View style={[styles.legendDot, { backgroundColor: colors.danger }]} />
              <Text style={styles.legendText}>{t('income.expenses')}</Text>
            </View>
          </View>
          <View style={styles.chart}>
            {chartData.map((d) => {
              const selected = selectedMonth === d.key;
              const incomeH = d.income > 0 ? Math.max(3, (d.income / chartMax) * CHART_HEIGHT) : 0;
              const expenseH = d.expense > 0 ? Math.max(3, (d.expense / chartMax) * CHART_HEIGHT) : 0;
              return (
                <Pressable
                  key={d.key}
                  onPress={() => toggleMonth(d.key)}
                  accessibilityRole="button"
                  accessibilityState={{ selected }}
                  accessibilityLabel={monthKeyLabel(d.key, language)}
                  style={[styles.chartCol, selected && styles.chartColSelected]}
                >
                  <View style={styles.barsRow}>
                    <View style={[styles.bar, { height: incomeH, backgroundColor: colors.success }]} />
                    <View style={[styles.bar, { height: expenseH, backgroundColor: colors.danger }]} />
                  </View>
                  <Text style={[styles.chartMonth, selected && styles.chartMonthSelected]} numberOfLines={1}>
                    {monthShort(d.key)}
                  </Text>
                </Pressable>
              );
            })}
          </View>
        </View>

        {/* Income entries, grouped by month */}
        {hasIncome ? (
          months.map((month) => (
            <View key={month.key} style={styles.monthGroup}>
              <View style={styles.monthHeaderRow}>
                <Text style={styles.monthHeaderLabel}>{monthKeyLabel(month.key, language)}</Text>
                <Text style={styles.monthHeaderTotal}>{formatMoney(month.total, displayCurrency)}</Text>
              </View>
              {month.entries.map((entry) => (
                <IncomeRow
                  key={entry.id}
                  entry={entry}
                  displayCurrency={displayCurrency}
                  styles={styles}
                  colors={colors}
                  t={t}
                  onEdit={onEditIncome}
                  onDelete={confirmDelete}
                />
              ))}
            </View>
          ))
        ) : (
          <View style={styles.empty}>
            <View style={[styles.emptyIcon, { backgroundColor: `${colors.success}1A` }]}>
              <HIcon name="wallet-01" size={28} color={colors.success} />
            </View>
            <Text style={styles.emptyTitle}>{t('income.empty')}</Text>
            <Text style={styles.emptyHint}>{t('income.emptyHint')}</Text>
            <Pressable
              onPress={onAddIncome}
              accessibilityRole="button"
              style={({ pressed }) => [styles.emptyButton, pressed && { opacity: 0.85 }]}
            >
              <Text style={styles.emptyButtonText}>{t('income.add')}</Text>
            </Pressable>
          </View>
        )}
      </ScrollView>
    </View>
  );
}

const IncomeRow = React.memo(function IncomeRow({ entry, displayCurrency, styles, colors, t, onEdit, onDelete }) {
  const source = getIncomeSource(entry.source);
  const converted = entry.currency !== displayCurrency;
  const label = getIncomeSourceLabel(source, t);
  return (
    <Pressable
      onPress={() => onEdit(entry)}
      onLongPress={() => onDelete(entry)}
      delayLongPress={350}
      accessibilityRole="button"
      accessibilityLabel={`${label}, ${formatMoney(entry.displayAmount, displayCurrency)}`}
      accessibilityHint={t('list.longPressToDelete')}
      style={({ pressed }) => [styles.row, pressed && styles.rowPressed]}
    >
      <View style={[styles.sourceDot, { backgroundColor: source.color }]} />
      <View style={styles.rowMiddle}>
        <Text style={styles.rowLabel} numberOfLines={1}>{label}</Text>
        {entry.note ? <Text style={styles.rowNote} numberOfLines={1}>{entry.note}</Text> : null}
      </View>
      <View style={styles.rowAmounts}>
        <Text style={styles.rowAmount}>+{formatMoney(entry.displayAmount, displayCurrency)}</Text>
        {converted && (
          <Text style={styles.rowOriginal}>
            {formatMoney(entry.amount, entry.currency)} {entry.currency}
          </Text>
        )}
      </View>
    </Pressable>
  );
});

const createStyles = (colors) =>
  StyleSheet.create({
    container: {
      flex: 1,
      backgroundColor: colors.background,
    },
    content: {
      paddingHorizontal: spacing.md,
      // Top breathing room; the centered title (textAlign:'center') is what
      // keeps content clear of the floating account button at the top-left.
      // paddingBottom is applied inline (adds the safe-area inset to clear the tab bar).
      paddingTop: spacing.md,
    },
    title: {
      color: colors.textPrimary,
      fontSize: 26,
      fontFamily: fonts.bold,
      textAlign: 'center',
      marginBottom: spacing.md,
    },
    heroCard: {
      backgroundColor: colors.card,
      borderRadius: radius.lg,
      paddingVertical: spacing.lg,
      paddingHorizontal: spacing.md,
      alignItems: 'center',
      shadowColor: '#000',
      shadowOffset: { width: 0, height: 2 },
      shadowOpacity: 0.08,
      shadowRadius: 10,
      elevation: 2,
    },
    heroLabelRow: {
      flexDirection: 'row',
      alignItems: 'center',
      gap: spacing.sm,
      marginBottom: spacing.xs,
    },
    heroLabel: {
      color: colors.textMuted,
      fontFamily: fonts.medium,
      fontSize: 12,
      letterSpacing: 0.8,
      textTransform: 'uppercase',
    },
    backToCurrent: {
      color: colors.accent,
      fontFamily: fonts.bold,
      fontSize: 12,
    },
    heroAmount: {
      fontFamily: fonts.numBold,
      fontSize: 40,
      fontVariant: ['tabular-nums'],
      letterSpacing: -0.5,
    },
    heroDelta: {
      fontFamily: fonts.numMedium,
      fontSize: 13,
      marginTop: spacing.xs,
      fontVariant: ['tabular-nums'],
    },
    sectionRow: {
      flexDirection: 'row',
      alignItems: 'center',
      justifyContent: 'space-between',
      marginTop: spacing.lg,
      marginBottom: spacing.sm,
    },
    sectionHeader: {
      color: colors.textSecondary,
      fontFamily: fonts.bold,
      fontSize: 13,
      textTransform: 'uppercase',
      letterSpacing: 1.2,
    },
    rangeToggle: {
      flexDirection: 'row',
      backgroundColor: colors.card,
      borderRadius: radius.sm,
      padding: 2,
    },
    rangePill: {
      paddingHorizontal: spacing.sm + 2,
      paddingVertical: spacing.xs,
      borderRadius: radius.sm - 2,
    },
    rangePillActive: {
      backgroundColor: `${colors.accent}26`,
    },
    rangePillText: {
      color: colors.textMuted,
      fontFamily: fonts.bold,
      fontSize: 12,
    },
    rangePillTextActive: {
      color: colors.accent,
    },
    chartCard: {
      backgroundColor: colors.card,
      borderRadius: radius.md,
      padding: spacing.md,
      shadowColor: '#000',
      shadowOffset: { width: 0, height: 1 },
      shadowOpacity: 0.06,
      shadowRadius: 8,
      elevation: 1,
    },
    legendRow: {
      flexDirection: 'row',
      gap: spacing.md,
      marginBottom: spacing.sm,
    },
    legendItem: {
      flexDirection: 'row',
      alignItems: 'center',
      gap: spacing.xs,
    },
    legendDot: {
      width: 9,
      height: 9,
      borderRadius: 4.5,
    },
    legendText: {
      color: colors.textMuted,
      fontFamily: fonts.medium,
      fontSize: 12,
    },
    chart: {
      flexDirection: 'row',
      alignItems: 'flex-end',
    },
    chartCol: {
      flex: 1,
      alignItems: 'center',
      borderRadius: radius.sm,
      paddingVertical: spacing.xs,
    },
    chartColSelected: {
      backgroundColor: `${colors.accent}12`,
    },
    barsRow: {
      flexDirection: 'row',
      alignItems: 'flex-end',
      height: CHART_HEIGHT,
      gap: 4,
    },
    bar: {
      width: 13,
      borderTopLeftRadius: 3,
      borderTopRightRadius: 3,
    },
    chartMonth: {
      color: colors.textMuted,
      fontFamily: fonts.medium,
      fontSize: 11,
      marginTop: spacing.xs,
    },
    chartMonthSelected: {
      color: colors.textPrimary,
      fontFamily: fonts.bold,
    },
    monthGroup: {
      marginTop: spacing.lg,
    },
    monthHeaderRow: {
      flexDirection: 'row',
      justifyContent: 'space-between',
      alignItems: 'baseline',
      marginBottom: spacing.sm,
    },
    monthHeaderLabel: {
      color: colors.textSecondary,
      fontFamily: fonts.bold,
      fontSize: 13,
      textTransform: 'uppercase',
      letterSpacing: 0.8,
    },
    monthHeaderTotal: {
      color: colors.success,
      fontFamily: fonts.numBold,
      fontSize: 14,
      fontVariant: ['tabular-nums'],
    },
    row: {
      flexDirection: 'row',
      alignItems: 'center',
      backgroundColor: colors.card,
      borderRadius: radius.md,
      padding: spacing.sm + 4,
      marginBottom: spacing.sm,
    },
    rowPressed: {
      backgroundColor: colors.cardPressed,
    },
    sourceDot: {
      width: 12,
      height: 12,
      borderRadius: 6,
    },
    rowMiddle: {
      flex: 1,
      marginHorizontal: spacing.sm + 4,
    },
    rowLabel: {
      color: colors.textPrimary,
      fontSize: 15,
      fontFamily: fonts.bold,
    },
    rowNote: {
      color: colors.textMuted,
      fontSize: 13,
      fontFamily: fonts.regular,
      marginTop: 1,
    },
    rowAmounts: {
      alignItems: 'flex-end',
    },
    rowAmount: {
      color: colors.success,
      fontSize: 15,
      fontFamily: fonts.numBold,
      fontVariant: ['tabular-nums'],
    },
    rowOriginal: {
      color: colors.textMuted,
      fontSize: 12,
      fontFamily: fonts.numRegular,
      marginTop: 1,
      fontVariant: ['tabular-nums'],
    },
    empty: {
      alignItems: 'center',
      paddingVertical: spacing.xl,
      paddingHorizontal: spacing.lg,
    },
    emptyIcon: {
      width: 56,
      height: 56,
      borderRadius: 28,
      alignItems: 'center',
      justifyContent: 'center',
      marginBottom: spacing.md,
    },
    emptyTitle: {
      color: colors.textPrimary,
      fontFamily: fonts.bold,
      fontSize: 17,
      marginBottom: spacing.xs,
    },
    emptyHint: {
      color: colors.textMuted,
      fontFamily: fonts.regular,
      fontSize: 14,
      lineHeight: 20,
      textAlign: 'center',
      marginBottom: spacing.md,
    },
    emptyButton: {
      backgroundColor: colors.success,
      borderRadius: radius.md,
      paddingHorizontal: spacing.lg,
      paddingVertical: spacing.sm + 4,
    },
    emptyButtonText: {
      color: colors.onAccent,
      fontFamily: fonts.bold,
      fontSize: 15,
    },
  });
