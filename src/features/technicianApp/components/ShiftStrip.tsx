/**
 * ShiftStrip — the Today tab's shift banner (the approved redesign): the
 * employee's shift times from the attendance summary ("Shift: 9:00 AM –
 * 6:00 PM"). Times travel as `HH:mm` (the summary's wire convention);
 * 12-hour rendering is the app's job. The mockup's "General Shift" chip
 * is deliberately NOT built — no named-shift concept exists anywhere in
 * the product, and a decorative label over no data would be a lie.
 * Renders null when either time is missing (punch disabled, or a
 * timings-less office) — no strip over no data.
 */
import { StyleSheet, Text, View } from 'react-native';
import { Clock } from 'lucide-react-native';
import { colors, radius, spacing, typography } from '../../../theme';

type Props = {
  startTime: string | null;
  endTime: string | null;
};

/** "09:00" → "9:00 AM"; anything malformed hides the strip (null). */
export function formatShiftTime(hhmm: string): string | null {
  const m = /^(\d{2}):(\d{2})$/.exec(hhmm);
  if (!m) return null;
  const h = Number(m[1]);
  const min = m[2];
  if (h > 23 || Number(min) > 59) return null;
  const hour12 = h % 12 === 0 ? 12 : h % 12;
  return `${hour12}:${min} ${h < 12 ? 'AM' : 'PM'}`;
}

export function ShiftStrip({ startTime, endTime }: Props) {
  const start = startTime ? formatShiftTime(startTime) : null;
  const end = endTime ? formatShiftTime(endTime) : null;
  if (!start || !end) return null;
  return (
    <View style={styles.strip}>
      <Clock size={16} color={colors.primary} strokeWidth={2.2} />
      <Text style={styles.label} numberOfLines={1}>
        {`Shift: ${start} \u2013 ${end}`}
      </Text>
    </View>
  );
}

const styles = StyleSheet.create({
  strip: {
    flexDirection: 'row',
    alignItems: 'center',
    alignSelf: 'stretch',
    gap: spacing.s2,
    backgroundColor: colors.surfaceCard,
    borderWidth: 1,
    borderColor: colors.borderSubtle,
    borderRadius: radius.xl,
    paddingHorizontal: spacing.s4,
    paddingVertical: spacing.s3,
  },
  label: {
    ...typography.labelStrong,
    color: colors.textStrong,
    flexShrink: 1,
  },
});
