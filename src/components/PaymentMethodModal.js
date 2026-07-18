import { useEffect, useMemo, useRef, useState } from 'react';
import { Modal, PanResponder, Pressable, ScrollView, StyleSheet, Text, TextInput, View } from 'react-native';
import Svg, { Circle, Defs, LinearGradient as SvgLinearGradient, Stop, Rect } from 'react-native-svg';
import { fonts, radius, spacing, useTheme } from '../theme';
import { useT } from '../i18n';
import { COLOR_OPTIONS } from '../categories';
import { PAYMENT_ICON_OPTIONS } from '../splits';
import { HIcon } from '../icons';
import IconPickerSheet from './IconPickerSheet';

// HSL→hex + the rainbow stops, mirroring AddCategoryModal's custom-color picker.
function hslToHex(h, s, l) {
  s /= 100; l /= 100;
  const a = s * Math.min(l, 1 - l);
  const f = (n) => {
    const k = (n + h / 30) % 12;
    return l - a * Math.max(-1, Math.min(k - 3, 9 - k, 1));
  };
  return '#' + [f(0), f(8), f(4)].map((x) => Math.round(x * 255).toString(16).padStart(2, '0')).join('');
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

// Add a custom payment method — a name, a hugeicon, and a color (preset swatch or
// custom hue) — mirroring the custom-category editor. Renders as a centered Modal
// (portals above the host sheet). onSave({ label, icon, color }).
export default function PaymentMethodModal({ visible, onSave, onClose }) {
  const { colors } = useTheme();
  const t = useT();
  const styles = useMemo(() => createStyles(colors), [colors]);

  const [name, setName] = useState('');
  const [icon, setIcon] = useState(PAYMENT_ICON_OPTIONS[0]);
  const [color, setColor] = useState(COLOR_OPTIONS[0]);
  const [customColorActive, setCustomColorActive] = useState(false);
  const [hue, setHue] = useState(0);
  const [iconPickerOpen, setIconPickerOpen] = useState(false);
  const sliderWidth = useRef(0);
  const customHexColor = useMemo(() => hslToHex(hue, 80, 50), [hue]);

  useEffect(() => {
    if (visible) {
      setName('');
      setIcon(PAYMENT_ICON_OPTIONS[0]);
      setColor(COLOR_OPTIONS[0]);
      setCustomColorActive(false);
      setHue(0);
      setIconPickerOpen(false);
    }
  }, [visible]);

  const huePanResponder = useMemo(
    () =>
      PanResponder.create({
        onStartShouldSetPanResponder: () => true,
        onMoveShouldSetPanResponder: () => true,
        onPanResponderGrant: (e) => {
          const w = sliderWidth.current;
          if (w > 0) {
            const newHue = Math.max(0, Math.min(360, (e.nativeEvent.locationX / w) * 360));
            setHue(newHue);
            setColor(hslToHex(newHue, 80, 50));
          }
        },
        onPanResponderMove: (e) => {
          const w = sliderWidth.current;
          if (w > 0) {
            const newHue = Math.max(0, Math.min(360, (e.nativeEvent.locationX / w) * 360));
            setHue(newHue);
            setColor(hslToHex(newHue, 80, 50));
          }
        },
      }),
    []
  );

  const canSave = name.trim().length > 0;
  const handleSave = () => {
    if (!canSave) return;
    onSave({ label: name.trim(), icon, color });
  };

  return (
    <Modal visible={visible} transparent animationType="fade" onRequestClose={onClose}>
      <Pressable style={styles.backdrop} onPress={onClose}>
        <Pressable style={styles.card} onPress={() => {}}>
          <View style={styles.titleRow}>
            <Text style={styles.title}>{t('pay.addTitle')}</Text>
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

          <ScrollView keyboardShouldPersistTaps="handled" showsVerticalScrollIndicator={false}>
            {/* Live preview chip */}
            <View style={styles.previewRow}>
              <View style={[styles.previewChip, { backgroundColor: `${color}18`, borderColor: color }]}>
                <HIcon name={icon} size={16} color={color} />
                <Text style={[styles.previewText, { color: colors.textPrimary }]} numberOfLines={1}>
                  {name.trim() || t('split.paymentMethodName')}
                </Text>
              </View>
            </View>

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
                <HIcon name={icon} size={24} color={color} />
              </Pressable>
              <View style={styles.inputWrap}>
                <TextInput
                  style={styles.nameInput}
                  value={name}
                  onChangeText={setName}
                  placeholder={t('pay.namePlaceholder')}
                  placeholderTextColor={colors.textMuted}
                  keyboardAppearance={colors.keyboardAppearance}
                  maxLength={20}
                  autoFocus
                  accessibilityLabel={t('split.paymentMethodName')}
                />
              </View>
            </View>

            <Text style={styles.label}>{t('pay.color')}</Text>
            <View style={styles.grid}>
              <Pressable
                onPress={() =>
                  setCustomColorActive((prev) => {
                    if (!prev) setColor(customHexColor);
                    return !prev;
                  })
                }
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
                      <SvgLinearGradient id="pmRainbow" x1="0" y1="0" x2="1" y2="1">
                        {HUE_STOPS.map((s, i) => (
                          <Stop key={i} offset={s.offset} stopColor={s.color} />
                        ))}
                      </SvgLinearGradient>
                    </Defs>
                    <Circle cx="14" cy="14" r="12" fill="url(#pmRainbow)" />
                  </Svg>
                )}
              </Pressable>

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

            {customColorActive && (
              <View style={styles.hueSliderContainer}>
                <View
                  style={styles.hueSliderTrack}
                  onLayout={(e) => {
                    sliderWidth.current = e.nativeEvent.layout.width;
                  }}
                  {...huePanResponder.panHandlers}
                >
                  <Svg width="100%" height={24}>
                    <Defs>
                      <SvgLinearGradient id="pmHueBar" x1="0" y1="0" x2="1" y2="0">
                        {HUE_STOPS.map((s, i) => (
                          <Stop key={i} offset={s.offset} stopColor={s.color} />
                        ))}
                      </SvgLinearGradient>
                    </Defs>
                    <Rect x="0" y="0" width="100%" height="24" rx="12" fill="url(#pmHueBar)" />
                  </Svg>
                  <View style={[styles.hueThumb, { left: `${(hue / 360) * 100}%`, backgroundColor: customHexColor }]} />
                </View>
              </View>
            )}

            <Pressable
              onPress={handleSave}
              disabled={!canSave}
              accessibilityRole="button"
              accessibilityState={{ disabled: !canSave }}
              style={({ pressed }) => [
                styles.saveButton,
                !canSave && styles.saveButtonDisabled,
                pressed && canSave && styles.saveButtonPressed,
              ]}
            >
              <Text style={styles.saveButtonText}>{t('pay.save')}</Text>
            </Pressable>
          </ScrollView>
        </Pressable>
      </Pressable>

      <IconPickerSheet
        visible={iconPickerOpen}
        icons={PAYMENT_ICON_OPTIONS}
        value={icon}
        onSelect={setIcon}
        onClose={() => setIconPickerOpen(false)}
      />
    </Modal>
  );
}

const createStyles = (colors) =>
  StyleSheet.create({
    backdrop: {
      flex: 1,
      backgroundColor: colors.backdrop,
      justifyContent: 'center',
      alignItems: 'center',
      padding: spacing.lg,
    },
    card: {
      backgroundColor: colors.background,
      borderRadius: radius.lg,
      padding: spacing.lg,
      width: '100%',
      maxWidth: 360,
      maxHeight: '86%',
    },
    titleRow: {
      flexDirection: 'row',
      justifyContent: 'space-between',
      alignItems: 'center',
      marginBottom: spacing.md,
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
    previewRow: {
      alignItems: 'center',
      marginBottom: spacing.md,
    },
    previewChip: {
      flexDirection: 'row',
      alignItems: 'center',
      gap: spacing.xs + 2,
      borderWidth: 1,
      borderRadius: 16,
      paddingHorizontal: spacing.md,
      paddingVertical: spacing.sm,
    },
    previewText: {
      fontFamily: fonts.bold,
      fontSize: 14,
      maxWidth: 180,
    },
    // Name row: the tappable icon avatar (tinted to the chosen color) beside
    // the name input — tapping it opens the IconPickerSheet.
    nameRow: {
      flexDirection: 'row',
      alignItems: 'center',
      gap: spacing.sm,
      marginBottom: spacing.md,
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
    inputWrap: {
      flex: 1,
      backgroundColor: colors.card,
      borderRadius: radius.md,
      paddingHorizontal: spacing.md,
    },
    nameInput: {
      color: colors.textPrimary,
      fontFamily: fonts.regular,
      fontSize: 16,
      paddingVertical: spacing.sm + 4,
    },
    label: {
      color: colors.textSecondary,
      fontFamily: fonts.bold,
      fontSize: 12,
      letterSpacing: 0.2,
      marginBottom: spacing.sm,
    },
    grid: {
      flexDirection: 'row',
      flexWrap: 'wrap',
      gap: spacing.xs + 2,
      marginBottom: spacing.md,
    },
    colorCell: {
      width: 32,
      height: 32,
      borderRadius: 16,
      borderWidth: 2,
      borderColor: 'transparent',
      alignItems: 'center',
      justifyContent: 'center',
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
      borderColor: colors.border,
      overflow: 'hidden',
    },
    hueSliderContainer: {
      marginBottom: spacing.md,
    },
    hueSliderTrack: {
      height: 24,
      justifyContent: 'center',
    },
    hueThumb: {
      position: 'absolute',
      width: 18,
      height: 18,
      borderRadius: 9,
      borderWidth: 2,
      borderColor: '#fff',
      marginLeft: -9,
      shadowColor: '#000',
      shadowOffset: { width: 0, height: 1 },
      shadowOpacity: 0.3,
      shadowRadius: 2,
      elevation: 2,
    },
    saveButton: {
      backgroundColor: colors.accent,
      borderRadius: radius.md,
      paddingVertical: spacing.md,
      alignItems: 'center',
      marginTop: spacing.xs,
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
