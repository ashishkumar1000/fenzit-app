/**
 * TeamLeavePane — the manager's Leave segment: the subtree's pending
 * requests with the decision matrix rendered from each row's `decision`
 * (Epic 24, story 24-5). The row tap opens the shipped LeaveDetailSheet in
 * its manager variant — balances, the "also off" glance, and the same
 * approve/decline writes.
 *
 * The queue never guesses permission: no `decision.canDecide` means no
 * buttons, and the server re-checks every write.
 */
import { useCallback, useEffect, useRef, useState } from 'react';
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
import type { LeaveRequestRow } from '../../../services';
import {
  LeaveDetailSheet,
  type LeaveDetailActionState,
} from '../../attendance/leave/LeaveDetailSheet';
import { LeaveBalancesCard } from '../../attendance/leave/LeaveBalancesCard';
import { LeaveRequestCard } from '../../attendance/leave/LeaveRequestCard';
import { useDetailBalances } from '../../attendance/leave/useDetailBalances';
import { useTeamLeaveQueue } from '../useTeamLeaveQueue';
import { useTeammatesOff } from '../useTeammatesOff';
import { decisionNote, firstName } from '../teamModel';

export function TeamLeavePane(input: {
  myId: string | null;
  enabled: boolean;
  /** The segment label's announced count (actionable rows), or null while loading. */
  onCountChange?: (count: number | null) => void;
}) {
  const { myId, enabled, onCountChange } = input;
  const queue = useTeamLeaveQueue({ myId, enabled });
  const [detail, setDetail] = useState<LeaveRequestRow | null>(null);
  const [detailStage, setDetailStage] = useState<'detail' | 'reject'>('detail');
  const [actionState, setActionState] = useState<LeaveDetailActionState>({ kind: 'idle' });
  const writeLatch = useRef(false);

  const actionableCount = queue.items.filter(row => row.decision?.canDecide === true).length;
  useEffect(() => {
    onCountChange?.(queue.loading ? null : actionableCount);
  }, [onCountChange, queue.loading, actionableCount]);

  const balances = useDetailBalances(detail?.employeeId ?? null);
  const teammatesOff = useTeammatesOff({
    request:
      detail == null
        ? null
        : {
            employeeId: detail.employeeId,
            startDate: detail.startDate,
            endDate: detail.endDate,
          },
    myId,
    enabled: detail != null,
  });

  const openDetail = useCallback((row: LeaveRequestRow, stage: 'detail' | 'reject' = 'detail') => {
    setActionState({ kind: 'idle' });
    setDetailStage(stage);
    setDetail(row);
  }, []);

  const runWrite = useCallback(
    async (action: 'approve' | 'reject', reason?: string) => {
      if (detail == null || writeLatch.current) return;
      writeLatch.current = true;
      setActionState({ kind: 'submitting', action });
      const result = await queue.decide(detail, action, reason);
      writeLatch.current = false;
      if (result.ok) {
        setDetail(null);
        setActionState({ kind: 'idle' });
        return;
      }
      // handled → the sheet's neutral notice + OK; error → the server's
      // message stays above the buttons and the sheet stays open.
      setActionState(
        result.kind === 'handled'
          ? { kind: 'handled' }
          : { kind: 'error', message: result.message },
      );
    },
    [detail, queue],
  );

  const approvingId = queue.busyId;

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

  const readOnlyNoteFor = (row: LeaveRequestRow) =>
    row.decision?.canDecide === false ? decisionNote(row.decision, row.employeeName) : null;

  return (
    <>
      <FlatList
        data={queue.items}
        keyExtractor={row => row.id}
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
            description="Leave requests from your team will show up here."
            style={styles.empty}
          />
        }
        renderItem={({ item }) => {
          const note = readOnlyNoteFor(item);
          const canDecide = item.decision?.canDecide === true;
          return (
            <LeaveRequestCard
              request={item}
              approving={approvingId === item.id}
              readOnlyNote={note}
              onPress={() => openDetail(item)}
              onApprove={canDecide ? () => void queue.decide(item, 'approve') : undefined}
              onDecline={canDecide ? () => openDetail(item, 'reject') : undefined}
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
                  <Text style={styles.footerText}>Couldn&apos;t load more requests.</Text>
                  <Button variant="ghost" size="sm" onPress={() => void queue.loadMore()}>
                    Retry
                  </Button>
                </>
              ) : null}
            </View>
          ) : undefined
        }
      />

      <LeaveDetailSheet
        visible={detail != null}
        request={detail}
        actionState={actionState}
        openStage={detailStage}
        readOnlyNote={
          detail != null && detail.decision?.canDecide === false
            ? decisionNote(detail.decision, detail.employeeName)
            : null
        }
        teammatesOffLine={teammatesOff.line}
        balancesSlot={
          detail != null ? (
            <LeaveBalancesCard
              balances={balances.balances}
              loading={balances.loading}
              error={balances.error}
              compact
              title={
                detail.employeeName
                  ? `${firstName(detail.employeeName)}'s leave balances`
                  : 'Leave balances'
              }
            />
          ) : undefined
        }
        onClose={() => {
          setDetail(null);
          setDetailStage('detail');
          setActionState({ kind: 'idle' });
        }}
        onApprove={() => void runWrite('approve')}
        onReject={reason => void runWrite('reject', reason)}
        onDismissHandled={() => {
          setDetail(null);
          setActionState({ kind: 'idle' });
        }}
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
