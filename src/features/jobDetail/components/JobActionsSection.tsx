import { StyleSheet, View } from 'react-native';
import { Button } from '../../../components/ui';
import { colors, spacing } from '../../../theme';

type Props = {
  jobStatus: string;
  onEdit: () => void;
  onCancel: () => void;
};

export function JobActionsSection({ jobStatus, onEdit, onCancel }: Props) {
  // Epic 22 (CAP-5): a pending employee job takes owner edits too — the
  // owner may fix any field before approving. Cancel stays available (the
  // backend cancels a pending job and tells the creator).
  if (jobStatus !== 'scheduled' && jobStatus !== 'pending_approval') {
    return null;
  }

  return (
    <View testID="job-detail-actions" style={styles.actionsRow}>
      <Button
        variant="secondary"
        size="md"
        style={styles.editButton}
        onPress={onEdit}>
        Edit job
      </Button>
      <Button
        variant="ghost"
        size="md"
        labelColor={colors.danger}
        onPress={onCancel}>
        Cancel job
      </Button>
    </View>
  );
}

const styles = StyleSheet.create({
  actionsRow: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: spacing.s3,
  },
  editButton: {
    flex: 1,
  },
});
