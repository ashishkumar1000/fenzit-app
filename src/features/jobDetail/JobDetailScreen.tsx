/**
 * JobDetailScreen — full-screen route for one job: everything about it on a
 * single scroll (header card, actions slot, customer, technician, photos &
 * signature, activity), fetched fresh on every open.
 *
 * The detail is screen-local state, deliberately NOT a shared store: the
 * attachments' presigned URLs are 1-hour, regenerated per call and may be
 * null — a refetch is the only retry for a null/expired URL, so the detail is
 * re-fetched on open (and on pull-to-refresh) and never cached (Dev Notes).
 *
 * A 404 (missing/cross-tenant) or 403 (technician not assigned — owners
 * shouldn't hit it) renders the friendly not-available view; other failures
 * get an inline error with Retry.
 */
import { useCallback, useEffect, useRef, useState } from 'react';
import {
  ActivityIndicator,
  Alert,
  Clipboard,
  RefreshControl,
  ScrollView,
  StatusBar,
  StyleSheet,
  Text,
  View,
} from 'react-native';
import { SafeAreaView } from 'react-native-safe-area-context';
import {
  ChevronLeft,
  Copy,
  FileQuestion,
  Info,
  XCircle,
} from 'lucide-react-native';
import { useNavigation, useRoute, type RouteProp } from '@react-navigation/native';
import type { NativeStackNavigationProp } from '@react-navigation/native-stack';
import {
  Badge,
  Button,
  Card,
  ConfirmDialog,
  EmptyState,
  IconButton,
  InlineError,
} from '../../components/ui';
import { colors, palette, radius, shadow, spacing, typography } from '../../theme';
import { jobService, mergeJobIntoDetail } from '../../services';
import type { ApiError, ApiJob, JobDetail } from '../../services';
import type { RootStackParamList } from '../../navigation/types';
import { upsertJob } from '../jobs';
import { removeApprovalQueueItem } from '../jobs/useApprovalQueue';
import { loadMyProfile, useMyProfile } from '../profile';
import { useCanWrite } from '../auth';
import { flattenApiMessage } from './editJobModel';
import { PersonRow } from './components/PersonRow';
import { ActivityTimeline } from './components/ActivityTimeline';
import { AttachmentGrid } from './components/AttachmentGrid';
import { EditJobSheet } from './components/EditJobSheet';
import { SectionCard } from './components/SectionCard';
import { WorkflowStatusCard } from './components/WorkflowStatus';
import { JobHeaderCard } from './components/JobHeaderCard';
import { JobActionsSection } from './components/JobActionsSection';
import { RejectJobSheet } from './components/RejectJobSheet';
import { eventLabel } from './eventLabels';
import {
  jobSiteCoords,
  lastKnownTechnicianLocation,
} from './locationMetadata';
import { formatTimeLabel, statusToBadge } from '../jobs/format';
import { formatPhone } from '../profile';
import { isAbort, openMaps, openTel } from '../../utils';

type Navigation = NativeStackNavigationProp<RootStackParamList, 'JobDetail'>;

export default function JobDetailScreen() {
  const navigation = useNavigation<Navigation>();
  // Route-params guard: a deep link that lands here without a jobId has
  // nothing to show — pop back (or to the tabs) instead of crashing.
  const jobId = useRoute<RouteProp<RootStackParamList, 'JobDetail'>>().params?.jobId;

  const [detail, setDetail] = useState<JobDetail | null>(null);
  const [isLoading, setIsLoading] = useState(true);
  const [error, setError] = useState<ApiError | null>(null);
  const [isRefreshing, setIsRefreshing] = useState(false);

  // Edit sheet. Technicians come from the shared profile store (`/users/me`)
  // — the only source of server-issued ids safe to send on a reassign.
  const { profile } = useMyProfile();
  const [isEditOpen, setIsEditOpen] = useState(false);
  // A viewer reads the job but cannot edit or cancel it — the actions slot
  // and the edit sheet are not rendered for them.
  const canWrite = useCanWrite();
  // Cancel job asks through the shared ConfirmDialog instead of a system
  // Alert (the 20-1 modal ask); `submitting` mirrors the cancel PATCH.
  const [cancelConfirmOpen, setCancelConfirmOpen] = useState(false);
  const [cancelSubmitting, setCancelSubmitting] = useState(false);

  // Epic 22 — the approve/reject decision on a pending employee job. The
  // reject sheet carries the optional reason; both paths share the handler.
  const [isRejectOpen, setIsRejectOpen] = useState(false);
  const [deciding, setDeciding] = useState(false);
  // Which decision is in flight — the tapped button shows the spinner, so
  // the owner can tell which call is running (Sally review 2026-11-13).
  const [decidingKind, setDecidingKind] = useState<'approve' | 'reject' | null>(null);
  // A double-tap on Approve/Reject confirm must not fire the request twice —
  // same guard as the cancel PATCH.
  const isDecidingRef = useRef(false);

  // Copy affordances on the person cards (after the phone number): a brief
  // "Copied" note confirms the tap. Copies the raw diallable number.
  const [copiedPhone, setCopiedPhone] = useState<
    'customer' | 'technician' | null
  >(null);
  const copyResetRef = useRef<ReturnType<typeof setTimeout> | null>(null);
  useEffect(
    () => () => {
      if (copyResetRef.current) clearTimeout(copyResetRef.current);
    },
    [],
  );
  const copyPhone = useCallback(
    (side: 'customer' | 'technician', countryCode: string, phoneNumber: string) => {
      // No number, nothing to copy — mirror openTel's guard so a blank
      // half never earns the "Copied" feedback.
      if (!countryCode.trim() || !phoneNumber.trim()) return;
      void Clipboard.setString(`${countryCode}${phoneNumber}`);
      setCopiedPhone(side);
      if (copyResetRef.current) clearTimeout(copyResetRef.current);
      copyResetRef.current = setTimeout(() => setCopiedPhone(null), 2000);
    },
    [],
  );

  // One request at a time: a retry/refresh is ignored while a fetch is in
  // flight, so responses can't interleave or land out of order.
  const isBusyRef = useRef(false);
  // The in-flight request's controller, aborted when the screen unmounts —
  // so refresh/retry requests are cancelled too, not just the first load.
  const latestControllerRef = useRef<AbortController | null>(null);

  const load = useCallback(
    async (showSpinner = true) => {
      if (!jobId || isBusyRef.current) return;
      isBusyRef.current = true;
      const controller = new AbortController();
      latestControllerRef.current = controller;
      const { signal } = controller;
      // A pull-to-refresh keeps its content on screen (the RefreshControl
      // spinner is feedback enough); only the first load shows the spinner.
      if (showSpinner) {
        setIsLoading(true);
        setError(null);
      }
      try {
        setDetail(await jobService.getById(jobId, signal));
      } catch (caught) {
        const apiError = caught as ApiError;
        if (isAbort(apiError, signal)) return;
        if (showSpinner) {
          setDetail(null);
          setError(apiError);
        } else {
          // A failed refresh keeps its content on screen (spec §3) — the
          // spinner ending is the only feedback; log so it isn't silent.
          console.warn('[JobDetail] refresh failed →', apiError);
        }
      } finally {
        setIsLoading(false);
        isBusyRef.current = false;
      }
    },
    [jobId],
  );

  // Fetch on mount; the in-flight request is aborted if the screen unmounts.
  useEffect(() => {
    if (!jobId) return;
    void load();
    return () => latestControllerRef.current?.abort();
  }, [load, jobId]);

  // Back that works from anywhere: when this screen is the only route on the
  // stack (deep link), `goBack` would strand the user — reset to the tabs.
  const goBackSafely = useCallback(() => {
    if (navigation.canGoBack()) {
      navigation.goBack();
    } else {
      navigation.navigate('MainTabs');
    }
  }, [navigation]);

  // Route-params guard: no jobId in the params → leave immediately.
  useEffect(() => {
    if (jobId) return;
    goBackSafely();
  }, [jobId, goBackSafely]);

  const handleRefresh = useCallback(() => {
    // Busy guard here too, so a swallowed refresh can't leave the
    // RefreshControl spinner stuck on.
    if (isBusyRef.current) return;
    setIsRefreshing(true);
    void load(false).finally(() => setIsRefreshing(false));
  }, [load]);

  /**
   * Applies a successful mutation (edit save or cancel) everywhere at once:
   * the detail (response merged over the existing detail, so technician/
   * customer/log/attachments survive until the refetch), the jobs-list store,
   * and the profile store (status counts). Also refires the roster load —
   * the shared store de-duplicates the request.
   */
  const applyJobUpdate = useCallback((updated: ApiJob) => {
    // The mutation response is a LIST-shape job: its `technician`/`customer`
    // embeds are the thin `{ id, name }` pair (Epic 23), NOT the detail's
    // full profiles. Spreading it bare over `prev` clobbers skills/phones/
    // addresses and crashes the next render (`technician.skills.length` —
    // seen live in Crashlytics 2026-11). The helper keeps the detail's own
    // embeds; the silent refetch below brings fresh ones.
    setDetail(prev => mergeJobIntoDetail(prev, updated));
    upsertJob(updated);
    // Force: a successful mutation must land on Home's tiles immediately,
    // bypassing the focus-refresh throttle. Fire-and-forget — a failure here
    // is covered by Home's own focus refresh.
    void loadMyProfile({ force: true });
  }, []);

  const handleEditSaved = useCallback(
    (updated: ApiJob) => applyJobUpdate(updated),
    [applyJobUpdate],
  );

  const handleEditClosed = useCallback(() => {
    setIsEditOpen(false);
    // Silent refetch on close: after a save it renews the activity log, and
    // after a "job already started" close it shows the new status — the
    // busy guard makes overlapping calls harmless.
    void load(false);
  }, [load]);

  // Cancel PATCHes can't be deduplicated server-side — a double-tap on the
  // confirm button must not fire the request twice.
  const isCancellingRef = useRef(false);

  const handleCancelJob = useCallback(async () => {
    if (!detail || isCancellingRef.current) return;
    isCancellingRef.current = true;
    setCancelSubmitting(true);
    try {
      const updated = await jobService.update(detail.id, { status: 'cancelled' });
      applyJobUpdate(updated);
      void load(false);
    } catch (caught) {
      const apiError = caught as ApiError;
      if (apiError.code === 'JOB_NOT_MODIFIABLE') {
        // The job started between opening the dialog and confirming — the
        // refreshed detail shows why the cancel didn't happen.
        void load(false);
        return;
      }
      // A failed cancel must be visible, not a console.warn. Reuse the alert
      // so the feedback lands where the user's attention already is; the
      // dialog closes beneath it (the alert is the communication now).
      Alert.alert(
        "Couldn't cancel the job",
        flattenApiMessage(apiError.message) || 'Please try again.',
      );
    } finally {
      isCancellingRef.current = false;
      setCancelSubmitting(false);
      // Every settled path closes the dialog: the success morphs into the
      // refreshed detail, the 409 into the reloaded detail, the failure
      // into the alert above.
      setCancelConfirmOpen(false);
    }
  }, [applyJobUpdate, detail, load]);

  const confirmCancel = useCallback(() => setCancelConfirmOpen(true), []);

  // Epic 22 — approve or reject a pending employee job. Success applies the
  // post-decision job everywhere (this screen, the jobs store, Home's
  // counts), drops the row from the Pending queue store, and reloads the
  // detail so the screen shows the new state. A 409 means the owner already
  // decided (another device or a double fire) — the reload reconciles.
  const handleDecision = useCallback(
    async (decision: 'approve' | 'reject', reason?: string) => {
      if (!detail || isDecidingRef.current) return;
      isDecidingRef.current = true;
      setDeciding(true);
      setDecidingKind(decision);
      // Abort any in-flight detail GET first: its response is pre-decision
      // and, worse, `load` refuses to run while that fetch is busy — the
      // post-decision reload (and the 409 reconcile) would silently no-op
      // and the decision bar would linger on stale state (review 2026-11-13).
      latestControllerRef.current?.abort();
      try {
        const updated = await jobService.decidePending(detail.id, decision, reason);
        applyJobUpdate(updated);
        removeApprovalQueueItem(updated.id);
        void load(false);
        setIsRejectOpen(false);
      } catch (caught) {
        const apiError = caught as ApiError;
        if (apiError.code === 'JOB_NOT_PENDING') {
          // Already decided elsewhere — reconcile: the stale row leaves the
          // queue too (it may still be on screen), and the reload shows the
          // decision. No alert: nothing the owner did here failed.
          removeApprovalQueueItem(detail.id);
          void load(false);
          setIsRejectOpen(false);
          return;
        }
        Alert.alert(
          "Couldn't save the decision",
          flattenApiMessage(apiError.message) || 'Please try again.',
        );
      } finally {
        isDecidingRef.current = false;
        setDeciding(false);
        setDecidingKind(null);
      }
    },
    [applyJobUpdate, detail, load],
  );

  const openRejectSheet = useCallback(() => setIsRejectOpen(true), []);

  if (!jobId) return null;

  const notFound = Boolean(error && (error.status === 404 || error.status === 403));
  const failedWithNoDetail = Boolean(error && !detail && !notFound);
  const urgent = detail?.priority === 'urgent';
  const statusBadge = detail ? statusToBadge(detail.status) : null;
  // Latest captured GPS fix from the activity log — null until the
  // technician has completed a location-required step; gates the Direction
  // button on the technician card.
  const lastKnownLocation = detail
    ? lastKnownTechnicianLocation(detail.activityLog)
    : null;
  // The customer's Direction button is on when there is anything to open:
  // saved coordinates win (precise pin), else the address/city text query —
  // the same "nothing to search → nothing to open" rule `openMaps` applies.
  const customerDirection = detail
    ? Boolean(
        (detail.customer.latitude != null && detail.customer.longitude != null) ||
          detail.customer.address?.trim() ||
          detail.customer.city?.trim(),
      )
    : false;

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
        <View style={styles.titleStack}>
          <Text style={styles.title} numberOfLines={1}>
            {/* The customer's name leads; the placeholder covers loading /
                error views (deep-link safe). */}
            {detail?.customer.name || 'Job details'}
          </Text>
          {detail?.jobNumber ? (
            // The job's human reference as a persistent secondary line —
            // citable on every job, not a name-absence fallback
            // (SPEC-human-readable-ids, CAP-1).
            <Text style={styles.jobNumber} numberOfLines={1}>
              {detail.jobNumber}
            </Text>
          ) : null}
        </View>
      </View>

      {notFound ? (
        <View style={styles.centered}>
          <EmptyState
            icon={<FileQuestion size={36} color={colors.primary} strokeWidth={1.5} />}
            title="This job isn't available"
            description="It may have been removed or reassigned."
          />
          <Button variant="secondary" size="md" onPress={goBackSafely}>
            Go back
          </Button>
        </View>
      ) : failedWithNoDetail ? (
        <View style={styles.centered}>
          <InlineError message={error?.message ?? 'Something went wrong'} />
          <Button variant="secondary" size="md" onPress={() => void load()}>
            Retry
          </Button>
        </View>
      ) : !detail ? (
        <View style={styles.centered}>
          <ActivityIndicator size="large" color={colors.primary} />
        </View>
      ) : (
        <View style={styles.detailBody}>
          <ScrollView
            style={styles.scrollFlex}
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
          {/* 1. Header card: badges → service line → meta rows → progress →
              description / notes behind dividers. */}
          <JobHeaderCard detail={detail} urgent={urgent} statusBadge={statusBadge} />

          {/* Epic 22 (CAP-5) — the owner sees the rejection reason they (or
              another admin) gave: the badge alone says "Rejected"; the
              reason is what the review promise made visible. A rejected job
              with NO reason still reads the badge honestly. */}
          {detail.status === 'rejected' && detail.rejectionReason ? (
            <View style={styles.rejectionNote}>
              <Badge status="rejected" dot size="sm">
                Owner's reason
              </Badge>
              <Text style={styles.rejectionText}>{detail.rejectionReason}</Text>
            </View>
          ) : null}

          {/* 1.5. Workflow status — show progress through workflow steps when
              the job has a template. Epic 22 — a pending/rejected job never
              entered the workflow (the owner hasn't approved it), so the
              chain stays hidden until it actually starts. */}
          {detail.workflowTemplate?.steps &&
          detail.status !== 'pending_approval' &&
          detail.status !== 'rejected' ? (
            <WorkflowStatusCard
              steps={detail.workflowTemplate.steps}
              currentStepIndex={detail.currentStepIndex ?? null}
              jobStatus={detail.status}
            />
          ) : null}

          {/* 2. Actions slot — edit + cancel for scheduled and pending jobs
              (CAP-5: a pending employee job takes owner edits). Approve /
              Reject live in the sticky decision bar below the scroll. */}
          {canWrite ? (
            <JobActionsSection
              jobStatus={detail.status}
              onEdit={() => setIsEditOpen(true)}
              onCancel={confirmCancel}
            />
          ) : null}

          {/* 3. Customer */}
          <SectionCard title="Customer">
            <PersonRow
              name={detail.customer.name}
              countryCode={detail.customer.countryCode}
              phoneNumber={detail.customer.phoneNumber}
              subLine={formatPhone(detail.customer)}
              action={
                <>
                  <IconButton
                    variant="ghost"
                    size="sm"
                    label="Copy customer phone number"
                    onPress={() =>
                      copyPhone(
                        'customer',
                        detail.customer.countryCode,
                        detail.customer.phoneNumber,
                      )
                    }>
                    <Copy size={15} color={colors.textMuted} strokeWidth={2} />
                  </IconButton>
                  {copiedPhone === 'customer' ? (
                    <Text
                      style={styles.copiedNote}
                      accessibilityLiveRegion="polite">
                      Copied
                    </Text>
                  ) : null}
                </>
              }
            />
            {detail.customer.addressDetails ? (
              <Text style={styles.customerDetails} numberOfLines={2}>
                {detail.customer.addressDetails}
              </Text>
            ) : null}
            {/* Address + city now live only in the header card's bordered
                box — no duplicate here. The details line above is different:
                it's the user-entered flat/building/floor detail (CAP-5),
                which the geocoded service location never carries. */}
            <View style={styles.buttonRow}>
              <Button
                variant="secondary"
                size="md"
                style={{ flex: 1, gap: spacing.s1 }}
                onPress={() =>
                  void openTel(detail.customer.countryCode, detail.customer.phoneNumber)
                }>
                Call
              </Button>
              <Button
                variant="primary"
                size="md"
                style={{ flex: 1, gap: spacing.s1 }}
                disabled={!customerDirection}
                onPress={() =>
                  void openMaps(
                    detail.customer.address ?? '',
                    detail.customer.city,
                    {
                      latitude: detail.customer.latitude,
                      longitude: detail.customer.longitude,
                    },
                  )
                }>
                Directions
              </Button>
            </View>
            {!customerDirection ? (
              <View style={styles.disabledHintRow}>
                <Info size={13} color={colors.textMuted} strokeWidth={2} />
                <Text style={styles.disabledHint}>
                  No address or location is saved for this customer yet.
                </Text>
              </View>
            ) : null}
          </SectionCard>

          {/* 4. Technician */}
          <SectionCard title="Employee">
            <PersonRow
              name={detail.technician.name}
              countryCode={detail.technician.countryCode}
              phoneNumber={detail.technician.phoneNumber}
              subLine={formatPhone(detail.technician)}
              avatarUrl={detail.technician.avatarUrl ?? null}
              action={
                <>
                  <IconButton
                    variant="ghost"
                    size="sm"
                    label="Copy employee phone number"
                    onPress={() =>
                      copyPhone(
                        'technician',
                        detail.technician.countryCode,
                        detail.technician.phoneNumber,
                      )
                    }>
                    <Copy size={15} color={colors.textMuted} strokeWidth={2} />
                  </IconButton>
                  {copiedPhone === 'technician' ? (
                    <Text
                      style={styles.copiedNote}
                      accessibilityLiveRegion="polite">
                      Copied
                    </Text>
                  ) : null}
                </>
              }
            />
            {/* Optional-chained, not bare `.length`: the detail endpoint and
                the merge both guarantee the array today, but this line is
                where the one embed-shape surprise already crashed in
                production (Crashlytics 2026-11) — a missing chips row beats
                a crash if any future path leaves `skills` undefined. */}
            {detail.technician.skills?.length ? (
                <View style={styles.skillsRow}>
                  <Text style={styles.skillsLabel}>Skills</Text>
                  <View style={styles.skillsChips}>
                    {(detail.technician.skills ?? []).map((skill) => (
                        <Badge key={skill} status="scheduled" tone="soft" size="sm">
                          {skill}
                        </Badge>
                    ))}
                  </View>
                </View>
            ) : null}
            <View style={styles.buttonRow}>
              <Button
                variant="secondary"
                size="md"
                style={{ flex: 1, gap: spacing.s1 }}
                onPress={() =>
                  void openTel(detail.technician.countryCode, detail.technician.phoneNumber)
                }>
                Call
              </Button>
              <Button
                variant="primary"
                size="md"
                style={{ flex: 1, gap: spacing.s1 }}
                disabled={!lastKnownLocation}
                onPress={() =>
                  void openMaps('', null, lastKnownLocation)
                }>
                Directions
              </Button>
            </View>
            {!lastKnownLocation ? (
              <View style={styles.disabledHintRow}>
                <Info size={13} color={colors.textMuted} strokeWidth={2} style={{marginTop: spacing.s1}}/>
                <Text style={styles.disabledHint}>
                  Directions appear once the employee's location is
                  captured on a step.
                </Text>
              </View>
            ) : (
              // Enabled-state hint: make clear this is the position captured
              // at step time, not live tracking (story 7.10 — display only).
              <View style={styles.disabledHintRow}>
                <Info size={13} color={colors.textMuted} strokeWidth={2} style={{marginTop: spacing.s1}}/>
                <Text style={styles.disabledHint}>
                  Directions will take you to the employee's last known
                  location, not live tracking.
                </Text>
              </View>
            )}

          </SectionCard>

          {/* 5. Photos & signature — only when the job has attachments. */}
          {detail.attachments.length ? (
            <SectionCard title="Photos & signature">
              <AttachmentGrid attachments={detail.attachments} jobId={detail.id} />
            </SectionCard>
          ) : null}

          {/* 6. Activity — oldest-first timeline; nothing logged yet → no card. */}
          {detail.activityLog.length ? (
            <SectionCard title="Activity Timeline">
              <ActivityTimeline
                entries={detail.activityLog}
                workflowTemplate={detail.workflowTemplate}
                jobSite={jobSiteCoords(detail.customer)}
              />
            </SectionCard>
          ) : null}
        </ScrollView>

        {/* Epic 22 — the pending job's decision bar: sticky, loud (the amber
            family the Pending badge wears, lifted off the page by the sheet
            shadow), and bottom safe-area inset so the buttons clear the
            gesture bar. */}
        {detail.status === 'pending_approval' && canWrite ? (
          <SafeAreaView edges={['bottom']} style={styles.decisionFooter}>
            <Text style={styles.decisionNote}>
              {detail.technician?.name?.trim()
                ? `${detail.technician.name.trim()} created this job.`
                : 'An employee created this job.'}{' '}
              Approve it to schedule it like any other job.
            </Text>
            <View style={styles.actionsRow}>
              <Button
                variant="secondary"
                size="lg"
                style={styles.decisionButton}
                disabled={deciding}
                loading={decidingKind === 'reject'}
                onPress={openRejectSheet}>
                Reject
              </Button>
              <Button
                variant="primary"
                size="lg"
                style={styles.decisionButton}
                disabled={deciding}
                loading={decidingKind === 'approve'}
                onPress={() => void handleDecision('approve')}>
                Approve
              </Button>
            </View>
          </SafeAreaView>
        ) : null}

        {/* Gated on `detail`, never on `isEditOpen`: TrueSheet's unmount does
            NOT dismiss a presented sheet, so unmounting on close would strand
            the native sheet on screen, frozen (seen live 2026-09-15 — the
            sheet stayed on "Saving…" after a successful save). Kept mounted
            while the detail exists, `visible` alone drives present/dismiss. */}
        {detail && canWrite ? (
          <>
            <EditJobSheet
              visible={isEditOpen}
              job={detail}
              technicians={profile?.technicians ?? []}
              onClose={handleEditClosed}
              onSaved={handleEditSaved}
            />

            {/* Epic 22 — the reject path's reason sheet. The subtitle names
                the employee who created the job (their id is the pending
                job's technician — CAP-2 creator-assigned). */}
            <RejectJobSheet
              visible={isRejectOpen}
              jobNumber={detail.jobNumber}
              employeeName={detail.technician?.name ?? null}
              submitting={deciding}
              onClose={() => setIsRejectOpen(false)}
              onConfirm={reason => void handleDecision('reject', reason || undefined)}
            />
          </>
        ) : null}

        <ConfirmDialog
          visible={cancelConfirmOpen && detail != null}
          title="Cancel job"
          message="The employee will no longer see this job."
          confirmLabel="Cancel job"
          confirmVariant="danger"
          icon={<XCircle size={20} color={colors.danger} strokeWidth={2} />}
          cancelLabel="Keep job"
          submitting={cancelSubmitting}
          onConfirm={() => void handleCancelJob()}
          onCancel={() => setCancelConfirmOpen(false)}
        />
      </View>
    )}
    </SafeAreaView>
  );
}

const styles = StyleSheet.create({
  root: {
    flex: 1,
    backgroundColor: colors.surfacePage,
  },
  // Epic 22 — the scroll and the sticky decision bar share one flex column,
  // so the bar is pinned below the scroll instead of scrolling with it.
  detailBody: {
    flex: 1,
  },
  scrollFlex: {
    flex: 1,
  },
  decisionFooter: {
    // Loud by meaning, not by volume: the amber family the "Pending
    // approval" badge wears, lifted off the page by the sheet's upward
    // shadow. The bottom inset comes from the SafeAreaView wrapper.
    backgroundColor: colors.status.pendingApproval.bg,
    borderTopWidth: 1,
    borderTopColor: colors.status.pendingApproval.border,
    paddingHorizontal: spacing.s4,
    paddingTop: spacing.s3,
    ...shadow.sheet,
    gap: spacing.s3,
  },
  decisionNote: {
    ...typography.caption,
    color: colors.status.pendingApproval.fg,
  },
  actionsRow: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: spacing.s3,
  },
  decisionButton: {
    flex: 1,
  },
  rejectionNote: {
    gap: spacing.s1,
    padding: spacing.s3,
    borderRadius: radius.md,
    backgroundColor: colors.status.rejected.bg,
    borderWidth: 1,
    borderColor: colors.status.rejected.border,
  },
  rejectionText: {
    ...typography.bodySm,
    color: colors.status.rejected.fg,
  },
  // Back header pattern (spec §0): icon button + title@20, hairline under.
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
  titleStack: {
    flex: 1,
    gap: 1,
  },
  jobNumber: {
    ...typography.caption,
    color: colors.textMuted,
  },
  centered: {
    flex: 1,
    alignItems: 'center',
    justifyContent: 'center',
    gap: spacing.s3,
    padding: spacing.s4,
  },
  content: {
    padding: spacing.s4,
    gap: spacing.s4,
  },
  // Extra air between a PersonRow and the meta rows below it in a section.
  skillsRow: {
    alignItems: 'flex-start',
    gap: spacing.s1,
    marginTop: spacing.s2,
  },
  // The muted eyebrow above the chips (2026-10 copy review) — the chips
  // alone never said what the badge words were.
  skillsLabel: {
    ...typography.caption,
    color: colors.textMuted,
  },
  // No maxHeight cap here: RN children overflow *visibly* past a capped
  // container (no automatic clipping), so a capped chips box painted its
  // third row straight over the Call/Directions buttons and the hint below.
  // The stray `flex: 1` went too — meaningless in an auto-height column.
  // The wrap already bounds growth — skills are a handful, not a list.
  skillsChips: {
    flexDirection: 'row',
    flexWrap: 'wrap',
    gap: spacing.s2,
  },
  buttonRow: {
    flexDirection: 'row',
    gap: spacing.s2,
    marginTop: spacing.s3,
  },
  copiedNote: {
    ...typography.caption,
    color: colors.textMuted,
  },
  // CAP-5 — the user-entered flat/building/floor detail, one quiet line
  // between the identity row and the actions.
  customerDetails: {
    ...typography.bodySm,
    color: colors.textStrong,
    marginTop: spacing.s2,
  },
  // Why a disabled Direction button is off — muted, same tier as metaText,
  // with a small Info glyph leading the line.
  disabledHintRow: {
    flexDirection: 'row',
    alignItems: 'flex-start',
    gap: spacing.s1,
    marginTop: spacing.s2,
  },
  disabledHint: {
    ...typography.caption,
    color: colors.textMuted,
    flex: 1,
  },
});
