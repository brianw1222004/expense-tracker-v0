import React, { useCallback, useMemo } from 'react';
import { Pressable, ScrollView, StyleSheet, Text, View } from 'react-native';
import { TAB_BAR_HEIGHT } from '../components/TabBar';
import { fonts, spacing, radius, useTheme, ACCOUNT_FAB_SIZE, cardShadow } from '../theme';
import { useT } from '../i18n';
import { formatMoney } from '../format';
import { convert } from '../currency';
import { groupNet, getPaymentMethodLabel, getPaymentMethodColor, getGroupIcon } from '../splits';
import { HIcon } from '../icons';

// The Split Bills tab: an overall owed/owe summary, then a two-column grid of
// square rounded group widget tiles (avatar, name, members · method, net
// balance), each accented by its payment-method color along the top edge.
// Tapping a tile opens the group's detail sheet; the "+" opens the create-group
// sheet. Balances are shown in the DISPLAY currency (each group's net is
// converted from its own currency) so the summary and the tiles agree.
export default function SplitBillsScreen({
  groups,
  splitExpenses,
  displayCurrency,
  summary,
  customPaymentMethods,
  onOpenGroup,
  onCreateGroup,
}) {
  const { colors } = useTheme();
  const t = useT();
  const styles = useMemo(() => createStyles(colors), [colors]);

  const hasGroups = groups.length > 0;

  return (
    <ScrollView
      style={styles.container}
      contentContainerStyle={styles.content}
      showsVerticalScrollIndicator={false}
    >
      <View style={styles.titleRow}>
        <Text style={styles.title} numberOfLines={1}>{t('split.title')}</Text>
      </View>

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
  );
}

const GroupCard = React.memo(function GroupCard({ group, splitExpenses, displayCurrency, customPaymentMethods, onOpenGroup, styles, colors, t }) {
  const handlePress = useCallback(() => onOpenGroup(group.id), [onOpenGroup, group.id]);
  const net = convert(groupNet(group, splitExpenses), group.currency, displayCurrency);
  const tone = net > 0 ? colors.success : net < 0 ? colors.danger : colors.textMuted;
  // The tile accents to its payment-method color (matches the themed
  // group-detail card): a tinted avatar circle + a top edge accent.
  const pmColor = getPaymentMethodColor(group.paymentMethod, customPaymentMethods);
  // Long balances (e.g. "owes you NT$10,837" — TWD renders 0 decimals) overflow
  // the narrow tile on one line, so split the label and the amount onto two
  // centered lines. The amount then gets the tile's full inner width to itself.
  // `balanceText` is kept as the full accessible/settled string.
  const amountText = formatMoney(Math.abs(net), displayCurrency);
  const balanceLabel =
    net > 0
      ? t('split.owesYouShort', { amount: '' }).trim()
      : net < 0
      ? t('split.youOweShort', { amount: '' }).trim()
      : '';
  const balanceText =
    net > 0
      ? t('split.owesYouShort', { amount: amountText })
      : net < 0
      ? t('split.youOweShort', { amount: amountText })
      : t('split.settled');

  return (
    <Pressable
      onPress={handlePress}
      accessibilityRole="button"
      style={({ pressed }) => [styles.groupTile, { borderTopColor: pmColor }, pressed && styles.groupTilePressed]}
    >
      <View style={[styles.groupIcon, { backgroundColor: `${pmColor}26` }]}>
        <HIcon name={getGroupIcon(group.icon)} size={24} color={pmColor} />
      </View>
      <Text style={styles.groupName} numberOfLines={1}>{group.name}</Text>
      <Text style={styles.groupMeta} numberOfLines={1}>
        {t('split.memberCount', { count: group.members.length })} · {getPaymentMethodLabel(group.paymentMethod, t, customPaymentMethods)}
      </Text>
      <View style={styles.groupBalanceBox} accessibilityLabel={balanceText}>
        {balanceLabel ? (
          <>
            <Text style={[styles.groupBalanceLabel, { color: tone }]} numberOfLines={1}>
              {balanceLabel}
            </Text>
            <Text
              style={[styles.groupBalance, { color: tone }]}
              numberOfLines={1}
              adjustsFontSizeToFit
              minimumFontScale={0.8}
            >
              {amountText}
            </Text>
          </>
        ) : (
          <Text style={[styles.groupBalance, { color: tone }]} numberOfLines={1}>
            {balanceText}
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
      flexGrow: 1,
      paddingBottom: spacing.xl + TAB_BAR_HEIGHT,
    },
    titleRow: {
      minHeight: ACCOUNT_FAB_SIZE,
      justifyContent: 'center',
      alignItems: 'center',
      marginTop: spacing.sm,
      marginBottom: spacing.md,
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
    // Two-column grid of square rounded group widget tiles.
    groupGrid: {
      flexDirection: 'row',
      flexWrap: 'wrap',
      gap: spacing.sm,
      marginHorizontal: spacing.md,
    },
    groupTile: {
      width: '48.4%',
      alignItems: 'center',
      backgroundColor: colors.card,
      borderRadius: radius.md,
      borderTopWidth: 3,
      paddingVertical: spacing.md,
      paddingHorizontal: spacing.sm + 2,
      ...cardShadow,
    },
    groupTilePressed: {
      backgroundColor: colors.cardPressed,
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
    groupBalanceBox: {
      marginTop: spacing.sm,
      alignSelf: 'stretch',
      alignItems: 'center',
    },
    groupBalanceLabel: {
      fontFamily: fonts.medium,
      fontSize: 11,
      lineHeight: 14,
      textAlign: 'center',
      marginBottom: 1,
    },
    groupBalance: {
      fontFamily: fonts.numBold,
      fontSize: 13,
      fontVariant: ['tabular-nums'],
      textAlign: 'center',
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
