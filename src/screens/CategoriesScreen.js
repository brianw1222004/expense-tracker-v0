import { useMemo } from 'react';
import { Pressable, ScrollView, StyleSheet, Text, View } from 'react-native';
import Svg, { Circle } from 'react-native-svg';
import { fonts, spacing, radius, useTheme } from '../theme';
import { useT } from '../i18n';
import { formatMoney } from '../format';
import { CATEGORIES } from '../categories';
import { getCurrency } from '../currency';
import { TAB_BAR_HEIGHT } from '../components/TabBar';

const DONUT_SIZE = 130;
const DONUT_STROKE = 12;
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
  onLoadDemo,
}) {
  const { colors } = useTheme();
  const t = useT();
  const styles = useMemo(() => createStyles(colors), [colors]);

  const { thisMonth, lastMonth } = useMemo(() => {
    const [year, month] = currentMonthKey.split('-').map(Number);
    const byKey = new Map(months.map((m) => [m.key, m]));

    const prevDate = new Date(year, month - 2, 1);
    const prevKey = `${prevDate.getFullYear()}-${String(prevDate.getMonth() + 1).padStart(2, '0')}`;

    return {
      thisMonth: byKey.get(currentMonthKey) ?? { key: currentMonthKey, total: 0, byCategory: {} },
      lastMonth: byKey.get(prevKey) ?? { key: prevKey, total: 0, byCategory: {} },
    };
  }, [months, currentMonthKey]);

  const categoryRows = useMemo(
    () =>
      CATEGORIES.map((category) => ({
        category,
        thisVal: thisMonth.byCategory[category.id] ?? 0,
        lastVal: lastMonth.byCategory[category.id] ?? 0,
      }))
        .filter((row) => row.thisVal > 0 || row.lastVal > 0)
        .sort((a, b) => b.thisVal - a.thisVal || b.lastVal - a.lastVal),
    [thisMonth, lastMonth]
  );

  const eps = 0.5 / 10 ** getCurrency(displayCurrency).decimals;

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

  return (
    <ScrollView
      style={styles.container}
      showsVerticalScrollIndicator={false}
      contentContainerStyle={styles.content}
    >
      <Text style={styles.title}>{t('cats.title')}</Text>

      <View style={styles.donutRow}>
        <View style={styles.donutCard}>
          <Text style={styles.donutLabel}>{t('cats.thisMonth')}</Text>
          <CategoryDonut
            byCategory={thisMonth.byCategory}
            total={thisMonth.total}
            displayCurrency={displayCurrency}
            colors={colors}
            styles={styles}
          />
        </View>
        <View style={styles.donutCard}>
          <Text style={styles.donutLabel}>{t('cats.lastMonth')}</Text>
          <CategoryDonut
            byCategory={lastMonth.byCategory}
            total={lastMonth.total}
            displayCurrency={displayCurrency}
            colors={colors}
            styles={styles}
          />
        </View>
      </View>

      {categoryRows.map(({ category, thisVal, lastVal }) => (
        <View key={category.id} style={styles.card}>
          <View style={styles.cardHeader}>
            <View style={[styles.emojiCircle, { backgroundColor: `${category.color}26` }]}>
              <Text style={styles.emoji}>{category.emoji}</Text>
            </View>
            <Text style={styles.categoryName} numberOfLines={1}>
              {t(`cat.${category.id}`)}
            </Text>
          </View>
          <View style={styles.compareRow}>
            <View style={styles.compareCol}>
              <Text style={styles.compareLabel}>{t('cats.thisMonth')}</Text>
              <Text style={styles.compareValue}>
                {formatMoney(thisVal, displayCurrency)}
              </Text>
            </View>
            <View style={styles.compareCol}>
              <Text style={styles.compareLabel}>{t('cats.lastMonth')}</Text>
              <Text style={[styles.compareValue, styles.compareValueMuted]}>
                {formatMoney(lastVal, displayCurrency)}
              </Text>
            </View>
          </View>
          <DeltaLine
            curr={thisVal}
            prev={lastVal}
            eps={eps}
            colors={colors}
            styles={styles}
            t={t}
          />
        </View>
      ))}
    </ScrollView>
  );
}

function CategoryDonut({ byCategory, total, displayCurrency, colors, styles }) {
  const segments = useMemo(() => {
    if (total <= 0) return [];
    return CATEGORIES
      .map((cat) => ({ color: cat.color, value: byCategory[cat.id] ?? 0 }))
      .filter((s) => s.value > 0);
  }, [byCategory, total]);

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

function DeltaLine({ curr, prev, eps, colors, styles, t }) {
  if (prev <= 0) {
    if (curr <= 0) return null;
    return (
      <Text style={[styles.delta, { color: colors.textMuted }]}>
        {t('cats.new', { month: t('cats.lastMonth') })}
      </Text>
    );
  }
  const pct =
    Math.abs(curr - prev) < eps ? 0 : Math.round((Math.abs(curr - prev) / prev) * 100);
  if (pct === 0) {
    return (
      <Text style={[styles.delta, { color: colors.textMuted }]}>
        {t('cats.same', { month: t('cats.lastMonth') })}
      </Text>
    );
  }
  const up = curr > prev;
  return (
    <Text style={[styles.delta, { color: up ? colors.danger : colors.success }]}>
      {t(up ? 'cats.up' : 'cats.down', { pct, month: t('cats.lastMonth') })}
    </Text>
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
    donutRow: {
      flexDirection: 'row',
      gap: spacing.md,
    },
    donutCard: {
      flex: 1,
      backgroundColor: colors.card,
      borderRadius: radius.md,
      padding: spacing.md,
      alignItems: 'center',
    },
    donutLabel: {
      color: colors.textSecondary,
      fontFamily: fonts.bold,
      fontSize: 12,
      textTransform: 'uppercase',
      letterSpacing: 0.8,
      marginBottom: spacing.sm,
    },
    donut: {
      width: DONUT_SIZE,
      height: DONUT_SIZE,
    },
    donutCenter: {
      alignItems: 'center',
      justifyContent: 'center',
      paddingHorizontal: DONUT_STROKE + 8,
    },
    donutTotal: {
      fontFamily: fonts.bold,
      fontSize: 16,
      fontVariant: ['tabular-nums'],
    },
    card: {
      backgroundColor: colors.card,
      borderRadius: radius.md,
      padding: spacing.md,
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
    compareRow: {
      flexDirection: 'row',
      marginTop: spacing.sm + 2,
      gap: spacing.md,
    },
    compareCol: {
      flex: 1,
    },
    compareLabel: {
      color: colors.textMuted,
      fontFamily: fonts.regular,
      fontSize: 12,
      marginBottom: 2,
    },
    compareValue: {
      color: colors.textPrimary,
      fontFamily: fonts.bold,
      fontSize: 18,
      fontVariant: ['tabular-nums'],
    },
    compareValueMuted: {
      color: colors.textSecondary,
      fontSize: 16,
    },
    delta: {
      fontFamily: fonts.regular,
      fontSize: 13,
      fontVariant: ['tabular-nums'],
      marginTop: spacing.xs + 2,
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
