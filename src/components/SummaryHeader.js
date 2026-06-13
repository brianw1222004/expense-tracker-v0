import { useMemo } from 'react';
import { StyleSheet, Text, View } from 'react-native';
import { fonts, spacing, radius, useTheme } from '../theme';
import { useLanguage, useT } from '../i18n';
import { formatMoney, formatMoneyShort, monthLabel } from '../format';

export default function SummaryHeader({ monthTotal, todayTotal, count, avgPerDay, displayCurrency }) {
  const { colors } = useTheme();
  const t = useT();
  const language = useLanguage();
  const styles = useMemo(() => createStyles(colors), [colors]);

  return (
    <View style={styles.container}>
      <Text style={styles.monthLabel}>{monthLabel(new Date(), language)}</Text>
      <Text style={styles.total} numberOfLines={1} adjustsFontSizeToFit>
        {formatMoney(monthTotal, displayCurrency)}
      </Text>
      <View style={styles.statsRow}>
        <Stat
          styles={styles}
          value={formatMoneyShort(todayTotal, displayCurrency)}
          label={t('dash.today')}
        />
        <Stat styles={styles} value={String(count)} label={t('dash.expenses')} />
        <Stat
          styles={styles}
          value={formatMoneyShort(avgPerDay, displayCurrency)}
          label={t('dash.avgPerDay')}
        />
      </View>
    </View>
  );
}

function Stat({ styles, value, label }) {
  return (
    <View style={styles.stat}>
      <Text style={styles.statValue}>{value}</Text>
      <Text style={styles.statLabel}>{label}</Text>
    </View>
  );
}

const createStyles = (colors) =>
  StyleSheet.create({
    container: {
      paddingHorizontal: spacing.lg,
      paddingTop: spacing.md,
      paddingBottom: spacing.lg,
      alignItems: 'center',
    },
    monthLabel: {
      color: colors.textSecondary,
      fontFamily: fonts.bold,
      fontSize: 15,
      textTransform: 'uppercase',
      letterSpacing: 1.2,
    },
    total: {
      color: colors.textPrimary,
      fontFamily: fonts.bold,
      fontSize: 48,
      marginTop: spacing.xs,
      fontVariant: ['tabular-nums'],
    },
    statsRow: {
      flexDirection: 'row',
      marginTop: spacing.md,
      backgroundColor: colors.card,
      borderRadius: radius.md,
      paddingVertical: spacing.sm + 4,
      alignSelf: 'stretch',
    },
    stat: {
      flex: 1,
      alignItems: 'center',
    },
    statValue: {
      color: colors.textPrimary,
      fontFamily: fonts.bold,
      fontSize: 17,
      fontVariant: ['tabular-nums'],
    },
    statLabel: {
      color: colors.textMuted,
      fontFamily: fonts.regular,
      fontSize: 12,
      marginTop: 2,
    },
  });
