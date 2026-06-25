import { useEffect, useMemo, useState } from 'react';
import { Pressable, ScrollView, StyleSheet, Text, TextInput, View } from 'react-native';
import { useSafeAreaInsets } from 'react-native-safe-area-context';
import { fonts, radius, spacing, useTheme } from '../theme';
import Sheet from '../components/Sheet';
import { useT } from '../i18n';
import { getCurrency } from '../currency';
import { isValidAmountText, formatMoney } from '../format';
import { getCategoryLabel } from '../categories';
import { computeShares, customSharesValid, YOU } from '../splits';
import { HIcon } from '../icons';

// Add-bill sheet for a group: description, amount (in the group's currency), a
// category (so your share lands in the right spending bucket), who paid, who's
// included, and equal-or-custom split. On save it computes per-person shares
// and hands the bill up; your share folds into personal spending elsewhere.
export default function AddSplitScreen({ visible, group, allCategories, onAdd, onClose }) {
  const { colors } = useTheme();
  const t = useT();
  const insets = useSafeAreaInsets();
  const styles = useMemo(() => createStyles(colors), [colors]);

  const currency = group?.currency ?? 'USD';
  const cur = getCurrency(currency);
  // Participants are YOU plus the group's members.
  const people = useMemo(
    () => [{ id: YOU, name: t('split.you') }, ...(group?.members ?? [])],
    [group, t]
  );

  const [description, setDescription] = useState('');
  const [amountText, setAmountText] = useState('');
  const [category, setCategory] = useState('other');
  const [paidBy, setPaidBy] = useState(YOU);
  const [included, setIncluded] = useState({});
  const [mode, setMode] = useState('equal');
  const [custom, setCustom] = useState({});

  useEffect(() => {
    if (visible && group) {
      setDescription('');
      setAmountText('');
      setCategory('other');
      setPaidBy(YOU);
      setIncluded(Object.fromEntries(people.map((p) => [p.id, true])));
      setMode('equal');
      setCustom({});
    }
  }, [visible, group]); // eslint-disable-line react-hooks/exhaustive-deps

  const amount = parseFloat(amountText.replace(',', '.'));
  const amountValid = isValidAmountText(amountText.replace(',', '.'), cur.decimals) && amount > 0;
  const participantIds = people.filter((p) => included[p.id]).map((p) => p.id);
  const customOk =
    mode !== 'custom' || (amountValid && customSharesValid(amount, custom, participantIds, currency));
  const canAdd = amountValid && participantIds.length > 0 && customOk;

  const equalPreview =
    amountValid && participantIds.length > 0 && mode === 'equal'
      ? computeShares(amount, 'equal', participantIds, {}, currency)
      : null;

  const handleAdd = () => {
    if (!canAdd) return;
    // Persisted amount and the shares must share ONE rounded basis so the bill
    // total and the sum of shares can never disagree (computeShares reconciles
    // the last custom share to this exact rounded total).
    const roundedAmount = Number(amount.toFixed(cur.decimals));
    const shares = computeShares(roundedAmount, mode, participantIds, custom, currency);
    onAdd({
      groupId: group.id,
      description: description.trim(),
      amount: roundedAmount,
      currency,
      category,
      paidBy,
      mode,
      shares,
    });
  };

  if (!group) return <Sheet visible={false} onClose={onClose}>{null}</Sheet>;

  return (
    <Sheet visible={visible} onClose={onClose} avoidKeyboard sheetStyle={styles.sheetOverride}>
      <View style={styles.titleRow}>
        <Text style={styles.title} numberOfLines={1}>{t('split.addBill')}</Text>
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
        keyboardShouldPersistTaps="handled"
        contentContainerStyle={{ paddingBottom: spacing.xl + insets.bottom }}
        showsVerticalScrollIndicator={false}
      >
        <View style={styles.card}>
          <View style={styles.amountRow}>
            <Text style={styles.amountSymbol}>{cur.symbol}</Text>
            <TextInput
              style={styles.amountInput}
              value={amountText}
              onChangeText={setAmountText}
              placeholder="0"
              placeholderTextColor={colors.textMuted}
              keyboardType={cur.decimals === 0 ? 'number-pad' : 'decimal-pad'}
              keyboardAppearance={colors.keyboardAppearance}
              maxLength={11}
              accessibilityLabel={t('split.amount')}
            />
            <Text style={styles.amountCode}>{currency}</Text>
          </View>
          <View style={styles.descDivider} />
          <TextInput
            style={styles.descInput}
            value={description}
            onChangeText={setDescription}
            placeholder={t('split.descPlaceholder')}
            placeholderTextColor={colors.textMuted}
            keyboardAppearance={colors.keyboardAppearance}
            maxLength={60}
            accessibilityLabel={t('split.description')}
          />
        </View>

        <Text style={styles.sectionHeader}>{t('split.category')}</Text>
        <ScrollView
          horizontal
          showsHorizontalScrollIndicator={false}
          contentContainerStyle={styles.catRow}
          keyboardShouldPersistTaps="handled"
        >
          {allCategories.map((c) => {
            const selected = c.id === category;
            return (
              <Pressable
                key={c.id}
                onPress={() => setCategory(c.id)}
                accessibilityRole="radio"
                accessibilityState={{ selected }}
                style={({ pressed }) => [
                  styles.catChip,
                  selected && { backgroundColor: `${c.color}22`, borderColor: c.color },
                  pressed && styles.typePressed,
                ]}
              >
                <HIcon name={c.emoji} size={16} color={c.color} />
                <Text style={[styles.catLabel, selected && { color: colors.textPrimary }]} numberOfLines={1}>
                  {getCategoryLabel(c, t)}
                </Text>
              </Pressable>
            );
          })}
        </ScrollView>

        <Text style={styles.sectionHeader}>{t('split.paidBy')}</Text>
        <View style={styles.peopleWrap}>
          {people.map((p) => {
            const selected = p.id === paidBy;
            return (
              <Pressable
                key={p.id}
                onPress={() => setPaidBy(p.id)}
                accessibilityRole="radio"
                accessibilityState={{ selected }}
                style={({ pressed }) => [
                  styles.payerChip,
                  selected && styles.payerChipSelected,
                  pressed && styles.typePressed,
                ]}
              >
                <Text style={[styles.payerLabel, selected && styles.payerLabelSelected]} numberOfLines={1}>
                  {p.name}
                </Text>
              </Pressable>
            );
          })}
        </View>

        <View style={styles.splitHeaderRow}>
          <Text style={styles.sectionHeaderInline}>{t('split.splitBetween')}</Text>
          <View style={styles.modeToggle}>
            {['equal', 'custom'].map((m) => {
              const selected = mode === m;
              return (
                <Pressable
                  key={m}
                  onPress={() => setMode(m)}
                  accessibilityRole="button"
                  accessibilityState={{ selected }}
                  style={[styles.modeChip, selected && styles.modeChipSelected]}
                >
                  <Text style={[styles.modeText, selected && styles.modeTextSelected]}>
                    {t(m === 'equal' ? 'split.equal' : 'split.custom')}
                  </Text>
                </Pressable>
              );
            })}
          </View>
        </View>

        <View style={styles.card}>
          {people.map((p, index) => {
            const on = !!included[p.id];
            const equalShare = equalPreview?.[p.id];
            return (
              <View key={p.id} style={[styles.personRow, index > 0 && styles.rowDivider]}>
                <Pressable
                  onPress={() => setIncluded((prev) => ({ ...prev, [p.id]: !prev[p.id] }))}
                  accessibilityRole="checkbox"
                  accessibilityState={{ checked: on }}
                  accessibilityLabel={p.name}
                  style={styles.personToggle}
                >
                  <View style={[styles.checkbox, on && styles.checkboxOn]}>
                    {on && <HIcon name="tick-01" size={13} color={colors.onAccent} />}
                  </View>
                  <Text style={styles.personName} numberOfLines={1}>{p.name}</Text>
                </Pressable>
                {on && mode === 'custom' ? (
                  <View style={styles.customAmount}>
                    <Text style={styles.customSymbol}>{cur.symbol}</Text>
                    <TextInput
                      style={styles.customInput}
                      value={custom[p.id] ?? ''}
                      onChangeText={(v) => setCustom((prev) => ({ ...prev, [p.id]: v }))}
                      placeholder="0"
                      placeholderTextColor={colors.textMuted}
                      keyboardType={cur.decimals === 0 ? 'number-pad' : 'decimal-pad'}
                      keyboardAppearance={colors.keyboardAppearance}
                      maxLength={11}
                      accessibilityLabel={`${p.name} ${t('split.amount')}`}
                    />
                  </View>
                ) : on && equalShare != null ? (
                  <Text style={styles.equalShare}>{formatMoney(equalShare, currency)}</Text>
                ) : null}
              </View>
            );
          })}
        </View>
        {mode === 'custom' && amountValid && !customOk && (
          <Text style={styles.warning}>{t('split.customMismatch')}</Text>
        )}

        <Pressable
          onPress={handleAdd}
          disabled={!canAdd}
          accessibilityRole="button"
          style={({ pressed }) => [
            styles.addButton,
            !canAdd && styles.addButtonDisabled,
            pressed && canAdd && styles.addButtonPressed,
          ]}
        >
          <Text style={styles.addButtonText}>{t('split.addBill')}</Text>
        </Pressable>
      </ScrollView>
    </Sheet>
  );
}

const createStyles = (colors) =>
  StyleSheet.create({
    sheetOverride: {
      paddingHorizontal: spacing.lg,
      paddingTop: spacing.md,
      maxHeight: '90%',
    },
    titleRow: {
      flexDirection: 'row',
      justifyContent: 'space-between',
      alignItems: 'center',
      marginBottom: spacing.sm,
    },
    title: {
      color: colors.textPrimary,
      fontFamily: fonts.bold,
      fontSize: 18,
      flexShrink: 1,
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
    card: {
      backgroundColor: colors.card,
      borderRadius: radius.md,
      overflow: 'hidden',
      marginTop: spacing.sm,
      shadowColor: '#000',
      shadowOffset: { width: 0, height: 2 },
      shadowOpacity: 0.3,
      shadowRadius: 8,
      elevation: 3,
    },
    amountRow: {
      flexDirection: 'row',
      alignItems: 'center',
      paddingHorizontal: spacing.md,
    },
    amountSymbol: {
      color: colors.textSecondary,
      fontFamily: fonts.numBold,
      fontSize: 22,
      marginRight: spacing.sm,
    },
    amountInput: {
      flex: 1,
      color: colors.textPrimary,
      fontFamily: fonts.numBold,
      fontSize: 28,
      paddingVertical: spacing.md,
      fontVariant: ['tabular-nums'],
    },
    amountCode: {
      color: colors.textMuted,
      fontFamily: fonts.bold,
      fontSize: 13,
      marginLeft: spacing.sm,
    },
    descDivider: {
      height: StyleSheet.hairlineWidth,
      backgroundColor: colors.border,
      marginHorizontal: spacing.md,
    },
    descInput: {
      color: colors.textPrimary,
      fontFamily: fonts.regular,
      fontSize: 15,
      paddingHorizontal: spacing.md,
      paddingVertical: spacing.sm + 4,
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
    catRow: {
      gap: spacing.sm,
      paddingVertical: 2,
    },
    catChip: {
      flexDirection: 'row',
      alignItems: 'center',
      gap: spacing.xs,
      borderWidth: 1,
      borderColor: colors.border,
      borderRadius: radius.md,
      paddingHorizontal: spacing.sm + 2,
      paddingVertical: spacing.sm,
    },
    typePressed: {
      opacity: 0.6,
    },
    catLabel: {
      color: colors.textSecondary,
      fontFamily: fonts.medium,
      fontSize: 13,
      maxWidth: 90,
    },
    peopleWrap: {
      flexDirection: 'row',
      flexWrap: 'wrap',
      gap: spacing.sm,
    },
    payerChip: {
      borderWidth: 1,
      borderColor: colors.border,
      borderRadius: radius.md,
      paddingHorizontal: spacing.md,
      paddingVertical: spacing.sm,
    },
    payerChipSelected: {
      backgroundColor: `${colors.accent}18`,
      borderColor: colors.accent,
    },
    payerLabel: {
      color: colors.textSecondary,
      fontFamily: fonts.medium,
      fontSize: 14,
      maxWidth: 120,
    },
    payerLabelSelected: {
      color: colors.textPrimary,
    },
    splitHeaderRow: {
      flexDirection: 'row',
      justifyContent: 'space-between',
      alignItems: 'center',
      marginTop: spacing.md,
      marginBottom: spacing.sm,
    },
    sectionHeaderInline: {
      color: colors.textSecondary,
      fontFamily: fonts.bold,
      fontSize: 13,
      textTransform: 'uppercase',
      letterSpacing: 1.2,
    },
    modeToggle: {
      flexDirection: 'row',
      backgroundColor: colors.cardPressed,
      borderRadius: 12,
      padding: 2,
    },
    modeChip: {
      paddingHorizontal: spacing.md,
      paddingVertical: spacing.xs + 1,
      borderRadius: 10,
    },
    modeChipSelected: {
      backgroundColor: colors.card,
    },
    modeText: {
      color: colors.textMuted,
      fontFamily: fonts.bold,
      fontSize: 13,
    },
    modeTextSelected: {
      color: colors.accent,
    },
    personRow: {
      flexDirection: 'row',
      alignItems: 'center',
      justifyContent: 'space-between',
      paddingHorizontal: spacing.md,
      minHeight: 50,
    },
    rowDivider: {
      borderTopWidth: StyleSheet.hairlineWidth,
      borderTopColor: colors.border,
    },
    personToggle: {
      flexDirection: 'row',
      alignItems: 'center',
      gap: spacing.sm,
      flex: 1,
      paddingVertical: spacing.sm,
    },
    checkbox: {
      width: 22,
      height: 22,
      borderRadius: 6,
      borderWidth: 1.5,
      borderColor: colors.border,
      alignItems: 'center',
      justifyContent: 'center',
    },
    checkboxOn: {
      backgroundColor: colors.accent,
      borderColor: colors.accent,
    },
    personName: {
      color: colors.textPrimary,
      fontFamily: fonts.regular,
      fontSize: 15,
      flexShrink: 1,
    },
    equalShare: {
      color: colors.textSecondary,
      fontFamily: fonts.numBold,
      fontSize: 15,
      fontVariant: ['tabular-nums'],
    },
    customAmount: {
      flexDirection: 'row',
      alignItems: 'center',
      gap: spacing.xs,
    },
    customSymbol: {
      color: colors.textMuted,
      fontFamily: fonts.numRegular,
      fontSize: 14,
    },
    customInput: {
      width: 84,
      color: colors.textPrimary,
      fontFamily: fonts.numBold,
      fontSize: 15,
      textAlign: 'right',
      paddingVertical: spacing.sm,
      fontVariant: ['tabular-nums'],
    },
    warning: {
      color: colors.danger,
      fontFamily: fonts.regular,
      fontSize: 13,
      marginTop: spacing.sm,
    },
    addButton: {
      backgroundColor: colors.accent,
      borderRadius: radius.md,
      paddingVertical: spacing.md,
      alignItems: 'center',
      marginTop: spacing.lg,
    },
    addButtonDisabled: {
      opacity: 0.4,
    },
    addButtonPressed: {
      backgroundColor: colors.accentDark,
    },
    addButtonText: {
      color: colors.onAccent,
      fontFamily: fonts.bold,
      fontSize: 16,
    },
  });
