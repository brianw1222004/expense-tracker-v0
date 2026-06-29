import { useEffect, useMemo, useRef, useState } from 'react';
import {
  KeyboardAvoidingView,
  Modal,
  Platform,
  Pressable,
  ScrollView,
  StyleSheet,
  Text,
  TextInput,
  View,
} from 'react-native';
import { fonts, radius, spacing, useTheme, panelShadow } from '../theme';
import CurrencyPill from '../components/CurrencyPill';
import CurrencyPicker from '../components/CurrencyPicker';
import IconPickerSheet from '../components/IconPickerSheet';
import PaymentMethodModal from '../components/PaymentMethodModal';
import { useT } from '../i18n';
import {
  getAllPaymentMethods,
  getPaymentMethodLabel,
  getPaymentMethodColor,
  DEFAULT_METHOD_COLOR,
  DEFAULT_METHOD_ICON,
  DEFAULT_GROUP_ICON,
} from '../splits';
import { HIcon } from '../icons';

// Create-group popup — a centered widget-style card (a fading Modal, mirroring
// CurrencyPicker / the add-expense popup) rather than a bottom sheet. The group
// avatar is a minimal hugeicon tinted to the chosen payment-method color, tying
// the form together; tapping it opens the shared IconPickerSheet.
export default function CreateGroupScreen({
  visible,
  defaultCurrency,
  customPaymentMethods,
  onAddPaymentMethod,
  onCreate,
  onClose,
}) {
  const { colors } = useTheme();
  const t = useT();
  const styles = useMemo(() => createStyles(colors), [colors]);

  const [name, setName] = useState('');
  const [icon, setIcon] = useState(DEFAULT_GROUP_ICON);
  const [currency, setCurrency] = useState(defaultCurrency);
  const [paymentMethod, setPaymentMethod] = useState('cash');
  const [currencyOpen, setCurrencyOpen] = useState(false);
  const [iconPickerOpen, setIconPickerOpen] = useState(false);
  const [paymentModalOpen, setPaymentModalOpen] = useState(false);
  const nextId = useRef(0);
  const makeMemberId = () => `m${nextId.current++}`;
  const [members, setMembers] = useState(() => [{ id: makeMemberId(), name: '' }]);

  useEffect(() => {
    if (visible) {
      setName('');
      setIcon(DEFAULT_GROUP_ICON);
      setCurrency(defaultCurrency);
      setPaymentMethod('cash');
      setMembers([{ id: makeMemberId(), name: '' }]);
      setPaymentModalOpen(false);
      setCurrencyOpen(false);
      setIconPickerOpen(false);
    }
  // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [visible, defaultCurrency]);

  const allMethods = getAllPaymentMethods(customPaymentMethods);
  const iconTint = getPaymentMethodColor(paymentMethod, customPaymentMethods);
  const cleanMembers = members.map((m) => m.name.trim()).filter(Boolean);
  const hasDuplicateNames =
    new Set(cleanMembers.map((n) => n.toLowerCase())).size !== cleanMembers.length;
  const canCreate = name.trim().length > 0 && cleanMembers.length > 0 && !hasDuplicateNames;

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
    onCreate({ name: name.trim(), currency, members: cleanMembers, paymentMethod, icon });
  };

  return (
    <Modal visible={visible} animationType="fade" transparent onRequestClose={onClose}>
      <View style={styles.root}>
        <Pressable
          style={[StyleSheet.absoluteFill, styles.backdrop]}
          onPress={onClose}
          accessibilityRole="button"
          accessibilityLabel={t('common.close')}
        />
        <KeyboardAvoidingView
          behavior={Platform.OS === 'ios' ? 'padding' : 'height'}
          style={styles.center}
          pointerEvents="box-none"
        >
        <View style={styles.card}>
          <View style={styles.titleRow}>
            <Text style={styles.title}>{t('split.newGroup')}</Text>
            <Pressable
              onPress={onClose}
              hitSlop={12}
              accessibilityRole="button"
              accessibilityLabel={t('common.close')}
              style={({ pressed }) => [styles.closeButton, pressed && styles.closeButtonPressed]}
            >
              <HIcon name="cancel-01" size={18} color={colors.icon} />
            </Pressable>
          </View>

          <ScrollView
            keyboardShouldPersistTaps="handled"
            contentContainerStyle={styles.scrollContent}
            showsVerticalScrollIndicator={false}
          >
            <Text style={styles.sectionHeader}>{t('split.groupName')}</Text>
            <View style={styles.nameRow}>
              <Pressable
                onPress={() => setIconPickerOpen(true)}
                accessibilityRole="button"
                accessibilityLabel={t('split.changeIcon')}
                style={({ pressed }) => [
                  styles.iconButton,
                  { backgroundColor: `${iconTint}26` },
                  pressed && styles.iconButtonPressed,
                ]}
              >
                <HIcon name={icon} size={26} color={iconTint} />
              </Pressable>
              <View style={[styles.cardShadowWrap, styles.nameCard]}>
                <View style={styles.fieldCard}>
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
              </View>
            </View>

            <View style={styles.payHeaderRow}>
              <Text style={styles.sectionHeaderInline}>{t('split.paymentMethod')}</Text>
              <CurrencyPill
                value={currency}
                onPress={() => setCurrencyOpen(true)}
                accessibilityLabel={t('currency.choose')}
              />
            </View>
            <View style={styles.chipRow}>
              {allMethods.map((pm) => {
                const selected = pm.id === paymentMethod;
                const pColor = pm.color || DEFAULT_METHOD_COLOR;
                const pIcon = pm.icon || DEFAULT_METHOD_ICON;
                return (
                  <Pressable
                    key={pm.id}
                    onPress={() => setPaymentMethod(pm.id)}
                    accessibilityRole="radio"
                    accessibilityState={{ selected }}
                    style={({ pressed }) => [
                      styles.chip,
                      selected && { backgroundColor: `${pColor}1F`, borderColor: pColor },
                      pressed && styles.chipPressed,
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
                style={({ pressed }) => [styles.chip, styles.chipAdd, pressed && styles.chipPressed]}
              >
                <HIcon name="plus-sign" size={12} color={colors.accent} />
                <Text style={[styles.chipLabel, { color: colors.accent }]}>{t('split.addPaymentMethod')}</Text>
              </Pressable>
            </View>

            <Text style={styles.sectionHeader}>{t('split.members')}</Text>
            <View style={styles.cardShadowWrap}>
              <View style={styles.fieldCard}>
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
        </View>
        </KeyboardAvoidingView>
      </View>

      <CurrencyPicker
        visible={currencyOpen}
        value={currency}
        onSelect={(code) => {
          setCurrency(code);
          setCurrencyOpen(false);
        }}
        onClose={() => setCurrencyOpen(false)}
      />
      <IconPickerSheet
        visible={iconPickerOpen}
        value={icon}
        onSelect={setIcon}
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
    </Modal>
  );
}

const createStyles = (colors) =>
  StyleSheet.create({
    root: {
      flex: 1,
    },
    center: {
      flex: 1,
      alignItems: 'center',
      justifyContent: 'center',
      padding: spacing.lg,
    },
    backdrop: {
      backgroundColor: colors.backdrop,
    },
    card: {
      width: '100%',
      maxWidth: 440,
      maxHeight: '88%',
      backgroundColor: colors.background,
      borderRadius: radius.lg,
      paddingHorizontal: spacing.lg,
      paddingTop: spacing.md,
      paddingBottom: spacing.md,
      shadowColor: '#000',
      shadowOffset: { width: 0, height: 4 },
      shadowOpacity: 0.25,
      shadowRadius: 16,
      elevation: 8,
    },
    scrollContent: {
      paddingBottom: spacing.sm,
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
      backgroundColor: colors.cardPressed,
      alignItems: 'center',
      justifyContent: 'center',
    },
    closeButtonPressed: {
      opacity: 0.6,
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
    sectionHeaderInline: {
      color: colors.textSecondary,
      fontFamily: fonts.bold,
      fontSize: 13,
      textTransform: 'uppercase',
      letterSpacing: 1.2,
    },
    // Shadow on a wrapper without overflow; inner card clips rows. (overflow +
    // shadow on one node suppresses the iOS drop shadow — see GroupDetailScreen.)
    cardShadowWrap: {
      borderRadius: radius.md,
      ...panelShadow,
    },
    fieldCard: {
      backgroundColor: colors.card,
      borderRadius: radius.md,
      overflow: 'hidden',
    },
    nameRow: {
      flexDirection: 'row',
      alignItems: 'center',
      gap: spacing.sm,
    },
    nameCard: {
      flex: 1,
    },
    iconButton: {
      width: 52,
      height: 52,
      borderRadius: radius.md,
      alignItems: 'center',
      justifyContent: 'center',
    },
    iconButtonPressed: {
      opacity: 0.6,
    },
    nameInput: {
      color: colors.textPrimary,
      fontFamily: fonts.regular,
      fontSize: 16,
      paddingHorizontal: spacing.md,
      paddingVertical: spacing.sm + 4,
    },
    payHeaderRow: {
      flexDirection: 'row',
      justifyContent: 'space-between',
      alignItems: 'center',
      marginTop: spacing.md,
      marginBottom: spacing.sm,
    },
    chipRow: {
      flexDirection: 'row',
      flexWrap: 'wrap',
      gap: spacing.sm,
    },
    chip: {
      flexDirection: 'row',
      alignItems: 'center',
      gap: spacing.xs,
      borderWidth: 1,
      borderColor: colors.border,
      borderRadius: radius.md,
      paddingHorizontal: spacing.md,
      paddingVertical: spacing.sm,
      backgroundColor: colors.card,
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
    chipAdd: {
      borderStyle: 'dashed',
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
