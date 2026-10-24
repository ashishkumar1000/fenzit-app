/**
 * TodayClock — the Today tab's device clock block (the approved redesign):
 * the big time ("9:43 PM", meridiem a step down) over the long date.
 * Device-local wall clock — the summary's server times are a different
 * concern (ShiftStrip). Pure: the ticked `now` comes from the screen's
 * one useNow, so the whole page ages together.
 */
import { StyleSheet, Text, View } from 'react-native';
import { colors, typography } from '../../../theme';

export function TodayClock({ now }: { now: number }) {
  const d = new Date(now);
  const h24 = d.getHours();
  const hour12 = h24 % 12 === 0 ? 12 : h24 % 12;
  const minute = String(d.getMinutes()).padStart(2, '0');
  const meridiem = h24 < 12 ? 'AM' : 'PM';
  // Pinned to en-IN like formatLongDate — the same date renders alike on
  // every device, and the output stays assertable in tests.
  const date = d
    .toLocaleDateString('en-IN', {
      weekday: 'long',
      day: 'numeric',
      month: 'short',
      year: 'numeric',
    })
    .replace('Sept', 'Sep');

  return (
    <View style={styles.block}>
      <Text style={styles.time}>
        {`${hour12}:${minute}`}
        <Text style={styles.meridiem}>{` ${meridiem}`}</Text>
      </Text>
      <Text style={styles.date}>{date}</Text>
    </View>
  );
}

const styles = StyleSheet.create({
  block: {
    alignSelf: 'center',
    alignItems: 'center',
    gap: 2,
  },
  time: {
    ...typography.title,
    fontSize: 34,
    fontWeight: '800',
    color: colors.textStrong,
    fontVariant: ['tabular-nums'],
  },
  meridiem: {
    fontSize: 16,
    fontWeight: '700',
    color: colors.textMuted,
  },
  date: {
    ...typography.body,
    color: colors.textMuted,
  },
});
