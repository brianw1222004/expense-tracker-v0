import { useEffect, useMemo, useRef, useState } from 'react';
import { Pressable, ScrollView, StyleSheet, Text, TextInput, View } from 'react-native';
import { useSafeAreaInsets } from 'react-native-safe-area-context';
import { fonts, radius, spacing, useTheme, panelShadow } from '../theme';
import Sheet from '../components/Sheet';
import CurrencyPill from '../components/CurrencyPill';
import CurrencyPicker from '../components/CurrencyPicker';
import { useT } from '../i18n';
import { PAYMENT_METHODS, getPaymentMethodLabel } from '../splits';
import { HIcon } from '../icons';

// Create-group sheet: name, currency (pill -> Choose currency page), default
// payment method, and the list of member names (typed names, no accounts).
// Local draft state resets each time the sheet opens. The owner ("you") is
// implicit and not listed here.
export default function CreateGroupScreen({ visible, defaultCurrency, onCreate, onClose }) {
  const { colors } = useTheme();
  const t = useT();
  const insets = useSafeAreaInsets();
  const styles = useMemo(() => createStyles(colors), [colors]);

  const [name, setName] = useState('');
  const [currency, setCurrency] = useState(defaultCurrency);
  const [paymentMethod, setPaymentMethod] = useState('cash');
  const [currencyOpen, setCurrencyOpen] = useState(false);
  // Members stored as { id, name } so rows have stable keys when items are removed.
  const nextId = useRef(0);
  const makeMemberId = () => `m${nextId.current++}`;
  const [members, setMembers] = useState(() => [{ id: makeMemberId(), name: '' }]);

  // Reset the draft whenever the sheet (re)opens.
  useEffect(() => {
    if (visible) {
      setName('');
      setCurrency(defaultCurrency);
      setPaymentMethod('cash');
      setMembers([{ id: makeMemberId(), name: '' }]);
    }
  // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [visible, defaultCurrency]);

  const cleanMembers = members.map((m) => m.name.trim()).filter(Boolean);
  // Two members with the same trimmed name are ambiguous (the settle UI shows
  // only names). Compare case-insensitively.
  const hasDuplicateNames =
    new Set(cleanMembers.map((n) => n.toLowerCase())).size !== cleanMembers.length;
  const canCreate = name.trim().length > 0 && cleanMembers.length > 0 && !hasDuplicateNames;

  // Ids of members whose trimmed name collides (case-insensitive) with an
  // earlier member's — these rows get a danger border as inline feedback.
  const duplicateIds = useMemo(() => {
    const seen = new Map();
    const dupes = new Set();
    for (const m of members) {
      const key = m.name.trim().toLowerCase();
      if (!key) continue;
      if (seen.has(key)) dupes.add(m.id);
      else seen.set(key, m.id);
    }
    return dupes;
  }, [members]);

  const setMemberAt = (id, value) => {
    setMembers((prev) => prev.map((m) => (m.id === id ? { ...m, name: value } : m)));
  };
  const addMember = () => setMembers((prev) => [...prev, { id: makeMemberId(), name: '' }]);
  const removeMember = (id) => setMembers((prev) => prev.filter((m) => m.id !== id));

  const handleCreate = () => {
    if (!canCreate) return;
    onCreate({ name: name.trim(), currency, members: cleanMembers, paymentMethod });
  };

  return (
    <Sheet visible={visible} onClose={onClose} avoidKeyboard sheetStyle={styles.sheetOverride}>
      <View style={styles.titleRow}>
        <Text style={styles.title}>{t('split.newGroup')}</Text>
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
        <Text style={styles.sectionHeader}>{t('split.groupName')}</Text>
        <View style={styles.card}>
          <TextInput
            style={styles.nameInput}
            value={name}
            onChangeText={setName}
            placeholder={t('split.groupNamePlaceholder')}
            placeholderTextColor={colors.textMuted}
            keyboardAppearance={colors.keyboardAppearance}
            maxLength={40}
            accessibilityLabel={t('split.groupName')}
          />
        </View>

        <Text style={styles.sectionHeader}>{t('split.currency')}</Text>
        <View style={styles.card}>
          <View style={styles.settingRow}>
            <Text style={styles.settingLabel}>{t('split.currency')}</Text>
            <CurrencyPill
              value={currency}
              onPress={() => setCurrencyOpen(true)}
              accessibilityLabel={t('currency.choose')}
            />
          </View>
        </View>

        <Text style={styles.sectionHeader}>{t('split.paymentMethod')}</Text>
        <View style={styles.chipRow}>
          {PAYMENT_METHODS.map((pm) => {
            const selected = pm.id === paymentMethod;
            return (
              <Pressable
                key={pm.id}
                onPress={() => setPaymentMethod(pm.id)}
                accessibilityRole="radio"
                accessibilityState={{ selected }}
                style={({ pressed }) => [
                  styles.chip,
                  selected && styles.chipSelected,
                  pressed && styles.chipPressed,
                ]}
              >
                <Text style={[styles.chipLabel, selected && styles.chipLabelSelected]}>
                  {getPaymentMethodLabel(pm.id, t)}
                </Text>
              </Pressable>
            );
          })}
        </View>

        <Text style={styles.sectionHeader}>{t('split.members')}</Text>
        <View style={styles.card}>
          {members.map((member, index) => (
            <View
              key={member.id}
              style={[
                styles.memberRow,
                index > 0 && styles.rowDivider,
                duplicateIds.has(member.id) && styles.memberRowDup,
              ]}
            >
              <HIcon name="user-circle" size={18} color={colors.icon} />
              <TextInput
                style={styles.memberInput}
                value={member.name}
                onChangeText={(v) => setMemberAt(member.id, v)}
                placeholder={t('split.memberPlaceholder', { n: index + 1 })}
                placeholderTextColor={colors.textMuted}
                keyboardAppearance={colors.keyboardAppearance}
                maxLength={30}
                accessibilityLabel={t('split.memberPlaceholder', { n: index + 1 })}
              />
              {members.length > 1 && (
                <Pressable
                  onPress={() => removeMember(member.id)}
                  hitSlop={10}
                  accessibilityRole="button"
                  accessibilityLabel={t('common.delete')}
                  style={({ pressed }) => pressed && styles.rowPressed}
                >
                  <HIcon name="cancel-01" size={16} color={colors.textMuted} />
                </Pressable>
              )}
            </View>
          ))}
        </View>
        <Pressable
          onPress={addMember}
          accessibilityRole="button"
          style={({ pressed }) => [styles.addMemberRow, pressed && styles.addMemberPressed]}
        >
          <HIcon name="plus-sign" size={14} color={colors.accent} />
          <Text style={styles.addMemberText}>{t('split.addMember')}</Text>
        </Pressable>

        <Pressable
          onPress={handleCreate}
          disabled={!canCreate}
          accessibilityRole="button"
          style={({ pressed }) => [
            styles.createButton,
            !canCreate && styles.createButtonDisabled,
            pressed && canCreate && styles.createButtonPressed,
          ]}
        >
          <Text style={styles.createButtonText}>{t('split.createGroup')}</Text>
        </Pressable>
      </ScrollView>

      <CurrencyPicker
        visible={currencyOpen}
        value={currency}
        onSelect={(code) => {
          setCurrency(code);
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
      paddingTop: spacing.md,
      maxHeight: '88%',
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
    nameInput: {
      color: colors.textPrimary,
      fontFamily: fonts.regular,
      fontSize: 16,
      paddingHorizontal: spacing.md,
      paddingVertical: spacing.sm + 4,
    },
    settingRow: {
      flexDirection: 'row',
      justifyContent: 'space-between',
      alignItems: 'center',
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
      gap: spacing.sm,
    },
    chip: {
      borderWidth: 1,
      borderColor: colors.border,
      borderRadius: radius.md,
      paddingHorizontal: spacing.md,
      paddingVertical: spacing.sm,
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
      fontSize: 14,
    },
    chipLabelSelected: {
      color: colors.textPrimary,
    },
    memberRow: {
      flexDirection: 'row',
      alignItems: 'center',
      gap: spacing.sm,
      paddingHorizontal: spacing.md,
    },
    rowDivider: {
      borderTopWidth: StyleSheet.hairlineWidth,
      borderTopColor: colors.border,
    },
    memberRowDup: {
      borderLeftWidth: 2,
      borderLeftColor: colors.danger,
    },
    rowPressed: {
      backgroundColor: colors.cardPressed,
    },
    memberInput: {
      flex: 1,
      color: colors.textPrimary,
      fontFamily: fonts.regular,
      fontSize: 15,
      paddingVertical: spacing.sm + 4,
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
    createButton: {
      backgroundColor: colors.accent,
      borderRadius: radius.md,
      paddingVertical: spacing.md,
      alignItems: 'center',
      marginTop: spacing.lg,
    },
    createButtonDisabled: {
      opacity: 0.4,
    },
    createButtonPressed: {
      backgroundColor: colors.accentDark,
    },
    createButtonText: {
      color: colors.onAccent,
      fontFamily: fonts.bold,
      fontSize: 16,
    },
  });
