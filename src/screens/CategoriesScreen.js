import { useMemo } from 'react';
import { Pressable, ScrollView, StyleSheet, Text, View } from 'react-native';
import { fonts, spacing, radius, useTheme } from '../theme';
import { useT, useLanguage, getDateNames } from '../i18n';
import { formatMoney, monthKeyLabelShort } from '../format';
import { CATEGORIES } from '../categories';
import { getCurrency } from '../currency';
import { TAB_BAR_HEIGHT } from '../components/TabBar';

// Height of the mini chart's bar track; bars scale within it per card.
const CHART_HEIGHT = 56;

export default function CategoriesScreen({
  months,
  currentMonthKey,
  loaded,
  hasExpenses,
  displayCurrency,
  onLoadDemo,
}) {
  const { colors } = useTheme();
  const t = useT();
  const language = useLanguage();
  const styles = useMemo(() => createStyles(colors), [colors]);
  const monthsShort = getDateNames(language).monthsShort;

  // The last 6 calendar months ending at the current one, oldest first. Months
  // with no expenses are absent from `months` (possibly including the current
  // month), so each slot is looked up and missing data becomes zero. Keys are
  // computed with date math — Date normalizes month overflow across year ends.
  const windowMonths = useMemo(() => {
    const [year, month] = currentMonthKey.split('-').map(Number);
    const byKey = new Map(months.map((m) => [m.key, m]));
    const slots = [];
    for (let i = 5; i >= 0; i--) {
      const date = new Date(year, month - 1 - i, 1);
      const key = `${date.getFullYear()}-${String(date.getMonth() + 1).padStart(2, '0')}`;
      const data = byKey.get(key);
      slots.push({
        key,
        monthIndex: date.getMonth(),
        total: data?.total ?? 0,
        byCategory: data?.byCategory ?? {},
      });
    }
    return slots;
  }, [months, currentMonthKey]);

  // One row per category with spending anywhere in the window; values align
  // with the window slots (oldest first, current month last).
  const categoryRows = useMemo(
    () =>
      CATEGORIES.map((category) => ({
        category,
        values: windowMonths.map((slot) => slot.byCategory[category.id] ?? 0),
      }))
        .filter((row) => row.values.some((value) => value > 0))
        .sort((a, b) => b.values[5] - a.values[5] || b.values[4] - a.values[4]),
    [windowMonths]
  );

  if (!loaded) {
    return <View style={styles.container} />;
  }

  if (!hasExpenses) {
    return (
      <View style={[styles.container, styles.emptyState]}>
        <Text style={styles.emptyEmoji}>{'\u{1F5C2}\u{FE0F}'}</Text>
        <Text style={styles.emptyTitle}>{t('empty.title')}</Text>
        <Text style={styles.emptyHint}>{t('cats.emptyHint')}</Text>
        <Pressable
          onPress={onLoadDemo}
          accessibilityRole="button"
          style={({ pressed }) => [styles.demoButton, pressed && styles.demoButtonPressed]}
        >
          <Text style={styles.demoButtonText}>{t('empty.loadDemo')}</Text>
        </Pressable>
      </View>
    );
  }

  const allValues = windowMonths.map((slot) => slot.total);
  // Delta compares the current month against the immediately previous calendar
  // month; both come from the window so absent months read as zero.
  const prevLabel = monthKeyLabelShort(windowMonths[4].key, language);
  // "Same" is judged at display precision: totals are unrounded float sums, and
  // a sub-unit residue must not render as a colored up/down line.
  const eps = 0.5 / 10 ** getCurrency(displayCurrency).decimals;

  return (
    <ScrollView
      style={styles.container}
      showsVerticalScrollIndicator={false}
      contentContainerStyle={styles.content}
    >
      <Text style={styles.title}>{t('cats.title')}</Text>

      <View style={styles.card}>
        <Text style={styles.allLabel}>{t('cats.allSpending')}</Text>
        <Text style={styles.allTotal} numberOfLines={1} adjustsFontSizeToFit>
          {formatMoney(allValues[5], displayCurrency)}
        </Text>
        <DeltaLine
          curr={allValues[5]}
          prev={allValues[4]}
          prevLabel={prevLabel}
          eps={eps}
          colors={colors}
          styles={styles}
          t={t}
        />
        <MiniChart
          values={allValues}
          windowMonths={windowMonths}
          color={colors.accent}
          monthsShort={monthsShort}
          styles={styles}
        />
      </View>

      {categoryRows.map(({ category, values }) => (
        <View key={category.id} style={styles.card}>
          <View style={styles.cardHeader}>
            <View style={[styles.emojiCircle, { backgroundColor: `${category.color}26` }]}>
              <Text style={styles.emoji}>{category.emoji}</Text>
            </View>
            <Text style={styles.categoryName} numberOfLines={1}>
              {t(`cat.${category.id}`)}
            </Text>
            <Text style={styles.categoryAmount} numberOfLines={1}>
              {formatMoney(values[5], displayCurrency)}
            </Text>
          </View>
          <DeltaLine
            curr={values[5]}
            prev={values[4]}
            prevLabel={prevLabel}
            eps={eps}
            colors={colors}
            styles={styles}
            t={t}
          />
          <MiniChart
            values={values}
            windowMonths={windowMonths}
            color={category.color}
            monthsShort={monthsShort}
            styles={styles}
          />
        </View>
      ))}
    </ScrollView>
  );
}

function DeltaLine({ curr, prev, prevLabel, eps, colors, styles, t }) {
  if (prev <= 0) {
    // Nothing last month: a fresh amount is noted neutrally, two zero months
    // need no line at all.
    if (curr <= 0) return null;
    return (
      <Text style={[styles.delta, { color: colors.textMuted }]}>
        {t('cats.new', { month: prevLabel })}
      </Text>
    );
  }
  const pct =
    Math.abs(curr - prev) < eps ? 0 : Math.round((Math.abs(curr - prev) / prev) * 100);
  if (pct === 0) {
    return (
      <Text style={[styles.delta, { color: colors.textMuted }]}>
        {t('cats.same', { month: prevLabel })}
      </Text>
    );
  }
  const up = curr > prev;
  // Spending more reads as bad (danger), less as good (success).
  return (
    <Text style={[styles.delta, { color: up ? colors.danger : colors.success }]}>
      {t(up ? 'cats.up' : 'cats.down', { pct, month: prevLabel })}
    </Text>
  );
}

function MiniChart({ values, windowMonths, color, monthsShort, styles }) {
  // Bars scale against this chart's own window max so every card uses its
  // full height; the min height keeps tiny non-zero months visible.
  const max = Math.max(...values);
  return (
    <View style={styles.chart}>
      {values.map((value, i) => {
        const isCurrent = i === values.length - 1;
        return (
          <View key={windowMonths[i].key} style={styles.chartCol}>
            <View style={styles.chartTrack}>
              {value > 0 ? (
                <View
                  style={[
                    styles.chartBar,
                    {
                      height: Math.max(3, (value / max) * CHART_HEIGHT),
                      // Earlier months at 45% alpha so the current bar leads.
                      backgroundColor: isCurrent ? color : `${color}73`,
                    },
                  ]}
                />
              ) : (
                <View style={styles.chartStub} />
              )}
            </View>
            <Text style={styles.chartMonth} numberOfLines={1}>
              {monthsShort[windowMonths[i].monthIndex]}
            </Text>
          </View>
        );
      })}
    </View>
  );
}

const createStyles = (colors) =>
  StyleSheet.create({
    container: {
      flex: 1,
    },
    content: {
      paddingHorizontal: spacing.md,
      paddingBottom: spacing.xl,
      gap: spacing.md,
    },
    title: {
      color: colors.textPrimary,
      fontFamily: fonts.bold,
      fontSize: 28,
      paddingTop: spacing.md,
    },
    card: {
      backgroundColor: colors.card,
      borderRadius: radius.md,
      padding: spacing.md,
    },
    allLabel: {
      color: colors.textSecondary,
      fontFamily: fonts.bold,
      fontSize: 13,
      textTransform: 'uppercase',
      letterSpacing: 1,
    },
    allTotal: {
      color: colors.textPrimary,
      fontFamily: fonts.bold,
      fontSize: 34,
      fontVariant: ['tabular-nums'],
      marginTop: spacing.xs,
    },
    cardHeader: {
      flexDirection: 'row',
      alignItems: 'center',
    },
    emojiCircle: {
      width: 36,
      height: 36,
      borderRadius: 18,
      alignItems: 'center',
      justifyContent: 'center',
      marginRight: spacing.sm + 2,
    },
    emoji: {
      fontSize: 18,
    },
    categoryName: {
      flex: 1,
      color: colors.textPrimary,
      fontFamily: fonts.bold,
      fontSize: 16,
      marginRight: spacing.sm,
    },
    categoryAmount: {
      color: colors.textPrimary,
      fontFamily: fonts.bold,
      fontSize: 16,
      fontVariant: ['tabular-nums'],
      textAlign: 'right',
    },
    delta: {
      fontFamily: fonts.regular,
      fontSize: 13,
      fontVariant: ['tabular-nums'],
      marginTop: spacing.xs + 2,
    },
    chart: {
      flexDirection: 'row',
      gap: spacing.sm - 2,
      marginTop: spacing.sm + 4,
    },
    chartCol: {
      flex: 1,
      alignItems: 'center',
    },
    chartTrack: {
      height: CHART_HEIGHT,
      width: '100%',
      alignItems: 'center',
      justifyContent: 'flex-end',
    },
    chartBar: {
      width: '58%',
      maxWidth: 26,
      borderTopLeftRadius: 3,
      borderTopRightRadius: 3,
    },
    chartStub: {
      width: '58%',
      maxWidth: 26,
      height: 2,
      borderRadius: 1,
      backgroundColor: colors.cardPressed,
    },
    chartMonth: {
      color: colors.textMuted,
      fontFamily: fonts.regular,
      fontSize: 10,
      marginTop: spacing.xs,
    },
    emptyState: {
      alignItems: 'center',
      justifyContent: 'center',
      paddingHorizontal: spacing.xl,
      paddingBottom: TAB_BAR_HEIGHT,
    },
    emptyEmoji: {
      fontSize: 56,
      marginBottom: spacing.md,
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
    demoButton: {
      marginTop: spacing.lg,
      backgroundColor: colors.card,
      borderRadius: radius.md,
      borderWidth: 1,
      borderColor: colors.border,
      paddingHorizontal: spacing.lg,
      paddingVertical: spacing.sm + 4,
    },
    demoButtonPressed: {
      backgroundColor: colors.cardPressed,
    },
    demoButtonText: {
      color: colors.accent,
      fontFamily: fonts.bold,
      fontSize: 16,
    },
  });
