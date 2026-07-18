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
import { getCategoryLabel } from '../categories';
import { HIcon } from '../icons';
import { confirmDestructive } from '../confirm';
import EntryModeToggle from '../components/EntryModeToggle';
import CalendarField, { dateForOffset, offsetForDay } from '../components/CalendarField';
import CurrencyPill from '../components/CurrencyPill';
import CurrencyPicker from '../components/CurrencyPicker';
import OptionPicker from '../components/OptionPicker';
import AnchorMenu from '../components/AnchorMenu';
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

// Chips whose small option sets open the anchored iOS-style AnchorMenu;
// category (a long, icon-badged list) opens the centered OptionPicker instead.
const MENU_CHIP_KEYS = ['group', 'payer', 'split', 'members'];

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
// two forms in one widget. Lets you pick the group, the category, the date, the
// currency, who paid, who's in (the Members chip's multi-select dropdown), and
// one of four split methods (equal, custom amounts, percentages, or an itemized
// tax split). On save it computes per-person shares and hands the bill up via
// onAdd; your share folds into personal spending elsewhere
// (yourShareAsExpenses), under the chosen category.
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
  categories = [],
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
  // The bill's category (defaults to Other) — your share counts as spending
  // under it (yourShareAsExpenses), so it feeds budgets and charts.
  const [category, setCategory] = useState(isEdit ? editBill.category || 'other' : 'other');
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
  // Currency picker + the selector-chip popups. `picker` is which chip's popup
  // is open (one at a time); `menuAnchor` is the tapped chip's window frame so
  // the AnchorMenu opens attached to it.
  const [currencyOpen, setCurrencyOpen] = useState(false);
  const [picker, setPicker] = useState(null); // 'group' | 'category' | 'payer' | 'split' | 'members' | null
  const [menuAnchor, setMenuAnchor] = useState(null);
  const chipRefs = useRef({});

  // Menu chips measure themselves on tap so the menu can anchor to the chip;
  // if measuring isn't available the menu falls back to centered.
  const openPicker = (key) => {
    const node = MENU_CHIP_KEYS.includes(key) ? chipRefs.current[key] : null;
    if (node?.measureInWindow) {
      node.measureInWindow((x, y, width, height) => {
        setMenuAnchor({ x, y, width, height });
        setPicker(key);
      });
    } else {
      setMenuAnchor(null);
      setPicker(key);
    }
  };

  const selectedGroup = groups.find((g) => g.id === selectedGroupId) ?? null;
  const currencyCode = manualCurrency ?? selectedGroup?.currency ?? displayCurrency;
  const cur = getCurrency(currencyCode);

  const people = useMemo(
    () => (selectedGroup ? [{ id: YOU, name: t('split.you') }, ...selectedGroup.members] : []),
    [selectedGroup, t]
  );
  const payerName = people.find((p) => p.id === paidBy)?.name ?? '';
  const activeMode = MODES.find((m) => m.id === mode) ?? MODES[0];
  const activeCategory =
    categories.find((c) => c.id === category) ?? categories.find((c) => c.id === 'other') ?? null;

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

  // One config per open popup, driven by `picker`. The menu chips (group /
  // payer / split / members) feed the anchored AnchorMenu — no titles, iOS
  // menus don't have them; category feeds the centered OptionPicker.
  const pickerProps =
    picker === 'group'
      ? {
          value: selectedGroupId,
          options: [
            ...groups.map((g) => ({ id: g.id, label: g.name })),
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
      : picker === 'category'
        ? {
            title: t('split.category'),
            value: category,
            options: categories.map((c) => ({ id: c.id, label: getCategoryLabel(c, t), icon: c.emoji, color: c.color })),
            onSelect: (id) => { setCategory(id); setPicker(null); },
          }
        : picker === 'payer'
          ? {
              value: paidBy,
              options: people.map((p) => ({ id: p.id, label: p.name })),
              onSelect: (id) => { setPaidBy(id); setPicker(null); },
            }
          : picker === 'split'
            ? {
                value: mode,
                options: MODES.map((m) => ({ id: m.id, label: t(m.labelKey) })),
                onSelect: (id) => { setMode(id); setPicker(null); },
              }
            : picker === 'members'
              ? {
                  // Multi-select: toggles stay open so several people can be
                  // (un)checked in one visit; tapping outside closes it.
                  multi: true,
                  values: participantIds,
                  options: people.map((p) => ({ id: p.id, label: p.name })),
                  onSelect: (id) => setIncluded((prev) => ({ ...prev, [id]: !prev[id] })),
                }
              : null;
  // Keep each popup's last non-null config so its content stays put while it
  // fades out (picker flips to null on select/close before the fade finishes).
  const menuProps = picker !== null && MENU_CHIP_KEYS.includes(picker) ? pickerProps : null;
  const categoryProps = picker === 'category' ? pickerProps : null;
  const lastMenuProps = useRef(null);
  if (menuProps) lastMenuProps.current = menuProps;
  const lastCategoryProps = useRef(null);
  if (categoryProps) lastCategoryProps.current = categoryProps;
  const shownMenu = menuProps ?? lastMenuProps.current;
  const shownCategory = categoryProps ?? lastCategoryProps.current;

  // The config selectors render as TWO rows of compact label-over-value chips:
  // what & where (Group / Category — the category chip goes full-width when the
  // group is locked), then who & how (Paid by / Split / Members). Menu chips
  // open the anchored AnchorMenu; category opens the centered OptionPicker.
  // The Members chip replaces the old avatar-chip participant lines: its
  // multi-select dropdown decides who's in the split for every mode,
  // summarized as "All" or "n/m".
  const chipRows = [
    [
      showGroupPicker && selectedGroup && { key: 'group', label: t('split.group'), value: selectedGroup.name },
      activeCategory && {
        key: 'category',
        label: t('split.category'),
        value: getCategoryLabel(activeCategory, t),
        iconName: activeCategory.emoji,
        iconColor: activeCategory.color,
      },
    ].filter(Boolean),
    [
      { key: 'payer', label: t('split.paidBy'), value: payerName },
      { key: 'split', label: t('split.splitMethod'), value: t(activeMode.labelKey) },
      {
        key: 'members',
        label: t('split.members'),
        value:
          participantIds.length === people.length
            ? t('split.allMembers')
            : `${participantIds.length}/${people.length}`,
      },
    ],
  ];

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

            {chipRows.map((row, rowIndex) =>
              row.length > 0 ? (
                <View
                  key={rowIndex}
                  style={[styles.chipRow, rowIndex < chipRows.length - 1 && styles.chipRowTight]}
                >
                  {row.map((c) => (
                    <Pressable
                      key={c.key}
                      ref={(r) => { chipRefs.current[c.key] = r; }}
                      onPress={() => openPicker(c.key)}
                      accessibilityRole="button"
                      accessibilityLabel={c.label}
                      style={({ pressed }) => [styles.chip, pressed && styles.pressedBg]}
                    >
                      <Text style={styles.chipLabel} numberOfLines={1}>{c.label}</Text>
                      <View style={styles.chipValueRow}>
                        {c.iconName ? <HIcon name={c.iconName} size={14} color={c.iconColor ?? colors.icon} strokeWidth={2} /> : null}
                        <Text style={styles.chipValue} numberOfLines={1}>{c.value}</Text>
                        <HIcon name="chevron-down" size={14} color={colors.icon} strokeWidth={2} />
                      </View>
                    </Pressable>
                  ))}
                </View>
              ) : null
            )}

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
              /* Equal (the default) needs no per-person UI — the Members chip
                 decides who's in, so all that's left is the single per-person
                 share caption. */
              equalShareLabel != null && <Text style={styles.eachShare}>{equalShareLabel}</Text>
            ) : (
              /* Custom / percentage / tax need a per-person input, so those keep
                 one slim row per INCLUDED person (exclusion happens in the
                 Members dropdown, so no inline checkboxes). */
              participantIds.length > 0 && (
              <View style={styles.peopleCard}>
                {people.filter((p) => included[p.id]).map((p, index) => {
                  const pct = parseFloat(String(percent[p.id] ?? '').replace(',', '.')) || 0;
                  return (
                    <View key={p.id} style={[styles.personRow, index > 0 && styles.rowDivider]}>
                      <View style={styles.personLabel}>
                        <MemberAvatar name={p.name} on styles={styles} />
                        <Text style={styles.personName} numberOfLines={1}>{p.name}</Text>
                      </View>

                      {mode === 'custom' && (
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

                      {mode === 'percentage' && (
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

                      {mode === 'tax' && (
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
              )
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
        visible={categoryProps !== null}
        title={shownCategory?.title}
        options={shownCategory?.options || []}
        value={shownCategory?.value}
        onSelect={shownCategory?.onSelect || (() => {})}
        onClose={() => setPicker(null)}
      />
      <AnchorMenu
        visible={menuProps !== null}
        anchor={menuAnchor}
        options={shownMenu?.options || []}
        value={shownMenu?.value}
        multi={!!shownMenu?.multi}
        values={shownMenu?.values || []}
        onSelect={shownMenu?.onSelect || (() => {})}
        onClose={() => setPicker(null)}
      />
    </View>
  );
}

// Initial-letter avatar on the input-mode person rows; accent-filled while the
// person is included in the split.
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
    // Between the two selector rows — tighter than the gap to the next section.
    chipRowTight: {
      marginBottom: spacing.sm,
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
      gap: 3,
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
    eachShare: {
      color: colors.textSecondary,
      fontFamily: fonts.numRegular,
      fontSize: 13,
      fontVariant: ['tabular-nums'],
      textAlign: 'center',
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
    personLabel: {
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
