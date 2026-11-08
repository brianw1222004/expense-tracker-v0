import React from 'react';
import { Text } from 'react-native';
import { useT } from '../i18n';
import { fonts, useTheme } from '../theme';
import { reportingStatusKeys } from '../reportingPresentation';

// Passive text: no network work or live-region announcements for quote updates.
export default function ReportingFxStatus({ value, coverage, summary = false, style, label }) {
  const t = useT();
  const { colors } = useTheme();
  const text = reportingStatusKeys({ value, coverage, summary }).map((key) => t(key)).join(' · ');
  if (!text) return null;
  return <Text style={[{ fontFamily: fonts.regular, fontSize: 12, color: colors.textMuted, marginTop: 4, flexShrink: 1 }, style]}>{label ? `${label}: ${text}` : text}</Text>;
}
