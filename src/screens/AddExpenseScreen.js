import { useState } from 'react';
import {
  Keyboard,
  KeyboardAvoidingView,
  Platform,
  Pressable,
  ScrollView,
  StyleSheet,
  Text,
  TextInput,
  View,
} from 'react-native';
import { colors, spacing, radius } from '../theme';
import { CATEGORIES } from '../categories';
import { CURRENCIES, getCurrency } from '../currency';
import { dayLabel } from '../format';

// The chosen day at 12:00 local — keeps the entry safely inside the day even
// across DST shifts, while today keeps the real timestamp (set on submit).
function dateForOffset(offset) {
  const d = new Date();
  d.setDate(d.getDate() + offset);
  d.setHours(12, 0, 0, 0);
  return d;
}

export default function AddExpenseScreen({ displayCurrency, onSubmit }) {
  const [amountText, setAmountText] = useState('');
  const [note, setNote] = useState('');
  const [categoryId, setCategoryId] = useState(CATEGORIES[0].id);
  // null = follow displayCurrency; set once the user picks a chip themselves.
  const [manualCurrency, setManualCurrency] = useState(null);
  const [currencyPickerOpen, setCurrencyPickerOpen] = useState(false);
  // Days back from today; 0 = today, never positive (no future expenses).
  const [dayOffset, setDayOffset] = useState(0);

  const currencyCode = manualCurrency ?? displayCurrency;
  const currency = getCurrency(currencyCode);

  // Strict shape check before parseFloat: bare parseFloat accepts '1.2.3' as 1.2
  // and would silently save a different amount than the user sees.
  // 0-decimal currencies (JPY, TWD) only accept whole numbers.
  const normalized = amountText.replace(',', '.');
  const amount = parseFloat(normalized);
  const pattern = currency.decimals === 0 ? /^\d+$/ : /^(\d+(\.\d{0,2})?|\.\d{1,2})$/;
  const isValid = pattern.test(normalized) && amount > 0;

  const reset = () => {
    setAmountText('');
    setNote('');
    setCategoryId(CATEGORIES[0].id);
    setManualCurrency(null);
    setCurrencyPickerOpen(false);
    setDayOffset(0);
  };

  const handleSubmit = () => {
    if (!isValid) return;
    const factor = 10 ** currency.decimals;
    onSubmit({
      amount: Math.round(amount * factor) / factor,
      currency: currencyCode,
      note: note.trim(),
      category: categoryId,
      createdAt: dayOffset === 0 ? Date.now() : dateForOffset(dayOffset).getTime(),
    });
    reset();
    Keyboard.dismiss();
  };

  const pickCurrency = (code) => {
    setManualCurrency(code);
    setCurrencyPickerOpen(false);
  };

  return (
    <KeyboardAvoidingView
      behavior={Platform.OS === 'ios' ? 'padding' : undefined}
      style={styles.container}
    >
      <ScrollView
        contentContainerStyle={styles.scrollContent}
        keyboardShouldPersistTaps="handled"
      >
        <Text style={styles.title}>Add expense</Text>

        <View style={styles.amountRow}>
          <Text style={styles.currencySymbol}>{currency.symbol}</Text>
          <TextInput
            style={styles.amountInput}
            value={amountText}
            onChangeText={setAmountText}
            placeholder={currency.decimals === 0 ? '0' : '0.00'}
            placeholderTextColor={colors.textMuted}
            keyboardType={currency.decimals === 0 ? 'number-pad' : 'decimal-pad'}
            keyboardAppearance="dark"
            maxLength={9}
          />
          <Pressable
            onPress={() => setCurrencyPickerOpen((open) => !open)}
            hitSlop={8}
            accessibilityRole="button"
            accessibilityLabel={`Currency: ${currencyCode}`}
            accessibilityState={{ expanded: currencyPickerOpen }}
            style={({ pressed }) => [styles.currencyChip, pressed && styles.chipPressed]}
          >
            <Text style={styles.currencyChipText}>
              {currencyCode} {currencyPickerOpen ? '▴' : '▾'}
            </Text>
          </Pressable>
        </View>

        {currencyPickerOpen && (
          <View style={styles.currencyOptions}>
            {CURRENCIES.map((option) => {
              const selected = option.code === currencyCode;
              return (
                <Pressable
                  key={option.code}
                  onPress={() => pickCurrency(option.code)}
                  accessibilityRole="button"
                  accessibilityState={{ selected }}
                  style={({ pressed }) => [
                    styles.currencyOption,
                    selected && styles.currencyOptionSelected,
                    pressed && !selected && styles.chipPressed,
                  ]}
                >
                  <Text
                    style={[
                      styles.currencyOptionText,
                      selected && styles.currencyOptionTextSelected,
                    ]}
                  >
                    {option.code}
                  </Text>
                </Pressable>
              );
            })}
          </View>
        )}

        <TextInput
          style={styles.noteInput}
          value={note}
          onChangeText={setNote}
          placeholder="What was it for?"
          placeholderTextColor={colors.textMuted}
          maxLength={60}
          keyboardAppearance="dark"
          returnKeyType="done"
          onSubmitEditing={handleSubmit}
        />

        <View style={styles.categoryGrid}>
          {CATEGORIES.map((category) => {
            const selected = category.id === categoryId;
            return (
              <Pressable
                key={category.id}
                onPress={() => setCategoryId(category.id)}
                accessibilityRole="button"
                accessibilityState={{ selected }}
                style={({ pressed }) => [
                  styles.categoryChip,
                  selected && { backgroundColor: `${category.color}33`, borderColor: category.color },
                  pressed && !selected && styles.chipPressed,
                ]}
              >
                <Text style={styles.categoryEmoji}>{category.emoji}</Text>
                <Text style={[styles.categoryLabel, selected && { color: colors.textPrimary }]}>
                  {category.label}
                </Text>
              </Pressable>
            );
          })}
        </View>

        <View style={styles.dateRow}>
          <Pressable
            onPress={() => setDayOffset((offset) => offset - 1)}
            hitSlop={8}
            accessibilityLabel="Previous day"
            style={({ pressed }) => [styles.dateArrow, pressed && styles.chipPressed]}
          >
            <Text style={styles.dateArrowText}>{'◀'}</Text>
          </Pressable>
          <Text style={styles.dateLabel}>{dayLabel(dateForOffset(dayOffset).getTime())}</Text>
          <Pressable
            onPress={() => setDayOffset((offset) => Math.min(0, offset + 1))}
            disabled={dayOffset === 0}
            hitSlop={8}
            accessibilityLabel="Next day"
            style={({ pressed }) => [
              styles.dateArrow,
              dayOffset === 0 && styles.dateArrowDisabled,
              pressed && dayOffset !== 0 && styles.chipPressed,
            ]}
          >
            <Text style={styles.dateArrowText}>{'▶'}</Text>
          </Pressable>
        </View>

        <Pressable
          onPress={handleSubmit}
          disabled={!isValid}
          style={({ pressed }) => [
            styles.saveButton,
            !isValid && styles.saveButtonDisabled,
            pressed && isValid && styles.saveButtonPressed,
          ]}
        >
          <Text style={styles.saveButtonText}>Add expense</Text>
        </Pressable>
      </ScrollView>
    </KeyboardAvoidingView>
  );
}

const styles = StyleSheet.create({
  container: {
    flex: 1,
  },
  scrollContent: {
    paddingHorizontal: spacing.lg,
    paddingTop: spacing.md,
    paddingBottom: spacing.xl,
  },
  title: {
    color: colors.textPrimary,
    fontSize: 20,
    fontWeight: '700',
    marginBottom: spacing.md,
  },
  amountRow: {
    flexDirection: 'row',
    alignItems: 'center',
    justifyContent: 'center',
    marginBottom: spacing.md,
  },
  currencySymbol: {
    color: colors.textSecondary,
    fontSize: 34,
    fontWeight: '600',
    marginRight: spacing.xs,
  },
  amountInput: {
    color: colors.textPrimary,
    fontSize: 44,
    fontWeight: '800',
    minWidth: 130,
    textAlign: 'center',
    fontVariant: ['tabular-nums'],
  },
  currencyChip: {
    backgroundColor: colors.card,
    borderRadius: 20,
    borderWidth: 1,
    borderColor: colors.border,
    paddingHorizontal: spacing.sm + 4,
    paddingVertical: spacing.xs + 2,
    marginLeft: spacing.sm,
  },
  currencyChipText: {
    color: colors.textSecondary,
    fontSize: 14,
    fontWeight: '700',
  },
  chipPressed: {
    backgroundColor: colors.cardPressed,
  },
  currencyOptions: {
    flexDirection: 'row',
    flexWrap: 'wrap',
    justifyContent: 'center',
    gap: spacing.sm,
    marginBottom: spacing.md,
  },
  currencyOption: {
    backgroundColor: colors.card,
    borderRadius: 20,
    borderWidth: 1,
    borderColor: 'transparent',
    paddingHorizontal: spacing.sm + 4,
    paddingVertical: spacing.sm,
  },
  currencyOptionSelected: {
    backgroundColor: `${colors.accent}33`,
    borderColor: colors.accent,
  },
  currencyOptionText: {
    color: colors.textSecondary,
    fontSize: 14,
    fontWeight: '600',
  },
  currencyOptionTextSelected: {
    color: colors.textPrimary,
  },
  noteInput: {
    backgroundColor: colors.card,
    color: colors.textPrimary,
    borderRadius: radius.sm,
    paddingHorizontal: spacing.md,
    paddingVertical: spacing.sm + 4,
    fontSize: 16,
    marginBottom: spacing.md,
  },
  categoryGrid: {
    flexDirection: 'row',
    flexWrap: 'wrap',
    gap: spacing.sm,
    marginBottom: spacing.md,
  },
  categoryChip: {
    flexDirection: 'row',
    alignItems: 'center',
    backgroundColor: colors.card,
    borderRadius: 20,
    borderWidth: 1,
    borderColor: 'transparent',
    paddingHorizontal: spacing.sm + 4,
    paddingVertical: spacing.sm,
  },
  categoryEmoji: {
    fontSize: 16,
    marginRight: 5,
  },
  categoryLabel: {
    color: colors.textSecondary,
    fontSize: 14,
    fontWeight: '600',
  },
  dateRow: {
    flexDirection: 'row',
    alignItems: 'center',
    backgroundColor: colors.card,
    borderRadius: radius.sm,
    paddingHorizontal: spacing.sm,
    paddingVertical: spacing.sm,
    marginBottom: spacing.lg,
  },
  dateArrow: {
    width: 36,
    height: 36,
    borderRadius: 18,
    alignItems: 'center',
    justifyContent: 'center',
  },
  dateArrowDisabled: {
    opacity: 0.3,
  },
  dateArrowText: {
    color: colors.textSecondary,
    fontSize: 14,
  },
  dateLabel: {
    flex: 1,
    color: colors.textPrimary,
    fontSize: 16,
    fontWeight: '600',
    textAlign: 'center',
  },
  saveButton: {
    backgroundColor: colors.accent,
    borderRadius: radius.md,
    paddingVertical: spacing.md,
    alignItems: 'center',
  },
  saveButtonPressed: {
    backgroundColor: colors.accentDark,
  },
  saveButtonDisabled: {
    opacity: 0.4,
  },
  saveButtonText: {
    color: '#06281C',
    fontSize: 17,
    fontWeight: '800',
  },
});
