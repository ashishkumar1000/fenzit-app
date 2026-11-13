/**
 * PendingJobsRow — the employee Jobs tab's Pending entry point, as an amber
 * action row pinned under the four scope tabs (2026-11-13 rework, Sally's
 * review: five full-word scopes can never fit one tab row on a phone — the
 * row lived permanently scrolled with "Today" cut off. Pending is not a
 * timeline bucket anyway; it's "jobs waiting for the owner's decision",
 * which reads as an action row, not a peer of "Today").
 *
 * Same amber vocabulary as the Home strip's waiting row (the employee
 * already knows it). The row deliberately carries no count: the amber row
 * is an entry point, and the glance counts live on the My-jobs record and
 * the Home strip ("N waiting") — repeating them here would make the row
 * lie whenever a fetch is stale. (The caller DOES have
 * `profile.jobCounts.pending` in scope — a design choice, not a data gap.)
 * While the Pending list is open the row renders active (deeper amber) so
 * "you are here" survives outside the tab row; the tabs above remain the
 * way out.
 */
import { Pressable, StyleSheet, Text, View } from 'react-native';
import { ChevronRightIcon } from '../../jobs/icons';
import { colors, radius, spacing, touch, typography } from '../../../theme';

type Props = {
  /** True while the Pending list is open — the row is where you are. */
  active?: boolean;
  onPress: () => void;
};

export function PendingJobsRow({ active, onPress }: Props) {
  return (
    <Pressable
      accessibilityRole="button"
      accessibilityState={{ selected: !!active }}
      accessibilityHint="Opens the jobs waiting for your owner's approval"
      onPress={onPress}
      style={({ pressed }) => [
        styles.row,
        active ? styles.rowActive : null,
        pressed && styles.pressed,
      ]}>
      <View style={[styles.dot, active ? styles.dotActive : null]} />
      <Text style={styles.label}>
        Jobs waiting for approval
      </Text>
      <ChevronRightIcon size={18} color={colors.status.pendingApproval.fg} strokeWidth={2} />
    </Pressable>
  );
}

const styles = StyleSheet.create({
  row: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: spacing.s2,
    minHeight: touch.min,
    backgroundColor: colors.status.pendingApproval.bg,
    borderWidth: 1,
    borderColor: colors.status.pendingApproval.border,
    borderRadius: radius.md,
    paddingHorizontal: spacing.s3,
    paddingVertical: spacing.s2,
  },
  rowActive: {
    backgroundColor: colors.status.pendingApproval.border,
  },
  pressed: {
    opacity: 0.85,
  },
  dot: {
    width: 8,
    height: 8,
    borderRadius: radius.pill,
    backgroundColor: colors.status.pendingApproval.solid,
  },
  dotActive: {
    backgroundColor: colors.status.pendingApproval.fg,
  },
  label: {
    ...typography.bodyStrong,
    color: colors.status.pendingApproval.fg,
    flex: 1,
  },
});
