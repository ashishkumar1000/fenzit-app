/**
 * TodayPulseCard — the owner Home's attendance card: today's date, the
 * checked-in share, and four count chips (Present, Not in yet, On leave,
 * Late). Replaces the plain Attendance tile while the numbers load OK;
 * tapping it opens the Attendance hub. Same numbers as the Today screen
 * (`GET /attendance/dashboard`), so the two never disagree: Present =
 * `counts.checkedIn`, Not in yet = `counts.notCheckedIn`.
 *
 * Blue card with a diagonal gradient (SVG LinearGradient behind the content
 * — react-native-svg is already a dependency) and translucent chips (the
 * dashboard's on-primary tints).
 */
import { Pressable, StyleSheet, Text, View } from 'react-native';
import { GradientSurface } from '../../../components/ui';
import { colors, radius, spacing, typography } from '../../../theme';
import { checkedInPct } from '../../attendance/dashboard/dashboardModel';
import type { TodayPulse } from '../useTodayPulse';

const WEEKDAYS = ['Sunday', 'Monday', 'Tuesday', 'Wednesday', 'Thursday', 'Friday', 'Saturday'];
const MONTHS = ['Jan', 'Feb', 'Mar', 'Apr', 'May', 'Jun', 'Jul', 'Aug', 'Sep', 'Oct', 'Nov', 'Dec'];

/** "2026-10-24" → "Saturday, Oct 24" (parsed by parts — no timezone shift). */
export function formatPulseDate(ymd: string): string {
  const [y, m, d] = ymd.split('-').map(Number);
  const date = new Date(y, m - 1, d);
  if (Number.isNaN(date.getTime())) return '';
  return `${WEEKDAYS[date.getDay()]}, ${MONTHS[m - 1]} ${d}`;
}

// Four chips share one row, so label scaling is capped (like the weekly-off
// pills) and the label may wrap to a second line instead of truncating.
const LABEL_FONT_CAP = 1.3;
const VALUE_FONT_CAP = 1.5;

type Ready = Extract<TodayPulse, { status: 'ready' }>;

type Props = { pulse: Ready; onPress: () => void };

export function TodayPulseCard({ pulse, onPress }: Props) {
  const { counts, date } = pulse;
  // Nobody tracked → no share to compute; the card still shows 0% — the
  // exact progress, always (owner: the pulse never inflates).
  const pct = checkedInPct(counts) ?? 0;
  const chips = [
    { label: 'Present', value: counts.checkedIn },
    { label: 'Not in yet', value: counts.notCheckedIn },
    { label: 'On leave', value: counts.onLeave },
    { label: 'Late', value: counts.late },
  ];
  return (
    <Pressable
      accessibilityRole="button"
      accessibilityLabel={`Attendance today. ${chips.map(c => `${c.label} ${c.value}`).join(', ')}. Tap to open attendance`}
      onPress={onPress}
      style={({ pressed }) => pressed && styles.pressed}>
      <GradientSurface style={styles.card}>
      <View style={styles.top}>
        <View style={styles.titles}>
          <Text style={styles.date}>{formatPulseDate(date)}</Text>
          <Text style={styles.title}>Attendance today</Text>
        </View>
        <Text style={styles.pct}>{`${pct}%`}</Text>
      </View>
      <View style={styles.divider} />
      <View style={styles.chips}>
        {chips.map(chip => (
          <View key={chip.label} style={styles.chip}>
            <Text style={styles.value} maxFontSizeMultiplier={VALUE_FONT_CAP}>{chip.value}</Text>
            <Text style={styles.label} numberOfLines={2} maxFontSizeMultiplier={LABEL_FONT_CAP}>
              {chip.label}
            </Text>
          </View>
        ))}
      </View>
      </GradientSurface>
    </Pressable>
  );
}

const styles = StyleSheet.create({
  card: {
    padding: spacing.s4,
    gap: spacing.s3,
  },
  pressed: {
    opacity: 0.92,
  },
  top: {
    flexDirection: 'row',
    alignItems: 'flex-end',
    justifyContent: 'space-between',
    gap: spacing.s3,
  },
  titles: {
    flexShrink: 1,
    gap: spacing.s1,
  },
  date: {
    ...typography.bodySm,
    color: colors.onPrimaryFaint,
  },
  title: {
    ...typography.title,
    color: colors.onPrimary,
  },
  pct: {
    ...typography.display,
    color: colors.onPrimary,
  },
  divider: {
    height: 1,
    backgroundColor: colors.onPrimarySoft,
  },
  chips: {
    flexDirection: 'row',
    gap: spacing.s2,
  },
  chip: {
    flex: 1,
    alignItems: 'center',
    gap: spacing.s1,
    paddingVertical: spacing.s3,
    paddingHorizontal: spacing.s1,
    borderRadius: radius.lg,
    backgroundColor: colors.onPrimarySoft,
  },
  value: {
    ...typography.title,
    color: colors.onPrimary,
  },
  label: {
    flexShrink: 1,
    textAlign: 'center',
    ...typography.caption,
    color: colors.onPrimaryFaint,
  },
});
