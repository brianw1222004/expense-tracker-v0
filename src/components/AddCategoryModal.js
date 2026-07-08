import { useCallback, useEffect, useMemo, useRef, useState } from 'react';
import { Modal, PanResponder, Pressable, ScrollView, StyleSheet, Switch, Text, TextInput, View } from 'react-native';
import Svg, { Circle, Defs, LinearGradient as SvgLinearGradient, Stop, Rect } from 'react-native-svg';
import { fonts, spacing, radius } from '../theme';
import { EMOJI_OPTIONS, COLOR_OPTIONS, generateCategoryId } from '../categories';
import { HIcon } from '../icons';

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

// The add/edit-custom-category modal (name, paginated icon grid, preset colors
// plus a hue-slider custom color, external switch). Formerly nested inside
// CategoryBreakdownScreen; now opened from the Insight page's Categories card.
export default function AddCategoryModal({ visible, editingCategory, onClose, onSave, onDelete, colors, t }) {
  const styles = useMemo(() => createModalStyles(colors), [colors]);
  const isEdit = editingCategory != null;
  const [name, setName] = useState('');
  const [emoji, setEmoji] = useState(EMOJI_OPTIONS[0]);
  const [color, setColor] = useState(COLOR_OPTIONS[0]);
  const [external, setExternal] = useState(false);
  const [initialized, setInitialized] = useState(false);
  const [iconPage, setIconPage] = useState(0);
  const [iconGridWidth, setIconGridWidth] = useState(0);
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
        setName(editingCategory.label);
        setEmoji(editingCategory.emoji);
        setColor(editingCategory.color);
        setExternal(editingCategory.external);
        const isPreset = COLOR_OPTIONS.includes(editingCategory.color);
        setCustomColorActive(!isPreset);
      } else {
        setName('');
        setEmoji(EMOJI_OPTIONS[0]);
        setColor(COLOR_OPTIONS[0]);
        setExternal(false);
        setCustomColorActive(false);
      }
      setHue(0);
      setIconPage(0);
      setInitialized(true);
    }
    if (!visible && initialized) {
      setInitialized(false);
    }
  }, [visible, editingCategory]);

  const ICONS_PER_PAGE = 14;
  const iconPages = useMemo(() => {
    const pages = [];
    for (let i = 0; i < EMOJI_OPTIONS.length; i += ICONS_PER_PAGE) {
      pages.push(EMOJI_OPTIONS.slice(i, i + ICONS_PER_PAGE));
    }
    return pages;
  }, []);

  const onIconScroll = useCallback((e) => {
    const x = e.nativeEvent.contentOffset.x;
    const w = e.nativeEvent.layoutMeasurement.width;
    if (w > 0) setIconPage(Math.round(x / w));
  }, []);

  const onIconGridLayout = useCallback((e) => {
    setIconGridWidth(e.nativeEvent.layout.width);
  }, []);

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

  const canSave = name.trim().length > 0;

  const handleSave = () => {
    if (!canSave) return;
    const cat = {
      id: isEdit ? editingCategory.id : generateCategoryId(),
      label: name.trim(),
      emoji,
      color,
      external,
      custom: true,
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
            <Pressable
              onPress={onClose}
              hitSlop={8}
              accessibilityRole="button"
              style={({ pressed }) => [styles.closeBtn, pressed && styles.closeBtnPressed]}
            >
              <HIcon name="cancel-01" size={18} color={colors.icon} />
            </Pressable>
          </View>

          <ScrollView keyboardShouldPersistTaps="handled" showsVerticalScrollIndicator={false}>
            <Text style={styles.label}>{t('cats.categoryName')}</Text>
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

            <Text style={styles.label}>{t('cats.pickIcon')}</Text>
            <View onLayout={onIconGridLayout} style={styles.iconGridWrapper}>
              {iconGridWidth > 0 && (
                <ScrollView
                  horizontal
                  pagingEnabled
                  showsHorizontalScrollIndicator={false}
                  onScroll={onIconScroll}
                  scrollEventThrottle={16}
                >
                  {iconPages.map((page, pi) => (
                    <View key={pi} style={[styles.grid, { width: iconGridWidth }]}>
                      {page.map((e) => (
                        <Pressable
                          key={e}
                          onPress={() => setEmoji(e)}
                          style={[styles.gridCell, emoji === e && { backgroundColor: `${color}33`, borderColor: color }]}
                        >
                          <HIcon name={e} size={22} color={emoji === e ? color : colors.icon} />
                        </Pressable>
                      ))}
                    </View>
                  ))}
                </ScrollView>
              )}
            </View>
            {iconPages.length > 1 && (
              <View style={styles.iconPageDots}>
                {iconPages.map((_, i) => (
                  <View
                    key={i}
                    style={[
                      styles.iconPageDot,
                      { backgroundColor: i === iconPage ? colors.accent : colors.border },
                    ]}
                  />
                ))}
              </View>
            )}

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
              <Switch
                value={external}
                onValueChange={setExternal}
                trackColor={{ false: colors.border, true: colors.accent }}
                thumbColor={colors.onAccent}
              />
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

            {isEdit && (
              <Pressable
                onPress={onDelete}
                accessibilityRole="button"
                style={({ pressed }) => [styles.deleteBtn, pressed && styles.deleteBtnPressed]}
              >
                <Text style={styles.deleteBtnText}>{t('common.delete')}</Text>
              </Pressable>
            )}
          </ScrollView>
        </View>
      </View>
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
    label: {
      color: colors.textSecondary,
      fontFamily: fonts.bold,
      fontSize: 12,
      textTransform: 'uppercase',
      letterSpacing: 0.8,
      marginBottom: spacing.sm,
      marginTop: spacing.sm,
    },
    nameInput: {
      backgroundColor: colors.card,
      color: colors.textPrimary,
      borderRadius: radius.sm,
      paddingHorizontal: spacing.md,
      paddingVertical: spacing.sm + 4,
      fontFamily: fonts.regular,
      fontSize: 15,
      marginBottom: spacing.xs,
    },
    iconGridWrapper: {
      marginBottom: spacing.xs,
    },
    grid: {
      flexDirection: 'row',
      flexWrap: 'wrap',
      gap: spacing.xs + 2,
      marginBottom: spacing.xs,
    },
    iconPageDots: {
      flexDirection: 'row',
      justifyContent: 'center',
      gap: spacing.xs + 2,
      marginBottom: spacing.xs,
    },
    iconPageDot: {
      width: 6,
      height: 6,
      borderRadius: 3,
    },
    gridCell: {
      width: 40,
      height: 40,
      borderRadius: 10,
      alignItems: 'center',
      justifyContent: 'center',
      backgroundColor: colors.card,
      borderWidth: 1.5,
      borderColor: 'transparent',
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
    deleteBtn: {
      alignItems: 'center',
      paddingVertical: spacing.sm + 4,
      marginTop: spacing.sm,
    },
    deleteBtnPressed: { opacity: 0.6 },
    deleteBtnText: {
      color: colors.danger,
      fontFamily: fonts.bold,
      fontSize: 14,
    },
  });
