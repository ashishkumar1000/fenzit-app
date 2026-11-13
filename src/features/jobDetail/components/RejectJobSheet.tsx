/**
 * RejectJobSheet — the owner's reject confirmation (Epic 22 story 4): the
 * DS `Sheet` with an optional reason field (the employee sees the reason
 * with the rejection; leaving it blank rejects without one — the backend
 * stores null). Confirm hands `{ reason }` to the screen's decision
 * handler; the sheet owns nothing but its form state.
 */
import { useEffect, useState } from 'react';
import { StyleSheet, View } from 'react-native';
import { Button, Input, Sheet } from '../../../components/ui';
import { colors, spacing } from '../../../theme';

type Props = {
  visible: boolean;
  /** The job's human reference, quoted in the subtitle. */
  jobNumber: string | null;
  /** The employee who created the job — the subtitle names them. */
  employeeName: string | null;
  /** True while the rejection request is in flight. */
  submitting: boolean;
  onClose: () => void;
  onConfirm: (reason: string) => void;
};

export function RejectJobSheet({
  visible,
  jobNumber,
  employeeName,
  submitting,
  onClose,
  onConfirm,
}: Props) {
  const [reason, setReason] = useState('');

  // A fresh form every open — a previously typed reason must not survive
  // into a later rejection of a different job.
  useEffect(() => {
    if (visible) setReason('');
  }, [visible]);

  const who = employeeName?.trim() || 'The employee';

  return (
    <Sheet
      visible={visible}
      onClose={onClose}
      // While the rejection request is in flight, drag-down and Android back
      // are blocked at the native level (the same rule EditJobSheet applies).
      dismissible={!submitting}
      title="Reject this job?"
      subtitle={
        jobNumber
          ? `${who} created ${jobNumber}. A reason is optional — they'll see it on the job.`
          : "A reason is optional — they'll see it on the job."
      }>
      <View style={styles.body}>
        <Input
          label="Reason (optional)"
          value={reason}
          onChangeText={setReason}
          placeholder="Why is this job not approved?"
          multiline
          maxLength={500}
          accessibilityLabel="Rejection reason"
        />
        {/* The destructive-text confirm (ghost + red label), not brand blue:
            blue is the app's "go" colour and this is the decline path — the
            confirm must not read more positive than the footer that opened
            it (Sally review 2026-11-13). */}
        <Button
          variant="secondary"
          size="md"
          labelColor={colors.status.rejected.fg}
          disabled={submitting}
          onPress={() => onConfirm(reason.trim())}>
          Reject job
        </Button>
      </View>
    </Sheet>
  );
}

const styles = StyleSheet.create({
  body: {
    gap: spacing.s4,
    paddingHorizontal: spacing.s4,
    paddingBottom: spacing.s6,
  },
});
