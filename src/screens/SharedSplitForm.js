import { useMemo, useRef, useState } from 'react';
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
import { isValidAmountText, formatMoney, cleanAmountInput, dateKey } from '../format';
import { HIcon } from '../icons';
import { confirmDestructive } from '../confirm';
import EntryModeToggle from '../components/EntryModeToggle';
import CalendarField, { dateForOffset, offsetForDay } from '../components/CalendarField';
import CurrencyPill from '../components/CurrencyPill';
import CurrencyPicker from '../components/CurrencyPicker';
import OptionPicker from '../components/OptionPicker';
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
// Tax mode reconciles the entered grand total against food + tax + tip. Allow a
// couple of smallest currency units of slack so rounded tax/tip rates (e.g. 8%)
// that don't reproduce a receipt total to the exact cent still pass.
const TAX_TOTAL_TOLERANCE_UNITS = 2;
const NEW_GROUP_OPTION_ID = '__new_group__';

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
// currency, who paid, and one of four split methods (equal, custom amounts,
// percentages, or an itemized tax split). On save it computes per-person shares
// and hands the bill up via onAdd; your share folds into personal spending
// elsewhere (yourShareAsExpenses).
//
// Launched two ways:
//   • from the + popup  → showToggle + group picker shown, group defaults to the first
//   • from a group sheet → lockedGroupId set: toggle + picker hidden, focused "Add a bill"
export default function SharedSplitForm({
  entryMode,
  onChangeEntryMode,
  lockedGroupId = null,
  initialGroupId = null,
  editBill = null,
  groups,
  displayCurrency,
  onAdd,
  onSave,
  onDelete,
  onCreateGroup,
  onClose,
}) {
  const { colors } = useTheme();
  const t = useT();
  const styles = useMemo(() => createStyles(colors), [colors]);

  // Edit mode: prefill from an existing bill and save in place (vs. add a new
  // one). A bill never moves between groups, so editing locks the group too.
  const isEdit = editBill != null;
  const effectiveLockedGroupId = lockedGroupId ?? (isEdit ? editBill.groupId : null);
  const showToggle = !effectiveLockedGroupId;
  const showGroupPicker = !effectiveLockedGroupId;

  const initialGroup = effectiveLockedGroupId
    ? groups.find((g) => g.id === effectiveLockedGroupId)
    : groups.find((g) => g.id === initialGroupId) ?? groups[0];

  // Reconstruct the raw split inputs from the stored bill. Bills persist only the
  // final per-person `shares` (+ an optional `meta` for percentage/tax raw inputs),
  // so: custom is lossless from shares; percentage uses meta or derives from
  // shares; tax needs meta (its itemized subtotals can't be recovered) — without
  // it we fall back to editing as a 'custom' split seeded from the shares.
  const editDec = isEdit ? getCurrency(editBill.currency).decimals : 2;
  const fmtNum = (n, dec) => (dec === 0 ? String(Math.round(n)) : Number(n).toFixed(dec));
  const seedShares = isEdit ? (editBill.shares || {}) : {};
  const seedMode = isEdit
    ? (editBill.mode === 'tax' && !editBill.meta ? 'custom' : editBill.mode || 'equal')
    : 'equal';

  const [selectedGroupId, setSelectedGroupId] = useState(initialGroup?.id ?? null);
  const [included, setIncluded] = useState(() =>
    Object.fromEntries(peopleFor(initialGroup).map((p) => [p.id, isEdit ? seedShares[p.id] != null : true]))
  );
  const [paidBy, setPaidBy] = useState(isEdit ? editBill.paidBy : YOU);
  const [manualCurrency, setManualCurrency] = useState(isEdit ? editBill.currency : null);
  const [mode, setMode] = useState(seedMode);
  // Seed the total whenever editing. Every mode (tax included) now shows the grand
  // total up top, so for a tax bill this is the saved grand total — the per-person
  // food prices in `subtotals` must reconcile to it.
  const [amountText, setAmountText] = useState(() => (isEdit ? fmtNum(editBill.amount, editDec) : ''));
  const [description, setDescription] = useState(isEdit ? editBill.description || '' : '');
  // Shared bills aren't categorized in the UI; keep an existing bill's category on
  // edit and default new ones to 'other' so downstream consumers stay happy.
  const category = isEdit ? editBill.category || 'other' : 'other';
  const [custom, setCustom] = useState(() =>
    isEdit && seedMode === 'custom'
      ? Object.fromEntries(Object.keys(seedShares).map((id) => [id, fmtNum(seedShares[id], editDec)]))
      : {}
  );
  const [percent, setPercent] = useState(() => {
    if (!isEdit || seedMode !== 'percentage') return {};
    if (editBill.meta?.percentages) return { ...editBill.meta.percentages };
    const total = editBill.amount || 0;
    return Object.fromEntries(
      Object.keys(seedShares).map((id) => [id, total > 0 ? String(Math.round((seedShares[id] / total) * 1000) / 10) : ''])
    );
  });
  const [subtotals, setSubtotals] = useState(() =>
    isEdit && editBill.mode === 'tax' && editBill.meta?.subtotals ? { ...editBill.meta.subtotals } : {}
  );
  const [taxPct, setTaxPct] = useState(
    isEdit && editBill.mode === 'tax' && editBill.meta ? String(editBill.meta.taxPct ?? '') : ''
  );
  const [tipPct, setTipPct] = useState(
    isEdit && editBill.mode === 'tax' && editBill.meta ? String(editBill.meta.tipPct ?? '') : ''
  );
  const [dayOffset, setDayOffset] = useState(() => {
    if (!isEdit) return 0;
    const d = new Date(editBill.createdAt);
    return offsetForDay(d.getFullYear(), d.getMonth(), d.getDate());
  });
  // Currency picker + the Group / Paid by / Split option popups. `picker` is
  // which selector chip's popup is open (one at a time).
  const [currencyOpen, setCurrencyOpen] = useState(false);
  const [picker, setPicker] = useState(null); // 'group' | 'payer' | 'split' | null

  const selectedGroup = groups.find((g) => g.id === selectedGroupId) ?? null;
  const currencyCode = manualCurrency ?? selectedGroup?.currency ?? displayCurrency;
  const cur = getCurrency(currencyCode);

  const people = useMemo(
    () => (selectedGroup ? [{ id: YOU, name: t('split.you') }, ...selectedGroup.members] : []),
    [selectedGroup, t]
  );
  const payerName = people.find((p) => p.id === paidBy)?.name ?? '';
  const activeMode = MODES.find((m) => m.id === mode) ?? MODES[0];

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
  // Equal mode shows ONE "{amount} each" caption instead of repeating the same
  // share on every person row; ≈ flags the cent-reconciled case where shares
  // differ by a smallest unit.
  const equalShareLabel = useMemo(() => {
    if (!equalPreview) return null;
    const vals = participantIds.map((id) => equalPreview[id]);
    const allSame = vals.every((v) => v === vals[0]);
    return `${allSame ? '' : '≈ '}${t('split.eachShare', { amount: formatMoney(vals[0], currencyCode) })}`;
  }, [equalPreview, participantIds, currencyCode, t]);

  const customOk = mode !== 'custom' || (amountValid && customSharesValid(amount, customNum, participantIds, currencyCode));
  const percentOk = mode !== 'percentage' || percentageSharesValid(percentNum, participantIds);
  // Tax mode takes the grand total up top like every other mode. Each person's
  // food price is entered below; food + tax + tip must reconcile to that total
  // (taxResult.total is the floored/distributed grand total of those subtotals),
  // within a small tolerance so rounded tax/tip rates still pass.
  const taxHasInput = taxInputValid(subtotalNum, participantIds);
  const taxFactor = 10 ** cur.decimals;
  const taxAddsUp =
    amountValid &&
    Math.abs(Math.round(taxResult.total * taxFactor) - Math.round(amount * taxFactor)) <=
      TAX_TOTAL_TOLERANCE_UNITS;
  const taxOk = mode !== 'tax' || (taxHasInput && taxAddsUp);
  const canAdd =
    !!selectedGroup &&
    participantIds.length > 0 &&
    amountValid &&
    customOk &&
    percentOk &&
    taxOk;

  const handleAdd = () => {
    if (!canAdd) return;
    let amountToSave;
    let shares;
    // Persist the raw split inputs (percentages / tax subtotals+rates) alongside
    // the shares so a later edit can reconstruct them losslessly.
    let meta;
    if (mode === 'tax') {
      const r = computeTaxShares(subtotalNum, participantIds, taxRate, tipRate, currencyCode);
      amountToSave = r.total;
      shares = r.shares;
      meta = { subtotals: subtotalNum, taxPct: taxRate, tipPct: tipRate };
    } else {
      // Persist amount and shares on ONE rounded basis so the bill total and the
      // sum of shares can never disagree (computeShares reconciles to it).
      amountToSave = Number(amount.toFixed(cur.decimals));
      const map = mode === 'custom' ? customNum : mode === 'percentage' ? percentNum : {};
      shares = computeShares(amountToSave, mode, participantIds, map, currencyCode);
      if (mode === 'percentage') meta = { percentages: percentNum };
    }
    // In edit mode keep the original timestamp when the day is unchanged (mirrors
    // the personal-expense edit path); otherwise stamp the chosen day.
    let createdAt;
    if (isEdit) {
      const newDay = dateKey(dateForOffset(dayOffset).getTime());
      const originalDay = dateKey(editBill.createdAt);
      createdAt = newDay === originalDay ? editBill.createdAt : dateForOffset(dayOffset).getTime();
    } else {
      createdAt = dayOffset === 0 ? Date.now() : dateForOffset(dayOffset).getTime();
    }
    const payload = {
      groupId: selectedGroup.id,
      description: description.trim(),
      amount: amountToSave,
      currency: currencyCode,
      category,
      paidBy,
      mode,
      shares,
      createdAt,
      meta,
    };
    if (isEdit) {
      payload.id = editBill.id;
      onSave(payload);
    } else {
      onAdd(payload);
    }
    Keyboard.dismiss();
  };

  const handleDelete = async () => {
    if (!isEdit) return;
    const ok = await confirmDestructive({
      title: t('split.deleteBill'),
      body: t('split.deleteBillBody'),
      confirmLabel: t('common.delete'),
      cancelLabel: t('common.cancel'),
    });
    if (ok) onDelete(editBill.id);
  };

  // The single OptionPicker is driven by `picker`; its props depend on which
  // selector chip was tapped.
  const pickerProps =
    picker === 'group'
      ? {
          title: t('split.group'),
          value: selectedGroupId,
          options: [
            ...groups.map((g) => ({ id: g.id, label: g.name, icon: 'user-group' })),
            { id: NEW_GROUP_OPTION_ID, label: `+ ${t('split.newGroup')}`, icon: 'plus-sign' },
          ],
          onSelect: (id) => {
            setPicker(null);
            if (id === NEW_GROUP_OPTION_ID) {
              onCreateGroup();
              return;
            }
            selectGroup(id);
          },
        }
      : picker === 'payer'
        ? {
            title: t('split.paidBy'),
            value: paidBy,
            options: people.map((p) => ({ id: p.id, label: p.name })),
            onSelect: (id) => { setPaidBy(id); setPicker(null); },
          }
        : picker === 'split'
          ? {
              title: t('split.splitMethod'),
              value: mode,
              options: MODES.map((m) => ({ id: m.id, label: t(m.labelKey) })),
              onSelect: (id) => { setMode(id); setPicker(null); },
            }
          : null;
  // Keep the last non-null config so the popup's content stays put while it fades
  // out (picker flips to null on select/close before the fade finishes).
  const lastPickerProps = useRef(null);
  if (pickerProps) lastPickerProps.current = pickerProps;
  const shownPicker = pickerProps ?? lastPickerProps.current;

  // The config selectors render as ONE row of compact label-over-value chips
  // (group hidden when locked) instead of stacked full-width rows; each chip
  // opens the OptionPicker above.
  const selectorChips = [
    showGroupPicker && selectedGroup && { key: 'group', label: t('split.group'), value: selectedGroup.name },
    { key: 'payer', label: t('split.paidBy'), value: payerName },
    { key: 'split', label: t('split.splitMethod'), value: t(activeMode.labelKey) },
  ].filter(Boolean);

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
              <Text style={styles.title}>{isEdit ? t('split.editBill') : t('split.addBill')}</Text>
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
            <View style={styles.dateWrap}>
              <CalendarField dayOffset={dayOffset} onChange={setDayOffset} />
            </View>

            {/* Grand total — shown for every split method (tax included), so the
                amount field never jumps around when switching methods. In tax mode
                this is the food + tax + tip total the per-person prices reconcile to. */}
            <View style={styles.amountRow}>
              <View style={styles.currencyTriggerWrap}>
                <CurrencyPill
                  value={currencyCode}
                  onPress={() => setCurrencyOpen(true)}
                  accessibilityLabel={t('currency.choose')}
                  style={styles.currencyPill}
                  textStyle={styles.currencyPillText}
                />
              </View>
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
              {/* Empty spacer balancing the fixed-width currency pill so the
                  amount stays optically centered regardless of currency
                  (mirrors AddEntryScreen's Personal amount row). */}
              <View style={styles.amountSpacer} />
            </View>

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

            <View style={styles.chipRow}>
              {selectorChips.map((c) => (
                <Pressable
                  key={c.key}
                  onPress={() => setPicker(c.key)}
                  accessibilityRole="button"
                  accessibilityLabel={c.label}
                  style={({ pressed }) => [styles.chip, pressed && styles.pressedBg]}
                >
                  <Text style={styles.chipLabel} numberOfLines={1}>{c.label}</Text>
                  <View style={styles.chipValueRow}>
                    <Text style={styles.chipValue} numberOfLines={1}>{c.value}</Text>
                    <HIcon name="chevron-down" size={14} color={colors.icon} />
                  </View>
                </Pressable>
              ))}
            </View>

            {mode === 'tax' && (
              <>
                {/* Inline-label pills ("Tax %" / "Tip %" carry the % themselves)
                    keep tax mode to one compact row. */}
                <View style={styles.taxRow}>
                  <View style={styles.taxField}>
                    <Text style={styles.taxFieldLabel}>{t('split.taxRate')}</Text>
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
                  </View>
                  <View style={styles.taxField}>
                    <Text style={styles.taxFieldLabel}>{t('split.tipRate')}</Text>
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
                  </View>
                </View>
                <Text style={styles.hint}>{t('split.taxHint')}</Text>
              </>
            )}

            {mode === 'equal' ? (
              /* Equal (the default) shows participants as tappable avatar chips —
                 far shorter than one row per person — plus the single per-person
                 caption below instead of the same share repeated on every row. */
              <>
                <View style={styles.memberChips}>
                  {people.map((p) => {
                    const on = !!included[p.id];
                    return (
                      <Pressable
                        key={p.id}
                        onPress={() => setIncluded((prev) => ({ ...prev, [p.id]: !prev[p.id] }))}
                        accessibilityRole="checkbox"
                        accessibilityState={{ checked: on }}
                        accessibilityLabel={p.name}
                        style={[styles.memberChip, on && styles.memberChipOn]}
                      >
                        <MemberAvatar name={p.name} on={on} styles={styles} />
                        <Text style={[styles.memberChipName, !on && styles.memberNameOff]} numberOfLines={1}>
                          {p.name}
                        </Text>
                        <CheckBadge on={on} styles={styles} />
                      </Pressable>
                    );
                  })}
                </View>
                {equalShareLabel != null && <Text style={styles.eachShare}>{equalShareLabel}</Text>}
              </>
            ) : (
              /* Custom / percentage / tax need a per-person input, so those keep a
                 row per person: the avatar+name toggles inclusion, the input sits
                 on the right. */
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
                        <CheckBadge on={on} styles={styles} />
                        <MemberAvatar name={p.name} on={on} styles={styles} />
                        <Text style={[styles.personName, !on && styles.memberNameOff]} numberOfLines={1}>{p.name}</Text>
                      </Pressable>

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
            )}

            {mode === 'custom' && amountValid && !customOk && (
              <Text style={styles.warning}>{t('split.customMismatch')}</Text>
            )}
            {mode === 'percentage' && participantIds.length > 0 && !percentOk && (
              <Text style={styles.warning}>{t('split.percentMismatch')}</Text>
            )}
            {mode === 'tax' && participantIds.length > 0 && !taxHasInput && (
              <Text style={styles.warning}>{t('split.taxNeedsSubtotal')}</Text>
            )}
            {mode === 'tax' && participantIds.length > 0 && taxHasInput && amountValid && !taxAddsUp && (
              <Text style={styles.warning}>
                {t('split.taxMismatch', { total: formatMoney(taxResult.total, currencyCode) })}
              </Text>
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
              <Text style={styles.saveButtonText}>{isEdit ? t('split.saveBill') : t('split.addBill')}</Text>
            </Pressable>

            {isEdit && (
              <Pressable
                onPress={handleDelete}
                accessibilityRole="button"
                style={({ pressed }) => [styles.deleteButton, pressed && styles.pressedBg]}
              >
                <Text style={styles.deleteButtonText}>{t('split.deleteBill')}</Text>
              </Pressable>
            )}
          </>
        )}
      </ScrollView>

      <CurrencyPicker
        visible={currencyOpen}
        value={currencyCode}
        onSelect={(code) => {
          setManualCurrency(code);
          setCurrencyOpen(false);
        }}
        onClose={() => setCurrencyOpen(false)}
      />
      <OptionPicker
        visible={pickerProps !== null}
        title={shownPicker?.title}
        options={shownPicker?.options || []}
        value={shownPicker?.value}
        onSelect={shownPicker?.onSelect || (() => {})}
        onClose={() => setPicker(null)}
      />
    </View>
  );
}

// Explicit checkbox affordance on every participant toggle: an accent-filled
// ✓ circle while included, a hollow ring while excluded — so it reads as a
// choice, not just a tint change.
function CheckBadge({ on, styles }) {
  return (
    <View style={[styles.checkBadge, on && styles.checkBadgeOn]}>
      {on && <Text style={styles.checkBadgeMark}>✓</Text>}
    </View>
  );
}

// Initial-letter avatar shared by the equal-mode member chips and the
// input-mode rows; accent-filled while the person is included in the split.
function MemberAvatar({ name, on, styles }) {
  return (
    <View style={[styles.avatar, on && styles.avatarOn]}>
      <Text style={[styles.avatarText, on && styles.avatarTextOn]}>
        {(name || '').trim().slice(0, 1).toUpperCase() || '?'}
      </Text>
    </View>
  );
}

const createStyles = (colors) =>
  StyleSheet.create({
    ...popupChromeStyles(colors),
    pressedBg: {
      backgroundColor: colors.cardPressed,
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

    chipRow: {
      flexDirection: 'row',
      gap: spacing.sm,
      marginBottom: spacing.md,
    },
    chip: {
      flex: 1,
      backgroundColor: colors.card,
      borderRadius: radius.sm,
      paddingHorizontal: spacing.sm + 2,
      paddingVertical: spacing.sm,
    },
    chipLabel: {
      color: colors.textMuted,
      fontFamily: fonts.medium,
      fontSize: 11,
    },
    chipValueRow: {
      flexDirection: 'row',
      alignItems: 'center',
      gap: 2,
      marginTop: 2,
    },
    chipValue: {
      color: colors.textPrimary,
      fontFamily: fonts.bold,
      fontSize: 14,
      flexShrink: 1,
    },

    dateWrap: {
      marginTop: spacing.xs,
    },

    amountRow: {
      flexDirection: 'row',
      alignItems: 'center',
      marginBottom: spacing.md,
    },
    currencyTriggerWrap: {
      width: 72,
      flexShrink: 0,
      alignItems: 'flex-start',
      justifyContent: 'center',
    },
    currencyPill: {
      paddingHorizontal: spacing.sm,
      paddingVertical: spacing.xs + 1,
    },
    currencyPillText: {
      fontSize: 14,
    },
    amountInput: {
      flex: 1,
      minWidth: 0,
      color: colors.textPrimary,
      fontFamily: fonts.numBold,
      fontSize: 34,
      textAlign: 'center',
      fontVariant: ['tabular-nums'],
    },
    amountSpacer: {
      width: 72,
      flexShrink: 0,
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

    taxRow: {
      flexDirection: 'row',
      flexWrap: 'wrap',
      gap: spacing.sm,
      marginBottom: spacing.sm,
    },
    taxField: {
      flex: 1,
      flexBasis: 0,
      minWidth: 120,
      flexDirection: 'row',
      alignItems: 'center',
      backgroundColor: colors.card,
      borderRadius: radius.sm,
      paddingHorizontal: spacing.md,
    },
    taxFieldLabel: {
      color: colors.textMuted,
      fontFamily: fonts.medium,
      fontSize: 13,
      flexShrink: 0,
    },
    taxInput: {
      flex: 1,
      minWidth: 0,
      color: colors.textPrimary,
      fontFamily: fonts.numBold,
      fontSize: 16,
      paddingVertical: spacing.sm + 2,
      paddingLeft: spacing.xs,
      textAlign: 'right',
      fontVariant: ['tabular-nums'],
    },
    hint: {
      color: colors.textMuted,
      fontFamily: fonts.regular,
      fontSize: 12,
      lineHeight: 17,
      marginBottom: spacing.md,
    },

    memberChips: {
      flexDirection: 'row',
      flexWrap: 'wrap',
      gap: spacing.sm,
    },
    memberChip: {
      flexDirection: 'row',
      alignItems: 'center',
      gap: spacing.xs + 2,
      backgroundColor: colors.card,
      borderRadius: 999,
      borderWidth: 1.5,
      borderColor: 'transparent',
      paddingVertical: spacing.xs - 1.5,
      paddingLeft: spacing.xs - 0.5,
      paddingRight: spacing.sm + 2,
      maxWidth: '100%',
    },
    memberChipOn: {
      backgroundColor: `${colors.accent}15`,
      borderColor: `${colors.accent}55`,
    },
    memberChipName: {
      color: colors.textPrimary,
      fontFamily: fonts.medium,
      fontSize: 14,
      flexShrink: 1,
    },
    memberNameOff: {
      color: colors.textMuted,
    },
    avatar: {
      width: 26,
      height: 26,
      borderRadius: 13,
      backgroundColor: colors.cardPressed,
      alignItems: 'center',
      justifyContent: 'center',
    },
    avatarOn: {
      backgroundColor: colors.accent,
    },
    avatarText: {
      color: colors.textMuted,
      fontFamily: fonts.bold,
      fontSize: 12,
    },
    avatarTextOn: {
      color: colors.onAccent,
    },
    checkBadge: {
      width: 18,
      height: 18,
      borderRadius: 9,
      borderWidth: 1.5,
      borderColor: colors.border,
      alignItems: 'center',
      justifyContent: 'center',
    },
    checkBadgeOn: {
      backgroundColor: colors.accent,
      borderColor: colors.accent,
    },
    checkBadgeMark: {
      color: colors.onAccent,
      fontFamily: fonts.bold,
      fontSize: 11,
      lineHeight: 13,
    },
    eachShare: {
      color: colors.textSecondary,
      fontFamily: fonts.numRegular,
      fontSize: 13,
      fontVariant: ['tabular-nums'],
      textAlign: 'right',
      marginTop: spacing.sm,
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
      minHeight: 46,
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
    personName: {
      color: colors.textPrimary,
      fontFamily: fonts.regular,
      fontSize: 15,
      flexShrink: 1,
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
    deleteButton: {
      alignItems: 'center',
      paddingVertical: spacing.sm + 4,
      marginTop: spacing.sm,
      borderRadius: radius.md,
    },
    deleteButtonText: {
      color: colors.danger,
      fontFamily: fonts.bold,
      fontSize: 15,
    },
  });
