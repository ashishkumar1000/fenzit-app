/**
 * TechJobDetailScreen — the technician's one-screen view of a job, fetched
 * fresh on every open (the attachments' presigned URLs are 1-hour and
 * regenerated per call — a refetch is the only retry, so the detail is
 * never cached, matching the owner detail's reasoning).
 *
 * This file owns state only: fetch (single-flight, chained reloads, abort),
 * the back header, the pull-to-refresh, and which view to show (error states
 * vs the loaded content, which lives in `TechJobDetailContent`). The 3.3
 * workflow advance lives in `useWorkflowAdvance`; this screen only routes
 * its branches (a 403 → the unassigned view).
 *
 * A 403 means the job is no longer assigned to the caller (reassigned away)
 * — a dedicated view explains it and refetches Today on the way out, so the
 * stale card is gone when the technician lands back on the list. The 403
 * arms `wasUnassignedRef` on ANY load (first or refresh), not just the first.
 */
import { useCallback, useEffect, useRef, useState } from 'react';
import {
  ActivityIndicator,
  AccessibilityInfo,
  Alert,
  RefreshControl,
  ScrollView,
  StatusBar,
  StyleSheet,
  Text,
  View,
} from 'react-native';
import { SafeAreaView } from 'react-native-safe-area-context';
import { ChevronLeft } from 'lucide-react-native';
import {
  useFocusEffect,
  useNavigation,
  useRoute,
  type RouteProp,
} from '@react-navigation/native';
import type { NativeStackNavigationProp } from '@react-navigation/native-stack';
import { Badge, Button, IconButton } from '../../components/ui';
import { colors, radius, spacing, typography } from '../../theme';
import { jobService } from '../../services';
import type { ApiError, JobDetail } from '../../services';
import type { TechnicianRootStackParamList } from '../../navigation/types';
import { useMyProfileSnapshot } from '../profile/useMyProfile';
import { apiJobOf, loadToday, upsertTechnicianJob } from './useTechnicianJobs';
import { upsertJob } from '../jobs/useJobs';
import { jobDetailDecisionNote } from '../team/teamModel';
import { statusToBadge } from '../jobs/format';
import { actionBarAction } from './workflowActionBarModel';
import { useWorkflowAdvance } from './useWorkflowAdvance';
import { FailedView, NotFoundView, UnassignedView } from './components/DetailErrorViews';
import { TechJobDetailContent } from './components/TechJobDetailContent';
import { WorkflowActionBar } from './components/WorkflowActionBar';
import { RejectJobSheet } from '../jobDetail/components/RejectJobSheet';
import { isAbort } from '../../utils';

type Navigation = NativeStackNavigationProp<TechnicianRootStackParamList, 'TechJobDetail'>;

/** Badge labels — the one title-case exception in the design system. */
const STATUS_LABEL = {
  done: 'Done',
  progress: 'In Progress',
  scheduled: 'Scheduled',
  pendingApproval: 'Pending approval',
  rejected: 'Rejected',
  cancelled: 'Cancelled',
} as const;

export default function TechJobDetailScreen() {
  const navigation = useNavigation<Navigation>();
  // Route-params guard: a deep link that lands here without a jobId has
  // nothing to show — pop back instead of crashing.
  const jobId = useRoute<RouteProp<TechnicianRootStackParamList, 'TechJobDetail'>>().params?.jobId;

  // Epic 24 — a reporting manager may open a report's job from "Your team".
  // That job is READ-ONLY here: the workflow bar, the stepper advances and
  // the shared-store upserts belong to the assignee. The profile is the
  // caller's own id, read from the store the shell already loaded (this
  // screen never starts a `/users/me` of its own); a missing profile keeps
  // the pre-24-5 behaviour rather than hiding a technician's bar.
  const profile = useMyProfileSnapshot();
  const myId = profile?.id ?? null;
  const myIdRef = useRef<string | null>(myId);
  myIdRef.current = myId;

  const [detail, setDetail] = useState<JobDetail | null>(null);
  const [error, setError] = useState<ApiError | null>(null);
  const [isRefreshing, setIsRefreshing] = useState(false);
  // Epic 24 — the manager's decision bar on a pending job they may decide.
  const [rejectOpen, setRejectOpen] = useState(false);
  const [deciding, setDeciding] = useState<'approve' | 'reject' | null>(null);
  const decideLatch = useRef(false);

  // The in-flight load's promise: new loads chain behind it (never silently
  // dropped — the advance failure paths MUST land their refetch) but never
  // overlap, so responses can't interleave or land out of order.
  const inflightRef = useRef<Promise<void> | null>(null);
  // Bumped when local truth moves ahead of a started refetch (3.3's advance
  // landing while one is in flight) — the refetch's stale commit is dropped.
  const detailGenRef = useRef(0);
  // The in-flight request's controller, aborted when the screen unmounts.
  const latestControllerRef = useRef<AbortController | null>(null);
  // Flipped on unmount — a chained load must not fire a fresh request after
  // the screen is gone.
  const mountedRef = useRef(true);
  // Set when a 403 lands — the leaving refetch only fires for this case.
  const wasUnassignedRef = useRef(false);
  // The advance hook's error-clearer, called on a fresh refetch commit —
  // stale bar copy must not survive fresh server truth. A ref because load
  // and the advance hook need each other.
  const clearActionErrorRef = useRef<() => void>(() => {});

  const showUnassigned = useCallback((apiError: ApiError) => {
    // Armed on EVERY load and surfaced in every mode — a reassignment
    // mid-session must show the unassigned view whether the 403 lands on
    // mount, on a refresh, or mid-advance.
    wasUnassignedRef.current = true;
    setDetail(null);
    setError(apiError);
  }, []);

  const load = useCallback(
    async (showSpinner = true) => {
      if (!jobId) return;
      const waiting = inflightRef.current;
      if (waiting) {
        await waiting;
        // Only the FIRST chained caller proceeds — if another queued load
        // claimed the slot while we waited, it owns the refresh (and an
        // unmounted screen fires nothing).
        if (!mountedRef.current || (inflightRef.current !== null && inflightRef.current !== waiting)) {
          return;
        }
      }
      const controller = new AbortController();
      latestControllerRef.current = controller;
      const { signal } = controller;
      const gen = detailGenRef.current;
      const request = (async () => {
        // A pull-to-refresh keeps its content on screen (the RefreshControl
        // spinner is feedback enough); only the first load shows the spinner.
        if (showSpinner) {
          setError(null);
        }
        try {
          const fresh = await jobService.getById(jobId, signal);
          // An advance landed while this request was away — the response
          // predates local truth and would silently revert it.
          if (detailGenRef.current !== gen) return;
          setDetail(fresh);
          setError(null);
          clearActionErrorRef.current();
          // Push the ApiJob subset (NO presigned URLs) into BOTH shared
          // stores so the lists stay honest without a refetch: Today's
          // replace-in-place row, and the Jobs tab's `useJobs` row (its
          // today-scope prepend is a no-op elsewhere — same limits the
          // owner's JobDetail accepts). Epic 24: ONLY the assignee's own
          // read writes these stores — a manager reading a report's job
          // must not prepend it into their own Today list.
          const mine = myIdRef.current;
          if (mine == null || fresh.technicianId === mine) {
            upsertTechnicianJob(apiJobOf(fresh));
            upsertJob(apiJobOf(fresh));
          }
        } catch (caught) {
          const apiError = caught as ApiError;
          if (isAbort(apiError, signal)) return;
          if (apiError.status === 403) {
            showUnassigned(apiError);
          } else if (showSpinner) {
            setDetail(null);
            setError(apiError);
          } else {
            // A failed refresh keeps its content on screen — the spinner
            // ending is the only feedback; log so it isn't silent.
            console.warn('[TechJobDetail] refresh failed →', apiError);
          }
        } finally {
          inflightRef.current = null;
        }
      })();
      inflightRef.current = request;
      return request;
    },
    [jobId, showUnassigned],
  );

  /**
   * Epic 24 — approve/decline a pending job from the record screen. Success
   * reloads the detail (the decision changed the status); a 409 means the
   * job was decided elsewhere, so the reload reconciles instead of shouting.
   */
  const decide = useCallback(
    async (kind: 'approve' | 'reject', reason?: string) => {
      if (detail == null || decideLatch.current) return;
      decideLatch.current = true;
      setDeciding(kind);
      try {
        await jobService.decidePending(detail.id, kind, reason);
        if (!mountedRef.current) return;
        AccessibilityInfo.announceForAccessibility(
          kind === 'approve' ? 'Job approved' : 'Job declined',
        );
        setRejectOpen(false);
        void load(false);
      } catch (caught) {
        const apiError = caught as ApiError;
        if (apiError.code === 'JOB_NOT_PENDING') {
          setRejectOpen(false);
          void load(false);
          return;
        }
        Alert.alert(
          "Couldn't save the decision",
          apiError.message || 'Please try again.',
        );
      } finally {
        decideLatch.current = false;
        if (mountedRef.current) setDeciding(null);
      }
    },
    [detail, load],
  );

  // Fetch on mount; the in-flight request is aborted if the screen unmounts.
  useEffect(() => {
    if (!jobId) return;
    void load();
    return () => {
      mountedRef.current = false;
      latestControllerRef.current?.abort();
    };
  }, [load, jobId]);

  // 3.5 — returning from the Signature screen (capture done or abandoned)
  // silently refetches: the new signature attachment and the advanced step
  // land without a spinner. The first focus IS the mount load — skip it.
  const hasFocusedRef = useRef(false);
  useFocusEffect(
    useCallback(() => {
      if (!hasFocusedRef.current) {
        hasFocusedRef.current = true;
        return;
      }
      void load(false);
    }, [load]),
  );

  // Back that works from anywhere: when this screen is the only route on the
  // stack (deep link), `goBack` would strand the user — reset to the tabs.
  const goBackSafely = useCallback(() => {
    if (navigation.canGoBack()) {
      navigation.goBack();
    } else {
      navigation.navigate('TechnicianTabs');
    }
  }, [navigation]);

  // Route-params guard: no jobId in the params → leave immediately.
  useEffect(() => {
    if (jobId) return;
    goBackSafely();
  }, [jobId, goBackSafely]);

  // Leaving after a 403: force a Today refetch so the reassigned job's card
  // is gone (or relabelled) by the time the list is visible again. beforeRemove
  // covers both the header back and the hardware/gesture back.
  useEffect(
    () =>
      navigation.addListener('beforeRemove', () => {
        if (wasUnassignedRef.current) void loadToday({ force: true });
      }),
    [navigation],
  );

  const handleRefresh = useCallback(() => {
    // No busy guard needed: load chains behind an in-flight request and
    // always resolves, so the RefreshControl spinner can't stick.
    setIsRefreshing(true);
    void load(false).finally(() => setIsRefreshing(false));
  }, [load]);

  // 3.3 — one-tap workflow advance (bottom action bar / next stepper row).
  // The hook owns the in-flight step, the idempotency-key lifecycle and the
  // failure branches (`useWorkflowAdvance` header has the race-hardening
  // detail); the screen owns only where those branches route.
  const { pendingStep, actionError, clearActionError, advance } = useWorkflowAdvance({
    jobId,
    detail,
    setDetail,
    detailGenRef,
    load,
    onUnassigned: showUnassigned,
    // 3.5 — the signature step captures on the dedicated screen.
    onCaptureSignature: (stepKey: string) => {
      if (!jobId || !stepKey || !detail?.workflowTemplate?.steps) return;
      navigation.navigate('Signature', { jobId, stepKey, steps: detail.workflowTemplate.steps });
    },
    // 7.7 — the location capture step uses a dedicated screen.
    onCaptureLocation: (stepKey: string) => {
      if (!jobId || !stepKey) return;
      navigation.navigate('LocationCapture', { jobId, stepKey });
    },
  });
  clearActionErrorRef.current = clearActionError;

  if (!jobId) return null;

  const unassigned = Boolean(error && error.status === 403);
  const notFound = Boolean(error && error.status === 404);
  const failedWithNoDetail = Boolean(error && !detail && !unassigned && !notFound);
  const urgent = detail?.priority === 'urgent';
  const statusBadge = detail ? statusToBadge(detail.status) : null;
  // 3.3 — the bar's content is derived, never stored: it re-derives from the
  // detail on every render (status, current step, activity log). `none`
  // (cancelled) unmounts the bar entirely. Photo count feeds the photo-step
  // branch: photos already on the job turn the hint pill into a manual
  // Continue button (early uploads can't trigger the server auto-advance).
  const photoCount = detail
    ? detail.attachments.filter(a => a.type === 'photo').length
    : 0;
  const action = detail ? actionBarAction(detail, detail.activityLog, photoCount) : null;
  // Epic 24 — the workflow belongs to the assignee. A manager reading a
  // report's job sees the record, never a "Start job" they cannot post.
  const isOwnJob =
    myId == null ||
    detail == null ||
    detail.technicianId === myId ||
    detail.createdBy === myId;
  const barAction = action && action.kind !== 'none' && isOwnJob ? action : null;

  return (
    <SafeAreaView style={styles.root} edges={['top']}>
      <StatusBar barStyle="dark-content" />
      <View style={styles.header}>
        <IconButton
          variant="ghost"
          size="md"
          label="Go back"
          onPress={goBackSafely}>
          <ChevronLeft size={22} color={colors.textStrong} strokeWidth={2} />
        </IconButton>
        <Text style={styles.title} numberOfLines={1}>
          {/* Placeholder while loading / on an error view (deep-link safe). */}
          {detail?.jobNumber ?? 'Job'}
        </Text>
        {statusBadge && detail ? (
          <View style={styles.headerBadges}>
            {urgent ? (
              // Urgent borrows the cancelled palette — red communicates
              // urgency without inventing a new status colour.
              <Badge status="cancelled" tone="soft" size="sm">
                Urgent
              </Badge>
            ) : null}
            <Badge status={statusBadge} dot size="sm">
              {STATUS_LABEL[statusBadge] ?? detail.status}
            </Badge>
          </View>
        ) : null}
      </View>

      {unassigned ? (
        <UnassignedView onBack={goBackSafely} />
      ) : notFound ? (
        <NotFoundView onBack={goBackSafely} />
      ) : failedWithNoDetail ? (
        <FailedView
          message={error?.message ?? 'Something went wrong'}
          onRetry={() => void load()}
        />
      ) : !detail ? (
        <View style={styles.centered}>
          <ActivityIndicator size="large" color={colors.primary} />
        </View>
      ) : (
        <>
          <ScrollView
            contentContainerStyle={styles.content}
            showsVerticalScrollIndicator={false}
            refreshControl={
              <RefreshControl
                refreshing={isRefreshing}
                onRefresh={handleRefresh}
                colors={[colors.primary]}
                tintColor={colors.primary}
              />
            }>
            {/* Epic 22 (CAP-5) — the creator sees the owner's rejection
                reason on the job. The badge alone says "Rejected"; the
                reason is what the review promise made visible. A rejected
                job with NO reason still reads the badge honestly. */}
            {detail.status === 'rejected' && detail.rejectionReason ? (
              <View style={styles.rejectionNote}>
                <Badge status="rejected" dot size="sm">
                  Owner's reason
                </Badge>
                <Text style={styles.rejectionText}>{detail.rejectionReason}</Text>
              </View>
            ) : null}
            <TechJobDetailContent
              detail={detail}
              canAct={isOwnJob}
              onAdvance={isOwnJob ? advance : undefined}
              pendingStep={isOwnJob ? pendingStep : null}
              // 3.4 — a confirmed photo upload refetches the detail (no
              // spinner): the grid re-renders from server truth, including a
              // fresh read URL for the just-uploaded photo.
              onPhotosConfirmed={() => void load(false)}
              // 3.5 — the captured tile's Re-capture affordance reopens the
              // pad (AC 6; the refetch on the focus effect above refreshes it).
              onRecaptureSignature={() => {
                if (!jobId || !detail?.workflowTemplate?.steps || detail.workflowTemplate.steps.length === 0) return;
                const signatureStep = detail.workflowTemplate.steps.find(s => s?.requiresSignature);
                if (!signatureStep?.key) return;
                navigation.navigate('Signature', { jobId, stepKey: signatureStep.key, steps: detail.workflowTemplate.steps });
              }}
            />
          </ScrollView>
          {barAction ? (
            <WorkflowActionBar
              action={barAction}
              pending={pendingStep !== null}
              onAdvance={advance}
              error={actionError}
              onDismissError={clearActionError}
            />
          ) : null}

          {/* Epic 24 — the manager's decision bar for a pending job. The
              workflow bar above never coexists (a pending job has no
              advance), and a row somebody closer owns shows the quiet
              reason instead of buttons. */}
          {detail.status === 'pending_approval' && detail.decision?.canDecide === true ? (
            <SafeAreaView edges={['bottom']} style={styles.decisionFooter}>
              <Text style={styles.decisionNote}>
                Approve it to schedule it like any other job.
              </Text>
              <View style={styles.decisionRow}>
                <Button
                  variant="secondary"
                  size="lg"
                  style={styles.decisionButton}
                  disabled={deciding != null}
                  loading={deciding === 'reject'}
                  onPress={() => setRejectOpen(true)}>
                  Decline
                </Button>
                <Button
                  variant="primary"
                  size="lg"
                  style={styles.decisionButton}
                  disabled={deciding != null}
                  loading={deciding === 'approve'}
                  onPress={() => void decide('approve')}>
                  Approve
                </Button>
              </View>
            </SafeAreaView>
          ) : detail.status === 'pending_approval' && detail.decision != null ? (
            <SafeAreaView edges={['bottom']} style={styles.decisionFooter}>
              <Text style={styles.decisionNote}>
                {jobDetailDecisionNote(detail.decision, detail.technician?.name) ?? ''}
              </Text>
            </SafeAreaView>
          ) : null}

          <RejectJobSheet
            visible={rejectOpen}
            jobNumber={detail.jobNumber}
            employeeName={detail.technician?.name ?? null}
            submitting={deciding === 'reject'}
            onClose={() => setRejectOpen(false)}
            onConfirm={reason => void decide('reject', reason || undefined)}
          />
        </>
      )}
    </SafeAreaView>
  );
}

const styles = StyleSheet.create({
  root: {
    flex: 1,
    backgroundColor: colors.surfacePage,
  },
  rejectionNote: {
    backgroundColor: colors.status.rejected.bg,
    borderWidth: 1,
    borderColor: colors.status.rejected.border,
    borderRadius: radius.lg,
    padding: spacing.s4,
    gap: spacing.s2,
  },
  rejectionText: {
    ...typography.body,
    color: colors.status.rejected.fg,
  },
  decisionFooter: {
    borderTopWidth: 1,
    borderTopColor: colors.borderDefault,
    backgroundColor: colors.surfaceCard,
    paddingHorizontal: spacing.s4,
    paddingTop: spacing.s3,
    paddingBottom: spacing.s3,
    gap: spacing.s2,
  },
  decisionNote: {
    ...typography.bodySm,
    color: colors.textMuted,
  },
  decisionRow: {
    flexDirection: 'row',
    gap: spacing.s3,
  },
  decisionButton: {
    flex: 1,
  },
  // Back header pattern (spec §0): icon button + title@20 + trailing badge,
  // hairline under.
  header: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: spacing.s3,
    paddingHorizontal: spacing.s4,
    paddingVertical: spacing.s2,
    borderBottomWidth: 1,
    borderBottomColor: colors.borderSubtle,
  },
  title: {
    ...typography.title,
    fontSize: 20,
    lineHeight: 24,
    color: colors.textStrong,
    flex: 1,
  },
  headerBadges: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: spacing.s2,
  },
  centered: {
    flex: 1,
    alignItems: 'center',
    justifyContent: 'center',
    padding: spacing.s4,
  },
  // Screen scroll (spec §8): padding s4, gap s4, and a deep bottom inset that
  // clears 3.3's bottom action bar before it exists.
  content: {
    padding: spacing.s4,
    gap: spacing.s4,
    paddingBottom: spacing.s20,
  },
});
