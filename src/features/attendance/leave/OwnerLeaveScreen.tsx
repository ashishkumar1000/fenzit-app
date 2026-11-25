/**
 * OwnerLeaveScreen — the owner's Leave surface, rewritten to the two-tab
 * interior (the Stitch "Two-Tab Screen UX Redesign" mobile screens, 2026-
 * 11): Requests | Config SegmentedControl over the LeaveRequestsPane
 * (search, filter pills, cards) and the LeaveTypesPane (the catalog chips
 * + rules editor). The data orchestration (useLeaveRequests) and every
 * WRITE live here — the sheet's decline/revoke and the card's inline
 * Approve both dispatch into the same per-filter reducer, so a decided
 * row leaves every loaded list and all filters mark stale. Approve is the
 * one INLINE direct write (input-less, state-guarded); its 409 already-
 * handled becomes the notice above the list plus a first-page refetch.
 * Decline and Revoke stay sheet-hosted via LeaveDetailSheet (the reason
 * opportunity lives there) with the shipped write posture.
 *
 * Dual-hosting (CAP-1): the screen stays a pushed root-stack route AND
 * embeds as the Attendance tab page's Leave pane. `embedded` drops the
 * pushed-screen chrome and makes the `{ tab, filter }` params consume
 * PUSHED-MODE ONLY — embedded, `route.params` (when a host ever passes
 * one) belongs to the tab page and must never be read or cleared here.
 *
 * Post-write bookkeeping (found on device): every decided row also
 * refreshes the pills' /summary snapshot and bumps the detail-balances
 * version — the badge moved via the /users/me mirror, and stale pills or
 * a stale in-sheet figure beside it contradict it.
 */
import { useCallback, useEffect, useRef, useState } from 'react';
import { AccessibilityInfo, StyleSheet, Text, View } from 'react-native';
import { CalendarOff } from 'lucide-react-native';
import { SafeAreaView } from 'react-native-safe-area-context';
import type { NativeStackScreenProps } from '@react-navigation/native-stack';
import { EmptyState, SegmentedControl } from '../../../components/ui';
import { LeaveEmptyArt } from './LeaveEmptyArt';
import { colors, spacing, typography } from '../../../theme';
import { attendanceLeaveService } from '../../../services';
import type { ApiError } from '../../../services/api/apiError';
import type { LeaveRequestRow } from '../../../services/resources/attendanceLeave';
import type { RootStackParamList } from '../../../navigation/types';
import { VIEW_ONLY_REASON, useCanWrite } from '../../auth';
import { loadMyProfile } from '../../profile';
import ScreenHeader from '../offices/ScreenHeader';
import { LeaveBalancesCard } from './LeaveBalancesCard';
import { LeaveDetailSheet, type LeaveDetailActionState } from './LeaveDetailSheet';
import { classifyLeaveWriteFailure } from './ownerLeaveModel';
import { LeaveRequestsPane, type RequestsWriteNotice } from './LeaveRequestsPane';
import { LeaveTypesPane } from './LeaveTypesPane';
import { useDetailBalances } from './useDetailBalances';
import { useLeaveRequests } from './useLeaveRequests';
import type { LeaveFilter } from './requestsModel';

type StackProps = NativeStackScreenProps<RootStackParamList, 'OwnerLeave'>;

type Props = Omit<StackProps, 'route'> & {
  /** The navigator's route — absent when hosted as a tab pane (the page
   *  owns the route; embedded panes never read its params). */
  route?: StackProps['route'];
  /** Tab-pane hosting: no pushed-screen header, no top SafeArea inset,
   *  and the `{ tab, filter }` param consume is pushed-mode only. */
  embedded?: boolean;
  /** Pane hosting's entry filter (the pushed mode reads the `{ filter }`
   *  route param instead); defaults to 'pending'. */
  initialFilter?: LeaveFilter;
};

/** Requests first (the owner's order, 2026-11-26); the rules editor's
 *  tab reads "Config" (the leave-type configuration pane). */
const PANE_SEGMENTS = [
  { value: 'requests' as const, label: 'Requests' },
  { value: 'types' as const, label: 'Config' },
];

/** The design's framing line — one sentence under the pane switch. */
const PANE_TAGLINE =
  "The leave your team can take, and the requests waiting on you — set each type's rules once, decide requests as they come.";

/**
 * Leave review is for company admins. A viewer cannot read leave requests
 * (they can carry medical reasons), so they get one plain explanation
 * instead of a list that would only fail. The wrapper keeps the hook (and
 * its fetches) from ever running for a viewer.
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

function OwnerLeaveContent({ navigation, route, embedded, initialFilter }: Props) {
  // Entry pane + filter: pushed mode reads the merged `{ tab, filter }`
  // deep-link params; pane mode takes the host's prop (the page-level
  // params are the TAB PAGE's — this pane must never read them).
  const [pane, setPane] = useState<'requests' | 'types'>(
    !embedded && route?.params?.tab === 'types' ? 'types' : 'requests',
  );
  const requests = useLeaveRequests(
    navigation,
    embedded
      ? (initialFilter ?? 'pending')
      : route?.params?.filter === 'all'
        ? 'all'
        : 'pending',
  );

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

  const [approvingId, setApprovingId] = useState<string | null>(null);
  const [approveNotice, setApproveNotice] = useState<RequestsWriteNotice | null>(null);
  // The inline write's latch — a ref, not state: a double-tap in the same
  // frame sees the state's stale closure, never the ref's sync set.
  const approveLatch = useRef(false);

  // --- 23-14 — the opened request's balances (the sheet renders the slot).
  // The version bumps after every successful write: the revoke success morph
  // swaps the refreshed view in without changing the employeeId, and the
  // employeeId-keyed effect would otherwise keep the pre-write figure.
  const [balancesVersion, setBalancesVersion] = useState(0);
  const detailBalances = useDetailBalances(detail?.employeeId ?? null, balancesVersion);
  /** The card title names whose balances these are — an admin is reading
   *  someone else's numbers (the review P2: "Your" reads as the admin's). */
  const balancesTitle = detail?.employeeName
    ? `${detail.employeeName.split(' ')[0]}'s leave balances`
    : undefined;

  // Deep link / on-behalf landing: consume the merged `{ tab, filter }`
  // params — pushed mode ONLY. Embedded, the route belongs to the tab
  // page, which this pane must never read or clear. A Requests landing is
  // always an intent to see fresh data — the target filter fetches
  // unconditionally (the 17-6 landing rule); a Types landing just opens
  // the tab.
  const navTab = route?.params?.tab;
  const navFilter = route?.params?.filter;
  useEffect(() => {
    if (embedded) return;
    if (navTab !== 'requests' && navTab !== 'types') return;
    setPane(navTab);
    if (navTab === 'requests') {
      requests.consumeFilter(navFilter === 'all' ? 'all' : 'pending');
    }
    navigation.setParams({ tab: undefined, filter: undefined });
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [navTab, navFilter, embedded]);

  // --- The inline Approve (the one direct write; input-less). --------------
  const approve = useCallback(
    (row: LeaveRequestRow) => {
      if (approveLatch.current) return; // double-tap no-op
      approveLatch.current = true;
      setApprovingId(row.id);
      setApproveNotice(null);
      attendanceLeaveService
        .approveLeave(row.id)
        .then(view => {
          if (!mounted.current) return;
          // Own-retry answers 200 here too — one success path (BE D7).
          AccessibilityInfo.announceForAccessibility('Leave approved');
          requests.dispatch({ type: 'decideRow', row: view });
          requests.dispatch({ type: 'markStale' });
          // The pills' snapshot refreshes NOW, not on the next focus — the
          // badge already moved; stale pills beside it contradict it (found
          // on device).
          requests.refreshCounts();
          setBalancesVersion(v => v + 1);
          // The decision must reach the shared /users/me mirror too — the
          // Attendance tab's badge and Home's banner read it (forced past
          // the focus throttle).
          void loadMyProfile({ force: true });
          setApprovingId(null);
        })
        .catch((err: ApiError) => {
          if (!mounted.current) return;
          setApprovingId(null);
          const failure = classifyLeaveWriteFailure(err, 'approve');
          if (failure.kind === 'already-handled') {
            setApproveNotice({ kind: 'handled', message: 'This request was already handled' });
            requests.dispatch({ type: 'markStale' });
            requests.fetchFirst(requests.activeFilter);
            requests.refreshCounts();
            void loadMyProfile({ force: true });
            return;
          }
          setApproveNotice({ kind: 'error', message: failure.message });
        })
        .finally(() => {
          approveLatch.current = false;
        });
    },
    [requests],
  );

  // --- The sheet-hosted writes (Approve; Decline: optional reason;
  // Revoke: the reason is REQUIRED on the wire). Same dispatches as the
  // inline write.
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
          requests.dispatch({ type: 'decideRow', row: view });
          requests.dispatch({ type: 'markStale' });
          requests.refreshCounts();
          setBalancesVersion(v => v + 1);
          void loadMyProfile({ force: true });
          if (action === 'revoke') {
            // The stage morphs back to the REFRESHED detail view (the
            // write response is authoritative — divergence is absorbed;
            // the optional split arrays are never required). The write
            // view carries none of the list-only enrichments (employee-
            // Name and its companions, the type/office names) — keep the
            // opened row's list-earned fields (the replaceRow discipline;
            // dropping leaveTypeName made the sheet's Leave-type row
            // vanish right after the decision — the review, 2026-11-26).
            setDetail({
              ...view,
              employeeName: view.employeeName ?? detail.employeeName,
              employeeAvatarUrl: view.employeeAvatarUrl ?? detail.employeeAvatarUrl,
              employeeCode: view.employeeCode ?? detail.employeeCode,
              leaveTypeName: view.leaveTypeName ?? detail.leaveTypeName,
              officeName: view.officeName ?? detail.officeName,
            });
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
            requests.dispatch({ type: 'markStale' });
            // The row refetches to its true state (the visible filter now).
            requests.fetchFirst(requests.activeFilter);
            requests.refreshCounts();
            void loadMyProfile({ force: true });
            return;
          }
          // offline | failed — both carry the verbatim message.
          setActionState({ kind: 'error', message: failure.message });
        })
        .finally(() => {
          writeLatch.current = false;
        });
    },
    [detail, requests],
  );

  const openRequest = useCallback((request: LeaveRequestRow) => {
    setDetail(request);
    setActionState({ kind: 'idle' });
  }, []);

  return (
    <SafeAreaView style={styles.root} edges={embedded ? [] : ['top']}>
      {embedded ? null : (
        <ScreenHeader title="Leave" onBack={() => navigation.goBack()} />
      )}

      <View style={styles.paneSwitch}>
        <SegmentedControl
          options={PANE_SEGMENTS}
          value={pane}
          onChange={setPane}
        />
        {/* The framing line explains the Rules editor — the Requests pane
            keeps its stack short (the review P2: five stacked elements
            pushed the first card past half the screen). */}
        {pane === 'types' ? <Text style={styles.tagline}>{PANE_TAGLINE}</Text> : null}
      </View>

      {pane === 'requests' ? (
        <LeaveRequestsPane
          requests={requests}
          approvingId={approvingId}
          writeNotice={approveNotice}
          onDismissNotice={() => setApproveNotice(null)}
          onApplyOnBehalf={() => navigation.navigate('ApplyOnBehalf', undefined)}
          onOpenRequest={openRequest}
          onApprove={approve}
        />
      ) : (
        <View style={styles.typesPane}>
          <LeaveTypesPane />
        </View>
      )}

      <LeaveDetailSheet
        visible={detail != null}
        request={detail}
        actionState={actionState}
        balancesSlot={
          detail ? (
            <LeaveBalancesCard
              balances={detailBalances.balances}
              loading={detailBalances.loading}
              error={detailBalances.error}
              title={balancesTitle}
              compact
            />
          ) : null
        }
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
  paneSwitch: {
    paddingHorizontal: spacing.s4,
    paddingTop: spacing.s2,
  },
  tagline: {
    ...typography.bodySm,
    color: colors.textMuted,
    marginTop: spacing.s2,
    marginHorizontal: spacing.s1,
  },
  typesPane: {
    flex: 1,
    paddingHorizontal: spacing.s4,
    paddingTop: spacing.s3,
  },
  emptyWrap: {
    flex: 1,
    justifyContent: 'center',
  },
});
