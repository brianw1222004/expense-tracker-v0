import { StyleSheet, Text, View } from 'react-native';
import Svg, { Circle } from 'react-native-svg';
import { fonts, spacing, useTheme } from '../theme';
import { useT } from '../i18n';
import { formatMoney } from '../format';
import { getCurrency } from '../currency';
import { HIcon } from '../icons';

const SIZE = 200;
const STROKE = 14;
const R = (SIZE - STROKE) / 2;
const CX = SIZE / 2;
const CY = SIZE / 2;
const CIRCUMFERENCE = 2 * Math.PI * R;

export default function BudgetGauge({ spent, budget, displayCurrency, empty }) {
  const { colors } = useTheme();
  const t = useT();

  if (empty) {
    return (
      <View style={styles.container}>
        <View style={styles.donut}>
          <Svg width="100%" height="100%" viewBox={`0 0 ${SIZE} ${SIZE}`}>
            <Circle
              cx={CX}
              cy={CY}
              r={R}
              stroke={colors.border}
              strokeWidth={STROKE}
              fill="none"
              strokeDasharray={`${STROKE * 0.8} ${STROKE * 1.2}`}
              strokeLinecap="round"
              opacity={0.5}
            />
          </Svg>
          <View style={[StyleSheet.absoluteFill, styles.center]}>
            <HIcon name="circle-dashed" size={32} color={colors.icon} />
            <Text style={[styles.emptyLabel, { color: colors.textMuted }]}>
              {t('budget.noBudget')}
            </Text>
          </View>
        </View>
      </View>
    );
  }

  const factor = 10 ** getCurrency(displayCurrency).decimals;
  const rounded = Math.round(spent * factor) / factor;
  const ratio = budget > 0 ? rounded / budget : 0;
  const capped = Math.min(1, Math.max(0, ratio));
  const over = rounded > budget;

  const zoneColor = over ? colors.danger : ratio >= 0.75 ? colors.warning : colors.success;
  const fillLength = capped * CIRCUMFERENCE;
  const remaining = over ? rounded - budget : budget - rounded;

  return (
    <View style={styles.container}>
      <View style={styles.donut}>
        <Svg width="100%" height="100%" viewBox={`0 0 ${SIZE} ${SIZE}`}>
          <Circle
            cx={CX}
            cy={CY}
            r={R}
            stroke={colors.cardPressed}
            strokeWidth={STROKE}
            fill="none"
          />
          {capped > 0 && (
            <Circle
              cx={CX}
              cy={CY}
              r={R}
              stroke={zoneColor}
              strokeWidth={STROKE}
              fill="none"
              strokeDasharray={`${fillLength} ${CIRCUMFERENCE - fillLength}`}
              strokeDashoffset={CIRCUMFERENCE * 0.25}
              strokeLinecap="round"
            />
          )}
        </Svg>
        <View style={[StyleSheet.absoluteFill, styles.center]}>
          <Text
            style={[styles.centerValue, { color: over ? colors.danger : colors.textPrimary }]}
            numberOfLines={1}
            adjustsFontSizeToFit
          >
            {over ? `-${formatMoney(remaining, displayCurrency)}` : formatMoney(remaining, displayCurrency)}
          </Text>
          <Text style={[styles.centerLabel, { color: over ? colors.danger : colors.textMuted }]}>
            {t(over ? 'budget.overBy' : 'budget.remaining')}
          </Text>
        </View>
      </View>
      <Text style={[styles.spentLine, { color: colors.textSecondary }]}>
        {t('budget.spentOf', {
          spent: formatMoney(rounded, displayCurrency),
          budget: formatMoney(budget, displayCurrency),
        })}
      </Text>
    </View>
  );
}

const styles = StyleSheet.create({
  container: {
    alignItems: 'center',
  },
  donut: {
    width: SIZE,
    height: SIZE,
  },
  center: {
    alignItems: 'center',
    justifyContent: 'center',
  },
  centerValue: {
    fontFamily: fonts.bold,
    fontSize: 24,
    fontVariant: ['tabular-nums'],
    maxWidth: '75%',
  },
  centerLabel: {
    fontFamily: fonts.regular,
    fontSize: 12,
    marginTop: 2,
  },
  emptyLabel: {
    fontFamily: fonts.regular,
    fontSize: 12,
  },
  spentLine: {
    fontFamily: fonts.regular,
    fontSize: 14,
    marginTop: spacing.sm,
    fontVariant: ['tabular-nums'],
  },
});
