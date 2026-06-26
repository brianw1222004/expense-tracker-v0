import { useMemo, useState } from 'react';
import {
  Keyboard,
  Pressable,
  ScrollView,
  StyleSheet,
  Text,
  TextInput,
  View,
} from 'react-native';
import { fonts, radius, spacing, useTheme } from '../theme';
import { useT } from '../i18n';
import { getCurrency } from '../currency';
import { getCategoryLabel } from '../categories';
import { isValidAmountText, formatMoney, cleanAmountInput } from '../format';
import { HIcon } from '../icons';
import EntryModeToggle from '../components/EntryModeToggle';
import CalendarField, { dateForOffset } from '../components/CalendarField';
import CurrencyChipRow from '../components/CurrencyChipRow';
import { popupChromeStyles } from '../components/popupFormChrome';
import {
  YOU,
  computeShares,
  customSharesValid,
  percentageSharesValid,
  computeTaxShares,
  taxInputValid,
} from '../splits';

const NOTE_MAX_LENGTH = 60;
const AMOUNT_MAX_LENGTH = 11;

const MODES = [
  { id: 'equal', labelKey: 'split.equal' },
  { id: 'custom', labelKey: 'split.custom' },
  { id: 'percentage', labelKey: 'split.percent' },
  { id: 'tax', labelKey: 'split.tax' },
];

// Participants of a group: YOU (the implicit owner) plus the group's members.
function peopleFor(group) {
  return group ? [{ id: YOU }, ...group.members] : [];
}

// Comma-normalize a { id: value } map over the given ids so Number() in the
// domain helpers parses locale decimals.
function normMap(m, ids) {
  return Object.fromEntries(ids.map((id) => [id, String(m[id] ?? '').replace(',', '.')]));
}

// The Shared side of the add popup: create a split bill. Reuses the popup card
// chrome (matching AddEntryScreen) so the Personal/Shared toggle swaps between
// two forms in one widget. Lets you pick the group, who's in, the date, the
// currency, a category, who paid, and one of four split methods (equal, custom
// amounts, percentages, or an itemized tax split). On save it computes per-person
// shares and hands the bill up via onAdd; your share folds into personal spending
// elsewhere (yourShareAsExpenses).
//
// Launched two ways:
//   • from the + popup  → showToggle + group picker shown, group defaults to the first
//   • from a group sheet → lockedGroupId set: toggle + picker hidden, focused "Add a bill"
export default function SharedSplitForm({
  entryMode,
  onChangeEntryMode,
  lockedGroupId = null,
  groups,
  allCategories,
  displayCurrency,
  onAdd,
  onCreateGroup,
  onClose,
}) {
  const { colors } = useTheme();
  const t = useT();
  const styles = useMemo(() => createStyles(colors), [colors]);

  const showToggle = !lockedGroupId;
  const showGroupPicker = !lockedGroupId;

  const initialGroup = lockedGroupId
    ? groups.find((g) => g.id === lockedGroupId)
    : groups[0];

  const [selectedGroupId, setSelectedGroupId] = useState(initialGroup?.id ?? null);
  const [included, setIncluded] = useState(() =>
    Object.fromEntries(peopleFor(initialGroup).map((p) => [p.id, true]))
  );
  const [paidBy, setPaidBy] = useState(YOU);
  const [manualCurrency, setManualCurrency] = useState(null);
  const [mode, setMode] = useState('equal');
  const [amountText, setAmountText] = useState('');
  const [description, setDescription] = useState('');
  const [category, setCategory] = useState('other');
  const [custom, setCustom] = useState({});
  const [percent, setPercent] = useState({});
  const [subtotals, setSubtotals] = useState({});
  const [taxPct, setTaxPct] = useState('');
  const [tipPct, setTipPct] = useState('');
  const [dayOffset, setDayOffset] = useState(0);

  const selectedGroup = groups.find((g) => g.id === selectedGroupId) ?? null;
  const currencyCode = manualCurrency ?? selectedGroup?.currency ?? displayCurrency;
  const cur = getCurrency(currencyCode);

  const people = useMemo(
    () => (selectedGroup ? [{ id: YOU, name: t('split.you') }, ...selectedGroup.members] : []),
    [selectedGroup, t]
  );

  // Switching groups resets the people-dependent fields (who's in, who paid,
  // per-person inputs) and lets the currency follow the new group again.
  const selectGroup = (id) => {
    if (id === selectedGroupId) return;
    const g = groups.find((x) => x.id === id);
    setSelectedGroupId(id);
    setIncluded(Object.fromEntries(peopleFor(g).map((p) => [p.id, true])));
    setCustom({});
    setPercent({});
    setSubtotals({});
    setPaidBy(YOU);
    setManualCurrency(null);
  };

  const amount = parseFloat(amountText.replace(',', '.'));
  const amountValid = isValidAmountText(amountText.replace(',', '.'), cur.decimals) && amount > 0;
  const participantIds = useMemo(
    () => people.filter((p) => included[p.id]).map((p) => p.id),
    [people, included]
  );

  // Comma-normalized { id: value } maps (over the included ids) for the domain
  // helpers, which parse with Number(). Memoized so typing in one field doesn't
  // rebuild all three every keystroke.
  const customNum = useMemo(() => normMap(custom, participantIds), [custom, participantIds]);
  const percentNum = useMemo(() => normMap(percent, participantIds), [percent, participantIds]);
  const subtotalNum = useMemo(() => normMap(subtotals, participantIds), [subtotals, participantIds]);
  const taxRate = taxPct.replace(',', '.');
  const tipRate = tipPct.replace(',', '.');

  const equalPreview = useMemo(
    () =>
      mode === 'equal' && amountValid && participantIds.length > 0
        ? computeShares(amount, 'equal', participantIds, {}, currencyCode)
        : null,
    [mode, amountValid, amount, participantIds, currencyCode]
  );
  const taxResult = useMemo(
    () =>
      mode === 'tax' && participantIds.length > 0
        ? computeTaxShares(subtotalNum, participantIds, taxRate, tipRate, currencyCode)
        : { total: 0, shares: {} },
    [mode, participantIds, subtotalNum, taxRate, tipRate, currencyCode]
  );
  // Preview the SAME shares that will be persisted (floored + reconciled), not a
  // raw amount*pct/100, so the rows can't disagree with the saved bill.
  const percentPreview = useMemo(
    () =>
      mode === 'percentage' && amountValid && participantIds.length > 0
        ? computeShares(Number(amount.toFixed(cur.decimals)), 'percentage', participantIds, percentNum, currencyCode)
        : null,
    [mode, amountValid, amount, participantIds, percentNum, currencyCode, cur.decimals]
  );

  const amountNeeded = mode !== 'tax';
  const customOk = mode !== 'custom' || (amountValid && customSharesValid(amount, customNum, participantIds, currencyCode));
  const percentOk = mode !== 'percentage' || percentageSharesValid(percentNum, participantIds);
  const taxOk = mode !== 'tax' || taxInputValid(subtotalNum, participantIds);
  const canAdd =
    !!selectedGroup &&
    participantIds.length > 0 &&
    (amountNeeded ? amountValid : true) &&
    customOk &&
    percentOk &&
    taxOk;

  const handleAdd = () => {
    if (!canAdd) return;
    let amountToSave;
    let shares;
    if (mode === 'tax') {
      const r = computeTaxShares(subtotalNum, participantIds, taxRate, tipRate, currencyCode);
      amountToSave = r.total;
      shares = r.shares;
    } else {
      // Persist amount and shares on ONE rounded basis so the bill total and the
      // sum of shares can never disagree (computeShares reconciles to it).
      amountToSave = Number(amount.toFixed(cur.decimals));
      const map = mode === 'custom' ? customNum : mode === 'percentage' ? percentNum : {};
      shares = computeShares(amountToSave, mode, participantIds, map, currencyCode);
    }
    const createdAt = dayOffset === 0 ? Date.now() : dateForOffset(dayOffset).getTime();
    onAdd({
      groupId: selectedGroup.id,
      description: description.trim(),
      amount: amountToSave,
      currency: currencyCode,
      category,
      paidBy,
      mode,
      shares,
      createdAt,
    });
    Keyboard.dismiss();
  };

  return (
    <View style={styles.card}>
      <ScrollView
        style={styles.scroll}
        contentContainerStyle={styles.scrollContent}
        keyboardShouldPersistTaps="handled"
        showsVerticalScrollIndicator={false}
      >
        <View style={styles.header}>
          <View style={styles.headerSide} />
          <View style={styles.headerCenter}>
            {showToggle ? (
              <EntryModeToggle value={entryMode} onChange={onChangeEntryMode} />
            ) : (
              <Text style={styles.title}>{t('split.addBill')}</Text>
            )}
          </View>
          <Pressable
            onPress={onClose}
            hitSlop={8}
            accessibilityRole="button"
            accessibilityLabel={t('common.close')}
            style={({ pressed }) => [styles.closeButton, pressed && styles.pressedBg]}
          >
            <HIcon name="cancel-01" size={20} color={colors.icon} />
          </Pressable>
        </View>

        {!selectedGroup ? (
          <View style={styles.noGroup}>
            <HIcon name="user-group" size={36} color={colors.icon} />
            <Text style={styles.noGroupTitle}>{t('split.emptyTitle')}</Text>
            <Text style={styles.noGroupHint}>{t('split.emptyHint')}</Text>
            <Pressable
              onPress={onCreateGroup}
              accessibilityRole="button"
              style={({ pressed }) => [styles.createGroupBtn, pressed && styles.createGroupBtnPressed]}
            >
              <HIcon name="plus-sign" size={14} color={colors.onAccent} />
              <Text style={styles.createGroupText}>{t('split.createFirst')}</Text>
            </Pressable>
          </View>
        ) : (
          <>
            {showGroupPicker && (
              <>
                <Text style={styles.sectionHeader}>{t('split.group')}</Text>
                <ScrollView
                  horizontal
                  showsHorizontalScrollIndicator={false}
                  contentContainerStyle={styles.chipScroll}
                  keyboardShouldPersistTaps="handled"
                >
                  {groups.map((g) => {
                    const selected = g.id === selectedGroupId;
                    return (
                      <Pressable
                        key={g.id}
                        onPress={() => selectGroup(g.id)}
                        accessibilityRole="radio"
                        accessibilityState={{ selected }}
                        style={({ pressed }) => [
                          styles.groupChip,
                          selected && styles.groupChipSelected,
                          pressed && !selected && styles.pressedFade,
                        ]}
                      >
                        <HIcon name="user-group" size={15} color={selected ? colors.accent : colors.icon} />
                        <Text style={[styles.groupChipText, selected && styles.groupChipTextSelected]} numberOfLines={1}>
                          {g.name}
                        </Text>
                      </Pressable>
                    );
                  })}
                </ScrollView>
              </>
            )}

            <View style={styles.dateWrap}>
              <CalendarField dayOffset={dayOffset} onChange={setDayOffset} />
            </View>

            {mode === 'tax' ? (
              <View style={styles.totalRow}>
                <Text style={styles.totalLabel}>{t('split.total')}</Text>
                <Text style={styles.totalValue} numberOfLines={1}>
                  {formatMoney(taxResult.total, currencyCode)}
                </Text>
              </View>
            ) : (
              <View style={styles.amountRow}>
                <Text style={styles.currencySymbol} numberOfLines={1}>{cur.symbol}</Text>
                <TextInput
                  style={styles.amountInput}
                  value={amountText}
                  onChangeText={(text) => setAmountText(cleanAmountInput(text))}
                  placeholder={cur.decimals === 0 ? '0' : '0.00'}
                  placeholderTextColor={colors.textMuted}
                  keyboardType={cur.decimals === 0 ? 'number-pad' : 'decimal-pad'}
                  keyboardAppearance={colors.keyboardAppearance}
                  maxLength={AMOUNT_MAX_LENGTH}
                  accessibilityLabel={t('split.amount')}
                />
                <Text style={styles.amountCode}>{currencyCode}</Text>
              </View>
            )}

            <CurrencyChipRow value={currencyCode} onSelect={setManualCurrency} />

            <View style={styles.noteRow}>
              <TextInput
                style={styles.noteInput}
                value={description}
                onChangeText={setDescription}
                placeholder={t('split.descPlaceholder')}
                placeholderTextColor={colors.textMuted}
                maxLength={NOTE_MAX_LENGTH}
                keyboardAppearance={colors.keyboardAppearance}
                accessibilityLabel={t('split.description')}
              />
            </View>

            <Text style={styles.sectionHeader}>{t('split.category')}</Text>
            <ScrollView
              horizontal
              showsHorizontalScrollIndicator={false}
              contentContainerStyle={styles.chipScroll}
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
                      pressed && styles.pressedFade,
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
                      pressed && styles.pressedFade,
                    ]}
                  >
                    <Text style={[styles.payerLabel, selected && styles.payerLabelSelected]} numberOfLines={1}>
                      {p.name}
                    </Text>
                  </Pressable>
                );
              })}
            </View>

            <Text style={styles.sectionHeader}>{t('split.splitMethod')}</Text>
            <View style={styles.methodToggle}>
              {MODES.map((m) => {
                const selected = mode === m.id;
                return (
                  <Pressable
                    key={m.id}
                    onPress={() => setMode(m.id)}
                    accessibilityRole="button"
                    accessibilityState={{ selected }}
                    style={[styles.methodChip, selected && styles.methodChipSelected]}
                  >
                    <Text style={[styles.methodText, selected && styles.methodTextSelected]} numberOfLines={1}>
                      {t(m.labelKey)}
                    </Text>
                  </Pressable>
                );
              })}
            </View>

            {mode === 'tax' && (
              <>
                <View style={styles.taxRow}>
                  <View style={styles.taxField}>
                    <Text style={styles.taxFieldLabel}>{t('split.taxRate')}</Text>
                    <View style={styles.taxInputWrap}>
                      <TextInput
                        style={styles.taxInput}
                        value={taxPct}
                        onChangeText={(text) => setTaxPct(cleanAmountInput(text))}
                        placeholder="0"
                        placeholderTextColor={colors.textMuted}
                        keyboardType="decimal-pad"
                        keyboardAppearance={colors.keyboardAppearance}
                        maxLength={6}
                        accessibilityLabel={t('split.taxRate')}
                      />
                      <Text style={styles.taxPctSign}>%</Text>
                    </View>
                  </View>
                  <View style={styles.taxField}>
                    <Text style={styles.taxFieldLabel}>{t('split.tipRate')}</Text>
                    <View style={styles.taxInputWrap}>
                      <TextInput
                        style={styles.taxInput}
                        value={tipPct}
                        onChangeText={(text) => setTipPct(cleanAmountInput(text))}
                        placeholder="0"
                        placeholderTextColor={colors.textMuted}
                        keyboardType="decimal-pad"
                        keyboardAppearance={colors.keyboardAppearance}
                        maxLength={6}
                        accessibilityLabel={t('split.tipRate')}
                      />
                      <Text style={styles.taxPctSign}>%</Text>
                    </View>
                  </View>
                </View>
                <Text style={styles.hint}>{t('split.taxHint')}</Text>
              </>
            )}

            <View style={styles.peopleCard}>
              {people.map((p, index) => {
                const on = !!included[p.id];
                const pct = parseFloat(String(percent[p.id] ?? '').replace(',', '.')) || 0;
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

                    {on && mode === 'equal' && equalPreview?.[p.id] != null && (
                      <Text style={styles.sharePreview}>{formatMoney(equalPreview[p.id], currencyCode)}</Text>
                    )}

                    {on && mode === 'custom' && (
                      <View style={styles.inlineAmount}>
                        <Text style={styles.inlineSymbol}>{cur.symbol}</Text>
                        <TextInput
                          style={styles.inlineInput}
                          value={custom[p.id] ?? ''}
                          onChangeText={(v) => setCustom((prev) => ({ ...prev, [p.id]: cleanAmountInput(v) }))}
                          placeholder="0"
                          placeholderTextColor={colors.textMuted}
                          keyboardType={cur.decimals === 0 ? 'number-pad' : 'decimal-pad'}
                          keyboardAppearance={colors.keyboardAppearance}
                          maxLength={AMOUNT_MAX_LENGTH}
                          accessibilityLabel={`${p.name} ${t('split.amount')}`}
                        />
                      </View>
                    )}

                    {on && mode === 'percentage' && (
                      <View style={styles.inlineAmount}>
                        {percentPreview?.[p.id] != null && pct > 0 && (
                          <Text style={styles.sharePreviewMuted}>
                            {formatMoney(percentPreview[p.id], currencyCode)}
                          </Text>
                        )}
                        <TextInput
                          style={styles.pctInput}
                          value={percent[p.id] ?? ''}
                          onChangeText={(v) => setPercent((prev) => ({ ...prev, [p.id]: cleanAmountInput(v) }))}
                          placeholder="0"
                          placeholderTextColor={colors.textMuted}
                          keyboardType="decimal-pad"
                          keyboardAppearance={colors.keyboardAppearance}
                          maxLength={6}
                          accessibilityLabel={`${p.name} %`}
                        />
                        <Text style={styles.inlineSymbol}>%</Text>
                      </View>
                    )}

                    {on && mode === 'tax' && (
                      <View style={styles.inlineAmount}>
                        <Text style={styles.inlineSymbol}>{cur.symbol}</Text>
                        <TextInput
                          style={styles.inlineInput}
                          value={subtotals[p.id] ?? ''}
                          onChangeText={(v) => setSubtotals((prev) => ({ ...prev, [p.id]: cleanAmountInput(v) }))}
                          placeholder="0"
                          placeholderTextColor={colors.textMuted}
                          keyboardType={cur.decimals === 0 ? 'number-pad' : 'decimal-pad'}
                          keyboardAppearance={colors.keyboardAppearance}
                          maxLength={AMOUNT_MAX_LENGTH}
                          accessibilityLabel={`${p.name} ${t('split.amount')}`}
                        />
                        {taxResult.shares[p.id] != null && (
                          <Text style={styles.sharePreviewMuted}>→ {formatMoney(taxResult.shares[p.id], currencyCode)}</Text>
                        )}
                      </View>
                    )}
                  </View>
                );
              })}
            </View>

            {mode === 'custom' && amountValid && !customOk && (
              <Text style={styles.warning}>{t('split.customMismatch')}</Text>
            )}
            {mode === 'percentage' && participantIds.length > 0 && !percentOk && (
              <Text style={styles.warning}>{t('split.percentMismatch')}</Text>
            )}
            {mode === 'tax' && participantIds.length > 0 && !taxOk && (
              <Text style={styles.warning}>{t('split.taxNeedsSubtotal')}</Text>
            )}

            <Pressable
              onPress={handleAdd}
              disabled={!canAdd}
              accessibilityRole="button"
              accessibilityState={{ disabled: !canAdd }}
              style={({ pressed }) => [
                styles.saveButton,
                !canAdd && styles.saveButtonDisabled,
                pressed && canAdd && styles.saveButtonPressed,
              ]}
            >
              <Text style={styles.saveButtonText}>{t('split.addBill')}</Text>
            </Pressable>
          </>
        )}
      </ScrollView>
    </View>
  );
}

const createStyles = (colors) =>
  StyleSheet.create({
    ...popupChromeStyles(colors),
    pressedBg: {
      backgroundColor: colors.cardPressed,
    },
    pressedFade: {
      opacity: 0.6,
    },

    noGroup: {
      alignItems: 'center',
      paddingVertical: spacing.xl,
      paddingHorizontal: spacing.md,
    },
    noGroupTitle: {
      color: colors.textPrimary,
      fontFamily: fonts.bold,
      fontSize: 17,
      marginTop: spacing.md,
    },
    noGroupHint: {
      color: colors.textMuted,
      fontFamily: fonts.regular,
      fontSize: 14,
      textAlign: 'center',
      lineHeight: 20,
      marginTop: spacing.xs,
    },
    createGroupBtn: {
      flexDirection: 'row',
      alignItems: 'center',
      gap: spacing.xs,
      backgroundColor: colors.accent,
      borderRadius: radius.md,
      paddingHorizontal: spacing.lg,
      paddingVertical: spacing.sm + 4,
      marginTop: spacing.lg,
    },
    createGroupBtnPressed: {
      backgroundColor: colors.accentDark,
    },
    createGroupText: {
      color: colors.onAccent,
      fontFamily: fonts.bold,
      fontSize: 15,
    },

    sectionHeader: {
      color: colors.textSecondary,
      fontFamily: fonts.bold,
      fontSize: 13,
      textTransform: 'uppercase',
      letterSpacing: 1.2,
      marginBottom: spacing.sm,
    },
    chipScroll: {
      gap: spacing.sm,
      paddingVertical: 2,
      paddingRight: spacing.sm,
      marginBottom: spacing.md,
    },
    groupChip: {
      flexDirection: 'row',
      alignItems: 'center',
      gap: spacing.xs,
      borderWidth: 1,
      borderColor: colors.border,
      borderRadius: radius.md,
      paddingHorizontal: spacing.sm + 2,
      paddingVertical: spacing.sm,
    },
    groupChipSelected: {
      backgroundColor: `${colors.accent}18`,
      borderColor: colors.accent,
    },
    groupChipText: {
      color: colors.textSecondary,
      fontFamily: fonts.medium,
      fontSize: 13,
      maxWidth: 140,
    },
    groupChipTextSelected: {
      color: colors.textPrimary,
    },

    dateWrap: {
      marginTop: spacing.xs,
    },

    amountRow: {
      flexDirection: 'row',
      alignItems: 'center',
      marginBottom: spacing.md,
    },
    currencySymbol: {
      color: colors.textSecondary,
      fontFamily: fonts.numBold,
      fontSize: 26,
      marginRight: spacing.sm,
      flexShrink: 0,
    },
    amountInput: {
      flex: 1,
      minWidth: 0,
      color: colors.textPrimary,
      fontFamily: fonts.numBold,
      fontSize: 34,
      fontVariant: ['tabular-nums'],
    },
    amountCode: {
      color: colors.textMuted,
      fontFamily: fonts.bold,
      fontSize: 13,
      marginLeft: spacing.sm,
    },

    totalRow: {
      flexDirection: 'row',
      alignItems: 'center',
      justifyContent: 'space-between',
      backgroundColor: colors.card,
      borderRadius: radius.sm,
      paddingHorizontal: spacing.md,
      paddingVertical: spacing.md,
      marginBottom: spacing.md,
    },
    totalLabel: {
      color: colors.textSecondary,
      fontFamily: fonts.bold,
      fontSize: 13,
      textTransform: 'uppercase',
      letterSpacing: 1.2,
    },
    totalValue: {
      color: colors.textPrimary,
      fontFamily: fonts.numBold,
      fontSize: 26,
      fontVariant: ['tabular-nums'],
      flexShrink: 1,
      textAlign: 'right',
    },

    noteRow: {
      flexDirection: 'row',
      alignItems: 'center',
      backgroundColor: colors.card,
      borderRadius: radius.sm,
      paddingHorizontal: spacing.md,
      marginBottom: spacing.md,
    },
    noteInput: {
      flex: 1,
      color: colors.textPrimary,
      paddingVertical: spacing.sm + 4,
      fontFamily: fonts.regular,
      fontSize: 15,
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
      marginBottom: spacing.md,
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

    methodToggle: {
      flexDirection: 'row',
      backgroundColor: colors.cardPressed,
      borderRadius: 12,
      padding: 2,
      marginBottom: spacing.md,
    },
    methodChip: {
      flex: 1,
      alignItems: 'center',
      paddingVertical: spacing.xs + 2,
      borderRadius: 10,
    },
    methodChipSelected: {
      backgroundColor: colors.card,
    },
    methodText: {
      color: colors.textMuted,
      fontFamily: fonts.bold,
      fontSize: 13,
    },
    methodTextSelected: {
      color: colors.accent,
    },

    taxRow: {
      flexDirection: 'row',
      gap: spacing.md,
      marginBottom: spacing.sm,
    },
    taxField: {
      flex: 1,
    },
    taxFieldLabel: {
      color: colors.textSecondary,
      fontFamily: fonts.medium,
      fontSize: 12,
      marginBottom: spacing.xs,
    },
    taxInputWrap: {
      flexDirection: 'row',
      alignItems: 'center',
      backgroundColor: colors.card,
      borderRadius: radius.sm,
      paddingHorizontal: spacing.md,
    },
    taxInput: {
      flex: 1,
      color: colors.textPrimary,
      fontFamily: fonts.numBold,
      fontSize: 16,
      paddingVertical: spacing.sm + 2,
      fontVariant: ['tabular-nums'],
    },
    taxPctSign: {
      color: colors.textMuted,
      fontFamily: fonts.numBold,
      fontSize: 15,
      marginLeft: spacing.xs,
    },
    hint: {
      color: colors.textMuted,
      fontFamily: fonts.regular,
      fontSize: 12,
      lineHeight: 17,
      marginBottom: spacing.md,
    },

    peopleCard: {
      backgroundColor: colors.card,
      borderRadius: radius.md,
      overflow: 'hidden',
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
    sharePreview: {
      color: colors.textSecondary,
      fontFamily: fonts.numBold,
      fontSize: 15,
      fontVariant: ['tabular-nums'],
    },
    sharePreviewMuted: {
      color: colors.textMuted,
      fontFamily: fonts.numRegular,
      fontSize: 13,
      fontVariant: ['tabular-nums'],
    },
    inlineAmount: {
      flexDirection: 'row',
      alignItems: 'center',
      gap: spacing.xs,
    },
    inlineSymbol: {
      color: colors.textMuted,
      fontFamily: fonts.numRegular,
      fontSize: 14,
    },
    inlineInput: {
      width: 80,
      color: colors.textPrimary,
      fontFamily: fonts.numBold,
      fontSize: 15,
      textAlign: 'right',
      paddingVertical: spacing.sm,
      fontVariant: ['tabular-nums'],
    },
    pctInput: {
      width: 52,
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

    saveButton: {
      backgroundColor: colors.accent,
      borderRadius: radius.md,
      paddingVertical: spacing.md,
      alignItems: 'center',
      marginTop: spacing.lg,
    },
    saveButtonDisabled: {
      opacity: 0.4,
    },
    saveButtonPressed: {
      backgroundColor: colors.accentDark,
    },
    saveButtonText: {
      color: colors.onAccent,
      fontFamily: fonts.bold,
      fontSize: 16,
    },
  });
