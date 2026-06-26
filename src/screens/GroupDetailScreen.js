import { useEffect, useMemo, useState } from 'react';
import { Pressable, ScrollView, StyleSheet, Text, TextInput, View } from 'react-native';
import { useSafeAreaInsets } from 'react-native-safe-area-context';
import { fonts, radius, spacing, useTheme, panelShadow } from '../theme';
import Sheet from '../components/Sheet';
import CurrencyPill from '../components/CurrencyPill';
import CurrencyPicker from '../components/CurrencyPicker';
import { useT, useLanguage, translate } from '../i18n';
import { confirmDestructive } from '../confirm';
import { getCurrency } from '../currency';
import { formatMoney, dayLabel } from '../format';
import { groupBalances, billsForGroup, PAYMENT_METHODS, getPaymentMethodLabel, YOU } from '../splits';
import { HIcon } from '../icons';

// Group-detail sheet: per-member balances (who owes whom) with settle-up, the
// list of bills, and add-bill / delete-group actions. Balances are in the
// group's own currency. A null group renders a closed sheet so the parent can
// keep it mounted without guarding every prop.
export default function GroupDetailScreen({
  visible,
  group,
  splitExpenses,
  onAddBill,
  onDeleteBill,
  onSettle,
  onUpdateGroup,
  onDeleteGroup,
  onClose,
}) {
  const { colors } = useTheme();
  const t = useT();
  const language = useLanguage();
  const insets = useSafeAreaInsets();
  const styles = useMemo(() => createStyles(colors), [colors]);
  const [currencyOpen, setCurrencyOpen] = useState(false);
  // Local draft of member names so renames don't enqueue a sync op per keystroke;
  // edits commit to the group on blur. Add/remove commit immediately.
  const [memberDraft, setMemberDraft] = useState([]);

  const balances = useMemo(
    () => (group ? groupBalances(group, splitExpenses) : {}),
    [group, splitExpenses]
  );
  const bills = useMemo(
    () => (group ? billsForGroup(group.id, splitExpenses).filter((b) => !b.settlement).sort((a, b) => b.createdAt - a.createdAt) : []),
    [group, splitExpenses]
  );

  // Member ids referenced by ANY bill/settlement in this group — removing one of
  // these would silently drop a balance, so removal is blocked for them.
  const usedMemberIds = useMemo(() => {
    const used = new Set();
    if (!group) return used;
    for (const b of billsForGroup(group.id, splitExpenses)) {
      if (b.settlement) {
        if (b.from && b.from !== YOU) used.add(b.from);
        if (b.to && b.to !== YOU) used.add(b.to);
        continue;
      }
      if (b.paidBy && b.paidBy !== YOU) used.add(b.paidBy);
      for (const pid of Object.keys(b.shares || {})) {
        if (pid !== YOU) used.add(pid);
      }
    }
    return used;
  }, [group, splitExpenses]);

  // Keep the draft in sync with the persisted member list (id + name) whenever
  // the group changes from outside (open, add, remove, sync pull).
  const memberSig = group ? group.members.map((m) => `${m.id}:${m.name}`).join('|') : '';
  useEffect(() => {
    setMemberDraft(group ? group.members.map((m) => ({ id: m.id, name: m.name })) : []);
  }, [memberSig]);

  // Draft member ids whose trimmed name collides (case-insensitive) with an
  // earlier member — flagged with a danger border, blocked from committing.
  const duplicateIds = useMemo(() => {
    const seen = new Map();
    const dupes = new Set();
    for (const m of memberDraft) {
      const key = m.name.trim().toLowerCase();
      if (!key) continue;
      if (seen.has(key)) dupes.add(m.id);
      else seen.set(key, m.id);
    }
    return dupes;
  }, [memberDraft]);

  if (!group) return <Sheet visible={false} onClose={onClose}>{null}</Sheet>;

  const newMemberId = () =>
    globalThis.crypto?.randomUUID?.() ??
    `m_${Date.now().toString(36)}_${Math.random().toString(36).slice(2, 10)}`;

  // Persist the draft as the group's members, dropping blank names. Rejected if
  // it would introduce duplicate (case-insensitive) names.
  const commitMembers = (draft) => {
    const cleaned = draft.map((m) => ({ id: m.id, name: m.name.trim() })).filter((m) => m.name);
    const lower = cleaned.map((m) => m.name.toLowerCase());
    if (new Set(lower).size !== lower.length) return; // duplicate — keep editing
    onUpdateGroup(group.id, { members: cleaned });
  };

  const setDraftNameAt = (id, value) =>
    setMemberDraft((prev) => prev.map((m) => (m.id === id ? { ...m, name: value } : m)));

  const commitDraft = () => commitMembers(memberDraft);

  const addMember = () => {
    const next = [...memberDraft, { id: newMemberId(), name: '' }];
    setMemberDraft(next);
    // Don't persist yet — a blank name is dropped on commit; the new row commits
    // once the user types a name and blurs.
  };

  const removeMember = (id) => {
    if (usedMemberIds.has(id)) return; // guarded in UI too
    const next = memberDraft.filter((m) => m.id !== id);
    setMemberDraft(next);
    commitMembers(next);
  };

  const cur = getCurrency(group.currency);
  const minUnit = 1 / 10 ** cur.decimals;
  const nameFor = (id) =>
    id === YOU ? t('split.you') : group.members.find((m) => m.id === id)?.name ?? t('split.someone');

  const confirm = async (title, body, onYes) => {
    const ok = await confirmDestructive({
      title,
      body,
      confirmLabel: translate(language, 'common.delete'),
      cancelLabel: translate(language, 'common.cancel'),
    });
    if (ok) onYes();
  };

  return (
    <Sheet visible={visible} onClose={onClose} showHandle sheetStyle={styles.sheetOverride}>
      <View style={styles.titleRow}>
        <View style={styles.titleLeft}>
          <View style={styles.groupIcon}>
            <HIcon name="user-group" size={20} color={colors.accent} />
          </View>
          <View style={styles.titleText}>
            <Text style={styles.title} numberOfLines={1}>{group.name}</Text>
            <Text style={styles.subtitle} numberOfLines={1}>
              {t('split.memberCount', { count: group.members.length })}
            </Text>
          </View>
        </View>
        <Pressable
          onPress={onClose}
          hitSlop={12}
          accessibilityRole="button"
          accessibilityLabel={t('common.close')}
          style={({ pressed }) => [styles.closeButton, pressed && styles.closeButtonPressed]}
        >
          <HIcon name="cancel-01" size={20} color={colors.icon} />
        </Pressable>
      </View>

      <ScrollView
        contentContainerStyle={{ paddingBottom: spacing.xl + insets.bottom }}
        showsVerticalScrollIndicator={false}
      >
        <Text style={styles.sectionHeader}>{t('split.groupSettings')}</Text>
        <View style={styles.card}>
          <View style={styles.settingRow}>
            <Text style={styles.settingLabel}>{t('split.currency')}</Text>
            <CurrencyPill
              value={group.currency}
              onPress={() => setCurrencyOpen(true)}
              accessibilityLabel={t('currency.choose')}
            />
          </View>
          <View style={[styles.settingColumn, styles.rowDivider]}>
            <Text style={styles.settingLabel}>{t('split.paymentMethod')}</Text>
            <View style={styles.chipRow}>
              {PAYMENT_METHODS.map((pm) => {
                const selected = pm.id === (group.paymentMethod || 'cash');
                return (
                  <Pressable
                    key={pm.id}
                    onPress={() => onUpdateGroup(group.id, { paymentMethod: pm.id })}
                    accessibilityRole="radio"
                    accessibilityState={{ selected }}
                    style={({ pressed }) => [styles.chip, selected && styles.chipSelected, pressed && styles.chipPressed]}
                  >
                    <Text style={[styles.chipLabel, selected && styles.chipLabelSelected]}>
                      {getPaymentMethodLabel(pm.id, t)}
                    </Text>
                  </Pressable>
                );
              })}
            </View>
          </View>
        </View>

        <Text style={styles.sectionHeader}>{t('split.members')}</Text>
        <View style={styles.card}>
          {memberDraft.map((member, index) => {
            const inUse = usedMemberIds.has(member.id);
            return (
              <View
                key={member.id}
                style={[
                  styles.editMemberRow,
                  index > 0 && styles.rowDivider,
                  duplicateIds.has(member.id) && styles.memberRowDup,
                ]}
              >
                <HIcon name="user-circle" size={18} color={colors.icon} />
                <TextInput
                  style={styles.memberInput}
                  value={member.name}
                  onChangeText={(v) => setDraftNameAt(member.id, v)}
                  onBlur={commitDraft}
                  placeholder={t('split.memberPlaceholder', { n: index + 1 })}
                  placeholderTextColor={colors.textMuted}
                  keyboardAppearance={colors.keyboardAppearance}
                  maxLength={30}
                  accessibilityLabel={t('split.memberPlaceholder', { n: index + 1 })}
                />
                {memberDraft.length > 1 && (
                  <Pressable
                    onPress={() => removeMember(member.id)}
                    disabled={inUse}
                    hitSlop={10}
                    accessibilityRole="button"
                    accessibilityLabel={t('common.delete')}
                    accessibilityState={{ disabled: inUse }}
                    style={({ pressed }) => [
                      inUse && styles.removeDisabled,
                      pressed && !inUse && styles.rowPressed,
                    ]}
                  >
                    <HIcon name="cancel-01" size={16} color={colors.textMuted} />
                  </Pressable>
                )}
              </View>
            );
          })}
        </View>
        <Pressable
          onPress={addMember}
          accessibilityRole="button"
          style={({ pressed }) => [styles.addMemberRow, pressed && styles.addMemberPressed]}
        >
          <HIcon name="plus-sign" size={14} color={colors.accent} />
          <Text style={styles.addMemberText}>{t('split.addMember')}</Text>
        </Pressable>

        <Text style={styles.sectionHeader}>{t('split.balances')}</Text>
        <View style={styles.card}>
          {group.members.map((member, index) => {
            const bal = balances[member.id] ?? 0;
            const settled = Math.abs(bal) < minUnit;
            const tone = settled ? colors.textMuted : bal > 0 ? colors.success : colors.danger;
            const text = settled
              ? t('split.settled')
              : bal > 0
              ? t('split.owesYou', { amount: formatMoney(bal, group.currency) })
              : t('split.youOweMember', { amount: formatMoney(-bal, group.currency) });
            return (
              <View key={member.id} style={[styles.memberRow, index > 0 && styles.rowDivider]}>
                <View style={styles.memberAvatar}>
                  <Text style={styles.memberInitial}>{(member.name || '?').slice(0, 1).toUpperCase()}</Text>
                </View>
                <View style={styles.memberInfo}>
                  <Text style={styles.memberName} numberOfLines={1}>{member.name}</Text>
                  <Text style={[styles.memberBalance, { color: tone }]} numberOfLines={1}>{text}</Text>
                </View>
                {!settled && (
                  <Pressable
                    onPress={() =>
                      confirm(
                        translate(language, 'split.settleUp'),
                        translate(language, 'split.settleConfirmBody'),
                        () => onSettle(group.id, member.id)
                      )
                    }
                    accessibilityRole="button"
                    accessibilityLabel={t('split.settleUp')}
                    style={({ pressed }) => [styles.settlePill, pressed && styles.settlePillPressed]}
                  >
                    <Text style={styles.settleText}>{t('split.settleUp')}</Text>
                  </Pressable>
                )}
              </View>
            );
          })}
        </View>

        <View style={styles.billsHeaderRow}>
          <Text style={styles.sectionHeaderInline}>{t('split.bills')}</Text>
          <Pressable
            onPress={() => onAddBill(group.id)}
            accessibilityRole="button"
            accessibilityLabel={t('split.addBill')}
            style={({ pressed }) => [styles.addBillPill, pressed && styles.settlePillPressed]}
          >
            <HIcon name="plus-sign" size={14} color={colors.onAccent} />
            <Text style={styles.addBillText}>{t('split.addBill')}</Text>
          </Pressable>
        </View>

        {bills.length === 0 ? (
          <Text style={styles.emptyBills}>{t('split.noBills')}</Text>
        ) : (
          <View style={styles.card}>
            {bills.map((bill, index) => (
              <Pressable
                key={bill.id}
                onLongPress={() =>
                  confirm(
                    translate(language, 'split.deleteBill'),
                    translate(language, 'split.deleteBillBody'),
                    () => onDeleteBill(bill.id)
                  )
                }
                accessibilityRole="button"
                accessibilityLabel={bill.description || t('split.bill')}
                accessibilityHint={t('split.longPressDelete')}
                style={({ pressed }) => [styles.billRow, index > 0 && styles.rowDivider, pressed && styles.rowPressed]}
              >
                <View style={styles.billInfo}>
                  <Text style={styles.billDesc} numberOfLines={1}>
                    {bill.description || t('split.bill')}
                  </Text>
                  <Text style={styles.billMeta} numberOfLines={1}>
                    {t('split.paidByName', { name: nameFor(bill.paidBy) })} · {dayLabel(bill.createdAt, language)}
                  </Text>
                </View>
                <Text style={styles.billAmount} numberOfLines={1}>
                  {formatMoney(bill.amount, bill.currency)}
                </Text>
              </Pressable>
            ))}
          </View>
        )}

        <Pressable
          onPress={() =>
            confirm(
              translate(language, 'split.deleteGroup'),
              translate(language, 'split.deleteGroupBody'),
              () => onDeleteGroup(group.id)
            )
          }
          accessibilityRole="button"
          style={({ pressed }) => [styles.deleteGroup, pressed && styles.deleteGroupPressed]}
        >
          <Text style={styles.deleteGroupText}>{t('split.deleteGroup')}</Text>
        </Pressable>
      </ScrollView>

      <CurrencyPicker
        visible={currencyOpen}
        value={group.currency}
        onSelect={(code) => {
          onUpdateGroup(group.id, { currency: code });
          setCurrencyOpen(false);
        }}
        onClose={() => setCurrencyOpen(false)}
      />
    </Sheet>
  );
}

const createStyles = (colors) =>
  StyleSheet.create({
    sheetOverride: {
      paddingHorizontal: spacing.lg,
      paddingTop: spacing.sm,
      maxHeight: '90%',
    },
    titleRow: {
      flexDirection: 'row',
      justifyContent: 'space-between',
      alignItems: 'center',
      marginBottom: spacing.sm,
    },
    titleLeft: {
      flexDirection: 'row',
      alignItems: 'center',
      flexShrink: 1,
      gap: spacing.sm,
    },
    groupIcon: {
      width: 36,
      height: 36,
      borderRadius: 18,
      backgroundColor: `${colors.accent}18`,
      alignItems: 'center',
      justifyContent: 'center',
    },
    titleText: {
      flexShrink: 1,
    },
    settingRow: {
      flexDirection: 'row',
      justifyContent: 'space-between',
      alignItems: 'center',
      paddingHorizontal: spacing.md,
      paddingVertical: spacing.sm + 2,
    },
    settingColumn: {
      paddingHorizontal: spacing.md,
      paddingVertical: spacing.sm + 2,
    },
    settingLabel: {
      color: colors.textPrimary,
      fontFamily: fonts.regular,
      fontSize: 15,
    },
    chipRow: {
      flexDirection: 'row',
      flexWrap: 'wrap',
      gap: spacing.xs + 2,
      marginTop: spacing.sm,
    },
    chip: {
      borderWidth: 1,
      borderColor: colors.border,
      borderRadius: 14,
      paddingHorizontal: spacing.sm + 2,
      paddingVertical: spacing.xs + 1,
    },
    chipSelected: {
      backgroundColor: `${colors.accent}18`,
      borderColor: colors.accent,
    },
    chipPressed: {
      opacity: 0.6,
    },
    chipLabel: {
      color: colors.textSecondary,
      fontFamily: fonts.medium,
      fontSize: 13,
    },
    chipLabelSelected: {
      color: colors.textPrimary,
    },
    title: {
      color: colors.textPrimary,
      fontFamily: fonts.bold,
      fontSize: 18,
    },
    subtitle: {
      color: colors.textMuted,
      fontFamily: fonts.regular,
      fontSize: 13,
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
    sectionHeader: {
      color: colors.textSecondary,
      fontFamily: fonts.bold,
      fontSize: 13,
      textTransform: 'uppercase',
      letterSpacing: 1.2,
      marginTop: spacing.md,
      marginBottom: spacing.sm,
    },
    card: {
      backgroundColor: colors.card,
      borderRadius: radius.md,
      overflow: 'hidden',
      ...panelShadow,
    },
    memberRow: {
      flexDirection: 'row',
      alignItems: 'center',
      paddingHorizontal: spacing.md,
      paddingVertical: spacing.sm + 2,
      gap: spacing.sm,
    },
    rowDivider: {
      borderTopWidth: StyleSheet.hairlineWidth,
      borderTopColor: colors.border,
    },
    editMemberRow: {
      flexDirection: 'row',
      alignItems: 'center',
      gap: spacing.sm,
      paddingHorizontal: spacing.md,
    },
    memberRowDup: {
      borderLeftWidth: 2,
      borderLeftColor: colors.danger,
    },
    memberInput: {
      flex: 1,
      color: colors.textPrimary,
      fontFamily: fonts.regular,
      fontSize: 15,
      paddingVertical: spacing.sm + 4,
    },
    removeDisabled: {
      opacity: 0.3,
    },
    addMemberRow: {
      flexDirection: 'row',
      alignItems: 'center',
      gap: spacing.xs,
      alignSelf: 'flex-start',
      marginTop: spacing.sm,
      paddingVertical: spacing.xs,
    },
    addMemberPressed: {
      opacity: 0.6,
    },
    addMemberText: {
      color: colors.accent,
      fontFamily: fonts.bold,
      fontSize: 14,
    },
    rowPressed: {
      backgroundColor: colors.cardPressed,
    },
    memberAvatar: {
      width: 36,
      height: 36,
      borderRadius: 18,
      backgroundColor: `${colors.accent}18`,
      alignItems: 'center',
      justifyContent: 'center',
    },
    memberInitial: {
      color: colors.accent,
      fontFamily: fonts.bold,
      fontSize: 15,
    },
    memberInfo: {
      flex: 1,
    },
    memberName: {
      color: colors.textPrimary,
      fontFamily: fonts.bold,
      fontSize: 15,
    },
    memberBalance: {
      fontFamily: fonts.numRegular,
      fontSize: 13,
      fontVariant: ['tabular-nums'],
      marginTop: 1,
    },
    settlePill: {
      backgroundColor: `${colors.accent}15`,
      borderRadius: 12,
      paddingHorizontal: spacing.sm + 2,
      paddingVertical: spacing.xs + 1,
    },
    settlePillPressed: {
      opacity: 0.6,
    },
    settleText: {
      color: colors.accent,
      fontFamily: fonts.bold,
      fontSize: 12,
    },
    billsHeaderRow: {
      flexDirection: 'row',
      justifyContent: 'space-between',
      alignItems: 'center',
      marginTop: spacing.lg,
      marginBottom: spacing.sm,
    },
    sectionHeaderInline: {
      color: colors.textSecondary,
      fontFamily: fonts.bold,
      fontSize: 13,
      textTransform: 'uppercase',
      letterSpacing: 1.2,
    },
    addBillPill: {
      flexDirection: 'row',
      alignItems: 'center',
      gap: spacing.xs,
      backgroundColor: colors.accent,
      borderRadius: 14,
      paddingHorizontal: spacing.sm + 2,
      paddingVertical: spacing.xs + 1,
    },
    addBillText: {
      color: colors.onAccent,
      fontFamily: fonts.bold,
      fontSize: 13,
    },
    emptyBills: {
      color: colors.textMuted,
      fontFamily: fonts.regular,
      fontSize: 14,
      textAlign: 'center',
      paddingVertical: spacing.lg,
    },
    billRow: {
      flexDirection: 'row',
      alignItems: 'center',
      justifyContent: 'space-between',
      paddingHorizontal: spacing.md,
      paddingVertical: spacing.sm + 2,
      gap: spacing.sm,
    },
    billInfo: {
      flex: 1,
    },
    billDesc: {
      color: colors.textPrimary,
      fontFamily: fonts.bold,
      fontSize: 15,
    },
    billMeta: {
      color: colors.textMuted,
      fontFamily: fonts.regular,
      fontSize: 13,
      marginTop: 1,
    },
    billAmount: {
      color: colors.textPrimary,
      fontFamily: fonts.numBold,
      fontSize: 15,
      fontVariant: ['tabular-nums'],
    },
    deleteGroup: {
      alignItems: 'center',
      paddingVertical: spacing.md,
      marginTop: spacing.lg,
      borderRadius: radius.md,
      borderWidth: StyleSheet.hairlineWidth,
      borderColor: colors.danger,
    },
    deleteGroupPressed: {
      backgroundColor: `${colors.danger}12`,
    },
    deleteGroupText: {
      color: colors.danger,
      fontFamily: fonts.bold,
      fontSize: 15,
    },
  });
