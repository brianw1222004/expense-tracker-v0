import { useEffect, useMemo, useState } from 'react';
import { Modal, Pressable, ScrollView, StyleSheet, Text, View } from 'react-native';
import { colors, spacing, radius } from '../theme';
import { formatMoney, formatMoneyShort, monthKeyLabelShort } from '../format';
import { getCategory } from '../categories';
import { getCurrency } from '../currency';

// A is the month under inspection, B the baseline it is compared against.
const COLOR_A = colors.accent;
const COLOR_B = colors.accentTeal;

export default function CompareScreen({ visible, months, displayCurrency, onClose }) {
  const [aKey, setAKey] = useState(null);
  const [bKey, setBKey] = useState(null);

  // Re-default on every open: A = newest month, B = second newest. `months` is
  // deliberately not a dependency — its identity refreshes once a minute (the
  // dayStamp memo in App.js) and that must not clobber an in-progress selection.
  useEffect(() => {
    if (visible) {
      setAKey(months[0]?.key ?? null);
      setBKey(months[1]?.key ?? null);
    }
  }, [visible]);

  const monthA = months.find((m) => m.key === aKey) ?? months[0] ?? null;
  const monthB = months.find((m) => m.key === bKey) ?? months[1] ?? months[0] ?? null;

  // Union of both months' categories, biggest combined spend first.
  const rows = useMemo(() => {
    if (!monthA || !monthB) return [];
    const ids = new Set([...Object.keys(monthA.byCategory), ...Object.keys(monthB.byCategory)]);
    return [...ids]
      .map((id) => ({
        category: getCategory(id),
        a: monthA.byCategory[id] ?? 0,
        b: monthB.byCategory[id] ?? 0,
      }))
      .sort((x, y) => y.a + y.b - (x.a + x.b));
  }, [monthA, monthB]);

  // Every bar is scaled against the single largest category value across both months.
  const maxValue = rows.reduce((max, row) => Math.max(max, row.a, row.b), 0);

  return (
    <Modal visible={visible} animationType="slide" transparent onRequestClose={onClose}>
      <View style={styles.overlay}>
        <Pressable style={[StyleSheet.absoluteFill, styles.backdrop]} onPress={onClose} />
        <View style={styles.sheet}>
          <Pressable onPress={onClose} style={styles.handleArea} hitSlop={8}>
            <View style={styles.handle} />
          </Pressable>
          <View style={styles.titleRow}>
            <Text style={styles.title}>Compare months</Text>
            <Pressable
              onPress={onClose}
              hitSlop={12}
              accessibilityRole="button"
              accessibilityLabel="Close"
              style={({ pressed }) => [styles.closeButton, pressed && styles.closeButtonPressed]}
            >
              <Text style={styles.closeButtonText}>{'✕'}</Text>
            </Pressable>
          </View>

          {months.length === 0 ? (
            <EmptyState />
          ) : months.length === 1 ? (
            <SingleMonthState month={months[0]} displayCurrency={displayCurrency} />
          ) : (
            <ScrollView showsVerticalScrollIndicator={false} contentContainerStyle={styles.body}>
              <MonthPicker label="A" months={months} selectedKey={monthA.key} color={COLOR_A} onSelect={setAKey} />
              <MonthPicker label="B" months={months} selectedKey={monthB.key} color={COLOR_B} onSelect={setBKey} />

              <View style={styles.totalsCard}>
                <View style={styles.totalsRow}>
                  <MonthTotal tag="A" color={COLOR_A} month={monthA} displayCurrency={displayCurrency} />
                  <View style={styles.totalsDivider} />
                  <MonthTotal tag="B" color={COLOR_B} month={monthB} displayCurrency={displayCurrency} />
                </View>
                <DeltaLine monthA={monthA} monthB={monthB} displayCurrency={displayCurrency} />
              </View>

              <Text style={styles.sectionLabel}>By category</Text>
              {rows.map((row) => (
                <View key={row.category.id} style={styles.categoryRow}>
                  <View style={styles.categoryHeader}>
                    <Text style={styles.categoryEmoji}>{row.category.emoji}</Text>
                    <Text style={styles.categoryLabel}>{row.category.label}</Text>
                  </View>
                  <Bar value={row.a} max={maxValue} color={COLOR_A} displayCurrency={displayCurrency} />
                  <Bar value={row.b} max={maxValue} color={COLOR_B} displayCurrency={displayCurrency} />
                </View>
              ))}
            </ScrollView>
          )}
        </View>
      </View>
    </Modal>
  );
}

function MonthPicker({ label, months, selectedKey, color, onSelect }) {
  return (
    <View style={styles.pickerRow}>
      <View style={[styles.tagBadge, { borderColor: color }]}>
        <Text style={[styles.tagText, { color }]}>{label}</Text>
      </View>
      <ScrollView horizontal showsHorizontalScrollIndicator={false} contentContainerStyle={styles.pickerChips}>
        {months.map((month) => {
          const selected = month.key === selectedKey;
          return (
            <Pressable
              key={month.key}
              onPress={() => onSelect(month.key)}
              accessibilityState={{ selected }}
              style={({ pressed }) => [
                styles.monthChip,
                selected && { backgroundColor: `${color}33`, borderColor: color },
                pressed && !selected && styles.monthChipPressed,
              ]}
            >
              <Text style={[styles.monthChipText, selected && { color: colors.textPrimary }]}>
                {monthKeyLabelShort(month.key)}
              </Text>
            </Pressable>
          );
        })}
      </ScrollView>
    </View>
  );
}

function MonthTotal({ tag, color, month, displayCurrency }) {
  return (
    <View style={styles.monthTotal}>
      <View style={styles.monthTotalHeader}>
        <View style={[styles.tagBadge, { borderColor: color }]}>
          <Text style={[styles.tagText, { color }]}>{tag}</Text>
        </View>
        <Text style={styles.monthTotalLabel} numberOfLines={1}>
          {monthKeyLabelShort(month.key)}
        </Text>
      </View>
      <Text style={styles.monthTotalValue} numberOfLines={1} adjustsFontSizeToFit>
        {formatMoney(month.total, displayCurrency)}
      </Text>
      <Text style={styles.monthTotalCount}>
        {month.count} {month.count === 1 ? 'expense' : 'expenses'}
      </Text>
    </View>
  );
}

function DeltaLine({ monthA, monthB, displayCurrency }) {
  const diff = monthA.total - monthB.total;
  // "Same" is judged at display precision: totals are unrounded float sums, and
  // for 0-decimal currencies a sub-unit residue would otherwise render a
  // colored "+¥0" under two identical-looking totals.
  const epsilon = 0.5 / 10 ** getCurrency(displayCurrency).decimals;
  if (Math.abs(diff) < epsilon) {
    return <Text style={[styles.delta, { color: colors.textMuted }]}>Same as {monthB.label}</Text>;
  }
  const sign = diff > 0 ? '+' : '−';
  // Spending more reads as bad (danger), less as good (accent).
  const color = diff > 0 ? colors.danger : colors.accent;
  const pct = monthB.total > 0 ? Math.round((Math.abs(diff) / monthB.total) * 100) : 0;
  // Percent is meaningless against an (effectively) zero baseline — fall back to the raw difference.
  const text =
    pct > 0
      ? `${sign}${pct}% vs ${monthB.label}`
      : `${sign}${formatMoney(diff, displayCurrency)} vs ${monthB.label}`;
  return <Text style={[styles.delta, { color }]}>{text}</Text>;
}

function Bar({ value, max, color, displayCurrency }) {
  // Keep tiny non-zero amounts visible as a sliver instead of rounding to nothing.
  const pct = max > 0 ? Math.max(value > 0 ? 1.5 : 0, (value / max) * 100) : 0;
  return (
    <View style={styles.barLine}>
      <View style={styles.barTrack}>
        <View style={[styles.barFill, { width: `${pct}%`, backgroundColor: color }]} />
      </View>
      <Text style={styles.barAmount}>{formatMoneyShort(value, displayCurrency)}</Text>
    </View>
  );
}

function SingleMonthState({ month, displayCurrency }) {
  return (
    <View style={styles.stateContainer}>
      <View style={styles.singleCard}>
        <Text style={styles.singleLabel}>{month.label}</Text>
        <Text style={styles.singleTotal} numberOfLines={1} adjustsFontSizeToFit>
          {formatMoney(month.total, displayCurrency)}
        </Text>
        <Text style={styles.monthTotalCount}>
          {month.count} {month.count === 1 ? 'expense' : 'expenses'}
        </Text>
      </View>
      <Text style={styles.stateHint}>
        Only one month of data so far — log expenses in another month to unlock comparisons.
      </Text>
    </View>
  );
}

function EmptyState() {
  return (
    <View style={styles.stateContainer}>
      <Text style={styles.stateEmoji}>{'📊'}</Text>
      <Text style={styles.stateTitle}>Nothing to compare yet</Text>
      <Text style={styles.stateHint}>
        Add a few expenses and come back to see month-over-month trends.
      </Text>
    </View>
  );
}

const styles = StyleSheet.create({
  overlay: {
    flex: 1,
    justifyContent: 'flex-end',
  },
  backdrop: {
    backgroundColor: 'rgba(0, 0, 0, 0.55)',
  },
  sheet: {
    backgroundColor: colors.background,
    borderTopLeftRadius: radius.lg,
    borderTopRightRadius: radius.lg,
    paddingTop: spacing.sm,
    maxHeight: '88%',
  },
  handleArea: {
    alignSelf: 'stretch',
    alignItems: 'center',
    paddingVertical: spacing.xs,
    marginBottom: spacing.sm,
  },
  handle: {
    width: 40,
    height: 5,
    borderRadius: 3,
    backgroundColor: colors.border,
  },
  titleRow: {
    flexDirection: 'row',
    justifyContent: 'space-between',
    alignItems: 'center',
    paddingHorizontal: spacing.lg,
    marginBottom: spacing.md,
  },
  title: {
    color: colors.textPrimary,
    fontSize: 20,
    fontWeight: '700',
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
  closeButtonText: {
    color: colors.textSecondary,
    fontSize: 14,
    fontWeight: '700',
  },
  body: {
    paddingHorizontal: spacing.lg,
    paddingBottom: spacing.xl,
  },
  pickerRow: {
    flexDirection: 'row',
    alignItems: 'center',
    marginBottom: spacing.sm,
  },
  pickerChips: {
    flexDirection: 'row',
    gap: spacing.sm,
    paddingRight: spacing.sm,
  },
  tagBadge: {
    width: 24,
    height: 24,
    borderRadius: 12,
    borderWidth: 1.5,
    alignItems: 'center',
    justifyContent: 'center',
    marginRight: spacing.sm,
  },
  tagText: {
    fontSize: 12,
    fontWeight: '800',
  },
  monthChip: {
    backgroundColor: colors.card,
    borderRadius: 20,
    borderWidth: 1,
    borderColor: 'transparent',
    paddingHorizontal: spacing.sm + 4,
    paddingVertical: spacing.sm - 2,
  },
  monthChipPressed: {
    backgroundColor: colors.cardPressed,
  },
  monthChipText: {
    color: colors.textSecondary,
    fontSize: 14,
    fontWeight: '600',
  },
  totalsCard: {
    backgroundColor: colors.card,
    borderRadius: radius.md,
    padding: spacing.md,
    marginTop: spacing.md,
    marginBottom: spacing.lg,
  },
  totalsRow: {
    flexDirection: 'row',
  },
  totalsDivider: {
    width: StyleSheet.hairlineWidth,
    backgroundColor: colors.border,
    marginHorizontal: spacing.sm,
  },
  monthTotal: {
    flex: 1,
    alignItems: 'center',
  },
  monthTotalHeader: {
    flexDirection: 'row',
    alignItems: 'center',
    marginBottom: spacing.xs + 2,
  },
  monthTotalLabel: {
    color: colors.textSecondary,
    fontSize: 13,
    fontWeight: '600',
  },
  monthTotalValue: {
    color: colors.textPrimary,
    fontSize: 24,
    fontWeight: '800',
    fontVariant: ['tabular-nums'],
  },
  monthTotalCount: {
    color: colors.textMuted,
    fontSize: 12,
    marginTop: 2,
  },
  delta: {
    textAlign: 'center',
    marginTop: spacing.sm + 4,
    fontSize: 14,
    fontWeight: '700',
    fontVariant: ['tabular-nums'],
  },
  sectionLabel: {
    color: colors.textSecondary,
    fontSize: 13,
    fontWeight: '700',
    textTransform: 'uppercase',
    letterSpacing: 1,
    marginBottom: spacing.sm,
  },
  categoryRow: {
    marginBottom: spacing.md,
  },
  categoryHeader: {
    flexDirection: 'row',
    alignItems: 'center',
    marginBottom: spacing.xs,
  },
  categoryEmoji: {
    fontSize: 15,
    marginRight: 6,
  },
  categoryLabel: {
    color: colors.textPrimary,
    fontSize: 14,
    fontWeight: '600',
  },
  barLine: {
    flexDirection: 'row',
    alignItems: 'center',
    marginTop: spacing.xs,
  },
  barTrack: {
    flex: 1,
    height: 8,
    borderRadius: 4,
    backgroundColor: colors.card,
    overflow: 'hidden',
  },
  barFill: {
    height: '100%',
    borderRadius: 4,
  },
  barAmount: {
    color: colors.textSecondary,
    fontSize: 12,
    fontWeight: '600',
    fontVariant: ['tabular-nums'],
    width: 64,
    textAlign: 'right',
    marginLeft: spacing.sm,
  },
  stateContainer: {
    alignItems: 'center',
    paddingHorizontal: spacing.lg,
    paddingTop: spacing.md,
    paddingBottom: spacing.xl + spacing.lg,
  },
  stateEmoji: {
    fontSize: 44,
    marginBottom: spacing.md,
  },
  stateTitle: {
    color: colors.textPrimary,
    fontSize: 18,
    fontWeight: '700',
    marginBottom: spacing.sm,
  },
  stateHint: {
    color: colors.textSecondary,
    fontSize: 14,
    textAlign: 'center',
    lineHeight: 20,
  },
  singleCard: {
    backgroundColor: colors.card,
    borderRadius: radius.md,
    padding: spacing.lg,
    alignSelf: 'stretch',
    alignItems: 'center',
    marginBottom: spacing.md,
  },
  singleLabel: {
    color: colors.textSecondary,
    fontSize: 14,
    fontWeight: '600',
    textTransform: 'uppercase',
    letterSpacing: 1,
  },
  singleTotal: {
    color: colors.textPrimary,
    fontSize: 34,
    fontWeight: '800',
    marginTop: spacing.xs,
    fontVariant: ['tabular-nums'],
  },
});
