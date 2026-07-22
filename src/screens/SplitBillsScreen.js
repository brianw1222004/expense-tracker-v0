import React, { useCallback, useMemo, useState } from 'react';
import { Pressable, ScrollView, StyleSheet, Text, View } from 'react-native';
import { useSafeAreaInsets } from 'react-native-safe-area-context';
import HeaderGlow from '../components/HeaderGlow';
import MonthSelector from '../components/MonthSelector';
import { TAB_BAR_HEIGHT } from '../components/TabBar';
import { fonts, spacing, radius, useTheme, cardShadow } from '../theme';
import { useT, useLanguage } from '../i18n';
import { formatMoney, formatMoneyShort, shiftMonthKey, dayLabel } from '../format';
import { convert } from '../currency';
import { getCategory } from '../categories';
import {
  groupNet,
  billsForGroup,
  nameFor,
  getPaymentMethodLabel,
  getPaymentMethodColor,
  getGroupIcon,
  memberColor,
  billPositionCaption,
  YOU,
} from '../splits';
import { HIcon } from '../icons';

// The Split Bills tab: an overall owed/owe summary, then a stack of full-width
// group widget cards mirroring the group sheet's hero — a header row (method-
// tinted group icon, name, members · method, avatar stack), the group's
// all-time total spent with a toned net line, then icon-badged recent-bill
// preview rows on a nested surface — each card tinted to its payment-method
// color with a deeper colored left edge (the expense-row treatment). Tapping a
// card opens the group's detail sheet; the "+" opens the create-group sheet.
// The card's total and net are shown in the DISPLAY currency (converted from
// the group's own currency) so the summary and the cards agree; per-member
// balances stay in the GROUP currency, matching the group sheet they preview.
export default function SplitBillsScreen({
  groups,
  splitExpenses,
  displayCurrency,
  summary,
  currentMonthKey,
  customCategories,
  customPaymentMethods,
  onOpenGroup,
  onCreateGroup,
}) {
  const { colors } = useTheme();
  const t = useT();
  const insets = useSafeAreaInsets();
  const styles = useMemo(() => createStyles(colors), [colors]);
  // This page's month selection (under the title, matching every other tab).
  // DELIBERATELY display-only: balances are outstanding debts, so the summary
  // and group cards stay all-time regardless of the selected month (product
  // decision — don't wire it into the balance math without asking).
  const [monthKey, setMonthKey] = useState(currentMonthKey);
  const shiftMonth = (dir) => setMonthKey((key) => shiftMonthKey(key, dir));

  const hasGroups = groups.length > 0;

  return (
    <View style={styles.container}>
      <HeaderGlow id="splitHeaderGlow" />
    <ScrollView
      style={styles.scroll}
      contentContainerStyle={[styles.content, { paddingBottom: spacing.xl + TAB_BAR_HEIGHT + insets.bottom }]}
      showsVerticalScrollIndicator={false}
    >
      <Text style={styles.title} numberOfLines={1}>{t('split.title')}</Text>

      <MonthSelector
        monthKey={monthKey}
        currentMonthKey={currentMonthKey}
        onShift={shiftMonth}
        style={styles.monthSelector}
      />

      <View style={styles.summaryCard}>
        <Text style={styles.summaryTitle} numberOfLines={1}>{t('split.netBalance')}</Text>
        <Text
          style={[
            styles.summaryNet,
            { color: summary.net > 0 ? colors.success : summary.net < 0 ? colors.danger : colors.textPrimary },
          ]}
          numberOfLines={1}
          adjustsFontSizeToFit
        >
          {summary.net >= 0
            ? formatMoney(summary.net, displayCurrency)
            : `-${formatMoney(-summary.net, displayCurrency)}`}
        </Text>
        <Text style={styles.summaryCaption}>
          {summary.net > 0
            ? t('split.youAreOwedNet')
            : summary.net < 0
            ? t('split.youOweNet')
            : t('split.allSettled')}
        </Text>

        {(summary.owed > 0 || summary.owe > 0) && (
          <View style={styles.summaryBar}>
            {summary.owed > 0 && (
              <View style={[styles.summaryBarSeg, { flex: summary.owed, backgroundColor: colors.success }]} />
            )}
            {summary.owe > 0 && (
              <View style={[styles.summaryBarSeg, { flex: summary.owe, backgroundColor: colors.danger }]} />
            )}
          </View>
        )}

        <View style={styles.summaryTileRow}>
          <SummaryTile
            label={t('split.owedToYou')}
            amount={summary.owed}
            count={summary.owedCount}
            tone={colors.success}
            icon="money-receive-square"
            displayCurrency={displayCurrency}
            styles={styles}
            t={t}
          />
          <SummaryTile
            label={t('split.youOwe')}
            amount={summary.owe}
            count={summary.oweCount}
            tone={colors.danger}
            icon="money-send-square"
            displayCurrency={displayCurrency}
            styles={styles}
            t={t}
          />
        </View>
      </View>

      <View style={styles.sectionRow}>
        <Text style={styles.sectionTitle}>{t('split.groups')}</Text>
        <Pressable
          onPress={onCreateGroup}
          accessibilityRole="button"
          accessibilityLabel={t('split.newGroup')}
          style={({ pressed }) => [styles.newGroupPill, pressed && styles.newGroupPillPressed]}
        >
          <HIcon name="plus-sign" size={14} color={colors.accent} />
          <Text style={styles.newGroupText}>{t('split.newGroup')}</Text>
        </Pressable>
      </View>

      {hasGroups ? (
        <View style={styles.groupGrid}>
          {groups.map((group) => (
            <GroupCard
              key={group.id}
              group={group}
              splitExpenses={splitExpenses}
              displayCurrency={displayCurrency}
              customCategories={customCategories}
              customPaymentMethods={customPaymentMethods}
              onOpenGroup={onOpenGroup}
              styles={styles}
              colors={colors}
              t={t}
            />
          ))}
        </View>
      ) : (
        <View style={styles.empty}>
          <HIcon name="user-group" size={40} color={colors.icon} />
          <Text style={styles.emptyTitle}>{t('split.emptyTitle')}</Text>
          <Text style={styles.emptyHint}>{t('split.emptyHint')}</Text>
          <Pressable
            onPress={onCreateGroup}
            accessibilityRole="button"
            style={({ pressed }) => [styles.emptyButton, pressed && styles.emptyButtonPressed]}
          >
            <Text style={styles.emptyButtonText}>{t('split.createFirst')}</Text>
          </Pressable>
        </View>
      )}
    </ScrollView>
    </View>
  );
}

// One tinted half of the summary card: toned amount over its label and a
// person-count caption (same caption rule as the Dashboard split widget), with
// a toned icon chip on the right. Tone wash + chip colors come inline.
function SummaryTile({ label, amount, count, tone, icon, displayCurrency, styles, t }) {
  const caption =
    count <= 0 ? t('split.noDebts') : count === 1 ? t('split.personOne') : t('split.personCount', { n: count });
  return (
    <View style={[styles.summaryTile, { backgroundColor: `${tone}12` }]}>
      <View style={styles.summaryTileText}>
        <Text style={[styles.summaryTileValue, { color: tone }]} numberOfLines={1}>
          {formatMoneyShort(amount, displayCurrency)}
        </Text>
        <Text style={styles.summaryTileLabel} numberOfLines={1}>{label}</Text>
        <Text style={styles.summaryTileCaption} numberOfLines={1}>{caption}</Text>
      </View>
      <View style={[styles.summaryTileChip, { backgroundColor: `${tone}1F` }]}>
        <HIcon name={icon} size={18} color={tone} strokeWidth={1.8} />
      </View>
    </View>
  );
}

// How many bill tiles a card previews before collapsing into "+N more".
const MAX_CARD_BILLS = 2;

const GroupCard = React.memo(function GroupCard({ group, splitExpenses, displayCurrency, customCategories, customPaymentMethods, onOpenGroup, styles, colors, t }) {
  const language = useLanguage();
  const handlePress = useCallback(() => onOpenGroup(group.id), [onOpenGroup, group.id]);
  const net = convert(groupNet(group, splitExpenses), group.currency, displayCurrency);
  const tone = net > 0 ? colors.success : net < 0 ? colors.danger : colors.textMuted;
  // The card accents to its payment-method color (matches the themed
  // group-detail card): a tinted avatar circle + the expense-row treatment —
  // a soft color wash with a deeper colored left edge.
  const pmColor = getPaymentMethodColor(group.paymentMethod, customPaymentMethods);
  const bills = useMemo(
    () => billsForGroup(group.id, splitExpenses).filter((b) => !b.settlement).sort((a, b) => b.createdAt - a.createdAt),
    [group.id, splitExpenses]
  );
  // When a group's bills span more than one currency, the card's converted
  // total (display currency) and the per-bill preview amounts (each in the
  // bill's own currency) are different units — tag the previews with their ISO
  // code so the two figures can't be misread as the same currency. Single-
  // currency groups (the common case) show no code.
  const mixedCurrency = useMemo(() => new Set(bills.map((b) => b.currency)).size > 1, [bills]);
  // The group-sheet hero's figure, converted to the display currency so it
  // agrees with the net line under it (and the summary card above).
  const totalSpent = useMemo(
    () => bills.reduce((sum, b) => sum + convert(b.amount, b.currency, displayCurrency), 0),
    [bills, displayCurrency]
  );
  const balanceText =
    net > 0
      ? t('split.owesYouShort', { amount: formatMoney(net, displayCurrency) })
      : net < 0
      ? t('split.youOweShort', { amount: formatMoney(-net, displayCurrency) })
      : t('split.settled');

  const shownBills = bills.slice(0, MAX_CARD_BILLS);
  const extraBills = bills.length - shownBills.length;
  const stackPeople = [
    { id: YOU, name: t('split.you'), color: colors.accent },
    ...group.members.map((m) => ({ id: m.id, name: m.name, color: memberColor(m.id) })),
  ];
  const shownStack = stackPeople.slice(0, 5);
  const stackOverflow = stackPeople.length - shownStack.length;

  return (
    <Pressable
      onPress={handlePress}
      accessibilityRole="button"
      style={({ pressed }) => [
        styles.groupTile,
        { backgroundColor: `${pmColor}0A`, borderLeftColor: `${pmColor}33` },
        pressed && styles.groupTilePressed,
      ]}
    >
      <View style={styles.groupHeaderRow}>
        <View style={[styles.groupIcon, { backgroundColor: `${pmColor}26` }]}>
          <HIcon name={getGroupIcon(group.icon)} size={22} color={pmColor} />
        </View>
        <View style={styles.groupHeaderText}>
          <Text style={styles.groupName} numberOfLines={1}>{group.name}</Text>
          <Text style={styles.groupMeta} numberOfLines={1}>
            {group.members.length === 1 ? t('split.memberOne') : t('split.memberCount', { count: group.members.length })} · {getPaymentMethodLabel(group.paymentMethod, t, customPaymentMethods)}
          </Text>
        </View>
        <View style={styles.avatarStack}>
          {shownStack.map((p, i) => (
            <View
              key={p.id}
              style={[styles.stackAvatar, { backgroundColor: p.color }, i > 0 && styles.stackOverlap]}
            >
              <Text style={styles.stackAvatarText}>{(p.name || '?').slice(0, 1).toUpperCase()}</Text>
            </View>
          ))}
          {stackOverflow > 0 && (
            <View style={[styles.stackAvatar, styles.stackAvatarMore, styles.stackOverlap]}>
              <Text style={styles.stackAvatarMoreText}>+{stackOverflow}</Text>
            </View>
          )}
        </View>
      </View>

      <Text style={styles.groupTotalLabel}>{t('split.totalSpent')}</Text>
      <Text style={styles.groupTotal} numberOfLines={1} adjustsFontSizeToFit>
        {formatMoney(totalSpent, displayCurrency)}
      </Text>
      <View style={styles.groupNetRow}>
        <View style={[styles.groupNetDot, { backgroundColor: tone }]} />
        <Text style={[styles.groupBalance, { color: tone }]} numberOfLines={1}>{balanceText}</Text>
      </View>

      {shownBills.length === 0 ? (
        <Text style={styles.groupBillEmpty}>{t('split.noBills')}</Text>
      ) : (
        <View style={styles.groupBillPanel}>
          {shownBills.map((bill, i) => {
            const cat = getCategory(bill.category, customCategories);
            const { tone: posTone, text: posText } = billPositionCaption(bill, {
              formatAmount: formatMoneyShort,
              t,
              colors,
            });
            return (
              <View key={bill.id} style={[styles.groupBillRow, i > 0 && styles.groupBillDivider]}>
                <View style={[styles.groupBillIcon, { backgroundColor: `${cat.color}1F` }]}>
                  <HIcon name={cat.emoji} size={14} color={cat.color} strokeWidth={1.8} />
                </View>
                <View style={styles.groupBillInfo}>
                  <Text style={styles.groupBillName} numberOfLines={1}>
                    {bill.description || t('split.bill')}
                  </Text>
                  <Text style={styles.groupBillMeta} numberOfLines={1}>
                    {t('split.paidByName', { name: nameFor(bill.paidBy, group, t) })} · {dayLabel(bill.createdAt, language)}
                  </Text>
                </View>
                <View style={styles.groupBillRight}>
                  <Text style={styles.groupBillAmount} numberOfLines={1}>
                    {formatMoneyShort(bill.amount, bill.currency)}{mixedCurrency ? ` ${bill.currency}` : ''}
                  </Text>
                  <Text style={[styles.groupBillShare, { color: posTone }]} numberOfLines={1}>{posText}</Text>
                </View>
              </View>
            );
          })}
          {extraBills > 0 && (
            <Text style={styles.groupBillMore}>{t('split.moreMembers', { count: extraBills })}</Text>
          )}
        </View>
      )}
    </Pressable>
  );
});

const createStyles = (colors) =>
  StyleSheet.create({
    container: {
      flex: 1,
      backgroundColor: colors.background,
    },
    // Transparent so the fixed HeaderGlow wash behind it shows through; the
    // page background lives on `container`.
    scroll: {
      flex: 1,
    },
    content: {
      // paddingBottom is set inline (needs the safe-area inset).
      flexGrow: 1,
    },
    // Same title treatment as the Dashboard page (the reference for the
    // title → month selector → first card rhythm on every tab).
    title: {
      color: colors.textPrimary,
      fontSize: 26,
      fontFamily: fonts.bold,
      paddingHorizontal: spacing.md,
      paddingTop: spacing.md,
      textAlign: 'center',
    },
    monthSelector: {
      marginBottom: spacing.md,
    },
    // Mirrors the Insight Budget card: same card chrome, a left-aligned bold
    // card title, then the centered hero + bar + tiles body.
    summaryCard: {
      backgroundColor: colors.card,
      borderRadius: radius.md,
      marginHorizontal: spacing.md,
      padding: spacing.md,
      ...cardShadow,
    },
    summaryTitle: {
      color: colors.textPrimary,
      fontFamily: fonts.bold,
      fontSize: 15,
      marginBottom: spacing.sm,
    },
    summaryNet: {
      fontFamily: fonts.numBold,
      fontSize: 30,
      fontVariant: ['tabular-nums'],
      letterSpacing: -0.5,
      marginTop: spacing.xs,
      textAlign: 'center',
    },
    summaryCaption: {
      color: colors.textMuted,
      fontFamily: fonts.regular,
      fontSize: 12,
      marginTop: 1,
      textAlign: 'center',
    },
    // Owed-vs-owe proportion bar: two pill segments whose flex weights are the
    // raw amounts; minWidth keeps a lopsided side visible as a dot.
    summaryBar: {
      flexDirection: 'row',
      height: 6,
      marginTop: spacing.md,
      gap: 3,
    },
    summaryBarSeg: {
      borderRadius: 3,
      minWidth: 6,
    },
    summaryTileRow: {
      flexDirection: 'row',
      gap: spacing.sm,
      marginTop: spacing.md,
    },
    summaryTile: {
      flex: 1,
      flexDirection: 'row',
      alignItems: 'flex-start',
      justifyContent: 'space-between',
      gap: spacing.xs,
      borderRadius: radius.sm + 2,
      padding: spacing.sm + 4,
    },
    summaryTileText: {
      flex: 1,
    },
    summaryTileValue: {
      fontFamily: fonts.numBold,
      fontSize: 17,
      fontVariant: ['tabular-nums'],
    },
    summaryTileLabel: {
      color: colors.textPrimary,
      fontFamily: fonts.regular,
      fontSize: 12,
      marginTop: 2,
    },
    summaryTileCaption: {
      color: colors.textMuted,
      fontFamily: fonts.regular,
      fontSize: 11,
      marginTop: 1,
    },
    summaryTileChip: {
      width: 30,
      height: 30,
      borderRadius: 9,
      alignItems: 'center',
      justifyContent: 'center',
    },
    sectionRow: {
      flexDirection: 'row',
      justifyContent: 'space-between',
      alignItems: 'center',
      marginHorizontal: spacing.md,
      marginTop: spacing.lg,
      marginBottom: spacing.sm,
    },
    sectionTitle: {
      color: colors.textPrimary,
      fontFamily: fonts.bold,
      fontSize: 15,
    },
    newGroupPill: {
      flexDirection: 'row',
      alignItems: 'center',
      gap: spacing.xs,
      backgroundColor: `${colors.accent}15`,
      borderRadius: 14,
      paddingHorizontal: spacing.sm + 2,
      paddingVertical: spacing.xs + 1,
    },
    newGroupPillPressed: {
      opacity: 0.6,
    },
    newGroupText: {
      color: colors.accent,
      fontFamily: fonts.bold,
      fontSize: 13,
    },
    // Stack of full-width group widget cards mirroring the group sheet's hero:
    // header row (icon, name+meta, avatar stack), total + net line, then the
    // recent-bill preview rows on a nested solid surface. The payment-method
    // wash + deeper left edge come inline (per-group color).
    groupGrid: {
      gap: spacing.sm,
      marginHorizontal: spacing.md,
    },
    groupTile: {
      backgroundColor: colors.card,
      borderRadius: radius.md,
      borderLeftWidth: 3,
      padding: spacing.md,
      ...cardShadow,
    },
    groupTilePressed: {
      backgroundColor: colors.cardPressed,
    },
    groupHeaderRow: {
      flexDirection: 'row',
      alignItems: 'center',
      gap: spacing.sm + 2,
    },
    groupIcon: {
      width: 40,
      height: 40,
      borderRadius: 20,
      // No base fill: the render site always overrides with the group's
      // payment-method tint (`${pmColor}26`).
      alignItems: 'center',
      justifyContent: 'center',
    },
    groupHeaderText: {
      flex: 1,
    },
    groupName: {
      color: colors.textPrimary,
      fontFamily: fonts.bold,
      fontSize: 16,
    },
    groupMeta: {
      color: colors.textMuted,
      fontFamily: fonts.regular,
      fontSize: 12,
      marginTop: 1,
    },
    // Overlapping people stack (you in the accent, members in their palette
    // colors) — sized to MATCH the group sheet's hero stack so the card→sheet
    // transition doesn't visibly resize the avatars.
    avatarStack: {
      flexDirection: 'row',
      alignItems: 'center',
    },
    stackAvatar: {
      width: 26,
      height: 26,
      borderRadius: 13,
      borderWidth: 2,
      borderColor: colors.card,
      alignItems: 'center',
      justifyContent: 'center',
    },
    stackOverlap: {
      marginLeft: -8,
    },
    stackAvatarText: {
      color: colors.card,
      fontFamily: fonts.bold,
      fontSize: 10,
    },
    stackAvatarMore: {
      backgroundColor: colors.cardPressed,
    },
    stackAvatarMoreText: {
      color: colors.textSecondary,
      fontFamily: fonts.numBold,
      fontSize: 9,
      fontVariant: ['tabular-nums'],
    },
    groupTotalLabel: {
      color: colors.textSecondary,
      fontFamily: fonts.bold,
      fontSize: 12,
      letterSpacing: 0.2,
      marginTop: spacing.md,
    },
    groupTotal: {
      color: colors.textPrimary,
      fontFamily: fonts.numBold,
      fontSize: 24,
      fontVariant: ['tabular-nums'],
      letterSpacing: -0.5,
      marginTop: 2,
    },
    groupNetRow: {
      flexDirection: 'row',
      alignItems: 'center',
      gap: spacing.xs + 2,
      marginTop: 2,
    },
    groupNetDot: {
      width: 6,
      height: 6,
      borderRadius: 3,
    },
    groupBalance: {
      fontFamily: fonts.numRegular,
      fontSize: 13,
      fontVariant: ['tabular-nums'],
    },
    // The bills preview: icon-badged rows (the group sheet's bill-row format,
    // compacted) on a solid surface floating over the payment-method wash.
    groupBillPanel: {
      backgroundColor: colors.card,
      borderRadius: radius.sm + 2,
      paddingHorizontal: spacing.sm + 2,
      marginTop: spacing.sm + 4,
    },
    groupBillRow: {
      flexDirection: 'row',
      alignItems: 'center',
      gap: spacing.sm,
      paddingVertical: spacing.sm,
    },
    groupBillDivider: {
      borderTopWidth: StyleSheet.hairlineWidth,
      borderTopColor: colors.border,
    },
    groupBillIcon: {
      width: 28,
      height: 28,
      borderRadius: 14,
      alignItems: 'center',
      justifyContent: 'center',
    },
    groupBillInfo: {
      flex: 1,
    },
    groupBillName: {
      color: colors.textPrimary,
      fontFamily: fonts.bold,
      fontSize: 13,
    },
    groupBillMeta: {
      color: colors.textMuted,
      fontFamily: fonts.regular,
      fontSize: 11,
      marginTop: 1,
    },
    groupBillRight: {
      alignItems: 'flex-end',
    },
    groupBillAmount: {
      color: colors.textPrimary,
      fontFamily: fonts.numBold,
      fontSize: 13,
      fontVariant: ['tabular-nums'],
    },
    groupBillShare: {
      fontFamily: fonts.numRegular,
      fontSize: 11,
      fontVariant: ['tabular-nums'],
      marginTop: 1,
    },
    groupBillMore: {
      color: colors.textMuted,
      fontFamily: fonts.regular,
      fontSize: 12,
      textAlign: 'center',
      paddingBottom: spacing.sm,
    },
    groupBillEmpty: {
      color: colors.textMuted,
      fontFamily: fonts.regular,
      fontSize: 12,
      lineHeight: 17,
      marginTop: spacing.sm + 4,
    },
    empty: {
      alignItems: 'center',
      paddingHorizontal: spacing.xl,
      paddingTop: spacing.xl * 1.5,
    },
    emptyTitle: {
      color: colors.textPrimary,
      fontFamily: fonts.bold,
      fontSize: 17,
      marginTop: spacing.md,
    },
    emptyHint: {
      color: colors.textMuted,
      fontFamily: fonts.regular,
      fontSize: 14,
      textAlign: 'center',
      lineHeight: 20,
      marginTop: spacing.xs,
    },
    emptyButton: {
      backgroundColor: colors.accent,
      borderRadius: radius.md,
      paddingHorizontal: spacing.lg,
      paddingVertical: spacing.sm + 4,
      marginTop: spacing.lg,
    },
    emptyButtonPressed: {
      backgroundColor: colors.accentDark,
    },
    emptyButtonText: {
      color: colors.onAccent,
      fontFamily: fonts.bold,
      fontSize: 15,
    },
  });
