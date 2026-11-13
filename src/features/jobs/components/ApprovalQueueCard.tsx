/**
 * ApprovalQueueCard — one row of the owner's Pending segment (Epic 22
 * story 4): the job number and who created it lead, the customer and the
 * submission age sit beneath, and the whole card opens the job detail where
 * the approve/reject decision lives. Age wording follows the queue
 * endpoint's whole-hour count: "5h ago", "2d ago" past 24.
 */
import { Pressable, StyleSheet, Text, View } from 'react-native';
import { ChevronRightIcon, ClockIcon } from '../icons';
import { colors, radius, spacing, typography } from '../../../theme';
import type { ApprovalQueueItem } from '../../../services';

/** Whole hours → "5h ago" / "2d ago" / "Just now". */
function ageLabel(ageHours: number): string {
  if (ageHours < 1) return 'Just now';
  if (ageHours < 24) return `${ageHours}h ago`;
  return `${Math.floor(ageHours / 24)}d ago`;
}

type Props = {
  item: ApprovalQueueItem;
  onPress: (jobId: string) => void;
};

export function ApprovalQueueCard({ item, onPress }: Props) {
  const submitter = item.employee?.name ?? 'An employee';
  return (
    <Pressable
      accessibilityRole="button"
      accessibilityLabel={`Review job ${item.jobNumber} from ${submitter}`}
      onPress={() => onPress(item.id)}
      style={({ pressed }) => [styles.card, pressed && styles.pressed]}>
      <View style={styles.headRow}>
        {/* The waiting-age chip is the row's reason for being sorted here —
            it leads the eye to what has waited longest. */}
        <View style={styles.ageChip}>
          <ClockIcon size={12} color={colors.status.pendingApproval.fg} strokeWidth={2} />
          <Text style={styles.ageText}>{ageLabel(item.ageHours)}</Text>
        </View>
        <Text style={styles.jobNumber} numberOfLines={1}>
          {item.jobNumber}
        </Text>
        <ChevronRightIcon size={18} color={colors.textMuted} strokeWidth={2} />
      </View>
      <Text style={styles.line} numberOfLines={1}>
        <Text style={styles.lineLabel}>From </Text>
        {submitter}
      </Text>
      <Text style={styles.line} numberOfLines={1}>
        <Text style={styles.lineLabel}>For </Text>
        {item.customerName ?? '—'}
      </Text>
    </Pressable>
  );
}

const styles = StyleSheet.create({
  card: {
    backgroundColor: colors.surfaceCard,
    borderRadius: radius.lg,
    padding: spacing.s4,
    borderWidth: 1,
    borderColor: colors.borderSubtle,
    gap: spacing.s1,
  },
  pressed: {
    opacity: 0.85,
  },
  headRow: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: spacing.s2,
  },
  ageChip: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: 4,
    backgroundColor: colors.status.pendingApproval.bg,
    borderWidth: 1,
    borderColor: colors.status.pendingApproval.border,
    borderRadius: radius.pill,
    paddingHorizontal: spacing.s2,
    paddingVertical: 2,
  },
  ageText: {
    ...typography.caption,
    color: colors.status.pendingApproval.fg,
    fontWeight: '600',
    fontVariant: ['tabular-nums'],
  },
  jobNumber: {
    ...typography.body,
    color: colors.textStrong,
    fontWeight: '600',
    flexShrink: 1,
    flexGrow: 1,
  },
  line: {
    ...typography.body,
    color: colors.textBody,
    paddingLeft: 2,
  },
  lineLabel: {
    color: colors.textMuted,
  },
});
