import { useCallback, useMemo, useRef, useState } from 'react';
import {
  Animated,
  Keyboard,
  Pressable,
  ScrollView,
  StyleSheet,
  Text,
  TextInput,
  useWindowDimensions,
  View,
} from 'react-native';
import { fonts, spacing, radius, useTheme } from '../theme';
import { useT } from '../i18n';
import { getCategory, getCategoryLabel } from '../categories';
import { HIcon } from '../icons';
import { getCurrency } from '../currency';
import { dateKey, isValidAmountText, cleanAmountInput } from '../format';
import CalendarField, { dateForOffset, offsetForDay } from '../components/CalendarField';
import EntryModeToggle from '../components/EntryModeToggle';
import CurrencyPill from '../components/CurrencyPill';
import CurrencyPicker from '../components/CurrencyPicker';
import { popupChromeStyles } from '../components/popupFormChrome';
import { confirmDestructive } from '../confirm';

const NOTE_MAX_LENGTH = 80;
const AMOUNT_MAX_LENGTH = 12;
const COLOR_MS = 350;
const CATS_PER_PAGE = 8;

// The Personal side of the add popup: add or edit an expense (the Shared side is
// SharedSplitForm). Rendered inside AddExpenseModal. A paginated category grid,
// a calendar date picker, a tappable currency pill (opens CurrencyPicker), amount
// + note. The
// card's border/background tint animate to the selected category color. When
// `onChangeEntryMode` is provided (the add popup, not the edit popup) the header
// shows the Personal/Shared toggle; in edit mode it shows the title + a Delete.
export default function AddEntryScreen({
  entryMode,
  onChangeEntryMode,
  displayCurrency,
  categories,
  editEntry,
  onSubmit,
  onDelete,
  onClose,
}) {
  const { colors } = useTheme();
  const t = useT();
  const styles = useMemo(() => createStyles(colors), [colors]);

  const isEdit = editEntry != null;

  const selectorItems = categories ?? [];
  const firstId = selectorItems[0]?.id ?? null;
  const colorOf = useCallback((id) => getCategory(id, categories).color, [categories]);
  const initSelected = isEdit ? editEntry.category : firstId;

  const { width: screenWidth } = useWindowDimensions();
  const catPageWidth = screenWidth - spacing.lg * 4;
  const catItemWidth = catPageWidth / 4;

  const categoryPages = useMemo(() => {
    const pages = [];
    for (let i = 0; i < selectorItems.length; i += CATS_PER_PAGE) {
      pages.push(selectorItems.slice(i, i + CATS_PER_PAGE));
    }
    return pages;
  }, [selectorItems]);

  const [catPage, setCatPage] = useState(0);
  const onCatScroll = useCallback((e) => {
    setCatPage(Math.round(e.nativeEvent.contentOffset.x / catPageWidth));
  }, [catPageWidth]);

  const [amountText, setAmountText] = useState(() => {
    if (!isEdit) return '';
    const dec = getCurrency(editEntry.currency ?? displayCurrency).decimals;
    return dec === 0 ? String(Math.round(editEntry.amount)) : editEntry.amount.toFixed(dec);
  });
  const [note, setNote] = useState(isEdit ? (editEntry.note || '') : '');
  const [selectedId, setSelectedId] = useState(initSelected);
  const [manualCurrency, setManualCurrency] = useState(isEdit ? editEntry.currency : null);
  const [dayOffset, setDayOffset] = useState(() => {
    if (!isEdit) return 0;
    const d = new Date(editEntry.createdAt);
    return offsetForDay(d.getFullYear(), d.getMonth(), d.getDate());
  });
  const [currencyOpen, setCurrencyOpen] = useState(false);
  // Color transitions interpolate from the previously shown color to the newly
  // picked one; colors can't animate on the native driver.
  const colorAnim = useRef(new Animated.Value(1)).current;
  const colorFrom = useRef(colorOf(initSelected));
  const colorTo = useRef(colorOf(initSelected));

  const currencyCode = manualCurrency ?? displayCurrency;
  const currency = getCurrency(currencyCode);

  // Strict shape check before parseFloat: bare parseFloat accepts '1.2.3' as 1.2
  // and would silently save a different amount than the user sees.
  // 0-decimal currencies (JPY, TWD) only accept whole numbers.
  const normalized = amountText.replace(',', '.');
  const amount = parseFloat(normalized);
  const isValid = isValidAmountText(normalized, currency.decimals) && amount > 0;

  const reset = () => {
    setAmountText('');
    setNote('');
    setSelectedId(firstId);
    setManualCurrency(null);
    setDayOffset(0);
    colorFrom.current = colorOf(firstId);
    colorTo.current = colorOf(firstId);
    colorAnim.setValue(1);
  };

  const handleSubmit = () => {
    if (!isValid) return;
    const factor = 10 ** currency.decimals;
    let createdAt;
    if (isEdit) {
      const newDay = dateKey(dateForOffset(dayOffset).getTime());
      const originalDay = dateKey(editEntry.createdAt);
      createdAt = newDay === originalDay ? editEntry.createdAt : dateForOffset(dayOffset).getTime();
    } else {
      createdAt = dayOffset === 0 ? Date.now() : dateForOffset(dayOffset).getTime();
    }
    const data = {
      amount: Math.round(amount * factor) / factor,
      currency: currencyCode,
      note: note.trim(),
      category: selectedId,
      createdAt,
    };
    if (isEdit) data.id = editEntry.id;
    onSubmit(data);
    if (!isEdit) reset();
    Keyboard.dismiss();
  };

  const handleDelete = async () => {
    if (!isEdit) return;
    const ok = await confirmDestructive({
      title: t('edit.delete'),
      body: t('edit.deleteConfirm'),
      confirmLabel: t('common.delete'),
      cancelLabel: t('common.cancel'),
    });
    if (ok) onDelete(editEntry.id);
  };

  const pickSelector = (id) => {
    if (id === selectedId) return;
    colorFrom.current = colorTo.current;
    colorTo.current = colorOf(id);
    setSelectedId(id);
    colorAnim.setValue(0);
    Animated.timing(colorAnim, { toValue: 1, duration: COLOR_MS, useNativeDriver: false }).start();
  };

  const cardBorderColor = colorAnim.interpolate({
    inputRange: [0, 1],
    outputRange: [colorFrom.current, colorTo.current],
  });
  const cardTintColor = colorAnim.interpolate({
    inputRange: [0, 1],
    outputRange: [`${colorFrom.current}1F`, `${colorTo.current}1F`],
  });

  return (
    <Animated.View style={[styles.card, { borderColor: cardBorderColor }]}>
      <Animated.View
        pointerEvents="none"
        style={[StyleSheet.absoluteFill, { backgroundColor: cardTintColor }]}
      />
      <ScrollView
        style={styles.scroll}
        contentContainerStyle={styles.scrollContent}
        keyboardShouldPersistTaps="handled"
      >
        <View style={styles.header}>
          <View style={styles.headerSide} />
          <View style={styles.headerCenter}>
            {onChangeEntryMode ? (
              <EntryModeToggle value={entryMode} onChange={onChangeEntryMode} />
            ) : (
              <Text style={styles.title}>{t('edit.title')}</Text>
            )}
          </View>
          <Pressable
            onPress={onClose}
            hitSlop={8}
            accessibilityRole="button"
            accessibilityLabel={t('common.close')}
            style={({ pressed }) => [styles.closeButton, pressed && styles.chipPressed]}
          >
            <HIcon name="cancel-01" size={20} color={colors.icon} />
          </Pressable>
        </View>

        <CalendarField dayOffset={dayOffset} onChange={setDayOffset} />

        <View style={styles.amountArea}>
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
              placeholder={currency.decimals === 0 ? '0' : '0.00'}
              placeholderTextColor={colors.textMuted}
              keyboardType={currency.decimals === 0 ? 'number-pad' : 'decimal-pad'}
              keyboardAppearance={colors.keyboardAppearance}
              maxLength={AMOUNT_MAX_LENGTH}
              accessibilityLabel={t('add.amountLabel')}
            />
            {/* Empty spacer balancing the 72px currency pill so the amount
                stays optically centered. */}
            <View style={styles.amountSpacer} />
          </View>
        </View>

        <View style={styles.noteRow}>
          <TextInput
            style={styles.noteInput}
            value={note}
            onChangeText={setNote}
            placeholder={t('add.notePlaceholder')}
            placeholderTextColor={colors.textMuted}
            maxLength={NOTE_MAX_LENGTH}
            keyboardAppearance={colors.keyboardAppearance}
            returnKeyType="done"
            onSubmitEditing={handleSubmit}
          />
          <Text style={styles.noteCounter}>{note.length}/{NOTE_MAX_LENGTH}</Text>
        </View>

        <View style={styles.categoryScroll}>
          <ScrollView
            horizontal
            pagingEnabled
            showsHorizontalScrollIndicator={false}
            keyboardShouldPersistTaps="handled"
            onScroll={onCatScroll}
            scrollEventThrottle={16}
            decelerationRate="fast"
          >
            {categoryPages.map((pageCats, pi) => (
              <View key={pi} style={{ width: catPageWidth }}>
                {[pageCats.slice(0, Math.ceil(pageCats.length / 2)),
                  pageCats.slice(Math.ceil(pageCats.length / 2))].map((row, ri) => (
                  <View key={ri} style={styles.categoryRow}>
                    {row.map((category) => {
                      const selected = category.id === selectedId;
                      return (
                        <Pressable
                          key={category.id}
                          onPress={() => pickSelector(category.id)}
                          accessibilityRole="button"
                          accessibilityState={{ selected }}
                          style={[styles.categoryItem, { width: catItemWidth }]}
                        >
                          <View
                            style={[
                              styles.categoryCircle,
                              { backgroundColor: `${category.color}1A` },
                              selected && {
                                backgroundColor: `${category.color}33`,
                                borderColor: category.color,
                              },
                            ]}
                          >
                            <HIcon name={category.emoji} size={22} color={category.color} />
                          </View>
                          <Text
                            style={[
                              styles.categoryLabel,
                              selected && styles.categoryLabelSelected,
                            ]}
                            numberOfLines={1}
                          >
                            {getCategoryLabel(category, t)}
                          </Text>
                        </Pressable>
                      );
                    })}
                  </View>
                ))}
              </View>
            ))}
          </ScrollView>
          {categoryPages.length > 1 && (
            <View style={styles.pageDots}>
              {categoryPages.map((_, i) => (
                <View
                  key={i}
                  style={[
                    styles.pageDot,
                    i === catPage && { backgroundColor: colors.textPrimary },
                  ]}
                />
              ))}
            </View>
          )}
        </View>

        <Pressable
          onPress={handleSubmit}
          disabled={!isValid}
          accessibilityRole="button"
          accessibilityState={{ disabled: !isValid }}
          style={({ pressed }) => [
            styles.saveButton,
            { backgroundColor: colors.accent },
            !isValid && styles.saveButtonDisabled,
            pressed && isValid && styles.saveButtonPressed,
          ]}
        >
          <Text style={styles.saveButtonText}>{t(isEdit ? 'edit.save' : 'add.save')}</Text>
        </Pressable>

        {isEdit && (
          <Pressable
            onPress={handleDelete}
            accessibilityRole="button"
            style={({ pressed }) => [styles.deleteButton, pressed && styles.chipPressed]}
          >
            <Text style={styles.deleteButtonText}>{t('edit.delete')}</Text>
          </Pressable>
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
    </Animated.View>
  );
}

const createStyles = (colors) =>
  StyleSheet.create({
    ...popupChromeStyles(colors),
    amountArea: {
      marginBottom: spacing.sm,
    },
    amountRow: {
      flexDirection: 'row',
      alignItems: 'center',
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
      fontSize: 40,
      textAlign: 'center',
      fontVariant: ['tabular-nums'],
    },
    amountSpacer: {
      width: 72,
      flexShrink: 0,
    },
    chipPressed: {
      backgroundColor: colors.cardPressed,
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
    noteCounter: {
      color: colors.textMuted,
      fontFamily: fonts.regular,
      fontSize: 12,
      marginLeft: spacing.sm,
    },
    categoryScroll: {
      marginBottom: spacing.md,
    },
    pageDots: {
      flexDirection: 'row',
      justifyContent: 'center',
      gap: 6,
      paddingTop: spacing.xs,
    },
    pageDot: {
      width: 6,
      height: 6,
      borderRadius: 3,
      backgroundColor: colors.border,
    },
    categoryRow: {
      flexDirection: 'row',
    },
    categoryItem: {
      alignItems: 'center',
      paddingVertical: spacing.sm,
    },
    categoryCircle: {
      width: 52,
      height: 52,
      borderRadius: 26,
      alignItems: 'center',
      justifyContent: 'center',
      borderWidth: 2.5,
      borderColor: 'transparent',
    },
    categoryLabel: {
      color: colors.textSecondary,
      fontFamily: fonts.bold,
      fontSize: 12,
      marginTop: spacing.xs,
      textAlign: 'center',
    },
    categoryLabelSelected: {
      color: colors.textPrimary,
    },
    saveButton: {
      borderRadius: radius.md,
      paddingVertical: spacing.md,
      alignItems: 'center',
    },
    saveButtonPressed: {
      opacity: 0.85,
    },
    saveButtonDisabled: {
      opacity: 0.4,
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
