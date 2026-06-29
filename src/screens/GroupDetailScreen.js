import { useEffect, useMemo, useRef, useState } from 'react';
import { Animated, Pressable, ScrollView, StyleSheet, Text, TextInput, View } from 'react-native';
import { useSafeAreaInsets } from 'react-native-safe-area-context';
import { fonts, radius, spacing, useTheme, panelShadow } from '../theme';
import Sheet from '../components/Sheet';
import CurrencyPill from '../components/CurrencyPill';
import CurrencyPicker from '../components/CurrencyPicker';
import IconPickerSheet from '../components/IconPickerSheet';
import PaymentMethodModal from '../components/PaymentMethodModal';
import { useT, useLanguage, translate } from '../i18n';
import { confirmDestructive } from '../confirm';
import { getCurrency } from '../currency';
import { formatMoney, dayLabel } from '../format';
import {
  groupBalances,
  billsForGroup,
  getAllPaymentMethods,
  getPaymentMethodLabel,
  getPaymentMethodColor,
  PAYMENT_METHODS,
  DEFAULT_METHOD_COLOR,
  DEFAULT_METHOD_ICON,
  getGroupIcon,
  YOU,
} from '../splits';
import { HIcon } from '../icons';

const TINT_MS = 350;

// Group-detail sheet: a payment-method-themed settings card (the group's surface
// tints to its selected payment method's color), combined per-member balances +
// editing, the bill list (tap to edit, long-press to delete), and the group's
// avatar (a dedicated icon-picker page). A null group renders a closed sheet so
// the parent can keep it mounted without guarding every prop.
export default function GroupDetailScreen({
  visible,
  group,
  splitExpenses,
  customPaymentMethods,
  onAddPaymentMethod,
  onRemovePaymentMethod,
  onAddBill,
  onEditBill,
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
  const [iconPickerOpen, setIconPickerOpen] = useState(false);
  const [paymentModalOpen, setPaymentModalOpen] = useState(false);
  // Local draft of member names so renames don't enqueue a sync op per keystroke;
  // edits commit on blur. Add/remove commit immediately.
  const [memberDraft, setMemberDraft] = useState([]);

  // Animated tint of the settings card to the group's payment-method color,
  // mirroring the add-expense category tint. The endpoints live in STATE (not
  // refs): the interpolation snapshots them at render, so changing them must
  // trigger a re-render to re-commit the interpolation — a ref mutation in an
  // effect would not, leaving the tint a selection behind.
  const methodColor = group ? getPaymentMethodColor(group.paymentMethod, customPaymentMethods) : DEFAULT_METHOD_COLOR;
  const colorAnim = useRef(new Animated.Value(1)).current;
  const lastGroupId = useRef(group?.id ?? null);
  const [tint, setTint] = useState({ from: methodColor, to: methodColor });

  useEffect(() => {
    if (!group) return;
    const next = getPaymentMethodColor(group.paymentMethod, customPaymentMethods);
    if (group.id !== lastGroupId.current) {
      // Opening a different group: snap to its color, no crossfade.
      lastGroupId.current = group.id;
      colorAnim.setValue(1);
      setTint({ from: next, to: next });
    } else if (next !== tint.to) {
      // Same group, method changed: crossfade old → new. setState re-commits the
      // interpolation as [old, new] with the driver at 0, then we animate to 1.
      colorAnim.setValue(0);
      setTint({ from: tint.to, to: next });
      Animated.timing(colorAnim, { toValue: 1, duration: TINT_MS, useNativeDriver: false }).start();
    }
  }, [group?.id, group?.paymentMethod, customPaymentMethods, colorAnim, tint.to]);

  const balances = useMemo(
    () => (group ? groupBalances(group, splitExpenses) : {}),
    [group, splitExpenses]
  );
  const bills = useMemo(
    () => (group ? billsForGroup(group.id, splitExpenses).filter((b) => !b.settlement).sort((a, b) => b.createdAt - a.createdAt) : []),
    [group, splitExpenses]
  );

  // Member ids referenced by ANY bill/settlement — removing one would silently
  // drop a balance, so removal is blocked for them.
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

  const memberSig = group ? group.members.map((m) => `${m.id}:${m.name}`).join('|') : '';
  useEffect(() => {
    setMemberDraft(group ? group.members.map((m) => ({ id: m.id, name: m.name })) : []);
  }, [memberSig]);

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

  const allMethods = getAllPaymentMethods(customPaymentMethods);
  const groupIcon = getGroupIcon(group.icon);

  // Animated border (full color) + background wash (12% alpha) for the card.
  const tintBorder = colorAnim.interpolate({
    inputRange: [0, 1],
    outputRange: [tint.from, tint.to],
  });
  const tintWash = colorAnim.interpolate({
    inputRange: [0, 1],
    outputRange: [`${tint.from}1F`, `${tint.to}1F`],
  });
  const tintAvatar = colorAnim.interpolate({
    inputRange: [0, 1],
    outputRange: [`${tint.from}26`, `${tint.to}26`],
  });

  const newMemberId = () =>
    globalThis.crypto?.randomUUID?.() ??
    `m_${Date.now().toString(36)}_${Math.random().toString(36).slice(2, 10)}`;

  const commitMembers = (draft) => {
    const cleaned = draft.map((m) => ({ id: m.id, name: m.name.trim() })).filter((m) => m.name);
    const lower = cleaned.map((m) => m.name.toLowerCase());
    if (new Set(lower).size !== lower.length) return;
    onUpdateGroup(group.id, { members: cleaned });
  };

  const setDraftNameAt = (id, value) =>
    setMemberDraft((prev) => prev.map((m) => (m.id === id ? { ...m, name: value } : m)));

  const commitDraft = () => commitMembers(memberDraft);

  const addMember = () => setMemberDraft((prev) => [...prev, { id: newMemberId(), name: '' }]);

  const removeMember = (id) => {
    if (usedMemberIds.has(id)) return;
    const next = memberDraft.filter((m) => m.id !== id);
    setMemberDraft(next);
    commitMembers(next);
  };

  const cur = getCurrency(group.currency);
  const minUnit = 1 / 10 ** cur.decimals;

  const confirm = async (title, body, onYes) => {
    const ok = await confirmDestructive({
      title,
      body,
      confirmLabel: translate(language, 'common.delete'),
      cancelLabel: translate(language, 'common.cancel'),
    });
    if (ok) onYes();
  };

  const removePaymentMethod = (id) =>
    confirm(translate(language, 'pay.deleteTitle'), translate(language, 'pay.deleteBody'), () => onRemovePaymentMethod(id));

  return (
    <Sheet visible={visible} onClose={onClose} showHandle sheetStyle={styles.sheetOverride}>
      <View style={styles.titleRow}>
        <View style={styles.titleLeft}>
          <Pressable
            onPress={() => setIconPickerOpen(true)}
            accessibilityRole="button"
            accessibilityLabel={t('split.changeIcon')}
            style={({ pressed }) => [pressed && styles.pressedFade]}
          >
            <Animated.View style={[styles.groupIcon, { backgroundColor: tintAvatar }]}>
              <HIcon name={groupIcon} size={22} color={methodColor} />
            </Animated.View>
          </Pressable>
          <View style={styles.titleText}>
            <Text style={styles.title} numberOfLines={1}>{group.name}</Text>
            <Text style={styles.subtitle} numberOfLines={1}>
              {t('split.memberCount', { count: group.members.length })}
            </Text>
          </View>
          <CurrencyPill
            value={group.currency}
            onPress={() => setCurrencyOpen(true)}
            accessibilityLabel={t('currency.choose')}
            style={styles.headerPill}
            textStyle={styles.headerPillText}
          />
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
        contentContainerStyle={{ paddingBottom: spacing.xl + insets.bottom, paddingHorizontal: 2 }}
        showsVerticalScrollIndicator={false}
        keyboardShouldPersistTaps="handled"
      >
        <Text style={styles.sectionHeader}>{t('split.groupSettings')}</Text>
        {/* Shadow lives on the wrapper; the inner card carries overflow:'hidden'
            (to clip the tint wash + chips to the rounded corners) which on iOS
            would otherwise suppress the drop shadow. */}
        <View style={styles.cardShadowWrap}>
          <Animated.View style={[styles.settingsCard, { borderColor: tintBorder }]}>
            <Animated.View pointerEvents="none" style={[StyleSheet.absoluteFill, { backgroundColor: tintWash }]} />
            <View style={styles.payHeaderRow}>
              <Text style={styles.settingLabel}>{t('split.paymentMethod')}</Text>
            </View>
            <View style={styles.chipRow}>
              {allMethods.map((pm) => {
                const selected = pm.id === (group.paymentMethod || 'cash');
                const pColor = pm.color || DEFAULT_METHOD_COLOR;
                const pIcon = pm.icon || DEFAULT_METHOD_ICON;
                const isCustom = !PAYMENT_METHODS.some((b) => b.id === pm.id);
                return (
                  <Pressable
                    key={pm.id}
                    onPress={() => onUpdateGroup(group.id, { paymentMethod: pm.id })}
                    onLongPress={isCustom ? () => removePaymentMethod(pm.id) : undefined}
                    accessibilityRole="radio"
                    accessibilityState={{ selected }}
                    accessibilityHint={isCustom ? t('split.longPressDelete') : undefined}
                    style={({ pressed }) => [
                      styles.chip,
                      selected && { backgroundColor: `${pColor}1F`, borderColor: pColor },
                      pressed && styles.pressedFade,
                    ]}
                  >
                    <HIcon name={pIcon} size={15} color={pColor} />
                    <Text style={[styles.chipLabel, selected && styles.chipLabelSelected]} numberOfLines={1}>
                      {getPaymentMethodLabel(pm.id, t, customPaymentMethods)}
                    </Text>
                  </Pressable>
                );
              })}
              <Pressable
                onPress={() => setPaymentModalOpen(true)}
                accessibilityRole="button"
                accessibilityLabel={t('split.addPaymentMethod')}
                style={({ pressed }) => [styles.chip, styles.chipAdd, pressed && styles.pressedFade]}
              >
                <HIcon name="plus-sign" size={12} color={colors.accent} />
                <Text style={[styles.chipLabel, { color: colors.accent }]}>{t('split.addPaymentMethod')}</Text>
              </Pressable>
            </View>
          </Animated.View>
        </View>

        <Text style={styles.sectionHeader}>{t('split.members')}</Text>
        <View style={styles.cardShadowWrap}>
          <View style={styles.card}>
            {memberDraft.map((member, index) => {
              const bal = balances[member.id] ?? 0;
              const settled = Math.abs(bal) < minUnit;
              const tone = settled ? colors.textMuted : bal > 0 ? colors.success : colors.danger;
              const balText = settled
                ? t('split.settled')
                : bal > 0
                ? t('split.owesYou', { amount: formatMoney(bal, group.currency) })
                : t('split.youOweMember', { amount: formatMoney(-bal, group.currency) });
              const inUse = usedMemberIds.has(member.id);
              return (
                <View
                  key={member.id}
                  style={[
                    styles.memberRow,
                    index > 0 && styles.rowDivider,
                    duplicateIds.has(member.id) && styles.memberRowDup,
                  ]}
                >
                  <View style={styles.memberAvatar}>
                    <Text style={styles.memberInitial}>{(member.name || '?').slice(0, 1).toUpperCase()}</Text>
                  </View>
                  <View style={styles.memberInfo}>
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
                    <Text style={[styles.memberBalance, { color: tone }]} numberOfLines={1}>{balText}</Text>
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
                  {memberDraft.length > 1 && (
                    <Pressable
                      onPress={() => removeMember(member.id)}
                      disabled={inUse}
                      hitSlop={10}
                      accessibilityRole="button"
                      accessibilityLabel={t('common.delete')}
                      accessibilityState={{ disabled: inUse }}
                      style={({ pressed }) => [inUse && styles.removeDisabled, pressed && !inUse && styles.rowPressed]}
                    >
                      <HIcon name="cancel-01" size={16} color={colors.textMuted} />
                    </Pressable>
                  )}
                </View>
              );
            })}
          </View>
        </View>
        <Pressable
          onPress={addMember}
          accessibilityRole="button"
          style={({ pressed }) => [styles.addMemberRow, pressed && styles.addMemberPressed]}
        >
          <HIcon name="plus-sign" size={14} color={colors.accent} />
          <Text style={styles.addMemberText}>{t('split.addMember')}</Text>
        </Pressable>

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
          <View style={styles.cardShadowWrap}>
            <View style={styles.card}>
              {bills.map((bill, index) => (
                <Pressable
                  key={bill.id}
                  onPress={() => onEditBill(bill)}
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
                      {t('split.paidByName', { name: nameFor(bill.paidBy, group, t) })} · {dayLabel(bill.createdAt, language)}
                    </Text>
                  </View>
                  <Text style={styles.billAmount} numberOfLines={1}>
                    {formatMoney(bill.amount, bill.currency)}
                  </Text>
                </Pressable>
              ))}
            </View>
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
      <IconPickerSheet
        visible={iconPickerOpen}
        value={groupIcon}
        onSelect={(name) => onUpdateGroup(group.id, { icon: name })}
        onClose={() => setIconPickerOpen(false)}
      />
      <PaymentMethodModal
        visible={paymentModalOpen}
        onSave={(method) => {
          onAddPaymentMethod(method);
          setPaymentModalOpen(false);
        }}
        onClose={() => setPaymentModalOpen(false)}
      />
    </Sheet>
  );
}

function nameFor(id, group, t) {
  if (id === YOU) return t('split.you');
  return group.members.find((m) => m.id === id)?.name ?? t('split.someone');
}

const createStyles = (colors) =>
  StyleSheet.create({
    sheetOverride: {
      paddingHorizontal: spacing.lg,
      paddingTop: spacing.sm,
      maxHeight: '90%',
    },
    pressedFade: { opacity: 0.6 },
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
      width: 40,
      height: 40,
      borderRadius: 20,
      alignItems: 'center',
      justifyContent: 'center',
    },
    titleText: {
      flexShrink: 1,
    },
    // Currency pill beside the group title — a touch larger than the default pill
    // and centered against the two-line title/subtitle block.
    headerPill: {
      alignSelf: 'center',
      borderRadius: 13,
      paddingHorizontal: spacing.sm + 6,
      paddingVertical: spacing.xs + 2,
    },
    headerPillText: {
      fontSize: 13,
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
    // Shadow wrapper (no overflow) — see comment at the card usage.
    cardShadowWrap: {
      borderRadius: radius.md,
      ...panelShadow,
    },
    card: {
      backgroundColor: colors.card,
      borderRadius: radius.md,
      overflow: 'hidden',
    },
    // The payment-method-themed settings card: tinted border + background wash.
    settingsCard: {
      backgroundColor: colors.card,
      borderRadius: radius.md,
      borderWidth: 1.5,
      overflow: 'hidden',
      paddingHorizontal: spacing.md,
      paddingVertical: spacing.sm + 2,
    },
    payHeaderRow: {
      flexDirection: 'row',
      justifyContent: 'space-between',
      alignItems: 'center',
      marginBottom: spacing.sm,
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
    },
    chip: {
      flexDirection: 'row',
      alignItems: 'center',
      gap: spacing.xs,
      borderWidth: 1,
      borderColor: colors.border,
      borderRadius: 14,
      paddingHorizontal: spacing.sm + 2,
      paddingVertical: spacing.xs + 1,
      backgroundColor: colors.card,
    },
    chipLabel: {
      color: colors.textSecondary,
      fontFamily: fonts.medium,
      fontSize: 13,
    },
    chipLabelSelected: {
      color: colors.textPrimary,
    },
    chipAdd: {
      borderStyle: 'dashed',
    },
    memberRow: {
      flexDirection: 'row',
      alignItems: 'center',
      paddingHorizontal: spacing.md,
      paddingVertical: spacing.sm + 2,
      gap: spacing.sm,
    },
    memberRowDup: {
      borderLeftWidth: 2,
      borderLeftColor: colors.danger,
    },
    rowDivider: {
      borderTopWidth: StyleSheet.hairlineWidth,
      borderTopColor: colors.border,
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
    memberInput: {
      color: colors.textPrimary,
      fontFamily: fonts.bold,
      fontSize: 15,
      paddingVertical: 0,
    },
    memberBalance: {
      fontFamily: fonts.numRegular,
      fontSize: 13,
      fontVariant: ['tabular-nums'],
      marginTop: 1,
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
