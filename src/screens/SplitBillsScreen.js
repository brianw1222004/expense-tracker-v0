import React, { useCallback, useMemo, useState } from 'react';
import { Pressable, ScrollView, StyleSheet, Text, View } from 'react-native';
import HeaderGlow from '../components/HeaderGlow';
import MonthSelector from '../components/MonthSelector';
import { TAB_BAR_HEIGHT } from '../components/TabBar';
import { fonts, spacing, radius, useTheme, ACCOUNT_FAB_SIZE, cardShadow } from '../theme';
import { useT } from '../i18n';
import { formatMoney, formatMoneyShort, shiftMonthKey } from '../format';
import { convert } from '../currency';
import { groupNet, groupBalances, getPaymentMethodLabel, getPaymentMethodColor, getGroupIcon } from '../splits';
import { HIcon } from '../icons';

// The Split Bills tab: an overall owed/owe summary, then a stack of full-width
// group widget cards — the left half is the group identity (avatar, name,
// members · method, net balance), the right half previews the member section
// (per-member balances, as on the group sheet), each card accented by its
// payment-method color along the top edge. Tapping a card opens the group's
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
      contentContainerStyle={styles.content}
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

// How many member rows a card previews before collapsing into "+N more".
const MAX_CARD_MEMBERS = 3;

const GroupCard = React.memo(function GroupCard({ group, splitExpenses, displayCurrency, customPaymentMethods, onOpenGroup, styles, colors, t }) {
  const handlePress = useCallback(() => onOpenGroup(group.id), [onOpenGroup, group.id]);
  const net = convert(groupNet(group, splitExpenses), group.currency, displayCurrency);
  const tone = net > 0 ? colors.success : net < 0 ? colors.danger : colors.textMuted;
  // The card accents to its payment-method color (matches the themed
  // group-detail card): a tinted avatar circle + a top edge accent.
  const pmColor = getPaymentMethodColor(group.paymentMethod, customPaymentMethods);
  const balances = useMemo(() => groupBalances(group, splitExpenses), [group, splitExpenses]);
  const balanceText =
    net > 0
      ? t('split.owesYouShort', { amount: formatMoney(net, displayCurrency) })
      : net < 0
      ? t('split.youOweShort', { amount: formatMoney(-net, displayCurrency) })
      : t('split.settled');

  const shownMembers = group.members.slice(0, MAX_CARD_MEMBERS);
  const extraMembers = group.members.length - shownMembers.length;

  return (
    <Pressable
      onPress={handlePress}
      accessibilityRole="button"
      style={({ pressed }) => [styles.groupTile, { borderTopColor: pmColor }, pressed && styles.groupTilePressed]}
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
      <View style={styles.groupMembersCol}>
        {shownMembers.map((member) => {
          const bal = balances[member.id] ?? 0;
          const settled = Math.abs(bal) < 0.005;
          const memberTone = settled ? colors.textMuted : bal > 0 ? colors.success : colors.danger;
          const memberText = settled
            ? t('split.settled')
            : bal > 0
            ? t('split.owesYouShort', { amount: formatMoneyShort(bal, group.currency) })
            : t('split.youOweShort', { amount: formatMoneyShort(-bal, group.currency) });
          return (
            <View key={member.id} style={styles.groupMemberRow}>
              <View style={styles.groupMemberAvatar}>
                <Text style={styles.groupMemberInitial}>{(member.name || '?').slice(0, 1).toUpperCase()}</Text>
              </View>
              <View style={styles.groupMemberInfo}>
                <Text style={styles.groupMemberName} numberOfLines={1}>{member.name}</Text>
                <Text style={[styles.groupMemberBalance, { color: memberTone }]} numberOfLines={1}>{memberText}</Text>
              </View>
            </View>
          );
        })}
        {extraMembers > 0 && (
          <Text style={styles.groupMemberMore}>{t('split.moreMembers', { count: extraMembers })}</Text>
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
      flexGrow: 1,
      paddingBottom: spacing.xl + TAB_BAR_HEIGHT,
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
      letterSpacing: 0.8,
      textTransform: 'uppercase',
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
    // Stack of full-width group widget cards: identity on the left, a member
    // section preview on the right of a hairline divider.
    groupGrid: {
      gap: spacing.sm,
      marginHorizontal: spacing.md,
    },
    groupTile: {
      flexDirection: 'row',
      backgroundColor: colors.card,
      borderRadius: radius.md,
      borderTopWidth: 3,
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
    groupMembersCol: {
      flex: 1,
      justifyContent: 'center',
      gap: spacing.sm,
      paddingLeft: spacing.md,
      borderLeftWidth: StyleSheet.hairlineWidth,
      borderLeftColor: colors.border,
    },
    groupMemberRow: {
      flexDirection: 'row',
      alignItems: 'center',
      gap: spacing.sm,
    },
    groupMemberAvatar: {
      width: 28,
      height: 28,
      borderRadius: 14,
      backgroundColor: `${colors.accent}18`,
      alignItems: 'center',
      justifyContent: 'center',
    },
    groupMemberInitial: {
      color: colors.accent,
      fontFamily: fonts.bold,
      fontSize: 13,
    },
    groupMemberInfo: {
      flex: 1,
    },
    groupMemberName: {
      color: colors.textPrimary,
      fontFamily: fonts.bold,
      fontSize: 13,
    },
    groupMemberBalance: {
      fontFamily: fonts.numRegular,
      fontSize: 12,
      fontVariant: ['tabular-nums'],
      marginTop: 1,
    },
    groupMemberMore: {
      color: colors.textMuted,
      fontFamily: fonts.regular,
      fontSize: 12,
      marginLeft: 28 + spacing.sm,
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
