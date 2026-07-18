import React, { useCallback, useMemo, useState } from 'react';
import { Pressable, ScrollView, StyleSheet, Text, View } from 'react-native';
import { useSafeAreaInsets } from 'react-native-safe-area-context';
import HeaderGlow from '../components/HeaderGlow';
import MonthSelector from '../components/MonthSelector';
import { TAB_BAR_HEIGHT } from '../components/TabBar';
import { fonts, spacing, radius, useTheme, ACCOUNT_FAB_SIZE, cardShadow } from '../theme';
import { useT, useLanguage } from '../i18n';
import { formatMoney, formatMoneyShort, shiftMonthKey, dayLabel } from '../format';
import { convert } from '../currency';
import { groupNet, billsForGroup, nameFor, getPaymentMethodLabel, getPaymentMethodColor, getGroupIcon, YOU } from '../splits';
import { HIcon } from '../icons';

// The Split Bills tab: an overall owed/owe summary, then a stack of full-width
// group widget cards — the left half is the group identity (avatar, name,
// members · method, net balance), the right half previews the group's most
// recent bills, each card tinted to its payment-method color with a deeper
// colored left edge (the expense-row treatment). Tapping a card opens the group's
// detail sheet; the "+" opens the create-group sheet. Net balances are shown in
// the DISPLAY currency (each group's net is converted from its own currency) so
// the summary and the cards agree; per-member balances stay in the GROUP
// currency, matching the group sheet they preview.
export default function SplitBillsScreen({
  groups,
  splitExpenses,
  displayCurrency,
  summary,
  currentMonthKey,
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
      <View style={styles.titleRow}>
        <Text style={styles.title} numberOfLines={1}>{t('split.title')}</Text>
      </View>

      <MonthSelector
        monthKey={monthKey}
        currentMonthKey={currentMonthKey}
        onShift={shiftMonth}
        style={styles.monthSelector}
      />

      <View style={styles.summaryCard}>
        <Text style={styles.summaryLabel}>{t('split.netBalance')}</Text>
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

        <View style={styles.summarySplitRow}>
          <View style={styles.summaryCol}>
            <Text style={styles.summaryColLabel}>{t('split.owedToYou')}</Text>
            <Text style={[styles.summaryColValue, { color: colors.success }]} numberOfLines={1}>
              {formatMoney(summary.owed, displayCurrency)}
            </Text>
          </View>
          <View style={styles.summaryDivider} />
          <View style={styles.summaryCol}>
            <Text style={styles.summaryColLabel}>{t('split.youOwe')}</Text>
            <Text style={[styles.summaryColValue, { color: colors.danger }]} numberOfLines={1}>
              {formatMoney(summary.owe, displayCurrency)}
            </Text>
          </View>
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

// How many bill tiles a card previews before collapsing into "+N more".
const MAX_CARD_BILLS = 2;

const GroupCard = React.memo(function GroupCard({ group, splitExpenses, displayCurrency, customPaymentMethods, onOpenGroup, styles, colors, t }) {
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
  const balanceText =
    net > 0
      ? t('split.owesYouShort', { amount: formatMoney(net, displayCurrency) })
      : net < 0
      ? t('split.youOweShort', { amount: formatMoney(-net, displayCurrency) })
      : t('split.settled');

  const shownBills = bills.slice(0, MAX_CARD_BILLS);
  const extraBills = bills.length - shownBills.length;

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
      <View style={styles.groupLeft}>
        <View style={[styles.groupIcon, { backgroundColor: `${pmColor}26` }]}>
          <HIcon name={getGroupIcon(group.icon)} size={24} color={pmColor} />
        </View>
        <Text style={styles.groupName} numberOfLines={1}>{group.name}</Text>
        <Text style={styles.groupMeta} numberOfLines={1}>
          {t('split.memberCount', { count: group.members.length })} · {getPaymentMethodLabel(group.paymentMethod, t, customPaymentMethods)}
        </Text>
        <Text style={[styles.groupBalance, { color: tone }]} numberOfLines={1}>{balanceText}</Text>
      </View>
      <View style={styles.groupBillsCol}>
        {shownBills.length === 0 ? (
          <Text style={styles.groupBillEmpty}>{t('split.noBills')}</Text>
        ) : (
          <>
            {shownBills.map((bill) => {
              const yourShare = bill.shares?.[YOU] || 0;
              return (
                <View key={bill.id} style={styles.groupBillTile}>
                  <View style={styles.groupBillLine}>
                    <Text style={styles.groupBillName} numberOfLines={1}>
                      {bill.description || t('split.bill')}
                    </Text>
                    <Text style={styles.groupBillAmount} numberOfLines={1}>
                      {formatMoneyShort(bill.amount, bill.currency)}
                    </Text>
                  </View>
                  <View style={styles.groupBillLine}>
                    <Text style={styles.groupBillMeta} numberOfLines={1}>
                      {t('split.paidByName', { name: nameFor(bill.paidBy, group, t) })} · {dayLabel(bill.createdAt, language)}
                    </Text>
                    {yourShare > 0 && (
                      <Text style={styles.groupBillShare} numberOfLines={1}>
                        {t('split.yourShareShort', { amount: formatMoneyShort(yourShare, bill.currency) })}
                      </Text>
                    )}
                  </View>
                </View>
              );
            })}
            {extraBills > 0 && (
              <Text style={styles.groupBillMore}>{t('split.moreMembers', { count: extraBills })}</Text>
            )}
          </>
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
    // Transparent so the fixed HeaderGlow wash behind it shows through; the
    // page background lives on `container`.
    scroll: {
      flex: 1,
    },
    content: {
      // paddingBottom is set inline (needs the safe-area inset).
      flexGrow: 1,
    },
    titleRow: {
      minHeight: ACCOUNT_FAB_SIZE,
      justifyContent: 'center',
      alignItems: 'center',
      marginTop: spacing.sm,
      marginBottom: spacing.xs,
      marginHorizontal: spacing.md,
      // Symmetric horizontal padding (clears the top-left account FAB) so the
      // title reads visually centered on screen.
      paddingHorizontal: ACCOUNT_FAB_SIZE,
    },
    title: {
      color: colors.textPrimary,
      fontFamily: fonts.bold,
      fontSize: 22,
      textAlign: 'center',
    },
    monthSelector: {
      marginBottom: spacing.md,
    },
    summaryCard: {
      backgroundColor: colors.card,
      borderRadius: radius.md,
      marginHorizontal: spacing.md,
      padding: spacing.lg,
      ...cardShadow,
    },
    summaryLabel: {
      color: colors.textMuted,
      fontFamily: fonts.medium,
      fontSize: 12,
      letterSpacing: 0.2,
    },
    summaryNet: {
      fontFamily: fonts.numBold,
      fontSize: 36,
      fontVariant: ['tabular-nums'],
      letterSpacing: -0.5,
      marginTop: spacing.xs,
    },
    summaryCaption: {
      color: colors.textMuted,
      fontFamily: fonts.regular,
      fontSize: 13,
      marginTop: 2,
    },
    summarySplitRow: {
      flexDirection: 'row',
      alignItems: 'center',
      marginTop: spacing.md,
      paddingTop: spacing.md,
      borderTopWidth: StyleSheet.hairlineWidth,
      borderTopColor: colors.border,
    },
    summaryCol: {
      flex: 1,
    },
    summaryColLabel: {
      color: colors.textMuted,
      fontFamily: fonts.regular,
      fontSize: 12,
    },
    summaryColValue: {
      fontFamily: fonts.numBold,
      fontSize: 18,
      fontVariant: ['tabular-nums'],
      marginTop: 2,
    },
    summaryDivider: {
      width: StyleSheet.hairlineWidth,
      alignSelf: 'stretch',
      backgroundColor: colors.border,
      marginHorizontal: spacing.md,
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
    // Stack of full-width group widget cards: identity on the left, nested
    // recent-bill tiles on the right. The payment-method wash + deeper left
    // edge come inline (per-group color).
    groupGrid: {
      gap: spacing.sm,
      marginHorizontal: spacing.md,
    },
    groupTile: {
      flexDirection: 'row',
      backgroundColor: colors.card,
      borderRadius: radius.md,
      borderLeftWidth: 3,
      paddingVertical: spacing.md,
      paddingHorizontal: spacing.md,
      ...cardShadow,
    },
    groupTilePressed: {
      backgroundColor: colors.cardPressed,
    },
    groupLeft: {
      width: '42%',
      alignItems: 'center',
      justifyContent: 'center',
      paddingRight: spacing.sm + 2,
    },
    groupIcon: {
      width: 48,
      height: 48,
      borderRadius: 24,
      backgroundColor: `${colors.accent}18`,
      alignItems: 'center',
      justifyContent: 'center',
    },
    groupName: {
      color: colors.textPrimary,
      fontFamily: fonts.bold,
      fontSize: 15,
      textAlign: 'center',
      marginTop: spacing.sm,
    },
    groupMeta: {
      color: colors.textMuted,
      fontFamily: fonts.regular,
      fontSize: 12,
      textAlign: 'center',
      marginTop: 2,
    },
    groupBalance: {
      fontFamily: fonts.numBold,
      fontSize: 13,
      fontVariant: ['tabular-nums'],
      textAlign: 'center',
      marginTop: spacing.sm,
    },
    // The bills preview: each bill is a nested surface tile (solid card color
    // floating on the payment-method wash) — desc + total on the first line,
    // payer · date and your share on the second.
    groupBillsCol: {
      flex: 1,
      justifyContent: 'center',
      gap: spacing.xs + 2,
      paddingLeft: spacing.sm + 2,
    },
    groupBillTile: {
      backgroundColor: colors.card,
      borderRadius: radius.sm,
      paddingVertical: spacing.xs + 2,
      paddingHorizontal: spacing.sm,
      gap: 2,
    },
    groupBillLine: {
      flexDirection: 'row',
      alignItems: 'center',
      justifyContent: 'space-between',
      gap: spacing.xs,
    },
    groupBillName: {
      flex: 1,
      color: colors.textPrimary,
      fontFamily: fonts.bold,
      fontSize: 13,
    },
    groupBillAmount: {
      color: colors.textPrimary,
      fontFamily: fonts.numBold,
      fontSize: 13,
      fontVariant: ['tabular-nums'],
    },
    groupBillMeta: {
      flex: 1,
      color: colors.textMuted,
      fontFamily: fonts.regular,
      fontSize: 11,
    },
    groupBillShare: {
      color: colors.textMuted,
      fontFamily: fonts.numRegular,
      fontSize: 11,
      fontVariant: ['tabular-nums'],
    },
    groupBillMore: {
      color: colors.textMuted,
      fontFamily: fonts.regular,
      fontSize: 12,
      textAlign: 'center',
    },
    groupBillEmpty: {
      color: colors.textMuted,
      fontFamily: fonts.regular,
      fontSize: 12,
      lineHeight: 17,
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
