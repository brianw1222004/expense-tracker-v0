import { useEffect, useMemo, useState } from 'react';
import { Pressable, ScrollView, StyleSheet, Text, TextInput, View } from 'react-native';
import { useSafeAreaInsets } from 'react-native-safe-area-context';
import { fonts, radius, spacing, useTheme } from '../theme';
import Sheet from './Sheet';
import { useT } from '../i18n';
import { CURRENCIES } from '../currency';
import { HIcon } from '../icons';

// The shared "Choose currency" page — a searchable list of every supported
// currency, opened from a CurrencyPill anywhere a currency is decided (display
// currency on the Dashboard/Budget, a group's currency). Tapping a row selects
// it and closes. `value` is the currently-selected code.
export default function CurrencyPicker({ visible, value, onSelect, onClose }) {
  const { colors } = useTheme();
  const t = useT();
  const insets = useSafeAreaInsets();
  const styles = useMemo(() => createStyles(colors), [colors]);
  const [query, setQuery] = useState('');

  // Reset the search each time the picker (re)opens.
  useEffect(() => {
    if (visible) setQuery('');
  }, [visible]);

  const q = query.trim().toLowerCase();
  const results = q
    ? CURRENCIES.filter(
        (c) =>
          c.code.toLowerCase().includes(q) ||
          c.name.toLowerCase().includes(q) ||
          c.symbol.toLowerCase().includes(q)
      )
    : CURRENCIES;

  return (
    <Sheet visible={visible} onClose={onClose} avoidKeyboard sheetStyle={styles.sheetOverride}>
      <View style={styles.headerRow}>
        <View style={styles.headerText}>
          <Text style={styles.title}>{t('currency.choose')}</Text>
          <Text style={styles.subtitle}>{t('currency.chooseHint')}</Text>
        </View>
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

      <View style={styles.searchRow}>
        <HIcon name="search-01" size={18} color={colors.textMuted} />
        <TextInput
          style={styles.searchInput}
          value={query}
          onChangeText={setQuery}
          placeholder={t('currency.search')}
          placeholderTextColor={colors.textMuted}
          keyboardAppearance={colors.keyboardAppearance}
          autoCapitalize="characters"
          autoCorrect={false}
          returnKeyType="search"
          accessibilityLabel={t('currency.search')}
        />
      </View>

      <ScrollView
        keyboardShouldPersistTaps="handled"
        contentContainerStyle={{ paddingBottom: spacing.xl + insets.bottom }}
        showsVerticalScrollIndicator={false}
      >
        {results.length === 0 ? (
          <Text style={styles.noResults}>{t('currency.noResults')}</Text>
        ) : (
          results.map((entry) => {
            const selected = entry.code === value;
            return (
              <Pressable
                key={entry.code}
                onPress={() => onSelect(entry.code)}
                accessibilityRole="radio"
                accessibilityState={{ selected }}
                accessibilityLabel={`${entry.code} ${entry.name}`}
                style={({ pressed }) => [styles.row, pressed && styles.rowPressed]}
              >
                <View style={styles.badge}>
                  <Text style={styles.badgeText} numberOfLines={1}>{entry.symbol}</Text>
                </View>
                <View style={styles.rowText}>
                  <Text style={styles.code}>{entry.code}</Text>
                  <Text style={styles.name} numberOfLines={1}>{entry.name}</Text>
                </View>
                {selected && <HIcon name="tick-01" size={20} color={colors.accent} />}
              </Pressable>
            );
          })
        )}
      </ScrollView>
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
    headerRow: {
      flexDirection: 'row',
      justifyContent: 'space-between',
      alignItems: 'flex-start',
      marginBottom: spacing.md,
    },
    headerText: {
      flex: 1,
      marginRight: spacing.sm,
    },
    title: {
      color: colors.textPrimary,
      fontFamily: fonts.bold,
      fontSize: 22,
    },
    subtitle: {
      color: colors.textMuted,
      fontFamily: fonts.regular,
      fontSize: 14,
      marginTop: 2,
    },
    closeButton: {
      width: 34,
      height: 34,
      borderRadius: 17,
      backgroundColor: colors.cardPressed,
      alignItems: 'center',
      justifyContent: 'center',
    },
    closeButtonPressed: {
      opacity: 0.6,
    },
    searchRow: {
      flexDirection: 'row',
      alignItems: 'center',
      gap: spacing.sm,
      backgroundColor: colors.cardPressed,
      borderRadius: radius.md,
      paddingHorizontal: spacing.md,
      height: 48,
      marginBottom: spacing.md,
    },
    searchInput: {
      flex: 1,
      color: colors.textPrimary,
      fontFamily: fonts.regular,
      fontSize: 15,
      height: '100%',
    },
    noResults: {
      color: colors.textMuted,
      fontFamily: fonts.regular,
      fontSize: 14,
      textAlign: 'center',
      paddingVertical: spacing.xl,
    },
    row: {
      flexDirection: 'row',
      alignItems: 'center',
      gap: spacing.md,
      backgroundColor: colors.card,
      borderRadius: radius.md,
      paddingHorizontal: spacing.md,
      paddingVertical: spacing.sm + 4,
      marginBottom: spacing.sm,
    },
    rowPressed: {
      backgroundColor: colors.cardPressed,
    },
    badge: {
      width: 44,
      height: 44,
      borderRadius: 22,
      backgroundColor: colors.cardPressed,
      alignItems: 'center',
      justifyContent: 'center',
    },
    badgeText: {
      color: colors.textPrimary,
      fontFamily: fonts.numBold,
      fontSize: 15,
      fontVariant: ['tabular-nums'],
    },
    rowText: {
      flex: 1,
    },
    code: {
      color: colors.textPrimary,
      fontFamily: fonts.bold,
      fontSize: 16,
    },
    name: {
      color: colors.textMuted,
      fontFamily: fonts.regular,
      fontSize: 13,
      marginTop: 1,
    },
  });
