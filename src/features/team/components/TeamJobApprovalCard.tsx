/**
 * TeamJobApprovalCard — one pending employee-created job in the manager's
 * Jobs segment (Epic 24, story 24-5). Deliberately decision-shaped, not the
 * owner's triage card: job number, who submitted it, the customer, the slot
 * and the tagged service. The footer is the row's decision matrix — approve
 * or decline when the server says `canDecide`, otherwise the quiet reason.
 */
import { StyleSheet, Text, View } from 'react-native';
import { Clock, MapPin } from 'lucide-react-native';
import { Badge, Button, Card } from '../../../components/ui';
import { colors, spacing, typography } from '../../../theme';
import { formatIstDateLabel } from '../../../utils/istDate';
import { formatTimeLabel } from '../../jobs/format';
import type { ApiJob } from '../../../services';

export function TeamJobApprovalCard(input: {
  job: ApiJob;
  /** The creator's display name, resolved from the team directory. */
  fromName: string;
  /** The customer's display name from the row's thin embed. */
  customerName: string;
  /** The inline approve write in flight (the pane owns the latch). */
  approving?: boolean;
  onPress?: () => void;
  onApprove?: () => void;
  onDecline?: () => void;
  /** Present when the server says someone else decides this row. */
  readOnlyNote?: string | null;
}) {
  const { job, fromName, customerName, approving = false, onPress, onApprove, onDecline, readOnlyNote } = input;
  const when = `${formatIstDateLabel(job.scheduledStart)}, ${formatTimeLabel(
    job.scheduledStart,
    job.scheduledEnd,
  )}`;
  const busy = approving;
  const showActions = readOnlyNote == null && (onApprove != null || onDecline != null);

  return (
    <Card
      interactive={onPress != null}
      disabled={busy && onPress != null}
      onPress={onPress}
      accessibilityRole={onPress != null ? 'button' : undefined}
      accessibilityLabel={`Job ${job.jobNumber} from ${fromName} for ${customerName}, ${when}${
        job.skill?.name ? `, ${job.skill.name}` : ''
      }, pending approval${
        readOnlyNote != null ? `, ${readOnlyNote}` : ''
      }`}>
      <View style={styles.headerRow}>
        <Text style={styles.jobNumber} numberOfLines={1}>
          {job.jobNumber}
        </Text>
        <Badge status="pendingApproval" tone="soft" size="sm" dot>
          Pending approval
        </Badge>
      </View>

      <View style={styles.fromLine}>
        <Text style={styles.label}>From </Text>
        <Text style={styles.person} numberOfLines={1}>
          {fromName}
        </Text>
      </View>
      <View style={styles.fromLine}>
        <Text style={styles.label}>For </Text>
        <Text style={styles.person} numberOfLines={1}>
          {customerName}
        </Text>
      </View>

      <View style={styles.metaBox}>
        <View style={styles.metaRow}>
          <Clock size={15} color={colors.textMuted} strokeWidth={2} />
          <Text style={styles.metaText} numberOfLines={1}>
            {when}
            {job.skill?.name ? ` · ${job.skill.name}` : ''}
          </Text>
        </View>
        {job.serviceLocation ? (
          <View style={styles.metaRow}>
            <MapPin size={15} color={colors.textMuted} strokeWidth={2} />
            <Text style={styles.metaText} numberOfLines={1}>
              {job.serviceLocation}
            </Text>
          </View>
        ) : null}
      </View>

      {showActions ? (
        <View style={styles.actionRow}>
          <Button
            variant="secondary"
            size="sm"
            disabled={busy}
            onPress={onDecline}
            style={styles.actionBtn}>
            Decline
          </Button>
          <Button
            variant="primary"
            size="sm"
            loading={approving}
            disabled={busy}
            onPress={onApprove}
            style={styles.actionBtn}>
            Approve
          </Button>
        </View>
      ) : null}

      {readOnlyNote != null ? (
        <Text style={styles.decisionNote} accessibilityLiveRegion="polite">
          {readOnlyNote}
        </Text>
      ) : null}
    </Card>
  );
}

const styles = StyleSheet.create({
  headerRow: {
    flexDirection: 'row',
    alignItems: 'center',
    justifyContent: 'space-between',
    gap: spacing.s2,
  },
  jobNumber: {
    ...typography.bodyStrong,
    color: colors.textStrong,
    flexShrink: 1,
  },
  fromLine: {
    flexDirection: 'row',
    alignItems: 'baseline',
    marginTop: spacing.s2,
  },
  label: {
    ...typography.bodySm,
    color: colors.textMuted,
  },
  person: {
    ...typography.bodyStrong,
    color: colors.textStrong,
    flexShrink: 1,
  },
  metaBox: {
    marginTop: spacing.s3,
    backgroundColor: colors.surfaceSunken,
    borderRadius: 12,
    padding: spacing.s3,
    gap: spacing.s1,
  },
  metaRow: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: spacing.s2,
  },
  metaText: {
    ...typography.bodySm,
    color: colors.textBody,
    flexShrink: 1,
  },
  actionRow: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: spacing.s3,
    marginTop: spacing.s3,
  },
  actionBtn: {
    flex: 1,
  },
  decisionNote: {
    ...typography.bodySm,
    color: colors.textMuted,
    marginTop: spacing.s3,
  },
});
