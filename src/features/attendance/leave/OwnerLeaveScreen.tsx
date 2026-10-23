/**
 * OwnerLeaveScreen — the owner's Leave surface (Story 17-6, spec D1/D2):
 * a full-width "Apply on behalf" CTA card (the OfficesScreen "Add new
 * office" idiom — visible on both tabs, above the list), a Pending | All
 * SegmentedControl, and the request list. The data side (per-tab
 * pagination, cursor isolation, stale marks, focus/foreground refreshes)
 * lives in `useOwnerLeaveQueue`.
 *
 * The row tap opens LeaveDetailSheet; the decision writes live here so the
 * outcome can drive the list branches: approve/reject success REMOVES the
 * row from Pending (a filtered list) / REPLACES it in All, marks both tabs
 * stale, announces, and closes the sheet; a revoke success (17-7) does the
 * list work the same way but morphs the sheet back to the REFRESHED detail
 * view; 409 already-handled leaves the sheet open on the notice and
 * refetches the row's truth.
 *
 * Dual-hosting (CAP-1): the screen stays a pushed root-stack route AND
 * embeds as the Attendance tab page's Leave pane. `embedded` drops the
 * pushed-screen chrome the pane host already provides (back header, top
 * SafeArea), starts the queue at the host's `initialTab` (always 'pending'
 * today) and makes the `{ tab }` param consume PUSHED-MODE ONLY — embedded,
 * `route.params` (when a host ever passes one) is the tab PAGE's param and
 * must never be read or cleared here.
 */
import { useCallback, useEffect, useRef, useState } from 'react';
import { AccessibilityInfo, ActivityIndicator, FlatList, Pressable, RefreshControl, StyleSheet, Text, View } from 'react-native';
import { CalendarOff, Users } from 'lucide-react-native';
import { SafeAreaView } from 'react-native-safe-area-context';
import type { NativeStackScreenProps } from '@react-navigation/native-stack';
import { Button, EmptyState, InlineError, SegmentedControl, Skeleton } from '../../../components/ui';
import { LeaveEmptyArt } from './LeaveEmptyArt';
import { colors, radius, spacing, typography } from '../../../theme';
import { attendanceLeaveService } from '../../../services';
import type { ApiError } from '../../../services/api/apiError';
import type { LeaveRequestRow } from '../../../services/resources/attendanceLeave';
import type { RootStackParamList } from '../../../navigation/types';
import { VIEW_ONLY_REASON, useCanWrite } from '../../auth';
import { loadMyProfile } from '../../profile';
import ScreenHeader from '../offices/ScreenHeader';
import { LeaveRequestRow as LeaveRequestRowView } from './LeaveRequestRow';
import { LeaveDetailSheet, type LeaveDetailActionState } from './LeaveDetailSheet';
import { classifyLeaveWriteFailure, type LeaveTab } from './ownerLeaveModel';
import { useOwnerLeaveQueue } from './useOwnerLeaveQueue';

type StackProps = NativeStackScreenProps<RootStackParamList, 'OwnerLeave'>;

type Props = Omit<StackProps, 'route'> & {
  /** The navigator's route — absent when hosted as a tab pane (the page
   *  owns the route; embedded panes never read its params). */
  route?: StackProps['route'];
  /** Tab-pane hosting: no pushed-screen header, no top SafeArea inset,
   *  and the `{ tab }` param consume is pushed-mode only. */
  embedded?: boolean;
  /** Pane hosting's entry tab (the pushed mode reads the `{ tab }` route
   *  param instead); defaults to 'pending'. */
  initialTab?: LeaveTab;
};

const SEGMENTS = [
  { value: 'pending' as const, label: 'Pending' },
  { value: 'all' as const, label: 'All' },
];

/**
 * Leave review is for company admins. A viewer cannot read leave requests
 * (they can carry medical reasons), so they get one plain explanation
 * instead of a list that would only fail. The wrapper keeps the queue hook
 * (and its fetches) from ever running for a viewer.
 */
export default function OwnerLeaveScreen(props: Props) {
  const { navigation, embedded } = props;
  const canWrite = useCanWrite();
  if (!canWrite) {
    return (
      <SafeAreaView style={styles.root} edges={embedded ? [] : ['top']}>
        {embedded ? null : (
          <ScreenHeader title="Leave" onBack={() => navigation.goBack()} />
        )}
        <View style={styles.emptyWrap}>
          <EmptyState
            illustration={<LeaveEmptyArt />}
            icon={<CalendarOff size={24} color={colors.primary} strokeWidth={1.5} />}
            title={VIEW_ONLY_REASON}
            description="Leave requests can only be seen and decided by your company admin."
          />
        </View>
      </SafeAreaView>
    );
  }
  return <OwnerLeaveContent {...props} />;
}

function OwnerLeaveContent({ navigation, route, embedded, initialTab }: Props) {
  // Entry tab: pushed mode reads the merged `{ tab }` deep-link param; pane
  // mode takes the host's prop (the page-level param is the TAB PAGE's —
  // the Review landing — never this pane's).
  const queue = useOwnerLeaveQueue(
    navigation,
    embedded
      ? (initialTab ?? 'pending')
      : route?.params?.tab === 'all'
        ? 'all'
        : 'pending',
  );
  const { state, activeTab, refreshing, refreshFailedTab } = queue;

  // The detail sheet's request + the host-owned write state.
  const [detail, setDetail] = useState<LeaveRequestRow | null>(null);
  const [actionState, setActionState] = useState<LeaveDetailActionState>({
    kind: 'idle',
  });
  const writeLatch = useRef(false);
  const mounted = useRef(true);
  useEffect(() => {
    mounted.current = true;
    return () => {
      mounted.current = false;
    };
  }, []);

  // Deep link / on-behalf landing: consume the merged `{ tab }` param —
  // pushed mode ONLY. Embedded, the route belongs to the tab PAGE (its
  // `tab` is this story's Review landing: 'leave'), which this pane must
  // never read or clear.
  const navTab = route?.params?.tab;
  useEffect(() => {
    if (embedded) return;
    if (navTab !== 'pending' && navTab !== 'all') return;
    queue.consumeTabParam(navTab, () => navigation.setParams({ tab: undefined }));
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [navTab, embedded]);

  // --- The decision write (D2 lifecycle; 17-7 D3 adds the revoke). --------
  const runWrite = useCallback(
    (action: 'approve' | 'reject' | 'revoke', reason?: string) => {
      if (detail == null || writeLatch.current) return; // double-tap no-op
      writeLatch.current = true;
      setActionState({ kind: 'submitting', action });
      const call =
        action === 'approve'
          ? attendanceLeaveService.approveLeave(detail.id)
          : action === 'reject'
            ? attendanceLeaveService.rejectLeave(detail.id, reason ? reason : undefined)
            : attendanceLeaveService.revokeLeave(detail.id, reason ?? '');
      call
        .then(view => {
          if (!mounted.current) return;
          // Own-retry answers 200 here too — one success path (BE D7).
          AccessibilityInfo.announceForAccessibility(
            action === 'approve'
              ? 'Leave approved'
              : action === 'reject'
                ? 'Leave rejected'
                : 'Leave revoked',
          );
          queue.dispatch({ type: 'removeRow', id: view.id }); // Pending: filtered
          queue.dispatch({ type: 'replaceRow', row: view }); // All: in place
          queue.dispatch({ type: 'markStale', tabs: ['pending', 'all'] });
          // The decision must reach the shared /users/me mirror too — the
          // Attendance tab's badge and Home's banner read it (forced past
          // the focus throttle).
          void loadMyProfile({ force: true });
          if (action === 'revoke') {
            // D3: the stage morphs back to the REFRESHED detail view (the
            // write response is authoritative — divergence is absorbed;
            // the optional split arrays are never required). The write
            // view carries no employeeName (list-only wire truth) — keep
            // the row's list-earned name (the replaceRow discipline).
            setDetail({ ...view, employeeName: view.employeeName ?? detail.employeeName });
          } else {
            setDetail(null);
          }
          setActionState({ kind: 'idle' });
        })
        .catch((err: ApiError) => {
          if (!mounted.current) return;
          const failure = classifyLeaveWriteFailure(err, action);
          if (failure.kind === 'already-handled') {
            // No auto-close timer — the owner reads the notice; OK closes.
            setActionState({ kind: 'handled' });
            queue.dispatch({ type: 'markStale', tabs: ['pending', 'all'] });
            // The row refetches to its true state (the visible tab now).
            queue.fetchFirst(activeTab);
            return;
          }
          // offline | failed — both carry the verbatim message.
          setActionState({ kind: 'error', message: failure.message });
        })
        .finally(() => {
          writeLatch.current = false;
        });
    },
    [detail, queue, activeTab],
  );

  const page = state[activeTab];

  return (
    <SafeAreaView style={styles.root} edges={embedded ? [] : ['top']}>
      {embedded ? null : (
        <ScreenHeader title="Leave" onBack={() => navigation.goBack()} />
      )}

      <FlatList
        contentContainerStyle={styles.content}
        showsVerticalScrollIndicator={false}
        data={page.items}
        keyExtractor={request => request.id}
        renderItem={({ item }) => (
          <LeaveRequestRowView
            request={item}
            variant="owner"
            showStatus={activeTab === 'all'}
            onPress={() => {
              setDetail(item);
              setActionState({ kind: 'idle' });
            }}
          />
        )}
        onEndReached={() => void queue.loadMore()}
        onEndReachedThreshold={0.4}
        ListHeaderComponent={
          <View style={styles.listHeader}>
            <Pressable
              accessibilityRole="button"
              accessibilityLabel="Apply on behalf"
              onPress={() => navigation.navigate('ApplyOnBehalf', undefined)}
              style={({ pressed }) => [styles.cta, pressed && styles.ctaPressed]}>
              <View style={styles.ctaIcon}>
                <Users size={20} color={colors.primary} strokeWidth={2.2} />
              </View>
              <View style={styles.ctaTexts}>
                <Text style={styles.ctaTitle}>Apply on behalf</Text>
                <Text style={styles.ctaSubtitle}>
                  Apply leave for a team member
                </Text>
              </View>
            </Pressable>
            <SegmentedControl
              options={SEGMENTS}
              value={activeTab}
              onChange={queue.switchTab}
            />
            {refreshFailedTab === activeTab && page.loaded ? (
              <InlineError message="Couldn't refresh. Showing the last loaded list." />
            ) : null}
          </View>
        }
        ListEmptyComponent={
          !page.loaded && page.loading ? (
            // First load: a list-shaped shimmer, labelled (the 19-5
            // idiom); the load-more footer keeps its inline spinner.
            <View style={styles.skeletonBlock} accessibilityLabel="Loading attendance">
              <Skeleton rows={6} height={76} />
            </View>
          ) : !page.loaded ? (
            <View style={styles.stateBlock} accessibilityLiveRegion="polite">
              <InlineError message="Couldn't load leave requests. Check your connection and try again." />
              <Button variant="secondary" onPress={() => queue.fetchFirst(activeTab)}>
                Retry
              </Button>
            </View>
          ) : page.items.length === 0 ? (
            <View style={styles.emptyWrap}>
              <EmptyState
                illustration={<LeaveEmptyArt />}
                icon={<CalendarOff size={24} color={colors.primary} strokeWidth={1.5} />}
                title={activeTab === 'pending' ? 'No pending requests' : 'No leave requests yet'}
                description={
                  activeTab === 'pending'
                    ? "You're all caught up. New leave requests will show up here."
                    : 'When your team applies for leave, it will show up here.'
                }
              />
            </View>
          ) : undefined
        }
        ListFooterComponent={
          page.loading && page.loaded && !refreshing ? (
            <View style={styles.footerSpinner}>
              <ActivityIndicator size="small" color={colors.primary} />
            </View>
          ) : undefined
        }
        refreshControl={
          <RefreshControl refreshing={refreshing} onRefresh={queue.onRefresh} />
        }
      />

      <LeaveDetailSheet
        visible={detail != null}
        request={detail}
        actionState={actionState}
        onClose={() => {
          if (actionState.kind === 'submitting') return; // latch mid-write
          setDetail(null);
          setActionState({ kind: 'idle' });
        }}
        onApprove={() => runWrite('approve')}
        onReject={reason => runWrite('reject', reason)}
        onRevoke={reason => runWrite('revoke', reason)}
        onDismissHandled={() => {
          setDetail(null);
          setActionState({ kind: 'idle' });
        }}
      />
    </SafeAreaView>
  );
}

const styles = StyleSheet.create({
  root: {
    flex: 1,
    backgroundColor: colors.surfacePage,
  },
  content: {
    paddingTop: spacing.s4,
    paddingHorizontal: spacing.s4,
    gap: spacing.s3,
    // The empty posture centers in the pane (owner mockup 2026-10-23):
    // flexGrow lets emptyWrap's flex centering own the viewport height.
    flexGrow: 1,
  },
  listHeader: {
    gap: spacing.s3,
  },
  footerSpinner: {
    paddingVertical: spacing.s3,
  },
  stateBlock: {
    gap: spacing.s3,
    paddingVertical: spacing.s10,
    alignItems: 'center',
    justifyContent: 'center',
  },
  skeletonBlock: {
    gap: spacing.s3,
    paddingVertical: spacing.s10,
  },
  emptyWrap: {
    flexGrow: 1,
    justifyContent: 'center',
  },
  cta: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: spacing.s3,
    backgroundColor: colors.primary,
    borderRadius: radius.lg,
    padding: spacing.s4,
    marginTop: spacing.s2,
  },
  ctaPressed: {
    opacity: 0.9,
  },
  ctaIcon: {
    width: 40,
    height: 40,
    borderRadius: radius.md,
    backgroundColor: colors.primarySoft,
    alignItems: 'center',
    justifyContent: 'center',
  },
  ctaTexts: {
    flex: 1,
    minWidth: 0,
    gap: 1,
  },
  ctaTitle: {
    ...typography.heading,
    color: colors.onPrimary,
  },
  ctaSubtitle: {
    ...typography.caption,
    color: colors.onPrimary,
    opacity: 0.8,
  },
});
