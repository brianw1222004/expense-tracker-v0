import { useEffect, useMemo, useRef, useState } from 'react';
import { Modal, PanResponder, Pressable, ScrollView, StyleSheet, Text, TextInput, View } from 'react-native';
import Svg, { Circle, Defs, LinearGradient as SvgLinearGradient, Stop, Rect } from 'react-native-svg';
import { fonts, spacing, radius } from '../theme';
import { EMOJI_OPTIONS, COLOR_OPTIONS, generateCategoryId, getCategoryLabel } from '../categories';
import { formatMoney, cleanAmountInput } from '../format';
import { HIcon } from '../icons';
import IconPickerSheet from './IconPickerSheet';
import ToggleSwitch from './ToggleSwitch';

function hslToHex(h, s, l) {
  s /= 100; l /= 100;
  const a = s * Math.min(l, 1 - l);
  const f = n => { const k = (n + h / 30) % 12; return l - a * Math.max(-1, Math.min(k - 3, 9 - k, 1)); };
  return '#' + [f(0), f(8), f(4)].map(x => Math.round(x * 255).toString(16).padStart(2, '0')).join('');
}

const HUE_STOPS = [
  { offset: '0%', color: '#ff0000' },
  { offset: '16.67%', color: '#ffff00' },
  { offset: '33.33%', color: '#00ff00' },
  { offset: '50%', color: '#00ffff' },
  { offset: '66.67%', color: '#0000ff' },
  { offset: '83.33%', color: '#ff00ff' },
  { offset: '100%', color: '#ff0000' },
];

// The add/edit-category modal (name with a tappable icon avatar that opens the
// shared IconPickerSheet, monthly budget, preset colors plus a hue-slider
// custom color, external switch).
// Formerly nested inside CategoryBreakdownScreen; now opened from the Insight
// page's Categories card for BOTH preset and custom categories. Creating a
// category REQUIRES a budget: at least 5% of the overall monthly budget (any
// positive amount when no overall budget is set), so every new tile has a
// spending-vs-budget bar; when editing, the budget may stay empty.
export default function AddCategoryModal({
  visible,
  editingCategory,
  initialBudget = 0,
  displayCurrency,
  monthlyBudget = 0,
  onClose,
  onSave,
  onDelete,
  colors,
  t,
}) {
  const styles = useMemo(() => createModalStyles(colors), [colors]);
  const isEdit = editingCategory != null;
  const [name, setName] = useState('');
  const [budgetText, setBudgetText] = useState('');
  const [emoji, setEmoji] = useState(EMOJI_OPTIONS[0]);
  const [color, setColor] = useState(COLOR_OPTIONS[0]);
  const [external, setExternal] = useState(false);
  const [initialized, setInitialized] = useState(false);
  const [iconPickerOpen, setIconPickerOpen] = useState(false);
  const [customColorActive, setCustomColorActive] = useState(false);
  const [hue, setHue] = useState(0);
  const sliderWidth = useRef(0);
  const customHexColor = useMemo(() => hslToHex(hue, 80, 50), [hue]);

  // Reset the form each time the modal opens. The `initialized` latch keys off
  // `visible`, which always cycles between opens, so reading
  // `initialized`/`isEdit`/`editingCategory` here without listing them as deps
  // is safe — every reopen re-runs the init branch.
  useEffect(() => {
    if (visible && !initialized) {
      if (isEdit) {
        setName(getCategoryLabel(editingCategory, t));
        setBudgetText(initialBudget > 0 ? String(initialBudget) : '');
        setEmoji(editingCategory.emoji);
        setColor(editingCategory.color);
        setExternal(editingCategory.external);
        const isPreset = COLOR_OPTIONS.includes(editingCategory.color);
        setCustomColorActive(!isPreset);
      } else {
        setName('');
        setBudgetText('');
        setEmoji(EMOJI_OPTIONS[0]);
        setColor(COLOR_OPTIONS[0]);
        setExternal(false);
        setCustomColorActive(false);
      }
      setHue(0);
      setIconPickerOpen(false);
      setInitialized(true);
    }
    if (!visible && initialized) {
      setInitialized(false);
    }
  }, [visible, editingCategory]);

  const huePanResponder = useMemo(() => PanResponder.create({
    onStartShouldSetPanResponder: () => true,
    onMoveShouldSetPanResponder: () => true,
    onPanResponderGrant: (e) => {
      const x = e.nativeEvent.locationX;
      const w = sliderWidth.current;
      if (w > 0) {
        const newHue = Math.max(0, Math.min(360, (x / w) * 360));
        setHue(newHue);
        setColor(hslToHex(newHue, 80, 50));
      }
    },
    onPanResponderMove: (e) => {
      const x = e.nativeEvent.locationX;
      const w = sliderWidth.current;
      if (w > 0) {
        const newHue = Math.max(0, Math.min(360, (x / w) * 360));
        setHue(newHue);
        setColor(hslToHex(newHue, 80, 50));
      }
    },
  }), []);

  // A budget is required when creating (minimum 5% of the overall monthly
  // budget; any positive amount when no overall budget is set). When editing,
  // an empty field is also fine — presets start without a budget, and a
  // rename/recolor shouldn't force one.
  const minBudget = monthlyBudget > 0 ? monthlyBudget * 0.05 : 0;
  const budgetValue = parseFloat(budgetText.replace(',', '.')) || 0;
  const budgetOk = budgetValue > 0 && budgetValue >= minBudget;
  const budgetInvalid = budgetText.length > 0 && !budgetOk;
  const canSave = name.trim().length > 0 && (budgetOk || (isEdit && budgetText.length === 0));

  const handleSave = () => {
    if (!canSave) return;
    const cat = {
      id: isEdit ? editingCategory.id : generateCategoryId(),
      label: name.trim(),
      emoji,
      color,
      external,
      custom: true,
      budget: budgetValue,
    };
    if (isEdit) cat._editing = true;
    onSave(cat);
  };

  return (
    <Modal visible={visible} transparent animationType="fade" onRequestClose={onClose}>
      <Pressable style={[StyleSheet.absoluteFill, styles.backdrop]} onPress={onClose} />
      <View style={styles.center} pointerEvents="box-none">
        <View style={styles.card}>
          <View style={styles.header}>
            <Text style={styles.headerTitle}>
              {t(isEdit ? 'cats.editCategory' : 'cats.addCategory')}
            </Text>
            <View style={styles.headerBtns}>
              {isEdit && (
                <Pressable
                  onPress={onDelete}
                  hitSlop={8}
                  accessibilityRole="button"
                  accessibilityLabel={t('common.delete')}
                  style={({ pressed }) => [styles.deleteBtn, pressed && styles.deleteBtnPressed]}
                >
                  <HIcon name="delete-02" size={17} color={colors.danger} />
                </Pressable>
              )}
              <Pressable
                onPress={onClose}
                hitSlop={8}
                accessibilityRole="button"
                style={({ pressed }) => [styles.closeBtn, pressed && styles.closeBtnPressed]}
              >
                <HIcon name="cancel-01" size={18} color={colors.icon} />
              </Pressable>
            </View>
          </View>

          <ScrollView keyboardShouldPersistTaps="handled" showsVerticalScrollIndicator={false}>
            <Text style={styles.label}>{t('cats.categoryName')}</Text>
            {/* The avatar circle doubles as the icon picker (the group-screen
                pattern): tap it to open the shared IconPickerSheet. */}
            <View style={styles.nameRow}>
              <Pressable
                onPress={() => setIconPickerOpen(true)}
                accessibilityRole="button"
                accessibilityLabel={t('split.changeIcon')}
                style={({ pressed }) => [
                  styles.iconCircle,
                  { backgroundColor: `${color}26` },
                  pressed && styles.iconCirclePressed,
                ]}
              >
                <HIcon name={emoji} size={24} color={color} />
              </Pressable>
              <TextInput
                style={styles.nameInput}
                value={name}
                onChangeText={setName}
                placeholder={t('cats.categoryName')}
                placeholderTextColor={colors.textMuted}
                maxLength={20}
                keyboardAppearance={colors.keyboardAppearance}
                autoFocus={!isEdit}
              />
            </View>

            <Text style={styles.label}>{t('cats.budgetLabel')}</Text>
            <View style={[styles.budgetRow, budgetInvalid && { borderColor: colors.danger }]}>
              <TextInput
                style={styles.budgetInput}
                value={budgetText}
                onChangeText={(v) => setBudgetText(cleanAmountInput(v))}
                placeholder="0"
                placeholderTextColor={colors.textMuted}
                keyboardType="decimal-pad"
                keyboardAppearance={colors.keyboardAppearance}
                maxLength={12}
              />
              <Text style={styles.budgetCurrency}>{displayCurrency}</Text>
            </View>
            <Text style={[styles.budgetHint, budgetInvalid && { color: colors.danger }]}>
              {minBudget > 0
                ? t('cats.budgetMinHint', { amount: formatMoney(minBudget, displayCurrency) })
                : t('cats.budgetAnyHint')}
            </Text>

            <Text style={styles.label}>{t('cats.pickColor')}</Text>
            <View style={styles.grid}>
              {/* Custom color picker cell */}
              <Pressable
                onPress={() => {
                  setCustomColorActive((prev) => {
                    if (!prev) {
                      setColor(customHexColor);
                    }
                    return !prev;
                  });
                }}
                style={[
                  styles.colorCell,
                  customColorActive
                    ? [{ backgroundColor: customHexColor }, styles.colorCellSelected]
                    : styles.customColorCellRainbow,
                ]}
              >
                {!customColorActive && (
                  <Svg width={28} height={28} viewBox="0 0 28 28">
                    <Defs>
                      <SvgLinearGradient id="rainbowGrad" x1="0" y1="0" x2="1" y2="1">
                        {HUE_STOPS.map((s, i) => (
                          <Stop key={i} offset={s.offset} stopColor={s.color} />
                        ))}
                      </SvgLinearGradient>
                    </Defs>
                    <Circle cx="14" cy="14" r="12" fill="url(#rainbowGrad)" />
                  </Svg>
                )}
              </Pressable>

              {/* Preset color cells */}
              {COLOR_OPTIONS.map((c) => (
                <Pressable
                  key={c}
                  onPress={() => {
                    setCustomColorActive(false);
                    setColor(c);
                  }}
                  style={[styles.colorCell, { backgroundColor: c }, !customColorActive && color === c && styles.colorCellSelected]}
                />
              ))}
            </View>

            {/* Hue slider (visible when custom color is active) */}
            {customColorActive && (
              <View style={styles.hueSliderContainer}>
                <View
                  style={styles.hueSliderTrack}
                  onLayout={(e) => { sliderWidth.current = e.nativeEvent.layout.width; }}
                  {...huePanResponder.panHandlers}
                >
                  <Svg width="100%" height={24} style={styles.hueSliderSvg}>
                    <Defs>
                      <SvgLinearGradient id="hueBarGrad" x1="0" y1="0" x2="1" y2="0">
                        {HUE_STOPS.map((s, i) => (
                          <Stop key={i} offset={s.offset} stopColor={s.color} />
                        ))}
                      </SvgLinearGradient>
                    </Defs>
                    <Rect x="0" y="0" width="100%" height="24" rx="12" fill="url(#hueBarGrad)" />
                  </Svg>
                  <View
                    style={[
                      styles.hueThumb,
                      {
                        left: `${(hue / 360) * 100}%`,
                        backgroundColor: customHexColor,
                      },
                    ]}
                  />
                </View>
              </View>
            )}

            <View style={styles.switchRow}>
              <View style={styles.switchLabel}>
                <Text style={styles.switchText}>{t('cats.external')}</Text>
                <Text style={styles.switchHint}>{t('cats.externalHint')}</Text>
              </View>
              <ToggleSwitch value={external} onValueChange={setExternal} />
            </View>

            <Pressable
              onPress={handleSave}
              disabled={!canSave}
              style={({ pressed }) => [
                styles.saveBtn,
                !canSave && styles.saveBtnDisabled,
                pressed && canSave && styles.saveBtnPressed,
              ]}
            >
              <Text style={styles.saveBtnText}>{t('cats.save')}</Text>
            </Pressable>
          </ScrollView>
        </View>
      </View>

      <IconPickerSheet
        visible={iconPickerOpen}
        icons={EMOJI_OPTIONS}
        value={emoji}
        onSelect={setEmoji}
        onClose={() => setIconPickerOpen(false)}
      />
    </Modal>
  );
}

const createModalStyles = (colors) =>
  StyleSheet.create({
    backdrop: { backgroundColor: colors.backdrop },
    center: {
      flex: 1,
      justifyContent: 'center',
      alignItems: 'center',
      paddingHorizontal: spacing.md,
    },
    card: {
      backgroundColor: colors.background,
      borderRadius: radius.lg,
      padding: spacing.lg,
      width: '100%',
      maxWidth: 380,
      maxHeight: '85%',
    },
    header: {
      flexDirection: 'row',
      justifyContent: 'space-between',
      alignItems: 'center',
      marginBottom: spacing.md,
    },
    headerTitle: {
      color: colors.textPrimary,
      fontFamily: fonts.bold,
      fontSize: 18,
    },
    closeBtn: {
      width: 30,
      height: 30,
      borderRadius: 15,
      backgroundColor: colors.card,
      alignItems: 'center',
      justifyContent: 'center',
    },
    closeBtnPressed: { backgroundColor: colors.cardPressed },
    headerBtns: {
      flexDirection: 'row',
      alignItems: 'center',
      gap: spacing.sm,
    },
    // Header trash button (edit mode only) — danger-tinted twin of closeBtn,
    // always visible instead of buried at the bottom of the scroll content.
    deleteBtn: {
      width: 30,
      height: 30,
      borderRadius: 15,
      backgroundColor: `${colors.danger}15`,
      alignItems: 'center',
      justifyContent: 'center',
    },
    deleteBtnPressed: { opacity: 0.6 },
    label: {
      color: colors.textSecondary,
      fontFamily: fonts.bold,
      fontSize: 12,
      letterSpacing: 0.2,
      marginBottom: spacing.sm,
      marginTop: spacing.sm,
    },
    // Name row: the tappable icon avatar (tinted to the chosen color) beside
    // the name input — tapping it opens the IconPickerSheet.
    nameRow: {
      flexDirection: 'row',
      alignItems: 'center',
      gap: spacing.sm,
      marginBottom: spacing.xs,
    },
    iconCircle: {
      width: 46,
      height: 46,
      borderRadius: 23,
      alignItems: 'center',
      justifyContent: 'center',
    },
    iconCirclePressed: {
      opacity: 0.6,
    },
    nameInput: {
      flex: 1,
      backgroundColor: colors.card,
      color: colors.textPrimary,
      borderRadius: radius.sm,
      paddingHorizontal: spacing.md,
      paddingVertical: spacing.sm + 4,
      fontFamily: fonts.regular,
      fontSize: 15,
    },
    // Required monthly budget for the category (min 5% of the overall budget);
    // the row's border turns danger-red while the entered amount is below it.
    budgetRow: {
      flexDirection: 'row',
      alignItems: 'center',
      backgroundColor: colors.card,
      borderRadius: radius.sm,
      borderWidth: 1.5,
      borderColor: 'transparent',
      paddingHorizontal: spacing.md,
    },
    budgetInput: {
      flex: 1,
      color: colors.textPrimary,
      paddingVertical: spacing.sm + 4,
      fontFamily: fonts.numRegular,
      fontSize: 15,
      fontVariant: ['tabular-nums'],
    },
    budgetCurrency: {
      color: colors.textMuted,
      fontFamily: fonts.bold,
      fontSize: 12,
      marginLeft: spacing.sm,
    },
    budgetHint: {
      color: colors.textMuted,
      fontFamily: fonts.regular,
      fontSize: 12,
      marginTop: spacing.xs,
      marginBottom: spacing.xs,
    },
    grid: {
      flexDirection: 'row',
      flexWrap: 'wrap',
      gap: spacing.xs + 2,
      marginBottom: spacing.xs,
    },
    colorCell: {
      width: 32,
      height: 32,
      borderRadius: 16,
      alignItems: 'center',
      justifyContent: 'center',
      borderWidth: 2,
      borderColor: 'transparent',
    },
    colorCellSelected: {
      // Floating accent ring with a small gap (no checkmark) — the modern
      // selection cue. outline adds no layout space so the grid never reflows.
      outlineColor: colors.accent,
      outlineStyle: 'solid',
      outlineWidth: 2,
      outlineOffset: 2,
    },
    customColorCellRainbow: {
      backgroundColor: colors.card,
      borderWidth: 2,
      borderColor: colors.border,
      overflow: 'hidden',
    },
    hueSliderContainer: {
      marginBottom: spacing.sm,
      paddingHorizontal: spacing.xs,
    },
    hueSliderTrack: {
      height: 24,
      borderRadius: 12,
      overflow: 'visible',
      position: 'relative',
    },
    hueSliderSvg: {
      borderRadius: 12,
    },
    hueThumb: {
      position: 'absolute',
      top: -2,
      width: 28,
      height: 28,
      borderRadius: 14,
      marginLeft: -14,
      borderWidth: 3,
      borderColor: '#ffffff',
      elevation: 4,
      shadowColor: '#000',
      shadowOffset: { width: 0, height: 2 },
      shadowOpacity: 0.25,
      shadowRadius: 4,
    },
    switchRow: {
      flexDirection: 'row',
      alignItems: 'center',
      justifyContent: 'space-between',
      marginVertical: spacing.md,
      backgroundColor: colors.card,
      borderRadius: radius.sm,
      padding: spacing.md,
    },
    switchLabel: { flex: 1, marginRight: spacing.md },
    switchText: {
      color: colors.textPrimary,
      fontFamily: fonts.bold,
      fontSize: 14,
    },
    switchHint: {
      color: colors.textMuted,
      fontFamily: fonts.regular,
      fontSize: 12,
      marginTop: 2,
    },
    saveBtn: {
      backgroundColor: colors.accent,
      borderRadius: radius.md,
      paddingVertical: spacing.md,
      alignItems: 'center',
    },
    saveBtnPressed: { backgroundColor: colors.accentDark },
    saveBtnDisabled: { opacity: 0.4 },
    saveBtnText: {
      color: colors.onAccent,
      fontFamily: fonts.bold,
      fontSize: 16,
    },
  });
