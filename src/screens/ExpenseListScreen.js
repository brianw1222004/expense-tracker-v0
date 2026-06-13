import { useEffect, useMemo, useState } from 'react';
import { Modal, Pressable, ScrollView, SectionList, StyleSheet, Text, View } from 'react-native';
import { fonts, radius, spacing, useTheme } from '../theme';
import { useT } from '../i18n';
import { CATEGORIES, getCategory } from '../categories';
import { formatMoney } from '../format';
import ExpenseRow from '../components/ExpenseRow';
import { TAB_BAR_HEIGHT } from '../components/TabBar';

export default function ExpenseListScreen({
  sections,
  loaded,
  hasExpenses,
  displayCurrency,
  onDelete,
  onLoadDemo,
}) {
  const { colors } = useTheme();
  const t = useT();
  const styles = useMemo(() => createStyles(colors), [colors]);
  const [filter, setFilter] = useState('all');
  const [pendingDelete, setPendingDelete] = useState(null);

  const presentCategories = useMemo(() => {
    const present = new Set();
    for (const section of sections) {
      for (const item of section.data) present.add(getCategory(item.category).id);
    }
    return CATEGORIES.filter((category) => present.has(category.id));
  }, [sections]);

  const activeFilter =
    filter !== 'all' && !presentCategories.some((c) => c.id === filter) ? 'all' : filter;
  useEffect(() => {
    if (activeFilter !== filter) setFilter('all');
  }, [activeFilter, filter]);

  const filteredSections = useMemo(() => {
    if (activeFilter === 'all') return sections;
    return sections
      .map((section) => {
        const data = section.data.filter(
          (item) => getCategory(item.category).id === activeFilter
        );
        return {
          ...section,
          data,
          total: data.reduce((sum, item) => sum + item.displayAmount, 0),
        };
      })
      .filter((section) => section.data.length > 0);
  }, [sections, activeFilter]);

  const confirmDelete = () => {
    if (!pendingDelete) return;
    onDelete(pendingDelete.id);
    setPendingDelete(null);
  };

  if (!loaded) {
    return <View style={styles.container} />;
  }

  if (!hasExpenses) {
    return (
      <View style={[styles.container, styles.emptyState]}>
        <Text style={styles.emptyEmoji}>🧾</Text>
        <Text style={styles.emptyTitle}>{t('empty.title')}</Text>
        <Text style={styles.emptyHint}>{t('empty.hint')}</Text>
        <Pressable
          onPress={onLoadDemo}
          accessibilityRole="button"
          style={({ pressed }) => [styles.demoButton, pressed && styles.demoButtonPressed]}
        >
          <Text style={styles.demoButtonText}>{t('empty.loadDemo')}</Text>
        </Pressable>
      </View>
    );
  }

  const deleteCategory = pendingDelete ? getCategory(pendingDelete.category) : null;

  return (
    <View style={styles.container}>
      <Text style={styles.title}>{t('list.title')}</Text>

      <View style={styles.chipsArea}>
        <ScrollView
          horizontal
          showsHorizontalScrollIndicator={false}
          contentContainerStyle={styles.chipRow}
        >
          <FilterChip
            label={t('list.all')}
            selected={activeFilter === 'all'}
            onPress={() => setFilter('all')}
          />
          {presentCategories.map((category) => (
            <FilterChip
              key={category.id}
              emoji={category.emoji}
              label={t('cat.' + category.id)}
              color={category.color}
              selected={activeFilter === category.id}
              onPress={() => setFilter(category.id)}
            />
          ))}
        </ScrollView>
      </View>

      {filteredSections.length === 0 ? (
        <View style={styles.noMatch}>
          <Text style={styles.noMatchText}>
            {t('list.noMatch', { category: t('cat.' + activeFilter) })}
          </Text>
        </View>
      ) : (
        <SectionList
          sections={filteredSections}
          keyExtractor={(item) => item.id}
          renderItem={({ item }) => (
            <ExpenseRow
              expense={item}
              displayCurrency={displayCurrency}
              onRequestDelete={setPendingDelete}
            />
          )}
          renderSectionHeader={({ section }) => (
            <View style={styles.sectionHeader}>
              <Text style={styles.sectionTitle}>{section.title}</Text>
              <Text style={styles.sectionTotal}>
                {formatMoney(section.total, displayCurrency)}
              </Text>
            </View>
          )}
          stickySectionHeadersEnabled={false}
          contentContainerStyle={styles.listContent}
        />
      )}

      <Modal
        visible={pendingDelete != null}
        transparent
        animationType="fade"
        onRequestClose={() => setPendingDelete(null)}
      >
        <Pressable
          style={[StyleSheet.absoluteFill, styles.backdrop]}
          onPress={() => setPendingDelete(null)}
        />
        <View style={styles.modalCenter}>
          <View style={styles.modalCard}>
            <Text style={styles.modalTitle}>{t('list.deleteTitle')}</Text>

            {pendingDelete && (
              <View style={styles.modalExpense}>
                <View style={[styles.modalIcon, { backgroundColor: `${deleteCategory.color}26` }]}>
                  <Text style={styles.modalEmoji}>{deleteCategory.emoji}</Text>
                </View>
                <View style={styles.modalInfo}>
                  <Text style={styles.modalNote} numberOfLines={1}>
                    {pendingDelete.note || t('cat.' + deleteCategory.id)}
                  </Text>
                  <Text style={styles.modalCategory}>{t('cat.' + deleteCategory.id)}</Text>
                </View>
                <Text style={styles.modalAmount}>
                  {formatMoney(pendingDelete.displayAmount, displayCurrency)}
                </Text>
              </View>
            )}

            <View style={styles.modalButtons}>
              <Pressable
                onPress={() => setPendingDelete(null)}
                accessibilityRole="button"
                style={({ pressed }) => [styles.modalBtn, styles.modalBtnCancel, pressed && styles.modalBtnPressed]}
              >
                <Text style={styles.modalBtnCancelText}>{t('common.cancel')}</Text>
              </Pressable>
              <Pressable
                onPress={confirmDelete}
                accessibilityRole="button"
                style={({ pressed }) => [styles.modalBtn, styles.modalBtnDelete, pressed && styles.modalBtnDeletePressed]}
              >
                <Text style={styles.modalBtnDeleteText}>{t('common.delete')}</Text>
              </Pressable>
            </View>
          </View>
        </View>
      </Modal>
    </View>
  );
}

function FilterChip({ emoji, label, color, selected, onPress }) {
  const { colors } = useTheme();
  const styles = useMemo(() => createStyles(colors), [colors]);
  const chipColor = color ?? colors.accent;
  return (
    <Pressable
      onPress={onPress}
      accessibilityRole="button"
      accessibilityState={{ selected }}
      style={({ pressed }) => [
        styles.chip,
        selected && { backgroundColor: `${chipColor}33`, borderColor: chipColor },
        pressed && !selected && styles.chipPressed,
      ]}
    >
      {emoji ? <Text style={styles.chipEmoji}>{emoji}</Text> : null}
      <Text style={[styles.chipLabel, selected && styles.chipLabelSelected]}>{label}</Text>
    </Pressable>
  );
}

const createStyles = (colors) =>
  StyleSheet.create({
    container: {
      flex: 1,
    },
    title: {
      color: colors.textPrimary,
      fontSize: 28,
      fontFamily: fonts.bold,
      paddingHorizontal: spacing.md,
      paddingTop: spacing.md,
    },
    chipsArea: {
      paddingVertical: spacing.sm + 4,
    },
    chipRow: {
      paddingHorizontal: spacing.md,
      gap: spacing.sm,
    },
    chip: {
      flexDirection: 'row',
      alignItems: 'center',
      backgroundColor: colors.card,
      borderRadius: 20,
      borderWidth: 1,
      borderColor: 'transparent',
      paddingHorizontal: spacing.sm + 4,
      paddingVertical: spacing.sm,
    },
    chipPressed: {
      backgroundColor: colors.cardPressed,
    },
    chipEmoji: {
      fontSize: 16,
      marginRight: 5,
    },
    chipLabel: {
      color: colors.textSecondary,
      fontSize: 14,
      fontFamily: fonts.bold,
    },
    chipLabelSelected: {
      color: colors.textPrimary,
    },
    listContent: {
      paddingBottom: spacing.xl,
    },
    sectionHeader: {
      flexDirection: 'row',
      justifyContent: 'space-between',
      alignItems: 'baseline',
      paddingHorizontal: spacing.md,
      paddingTop: spacing.sm,
      paddingBottom: spacing.sm,
    },
    sectionTitle: {
      color: colors.textSecondary,
      fontSize: 13,
      fontFamily: fonts.bold,
      textTransform: 'uppercase',
      letterSpacing: 0.8,
    },
    sectionTotal: {
      color: colors.textMuted,
      fontSize: 13,
      fontFamily: fonts.bold,
      fontVariant: ['tabular-nums'],
    },
    noMatch: {
      flex: 1,
      alignItems: 'center',
      paddingTop: spacing.xl * 2,
      paddingHorizontal: spacing.lg,
    },
    noMatchText: {
      color: colors.textMuted,
      fontSize: 15,
      fontFamily: fonts.regular,
      textAlign: 'center',
    },
    backdrop: {
      backgroundColor: colors.backdrop,
    },
    modalCenter: {
      flex: 1,
      justifyContent: 'center',
      alignItems: 'center',
      paddingHorizontal: spacing.lg,
    },
    modalCard: {
      backgroundColor: colors.card,
      borderRadius: radius.lg,
      padding: spacing.lg,
      width: '100%',
      maxWidth: 340,
    },
    modalTitle: {
      color: colors.textPrimary,
      fontFamily: fonts.bold,
      fontSize: 18,
      marginBottom: spacing.md,
    },
    modalExpense: {
      flexDirection: 'row',
      alignItems: 'center',
      backgroundColor: colors.background,
      borderRadius: radius.md,
      padding: spacing.sm + 4,
      marginBottom: spacing.lg,
    },
    modalIcon: {
      width: 40,
      height: 40,
      borderRadius: 20,
      alignItems: 'center',
      justifyContent: 'center',
    },
    modalEmoji: {
      fontSize: 18,
    },
    modalInfo: {
      flex: 1,
      marginHorizontal: spacing.sm + 2,
    },
    modalNote: {
      color: colors.textPrimary,
      fontFamily: fonts.bold,
      fontSize: 15,
    },
    modalCategory: {
      color: colors.textMuted,
      fontFamily: fonts.regular,
      fontSize: 12,
      marginTop: 1,
    },
    modalAmount: {
      color: colors.textPrimary,
      fontFamily: fonts.bold,
      fontSize: 15,
      fontVariant: ['tabular-nums'],
    },
    modalButtons: {
      flexDirection: 'row',
      gap: spacing.sm,
    },
    modalBtn: {
      flex: 1,
      alignItems: 'center',
      paddingVertical: spacing.sm + 4,
      borderRadius: radius.sm,
    },
    modalBtnCancel: {
      backgroundColor: colors.background,
    },
    modalBtnPressed: {
      opacity: 0.7,
    },
    modalBtnCancelText: {
      color: colors.textSecondary,
      fontFamily: fonts.bold,
      fontSize: 15,
    },
    modalBtnDelete: {
      backgroundColor: colors.danger,
    },
    modalBtnDeletePressed: {
      opacity: 0.8,
    },
    modalBtnDeleteText: {
      color: '#fff',
      fontFamily: fonts.bold,
      fontSize: 15,
    },
    emptyState: {
      alignItems: 'center',
      justifyContent: 'center',
      paddingHorizontal: spacing.xl,
      paddingBottom: TAB_BAR_HEIGHT,
    },
    emptyEmoji: {
      fontSize: 56,
      marginBottom: spacing.md,
    },
    emptyTitle: {
      color: colors.textPrimary,
      fontSize: 20,
      fontFamily: fonts.bold,
    },
    emptyHint: {
      color: colors.textSecondary,
      fontSize: 15,
      fontFamily: fonts.regular,
      textAlign: 'center',
      marginTop: spacing.sm,
      lineHeight: 21,
    },
    demoButton: {
      marginTop: spacing.lg,
      backgroundColor: colors.card,
      borderRadius: radius.md,
      borderWidth: 1,
      borderColor: colors.border,
      paddingHorizontal: spacing.lg,
      paddingVertical: spacing.sm + 4,
    },
    demoButtonPressed: {
      backgroundColor: colors.cardPressed,
    },
    demoButtonText: {
      color: colors.accent,
      fontSize: 16,
      fontFamily: fonts.bold,
    },
  });
