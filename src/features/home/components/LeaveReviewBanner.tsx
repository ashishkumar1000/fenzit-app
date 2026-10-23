/**
 * LeaveReviewBanner — the attendance banner on Home's "Today & needs
 * attention" section (CAP-4; visually supersedes the 20-1 AC 12
 * pointer-row anatomy inside this story): the count line, the "action
 * pending" subtitle, and an explicit Review button — the banner's SOLE
 * press target (the card itself is not pressable; one control, one
 * action). In the leave hue family (the calendar's leave glyph colour —
 * one vocabulary). A count only, never pending leave rows inline.
 */
import { StyleSheet, Text, View } from 'react-native';
import { CalendarCheck2 } from 'lucide-react-native';
import { Button, Card } from '../../../components/ui';
import { colors, radius, spacing, typography } from '../../../theme';

export type LeaveReviewBannerProps = {
  count: number;
  onPress: () => void;
};

export function LeaveReviewBanner({ count, onPress }: LeaveReviewBannerProps) {
  return (
    <Card padding="md" style={styles.banner}>
      <CalendarCheck2 size={20} color={colors.status.leave.solid} strokeWidth={2} />
      <View style={styles.texts}>
        {/* The count rides the title line — singular/plural stays honest
            (a "1 requests" label is a trust failure). One string, so the
            line reads (and is testable) as a single Text child. */}
        <Text style={styles.title}>
          {`${count} ${count === 1 ? 'leave request' : 'leave requests'}`}
        </Text>
        <Text style={styles.subtitle}>Action pending approval</Text>
      </View>
      <Button variant="primary" size="sm" onPress={onPress}>
        Review
      </Button>
    </Card>
  );
}

const styles = StyleSheet.create({
  banner: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: spacing.s3,
    backgroundColor: colors.status.leave.bg,
    borderColor: colors.status.leave.border,
    borderRadius: radius.lg,
  },
  texts: {
    flex: 1,
    minWidth: 0,
    gap: 1,
  },
  title: {
    ...typography.labelStrong,
    color: colors.textStrong,
  },
  subtitle: {
    ...typography.caption,
    color: colors.status.leave.fg,
  },
});
