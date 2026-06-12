import { useRef, useState } from 'react';
import {
  KeyboardAvoidingView,
  Modal,
  Platform,
  Pressable,
  StyleSheet,
  Text,
  TextInput,
  View,
} from 'react-native';
import { colors, spacing, radius } from '../theme';
import { CATEGORIES } from '../categories';

export default function AddExpenseSheet({ visible, onClose, onSubmit }) {
  const [amountText, setAmountText] = useState('');
  const [note, setNote] = useState('');
  const [categoryId, setCategoryId] = useState(CATEGORIES[0].id);
  const amountRef = useRef(null);

  // Strict shape check before parseFloat: bare parseFloat accepts '1.2.3' as 1.2
  // and would silently save a different amount than the user sees.
  const normalized = amountText.replace(',', '.');
  const amount = parseFloat(normalized);
  const isValid = /^(\d+(\.\d{0,2})?|\.\d{1,2})$/.test(normalized) && amount > 0;

  const reset = () => {
    setAmountText('');
    setNote('');
    setCategoryId(CATEGORIES[0].id);
  };

  const handleSubmit = () => {
    if (!isValid) return;
    onSubmit({ amount: Math.round(amount * 100) / 100, note: note.trim(), category: categoryId });
    reset();
  };

  const handleClose = () => {
    reset();
    onClose();
  };

  return (
    <Modal
      visible={visible}
      animationType="slide"
      transparent
      onRequestClose={handleClose}
      onShow={() => amountRef.current?.focus()}
    >
      <KeyboardAvoidingView
        behavior={Platform.OS === 'ios' ? 'padding' : undefined}
        style={styles.overlay}
      >
        <Pressable style={styles.backdrop} onPress={handleClose} />
        <View style={styles.sheet}>
          <Pressable onPress={handleClose} style={styles.handleArea} hitSlop={8}>
            <View style={styles.handle} />
          </Pressable>
          <View style={styles.titleRow}>
            <Text style={styles.title}>Add expense</Text>
            <Pressable onPress={handleClose} hitSlop={12} style={styles.closeButton} accessibilityLabel="Close">
              <Text style={styles.closeButtonText}>{'✕'}</Text>
            </Pressable>
          </View>

          <View style={styles.amountRow}>
            <Text style={styles.currency}>$</Text>
            <TextInput
              ref={amountRef}
              style={styles.amountInput}
              value={amountText}
              onChangeText={setAmountText}
              placeholder="0.00"
              placeholderTextColor={colors.textMuted}
              keyboardType="decimal-pad"
              keyboardAppearance="dark"
              maxLength={9}
            />
          </View>

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
                  style={[
                    styles.categoryChip,
                    selected && { backgroundColor: `${category.color}33`, borderColor: category.color },
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
        </View>
      </KeyboardAvoidingView>
    </Modal>
  );
}

const styles = StyleSheet.create({
  overlay: {
    flex: 1,
    justifyContent: 'flex-end',
  },
  backdrop: {
    ...StyleSheet.absoluteFillObject,
    backgroundColor: 'rgba(0, 0, 0, 0.55)',
  },
  sheet: {
    backgroundColor: colors.background,
    borderTopLeftRadius: radius.lg,
    borderTopRightRadius: radius.lg,
    paddingHorizontal: spacing.lg,
    paddingBottom: spacing.xl,
    paddingTop: spacing.sm,
  },
  handleArea: {
    alignSelf: 'stretch',
    alignItems: 'center',
    paddingVertical: spacing.xs,
    marginBottom: spacing.sm,
  },
  handle: {
    width: 40,
    height: 5,
    borderRadius: 3,
    backgroundColor: colors.border,
  },
  titleRow: {
    flexDirection: 'row',
    justifyContent: 'space-between',
    alignItems: 'center',
    marginBottom: spacing.md,
  },
  title: {
    color: colors.textPrimary,
    fontSize: 20,
    fontWeight: '700',
  },
  closeButton: {
    width: 30,
    height: 30,
    borderRadius: 15,
    backgroundColor: colors.card,
    alignItems: 'center',
    justifyContent: 'center',
  },
  closeButtonText: {
    color: colors.textSecondary,
    fontSize: 14,
    fontWeight: '700',
  },
  amountRow: {
    flexDirection: 'row',
    alignItems: 'center',
    justifyContent: 'center',
    marginBottom: spacing.md,
  },
  currency: {
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
    marginBottom: spacing.lg,
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
