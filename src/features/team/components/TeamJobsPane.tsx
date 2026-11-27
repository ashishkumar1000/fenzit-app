/**
 * TeamJobsPane — the manager's Jobs segment (Epic 24, story 24-5): pending
 * employee-created jobs strictly below the caller, decided inline or from
 * the job detail's decision bar (the row tap). A decline opens the shipped
 * RejectJobSheet for the optional reason.
 */
import { useCallback, useEffect, useMemo, useState } from 'react';
import {
  ActivityIndicator,
  FlatList,
  RefreshControl,
  StyleSheet,
  Text,
  View,
} from 'react-native';
import { CheckCircle2 } from 'lucide-react-native';
import { Button, EmptyState, InlineError, Skeleton } from '../../../components/ui';
import { colors, spacing, typography } from '../../../theme';
import type { ApiJob, TeamSummary } from '../../../services';
import { RejectJobSheet } from '../../jobDetail/components/RejectJobSheet';
import { useTeamJobQueue } from '../useTeamJobQueue';
import { jobDecisionNote } from '../teamModel';
import { TeamJobApprovalCard } from './TeamJobApprovalCard';

export function TeamJobsPane(input: {
  team: TeamSummary | undefined;
  enabled: boolean;
  /** The segment label's announced count (actionable rows), or null while loading. */
  onCountChange?: (count: number | null) => void;
  onOpenJob: (jobId: string) => void;
}) {
  const { team, enabled, onCountChange, onOpenJob } = input;
  const queue = useTeamJobQueue({ enabled });
  const [rejecting, setRejecting] = useState<ApiJob | null>(null);
  const [submittingReject, setSubmittingReject] = useState(false);
  const [rejectError, setRejectError] = useState<string | null>(null);

  const actionableCount = queue.items.filter(job => job.decision?.canDecide === true).length;
  useEffect(() => {
    onCountChange?.(queue.loading ? null : actionableCount);
  }, [onCountChange, queue.loading, actionableCount]);

  const names = useMemo(() => {
    const map = new Map<string, string>();
    for (const member of team?.members ?? []) {
      map.set(member.userId, member.name?.trim() || 'Team member');
    }
    return map;
  }, [team]);

  const fromName = useCallback(
    (job: ApiJob) => (job.createdBy != null ? names.get(job.createdBy) ?? 'Team member' : 'Team member'),
    [names],
  );

  const confirmReject = useCallback(
    async (reason: string) => {
      if (rejecting == null) return;
      setSubmittingReject(true);
      setRejectError(null);
      const result = await queue.decide(rejecting, 'reject', reason);
      setSubmittingReject(false);
      if (result.ok || result.kind === 'handled') {
        // Success removes the row; handled is the server's already-decided
        // truth. Either way the sheet has said all it can.
        setRejecting(null);
        queue.clearActionError();
        return;
      }
      // A real failure keeps the sheet open with the typed reason intact;
      // the message sits above the buttons.
      setRejectError(result.message);
    },
    [queue, rejecting],
  );

  if (queue.loading) {
    return (
      <View style={styles.pad}>
        <Skeleton rows={3} height={150} />
      </View>
    );
  }

  if (queue.error != null && queue.items.length === 0) {
    return (
      <View style={styles.pad}>
        <InlineError message={queue.error} />
        <Button variant="secondary" size="md" fullWidth onPress={queue.retry}>
          Retry
        </Button>
      </View>
    );
  }

  return (
    <>
      <FlatList
        data={queue.items}
        keyExtractor={job => job.id}
        contentContainerStyle={[
          styles.list,
          queue.items.length === 0 ? styles.listEmpty : null,
        ]}
        refreshControl={
          <RefreshControl
            refreshing={queue.refreshing}
            onRefresh={queue.onRefresh}
            tintColor={colors.primary}
          />
        }
        onEndReachedThreshold={0.4}
        onEndReached={() => void queue.loadMore()}
        ListHeaderComponent={
          <View style={styles.header}>
            {queue.error != null && queue.items.length > 0 ? (
              // A failed refresh keeps the rows; say why they may be stale.
              <InlineError message={queue.error} />
            ) : null}
            {queue.notice != null ? (
              <InlineError message={queue.notice} onDismiss={queue.clearNotice} />
            ) : null}
            {queue.actionError != null ? (
              <InlineError message={queue.actionError} onDismiss={queue.clearActionError} />
            ) : null}
          </View>
        }
        ListEmptyComponent={
          <EmptyState
            icon={<CheckCircle2 size={26} color={colors.status.done.fg} strokeWidth={2} />}
            title="Nothing waiting for you"
            description="Jobs your team submits for approval will show up here."
            style={styles.empty}
          />
        }
        renderItem={({ item }) => {
          const note =
            item.decision?.canDecide === false
              ? jobDecisionNote(item.decision, fromName(item))
              : null;
          const canDecide = item.decision?.canDecide === true;
          return (
            <TeamJobApprovalCard
              job={item}
              fromName={fromName(item)}
              customerName={item.customer?.name?.trim() || 'Customer'}
              approving={queue.busyId === item.id}
              readOnlyNote={note}
              onPress={() => onOpenJob(item.id)}
              onApprove={canDecide ? () => void queue.decide(item, 'approve') : undefined}
              onDecline={canDecide ? () => {
                setRejectError(null);
                setRejecting(item);
              } : undefined}
            />
          );
        }}
        ListFooterComponent={
          queue.items.length > 0 ? (
            <View style={styles.footer}>
              {queue.loadingMore ? (
                <ActivityIndicator color={colors.primary} />
              ) : queue.loadMoreError ? (
                <>
                  <Text style={styles.footerText}>Couldn&apos;t load more jobs.</Text>
                  <Button variant="ghost" size="sm" onPress={() => void queue.loadMore()}>
                    Retry
                  </Button>
                </>
              ) : null}
            </View>
          ) : undefined
        }
      />

      <RejectJobSheet
        visible={rejecting != null}
        jobNumber={rejecting?.jobNumber ?? null}
        employeeName={rejecting ? fromName(rejecting) : null}
        submitting={submittingReject}
        error={rejectError}
        onClose={() => {
          if (!submittingReject) {
            setRejecting(null);
            setRejectError(null);
          }
        }}
        onConfirm={reason => void confirmReject(reason)}
      />
    </>
  );
}

const styles = StyleSheet.create({
  pad: {
    paddingHorizontal: spacing.s4,
    paddingTop: spacing.s3,
    gap: spacing.s3,
  },
  list: {
    paddingHorizontal: spacing.s4,
    paddingTop: spacing.s3,
    paddingBottom: spacing.s6,
    gap: spacing.s3,
  },
  listEmpty: {
    flexGrow: 1,
    justifyContent: 'center',
  },
  header: {
    gap: spacing.s3,
  },
  empty: {
    paddingVertical: spacing.s6,
  },
  footer: {
    alignItems: 'center',
    gap: spacing.s2,
    paddingVertical: spacing.s3,
  },
  footerText: {
    ...typography.bodySm,
    color: colors.textMuted,
  },
});
