/**
 * HolidaySectionHead — a Holidays list section label ("Upcoming holidays")
 * with a small count pill beside it. The label stays an a11y header (it is
 * the DS `Eyebrow`), so a screen reader can jump between sections.
 */
import { StyleSheet, Text, View } from 'react-native';
import { Eyebrow } from '../../../components/ui';
import { colors, radius, spacing, typography } from '../../../theme';

type Props = {
  label: string;
  count: number;
};

export default function HolidaySectionHead({ label, count }: Props) {
  return (
    <View style={styles.head}>
      <Eyebrow>{label}</Eyebrow>
      <View style={styles.pill}>
        <Text style={styles.count}>{count}</Text>
      </View>
    </View>
  );
}

const styles = StyleSheet.create({
  head: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: spacing.s2,
    marginTop: spacing.s2,
  },
  pill: {
    minWidth: 24,
    paddingHorizontal: spacing.s2,
    paddingVertical: 2,
    borderRadius: radius.pill,
    alignItems: 'center',
    backgroundColor: colors.surfaceSunken,
  },
  count: {
    ...typography.captionStrong,
    color: colors.textMuted,
  },
});
